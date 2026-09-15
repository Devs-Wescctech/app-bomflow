import assert from 'node:assert/strict';
import test from 'node:test';
import {
  enqueueErpAtendimento,
  isErpAtendimentoSyncEnabled,
  reconcilePendingErpAtendimentosWithDeps,
  syncErpAtendimentoOutboxItemWithDeps,
  upsertBomAutoAtendimentoWithDb,
  upsertBomPetAtendimentoWithDb,
} from './erpAtendimentoService.js';

test('espelhamento ERP fica desativado por padrão e exige true literal', () => {
  assert.equal(isErpAtendimentoSyncEnabled({}), false);
  assert.equal(isErpAtendimentoSyncEnabled({ ERP_ATENDIMENTO_SYNC_ENABLED: 'false' }), false);
  assert.equal(isErpAtendimentoSyncEnabled({ ERP_ATENDIMENTO_SYNC_ENABLED: 'TRUE' }), false);
  assert.equal(isErpAtendimentoSyncEnabled({ ERP_ATENDIMENTO_SYNC_ENABLED: 'true' }), true);
});

test('modo desativado não reivindica item nem abre conexão com o ERP', async () => {
  let localCalls = 0;
  let erpCalls = 0;
  const result = await syncErpAtendimentoOutboxItemWithDeps(7, {
    localQuery: async () => {
      localCalls += 1;
      return { rows: [] };
    },
    getErpDb: () => {
      erpCalls += 1;
      return fakeDb();
    },
    syncEnabled: () => false,
  });

  assert.deepEqual(result, { status: 'disabled' });
  assert.equal(localCalls, 0);
  assert.equal(erpCalls, 0);
});

test('reconciliação desativada não consulta nem reivindica a fila pendente', async () => {
  let localCalls = 0;
  let syncCalls = 0;
  const result = await reconcilePendingErpAtendimentosWithDeps({
    localQuery: async () => {
      localCalls += 1;
      return { rows: [{ id: 7 }] };
    },
    syncItem: async () => {
      syncCalls += 1;
      return { status: 'completed' };
    },
    syncEnabled: () => false,
  });

  assert.equal(result.disabled, true);
  assert.equal(result.checked, 0);
  assert.equal(localCalls, 0);
  assert.equal(syncCalls, 0);
});

function fakeDb() {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      return { rows: [{ id: 1, protocolo: params[0], data_integracao: new Date() }] };
    },
  };
}

test('espelha criação do Bom Auto no ERP com upsert idempotente por protocolo', async () => {
  const db = fakeDb();
  await upsertBomAutoAtendimentoWithDb(db, {
    protocolo: 'BA2609110001',
    documento_cliente: '000.000.000-00',
    placa: 'ABC1D23',
    nome_cliente: 'Cliente Teste',
    descricao_veiculo: 'Veículo Teste',
    tipo_servico: 'Reboque',
    contratos_servicos: 'Assistência',
    telefone_contato: '11999999999',
    observacoes: 'Teste',
    data_hora: new Date('2026-09-11T12:00:00Z'),
    usuario: 'teste@example.com',
    status_atendimento: 'Pendente',
  });

  assert.match(db.calls[0].sql, /INSERT INTO public\.x_atendimentos_bom_auto/);
  assert.match(db.calls[0].sql, /ON CONFLICT \(protocolo\) DO UPDATE/);
  assert.match(
    db.calls[0].sql,
    /\$10::timestamptz AT TIME ZONE 'America\/Sao_Paulo'/
  );
  assert.equal(db.calls[0].params[0], 'BA2609110001');
  assert.equal(db.calls[0].params[11], 'Pendente');
});

test('espelha Particular do Bom Pet e converte valor_pago_particular para valor_particular', async () => {
  const db = fakeDb();
  await upsertBomPetAtendimentoWithDb(db, {
    protocolo: 'BP2609110001',
    pet_contrato_id: null,
    documento_cliente: '000.000.000-00',
    nome_cliente: 'Cliente Teste',
    pet_nome: 'Pet Teste',
    pet_descricao: 'Pet Teste - Canino',
    contratos_servicos: null,
    situacao_financeira: null,
    comprovante_pagamento_recebido: true,
    comprovante_pagamento_obs: null,
    remocao_local: 'Residência',
    remocao_endereco: 'Endereço Teste',
    clinica_nome: null,
    parceiro_nome: 'Parceiro Teste',
    telefone_contato: '11999999999',
    observacoes: 'Teste',
    data_hora: new Date('2026-09-11T12:00:00Z'),
    usuario: 'teste@example.com',
    status_atendimento: 'Pendente',
    pet_falecido_marcado: false,
    origem: 'Particular',
    valor_pago_particular: 199.9,
    pet_data_falecimento: null,
  });

  assert.match(db.calls[0].sql, /INSERT INTO public\.x_atendimentos_bom_pet/);
  assert.match(db.calls[0].sql, /valor_particular/);
  assert.match(
    db.calls[0].sql,
    /\$17::timestamptz AT TIME ZONE 'America\/Sao_Paulo'/
  );
  assert.equal(db.calls[0].params[20], 'Particular');
  assert.equal(db.calls[0].params[21], 199.9);
});

