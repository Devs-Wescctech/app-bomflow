// ============================================================
// ERP Client — Bom Pastor
// As chamadas ao ERP passam pelo backend (/api/erp/*) para
// manter o ERP_AUTH_TOKEN e os defaults de provisionamento
// seguros no servidor (ver backend/src/routes/erpProxy.js).
// ============================================================

function authHeaders() {
  const token = localStorage.getItem('accessToken') || localStorage.getItem('auth_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

// ------------------------------------------------------------
// getPessoaByErp(cpf)
// Busca uma Pessoa no ERP pelo CPF.
// Retorna o objeto da pessoa encontrada ou null se não existir.
// ------------------------------------------------------------
export async function getPessoaByErp(cpf) {
  const res = await fetch(`/api/erp/pessoa?cpf=${encodeURIComponent(cpf)}`, {
    headers: authHeaders()
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'Erro ao buscar pessoa no ERP.');
  return data?.pessoa ?? null;
}

// ------------------------------------------------------------
// createPessoaErp(payload)
// Cria uma Pessoa Física no ERP.
// payload: { tipo_pessoa, nome_completo, cpf, situacao }
// ------------------------------------------------------------
export async function createPessoaErp(payload) {
  const res = await fetch('/api/erp/pessoa', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok || data?.error) throw new Error(data?.error || 'Erro ao criar pessoa no ERP.');
  return data; // { pessoa: "CODIGO", nome_completo: "..." }
}

// ------------------------------------------------------------
// createUsuarioErp(payload)
// Cria um Usuário no ERP vinculado a uma Pessoa.
// payload: { login, pessoa }  (o backend injeta estabelecimento_padrao,
//            senha_prot e copiar_direitos_de). NÃO enviar `ativo`.
// Lança Error se o ERP retornar erro.
// ------------------------------------------------------------
export async function createUsuarioErp(payload) {
  const res = await fetch('/api/erp/usuario', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok || data?.error) throw new Error(data?.error || 'Erro ao criar usuário no ERP.');
  return data; // { id: number, login: string }
}
