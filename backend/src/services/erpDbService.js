import pkg from 'pg';
import { logErpDbQuery } from './erpAuditService.js';
const { Pool } = pkg;

let pool = null;

// Cronometra e audita uma query direta ao banco ERP (best-effort; nunca quebra a chamada).
// IMPORTANTE: precisa suportar os DOIS estilos do pg — promise E callback. O pg-pool
// internamente chama client.query(text, values, cb); se o wrapper engolir o callback,
// a promise do chamador NUNCA resolve (a query executa mas a resposta se perde).
function auditedQuery(runner, ...args) {
  const text = args[0];
  const start = Date.now();
  const last = args[args.length - 1];

  if (typeof last === 'function') {
    // Estilo callback (usado internamente pelo pg-pool): repassa TODOS os args.
    args[args.length - 1] = (err, result) => {
      logErpDbQuery(text, Date.now() - start, !err, err ? err.message : null);
      last(err, result);
    };
    return runner(...args);
  }

  // Estilo promise.
  return runner(...args).then(
    (result) => {
      logErpDbQuery(text, Date.now() - start, true, null);
      return result;
    },
    (err) => {
      logErpDbQuery(text, Date.now() - start, false, err.message);
      throw err;
    }
  );
}

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
      // Timeout de query: evita que uma consulta presa deixe a rota pendurada por minutos.
      query_timeout: 30000,
      idleTimeoutMillis: 30000,
      max: 3,
    });
    pool.on('error', (err) => {
      console.error('[erpDbService] Pool error:', err.message);
    });

    // Auditoria: envolve pool.query e os clients de pool.connect para registrar
    // TODAS as queries ao banco ERP sem alterar nenhum call site.
    const origQuery = pool.query.bind(pool);
    pool.query = (...args) => auditedQuery(origQuery, ...args);

    const wrapClient = (client) => {
      if (client && !client.__erpAudited) {
        client.__erpAudited = true;
        const origClientQuery = client.query.bind(client);
        client.query = (...args) => auditedQuery(origClientQuery, ...args);
      }
      return client;
    };

    const origConnect = pool.connect.bind(pool);
    pool.connect = (...args) => {
      // Suporta os dois estilos do pg: callback (pool.connect(cb)) e promise.
      if (typeof args[args.length - 1] === 'function') {
        const cb = args[args.length - 1];
        args[args.length - 1] = (err, client, release) => cb(err, wrapClient(client), release);
        return origConnect(...args);
      }
      return origConnect(...args).then(wrapClient);
    };
  }
  return pool;
}

// Normaliza um CPF para o formato armazenado no ERP (000.000.000-00). Documentos de CPF
// no banco ficam em documentos_pessoas com tipo_documento_id=580 e SEMPRE formatados.
function formatCpfDigits(cpf) {
  const d = String(cpf ?? '').replace(/\D/g, '');
  if (d.length !== 11) return null;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

// Busca o id da Pessoa global do ERP (pessoas.id) a partir do CPF, consultando
// documentos_pessoas (tipo_documento_id=580 = CPF). Retorna null se o CPF for inválido
// ou não houver Pessoa cadastrada com ele. Usado para reaproveitar Pessoas existentes
// (evita duplicar CPF — o ERP bloqueia CPF duplicado) ao cadastrar dependentes.
const ERP_TIPO_DOCUMENTO_CPF = 580;
// Expõe o pool auditado para consultas somente-leitura de outros módulos (ex.: Bom Pet).
export function getErpPool() {
  return getPool();
}

export async function findPessoaIdByCpf(cpf) {
  const formatted = formatCpfDigits(cpf);
  if (!formatted) return null;
  const db = getPool();
  const r = await db.query(
    `SELECT pessoa_id FROM documentos_pessoas
       WHERE tipo_documento_id = $1 AND documento = $2
       LIMIT 1`,
    [ERP_TIPO_DOCUMENTO_CPF, formatted]
  );
  return r.rows[0]?.pessoa_id ? Number(r.rows[0].pessoa_id) : null;
}

/**
 * Resolve, a partir do CPF, o vínculo ERP de um AGENTE/VENDEDOR já existente:
 *   documentos_pessoas (CPF, tipo 580) → pessoa_id (id interno da Pessoa)
 *   pessoas (id)                       → pessoa (código) + nome_completo
 *   usuarios (pessoa_id = id interno)  → id (usuário = erp_agent_id) + login
 *
 * Prefere o login NATIVO do ERP (não começa com "user.") e usuário ativo —
 * o login nativo é o que permite o orçamento sair como criado pelo vendedor
 * real (Frente 3), e não por "acesso.api".
 *
 * Tudo é leitura (SELECT). Nenhuma escrita no ERP.
 *
 * @param {string} cpf
 * @returns {Promise<{
 *   status: 'ok'|'cpf_invalido'|'pessoa_nao_encontrada'|'usuario_nao_encontrado',
 *   pessoaInternalId: number|null, pessoaCodigo: string|null,
 *   nomeErp: string|null, situacaoPessoa: string|null,
 *   usuarioId: number|null, login: string|null, usuarioAtivo: string|null
 * }>}
 */
export async function resolveAgentErpByCpf(cpf) {
  const formatted = formatCpfDigits(cpf);
  if (!formatted) {
    return { status: 'cpf_invalido', pessoaInternalId: null, pessoaCodigo: null, nomeErp: null, situacaoPessoa: null, usuarioId: null, login: null, usuarioAtivo: null };
  }

  const db = getPool();

  // 1. CPF → id interno da Pessoa
  const docRes = await db.query(
    `SELECT pessoa_id FROM documentos_pessoas
       WHERE tipo_documento_id = $1 AND documento = $2
       ORDER BY pessoa_id`,
    [ERP_TIPO_DOCUMENTO_CPF, formatted]
  );
  if (docRes.rows.length > 1) {
    return { status: 'pessoas_ambiguas', pessoaInternalId: null, pessoaCodigo: null, nomeErp: null, situacaoPessoa: null, usuarioId: null, login: null, usuarioAtivo: null };
  }
  const pessoaInternalId = docRes.rows[0]?.pessoa_id ? Number(docRes.rows[0].pessoa_id) : null;
  if (!pessoaInternalId) {
    return { status: 'pessoa_nao_encontrada', pessoaInternalId: null, pessoaCodigo: null, nomeErp: null, situacaoPessoa: null, usuarioId: null, login: null, usuarioAtivo: null };
  }

  // 2. Pessoa → código + nome (para validação de nome)
  const pesRes = await db.query(
    `SELECT id, pessoa, nome_completo, situacao FROM pessoas WHERE id = $1 LIMIT 1`,
    [pessoaInternalId]
  );
  const pessoa = pesRes.rows[0] || null;

  // 3. Pessoa → Usuário. Prefere login nativo (não "user.%") e usuário ativo.
  const usrRes = await db.query(
    `SELECT id, login, nome_completo, ativo FROM usuarios
       WHERE pessoa_id = $1
       ORDER BY id`,
    [pessoaInternalId]
  );
  const usuario = usrRes.rows.length === 1 ? usrRes.rows[0] : null;

  return {
    status: usuario
      ? 'ok'
      : (usrRes.rows.length > 1 ? 'usuarios_ambiguos' : 'usuario_nao_encontrado'),
    pessoaInternalId,
    pessoaCodigo: pessoa?.pessoa ? String(pessoa.pessoa) : null,
    nomeErp: pessoa?.nome_completo || null,
    situacaoPessoa: pessoa?.situacao || null,
    usuarioId: usuario?.id ? Number(usuario.id) : null,
    login: usuario?.login || null,
    usuarioAtivo: usuario?.ativo || null,
    usuariosEncontrados: usrRes.rows.map((u) => ({
      id: u.id ? Number(u.id) : null,
      login: u.login || null,
      ativo: u.ativo || null,
    })),
  };
}

/**
 * Busca o login do ERP de um usuário pelo seu id interno (= agents.erp_agent_id).
 * Usado para assinar o orçamento com o login NATIVO do vendedor (Frente 3).
 * Apenas leitura (SELECT). Retorna o login ou null.
 *
 * @param {number} usuarioId - id do usuário no ERP (agents.erp_agent_id)
 * @returns {Promise<string|null>}
 */
export async function getLoginByUsuarioId(usuarioId) {
  if (!usuarioId) return null;
  const db = getPool();
  const res = await db.query(
    `SELECT login FROM usuarios WHERE id = $1 LIMIT 1`,
    [Number(usuarioId)]
  );
  return res.rows[0]?.login || null;
}

/**
 * Resolve o nome do(s) produto(s) de cada pedido (orçamento) do ERP em uma única
 * query batched. Usado apenas para exibição no card "Documentos & Adesão Zero".
 * Quando um pedido tem mais de um produto, os nomes são unidos por " + ".
 * Prioriza produtos.descricao (cadastro) e cai para itens_pedidos.descricao.
 *
 * @param {number[]} pedidoIds - ids internos dos pedidos (erp_pedido_id)
 * @returns {Promise<Object<number,string>>} mapa { [pedido_id]: "Produto A + Produto B" }
 */
export async function getProdutosByPedidoIds(pedidoIds) {
  const ids = (Array.isArray(pedidoIds) ? pedidoIds : [])
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n));
  if (ids.length === 0) return {};
  const db = getPool();
  const res = await db.query(
    `SELECT ip.pedido_id,
            COALESCE(NULLIF(TRIM(p.descricao), ''), NULLIF(TRIM(ip.descricao), '')) AS descricao
       FROM itens_pedidos ip
       LEFT JOIN produtos p ON p.id = ip.produto_id
      WHERE ip.pedido_id = ANY($1::bigint[])
      ORDER BY ip.pedido_id, ip.sequencia`,
    [ids]
  );
  const byPedido = {};
  for (const row of res.rows) {
    const desc = (row.descricao || '').trim();
    if (!desc) continue;
    const key = Number(row.pedido_id);
    (byPedido[key] ||= []);
    if (!byPedido[key].includes(desc)) byPedido[key].push(desc);
  }
  const out = {};
  for (const [key, arr] of Object.entries(byPedido)) {
    out[Number(key)] = arr.join(' + ');
  }
  return out;
}

