export const DOC_TIPOS = [
  { tipo: "documento_identidade", label: "Documento (CPF/RG)" },
  { tipo: "comprovante_residencia", label: "Comprovante de residência" },
  { tipo: "taxa_adesao", label: "Taxa de adesão" },
  { tipo: "copia_contrato", label: "Cópia do contrato" },
];

// Regra de produto: a taxa de adesão é opcional quando Adesão Zero está marcada
// como Sim (`true`). Estados ainda não carregados/legados permanecem
// conservadores até haver uma decisão explícita.
export function getRequiredDocTipos(adesaoZero) {
  return adesaoZero === true
    ? DOC_TIPOS.filter(({ tipo }) => tipo !== "taxa_adesao")
    : DOC_TIPOS;
}

export function isDocumentUploadAllowed(tipo, adesaoZero) {
  return !(tipo === "taxa_adesao" && adesaoZero === true);
}