// Inspeção READ-ONLY: as tentativas REST deixaram pedido parcial no banco?
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
function show(label, data) { console.log('\n===== ' + label + ' =====\n' + JSON.stringify(data, null, 2)); }

(async () => {
  // 1. Pedidos com nosso agente de venda de teste
  show('pedidos agente_venda_id=302508396', await rows(`
    SELECT id, pedido, situacao, cliente_id, valor_total, data_inclusao, usuario_inclusao_id
    FROM pedidos WHERE agente_venda_id = 302508396 ORDER BY id DESC LIMIT 10
  `));

  // 2. Pedidos recentes (últimas 48h) no canal EXPLORER
  show('pedidos EXPLORER últimas 48h', await rows(`
    SELECT id, pedido, situacao, cliente_id, agente_venda_id, valor_total, data_inclusao, usuario_inclusao_id
    FROM pedidos
    WHERE contrato_parceiro_id = 47194339
      AND data_inclusao >= now() - interval '48 hours'
    ORDER BY id DESC LIMIT 20
  `));

  // 3. Itens com nosso produto de teste 47225213 recentes
  show('itens com produto 47225213', await rows(`
    SELECT i.id, i.pedido_id, i.produto_id, i.quantidade, i.preco, i.situacao
    FROM itens_pedidos i WHERE i.produto_id = 47225213 ORDER BY i.id DESC LIMIT 10
  `));

  await pool.end();
  console.log('\nFIM.');
})();
