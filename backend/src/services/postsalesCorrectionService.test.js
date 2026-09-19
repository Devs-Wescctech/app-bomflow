import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  applyPostsalesCompleteCorrection,
  applyPostsalesContactCorrection,
  normalizePostsalesCorrection,
  postsalesCorrectionType,
  validateCompleteCorrection,
  getPostsalesCorrectionContext,
  enforceAuthoritativeItemPrices,
  itemNeedsCatalogValidation,
  eligibleCorrectionCatalogRows,
  resolveCorrectionCatalogBinding,
  validateCorrectionIdentityNamespace,
  addCorrectionCatalogContext,
  correctionCatalogChoices,
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

test('valida editor completo: CPF, item, preço, parcelas e referências', () => {
  const base = { editor: { revision: 'a'.repeat(64), email: 'x@y.com', plano_pagamento_id: 1, numero_parcelas: 1,
    pessoas: [{ id: 1, nome: 'T', cpf: '123.456.789-01', is_titular: true }], itens: [{ produto_id: 2, preco: 1, pessoa_refs: [1] }] } };
  assert.equal(validateCompleteCorrection(base).itens.length, 1);
  assert.equal(validateCompleteCorrection(base).pessoas[0].cpf, '12345678901');
  assert.throws(() => validateCompleteCorrection({ editor: { ...base.editor, pessoas: [{ id: 1, nome: 'T', cpf: '', is_titular: true }] } }), /11 dígitos/);
  const withDependentWithoutCpf = { editor: { ...base.editor,
    pessoas: [...base.editor.pessoas, { id: 2, nome: 'Dependente', cpf: '', is_titular: false }] } };
  assert.equal(validateCompleteCorrection(withDependentWithoutCpf).pessoas[1].cpf, '');
  assert.throws(() => validateCompleteCorrection({ editor: { ...base.editor,
    pessoas: [...base.editor.pessoas, { id: 2, nome: 'Dependente', cpf: '123', is_titular: false }] } }), /ficar em branco/);
  assert.throws(() => validateCompleteCorrection({ editor: { ...base.editor, itens: [] } }), /ao menos um item/);
  assert.throws(() => validateCompleteCorrection({ editor: { ...base.editor, numero_parcelas: 0 } }), /parcelas/);
  assert.throws(() => validateCompleteCorrection({ editor: { ...base.editor, itens: [{ produto_id: 2, preco: -1, pessoa_refs: [1] }] } }), /Preço inválido/);
  assert.throws(() => validateCompleteCorrection({ editor: { ...base.editor, itens: [{ produto_id: 2, preco: 1, pessoa_refs: [] }] } }), /ao menos uma pessoa/);
});

test('preço de item existente é imutável mesmo em payload adulterado', () => {
  const before = { itens: [{ id: 7, produto_id: 20, preco: 29.9, pessoa_ids: [1] }] };
  const valid = { itens: [{ id: 7, produto_id: 20, preco: 29.9, pessoa_refs: [1] }] };
  assert.equal(enforceAuthoritativeItemPrices(valid, before).itens[0].preco, 29.9);
  assert.throws(
    () => enforceAuthoritativeItemPrices({
      itens: [{ id: 7, produto_id: 20, preco: 0.01, pessoa_refs: [1] }],
    }, before),
    /definido pelo ERP/
  );
});

test('mudança de vínculo em produto existente exige catálogo fresco e binding inequívoco', () => {
  const before = { itens: [{ id: 7, produto_id: 20, preco: 29.9, pessoa_ids: [1] }] };
  const changed = {
    pessoas: [
      { id: 1, nome: 'Titular', is_titular: true },
      { id: 2, nome: 'Dependente', is_titular: false },
    ],
    itens: [{ id: 7, produto_id: 20, preco: 29.9, pessoa_refs: [2] }],
  };

  assert.equal(itemNeedsCatalogValidation(changed.itens[0], before.itens[0]), true);
  assert.throws(
    () => enforceAuthoritativeItemPrices(changed, before),
    /produtos e vínculos atuais podem ser mantidos/
  );
});

