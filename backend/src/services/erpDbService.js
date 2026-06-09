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
      beneficiarioProdutoId = null,
    } = opts;

    const precoNum = Number(preco) || 0;

    // 1. INSERT itens_pedidos — produto principal (sequencia 1)
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

    // 1b. Se o produto dos beneficiários é diferente (ex: BOM PET → item "NOME DO PET"),
    //     insere um segundo item com preço 0 e sequencia 2. A QUANTIDADE deste item
    //     deve ser igual ao número de beneficiários (pets): o ERP valida no Fechamento
    //     que (pessoas vinculadas ao item) == (quantidade do item).
    let benefItemId = itemId;
    const isBomPetPath = beneficiarioProdutoId && Number(beneficiarioProdutoId) !== Number(produtoId);
    if (isBomPetPath) {
      // BOM PET sem pets resultaria em mismatch garantido no Fechamento (item NOME DO PET
      // com quantidade > 0 e nenhuma pessoa vinculada). Aborta a transação com erro claro.
      if (beneficiarios.length === 0) {
        throw new Error('BOM PET exige ao menos um pet (beneficiário) informado.');
      }
      const petQty = beneficiarios.length;
      const benefItemRes = await client.query(
        `INSERT INTO itens_pedidos (
           id, pedido_id, sequencia, sub_item, produto_id,
           quantidade, preco, situacao, indice,
           preco_lista, valor_unitario_item, valor_total_item,
           quantidade_pendente, quantidade_temporaria, quantidade_temporaria_faturar,
           quantidade_carregar, quantidade_cancelada, quantidade_faturar,
           quantidade_faturada, qtde_cancelada_faturamento, comissao_item,
           quantidade_acima_pedido, atualizar_consumo
         ) VALUES (
           nextval('pk_sequence'), $1, 2, 1, $2,
           $3::numeric, 0::double precision, 'P', 2,
           0::double precision, 0::numeric, 0::numeric,
           $3::numeric, $3::numeric, $3::numeric,
           $3::numeric, 0, $3::numeric,
           0, 0, 0,
           0, 'S'
         ) RETURNING id`,
        [pedidoInternalId, Number(beneficiarioProdutoId), petQty]
      );
      benefItemId = Number(benefItemRes.rows[0].id);
      console.log(`[erpDbService] itens_pedidos beneficiário inserido id=${benefItemId} produto=${beneficiarioProdutoId} qtd=${petQty} (BOM PET)`);

      // 1c. Vincula o CONTRATANTE (titular) ao item principal. O ERP exige 1 pessoa
      //     no "cartão" do plano; reaproveita a linha do contratante (pessoa_id NOT NULL)
      //     já inserida automaticamente pela API ao criar o pedido (não duplica pessoa).
      const contrRes = await client.query(
        `SELECT id FROM pedidos_pessoas WHERE pedido_id = $1 AND pessoa_id IS NOT NULL ORDER BY id LIMIT 1`,
        [pedidoInternalId]
      );
      const contratanteId = contrRes.rows[0]?.id ? Number(contrRes.rows[0].id) : null;
      if (contratanteId) {
        await client.query(
          `INSERT INTO pedidos_pessoas_produtos (
             id, pedido_id, item_pedido_id, sequencia, titular_id, aprovado
           ) VALUES (
             nextval('pk_sequence'), $1, $2, 1, $3, 'N'
           )`,
          [pedidoInternalId, itemId, contratanteId]
        );
        console.log(`[erpDbService] pedidos_pessoas_produtos contratante vinculado ao item principal item=${itemId} titular=${contratanteId} (BOM PET)`);
      } else {
        // Sem contratante vinculado, o item principal fica com 0 pessoas e o ERP rejeita
        // no Fechamento. Aborta a transação para não gerar pedido inconsistente.
        throw new Error(`BOM PET: contratante (pessoa_id) não encontrado para o pedido ${pedidoInternalId}; não foi possível vincular o titular ao item principal.`);
      }
    }

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
        [pedidoInternalId, benefItemId, i + 1, pessoaId]
      );
      console.log(`[erpDbService] pedidos_pessoas_produtos inserido pedido=${pedidoInternalId} item=${benefItemId} pessoa=${pessoaId}`);
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

/**
 * Finaliza um pedido ERP recém-criado preenchendo campos que a API REST ignora:
 *   - endereco_id   → busca o endereço do contratante por CEP (fallback: primeiro endereço físico)
 *   - dia_vencimento
 *   - email_contato
 *
 * @param {number} pedidoInternalId  - pedidos.id
 * @param {object} opts
 *   @param {number|null}  [opts.diaVencimento]
 *   @param {string|null}  [opts.emailContato]
 *   @param {string|null}  [opts.codigoPostal]   - CEP para localizar o endereço do contratante
 */
