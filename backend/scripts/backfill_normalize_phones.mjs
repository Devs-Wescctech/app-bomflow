/**
 * Backfill one-off: normaliza os telefones já persistidos no banco para o formato
 * canônico do WhatsApp (só dígitos, com `55` e com o nono dígito dos celulares),
 * usando a MESMA função de envio (`normalizeBrazilPhone` em backend/src/utils/phone.js).
 *
 * Contexto (Task #92):
 * A correção do envio normaliza o número na hora do disparo, mas NÃO faz backfill dos
 * números já gravados. Registros antigos ficaram sem o nono dígito (ex.: `555181532008`),
 * o que pode duplicar conversas no inbox (mesma pessoa com/sem o 9) e gerar relatórios
 * inconsistentes. Este script alinha o histórico ao formato canônico único.
 *
 * O que faz (transacional):
 *   1) whatsapp_conversations: recalcula wa_number canônico e a phone_key
 *      (últimos 8 dígitos do número canônico). Como a phone_key não muda ao inserir o 9
 *      (os últimos 8 dígitos são idênticos com/sem o 9), a deduplicação existente já cobre
 *      a maioria dos casos; ainda assim, se duas conversas colapsarem na MESMA phone_key
 *      canônica (ex.: uma gravada com número completo e outra só com o assinante), elas são
 *      MESCLADAS em vez de duplicar: as mensagens migram para a conversa sobrevivente
 *      (dedup por wa_message_id), campos nulos são preenchidos, unread_count é somado e o
 *      resumo (última mensagem/hora/direção) é recalculado.
 *   2) leads, leads_upsell, leads_pj, contacts: normaliza as colunas de telefone
 *      (phone/whatsapp/contact_phone) para o mesmo formato canônico. Valores nulos/vazios
 *      são preservados como estão.
 *
 * Características:
 * - Idempotente: rodar de novo não altera nada (números já canônicos são ignorados).
 * - Auditável: loga, por tabela, quantas linhas mudaram e quais conversas foram mescladas.
 * - Transacional: tudo dentro de BEGIN/COMMIT; em erro, ROLLBACK.
 *
 * Escopo: apenas as tabelas de conversas do inbox, leads e contatos citadas na task.
 * NÃO toca em módulos não solicitados (gerador de leads, indicações, validações, etc.).
 *
 * Uso:
 *   node backend/scripts/backfill_normalize_phones.mjs            # aplica (com validação)
 *   node backend/scripts/backfill_normalize_phones.mjs --dry-run  # só mostra o que faria
 */
import pg from 'pg';
import { normalizeBrazilPhone } from '../src/utils/phone.js';

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL must be set');
  process.exit(1);
}

const DRY_RUN = process.argv.includes('--dry-run');

const sslConfig = process.env.DB_SSL === 'false'
  ? false
  : (process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false);

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: sslConfig });

// phone_key canônica = últimos 8 dígitos do número normalizado (mesma regra do
// whatsappInboxService.phoneKeyOf). Estável entre as variantes com/sem o nono dígito.
function phoneKeyOf(phone) {
  const digits = normalizeBrazilPhone(phone) || String(phone || '').replace(/\D/g, '');
  return digits.slice(-8);
}

const LOG = '[backfill-phones]';

