import { isValidPhone, normalizePhone } from '../utils/leadImportValidation.js';
import { createHash } from 'node:crypto';

const EDITABLE_REASON_TYPES = {
  telefone_incorreto: 'telefone',
  email_incorreto: 'email',
};

function snapshotRevision(editor) {
  const copy = { ...editor };
  delete copy.revision;
  return createHash('sha256').update(JSON.stringify(copy)).digest('hex');
}

export function postsalesCorrectionType(reason) {
  return EDITABLE_REASON_TYPES[String(reason || '').trim()] || null;
}

function invalidCorrection(message, fields = []) {
  const error = new Error(message);
  error.statusCode = 422;
  error.fields = fields;
  return error;
}

export function normalizePostsalesCorrection(type, input = {}) {
  const rawValue = input.valor ?? input.value ?? '';
  if (type === 'telefone') {
    const value = normalizePhone(rawValue);
    if (!isValidPhone(value)) {
      throw invalidCorrection('Informe um telefone válido com DDD.', ['valor']);
    }
    return value;
  }
  if (type === 'email') {
    const value = String(rawValue || '').trim().toLowerCase();
    if (value.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      throw invalidCorrection('Informe um e-mail válido.', ['valor']);
    }
    return value;
  }
  throw invalidCorrection('Este motivo ainda não possui edição direta no orçamento.');
}

function comparableValue(type, value) {
  if (type === 'telefone') return normalizePhone(value);
  return String(value || '').trim().toLowerCase();
}

async function readPedido(db, pedidoId, lock = false) {
  const pedido = await db.query(
    `SELECT id, email_contato
       FROM pedidos
      WHERE id = $1
      ${lock ? 'FOR UPDATE' : ''}`,
    [pedidoId]
  );
  if (!pedido.rows[0]) {
    const error = new Error('Orçamento não encontrado no ERP.');
    error.statusCode = 404;
    throw error;
  }

  const pessoa = await db.query(
    `SELECT id, pessoa_id, telefone
       FROM pedidos_pessoas
      WHERE pedido_id = $1
      ORDER BY (pessoa_id IS NULL), id
      LIMIT 1
      ${lock ? 'FOR UPDATE' : ''}`,
    [pedidoId]
  );

  return { pedido: pedido.rows[0], pessoa: pessoa.rows[0] || null };
}

export async function getPostsalesCorrectionContext(db, pedidoId, reason) {
  const pedido = await db.query(
    `SELECT p.id, p.situacao, p.email_contato, p.observacoes, p.endereco_id,
            p.prazo_pagamento_id, p.numero_parcelas
       FROM pedidos p WHERE p.id = $1`, [pedidoId]
  );
  if (!pedido.rows[0]) {
    const error = new Error('Orçamento não encontrado no ERP.');
    error.statusCode = 404;
    throw error;
  }
  const p = pedido.rows[0];
  const [people, items, address] = await Promise.all([
    db.query(`SELECT id, nome_pessoa, cpf, data_nascimento, sexo, telefone, parentesco, pessoa_id
                FROM pedidos_pessoas WHERE pedido_id = $1 ORDER BY id`, [pedidoId]),
    db.query(`SELECT i.id, i.produto_id, COALESCE(NULLIF(TRIM(pr.descricao), ''), i.descricao) descricao,
                     i.preco, i.quantidade, i.valor_total_item,
                     COALESCE(array_agg(l.titular_id ORDER BY l.sequencia) FILTER (WHERE l.titular_id IS NOT NULL), '{}') pessoa_ids
                FROM itens_pedidos i
                LEFT JOIN produtos pr ON pr.id = i.produto_id
                LEFT JOIN pedidos_pessoas_produtos l ON l.item_pedido_id = i.id AND l.pedido_id = i.pedido_id
               WHERE i.pedido_id = $1 GROUP BY i.id, pr.descricao
               ORDER BY i.sequencia, i.id`, [pedidoId]),
    p.endereco_id ? db.query(`SELECT e.codigo_postal cep, e.endereco logradouro, e.numero, e.complemento,
                                      e.bairro, c.cidade
                                 FROM enderecos e LEFT JOIN cidades c ON c.id = e.cidade_id WHERE e.id = $1`, [p.endereco_id]) : Promise.resolve({ rows: [] }),
  ]);
  const titular = people.rows.find((row) => row.pessoa_id != null) || people.rows[0];
  const type = postsalesCorrectionType(reason);
  const persistedValue = type === 'email' ? p.email_contato : titular?.telefone;
  const editor = {
      erp_pedido_id: Number(p.id), situacao: p.situacao, email: p.email_contato || '',
      observacoes: p.observacoes || '', endereco: address.rows[0] || null,
      plano_pagamento_id: p.prazo_pagamento_id == null ? null : Number(p.prazo_pagamento_id),
      numero_parcelas: p.numero_parcelas == null ? null : Number(p.numero_parcelas),
      pessoas: people.rows.map((r) => ({ id: Number(r.id), nome: r.nome_pessoa || '', cpf: r.cpf || '',
        data_nascimento: r.data_nascimento ? String(r.data_nascimento).slice(0, 10) : null,
        sexo: r.sexo || null, telefone: r.telefone || '', parentesco: r.parentesco || null,
        is_titular: r.id === titular?.id })),
      itens: items.rows.map((r) => ({ id: Number(r.id), produto_id: Number(r.produto_id), descricao: r.descricao || '',
        preco: Number(r.preco), quantidade: Number(r.quantidade), valor_total: Number(r.valor_total_item),
        pessoa_ids: r.pessoa_ids.map(Number) })),
    };
  editor.revision = snapshotRevision(editor);
  return {
    // All return reasons use the same complete editor.  tipo/valor remain for
    // older clients which still render the former contact-only modal.
    editable: true, tipo: type, valor: persistedValue || '', valor_persistido: persistedValue || '',
    pedido_pessoa_id: titular ? Number(titular.id) : null,
    editor,
  };
}

