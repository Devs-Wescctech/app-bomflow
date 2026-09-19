import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPostsalesDashboard, validatePostsalesDashboardFilters } from './postsalesDashboardService.js';

const now = new Date('2026-09-18T12:00:00Z');
const rows = [
  { id: '1', status: 'concluida', entry_at: '2026-09-01T12:00:00Z', concluida_at: '2026-09-03T12:00:00Z', auditor_id: 'a', auditor_nome: 'Ana', cliente_nome: 'Cliente A' },
  { id: '2', status: 'fila', entry_at: '2026-09-10T12:00:00Z', last_movement_at: '2026-09-11T12:00:00Z', auditor_id: null, cliente_nome: 'Cliente A' },
  { id: '3', status: 'em_verificacao', entry_at: '2026-09-16T12:00:00Z', last_movement_at: '2026-09-17T12:00:00Z', auditor_id: 'a', auditor_nome: 'Ana', cliente_nome: 'Cliente B' },
  { id: '4', status: 'cancelada', entry_at: '2026-09-01T12:00:00Z', cancelada_at: '2026-09-04T12:00:00Z', auditor_id: 'b', auditor_nome: 'Bia', cliente_nome: 'Cliente C' },
];

test('calcula métricas, pendências, SLA e desempenho pela mesma lista', () => {
  const result = buildPostsalesDashboard(rows, { now, granularity: 'day', startDate: '2026-09-01', endDate: '2026-09-18' });
  assert.deepEqual(result.summary, {
    total: 4, pending: 2, completed: 1, approval_rate: 25,
    avg_approval_hours: 48, sla_breached: 1,
  });
  assert.equal(result.sla[0].id, '2');
  assert.equal(result.sla[0].idle_days, 7);
  assert.equal(result.items.filter((item) => item.sla_breached).length, result.summary.sla_breached);
  assert.deepEqual(result.attendants.find((item) => item.name === 'Ana'), {
    id: 'a', name: 'Ana', total: 2, completed: 1, pending: 1,
    approval_rate: 50, avg_approval_hours: 48, avg_pending_hours: 48,
  });
  assert.equal(result.attendants.find((item) => item.name === 'Sem atendente').avg_pending_hours, 192);
});

test('atribui entradas e conclusões aos períodos dos respectivos eventos', () => {
  const result = buildPostsalesDashboard([
    { id: 'old', status: 'concluida', entry_at: '2026-08-28T12:00:00Z', concluida_at: '2026-09-03T12:00:00Z' },
    { id: 'late', status: 'concluida', entry_at: '2026-09-04T12:00:00Z', concluida_at: '2026-10-01T12:00:00Z' },
  ], { now, granularity: 'day', startDate: '2026-09-01', endDate: '2026-09-30' });
  assert.equal(result.summary.total, 2);
  assert.equal(result.summary.completed, 1);
  assert.deepEqual(result.evolution, [
    { period: '2026-09-03', period_start: '2026-09-03', period_end: '2026-09-03', entered: 0, completed: 1, avg_approval_hours: 144 },
    { period: '2026-09-04', period_start: '2026-09-04', period_end: '2026-09-04', entered: 1, completed: 0, avg_approval_hours: null },
  ]);
});

test('semana informa intervalo legível e tempo médio das conclusões', () => {
  const result = buildPostsalesDashboard([
    { id: 'w1', status: 'concluida', entry_at: '2026-09-08T12:00:00Z', concluida_at: '2026-09-15T12:00:00Z' },
    { id: 'w2', status: 'concluida', entry_at: '2026-09-10T12:00:00Z', concluida_at: '2026-09-17T12:00:00Z' },
  ], { now, granularity: 'week', startDate: '2026-09-01', endDate: '2026-09-30' });
  const week = result.evolution.find((item) => item.period_start === '2026-09-14');
  assert.equal(week.period_end, '2026-09-20');
  assert.equal(week.completed, 2);
  assert.equal(week.avg_approval_hours, 168);
});

test('limite de SLA é estritamente maior que cinco dias', () => {
  const result = buildPostsalesDashboard([
    { id: '5', status: 'fila', entry_at: '2026-09-13T12:00:00Z', last_movement_at: '2026-09-13T12:00:00Z' },
  ], { now });
  assert.equal(result.summary.sla_breached, 0);
});

test('valida status, granularidade, atendente e cliente', () => {
  assert.equal(validatePostsalesDashboardFilters({ status: 'fila', granularity: 'week' }, ['fila']), null);
  assert.match(validatePostsalesDashboardFilters({ status: 'x' }, ['fila']), /Status/);
  assert.match(validatePostsalesDashboardFilters({ granularity: 'year' }, ['fila']), /Agrupamento/);
  assert.match(validatePostsalesDashboardFilters({ attendant_id: 'x' }, ['fila']), /Atendente/);
});