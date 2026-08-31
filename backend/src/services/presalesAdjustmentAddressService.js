const REQUIRED_FIELDS = ['cep', 'logradouro', 'numero', 'bairro', 'cidade'];
const ADDRESS_FIELDS = ['cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade'];
const ADDRESS_ADJUSTMENT_PATTERN = /\b(endere[cç]o|cep|cidade|munic[ií]pio|uf|logradouro|bairro|complemento|resid[eê]ncia|rua|avenida|n[úu]mero\s+(?:do\s+endere[cç]o|da\s+(?:casa|resid[eê]ncia)))\b/i;
const ADJUSTMENT_TYPES = new Set(['endereco', 'cadastro']);

export function buildPresalesAdjustmentLink(ajusteId, pedidoId) {
  return `/PreSalesAjustes?ajuste_id=${encodeURIComponent(ajusteId)}&pedido_id=${encodeURIComponent(pedidoId)}`;
}

export function assertSellerOwnsPresalesAdjustment(ajuste, userId) {
  if (!ajuste) {
    const error = new Error('Ajuste não encontrado.');
    error.statusCode = 404;
    throw error;
  }
  if (String(ajuste.vendedor_id) !== String(userId)) {
    const error = new Error('Você só pode atualizar os ajustes das suas próprias vendas.');
    error.statusCode = 403;
    throw error;
  }
  return ajuste;
}

export function assertPendingPresalesAdjustment(ajuste) {
  if (ajuste?.status !== 'pendente') {
    const error = new Error('Este ajuste já mudou de estado. Atualize a tela antes de editar.');
    error.statusCode = 409;
    throw error;
  }
  return ajuste;
}

export function normalizePresalesAdjustmentType(value, description = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (ADJUSTMENT_TYPES.has(normalized)) return normalized;
  return ADDRESS_ADJUSTMENT_PATTERN.test(String(description || ''))
    ? 'endereco'
    : 'cadastro';
}

export function requirePresalesAdjustmentType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!ADJUSTMENT_TYPES.has(normalized)) {
    const error = new Error('Escolha onde o vendedor deve fazer a correção.');
    error.statusCode = 422;
    error.fields = ['tipo_ajuste'];
    throw error;
  }
  return normalized;
}

export function assertAddressAdjustmentType(ajuste) {
  const type = normalizePresalesAdjustmentType(ajuste?.tipo_ajuste, ajuste?.texto);
  if (type !== 'endereco') {
    const error = new Error('Este ajuste deve ser tratado no cadastro completo da venda.');
    error.statusCode = 422;
    throw error;
  }
  return ajuste;
}

export function presalesAddressesEqual(left, right) {
  if (!left || !right) return false;
  return ADDRESS_FIELDS.every((field) => {
    if (field === 'cep') {
      return String(left[field] || '').replace(/\D/g, '')
        === String(right[field] || '').replace(/\D/g, '');
    }
    return String(left[field] || '').trim().toLocaleLowerCase('pt-BR')
      === String(right[field] || '').trim().toLocaleLowerCase('pt-BR');
  });
}

function invalidAddress(message, fields = []) {
  const error = new Error(message);
  error.code = 'invalid_presales_address';
  error.statusCode = 422;
  error.fields = fields;
  return error;
}

export function normalizePresalesAddress(input = {}) {
  const cepDigits = String(input.cep || '').replace(/\D/g, '');
  const address = {
    cep: cepDigits.length === 8
      ? `${cepDigits.slice(0, 5)}-${cepDigits.slice(5)}`
      : cepDigits,
    logradouro: String(input.logradouro || '').trim(),
    numero: String(input.numero || '').trim(),
    complemento: String(input.complemento || '').trim() || null,
    bairro: String(input.bairro || '').trim(),
    cidade: String(input.cidade || '').trim(),
  };

  const missing = REQUIRED_FIELDS.filter((field) => !address[field]);
  if (missing.length) {
    throw invalidAddress('Preencha CEP, logradouro, número, bairro e cidade.', missing);
  }
  if (cepDigits.length !== 8) {
    throw invalidAddress('Informe um CEP válido com 8 dígitos.', ['cep']);
  }
  return address;
}

async function readPedidoHeader(db, pedidoId, lock = false) {
  const result = await db.query(
    `SELECT p.id AS pedido_id,
            p.endereco_id,
            (
              SELECT pp.pessoa_id
                FROM pedidos_pessoas pp
               WHERE pp.pedido_id = p.id
                 AND pp.pessoa_id IS NOT NULL
               LIMIT 1
            ) AS pessoa_id
       FROM pedidos p
      WHERE p.id = $1
      ${lock ? 'FOR UPDATE' : ''}`,
    [pedidoId]
  );
  const row = result.rows[0];
  if (!row) {
    const error = new Error('Orçamento não encontrado no ERP.');
    error.code = 'erp_budget_not_found';
    error.statusCode = 404;
    throw error;
  }
  return {
    pedidoId: Number(row.pedido_id),
    enderecoId: row.endereco_id ? Number(row.endereco_id) : null,
    pessoaId: row.pessoa_id ? Number(row.pessoa_id) : null,
  };
}

