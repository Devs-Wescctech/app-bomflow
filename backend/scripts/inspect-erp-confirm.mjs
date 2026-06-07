// Inspeção READ-ONLY: confirmar que usuários que criam orçamentos têm usuarios_sistemas.
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
  // 1. Distribuição de sistema_id em usuarios_sistemas (quais sistemas existem)
  await q('sistema_id distintos em usuarios_sistemas', `
    SELECT sistema_id, count(*) AS qtd FROM usuarios_sistemas
    GROUP BY sistema_id ORDER BY qtd DESC LIMIT 30
  `);

  // 2. Quantos usuarios_sistemas tem um usuário "normal" típico (top 5 com mais sistemas)
  await q('top usuários por nº de sistemas', `
    SELECT u.login, count(*) AS sistemas
    FROM usuarios_sistemas us JOIN usuarios u ON u.id = us.usuario_id
    WHERE u.ativo = 'S'
    GROUP BY u.login ORDER BY sistemas DESC LIMIT 5
  `);

  // 3. Exemplo de linha de usuarios_sistemas (ver permissões)
  await q('amostra usuarios_sistemas', `
    SELECT * FROM usuarios_sistemas LIMIT 5
  `);

  // 4. Colunas de vw_orcamento_explorer para achar quem cria orçamentos
  await q('colunas vw_orcamento_explorer', `
    SELECT column_name FROM information_schema.columns
    WHERE table_name='vw_orcamento_explorer' ORDER BY ordinal_position LIMIT 60
  `);

  await pool.end();
  console.log('\nFIM.');
})();
