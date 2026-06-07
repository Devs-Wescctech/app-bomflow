// Inspeção READ-ONLY: localizar acesso.api e checar presença na view SGPRC.
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
  // 1. Colunas da tabela usuarios
  await q('colunas usuarios', `
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name = 'usuarios' ORDER BY ordinal_position
  `);

  // 2. Definição da view v_usuarios_sistemas_sgprc (entender o filtro)
  await q('definição view SGPRC', `
    SELECT pg_get_viewdef('v_usuarios_sistemas_sgprc'::regclass, true) AS def
  `);

  await pool.end();
  console.log('\nFIM.');
})();
