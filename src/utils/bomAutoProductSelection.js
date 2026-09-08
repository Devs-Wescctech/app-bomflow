export function normalizeBomAutoDescription(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function getBomAutoVariant(prod) {
  const description = normalizeBomAutoDescription(prod?.descricao || prod?.titulo_contrato);
  if (/\bNAO\s+CLIENTES?\b/.test(description)) return "nao-clientes";
  if (/\bCLIENTES?\b/.test(description)) return "clientes";
  return "";
}

export function selectBomAutoProductForVariant(products, variant) {
  const candidates = Array.isArray(products) ? products : [];
  if (!variant) return candidates[0] || null;
  return candidates.find((prod) => getBomAutoVariant(prod) === variant) || candidates[0] || null;
}

export function findBomAutoConductorForVehicle(vehicle, products) {
  if (!vehicle) return null;
  const vehicleDescription = normalizeBomAutoDescription(vehicle.descricao || vehicle.titulo_contrato);
  const target = vehicleDescription.replace(/DADOS DO VEICULO/i, "DADOS DO CONDUTOR");
  if (!target || target === vehicleDescription) return null;
  const vehicleContractId = String(vehicle.contrato_id ?? "");
  const vehicleTitle = String(vehicle.titulo_contrato || "").trim();
  if (!vehicleContractId || !vehicleTitle) return null;
  return (
    (Array.isArray(products) ? products : []).find(
      (prod) =>
        String(prod?.contrato_id ?? "") === vehicleContractId &&
        String(prod?.titulo_contrato || "").trim() === vehicleTitle &&
        /DADOS DO CONDUTOR/i.test(normalizeBomAutoDescription(prod?.descricao || prod?.titulo_contrato)) &&
        normalizeBomAutoDescription(prod?.descricao || prod?.titulo_contrato) === target
    ) || null
  );
}

export function getBomAutoVehicleCatalogIssue(selectedProductIds, titleProducts) {
  const selectedIds = new Set(
    (Array.isArray(selectedProductIds) ? selectedProductIds : []).map(String)
  );
  const selectedVehicle = (Array.isArray(titleProducts) ? titleProducts : []).find(
    (prod) =>
      selectedIds.has(String(prod?.id)) &&
      /DADOS DO VEICULO/i.test(
        normalizeBomAutoDescription(prod?.descricao || prod?.titulo_contrato)
      )
  );
  if (!selectedVehicle) return "";
  if (findBomAutoConductorForVehicle(selectedVehicle, titleProducts)) return "";
  return "Este título não publica o produto de condutor correspondente no ERP. Corrija o vínculo do catálogo antes de continuar.";
}