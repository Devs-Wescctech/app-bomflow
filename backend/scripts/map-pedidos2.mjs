// Inspeção READ-ONLY: molde de pedido (só não-nulos) + filhas + triggers.
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

(async () => {
  // 1. Pega o pedido molde mais recente do canal EXPLORER
  const molde = (await rows(`
    SELECT * FROM pedidos WHERE contrato_parceiro_id = 47194339
    ORDER BY id DESC LIMIT 1
  `))[0];
  // Filtra só não-nulos
  const naoNulos = {};
  for (const [k, v] of Object.entries(molde)) if (v !== null) naoNulos[k] = v;
  show('molde pedido (so nao-nulos)', naoNulos);
  const pedidoId = molde.id;
  console.log('\n>>> pedido molde id =', pedidoId);

  // 2. Filhas desse pedido
  for (const t of ['itens_pedidos', 'dados_itens_pedidos', 'modos_pagamentos', 'fechamentos_pedidos', 'historicos_pedidos']) {
    try {
      const r = await rows(`SELECT * FROM ${t} WHERE pedido_id = $1 LIMIT 3`, [pedidoId]);
      // filtra nao-nulos de cada
      const limpo = r.map(row => {
        const o = {}; for (const [k, v] of Object.entries(row)) if (v !== null) o[k] = v; return o;
      });
      show(`filha ${t} (nao-nulos)`, { qtd: r.length, rows: limpo });
    } catch (e) {
      show(`filha ${t}`, 'ERRO: ' + e.message);
    }
  }

  // 3. Triggers na tabela pedidos
  const trg = await rows(`
    SELECT trigger_name, event_manipulation, action_timing
    FROM information_schema.triggers
    WHERE event_object_table = 'pedidos'
    ORDER BY trigger_name
  `);
  show('triggers em pedidos', trg);

  await pool.end();
  console.log('\nFIM.');
})();
