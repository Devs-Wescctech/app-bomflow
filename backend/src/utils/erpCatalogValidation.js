function normalizeId(value) {
  return String(value ?? '');
}

function priceInCents(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric * 100) : null;
}

function hasCanonicalCentPrecision(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) &&
    Math.abs((numeric * 100) - Math.round(numeric * 100)) < 1e-8;
}

/**
 * Confere a seleção do navegador contra uma resposta fresca da
 * API_MV_API_PRODUTOS. A API do ERP é responsável por publicar somente
 * vínculos elegíveis; o Bom Flow exige igualdade exata de contrato e título
 * e usa o preço retornado pela API como valor autoritativo.
 */
export function assessCatalogSelection({ contractId, title, items, rows }) {
  const normalizedContractId = normalizeId(contractId);
  const normalizedTitle = String(title ?? '').trim();
  if (!normalizedContractId || !Number.isSafeInteger(Number(contractId)) || Number(contractId) <= 0) {
    return {
      ok: false,
      code: 'contrato_id_obrigatorio',
      error: 'Não foi possível identificar de forma única o título no ERP. Atualize o catálogo e tente novamente.',
    };
  }
  if (!normalizedTitle) {
    return {
      ok: false,
      code: 'titulo_contrato_obrigatorio',
      error: 'Título do contrato obrigatório: selecione um título antes de enviar o orçamento.',
    };
  }
  const byProduct = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (
      normalizeId(row.contrato_id) !== normalizedContractId ||
      String(row.titulo_contrato ?? '').trim() !== normalizedTitle
    ) {
      continue;
    }
    const productId = normalizeId(row.produto_id);
    if (!productId) continue;
    if (!byProduct.has(productId)) byProduct.set(productId, []);
    byProduct.get(productId).push(row);
  }

  const details = [];
  const validatedItems = [];
  for (const item of Array.isArray(items) ? items : []) {
    const productId = normalizeId(item.produtoId);
    const candidates = byProduct.get(productId) || [];

    if (candidates.length === 0) {
      details.push({
        produtoId: Number(item.produtoId),
        reason: 'sem_vinculo_no_titulo',
      });
      continue;
    }

    const prices = [...new Set(candidates.map((row) => priceInCents(row.preco_informado)))];
    if (prices.includes(null) || prices.length !== 1) {
      details.push({
        produtoId: Number(item.produtoId),
        reason: 'preco_ERP_ambiguo_ou_ausente',
      });
      continue;
    }

    const requestedPrice = priceInCents(item.preco);
    if (!hasCanonicalCentPrecision(item.preco) || requestedPrice === null || requestedPrice !== prices[0]) {
      details.push({
        produtoId: Number(item.produtoId),
        reason: 'preco_desatualizado',
        precoEnviado: Number(item.preco),
        precoAtual: prices[0] / 100,
      });
      continue;
    }

    // A gravação nunca reutiliza o preço enviado pelo navegador: utiliza o
    // valor autoritativo já normalizado em centavos.
    validatedItems.push({ ...item, preco: prices[0] / 100 });
  }

  if (details.length > 0) {
    const first = details[0];
    const messages = {
      sem_vinculo_no_titulo: 'Um ou mais produtos não pertencem ao título de contrato selecionado.',
      preco_desatualizado: 'O preço de um ou mais produtos mudou no ERP. Atualize o catálogo e tente novamente.',
      preco_ERP_ambiguo_ou_ausente: 'O ERP não retornou um preço único e válido para um ou mais produtos.',
    };
    return {
      ok: false,
      code: first.reason,
      error: messages[first.reason] || 'A seleção de produtos não pôde ser validada no ERP.',
      details,
    };
  }

  return { ok: true, items: validatedItems };
}