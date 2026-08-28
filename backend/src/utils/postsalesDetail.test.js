import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyPostsalesDetail,
  isPostsalesAuditorIdentity,
  mergePostsalesClientIdentities,
  missingPostsalesClientPedidoIds,
  selectTrackedClientName,
} from './postsalesDetail.js';

test('autoriza somente identidades elegíveis do Pós-Vendas', () => {
  assert.equal(isPostsalesAuditorIdentity({ agentType: 'post_sales' }), true);
  assert.equal(isPostsalesAuditorIdentity({ agentType: 'quality', modules: ['post_sales'] }), true);
  assert.equal(isPostsalesAuditorIdentity({ role: 'admin' }), true);
  assert.equal(isPostsalesAuditorIdentity({ agentType: 'sales', modules: ['sales'] }), false);
  assert.equal(isPostsalesAuditorIdentity({ agentType: 'supervisor', modules: ['sales'] }), false);
});

test('distingue detalhe completo, parcial, vazio e falha do ERP', () => {
  assert.equal(classifyPostsalesDetail({ pessoas: [{ nome: 'Titular' }], produtos: [] }), 'ok');
  assert.equal(classifyPostsalesDetail({ pessoas: [], produtos: [], email: 'cliente@exemplo.com' }), 'ok');
  assert.equal(classifyPostsalesDetail({ pessoas: [], produtos: [] }), 'empty');
  assert.equal(classifyPostsalesDetail(null, new Error('ERP indisponível')), 'error');
});

test('rastreia pessoa_contato como nome do cliente de Vendas PF e preserva fallbacks', () => {
  assert.equal(
    selectTrackedClientName({
      modulo: 'sales',
      pessoa_contato: 'CLIENTE VENDAS PF',
      nome_contratante: 'fallback antigo',
    }),
    'CLIENTE VENDAS PF'
  );
  assert.equal(selectTrackedClientName({ nome_contratante: 'Nome legado' }), 'Nome legado');
  assert.equal(selectTrackedClientName({ contratante_nome: 'Outro legado' }), 'Outro legado');
  assert.equal(selectTrackedClientName({}), null);
});

test('identifica pedidos sem nome e mescla o titular do ERP sem sobrescrever o rastreio local', () => {
  const rows = [
    { erp_pedido_id: 10, cliente_nome: null, cliente_cpf: null },
    { erp_pedido_id: 20, cliente_nome: 'Nome local', cliente_cpf: '222' },
    { erp_pedido_id: null, cliente_nome: '', cliente_cpf: null },
  ];

  assert.deepEqual(missingPostsalesClientPedidoIds(rows), [10]);
  assert.deepEqual(
    mergePostsalesClientIdentities(rows, {
      10: { cliente_nome: 'Nome ERP', cliente_cpf: '111' },
      20: { cliente_nome: 'Não substituir', cliente_cpf: '999' },
    }),
    [
      { erp_pedido_id: 10, cliente_nome: 'Nome ERP', cliente_cpf: '111' },
      { erp_pedido_id: 20, cliente_nome: 'Nome local', cliente_cpf: '222' },
      { erp_pedido_id: null, cliente_nome: null, cliente_cpf: null },
    ]
  );
});