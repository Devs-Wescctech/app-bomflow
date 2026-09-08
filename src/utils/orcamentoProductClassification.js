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

export function createProdutoSelecionado(prod) {
  return {
    produto_id: String(prod.id),
    preco: prod.preco_informado !== undefined ? String(prod.preco_informado) : "",
    incluir_titular: normalizeIncluirTitular(prod, true),
  };
}