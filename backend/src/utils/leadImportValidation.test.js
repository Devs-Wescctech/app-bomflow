// Testes da validação/normalização da importação de leads PF.
//
// Cobre os casos extremos que decidem o que entra no banco: CPF com máscara,
// zeros à esquerda cortados pelo Excel, células numéricas, telefone com +55,
// fixo vs celular, UF minúscula e dedup dentro do próprio lote.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizePhone,
  isValidPhone,
  normalizeCpf,
  isValidCpf,
  formatCpf,
  validateRow,
  markDuplicates
} from './leadImportValidation.js';

// CPFs com dígitos verificadores corretos
const CPF_VALIDO = '52998224725';
const CPF_ZERO_ESQ = '01234567890'; // válido e começa com 0

// ---------- normalizePhone ----------

test('normalizePhone remove máscara e mantém apenas dígitos', () => {
  assert.equal(normalizePhone('(51) 98153-2008'), '51981532008');
});

test('normalizePhone remove o 55 de celular (13 dígitos) e fixo (12 dígitos)', () => {
  assert.equal(normalizePhone('5551981532008'), '51981532008');
  assert.equal(normalizePhone('+55 51 98153-2008'), '51981532008');
  assert.equal(normalizePhone('551133334444'), '1133334444');
});

test('normalizePhone NÃO corta 55 quando é DDD legítimo (10/11 dígitos)', () => {
  assert.equal(normalizePhone('5533334444'), '5533334444');
  assert.equal(normalizePhone('55981532008'), '55981532008');
});

test('normalizePhone aceita célula numérica (number) e nulos', () => {
  assert.equal(normalizePhone(51981532008), '51981532008');
  assert.equal(normalizePhone(null), '');
  assert.equal(normalizePhone(undefined), '');
  assert.equal(normalizePhone(''), '');
});

// ---------- isValidPhone ----------

test('isValidPhone aceita celular (11) e fixo (10)', () => {
  assert.equal(isValidPhone('51981532008'), true);
  assert.equal(isValidPhone('5133334444'), true);
});

test('isValidPhone rejeita tamanho errado, DDD inválido e dígitos repetidos', () => {
  assert.equal(isValidPhone(''), false);
  assert.equal(isValidPhone('981532008'), false); // 9 dígitos
  assert.equal(isValidPhone('519815320081'), false); // 12 dígitos
  assert.equal(isValidPhone('0981532008'), false); // DDD < 11
  assert.equal(isValidPhone('11111111111'), false); // repetido
});

// ---------- normalizeCpf ----------

test('normalizeCpf remove máscara', () => {
  assert.equal(normalizeCpf('529.982.247-25'), CPF_VALIDO);
});

test('normalizeCpf restaura zeros à esquerda cortados pelo Excel', () => {
  // Excel transforma 01234567890 no número 1234567890
  assert.equal(normalizeCpf(1234567890), CPF_ZERO_ESQ);
  assert.equal(normalizeCpf('1234567890'), CPF_ZERO_ESQ);
});

test('normalizeCpf com vazio/nulo retorna string vazia (CPF é opcional)', () => {
  assert.equal(normalizeCpf(null), '');
  assert.equal(normalizeCpf(undefined), '');
  assert.equal(normalizeCpf(''), '');
});

// ---------- isValidCpf ----------

test('isValidCpf aceita CPFs com dígitos verificadores corretos', () => {
  assert.equal(isValidCpf(CPF_VALIDO), true);
  assert.equal(isValidCpf(CPF_ZERO_ESQ), true);
});

test('isValidCpf rejeita dígito errado, tamanho errado e repetidos', () => {
  assert.equal(isValidCpf('52998224724'), false); // último dígito errado
  assert.equal(isValidCpf('5299822472'), false); // 10 dígitos
  assert.equal(isValidCpf('529982247255'), false); // 12 dígitos
  assert.equal(isValidCpf('00000000000'), false);
  assert.equal(isValidCpf('11111111111'), false);
  assert.equal(isValidCpf(''), false);
});

// ---------- formatCpf ----------

test('formatCpf aplica a máscara padrão', () => {
  assert.equal(formatCpf(CPF_VALIDO), '529.982.247-25');
  assert.equal(formatCpf(''), '');
});

// ---------- validateRow ----------

