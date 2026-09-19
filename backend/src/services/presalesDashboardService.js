const DAY_MS = 86_400_000;
export const PRESALES_DASHBOARD_STATUSES = ['em_auditoria', 'ajuste_pendente', 'aprovada', 'concluida'];

function asDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function hoursBetween(from, to) {
  const start = asDate(from);
  const end = asDate(to);
  if (!start || !end || end < start) return null;
  return Math.round(((end - start) / 3_600_000) * 10) / 10;
}

function average(values) {
  const valid = values.filter(Number.isFinite);
  if (!valid.length) return null;
  return Math.round((valid.reduce((sum, value) => sum + value, 0) / valid.length) * 10) / 10;
}

function periodKey(value, granularity) {
  const date = asDate(value);
  if (!date) return null;
  if (granularity === 'day') return date.toISOString().slice(0, 10);
  if (granularity === 'month') return date.toISOString().slice(0, 7);
  const thursday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  thursday.setUTCDate(thursday.getUTCDate() + 4 - (thursday.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((thursday - yearStart) / DAY_MS) + 1) / 7);
  return `${thursday.getUTCFullYear()}-S${String(week).padStart(2, '0')}`;
}

function periodBounds(value, granularity) {
  const date = asDate(value);
  if (!date) return { start: null, end: null };
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const end = new Date(start);
  if (granularity === 'week') {
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
    end.setTime(start.getTime());
    end.setUTCDate(end.getUTCDate() + 6);
  } else if (granularity === 'month') {
    start.setUTCDate(1);
    end.setUTCMonth(end.getUTCMonth() + 1, 0);
  }
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function itemStatus(row) {
  if (row.status === 'concluida' && row.resultado === 'aprovado') return 'aprovada';
  if (row.status === 'em_auditoria' && row.adjustment_status === 'pendente') return 'ajuste_pendente';
  if (row.status === 'em_auditoria') return 'em_auditoria';
  return 'concluida';
}

export function buildPresalesDashboard(rows, {
  now = new Date(),
  granularity = 'day',
  startDate = null,
  endDate = null,
  attendantId = null,
  status = null,
  client = null,
} = {}) {
  const rangeStart = startDate ? asDate(`${startDate}T00:00:00.000Z`) : null;
  const rangeEnd = endDate ? asDate(`${endDate}T00:00:00.000Z`) : null;
  if (rangeEnd) rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 1);
  const inRange = (value) => {
    const date = asDate(value);
    return Boolean(date && (!rangeStart || date >= rangeStart) && (!rangeEnd || date < rangeEnd));
  };

  const allItems = rows.map((row) => {
    const entryAt = row.assumido_at || row.created_at;
    const approved = row.status === 'concluida' && row.resultado === 'aprovado';
    const pending = row.status === 'em_auditoria';
    const lastMovementAt = row.adjustment_updated_at || row.updated_at || entryAt;
    return {
      ...row,
      id: String(row.id || row.erp_pedido_id),
      status: itemStatus(row),
      entry_at: entryAt,
      last_movement_at: lastMovementAt,
      approved,
      pending,
      adjustment_pending: pending && row.adjustment_status === 'pendente',
      approval_hours: approved ? hoursBetween(entryAt, row.concluida_at) : null,
      open_hours: pending ? hoursBetween(entryAt, now) : null,
      wait_to_assume_hours: hoursBetween(row.orcamento_criado_at, entryAt),
    };
  });

  const normalizedClient = String(client || '').trim().toLocaleLowerCase('pt-BR');
  const items = allItems.filter((item) => {
    const dateMatches = inRange(item.entry_at) || (item.approved && inRange(item.concluida_at));
    const attendantMatches = !attendantId || String(item.auditor_id) === String(attendantId);
    const statusMatches = !status || status === 'todos' || item.status === status;
    const clientMatches = !normalizedClient
      || String(item.cliente_nome || '').toLocaleLowerCase('pt-BR').includes(normalizedClient);
    return dateMatches && attendantMatches && statusMatches && clientMatches;
  });

  const approved = items.filter((item) => item.approved && inRange(item.concluida_at));
  const pending = items.filter((item) => item.pending && inRange(item.entry_at));
  const adjustmentsPending = pending.filter((item) => item.adjustment_pending);

  const evolutionMap = new Map();
  for (const item of items) {
    if (inRange(item.entry_at)) {
      const key = periodKey(item.entry_at, granularity);
      const bounds = periodBounds(item.entry_at, granularity);
      const bucket = evolutionMap.get(key) || { period: key, period_start: bounds.start, period_end: bounds.end, entered: 0, approved: 0, approvalHours: [] };
      bucket.entered += 1;
      evolutionMap.set(key, bucket);
    }
    if (item.approved && inRange(item.concluida_at)) {
      const key = periodKey(item.concluida_at, granularity);
      const bounds = periodBounds(item.concluida_at, granularity);
      const bucket = evolutionMap.get(key) || { period: key, period_start: bounds.start, period_end: bounds.end, entered: 0, approved: 0, approvalHours: [] };
      bucket.approved += 1;
      if (Number.isFinite(item.approval_hours)) bucket.approvalHours.push(item.approval_hours);
      evolutionMap.set(key, bucket);
    }
  }

  const groupBy = (keyFn) => {
    const map = new Map();
    for (const item of items) {
      const group = keyFn(item);
      const key = group.id || group.name;
      const bucket = map.get(key) || { ...group, total: 0, approved: 0, pending: 0, adjustments_pending: 0, approvalHours: [], pickupHours: [], pendingHours: [] };
      bucket.total += 1;
      bucket.approved += item.approved && inRange(item.concluida_at) ? 1 : 0;
      bucket.pending += item.pending && inRange(item.entry_at) ? 1 : 0;
      bucket.adjustments_pending += item.adjustment_pending && inRange(item.entry_at) ? 1 : 0;
      if (item.approved && inRange(item.concluida_at) && Number.isFinite(item.approval_hours)) bucket.approvalHours.push(item.approval_hours);
      if (inRange(item.entry_at) && Number.isFinite(item.wait_to_assume_hours)) bucket.pickupHours.push(item.wait_to_assume_hours);
      if (item.pending && inRange(item.entry_at) && Number.isFinite(item.open_hours)) bucket.pendingHours.push(item.open_hours);
      map.set(key, bucket);
    }
    return [...map.values()].map(({ approvalHours, pickupHours, pendingHours, ...bucket }) => ({
      ...bucket,
      approval_rate: bucket.total ? Math.round((bucket.approved / bucket.total) * 1000) / 10 : 0,
      avg_approval_hours: average(approvalHours),
      avg_pickup_hours: average(pickupHours),
      avg_pending_hours: average(pendingHours),
    }));
  };

  const attendants = groupBy((item) => ({
    id: item.auditor_id || 'sem-auditor',
    name: item.auditor_nome || 'Sem auditor',
  })).sort((a, b) => b.approved - a.approved || b.pending - a.pending);
  const clients = groupBy((item) => ({
    id: item.cliente_nome || 'nao-informado',
    name: item.cliente_nome || 'Não informado',
  })).sort((a, b) => b.total - a.total);

  return {
    summary: {
      total: items.length,
      pending: pending.length,
      approved: approved.length,
      adjustments_pending: adjustmentsPending.length,
      approval_rate: items.length ? Math.round((approved.length / items.length) * 1000) / 10 : 0,
      avg_approval_hours: average(approved.map((item) => item.approval_hours)),
      avg_pickup_hours: average(items.filter((item) => inRange(item.entry_at)).map((item) => item.wait_to_assume_hours)),
    },
    evolution: [...evolutionMap.values()]
      .map(({ approvalHours, ...bucket }) => ({ ...bucket, avg_approval_hours: average(approvalHours) }))
      .sort((a, b) => a.period.localeCompare(b.period)),
    attendants,
    clients,
    attention: [...pending].sort((a, b) => (b.open_hours || 0) - (a.open_hours || 0)),
    items,
  };
}

export function validatePresalesDashboardFilters(query) {
  const granularity = query.granularity || 'day';
  if (!['day', 'week', 'month'].includes(granularity)) return 'Agrupamento inválido.';
  if (query.status && query.status !== 'todos' && !PRESALES_DASHBOARD_STATUSES.includes(query.status)) return 'Status inválido.';
  if (query.attendant_id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(query.attendant_id)) return 'Atendente inválido.';
  if (query.client && String(query.client).trim().length > 120) return 'Cliente inválido.';
  return null;
}