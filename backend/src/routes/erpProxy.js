import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { registerAgentInCanal, inspectAgentInCanal, validateAgentInCanal, addItemsToPedido, finalizeOrcamentoDB, getPlanosPagamento, applyFechamentoEPagamento, ensureContatosEnderecoDB, findPessoaIdByCpf, getErpLoginsByIds, getRelatorioOrcamentos, resolveAgentErpByCpf } from '../services/erpDbService.js';
import {
  buildAuthenticatedOrcamentoPayload,
  classifyAgentCanalAudit,
  classifyAgentErpLink,
  classifyErpSyncError,
  persistResolvedAgentErpLink,
} from '../services/erpAgentLinking.js';
import { acquireAgentMutationLock } from '../services/agentMutationLock.js';
import { query } from '../config/database.js';
import { fetchErpAllPages } from '../utils/erpPagination.js';

const router = express.Router();

const ERP_BASE = 'http://erp.wescctech.com.br:8080/BP_MULTI/api';

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

function erpUnavailableError(context, cause) {
  const error = new Error(`${context}: ${cause?.message || 'fonte ERP indisponível'}`);
  error.code = 'erp_indisponivel';
  error.isErpUpstream = true;
  error.retryable = true;
  error.cause = cause;
  return error;
}

// A identidade ERP do orçamento é sempre obtida do agente autenticado e validada
// novamente pela cadeia CPF -> Pessoa -> Usuário. Não há fallback por e-mail e os
// campos usuario_inclusao/agente_venda_id enviados pelo navegador são ignorados.
async function resolveAuthenticatedOrcamentoPayload(req, token, rawPayload) {
  const agent = (await query(
    `SELECT id, cpf, erp_agent_id, erp_agente_venda_id,
            canal_venda_id, canal_venda_grupo_id
       FROM agents
      WHERE id = $1 AND active = true`,
    [req.user?.id]
  )).rows[0];

  if (!agent) {
    throw new Error('Agente autenticado não foi encontrado ou está inativo.');
  }
  const cpfDigits = String(agent.cpf || '').replace(/\D/g, '');
  if (cpfDigits.length !== 11) {
    throw new Error(
      'Seu cadastro não possui um CPF válido para confirmar o vínculo com o ERP. Solicite a correção em Configurações > Agentes.'
    );
  }

  const resolution = await resolveAgentErpByCpfViaApi(token, agent.cpf);
  const authenticatedPayload = buildAuthenticatedOrcamentoPayload(rawPayload, agent, resolution);
  const canalValido = await validateAgentInCanal(
    resolution.pessoaInternalId,
    agent.canal_venda_id,
    agent.canal_venda_grupo_id,
    agent.erp_agente_venda_id
  );
  if (!canalValido) {
    const error = new Error(
      'O vínculo do seu canal de vendas não corresponde à Pessoa/canal/grupo configurados no ERP. Solicite uma nova sincronização em Configurações > Agentes.'
    );
    error.statusCode = 422;
    throw error;
  }
  return authenticatedPayload;
}

