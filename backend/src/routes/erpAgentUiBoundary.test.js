import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { saveAgentThenReconcile } from '../../../src/utils/agentErpEditSync.js';

const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..'
);

test('edição encadeia reconciliação sem provisionar ou permitir IDs ERP no payload local', async () => {
  const source = await readFile(
    path.join(workspaceRoot, 'src/pages/Agents.jsx'),
    'utf8'
  );

  assert.match(source, /commitSyncAgentesErp\(\[\{ agentId, reconcileOnly: true \}\]\)/);
  assert.doesNotMatch(source, /provision:\s*true/);
  assert.match(source, /String\(formData\.cpf \|\| ''\)\.replace\(\/\\D\/g, ''\)\.length === 11/);
  assert.match(
    source,
    /delete dataToSend\.password/
  );
});

test('gravação ERP permanece disponível somente no diálogo manual', async () => {
  const source = await readFile(
    path.join(workspaceRoot, 'src/components/agents/ErpSyncDialog.jsx'),
    'utf8'
  );

  assert.match(source, /commitSyncAgentesErp/);
  assert.match(source, /const gravar = async \(\) =>/);
  assert.match(source, /filter\(\(i\) => selected\.has\(i\.agentId\)/);
});

test('resultado parcial atualiza o Usuário ERP e mantém o problema do canal separado', async () => {
  const [dialogSource, agentsSource] = await Promise.all([
    readFile(path.join(workspaceRoot, 'src/components/agents/ErpSyncDialog.jsx'), 'utf8'),
    readFile(path.join(workspaceRoot, 'src/pages/Agents.jsx'), 'utf8'),
  ]);

  assert.match(dialogSource, /\["ok", "ja_vinculado", "vinculado_sem_canal"\]\.includes\(r\.status\)/);
  assert.match(dialogSource, /onDone\?\.\(\)/);
  assert.match(agentsSource, /const canalPrecisaRevisao = !canalConfirmado/);
  assert.match(agentsSource, /result\.canalStatus !== 'sem_canal_configurado'/);
  assert.match(agentsSource, /editSaveState\?\.erp === 'error' && editSaveState\?\.retryable/);
});

test('tela não expõe erro de configuração do banco quando Usuário ERP está confirmado', async () => {
  const source = await readFile(
    path.join(workspaceRoot, 'src/pages/Agents.jsx'),
    'utf8'
  );

  assert.match(source, /function getErpSyncAuditMessage\(audit\)/);
  assert.match(
    source,
    /audit\?\.canalStatus === 'erp_indisponivel'[\s\S]+?\['ok', 'ja_vinculado'\]\.includes\(usuarioStatus\)/
  );
  assert.match(source, /O canal ERP permanece pendente de validação/);
  assert.match(
    source,
    /getErpSyncAuditStatusLabel\(erpSyncAudit\?\.canalStatus, 'canal'\)/
  );
  assert.doesNotMatch(
    source,
    /erpSyncAudit\?\.canalErro \|\| erpSyncAudit\?\.erro \|\| ERP_SYNC_STATUS_CAUSE/
  );
});

test('canal confirmado no ERP sem espelho local oferece ação explícita para aplicá-lo', async () => {
  const source = await readFile(
    path.join(workspaceRoot, 'src/pages/Agents.jsx'),
    'utf8'
  );

  assert.match(source, /erpSyncAudit\?\.canalStatus === 'canal_confirmado_nao_espelhado'/);
  assert.match(source, /Aplicar vínculo confirmado/);
  assert.match(
    source,
    /reconcileEditedAgent\(editingAgent\.id, \{ closeOnSuccess: false \}\)/
  );
});

test('orçamento mantém o lock do agente até enviar o cabeçalho ao ERP', async () => {
  const source = await readFile(
    path.join(workspaceRoot, 'backend/src/routes/erpProxy.js'),
    'utf8'
  );

  assert.match(source, /return \{ payload: authenticatedPayload, releaseAgentLock \}/);
  assert.match(
    source,
    /let r;\s*try \{\s*r = await fetch\(`\$\{ERP_BASE\}\/OrcamentoSgprcUsuario`[\s\S]+?\} finally \{\s*await authenticatedRequest\.releaseAgentLock\(\)/
  );
  assert.match(
    source,
    /r = await fetch\(`\$\{ERP_BASE\}\/PrePropostaUsuarioSgprc`[\s\S]+?\} finally \{\s*await authenticatedRequest\.releaseAgentLock\(\)/
  );
});

test('orçamento informa canal ausente antes de qualquer auditoria no banco ERP', async () => {
  const source = await readFile(
    path.join(workspaceRoot, 'backend/src/routes/erpProxy.js'),
    'utf8'
  );

  assert.match(
    source,
    /validateAgentCpf\(agent\);\s*if \(!agent\.canal_venda_id\) \{[\s\S]+?error\.code = 'sem_canal_configurado';[\s\S]+?throw error;\s*\}\s*const resolution = await resolveAgentErpByCpfViaApi/
  );
  assert.match(
    source,
    /Seu cadastro não possui um canal de vendas configurado/
  );
});

test('orçamento sem código de canal não expõe configuração ausente do banco ERP', async () => {
  const source = await readFile(
    path.join(workspaceRoot, 'backend/src/routes/erpProxy.js'),
    'utf8'
  );

  assert.match(source, /createMissingErpCanalError/);
  assert.match(
    source,
    /!Number\(agent\.erp_agente_venda_id\) && error\?\.code === 'erp_db_config_missing'/
  );
});

test('salvamento local termina antes da reconciliação e a atualização de consultas é aguardada', async () => {
  const calls = [];
  const result = await saveAgentThenReconcile({
    agentId: 'agent-1',
    data: { canalVendaId: 77 },
    shouldReconcile: true,
    updateAgent: async () => {
      calls.push('local');
      return { id: 'agent-1' };
    },
    afterLocalSave: async () => {
      await Promise.resolve();
      calls.push('refresh');
    },
    reconcileAgent: async () => {
      calls.push('erp');
      return true;
    },
  });

  assert.deepEqual(calls, ['local', 'refresh', 'erp']);
  assert.deepEqual(result, {
    localSaved: true,
    reconciliationAttempted: true,
    erpSucceeded: true,
  });
});

test('falha local interrompe a reconciliação sem criar ou alterar vínculo ERP', async () => {
  let reconcileCount = 0;
  await assert.rejects(
    () => saveAgentThenReconcile({
      agentId: 'agent-1',
      data: {},
      shouldReconcile: true,
      updateAgent: async () => {
        throw new Error('falha local');
      },
      afterLocalSave: async () => {},
      reconcileAgent: async () => {
        reconcileCount += 1;
        return true;
      },
    }),
    /falha local/
  );
  assert.equal(reconcileCount, 0);
});

test('respostas tardias da edição só atualizam o token e abrem a tela para a geração ativa', async () => {
  const source = await readFile(
    path.join(workspaceRoot, 'src/pages/Agents.jsx'),
    'utf8'
  );

  assert.match(
    source,
    /const resp = await fetch\(`\/api\/agents\/\$\{agent\.id\}`[\s\S]+activeEditAgentIdRef\.current !== agent\.id[\s\S]+editRequestGenerationRef\.current !== editGeneration[\s\S]+const data = await resp\.json\(\)/
  );
  assert.match(
    source,
    /activeEditAgentIdRef\.current === agent\.id[\s\S]+editRequestGenerationRef\.current === editGeneration[\s\S]+setIsDialogOpen\(true\)/
  );
});