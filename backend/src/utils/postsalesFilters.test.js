import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDateRange } from './postsalesFilters.js';

test('aceita intervalo inclusivo e datas opcionais', () => {
  assert.equal(validateDateRange('2026-08-01', '2026-08-28'), null);
  assert.equal(validateDateRange('2026-08-28', '2026-08-28'), null);
  assert.equal(validateDateRange(null, null), null);
});

test('rejeita formato ou data de calendário inválidos', () => {
  assert.match(validateDateRange('01/08/2026', '2026-08-28'), /AAAA-MM-DD/);
  assert.match(validateDateRange('2026-02-30', '2026-08-28'), /data válida/);
});

test('rejeita início posterior ao fim', () => {
  assert.match(validateDateRange('2026-08-29', '2026-08-28'), /data inicial/);
});