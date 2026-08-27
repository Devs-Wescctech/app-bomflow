import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyPostsalesDetail,
  isPostsalesAuditorIdentity,
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