test('produto de beneficiário inalterado não pode ser reassociado ao titular', () => {
  const before = { itens: [{ id: 7, produto_id: 20, preco: 29.9, pessoa_ids: [2] }] };
  const binding = { contractId: 830, title: 'BOM PET' };
  const catalog = [{
    produto_id: 20,
    preco_informado: 29.9,
    contrato_id: 830,
    titulo_contrato: 'BOM PET',
    descricao: 'NOME DO PET',
  }];
  const reassigned = {
    pessoas: [
      { id: 1, nome: 'Titular', is_titular: true },
      { id: 2, nome: 'Pet', is_titular: false },
    ],
    itens: [{ id: 7, produto_id: 20, preco: 29.9, pessoa_refs: [1] }],
  };

  assert.throws(
    () => enforceAuthoritativeItemPrices(reassigned, before, catalog, binding),
    /não podem ser vinculados ao titular/
  );
});

test('namespace rejeita client_key que tenta substituir uma pessoa existente removida', () => {
  const before = {
    pessoas: [
      { id: 1, nome: 'Titular', is_titular: true },
      { id: 2, nome: 'Dependente antigo', is_titular: false },
    ],
  };
  const editor = {
    pessoas: [
      { id: 1, nome: 'Titular', is_titular: true },
      { client_key: '2', nome: 'Dependente novo', is_titular: false },
    ],
    itens: [{ id: 7, produto_id: 20, preco: 29.9, pessoa_refs: ['2'] }],
  };

  assert.throws(
    () => validateCorrectionIdentityNamespace(editor, before),
    /não pode reutilizar um vínculo existente/
  );
});

test('namespace rejeita IDs repetidos de item e referências ambíguas de pessoa', () => {
  const before = { pessoas: [{ id: 1, nome: 'Titular', is_titular: true }] };
  const duplicatedItem = {
    pessoas: [{ id: 1, nome: 'Titular', is_titular: true }],
    itens: [
      { id: 7, produto_id: 20, preco: 29.9, pessoa_refs: [1] },
      { id: 7, produto_id: 20, preco: 29.9, pessoa_refs: [1] },
    ],
  };
  assert.throws(
    () => validateCorrectionIdentityNamespace(duplicatedItem, before),
    /mesmo item não pode ser enviado/
  );

  assert.throws(
    () => validateCorrectionIdentityNamespace({
      pessoas: [
        { id: 1, nome: 'Titular', is_titular: true },
        { client_key: 'novo', nome: 'A', is_titular: false },
        { client_key: 'novo', nome: 'B', is_titular: false },
      ],
      itens: [{ produto_id: 20, preco: 29.9, pessoa_refs: ['novo'] }],
    }, before),
    /identificadores duplicados/
  );
});

test('produto novo ou trocado aceita somente o preço fresco do catálogo ERP', () => {
  const before = { itens: [{ id: 7, produto_id: 20, preco: 29.9, pessoa_ids: [1] }] };
  const binding = { contractId: 830, title: 'BOM PASTOR' };
  const catalog = [{ produto_id: 30, preco_informado: 49.9, contrato_id: 830, titulo_contrato: 'BOM PASTOR' }];
  const valid = {
    pessoas: [{ id: 1, nome: 'Titular', is_titular: true }],
    itens: [{ id: 7, produto_id: 30, preco: 49.9, pessoa_refs: [1] }],
  };
  assert.equal(enforceAuthoritativeItemPrices(valid, before, catalog, binding).itens[0].preco, 49.9);
  assert.throws(
    () => enforceAuthoritativeItemPrices({
      pessoas: valid.pessoas,
      itens: [{ id: 7, produto_id: 30, preco: 1, pessoa_refs: [1] }],
    }, before, catalog, binding),
    /preço.*mudou/i
  );
});

