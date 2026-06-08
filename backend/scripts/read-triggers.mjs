// Inspeção READ-ONLY: ler o corpo das funções de trigger de pedidos (avaliar risco).
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

async function rows(sql, params = []) { return (await pool.query(sql, params)).rows; }

(async () => {
  for (const fn of ['tr_pedidos', 'inserir_titulos_apos_status_p']) {
    console.log('\n===================== FUNÇÃO ' + fn + ' =====================');
    try {
      const r = await rows(`SELECT pg_get_functiondef(p.oid) AS src
        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE p.proname=$1 AND n.nspname='public'`, [fn]);
      for (const row of r) console.log(row.src);
    } catch (e) { console.log('ERRO:', e.message); }
  }
  await pool.end();
  console.log('\nFIM.');
})();
