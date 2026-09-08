export function isPetProduto(prod) {
  return /NOME DO PET/i.test(prod?.descricao || prod?.titulo_contrato || "");
}

export function isCondutorProduto(prod) {
  return /DADOS DO CONDUTOR/i.test(prod?.descricao || prod?.titulo_contrato || "");
}

export function isVeiculoProduto(prod) {
  return /DADOS DO VE[IÍ]CULO/i.test(prod?.descricao || prod?.titulo_contrato || "");
}

export function isDependenteProduto(prod) {
  const description = prod?.descricao || prod?.titulo_contrato || "";
  const price = Number(prod?.preco_informado);
  return /DEPENDENTE/i.test(description) && Math.abs(price - 0.01) < 0.005;
}

export function isDependentePagoProduto(prod) {
  const description = prod?.descricao || prod?.titulo_contrato || "";
  const price = Number(prod?.preco_informado);
  return /DEPENDENTE/i.test(description) && Number.isFinite(price) && price > 0.015;
}

export function isProdutoBeneficiario(prod) {
  return (
    isPetProduto(prod) ||
    isCondutorProduto(prod) ||
    isVeiculoProduto(prod) ||
    isDependenteProduto(prod)
  );
}

export function normalizeIncluirTitular(prod, requestedValue) {
  return isProdutoBeneficiario(prod) || isDependentePagoProduto(prod)
    ? false
    : Boolean(requestedValue);
}

export function canProdutoIncluirTitular(prod) {
  return !isProdutoBeneficiario(prod) && !isDependentePagoProduto(prod);
}

export function hasBeneficiarioVinculado(produtoId, beneficiarios) {
  return (Array.isArray(beneficiarios) ? beneficiarios : []).some(
    (beneficiario) =>
      String(beneficiario?.usua_produtos || "") === String(produtoId) &&
      Boolean(beneficiario?.usua_nome_completo?.trim())
  );
}

export function hasAdditionalBomAutoBeneficiaryProduct(
  selectedProducts,
  catalogProducts,
  condutorProductId,
  veiculoProductId
) {
  const fixedIds = new Set(
    [condutorProductId, veiculoProductId]
      .filter((id) => id != null && String(id) !== "")
      .map(String)
  );
  const catalog = Array.isArray(catalogProducts) ? catalogProducts : [];
  return (Array.isArray(selectedProducts) ? selectedProducts : []).some((selected) => {
    const productId = String(selected?.produto_id || "");
    if (!productId || fixedIds.has(productId)) return false;
    const product = catalog.find((item) => String(item?.id) === productId);
    // No BOM AUTO, somente produtos explicitamente classificados como DEPENDENTE
    // liberam e exigem um card adicional de pessoa. Produtos técnicos de R$ 0,01
    // (pet, condutor ou veículo) têm fluxos próprios e não representam dependentes.
    return isDependenteProduto(product) || isDependentePagoProduto(product);
  });
}

export function createProdutoSelecionado(prod) {
  return {
    produto_id: String(prod.id),
    preco: prod.preco_informado !== undefined ? String(prod.preco_informado) : "",
    incluir_titular: normalizeIncluirTitular(prod, true),
  };
}