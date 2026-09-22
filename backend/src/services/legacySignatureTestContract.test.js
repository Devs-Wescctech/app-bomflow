import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertLegacySignatureTestContract,
  isLegacySignatureTestLookup,
  LEGACY_SIGNATURE_TEST_CPF,
  LEGACY_SIGNATURE_TEST_REFERENCE,
} from './legacySignatureTestContract.js';

const withFeature = (value, action) => {
  const previous = process.env.LEGACY_SIGNATURE_PERSIST_TEST_ENABLED;
  process.env.LEGACY_SIGNATURE_PERSIST_TEST_ENABLED = value;
  try {
    action();
  } finally {
    if (previous === undefined) delete process.env.LEGACY_SIGNATURE_PERSIST_TEST_ENABLED;
    else process.env.LEGACY_SIGNATURE_PERSIST_TEST_ENABLED = previous;
  }
};

test('keeps the synthetic contract hidden unless the development flag is enabled', () => {
  withFeature('false', () => {
    assert.equal(isLegacySignatureTestLookup(LEGACY_SIGNATURE_TEST_CPF, ''), false);
    assert.equal(isLegacySignatureTestLookup('', LEGACY_SIGNATURE_TEST_REFERENCE), false);
  });
});

test('recognizes only the reserved CPF or contract while enabled', () => {
  withFeature('true', () => {
    assert.equal(isLegacySignatureTestLookup('000.000.000-00', ''), true);
    assert.equal(isLegacySignatureTestLookup('', LEGACY_SIGNATURE_TEST_REFERENCE), true);
    assert.equal(isLegacySignatureTestLookup('', '80777'), false);
  });
});

test('accepts persistence only for the complete reserved pair', () => {
  withFeature('true', () => {
    assert.deepEqual(
      assertLegacySignatureTestContract(LEGACY_SIGNATURE_TEST_REFERENCE, '000.000.000-00'),
      { reference: LEGACY_SIGNATURE_TEST_REFERENCE, cpf: LEGACY_SIGNATURE_TEST_CPF },
    );
    assert.throws(
      () => assertLegacySignatureTestContract('80777', '000.000.000-00'),
      /não está habilitado/i,
    );
  });
});
