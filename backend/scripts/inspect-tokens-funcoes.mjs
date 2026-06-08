// READ-ONLY: tokens_acesso (mapeia p/ usuário?) + funcoes_sistemas SGPRC.
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
  // 1. Colunas de tokens_acesso
  const cols = (await rows(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='tokens_acesso' ORDER BY ordinal_position`));
  show('colunas tokens_acesso', cols.map(c => c.column_name + ':' + c.data_type));

  // 2. O ERP_AUTH_TOKEN bate com tokens_acesso? (NÃO imprime valor)
  const tk = process.env.ERP_AUTH_TOKEN || '';
  const colNames = cols.map(c => c.column_name);
  for (const c of colNames.filter(c => /token|chave|hash|valor|codigo/i.test(c))) {
    try {
      const m = await rows(`SELECT * FROM tokens_acesso WHERE ${c}::text = $1 LIMIT 1`, [tk]);
      if (m.length) {
        const r = m[0]; const safe = {}; for (const [k,v] of Object.entries(r)) safe[k] = (/token|chave|hash|valor/i.test(k)) ? '***' : v;
        console.log(`\n>>> ERP_AUTH_TOKEN encontrado em tokens_acesso.${c}! linha (mascarada):`, JSON.stringify(safe));
      } else console.log(`token == tokens_acesso.${c}? -> não`);
    } catch (e) { console.log(`coluna ${c}: erro ${e.message}`); }
  }

  // 3. Quantos tokens existem e para quantos usuários distintos
  const userCol = colNames.find(c => /usuario/i.test(c));
  if (userCol) {
    show('tokens por usuário (top)', await rows(`SELECT ${userCol} AS usuario_id, count(*) FROM tokens_acesso GROUP BY ${userCol} ORDER BY 2 DESC LIMIT 10`));
  }
  show('total tokens', await rows(`SELECT count(*) FROM tokens_acesso`));

  // 4. As 5 funções do agente real
  show('funcoes_sistemas do agente real', await rows(`SELECT id, descricao, sistema_id FROM funcoes_sistemas WHERE id IN (2094672,47270776,47975159,59279890,73367225)`));

  // 5. Procurar função SGPRC/orçamento
  show('funcoes_sistemas SGPRC/orçamento', await rows(`
    SELECT id, descricao, sistema_id FROM funcoes_sistemas
    WHERE lower(descricao) LIKE '%sgprc%' OR lower(descricao) LIKE '%orcament%'
       OR lower(descricao) LIKE '%orçament%' OR lower(descricao) LIKE '%proposta%' LIMIT 40`));

  await pool.end();
  console.log('\nFIM.');
})();
