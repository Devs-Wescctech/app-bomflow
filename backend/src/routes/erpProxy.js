import express from 'express';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

const ERP_BASE = 'http://erp.wescctech.com.br:8080/BOMPASTOR/api';

const ERP_ESTABELECIMENTO_PADRAO = process.env.ERP_ESTABELECIMENTO_PADRAO || 104;
const ERP_SENHA_PADRAO           = process.env.ERP_SENHA_PADRAO || 'bp@123';
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

export default router;
