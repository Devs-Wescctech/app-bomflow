import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyApprovedTrackedBusiness,
  classifyApprovalCandidate,
  MODULE_CONFIG,
  runErpApprovalReconciliation,
} from './erpApprovalReconciliationService.js';
import { executeAutomationBatch } from './automationService.js';

test('todos os módulos rastreados possuem uma tabela e tipo de negócio explícitos', () => {
  assert.deepEqual(Object.keys(MODULE_CONFIG).sort(), [
    'referral', 'sales', 'sales_pj', 'sales_upsell',
  ]);
});

test('somente aprovação A com vínculo confiável é elegível para ganho', () => {
  assert.equal(classifyApprovalCandidate({
    leadId: 'lead-1', modulo: 'sales', erpSituacao: 'A', stage: 'proposta',
  }), 'atualizado');
  assert.equal(classifyApprovalCandidate({
    leadId: 'lead-1', modulo: 'sales', erpSituacao: 'I', stage: 'proposta',
  }), 'nao_aprovado');
  assert.equal(classifyApprovalCandidate({
    leadId: null, modulo: 'sales', erpSituacao: 'A', stage: 'proposta',
  }), 'sem_vinculo');
  assert.equal(classifyApprovalCandidate({
    leadId: 'lead-1', modulo: 'desconhecido', erpSituacao: 'A', stage: 'proposta',
  }), 'sem_vinculo');
});

test('reexecução e encerramentos incompatíveis não solicitam nova transição', () => {
  for (const stage of ['fechado_ganho', 'closed_won']) {
    assert.equal(classifyApprovalCandidate({
      leadId: 'lead-1', modulo: 'sales_pj', erpSituacao: 'A', stage,
    }), 'ja_sincronizado');
  }
  for (const stage of ['fechado_perdido', 'perdido', 'cancelado', 'closed_lost']) {
    assert.equal(classifyApprovalCandidate({
      leadId: 'lead-1', modulo: 'referral', erpSituacao: 'A', stage,
    }), 'conflito');
  }
});

test('trava global ocupada encerra sem consultar ERP nem criar execução', async () => {
  let erpCalls = 0;
  const calls = [];
  const client = {
    async query(sql) {
      calls.push(sql);
      if (/pg_try_advisory_lock/.test(sql)) return { rows: [{ locked: false }] };
      throw new Error(`Query inesperada: ${sql}`);
    },
    release() { calls.push('release'); },
  };
  const result = await runErpApprovalReconciliation({
    dbPool: { async connect() { return client; } },
    getSituacoes: async () => { erpCalls += 1; return []; },
  });
  assert.deepEqual(result, {
    skipped: true,
    reason: 'reconciliation_already_running',
  });
  assert.equal(erpCalls, 0);
  assert.equal(calls.at(-1), 'release');
});

test('a implementação mantém uma fila durável e não conclui efeitos adiados', async () => {
  const source = await import('node:fs/promises').then((fs) =>
    fs.readFile(new URL('./erpApprovalReconciliationService.js', import.meta.url), 'utf8')
  );
  assert.match(source, /erp_approval_reconciliation_effects/);
  assert.match(source, /if \(outcome\?\.deferred\) continue/);
  assert.match(source, /status IN \('pending', 'failed'\)/);
  assert.match(source, /ON CONFLICT \(effect_key\) DO NOTHING/);
});

for (const mode of ['sem chave de reconciliação', 'com chave de reconciliação']) {
  test(`falha em uma automação não impede as seguintes (${mode})`, async () => {
    const attempted = [];
    const completed = [];
    const automations = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const eventKey = mode.startsWith('com ') ? 'erp-event-1' : null;
    const result = await executeAutomationBatch(automations, {
      isCompleted: async (automation) => eventKey && automation.id === 'c',
      execute: async (automation) => {
        attempted.push(automation.id);
        return automation.id === 'a'
          ? { success: false, error: 'primeira falhou' }
          : { success: true };
      },
      markCompleted: async (automation) => completed.push(automation.id),
    });

    assert.equal(result.success, false);
    assert.deepEqual(attempted, eventKey ? ['a', 'b'] : ['a', 'b', 'c']);
    assert.deepEqual(completed, eventKey ? ['b'] : ['b', 'c']);
  });
}

test('aprovação atualiza estágio e grava auditoria e efeitos na mesma transação', async () => {
  const calls = [];
  const client = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (/SELECT \* FROM leads_upsell/.test(sql)) {
        return { rows: [{ id: '11111111-1111-1111-1111-111111111111', stage: 'proposta', name: 'Cliente' }] };
      }
      if (/UPDATE leads_upsell/.test(sql)) {
        return {
          rowCount: 1,
          rows: [{ id: '11111111-1111-1111-1111-111111111111', stage: 'fechado_ganho', name: 'Cliente' }],
        };
      }
      if (/INSERT INTO erp_approval_reconciliation_items/.test(sql)) {
        return { rows: [{ id: 'item-1' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    },
  };
  const transition = await applyApprovedTrackedBusiness(client, 'run-1', {
    erp_pedido_id: 123,
    lead_id: '11111111-1111-1111-1111-111111111111',
    modulo: 'sales_upsell',
    erp_situacao: 'A',
  });

  assert.equal(transition.result, 'atualizado');
  assert.equal(calls[0].sql, 'BEGIN');
  assert.equal(calls.at(-1).sql, 'COMMIT');
  assert.equal(calls.filter((call) => /erp_approval_reconciliation_effects/.test(call.sql)).length, 2);
  assert.equal(calls.filter((call) => /erp_approval_reconciliation_items/.test(call.sql)).length, 1);
  assert.match(calls.find((call) => /UPDATE leads_upsell/.test(call.sql)).sql, /stage = \$1/);
});

test('agendamento consulta somente pendências em lotes limitados e aplica retenção', async () => {
  const source = await import('node:fs/promises').then((fs) =>
    fs.readFile(new URL('./erpApprovalReconciliationService.js', import.meta.url), 'utf8')
  );
  assert.match(source, /erp_approval_sync_status IN \('pending', 'error'\)/);
  assert.match(source, /LIMIT \$2/);
  assert.match(source, /ERP_APPROVAL_SYNC_BATCH_SIZE/);
  assert.match(source, /ERP_APPROVAL_SYNC_MAX_PER_RUN/);
  assert.match(source, /terminalStatus = transition\.result/);
  assert.match(source, /erp_approval_sync_status = \$2/);
  assert.match(source, /ERP_APPROVAL_AUDIT_RETENTION_DAYS/);
});

test('chaves idempotentes distinguem pedidos diferentes do mesmo negócio', async () => {
  const source = await import('node:fs/promises').then((fs) =>
    fs.readFile(new URL('./erpApprovalReconciliationService.js', import.meta.url), 'utf8')
  );
  assert.match(source, /\$\{tracked\.erp_pedido_id\}:erp-approved/);
});