/**
 * Lê (somente leitura) o detalhe completo de UM orçamento (pedido) do ERP para exibição
 * no modal do Relatório Consolidado de Orçamentos:
 *   - produtos: cada item do pedido (descrição, quantidade, preço, valor total)
 *   - pessoas:  titular + beneficiários (dependentes/pets/veículos/condutores)
 *
 * Importante sobre pet/veículo: o ERP NÃO guarda campos estruturados para pet/veículo neste
 * fluxo — esses dados são gravados como o NOME da pessoa beneficiária no formato montado
 * (pet: NOME/TIPO/RAÇA/COR/PORTE; veículo: MODELO/COR/PLACA/ANO). Devolvemos o nome cru e o
 * frontend faz o parsing/classificação por produto vinculado + formato do nome.
 *
 * O titular/contratante é a PRIMEIRA pessoa (menor id) com pessoa_id NOT NULL — dependentes
 * resolvidos para uma Pessoa global do ERP também têm pessoa_id, por isso não basta "tem pessoa_id".
 *
 * @param {number} pedidoId - id interno do pedido (erp_pedido_id)
 * @returns {Promise<{ produtos: Array, pessoas: Array }|null>}
 */
export async function getOrcamentoDetalhe(pedidoId) {
  const id = Number(pedidoId);
  if (!Number.isFinite(id)) return null;
  const db = getPool();

  const itensRes = await db.query(
    `SELECT ip.sequencia,
            COALESCE(NULLIF(TRIM(p.descricao), ''), NULLIF(TRIM(ip.descricao), '')) AS descricao,
            ip.quantidade::numeric            AS quantidade,
            ip.preco::double precision        AS preco,
            ip.valor_total_item::numeric      AS valor_total
       FROM itens_pedidos ip
       LEFT JOIN produtos p ON p.id = ip.produto_id
      WHERE ip.pedido_id = $1
      ORDER BY ip.sequencia`,
    [id]
  );

  const pessoasRes = await db.query(
    `SELECT pp.id            AS pessoa_row_id,
            pp.nome_pessoa,
            pp.cpf,
            pp.parentesco,
            pp.data_nascimento,
            pp.sexo,
            pp.telefone,
            pp.pessoa_id,
            COALESCE(NULLIF(TRIM(pr.descricao), ''), NULLIF(TRIM(ipx.descricao), '')) AS produto_descricao
       FROM pedidos_pessoas pp
       LEFT JOIN pedidos_pessoas_produtos ppp ON ppp.titular_id = pp.id AND ppp.pedido_id = pp.pedido_id
       LEFT JOIN itens_pedidos ipx ON ipx.id = ppp.item_pedido_id
       LEFT JOIN produtos pr ON pr.id = ipx.produto_id
      WHERE pp.pedido_id = $1
      ORDER BY pp.id`,
    [id]
  );

  const produtos = itensRes.rows.map((r) => ({
    descricao: r.descricao || null,
    quantidade: r.quantidade != null ? Number(r.quantidade) : null,
    preco: r.preco != null ? Number(r.preco) : null,
    valor_total: r.valor_total != null ? Number(r.valor_total) : null,
  }));

  // 1ª pessoa (menor id) com pessoa_id NOT NULL = titular/contratante.
  let titularRowId = null;
  let contratantePessoaId = null;
  for (const row of pessoasRes.rows) {
    if (row.pessoa_id != null) {
      titularRowId = Number(row.pessoa_row_id);
      contratantePessoaId = Number(row.pessoa_id);
      break;
    }
  }

  // Cabeçalho do pedido: e-mail de contato, endereço do contratante e plano de pagamento.
  // A API REST do ERP ignora esses campos; eles são gravados via DB no fechamento, então
  // lemos direto da base para a auditoria refletir 100% dos obrigatórios do formulário.
  const headerRes = await db.query(
    `SELECT pe.email_contato,
            pe.endereco_id,
            pe.prazo_pagamento_id,
            pl.plano_pagamento
       FROM pedidos pe
       LEFT JOIN planos_pagamentos pl ON pl.id = pe.prazo_pagamento_id
      WHERE pe.id = $1
      LIMIT 1`,
    [id]
  );
  const header = headerRes.rows[0] || {};

  // E-mail: pedidos.email_contato; fallback para o contato de e-mail (tipo 566) do contratante.
  let email = header.email_contato || null;
  if (!email && contratantePessoaId) {
    const r = await db.query(
      `SELECT endereco FROM enderecos
        WHERE pessoa_id = $1 AND tipo_endereco_id = 566 AND ativo = 'S'
        ORDER BY id DESC LIMIT 1`,
      [contratantePessoaId]
    );
    email = r.rows[0]?.endereco || null;
  }

  // Endereço físico: pelo endereco_id do pedido; fallback para o residencial (tipo 577) do contratante.
  let enderecoRow = null;
  if (header.endereco_id) {
    const r = await db.query(
      `SELECT en.codigo_postal, en.endereco, en.numero, en.complemento, en.bairro, c.cidade
         FROM enderecos en
         LEFT JOIN cidades c ON c.id = en.cidade_id
        WHERE en.id = $1 LIMIT 1`,
      [Number(header.endereco_id)]
    );
    enderecoRow = r.rows[0] || null;
  }
  if (!enderecoRow && contratantePessoaId) {
    const r = await db.query(
      `SELECT en.codigo_postal, en.endereco, en.numero, en.complemento, en.bairro, c.cidade
         FROM enderecos en
         LEFT JOIN cidades c ON c.id = en.cidade_id
        WHERE en.pessoa_id = $1 AND en.tipo_endereco_id = 577 AND en.ativo = 'S'
        ORDER BY en.id DESC LIMIT 1`,
      [contratantePessoaId]
    );
    enderecoRow = r.rows[0] || null;
  }
  const endereco = enderecoRow
    ? {
        cep: enderecoRow.codigo_postal || null,
        logradouro: enderecoRow.endereco || null,
        numero: enderecoRow.numero || null,
        complemento: enderecoRow.complemento || null,
        bairro: enderecoRow.bairro || null,
        cidade: enderecoRow.cidade || null,
      }
    : null;

  // Plano de pagamento: prazo_pagamento_id do pedido; fallback para modos_pagamentos.
  let plano = header.plano_pagamento || null;
  if (!plano) {
    const r = await db.query(
      `SELECT pl.plano_pagamento
         FROM modos_pagamentos mp
         JOIN planos_pagamentos pl ON pl.id = mp.plano_pagamento_id
        WHERE mp.pedido_id = $1 LIMIT 1`,
      [id]
    );
    plano = r.rows[0]?.plano_pagamento || null;
  }

  // Telefone: pedidos_pessoas.telefone é praticamente sempre NULL neste fluxo; o ERP grava o
  // número de contato em enderecos (tipo 565) do contratante. Fazemos o mesmo fallback usado
  // para e-mail (566) e endereço (577) para a auditoria reconhecer o telefone preenchido.
  let telefoneContratante = null;
  if (contratantePessoaId) {
    const r = await db.query(
      `SELECT endereco FROM enderecos
        WHERE pessoa_id = $1 AND tipo_endereco_id = 565 AND ativo = 'S'
        ORDER BY id DESC LIMIT 1`,
      [contratantePessoaId]
    );
    telefoneContratante = r.rows[0]?.endereco || null;
  }

  // Agrupa por pessoa: uma mesma pessoa pode estar vinculada a vários itens.
  const pessoaMap = new Map();
  for (const row of pessoasRes.rows) {
    const key = Number(row.pessoa_row_id);
    if (!pessoaMap.has(key)) {
      pessoaMap.set(key, {
        nome: row.nome_pessoa || null,
        cpf: row.cpf || null,
        parentesco: row.parentesco || null,
        data_nascimento: row.data_nascimento || null,
        sexo: row.sexo || null,
        telefone: row.telefone || null,
        is_titular: key === titularRowId,
        produtos: [],
      });
    }
    const desc = (row.produto_descricao || '').trim();
    const entry = pessoaMap.get(key);
    if (desc && !entry.produtos.includes(desc)) entry.produtos.push(desc);
  }

  const pessoas = Array.from(pessoaMap.values());
  const titularObj = pessoas.find((p) => p.is_titular);
  if (titularObj) {
    titularObj.email = email;
    titularObj.endereco = endereco;
    if (!titularObj.telefone && telefoneContratante) titularObj.telefone = telefoneContratante;
  }

  return { produtos, pessoas, email, endereco, plano_pagamento: plano };
}