test('troca de produto respeita contrato e título exatos do orçamento', () => {
  const before = { itens: [{ id: 7, produto_id: 20, preco: 29.9, pessoa_ids: [1] }] };
  const binding = { contractId: 830, title: 'BOM PASTOR' };
  const editor = {
    pessoas: [{ id: 1, nome: 'Titular', is_titular: true }],
    itens: [{ id: 7, produto_id: 30, preco: 49.9, pessoa_refs: [1] }],
  };
  const wrongTitle = [{ produto_id: 30, preco_informado: 49.9, contrato_id: 831, titulo_contrato: 'OUTRO TÍTULO' }];
  assert.throws(
    () => enforceAuthoritativeItemPrices(editor, before, wrongTitle, binding),
    /não pertencem ao título/
  );
  assert.deepEqual(eligibleCorrectionCatalogRows([
    ...wrongTitle,
    { produto_id: 30, preco_informado: 49.9, contrato_id: 830, titulo_contrato: 'BOM PASTOR' },
  ], binding).map((row) => row.contrato_id), [830]);
});

test('vínculo legado só é inferido quando contrato e título são inequívocos', () => {
  const before = { itens: [{ id: 7, produto_id: 20, preco: 29.9 }] };
  const base = { produto_id: 20, preco_informado: 29.9 };
  assert.deepEqual(resolveCorrectionCatalogBinding(before, [
    { ...base, contrato_id: 830, titulo_contrato: 'BOM PASTOR' },
  ]), { contractId: 830, title: 'BOM PASTOR' });
  assert.equal(resolveCorrectionCatalogBinding(before, [
    { ...base, contrato_id: 830, titulo_contrato: 'BOM PASTOR' },
    { ...base, contrato_id: 831, titulo_contrato: 'OUTRO TÍTULO' },
  ]), null);
});

test('vínculo legado usa a lista completa do título mesmo quando o preço atual do ERP mudou', async () => {
  const localCalls = [];
  const context = {
    editor: {
      erp_pedido_id: 77,
      itens: [{ id: 7, produto_id: 20, preco: 29.9 }],
    },
  };
  const rows = [
    { produto_id: 20, preco_informado: 39.9, contrato_id: 830, titulo_contrato: 'BOM PASTOR' },
    { produto_id: 30, preco_informado: 49.9, contrato_id: 830, titulo_contrato: 'BOM PASTOR' },
    { produto_id: 40, preco_informado: 59.9, contrato_id: 831, titulo_contrato: 'OUTRO TÍTULO' },
  ];

  const result = await addCorrectionCatalogContext(context, async (sql, params) => {
    localCalls.push({ sql, params });
    return { rows: sql.includes('SELECT catalog_contract_id') ? [{ catalog_contract_id: null, catalog_title: null }] : [] };
  }, { loadProductCatalog: async () => rows });

  assert.deepEqual(result.catalog_binding, { contractId: 830, title: 'BOM PASTOR' });
  assert.equal(result.catalog_status, 'available');
  assert.deepEqual(result.catalog_products.map((row) => row.produto_id), [20, 30]);
  const backfill = localCalls.find(({ sql }) => sql.includes('UPDATE bomflow_orcamentos'));
  assert.deepEqual(backfill.params, [77, 830, 'BOM PASTOR']);
});

