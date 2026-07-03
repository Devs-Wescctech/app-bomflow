// Testes do utilitário de normalização de telefone brasileiro.
//
// Foco: garantir a inserção correta do nono dígito em celulares, preservando
// fixos e números que já vêm corretos, cobrindo os casos de borda descritos na
// correção de entrega de WhatsApp.

import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeBrazilPhone, alternateBrazilPhone } from './phone.js';

test('celular sem o nono dígito recebe o 9 (caso do bug reportado)', () => {
  assert.equal(normalizeBrazilPhone('(51) 8153-2008'), '5551981532008');
});

test('celular sem o 9 com país 55 já embutido é auto-corrigido', () => {
  // Formato exato que era enviado antes (8 dígitos, sem o 9).
  assert.equal(normalizeBrazilPhone('555181532008'), '5551981532008');
});

test('celular já com o nono dígito é mantido', () => {
  assert.equal(normalizeBrazilPhone('(51) 98153-2008'), '5551981532008');
  assert.equal(normalizeBrazilPhone('51981532008'), '5551981532008');
});

test('celular canônico completo (com 55) é mantido', () => {
  assert.equal(normalizeBrazilPhone('5551981532008'), '5551981532008');
});

test('telefone fixo (assinante de 8 dígitos começando com 2-5) NÃO recebe o 9', () => {
  assert.equal(normalizeBrazilPhone('(11) 3255-4000'), '551132554000');
  assert.equal(normalizeBrazilPhone('1132554000'), '551132554000');
  // Fixo com país embutido (12 dígitos) também é preservado.
  assert.equal(normalizeBrazilPhone('551132554000'), '551132554000');
});

test('DDDs variados inserem o 9 corretamente', () => {
  assert.equal(normalizeBrazilPhone('11 8888-7777'), '5511988887777');
  assert.equal(normalizeBrazilPhone('85 9999-1234'), '5585999991234');
  assert.equal(normalizeBrazilPhone('21 7000-0000'), '5521970000000');
});

test('DDD 55 (Rio Grande do Sul) não é confundido com o código do país', () => {
  // Celular sem o 9 em DDD 55, com país embutido (12 dígitos).
  assert.equal(normalizeBrazilPhone('555581532008'), '5555981532008');
  // Fixo em DDD 55 com país embutido.
  assert.equal(normalizeBrazilPhone('555532323232'), '555532323232');
});

test('entrada com máscara, espaços e pontuação é limpa', () => {
  assert.equal(normalizeBrazilPhone(' +55 (51) 98153-2008 '), '5551981532008');
  assert.equal(normalizeBrazilPhone('55-51-8153-2008'), '5551981532008');
});

test('entradas vazias/nulas retornam string vazia', () => {
  assert.equal(normalizeBrazilPhone(''), '');
  assert.equal(normalizeBrazilPhone(null), '');
  assert.equal(normalizeBrazilPhone(undefined), '');
  assert.equal(normalizeBrazilPhone('abc'), '');
});

test('normalização é idempotente', () => {
  const once = normalizeBrazilPhone('(51) 8153-2008');
  assert.equal(normalizeBrazilPhone(once), once);
});

test('variante alternativa de celular remove o nono dígito', () => {
  assert.equal(alternateBrazilPhone('(51) 98153-2008'), '555181532008');
  assert.equal(alternateBrazilPhone('(51) 8153-2008'), '555181532008');
});

test('variante alternativa de telefone fixo é null (não há par)', () => {
  assert.equal(alternateBrazilPhone('(11) 3255-4000'), null);
});

test('variante alternativa de entrada vazia é null', () => {
  assert.equal(alternateBrazilPhone(''), null);
});
