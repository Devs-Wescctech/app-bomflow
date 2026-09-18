import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPresalesDashboard,
  validatePresalesDashboardFilters,
} from './presalesDashboardService.js';

const now = new Date('2026-09-18T12:00:00Z');
const rows = [
  { id: '1', erp_pedido_id: 1, status: 'concluida', resultado: 'aprovado', assumido_at: '2026-09-10T12:00:00Z', concluida_at: '2026-09-12T12:00:00Z', orcamento_criado_at: '2026-09-10T06:00:00Z', auditor_id: 'a', auditor_nome: 'Ana', cliente_nome: 'Cliente A' },
  { id: '2', erp_pedido_id: 2, status: 'em_auditoria', assumido_at: '2026-09-15T12:00:00Z', updated_at: '2026-09-16T12:00:00Z', orcamento_criado_at: '2026-09-15T08:00:00Z', auditor_id: 'a', auditor_nome: 'Ana', cliente_nome: 'Cliente B' },
  { id: '3', erp_pedido_id: 3, status: 'em_auditoria', assumido_at: '2026-09-14T12:00:00Z', adjustment_status: 'pendente', adjustment_updated_at: '2026-09-17T12:00:00Z', orcamento_criado_at: '2026-09-14T02:00:00Z', auditor_id: 'b', auditor_nome: 'Bia', cliente_nome: 'Cliente A' },
  { id: '4', erp_pedido_id: 4, status: 'concluida', resultado: 'liberada', assumido_at: '2026-09-11T12:00:00Z', concluida_at: '2026-09-11T18:00:00Z', orcamento_criado_at: '2026-09-11T10:00:00Z', auditor_id: 'b', auditor_nome: 'Bia', cliente_nome: 'Cliente C' },
];

test('calcula indicadores, status e desempenho do Pré-Vendas', () => {
  const result = buildPresalesDashboard(rows, { now, startDate: '2026-09-01', endDate: '2026-09-18' });
  assert.deepEqual(result.summary, {
    total: 4,
    pending: 2,
    approved: 1,
    adjustments_pending: 1,
    approval_rate: 25,
    avg_approval_hours: 48,
    avg_pickup_hours: 5.5,
  });
  assert.equal(result.attention[0].id, '3');
  assert.equal(result.items.find((item) => item.id === '3').status, 'ajuste_pendente');
  assert.deepEqual(result.attendants.find((item) => item.name === 'Ana'), {
    id: 'a', name: 'Ana', total: 2, approved: 1, pending: 1, adjustments_pending: 0,
    approval_rate: 50, avg_approval_hours: 48, avg_pickup_hours: 5, avg_pending_hours: 72,
  });
});

test('evolução semanal separa entradas, aprovações e duração média', () => {
  const result = buildPresalesDashboard(rows, { now, granularity: 'week', startDate: '2026-09-01', endDate: '2026-09-18' });
  const week = result.evolution.find((item) => item.period_start === '2026-09-07');
  assert.equal(week.period_end, '2026-09-13');
  assert.equal(week.entered, 2);
  assert.equal(week.approved, 1);
  assert.equal(week.avg_approval_hours, 48);
});

test('combina filtros de atendente, status e cliente', () => {
  const result = buildPresalesDashboard(rows, {
    now,
    startDate: '2026-09-01',
    endDate: '2026-09-18',
    attendantId: 'b',
    status: 'ajuste_pendente',
    client: 'cliente a',
  });
  assert.deepEqual(result.items.map((item) => item.id), ['3']);
});

test('valida filtros gerenciais', () => {
  assert.equal(validatePresalesDashboardFilters({ status: 'aprovada', granularity: 'week' }), null);
  assert.match(validatePresalesDashboardFilters({ status: 'x' }), /Status/);
  assert.match(validatePresalesDashboardFilters({ granularity: 'year' }), /Agrupamento/);
  assert.match(validatePresalesDashboardFilters({ attendant_id: 'x' }), /Atendente/);
});