async function readAddressRow(db, header, lock = false) {
  if (header.enderecoId) {
    const linked = await db.query(
      `SELECT e.id, e.pessoa_id, e.codigo_postal, e.endereco, e.numero,
              e.complemento, e.bairro, e.cidade_id, c.cidade
         FROM enderecos e
         LEFT JOIN cidades c ON c.id = e.cidade_id
        WHERE e.id = $1
          AND e.tipo_endereco_id = 577
          AND e.ativo = 'S'
        ${lock ? 'FOR UPDATE OF e' : ''}`,
      [header.enderecoId]
    );
    if (linked.rows[0]) return linked.rows[0];
  }

  if (!header.pessoaId) return null;
  const fallback = await db.query(
    `SELECT e.id, e.pessoa_id, e.codigo_postal, e.endereco, e.numero,
            e.complemento, e.bairro, e.cidade_id, c.cidade
       FROM enderecos e
       LEFT JOIN cidades c ON c.id = e.cidade_id
      WHERE e.pessoa_id = $1
        AND e.tipo_endereco_id = 577
        AND e.ativo = 'S'
      ORDER BY e.id DESC
      LIMIT 1
      ${lock ? 'FOR UPDATE OF e' : ''}`,
    [header.pessoaId]
  );
  return fallback.rows[0] || null;
}

function shapeAddress(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    cep: row.codigo_postal || '',
    logradouro: row.endereco || '',
    numero: row.numero || '',
    complemento: row.complemento || '',
    bairro: row.bairro || '',
    cidade: row.cidade || '',
  };
}

export async function getPresalesBudgetAddress(db, pedidoId) {
  const header = await readPedidoHeader(db, pedidoId);
  const row = await readAddressRow(db, header);
  return {
    pedidoId: header.pedidoId,
    pessoaId: header.pessoaId,
    enderecoId: row?.id ? Number(row.id) : null,
    address: shapeAddress(row),
  };
}

export async function listPresalesCities(db, search, limit = 20) {
  const normalizedSearch = String(search || '').trim().replace(/\s+/g, ' ');
  if (normalizedSearch.length < 2) return [];

  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const result = await db.query(
    `SELECT id, cidade
       FROM cidades
      WHERE cidade ILIKE $1
      ORDER BY
        CASE WHEN lower(cidade) LIKE lower($2) THEN 0 ELSE 1 END,
        cidade
      LIMIT $3`,
    [`%${normalizedSearch}%`, `${normalizedSearch}%`, safeLimit]
  );
  return result.rows.map((row) => ({
    id: Number(row.id),
    cidade: String(row.cidade || '').trim(),
  }));
}

export async function withPresalesAdjustmentLock(localPool, adjustmentId, work) {
  const client = await localPool.connect();
  const lockParams = [String(adjustmentId)];
  try {
    await client.query(
      `SELECT pg_advisory_lock(hashtext('presales-adjustment'), hashtext($1::text))`,
      lockParams
    );
    return await work();
  } finally {
    await client.query(
      `SELECT pg_advisory_unlock(hashtext('presales-adjustment'), hashtext($1::text))`,
      lockParams
    ).catch(() => {});
    client.release();
  }
}

