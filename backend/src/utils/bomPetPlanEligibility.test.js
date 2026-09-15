import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getBomPetPlanAvailability,
  getBomPetPlanIdentityBlock,
  shouldExposeBomPetPlanPet,
} from './bomPetPlanEligibility.js';

test('Plano libera somente identidade ERP resolvida', () => {
  assert.equal(getBomPetPlanIdentityBlock('resolved'), null);
  assert.deepEqual(getBomPetPlanAvailability({
    falecido: false,
    identityStatus: 'resolved',
  }), {
    atendimentoElegivel: true,
    motivoBloqueio: null,
    status: 'Ativo',
  });
});

test('Plano bloqueia identidade ausente ou ambígua para revisão cadastral', () => {
  for (const identityStatus of ['not_found', 'ambiguous']) {
    const block = getBomPetPlanIdentityBlock(identityStatus);
    assert.equal(block.statusCode, 409);
    assert.match(block.message, /vínculo ativo e único/);
    assert.equal(getBomPetPlanAvailability({
      falecido: false,
      identityStatus,
    }).atendimentoElegivel, false);
    assert.equal(shouldExposeBomPetPlanPet(identityStatus), false);
  }
});

test('falha temporária de validação fecha o acesso sem simular erro cadastral', () => {
  const block = getBomPetPlanIdentityBlock('retryable_error');
  assert.equal(block.statusCode, 502);
  assert.match(block.message, /Tente novamente/);
});

test('pet falecido permanece inelegível mesmo com identidade resolvida', () => {
  const availability = getBomPetPlanAvailability({
    falecido: true,
    identityStatus: 'resolved',
  });
  assert.equal(availability.atendimentoElegivel, false);
  assert.equal(availability.status, 'Falecido');
  assert.equal(shouldExposeBomPetPlanPet('resolved'), true);
});