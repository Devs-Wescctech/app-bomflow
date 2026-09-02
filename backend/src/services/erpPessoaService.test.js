import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lookupPessoaByCpf, resolvePessoa } from './erpPessoaService.js';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('lookup rejeita CPF com mais de uma Pessoa correspondente', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => jsonResponse({
    results: [
      { id: 1, pessoa: 'A', cpf: '123.456.789-01' },
      { id: 2, pessoa: 'B', cpf: '123.456.789-01' },
    ],
  });
  try {
    await assert.rejects(
      lookupPessoaByCpf('token', '12345678901'),
      (error) => error.statusCode === 409 && error.code === 'erp_pessoas_ambiguas'
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('resolve relê e reaproveita Pessoa criada concorrentemente', async () => {
  const originalFetch = globalThis.fetch;
  let call = 0;
  globalThis.fetch = async (url, options = {}) => {
    call += 1;
    if (call === 1) return jsonResponse({ results: [] });
    if (options.method === 'POST') return jsonResponse({ error: 'CPF já cadastrado' }, 400);
    return jsonResponse({ results: [{ id: 42, pessoa: '9001', cpf: '123.456.789-01', nome_completo: 'ANA' }] });
  };
  try {
    const pessoa = await resolvePessoa('token', { cpf: '12345678901', nome: 'ANA' });
    assert.equal(pessoa.id, 42);
    assert.equal(pessoa.codigo, '9001');
    assert.equal(call, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('atualização só conclui depois de confirmar a releitura no ERP', async () => {
  const originalFetch = globalThis.fetch;
  const methods = [];
  let read = 0;
  globalThis.fetch = async (url, options = {}) => {
    methods.push(options.method || 'GET');
    if (options.method === 'PUT') return jsonResponse({ ok: true });
    read += 1;
    return jsonResponse({
      results: [{
        id: 7,
        pessoa: '77',
        cpf: '123.456.789-01',
        nome_completo: read === 1 ? 'ANA ANTIGA' : 'ANA NOVA',
      }],
    });
  };
  try {
    const pessoa = await resolvePessoa('token', { cpf: '12345678901', nome: 'ANA NOVA' });
    assert.equal(pessoa.nome, 'ANA NOVA');
    assert.deepEqual(methods, ['GET', 'PUT', 'GET']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Pessoa nova é confirmada por identificador antes de concluir', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, method: options.method || 'GET' });
    if (calls.length === 1) return jsonResponse({ results: [] });
    if (options.method === 'POST') {
      return jsonResponse({ id: 88, pessoa: '8800', nome_completo: 'BIA', cpf: '123.456.789-01' });
    }
    return jsonResponse({ id: 88, pessoa: '8800', nome_completo: 'BIA', cpf: '123.456.789-01' });
  };
  try {
    const pessoa = await resolvePessoa('token', { cpf: '12345678901', nome: 'BIA' });
    assert.equal(pessoa.id, 88);
    assert.equal(calls[2].url.endsWith('/Pessoas/88'), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});