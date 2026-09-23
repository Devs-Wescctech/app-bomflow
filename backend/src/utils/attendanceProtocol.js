export function formatMonthlyAttendanceProtocol(prefix, yearMonth, sequence) {
  if (!['BA', 'BP'].includes(prefix)) {
    throw new TypeError('Prefixo de protocolo de atendimento inválido.');
  }
  if (!/^\d{4}$/.test(String(yearMonth))) {
    throw new TypeError('Ano e mês do protocolo devem conter quatro dígitos.');
  }
  if (!Number.isSafeInteger(Number(sequence)) || Number(sequence) < 1 || Number(sequence) > 999999) {
    const error = new RangeError('A sequência mensal de protocolos excedeu seis dígitos.');
    error.code = 'ATTENDANCE_PROTOCOL_SEQUENCE_EXHAUSTED';
    error.statusCode = 409;
    throw error;
  }
  return `${prefix}${yearMonth}${String(sequence).padStart(6, '0')}`;
}
