const digits = (value) => String(value || '').replace(/\D/g, '');

export const LEGACY_SIGNATURE_TEST_REFERENCE = '999999999';
export const LEGACY_SIGNATURE_TEST_CPF = '00000000000';

export const isLegacySignaturePersistentTestEnabled = () =>
  String(process.env.LEGACY_SIGNATURE_PERSIST_TEST_ENABLED || '').toLowerCase() === 'true';

export function isLegacySignatureTestLookup(document, reference) {
  if (!isLegacySignaturePersistentTestEnabled()) return false;
  return digits(document) === LEGACY_SIGNATURE_TEST_CPF
    || digits(reference) === LEGACY_SIGNATURE_TEST_REFERENCE;
}

export function assertLegacySignatureTestContract(reference, cpf) {
  if (!isLegacySignaturePersistentTestEnabled()
    || digits(reference) !== LEGACY_SIGNATURE_TEST_REFERENCE
    || digits(cpf) !== LEGACY_SIGNATURE_TEST_CPF) {
    const error = new Error('O contrato reservado para homologação não está habilitado.');
    error.statusCode = 404;
    throw error;
  }
  return {
    reference: LEGACY_SIGNATURE_TEST_REFERENCE,
    cpf: LEGACY_SIGNATURE_TEST_CPF,
  };
}
