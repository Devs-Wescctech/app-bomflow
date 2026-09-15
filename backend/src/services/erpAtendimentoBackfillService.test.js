import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildErpAtendimentoBackfillPreview,
  classifyErpAtendimentoBackfillRow,
  releaseErpAtendimentoBackfill,
  stageErpAtendimentoBackfill,
} from './erpAtendimentoBackfillService.js';

const completeAuto = {
  protocolo: 'BA2609150001', documento_cliente: '000.000.000-00', placa: 'ABC1D23',
  nome_cliente: 'Teste', tipo_servico: 'Reboque', data_hora: new Date(),
  usuario: 'agente', status_atendimento: 'Pendente',
};

test('classifica histórico completo sem outbox como elegível', () => {
  assert.deepEqual(classifyErpAtendimentoBackfillRow('bom_auto', completeAuto), {
    classification: 'elegivel', reason: 'historico_sem_outbox',
  });
});

test('impede registro incompleto e colisão de identidade no ERP', () => {
  assert.match(
    classifyErpAtendimentoBackfillRow('bom_auto', { ...completeAuto, placa: '' }).reason,
    /placa/
  );
  assert.deepEqual(
    classifyErpAtendimentoBackfillRow('bom_auto', completeAuto, {
      documento_cliente: completeAuto.documento_cliente, placa: 'OUTRA',
    }),
    { classification: 'impedido', reason: 'protocolo_erp_com_identidade_divergente' }
  );
});

test('staging usa held, é limitado e preserva completed', async () => {
  const calls = [];
  const result = await stageErpAtendimentoBackfill(['B', 'A', 'A'], {
    limit: 2,
    erpDb: { query: async () => ({ rows: [] }) },
    localQuery: async (sql, params) => {
      calls.push({ sql, params });
      if (/SELECT a\.\*, o\.id/.test(sql)) {
        if (/bom_auto_atendimentos/.test(sql)) {
          return { rows: [
            { ...completeAuto, id: 1, protocolo: 'A', outbox_id: null, outbox_status: null },
            { ...completeAuto, id: 2, protocolo: 'B', outbox_id: 9, outbox_status: 'processing' },
          ] };
        }
        return { rows: [] };
      }
      return { rows: [{ protocolo: 'A', status: 'held' }] };
    },
  });
  const insert = calls.find((call) => /INSERT INTO erp_atendimento_outbox/.test(call.sql));
  assert.match(insert.sql, /'held'/);
  assert.match(insert.sql, /ON CONFLICT DO NOTHING/);
  assert.equal(result.staged, 1);
  assert.deepEqual(result.rejected, ['B']);
});

test('liberação move somente held aprovado para pending em lote limitado', async () => {
  const calls = [];
  const result = await releaseErpAtendimentoBackfill(['A'], {
    limit: 5,
    erpDb: { query: async () => ({ rows: [] }) },
    localQuery: async (sql, params) => {
      calls.push({ sql, params });
      if (/JOIN erp_atendimento_outbox/.test(sql)) {
        return /bom_auto_atendimentos/.test(sql)
          ? { rows: [{ ...completeAuto, id: 1, protocolo: 'A', outbox_id: 7, outbox_status: 'held' }] }
          : { rows: [] };
      }
      return { rows: [{ protocolo: 'A' }] };
    },
  });
  const call = calls.find((entry) => /UPDATE erp_atendimento_outbox/.test(entry.sql));
  assert.match(call.sql, /status = 'held'/);
  assert.match(call.sql, /SET status = 'pending'/);
  assert.deepEqual(call.params, [['A']]);
  assert.equal(result.released, 1);
});

