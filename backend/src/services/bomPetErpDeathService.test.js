import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertBomPetPessoaConsistency,
  ERP_PET_DEATH_CHARACTERISTIC_ID,
  isBomPetErpDeathSyncEnabled,
  markBomPetPessoaFalecidaWithDb,
  normalizePetIdentity,
  selectPetPessoa,
  toDateOnly,
} from './bomPetErpDeathService.js';

test('normaliza descrição do pet sem depender de caixa, acento ou espaços', () => {
  assert.equal(
    normalizePetIdentity('  Miláh   - Felina SRD  '),
    'MILAH - FELINA SRD'
  );
});

test('normaliza DATE do PostgreSQL e timestamp ISO sem aceitar data de calendário inválida', () => {
  assert.equal(toDateOnly(new Date('2026-09-02T00:00:00.000Z')), '2026-09-02');
  assert.equal(toDateOnly('2026-09-02T00:00:00.000Z'), '2026-09-02');
  assert.equal(toDateOnly('2026-02-30'), null);
});

test('seleciona a Pessoa pela descrição completa e preserva id interno e código exibido', () => {
  const selected = selectPetPessoa([
    { id: '324018011', pessoa: '2630169', nome_completo: 'MILAH - FELINA SRD - PEQUENO' },
    { id: '324018018', pessoa: '2630170', nome_completo: 'NINA - CANINA SRD - MEDIO' },
  ], {
    petDescricao: 'Milah - Felina SRD - Pequeno',
    petNome: 'Milah',
  });

  assert.deepEqual(selected, {
    pessoaId: 324018011,
    pessoaCodigo: '2630169',
    nomeCompleto: 'MILAH - FELINA SRD - PEQUENO',
    dataFalecimento: null,
    matchStrategy: 'exact_description',
  });
});

test('usa o nome somente quando ele identifica uma única Pessoa no contrato', () => {
  const selected = selectPetPessoa([
    { id: '10', pessoa: '100', nome_completo: 'MILAH - FELINA SRD' },
    { id: '11', pessoa: '101', nome_completo: 'NINA - CANINA SRD' },
  ], {
    petDescricao: 'MILAH - descrição antiga',
    petNome: 'MILAH',
  });
  assert.equal(selected.pessoaId, 10);
  assert.equal(selected.matchStrategy, 'name_only');
});

test('escrita estrita rejeita correspondência somente pelo nome', () => {
  assert.throws(
    () => selectPetPessoa([
      { id: '10', pessoa: '100', nome_completo: 'MILAH - FELINA SRD' },
    ], {
      petDescricao: 'MILAH - descrição antiga',
      petNome: 'MILAH',
      requireExactDescription: true,
    }),
    (error) => error.code === 'erp_pet_identity_weak_match'
  );
});

test('bloqueia nome ambíguo em vez de escolher a Pessoa errada', () => {
  assert.throws(
    () => selectPetPessoa([
      { id: '10', pessoa: '100', nome_completo: 'MILAH - FELINA SRD' },
      { id: '11', pessoa: '101', nome_completo: 'MILAH - FELINA SIAMES' },
    ], { petDescricao: '', petNome: 'MILAH' }),
    (error) => error.code === 'erp_pet_identity_ambiguous'
  );
});

test('bloqueia Pessoa armazenada quando a identidade resolvida mudou', () => {
  assert.doesNotThrow(() => assertBomPetPessoaConsistency('10', 10));
  assert.throws(
    () => assertBomPetPessoaConsistency('10', 11),
    (error) => error.code === 'erp_pet_identity_changed'
  );
});

function createFakeDb({
  initialCharacteristic,
  initialCharacteristicRows,
  contractRows = null,
  removeCharacteristicAfterProbe = false,
} = {}) {
  let characteristicRows = initialCharacteristicRows ||
    (initialCharacteristic !== undefined ? [{ id: 700, valor: initialCharacteristic }] : []);
  const calls = [];
  const client = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK' ||
          sql.startsWith('SET LOCAL lock_timeout') ||
          sql.startsWith('LOCK TABLE caracteristicas_pessoas')) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes('FROM pessoas_contratos')) {
        return { rows: contractRows || [], rowCount: contractRows?.length || 0 };
      }
      if (sql.includes('FROM usuarios')) {
        return { rows: [{ id: 55367753 }], rowCount: 1 };
      }
      if (sql.includes('UPDATE caracteristicas_pessoas')) {
        characteristicRows = [{ ...characteristicRows[0], valor: params[1] }];
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes('INSERT INTO caracteristicas_pessoas')) {
        characteristicRows = [{ id: 701, valor: params[2] }];
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes('FROM caracteristicas_pessoas')) {
        const rows = characteristicRows;
        if (removeCharacteristicAfterProbe) {
          characteristicRows = [];
          removeCharacteristicAfterProbe = false;
        }
        return { rows, rowCount: rows.length };
      }
      if (sql.includes('FROM pessoas')) {
        return {
          rows: [{
            id: params[0],
            pessoa: '2630169',
            nome_completo: 'MILAH - FELINA SRD',
          }],
          rowCount: 1,
        };
      }
      throw new Error(`SQL inesperado no teste: ${sql}`);
    },
    release() {
      calls.push({ sql: 'RELEASE', params: [] });
    },
  };
  return {
    db: { async connect() { return client; } },
    calls,
  };
}

