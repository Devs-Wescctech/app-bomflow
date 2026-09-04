import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildBomPetSelectionValue,
  findBomPetBySelection,
} from '../../../src/utils/bomPetPetSelection.js';

const petsHomônimos = [
  {
    nome: 'LUNA',
    descricao: 'LUNA - POODLE - BRANCO',
    contrato_id: 123,
    erp_pessoa_id: 9001,
  },
  {
    nome: 'LUNA',
    descricao: 'LUNA - SRD - PRETO',
    contrato_id: 123,
    erp_pessoa_id: 9002,
  },
];

test('pets homônimos no mesmo contrato recebem valores de seleção distintos', () => {
  const values = petsHomônimos.map(buildBomPetSelectionValue);
  assert.notEqual(values[0], values[1]);
  assert.equal(new Set(values).size, 2);
});

test('cada opção homônima resolve sua própria descrição e Pessoa ERP', () => {
  for (const expected of petsHomônimos) {
    const selected = findBomPetBySelection(
      petsHomônimos,
      buildBomPetSelectionValue(expected)
    );
    assert.equal(selected.descricao, expected.descricao);
    assert.equal(selected.erp_pessoa_id, expected.erp_pessoa_id);
  }
});