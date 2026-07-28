import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { registerAgentInCanal, addItemsToPedido, finalizeOrcamentoDB, getPlanosPagamento, applyFechamentoEPagamento, ensureContatosEnderecoDB, findPessoaIdByCpf, getLoginByUsuarioId, getErpLoginsByIds, getRelatorioOrcamentos } from '../services/erpDbService.js';
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

// Resolve o login do ERP que deve assinar o orçamento (usuario_inclusao).
// SEMPRE derivado no servidor a partir do agente autenticado — o valor enviado pelo
// cliente é ignorado (atribuição de autoria não pode ser influenciada pelo cliente).
// Frente 3: prioriza o login NATIVO do vendedor (agents.erp_agent_id → usuarios.login),
// caindo para a derivação pelo e-mail do JWT (formato legado user.*) somente quando o
// agente ainda não está vinculado ao ERP (sem erp_agent_id) ou o lookup falha.
async function resolveUsuarioInclusao(req) {
  try {
    if (req.user?.id) {
      const a = (await query('SELECT erp_agent_id FROM agents WHERE id = $1', [req.user.id])).rows[0];
      const erpAgentId = a?.erp_agent_id ? Number(a.erp_agent_id) : null;
      if (erpAgentId) {
        const nativeLogin = await getLoginByUsuarioId(erpAgentId);
        if (nativeLogin) return nativeLogin;
      }
    }
  } catch (e) {
    console.warn('[ERP usuario_inclusao] Falha ao resolver login nativo, usando fallback:', e.message);
  }
  return req.user?.email ? erpLoginFromEmail(req.user.email) : undefined;
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

// Resolve, via API REST do ERP, o vínculo de um agente a partir do CPF.
// Substitui resolveAgentErpByCpf (erpDbService.js) que usa conexão direta ao banco ERP
// (porta 5432, inacessível em produção). Usa apenas chamadas HTTP (porta 8080).
//
// Estratégia:
//   1. GET /Pessoas?cpf=XXX → id interno da Pessoa + nome_completo + situacao
//   2. GET /Usuarios?pessoa_id=XXX → tenta filtrar usuário pelo id interno
//   3. Fallback: GET /Usuarios?nome=XXX com match exato de nome normalizado
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
    if (pR.ok) {
      const pData = await pR.json().catch(() => ({}));
      const arr = pData?.results || pData?.data || (Array.isArray(pData) ? pData : []);
      if (arr.length) {
        const p = arr[0];
        pessoaInternalId = p?.id ? Number(p.id) : null;
        pessoaCodigo = p?.pessoa != null ? String(p.pessoa) : null;
        nomeErp = p?.nome_completo || p?.nome_titular || null;
        situacaoPessoa = p?.situacao || null;
      }
    }
  } catch (e) {
    console.warn('[resolveAgentErpByCpfViaApi] GET /Pessoas falhou:', e.message);
  }

  // Fallback para API_CADASTRO_PESSOAS (clientes com contrato ativo)
  if (!pessoaInternalId) {
    try {
      const cR = await fetch(`${ERP_BASE}/API_CADASTRO_PESSOAS?cpf=${encodeURIComponent(formatted)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (cR.ok) {
        const cData = await cR.json().catch(() => ({}));
        const arr = cData?.results || cData?.data || (Array.isArray(cData) ? cData : []);
        if (arr.length) {
          const p = arr[0];
          // API_CADASTRO_PESSOAS: campo `id` é o id do contrato, não da Pessoa.
          // A Pessoa interna precisaria de lookup por /Pessoas?cpf, que já falhou acima.
          // Recuperamos nome e situação para uso no fallback por nome.
          nomeErp = p?.nome_titular || p?.nome_completo || null;
          situacaoPessoa = p?.situacao || null;
          // pessoaInternalId permanece null; tentaremos o fallback por nome abaixo.
        }
      }
    } catch (e) {
      console.warn('[resolveAgentErpByCpfViaApi] GET /API_CADASTRO_PESSOAS falhou:', e.message);
    }
  }

  if (!pessoaInternalId && !nomeErp) return EMPTY('pessoa_nao_encontrada');

  // --- Passo 2: GET /Usuarios?pessoa_id= ---
  let usuario = null;

  if (pessoaInternalId) {
    try {
      const uR = await fetch(`${ERP_BASE}/Usuarios?pessoa_id=${encodeURIComponent(pessoaInternalId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (uR.ok) {
        const uData = await uR.json().catch(() => ({}));
        const arr = uData?.results || uData?.data || (Array.isArray(uData) ? uData : []);
        if (Array.isArray(arr) && arr.length) {
          // Prefere login nativo (não "user.") e usuário ativo — mesmo critério do DB.
          const sorted = [...arr].sort((a, b) => {
            const aNative = !String(a.login || '').startsWith('user.') ? 1 : 0;
            const bNative = !String(b.login || '').startsWith('user.') ? 1 : 0;
            if (bNative !== aNative) return bNative - aNative;
            const aAtivo = String(a.ativo || '').toUpperCase() === 'S' ? 1 : 0;
            const bAtivo = String(b.ativo || '').toUpperCase() === 'S' ? 1 : 0;
            return bAtivo - aAtivo;
          });
          usuario = sorted[0];
        }
      }
    } catch (e) {
      console.warn('[resolveAgentErpByCpfViaApi] GET /Usuarios?pessoa_id= falhou:', e.message);
    }
  }

  // --- Passo 3: fallback por nome (match exato normalizado) ---
  if (!usuario && nomeErp) {
    try {
      const nomeEnc = encodeURIComponent(nomeErp);
      const uR = await fetch(`${ERP_BASE}/Usuarios?nome=${nomeEnc}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (uR.ok) {
        const uData = await uR.json().catch(() => ({}));
        const arr = uData?.results || uData?.data || (Array.isArray(uData) ? uData : []);
        if (Array.isArray(arr) && arr.length) {
          const nomeNorm = normalizeNameForMatch(nomeErp);
          const matched = arr.filter(u => normalizeNameForMatch(u.nome_completo || u.nome || '') === nomeNorm);
          if (matched.length) {
            const sorted = [...matched].sort((a, b) => {
              const aNative = !String(a.login || '').startsWith('user.') ? 1 : 0;
              const bNative = !String(b.login || '').startsWith('user.') ? 1 : 0;
              if (bNative !== aNative) return bNative - aNative;
              const aAtivo = String(a.ativo || '').toUpperCase() === 'S' ? 1 : 0;
              const bAtivo = String(b.ativo || '').toUpperCase() === 'S' ? 1 : 0;
              return bAtivo - aAtivo;
            });
            usuario = sorted[0];
          }
        }
      }
    } catch (e) {
      console.warn('[resolveAgentErpByCpfViaApi] GET /Usuarios?nome= falhou:', e.message);
    }
  }

  if (!pessoaInternalId && !usuario) return EMPTY('pessoa_nao_encontrada');

  return {
    status: usuario ? 'ok' : 'usuario_nao_encontrado',
    pessoaInternalId: pessoaInternalId ?? null,
    pessoaCodigo,
    nomeErp,
    situacaoPessoa,
    usuarioId: usuario?.id ? Number(usuario.id) : null,
    login: usuario?.login || null,
    usuarioAtivo: usuario?.ativo || null,
  };
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
router.post('/registrar-canal', authMiddleware, requireManageAgents, async (req, res) => {
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
const SYNC_AGENT_COLS = 'id, name, cpf, erp_agent_id, erp_agente_venda_id, canal_venda_id, canal_venda_grupo_id, active';

// POST /api/erp/sync-agentes/preview
// Pré-visualização (NÃO grava nada). Resolve, via API REST do ERP, o vínculo de cada
// agente a partir do CPF (CPF → Pessoa → Usuário) e devolve o status + se o nome bate.
// body: { agentIds?: string[] }  — sem agentIds: todos os agentes ativos sem erp_agent_id.
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
        `SELECT ${SYNC_AGENT_COLS} FROM agents WHERE erp_agent_id IS NULL AND active = true ORDER BY name`
      )).rows;
    }

    const items = [];
    for (const a of rows) {
      const base = {
        agentId: a.id,
        agentName: a.name,
        cpf: a.cpf || null,
        hasCanal: !!a.canal_venda_id,
      };

      if (a.erp_agent_id) {
        items.push({ ...base, status: 'ja_vinculado', erpAgentId: Number(a.erp_agent_id) });
        continue;
      }
      if (!a.cpf || !String(a.cpf).replace(/\D/g, '')) {
        items.push({ ...base, status: 'sem_cpf' });
        continue;
      }

      let r;
      try {
        r = await resolveAgentErpByCpfViaApi(token, a.cpf);
      } catch (e) {
        items.push({ ...base, status: 'erro', erro: e.message });
        continue;
      }

      const nameMatch = r.nomeErp
        ? normalizeNameForMatch(r.nomeErp) === normalizeNameForMatch(a.name)
        : false;

      items.push({
        ...base,
        status: r.status === 'ok' ? (nameMatch ? 'ok' : 'nome_divergente') : r.status,
        erpAgentId: r.usuarioId,
        pessoaInternalId: r.pessoaInternalId,
        login: r.login,
        nomeErp: r.nomeErp,
        nameMatch,
      });
    }

    return res.json({ items });
  } catch (err) {
    console.error('[ERP Proxy] POST /sync-agentes/preview error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/erp/sync-agentes/commit
// Grava o vínculo. Re-resolve no servidor via API REST do ERP (não confia em ids do cliente)
// e só grava quando o nome bate (ou quando o item vem com force=true, para divergências
// revisadas manualmente pelo admin). Se o agente já tiver canal_venda_id, também roda o
// registrar-canal para preencher erp_agente_venda_id.
// body: { items: [{ agentId, force?: boolean }] }
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
    const force = !!it?.force;
    // recanal: força re-registro do canal mesmo com erp_agente_venda_id já preenchido
    // (usado quando o canal_venda_id foi alterado na edição do agente).
    const recanal = !!it?.recanal;
    if (!agentId) {
      results.push({ agentId: agentId || null, status: 'invalido' });
      continue;
    }

    try {
      const a = (await query(
        `SELECT ${SYNC_AGENT_COLS} FROM agents WHERE id = $1`,
        [agentId]
      )).rows[0];

      if (!a) { results.push({ agentId, status: 'nao_encontrado' }); continue; }

      let erpAgentId = a.erp_agent_id ? Number(a.erp_agent_id) : null;
      let erpAgenteVendaId = a.erp_agente_venda_id ? Number(a.erp_agente_venda_id) : null;
      const precisaErpAgentId = !erpAgentId;
      const precisaCanal = !!a.canal_venda_id && (!erpAgenteVendaId || recanal);

      // Nada a fazer? (já vinculado e canal já registrado, ou sem canal a registrar)
      if (!precisaErpAgentId && !precisaCanal) {
        results.push({ agentId, status: 'ja_vinculado', erpAgentId });
        continue;
      }
      if (!a.cpf) { results.push({ agentId, status: 'sem_cpf', erpAgentId }); continue; }

      // Resolve no ERP via API REST — fornece usuarioId (erp_agent_id), pessoaInternalId
      // (para o canal), login e nome (para validação).
      const r = await resolveAgentErpByCpfViaApi(token, a.cpf);
      let login = r.login || null;
      const actions = [];

      // 1. erp_agent_id (só grava com nome batendo, ou force para divergência revisada)
      if (precisaErpAgentId) {
        if (r.status !== 'ok' || !r.usuarioId) {
          results.push({ agentId, status: r.status || 'usuario_nao_encontrado' });
          continue;
        }
        const nameMatch = r.nomeErp
          ? normalizeNameForMatch(r.nomeErp) === normalizeNameForMatch(a.name)
          : false;
        if (!nameMatch && !force) {
          results.push({ agentId, status: 'nome_divergente', nomeErp: r.nomeErp });
          continue;
        }
        try {
          await query('UPDATE agents SET erp_agent_id = $1 WHERE id = $2', [r.usuarioId, agentId]);
        } catch (updErr) {
          results.push({ agentId, status: 'erro', erro: `Falha ao gravar erp_agent_id (possível duplicata): ${updErr.message}` });
          continue;
        }
        erpAgentId = r.usuarioId;
        actions.push('vinculo');
      }

      // 2. Canal de vendas — registra e grava erp_agente_venda_id quando há canal
      // definido e ainda não vinculado. Não depende do nome (usa pessoaInternalId).
      if (precisaCanal) {
        if (!r.pessoaInternalId) {
          // Sem Pessoa resolvível: não dá para registrar o canal.
          results.push({ agentId, status: actions.length ? 'vinculado_sem_canal' : 'pessoa_nao_encontrada', erpAgentId, login });
          continue;
        }
        try {
          const prevVendaId = erpAgenteVendaId;
          const novoVendaId = await registerAgentInCanal(
            Number(r.pessoaInternalId),
            Number(a.canal_venda_id),
            a.canal_venda_grupo_id ? Number(a.canal_venda_grupo_id) : null
          );
          // Só grava/conta a ação se o vínculo realmente mudou (registerAgentInCanal
          // é idempotente: pode retornar o mesmo id quando o canal não mudou).
          if (novoVendaId !== prevVendaId) {
            await query('UPDATE agents SET erp_agente_venda_id = $1 WHERE id = $2', [novoVendaId, agentId]);
            actions.push('canal');
          }
          erpAgenteVendaId = novoVendaId;
        } catch (canalErr) {
          results.push({ agentId, status: 'vinculado_sem_canal', erpAgentId, login, canalErro: canalErr.message });
          continue;
        }
      }

      results.push({ agentId, status: actions.length ? 'ok' : 'ja_vinculado', erpAgentId, erpAgenteVendaId, login, actions });
    } catch (e) {
      results.push({ agentId, status: 'erro', erro: e.message });
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

    // Define usuario_inclusao sempre no servidor (login nativo do vendedor, ou fallback
    // por e-mail do JWT). Ignora o valor enviado pelo cliente para que a autoria do
    // orçamento no ERP não possa ser forjada pelo frontend.
    {
      const ui = await resolveUsuarioInclusao(req);
      if (ui) payload.usuario_inclusao = ui; else delete payload.usuario_inclusao;
    }

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
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/erp/pre-proposta
// Cria uma proposta completa (header + endereço + produto + 1 beneficiário) via POST /PrePropostaUsuarioSgprc
router.post('/pre-proposta', authMiddleware, async (req, res) => {
  const token = getToken(res);
  if (!token) return;
  try {
    // `modulo` é metadado do Bom Flow (rastreio CRM), NÃO deve ser enviado ao ERP.
    const { modulo: moduloOrcamento, ...payload } = { ...req.body };

    // Define usuario_inclusao sempre no servidor. O campo diz ao ERP quem criou o
    // orçamento; sem ele o ERP usa o dono do token (acesso.api) que não tem permissão
    // para o bloco SGPRC_USUARIO.CAD_ORCAMENTO_SGPRC_USUARIO_FECHAMENTO. Frente 3:
    // prioriza o login nativo do vendedor (via erp_agent_id); ignora o valor do cliente.
    {
      const ui = await resolveUsuarioInclusao(req);
      if (ui) payload.usuario_inclusao = ui; else delete payload.usuario_inclusao;
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
