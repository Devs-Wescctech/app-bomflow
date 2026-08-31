import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyPostsalesCompleteCorrection,
  applyPostsalesContactCorrection,
  normalizePostsalesCorrection,
  postsalesCorrectionType,
  validateCompleteCorrection,
  getPostsalesCorrectionContext,
} from './postsalesCorrectionService.js';

test('classifica somente motivos com escrita segura e restrita ao pedido', () => {
  assert.equal(postsalesCorrectionType('telefone_incorreto'), 'telefone');
  assert.equal(postsalesCorrectionType('email_incorreto'), 'email');
  assert.equal(postsalesCorrectionType('inscritos_divergentes'), null);
});

test('normaliza e valida telefone e e-mail antes de tocar no ERP', () => {
  assert.equal(
    normalizePostsalesCorrection('telefone', { valor: '+55 (51) 99999-1234' }),
    '51999991234'
  );
  assert.equal(
    normalizePostsalesCorrection('email', { valor: ' Cliente@Exemplo.COM ' }),
    'cliente@exemplo.com'
  );
  assert.throws(
    () => normalizePostsalesCorrection('telefone', { valor: '123' }),
    /telefone válido/
  );
  assert.throws(
    () => normalizePostsalesCorrection('email', { valor: 'invalido' }),
    /e-mail válido/
  );
});

test('correção cria intenção auditável antes da escrita e registra antes/depois', async () => {
  const calls = [];
  const localQuery = async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes('SELECT id, dados_novos')) return { rows: [] };
    if (sql.includes('INSERT INTO postsales_correcoes')) return { rows: [{ id: 'correction-id' }] };
    return { rows: [] };
  };
  const writeCalls = [];
  const result = await applyPostsalesContactCorrection({
    localQuery,
    erpDb: {},
    verification: {
      id: 'verification-id',
      erp_pedido_id: 123,
      motivo_devolucao: 'telefone_incorreto',
    },
    actor: { id: 'actor-id', name: 'Supervisora' },
    input: { valor: '(51) 99999-1234' },
    readContext: async () => ({ editable: true, tipo: 'telefone', valor: '5133334444' }),
    writeContact: async (...args) => {
      writeCalls.push(args);
      return {
        tipo: 'telefone',
        before: '5133334444',
        after: '51999991234',
        changed: true,
      };
    },
  });

  assert.equal(result.changed, true);
  assert.equal(writeCalls.length, 1);
  assert.match(calls[1].sql, /INSERT INTO postsales_correcoes/);
  assert.equal(calls[1].params[3], 'actor-id');
  assert.match(calls[2].sql, /SET status = 'aplicada'/);
  assert.deepEqual(JSON.parse(calls[2].params[1]), { valor: '5133334444' });
  assert.deepEqual(JSON.parse(calls[2].params[2]), { valor: '51999991234' });
});

test('reenvio do mesmo valor não repete a escrita no ERP', async () => {
  let writes = 0;
  const result = await applyPostsalesContactCorrection({
    localQuery: async (sql) => (
      sql.includes('SELECT id, dados_novos') ? { rows: [] } : { rows: [] }
    ),
    erpDb: {},
    verification: {
      id: 'verification-id',
      erp_pedido_id: 123,
      motivo_devolucao: 'email_incorreto',
    },
    actor: { id: 'actor-id', name: 'Supervisora' },
    input: { valor: 'cliente@exemplo.com' },
    readContext: async () => ({
      editable: true,
      tipo: 'email',
      valor: 'cliente@exemplo.com',
      valor_persistido: 'cliente@exemplo.com',
    }),
    writeContact: async () => {
      writes += 1;
      return {};
    },
  });

  assert.equal(result.alreadyApplied, true);
  assert.equal(writes, 0);
});

test('telefone igual ao fallback global ainda preenche o campo local do pedido', async () => {
  const calls = [];
  let writes = 0;
  const result = await applyPostsalesContactCorrection({
    localQuery: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes('SELECT id, dados_novos')) return { rows: [] };
      if (sql.includes('INSERT INTO postsales_correcoes')) {
        return { rows: [{ id: 'correction-id' }] };
      }
      return { rows: [] };
    },
    erpDb: {},
    verification: {
      id: 'verification-id',
      erp_pedido_id: 123,
      motivo_devolucao: 'telefone_incorreto',
    },
    actor: { id: 'actor-id', name: 'Supervisora' },
    input: { valor: '51999991234' },
    readContext: async () => ({
      editable: true,
      tipo: 'telefone',
      valor: '51999991234',
      valor_persistido: '',
    }),
    writeContact: async () => {
      writes += 1;
      return {
        tipo: 'telefone',
        before: '',
        after: '51999991234',
        changed: true,
      };
    },
  });

  assert.equal(writes, 1);
  assert.equal(result.changed, true);
  assert.deepEqual(JSON.parse(calls[1].params[5]), { valor: null });
});

