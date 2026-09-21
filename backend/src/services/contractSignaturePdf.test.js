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

test('Essencial aplica a assinatura no protocolo e no encerramento do contrato', () => {
  assert.deepEqual(
    CONTRACT_SIGNATURE_LAYOUTS.essencial.map((layout) => layout.page),
    [5, 14],
  );
});

test('Bom Família aplica a assinatura no contrato e nos três termos adicionais', () => {
  assert.deepEqual(
    CONTRACT_SIGNATURE_LAYOUTS.bom_familia.map((layout) => layout.page),
    [15, 17, 18, 19],
  );
});

test('Bom Ideal aplica a assinatura no encerramento do contrato', () => {
  assert.deepEqual(
    CONTRACT_SIGNATURE_LAYOUTS.bom_ideal.map((layout) => layout.page),
    [16],
  );
});

test('Bom Pet Saúde Individual assina o protocolo e o encerramento do contrato', () => {
  assert.deepEqual(
    CONTRACT_SIGNATURE_LAYOUTS.bom_pet_saude_individual.map((layout) => layout.page),
    [4, 10],
  );
});

test('Combo Multi Bem Estar assina os encerramentos dos blocos contratuais', () => {
  assert.deepEqual(
    CONTRACT_SIGNATURE_LAYOUTS.combo_multi_bem_estar.map((layout) => layout.page),
    [1, 8, 9, 16, 17],
  );
});

test('Novo Combo Multi Bem Estar assina protocolo, contratos e anexos', () => {
  assert.deepEqual(
    CONTRACT_SIGNATURE_LAYOUTS.novo_combo_multi_bem_estar.map((layout) => layout.page),
    [1, 8, 9, 16, 17, 18, 19],
  );
});

test('Combo Multi Seleção assina protocolo e encerramentos contratuais', () => {
  assert.deepEqual(
    CONTRACT_SIGNATURE_LAYOUTS.combo_multi_selecao.map((layout) => layout.page),
    [1, 8, 9, 16, 17, 18, 19],
  );
});
