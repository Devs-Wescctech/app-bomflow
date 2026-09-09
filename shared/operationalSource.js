export const OPERATIONAL_SOURCE_GROUPS = [
  { key: 'manual', label: 'Cadastro manual' },
  { key: 'spreadsheet_import', label: 'Importação por planilha' },
  { key: 'unidentified', label: 'Não identificado' },
];

export function normalizeOperationalSource(value) {
  const normalized = String(value ?? '')
    .trim()
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (['manual', 'whatsapp', 'porta_a_porta'].includes(normalized)) return 'manual';
  if (['importacao_planilha', 'importacao_por_planilha'].includes(normalized)) return 'spreadsheet_import';
  return 'unidentified';
}

export function getOperationalSourceLabel(value) {
  const key = normalizeOperationalSource(value);
  return OPERATIONAL_SOURCE_GROUPS.find(group => group.key === key)?.label || 'Não identificado';
}