test('editor completo é carregável para todos os motivos, inclusive outros', async () => {
  const db = { query: async (sql) => {
    if (sql.includes('FROM pedidos p')) return { rows: [{ id: 7, situacao: 'M', email_contato: 'a@b.com', observacoes: null, endereco_id: null, prazo_pagamento_id: 2, numero_parcelas: 3 }] };
    if (sql.includes('FROM pedidos_pessoas WHERE')) return { rows: [{ id: 10, pessoa_id: 99, nome_pessoa: 'Titular', cpf: '12345678901', data_nascimento: '2000-01-02', sexo: 'F', telefone: '51999999999', parentesco: 'T' }] };
    if (sql.includes('FROM itens_pedidos i')) return { rows: [{ id: 4, produto_id: 8, descricao: 'Plano', preco: '10', quantidade: '1', valor_total_item: '10', pessoa_ids: [10] }] };
    return { rows: [] };
  }};
  for (const reason of ['telefone_incorreto', 'inscritos_divergentes', 'outros']) {
    const result = await getPostsalesCorrectionContext(db, 7, reason);
    assert.equal(result.editable, true);
    assert.equal(result.editor.pessoas[0].id, 10);
    assert.deepEqual(result.editor.itens[0].pessoa_ids, [10]);
  }
});

test('valida editor completo: item, preço, parcelas e referências', () => {
  const base = { editor: { revision: 'a'.repeat(64), email: 'x@y.com', plano_pagamento_id: 1, numero_parcelas: 1,
    pessoas: [{ id: 1, nome: 'T', is_titular: true }], itens: [{ produto_id: 2, preco: 1, pessoa_refs: [1] }] } };
  assert.equal(validateCompleteCorrection(base).itens.length, 1);
  assert.throws(() => validateCompleteCorrection({ editor: { ...base.editor, itens: [] } }), /ao menos um item/);
  assert.throws(() => validateCompleteCorrection({ editor: { ...base.editor, numero_parcelas: 0 } }), /parcelas/);
  assert.throws(() => validateCompleteCorrection({ editor: { ...base.editor, itens: [{ produto_id: 2, preco: -1, pessoa_refs: [1] }] } }), /Preço inválido/);
  assert.throws(() => validateCompleteCorrection({ editor: { ...base.editor, itens: [{ produto_id: 2, preco: 1, pessoa_refs: [] }] } }), /ao menos uma pessoa/);
});

test('editor completo do retorno Pré-Vendas usa a trilha do ajuste, não a trilha Pós-Vendas', async () => {
  const db = { query: async (sql) => {
    if (sql.includes('FROM pedidos p')) return { rows: [{ id: 77, situacao: 'M', email_contato: 'a@b.com', observacoes: null, endereco_id: null, prazo_pagamento_id: 2, numero_parcelas: 1 }] };
    if (sql.includes('FROM pedidos_pessoas WHERE')) return { rows: [{ id: 10, pessoa_id: 99, nome_pessoa: 'Titular', cpf: '12345678901', data_nascimento: '2000-01-02', sexo: 'F', telefone: '51999999999', parentesco: 'T' }] };
    if (sql.includes('FROM itens_pedidos i')) return { rows: [{ id: 4, produto_id: 8, descricao: 'Plano', preco: '10', quantidade: '1', valor_total_item: '10', pessoa_ids: [10] }] };
    return { rows: [] };
  }};
  const current = await getPostsalesCorrectionContext(db, 77, null);
  const localCalls = [];
  const result = await applyPostsalesCompleteCorrection({
    localQuery: async (sql, params) => {
      localCalls.push({ sql, params });
      return { rows: [] };
    },
    erpDb: db,
    verification: { id: 'ajuste-1', erp_pedido_id: 77, motivo_devolucao: null },
    actor: { id: 'vendedor-1', name: 'Vendedor' },
    input: { editor: { ...current.editor, itens: current.editor.itens.map((item) => ({ ...item, pessoa_refs: item.pessoa_ids })) } },
    auditKind: 'presales',
  });

  assert.equal(result.alreadyApplied, true);
  assert.equal(result.changed, false);
  assert.match(localCalls[0].sql, /FROM presales_ajuste_correcoes/);
  assert.doesNotMatch(localCalls[0].sql, /postsales_correcoes/);
});