/**
 * Registra um agente no canal de vendas do ERP inserindo um registro
 * em pessoas_contratos. Se o par (pessoa_id, contrato_id) já existir,
 * retorna o id existente sem criar duplicata.
 *
 * @param {number} pessoaId    - id interno de pessoas (nunca agents.erp_agent_id)
 * @param {number} contratoId  - canal_venda_id (id da api_canal_vendas)
 * @param {number|null} grupoId - canal_venda_grupo_id (grupo_id da api_canal_vendas)
 * @returns {Promise<number>}  - id gerado em pessoas_contratos (agente_venda_id)
 */
export async function registerAgentInCanal(pessoaId, contratoId, grupoId) {
  const db = getPool();

  const existing = await db.query(
    `SELECT id FROM pessoas_contratos
     WHERE pessoa_id = $1
       AND contrato_id = $2
       AND grupo_id IS NOT DISTINCT FROM $3
     ORDER BY id`,
    [pessoaId, contratoId, grupoId || null]
  );

  if (existing.rows.length > 1) {
    throw new Error(
      `Há ${existing.rows.length} vínculos para esta Pessoa e canal no ERP. Revise os registros antes de escolher um agente_venda_id.`
    );
  }
  if (existing.rows.length === 1) {
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
 * Confirma, sem criar nem alterar registros, se agents.erp_agente_venda_id
 * corresponde exatamente à Pessoa, canal e grupo selecionados.
 */
export async function validateAgentInCanal(pessoaId, contratoId, grupoId, agenteVendaId) {
  if (!pessoaId || !contratoId || !agenteVendaId) return false;
  const db = getPool();
  const result = await db.query(
    `SELECT id FROM pessoas_contratos
      WHERE pessoa_id = $1
        AND contrato_id = $2
        AND grupo_id IS NOT DISTINCT FROM $3
      ORDER BY id`,
    [Number(pessoaId), Number(contratoId), grupoId ? Number(grupoId) : null]
  );

  if (result.rows.length > 1) {
    throw new Error(
      `Há ${result.rows.length} vínculos para esta Pessoa, canal e grupo no ERP. Revise os registros antes de enviar o orçamento.`
    );
  }
  return result.rows.length === 1 && Number(result.rows[0].id) === Number(agenteVendaId);
}

/**
 * Adiciona MÚLTIPLOS produtos e beneficiário(s) a um pedido ERP já criado via OrcamentoSgprcUsuario.
 * A API REST só salva o cabeçalho; produtos e pessoas ficam em tabelas separadas e precisam
 * de INSERT direto (mesmo padrão de registerAgentInCanal).
 *
 * Modelo fiel ao ERP (orçamento 68335): cada produto vira UM item (cartão). A quantidade do item
 * é o número de pessoas vinculadas a ele (titular + beneficiários atribuídos), e o ERP valida no
 * Fechamento que (pessoas vinculadas ao item) == (quantidade do item). O valor_total_item é
 * preco × quantidade e o valor_total do pedido é a soma dos itens.
 *
 * Estrutura inserida (por item):
 *   itens_pedidos            → o item-produto do pedido (sequencia incremental)
 *   pedidos_pessoas          → beneficiário (parentesco D/F/etc.) — uma linha por beneficiário
 *   pedidos_pessoas_produtos → vínculo item ↔ pessoa (titular reaproveitado / beneficiário)
 *   pedidos (UPDATE)         → valor_total e valor_mercadorias = soma dos itens
 *
 * @param {number} pedidoInternalId  - pedidos.id retornado pela API (ex: 303390469)
 * @param {object} opts
 *   @param {Array} opts.itens - lista de itens
 *     @param {number}  item.produtoId        - produto_id numérico do ERP
 *     @param {number}  item.preco            - preço unitário
 *     @param {boolean} [item.incluirTitular] - vincula o contratante (titular) a este item
 *     @param {Array}   [item.beneficiarios]  - beneficiários atribuídos a este item
 *       @param {string} benef.nome
 *       @param {string} [benef.cpf]
 *       @param {string} [benef.dataNascimento]  - 'YYYY-MM-DD'
 *       @param {string} [benef.sexo]            - 'M'/'F'
 *       @param {string} [benef.parentesco]      - 'D','F','C', etc.
 *       @param {string} [benef.telefone]
 * @returns {Promise<{ itemIds: number[], pessoaIds: number[], valorTotal: number }>}
 */
export async function addItemsToPedido(pedidoInternalId, opts = {}) {
  const db = getPool();
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    const { itens = [] } = opts;
    if (!Array.isArray(itens) || itens.length === 0) {
      throw new Error('Nenhum item informado para o pedido.');
    }

    // Localiza o CONTRATANTE (titular): a linha pedidos_pessoas com pessoa_id NOT NULL,
    // inserida automaticamente pela API ao criar o pedido. Reaproveitada (não duplica pessoa)
    // para vincular o titular aos itens marcados com incluirTitular.
    const contrRes = await client.query(
      `SELECT id, cpf, telefone, data_nascimento, sexo FROM pedidos_pessoas WHERE pedido_id = $1 AND pessoa_id IS NOT NULL ORDER BY id LIMIT 1`,
      [pedidoInternalId]
    );
    const contratanteId = contrRes.rows[0]?.id ? Number(contrRes.rows[0].id) : null;
    // Dados do contratante usados como fallback para beneficiários. O Fechamento/Adesão do ERP
    // percorre os beneficiários e desreferencia data_nascimento/sexo/telefone; se ficarem NULL
    // (caso de veículo/pet/dependente sem esses campos), a procedure estoura "Objeto nulo" (NPE)
    // e a adesão trava em "aguardando". Os orçamentos aprovados sempre têm os três preenchidos
    // em TODA pessoa (beneficiário herda o telefone do titular e uma data/sexo de preenchimento).
    const contratanteTelefone = contrRes.rows[0]?.telefone || null;
    const contratanteNascimento = contrRes.rows[0]?.data_nascimento || null;
    const contratanteSexo = contrRes.rows[0]?.sexo || null;

    // O ERP não permite o mesmo CPF em "pessoas diferentes" dentro do pedido. Mantemos um mapa
    // CPF(normalizado) -> pedidos_pessoas.id já existente no pedido para reaproveitar a mesma
    // pessoa (ex.: no BOM AUTO o condutor costuma ser o próprio titular/contratante) em vez de
    // tentar inserir uma linha duplicada — o que dispara ROLLBACK de todo o pedido.
    const onlyDigits = (s) => (s == null ? '' : String(s)).replace(/\D/g, '');
    const cpfToPessoaId = new Map();
    const contratanteCpf = onlyDigits(contrRes.rows[0]?.cpf);
    if (contratanteCpf && contratanteId) cpfToPessoaId.set(contratanteCpf, contratanteId);

    const itemIds = [];
    const pessoaIds = [];
    let valorTotal = 0;

    for (let idx = 0; idx < itens.length; idx++) {
      const item = itens[idx];
      const sequencia = idx + 1;
      const produtoId = Number(item.produtoId);
      const precoNum = Number(item.preco) || 0;
      const incluirTitular = !!item.incluirTitular;
      const beneficiarios = Array.isArray(item.beneficiarios) ? item.beneficiarios : [];
      const quantidade = (incluirTitular ? 1 : 0) + beneficiarios.length;

      if (!produtoId) {
        throw new Error(`Item ${sequencia}: produtoId inválido.`);
      }
      // Item sem pessoas vinculadas gera mismatch garantido no Fechamento (quantidade do item
      // != pessoas vinculadas). Aborta a transação com erro claro.
      if (quantidade < 1) {
        throw new Error(`Item ${sequencia} (produto ${produtoId}) sem pessoas vinculadas (titular ou beneficiário).`);
      }
      if (incluirTitular && !contratanteId) {
        throw new Error(`Item ${sequencia}: contratante (pessoa_id) não encontrado para o pedido ${pedidoInternalId}; não foi possível vincular o titular.`);
      }

      const valorItem = precoNum * quantidade;
      valorTotal += valorItem;

      // Descrição e tipo do produto. O Fechamento do ERP (apresentarValoresOrcamento) percorre
      // os itens e desreferencia itens_pedidos.tipo_produto_id ao apresentar/calcular os valores;
      // se ficar NULL a procedure estoura "Objeto nulo" (NPE) na tela de Fechamento. Os orçamentos
      // criados pelo ERP gravam ambos os campos. Buscamos os valores do cadastro do produto e os
      // gravamos no item para reproduzir o estado esperado pela tela.
      const prodRes = await client.query(
        `SELECT descricao, tipo_produto_id FROM produtos WHERE id = $1`,
        [produtoId]
      );
      // Falha explícita: sem produto ou sem tipo_produto_id, o Fechamento do ERP voltaria a
      // estourar NPE em apresentarValoresOrcamento. Melhor abortar a transação com erro claro
      // do que gravar um item que trava a tela depois.
      if (prodRes.rows.length === 0) {
        throw new Error(`Item ${sequencia}: produto ${produtoId} não encontrado no cadastro do ERP (produtos).`);
      }
      if (prodRes.rows[0].tipo_produto_id == null) {
        throw new Error(`Item ${sequencia}: produto ${produtoId} sem tipo_produto_id no cadastro do ERP; o Fechamento estouraria NPE.`);
      }
      const produtoDescricao = prodRes.rows[0].descricao ?? null;
      const produtoTipoId = Number(prodRes.rows[0].tipo_produto_id);

      // INSERT itens_pedidos. Casts explícitos necessários: preco/preco_lista = double precision,
      // valor_unitario_item/valor_total_item = numeric; colunas de quantidade = numeric.
      const itemRes = await client.query(
        `INSERT INTO itens_pedidos (
           id, pedido_id, sequencia, sub_item, produto_id,
           quantidade, preco, situacao, indice,
           preco_lista, valor_unitario_item, valor_total_item,
           quantidade_pendente, quantidade_temporaria, quantidade_temporaria_faturar,
           quantidade_carregar, quantidade_cancelada, quantidade_faturar,
           quantidade_faturada, qtde_cancelada_faturamento, comissao_item,
           quantidade_acima_pedido, atualizar_consumo,
           descricao, tipo_produto_id
         ) VALUES (
           nextval('pk_sequence'), $1, $2::integer, 1, $3,
           $4::numeric, $5::double precision, 'P', $2::integer,
           $5::double precision, $5::numeric, $6::numeric,
           $4::numeric, $4::numeric, $4::numeric,
           $4::numeric, 0, $4::numeric,
           0, 0, 0,
           0, 'S',
           $7, $8
         ) RETURNING id`,
        [pedidoInternalId, sequencia, produtoId, quantidade, precoNum, valorItem, produtoDescricao, produtoTipoId]
      );
      const itemId = Number(itemRes.rows[0].id);
      itemIds.push(itemId);
      console.log(`[erpDbService] itens_pedidos inserido id=${itemId} pedido=${pedidoInternalId} produto=${produtoId} qtd=${quantidade} preco=${precoNum} total=${valorItem}`);

      // Vincula as pessoas do item: titular (se marcado) + cada beneficiário. A sequencia em
      // pedidos_pessoas_produtos é incremental por item. linkedInItem evita vincular a MESMA
      // pessoa duas vezes ao mesmo item (ex.: titular incluído e também como beneficiário com o
      // mesmo CPF) — o que quebraria a regra do Fechamento (pessoas vinculadas == quantidade).
      let pessoaSeq = 1;
      const linkedInItem = new Set();

      if (incluirTitular) {
        await client.query(
          `INSERT INTO pedidos_pessoas_produtos (
             id, pedido_id, item_pedido_id, sequencia, titular_id, aprovado
           ) VALUES (
             nextval('pk_sequence'), $1, $2, $3, $4, 'N'
           )`,
          [pedidoInternalId, itemId, pessoaSeq, contratanteId]
        );
        console.log(`[erpDbService] pedidos_pessoas_produtos titular vinculado item=${itemId} titular=${contratanteId}`);
        linkedInItem.add(contratanteId);
        pessoaSeq++;
      }

      for (const b of beneficiarios) {
        const benefCpf = onlyDigits(b.cpf);
        let pessoaId;
        if (benefCpf && cpfToPessoaId.has(benefCpf)) {
          // CPF já cadastrado neste pedido (ex.: condutor == titular). Reaproveita a pessoa
          // existente para não duplicar CPF (o ERP bloqueia e faz rollback do pedido inteiro).
          pessoaId = cpfToPessoaId.get(benefCpf);
          console.log(`[erpDbService] beneficiário CPF já existente no pedido — reaproveitando pessoa=${pessoaId} (item=${itemId}, nome=${b.nome})`);
        } else {
          // Dependentes resolvidos para uma Pessoa global do ERP (lookup/criação prévia na rota)
          // gravam pessoa_id, fazendo o beneficiário "existir em Pessoas" e vincular-se ao pedido
          // como o titular. Demais beneficiários (sem CPF, condutor/veículo/pet) seguem com NULL.
          const benefPessoaId = b.pessoaId ? Number(b.pessoaId) : null;
          const pessoaRes = await client.query(
            `INSERT INTO pedidos_pessoas (
               id, pedido_id, nome_pessoa, cpf, data_nascimento, sexo, telefone, parentesco, pessoa_id
             ) VALUES (
               nextval('pk_sequence'), $1, $2, $3, $4, $5, $6, $7, $8
             ) RETURNING id`,
            [
              pedidoInternalId,
              b.nome || null,
              b.cpf || null,
              b.dataNascimento || contratanteNascimento || null,
              b.sexo || contratanteSexo || null,
              b.telefone || contratanteTelefone || null,
              b.parentesco || null,
              benefPessoaId,
            ]
          );
          pessoaId = Number(pessoaRes.rows[0].id);
          pessoaIds.push(pessoaId);
          if (benefCpf) cpfToPessoaId.set(benefCpf, pessoaId);
          console.log(`[erpDbService] pedidos_pessoas inserido id=${pessoaId} nome=${b.nome} parentesco=${b.parentesco}`);
        }

        if (linkedInItem.has(pessoaId)) {
          // Mesma pessoa já vinculada a este item (ex.: titular incluído + beneficiário com o
          // mesmo CPF). Não duplica o vínculo; a quantidade do item é corrigida abaixo.
          console.log(`[erpDbService] pessoa=${pessoaId} já vinculada ao item=${itemId} — vínculo duplicado ignorado`);
          continue;
        }

        await client.query(
          `INSERT INTO pedidos_pessoas_produtos (
             id, pedido_id, item_pedido_id, sequencia, titular_id, aprovado
           ) VALUES (
             nextval('pk_sequence'), $1, $2, $3, $4, 'N'
           )`,
          [pedidoInternalId, itemId, pessoaSeq, pessoaId]
        );
        console.log(`[erpDbService] pedidos_pessoas_produtos inserido pedido=${pedidoInternalId} item=${itemId} pessoa=${pessoaId}`);
        linkedInItem.add(pessoaId);
        pessoaSeq++;
      }

      // Se houve deduplicação de pessoas dentro do item, a quantidade real de vínculos é menor
      // que a calculada. Corrige itens_pedidos para manter a regra do Fechamento
      // (pessoas vinculadas == quantidade) e ajusta o valor do item e o total do pedido.
      const realQty = linkedInItem.size;
      if (realQty !== quantidade) {
        const novoValorItem = precoNum * realQty;
        valorTotal += novoValorItem - valorItem;
        await client.query(
          `UPDATE itens_pedidos SET
             quantidade = $1::numeric,
             quantidade_pendente = $1::numeric,
             quantidade_temporaria = $1::numeric,
             quantidade_temporaria_faturar = $1::numeric,
             quantidade_carregar = $1::numeric,
             quantidade_faturar = $1::numeric,
             valor_total_item = $2::numeric
           WHERE id = $3`,
          [realQty, novoValorItem, itemId]
        );
        console.log(`[erpDbService] item=${itemId} quantidade ajustada de ${quantidade} para ${realQty} (dedup de pessoas); novo total=${novoValorItem}`);
      }
    }

    // UPDATE pedidos.valor_total e valor_mercadorias = soma dos itens
    await client.query(
      `UPDATE pedidos SET valor_total = $1, valor_mercadorias = $1 WHERE id = $2`,
      [valorTotal, pedidoInternalId]
    );
    console.log(`[erpDbService] pedidos valor_total atualizado para ${valorTotal} (id=${pedidoInternalId})`);

    await client.query('COMMIT');
    return { itemIds, pessoaIds, valorTotal };
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

// Tipos de endereço/contato do ERP (todos vivem na tabela `enderecos`,
// diferenciados por tipo_endereco_id).
const TIPO_CELULAR = 565;
const TIPO_EMAIL = 566;
const TIPO_TELEFONE_COMERCIAL = 573;
const TIPO_TELEFONE_RESIDENCIAL = 574;
const TIPO_ENDERECO_RESIDENCIAL = 577;

/**
 * Detecta o tipo de telefone a partir dos dígitos:
 *   - 11 dígitos com o "9" após o DDD  → Celular (565)
 *   - caso contrário                    → Telefone residencial (574)
 */
function detectTipoTelefone(digits) {
  if (digits && digits.length === 11 && digits[2] === '9') return TIPO_CELULAR;
  return TIPO_TELEFONE_RESIDENCIAL;
}

const onlyDigits = (v) => (v ? String(v).replace(/\D/g, '') : '');

/**
 * Garante que o cliente (contratante) tenha, na tabela `enderecos` do ERP, os
 * registros corretos que a API REST OrcamentoSgprcUsuario NÃO cria/cria errado
 * para clientes novos:
 *   - Endereço físico (tipo 577) a partir dos campos un_*.
 *   - Telefone principal reclassificado (a API grava como "Telefone comercial"
 *     573; aqui passa para Celular 565 ou Residencial 574, auto-detectado).
 *   - Celular adicional (565) e E-mail (566), quando informados.
 *
 * Idempotente e seguro para clientes já existentes: só preenche o que falta e
 * não duplica registros já presentes.
 *
 * @param {number} pedidoInternalId  - pedidos.id
 * @param {object} data
 *   @param {string|null} [data.telefone]
 *   @param {string|null} [data.celular]
 *   @param {string|null} [data.emailContato]
 *   @param {string|null} [data.codigoPostal]
 *   @param {string|null} [data.logradouro]
 *   @param {string|null} [data.numero]
 *   @param {string|null} [data.complemento]
 *   @param {string|null} [data.bairro]
 *   @param {string|null} [data.cidade]        - "CIDADE - UF" (igual a cidades.cidade)
 */
export async function ensureContatosEnderecoDB(pedidoInternalId, data = {}) {
  const db = getPool();
  const {
    telefone = null,
    celular = null,
    emailContato = null,
    codigoPostal = null,
    logradouro = null,
    numero = null,
    complemento = null,
    bairro = null,
    cidade = null,
  } = data;

  const result = { enderecoCriado: false, telefoneReclassificado: false, celularCriado: false, emailCriado: false };

  try {
    // 1. Localiza o pessoa_id do contratante
    const ppRes = await db.query(
      `SELECT pessoa_id FROM pedidos_pessoas WHERE pedido_id = $1 AND pessoa_id IS NOT NULL LIMIT 1`,
      [pedidoInternalId]
    );
    const pessoaId = ppRes.rows[0]?.pessoa_id ? Number(ppRes.rows[0].pessoa_id) : null;
    if (!pessoaId) {
      console.warn(`[erpDbService] ensureContatosEndereco: contratante não encontrado (pedido=${pedidoInternalId})`);
      return result;
    }
    console.log(`[erpDbService] ensureContatosEndereco pedido=${pedidoInternalId} pessoa_id=${pessoaId}`);

    // 2. Endereço físico residencial (577) — só cria se ainda não houver nenhum
    if (logradouro) {
      const exists577 = await db.query(
        `SELECT 1 FROM enderecos WHERE pessoa_id = $1 AND tipo_endereco_id = $2 AND ativo = 'S' LIMIT 1`,
        [pessoaId, TIPO_ENDERECO_RESIDENCIAL]
      );
      if (exists577.rows.length === 0) {
        // Resolve cidade_id pelo nome ("CIDADE - UF" === cidades.cidade)
        let cidadeId = null;
        if (cidade) {
          const cidRes = await db.query(
            `SELECT id FROM cidades WHERE upper(cidade) = upper($1) LIMIT 1`,
            [cidade]
          );
          if (cidRes.rows.length > 0) cidadeId = Number(cidRes.rows[0].id);
          else console.warn(`[erpDbService] ensureContatosEndereco: cidade não encontrada "${cidade}" (endereço gravado sem cidade_id)`);
        }
        const cepDigits = onlyDigits(codigoPostal);
        const cepFmt = cepDigits.length === 8 ? `${cepDigits.slice(0, 5)}-${cepDigits.slice(5)}` : (cepDigits || null);
        await db.query(
          `INSERT INTO enderecos (id, pessoa_id, sequencia, tipo_endereco_id, endereco, numero, complemento, codigo_postal, bairro, cidade_id, ativo, desconsiderar_inscricao_estadual)
           VALUES (nextval('pk_sequence'), $1, 1, $2, $3, $4, $5, $6, $7, $8, 'S', 'N')`,
          [pessoaId, TIPO_ENDERECO_RESIDENCIAL, logradouro, numero || null, complemento || null, cepFmt, bairro || null, cidadeId]
        );
        result.enderecoCriado = true;
        console.log(`[erpDbService] ensureContatosEndereco: endereço físico (577) criado | cidade_id=${cidadeId} cep=${cepFmt}`);
      }
    }

    // 3. Telefone principal — a API REST grava como comercial (573). Objetivo:
    //    garantir exatamente UM registro ativo do número, no tipo correto (565/574),
    //    sem duplicar e sem mexer em tipos legítimos (565/574 já existentes).
    //    Só o tipo comercial (573) — que é o que a API gera errado — é convertido.
    const telDigits = onlyDigits(telefone);
    if (telDigits) {
      const tipoTel = detectTipoTelefone(telDigits);
      const matchRes = await db.query(
        `SELECT id, tipo_endereco_id FROM enderecos
          WHERE pessoa_id = $1 AND ativo = 'S'
            AND tipo_endereco_id IN ($2, $3, $4)
            AND regexp_replace(endereco, '\\D', '', 'g') = $5
          ORDER BY id`,
        [pessoaId, TIPO_CELULAR, TIPO_TELEFONE_COMERCIAL, TIPO_TELEFONE_RESIDENCIAL, telDigits]
      );
      const rows = matchRes.rows.map((r) => ({ id: Number(r.id), tipo: Number(r.tipo_endereco_id) }));
      const hasTarget = rows.some((r) => r.tipo === tipoTel);
      const comerciais = rows.filter((r) => r.tipo === TIPO_TELEFONE_COMERCIAL);

      if (rows.length === 0) {
        // Não existe nenhum registro com esse número → cria no tipo detectado.
        await db.query(
          `INSERT INTO enderecos (id, pessoa_id, sequencia, tipo_endereco_id, endereco, ativo, desconsiderar_inscricao_estadual)
           VALUES (nextval('pk_sequence'), $1, 1, $2, $3, 'S', 'N')`,
          [pessoaId, tipoTel, telDigits]
        );
        result.telefoneReclassificado = true;
        console.log(`[erpDbService] ensureContatosEndereco: telefone ${telDigits} criado (tipo ${tipoTel})`);
      } else if (hasTarget) {
        // Já existe no tipo correto → desativa duplicatas comerciais (573) redundantes
        // do mesmo número geradas pela API, sem tocar em registros legítimos.
        if (comerciais.length > 0) {
          await db.query(`UPDATE enderecos SET ativo = 'N' WHERE id = ANY($1)`, [comerciais.map((r) => r.id)]);
          result.telefoneReclassificado = true;
          console.log(`[erpDbService] ensureContatosEndereco: ${comerciais.length} registro(s) comercial(is) redundante(s) do telefone ${telDigits} desativado(s)`);
        }
      } else if (comerciais.length > 0) {
        // Existem apenas registros comerciais (573) — converte UM para o tipo correto
        // e desativa os demais comerciais duplicados do mesmo número.
        const [keep, ...extras] = comerciais;
        await db.query(`UPDATE enderecos SET tipo_endereco_id = $1 WHERE id = $2`, [tipoTel, keep.id]);
        if (extras.length > 0) {
          await db.query(`UPDATE enderecos SET ativo = 'N' WHERE id = ANY($1)`, [extras.map((r) => r.id)]);
        }
        result.telefoneReclassificado = true;
        console.log(`[erpDbService] ensureContatosEndereco: telefone ${telDigits} reclassificado 573→${tipoTel}${extras.length ? ` (+${extras.length} dup desativada(s))` : ''}`);
      }
      // Demais casos: o número já existe em outro tipo legítimo (565/574 diferente do
      // detectado) → não duplica nem altera o tipo escolhido pelo ERP/operador.
    }

    // 4. Celular adicional (565) — só se for um número diferente do telefone e não existir
    const celDigits = onlyDigits(celular);
    if (celDigits && celDigits !== telDigits) {
      const existsCel = await db.query(
        `SELECT 1 FROM enderecos
          WHERE pessoa_id = $1 AND tipo_endereco_id = $2 AND ativo = 'S'
            AND regexp_replace(endereco, '\\D', '', 'g') = $3 LIMIT 1`,
        [pessoaId, TIPO_CELULAR, celDigits]
      );
      if (existsCel.rows.length === 0) {
        await db.query(
          `INSERT INTO enderecos (id, pessoa_id, sequencia, tipo_endereco_id, endereco, ativo, desconsiderar_inscricao_estadual)
           VALUES (nextval('pk_sequence'), $1, 1, $2, $3, 'S', 'N')`,
          [pessoaId, TIPO_CELULAR, celDigits]
        );
        result.celularCriado = true;
        console.log(`[erpDbService] ensureContatosEndereco: celular ${celDigits} criado (tipo ${TIPO_CELULAR})`);
      }
    }

    // 5. E-mail (566) — só se informado e ainda não existir
    if (emailContato) {
      const existsEmail = await db.query(
        `SELECT 1 FROM enderecos
          WHERE pessoa_id = $1 AND tipo_endereco_id = $2 AND ativo = 'S'
            AND upper(endereco) = upper($3) LIMIT 1`,
        [pessoaId, TIPO_EMAIL, emailContato]
      );
      if (existsEmail.rows.length === 0) {
        await db.query(
          `INSERT INTO enderecos (id, pessoa_id, sequencia, tipo_endereco_id, endereco, ativo, desconsiderar_inscricao_estadual)
           VALUES (nextval('pk_sequence'), $1, 1, $2, $3, 'S', 'N')`,
          [pessoaId, TIPO_EMAIL, emailContato]
        );
        result.emailCriado = true;
        console.log(`[erpDbService] ensureContatosEndereco: e-mail criado (tipo ${TIPO_EMAIL})`);
      }
    }

    return result;
  } catch (err) {
    console.error('[erpDbService] ensureContatosEnderecoDB erro (não crítico):', err.message);
    return result;
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
      `SELECT id, situacao, valor_total, cliente_id FROM pedidos WHERE id = $1 FOR UPDATE`,
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

    // DATA DE ADMISSÃO (obrigatória para o Fechamento). O ERP tem uma trigger em "pedidos"
    // que bloqueia a transição M→'I' se o contratante (pedidos.cliente_id) não possuir um
    // documento de admissão (documentos_pessoas com tipo_documento_id=2657422). Clientes novos
    // não têm esse registro. Inserimos a data de HOJE (formato DD/MM/YYYY; a trigger de
    // documentos_pessoas exige data não futura e no máximo 20 dias atrás, então "hoje" é válido).
    // Idempotente: clientes que já têm a data de admissão não são alterados.
    const clienteId = pedido.cliente_id != null ? Number(pedido.cliente_id) : null;
    if (clienteId) {
      // INSERT ... WHERE NOT EXISTS em statement único: idempotente e seguro sob concorrência
      // (não cria duplicata se outra transação já tiver inserido a admissão deste cliente).
      const admIns = await client.query(
        `INSERT INTO documentos_pessoas (id, pessoa_id, tipo_documento_id, documento, pesquisa)
         SELECT nextval('pk_sequence'), $1, 2657422,
                to_char(CURRENT_DATE, 'DD/MM/YYYY'), to_char(CURRENT_DATE, 'DDMMYYYY')
         WHERE NOT EXISTS (
           SELECT 1 FROM documentos_pessoas
           WHERE tipo_documento_id = 2657422 AND pessoa_id = $1
         )`,
        [clienteId]
      );
      if (admIns.rowCount > 0) {
        console.log(`[erpDbService] data de admissão (hoje) inserida para cliente novo pessoa_id=${clienteId} pedido=${pedidoInternalId}`);
      }
    } else {
      console.warn(`[erpDbService] pedido=${pedidoInternalId} sem cliente_id; não foi possível garantir a data de admissão antes do fechamento.`);
    }

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

    // 1. Pagamento — modos_pagamentos usa o MESMO id do pedido (padrão do ERP).
    //    DEVE vir ANTES do UPDATE em pedidos: pedidos.modo_pagamento_id tem FK
    //    (fk_pedi_modpag_modo_pagamento) para modos_pagamentos.id, então a linha
    //    de pagamento precisa existir antes de o pedido apontar para ela.
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

    // 2. Fechamento (M → I) + campos derivados/fiscais que o ERP preenche nessa etapa.
    //    valor_desconto e data_emissao: a tela de Fechamento (apresentarValoresOrcamento)
    //    desreferencia valor_desconto ao apresentar/calcular os valores; se ficar NULL
    //    estoura NPE. Os orçamentos do ERP têm valor_desconto sempre preenchido (0.00 quando
    //    não há desconto) e data_emissao preenchida. Garantimos ambos no fechamento via COALESCE
    //    (não sobrescreve um desconto/data já existentes).
    await client.query(
      `UPDATE pedidos SET
         situacao = 'I',
         prazo_pagamento_id = $2,
         modo_pagamento_id = $1,
         numero_parcelas = COALESCE($3, numero_parcelas),
         valor_total_pedido = $4::numeric,
         valor_saldo = $4::double precision,
         valor_desconto = COALESCE(valor_desconto, 0),
         data_emissao = COALESCE(data_emissao, CURRENT_DATE),
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

/**
 * Cancela um orçamento (pedido) no ERP, espelhando fielmente o que a tela web grava num
 * cancelamento (verificado em pedidos reais cancelados). Operação transacional, com
 * SELECT ... FOR UPDATE, trava de estado e idempotência:
 *   - se o pedido já está em situação 'C' (cancelado) -> não faz nada (idempotente);
 *   - só cancela orçamentos ainda em análise (situação 'I'); qualquer outra situação é pulada.
 *
 * Campos gravados em `pedidos` (espelhando o cancelamento real):
 *   situacao='C', situacao_financeiro='L', data_cancelamento=CURRENT_DATE,
 *   motivo_cancelamento=<texto>, motivo_cancelamento_ou_perda_id=<motivoId>,
 *   valor_cancelamentos=valor_total, data_alteracao=NOW(), usuario_alteracao_id=<autor>.
 * `responsavel_pelo_cancelamento` é deixado como está (nos cancelamentos reais vem nulo).
 *
 * @param {number} pedidoInternalId  - id interno do pedido no ERP (pedidos.id)
 * @param {object} opts
 * @param {number} opts.usuarioAlteracaoId - erp_agent_id do autor (auditor que solicitou o ajuste)
 * @param {number} opts.motivoId           - id em pedidos_motivos_cancelamentos
 * @param {string} opts.motivoTexto        - observação do cancelamento
 * @returns {Promise<{status:string, situacao?:string, valorCancelado?:number, pedidoId:number}>}
 *   status: 'cancelled' | 'already_cancelled' | 'invalid_state' | 'not_found'
 */
export async function cancelOrcamentoDB(pedidoInternalId, opts = {}) {
  const erpUserId = Number(opts.usuarioAlteracaoId);
  const motivo = Number(opts.motivoId);
  const texto = String(opts.motivoTexto || '').trim();
  if (!erpUserId || Number.isNaN(erpUserId)) {
    throw new Error('cancelOrcamentoDB: usuário ERP (autor do cancelamento) obrigatório.');
  }
  if (!motivo || Number.isNaN(motivo)) {
    throw new Error('cancelOrcamentoDB: motivo de cancelamento obrigatório.');
  }
  if (!texto) {
    throw new Error('cancelOrcamentoDB: texto do motivo de cancelamento obrigatório.');
  }

  const db = getPool();
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const pedRes = await client.query(
      `SELECT id, situacao, valor_total FROM pedidos WHERE id = $1 FOR UPDATE`,
      [pedidoInternalId]
    );
    if (pedRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return { status: 'not_found', pedidoId: Number(pedidoInternalId) };
    }
    const pedido = pedRes.rows[0];

    // Idempotência: já cancelado -> não reescreve nada.
    if (pedido.situacao === 'C') {
      await client.query('ROLLBACK');
      return { status: 'already_cancelled', situacao: 'C', pedidoId: Number(pedidoInternalId) };
    }
    // Trava de estado: só cancela orçamentos ainda em análise ('I').
    if (pedido.situacao !== 'I') {
      await client.query('ROLLBACK');
      return { status: 'invalid_state', situacao: pedido.situacao, pedidoId: Number(pedidoInternalId) };
    }

    const valorTotal = Number(pedido.valor_total) || 0;
    await client.query(
      `UPDATE pedidos SET
         situacao = 'C',
         situacao_financeiro = 'L',
         data_cancelamento = CURRENT_DATE,
         motivo_cancelamento = $2,
         motivo_cancelamento_ou_perda_id = $3,
         valor_cancelamentos = $4::numeric,
         data_alteracao = NOW(),
         usuario_alteracao_id = $5
       WHERE id = $1 AND situacao = 'I'`,
      [pedidoInternalId, texto, motivo, valorTotal, erpUserId]
    );

    await client.query('COMMIT');
    console.log(`[erpDbService] cancelOrcamentoDB OK pedido=${pedidoInternalId} situacao=C valor=${valorTotal} autor=${erpUserId} motivo=${motivo}`);
    return { status: 'cancelled', situacao: 'C', valorCancelado: valorTotal, pedidoId: Number(pedidoInternalId) };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[erpDbService] cancelOrcamentoDB ROLLBACK:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Busca logins e nomes de usuários ERP a partir de uma lista de IDs (agents.erp_agent_id).
 * Retorna um mapa { [id]: { login, nome } }.
 * Usado para popular o seletor de vendedores no relatório de orçamentos.
 *
 * @param {number[]} usuarioIds
 * @returns {Promise<Record<number, { login: string, nome: string }>>}
 */
export async function getErpLoginsByIds(usuarioIds) {
  if (!Array.isArray(usuarioIds) || usuarioIds.length === 0) return {};
  const db = getPool();
  const ids = usuarioIds.map(Number).filter(n => !isNaN(n));
  if (ids.length === 0) return {};
  const res = await db.query(
    `SELECT id, login, nome_completo FROM usuarios WHERE id = ANY($1::bigint[]) AND login IS NOT NULL`,
    [ids]
  );
  const map = {};
  for (const row of res.rows) {
    map[Number(row.id)] = { login: row.login, nome: row.nome_completo || row.login };
  }
  return map;
}

/**
 * Retorna a lista paginada de orçamentos do ERP (tabela pedidos) com dados do titular,
 * vendedor e canal de vendas. Filtros opcionais: logins (array de usuario_inclusao),
 * startDate/endDate, situacao, canalId.
 *
 * @param {object} params
 * @param {string[]|null} params.logins  - null = sem filtro (admin vê tudo); [] = nenhum acesso
 * @param {string|null}   params.startDate
 * @param {string|null}   params.endDate
 * @param {string|null}   params.situacao  - 'M', 'I', 'C', etc.
 * @param {number|null}   params.canalId
 * @param {number}        params.limit
 * @param {number}        params.offset
 * @returns {Promise<object[]>}
 */
export async function getRelatorioOrcamentos({
  logins = null,
  pedidoIds = null,
  startDate = null,
  endDate = null,
  situacao = null,
  canalId = null,
  limit = 500,
  offset = 0,
} = {}) {
  if (Array.isArray(logins) && logins.length === 0) return [];
  if (Array.isArray(pedidoIds) && pedidoIds.length === 0) return [];

  const db = getPool();
  const params = [];
  const conditions = ['1=1'];

  // Filtro por ids internos do pedido no ERP (usado pelo relatório do Bom Flow, que
  // resolve QUAIS pedidos exibir a partir do rastreio CRM em bomflow_orcamentos).
  if (Array.isArray(pedidoIds)) {
    params.push(pedidoIds.map(Number));
    conditions.push(`p.id = ANY($${params.length})`);
  }

  if (Array.isArray(logins)) {
    params.push(logins);
    conditions.push(`p.usuario_inclusao_id IN (SELECT id FROM usuarios WHERE login = ANY($${params.length}))`);
  }
  if (startDate) {
    params.push(startDate);
    conditions.push(`p.data_inclusao >= $${params.length}::date`);
  }
  if (endDate) {
    params.push(endDate);
    conditions.push(`p.data_inclusao < ($${params.length}::date + interval '1 day')`);
  }
  if (situacao) {
    params.push(situacao);
    conditions.push(`p.situacao = $${params.length}`);
  }
  if (canalId) {
    params.push(Number(canalId));
    conditions.push(`pcv.contrato_id = $${params.length}`);
  }

  const limitParam = Math.min(Number(limit) || 500, 1000);
  const offsetParam = Number(offset) || 0;
  params.push(limitParam, offsetParam);

  const sql = `
    SELECT
      p.id                                          AS erp_id,
      p.pedido                                      AS numero_orcamento,
      p.data_inclusao                               AS data_venda,
      p.data_alteracao                              AS data_ultima_alteracao,
      p.situacao,
      u.login                                       AS login_vendedor,
      COALESCE(p.valor_total, 0)::numeric           AS valor_total,
      pp.nome_pessoa                                AS nome_titular,
      pp.cpf                                        AS cpf_titular,
      pcv.contrato_id                               AS canal_id,
      u.nome_completo                               AS nome_vendedor
    FROM pedidos p
    LEFT JOIN LATERAL (
      SELECT nome_pessoa, cpf
      FROM pedidos_pessoas
      WHERE pedido_id = p.id AND pessoa_id IS NOT NULL
      ORDER BY id
      LIMIT 1
    ) pp ON true
    LEFT JOIN pessoas_contratos pcv ON pcv.id = p.agente_venda_id
    LEFT JOIN usuarios u ON u.id = p.usuario_inclusao_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY p.data_inclusao DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `;

  const r = await db.query(sql, params);
  return r.rows;
}