test('catálogo da correção oferece os mesmos títulos comerciais da criação', () => {
  const choices = correctionCatalogChoices([
    { produto_id: 20, contrato_id: 830, titulo_contrato: 'BOM PASTOR', preco_informado: 10 },
    { produto_id: 30, contrato_id: 830, titulo_contrato: 'BOM PASTOR', preco_informado: 20 },
    { produto_id: 40, contrato_id: 831, titulo_contrato: 'BOM PASTOR - BOM PET', preco_informado: 30 },
    { produto_id: 50, contrato_id: 999, titulo_contrato: 'TÍTULO FORA DA CRIAÇÃO', preco_informado: 40 },
  ]);
  assert.deepEqual(choices.map(({ contract_id, title, products }) => ({
    contract_id, title, products: products.map((row) => row.produto_id),
  })), [
    { contract_id: 830, title: 'BOM PASTOR', products: [20, 30] },
    { contract_id: 831, title: 'BOM PASTOR - BOM PET', products: [40] },
  ]);
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
  let catalogLoads = 0;
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
    loadProductCatalog: async () => {
      catalogLoads += 1;
      return [];
    },
  });

  assert.equal(result.alreadyApplied, true);
  assert.equal(result.changed, false);
  assert.equal(catalogLoads, 0);
  assert.match(localCalls[0].sql, /FROM presales_ajuste_correcoes/);
  assert.doesNotMatch(localCalls[0].sql, /postsales_correcoes/);
});

test('fluxo completo carrega catálogo uma vez e bloqueia reassociação de produto de beneficiário', async () => {
  const db = { query: async (sql) => {
    if (sql.includes('FROM pedidos p')) return { rows: [{ id: 77, situacao: 'M', email_contato: 'a@b.com', observacoes: null, endereco_id: null, prazo_pagamento_id: 2, numero_parcelas: 1 }] };
    if (sql.includes('FROM pedidos_pessoas WHERE')) return { rows: [
      { id: 10, pessoa_id: 99, nome_pessoa: 'Titular', cpf: '12345678901', data_nascimento: '2000-01-02', sexo: 'F', telefone: '51999999999', parentesco: 'T' },
      { id: 11, pessoa_id: null, nome_pessoa: 'Pet', cpf: null, data_nascimento: '2020-01-02', sexo: 'F', telefone: null, parentesco: 'PET' },
    ] };
    if (sql.includes('FROM itens_pedidos i')) return { rows: [{ id: 4, produto_id: 8, descricao: 'NOME DO PET', preco: '10', quantidade: '1', valor_total_item: '10', pessoa_ids: [11] }] };
    return { rows: [] };
  }};
  const current = await getPostsalesCorrectionContext(db, 77, null);
  let catalogLoads = 0;

  await assert.rejects(
    applyPostsalesCompleteCorrection({
      localQuery: async (sql) => sql.includes('catalog_contract_id')
        ? { rows: [{ catalog_contract_id: 830, catalog_title: 'BOM PET' }] }
        : { rows: [] },
      erpDb: db,
      verification: { id: 'verificacao-1', erp_pedido_id: 77, motivo_devolucao: null },
      actor: { id: 'auditor-1', name: 'Auditor' },
      input: { editor: {
        ...current.editor,
        itens: current.editor.itens.map((item) => ({ ...item, pessoa_refs: [10] })),
      } },
      loadProductCatalog: async () => {
        catalogLoads += 1;
        return [{
          produto_id: 8,
          preco_informado: 10,
          contrato_id: 830,
          titulo_contrato: 'BOM PET',
          descricao: 'NOME DO PET',
        }];
      },
    }),
    /não podem ser vinculados ao titular/
  );
  assert.equal(catalogLoads, 1);
});

test('correção de endereço cria cópia inativa e não altera endereço global existente', () => {
  const source = fs.readFileSync(new URL('./postsalesCorrectionService.js', import.meta.url), 'utf8');
  const addressStart = source.indexOf('const insertedAddress');
  const addressEnd = source.indexOf('await client.query(`INSERT INTO modos_pagamentos', addressStart);
  const addressWrite = source.slice(addressStart, addressEnd);
  assert.ok(addressStart >= 0 && addressEnd > addressStart);
  assert.match(addressWrite, /VALUES\(nextval\('pk_sequence'\),\$1,[\s\S]*577,[\s\S]*'N','N'\)/);
  assert.doesNotMatch(addressWrite, /UPDATE enderecos/);
});

