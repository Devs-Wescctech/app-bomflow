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

/**
 * Adiciona produto(s) e beneficiário(s) a um pedido ERP já criado via OrcamentoSgprcUsuario.
 * A API REST só salva o cabeçalho; produtos e pessoas ficam em tabelas separadas e precisam
 * de INSERT direto (mesmo padrão de registerAgentInCanal).
 *
 * Estrutura inserida:
 *   itens_pedidos          → o item-produto do pedido
 *   pedidos_pessoas        → beneficiário (titular da venda — parentesco D/F/etc.)
 *   pedidos_pessoas_produtos → vínculo item ↔ beneficiário
 *   pedidos (UPDATE)       → valor_total e valor_mercadorias recalculados
 *
 * @param {number} pedidoInternalId  - pedidos.id retornado pela API (ex: 303390469)
 * @param {object} opts
 *   @param {number}  opts.produtoId          - produto_id numérico do ERP
 *   @param {number}  opts.preco              - preço unitário
 *   @param {number}  [opts.planoPagamentoId] - plano_pagamento_id (default 1643483)
 *   @param {Array}   [opts.beneficiarios]    - lista de objetos beneficiário
 *     @param {string} benef.nome
 *     @param {string} [benef.cpf]
 *     @param {string} [benef.dataNascimento]  - 'YYYY-MM-DD'
 *     @param {string} [benef.sexo]            - 'M'/'F'
 *     @param {string} [benef.parentesco]      - 'D','F','C', etc.
 *     @param {string} [benef.telefone]
 * @returns {Promise<{ itemId: number, pessoaIds: number[] }>}
 */
export async function addItemsToPedido(pedidoInternalId, opts = {}) {
  const db = getPool();
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    const {
      produtoId,
      preco,
      beneficiarios = [],
    } = opts;

    const precoNum = Number(preco) || 0;

    // 1. INSERT itens_pedidos
    // Casts explícitos necessários: preco/preco_lista = double precision,
    // valor_unitario_item/valor_total_item = numeric. Sem o cast, o pg-driver
    // deduz tipos inconsistentes para o mesmo parâmetro e lança erro.
    const itemRes = await client.query(
      `INSERT INTO itens_pedidos (
         id, pedido_id, sequencia, sub_item, produto_id,
         quantidade, preco, situacao, indice,
         preco_lista, valor_unitario_item, valor_total_item,
         quantidade_pendente, quantidade_temporaria, quantidade_temporaria_faturar,
         quantidade_carregar, quantidade_cancelada, quantidade_faturar,
         quantidade_faturada, qtde_cancelada_faturamento, comissao_item,
         quantidade_acima_pedido, atualizar_consumo
       ) VALUES (
         nextval('pk_sequence'), $1, 1, 1, $2,
         1, $3::double precision, 'P', 1,
         $3::double precision, $3::numeric, $3::numeric,
         1, 1, 1,
         1, 0, 1,
         0, 0, 0,
         0, 'S'
       ) RETURNING id`,
      [pedidoInternalId, produtoId, precoNum]
    );
    const itemId = Number(itemRes.rows[0].id);
    console.log(`[erpDbService] itens_pedidos inserido id=${itemId} pedido=${pedidoInternalId} produto=${produtoId} preco=${precoNum}`);

    // 2. INSERT pedidos_pessoas + pedidos_pessoas_produtos para cada beneficiário
    const pessoaIds = [];
    for (let i = 0; i < beneficiarios.length; i++) {
      const b = beneficiarios[i];
      const pessoaRes = await client.query(
        `INSERT INTO pedidos_pessoas (
           id, pedido_id, nome_pessoa, cpf, data_nascimento, sexo, telefone, parentesco
         ) VALUES (
           nextval('pk_sequence'), $1, $2, $3, $4, $5, $6, $7
         ) RETURNING id`,
        [
          pedidoInternalId,
          b.nome || null,
          b.cpf || null,
          b.dataNascimento || null,
          b.sexo || null,
          b.telefone || null,
          b.parentesco || null,
        ]
      );
      const pessoaId = Number(pessoaRes.rows[0].id);
      pessoaIds.push(pessoaId);
      console.log(`[erpDbService] pedidos_pessoas inserido id=${pessoaId} nome=${b.nome} parentesco=${b.parentesco}`);

      await client.query(
        `INSERT INTO pedidos_pessoas_produtos (
           id, pedido_id, item_pedido_id, sequencia, titular_id, aprovado
         ) VALUES (
           nextval('pk_sequence'), $1, $2, $3, $4, 'N'
         )`,
        [pedidoInternalId, itemId, i + 1, pessoaId]
      );
      console.log(`[erpDbService] pedidos_pessoas_produtos inserido pedido=${pedidoInternalId} item=${itemId} pessoa=${pessoaId}`);
    }

    // 3. UPDATE pedidos.valor_total e valor_mercadorias
    await client.query(
      `UPDATE pedidos SET valor_total = $1, valor_mercadorias = $1 WHERE id = $2`,
      [precoNum, pedidoInternalId]
    );
    console.log(`[erpDbService] pedidos valor_total atualizado para ${precoNum} (id=${pedidoInternalId})`);

    await client.query('COMMIT');
    return { itemId, pessoaIds };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[erpDbService] addItemsToPedido ROLLBACK:', err.message);
    throw err;
  } finally {
    client.release();
  }
}
