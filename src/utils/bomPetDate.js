export const BOM_PET_TIME_ZONE = 'America/Sao_Paulo';

function asValidDate(value) {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
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

export function formatBomPetDate(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-');
    return `${day}/${month}/${year}`;
  }
  const date = asValidDate(value);
  if (!date) return '-';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
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

export function formatBomPetTime(value) {
  const parts = getBomPetDateParts(value);
  return parts ? `${parts.hour}:${parts.minute}` : '-';
}

export function formatBomPetDateForFile(value = new Date()) {
  const parts = getBomPetDateParts(value);
  return parts ? `${parts.year}${parts.month}${parts.day}` : '';
}