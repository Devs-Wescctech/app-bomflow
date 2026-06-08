// READ-ONLY: localizar tabela de funções e de tokens de API.
import pkg from 'pg';
const { Pool } = pkg;
const pool = new Pool({
  host: process.env.ERP_DB_HOST, port: parseInt(process.env.ERP_DB_PORT) || 5432,
  database: process.env.ERP_DB_NAME, user: process.env.ERP_DB_USER, password: process.env.ERP_DB_PASSWORD,
  ssl: false, connectionTimeoutMillis: 10000, max: 2,
});
async function rows(sql, p = []) { return (await pool.query(sql, p)).rows; }
function show(l, d) { console.log('\n===== ' + l + ' =====\n' + JSON.stringify(d, null, 2)); }

(async () => {
  // 1. Tabelas com token/funcao/api
  show('tabelas token/funcao/api', (await rows(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND (lower(table_name) LIKE '%token%'
      OR lower(table_name) LIKE 'funcoe%' OR lower(table_name) LIKE 'funco%'
      OR lower(table_name) LIKE '%api%') ORDER BY table_name`)).map(t => t.table_name));

  // 2. FK de funcoes_usuarios.funcao_id -> qual tabela?
  show('FK funcoes_usuarios', await rows(`
    SELECT kcu.column_name, ccu.table_name AS ref_table, ccu.column_name AS ref_col
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name=tc.constraint_name
    WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_name='funcoes_usuarios'`));

  // 3. Formato da sessao do acesso.api (amostra do comprimento, sem valor sensível)
  const s = await rows(`SELECT length(sessao) AS len, ativo, login, logout FROM sessoes_usuarios WHERE usuario_id=55367753 ORDER BY login DESC LIMIT 3`);
  show('amostra sessões acesso.api (len/ativo/datas)', s);

  // 4. O token bate com sessoes ativas em qualquer usuario? (comprimento da env)
  console.log('\ncomprimento ERP_AUTH_TOKEN:', (process.env.ERP_AUTH_TOKEN||'').length);

  await pool.end();
  console.log('\nFIM.');
})();
