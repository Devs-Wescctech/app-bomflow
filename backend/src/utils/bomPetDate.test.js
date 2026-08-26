import test from 'node:test';
import assert from 'node:assert/strict';

import {
  formatBomPetDateTime,
  getBomPetDateParts,
  isValidBomPetDateOnly,
  serializeBomPetTimestamp,
} from './bomPetDate.js';
import {
  formatBomPetDate,
  formatBomPetDateForFile,
  formatBomPetDateTime as formatFrontendDateTime,
  formatBomPetTime,
  getBomPetDateParts as getFrontendDateParts,
} from '../../../src/utils/bomPetDate.js';

test('formata um instante conhecido no horário de Brasília', () => {
  assert.equal(
    formatBomPetDateTime('2025-12-31T00:00:00.000Z'),
    '30/12/2025, 21:00'
  );
  assert.deepEqual(getBomPetDateParts('2025-12-31T00:00:00.000Z'), {
    month: '12',
    day: '30',
    year: '2025',
    hour: '21',
    minute: '00',
  });
  assert.equal(formatFrontendDateTime('2025-12-31T00:00:00.000Z'), '30/12/2025, 21:00');
  assert.deepEqual(
    getFrontendDateParts('2025-12-31T00:00:00.000Z'),
    getBomPetDateParts('2025-12-31T00:00:00.000Z')
  );
  assert.equal(formatBomPetTime('2025-12-31T00:00:00.000Z'), '21:00');
  assert.equal(formatBomPetDateForFile('2025-12-31T00:00:00.000Z'), '20251230');
});

test('preserva datas sem horário como datas de calendário', () => {
  assert.equal(formatBomPetDate('2025-12-31'), '31/12/2025');
});

test('serializa datas da API como instantes ISO inequívocos', () => {
  assert.equal(
    serializeBomPetTimestamp(new Date('2025-12-31T00:00:00.123Z')),
    '2025-12-31T00:00:00.123Z'
  );
  assert.equal(serializeBomPetTimestamp(null), null);
});

test('valida filtros de data como datas de calendário', () => {
  assert.equal(isValidBomPetDateOnly('2025-02-28'), true);
  assert.equal(isValidBomPetDateOnly('2025-02-29'), false);
  assert.equal(isValidBomPetDateOnly('2025-2-28'), false);
});