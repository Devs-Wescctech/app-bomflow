import test from 'node:test';
import assert from 'node:assert/strict';

import { fetchErpAllPages } from './erpPagination.js';

test('paginação avança pelo tamanho recebido quando o ERP limita cada página a 100', async () => {
  const originalFetch = global.fetch;
  const source = Array.from({ length: 250 }, (_, index) => ({ id: index + 1 }));
  const offsets = [];

  global.fetch = async (url) => {
    const parsed = new URL(url);
    const offset = Number(parsed.searchParams.get('offset'));
    offsets.push(offset);
    // Simula o teto real do ERP mesmo quando o cliente pede limit=10000.
    const page = source.slice(offset, offset + 100);
    return new Response(JSON.stringify(page), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    const result = await fetchErpAllPages(
      'http://erp.test/Usuarios',
      'Bearer test',
      { label: 'Usuários ERP teste', timeoutMs: 1000 }
    );

    assert.equal(result.length, 250);
    assert.equal(result[149].id, 150);
    assert.deepEqual(offsets, [0, 100, 200, 250]);
  } finally {
    global.fetch = originalFetch;
  }
});

test('HTTP 204 encerra a paginação sem tentar converter corpo vazio em JSON', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => new Response(null, { status: 204 });

  try {
    const result = await fetchErpAllPages(
      'http://erp.test/Usuarios',
      'Bearer test',
      { label: 'Usuários ERP vazio', timeoutMs: 1000 }
    );
    assert.deepEqual(result, []);
  } finally {
    global.fetch = originalFetch;
  }
});