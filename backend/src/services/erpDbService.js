import pkg from 'pg';
const { Pool } = pkg;

let pool = null;

function getPool() {
  if (!pool) {
    pool = new Pool({
      host: process.env.ERP_DB_HOST,
      port: parseInt(process.env.ERP_DB_PORT) || 5432,
      database: process.env.ERP_DB_NAME,
      user: process.env.ERP_DB_USER,
      password: process.env.ERP_DB_PASSWORD,
      ssl: false,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000,
      max: 3,
    });
    pool.on('error', (err) => {
      console.error('[erpDbService] Pool error:', err.message);
    });
  }
  return pool;
}

/**
 * Registra um agente no canal de vendas do ERP inserindo um registro
 * em pessoas_contratos. Se o par (pessoa_id, contrato_id) já existir,
 * retorna o id existente sem criar duplicata.
 *
 * @param {number} pessoaId    - erp_agent_id do agente (id interno do ERP)
 * @param {number} contratoId  - canal_venda_id (id da api_canal_vendas)
 * @param {number|null} grupoId - canal_venda_grupo_id (grupo_id da api_canal_vendas)
 * @returns {Promise<number>}  - id gerado em pessoas_contratos (agente_venda_id)
 */
export async function registerAgentInCanal(pessoaId, contratoId, grupoId) {
  const db = getPool();

  const existing = await db.query(
    `SELECT id FROM pessoas_contratos
     WHERE pessoa_id = $1 AND contrato_id = $2
     LIMIT 1`,
    [pessoaId, contratoId]
  );

  if (existing.rows.length > 0) {
    const existingId = existing.rows[0].id;
    console.log(`[erpDbService] Agente ${pessoaId} já vinculado ao canal ${contratoId} — id: ${existingId}`);
    return Number(existingId);
  }

  const result = await db.query(
    `INSERT INTO pessoas_contratos (
       id, contrato_id, pessoa_id, titular, data_inicio, data_termino,
       valor, observacoes, fator, margem_consignavel, pessoa_relacionada_id,
       relacionamento_id, tipo_vinculo_id, percentual_coparticipacao,
       cartao_id, numero_sorte_capitalizacao, numero_titulo_capitalizacao,
       beneficiarios, nome_embossing, grupo_id, ativo
     ) VALUES (
       nextval('pk_sequence'), $1, $2, 'N', NOW(), null,
       0.0, null, null, null, null,
       null, 2094514, null,
       null, null, null,
       null, null, $3, 'S'
     ) RETURNING id`,
    [contratoId, pessoaId, grupoId || null]
  );

  const newId = Number(result.rows[0].id);
  console.log(`[erpDbService] Agente ${pessoaId} registrado no canal ${contratoId} — agente_venda_id: ${newId}`);
  return newId;
}
