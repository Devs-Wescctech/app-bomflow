import test from 'node:test';
import assert from 'node:assert/strict';

import { enrichPostsalesClientIdentities } from './postsalesClientService.js';

test('carrega em lote apenas pedidos sem nome e preserva identidades locais', async () => {
  let requestedIds = [];
  const rows = [
    { erp_pedido_id: 10, cliente_nome: '', cliente_cpf: null },
    { erp_pedido_id: 20, cliente_nome: 'Nome local', cliente_cpf: '222' },
  ];

  const enriched = await enrichPostsalesClientIdentities(rows, {
    loadIdentities: async (ids) => {
      requestedIds = ids;
      return {
        10: { cliente_nome: 'Nome ERP', cliente_cpf: '111' },
        20: { cliente_nome: 'Não substituir', cliente_cpf: '999' },
      };
    },
  });

  assert.deepEqual(requestedIds, [10]);
  assert.equal(enriched[0].cliente_nome, 'Nome ERP');
  assert.equal(enriched[0].cliente_cpf, '111');
  assert.equal(enriched[1].cliente_nome, 'Nome local');
  assert.equal(enriched[1].cliente_cpf, '222');
});

test('mantém a fila disponível quando a consulta de identidade ao ERP falha', async () => {
  const rows = [{ erp_pedido_id: 10, cliente_nome: null, cliente_cpf: '111' }];
  const errors = [];

  const enriched = await enrichPostsalesClientIdentities(rows, {
    loadIdentities: async () => {
      throw new Error('ERP indisponível');
    },
    logError: (...args) => errors.push(args.join(' ')),
  });

  assert.deepEqual(enriched, rows);
  assert.match(errors[0], /ERP indisponível/);
});