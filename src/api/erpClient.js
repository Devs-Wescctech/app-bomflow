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
export async function getPessoaByErp(cpf, expectedUsuarioId = null) {
  const params = new URLSearchParams({ cpf });
  if (expectedUsuarioId) params.set('usuarioId', String(expectedUsuarioId));
  const res = await fetch(`/api/erp/pessoa?${params.toString()}`, {
    headers: authHeaders()
  });
  if (res.status === 204) {
    return { pessoa: null, usuarioErp: null, usuariosAmbiguos: [] };
  }
  if (!res.ok) {
    const error = new Error(await extractApiError(res, 'Erro ao buscar pessoa no ERP.'));
    error.status = res.status;
    throw error;
  }
  const data = await res.json().catch(() => ({}));
  return {
    pessoa: data?.pessoa ?? null,
    usuarioErp: data?.usuarioErp ?? null,
    usuariosAmbiguos: data?.usuariosAmbiguos ?? [],
  };
}