test('staging nunca altera item já enfileirado', async () => {
  let inserted = false;
  const result = await stageErpAtendimentoBackfill(['A'], {
    erpDb: { query: async () => ({ rows: [] }) },
    localQuery: async (sql) => {
      if (/SELECT a\.\*, o\.id/.test(sql)) {
        return /bom_auto_atendimentos/.test(sql)
          ? { rows: [{ ...completeAuto, id: 1, protocolo: 'A', outbox_id: 7, outbox_status: 'processing' }] }
          : { rows: [] };
      }
      inserted = true;
      return { rows: [] };
    },
  });
  assert.equal(inserted, false);
  assert.equal(result.staged, 0);
  assert.deepEqual(result.rejected, ['A']);
});

test('liberação revalida presença no ERP e mantém item held', async () => {
  let updated = false;
  const result = await releaseErpAtendimentoBackfill(['A'], {
    erpDb: {
      query: async () => ({
        rows: [{ protocolo: 'A', documento_cliente: completeAuto.documento_cliente, placa: completeAuto.placa }],
      }),
    },
    localQuery: async (sql) => {
      if (/JOIN erp_atendimento_outbox/.test(sql)) {
        return /bom_auto_atendimentos/.test(sql)
          ? { rows: [{ ...completeAuto, id: 1, protocolo: 'A', outbox_id: 7, outbox_status: 'held' }] }
          : { rows: [] };
      }
      updated = true;
      return { rows: [] };
    },
  });
  assert.equal(updated, false);
  assert.equal(result.released, 0);
  assert.deepEqual(result.rejected, ['A']);
});

test('prévia inclui o último erro da outbox', async () => {
  const items = await buildErpAtendimentoBackfillPreview({
    erpDb: { query: async () => ({ rows: [] }) },
    localQuery: async (sql) => (
      /bom_auto_atendimentos/.test(sql)
        ? {
            rows: [{
              ...completeAuto,
              id: 1,
              outbox_id: 7,
              outbox_status: 'error',
              outbox_attempts: 3,
              last_error: 'falha_controlada',
            }],
          }
        : { rows: [] }
    ),
  });
  assert.equal(items[0].ultimo_erro, 'falha_controlada');
  assert.equal(items[0].tentativas, 3);
});

test('staging impõe teto absoluto de 20 mesmo quando solicitado limite maior', async () => {
  let stagedPayload = [];
  const rows = Array.from({ length: 25 }, (_, index) => ({
    ...completeAuto,
    id: index + 1,
    protocolo: `BA${String(index + 1).padStart(4, '0')}`,
    outbox_id: null,
    outbox_status: null,
  }));
  await stageErpAtendimentoBackfill(rows.map((row) => row.protocolo), {
    limit: 100,
    erpDb: { query: async () => ({ rows: [] }) },
    localQuery: async (sql, params) => {
      if (/SELECT a\.\*, o\.id/.test(sql)) {
        return /bom_auto_atendimentos/.test(sql) ? { rows } : { rows: [] };
      }
      stagedPayload = JSON.parse(params[0]);
      return { rows: stagedPayload.map((row) => ({ protocolo: row.protocolo, status: 'held' })) };
    },
  });
  assert.equal(stagedPayload.length, 20);
});

test('liberação impõe teto absoluto de 20 mesmo quando solicitado limite maior', async () => {
  let releasedProtocols = [];
  const rows = Array.from({ length: 25 }, (_, index) => ({
    ...completeAuto,
    id: index + 1,
    protocolo: `BA${String(index + 1).padStart(4, '0')}`,
    outbox_id: index + 1,
    outbox_status: 'held',
  }));
  await releaseErpAtendimentoBackfill(rows.map((row) => row.protocolo), {
    limit: 100,
    erpDb: { query: async () => ({ rows: [] }) },
    localQuery: async (sql, params) => {
      if (/JOIN erp_atendimento_outbox/.test(sql)) {
        return /bom_auto_atendimentos/.test(sql) ? { rows } : { rows: [] };
      }
      releasedProtocols = params[0];
      return { rows: releasedProtocols.map((protocolo) => ({ protocolo })) };
    },
  });
  assert.equal(releasedProtocols.length, 20);
});