test('validateRow: linha completa válida com UF minúscula', () => {
  const r = validateRow({
    nome: '  Maria Silva ',
    cpf: '529.982.247-25',
    cidade: 'Porto Alegre',
    uf: 'rs',
    telefone: '+55 (51) 98153-2008'
  });
  assert.equal(r.status, 'valid');
  assert.deepEqual(r.normalized, {
    name: 'Maria Silva',
    cpf: '529.982.247-25',
    cpfDigits: CPF_VALIDO,
    city: 'Porto Alegre',
    state: 'RS',
    phone: '51981532008'
  });
});

test('validateRow: CPF é opcional, mas inválido barra a linha', () => {
  const ok = validateRow({ nome: 'A', telefone: '51981532008' });
  assert.equal(ok.status, 'valid');
  assert.equal(ok.normalized.cpf, null);

  const bad = validateRow({ nome: 'A', telefone: '51981532008', cpf: '52998224724' });
  assert.equal(bad.status, 'error');
  assert.equal(bad.reason, 'CPF inválido');
});

test('validateRow: nome/telefone vazios e telefone inválido', () => {
  assert.equal(validateRow({ nome: '  ', telefone: '51981532008' }).reason, 'Nome vazio');
  assert.equal(validateRow({ nome: 'A' }).reason, 'Telefone vazio');
  assert.equal(validateRow({ nome: 'A', telefone: 'abc' }).reason, 'Telefone vazio');
  assert.equal(validateRow({ nome: 'A', telefone: '9815' }).reason, 'Telefone inválido');
});

test('validateRow: UF inexistente barra, UF vazia passa', () => {
  assert.equal(validateRow({ nome: 'A', telefone: '51981532008', uf: 'XX' }).reason, 'UF inexistente');
  const r = validateRow({ nome: 'A', telefone: '51981532008', uf: '' });
  assert.equal(r.status, 'valid');
  assert.equal(r.normalized.state, null);
});

test('validateRow: célula numérica de CPF com zero à esquerda cortado é aceita', () => {
  const r = validateRow({ nome: 'A', telefone: '51981532008', cpf: 1234567890 });
  assert.equal(r.status, 'valid');
  assert.equal(r.normalized.cpfDigits, CPF_ZERO_ESQ);
});

// ---------- markDuplicates (dedup dentro do lote + banco) ----------

function rowResult(phone, cpfDigits = null) {
  return {
    status: 'valid',
    normalized: { phone, cpfDigits, cpf: cpfDigits, name: 'X', city: null, state: null }
  };
}

test('markDuplicates: telefone repetido no lote — só o primeiro passa', () => {
  const results = [rowResult('51981532008'), rowResult('51981532008')];
  markDuplicates(results);
  assert.equal(results[0].status, 'valid');
  assert.equal(results[1].status, 'duplicate');
  assert.equal(results[1].reason, 'Telefone duplicado na própria planilha');
});

test('markDuplicates: CPF repetido no lote com telefones diferentes', () => {
  const results = [rowResult('51981532008', CPF_VALIDO), rowResult('51981532009', CPF_VALIDO)];
  markDuplicates(results);
  assert.equal(results[0].status, 'valid');
  assert.equal(results[1].status, 'duplicate');
  assert.equal(results[1].reason, 'CPF duplicado na própria planilha');
});

test('markDuplicates: duplicado do banco tem prioridade e não consome o "visto"', () => {
  const dupMap = new Map([['p:51981532008', 'Telefone já cadastrado em Vendas PF']]);
  const results = [rowResult('51981532008'), rowResult('51981532008')];
  markDuplicates(results, dupMap);
  assert.equal(results[0].status, 'duplicate');
  assert.equal(results[0].reason, 'Telefone já cadastrado em Vendas PF');
  assert.equal(results[1].status, 'duplicate');
});

test('markDuplicates: linhas com erro são ignoradas e linhas sem CPF não colidem', () => {
  const results = [
    { status: 'error', reason: 'Nome vazio' },
    rowResult('51981532008'),
    rowResult('51981532009') // sem CPF — dois null não podem colidir
  ];
  markDuplicates(results);
  assert.equal(results[0].status, 'error');
  assert.equal(results[1].status, 'valid');
  assert.equal(results[2].status, 'valid');
});
