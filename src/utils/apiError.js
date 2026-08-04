// Extrai uma mensagem de erro legível de uma resposta HTTP de erro.
// Quando o corpo não é JSON (ex.: 404 HTML de um backend desatualizado ou
// proxy fora do ar), inclui o status HTTP na mensagem em vez do texto genérico,
// para facilitar o diagnóstico.
export async function extractApiError(res, fallback = 'Erro ao processar a solicitação.') {
  let errData = null;
  try {
    errData = await res.json();
  } catch {
    // Corpo não-JSON: serviço indisponível ou rota ausente.
    errData = null;
  }
  return apiErrorMessage(res.status, errData, fallback);
}

// Variante para quando o corpo já foi lido (ex.: json parseado antes do check).
// Passe `null`/`undefined` em errData quando o corpo não era JSON.
export function apiErrorMessage(status, errData, fallback = 'Erro ao processar a solicitação.') {
  if (errData === null || errData === undefined) {
    return `Serviço indisponível (HTTP ${status}). Tente novamente em instantes; se persistir, contate o suporte.`;
  }
  return errData.error || errData.message || `${fallback} (HTTP ${status})`;
}