test('insere a característica Data de Falecimento sob lock e confirma por releitura', async () => {
  const { db, calls } = createFakeDb();
  const result = await markBomPetPessoaFalecidaWithDb(db, {
    pessoaId: 324018011,
    dataFalecimento: new Date('2026-09-02T00:00:00.000Z'),
  });

  assert.equal(result.changed, true);
  assert.equal(result.dataFalecimento, '2026-09-02');
  assert.equal(result.characteristicId, ERP_PET_DEATH_CHARACTERISTIC_ID);
  assert.equal(calls.filter((call) => call.sql.includes('LOCK TABLE caracteristicas_pessoas')).length, 1);
  assert.equal(calls.filter((call) => call.sql.includes('INSERT INTO caracteristicas_pessoas')).length, 1);
  assert.equal(calls.filter((call) => call.sql.includes('UPDATE pessoas')).length, 0);
  assert.ok(calls.some((call) => call.sql === 'COMMIT'));
});

test('atualiza a característica existente sem obter lock da tabela inteira', async () => {
  const { db, calls } = createFakeDb({ initialCharacteristic: null });
  const result = await markBomPetPessoaFalecidaWithDb(db, {
    pessoaId: 324018011,
    dataFalecimento: '2026-09-02',
  });

  assert.equal(result.changed, true);
  assert.equal(calls.filter((call) => call.sql.includes('UPDATE caracteristicas_pessoas')).length, 1);
  assert.equal(calls.filter((call) => call.sql.includes('LOCK TABLE caracteristicas_pessoas')).length, 0);
  assert.equal(calls.filter((call) => call.sql.includes('INSERT INTO caracteristicas_pessoas')).length, 0);
});

test('não insere sem lock se a característica desaparecer entre a sondagem e o row lock', async () => {
  const { db, calls } = createFakeDb({
    initialCharacteristic: null,
    removeCharacteristicAfterProbe: true,
  });
  await assert.rejects(
    markBomPetPessoaFalecidaWithDb(db, {
      pessoaId: 324018011,
      dataFalecimento: '2026-09-02',
    }),
    (error) => error.code === 'erp_pet_death_characteristic_changed'
  );

  assert.equal(calls.filter((call) => call.sql.includes('LOCK TABLE caracteristicas_pessoas')).length, 0);
  assert.equal(calls.filter((call) => call.sql.includes('INSERT INTO caracteristicas_pessoas')).length, 0);
  assert.ok(calls.some((call) => call.sql === 'ROLLBACK'));
});

test('revalida e bloqueia o vínculo contrato-Pessoa na mesma transação da escrita', async () => {
  const contractRows = [{
    id: '324018011',
    pessoa: '2630169',
    nome_completo: 'MILAH - FELINA SRD',
    data_falecimento: null,
  }];
  const { db, calls } = createFakeDb({ contractRows, initialCharacteristic: null });
  const result = await markBomPetPessoaFalecidaWithDb(db, {
    pessoaId: 324018011,
    contratoId: 991,
    petDescricao: 'Milah - Felina SRD',
    petNome: 'Milah',
    dataFalecimento: '2026-09-02',
  });

  assert.equal(result.pessoaId, 324018011);
  const identityCall = calls.find((call) => call.sql.includes('FROM pessoas_contratos'));
  assert.ok(identityCall?.sql.includes('FOR UPDATE OF pc, p'));
  assert.ok(calls.findIndex((call) => call === identityCall) > calls.findIndex((call) => call.sql === 'BEGIN'));
  assert.ok(calls.findIndex((call) => call.sql.includes('UPDATE caracteristicas_pessoas')) > calls.findIndex((call) => call === identityCall));
});

test('é idempotente quando a mesma data já está preenchida', async () => {
  const { db, calls } = createFakeDb({ initialCharacteristic: '2026-09-02' });
  const result = await markBomPetPessoaFalecidaWithDb(db, {
    pessoaId: 324018011,
    dataFalecimento: '2026-09-02',
  });

  assert.equal(result.alreadyApplied, true);
  assert.equal(calls.filter((call) => call.sql.includes('UPDATE caracteristicas_pessoas')).length, 0);
});

test('não sobrescreve data de falecimento divergente', async () => {
  const { db, calls } = createFakeDb({ initialCharacteristic: '2026-09-01' });
  await assert.rejects(
    markBomPetPessoaFalecidaWithDb(db, {
      pessoaId: 324018011,
      dataFalecimento: '2026-09-02',
    }),
    (error) => error.code === 'erp_pet_death_date_conflict'
  );
  assert.ok(calls.some((call) => call.sql === 'ROLLBACK'));
  assert.equal(calls.filter((call) => call.sql.includes('UPDATE caracteristicas_pessoas')).length, 0);
});

test('bloqueia mais de uma característica de falecimento para a mesma Pessoa', async () => {
  const { db } = createFakeDb({
    initialCharacteristicRows: [
      { id: 700, valor: '2026-09-02' },
      { id: 701, valor: '2026-09-02' },
    ],
  });
  await assert.rejects(
    markBomPetPessoaFalecidaWithDb(db, {
      pessoaId: 324018011,
      dataFalecimento: '2026-09-02',
    }),
    (error) => error.code === 'erp_pet_death_characteristic_ambiguous'
  );
});

test('sincronização ERP fica desabilitada por padrão até a homologação', () => {
  assert.equal(isBomPetErpDeathSyncEnabled({}), false);
  assert.equal(isBomPetErpDeathSyncEnabled({ BOM_PET_ERP_DEATH_SYNC_ENABLED: 'true' }), true);
});