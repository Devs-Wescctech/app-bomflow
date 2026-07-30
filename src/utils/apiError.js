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
    return `Serviço indisponível (HTTP ${res.status}). Tente novamente em instantes; se persistir, contate o suporte.`;
  }
  return errData?.error || errData?.message || `${fallback} (HTTP ${res.status})`;
}