export async function finalizeOrcamentoDB(pedidoInternalId, opts = {}) {
  const db = getPool();
  const { diaVencimento = null, emailContato = null, codigoPostal = null } = opts;

  try {
    // 1. Localiza o pessoa_id do contratante (linha com pessoa_id IS NOT NULL)
    const ppRes = await db.query(
      `SELECT pessoa_id FROM pedidos_pessoas WHERE pedido_id = $1 AND pessoa_id IS NOT NULL LIMIT 1`,
      [pedidoInternalId]
    );
    const pessoaId = ppRes.rows[0]?.pessoa_id ? Number(ppRes.rows[0].pessoa_id) : null;
    console.log(`[erpDbService] finalizeOrcamento pedido=${pedidoInternalId} contratante_pessoa_id=${pessoaId}`);

    // 2. Localiza o endereco_id: primeiro tenta pelo CEP, depois qualquer endereço físico
    let enderecoId = null;
    if (pessoaId) {
      const cepClean = codigoPostal ? codigoPostal.replace(/\D/g, '') : null;

      if (cepClean) {
        const byZip = await db.query(
          `SELECT id FROM enderecos
           WHERE pessoa_id = $1
             AND REPLACE(REPLACE(codigo_postal, '-', ''), ' ', '') = $2
             AND ativo = 'S'
           ORDER BY id DESC LIMIT 1`,
          [pessoaId, cepClean]
        );
        if (byZip.rows.length > 0) enderecoId = Number(byZip.rows[0].id);
      }

      if (!enderecoId) {
        const anyPhysical = await db.query(
          `SELECT id FROM enderecos
           WHERE pessoa_id = $1
             AND codigo_postal IS NOT NULL
             AND ativo = 'S'
           ORDER BY id DESC LIMIT 1`,
          [pessoaId]
        );
        if (anyPhysical.rows.length > 0) enderecoId = Number(anyPhysical.rows[0].id);
      }
    }
    console.log(`[erpDbService] finalizeOrcamento endereco_id=${enderecoId}`);

    // 3. UPDATE pedidos com os campos que a API REST ignora
    const updates = [];
    const params = [];
    let idx = 1;

    if (enderecoId) { updates.push(`endereco_id = $${idx++}`); params.push(enderecoId); }
    if (diaVencimento != null) { updates.push(`dia_vencimento = $${idx++}`); params.push(Number(diaVencimento)); }
    if (emailContato) { updates.push(`email_contato = $${idx++}`); params.push(emailContato); }

    if (updates.length > 0) {
      params.push(pedidoInternalId);
      await db.query(
        `UPDATE pedidos SET ${updates.join(', ')} WHERE id = $${idx}`,
        params
      );
      console.log(`[erpDbService] finalizeOrcamento UPDATE OK: ${updates.join(', ')} (pedido id=${pedidoInternalId})`);
    }

    return { enderecoId, diaVencimento, emailContato };
  } catch (err) {
    console.error('[erpDbService] finalizeOrcamentoDB erro (não crítico):', err.message);
    return null;
  }
}

/**
 * Lista os planos de pagamento ativos e válidos do ERP (planos_pagamentos).
 * Usado para popular o dropdown de "Plano de pagamento" no orçamento.
 *
 * @returns {Promise<Array<{id:number, plano_pagamento:string, numero_parcelas:number, dia_vencimento:number|null}>>}
 */
export async function getPlanosPagamento() {
  const db = getPool();
  const res = await db.query(
    `SELECT id, plano_pagamento, numero_parcelas, dia_vencimento
       FROM planos_pagamentos
      WHERE ativo = 'S' AND valido = 'S'
      ORDER BY plano_pagamento`
  );
  return res.rows.map((r) => ({
    id: Number(r.id),
    plano_pagamento: r.plano_pagamento,
    numero_parcelas: r.numero_parcelas != null ? Number(r.numero_parcelas) : null,
    dia_vencimento: r.dia_vencimento != null ? Number(r.dia_vencimento) : null,
  }));
}

/**
 * Replica o processo manual feito no ERP após o orçamento estar completo:
 *   1. Fechamento: muda a situação do pedido de "M" para "I" e preenche os campos
 *      fiscais/derivados que o ERP calcula nessa transição (valor_saldo,
 *      valor_total_pedido, data de emissão para análise, campos de ICMS/IPI zerados).
 *   2. Pagamento: insere o registro em modos_pagamentos (id == pedido_id, padrão do ERP)
 *      com o plano escolhido e a quantidade de parcelas digitada, e aponta
 *      pedidos.modo_pagamento_id de volta para ele.
 *
 * NÃO avança para "A" (aprovação) — isso continua sendo manual no ERP.
 *
 * @param {number} pedidoInternalId - pedidos.id
 * @param {object} opts
 *   @param {number}      opts.planoPagamentoId   - planos_pagamentos.id escolhido
 *   @param {number|null} [opts.quantidadeParcelas] - quantidade digitada pelo vendedor
 * @returns {Promise<{ situacao:string, modoPagamentoId:number, planoPagamentoId:number, numeroParcelas:number|null }>}
 */