test('item novo separa os parâmetros de sequência inteira e índice decimal do ERP', () => {
  const source = fs.readFileSync(new URL('./postsalesCorrectionService.js', import.meta.url), 'utf8');
  const insertStart = source.indexOf('INSERT INTO itens_pedidos');
  const insertEnd = source.indexOf('RETURNING id', insertStart);
  const itemInsert = source.slice(insertStart, insertEnd);
  assert.ok(insertStart >= 0 && insertEnd > insertStart);
  assert.match(itemInsert, /'P',\$9,\$5,\$10,\$6/);
  assert.doesNotMatch(itemInsert, /'P',\$2,\$5/);
});

test('fluxo completo troca produto e dependente e recria o vínculo na mesma transação', async () => {
  const state = {
    pedido: {
      id: 77,
      situacao: 'M',
      email_contato: 'a@b.com',
      observacoes: null,
      endereco_id: null,
      prazo_pagamento_id: 2,
      numero_parcelas: 1,
    },
    pessoas: [
      { id: 10, pessoa_id: 99, nome_pessoa: 'Titular', cpf: '12345678901', data_nascimento: '2000-01-02', sexo: 'F', telefone: '51999999999', parentesco: 'T' },
      { id: 11, pessoa_id: null, nome_pessoa: 'Dependente antigo', cpf: null, data_nascimento: null, sexo: null, telefone: null, parentesco: 'FILHO' },
    ],
    itens: [
      { id: 4, produto_id: 8, descricao: 'Produto incorreto', preco: 10, quantidade: 1, valor_total_item: 10, pessoa_ids: [11] },
    ],
  };
  const sqlCalls = [];
  const read = async (sql) => {
    if (sql.includes('FROM pedidos p')) return { rows: [{ ...state.pedido }] };
    if (sql.includes('FROM pedidos_pessoas WHERE')) return { rows: state.pessoas.map((person) => ({ ...person })) };
    if (sql.includes('FROM itens_pedidos i')) return { rows: state.itens.map((item) => ({ ...item, pessoa_ids: [...item.pessoa_ids] })) };
    return { rows: [] };
  };
  const client = {
    async query(sql, params = []) {
      sqlCalls.push({ sql, params });
      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return { rows: [] };
      if (sql.includes('SELECT id, endereco_id FROM pedidos')) return { rows: [{ id: 77, endereco_id: null }] };
      if (sql.includes('SELECT id, pessoa_id FROM pedidos_pessoas')) {
        return { rows: state.pessoas.map(({ id, pessoa_id }) => ({ id, pessoa_id })) };
      }
      if (sql.includes('SELECT id FROM itens_pedidos')) return { rows: state.itens.map(({ id }) => ({ id })) };
      if (sql.includes('UPDATE pedidos_pessoas SET')) {
        const person = state.pessoas.find((entry) => entry.id === Number(params[0]));
        Object.assign(person, {
          nome_pessoa: params[1], cpf: params[2], data_nascimento: params[3],
          sexo: params[4], telefone: params[5], parentesco: params[6],
        });
        return { rows: [] };
      }
      if (sql.includes('INSERT INTO pedidos_pessoas\n')) {
        state.pessoas.push({
          id: 12, pessoa_id: null, nome_pessoa: params[1], cpf: params[2],
          data_nascimento: params[3], sexo: params[4], telefone: params[5],
          parentesco: params[6],
        });
        return { rows: [{ id: 12 }] };
      }
      if (sql.includes('DELETE FROM pedidos_pessoas_produtos')) {
        state.itens.forEach((item) => { item.pessoa_ids = []; });
        return { rows: [] };
      }
      if (sql.includes('DELETE FROM pedidos_pessoas WHERE')) {
        state.pessoas = state.pessoas.filter((person) => !params[1].map(Number).includes(person.id));
        return { rows: [] };
      }
      if (sql.includes('SELECT descricao, tipo_produto_id FROM produtos')) {
        return Number(params[0]) === 9
          ? { rows: [{ descricao: 'Produto correto', tipo_produto_id: 3 }] }
          : { rows: [] };
      }
      if (sql.includes('INSERT INTO itens_pedidos')) {
        state.itens.push({
          id: 5, produto_id: Number(params[2]), descricao: params[6],
          preco: Number(params[4]), quantidade: Number(params[3]),
          valor_total_item: Number(params[5]), pessoa_ids: [],
        });
        return { rows: [{ id: 5 }] };
      }
      if (sql.includes('INSERT INTO pedidos_pessoas_produtos')) {
        state.itens.find((item) => item.id === Number(params[1])).pessoa_ids.push(Number(params[3]));
        return { rows: [] };
      }
      if (sql.includes('DELETE FROM itens_pedidos')) {
        state.itens = state.itens.filter((item) => !params[1].map(Number).includes(item.id));
        return { rows: [] };
      }
      if (sql.includes('SELECT id FROM planos_pagamentos')) return { rows: [{ id: 2 }] };
      if (sql.includes('INSERT INTO modos_pagamentos')) return { rows: [] };
      if (sql.includes('UPDATE pedidos SET')) {
        Object.assign(state.pedido, {
          email_contato: params[1],
          observacoes: params[2],
          prazo_pagamento_id: Number(params[3]),
          numero_parcelas: Number(params[4]),
        });
        return { rows: [] };
      }
      return read(sql);
    },
    release() {},
  };
  const db = { query: read, connect: async () => client };
  const current = await getPostsalesCorrectionContext(db, 77, null);
  const localQuery = async (sql) => {
    if (sql.includes('catalog_contract_id')) {
      return { rows: [{ catalog_contract_id: 830, catalog_title: 'BOM PASTOR' }] };
    }
    if (sql.includes('INSERT INTO postsales_correcoes')) return { rows: [{ id: 123 }] };
    return { rows: [] };
  };

  const result = await applyPostsalesCompleteCorrection({
    localQuery,
    erpDb: db,
    verification: { id: 'verificacao-1', erp_pedido_id: 77, motivo_devolucao: null },
    actor: { id: 'auditor-1', name: 'Auditor' },
    input: {
      editor: {
        ...current.editor,
        pessoas: [
          { ...current.editor.pessoas[0] },
          { client_key: 'novo-dependente', nome: 'Dependente novo', cpf: '', data_nascimento: null, sexo: null, telefone: '', parentesco: 'FILHO', is_titular: false },
        ],
        itens: [
          { client_key: 'novo-item', produto_id: 9, descricao: 'Produto correto', preco: 20, pessoa_refs: ['novo-dependente'] },
        ],
        catalog_contract_id: 830,
        catalog_title: 'BOM PASTOR',
      },
    },
    loadProductCatalog: async () => [{
      produto_id: 9,
      preco_informado: 20,
      contrato_id: 830,
      titulo_contrato: 'BOM PASTOR',
      descricao: 'Produto correto',
    }],
  });

  assert.equal(result.changed, true);
  assert.deepEqual(state.pessoas.map((person) => person.id), [10, 12]);
  assert.deepEqual(state.itens, [{
    id: 5,
    produto_id: 9,
    descricao: 'Produto correto',
    preco: 20,
    quantidade: 1,
    valor_total_item: 20,
    pessoa_ids: [12],
  }]);
  assert.ok(sqlCalls.some(({ sql }) => sql.includes('DELETE FROM pedidos_pessoas WHERE')));
  assert.ok(sqlCalls.some(({ sql }) => sql.includes('DELETE FROM itens_pedidos WHERE')));
  assert.ok(sqlCalls.some(({ sql }) => sql.includes('INSERT INTO pedidos_pessoas_produtos')));
});