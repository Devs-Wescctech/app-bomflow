// Inspeção READ-ONLY: mapear tabelas base de orçamento/pré-proposta do ERP.
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
  // 1. Tabelas BASE (não views) relacionadas a proposta/orcamento/sgprc
  await q('tabelas base proposta/orcamento/sgprc', `
    SELECT table_name, table_type FROM information_schema.tables
    WHERE table_schema='public'
      AND (lower(table_name) LIKE '%proposta%'
           OR lower(table_name) LIKE '%orcamento%'
           OR lower(table_name) LIKE '%sgprc%'
           OR lower(table_name) LIKE '%pedido%')
    ORDER BY table_type, table_name
  `);

  // 2. Definição da view vw_orcamento_explorer (rastrear tabelas subjacentes)
  await q('def vw_orcamento_explorer', `
    SELECT pg_get_viewdef('vw_orcamento_explorer'::regclass, true) AS def
  `);

  await pool.end();
  console.log('\nFIM.');
})();
