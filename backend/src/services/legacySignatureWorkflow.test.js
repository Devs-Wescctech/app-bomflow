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

test('definitive signing stores the image and reuses a document-only database row', () => {
  assert.match(routeSource, /router\.post\('\/contracts\/signature'/);
  assert.match(routeSource, /saveContractSignature/);
  assert.match(routeSource, /updateLegacySignatureRecord/);
  assert.match(routeSource, /insertLegacySignatureSnapshot/);
  assert.match(pageSource, /Assinar contrato/);
  assert.match(pageSource, /Refazer assinatura/);
});

test('redo replaces the signature file and updates the same database row', () => {
  assert.match(routeSource, /router\.post\('\/contracts\/signature\/redo'/);
  assert.match(routeSource, /replaceContractSignature/);
  assert.match(routeSource, /id: existing\.codigo/);
  assert.match(pageSource, /contracts\/signature\/redo/);
  assert.match(pageSource, /Substituir assinatura/);
});

test('document capture accepts camera or upload and persists the database reference', () => {
  assert.match(routeSource, /router\.post\('\/contracts\/document'/);
  assert.match(routeSource, /saveContractDocument/);
  assert.match(routeSource, /contractFile: stored\.fileName/);
  assert.match(routeSource, /replaceExisting: replacingDocument/);
  assert.match(routeSource, /router\.post\('\/contracts\/document\/view'/);
  assert.match(routeSource, /readContractDocument/);
  assert.match(pageSource, /navigator\.mediaDevices/);
  assert.match(pageSource, /Foto documento/);
  assert.match(pageSource, /Reenviar documento/);
  assert.match(pageSource, /Ver documento/);
  assert.match(pageSource, /Salvar documento/);
});

test('PDF and WhatsApp actions reuse the protected contract endpoints', () => {
  assert.match(pageSource, /contracts\/generate/);
  assert.match(pageSource, /contracts\/validate/);
  assert.match(pageSource, /contracts\/send-whatsapp/);
  assert.match(routeSource, /applyContractSignature\(unsignedPdf, signatureImage, productKey\)/);
});
