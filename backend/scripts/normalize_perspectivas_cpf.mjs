/**
 * Saneamento: padroniza o formato do CPF dos indicadores/indicados já gravados
 * na tabela `erp_perspectivas_negocios`.
 *
 * Formato canônico escolhido: APENAS DÍGITOS (ex.: "90754549534"), alinhado à
 * comparação por dígitos já usada na lógica de Perspectivas (runPerspectivaBatch /
 * getPerspectivaReportData), que sempre normaliza o CPF antes de agrupar/comparar.
 *
 * Colunas normalizadas: cpf_indicador e cpf_indicado.
 *
 * Características:
 * - Idempotente: rodar novamente não altera nada (linhas já só com dígitos são ignoradas).
 * - Não altera o vínculo/agrupamento dos registros: a chave de agrupamento da lógica
 *   já é o CPF normalizado por dígitos, então retirar a pontuação não muda nenhum grupo.
 * - Valida o relatório/agrupamento e os valores de comissão ANTES e DEPOIS e aborta
 *   (rollback) se algo divergir.
 *
 * Uso:
 *   node backend/scripts/normalize_perspectivas_cpf.mjs           # aplica (com validação)
 *   node backend/scripts/normalize_perspectivas_cpf.mjs --dry-run # só mostra o que faria
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

// Réplica da lógica de agrupamento usada em getPerspectivaReportData /
// runPerspectivaBatch, para validar que nada muda. Trabalha sobre o conjunto de
// linhas "Liquidado" relevantes e produz um resumo estável (independente do formato
// do CPF) que pode ser comparado antes x depois.
function digits(v) {
  return v ? String(v).replace(/\D/g, '') : '';
}

async function buildReportSignature(client) {
  // Mesmo filtro do relatório que a tela exibe (getPerspectivaReportData).
  const { rows } = await client.query(
    `SELECT cpf_indicador, nome_indicador, produto, valor_contrato, valor_titulo, status_pagamento
       FROM erp_perspectivas_negocios
      WHERE sit_titulo = 'Liquidado'
        AND regexp_replace(cpf_indicador, '[^0-9]', '', 'g') NOT IN ('18470931830','32368440860')
        AND (status_pagamento IS NULL OR status_pagamento = 'elegivel')`
  );

  // Agrupa por chave normalizada (CPF dígitos, senão nome, senão 'unknown')
  const groups = {};
  for (const r of rows) {
    const key = digits(r.cpf_indicador) || r.nome_indicador || 'unknown';
    if (!groups[key]) groups[key] = { count: 0 };
    groups[key].count += 1;
  }

  // Assinatura: mapa ordenado key -> count. Os valores de comissão dependem só de
  // count (tier) + produtos especiais por valor; como nenhum desses campos é tocado
  // pelo saneamento, comparar a composição dos grupos (key + count) é suficiente para
  // garantir que os valores permanecem idênticos.
  const signature = Object.keys(groups)
    .sort()
    .map((k) => `${k}:${groups[k].count}`)
    .join('|');

  return { totalRows: rows.length, totalGroups: Object.keys(groups).length, signature };
}

async function main() {
  const client = await pool.connect();
  try {
    console.log(`[normalize-cpf] Modo: ${DRY_RUN ? 'DRY-RUN' : 'APLICAR'}`);

    await client.query('BEGIN');

    // Estado antes
    const before = await buildReportSignature(client);
    console.log(`[normalize-cpf] ANTES  -> linhas relatório: ${before.totalRows}, grupos: ${before.totalGroups}`);

    // Quantas linhas serão alteradas (têm pontuação)
    const pending = await client.query(
      `SELECT
         COUNT(*) FILTER (WHERE cpf_indicador IS NOT NULL AND cpf_indicador <> regexp_replace(cpf_indicador, '[^0-9]', '', 'g')) AS ind,
         COUNT(*) FILTER (WHERE cpf_indicado  IS NOT NULL AND cpf_indicado  <> regexp_replace(cpf_indicado,  '[^0-9]', '', 'g')) AS ido
       FROM erp_perspectivas_negocios`
    );
    console.log(`[normalize-cpf] A normalizar -> cpf_indicador: ${pending.rows[0].ind}, cpf_indicado: ${pending.rows[0].ido}`);

    // Saneamento (apenas dígitos)
    const upd = await client.query(
      `UPDATE erp_perspectivas_negocios
          SET cpf_indicador = NULLIF(regexp_replace(cpf_indicador, '[^0-9]', '', 'g'), ''),
              cpf_indicado  = NULLIF(regexp_replace(cpf_indicado,  '[^0-9]', '', 'g'), '')
        WHERE (cpf_indicador IS NOT NULL AND cpf_indicador <> regexp_replace(cpf_indicador, '[^0-9]', '', 'g'))
           OR (cpf_indicado  IS NOT NULL AND cpf_indicado  <> regexp_replace(cpf_indicado,  '[^0-9]', '', 'g'))`
    );
    console.log(`[normalize-cpf] Linhas atualizadas: ${upd.rowCount}`);

    // Estado depois
    const after = await buildReportSignature(client);
    console.log(`[normalize-cpf] DEPOIS -> linhas relatório: ${after.totalRows}, grupos: ${after.totalGroups}`);

    const ok =
      before.totalRows === after.totalRows &&
      before.totalGroups === after.totalGroups &&
      before.signature === after.signature;

    if (!ok) {
      console.error('[normalize-cpf] VALIDAÇÃO FALHOU: agrupamento/relatório divergiu. Revertendo (ROLLBACK).');
      await client.query('ROLLBACK');
      process.exit(2);
    }

    console.log('[normalize-cpf] Validação OK: agrupamento e composição de comissão idênticos antes x depois.');

    if (DRY_RUN) {
      await client.query('ROLLBACK');
      console.log('[normalize-cpf] DRY-RUN concluído (nenhuma alteração persistida).');
    } else {
      await client.query('COMMIT');
      console.log('[normalize-cpf] COMMIT concluído.');
    }
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('[normalize-cpf] Erro:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
