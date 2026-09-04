import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('./bomPet.js', import.meta.url), 'utf8');

test('PUT protege atomicamente a primeira marcação contra requisições concorrentes', () => {
  assert.match(
    source,
    /if \(falecidoMarcado \|\| statusChanged\) \{[\s\S]*?updateSql \+= ` AND status_atendimento = \$\$\{paramIdx\+\+\}`;[\s\S]*?updateParams\.push\(statusAnterior\);[\s\S]*?if \(falecidoMarcado\) \{\s*updateSql \+= ' AND pet_falecido_marcado = FALSE';/
  );
  assert.match(
    source,
    /assertBomPetGuardedUpdateApplied\(\{\s*rowCount: updated\.rowCount,\s*guarded: falecidoMarcado \|\| statusChanged/
  );
});

test('PUT exige status solucionado e comprovante antes de marcar o falecimento', () => {
  const markingStart = source.indexOf('if (marcar_pet_falecido === true)');
  const markingEnd = source.indexOf('updateSql += ` WHERE id', markingStart);
  const markingBlock = source.slice(markingStart, markingEnd);

  assert.match(markingBlock, /evaluateBomPetDeathEligibility\(\{/);
  assert.match(markingBlock, /statusAtendimento: finalStatus/);
  assert.match(markingBlock, /hasRemovalImage/);
});

test('PUT impede rebaixar atendimento marcado e protege cancelamento concorrente no UPDATE', () => {
  assert.match(
    source,
    /if \(atendimento\.pet_falecido_marcado && statusChanged && finalStatus !== 'Solucionado'\)/
  );
  assert.match(
    source,
    /if \(statusChanged && finalStatus !== 'Solucionado'\) \{\s*updateSql \+= ' AND pet_falecido_marcado = FALSE';/
  );
  assert.match(
    source,
    /assertBomPetGuardedUpdateApplied\(\{\s*rowCount: updated\.rowCount,\s*guarded: falecidoMarcado \|\| statusChanged/
  );
});

test('transição Pendente para Solucionado usa alvo no SET e estado anterior no claim', () => {
  assert.match(source, /let updateParams = \[status_atendimento \|\| statusAnterior\]/);
  assert.match(
    source,
    /O WHERE vê o estado anterior ao SET:[\s\S]*?updateParams\.push\(statusAnterior\)/
  );
});

test('PUT não rebaixa a marcação para pending antes de rejeitar repetição ou divergência', () => {
  const conflictCheck = source.indexOf('const deathMarkingConflict = getBomPetDeathMarkingConflict');
  const syncReset = source.indexOf('erp_falecimento_sync_status = $${paramIdx++}', conflictCheck);
  assert.ok(conflictCheck >= 0);
  assert.ok(syncReset > conflictCheck);
});

test('retry com feature flag desligada preserva atomicamente o estado confirmed', () => {
  assert.match(
    source,
    /SET erp_falecimento_sync_status = 'pending_homologation',[\s\S]*?AND erp_falecimento_sync_status <> 'confirmed'[\s\S]*?RETURNING id/
  );
  assert.match(
    source,
    /if \(!pendingResult\.rowCount\) \{\s*return resolveBomPetDeathSyncUpdateMiss\(atendimento\.id\);/
  );
});

test('início e reenvio da sincronização exigem solucionado e comprovante no UPDATE', () => {
  const syncStart = source.indexOf('async function synchronizePetDeathWithErp');
  const syncEnd = source.indexOf('// POST /api/bom-pet/atendimentos', syncStart);
  const syncBlock = source.slice(syncStart, syncEnd);
  const statusGuards = syncBlock.match(/AND status_atendimento = 'Solucionado'/g) || [];
  const imageGuards = syncBlock.match(/FROM bom_pet_imagens i/g) || [];

  assert.equal(statusGuards.length, 2);
  assert.equal(imageGuards.length >= 2, true);
  assert.match(syncBlock, /return resolveBomPetDeathSyncUpdateMiss\(atendimento\.id\)/);
});

test('endpoint de reenvio valida as pré-condições antes de chamar o ERP', () => {
  const retryStart = source.indexOf("router.post('/atendimentos/:id/sincronizar-falecimento'");
  const retryEnd = source.indexOf("router.patch('/atendimentos/:id/termo'", retryStart);
  const retryBlock = source.slice(retryStart, retryEnd);

  const prerequisiteCheck = retryBlock.indexOf('await assertBomPetDeathSyncPrerequisites');
  const syncCall = retryBlock.indexOf('await synchronizePetDeathWithErp');
  assert.ok(prerequisiteCheck >= 0);
  assert.ok(syncCall > prerequisiteCheck);
});