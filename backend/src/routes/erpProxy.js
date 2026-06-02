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
// Envia SOMENTE os campos necessários conforme a documentação do ERP:
//   obrigatórios -> login, pessoa, estabelecimento_padrao (sempre 104)
//   + senha_prot e copiar_direitos_de (herança de permissões do modelo)
// IMPORTANTE: NÃO enviar `ativo`. Esse campo dispara, no ERP, a validação do
// e-mail da Pessoa (colisão de e-mail vazio com outro usuário) e bloqueia a
// criação. Campos não exigidos (email, super_usuario, observacoes) ficam de fora.
router.post('/usuario', authMiddleware, async (req, res) => {
  const token = getToken(res);
  if (!token) return;

  try {
    const { login, pessoa } = req.body;

    const payload = {
      login: (login || "").toLowerCase().trim(),
      pessoa,
      estabelecimento_padrao: Number(ERP_ESTABELECIMENTO_PADRAO),
      senha_prot: ERP_SENHA_PADRAO,
      copiar_direitos_de: ERP_COPIAR_DIREITOS_DE,
    };

    console.log('ERP /Usuarios payload:', JSON.stringify({ ...payload, senha_prot: '***' }, null, 2));
    const url = `${ERP_BASE}/Usuarios`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    console.log('[ERP POST /usuario] status HTTP:', response.status);
    console.log('[ERP POST /usuario] resposta ERP:', JSON.stringify(data).substring(0, 500));
    if (!response.ok || data?.error) {
      return res.status(response.ok ? 400 : response.status).json({ error: data?.error || 'Erro ao criar usuário no ERP.' });
    }
    return res.json(data);
  } catch (err) {
    console.error('[ERP Proxy] POST /usuario error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
