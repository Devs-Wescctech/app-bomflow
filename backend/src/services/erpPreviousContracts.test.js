import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getContratosAnteriores,
  normalizeContratosAnteriores,
} from './erpDbService.js';

test('normaliza apenas situações relevantes, omite cancelados e remove duplicados', () => {
  assert.deepEqual(normalizeContratosAnteriores([
    { numero_contrato: 101, situacao_contrato: 'A' },
    { numero_contrato: 102, situacao_contrato: 'I' },
    { numero_contrato: 103, situacao_contrato: 'P' },
    { numero_contrato: 104, situacao_contrato: 'S' },
    { numero_contrato: 105, situacao_contrato: 'E' },
    { numero_contrato: 106, situacao_contrato: 'C' },
    { numero_contrato: 101, situacao_contrato: 'A' },
    { numero_contrato: null, situacao_contrato: 'A' },
  ]), [
    { numero: '101', situacao: 'ATIVO' },
    { numero: '102', situacao: 'INADIMPLENTE' },
    { numero: '103', situacao: 'SUSPENSO' },
    { numero: '104', situacao: 'SUSPENSO' },
    { numero: '105', situacao: 'ENCERRADO' },
  ]);
});

test('não converte situações fora dos quatro estados exibidos', () => {
  assert.deepEqual(normalizeContratosAnteriores([
    { numero_contrato: 301, situacao_contrato: 'C' },
    { numero_contrato: 302, situacao_contrato: 'M' },
    { numero_contrato: 303, situacao_contrato: 'N' },
    { numero_contrato: 304, situacao_contrato: '' },
  ]), []);
});

test('consulta é limitada ao titular, exclui contrato atual e usa timeout curto', async () => {
  let config;
  const db = {
    query: async (value) => {
      config = value;
      return { rows: [{ numero_contrato: 200, situacao_contrato: 'A', titular_resolvido: true }] };
    },
  };

  const contratos = await getContratosAnteriores(77, { db });

  assert.deepEqual(contratos, [{ numero: '200', situacao: 'ATIVO' }]);
  assert.deepEqual(config.values, [77]);
  assert.equal(config.query_timeout, 5000);
  assert.match(config.text, /cs\.contratante_id = pa\.pessoa_id/);
  assert.match(config.text, /cs\.id <> pa\.contrato_id/);
  assert.match(config.text, /cs\.contrato_servicos <> pa\.numero_pedido/);
  assert.match(config.text, /LIMIT 20/);
});

test('não informa histórico vazio quando o titular canônico não foi identificado', async () => {
  const db = {
    query: async () => ({
      rows: [{ numero_contrato: null, situacao_contrato: null, titular_resolvido: false }],
    }),
  };

  await assert.rejects(
    getContratosAnteriores(77, { db }),
    /Titular canônico do pedido não identificado/
  );
});

test('retorna vazio somente quando o titular foi identificado e não há contratos relevantes', async () => {
  const db = {
    query: async () => ({
      rows: [{ numero_contrato: null, situacao_contrato: null, titular_resolvido: true }],
    }),
  };

  assert.deepEqual(await getContratosAnteriores(77, { db }), []);
});

test('não consulta o ERP para pedido inválido', async () => {
  const db = { query: async () => assert.fail('não deveria consultar') };
  assert.deepEqual(await getContratosAnteriores(null, { db }), []);
  assert.deepEqual(await getContratosAnteriores(-1, { db }), []);
});