// READ-ONLY: mecanismo de sessão do ERP + identificar a função SGPRC/orçamento.
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
  // 1. Colunas de sessoes_usuarios
  show('colunas sessoes_usuarios', (await rows(`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name='sessoes_usuarios' ORDER BY ordinal_position`)).map(c => c.column_name + ':' + c.data_type));

  // 2. O ERP_AUTH_TOKEN bate com alguma sessão? (NÃO imprime o token)
  const tk = process.env.ERP_AUTH_TOKEN || '';
  const cols = (await rows(`SELECT column_name FROM information_schema.columns WHERE table_name='sessoes_usuarios'`)).map(c => c.column_name);
  const tokenCol = cols.find(c => /token|sessao|chave|hash|id/i.test(c) && c !== 'usuario_id');
  console.log('\n>>> coluna candidata p/ token de sessão:', tokenCol);
  for (const c of cols.filter(c => /token|sessao|chave|hash|^id$/i.test(c))) {
    try {
      const m = await rows(`SELECT usuario_id FROM sessoes_usuarios WHERE ${c}::text = $1 LIMIT 1`, [tk]);
      console.log(`token == sessoes_usuarios.${c}? ->`, m.length ? ('SIM, usuario_id=' + m[0].usuario_id) : 'não');
    } catch (e) { console.log(`coluna ${c}: erro ${e.message}`); }
  }

  // 3. Sessões do acesso.api (55367753) — existência (sem imprimir o token)
  show('qtd sessões do acesso.api', await rows(`SELECT count(*) FROM sessoes_usuarios WHERE usuario_id = 55367753`));

  // 4. Nomes das 5 funções do agente real
  show('funções do agente real (nomes)', await rows(`
    SELECT * FROM funcoes WHERE id IN (2094672,47270776,47975159,59279890,73367225)`));

  // 5. Procurar funções SGPRC/orçamento/proposta
  show('funções SGPRC/orçamento/proposta', await rows(`
    SELECT id, nome FROM funcoes
    WHERE lower(nome) LIKE '%sgprc%' OR lower(nome) LIKE '%orcament%'
       OR lower(nome) LIKE '%orçament%' OR lower(nome) LIKE '%proposta%' LIMIT 30`));

  await pool.end();
  console.log('\nFIM.');
})();
