import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyPresalesAddressCorrection,
  assertAddressAdjustmentType,
  assertPendingPresalesAdjustment,
  listPresalesCities,
  normalizePresalesAdjustmentType,
  normalizePresalesAddress,
  requirePresalesAdjustmentType,
  withPresalesAdjustmentLock,
  updatePresalesBudgetAddress,
} from './presalesAdjustmentAddressService.js';

test('classifica ajustes antigos de endereço e preserva categorias explícitas', () => {
  assert.equal(normalizePresalesAdjustmentType(null, 'Corrigir a cidade do cliente'), 'endereco');
  assert.equal(normalizePresalesAdjustmentType(null, 'Preencher município e UF da residência'), 'endereco');
  assert.equal(normalizePresalesAdjustmentType(null, 'Corrigir o número da casa'), 'endereco');
  assert.equal(normalizePresalesAdjustmentType(null, 'Corrigir o telefone do titular'), 'cadastro');
  assert.equal(normalizePresalesAdjustmentType('cadastro', 'Corrigir o CEP'), 'cadastro');
  assert.equal(requirePresalesAdjustmentType('ENDERECO'), 'endereco');
  assert.throws(() => requirePresalesAdjustmentType(''), (error) => error.statusCode === 422);
  assert.throws(
    () => assertAddressAdjustmentType({ tipo_ajuste: 'cadastro', texto: 'Corrigir dados' }),
    (error) => error.statusCode === 422
  );
});

test('editor completo aceita somente ajuste ainda pendente', () => {
  const pending = { id: 'a1', status: 'pendente' };
  assert.equal(assertPendingPresalesAdjustment(pending), pending);
  for (const status of ['ajustado', 'cancelado_auto', 'cancelado']) {
    assert.throws(
      () => assertPendingPresalesAdjustment({ id: 'a1', status }),
      (error) => error.statusCode === 409
    );
  }
});

test('consulta cidades do ERP por busca parcial e limita o resultado', async () => {
  const calls = [];
  const db = {
    async query(sql, params) {
      calls.push({ sql, params });
      return { rows: [{ id: '5', cidade: 'MANAUS - AM' }] };
    },
  };

  assert.deepEqual(await listPresalesCities(db, '  Manaus  ', 100), [
    { id: 5, cidade: 'MANAUS - AM' },
  ]);
  assert.deepEqual(calls[0].params, ['%Manaus%', 'Manaus%', 50]);
  assert.deepEqual(await listPresalesCities(db, 'M'), []);
});

test('não repete a escrita no ERP quando a trilha falha após o commit', async () => {
  const adjustment = { id: 'a1', erp_pedido_id: 77 };
  const desired = {
    cep: '69000-123',
    logradouro: 'Rua Nova',
    numero: '10',
    complemento: null,
    bairro: 'Centro',
    cidade: 'MANAUS - AM',
  };
  let currentAddress = {
    ...desired,
    logradouro: 'Rua Antiga',
  };
  let pending = [];
  let localUpdateAttempts = 0;
  let erpWrites = 0;

  const localQuery = async (sql, params) => {
    if (sql.includes('SELECT id, dados_novos')) return { rows: pending };
    if (sql.includes('INSERT INTO presales_ajuste_correcoes')) {
      pending = [{ id: 'c1', dados_novos: JSON.parse(params[4]) }];
      return { rows: [{ id: 'c1' }] };
    }
    if (sql.includes("SET status = 'aplicada'")) {
      localUpdateAttempts += 1;
      if (localUpdateAttempts === 1) throw new Error('banco local indisponível');
      pending = [];
      return { rows: [] };
    }
    throw new Error(`SQL local inesperado: ${sql}`);
  };
  const readAddress = async () => ({ address: currentAddress });
  const writeAddress = async (_db, _pedidoId, address) => {
    erpWrites += 1;
    const before = currentAddress;
    currentAddress = { ...address };
    return { before, after: currentAddress };
  };

  const first = await applyPresalesAddressCorrection({
    localQuery,
    erpDb: {},
    ajuste: adjustment,
    vendedorId: 'u1',
    input: desired,
    readAddress,
    writeAddress,
  });
  assert.equal(first.auditPending, true);
  assert.equal(erpWrites, 1);

  const retry = await applyPresalesAddressCorrection({
    localQuery,
    erpDb: {},
    ajuste: adjustment,
    vendedorId: 'u1',
    input: desired,
    readAddress,
    writeAddress,
  });
  assert.equal(retry.reconciled, true);
  assert.equal(erpWrites, 1);
});

