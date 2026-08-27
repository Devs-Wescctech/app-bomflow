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

test('rotas de sincronização mantêm detalhes do PostgreSQL somente nos logs', async () => {
  const source = await readFile(
    path.join(workspaceRoot, 'backend/src/routes/erpProxy.js'),
    'utf8'
  );

  assert.match(source, /function channelFailureMessage\(failure\)/);
  assert.match(source, /Os dados locais foram preservados/);
  assert.match(source, /diagnostico: failure\.erro/);
  assert.match(source, /canalErro = channelFailureMessage\(failure\)/);
  assert.doesNotMatch(source, /canalErro = failure\.erro/);
  assert.doesNotMatch(source, /canalDiagnostico/);
});

test('prévia ERP começa pelos vínculos locais pendentes e permite auditoria completa', async () => {
  const [routeSource, dialogSource, serviceSource] = await Promise.all([
    readFile(path.join(workspaceRoot, 'backend/src/routes/erpProxy.js'), 'utf8'),
    readFile(path.join(workspaceRoot, 'src/components/agents/ErpSyncDialog.jsx'), 'utf8'),
    readFile(path.join(workspaceRoot, 'src/api/erpService.js'), 'utf8'),
  ]);

  assert.match(routeSource, /const \{ agentIds, scope = 'pending' \} = req\.body \|\| \{\}/);
  assert.match(routeSource, /previewScope = scope === 'all' \? 'all' : 'pending'/);
  assert.match(routeSource, /erp_agent_id IS NULL[\s\S]+?erp_agente_venda_id IS NULL/);
  assert.match(dialogSource, /const \[auditScope, setAuditScope\] = useState\("pending"\)/);
  assert.match(dialogSource, /Somente pendentes locais/);
  assert.match(dialogSource, /Todos os agentes ativos/);
  assert.match(dialogSource, /Buscar por nome ou CPF/);
  assert.match(dialogSource, /Pendentes e corrigíveis/);
  assert.match(serviceSource, /scope = 'pending'/);
});

test('consulta de Pessoa mostra mensagens seguras, sem repassar códigos HTTP ao usuário', async () => {
  const [agentsSource, clientSource, routeSource] = await Promise.all([
    readFile(path.join(workspaceRoot, 'src/pages/Agents.jsx'), 'utf8'),
    readFile(path.join(workspaceRoot, 'src/api/erpClient.js'), 'utf8'),
    readFile(path.join(workspaceRoot, 'backend/src/routes/erpProxy.js'), 'utf8'),
  ]);

  assert.match(agentsSource, /const ERP_SEARCH_FAILURE_MESSAGE = "Falha na pesquisa no ERP\. Tente novamente em instantes\."/);
  assert.match(agentsSource, /Pessoa não encontrada no ERP\./);
  assert.match(agentsSource, /toast\.error\(message\)/);
  assert.doesNotMatch(agentsSource, /toast\.error\("Erro ao consultar ERP: " \+ error\.message\)/);
  assert.match(clientSource, /error\.status = res\.status/);
  assert.match(clientSource, /if \(res\.status === 204\)/);
  assert.match(routeSource, /Falha ao consultar a Pessoa no ERP\./);
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

test('orçamento e pré-proposta não expõem diagnóstico do banco ao validar o canal', async () => {
  const source = await readFile(
    path.join(workspaceRoot, 'backend/src/routes/erpProxy.js'),
    'utf8'
  );

  assert.match(source, /function createSafeChannelInfrastructureError\(error, \{ agentId, stage \}\)/);
  assert.match(source, /safeError\.code = 'canal_validacao_indisponivel'/);
  assert.match(source, /diagnostico: failure\.erro/);
  assert.match(source, /body\.retryable = error\.retryable === true/);
  assert.match(source, /POST \/orcamento error:[\s\S]+?json\(httpErrorBody\(err\)\)/);
  assert.match(source, /POST \/pre-proposta error:[\s\S]+?json\(httpErrorBody\(err\)\)/);
  assert.match(
    source,
    /catch \(error\) \{[\s\S]+?isErpChannelInfrastructureError\(error\)[\s\S]+?createSafeChannelInfrastructureError/
  );
  assert.doesNotMatch(source, /throw error;[\s\S]+?error\?\.message.*ERP_DB_HOST/);
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