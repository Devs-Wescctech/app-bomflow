const ADDRESS_PATTERN = /\b(endere[cç]o|cep|cidade|munic[ií]pio|uf|logradouro|bairro|complemento|resid[eê]ncia|rua|avenida|n[úu]mero\s+(?:do\s+endere[cç]o|da\s+(?:casa|resid[eê]ncia)))\b/i;

export function presalesAdjustmentType(ajuste) {
  if (ajuste?.tipo_ajuste === "endereco" || ajuste?.tipo_ajuste === "cadastro") {
    return ajuste.tipo_ajuste;
  }
  return ADDRESS_PATTERN.test(ajuste?.texto || "") ? "endereco" : "cadastro";
}

export function presalesAdjustmentOpenMode(ajuste) {
  return ajuste?.status === "pendente" && presalesAdjustmentType(ajuste) === "cadastro"
    ? "erp-correction"
    : "documents";
}