test('serializa dois envios simultâneos do mesmo ajuste e escreve uma vez no ERP', async () => {
  let lockTail = Promise.resolve();
  const fakePool = {
    async connect() {
      let releaseLock;
      return {
        async query(sql) {
          if (sql.includes('pg_advisory_lock')) {
            const previous = lockTail;
            lockTail = new Promise((resolve) => { releaseLock = resolve; });
            await previous;
          } else if (sql.includes('pg_advisory_unlock')) {
            releaseLock();
          }
          return { rows: [] };
        },
        release() {},
      };
    },
  };
  const adjustment = { id: 'a-concurrent', erp_pedido_id: 77 };
  const desired = {
    cep: '69000-123',
    logradouro: 'Rua Única',
    numero: '20',
    complemento: null,
    bairro: 'Centro',
    cidade: 'MANAUS - AM',
  };
  let currentAddress = { ...desired, logradouro: 'Rua Anterior' };
  let correction = null;
  let erpWrites = 0;
  const localQuery = async (sql, params) => {
    if (sql.includes('SELECT id, dados_novos')) {
      return { rows: correction?.status === 'pendente' ? [correction] : [] };
    }
    if (sql.includes('INSERT INTO presales_ajuste_correcoes')) {
      correction = { id: 'c-concurrent', dados_novos: JSON.parse(params[4]), status: 'pendente' };
      return { rows: [{ id: correction.id }] };
    }
    if (sql.includes("SET status = 'aplicada'")) {
      correction.status = 'aplicada';
      return { rows: [] };
    }
    throw new Error(`SQL local inesperado: ${sql}`);
  };
  const readAddress = async () => ({ address: currentAddress });
  const writeAddress = async (_db, _pedidoId, address) => {
    erpWrites += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    const before = currentAddress;
    currentAddress = { ...address };
    return { before, after: currentAddress };
  };
  const run = () => withPresalesAdjustmentLock(fakePool, adjustment.id, () =>
    applyPresalesAddressCorrection({
      localQuery,
      erpDb: {},
      ajuste: adjustment,
      vendedorId: 'u1',
      input: desired,
      readAddress,
      writeAddress,
    }));

  const [first, second] = await Promise.all([run(), run()]);
  assert.equal(erpWrites, 1);
  assert.equal(first.alreadyApplied, false);
  assert.equal(second.alreadyApplied, true);
});

test('normaliza e exige os cinco campos críticos do endereço', () => {
  assert.deepEqual(
    normalizePresalesAddress({
      cep: '69000-123',
      logradouro: ' Rua A ',
      numero: ' 10 ',
      complemento: '',
      bairro: ' Centro ',
      cidade: ' Manaus - AM ',
    }),
    {
      cep: '69000-123',
      logradouro: 'Rua A',
      numero: '10',
      complemento: null,
      bairro: 'Centro',
      cidade: 'Manaus - AM',
    }
  );
  assert.throws(
    () => normalizePresalesAddress({ cep: '69000-123' }),
    (error) => error.statusCode === 422 && error.fields.includes('logradouro')
  );
});

test('cria endereço exclusivo e troca somente o vínculo do pedido', async () => {
  const calls = [];
  const client = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      if (sql.includes('FROM pedidos p')) {
        return { rows: [{ pedido_id: 77, endereco_id: 88, pessoa_id: 99 }] };
      }
      if (sql.includes('pg_advisory_xact_lock')) return { rows: [] };
      if (sql.includes('FROM cidades')) return { rows: [{ id: 5, cidade: 'MANAUS - AM' }] };
      if (sql.includes('FROM enderecos e') && sql.includes('e.id = $1')) {
        return {
          rows: [{
            id: 88,
            pessoa_id: 99,
            codigo_postal: '69000-000',
            endereco: 'Antiga',
            numero: '1',
            complemento: null,
            bairro: 'Centro',
            cidade_id: 5,
            cidade: 'MANAUS - AM',
          }],
        };
      }
      if (sql.includes('INSERT INTO enderecos')) return { rows: [{ id: 101 }] };
      if (sql.includes('UPDATE pedidos')) return { rows: [] };
      throw new Error(`SQL inesperado: ${sql}`);
    },
    release() {},
  };
  const db = { async connect() { return client; } };

  const result = await updatePresalesBudgetAddress(db, 77, {
    cep: '69000123',
    logradouro: 'Nova',
    numero: '2',
    complemento: 'Casa',
    bairro: 'Centro',
    cidade: 'MANAUS - AM',
  });

  assert.equal(result.enderecoId, 101);
  assert.equal(result.before.logradouro, 'Antiga');
  assert.equal(result.after.logradouro, 'Nova');
  assert.ok(calls.some(({ sql }) => sql.includes('INSERT INTO enderecos')));
  assert.ok(calls.some(({ sql }) => sql.includes('UPDATE pedidos')));
  assert.ok(!calls.some(({ sql }) => sql.includes('UPDATE enderecos')));
  assert.ok(calls.findIndex(({ sql }) => sql.includes('pg_advisory_xact_lock'))
    < calls.findIndex(({ sql }) => sql.includes('INSERT INTO enderecos')));
  assert.equal(calls.at(-1).sql, 'COMMIT');
});

test('faz rollback quando a cidade não existe no ERP', async () => {
  const calls = [];
  const client = {
    async query(sql) {
      calls.push(sql);
      if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [] };
      if (sql.includes('FROM pedidos p')) {
        return { rows: [{ pedido_id: 77, endereco_id: 88, pessoa_id: 99 }] };
      }
      if (sql.includes('pg_advisory_xact_lock')) return { rows: [] };
      if (sql.includes('FROM cidades')) return { rows: [] };
      throw new Error(`SQL inesperado: ${sql}`);
    },
    release() {},
  };
  const db = { async connect() { return client; } };

  await assert.rejects(
    updatePresalesBudgetAddress(db, 77, {
      cep: '69000123',
      logradouro: 'Rua',
      numero: '2',
      bairro: 'Centro',
      cidade: 'INEXISTENTE - AM',
    }),
    (error) => error.statusCode === 422
  );
  assert.equal(calls.at(-1), 'ROLLBACK');
});
