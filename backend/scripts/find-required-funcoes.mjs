// READ-ONLY: descobrir a(s) função(ões) exigida(s) cruzando criadores de orçamentos OK.
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
  // 0. colunas funcoes_sistemas
  const fcols = (await rows(`SELECT column_name FROM information_schema.columns WHERE table_name='funcoes_sistemas' ORDER BY ordinal_position`)).map(c=>c.column_name);
  show('colunas funcoes_sistemas', fcols);

  // 1. Criadores distintos de orçamentos OK no canal (A/I/P), excluindo acesso.api
  const creators = (await rows(`
    SELECT DISTINCT usuario_inclusao_id FROM pedidos
    WHERE contrato_parceiro_id=47194339 AND situacao IN ('A','I','P')
      AND usuario_inclusao_id IS NOT NULL AND usuario_inclusao_id <> 55367753`)).map(r => r.usuario_inclusao_id);
  show('qtd criadores OK no canal', creators.length);

  // 2. Para cada criador, suas funções; calcular interseção
  let intersec = null;
  const perUser = {};
  for (const uid of creators) {
    const fs = (await rows(`SELECT funcao_id FROM funcoes_usuarios WHERE usuario_id=$1`, [uid])).map(r => String(r.funcao_id));
    perUser[uid] = fs;
    const set = new Set(fs);
    if (intersec === null) intersec = set;
    else intersec = new Set([...intersec].filter(x => set.has(x)));
  }
  show('FUNÇÕES COMUNS A TODOS os criadores OK (interseção)', intersec ? [...intersec] : []);

  // 3. União (todas as funções que aparecem) com contagem
  const cnt = {};
  for (const uid of creators) for (const f of perUser[uid]) cnt[f] = (cnt[f]||0)+1;
  const ranked = Object.entries(cnt).sort((a,b)=>b[1]-a[1]).slice(0,15);
  show('funções mais frequentes entre criadores (funcao_id:qtd de '+creators.length+')', ranked);

  // 4. acesso.api funções atuais
  show('funcoes atuais do acesso.api (55367753)', (await rows(`SELECT funcao_id FROM funcoes_usuarios WHERE usuario_id=55367753`)).map(r=>String(r.funcao_id)));

  // 5. Descrições das funções da interseção + top
  const ids = [...new Set([...(intersec?[...intersec]:[]), ...ranked.map(r=>r[0])])];
  if (ids.length) {
    const descCol = fcols.find(c=>/desc|nome/i.test(c)) || 'id';
    show('descrições das funções candidatas', await rows(
      `SELECT id, ${descCol} FROM funcoes_sistemas WHERE id = ANY($1::bigint[])`, [ids]));
  }

  await pool.end();
  console.log('\nFIM.');
})();
