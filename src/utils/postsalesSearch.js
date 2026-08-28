export function normalizeSearchText(value) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function matchesPostSalesSearch(item, value) {
  const term = normalizeSearchText(value);
  if (!term) return true;

  const textFields = [item.cliente_nome, item.vendedor_nome, item.erp_numero, item.erp_pedido_id]
    .map(normalizeSearchText);
  if (textFields.some((field) => field.includes(term))) return true;

  const digits = term.replace(/\D/g, "");
  if (!digits) return false;
  return [item.cliente_cpf, item.erp_numero, item.erp_pedido_id]
    .map((field) => String(field || "").replace(/\D/g, ""))
    .some((field) => field.includes(digits));
}