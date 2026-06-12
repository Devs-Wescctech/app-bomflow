import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { registerAgentInCanal, addItemsToPedido, finalizeOrcamentoDB, getPlanosPagamento, applyFechamentoEPagamento, ensureContatosEnderecoDB, findPessoaIdByCpf } from '../services/erpDbService.js';
import { query } from '../config/database.js';

const router = express.Router();

const ERP_BASE = 'http://erp.wescctech.com.br:8080/BOMPASTOR/api';

const ERP_ESTABELECIMENTO_PADRAO = process.env.ERP_ESTABELECIMENTO_PADRAO || 104;
const ERP_SENHA_PADRAO           = process.env.ERP_SENHA_PADRAO;
const ERP_COPIAR_DIREITOS_DE     = process.env.ERP_COPIAR_DIREITOS_DE || 'base.upsell';
const ERP_MENU_PADRAO            = process.env.ERP_MENU_PADRAO || 'MENU_VENDEDOR_PAP';

function getToken(res) {
  const token = process.env.ERP_AUTH_TOKEN;
  if (!token) {
    res.status(500).json({ error: 'ERP_AUTH_TOKEN não configurado.' });
    return null;
  }
  return token;
}

// Deriva o login ERP a partir do e-mail do agente logado.
// Padrão: user.{local}.{domínio_sem_tld}
// Ex: teste3@bomflow.com → user.teste3.bomflow
function erpLoginFromEmail(email) {
  if (!email) return undefined;
  const atIdx = email.indexOf('@');
  if (atIdx < 0) return undefined;
  const local = email.slice(0, atIdx).toLowerCase().trim();
  const domain = email.slice(atIdx + 1);
  const domainPart = domain.replace(/\.[^.]+$/, '').toLowerCase().trim();
  if (!local || !domainPart) return undefined;
  return `user.${local}.${domainPart}`;
}

