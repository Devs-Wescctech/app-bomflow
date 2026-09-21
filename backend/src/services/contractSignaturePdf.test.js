import test from 'node:test';
import assert from 'node:assert/strict';
import { CONTRACT_PRODUCTS } from './salesContractModels.js';
import { CONTRACT_SIGNATURE_LAYOUTS } from './contractSignaturePdf.js';

test('todos os produtos de contrato possuem posição de assinatura para homologação', () => {
  const missing = Object.values(CONTRACT_PRODUCTS)
    .filter((productKey) => !CONTRACT_SIGNATURE_LAYOUTS[productKey]?.length);
  assert.deepEqual(missing, []);
});

test('posições usam páginas e caixas válidas', () => {
  Object.values(CONTRACT_SIGNATURE_LAYOUTS).flat().forEach((layout) => {
    assert.ok(Number.isInteger(layout.page) && layout.page > 0);
    assert.ok(layout.x >= 0 && layout.top >= 0);
    assert.ok(layout.width > 0 && layout.height > 0);
    assert.ok(layout.x + layout.width <= 210);
    assert.ok(layout.top + layout.height <= 297);
  });
});