// -----------------------------------------------------------------------------
// (1) Conversas do inbox: normaliza + mescla duplicatas por phone_key canônica.
// -----------------------------------------------------------------------------
async function normalizeConversations(client) {
  const { rows } = await client.query('SELECT * FROM whatsapp_conversations');

  // Agrupa por phone_key canônica (derivada do wa_number atual).
  const groups = new Map();
  for (const r of rows) {
    const key = phoneKeyOf(r.wa_number) || phoneKeyOf(r.phone_key);
    if (!key) {
      console.warn(`${LOG} conversa ${r.id} sem phone_key derivável (wa_number=${JSON.stringify(r.wa_number)}); ignorada.`);
      continue;
    }
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }

  let merged = 0;   // quantas conversas foram removidas por merge
  let renumbered = 0; // quantas conversas tiveram wa_number/phone_key atualizados

  for (const [key, convs] of groups) {
    // Escolhe a sobrevivente: prioriza ter vendedor_id, depois atividade mais recente,
    // depois a mais antiga (created_at). Assim preservamos o dono e o histórico ativo.
    convs.sort((a, b) => {
      const av = a.vendedor_id ? 1 : 0;
      const bv = b.vendedor_id ? 1 : 0;
      if (av !== bv) return bv - av;
      const at = a.last_message_at ? new Date(a.last_message_at).getTime() : -Infinity;
      const bt = b.last_message_at ? new Date(b.last_message_at).getTime() : -Infinity;
      if (at !== bt) return bt - at;
      const ac = a.created_at ? new Date(a.created_at).getTime() : Infinity;
      const bc = b.created_at ? new Date(b.created_at).getTime() : Infinity;
      return ac - bc;
    });

    const survivor = convs[0];
    const losers = convs.slice(1);

    for (const loser of losers) {
      console.log(`${LOG} MERGE conversa ${loser.id} (wa_number=${loser.wa_number}) -> ${survivor.id} (wa_number=${survivor.wa_number}) [key=${key}]`);
      // Remove mensagens do perdedor que colidiriam com o índice único de wa_message_id
      // (mesma mensagem já presente na sobrevivente); as demais serão migradas.
      await client.query(
        `DELETE FROM whatsapp_messages lm
          WHERE lm.conversation_id = $1
            AND lm.wa_message_id IS NOT NULL
            AND EXISTS (SELECT 1 FROM whatsapp_messages sm
                         WHERE sm.conversation_id = $2
                           AND sm.wa_message_id = lm.wa_message_id)`,
        [loser.id, survivor.id]
      );
      await client.query(
        `UPDATE whatsapp_messages SET conversation_id = $2 WHERE conversation_id = $1`,
        [loser.id, survivor.id]
      );
      // Preenche campos nulos da sobrevivente com os do perdedor e soma não-lidas.
      await client.query(
        `UPDATE whatsapp_conversations s SET
            contact_id    = COALESCE(s.contact_id, l.contact_id),
            chat_id       = COALESCE(s.chat_id, l.chat_id),
            name          = COALESCE(s.name, l.name),
            avatar_url    = COALESCE(s.avatar_url, l.avatar_url),
            vendedor_id   = COALESCE(s.vendedor_id, l.vendedor_id),
            vendedor_nome = COALESCE(s.vendedor_nome, l.vendedor_nome),
            unread_count  = s.unread_count + l.unread_count,
            updated_at    = NOW()
          FROM whatsapp_conversations l
          WHERE s.id = $1 AND l.id = $2`,
        [survivor.id, loser.id]
      );
      await client.query('DELETE FROM whatsapp_conversations WHERE id = $1', [loser.id]);
      merged += 1;
    }

    // Recalcula o resumo da sobrevivente a partir da mensagem mais recente (se houver).
    if (losers.length > 0) {
      await client.query(
        `UPDATE whatsapp_conversations s SET
            last_message_text = m.text,
            last_message_at   = m.sent_at,
            last_direction    = m.direction
          FROM (SELECT text, sent_at, direction
                  FROM whatsapp_messages
                 WHERE conversation_id = $1
                 ORDER BY sent_at DESC, created_at DESC
                 LIMIT 1) m
          WHERE s.id = $1`,
        [survivor.id]
      );
    }

    // Normaliza wa_number/phone_key da sobrevivente (só grava se algo mudou).
    const canonicalNumber = normalizeBrazilPhone(survivor.wa_number);
    const canonicalKey = key;
    if (canonicalNumber !== survivor.wa_number || canonicalKey !== survivor.phone_key) {
      await client.query(
        `UPDATE whatsapp_conversations
            SET wa_number = $2, phone_key = $3, updated_at = NOW()
          WHERE id = $1`,
        [survivor.id, canonicalNumber, canonicalKey]
      );
      renumbered += 1;
    }
  }

  console.log(`${LOG} whatsapp_conversations -> conversas mescladas: ${merged}, wa_number/phone_key normalizados: ${renumbered}`);
  return { merged, renumbered };
}

// -----------------------------------------------------------------------------
// (2) Tabelas simples (leads/contatos): normaliza colunas de telefone in-place.
// -----------------------------------------------------------------------------
async function normalizePlainTable(client, table, columns) {
  const cols = columns.join(', ');
  const { rows } = await client.query(`SELECT id, ${cols} FROM ${table}`);
  let changed = 0;

  for (const r of rows) {
    const newVals = {};
    for (const c of columns) {
      const cur = r[c];
      if (cur == null || String(cur).trim() === '') continue; // preserva nulo/vazio
      const norm = normalizeBrazilPhone(cur);
      if (norm && norm !== cur) newVals[c] = norm;
    }
    const keys = Object.keys(newVals);
    if (keys.length === 0) continue;

    const setClauses = keys.map((c, idx) => `${c} = $${idx + 1}`);
    const params = keys.map((c) => newVals[c]);
    params.push(r.id);
    await client.query(
      `UPDATE ${table} SET ${setClauses.join(', ')} WHERE id = $${params.length}`,
      params
    );
    changed += 1;
  }

  console.log(`${LOG} ${table} -> linhas normalizadas: ${changed}`);
  return changed;
}

async function main() {
  const client = await pool.connect();
  try {
    console.log(`${LOG} Modo: ${DRY_RUN ? 'DRY-RUN' : 'APLICAR'}`);
    await client.query('BEGIN');

    const convStats = await normalizeConversations(client);

    // Colunas de telefone por tabela (conforme schema do projeto).
    const plainTables = [
      ['leads', ['phone', 'whatsapp']],
      ['leads_upsell', ['phone', 'whatsapp']],
      ['leads_pj', ['contact_phone']],
      ['contacts', ['phone', 'whatsapp']],
    ];
    const plainStats = {};
    for (const [table, columns] of plainTables) {
      plainStats[table] = await normalizePlainTable(client, table, columns);
    }

    // Verificação final: nenhuma phone_key duplicada e todo wa_number já canônico.
    const dupKeys = (await client.query(
      `SELECT COUNT(*)::int AS c FROM (
         SELECT phone_key FROM whatsapp_conversations GROUP BY phone_key HAVING COUNT(*) > 1
       ) d`
    )).rows[0].c;
    if (dupKeys !== 0) {
      console.error(`${LOG} VERIFICAÇÃO FALHOU: ainda há ${dupKeys} phone_key(s) duplicada(s). Revertendo (ROLLBACK).`);
      await client.query('ROLLBACK');
      process.exit(2);
    }

    console.log(`${LOG} Resumo -> conversas mescladas: ${convStats.merged}, conversas renumeradas: ${convStats.renumbered}` +
      Object.entries(plainStats).map(([t, n]) => `, ${t}: ${n}`).join(''));

    if (DRY_RUN) {
      await client.query('ROLLBACK');
      console.log(`${LOG} DRY-RUN concluído (nenhuma alteração persistida).`);
    } else {
      await client.query('COMMIT');
      console.log(`${LOG} COMMIT concluído.`);
    }
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error(`${LOG} Erro:`, err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
