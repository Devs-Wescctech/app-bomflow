export function validateDateRange(startDate, endDate) {
  const values = [
    ['start_date', startDate],
    ['end_date', endDate],
  ];
  for (const [name, value] of values) {
    if (!value) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return `O parâmetro ${name} deve estar no formato AAAA-MM-DD.`;
    }
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
      return `O parâmetro ${name} não contém uma data válida.`;
    }
  }
  if (startDate && endDate && startDate > endDate) {
    return 'A data inicial não pode ser posterior à data final.';
  }
  return null;
}