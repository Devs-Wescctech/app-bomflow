// Inspeção READ-ONLY do banco do ERP para entender o objeto SGPRC_USUARIO
// e o agente_venda_id usado no orçamento. NÃO escreve nada.

import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  host: process.env.ERP_DB_HOST,
  port: parseInt(process.env.ERP_DB_PORT) || 5432,
  database: process.env.ERP_DB_NAME,
  user: process.env.ERP_DB_USER,
  password: process.env.ERP_DB_PASSWORD,
  ssl: false,
  connectionTimeoutMillis: 10000,
  max: 2,
});

async function q(label, sql, params = []) {
  console.log('\n===== ' + label + ' =====');
  try {
    const r = await pool.query(sql, params);
    console.log('linhas:', r.rowCount);
    console.log(JSON.stringify(r.rows, null, 2));
  } catch (err) {
    console.log('ERRO:', err.message);
  }
}

(async () => {
  // 1. O agente_venda_id 302508396 existe em pessoas_contratos? Está ativo?
  await q('pessoas_contratos id=302508396', `
    SELECT id, pessoa_id, contrato_id, ativo, titular, grupo_id, data_inicio
    FROM pessoas_contratos WHERE id = 302508396
  `);

  // 2. Tabelas que tenham "sgprc" e "usuario" no nome
  await q('tabelas com sgprc no nome', `
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND lower(table_name) LIKE '%sgprc%'
    ORDER BY table_name LIMIT 50
  `);

  // 3. Tabelas que tenham "orcamento" no nome
  await q('tabelas com orcamento no nome', `
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND lower(table_name) LIKE '%orcamento%'
    ORDER BY table_name LIMIT 50
  `);

  // 4. Tabelas com "usuario" no nome (candidatas a SGPRC_USUARIO)
  await q('tabelas com usuario no nome', `
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND lower(table_name) LIKE '%usuario%'
    ORDER BY table_name LIMIT 50
  `);

  await pool.end();
  console.log('\nFIM.');
})();
