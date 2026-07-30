import { extractApiError } from "@/utils/apiError";
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
// Retorna { pessoa, usuarioErp }:
//   pessoa     → objeto da pessoa encontrada ou null se não existir
//   usuarioErp → { id, login, ativo } do usuário ERP já vinculado à
//                pessoa, ou null se não houver (evita duplicar usuário)
// ------------------------------------------------------------
export async function getPessoaByErp(cpf) {
  const res = await fetch(`/api/erp/pessoa?cpf=${encodeURIComponent(cpf)}`, {
    headers: authHeaders()
  });
  if (!res.ok) throw new Error(await extractApiError(res, 'Erro ao buscar pessoa no ERP.'));
  const data = await res.json();
  return { pessoa: data?.pessoa ?? null, usuarioErp: data?.usuarioErp ?? null };
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
  if (!res.ok) throw new Error(await extractApiError(res, 'Erro ao criar pessoa no ERP.'));
  const data = await res.json();
  if (data?.error) throw new Error(data.error);
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
  if (!res.ok) throw new Error(await extractApiError(res, 'Erro ao criar usuário no ERP.'));
  const data = await res.json();
  if (data?.error) throw new Error(data.error);
  return data; // { id: number, login: string }
}
