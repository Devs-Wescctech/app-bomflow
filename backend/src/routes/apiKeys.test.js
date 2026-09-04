import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import { createApiKeysRouter } from './apiKeys.js';

const storedKey = {
  id: 'key-1',
  name: 'Integração',
  key_prefix: 'bfk_example',
  key_hash: 'hash-not-exposed',
  scopes: ['vendas_pf'],
  active: true,
  last_used_at: null,
  expires_at: null,
  revoked_at: null,
  created_at: '2026-09-04T12:00:00.000Z',
};

async function withApiKeysServer(queryFn, callback) {
  const app = express();
  app.use(express.json());
  app.use('/api-keys', createApiKeysRouter({
    queryFn,
    generateApiKeyFn: () => ({
      plainKey: 'bfk_plaintext_once',
      keyHash: 'generated-hash',
      keyPrefix: 'bfk_plaintex',
    }),
    authMiddlewareFn: (req, _res, next) => {
      req.user = { id: 'admin-1', role: 'admin' };
      next();
    },
  }));

  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  try {
    await callback(`http://127.0.0.1:${port}/api-keys`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

test('listagem consulta e serializa chaves sem expor hash', async () => {
  const calls = [];
  await withApiKeysServer(async (sql, params) => {
    calls.push({ sql, params });
    return { rows: [storedKey] };
  }, async (url) => {
    const response = await fetch(url);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body, [{
      id: 'key-1',
      name: 'Integração',
      keyPrefix: 'bfk_example',
      scopes: ['vendas_pf'],
      active: true,
      lastUsedAt: null,
      expiresAt: null,
      revokedAt: null,
      createdAt: '2026-09-04T12:00:00.000Z',
    }]);
    assert.equal('key_hash' in body[0], false);
  });

  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /^SELECT \* FROM api_keys/);
  assert.equal(calls[0].params, undefined);
});

test('criação insere a chave e retorna o valor em texto somente na resposta', async () => {
  const calls = [];
  await withApiKeysServer(async (sql, params) => {
    calls.push({ sql, params });
    return {
      rows: [{
        ...storedKey,
        name: 'ERP parceiro',
        key_prefix: 'bfk_plaintex',
      }],
    };
  }, async (url) => {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: '  ERP parceiro  ',
        scopes: ['vendas_pf'],
        expiresAt: '2027-01-01T00:00:00.000Z',
      }),
    });
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.plainKey, 'bfk_plaintext_once');
    assert.equal(body.keyPrefix, 'bfk_plaintex');
  });

  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /^INSERT INTO api_keys/);
  assert.deepEqual(calls[0].params, [
    'ERP parceiro',
    'generated-hash',
    'bfk_plaintex',
    ['vendas_pf'],
    'admin-1',
    '2027-01-01T00:00:00.000Z',
  ]);
});

test('revogação desativa e preserva o registro para auditoria', async () => {
  const calls = [];
  await withApiKeysServer(async (sql, params) => {
    calls.push({ sql, params });
    return {
      rows: [{
        ...storedKey,
        active: false,
        revoked_at: '2026-09-04T13:00:00.000Z',
      }],
    };
  }, async (url) => {
    const response = await fetch(`${url}/key-1/revoke`, { method: 'POST' });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.id, 'key-1');
    assert.equal(body.active, false);
    assert.equal(body.revokedAt, '2026-09-04T13:00:00.000Z');
  });

  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /^UPDATE api_keys SET active = FALSE/);
  assert.doesNotMatch(calls[0].sql, /DELETE FROM/);
  assert.deepEqual(calls[0].params, ['key-1']);
});

test('exclusão definitiva mantém DELETE restrito ao endpoint explícito', async () => {
  const calls = [];
  await withApiKeysServer(async (sql, params) => {
    calls.push({ sql, params });
    return { rows: [{ id: 'key-1' }] };
  }, async (url) => {
    const response = await fetch(`${url}/key-1`, { method: 'DELETE' });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true });
  });

  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /^DELETE FROM api_keys/);
  assert.deepEqual(calls[0].params, ['key-1']);
});