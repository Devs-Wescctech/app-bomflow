export const REQUIRED_DOCUMENTS = [
  { tipo: 'documento_identidade', label: 'Documento (CPF/RG)' },
  { tipo: 'comprovante_residencia', label: 'Comprovante de residência' },
  { tipo: 'taxa_adesao', label: 'Taxa de adesão' },
  { tipo: 'copia_contrato', label: 'Cópia do contrato' },
];

// Regra de produto: a taxa de adesão é opcional quando Adesão Zero está marcada
// como Sim (`true`). Estados nulos/legados permanecem conservadores até a
// decisão ser definida.
export function getRequiredDocumentTypes(adesaoZero) {
  return adesaoZero === true
    ? REQUIRED_DOCUMENTS.filter(({ tipo }) => tipo !== 'taxa_adesao')
    : REQUIRED_DOCUMENTS;
}

export function isDocumentUploadAllowed(tipo, adesaoZero) {
  return !(tipo === 'taxa_adesao' && adesaoZero === true);
}

const REQUIRED_FIELDS = [
  { key: 'cpf', label: 'CPF' },
  { key: 'nome', label: 'Nome completo' },
  { key: 'telefone', label: 'Telefone' },
  { key: 'email', label: 'E-mail' },
  { key: 'endereco', label: 'Endereço completo' },
  { key: 'plano_pagamento', label: 'Plano de pagamento' },
  { key: 'produto', label: 'Produto' },
];

function present(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function hasCompleteAddress(endereco) {
  return !!(
    endereco &&
    present(endereco.cep) &&
    present(endereco.logradouro) &&
    present(endereco.numero) &&
    present(endereco.bairro) &&
    present(endereco.cidade)
  );
}

function hasRealProduct(produto) {
  return produto && !(produto.preco != null && Math.abs(Number(produto.preco) - 0.01) < 0.001);
}

/**
 * Calcula todas as pendências da aprovação sem depender do Express ou do banco.
 * A lista devolvida é a mesma consumida pelo modal para bloquear o botão.
 */
export function getApprovalPending({ orcamento, detalhe, documentTypes }) {
  const pessoas = Array.isArray(detalhe?.pessoas) ? detalhe.pessoas : [];
  const titular = pessoas.find((pessoa) => pessoa.is_titular) || null;
  const produtos = (Array.isArray(detalhe?.produtos) ? detalhe.produtos : [])
    .filter(hasRealProduct);
  const endereco = titular?.endereco || detalhe?.endereco || null;

  const fieldValues = {
    cpf: titular?.cpf || orcamento?.cliente_cpf,
    nome: titular?.nome || orcamento?.cliente_nome,
    telefone: titular?.telefone,
    email: titular?.email || detalhe?.email,
    endereco: hasCompleteAddress(endereco),
    plano_pagamento: detalhe?.plano_pagamento,
    produto: produtos.length > 0,
  };

  const missingFields = REQUIRED_FIELDS
    .filter(({ key }) => key === 'endereco' || key === 'produto'
      ? !fieldValues[key]
      : !present(fieldValues[key]))
    .map(({ key, label }) => ({ key, label }));

  const anexados = documentTypes instanceof Set
    ? documentTypes
    : new Set(Array.isArray(documentTypes) ? documentTypes : []);
  const requiredDocuments = getRequiredDocumentTypes(orcamento?.adesao_zero);
  const missingDocs = requiredDocuments
    .filter(({ tipo }) => !anexados.has(tipo))
    .map(({ tipo, label }) => ({ tipo, label }));

  return {
    missingFields,
    missingDocs,
    pending: [
      ...missingFields.map(({ key, label }) => ({ kind: 'field', key, label })),
      ...missingDocs.map(({ tipo, label }) => ({ kind: 'document', tipo, label })),
    ],
  };
}