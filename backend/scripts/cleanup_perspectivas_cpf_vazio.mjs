/**
 * Limpeza one-off (Indicações): corrige duplicatas de comissão causadas pelo
 * tratamento inconsistente de `cpf_indicado = ''` (string vazia) vs `NULL` na
 * tabela `erp_perspectivas_negocios`.
 *
 * Contexto:
 * Quando uma indicação era fechada como ganho sem o CPF do indicado conhecido,
 * antigamente gravava-se string vazia (''). A regra de unificação/dedup só
 * reconhecia `cpf_indicado IS NULL`, então o placeholder com '' ficava órfão e,
 * quando o CPF real chegava, uma segunda linha era criada — inflando comissões.
 *
 * O que este script faz (transacional, idempotente):
 *   1) Remove o registro PLACEHOLDER (cpf_indicado vazio/nulo, SEM dados de
 *      pagamento/lote/perspectiva) quando existe um registro "real" para o mesmo
 *      par indicador (cpf_indicador normalizado por dígitos) + nome_indicado com
 *      cpf_indicado preenchido. O registro real (com pagamento/lote/situação) é
 *      preservado.
 *   2) Normaliza os placeholders remanescentes (sem par real): cpf_indicado
 *      vazio ('') passa a NULL.
 *
 * Segurança:
 * - Só deleta placeholders que NÃO carregam dados reais: lote_pagamento_id NULL,
 *   status_pagamento <> 'pago', data_pagamento NULL e perspectiva NULL. Assim
 *   nunca apagamos uma linha que tenha histórico de pagamento/lote ou origem ERP.
 * - Pareamento por (cpf_indicador dígitos) + nome_indicado, ambos não-nulos no
 *   lado real, para não juntar pessoas distintas. O dry-run lista os pares
 *   afetados para conferência antes de aplicar.
 *
 * Uso:
 *   node backend/scripts/cleanup_perspectivas_cpf_vazio.mjs --dry-run  # só mostra
 *   node backend/scripts/cleanup_perspectivas_cpf_vazio.mjs            # aplica
 */
import pg from 'pg';

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

// Condição que identifica um placeholder de CPF vazio/nulo SEM dados reais.
// Usada tanto para listar (dry-run) quanto para deletar/normalizar.
const PLACEHOLDER_EMPTY = `(ph.cpf_indicado IS NULL OR regexp_replace(ph.cpf_indicado, '[^0-9]', '', 'g') = '')`;
const PLACEHOLDER_SAFE = `
  ph.lote_pagamento_id IS NULL
  AND ph.status_pagamento IS DISTINCT FROM 'pago'
  AND ph.data_pagamento IS NULL
  AND ph.perspectiva IS NULL`;

// EXISTS de um registro "real" (cpf_indicado preenchido) para o mesmo par
// indicador (dígitos) + nome_indicado.
const HAS_REAL_PAIR = `
  EXISTS (
    SELECT 1 FROM erp_perspectivas_negocios r
    WHERE r.id <> ph.id
      AND r.cpf_indicado IS NOT NULL
      AND regexp_replace(r.cpf_indicado, '[^0-9]', '', 'g') <> ''
      AND ph.nome_indicado IS NOT NULL
      AND r.nome_indicado IS NOT DISTINCT FROM ph.nome_indicado
      AND regexp_replace(COALESCE(r.cpf_indicador, ''), '[^0-9]', '', 'g')
          IS NOT DISTINCT FROM regexp_replace(COALESCE(ph.cpf_indicador, ''), '[^0-9]', '', 'g')
  )`;

