import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertBomPetGuardedUpdateApplied,
  evaluateBomPetDeathEligibility,
} from './bomPetDeathEligibility.js';

test('retorna 400 para falecimento em atendimento Pendente mesmo com comprovante', () => {
  assert.deepEqual(
    evaluateBomPetDeathEligibility({
      statusAtendimento: 'Pendente',
      hasRemovalImage: true,
    }),
    {
      ok: false,
      statusCode: 400,
      code: 'attendance_not_solved',
      message: 'O pet só pode ser marcado como Falecido após solucionar o atendimento.',
    }
  );
});

test('retorna 400 para falecimento em atendimento Cancelado mesmo com comprovante', () => {
  const result = evaluateBomPetDeathEligibility({
      statusAtendimento: 'Cancelado',
      hasRemovalImage: true,
  });
  assert.equal(result.ok, false);
  assert.equal(result.statusCode, 400);
  assert.equal(result.code, 'attendance_not_solved');
});

test('retorna 400 para atendimento Solucionado sem comprovante de remoção', () => {
  const result = evaluateBomPetDeathEligibility({
      statusAtendimento: 'Solucionado',
      hasRemovalImage: false,
  });
  assert.equal(result.ok, false);
  assert.equal(result.statusCode, 400);
  assert.equal(result.code, 'removal_proof_required');
});

test('retorna sucesso somente para atendimento Solucionado com comprovante', () => {
  assert.deepEqual(
    evaluateBomPetDeathEligibility({
      statusAtendimento: 'Solucionado',
      hasRemovalImage: true,
    }),
    { ok: true, statusCode: 200, code: null, message: null }
  );
});

test('retorna 409 quando um claim concorrente ou obsoleto não atualiza a linha', () => {
  assert.throws(
    () => assertBomPetGuardedUpdateApplied({ rowCount: 0, guarded: true }),
    (error) => error.statusCode === 409 && /atendimento mudou/.test(error.message)
  );
});

test('aceita exatamente um update aplicado e ignora updates sem guard', () => {
  assert.doesNotThrow(
    () => assertBomPetGuardedUpdateApplied({ rowCount: 1, guarded: true })
  );
  assert.doesNotThrow(
    () => assertBomPetGuardedUpdateApplied({ rowCount: 0, guarded: false })
  );
});