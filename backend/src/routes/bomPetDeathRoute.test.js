import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('./bomPet.js', import.meta.url), 'utf8');
const consultationSource = fs.readFileSync(
  new URL('../../../src/pages/BomPetConsulta.jsx', import.meta.url),
  'utf8'
);
const panelSource = fs.readFileSync(
  new URL('../../../src/pages/BomPetPainel.jsx', import.meta.url),
  'utf8'
);

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
  const retryStart = source.indexOf("'/atendimentos/:id/sincronizar-falecimento'");
  const retryEnd = source.indexOf("router.patch('/atendimentos/:id/termo'", retryStart);
  const retryBlock = source.slice(retryStart, retryEnd);

  const prerequisiteCheck = retryBlock.indexOf('await assertBomPetDeathSyncPrerequisites');
  const syncCall = retryBlock.indexOf('await synchronizePetDeathWithErp');
  assert.ok(prerequisiteCheck >= 0);
  assert.ok(syncCall > prerequisiteCheck);
});

test('contador e filtro de pendências ERP ficam restritos ao administrador master', () => {
  assert.match(source, /function requireBomPetAdmin\(req, res, next\)/);
  assert.match(
    source,
    /erp_sync_pendente === 'true'[\s\S]*?!isBomPetAdmin\(req\)[\s\S]*?Acesso restrito ao administrador master/
  );
  assert.match(
    source,
    /'\/atendimentos\/:id\/sincronizar-falecimento'[\s\S]*?requireBomPetAdmin/
  );
  assert.match(panelSource, /isAdminMaster[\s\S]*?counts\.erpSyncPendentes/);
  assert.match(panelSource, /params\.set\('erp_sync_pendente', 'true'\)/);
});

test('supervisor multi assistências recebe visão ampla no Bom Pet', () => {
  assert.match(
    source,
    /function isBomPetSupervisor\(req\)[\s\S]*?t\?\.endsWith\('_supervisor'\)[\s\S]*?req\.user\?\.role === 'supervisor'/
  );
  assert.match(
    source,
    /const scoped = !isBomPetSupervisor\(req\)[\s\S]*?scoped \? 'WHERE LOWER\(usuario\) = LOWER\(\$1\)' : ''/
  );
  assert.match(
    source,
    /if \(!isBomPetSupervisor\(req\)\) \{[\s\S]*?AND LOWER\(usuario\) = LOWER\(\$\$\{paramIndex\+\+\}\)/
  );
});

test('falhas conhecidas de sincronização são convertidas em mensagens amigáveis', () => {
  assert.match(source, /function userFriendlyErpSyncError\(error\)/);
  assert.match(source, /O ERP já possui uma Data de Falecimento diferente/);
  assert.match(source, /O ERP está temporariamente indisponível/);
  assert.match(source, /const safeError = userFriendlyErpSyncError\(error\)/);
});

test('criação Plano bloqueia pet sem vínculo ativo e único no ERP', () => {
  const creationStart = source.indexOf("router.post('/atendimentos'");
  const creationEnd = source.indexOf("router.get('/atendimentos/atendentes'", creationStart);
  const creationBlock = source.slice(creationStart, creationEnd);

  assert.match(
    creationBlock,
    /getBomPetPlanIdentityBlock\(erpPetIdentityStatus\)/
  );
  assert.match(
    creationBlock,
    /throw partnerError\(identityBlock\.message, identityBlock\.statusCode\)/
  );
});

test('consulta sinaliza pet sem identidade resolvida como revisão cadastral', () => {
  const consultationStart = source.indexOf("router.get('/consulta'");
  const consultationEnd = source.indexOf("router.get('/particulares/cliente'", consultationStart);
  const consultationBlock = source.slice(consultationStart, consultationEnd);

  assert.match(consultationBlock, /if \(!shouldExposeBomPetPlanPet\(identityStatus\)\) continue/);
  assert.match(consultationBlock, /getBomPetPlanAvailability\(\{ falecido, identityStatus \}\)/);
  assert.match(consultationBlock, /atendimento_elegivel: availability\.atendimentoElegivel/);
});

test('interface exclui pets que exigem revisão cadastral da seleção de atendimento', () => {
  assert.match(
    consultationSource,
    /!p\.erp_identity_status \|\| p\.erp_identity_status === 'resolved'/
  );
  assert.match(consultationSource, /petsVisiveis\.map/);
  assert.match(consultationSource, /Revisão cadastral necessária/);
});

test('reenvio com integração desativada informa espera de homologação sem erro destrutivo', () => {
  assert.match(panelSource, /syncStatus === 'pending_homologation'/);
  assert.match(panelSource, /A integração com o ERP está desativada neste ambiente/);
  assert.match(
    panelSource,
    /syncStatus === 'pending_homologation' \|\| syncStatus === 'confirmed'/
  );
});