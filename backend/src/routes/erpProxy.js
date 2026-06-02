import express from 'express';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

const ERP_BASE = 'http://erp.wescctech.com.br:8080/BOMPASTOR/api';

const ERP_ESTABELECIMENTO_PADRAO = process.env.ERP_ESTABELECIMENTO_PADRAO || 104;
const ERP_SENHA_PADRAO           = process.env.ERP_SENHA_PADRAO || 'bp@2026';
const ERP_COPIAR_DIREITOS_DE     = process.env.ERP_COPIAR_DIREITOS_DE || 'base.upsell';

function getToken(res) {
  const token = process.env.ERP_AUTH_TOKEN;
  if (!token) {
    res.status(500).json({ error: 'ERP_AUTH_TOKEN não configurado.' });
    return null;
  }
  return token;
}

// GET /api/erp/pessoa?cpf=XXX
// Busca pessoa no ERP pelo CPF via API_CADASTRO_PESSOAS
router.get('/pessoa', authMiddleware, async (req, res) => {
  const token = getToken(res);
  if (!token) return;

  const { cpf } = req.query;
  if (!cpf) return res.status(400).json({ error: 'CPF obrigatório.' });

  try {
    const url = `${ERP_BASE}/API_CADASTRO_PESSOAS?cpf=${encodeURIComponent(cpf)}`;
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
    // Remove campo auxiliar 'email' — não vai pro ERP
    const { email: _email, ...body } = req.body;

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
// Cria um Usuário no ERP vinculado a uma Pessoa.
// O frontend envia: { login, email, pessoa, ativo, super_usuario, observacoes }
// O backend injeta os defaults sensíveis (estabelecimento, senha, direitos).
//
// ABORDAGEM EM DUAS ETAPAS (necessária por causa do comportamento do ERP):
//   1) POST /Usuarios COM o email do BomFlow e SEM copiar_direitos_de.
//      O copiar_direitos_de copia "direitos de acesso E preferências" do modelo
//      (base.upsell) e, nessa cópia, arrasta um e-mail que colide com outro
//      usuário do ERP (marcelo.almeida), derrubando a criação com 500.
//   2) PUT /Usuarios/{id} aplicando copiar_direitos_de no usuário já criado,
//      para herdar as permissões do modelo SEM sobrescrever o e-mail informado.
router.post('/usuario', authMiddleware, async (req, res) => {
  const token = getToken(res);
  if (!token) return;

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  try {
    const { login, email, pessoa, ativo, super_usuario, observacoes } = req.body;

    // ---- ETAPA 1: cria o usuário com o e-mail do BomFlow (sem copiar_direitos_de) ----
    const payload = {
      login: (login || "").toLowerCase().trim(),
      pessoa,
      estabelecimento_padrao: Number(ERP_ESTABELECIMENTO_PADRAO),
      senha_prot: ERP_SENHA_PADRAO,
      ativo: ativo || "S",
      super_usuario: super_usuario || "N",
      observacoes: observacoes || "Criado via BomFlow",
      ...(email ? { email: email.trim() } : {}),
    };

    console.log('[ERP usuario][etapa 1] POST /Usuarios payload:', JSON.stringify(payload, null, 2));
    const response = await fetch(`${ERP_BASE}/Usuarios`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    console.log('[ERP usuario][etapa 1] status HTTP:', response.status);
    console.log('[ERP usuario][etapa 1] resposta ERP:', JSON.stringify(data).substring(0, 500));
    if (!response.ok || data?.error) {
      console.error('[ERP usuario][etapa 1] erro debug:', { status: response.status, data });
      return res.status(response.ok ? 400 : response.status).json({ error: data?.error || 'Erro ao criar usuário no ERP.' });
    }

    // ---- ETAPA 2: aplica os direitos do modelo (base.upsell) no usuário recém-criado ----
    const usuarioId = data?.id ?? data?.usuario ?? data?.login;
    let direitos = { ok: false, status: null, data: null };
    if (usuarioId && ERP_COPIAR_DIREITOS_DE) {
      try {
        const putBody = { copiar_direitos_de: ERP_COPIAR_DIREITOS_DE };
        console.log(`[ERP usuario][etapa 2] PUT /Usuarios/${usuarioId} body:`, JSON.stringify(putBody));
        const putResp = await fetch(`${ERP_BASE}/Usuarios/${encodeURIComponent(usuarioId)}`, {
          method: 'PUT',
          headers: authHeaders,
          body: JSON.stringify(putBody),
        });
        const putData = await putResp.json().catch(() => ({}));
        direitos = { ok: putResp.ok && !putData?.error, status: putResp.status, data: putData };
        console.log('[ERP usuario][etapa 2] status HTTP:', putResp.status);
        console.log('[ERP usuario][etapa 2] resposta ERP:', JSON.stringify(putData).substring(0, 500));
      } catch (putErr) {
        direitos = { ok: false, status: null, data: { error: putErr.message } };
        console.error('[ERP usuario][etapa 2] erro ao copiar direitos:', putErr.message);
      }
    } else {
      console.warn('[ERP usuario][etapa 2] pulada — sem id do usuário ou sem modelo de direitos.', { usuarioId, modelo: ERP_COPIAR_DIREITOS_DE });
    }

    // O usuário foi criado com sucesso na etapa 1; a cópia de direitos vai como metadado.
    return res.json({ ...data, _direitos_copiados: direitos.ok, _direitos_debug: direitos });
  } catch (err) {
    console.error('[ERP Proxy] POST /usuario error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
