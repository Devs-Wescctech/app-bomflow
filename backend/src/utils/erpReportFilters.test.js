import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  SEM_CANAL_FILTER,
  appendCanalCondition,
  parseCanalFilter,
} from './erpReportFilters.js';

test('aceita todos os canais, inclusive o valor usado pela UI', () => {
  assert.deepEqual(parseCanalFilter(undefined), { kind: 'all', id: null });
  assert.deepEqual(parseCanalFilter('todos'), { kind: 'all', id: null });
  assert.deepEqual(parseCanalFilter(' TODOS '), { kind: 'all', id: null });
  assert.deepEqual(parseCanalFilter(''), { kind: 'all', id: null });
});

test('separa canal específico de orçamento sem vínculo', () => {
  assert.deepEqual(parseCanalFilter('297856229'), { kind: 'specific', id: 297856229 });
  assert.deepEqual(parseCanalFilter(297856229), { kind: 'specific', id: 297856229 });
  assert.deepEqual(parseCanalFilter(SEM_CANAL_FILTER), { kind: 'without', id: null });
});

test('canal inválido não pode virar consulta sem filtro', () => {
  assert.equal(parseCanalFilter('não-é-um-id').kind, 'invalid');
});

test('filtro sem canal usa IS NULL e não adiciona parâmetro', () => {
  const conditions = ['p.data_inclusao >= $1::date'];
  const params = ['2026-08-01'];

  appendCanalCondition(conditions, params, SEM_CANAL_FILTER);

  assert.deepEqual(params, ['2026-08-01']);
  assert.deepEqual(conditions, [
    'p.data_inclusao >= $1::date',
    'pcv.contrato_id IS NULL',
  ]);
});

test('filtro específico mantém os parâmetros anteriores e usa o próximo placeholder', () => {
  const conditions = ['p.data_inclusao >= $1::date', 'p.situacao = $2'];
  const params = ['2026-08-01', 'I'];

  appendCanalCondition(conditions, params, '77');

  assert.deepEqual(params, ['2026-08-01', 'I', 77]);
  assert.equal(conditions.at(-1), 'pcv.contrato_id = $3');
});

test('todos os canais não acrescenta condição nem restringe vínculos ausentes', () => {
  const conditions = ['1=1'];
  const params = [];

  appendCanalCondition(conditions, params, 'todos');

  assert.deepEqual(conditions, ['1=1']);
  assert.deepEqual(params, []);
});

test('relatório resolve o canal pelo vínculo histórico salvo no pedido', () => {
  const source = readFileSync(
    new URL('../services/erpDbService.js', import.meta.url),
    'utf8',
  );

  assert.match(
    source,
    /LEFT JOIN pessoas_contratos pcv ON pcv\.id = p\.agente_venda_id/,
  );
  assert.match(source, /pcv\.contrato_id\s+AS canal_id/);
  assert.doesNotMatch(source, /p\.contrato_id\s+AS canal_id/);
});