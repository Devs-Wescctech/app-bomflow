export const BOM_PET_TIME_ZONE = 'America/Sao_Paulo';

const BOM_PET_TIMESTAMP_FIELDS = [
  'data_hora',
  'data_hora_inicio_tratamento',
  'created_at',
];

function asValidDate(value) {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function serializeBomPetTimestamp(value) {
  if (value === null || value === undefined) return null;
  const date = asValidDate(value);
  return date ? date.toISOString() : null;
}

export function serializeBomPetRow(row) {
  if (!row) return row;
  const serialized = { ...row };
  for (const field of BOM_PET_TIMESTAMP_FIELDS) {
    if (field in serialized) serialized[field] = serializeBomPetTimestamp(serialized[field]);
  }
  return serialized;
}

export function formatBomPetDateTime(value) {
  const date = asValidDate(value);
  if (!date) return '-';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: BOM_PET_TIME_ZONE,
  }).format(date);
}

export function getBomPetDateParts(value) {
  const date = asValidDate(value);
  if (!date) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: BOM_PET_TIME_ZONE,
  }).formatToParts(date);
  return Object.fromEntries(
    parts.filter(({ type }) => type !== 'literal').map(({ type, value: partValue }) => [type, partValue])
  );
}

export function isValidBomPetDateOnly(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const [year, month, day] = String(value).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

export function normalizeBomPetDateOnly(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const match = String(value || '').match(/^(\d{4}-\d{2}-\d{2})(?:$|T|\s)/);
  return match && isValidBomPetDateOnly(match[1]) ? match[1] : null;
}

export function getBomPetDeathMarkingConflict({ marked, existingDate, requestedDate }) {
  const normalizedExistingDate = normalizeBomPetDateOnly(existingDate);
  if (!marked && !normalizedExistingDate) return null;
  return normalizedExistingDate === requestedDate ? 'already_marked' : 'date_conflict';
}