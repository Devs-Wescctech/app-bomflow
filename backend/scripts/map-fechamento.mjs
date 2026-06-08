// Inspeção READ-ONLY: mapear fechamentos_pedidos, triggers e ciclo de um orçamento real.
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
  // 1. Colunas de fechamentos_pedidos
  show('colunas fechamentos_pedidos', (await rows(`
    SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
    WHERE table_name='fechamentos_pedidos' ORDER BY ordinal_position
  `)));

  // 2. FKs de fechamentos_pedidos (pra achar como liga ao pedido)
  show('FKs fechamentos_pedidos', (await rows(`
    SELECT kcu.column_name, ccu.table_name AS ref_table, ccu.column_name AS ref_col
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
    WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_name='fechamentos_pedidos'
  `)));

  // 3. Definição das funções dos triggers de pedidos (RISCO)
  show('action_statement triggers pedidos', (await rows(`
    SELECT trigger_name, action_timing, event_manipulation, action_statement
    FROM information_schema.triggers WHERE event_object_table='pedidos'
  `)));

  // 4. Um orçamento real APROVADO/PROPOSTA recente (EXPLORER) com itens, e seu fechamento
  const ped = (await rows(`
    SELECT p.id, p.pedido, p.situacao, p.cliente_id, p.valor_total
    FROM pedidos p
    WHERE p.contrato_parceiro_id = 47194339 AND p.situacao IN ('P','I','A')
      AND EXISTS (SELECT 1 FROM itens_pedidos i WHERE i.pedido_id=p.id)
    ORDER BY p.id DESC LIMIT 1
  `))[0];
  show('orçamento real (P/I/A) molde', ped);

  if (ped) {
    // tenta achar o fechamento ligado por colunas candidatas
    const cols = (await rows(`SELECT column_name FROM information_schema.columns WHERE table_name='fechamentos_pedidos'`)).map(x=>x.column_name);
    const fk = cols.find(c => /pedido/i.test(c));
    show('coluna FK candidata em fechamentos', fk);
    if (fk) {
      const f = await rows(`SELECT * FROM fechamentos_pedidos WHERE ${fk} = $1 LIMIT 3`, [ped.id]);
      show('fechamento do molde (nao-nulos)', f.map(semNulos));
    }
    // historico do molde
    const h = await rows(`SELECT * FROM historicos_pedidos WHERE pedido_id=$1 ORDER BY id LIMIT 5`, [ped.id]);
    show('historicos do molde (nao-nulos)', h.map(semNulos));
  }

  await pool.end();
  console.log('\nFIM.');
})();
