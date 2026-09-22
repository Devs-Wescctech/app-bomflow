import test from 'node:test';
import assert from 'node:assert/strict';
import { CONTRACT_PRODUCTS } from './salesContractModels.js';
import { legacySignatureContractReference } from './legacyContractSignature.js';
import { signatureFileNameFromReference } from './legacySignatureStorage.js';

test('uses the visible order or contact number as the legacy signature reference', () => {
  assert.equal(legacySignatureContractReference({ numeroPedido: '80498' }, CONTRACT_PRODUCTS.ESSENCIAL), '80498');
  assert.equal(legacySignatureContractReference({ numeroPedido: '1401708' }, CONTRACT_PRODUCTS.CONVALESCENCA), '1401708');
});

test('uses the service contract number for Bom Corp', () => {
  assert.equal(legacySignatureContractReference({ contrato: '132383' }, CONTRACT_PRODUCTS.BOM_CORP), '132383');
});

test('accepts old file names and future full paths without allowing another directory', () => {
  assert.equal(signatureFileNameFromReference('80498.png'), '80498.png');
  assert.equal(signatureFileNameFromReference('/var/www/acess_bompastor/assinaturas/80498.png'), '80498.png');
  assert.throws(() => signatureFileNameFromReference('/tmp/assinatura.png'), /referência.*inválida/i);
});
