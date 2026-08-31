import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  assertSellerOwnsPresalesAdjustment,
  buildPresalesAdjustmentLink,
} from '../services/presalesAdjustmentAddressService.js';

const listSource = fs.readFileSync(
  new URL('../../../src/pages/PreSalesAjustes.jsx', import.meta.url),
  'utf8'
);
const leadSource = fs.readFileSync(
  new URL('../../../src/pages/LeadDetail.jsx', import.meta.url),
  'utf8'
);
const documentsSource = fs.readFileSync(
  new URL('../../../src/components/orcamento/OrcamentoDocumentos.jsx', import.meta.url),
  'utf8'
);

test('notificação e navegação preservam ajuste, pedido e aba do orçamento', () => {
  assert.equal(
    buildPresalesAdjustmentLink('ajuste 1', 77),
    '/PreSalesAjustes?ajuste_id=ajuste%201&pedido_id=77'
  );
  assert.match(listSource, /card\?\.click\(\)/);
  assert.match(listSource, /ajusteId=\{budgetContext\.ajuste\.id\}/);
  assert.match(listSource, /initialSelectedId=\{budgetContext\.ajuste\.erp_pedido_id\}/);
  assert.match(listSource, /hideList/);
  assert.match(documentsSource, /setSelectedId\(requestedId\)/);
  assert.doesNotMatch(leadSource, /requestedTab === 'orcamento'/);
});

test('edição de endereço usa ajuste autenticado e não confia em pedido enviado pelo cliente', () => {
  assert.equal(
    assertSellerOwnsPresalesAdjustment({ id: 'a1', vendedor_id: 'u1' }, 'u1').id,
    'a1'
  );
  assert.throws(
    () => assertSellerOwnsPresalesAdjustment({ id: 'a1', vendedor_id: 'u2' }, 'u1'),
    (error) => error.statusCode === 403
  );
});