test('traduz falha do banco ERP para erro de integração sem esconder a causa', async () => {
  const db = {
    async query() {
      const error = new Error('conexão recusada');
      error.code = 'ECONNREFUSED';
      throw error;
    },
  };

  await assert.rejects(
    () => upsertBomAutoAtendimentoWithDb(db, { protocolo: 'BA2609110002' }),
    (error) => error.code === 'erp_atendimento_write_failed'
      && error.statusCode === 502
      && error.cause?.code === 'ECONNREFUSED'
  );
});

test('enfileira o espelhamento na mesma transação local do atendimento', async () => {
  const db = fakeDb();
  const id = await enqueueErpAtendimento(db, 'bom_auto', {
    id: 42,
    protocolo: 'BA2609110042',
  });

  assert.equal(id, 1);
  assert.match(db.calls[0].sql, /INSERT INTO erp_atendimento_outbox/);
  assert.match(db.calls[0].sql, /ON CONFLICT \(modulo, atendimento_id\)/);
  assert.deepEqual(db.calls[0].params, ['bom_auto', 42, 'BA2609110042']);
});

test('rejeita módulo desconhecido antes de gravar na fila', async () => {
  const db = fakeDb();
  await assert.rejects(
    () => enqueueErpAtendimento(db, 'desconhecido', { id: 1, protocolo: 'X' }),
    /Módulo de atendimento inválido/
  );
  assert.equal(db.calls.length, 0);
});

test('claim concluído usa fencing por número da tentativa', async () => {
  const localCalls = [];
  const localQuery = async (sql, params) => {
    localCalls.push({ sql, params });
    if (/RETURNING id, modulo/.test(sql)) {
      return {
        rows: [{
          id: 7,
          modulo: 'bom_auto',
          atendimento_id: 42,
          protocolo: 'BA2609110042',
          attempts: 3,
        }],
      };
    }
    if (/SELECT \* FROM bom_auto_atendimentos/.test(sql)) {
      return {
        rows: [{
          id: 42,
          protocolo: 'BA2609110042',
          status_atendimento: 'Pendente',
        }],
      };
    }
    if (/status = 'completed'/.test(sql)) return { rows: [], rowCount: 1 };
    throw new Error(`SQL inesperado no teste: ${sql}`);
  };
  const erpDb = fakeDb();

  const result = await syncErpAtendimentoOutboxItemWithDeps(7, {
    localQuery,
    getErpDb: () => erpDb,
    syncEnabled: () => true,
  });

  assert.equal(result.status, 'completed');
  const completion = localCalls.find((call) => /status = 'completed'/.test(call.sql));
  assert.match(completion.sql, /status = 'processing'/);
  assert.match(completion.sql, /attempts = \$2/);
  assert.deepEqual(completion.params, [7, 3]);
});

test('worker atrasado não marca completed quando perdeu a posse do claim', async () => {
  const localQuery = async (sql) => {
    if (/RETURNING id, modulo/.test(sql)) {
      return {
        rows: [{
          id: 8,
          modulo: 'bom_auto',
          atendimento_id: 43,
          protocolo: 'BA2609110043',
          attempts: 1,
        }],
      };
    }
    if (/SELECT \* FROM bom_auto_atendimentos/.test(sql)) {
      return {
        rows: [{
          id: 43,
          protocolo: 'BA2609110043',
          status_atendimento: 'Pendente',
        }],
      };
    }
    if (/status = 'completed'/.test(sql)) return { rows: [], rowCount: 0 };
    throw new Error(`SQL inesperado no teste: ${sql}`);
  };

  const result = await syncErpAtendimentoOutboxItemWithDeps(8, {
    localQuery,
    getErpDb: () => fakeDb(),
    syncEnabled: () => true,
  });

  assert.equal(result.status, 'skipped');
});

test('falha ERP agenda retry sem poder regredir claim mais novo', async () => {
  const localCalls = [];
  const localQuery = async (sql, params) => {
    localCalls.push({ sql, params });
    if (/RETURNING id, modulo/.test(sql)) {
      return {
        rows: [{
          id: 9,
          modulo: 'bom_pet',
          atendimento_id: 44,
          protocolo: 'BP2609110044',
          attempts: 2,
        }],
      };
    }
    if (/SELECT \* FROM bom_pet_atendimentos/.test(sql)) {
      return {
        rows: [{
          id: 44,
          protocolo: 'BP2609110044',
          origem: 'Plano',
          status_atendimento: 'Pendente',
        }],
      };
    }
    if (/status = 'error'/.test(sql)) return { rows: [], rowCount: 1 };
    throw new Error(`SQL inesperado no teste: ${sql}`);
  };

  const result = await syncErpAtendimentoOutboxItemWithDeps(9, {
    localQuery,
    getErpDb: () => ({
      async query() {
        const error = new Error('falha simulada');
        error.code = 'ETIMEDOUT';
        throw error;
      },
    }),
    syncEnabled: () => true,
  });

  assert.equal(result.status, 'pending');
  const retry = localCalls.find((call) => /status = 'error'/.test(call.sql));
  assert.match(retry.sql, /status = 'processing'/);
  assert.match(retry.sql, /attempts = \$3/);
  assert.deepEqual(retry.params, [9, 'erp_atendimento_write_failed', 2]);
});