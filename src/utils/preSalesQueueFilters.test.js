import test from 'node:test';
import assert from 'node:assert/strict';

import {
  filterPreSalesQueue,
  findTopPending,
} from './preSalesQueueFilters.js';

const items = [
  {
    erp_id: 1,
    numero_orcamento: 1001,
    nome_titular: 'Ana Lima',
    nome_vendedor: 'João',
    cpf_titular: '111.222.333-44',
    situacao: 'I',
    canal_id: 10,
    _priority: 'critico',
    _waitMs: 100,
  },
  {
    erp_id: 2,
    numero_orcamento: 1002,
    nome_titular: 'Bruno Várzea',
    nome_vendedor: 'Maria',
    cpf_titular: '555.666.777-88',
    situacao: 'I',
    canal_id: 10,
    _priority: 'novo',
    _waitMs: 20,
  },
];

const sortItems = (list) => list.sort((a, b) => b._waitMs - a._waitMs);

test('combina busca com aba rápida sobre o conjunto já filtrado pelo canal', () => {
  const filtered = filterPreSalesQueue(items, {
    search: 'Bruno',
    tab: 'novo',
    isMine: (item) => item.nome_vendedor === 'Maria',
    sortItems,
  });

  assert.deepEqual(filtered.map((item) => item.erp_id), [2]);
});

test('aba Meus é combinada com busca por CPF', () => {
  const filtered = filterPreSalesQueue(items, {
    search: '555666',
    tab: 'meus',
    isMine: (item) => item.nome_vendedor === 'Maria',
    sortItems,
  });

  assert.deepEqual(filtered.map((item) => item.erp_id), [2]);
});

test('Auditar Agora escolhe somente dentro do resultado visível', () => {
  const visible = filterPreSalesQueue(items, {
    search: 'Bruno',
    tab: 'novo',
    sortItems,
  });
  const topPending = findTopPending(visible, {
    isPending: (item) => item.situacao === 'I',
    sortItems,
  });

  assert.equal(topPending?.erp_id, 2);
});

test('Auditar Agora fica indisponível quando a aba não tem item pendente', () => {
  const topPending = findTopPending([], {
    isPending: (item) => item.situacao === 'I',
    sortItems,
  });

  assert.equal(topPending, null);
});