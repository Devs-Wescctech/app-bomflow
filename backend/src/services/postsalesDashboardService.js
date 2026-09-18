const TERMINAL_STATUSES = new Set(['concluida', 'cancelada']);
const DAY_MS = 86_400_000;

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

export function buildPostsalesDashboard(rows, {
  now = new Date(),
  granularity = 'day',
  startDate = null,
  endDate = null,
} = {}) {
  const rangeStart = startDate ? asDate(`${startDate}T00:00:00.000Z`) : null;
  const rangeEnd = endDate ? asDate(`${endDate}T00:00:00.000Z`) : null;
  if (rangeEnd) rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 1);
  const inRange = (value) => {
    const date = asDate(value);
    return Boolean(date && (!rangeStart || date >= rangeStart) && (!rangeEnd || date < rangeEnd));
  };
  const items = rows.map((row) => {
    const entryAt = row.entry_at || row.created_at;
    const lastMovementAt = row.last_movement_at || row.updated_at || entryAt;
    const completedAt = row.status === 'concluida' ? row.concluida_at : null;
    const pending = !TERMINAL_STATUSES.has(row.status);
    const idleDays = pending && asDate(lastMovementAt)
      ? Math.max(0, Math.floor((asDate(now) - asDate(lastMovementAt)) / DAY_MS))
      : 0;
    return {
      ...row,
      entry_at: entryAt,
      last_movement_at: lastMovementAt,
      pending,
      sla_breached: pending && idleDays > 5,
      idle_days: idleDays,
      approval_hours: hoursBetween(entryAt, completedAt),
      open_hours: hoursBetween(entryAt, completedAt || now),
    };
  });

  const entered = items.filter((item) => inRange(item.entry_at));
  const completed = items.filter((item) => item.status === 'concluida' && inRange(item.concluida_at));
  const pending = entered.filter((item) => item.pending);
  const sla = pending.filter((item) => item.sla_breached)
    .sort((a, b) => b.idle_days - a.idle_days);

  const evolutionMap = new Map();
  for (const item of items) {
    if (inRange(item.entry_at)) {
      const entryKey = periodKey(item.entry_at, granularity);
      const bounds = periodBounds(item.entry_at, granularity);
      const bucket = evolutionMap.get(entryKey) || { period: entryKey, period_start: bounds.start, period_end: bounds.end, entered: 0, completed: 0, approvalHours: [] };
      bucket.entered += 1;
      evolutionMap.set(entryKey, bucket);
    }
    if (item.status === 'concluida' && inRange(item.concluida_at)) {
      const completionKey = periodKey(item.concluida_at, granularity);
      const bounds = periodBounds(item.concluida_at, granularity);
      const bucket = evolutionMap.get(completionKey) || { period: completionKey, period_start: bounds.start, period_end: bounds.end, entered: 0, completed: 0, approvalHours: [] };
      bucket.completed += 1;
      if (Number.isFinite(item.approval_hours)) bucket.approvalHours.push(item.approval_hours);
      evolutionMap.set(completionKey, bucket);
    }
  }

  const groupBy = (keyFn) => {
    const map = new Map();
    for (const item of items) {
      const group = keyFn(item);
      const key = group.id || group.name;
      const bucket = map.get(key) || { ...group, total: 0, completed: 0, pending: 0, approvalHours: [], pendingHours: [] };
      bucket.total += 1;
      bucket.completed += item.status === 'concluida' && inRange(item.concluida_at) ? 1 : 0;
      bucket.pending += item.pending && inRange(item.entry_at) ? 1 : 0;
      if (Number.isFinite(item.approval_hours) && inRange(item.concluida_at)) bucket.approvalHours.push(item.approval_hours);
      if (item.pending && inRange(item.entry_at) && Number.isFinite(item.open_hours)) bucket.pendingHours.push(item.open_hours);
      map.set(key, bucket);
    }
    return [...map.values()].map(({ approvalHours, pendingHours, ...bucket }) => ({
      ...bucket,
      approval_rate: bucket.total ? Math.round((bucket.completed / bucket.total) * 1000) / 10 : 0,
      avg_approval_hours: average(approvalHours),
      avg_pending_hours: average(pendingHours),
    }));
  };

  const attendants = groupBy((item) => ({
    id: item.auditor_id || 'sem-atendente',
    name: item.auditor_nome || 'Sem atendente',
  })).sort((a, b) => b.completed - a.completed || b.approval_rate - a.approval_rate);

  const clients = groupBy((item) => ({
    id: item.cliente_nome || 'nao-informado',
    name: item.cliente_nome || 'Não informado',
  })).sort((a, b) => b.total - a.total);

  return {
    summary: {
      total: items.length,
      pending: pending.length,
      completed: completed.length,
      approval_rate: items.length ? Math.round((completed.length / items.length) * 1000) / 10 : 0,
      avg_approval_hours: average(completed.map((item) => item.approval_hours)),
      sla_breached: sla.length,
    },
    evolution: [...evolutionMap.values()]
      .map(({ approvalHours, ...bucket }) => ({ ...bucket, avg_approval_hours: average(approvalHours) }))
      .sort((a, b) => a.period.localeCompare(b.period)),
    attendants,
    clients,
    sla,
    items,
  };
}

export function validatePostsalesDashboardFilters(query, statuses) {
  const errors = [];
  const granularity = query.granularity || 'day';
  if (!['day', 'week', 'month'].includes(granularity)) errors.push('Agrupamento inválido.');
  if (query.status && query.status !== 'todos' && !statuses.includes(query.status)) errors.push('Status inválido.');
  if (query.attendant_id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(query.attendant_id)) {
    errors.push('Atendente inválido.');
  }
  if (query.client && String(query.client).trim().length > 120) errors.push('Cliente inválido.');
  return errors[0] || null;
}