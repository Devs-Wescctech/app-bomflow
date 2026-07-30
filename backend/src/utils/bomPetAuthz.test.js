import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canAccessAtendimento } from './bomPetAuthz.js';

const registroDeOutro = { id: 1, usuario: 'outra.pessoa@empresa.com' };
const registroProprio = { id: 2, usuario: 'Atendente@Empresa.com' };

test('atendente NÃO acessa atendimento de outro atendente', () => {
  assert.equal(
    canAccessAtendimento({ isSupervisor: false, usuario: 'atendente@empresa.com' }, registroDeOutro),
    false
  );
});

test('atendente acessa o próprio atendimento (case-insensitive)', () => {
  assert.equal(
    canAccessAtendimento({ isSupervisor: false, usuario: 'atendente@empresa.com' }, registroProprio),
    true
  );
});

test('supervisor/admin acessa qualquer atendimento', () => {
  assert.equal(canAccessAtendimento({ isSupervisor: true, usuario: 'sup@empresa.com' }, registroDeOutro), true);
  assert.equal(canAccessAtendimento({ isSupervisor: true, usuario: '' }, registroDeOutro), true);
});

test('sem identidade ou sem registro → negado', () => {
  assert.equal(canAccessAtendimento({ isSupervisor: false, usuario: '' }, registroDeOutro), false);
  assert.equal(canAccessAtendimento({ isSupervisor: false, usuario: 'a@b.com' }, null), false);
  assert.equal(canAccessAtendimento({ isSupervisor: false, usuario: 'a@b.com' }, { usuario: null }), false);
});
