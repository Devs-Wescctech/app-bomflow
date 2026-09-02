import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeUrl } from './erpAuditService.js';

test('auditoria do ERP mascara credenciais e dados pessoais da URL', () => {
  const sanitized = sanitizeUrl(
    'http://erp.exemplo/Pessoas?cpf=12345678901&nome=ANA%20SILVA&token=secreto&pagina=1'
  );
  const parsed = new URL(sanitized);
  assert.equal(parsed.searchParams.get('cpf'), '***');
  assert.equal(parsed.searchParams.get('nome'), '***');
  assert.equal(parsed.searchParams.get('token'), '***');
  assert.equal(parsed.searchParams.get('pagina'), '1');
  assert.equal(sanitized.includes('12345678901'), false);
  assert.equal(sanitized.includes('ANA'), false);
});