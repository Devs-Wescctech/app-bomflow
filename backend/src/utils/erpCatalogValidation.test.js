import test from 'node:test';
import assert from 'node:assert/strict';

import { assessCatalogSelection } from './erpCatalogValidation.js';

const item = (overrides = {}) => ({
  produtoId: 203567310,
  preco: 20,
  ...overrides,
});

const row = (overrides = {}) => ({
  produto_id: 203567310,
  contrato_id: 830,
  titulo_contrato: 'BOM PASTOR',
  preco_informado: 20,
  ...overrides,
});

test('aceita produto publicado pela API para contrato e título exatos', () => {
  const result = assessCatalogSelection({
    contractId: 830,
    title: 'BOM PASTOR',
    items: [item()],
    rows: [row()],
  });

  assert.equal(result.ok, true);
  assert.equal(result.items[0].preco, 20);
});

test('rejeita produto que não foi publicado pela API para o título', () => {
  const result = assessCatalogSelection({
    contractId: 830,
    title: 'BOM PASTOR',
    items: [item({ produtoId: 52247119, preco: 15 })],
    rows: [],
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'sem_vinculo_no_titulo');
});

test('rejeita correspondência parcial de título', () => {
  const result = assessCatalogSelection({
    contractId: 830,
    title: 'BOM PASTOR',
    items: [item()],
    rows: [row({ titulo_contrato: 'BOM PASTOR - IDEAL' })],
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'sem_vinculo_no_titulo');
});

test('rejeita preço copiado do navegador quando o ERP mudou', () => {
  const result = assessCatalogSelection({
    contractId: 830,
    title: 'BOM PASTOR',
    items: [item({ preco: 15 })],
    rows: [row({ preco_informado: 20 })],
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'preco_desatualizado');
  assert.equal(result.details[0].precoAtual, 20);
});

test('rejeita contrato com mesmo título mas ID diferente', () => {
  const result = assessCatalogSelection({
    contractId: 831,
    title: 'BOM PASTOR',
    items: [item()],
    rows: [row()],
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'sem_vinculo_no_titulo');
});

test('aceita linhas duplicadas da API quando o preço é o mesmo', () => {
  const result = assessCatalogSelection({
    contractId: 830,
    title: 'BOM PASTOR',
    items: [item()],
    rows: [row(), row()],
  });

  assert.equal(result.ok, true);
  assert.equal(result.items[0].preco, 20);
});

test('rejeita linhas duplicadas da API quando o preço é ambíguo', () => {
  const result = assessCatalogSelection({
    contractId: 830,
    title: 'BOM PASTOR',
    items: [item()],
    rows: [row(), row({ preco_informado: 25 })],
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'preco_ERP_ambiguo_ou_ausente');
});

test('rejeita valor com fração de centavo e devolve preço ERP autoritativo', () => {
  const invalid = assessCatalogSelection({
    contractId: 830,
    title: 'BOM PASTOR',
    items: [item({ preco: 19.999 })],
    rows: [row()],
  });
  assert.equal(invalid.code, 'preco_desatualizado');

  const valid = assessCatalogSelection({
    contractId: 830,
    title: 'BOM PASTOR',
    items: [item({ preco: 20.0 })],
    rows: [row({ preco_informado: '20.00' })],
  });
  assert.equal(valid.ok, true);
  assert.equal(valid.items[0].preco, 20);
});