const digits = (value) => String(value ?? '').replace(/\D/g, '');
const money = (value, field) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || Math.round(n * 100) !== n * 100) throw invalidCorrection('Preço inválido.', [field]);
  return Math.round(n * 100) / 100;
};

export function validateCompleteCorrection(input = {}) {
  const editor = input.editor;
  if (!editor || !Array.isArray(editor.pessoas) || !Array.isArray(editor.itens)) {
    throw invalidCorrection('Informe o editor completo.', ['editor']);
  }
  const email = String(editor.email || '').trim().toLowerCase();
  const expectedRevision = String(editor.revision || input.expected_revision || '').trim();
  if (!/^[a-f0-9]{64}$/.test(expectedRevision)) throw invalidCorrection('A versão do orçamento é obrigatória. Atualize a tela e tente novamente.', ['expected_revision']);
  if (email && (email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw invalidCorrection('Informe um e-mail válido.', ['editor.email']);
  if (!editor.itens.length) throw invalidCorrection('Informe ao menos um item.', ['editor.itens']);
  if (editor.numero_parcelas != null && editor.numero_parcelas !== '' &&
    (!Number.isInteger(Number(editor.numero_parcelas)) || Number(editor.numero_parcelas) <= 0)) {
    throw invalidCorrection('Número de parcelas deve ser um inteiro positivo.', ['editor.numero_parcelas']);
  }
  const keys = new Set(); let titular = 0;
  const pessoas = editor.pessoas.map((person, index) => {
    const cpf = digits(person.cpf);
    if (!String(person.nome || '').trim()) throw invalidCorrection('Nome da pessoa é obrigatório.', [`editor.pessoas.${index}.nome`]);
    if (cpf && cpf.length !== 11) throw invalidCorrection('CPF deve conter 11 dígitos.', [`editor.pessoas.${index}.cpf`]);
    if (cpf && keys.has(cpf)) throw invalidCorrection('CPF duplicado no orçamento.', ['editor.pessoas']);
    if (cpf) keys.add(cpf);
    if (person.telefone && !isValidPhone(normalizePhone(person.telefone))) throw invalidCorrection('Informe um telefone válido com DDD.', [`editor.pessoas.${index}.telefone`]);
    if (person.data_nascimento && !/^\d{4}-\d{2}-\d{2}$/.test(person.data_nascimento)) throw invalidCorrection('Data de nascimento inválida.', [`editor.pessoas.${index}.data_nascimento`]);
    if (person.sexo && !['M', 'F'].includes(String(person.sexo).toUpperCase())) throw invalidCorrection('Sexo deve ser M ou F.', [`editor.pessoas.${index}.sexo`]);
    if (person.is_titular) titular++;
    return { ...person, nome: String(person.nome).trim(), cpf, telefone: person.telefone ? normalizePhone(person.telefone) : null,
      sexo: person.sexo ? String(person.sexo).toUpperCase() : null, parentesco: String(person.parentesco || '').trim() || null,
      data_nascimento: person.data_nascimento || null };
  });
  if (titular !== 1) throw invalidCorrection('O orçamento deve manter exatamente um titular.', ['editor.pessoas']);
  const itens = editor.itens.map((item, index) => {
    if (!Number.isInteger(Number(item.produto_id)) || Number(item.produto_id) <= 0) throw invalidCorrection('Produto inválido.', [`editor.itens.${index}.produto_id`]);
    if (!Array.isArray(item.pessoa_refs) || !item.pessoa_refs.length) throw invalidCorrection('Cada item precisa de ao menos uma pessoa.', [`editor.itens.${index}.pessoa_refs`]);
    return { ...item, produto_id: Number(item.produto_id), preco: money(item.preco, `editor.itens.${index}.preco`) };
  });
  let endereco = editor.endereco || null;
  if (endereco) {
    endereco = {
      cep: digits(endereco.cep), logradouro: String(endereco.logradouro || '').trim(),
      numero: String(endereco.numero || '').trim(), complemento: String(endereco.complemento || '').trim() || null,
      bairro: String(endereco.bairro || '').trim(), cidade: String(endereco.cidade || '').trim().replace(/\s+/g, ' '),
    };
    if (endereco.cep.length !== 8 || !endereco.logradouro || !endereco.numero || !endereco.bairro || !endereco.cidade) {
      throw invalidCorrection('Endereço deve informar CEP, logradouro, número, bairro e cidade.', ['editor.endereco']);
    }
  }
  return { ...editor, revision: expectedRevision, endereco, email, observacoes: String(editor.observacoes || '').trim() || null,
    numero_parcelas: editor.numero_parcelas == null || editor.numero_parcelas === '' ? null : Number(editor.numero_parcelas), pessoas, itens };
}

export async function updatePostsalesBudgetContact(db, pedidoId, reason, input) {
  const type = postsalesCorrectionType(reason);
  const desired = normalizePostsalesCorrection(type, input);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const current = await readPedido(client, pedidoId, true);
    if (type === 'telefone' && !current.pessoa) {
      throw invalidCorrection('O orçamento não possui um titular que possa receber o telefone.');
    }

    const before = type === 'telefone'
      ? current.pessoa.telefone || ''
      : current.pedido.email_contato || '';
    if (comparableValue(type, before) === comparableValue(type, desired)) {
      await client.query('COMMIT');
      return { tipo: type, before, after: desired, changed: false };
    }

    if (type === 'telefone') {
      await client.query(
        `UPDATE pedidos_pessoas SET telefone = $2 WHERE id = $1`,
        [current.pessoa.id, desired]
      );
    } else {
      await client.query(
        `UPDATE pedidos SET email_contato = $2 WHERE id = $1`,
        [pedidoId, desired]
      );
    }

    await client.query('COMMIT');
    return { tipo: type, before, after: desired, changed: true };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function withPostsalesCorrectionLock(localPool, verificationId, work) {
  const client = await localPool.connect();
  const params = [String(verificationId)];
  try {
    await client.query(
      `SELECT pg_advisory_lock(hashtext('postsales-correction'), hashtext($1::text))`,
      params
    );
    return await work();
  } finally {
    await client.query(
      `SELECT pg_advisory_unlock(hashtext('postsales-correction'), hashtext($1::text))`,
      params
    ).catch(() => {});
    client.release();
  }
}

export async function applyPostsalesContactCorrection({
  localQuery,
  erpDb,
  verification,
  actor,
  input,
  readContext = getPostsalesCorrectionContext,
  writeContact = updatePostsalesBudgetContact,
}) {
  const type = postsalesCorrectionType(verification.motivo_devolucao);
  const desired = normalizePostsalesCorrection(type, input);
  const current = await readContext(
    erpDb,
    Number(verification.erp_pedido_id),
    verification.motivo_devolucao
  );
  const persistedValue = Object.hasOwn(current, 'valor_persistido')
    ? current.valor_persistido
    : current.valor;

  const pending = await localQuery(
    `SELECT id, dados_novos
       FROM postsales_correcoes
      WHERE verificacao_id = $1
        AND tipo = $2
        AND status = 'pendente'
      ORDER BY created_at DESC`,
    [verification.id, type]
  );
  const equivalentPending = pending.rows.find((row) =>
    comparableValue(type, row.dados_novos?.valor) === comparableValue(type, desired));

  if (comparableValue(type, persistedValue) === comparableValue(type, desired)) {
    if (equivalentPending) {
      await localQuery(
        `UPDATE postsales_correcoes
            SET status = 'aplicada', applied_at = COALESCE(applied_at, NOW()),
                reconciled_at = NOW()
          WHERE id = $1 AND status = 'pendente'`,
        [equivalentPending.id]
      );
    }
    return {
      tipo: type,
      valor: desired,
      alreadyApplied: true,
      changed: false,
    };
  }

  let correctionId = equivalentPending?.id || null;
  if (!correctionId) {
    const inserted = await localQuery(
      `INSERT INTO postsales_correcoes
         (verificacao_id, erp_pedido_id, tipo, status, actor_id, actor_nome,
          dados_anteriores, dados_novos)
       VALUES ($1, $2, $3, 'pendente', $4, $5, $6::jsonb, $7::jsonb)
       RETURNING id`,
      [
        verification.id,
        verification.erp_pedido_id,
        type,
        actor?.id || null,
        actor?.name || null,
        JSON.stringify({ valor: persistedValue || null }),
        JSON.stringify({ valor: desired }),
      ]
    );
    correctionId = inserted.rows[0].id;
  }

  let result;
  try {
    result = await writeContact(
      erpDb,
      Number(verification.erp_pedido_id),
      verification.motivo_devolucao,
      { valor: desired }
    );
  } catch (error) {
    await localQuery(
      `UPDATE postsales_correcoes
          SET status = 'falhou', error_message = $2
        WHERE id = $1 AND status = 'pendente'`,
      [correctionId, String(error.message || 'Falha não identificada').slice(0, 500)]
    ).catch(() => {});
    throw error;
  }

  await localQuery(
    `UPDATE postsales_correcoes
        SET status = 'aplicada', dados_anteriores = $2::jsonb,
            dados_novos = $3::jsonb, applied_at = NOW()
      WHERE id = $1`,
    [
      correctionId,
      JSON.stringify({ valor: result.before || null }),
      JSON.stringify({ valor: result.after }),
    ]
  );

  return {
    tipo: type,
    valor: result.after,
    alreadyApplied: false,
    changed: result.changed,
  };
}

// Full order editor used by Pós-vendas.  This deliberately only changes the
// order-scoped ERP rows: pedidos_pessoas.pessoa_id (the global customer) is
// never written and links are always constrained by pedido_id.
export async function applyPostsalesCompleteCorrection({
  localQuery,
  erpDb,
  verification,
  actor,
  input,
  auditKind = 'postsales',
}) {
  const isPresalesAudit = auditKind === 'presales';
  const editor = validateCompleteCorrection(input);
  const before = await getPostsalesCorrectionContext(erpDb, Number(verification.erp_pedido_id), verification.motivo_devolucao);
  const canonical = (value) => JSON.stringify({
    email: String(value.email || '').trim().toLowerCase(),
    observacoes: String(value.observacoes || '').trim() || null,
    endereco: value.endereco ? {
      cep: String(value.endereco.cep || '').replace(/\D/g, '') || null,
      logradouro: String(value.endereco.logradouro || '').trim().replace(/\s+/g, ' ') || null,
      numero: String(value.endereco.numero || '').trim() || null,
      complemento: String(value.endereco.complemento || '').trim() || null,
      bairro: String(value.endereco.bairro || '').trim() || null,
      cidade: String(value.endereco.cidade || '').trim().replace(/\s+/g, ' ').toLowerCase() || null,
    } : null,
    plano_pagamento_id: value.plano_pagamento_id == null ? null : Number(value.plano_pagamento_id),
    numero_parcelas: value.numero_parcelas == null ? null : Number(value.numero_parcelas),
    pessoas: (value.pessoas || []).map((p) => ({ id: p.id == null ? null : Number(p.id), nome: p.nome, cpf: digits(p.cpf),
      data_nascimento: p.data_nascimento || null, sexo: p.sexo || null, telefone: p.telefone ? normalizePhone(p.telefone) : null,
      parentesco: p.parentesco || null, is_titular: !!p.is_titular })).sort((a, b) => (a.id || 0) - (b.id || 0)),
    itens: (value.itens || []).map((i) => ({ id: i.id == null ? null : Number(i.id), produto_id: Number(i.produto_id),
      preco: Number(i.preco), pessoa_refs: [...(i.pessoa_refs || i.pessoa_ids || [])].map(String).sort() }))
      .sort((a, b) => (a.id || 0) - (b.id || 0)),
  });
  const normalized = canonical(editor);
  const same = canonical(before.editor) === normalized;
  if (same) {
    const pendings = await localQuery(
      isPresalesAudit
        ? `SELECT id, dados_novos FROM presales_ajuste_correcoes
            WHERE ajuste_id=$1 AND tipo='orcamento_completo' AND status='pendente' ORDER BY created_at DESC`
        : `SELECT id, dados_novos FROM postsales_correcoes
            WHERE verificacao_id=$1 AND tipo='orcamento_completo' AND status='pendente' ORDER BY created_at DESC`,
      [verification.id]
    ).catch(() => ({ rows: [] }));
    const pending = pendings.rows.find((row) => {
      try { return canonical(row.dados_novos || {}) === normalized; } catch { return false; }
    });
    if (pending) await localQuery(
      isPresalesAudit
        ? `UPDATE presales_ajuste_correcoes
              SET status='aplicada', applied_at=COALESCE(applied_at,NOW()),
                  reconciled_at=NOW(), error_message=NULL
            WHERE id=$1 AND status='pendente'`
        : `UPDATE postsales_correcoes
              SET status='aplicada', applied_at=COALESCE(applied_at,NOW()),
                  reconciled_at=NOW(), error_message=NULL
            WHERE id=$1 AND status='pendente'`,
      [pending.id]
    );
    if (pending && !isPresalesAudit) await localQuery(
      `INSERT INTO postsales_eventos (verificacao_id, erp_pedido_id, tipo, detalhe, actor_id, actor_nome)
       SELECT $1,$2,'correcao_orcamento',$3,$4,$5
       WHERE NOT EXISTS (SELECT 1 FROM postsales_eventos WHERE verificacao_id=$1 AND detalhe=$3)`,
      [verification.id, verification.erp_pedido_id, `Orçamento completo corrigido no ERP. Correção #${pending.id}`, actor?.id || null, actor?.name || null]
    );
    return { tipo: 'orcamento_completo', changed: false, alreadyApplied: true };
  }

  const pending = await localQuery(
    isPresalesAudit
      ? `INSERT INTO presales_ajuste_correcoes
           (ajuste_id, erp_pedido_id, vendedor_id, tipo, status, dados_anteriores, dados_novos)
         VALUES ($1, $2, $3, 'orcamento_completo', 'pendente', $4::jsonb, $5::jsonb)
         RETURNING id`
      : `INSERT INTO postsales_correcoes
           (verificacao_id, erp_pedido_id, tipo, status, actor_id, actor_nome, dados_anteriores, dados_novos)
         VALUES ($1, $2, 'orcamento_completo', 'pendente', $3, $4, $5::jsonb, $6::jsonb)
         RETURNING id`,
    isPresalesAudit
      ? [
          verification.id,
          verification.erp_pedido_id,
          actor?.id,
          JSON.stringify(before.editor),
          JSON.stringify(editor),
        ]
      : [
          verification.id,
          verification.erp_pedido_id,
          actor?.id || null,
          actor?.name || null,
          JSON.stringify(before.editor),
          JSON.stringify(editor),
        ]
  );
  const correctionId = pending.rows[0].id;
  let erpCommitted = false;
  try {
    const client = await erpDb.connect();
    try {
      await client.query('BEGIN');
      const locked = await client.query(`SELECT id, endereco_id FROM pedidos WHERE id = $1 FOR UPDATE`, [verification.erp_pedido_id]);
      if (!locked.rows[0]) { const e = new Error('Orçamento não encontrado no ERP.'); e.statusCode = 404; throw e; }
      const current = await getPostsalesCorrectionContext(client, Number(verification.erp_pedido_id), verification.motivo_devolucao);
      if (!['M', 'I'].includes(current.editor.situacao) ||
        current.editor.situacao !== editor.situacao ||
        current.editor.revision !== editor.revision) {
        const e = new Error('O orçamento foi alterado ou mudou de situação. Atualize a tela antes de salvar.');
        e.statusCode = 409;
        throw e;
      }
      const existingPeople = await client.query(`SELECT id, pessoa_id FROM pedidos_pessoas WHERE pedido_id = $1 FOR UPDATE`, [verification.erp_pedido_id]);
      const existingItems = await client.query(`SELECT id FROM itens_pedidos WHERE pedido_id = $1 FOR UPDATE`, [verification.erp_pedido_id]);
      const peopleById = new Map(existingPeople.rows.map((r) => [String(r.id), r]));
      const canonicalTitular = existingPeople.rows.find((r) => r.pessoa_id != null) || existingPeople.rows[0];
      if (!canonicalTitular) throw invalidCorrection('O orçamento não possui titular.', ['editor.pessoas']);
      const submittedCanonical = editor.pessoas.find((person) => String(person.id) === String(canonicalTitular.id));
      if (!submittedCanonical || !submittedCanonical.is_titular ||
        editor.pessoas.some((person) => person.is_titular && String(person.id) !== String(canonicalTitular.id))) {
        throw invalidCorrection('O titular original do orçamento deve ser preservado.', ['editor.pessoas']);
      }
      const itemsById = new Set(existingItems.rows.map((r) => String(r.id)));
      const submittedIds = new Set();
      let titularExistingId = null;
      const refMap = new Map();
      for (const person of editor.pessoas) {
        let id;
        if (person.id != null) {
          const old = peopleById.get(String(person.id));
          if (!old) throw invalidCorrection('Pessoa não pertence a este orçamento.', ['editor.pessoas.id']);
          id = Number(old.id); submittedIds.add(String(id));
          // Protect the global person identity; only order-local display fields change.
          if (String(old.id) === String(canonicalTitular.id) && !person.is_titular) throw invalidCorrection('O titular não pode ser removido.', ['editor.pessoas']);
          await client.query(`UPDATE pedidos_pessoas SET nome_pessoa=$2, cpf=$3, data_nascimento=$4,
              sexo=$5, telefone=$6, parentesco=$7 WHERE id=$1 AND pedido_id=$8`,
            [id, person.nome, person.cpf || null, person.data_nascimento || null, person.sexo, person.telefone, person.parentesco || null, verification.erp_pedido_id]);
        } else {
          if (person.is_titular) throw invalidCorrection('O titular existente não pode ser recriado.', ['editor.pessoas']);
          const r = await client.query(`INSERT INTO pedidos_pessoas
              (id,pedido_id,nome_pessoa,cpf,data_nascimento,sexo,telefone,parentesco,pessoa_id)
              VALUES (nextval('pk_sequence'),$1,$2,$3,$4,$5,$6,$7,NULL) RETURNING id`,
            [verification.erp_pedido_id, person.nome, person.cpf || null, person.data_nascimento || null, person.sexo, person.telefone, person.parentesco || null]);
          id = Number(r.rows[0].id);
        }
        if (person.is_titular) titularExistingId = id;
        refMap.set(String(person.id ?? person.client_key), id);
      }
      if (titularExistingId !== Number(canonicalTitular.id)) throw invalidCorrection('Titular inválido.', ['editor.pessoas']);
      const removedPeople = existingPeople.rows.filter((r) => String(r.id) !== String(canonicalTitular.id) && !submittedIds.has(String(r.id))).map((r) => r.id);
      // Remove all old links first; this prevents stale links and makes item
      // quantities entirely derived from the new link graph.
      await client.query(`DELETE FROM pedidos_pessoas_produtos WHERE pedido_id = $1`, [verification.erp_pedido_id]);
      if (removedPeople.length) await client.query(`DELETE FROM pedidos_pessoas WHERE pedido_id=$1 AND id = ANY($2::bigint[])`, [verification.erp_pedido_id, removedPeople]);

      const submittedItemIds = new Set(); let total = 0;
      for (let index = 0; index < editor.itens.length; index++) {
        const item = editor.itens[index];
        const product = await client.query(`SELECT descricao, tipo_produto_id FROM produtos WHERE id=$1`, [item.produto_id]);
        if (!product.rows[0] || product.rows[0].tipo_produto_id == null) throw invalidCorrection('Produto inexistente ou sem tipo de produto.', [`editor.itens.${index}.produto_id`]);
        const personIds = [...new Set(item.pessoa_refs.map((ref) => refMap.get(String(ref))))];
        if (personIds.length !== item.pessoa_refs.length || personIds.some((id) => !id)) throw invalidCorrection('Pessoa do item não pertence ao orçamento.', [`editor.itens.${index}.pessoa_refs`]);
        const qty = personIds.length; const value = item.preco * qty; total += value;
        let itemId;
        if (item.id != null) {
          if (!itemsById.has(String(item.id))) throw invalidCorrection('Item não pertence a este orçamento.', ['editor.itens.id']);
          itemId = Number(item.id); submittedItemIds.add(String(itemId));
          await client.query(`UPDATE itens_pedidos SET sequencia=$2, produto_id=$3, descricao=$4, tipo_produto_id=$5,
             preco=$6::double precision, preco_lista=$6::double precision, valor_unitario_item=$6::numeric,
             valor_total_item=$7::numeric, quantidade=$8::numeric, quantidade_pendente=$8::numeric,
             quantidade_temporaria=$8::numeric, quantidade_temporaria_faturar=$8::numeric,
             quantidade_carregar=$8::numeric, quantidade_faturar=$8::numeric WHERE id=$1 AND pedido_id=$9`,
            [itemId, index + 1, item.produto_id, product.rows[0].descricao, product.rows[0].tipo_produto_id, item.preco, value, qty, verification.erp_pedido_id]);
        } else {
          const inserted = await client.query(`INSERT INTO itens_pedidos
             (id,pedido_id,sequencia,sub_item,produto_id,quantidade,preco,situacao,indice,preco_lista,valor_unitario_item,valor_total_item,quantidade_pendente,quantidade_temporaria,quantidade_temporaria_faturar,quantidade_carregar,quantidade_cancelada,quantidade_faturar,quantidade_faturada,qtde_cancelada_faturamento,comissao_item,quantidade_acima_pedido,atualizar_consumo,descricao,tipo_produto_id)
             VALUES(nextval('pk_sequence'),$1,$2,1,$3,$4,$5,'P',$2,$5,$5,$6,$4,$4,$4,$4,0,$4,0,0,0,0,'S',$7,$8) RETURNING id`,
            [verification.erp_pedido_id, index + 1, item.produto_id, qty, item.preco, value, product.rows[0].descricao, product.rows[0].tipo_produto_id]);
          itemId = Number(inserted.rows[0].id);
        }
        for (let seq = 0; seq < personIds.length; seq++) await client.query(
          `INSERT INTO pedidos_pessoas_produtos (id,pedido_id,item_pedido_id,sequencia,titular_id,aprovado)
           VALUES(nextval('pk_sequence'),$1,$2,$3,$4,'N')`, [verification.erp_pedido_id, itemId, seq + 1, personIds[seq]]);
      }
      const removedItems = existingItems.rows.filter((r) => !submittedItemIds.has(String(r.id))).map((r) => r.id);
      if (removedItems.length) await client.query(`DELETE FROM itens_pedidos WHERE pedido_id=$1 AND id=ANY($2::bigint[])`, [verification.erp_pedido_id, removedItems]);
      const plan = await client.query(`SELECT id FROM planos_pagamentos WHERE id=$1 AND ativo='S' AND valido='S'`, [editor.plano_pagamento_id]);
      if (!plan.rows[0]) throw invalidCorrection('Plano de pagamento inválido.', ['editor.plano_pagamento_id']);
      let enderecoId = locked.rows[0].endereco_id;
      // An address belongs to an ERP order through pedidos.endereco_id.  Never
      // update that row in place: older orders can share it with a customer.
      if (editor.endereco) {
        const a = editor.endereco;
        if (!String(a.logradouro || '').trim() || !String(a.cidade || '').trim()) {
          throw invalidCorrection('Endereço deve informar logradouro e cidade.', ['editor.endereco']);
        }
        const city = await client.query(`SELECT id FROM cidades WHERE lower(cidade)=lower($1) LIMIT 1`, [String(a.cidade).trim()]);
        if (!city.rows[0]) throw invalidCorrection('Cidade não encontrada no ERP.', ['editor.endereco.cidade']);
        const currentAddress = before.editor.endereco;
        const addressSame = canonical({ endereco: currentAddress }) === canonical({ endereco: a });
        if (!addressSame) {
          const titularPessoaId = canonicalTitular.pessoa_id;
          if (titularPessoaId == null) throw invalidCorrection('O titular não possui Pessoa global para vincular o endereço.', ['editor.endereco']);
          await client.query(`SELECT pg_advisory_xact_lock(hashtext('postsales-address'), hashtext($1::text))`, [titularPessoaId]);
          const insertedAddress = await client.query(`INSERT INTO enderecos
            (id,pessoa_id,sequencia,tipo_endereco_id,codigo_postal,endereco,numero,complemento,bairro,cidade_id,ativo,desconsiderar_inscricao_estadual)
            VALUES(nextval('pk_sequence'),$1,COALESCE((SELECT MAX(sequencia)+1 FROM enderecos WHERE pessoa_id=$1 AND tipo_endereco_id=577),1),577,$2,$3,$4,$5,$6,$7,'S','N') RETURNING id`,
            [titularPessoaId, a.cep || null, a.logradouro, a.numero || null, a.complemento || null, a.bairro || null, city.rows[0].id]);
          enderecoId = insertedAddress.rows[0].id;
        }
      }
      await client.query(`INSERT INTO modos_pagamentos (id,pedido_id,plano_pagamento_id,quantidade_parcelas,recorrente)
        VALUES($1,$1,$2,$3,'S') ON CONFLICT (id) DO UPDATE SET plano_pagamento_id=EXCLUDED.plano_pagamento_id, quantidade_parcelas=EXCLUDED.quantidade_parcelas`,
      [verification.erp_pedido_id, editor.plano_pagamento_id, editor.numero_parcelas ?? null]);
      await client.query(`UPDATE pedidos SET email_contato=$2, observacoes=$3, prazo_pagamento_id=$4, modo_pagamento_id=$1,
        numero_parcelas=$5, valor_total=$6::numeric, valor_mercadorias=$6::numeric, valor_total_pedido=$6::numeric,
        endereco_id=$7, data_alteracao=NOW() WHERE id=$1`,
      [verification.erp_pedido_id, editor.email || null, editor.observacoes || null, editor.plano_pagamento_id, editor.numero_parcelas ?? null, total, enderecoId]);
      await client.query('COMMIT');
      erpCommitted = true;
    } catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; } finally { client.release(); }
  } catch (error) {
    await localQuery(
      isPresalesAudit
        ? (erpCommitted
            ? `UPDATE presales_ajuste_correcoes SET status='pendente', error_message=$2 WHERE id=$1`
            : `UPDATE presales_ajuste_correcoes SET status='falhou', error_message=$2 WHERE id=$1`)
        : (erpCommitted
            ? `UPDATE postsales_correcoes SET status='pendente', error_message=$2 WHERE id=$1`
            : `UPDATE postsales_correcoes SET status='falhou', error_message=$2 WHERE id=$1`),
      [correctionId, `${erpCommitted ? 'ERP aplicado; auditoria local pendente: ' : ''}${String(error.message).slice(0, 430)}`]
    ).catch(() => {});
    throw error;
  }
  try {
    const after = await getPostsalesCorrectionContext(
      erpDb,
      Number(verification.erp_pedido_id),
      verification.motivo_devolucao
    );
    await localQuery(
      isPresalesAudit
        ? `UPDATE presales_ajuste_correcoes
              SET status='aplicada', dados_novos=$2::jsonb, applied_at=NOW(),
                  error_message=NULL
            WHERE id=$1`
        : `UPDATE postsales_correcoes
              SET status='aplicada', dados_novos=$2::jsonb, applied_at=NOW(),
                  error_message=NULL
            WHERE id=$1`,
      [correctionId, JSON.stringify(after.editor)]
    );
    if (!isPresalesAudit) await localQuery(
      `INSERT INTO postsales_eventos
         (verificacao_id, erp_pedido_id, tipo, detalhe, actor_id, actor_nome)
       SELECT $1,$2,'correcao_orcamento',$3,$4,$5
       WHERE NOT EXISTS (
         SELECT 1
           FROM postsales_eventos
          WHERE verificacao_id=$1 AND detalhe=$3
       )`,
      [
        verification.id,
        verification.erp_pedido_id,
        `Orçamento completo corrigido no ERP. Correção #${correctionId}`,
        actor?.id || null,
        actor?.name || null,
      ]
    );
    return {
      tipo: 'orcamento_completo',
      changed: true,
      alreadyApplied: false,
      editor: after.editor,
    };
  } catch (error) {
    // O ERP já confirmou a transação. Se a trilha local falhar, o intento
    // permanece recuperável e será reconciliado de forma idempotente no retry.
    await localQuery(
      isPresalesAudit
        ? `UPDATE presales_ajuste_correcoes
              SET status='pendente', error_message=$2
            WHERE id=$1`
        : `UPDATE postsales_correcoes
              SET status='pendente', error_message=$2
            WHERE id=$1`,
      [
        correctionId,
        `ERP aplicado; auditoria local pendente: ${String(error.message).slice(0, 430)}`,
      ]
    ).catch(() => {});
    throw error;
  }
}