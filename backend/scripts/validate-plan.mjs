// Inspeção READ-ONLY: validar detalhes finais p/ o plano (orçamento 'I' legítimo recente).
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
  // 1. Existe a coluna data_emissao_pedido_analise?
  show('campos data_emissao* em pedidos', (await rows(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name='pedidos' AND column_name LIKE '%data_emissao%'
  `)).map(x=>x.column_name));

  // 2. Orçamento 'I' legítimo recente no canal (NÃO criado por acesso.api)
  const ped = (await rows(`
    SELECT * FROM pedidos
    WHERE contrato_parceiro_id = 47194339 AND situacao = 'I'
      AND usuario_inclusao_id <> 55367753
      AND data_inclusao >= now() - interval '60 days'
    ORDER BY id DESC LIMIT 1
  `))[0];
  show('orçamento I legítimo recente (nao-nulos)', ped ? semNulos(ped) : 'nenhum nos últimos 60 dias');

  if (ped) {
    show('itens desse orçamento (nao-nulos)', (await rows(`SELECT * FROM itens_pedidos WHERE pedido_id=$1`, [ped.id])).map(semNulos));
    // título gerado
    show('títulos com pedido_relacionado_id', (await rows(`
      SELECT id, titulo, valor, saldo, situacao, data_vencimento, tipo_operacao, destinatario_id
      FROM titulos WHERE pedido_relacionado_id = $1 LIMIT 5`, [ped.id])));
    // cliente tem documento data de admissão (tipo 2657422)?
    show('cliente tem doc data admissão (2657422)?', (await rows(`
      SELECT tipo_documento_id, documento FROM documentos_pessoas
      WHERE pessoa_id = $1 AND tipo_documento_id = 2657422`, [ped.cliente_id])));
  }

  await pool.end();
  console.log('\nFIM.');
})();
