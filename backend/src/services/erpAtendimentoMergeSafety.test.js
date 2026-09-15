import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  reconcilePendingErpAtendimentosWithDeps,
  upsertBomAutoAtendimentoWithDb,
  upsertBomPetAtendimentoWithDb,
} from './erpAtendimentoService.js';

test('Bom Auto rejeita colisão de protocolo com identidade ERP diferente', async () => {
  const db = {
    async query(sql) {
      assert.match(sql, /x_atendimentos_bom_auto\.documento_cliente/);
      assert.match(sql, /x_atendimentos_bom_auto\.placa/);
      return { rows: [] };
    },
  };

  await assert.rejects(
    () => upsertBomAutoAtendimentoWithDb(db, {
      protocolo: 'BA2609140001',
      documento_cliente: '000.000.000-00',
      placa: 'ABC1D23',
    }),
    (error) => error.code === 'erp_atendimento_protocol_collision'
      && error.statusCode === 409
  );
});

test('Bom Pet rejeita colisão de protocolo com identidade ERP diferente', async () => {
  const db = {
    async query(sql) {
      assert.match(sql, /x_atendimentos_bom_pet\.documento_cliente/);
      assert.match(sql, /x_atendimentos_bom_pet\.pet_contrato_id/);
      assert.match(sql, /x_atendimentos_bom_pet\.pet_nome/);
      assert.match(sql, /x_atendimentos_bom_pet\.origem/);
      return { rows: [] };
    },
  };

  await assert.rejects(
    () => upsertBomPetAtendimentoWithDb(db, {
      protocolo: 'BP2609140001',
      documento_cliente: '000.000.000-00',
      pet_contrato_id: 123,
      pet_nome: 'Pet Teste',
      origem: 'Plano',
    }),
    (error) => error.code === 'erp_atendimento_protocol_collision'
      && error.statusCode === 409
  );
});

test('reconciliador não tenta novamente colisões de protocolo automaticamente', async () => {
  const calls = [];
  const result = await reconcilePendingErpAtendimentosWithDeps({
    localQuery: async (sql) => {
      calls.push(sql);
      return { rows: [] };
    },
    syncEnabled: () => true,
  });

  assert.equal(result.checked, 0);
  assert.match(calls[0], /last_error IS DISTINCT FROM 'erp_atendimento_protocol_collision'/);
});

test('inicialização preserva tarefas mescladas sem DDL concorrente das rotas', () => {
  const entities = fs.readFileSync(new URL('../routes/entities.js', import.meta.url), 'utf8');
  const schema = fs.readFileSync(new URL('../config/schema.sql', import.meta.url), 'utf8');
  const server = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');

  for (const table of [
    'bomflow_orcamentos',
    'orcamento_documentos',
    'trainings',
    'training_uploads',
    'training_object_deletions',
  ]) {
    assert.doesNotMatch(entities, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
    assert.match(schema, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  for (const column of ['adesao_zero', 'erp_approval_sync_status']) {
    assert.match(schema, new RegExp(`ALTER TABLE bomflow_orcamentos ADD COLUMN IF NOT EXISTS ${column}`));
  }
  for (const column of ['duration_seconds', 'page_count']) {
    assert.match(schema, new RegExp(`ALTER TABLE trainings ADD COLUMN IF NOT EXISTS ${column}`));
  }
  assert.doesNotMatch(server, /await reconcileAtendimentos\(\)/);
  assert.match(server, /setTimeout\(runApprovalSync, 45 \* 1000\)/);
});