export async function applyFechamentoEPagamento(pedidoInternalId, opts = {}) {
  const db = getPool();
  const client = await db.connect();

  const { planoPagamentoId, quantidadeParcelas = null } = opts;
  const planoId = Number(planoPagamentoId);
  if (!planoId || Number.isNaN(planoId)) {
    throw new Error('Plano de pagamento obrigatório para o fechamento.');
  }

  try {
    await client.query('BEGIN');

    // Garante que o pedido existe e está em estado fechável (situação "M").
    const pedRes = await client.query(
      `SELECT id, situacao, valor_total FROM pedidos WHERE id = $1 FOR UPDATE`,
      [pedidoInternalId]
    );
    if (pedRes.rows.length === 0) {
      throw new Error(`Pedido ${pedidoInternalId} não encontrado para fechamento.`);
    }
    const pedido = pedRes.rows[0];
    // Só fecha pedidos que estão de fato na etapa de orçamento ("M"). Isso evita
    // transicionar indevidamente pedidos já aprovados/cancelados/em outro estado.
    if (pedido.situacao !== 'M') {
      throw new Error(`Pedido ${pedidoInternalId} não está em estado fechável (situação atual: "${pedido.situacao}", esperado "M").`);
    }
    const valorTotal = Number(pedido.valor_total) || 0;

    // Número de parcelas do plano (informativo no cabeçalho).
    const planoRes = await client.query(
      `SELECT numero_parcelas FROM planos_pagamentos WHERE id = $1`,
      [planoId]
    );
    if (planoRes.rows.length === 0) {
      throw new Error(`Plano de pagamento ${planoId} não encontrado.`);
    }
    const planoNumeroParcelas = planoRes.rows[0].numero_parcelas != null
      ? Number(planoRes.rows[0].numero_parcelas)
      : null;

    // 1. Fechamento (M → I) + campos derivados/fiscais que o ERP preenche nessa etapa.
    await client.query(
      `UPDATE pedidos SET
         situacao = 'I',
         prazo_pagamento_id = $2,
         modo_pagamento_id = $1,
         numero_parcelas = COALESCE($3, numero_parcelas),
         valor_total_pedido = $4::numeric,
         valor_saldo = $4::double precision,
         data_emissao_pedido_analise = CURRENT_DATE,
         valor_ipi = 0,
         outros_valores = 0,
         valor_total_base_icms_st = 0,
         valor_total_icms_st = 0,
         outros_valores_nao_influencia = 0,
         valor_total_diferencial_icms = 0,
         data_alteracao = NOW()
       WHERE id = $1`,
      [pedidoInternalId, planoId, planoNumeroParcelas, valorTotal]
    );
    console.log(`[erpDbService] fechamento OK pedido=${pedidoInternalId} situacao=I plano=${planoId} total=${valorTotal}`);

    // 2. Pagamento — modos_pagamentos usa o MESMO id do pedido (padrão do ERP).
    //    Idempotente: se já existir, atualiza o plano/parcelas.
    const qtdParcelas = quantidadeParcelas != null && quantidadeParcelas !== ''
      ? Number(quantidadeParcelas)
      : null;
    await client.query(
      `INSERT INTO modos_pagamentos (id, pedido_id, plano_pagamento_id, quantidade_parcelas, recorrente)
       VALUES ($1, $1, $2, $3, 'S')
       ON CONFLICT (id) DO UPDATE SET
         pedido_id = EXCLUDED.pedido_id,
         plano_pagamento_id = EXCLUDED.plano_pagamento_id,
         quantidade_parcelas = EXCLUDED.quantidade_parcelas,
         recorrente = 'S'`,
      [pedidoInternalId, planoId, qtdParcelas]
    );
    console.log(`[erpDbService] modos_pagamentos OK id=${pedidoInternalId} plano=${planoId} qtdParcelas=${qtdParcelas}`);

    await client.query('COMMIT');
    return {
      situacao: 'I',
      modoPagamentoId: Number(pedidoInternalId),
      planoPagamentoId: planoId,
      numeroParcelas: planoNumeroParcelas,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[erpDbService] applyFechamentoEPagamento ROLLBACK:', err.message);
    throw err;
  } finally {
    client.release();
  }
}
