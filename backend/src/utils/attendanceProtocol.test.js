import test from 'node:test';
import assert from 'node:assert/strict';
import { formatMonthlyAttendanceProtocol } from './attendanceProtocol.js';

test('gera protocolo mensal Bom Pet no formato de seis dígitos', () => {
  assert.equal(formatMonthlyAttendanceProtocol('BP', '2609', 1), 'BP2609000001');
});

test('gera protocolo mensal Bom Auto e completa a sequência', () => {
  assert.equal(formatMonthlyAttendanceProtocol('BA', '2609', 42), 'BA2609000042');
});

test('rejeita prefixo, ano/mês ou sequência fora do padrão', () => {
  assert.throws(() => formatMonthlyAttendanceProtocol('XX', '2609', 1), /Prefixo/);
  assert.throws(() => formatMonthlyAttendanceProtocol('BA', '202609', 1), /quatro dígitos/);
  assert.throws(() => formatMonthlyAttendanceProtocol('BP', '2609', 1000000), (error) =>
    error.code === 'ATTENDANCE_PROTOCOL_SEQUENCE_EXHAUSTED'
  );
});
