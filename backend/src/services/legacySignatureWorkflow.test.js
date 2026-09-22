import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const routeSource = readFileSync(
  new URL('../routes/salesContractPrinting.js', import.meta.url),
  'utf8',
);
const pageSource = readFileSync(
  new URL('../../../src/pages/SalesContractSigning.jsx', import.meta.url),
  'utf8',
);

test('signing search requests legacy status without changing the printing search', () => {
  assert.match(pageSource, /includeSignatureStatus/);
  assert.match(routeSource, /findLatestLegacySignatures/);
  assert.match(routeSource, /documentStored/);
});

test('definitive signing stores the image and an immutable database snapshot', () => {
  assert.match(routeSource, /router\.post\('\/contracts\/signature'/);
  assert.match(routeSource, /saveContractSignature/);
  assert.match(routeSource, /insertLegacySignatureSnapshot/);
  assert.match(pageSource, /Assinar contrato/);
  assert.match(pageSource, /Refazer assinatura/);
});

test('document capture accepts camera or upload and persists the database reference', () => {
  assert.match(routeSource, /router\.post\('\/contracts\/document'/);
  assert.match(routeSource, /saveContractDocument/);
  assert.match(pageSource, /navigator\.mediaDevices/);
  assert.match(pageSource, /Foto documento/);
  assert.match(pageSource, /Salvar documento/);
});

test('PDF and WhatsApp actions reuse the protected contract endpoints', () => {
  assert.match(pageSource, /contracts\/generate/);
  assert.match(pageSource, /contracts\/validate/);
  assert.match(pageSource, /contracts\/send-whatsapp/);
  assert.match(routeSource, /applyContractSignature\(unsignedPdf, signatureImage, productKey\)/);
});
