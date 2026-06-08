// Inspeção READ-ONLY: achar um pedido REAL completo (com itens) como molde.
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

async function rows(sql, params = []) {
  const r = await pool.query(sql, params);
  return r.rows;
}
function show(label, data) {
  console.log('\n===== ' + label + ' =====');
  console.log(JSON.stringify(data, null, 2));
}
function semNulos(row) { const o = {}; for (const [k, v] of Object.entries(row)) if (v !== null) o[k] = v; return o; }

(async () => {
  // FK columns das filhas
  for (const t of ['itens_pedidos', 'dados_itens_pedidos', 'fechamentos_pedidos', 'modos_pagamentos']) {
    const c = await rows(`SELECT column_name FROM information_schema.columns WHERE table_name=$1 ORDER BY ordinal_position`, [t]);
    show(`colunas ${t}`, c.map(x => x.column_name));
  }

  // Achar um pedido EXPLORER que tem itens
  const pid = (await rows(`
    SELECT p.id, p.pedido, p.situacao
    FROM pedidos p
    WHERE p.contrato_parceiro_id = 47194339
      AND EXISTS (SELECT 1 FROM itens_pedidos i WHERE i.pedido_id = p.id)
    ORDER BY p.id DESC LIMIT 1
  `))[0];
  show('pedido molde com itens', pid);

  if (pid) {
    const ped = (await rows(`SELECT * FROM pedidos WHERE id=$1`, [pid.id]))[0];
    show('pedido completo (nao-nulos)', semNulos(ped));
    const its = await rows(`SELECT * FROM itens_pedidos WHERE pedido_id=$1`, [pid.id]);
    show('itens_pedidos (nao-nulos)', its.map(semNulos));
    const mp = await rows(`SELECT * FROM modos_pagamentos WHERE pedido_id=$1`, [pid.id]);
    show('modos_pagamentos (nao-nulos)', mp.map(semNulos));
  }

  await pool.end();
  console.log('\nFIM.');
})();
