// Helper compartilhado para buscar TODOS os registros de APIs de lista do ERP (BP_MULTI).
// O servidor REST do ERP limita respostas a 100 linhas por padrão; é obrigatório
// paginar com limit/offset e acumular até a página vir incompleta.
const PAGE_SIZE = 10000;
const MAX_PAGES = 50;

// Erro tipado para falhas upstream do ERP (status HTTP != 2xx, timeout, payload inválido).
// Handlers HTTP devem mapear para 502 (Bad Gateway) quando aplicável.
export class ErpUpstreamError extends Error {
  constructor(message, statusCode = null) {
    super(message);
    this.name = 'ErpUpstreamError';
    this.isErpUpstream = true;
    this.statusCode = statusCode;
  }
}

export async function fetchErpAllPages(baseUrl, authHeader, { label = 'ERP', extraParams = null, timeoutMs = 120000 } = {}) {
  const allData = [];

  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams(extraParams || undefined);
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String(page * PAGE_SIZE));

    const url = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}${params.toString()}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
        signal: controller.signal
      });
    } catch (err) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        throw new ErpUpstreamError(`[${label}] Timeout ao consultar ERP (página ${page + 1})`);
      }
      throw new ErpUpstreamError(`[${label}] Falha de rede ao consultar ERP (página ${page + 1}): ${err.message}`);
    }
    clearTimeout(timeout);

    if (!response.ok) {
      throw new ErpUpstreamError(`[${label}] ERP retornou status ${response.status} na página ${page + 1}`, response.status);
    }

    const pageData = await response.json();
    if (!Array.isArray(pageData)) {
      throw new ErpUpstreamError(`[${label}] ERP retornou resposta não-array na página ${page + 1}`);
    }

    allData.push(...pageData);

    if (pageData.length < PAGE_SIZE) {
      console.log(`[${label}] Paginação ERP completa: ${allData.length} registros em ${page + 1} página(s)`);
      return allData;
    }
  }

  console.warn(`[${label}] Limite de segurança MAX_PAGES (${MAX_PAGES}) atingido; retornando ${allData.length} registros`);
  return allData;
}
