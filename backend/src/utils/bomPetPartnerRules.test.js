import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canManageBomPetPartners,
  isValidPartnerDate,
  partnerValueChanged,
  parsePartnerValue,
  snapshotActivePartner,
  validatePartnerPayload,
} from './bomPetPartnerRules.js';

test('valida os campos obrigatórios do parceiro', () => {
  const result = validatePartnerPayload({});
  assert.deepEqual(result.normalized, {});
  assert.equal(result.errors.length, 3);
});

test('normaliza valor brasileiro, telefone e opcionais', () => {
  const result = validatePartnerPayload({
    nome: '  Crematório Bom Pet ',
    valor_servico: '125,50',
    data_cadastro: '2026-08-31',
    email: ' contato@example.com ',
    telefone: '(11) 99999-8888',
  });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.normalized, {
    nome: 'Crematório Bom Pet',
    valor_servico: 125.5,
    data_cadastro: '2026-08-31',
    email: 'contato@example.com',
    telefone: '11999998888',
  });
});

test('inativação exige data de exclusão e status conhecido', () => {
  const result = validatePartnerPayload({
    status: 'Suspenso',
    data_exclusao: '31/08/2026',
  }, { partial: true });
  assert.equal(result.errors.length, 2);
  assert.equal(isValidPartnerDate('2026-02-29'), false);
});

test('detecta somente mudanças reais de valor', () => {
  assert.equal(parsePartnerValue('10,00'), 10);
  assert.equal(partnerValueChanged('10.00', 10), false);
  assert.equal(partnerValueChanged('10.00', 10.01), true);
});

test('cadastro é liberado para administradores ou perfil com módulo e submenu', () => {
  assert.equal(canManageBomPetPartners({ userRole: 'admin', agentType: 'support' }), true);
  assert.equal(canManageBomPetPartners({ userRole: 'agent', agentType: 'admin' }), true);
  assert.equal(canManageBomPetPartners({
    userRole: 'supervisor',
    agentType: 'multiassistencias_supervisor',
    modules: ['bom_pet'],
    allowedSubmenus: ['BomPetParceiros'],
  }), true);
  assert.equal(canManageBomPetPartners({
    userRole: 'supervisor',
    agentType: 'multiassistencias_supervisor',
    modules: ['all'],
    allowedSubmenus: ['BomPetParceiros'],
  }), true);
  assert.equal(canManageBomPetPartners({
    userRole: 'supervisor',
    agentType: 'multiassistencias_supervisor',
    modules: ['bom_pet'],
    allowedSubmenus: ['BomPetConsulta'],
  }), false);
  assert.equal(canManageBomPetPartners({
    userRole: 'supervisor',
    agentType: 'multiassistencias_supervisor',
    modules: ['sales'],
    allowedSubmenus: ['BomPetParceiros'],
  }), false);
  assert.equal(canManageBomPetPartners({ userRole: 'supervisor', agentType: 'bom_pet_supervisor' }), false);
  assert.equal(canManageBomPetPartners({ userRole: 'agent', agentType: 'bom_pet_atendente' }), false);
});

test('fotografia usa somente dados atuais de parceiro ativo', () => {
  assert.deepEqual(snapshotActivePartner({
    id: 12,
    nome: ' Parceiro Sul ',
    valor_servico: '239.90',
    status: 'Ativo',
  }), {
    parceiro_id: 12,
    parceiro_nome: 'Parceiro Sul',
    parceiro_valor: 239.9,
  });
  assert.equal(snapshotActivePartner({
    id: 12,
    nome: 'Parceiro Sul',
    valor_servico: '239.90',
    status: 'Inativo',
  }), null);
});