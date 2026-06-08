// Inspeção READ-ONLY: molde 110018633 completo + título + docs do cliente.
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
function semNulos(r) { const o = {}; for (const [k, v] of Object.entries(r)) if (v !== null) o[k] = v; return o; }

(async () => {
  const ID = 110018633;
  const ped = (await rows(`SELECT * FROM pedidos WHERE id=$1`, [ID]))[0];
  show('pedido 110018633 (nao-nulos)', semNulos(ped));
  show('titulos pedido_relacionado_id=110018633', await rows(`
    SELECT id, titulo, valor, saldo, situacao, data_vencimento, tipo_operacao, destinatario_id, tipo_titulo_id
    FROM titulos WHERE pedido_relacionado_id = $1`, [ID]));
  show('cliente doc data admissão (2657422)?', await rows(`
    SELECT tipo_documento_id, documento FROM documentos_pessoas
    WHERE pessoa_id = $1 AND tipo_documento_id = 2657422`, [ped.cliente_id]));

  // Quantos 'I' existem no canal no total (pra saber se REST já funcionou algum dia)
  show('total pedidos por situacao no canal', await rows(`
    SELECT situacao, count(*) FROM pedidos WHERE contrato_parceiro_id=47194339 GROUP BY situacao ORDER BY 2 DESC`));

  // Os 8 esqueletos: têm contato_crm_id? (impacta bloqueio de duplicado)
  show('esqueletos de teste (contato_crm_id)', await rows(`
    SELECT id, pedido, situacao, contato_crm_id, cliente_id FROM pedidos
    WHERE agente_venda_id = 302508396 ORDER BY id DESC LIMIT 10`));

  await pool.end();
  console.log('\nFIM.');
})();