// Normaliza um CPF para o formato que o ERP usa/exige (000.000.000-00).
// A view API_CADASTRO_PESSOAS só encontra a pessoa com o CPF formatado
// (com dígitos puros retorna 0), então padronizamos aqui.
function formatCpf(cpf) {
  const digits = String(cpf ?? '').replace(/\D/g, '');
  if (digits.length !== 11) return String(cpf ?? '');
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

// Cria uma Pessoa Física no ERP (cadastro global) via POST /Pessoas e devolve o objeto
// retornado, que inclui `id` (PK numérica de pessoas, ~300M) e `pessoa` (código). O CPF
// vai dentro de `documentos` (não como campo raiz, senão o ERP ignora). Mesma forma já
// usada com sucesso na criação de agentes (Agents.jsx).
async function criarPessoaErp(token, { nome_completo, cpf, data_nascimento }) {
  const body = {
    tipo_pessoa: 'Física',
    situacao: 'A',
    nome_completo: String(nome_completo || '').toUpperCase(),
    documentos: [{ tipo_documento: 'CPF', documento: formatCpf(cpf) }],
  };
  // Data de nascimento no formato 'YYYY-MM-DD' (mesmo que a coluna pessoas.data_nascimento
  // e o input type=date do frontend). Sem isso a Pessoa global fica com nascimento em branco.
  if (data_nascimento) {
    body.data_nascimento = String(data_nascimento).slice(0, 10);
  }
  const r = await fetch(`${ERP_BASE}/Pessoas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data?.error) {
    throw new Error(data?.error || `POST /Pessoas falhou (HTTP ${r.status}).`);
  }
  return data;
}

// Resolve cada beneficiário de produto DEPENDENTE (registrarPessoa=true) para uma Pessoa
// global do ERP, anexando `pessoaId` ao objeto. Lookup-first por CPF (reaproveita Pessoa
// existente — o ERP bloqueia CPF duplicado); cria via POST /Pessoas só quando não existe.
// Roda FORA da transação de banco (são chamadas HTTP). Beneficiários sem registrarPessoa
// ou sem CPF válido seguem como hoje (sem pessoa_id). Falha clara aborta antes do DB para
// não criar um orçamento incompleto.
async function resolveDependentePessoas(token, itens) {
  for (const it of itens) {
    const beneficiarios = Array.isArray(it.beneficiarios) ? it.beneficiarios : [];
    for (const b of beneficiarios) {
      if (!b?.registrarPessoa) continue;
      const cpfDigits = String(b.cpf ?? '').replace(/\D/g, '');
      if (cpfDigits.length !== 11) continue; // sem CPF válido → segue como hoje (só no pedido)
      let pessoaId = await findPessoaIdByCpf(cpfDigits);
      if (pessoaId) {
        console.log(`[ERP /orcamento] dependente CPF já cadastrado — reaproveitando Pessoa id=${pessoaId} (nome=${b.nome})`);
      } else {
        const criada = await criarPessoaErp(token, { nome_completo: b.nome, cpf: cpfDigits, data_nascimento: b.dataNascimento });
        pessoaId = criada?.id ? Number(criada.id) : null;
        if (!pessoaId) {
          throw new Error(`Não foi possível cadastrar o dependente "${b.nome}" como Pessoa no ERP (resposta sem id).`);
        }
        console.log(`[ERP /orcamento] dependente cadastrado como Pessoa id=${pessoaId} código=${criada.pessoa} (nome=${b.nome})`);
      }
      b.pessoaId = pessoaId;
    }
  }
}

// Busca um usuário do ERP pelo login (usado para recuperar o registro mesmo
// quando o POST retorna o NPE de salvarFuncoesUsuario, pois o usuário acaba
// sendo criado mesmo assim).
async function fetchUsuarioByLogin(token, login) {
  try {
    const r = await fetch(`${ERP_BASE}/Usuarios?login=${encodeURIComponent(login)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!r.ok) return null;
    const d = await r.json().catch(() => null);
    const arr = d?.results || d?.data || (Array.isArray(d) ? d : null);
    if (!Array.isArray(arr)) return null;
    const wanted = (login || '').toLowerCase().trim();
    // Garante correspondência EXATA do login (o filtro do ERP pode ser parcial).
    return arr.find(u => (u.login || '').toLowerCase().trim() === wanted) || null;
  } catch {
    return null;
  }
}

// GET /api/erp/pessoa?cpf=XXX
// Busca pessoa no ERP pelo CPF via API_CADASTRO_PESSOAS
router.get('/pessoa', authMiddleware, async (req, res) => {
  const token = getToken(res);
  if (!token) return;

  const { cpf } = req.query;
  if (!cpf) return res.status(400).json({ error: 'CPF obrigatório.' });

  try {
    // A view API_CADASTRO_PESSOAS exige o CPF formatado (000.000.000-00);
    // com dígitos puros ela retorna 0. Normaliza para não depender do frontend.
    const cpfFormatado = formatCpf(cpf);
    const url = `${ERP_BASE}/API_CADASTRO_PESSOAS?cpf=${encodeURIComponent(cpfFormatado)}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json(data);

    console.log('[ERP GET /pessoa] CPF buscado:', cpf);
    console.log('[ERP GET /pessoa] status HTTP:', response.status);
    console.log('ERP GET /Pessoas retorno completo:', JSON.stringify(data, null, 2));
    const results = data?.results || data?.data || (Array.isArray(data) ? data : null);
    const pessoa = results?.[0] ?? null;
    console.log('[ERP GET /pessoa] results.length:', results?.length ?? 'null');
    console.log('[ERP GET /pessoa] campos retornados:', pessoa ? Object.keys(pessoa) : 'null');
    console.log('[ERP GET /pessoa] valores-chave:', pessoa ? { id: pessoa.id, pessoa: pessoa.pessoa, contrato: pessoa.contrato, nome_titular: pessoa.nome_titular } : null);
    return res.json({ pessoa });
  } catch (err) {
    console.error('[ERP Proxy] GET /pessoa error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/erp/pessoa
// Cria uma Pessoa Física no ERP
// body: { tipo_pessoa, nome_completo, cpf, situacao, email? }
router.post('/pessoa', authMiddleware, async (req, res) => {
  const token = getToken(res);
  if (!token) return;

  try {
    // Remove campo auxiliar 'email' — não vai pro ERP.
    // O CPF NÃO é um campo raiz no objeto /Pessoas do ERP: ele faz parte do
    // array `documentos` (item { tipo_documento: 'CPF', documento: '000.000.000-00' }).
    // Enviar `cpf` na raiz faz o ERP gravar a pessoa mas ignorar o CPF, deixando
    // a pessoa "não encontrável" por CPF. Por isso convertemos aqui.
    const { email: _email, cpf, ...rest } = req.body;
    const body = { ...rest };

    if (cpf) {
      // O ERP armazena o CPF formatado (000.000.000-00), aceitando entrada
      // já formatada ou só com dígitos.
      const cpfFormatado = formatCpf(cpf);
      const documentos = Array.isArray(body.documentos) ? [...body.documentos] : [];
      if (!documentos.some((d) => String(d?.tipo_documento).toUpperCase() === 'CPF')) {
        documentos.push({ tipo_documento: 'CPF', documento: cpfFormatado });
      }
      body.documentos = documentos;
    }

    console.log('[ERP POST /pessoa] payload:', JSON.stringify(body));
    const url = `${ERP_BASE}/Pessoas`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(body)
    });
    const data = await response.json();
    console.log('ERP POST /Pessoas retorno completo:', JSON.stringify(data, null, 2));
    if (!response.ok || data?.error) {
      return res.status(response.ok ? 400 : response.status).json({ error: data?.error || 'Erro ao criar pessoa no ERP.' });
    }
    return res.json(data);
  } catch (err) {
    console.error('[ERP Proxy] POST /pessoa error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/erp/usuario
// Cria um Usuário no ERP vinculado a uma Pessoa, em DOIS passos:
//   1) POST /Usuarios com os campos mínimos (login, pessoa, estabelecimento_padrao
//      sempre 104, senha_prot e menu). NÃO enviar `ativo` (dispara a validação de
//      e-mail da Pessoa e bloqueia a criação) nem `copiar_direitos_de` (no POST a
//      rotina interna salvarFuncoesUsuario do ERP estoura um null pointer).
//   2) PUT /Usuarios/{id} com `copiar_direitos_de` (no PUT o ERP copia os direitos
//      do usuário-modelo sem estourar o NPE).
// IMPORTANTE: mesmo quando o POST devolve o NPE de salvarFuncoesUsuario, o ERP
// CRIA o usuário. Por isso, ao detectar esse erro específico, recuperamos o
// registro pelo login e seguimos para o passo 2.
router.post('/usuario', authMiddleware, async (req, res) => {
  const token = getToken(res);
  if (!token) return;

  try {
    const { login, pessoa } = req.body;
    const loginNorm = (login || "").toLowerCase().trim();
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    };

    // Passo 1 — cria o usuário com os campos mínimos.
    const createPayload = {
      login: loginNorm,
      pessoa,
      estabelecimento_padrao: Number(ERP_ESTABELECIMENTO_PADRAO),
      senha_prot: ERP_SENHA_PADRAO,
      menu: ERP_MENU_PADRAO,
    };
    console.log('ERP /Usuarios payload:', JSON.stringify({ ...createPayload, senha_prot: '***' }, null, 2));
    const createResp = await fetch(`${ERP_BASE}/Usuarios`, {
      method: 'POST',
      headers,
      body: JSON.stringify(createPayload)
    });
    const createData = await createResp.json().catch(() => ({}));
    const errMsg = createData?.error || '';
    console.log('[ERP POST /usuario] status HTTP:', createResp.status);
    console.log('[ERP POST /usuario] resposta ERP:', JSON.stringify(createData).substring(0, 500));

    // O NPE de salvarFuncoesUsuario NÃO impede a criação: recupera o usuário.
    const isFuncoesNpe = /salvarFuncoesUsuario/i.test(errMsg);
    let usuario = null;
    if (createResp.ok && !createData?.error) {
      usuario = createData;
    } else if (isFuncoesNpe) {
      usuario = await fetchUsuarioByLogin(token, loginNorm);
      if (!usuario) {
        return res.status(500).json({ error: errMsg || 'Falha ao criar usuário no ERP.' });
      }
      console.log('[ERP POST /usuario] NPE em salvarFuncoesUsuario ignorado; usuário criado id:', usuario.id);
    } else {
      // Erro real (login duplicado, e-mail, etc.)
      return res.status(createResp.ok ? 400 : createResp.status).json({ error: errMsg || 'Erro ao criar usuário no ERP.' });
    }

    // Garante o id do usuário (alguns retornos do POST não trazem todos os campos).
    if (!usuario?.id) {
      usuario = (await fetchUsuarioByLogin(token, loginNorm)) || usuario;
    }

    // Passo 2 — copia os direitos do usuário-modelo via PUT (não estoura o NPE).
    let direitosCopiados = false;
    if (usuario?.id && ERP_COPIAR_DIREITOS_DE) {
      try {
        const putResp = await fetch(`${ERP_BASE}/Usuarios/${usuario.id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ copiar_direitos_de: ERP_COPIAR_DIREITOS_DE })
        });
        direitosCopiados = putResp.ok;
        if (!putResp.ok) {
          const putTxt = await putResp.text();
          console.error('[ERP POST /usuario] PUT copiar_direitos_de falhou:', putResp.status, putTxt.substring(0, 300));
        } else {
          console.log('[ERP POST /usuario] direitos copiados de', ERP_COPIAR_DIREITOS_DE, 'para id', usuario.id);
        }
      } catch (e) {
        console.error('[ERP POST /usuario] erro no PUT copiar_direitos_de:', e.message);
      }
    }

    const resposta = { id: usuario?.id, login: usuario?.login || loginNorm, direitosCopiados };
    if (!direitosCopiados) {
      resposta.warning = 'Usuário criado no ERP, mas a cópia automática de direitos do modelo falhou. Verifique/ajuste as permissões manualmente no ERP.';
    }
    return res.json(resposta);
  } catch (err) {
    console.error('[ERP Proxy] POST /usuario error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/erp/registrar-canal
// Registra o agente no canal de vendas do ERP (INSERT em pessoas_contratos).
// Deve ser chamado APÓS a criação da Pessoa+Usuário no ERP, quando o id interno
// da Pessoa (pessoaId) já está disponível no frontend.
// body: { agentId, pessoaId, contratoId, grupoId }
router.post('/registrar-canal', authMiddleware, async (req, res) => {
  const { agentId, pessoaId, contratoId, grupoId } = req.body;

  if (!agentId || !pessoaId || !contratoId) {
    return res.status(400).json({ error: 'agentId, pessoaId e contratoId são obrigatórios.' });
  }

  try {
    const erpAgenteVendaId = await registerAgentInCanal(
      Number(pessoaId),
      Number(contratoId),
      grupoId ? Number(grupoId) : null
    );

    await query(
      'UPDATE agents SET erp_agente_venda_id = $1 WHERE id = $2',
      [erpAgenteVendaId, agentId]
    );

    console.log(`[ERP /registrar-canal] agente ${agentId} → erp_agente_venda_id ${erpAgenteVendaId}`);
    return res.json({ erpAgenteVendaId });
  } catch (err) {
    console.error('[ERP Proxy] POST /registrar-canal error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/erp/lookup-cpf?cpf=xxx
// Busca o código ERP de uma pessoa pelo CPF (contratante_pessoa para orçamentos).
//
// IMPORTANTE: API_CADASTRO_PESSOAS retorna `id` = ID do contrato (ex: 55569514),
// NÃO o código Pessoa do ERP. O endpoint PrePropostaUsuarioSgprc rejeita esse valor.
// A rota correta para obter o código Pessoa é GET /Pessoas?cpf=, que retorna o
// campo `pessoa` (código alfanumérico, ex: "2606501").
router.get('/lookup-cpf', authMiddleware, async (req, res) => {
  const token = getToken(res);
  if (!token) return;
  const { cpf } = req.query;
  if (!cpf) return res.status(400).json({ error: 'CPF obrigatório.' });
  try {
    const formatted = formatCpf(cpf);

    // Passo 1: busca o código Pessoa via GET /Pessoas?cpf= (retorna campo `pessoa`)
    const pessoasUrl = `${ERP_BASE}/Pessoas?cpf=${encodeURIComponent(formatted)}`;
    const pessoasR = await fetch(pessoasUrl, { headers: { Authorization: `Bearer ${token}` } });
    const pessoasData = await pessoasR.json().catch(() => ({}));
    console.log('[ERP lookup-cpf] GET /Pessoas status:', pessoasR.status);
    console.log('[ERP lookup-cpf] GET /Pessoas resposta (primeiros):', JSON.stringify(pessoasData).substring(0, 400));

    if (pessoasR.ok) {
      const results = pessoasData?.results || pessoasData?.data || (Array.isArray(pessoasData) ? pessoasData : []);
      if (results.length) {
        const p = results[0];
        // GET /Pessoas retorna o campo `pessoa` = código ERP da Pessoa (ex: "2")
        // que é o valor aceito por PrePropostaUsuarioSgprc como `contratante_pessoa`.
        // NÃO usar `id` (ex: 150) — esse é o ID interno do registro, rejeitado pelo ERP.
        const pessoaCodigo = String(p.pessoa || p.codigo || p.id || '');
        const nome = p.nome_completo || p.nome_titular || p.nome || '';
        console.log('[ERP lookup-cpf] GET /Pessoas → pessoa:', p.pessoa, '| id:', p.id, '| usando:', pessoaCodigo, '| nome:', nome);
        return res.json({ pessoa: pessoaCodigo, nome, cpf: p.cpf || formatted });
      }
    }

    // Passo 2: fallback para API_CADASTRO_PESSOAS (clientes com contrato)
    const cadastroUrl = `${ERP_BASE}/API_CADASTRO_PESSOAS?cpf=${encodeURIComponent(formatted)}`;
    const cadastroR = await fetch(cadastroUrl, { headers: { Authorization: `Bearer ${token}` } });
    const cadastroData = await cadastroR.json().catch(() => ({}));
    console.log('[ERP lookup-cpf] fallback API_CADASTRO_PESSOAS status:', cadastroR.status);

    if (!cadastroR.ok) return res.status(cadastroR.status).json(cadastroData);
    const cadastroResults = cadastroData?.results || cadastroData?.data || (Array.isArray(cadastroData) ? cadastroData : []);
    if (!cadastroResults.length) return res.status(404).json({ error: 'Pessoa não encontrada no ERP para este CPF.' });

    const p = cadastroResults[0];
    // API_CADASTRO_PESSOAS: `id` = ID do contrato. Tenta retornar `pessoa` se existir,
    // senão usa `id` como fallback (pode ser rejeitado pelo ERP em orçamentos).
    const pessoaCodigo = p.pessoa || String(p.id || '');
    console.log('[ERP lookup-cpf] fallback código:', pessoaCodigo, '| campo pessoa presente:', !!p.pessoa);
    return res.json({
      pessoa: pessoaCodigo,
      nome: p.nome_titular || p.nome_completo || '',
      cpf: p.cpf || formatted,
    });
  } catch (err) {
    console.error('[ERP Proxy] GET /lookup-cpf error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/erp/orcamento
// Cria um orçamento no ERP via POST /OrcamentoSgprcUsuario
router.post('/orcamento', authMiddleware, async (req, res) => {
  const token = getToken(res);
  if (!token) return;
  try {
    const payload = { ...req.body };

    // Injeta usuario_inclusao a partir do e-mail do agente autenticado se não vier no body.
    if (!payload.usuario_inclusao && req.user?.email) {
      const login = erpLoginFromEmail(req.user.email);
      if (login) payload.usuario_inclusao = login;
    }

    // Extrai itens (múltiplos produtos) e campos de pagamento antes de enviar ao ERP
    // (a API REST só salva o cabeçalho; produtos/pessoas são inseridos via DB)
    const {
      itens: itensRaw,
      prazo_pagamento_id: planoPagamentoId,
      quantidade_parcelas: quantidadeParcelas,
      usua_produtos,
      usua_papeis,
      ...headerPayload
    } = payload;

    // Normaliza os itens: cada item = um produto com seus beneficiários (até 15 por item).
    const itens = Array.isArray(itensRaw)
      ? itensRaw.map((it) => ({
          produtoId: Number(it.produtoId),
          preco: Number(it.preco) || 0,
          incluirTitular: !!it.incluirTitular,
          beneficiarios: Array.isArray(it.beneficiarios) ? it.beneficiarios.slice(0, 15) : [],
        }))
      : [];

    // Ao menos um item válido é obrigatório. A API REST salva apenas o cabeçalho; os produtos
    // e beneficiários são gravados via DB direto logo depois. Sem itens válidos o orçamento
    // ficaria incompleto no ERP. Valida ANTES de criar o cabeçalho para não deixar órfão.
    if (itens.length === 0) {
      return res.status(400).json({ error: 'Produto obrigatório: selecione ao menos um produto antes de enviar o orçamento.' });
    }
    const itemInvalido = itens.find((it) => !it.produtoId || Number.isNaN(it.produtoId));
    if (itemInvalido) {
      return res.status(400).json({ error: 'Há um produto inválido na seleção. Revise os produtos do orçamento.' });
    }
    // Cada item precisa de ao menos uma pessoa (titular ou beneficiário), senão o Fechamento falha.
    const itemSemPessoa = itens.find((it) => (it.incluirTitular ? 1 : 0) + it.beneficiarios.length < 1);
    if (itemSemPessoa) {
      return res.status(400).json({ error: 'Cada produto precisa de ao menos uma pessoa vinculada (titular ou beneficiário).' });
    }

    // Plano de pagamento é obrigatório: o fluxo do orçamento Upsell sempre termina com o
    // Fechamento (situação "I") + registro do pagamento. Sem um plano válido o orçamento
    // ficaria parado em "M". Valida ANTES de criar o cabeçalho para não gerar órfão no ERP.
    const planoPagamentoIdNum = Number(planoPagamentoId);
    if (!planoPagamentoIdNum || Number.isNaN(planoPagamentoIdNum)) {
      return res.status(400).json({ error: 'Plano de pagamento obrigatório: selecione um plano antes de enviar o orçamento.' });
    }

    console.log('[ERP /orcamento] payload enviado ao ERP:', JSON.stringify(headerPayload, null, 2));
    console.log(`[ERP /orcamento] itens recebidos: ${itens.length} | beneficiários totais: ${itens.reduce((a, it) => a + it.beneficiarios.length, 0)}`);
    const r = await fetch(`${ERP_BASE}/OrcamentoSgprcUsuario`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(headerPayload),
    });
    const data = await r.json().catch(() => ({}));
    console.log('[ERP /orcamento] status HTTP:', r.status);
    console.log('[ERP /orcamento] resposta ERP completa:', JSON.stringify(data, null, 2));
    if (!r.ok) return res.status(r.status).json(data);
    if (data?.block || data?.error) return res.json(data);

    // Pedido criado — agora insere produto e beneficiários via DB direto
    const pedidoInternalId = data?.id;
    const numeroPedido = data?.pedido ?? data?.numero ?? null;

    // Sem o id interno do pedido não há como vincular produto/beneficiários.
    if (!pedidoInternalId) {
      console.error('[ERP /orcamento] ERP não retornou id do pedido; produto não pôde ser vinculado:', JSON.stringify(data));
      return res.status(502).json({
        error: 'O ERP não retornou o identificador do orçamento, então o produto não pôde ser vinculado. Tente novamente.',
        erpResponse: data,
      });
    }

    // Cadastra os dependentes (produtos DEPENDENTE) como Pessoa no ERP e anexa pessoaId a
    // cada beneficiário ANTES da transação de banco (são chamadas HTTP; não podem rodar
    // dentro da transação). addItemsToPedido grava esse pessoaId em pedidos_pessoas.pessoa_id.
    try {
      await resolveDependentePessoas(token, itens);
    } catch (pessoaErr) {
      console.error('[ERP /orcamento] cadastro de dependente como Pessoa falhou:', pessoaErr.message);
      return res.status(502).json({
        error: `O orçamento nº ${numeroPedido || pedidoInternalId} foi criado no ERP, mas não foi possível cadastrar um dependente como Pessoa (${pessoaErr.message}). O orçamento está INCOMPLETO e precisa ser corrigido manualmente.`,
        erpResponse: data,
      });
    }

    let dbResult = null;
    try {
      dbResult = await addItemsToPedido(Number(pedidoInternalId), { itens });
      console.log('[ERP /orcamento] DB inserts OK:', JSON.stringify(dbResult));
    } catch (dbErr) {
      // O cabeçalho já existe no ERP, mas produto/beneficiários falharam (rollback do DB).
      // Retorna ERRO REAL (não 2xx) para que o vendedor seja notificado e o orçamento
      // incompleto não passe despercebido. NÃO alteramos o ERP automaticamente.
      console.error('[ERP /orcamento] DB insert falhou (cabeçalho salvo no ERP):', dbErr.message);
      return res.status(502).json({
        error: `O orçamento ${numeroPedido ? `nº ${numeroPedido} ` : ''}foi criado no ERP, mas o produto/beneficiários NÃO foram gravados (${dbErr.message}). O orçamento está INCOMPLETO no ERP e precisa ser corrigido manualmente.`,
        incomplete: true,
        pedido: numeroPedido,
        erpId: pedidoInternalId,
      });
    }

    // Cria/corrige os contatos e o endereço físico do contratante que a API REST
    // não grava corretamente para clientes novos (endereço some; telefone fica
    // como "comercial"). Roda antes do finalize para o endereço novo (577) ser
    // encontrado pelo CEP. Não crítico: best-effort, idempotente.
    try {
      const contatosResult = await ensureContatosEnderecoDB(Number(pedidoInternalId), {
        telefone: headerPayload.telefone ?? null,
        celular: headerPayload.celular ?? null,
        emailContato: headerPayload.email_contato ?? null,
        codigoPostal: headerPayload.un_codigo_postal ?? null,
        logradouro: headerPayload.un_lougradouro ?? null,
        numero: headerPayload.un_numero_lougradouro ?? null,
        complemento: headerPayload.un_complemento_lougradouro ?? null,
        bairro: headerPayload.un_bairro ?? null,
        cidade: headerPayload.un_cidade ?? null,
      });
      console.log('[ERP /orcamento] contatos/endereço OK:', JSON.stringify(contatosResult));
    } catch (contErr) {
      console.error('[ERP /orcamento] contatos/endereço falhou (não crítico):', contErr.message);
    }

    // Preenche campos ignorados pela API REST: endereco_id, dia_vencimento, email_contato
    const finalizeResult = await finalizeOrcamentoDB(Number(pedidoInternalId), {
      diaVencimento: headerPayload.dia_vencimento ?? null,
      emailContato: headerPayload.email_contato ?? null,
      codigoPostal: headerPayload.un_codigo_postal ?? null,
    });
    if (finalizeResult) {
      console.log('[ERP /orcamento] finalizeOrcamento OK:', JSON.stringify(finalizeResult));
    }

    // Fechamento (M → I) + registro da guia Pagamento (modos_pagamentos), replicando
    // o processo manual do ERP. Só roda se um plano de pagamento foi escolhido.
    let fechamentoResult = null;
    const planoIdNum = Number(planoPagamentoId);
    if (planoIdNum && !Number.isNaN(planoIdNum)) {
      try {
        fechamentoResult = await applyFechamentoEPagamento(Number(pedidoInternalId), {
          planoPagamentoId: planoIdNum,
          quantidadeParcelas: quantidadeParcelas ?? null,
        });
        console.log('[ERP /orcamento] fechamento+pagamento OK:', JSON.stringify(fechamentoResult));
      } catch (fechErr) {
        // O orçamento foi criado e está completo (produto/beneficiários gravados), mas o
        // Fechamento/Pagamento falhou. Retorna ERRO REAL para o vendedor não tratar como
        // sucesso — o orçamento ficou em "M" e precisa de ação manual no ERP.
        console.error('[ERP /orcamento] fechamento+pagamento falhou:', fechErr.message);
        return res.status(502).json({
          error: `O orçamento ${numeroPedido ? `nº ${numeroPedido} ` : ''}foi criado no ERP, mas o Fechamento (situação "I") e o registro do pagamento NÃO foram concluídos (${fechErr.message}). O orçamento ficou em "M" e precisa ser fechado manualmente no ERP.`,
          incomplete: true,
          pedido: numeroPedido,
          erpId: pedidoInternalId,
          dbInserted: dbResult,
        });
      }
    }

    return res.json({ ...data, numeroPedido, erpId: pedidoInternalId, dbInserted: dbResult, fechamento: fechamentoResult });
  } catch (err) {
    console.error('[ERP Proxy] POST /orcamento error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/erp/pre-proposta
// Cria uma proposta completa (header + endereço + produto + 1 beneficiário) via POST /PrePropostaUsuarioSgprc
router.post('/pre-proposta', authMiddleware, async (req, res) => {
  const token = getToken(res);
  if (!token) return;
  try {
    const payload = { ...req.body };

    // Injeta usuario_inclusao a partir do e-mail do agente autenticado se não vier no body.
    // O campo diz ao ERP quem criou o orçamento; sem ele o ERP usa o dono do token
    // (acesso.api) que não tem permissão para o bloco SGPRC_USUARIO.CAD_ORCAMENTO_SGPRC_USUARIO_FECHAMENTO.
    if (!payload.usuario_inclusao && req.user?.email) {
      const login = erpLoginFromEmail(req.user.email);
      if (login) payload.usuario_inclusao = login;
    }

    console.log('[ERP pre-proposta] payload enviado ao ERP:', JSON.stringify(payload, null, 2));
    const r = await fetch(`${ERP_BASE}/PrePropostaUsuarioSgprc`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const data = await r.json().catch(() => ({}));
    console.log('[ERP pre-proposta] status HTTP:', r.status);
    console.log('[ERP pre-proposta] resposta ERP completa:', JSON.stringify(data, null, 2));
    if (!r.ok) return res.status(r.status).json(data);
    return res.json(data);
  } catch (err) {
    console.error('[ERP Proxy] POST /pre-proposta error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/erp/canais-venda
// Retorna os canais de venda disponíveis no ERP (API_CANAL_VENDAS)
// Retorno: [{ titulo_contrato: string, id: number }]
router.get('/canais-venda', authMiddleware, async (req, res) => {
  const token = getToken(res);
  if (!token) return;

  try {
    const url = `${ERP_BASE}/API_CANAL_VENDAS`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json(data);
    const results = data?.results || data?.data || (Array.isArray(data) ? data : []);
    return res.json(results);
  } catch (err) {
    console.error('[ERP Proxy] GET /canais-venda error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/erp/planos-pagamento
// Retorna os planos de pagamento ativos e válidos do ERP (planos_pagamentos via DB)
// Retorno: [{ id: number, plano_pagamento: string, numero_parcelas: number, dia_vencimento: number|null }]
router.get('/planos-pagamento', authMiddleware, async (req, res) => {
  try {
    const planos = await getPlanosPagamento();
    return res.json(planos);
  } catch (err) {
    console.error('[ERP Proxy] GET /planos-pagamento error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/erp/produtos
// Retorna os produtos disponíveis no ERP (API_MV_API_PRODUTOS)
// Retorno: [{ id: number, nome: string, ... }]
router.get('/produtos', authMiddleware, async (req, res) => {
  const token = getToken(res);
  if (!token) return;

  try {
    const url = `${ERP_BASE}/API_MV_API_PRODUTOS`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json(data);
    const results = data?.results || data?.data || (Array.isArray(data) ? data : []);
    if (results.length > 0) {
      console.log('[ERP /produtos] total:', results.length);
      console.log('[ERP /produtos] campos do 1º produto:', Object.keys(results[0]));
      console.log('[ERP /produtos] 1º produto completo:', JSON.stringify(results[0], null, 2));
    }
    return res.json(results);
  } catch (err) {
    console.error('[ERP Proxy] GET /produtos error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