export async function applyPresalesAddressCorrection({
  localQuery,
  erpDb,
  ajuste,
  vendedorId,
  input,
  readAddress = getPresalesBudgetAddress,
  writeAddress = updatePresalesBudgetAddress,
}) {
  const desiredAddress = normalizePresalesAddress(input);
  const current = await readAddress(erpDb, Number(ajuste.erp_pedido_id));
  const pending = await localQuery(
    `SELECT id, dados_novos
       FROM presales_ajuste_correcoes
      WHERE ajuste_id = $1 AND tipo = 'endereco' AND status = 'pendente'
      ORDER BY created_at DESC`,
    [ajuste.id]
  );
  const equivalentPending = pending.rows.find((row) =>
    presalesAddressesEqual(row.dados_novos, desiredAddress));

  if (equivalentPending && presalesAddressesEqual(current.address, desiredAddress)) {
    await localQuery(
      `UPDATE presales_ajuste_correcoes
          SET status = 'aplicada', applied_at = COALESCE(applied_at, NOW()),
              reconciled_at = NOW()
        WHERE id = $1 AND status = 'pendente'`,
      [equivalentPending.id]
    );
    return {
      address: current.address,
      auditPending: false,
      reconciled: true,
      alreadyApplied: true,
    };
  }
  if (presalesAddressesEqual(current.address, desiredAddress)) {
    return {
      address: current.address,
      auditPending: false,
      reconciled: false,
      alreadyApplied: true,
    };
  }

  let correctionId = equivalentPending?.id || null;
  if (!correctionId) {
    const correction = await localQuery(
      `INSERT INTO presales_ajuste_correcoes
         (ajuste_id, erp_pedido_id, vendedor_id, tipo, status,
          dados_anteriores, dados_novos)
       VALUES ($1, $2, $3, 'endereco', 'pendente', $4::jsonb, $5::jsonb)
       RETURNING id`,
      [
        ajuste.id,
        ajuste.erp_pedido_id,
        vendedorId,
        JSON.stringify(current.address),
        JSON.stringify(desiredAddress),
      ]
    );
    correctionId = correction.rows[0].id;
  }

  let result;
  try {
    result = await writeAddress(erpDb, Number(ajuste.erp_pedido_id), desiredAddress);
  } catch (error) {
    await localQuery(
      `UPDATE presales_ajuste_correcoes
          SET status = 'falhou', error_message = $2
        WHERE id = $1 AND status = 'pendente'`,
      [correctionId, String(error.message || 'Falha não identificada').slice(0, 500)]
    ).catch(() => {});
    throw error;
  }

  try {
    await localQuery(
      `UPDATE presales_ajuste_correcoes
          SET status = 'aplicada',
              dados_anteriores = $2::jsonb,
              dados_novos = $3::jsonb,
              applied_at = NOW()
        WHERE id = $1`,
      [
        correctionId,
        JSON.stringify(result.before),
        JSON.stringify(result.after),
      ]
    );
    return {
      address: result.after,
      auditPending: false,
      reconciled: false,
      alreadyApplied: false,
    };
  } catch (auditError) {
    return {
      address: result.after,
      auditPending: true,
      reconciled: false,
      alreadyApplied: false,
      auditError,
    };
  }
}

async function findPresalesCity(db, value) {
  const result = await db.query(
    `SELECT id, cidade
       FROM cidades
      WHERE regexp_replace(lower(btrim(cidade)), '\\s+', ' ', 'g')
          = regexp_replace(lower(btrim($1)), '\\s+', ' ', 'g')
      LIMIT 1`,
    [value]
  );
  return result.rows[0] || null;
}

export async function updatePresalesBudgetAddress(db, pedidoId, input) {
  const address = normalizePresalesAddress(input);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const header = await readPedidoHeader(client, pedidoId, true);
    if (!header.pessoaId) {
      const error = new Error('O orçamento não possui um titular vinculado no ERP.');
      error.code = 'erp_budget_person_not_found';
      error.statusCode = 422;
      throw error;
    }
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtext('presales-address'), hashtext($1::text))`,
      [header.pessoaId]
    );

    const city = await findPresalesCity(client, address.cidade);
    if (!city) {
      throw invalidAddress('Selecione uma cidade válida da lista do ERP.', ['cidade']);
    }

    const currentRow = await readAddressRow(client, header, true);
    const before = shapeAddress(currentRow);
    // Copy-on-write: um endereço pode estar ligado a outros pedidos da mesma pessoa.
    // Nunca alteramos a linha antiga; criamos uma nova e vinculamos somente este pedido.
    const inserted = await client.query(
      `INSERT INTO enderecos
         (id, pessoa_id, sequencia, tipo_endereco_id, endereco, numero,
          complemento, codigo_postal, bairro, cidade_id, ativo,
          desconsiderar_inscricao_estadual)
       VALUES (
         nextval('pk_sequence'),
         $1,
         COALESCE((
           SELECT MAX(sequencia) + 1
             FROM enderecos
            WHERE pessoa_id = $1 AND tipo_endereco_id = 577
         ), 1),
         577, $2, $3, $4, $5, $6, $7, 'S', 'N'
       )
       RETURNING id`,
      [
        header.pessoaId,
        address.logradouro,
        address.numero,
        address.complemento,
        address.cep,
        address.bairro,
        Number(city.id),
      ]
    );
    const enderecoId = Number(inserted.rows[0].id);

    await client.query(
      `UPDATE pedidos SET endereco_id = $2 WHERE id = $1`,
      [header.pedidoId, enderecoId]
    );

    await client.query('COMMIT');
    return {
      pedidoId: header.pedidoId,
      pessoaId: header.pessoaId,
      enderecoId,
      before,
      after: { ...address, id: enderecoId, cidade: city.cidade || address.cidade },
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}