// Normaliza um CPF para o formato que o ERP usa/exige (000.000.000-00).
// A view API_CADASTRO_PESSOAS só encontra a pessoa com o CPF formatado
// (com dígitos puros retorna 0), então padronizamos aqui.
function formatCpf(cpf) {
  const digits = String(cpf ?? '').replace(/\D/g, '');
  if (digits.length !== 11) return String(cpf ?? '');
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function getPessoaCpfDigits(pessoa) {
  const direct = pessoa?.cpf || pessoa?.cpf_titular || pessoa?.documento;
  if (direct) return String(direct).replace(/\D/g, '');
  const docs = Array.isArray(pessoa?.documentos) ? pessoa.documentos : [];
  const cpfDoc = docs.find((doc) =>
    String(doc?.tipo_documento || doc?.tipo || '').toUpperCase() === 'CPF'
  );
  return String(cpfDoc?.documento || '').replace(/\D/g, '');
}

function findUniquePessoaForCpf(rawRows, cpfDigits) {
  const rows = Array.isArray(rawRows) ? rawRows : [];
  const exact = rows.filter((row) => getPessoaCpfDigits(row) === cpfDigits);
  const candidates = exact.length ? exact : rows;
  return {
    pessoa: candidates.length === 1 ? candidates[0] : null,
    ambiguous: candidates.length > 1,
  };
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

async function criarUsuarioErp(token, { login, pessoa }) {
  const loginNorm = String(login || '').toLowerCase().trim();
  if (!loginNorm || !pessoa) {
    throw new Error('Login e código da Pessoa são obrigatórios para criar o Usuário ERP.');
  }

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
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
    body: JSON.stringify(createPayload),
  });
  const createData = await createResp.json().catch(() => ({}));
  const errMsg = createData?.error || '';
  const isFuncoesNpe = /salvarFuncoesUsuario/i.test(errMsg);

  let usuario = null;
  if (createResp.ok && !createData?.error) {
    usuario = createData;
  } else if (isFuncoesNpe) {
    usuario = await fetchUsuarioByLogin(token, loginNorm);
    if (!usuario) throw new Error(errMsg || 'Falha ao criar usuário no ERP.');
  } else {
    const error = new Error(errMsg || 'Erro ao criar usuário no ERP.');
    error.status = createResp.ok ? 400 : createResp.status;
    throw error;
  }

  if (!usuario?.id) {
    usuario = (await fetchUsuarioByLogin(token, loginNorm)) || usuario;
  }
  if (!usuario?.id) {
    throw new Error('O ERP criou o usuário, mas não retornou um identificador válido.');
  }

  let direitosCopiados = false;
  if (ERP_COPIAR_DIREITOS_DE) {
    try {
      const putResp = await fetch(`${ERP_BASE}/Usuarios/${usuario.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ copiar_direitos_de: ERP_COPIAR_DIREITOS_DE }),
      });
      direitosCopiados = putResp.ok;
      if (!putResp.ok) {
        const putTxt = await putResp.text();
        console.error('[criarUsuarioErp] PUT copiar_direitos_de falhou:', putResp.status, putTxt.substring(0, 300));
      }
    } catch (e) {
      console.error('[criarUsuarioErp] erro no PUT copiar_direitos_de:', e.message);
    }
  }

  return {
    id: Number(usuario.id),
    login: usuario.login || loginNorm,
    ativo: usuario.ativo || null,
    pessoa: usuario.pessoa ?? pessoa,
    direitosCopiados,
  };
}

// Busca o usuário do ERP vinculado a uma Pessoa (por CÓDIGO da pessoa, não pessoa_id).
// O ERP IGNORA o parâmetro pessoa_id (devolve a lista inteira — causou vínculos em massa
// errados). O filtro correto é `pessoa` (código da Pessoa retornado por /Pessoas?cpf=).
// Refiltramos client-side por u.pessoa === codigo como rede de segurança.
// HTTP 204 / lista vazia = sem usuário (retorna null).
async function fetchUsuariosByPessoaCodigo(token, pessoaCodigo) {
  if (!pessoaCodigo) return [];
  try {
    const uR = await fetch(`${ERP_BASE}/Usuarios?pessoa=${encodeURIComponent(pessoaCodigo)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (uR.status === 204) return [];
    if (!uR.ok) {
      throw new Error(`ERP respondeu HTTP ${uR.status} ao consultar os Usuários.`);
    }
    const uData = await uR.json().catch(() => ({}));
    const arr = uData?.results || uData?.data || (Array.isArray(uData) ? uData : []);
    const filtrados = (Array.isArray(arr) ? arr : []).filter(
      (u) => String(u?.pessoa ?? '') === String(pessoaCodigo)
    );
    return [...filtrados].sort((a, b) => {
      const aNative = !String(a.login || '').startsWith('user.') ? 1 : 0;
      const bNative = !String(b.login || '').startsWith('user.') ? 1 : 0;
      if (bNative !== aNative) return bNative - aNative;
      const aAtivo = String(a.ativo || '').toUpperCase() === 'S' ? 1 : 0;
      const bAtivo = String(b.ativo || '').toUpperCase() === 'S' ? 1 : 0;
      if (bAtivo !== aAtivo) return bAtivo - aAtivo;
      return Number(a.id || 0) - Number(b.id || 0);
    });
  } catch (e) {
    throw erpUnavailableError('Falha de acesso ao ERP ao consultar os Usuários', e);
  }
}

async function fetchUsuarioById(token, usuarioId) {
  const wanted = Number(usuarioId);
  if (!wanted) return null;
  try {
    // O ERP ignora o filtro `id` em /Usuarios e devolve somente a primeira
    // página por padrão. Paginar e refiltrar é obrigatório para IDs altos.
    const usuarios = await fetchErpAllPages(`${ERP_BASE}/Usuarios`, `Bearer ${token}`, {
      label: 'Usuários ERP',
      extraParams: { id: String(wanted) },
    });
    return usuarios.find((u) => Number(u?.id) === wanted) || null;
  } catch (e) {
    throw erpUnavailableError('Falha de acesso ao ERP ao validar o Usuário salvo', e);
  }
}

// Resolve, via API REST do ERP, o vínculo de um agente a partir do CPF.
// Substitui resolveAgentErpByCpf (erpDbService.js) que usa conexão direta ao banco ERP
// (porta 5432, inacessível em produção). Usa apenas chamadas HTTP (porta 8080).
//
// Estratégia:
//   1. GET /Pessoas?cpf=XXX → código `pessoa` + id interno + nome_completo + situacao
//   2. GET /Usuarios?pessoa=<codigo> → usuário da Pessoa (refiltro client-side por
//      u.pessoa === codigo; HTTP 204/lista vazia = usuário não encontrado)
// O parâmetro pessoa_id é IGNORADO pelo ERP (devolve todos os usuários) — nunca usar.
// Não há fallback por nome: o casamento é garantido pelo CPF.
//
// Retorna o mesmo shape de resolveAgentErpByCpf para não exigir alterações nos callers.
async function resolveAgentErpByCpfViaApi(token, cpf) {
  const EMPTY = (status) => ({
    status,
    pessoaInternalId: null,
    pessoaCodigo: null,
    nomeErp: null,
    situacaoPessoa: null,
    usuarioId: null,
    login: null,
    usuarioAtivo: null,
  });

  const digits = String(cpf ?? '').replace(/\D/g, '');
  if (digits.length !== 11) return EMPTY('cpf_invalido');

  const formatted = formatCpf(digits);

  // --- Passo 1: GET /Pessoas?cpf= → id interno + nome ---
  let pessoaInternalId = null;
  let pessoaCodigo = null;
  let nomeErp = null;
  let situacaoPessoa = null;

  try {
    const pR = await fetch(`${ERP_BASE}/Pessoas?cpf=${encodeURIComponent(formatted)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (pR.status !== 204 && !pR.ok) {
      throw new Error(`ERP respondeu HTTP ${pR.status} ao consultar a Pessoa.`);
    }
    if (pR.ok) {
      const pData = await pR.json().catch(() => ({}));
      const arr = pData?.results || pData?.data || (Array.isArray(pData) ? pData : []);
      const match = findUniquePessoaForCpf(arr, digits);
      if (match.ambiguous) return EMPTY('pessoas_ambiguas');
      if (match.pessoa) {
        const p = match.pessoa;
        pessoaInternalId = p?.id ? Number(p.id) : null;
        pessoaCodigo = p?.pessoa != null ? String(p.pessoa) : null;
        nomeErp = p?.nome_completo || p?.nome_titular || null;
        situacaoPessoa = p?.situacao || null;
      }
    }
  } catch (e) {
    throw erpUnavailableError('Falha de acesso ao ERP ao consultar a Pessoa', e);
  }

  // Fallback para API_CADASTRO_PESSOAS (clientes com contrato ativo)
  if (!pessoaInternalId) {
    try {
      const cR = await fetch(`${ERP_BASE}/API_CADASTRO_PESSOAS?cpf=${encodeURIComponent(formatted)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (cR.status !== 204 && !cR.ok) {
        throw new Error(`ERP respondeu HTTP ${cR.status} na consulta complementar da Pessoa.`);
      }
      if (cR.ok) {
        const cData = await cR.json().catch(() => ({}));
        const arr = cData?.results || cData?.data || (Array.isArray(cData) ? cData : []);
        const match = findUniquePessoaForCpf(arr, digits);
        if (match.ambiguous) return EMPTY('pessoas_ambiguas');
        if (match.pessoa) {
          const p = match.pessoa;
          // API_CADASTRO_PESSOAS: campo `id` é o id do contrato, não da Pessoa.
          // A Pessoa interna precisaria de lookup por /Pessoas?cpf, que já falhou acima.
          // Recuperamos nome e situação para uso no fallback por nome.
          nomeErp = p?.nome_titular || p?.nome_completo || null;
          situacaoPessoa = p?.situacao || null;
          // pessoaInternalId permanece null; tentaremos o fallback por nome abaixo.
        }
      }
    } catch (e) {
      throw erpUnavailableError('Falha de acesso ao ERP na consulta complementar da Pessoa', e);
    }
  }

  if (!pessoaInternalId && !nomeErp) return EMPTY('pessoa_nao_encontrada');

  if (!pessoaInternalId && nomeErp && !pessoaCodigo) {
    return {
      ...EMPTY('pessoa_sem_codigo'),
      nomeErp,
      situacaoPessoa,
    };
  }

  // --- Passo 2: GET /Usuarios?pessoa=<codigo> ---
  const usuarios = pessoaCodigo ? await fetchUsuariosByPessoaCodigo(token, pessoaCodigo) : [];
  const usuario = usuarios.length === 1 ? usuarios[0] : null;

  // Sem fallback por nome: o vínculo é garantido pelo CPF (CPF → Pessoa → Usuário).
  // Nome serve apenas como informação para revisão visual no preview.
  if (!pessoaInternalId && !usuario) return EMPTY('pessoa_nao_encontrada');
  if (!usuario && usuarios.length > 1) {
    return {
      ...EMPTY('usuarios_ambiguos'),
      pessoaInternalId: pessoaInternalId ?? null,
      pessoaCodigo,
      nomeErp,
      situacaoPessoa,
      usuariosEncontrados: usuarios.map((u) => ({
        id: u?.id ? Number(u.id) : null,
        login: u?.login || null,
        ativo: u?.ativo || null,
      })),
    };
  }

  return {
    status: usuario ? 'ok' : 'usuario_nao_encontrado',
    pessoaInternalId: pessoaInternalId ?? null,
    pessoaCodigo,
    nomeErp,
    situacaoPessoa,
    usuarioId: usuario?.id ? Number(usuario.id) : null,
    login: usuario?.login || null,
    usuarioAtivo: usuario?.ativo || null,
    usuariosEncontrados: usuarios.map((u) => ({
      id: u?.id ? Number(u.id) : null,
      login: u?.login || null,
      ativo: u?.ativo || null,
    })),
  };
}

function generateErpLogin(name) {
  const normalize = (value) => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9.]/g, '')
    .toLowerCase();
  const parts = String(name || '').trim().split(/\s+/);
  const first = normalize(parts[0]);
  const second = normalize(parts[1]);
  if (!first) return '';
  return `user.${second ? `${first}.${second}` : first}`;
}

async function resolveOrProvisionAgentErp(token, agent, item = {}) {
  let resolution = await resolveAgentErpByCpfViaApi(token, agent.cpf);
  if (!item.provision) return { resolution, provisionActions: [] };

  const provisionActions = [];
  if (resolution.status === 'pessoa_nao_encontrada') {
    const criada = await criarPessoaErp(token, {
      nome_completo: agent.name,
      cpf: agent.cpf,
    });
    const pessoaInternalId = criada?.id ? Number(criada.id) : null;
    const pessoaCodigo = criada?.pessoa != null ? String(criada.pessoa) : null;
    if (!pessoaInternalId || !pessoaCodigo) {
      throw new Error('O ERP não retornou os identificadores da Pessoa recém-criada.');
    }
    resolution = {
      status: 'usuario_nao_encontrado',
      pessoaInternalId,
      pessoaCodigo,
      nomeErp: criada.nome_completo || agent.name,
      situacaoPessoa: criada.situacao || 'A',
      usuarioId: null,
      login: null,
      usuarioAtivo: null,
      usuariosEncontrados: [],
    };
    provisionActions.push('pessoa_criada');
  }

  if (resolution.status === 'usuario_nao_encontrado' && resolution.pessoaCodigo) {
    const preferredLogin = String(item.preferredLogin || generateErpLogin(agent.name)).toLowerCase().trim();
    if (!preferredLogin || !/^[a-z0-9._-]+$/.test(preferredLogin)) {
      throw new Error('Informe um Login ERP válido para criar o usuário.');
    }
    const usuario = await criarUsuarioErp(token, {
      login: preferredLogin,
      pessoa: resolution.pessoaCodigo,
    });
    resolution = {
      ...resolution,
      status: 'ok',
      usuarioId: Number(usuario.id),
      login: usuario.login,
      usuarioAtivo: usuario.ativo,
      usuariosEncontrados: [{
        id: Number(usuario.id),
        login: usuario.login,
        ativo: usuario.ativo,
      }],
    };
    provisionActions.push('usuario_criado');
  }

  return { resolution, provisionActions };
}

// GET /api/erp/pessoa?cpf=XXX
// Busca pessoa no ERP pelo CPF via API_CADASTRO_PESSOAS
router.get('/pessoa', authMiddleware, requireManageAgents, async (req, res) => {
  const token = getToken(res);
  if (!token) return;

  const { cpf, usuarioId } = req.query;
  if (!cpf) return res.status(400).json({ error: 'CPF obrigatório.' });

  try {
    // A view API_CADASTRO_PESSOAS exige o CPF formatado (000.000.000-00);
    // com dígitos puros ela retorna 0. Normaliza para não depender do frontend.
    const cpfFormatado = formatCpf(cpf);
    const url = `${ERP_BASE}/API_CADASTRO_PESSOAS?cpf=${encodeURIComponent(cpfFormatado)}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });
    // HTTP 204 (ou corpo vazio) = CPF não cadastrado na view — não é erro.
    const data = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok && response.status !== 204) {
      return res.status(response.status).json(data ?? { error: `ERP retornou HTTP ${response.status}.` });
    }

    console.log('[ERP GET /pessoa] CPF buscado:', cpf);
    console.log('[ERP GET /pessoa] status HTTP:', response.status);
    console.log('ERP GET /Pessoas retorno completo:', JSON.stringify(data, null, 2));
    const results = data?.results || data?.data || (Array.isArray(data) ? data : null);
    let pessoa = results?.[0] ?? null;
    console.log('[ERP GET /pessoa] results.length:', results?.length ?? 'null');
    console.log('[ERP GET /pessoa] campos retornados:', pessoa ? Object.keys(pessoa) : 'null');
    console.log('[ERP GET /pessoa] valores-chave:', pessoa ? { id: pessoa.id, pessoa: pessoa.pessoa, contrato: pessoa.contrato, nome_titular: pessoa.nome_titular } : null);

    // Fallback: a view API_CADASTRO_PESSOAS às vezes devolve o registro SEM os campos
    // `pessoa` (código) e `id` (só dados cadastrais). Nesses casos — e também quando a
    // view não devolve nada — resolvemos o código pelo caminho robusto por CPF:
    //   1) API REST (/Pessoas?cpf= + /Usuarios?pessoa=) — funciona em produção;
    //   2) banco direto do ERP (resolveAgentErpByCpf) — cobre registros que a REST
    //      não expõe (só disponível onde a porta 5432 é acessível; falha silenciosa).
    let usuarioErp = null;
    let fallbackUsuarios = [];
    if (!pessoa?.pessoa) {
      let resolved = null;
      try {
        resolved = await resolveAgentErpByCpfViaApi(token, cpfFormatado);
      } catch (e) {
        console.warn('[ERP GET /pessoa] fallback via API falhou:', e.message);
      }
      if (!resolved?.pessoaCodigo) {
        try {
          const dbResolved = await resolveAgentErpByCpf(cpfFormatado);
          if (dbResolved?.pessoaCodigo) resolved = dbResolved;
        } catch (e) {
          console.warn('[ERP GET /pessoa] fallback via banco ERP falhou:', e.message);
        }
      }
      if (resolved?.pessoaCodigo) {
        fallbackUsuarios = resolved.usuariosEncontrados || [];
        console.log('[ERP GET /pessoa] código resolvido via fallback:', resolved.pessoaCodigo, 'usuário:', resolved.login || 'nenhum');
        pessoa = {
          ...(pessoa || {}),
          pessoa: resolved.pessoaCodigo,
          id: resolved.pessoaInternalId ?? pessoa?.id ?? null,
          nome_titular: pessoa?.nome_titular || resolved.nomeErp || null,
          situacao: pessoa?.situacao || resolved.situacaoPessoa || null,
        };
        if (resolved.usuarioId) {
          usuarioErp = { id: resolved.usuarioId, login: resolved.login, ativo: resolved.usuarioAtivo };
        }
      }
    }

    // Se já temos o código (da view ou do fallback) mas ainda não o usuário,
    // busca o usuário ERP existente para reaproveitar o login (evita duplicar).
    let usuariosErp = [];
    if (pessoa?.pessoa) {
      usuariosErp = await fetchUsuariosByPessoaCodigo(token, String(pessoa.pessoa));
      if (!usuariosErp.length && fallbackUsuarios.length) usuariosErp = fallbackUsuarios;
      const expectedUsuario = Number(usuarioId)
        ? usuariosErp.find((u) => Number(u.id) === Number(usuarioId))
        : null;
      if (!usuarioErp && (expectedUsuario || usuariosErp.length === 1)) {
        const u = expectedUsuario || usuariosErp[0];
        usuarioErp = { id: u.id ? Number(u.id) : null, login: u.login || null, ativo: u.ativo || null };
      }
    }

    return res.json({
      pessoa,
      usuarioErp,
      usuariosAmbiguos: usuariosErp.length > 1
        ? usuariosErp.map((u) => ({ id: Number(u.id), login: u.login || null, ativo: u.ativo || null }))
        : [],
    });
  } catch (err) {
    console.error('[ERP Proxy] GET /pessoa error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// Autorização: somente quem pode GERENCIAR AGENTES pode rodar a sincronização ERP
// (consulta CPF/nome no ERP e grava vínculos). Replica a regra do frontend
// canManageAgents: admin, OU módulo 'all'/'config', OU permissions.can_manage_agents.
async function requireManageAgents(req, res, next) {
  try {
    const ag = (await query('SELECT agent_type, permissions FROM agents WHERE id = $1', [req.user?.id])).rows[0];
    if (!ag) return res.status(403).json({ error: 'Acesso negado.' });

    if (ag.agent_type === 'admin') return next();
    if (ag.permissions?.can_manage_agents) return next();

    const at = (await query('SELECT modules FROM agent_types WHERE key = $1', [ag.agent_type])).rows[0];
    const modules = at?.modules || [];
    if (Array.isArray(modules) && (modules.includes('all') || modules.includes('config'))) return next();

    return res.status(403).json({ error: 'Acesso negado. Apenas administradores ou gestores de agentes podem sincronizar com o ERP.' });
  } catch (err) {
    console.error('[ERP Proxy] requireManageAgents error:', err.message);
    return res.status(500).json({ error: 'Falha ao validar permissão.' });
  }
}

// Normaliza nome para comparação: remove acentos, maiúsculas, espaços colapsados.
function normalizeNameForMatch(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Colunas mínimas dos agentes usadas pela sincronização ERP.
const SYNC_AGENT_COLS = 'id, name, cpf, erp_agent_id, erp_agente_venda_id, canal_venda, canal_venda_id, canal_venda_grupo_id, active';

// POST /api/erp/sync-agentes/preview
// Pré-visualização (NÃO grava nada). Revalida todos os agentes ativos para também
// identificar ids legados de Pessoa, usuários inexistentes e usuários de outro CPF.
router.post('/sync-agentes/preview', authMiddleware, requireManageAgents, async (req, res) => {
  const token = getToken(res);
  if (!token) return;

  try {
    const { agentIds } = req.body || {};

    let rows;
    if (Array.isArray(agentIds) && agentIds.length) {
      rows = (await query(
        `SELECT ${SYNC_AGENT_COLS} FROM agents WHERE id = ANY($1) ORDER BY name`,
        [agentIds]
      )).rows;
    } else {
      rows = (await query(
        `SELECT ${SYNC_AGENT_COLS} FROM agents WHERE active = true ORDER BY name`
      )).rows;
    }

    const items = [];
    for (const a of rows) {
      const base = {
        agentId: a.id,
        agentName: a.name,
        cpf: a.cpf || null,
        hasCanal: !!a.canal_venda_id,
        currentErpAgentId: a.erp_agent_id ? Number(a.erp_agent_id) : null,
        currentErpAgenteVendaId: a.erp_agente_venda_id ? Number(a.erp_agente_venda_id) : null,
        selectedCanalName: a.canal_venda || null,
        selectedCanalId: a.canal_venda_id ? Number(a.canal_venda_id) : null,
        selectedCanalGrupoId: a.canal_venda_grupo_id ? Number(a.canal_venda_grupo_id) : null,
      };

      if (!a.cpf || !String(a.cpf).replace(/\D/g, '')) {
        items.push({ ...base, status: 'sem_cpf' });
        continue;
      }

      let r;
      try {
        r = await resolveAgentErpByCpfViaApi(token, a.cpf);
      } catch (e) {
        const failure = classifyErpSyncError(e);
        items.push({ ...base, ...failure, repairable: false });
        continue;
      }

      let storedUsuario = null;
      if (
        a.erp_agent_id &&
        r.status === 'ok' &&
        Number(a.erp_agent_id) !== Number(r.usuarioId)
      ) {
        try {
          storedUsuario = await fetchUsuarioById(token, a.erp_agent_id);
        } catch (storedUserError) {
          const failure = classifyErpSyncError(storedUserError);
          items.push({
            ...base,
            ...failure,
            repairable: false,
            erpAgentId: r.usuarioId,
            pessoaInternalId: r.pessoaInternalId,
            login: r.login,
            nomeErp: r.nomeErp,
          });
          continue;
        }
      }
      const classification = classifyAgentErpLink({
        agent: a,
        resolution: r,
        storedUsuario,
      });
      const nameMatch = r.nomeErp
        ? normalizeNameForMatch(r.nomeErp) === normalizeNameForMatch(a.name)
        : false;
      let status = classification.status;
      let repairable = classification.repairable;
      if (status === 'ok' && !nameMatch) status = 'nome_divergente';
      let canalErro = null;
      let effectiveErpAgenteVendaId = null;
      if (
        r.status === 'ok' &&
        r.pessoaInternalId &&
        a.canal_venda_id
      ) {
        try {
          const canalInspection = await inspectAgentInCanal(
            r.pessoaInternalId,
            a.canal_venda_id,
            a.canal_venda_grupo_id
          );
          const canalClassification = classifyAgentCanalAudit({
            status,
            repairable,
            currentErpAgenteVendaId: a.erp_agente_venda_id,
            inspection: canalInspection,
          });
          status = canalClassification.status;
          repairable = canalClassification.repairable;
          effectiveErpAgenteVendaId = canalClassification.effectiveErpAgenteVendaId;
          canalErro = canalClassification.canalErro;
        } catch (canalValidationError) {
          const failure = classifyErpSyncError(canalValidationError);
          status = failure.status;
          repairable = false;
          canalErro = failure.erro;
        }
      } else if (status === 'ja_vinculado' && !a.canal_venda_id) {
        status = 'sem_canal_configurado';
      }

      items.push({
        ...base,
        status,
        repairable,
        erpAgentId: r.usuarioId,
        pessoaInternalId: r.pessoaInternalId,
        login: r.login,
        nomeErp: r.nomeErp,
        nameMatch,
        usuariosEncontrados: r.usuariosEncontrados || [],
        effectiveErpAgenteVendaId,
        canalErro,
      });
    }

    return res.json({ items });
  } catch (err) {
    console.error('[ERP Proxy] POST /sync-agentes/preview error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/erp/sync-agentes/commit
// Ponto único de escrita dos ids ERP. Re-resolve pelo CPF no servidor, repara vínculos
// legados somente quando há um Usuário inequívoco e registra o canal idempotentemente.
// provision=true é usado pela criação/edição para criar Pessoa/Usuário ausentes.
router.post('/sync-agentes/commit', authMiddleware, requireManageAgents, async (req, res) => {
  const token = getToken(res);
  if (!token) return;

  const { items } = req.body || {};
  if (!Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: 'items é obrigatório.' });
  }

  const results = [];
  for (const it of items) {
    const agentId = it?.agentId;
    if (!agentId) {
      results.push({ agentId: agentId || null, status: 'invalido' });
      continue;
    }

    let agentMutationLock = null;
    try {
      agentMutationLock = await acquireAgentMutationLock(agentId);
      const a = (await agentMutationLock.client.query(
        `SELECT ${SYNC_AGENT_COLS} FROM agents WHERE id = $1`,
        [agentId]
      )).rows[0];

      if (!a) { results.push({ agentId, status: 'nao_encontrado' }); continue; }

      if (!a.cpf || String(a.cpf).replace(/\D/g, '').length !== 11) {
        results.push({ agentId, status: 'sem_cpf' });
        continue;
      }

      const { resolution: r, provisionActions } = await resolveOrProvisionAgentErp(token, a, {
        ...it,
        // Primeiro vínculo pode provisionar. Uma identidade já salva jamais pode
        // criar/trocar Usuário ERP como efeito colateral de uma troca de canal.
        provision: !a.erp_agent_id && it.provision === true,
      });
      if (r.status !== 'ok' || !r.usuarioId) {
        results.push({
          agentId,
          status: r.status || 'usuario_nao_encontrado',
          usuariosEncontrados: r.usuariosEncontrados || [],
        });
        continue;
      }

      if (a.erp_agent_id && Number(a.erp_agent_id) !== Number(r.usuarioId)) {
        const storedUsuario = await fetchUsuarioById(token, a.erp_agent_id);
        const blocked = classifyAgentErpLink({
          agent: a,
          resolution: r,
          storedUsuario,
        });
        results.push({
          agentId,
          status: blocked.status,
          erro: `O ID de Usuário ERP ${a.erp_agent_id} já salvo é imutável e diverge da resolução atual por CPF. Nenhum ID ou canal foi alterado.`,
          erpAgentId: Number(a.erp_agent_id),
          resolvedErpAgentId: Number(r.usuarioId),
          login: r.login,
        });
        continue;
      }

      try {
        const persisted = await persistResolvedAgentErpLink({
          agent: a,
          resolution: r,
          queryDb: agentMutationLock.client.query.bind(agentMutationLock.client),
          registerCanal: registerAgentInCanal,
        });
        const actions = [...provisionActions, ...persisted.actions];
        const semCanal = !a.canal_venda_id || !persisted.erpAgenteVendaId;
        results.push({
          agentId,
          status: semCanal
            ? 'vinculado_sem_canal'
            : (actions.length ? 'ok' : 'ja_vinculado'),
          erpAgentId: persisted.erpAgentId,
          erpAgenteVendaId: persisted.erpAgenteVendaId,
          login: r.login,
          actions,
          canalErro: semCanal ? 'Nenhum canal de vendas válido está vinculado ao agente.' : undefined,
        });
      } catch (persistErr) {
        const failure = classifyErpSyncError(persistErr);
        results.push({
          agentId,
          ...failure,
          login: r.login,
        });
      }
    } catch (e) {
      results.push({ agentId, ...classifyErpSyncError(e) });
    } finally {
      if (agentMutationLock) {
        await agentMutationLock.release().catch((error) => {
          console.error('[ERP /sync-agentes/commit] falha ao liberar lock do agente:', error.message);
        });
      }
    }
  }

  console.log('[ERP /sync-agentes/commit] resultados:', JSON.stringify(results.map(x => ({ a: x.agentId, s: x.status }))));
  return res.json({ results });
});

// Normaliza a data de nascimento vinda do ERP para 'YYYY-MM-DD' (formato do input
// type=date do frontend). Aceita ISO ('1980-05-10' ou '1980-05-10T00:00:00') e o
// formato brasileiro 'DD/MM/YYYY'. Retorna null se ausente/irreconhecível.
function normalizeNascimento(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return null;
}

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
        const nascimento = normalizeNascimento(p.data_nascimento || p.nascimento);
        console.log('[ERP lookup-cpf] GET /Pessoas → pessoa:', p.pessoa, '| id:', p.id, '| usando:', pessoaCodigo, '| nome:', nome, '| nascimento:', nascimento);
        return res.json({ pessoa: pessoaCodigo, nome, cpf: p.cpf || formatted, data_nascimento: nascimento });
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
      data_nascimento: normalizeNascimento(p.data_nascimento || p.nascimento),
    });
  } catch (err) {
    console.error('[ERP Proxy] GET /lookup-cpf error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// Registra no CRM o orçamento criado pelo Bom Flow, vinculando-o ao módulo e ao agente
// real que o criou. O ERP atribui todos os orçamentos criados via API à conta do token
// (acesso.api), então este registro é a ÚNICA fonte confiável de "quem/qual módulo".
// Best-effort: nunca derruba a criação do orçamento se a gravação falhar.
async function recordBomflowOrcamento(req, { erpPedidoId, erpNumero, modulo, clienteNome, clienteCpf, valor, leadId }) {
  try {
    if (!erpPedidoId) return;
    if (!modulo || !VALID_MODULOS.includes(modulo)) {
      console.warn('[bomflow_orcamentos] módulo ausente/inválido, orçamento não rastreado:', modulo, 'pedido:', erpPedidoId);
      return;
    }
    let agentName = null;
    if (req.user?.id) {
      const a = (await query('SELECT name FROM agents WHERE id = $1', [req.user.id])).rows[0];
      agentName = a?.name || req.user?.name || null;
    }
    await query(
      `INSERT INTO bomflow_orcamentos
         (erp_pedido_id, erp_numero, modulo, agent_id, agent_name, cliente_nome, cliente_cpf, valor_criacao, lead_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (erp_pedido_id) DO UPDATE SET
         erp_numero   = EXCLUDED.erp_numero,
         modulo       = EXCLUDED.modulo,
         agent_id     = EXCLUDED.agent_id,
         agent_name   = EXCLUDED.agent_name,
         cliente_nome = EXCLUDED.cliente_nome,
         cliente_cpf  = EXCLUDED.cliente_cpf,
         valor_criacao = EXCLUDED.valor_criacao,
         lead_id      = COALESCE(EXCLUDED.lead_id, bomflow_orcamentos.lead_id)`,
      [
        Number(erpPedidoId),
        erpNumero != null ? Number(erpNumero) : null,
        modulo,
        req.user?.id || null,
        agentName,
        clienteNome || null,
        clienteCpf || null,
        valor != null ? Number(valor) : null,
        leadId || null,
      ]
    );
    console.log(`[bomflow_orcamentos] registrado pedido ${erpPedidoId} (nº ${erpNumero}) módulo=${modulo} agente=${agentName} lead=${leadId || '-'}`);
  } catch (e) {
    console.error('[bomflow_orcamentos] falha ao registrar (não crítico):', e.message);
  }
}

// POST /api/erp/orcamento
// Cria um orçamento no ERP via POST /OrcamentoSgprcUsuario
router.post('/orcamento', authMiddleware, async (req, res) => {
  const token = getToken(res);
  if (!token) return;
  try {
    const payload = { ...req.body };

    // Extrai itens (múltiplos produtos) e campos de pagamento antes de enviar ao ERP
    // (a API REST só salva o cabeçalho; produtos/pessoas são inseridos via DB)
    const {
      itens: itensRaw,
      prazo_pagamento_id: planoPagamentoId,
      quantidade_parcelas: quantidadeParcelas,
      usua_produtos,
      usua_papeis,
      modulo: moduloOrcamento,
      lead_id: _leadId,
      ...headerPayloadFromClient
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

    // Só depois das validações locais resolve a identidade ERP do agente autenticado.
    // Sobrescreve os campos de autoria enviados pelo navegador e bloqueia antes do POST
    // do cabeçalho quando Usuário ERP ou canal estiverem ausentes/inconsistentes.
    const headerPayload = await resolveAuthenticatedOrcamentoPayload(
      req,
      token,
      headerPayloadFromClient
    );

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

    // Rastreio CRM: vincula este orçamento ao módulo e agente real (best-effort).
    await recordBomflowOrcamento(req, {
      erpPedidoId: pedidoInternalId,
      erpNumero: numeroPedido,
      modulo: moduloOrcamento,
      clienteNome: headerPayload.nome_contratante || headerPayload.contratante_nome || null,
      clienteCpf: headerPayload.cpf || headerPayload.contratante_cpf || null,
      valor: data?.valor_total ?? null,
      leadId: req.body?.lead_id || null,
    });

    return res.json({ ...data, numeroPedido, erpId: pedidoInternalId, dbInserted: dbResult, fechamento: fechamentoResult });
  } catch (err) {
    console.error('[ERP Proxy] POST /orcamento error:', err.message);
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// POST /api/erp/pre-proposta
// Cria uma proposta completa (header + endereço + produto + 1 beneficiário) via POST /PrePropostaUsuarioSgprc
router.post('/pre-proposta', authMiddleware, async (req, res) => {
  const token = getToken(res);
  if (!token) return;
  try {
    // `modulo` é metadado do Bom Flow (rastreio CRM), NÃO deve ser enviado ao ERP.
    const { modulo: moduloOrcamento, ...payloadFromClient } = { ...req.body };
    const payload = await resolveAuthenticatedOrcamentoPayload(req, token, payloadFromClient);

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

    // Rastreio CRM (best-effort): só registra se o ERP devolveu o id do pedido e não houve
    // bloco/erro interno. Vincula ao módulo e agente real que criou.
    if (!data?.block && !data?.error) {
      await recordBomflowOrcamento(req, {
        erpPedidoId: data?.id ?? null,
        erpNumero: data?.pedido ?? data?.numero ?? null,
        modulo: moduloOrcamento,
        clienteNome: payload.nome_contratante || payload.contratante_nome || null,
        clienteCpf: payload.cpf || payload.contratante_cpf || null,
        valor: data?.valor_total ?? null,
        leadId: req.body?.lead_id || null,
      });
    }

    return res.json(data);
  } catch (err) {
    console.error('[ERP Proxy] POST /pre-proposta error:', err.message);
    return res.status(err.statusCode || 500).json({ error: err.message });
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
    const results = await fetchErpAllPages(url, `Bearer ${token}`, { label: 'ERP /canais-venda' });
    return res.json(results);
  } catch (err) {
    console.error('[ERP Proxy] GET /canais-venda error:', err.message);
    return res.status(err.isErpUpstream ? 502 : 500).json({ error: err.message });
  }
});

// GET /api/erp/planos-pagamento
// Retorna os planos de pagamento ativos e válidos do ERP via API REST (PlanosPagamentos).
// Não depende do acesso direto ao banco do ERP (ERP_DB_*), então funciona em produção.
// Retorno: [{ id: number, plano_pagamento: string, numero_parcelas: number|null, dia_vencimento: number|null }]
router.get('/planos-pagamento', authMiddleware, async (req, res) => {
  try {
    const url = `${ERP_BASE}/PlanosPagamentos`;
    const rows = await fetchErpAllPages(url, `Bearer ${process.env.ERP_AUTH_TOKEN}`);
    const planos = rows
      .filter((p) => p.ativo === 'S' && p.valido === 'S')
      .map((p) => ({
        id: Number(p.id),
        plano_pagamento: p.plano_pagamento,
        numero_parcelas: p.numero_parcelas != null ? Number(p.numero_parcelas) : null,
        dia_vencimento: p.dia_vencimento != null ? Number(p.dia_vencimento) : null,
      }))
      .sort((a, b) => String(a.plano_pagamento).localeCompare(String(b.plano_pagamento), 'pt-BR'));
    return res.json(planos);
  } catch (err) {
    // Loga o erro completo (stack + código) para diagnóstico de conexão/credencial/query.
    console.error('[ERP Proxy] GET /planos-pagamento error:', err);
    return res.status(502).json({
      error: 'Não foi possível carregar os planos de pagamento do ERP',
      detail: err.message,
    });
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
    const results = await fetchErpAllPages(url, `Bearer ${token}`, { label: 'ERP /produtos' });
    console.log('[ERP /produtos] total:', results.length);
    return res.json(results);
  } catch (err) {
    console.error('[ERP Proxy] GET /produtos error:', err.message);
    return res.status(err.isErpUpstream ? 502 : 500).json({ error: err.message });
  }
});

// ─── Relatório de Orçamentos ─────────────────────────────────────────────────

/**
 * Retorna os erp_agent_id dos agentes Bom Flow pertencentes a um módulo.
 * O módulo é mapeado via agent_types.modules (ex.: 'sales', 'sales_pj',
 * 'sales_upsell', 'referral'). Agentes 'admin' (modules = {all}) entram em
 * todos os módulos. Módulo é obrigatório e validado: ausente/inválido => [].
 * Só considera agentes com erp_agent_id (= usuário do ERP que cria orçamentos).
 */
const VALID_MODULOS = ['sales', 'sales_pj', 'sales_upsell', 'referral'];

async function getModuleErpAgentIds(modulo) {
  // Módulo é obrigatório e deve ser válido. Sem isso, retornamos vazio para
  // garantir separação estrita por módulo (nunca agregar todos os módulos).
  if (!modulo || !VALID_MODULOS.includes(modulo)) return [];
  const r = await query(
    `SELECT DISTINCT a.erp_agent_id
       FROM agents a
       JOIN agent_types t ON t.key = a.agent_type
      WHERE a.erp_agent_id IS NOT NULL
        AND ($1 = ANY(t.modules) OR 'all' = ANY(t.modules))`,
    [modulo]
  );
  return r.rows.map(row => Number(row.erp_agent_id));
}

// Retorna os agentes (CRM) elegíveis a um módulo, por tipo de agente.
// Diferente de getModuleErpAgentIds, NÃO exige erp_agent_id: a autoria do orçamento
// é rastreada no CRM (bomflow_orcamentos.agent_id), não pelo login do ERP.
// Retorno: [{ id (uuid), name }].
async function getModuleAgentIds(modulo) {
  if (!modulo || !VALID_MODULOS.includes(modulo)) return [];
  const r = await query(
    `SELECT a.id, a.name
       FROM agents a
       JOIN agent_types t ON t.key = a.agent_type
      WHERE ($1 = ANY(t.modules) OR 'all' = ANY(t.modules))
      ORDER BY a.name`,
    [modulo]
  );
  return r.rows;
}

/**
 * GET /api/erp/relatorio-orcamentos/vendedores
 * Retorna a lista de vendedores elegíveis para o filtro do relatório,
 * baseada no escopo do usuário logado (admin = todos; supervisor = equipe; vendedor = só ele)
 * e restrita aos agentes Bom Flow do módulo solicitado.
 */
router.get('/relatorio-orcamentos/vendedores', authMiddleware, async (req, res) => {
  try {
    const { team_id, modulo } = req.query;

    const agentRes = await query(
      `SELECT id, agent_type, supervisor_id FROM agents WHERE id = $1`,
      [req.user.id]
    );
    const agent = agentRes.rows[0];
    if (!agent) return res.status(403).json({ error: 'Agente não encontrado.' });

    const agentType = (agent.agent_type || '').toLowerCase();
    const isAdmin = agentType === 'admin' || (req.user.role || '').toLowerCase() === 'admin';
    const isSupervisor = !isAdmin && agentType.includes('supervisor');

    // Universo de agentes (CRM) do módulo — autoria é rastreada no CRM, não pelo ERP.
    const moduleAgents = await getModuleAgentIds(modulo);
    const moduleSet = new Set(moduleAgents.map(a => a.id));

    let agents = [];

    if (isAdmin) {
      if (team_id && team_id !== 'todos') {
        const allRes = await query(
          `SELECT id, name FROM agents WHERE team_id = $1 ORDER BY name`,
          [team_id]
        );
        agents = allRes.rows;
      } else {
        agents = moduleAgents;
      }
    } else if (isSupervisor) {
      const teamRes = await query(
        `SELECT id, name FROM agents WHERE supervisor_id = $1 ORDER BY name`,
        [agent.id]
      );
      agents = teamRes.rows;
      const selfRes = await query(`SELECT id, name FROM agents WHERE id = $1`, [agent.id]);
      if (selfRes.rows[0]) agents.push(selfRes.rows[0]);
    } else {
      const selfRes = await query(`SELECT id, name FROM agents WHERE id = $1`, [agent.id]);
      agents = selfRes.rows;
    }

    // Restringe ao universo do módulo e remove duplicados.
    const seen = new Set();
    const vendedores = agents
      .filter(a => moduleSet.has(a.id) && !seen.has(a.id) && seen.add(a.id))
      .map(a => ({ id: a.id, nome: a.name }))
      .sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));

    return res.json({ vendedores });
  } catch (err) {
    console.error('[ERP Proxy] GET /relatorio-orcamentos/vendedores error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/erp/relatorio-orcamentos
 * Retorna orçamentos do ERP com permissão aplicada automaticamente pelo JWT.
 * Query params: start_date, end_date, situacao, vendedor_login, canal_id, team_id, limit
 */
router.get('/relatorio-orcamentos', authMiddleware, async (req, res) => {
  try {
    // vendedor_id é o uuid do agente CRM (a autoria é rastreada no CRM, não no ERP).
    // Mantém compatibilidade com o nome antigo vendedor_login caso ainda venha.
    const { start_date, end_date, situacao, canal_id, team_id, modulo, limit = 500 } = req.query;
    const vendedorId = req.query.vendedor_id || req.query.vendedor_login || null;

    if (!modulo || !VALID_MODULOS.includes(modulo)) return res.json({ items: [] });

    const agentRes = await query(
      `SELECT id, agent_type, supervisor_id FROM agents WHERE id = $1`,
      [req.user.id]
    );
    const agent = agentRes.rows[0];
    if (!agent) return res.status(403).json({ error: 'Agente não encontrado.' });

    const agentType = (agent.agent_type || '').toLowerCase();
    const isAdmin = agentType === 'admin' || (req.user.role || '').toLowerCase() === 'admin';
    const isSupervisor = !isAdmin && agentType.includes('supervisor');
    const isAuditoria = !isAdmin && agentType === 'auditoria';

    // ─── Escopo do visualizador (permissão) por agente CRM ─────────────────
    // scopeAgentIds = null → admin/auditoria sem restrição (todos os agentes do módulo).
    let scopeAgentIds = null;

    if (!isAdmin && !isAuditoria) {
      if (isSupervisor) {
        const teamRes = await query(
          `SELECT id FROM agents WHERE supervisor_id = $1`,
          [agent.id]
        );
        scopeAgentIds = teamRes.rows.map(r => r.id);
        scopeAgentIds.push(agent.id);
      } else {
        scopeAgentIds = [agent.id];
      }
    }

    // Admin/auditoria: escopo por time (filtro opcional do frontend)
    if ((isAdmin || isAuditoria) && team_id && team_id !== 'todos') {
      const teamAgents = await query(
        `SELECT id FROM agents WHERE team_id = $1`,
        [team_id]
      );
      scopeAgentIds = teamAgents.rows.map(r => r.id);
    }

    // Filtro adicional de vendedor (supervisor/admin escolhem um agente específico)
    if (vendedorId && vendedorId !== 'todos') {
      scopeAgentIds = scopeAgentIds ? scopeAgentIds.filter(id => id === vendedorId) : [vendedorId];
    }

    // ─── Rastreio CRM: quais pedidos do ERP pertencem a este módulo+escopo ──
    const crmParams = [modulo];
    let crmWhere = 'modulo = $1';
    if (Array.isArray(scopeAgentIds)) {
      if (scopeAgentIds.length === 0) return res.json({ items: [] });
      crmParams.push(scopeAgentIds);
      crmWhere += ` AND agent_id = ANY($${crmParams.length})`;
    }
    const crmRes = await query(
      `SELECT erp_pedido_id, agent_name FROM bomflow_orcamentos WHERE ${crmWhere}`,
      crmParams
    );
    if (crmRes.rows.length === 0) return res.json({ items: [] });

    const pedidoIds = crmRes.rows.map(r => Number(r.erp_pedido_id));
    const agentNameById = new Map(crmRes.rows.map(r => [Number(r.erp_pedido_id), r.agent_name]));

    // ─── Dados ao vivo do ERP para esses pedidos ───────────────────────────
    const rows = await getRelatorioOrcamentos({
      pedidoIds,
      startDate: start_date || null,
      endDate: end_date || null,
      situacao: situacao && situacao !== 'todos' ? situacao : null,
      canalId: canal_id && canal_id !== 'todos' ? canal_id : null,
      limit: Math.min(Number(limit) || 500, 1000),
      offset: 0,
    });

    // O ERP atribui a autoria à conta do token (acesso.api); sobrescrevemos com o
    // agente real do Bom Flow (rastreio CRM) para exibir o vendedor correto.
    const items = rows.map(row => {
      const realName = agentNameById.get(Number(row.erp_id));
      return realName ? { ...row, nome_vendedor: realName, login_vendedor: realName } : row;
    });

    return res.json({ items });
  } catch (err) {
    console.error('[ERP Proxy] GET /relatorio-orcamentos error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ───────────────────────────────────────────────────────────────────────────
// Relatório CONSOLIDADO de orçamentos (todos os módulos de vendas em uma lista).
// Restrito a: admin, tipo "auditoria" e supervisores do time "Auditoria".
// Usuários elegíveis enxergam TODOS os orçamentos (escopo de auditoria).
// Endpoint aditivo — não altera o /relatorio-orcamentos por módulo.
// ───────────────────────────────────────────────────────────────────────────
const MODULO_LABELS = {
  sales: 'Vendas PF',
  sales_pj: 'Vendas PJ',
  sales_upsell: 'Upsell',
  referral: 'Indicações',
};

// Mesma elegibilidade do relatório consolidado (admin, tipo "auditoria" e
// supervisores do time "Auditoria"). Compartilhado pela lista consolidada e pela
// busca pontual por pedido.
async function isConsolidadoEligible(req) {
  const agentRes = await query(
    `SELECT a.id, a.agent_type, t.name AS team_name
       FROM agents a
       LEFT JOIN teams t ON t.id = a.team_id
      WHERE a.id = $1`,
    [req.user.id]
  );
  const agent = agentRes.rows[0];
  if (!agent) return false;
  const agentType = (agent.agent_type || '').toLowerCase();
  const isAdmin = agentType === 'admin' || (req.user.role || '').toLowerCase() === 'admin';
  const isAuditoria = agentType === 'auditoria';
  const isSupervisor = agentType.includes('supervisor');
  const teamName = (agent.team_name || '').trim().toLowerCase();
  const isAuditTeamSupervisor = isSupervisor && teamName === 'auditoria';
  return isAdmin || isAuditoria || isAuditTeamSupervisor;
}

router.get('/relatorio-orcamentos/consolidado', authMiddleware, async (req, res) => {
  try {
    const { start_date, end_date, situacao, canal_id, limit = 1000 } = req.query;

    const eligible = await isConsolidadoEligible(req);
    if (!eligible) {
      return res.status(403).json({ error: 'Acesso restrito ao relatório consolidado de orçamentos.' });
    }

    // Rastreio CRM: todos os pedidos dos 4 módulos de vendas.
    const crmRes = await query(
      `SELECT erp_pedido_id, modulo, agent_name FROM bomflow_orcamentos WHERE modulo = ANY($1)`,
      [VALID_MODULOS]
    );
    if (crmRes.rows.length === 0) return res.json({ items: [] });

    let pedidoIds = crmRes.rows.map(r => Number(r.erp_pedido_id));
    const metaById = new Map(
      crmRes.rows.map(r => [Number(r.erp_pedido_id), { modulo: r.modulo, agent_name: r.agent_name }])
    );

    // Orçamentos já APROVADOS no pré-venda saem da fila (a aprovação é local — a
    // situação no ERP não muda, então o filtro por situação sozinho não os exclui).
    // Eles passam a constar na fila do Pós-Vendas.
    try {
      const aprovRes = await query(
        `SELECT erp_pedido_id FROM presales_auditorias
          WHERE status = 'concluida' AND resultado = 'aprovado' AND erp_pedido_id = ANY($1)`,
        [pedidoIds]
      );
      const aprovados = new Set(aprovRes.rows.map(r => Number(r.erp_pedido_id)));
      if (aprovados.size > 0) pedidoIds = pedidoIds.filter(id => !aprovados.has(id));
    } catch (e) {
      console.error('[consolidado] falha ao filtrar aprovados:', e.message);
    }
    if (pedidoIds.length === 0) return res.json({ items: [] });

    const rows = await getRelatorioOrcamentos({
      pedidoIds,
      startDate: start_date || null,
      endDate: end_date || null,
      situacao: situacao && situacao !== 'todos' ? situacao : null,
      canalId: canal_id && canal_id !== 'todos' ? canal_id : null,
      limit: Math.min(Number(limit) || 1000, 1000),
      offset: 0,
    });

    // Último pedido de ajuste por orçamento (para sinalizar na fila os que aguardam
    // o vendedor ou já voltaram ajustados para reauditoria).
    const ajusteByPedido = new Map();
    try {
      const ajRes = await query(
        `SELECT DISTINCT ON (erp_pedido_id)
                erp_pedido_id, status, texto, created_at, ajustado_at, vendedor_nome
           FROM presales_ajustes
          WHERE erp_pedido_id = ANY($1)
          ORDER BY erp_pedido_id, created_at DESC`,
        [pedidoIds]
      );
      ajRes.rows.forEach(r => ajusteByPedido.set(Number(r.erp_pedido_id), r));
    } catch (e) {
      console.error('[consolidado] falha ao carregar ajustes:', e.message);
    }

    // Sobrescreve o vendedor com o agente real do Bom Flow e etiqueta o módulo de origem.
    const items = rows.map(row => {
      const meta = metaById.get(Number(row.erp_id)) || {};
      const realName = meta.agent_name;
      const aj = ajusteByPedido.get(Number(row.erp_id));
      return {
        ...row,
        modulo: meta.modulo || null,
        modulo_nome: MODULO_LABELS[meta.modulo] || meta.modulo || '-',
        ...(realName ? { nome_vendedor: realName, login_vendedor: realName } : {}),
        ajuste_status: aj?.status || null,
        ajuste_texto: aj?.texto || null,
        ajuste_at: aj?.ajustado_at || aj?.created_at || null,
      };
    });

    return res.json({ items });
  } catch (err) {
    console.error('[ERP Proxy] GET /relatorio-orcamentos/consolidado error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ───────────────────────────────────────────────────────────────────────────
// Busca pontual de UM orçamento por id do pedido no ERP, sem filtro de data nem
// de situação. Usado pelo Painel de Ajustes para levar o auditor direto ao
// orçamento na Fila Pré Vendas mesmo quando ele é antigo ou já mudou de situação.
// Mesma elegibilidade do relatório consolidado.
// ───────────────────────────────────────────────────────────────────────────
router.get('/relatorio-orcamentos/by-pedido/:pedidoId', authMiddleware, async (req, res) => {
  try {
    const pedidoId = Number(req.params.pedidoId);
    if (!Number.isInteger(pedidoId) || pedidoId <= 0) {
      return res.status(400).json({ error: 'Id de pedido inválido.' });
    }

    const eligible = await isConsolidadoEligible(req);
    if (!eligible) {
      return res.status(403).json({ error: 'Acesso restrito ao relatório consolidado de orçamentos.' });
    }

    // Rastreio CRM: o pedido precisa pertencer a um dos módulos de vendas.
    const crmRes = await query(
      `SELECT erp_pedido_id, modulo, agent_name
         FROM bomflow_orcamentos
        WHERE erp_pedido_id = $1 AND modulo = ANY($2)
        LIMIT 1`,
      [pedidoId, VALID_MODULOS]
    );
    const meta = crmRes.rows[0];
    if (!meta) return res.status(404).json({ error: 'Orçamento não encontrado.' });

    const rows = await getRelatorioOrcamentos({
      pedidoIds: [pedidoId],
      startDate: null,
      endDate: null,
      situacao: null,
      canalId: null,
      limit: 1,
      offset: 0,
    });
    const row = rows[0];
    if (!row) return res.status(404).json({ error: 'Orçamento não encontrado.' });

    let aj = null;
    try {
      const ajRes = await query(
        `SELECT status, texto, created_at, ajustado_at, vendedor_nome
           FROM presales_ajustes
          WHERE erp_pedido_id = $1
          ORDER BY created_at DESC
          LIMIT 1`,
        [pedidoId]
      );
      aj = ajRes.rows[0] || null;
    } catch (e) {
      console.error('[by-pedido] falha ao carregar ajuste:', e.message);
    }

    const item = {
      ...row,
      modulo: meta.modulo || null,
      modulo_nome: MODULO_LABELS[meta.modulo] || meta.modulo || '-',
      ...(meta.agent_name ? { nome_vendedor: meta.agent_name, login_vendedor: meta.agent_name } : {}),
      ajuste_status: aj?.status || null,
      ajuste_texto: aj?.texto || null,
      ajuste_at: aj?.ajustado_at || aj?.created_at || null,
    };

    return res.json({ item });
  } catch (err) {
    console.error('[ERP Proxy] GET /relatorio-orcamentos/by-pedido error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