async function main() {
  const client = await pool.connect();
  try {
    console.log(`[cleanup-cpf-vazio] Modo: ${DRY_RUN ? 'DRY-RUN' : 'APLICAR'}`);

    await client.query('BEGIN');

    const totalAntes = (await client.query('SELECT COUNT(*)::int AS c FROM erp_perspectivas_negocios')).rows[0].c;
    console.log(`[cleanup-cpf-vazio] Total de registros antes: ${totalAntes}`);

    // Amostra dos pares placeholder <-> real que serão removidos (conferência).
    const sample = await client.query(`
      SELECT ph.id AS placeholder_id,
             ph.cpf_indicador,
             ph.nome_indicado,
             ph.cpf_indicado AS placeholder_cpf_indicado,
             (SELECT r.id FROM erp_perspectivas_negocios r
                WHERE r.id <> ph.id
                  AND r.cpf_indicado IS NOT NULL
                  AND regexp_replace(r.cpf_indicado, '[^0-9]', '', 'g') <> ''
                  AND r.nome_indicado IS NOT DISTINCT FROM ph.nome_indicado
                  AND regexp_replace(COALESCE(r.cpf_indicador, ''), '[^0-9]', '', 'g')
                      IS NOT DISTINCT FROM regexp_replace(COALESCE(ph.cpf_indicador, ''), '[^0-9]', '', 'g')
                ORDER BY (r.lote_pagamento_id IS NOT NULL) DESC,
                         (r.status_pagamento = 'pago') DESC,
                         r.id ASC
                LIMIT 1) AS registro_real_id
        FROM erp_perspectivas_negocios ph
       WHERE ${PLACEHOLDER_EMPTY}
         AND ${PLACEHOLDER_SAFE}
         AND ${HAS_REAL_PAIR}
       ORDER BY ph.nome_indicado
       LIMIT 50
    `);
    console.log(`[cleanup-cpf-vazio] Pares placeholder->real (amostra, até 50):`);
    for (const r of sample.rows) {
      console.log(`  - placeholder id=${r.placeholder_id} (cpf_indicado=${JSON.stringify(r.placeholder_cpf_indicado)}) ` +
        `| indicador=${r.cpf_indicador} | indicado="${r.nome_indicado}" -> manter real id=${r.registro_real_id}`);
    }

    // (1) Remove os placeholders que possuem par "real".
    const del = await client.query(`
      DELETE FROM erp_perspectivas_negocios ph
       WHERE ${PLACEHOLDER_EMPTY}
         AND ${PLACEHOLDER_SAFE}
         AND ${HAS_REAL_PAIR}
    `);
    console.log(`[cleanup-cpf-vazio] Placeholders removidos (tinham par real): ${del.rowCount}`);

    // (2) Normaliza placeholders remanescentes: '' -> NULL.
    const upd = await client.query(`
      UPDATE erp_perspectivas_negocios
         SET cpf_indicado = NULL
       WHERE cpf_indicado IS NOT NULL
         AND regexp_replace(cpf_indicado, '[^0-9]', '', 'g') = ''
    `);
    console.log(`[cleanup-cpf-vazio] cpf_indicado '' normalizados para NULL: ${upd.rowCount}`);

    const totalDepois = (await client.query('SELECT COUNT(*)::int AS c FROM erp_perspectivas_negocios')).rows[0].c;
    console.log(`[cleanup-cpf-vazio] Total de registros depois: ${totalDepois} (delta: ${totalDepois - totalAntes})`);

    // Verificação final: não devem restar pares placeholder<->real nem '' na coluna.
    const restantesPares = (await client.query(`
      SELECT COUNT(*)::int AS c FROM erp_perspectivas_negocios ph
       WHERE ${PLACEHOLDER_EMPTY} AND ${PLACEHOLDER_SAFE} AND ${HAS_REAL_PAIR}
    `)).rows[0].c;
    const restantesVazios = (await client.query(`
      SELECT COUNT(*)::int AS c FROM erp_perspectivas_negocios
       WHERE cpf_indicado IS NOT NULL AND regexp_replace(cpf_indicado, '[^0-9]', '', 'g') = ''
    `)).rows[0].c;
    console.log(`[cleanup-cpf-vazio] Verificação -> pares placeholder/real restantes: ${restantesPares}, cpf_indicado '' restantes: ${restantesVazios}`);

    if (restantesPares !== 0 || restantesVazios !== 0) {
      console.error('[cleanup-cpf-vazio] VERIFICAÇÃO FALHOU: ainda restam pendências. Revertendo (ROLLBACK).');
      await client.query('ROLLBACK');
      process.exit(2);
    }

    if (DRY_RUN) {
      await client.query('ROLLBACK');
      console.log('[cleanup-cpf-vazio] DRY-RUN concluído (nenhuma alteração persistida).');
    } else {
      await client.query('COMMIT');
      console.log('[cleanup-cpf-vazio] COMMIT concluído.');
    }
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('[cleanup-cpf-vazio] Erro:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
