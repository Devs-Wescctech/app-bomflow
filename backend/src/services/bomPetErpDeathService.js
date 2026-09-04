import { getErpPool } from './erpDbService.js';

export const ERP_PET_DEATH_CHARACTERISTIC_ID = 55435402;
const ERP_INTEGRATION_LOGIN = 'acesso.api';

function bomPetErpError(message, code, statusCode = 422) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

export function normalizePetIdentity(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizePessoaRow(row) {
  const characteristicCount = Number(row.death_characteristic_count || 0);
  if (characteristicCount > 1) {
    throw bomPetErpError(
      'A Pessoa do pet possui mais de um registro da característica Data de Falecimento no ERP.',
      'erp_pet_death_characteristic_ambiguous',
      409
    );
  }
  const dataFalecimento = toDateOnly(row.data_falecimento);
  if (row.data_falecimento != null && String(row.data_falecimento).trim() && !dataFalecimento) {
    throw bomPetErpError(
      'A característica Data de Falecimento possui um valor inválido no ERP.',
      'erp_pet_death_value_invalid',
      409
    );
  }
  return {
    pessoaId: Number(row.id),
    pessoaCodigo: String(row.pessoa || '').trim() || null,
    nomeCompleto: String(row.nome_completo || '').trim(),
    dataFalecimento,
  };
}

export function toDateOnly(value) {
  if (!value) return null;
  let candidate = null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    candidate = value.toISOString().slice(0, 10);
  } else {
    const match = String(value).match(/^(\d{4}-\d{2}-\d{2})(?:$|T|\s)/);
    candidate = match?.[1] || null;
  }
  if (!candidate) return null;
  const [year, month, day] = candidate.split('-').map(Number);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  return calendarDate.getUTCFullYear() === year &&
    calendarDate.getUTCMonth() === month - 1 &&
    calendarDate.getUTCDate() === day
    ? candidate
    : null;
}

export function selectPetPessoa(rows, { petDescricao, petNome, requireExactDescription = false }) {
  const candidates = [];
  const seen = new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    const pessoaId = Number(row?.id);
    if (!Number.isSafeInteger(pessoaId) || pessoaId <= 0 || seen.has(pessoaId)) continue;
    seen.add(pessoaId);
    candidates.push(row);
  }

  const description = normalizePetIdentity(petDescricao);
  const exactMatches = description
    ? candidates.filter((row) => normalizePetIdentity(row.nome_completo) === description)
    : [];
  if (exactMatches.length === 1) {
    return { ...normalizePessoaRow(exactMatches[0]), matchStrategy: 'exact_description' };
  }
  if (exactMatches.length > 1) {
    throw bomPetErpError(
      'Mais de uma Pessoa do ERP corresponde à descrição completa do pet neste contrato.',
      'erp_pet_identity_ambiguous'
    );
  }
  if (requireExactDescription) {
    throw bomPetErpError(
      'A descrição completa do pet não corresponde de forma única a uma Pessoa do contrato.',
      'erp_pet_identity_weak_match'
    );
  }

  const name = normalizePetIdentity(petNome);
  const nameMatches = name
    ? candidates.filter((row) => normalizePetIdentity(row.nome_completo).split(' - ')[0].trim() === name)
    : [];
  if (nameMatches.length === 1) {
    return { ...normalizePessoaRow(nameMatches[0]), matchStrategy: 'name_only' };
  }
  if (nameMatches.length > 1) {
    throw bomPetErpError(
      'Mais de uma Pessoa do ERP possui o mesmo nome de pet neste contrato.',
      'erp_pet_identity_ambiguous'
    );
  }

  throw bomPetErpError(
    'Não foi possível identificar de forma única a Pessoa do pet no contrato do ERP.',
    'erp_pet_identity_not_found'
  );
}

export async function resolveBomPetPessoaWithDb(db, {
  contratoId,
  petDescricao,
  petNome,
  requireExactDescription = false,
}) {
  const normalizedContratoId = Number(contratoId);
  if (!Number.isSafeInteger(normalizedContratoId) || normalizedContratoId <= 0) {
    throw bomPetErpError('Contrato ERP do pet inválido.', 'erp_pet_contract_invalid', 400);
  }

  const result = await db.query(
    `SELECT DISTINCT p.id, p.pessoa, p.nome_completo,
            death.data_falecimento, death.death_characteristic_count
       FROM pessoas_contratos pc
       JOIN pessoas p ON p.id = pc.pessoa_id
       LEFT JOIN LATERAL (
         SELECT MIN(cp.valor) AS data_falecimento,
                COUNT(*)::integer AS death_characteristic_count
           FROM caracteristicas_pessoas cp
          WHERE cp.pessoa_id = p.id
            AND cp.caracteristica_id = $2
       ) death ON TRUE
      WHERE pc.contrato_id = $1
        AND COALESCE(pc.ativo, 'S') = 'S'
      ORDER BY p.id`,
    [normalizedContratoId, ERP_PET_DEATH_CHARACTERISTIC_ID]
  );

  return selectPetPessoa(result.rows, { petDescricao, petNome, requireExactDescription });
}

export function resolveBomPetPessoa(input) {
  return resolveBomPetPessoaWithDb(getErpPool(), input);
}

export function assertBomPetPessoaConsistency(storedPessoaId, resolvedPessoaId) {
  if (storedPessoaId != null && Number(storedPessoaId) !== Number(resolvedPessoaId)) {
    throw bomPetErpError(
      'A Pessoa do pet mudou desde a criação do atendimento.',
      'erp_pet_identity_changed'
    );
  }
}

export async function markBomPetPessoaFalecidaWithDb(db, {
  pessoaId,
  contratoId,
  petDescricao,
  petNome,
  dataFalecimento,
}) {
  let normalizedPessoaId = Number(pessoaId);
  const normalizedContratoId = Number(contratoId);
  const resolveInsideTransaction = Number.isSafeInteger(normalizedContratoId) && normalizedContratoId > 0;
  if (!resolveInsideTransaction && (!Number.isSafeInteger(normalizedPessoaId) || normalizedPessoaId <= 0)) {
    throw bomPetErpError('Pessoa ERP do pet inválida.', 'erp_pet_person_invalid', 400);
  }

  const normalizedDate = toDateOnly(dataFalecimento);
  if (!normalizedDate) {
    throw bomPetErpError('Data de falecimento inválida.', 'erp_pet_death_date_invalid', 400);
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL lock_timeout = '5s'`);

    const resolveTechnicalAuthorId = async () => {
      const authorResult = await client.query(
        `SELECT id
           FROM usuarios
          WHERE LOWER(login) = LOWER($1)
            AND COALESCE(ativo, 'S') = 'S'
          ORDER BY id`,
        [ERP_INTEGRATION_LOGIN]
      );
      if (authorResult.rows.length !== 1) {
        throw bomPetErpError(
          'Não foi possível identificar de forma única o usuário técnico ativo da integração no ERP.',
          'erp_pet_death_author_unavailable',
          503
        );
      }
      return Number(authorResult.rows[0].id);
    };

    if (resolveInsideTransaction) {
      const identityResult = await client.query(
        `SELECT p.id, p.pessoa, p.nome_completo,
                death.data_falecimento, death.death_characteristic_count
           FROM pessoas_contratos pc
           JOIN pessoas p ON p.id = pc.pessoa_id
           LEFT JOIN LATERAL (
             SELECT MIN(cp.valor) AS data_falecimento,
                    COUNT(*)::integer AS death_characteristic_count
               FROM caracteristicas_pessoas cp
              WHERE cp.pessoa_id = p.id
                AND cp.caracteristica_id = $2
           ) death ON TRUE
          WHERE pc.contrato_id = $1
            AND COALESCE(pc.ativo, 'S') = 'S'
          ORDER BY p.id
          FOR UPDATE OF pc, p`,
        [normalizedContratoId, ERP_PET_DEATH_CHARACTERISTIC_ID]
      );
      const identity = selectPetPessoa(identityResult.rows, {
        petDescricao,
        petNome,
        requireExactDescription: true,
      });
      assertBomPetPessoaConsistency(pessoaId, identity.pessoaId);
      normalizedPessoaId = identity.pessoaId;
    }

    const beforeResult = await client.query(
      `SELECT id, pessoa, nome_completo
         FROM pessoas
        WHERE id = $1
        FOR UPDATE`,
      [normalizedPessoaId]
    );
    const before = beforeResult.rows[0];
    if (!before) {
      throw bomPetErpError(
        'A Pessoa do pet não foi encontrada no ERP.',
        'erp_pet_person_not_found'
      );
    }

    const characteristicProbeResult = await client.query(
      `SELECT id, valor, data_inclusao, usuario_inclusao_id,
              data_alteracao, usuario_alteracao_id
         FROM caracteristicas_pessoas
        WHERE pessoa_id = $1
          AND caracteristica_id = $2
        ORDER BY id`,
      [normalizedPessoaId, ERP_PET_DEATH_CHARACTERISTIC_ID]
    );
    if (characteristicProbeResult.rows.length > 1) {
      throw bomPetErpError(
        'A Pessoa do pet possui mais de um registro da característica Data de Falecimento no ERP.',
        'erp_pet_death_characteristic_ambiguous',
        409
      );
    }
    const characteristicWasAbsent = characteristicProbeResult.rows.length === 0;
    let authorId = null;
    if (characteristicWasAbsent) {
      authorId = await resolveTechnicalAuthorId();
      // Não há constraint única para (pessoa_id, caracteristica_id). Serializa o
      // raro caminho de inclusão antes de obter qualquer row lock nessa tabela.
      await client.query('LOCK TABLE caracteristicas_pessoas IN SHARE ROW EXCLUSIVE MODE');
    }

    const characteristicBeforeResult = await client.query(
      `SELECT id, valor, data_inclusao, usuario_inclusao_id,
              data_alteracao, usuario_alteracao_id
         FROM caracteristicas_pessoas
        WHERE pessoa_id = $1
          AND caracteristica_id = $2
        ORDER BY id
        FOR UPDATE`,
      [normalizedPessoaId, ERP_PET_DEATH_CHARACTERISTIC_ID]
    );
    if (characteristicBeforeResult.rows.length > 1) {
      throw bomPetErpError(
        'A Pessoa do pet possui mais de um registro da característica Data de Falecimento no ERP.',
        'erp_pet_death_characteristic_ambiguous',
        409
      );
    }
    const characteristicBefore = characteristicBeforeResult.rows[0] || null;
    if (!characteristicBefore && !characteristicWasAbsent) {
      throw bomPetErpError(
        'A característica Data de Falecimento mudou durante a sincronização; tente reenviar.',
        'erp_pet_death_characteristic_changed',
        503
      );
    }
    const previousDate = toDateOnly(characteristicBefore?.valor);
    if (characteristicBefore?.valor != null &&
        String(characteristicBefore.valor).trim() &&
        !previousDate) {
      throw bomPetErpError(
        'A característica Data de Falecimento possui um valor inválido no ERP.',
        'erp_pet_death_value_invalid',
        409
      );
    }
    if (previousDate && previousDate !== normalizedDate) {
      throw bomPetErpError(
        `A Pessoa do pet já possui data de falecimento ${previousDate}; a data não foi sobrescrita.`,
        'erp_pet_death_date_conflict',
        409
      );
    }

    let changed = false;
    if (!previousDate) {
      authorId ??= await resolveTechnicalAuthorId();

      if (characteristicBefore) {
        const updateResult = await client.query(
          `UPDATE caracteristicas_pessoas
              SET valor = $2,
                  data_alteracao = CURRENT_TIMESTAMP,
                  usuario_alteracao_id = $3
            WHERE id = $1
              AND pessoa_id = $4
              AND caracteristica_id = $5`,
          [
            characteristicBefore.id,
            normalizedDate,
            authorId,
            normalizedPessoaId,
            ERP_PET_DEATH_CHARACTERISTIC_ID,
          ]
        );
        changed = updateResult.rowCount === 1;
      } else {
        const insertResult = await client.query(
          `INSERT INTO caracteristicas_pessoas (
             id, pessoa_id, caracteristica_id, valor,
             data_inclusao, usuario_inclusao_id,
             data_alteracao, usuario_alteracao_id
           ) VALUES (
             nextval('pk_sequence'), $1, $2, $3,
             CURRENT_TIMESTAMP, $4,
             CURRENT_TIMESTAMP, $4
           )`,
          [
            normalizedPessoaId,
            ERP_PET_DEATH_CHARACTERISTIC_ID,
            normalizedDate,
            authorId,
          ]
        );
        changed = insertResult.rowCount === 1;
      }
      if (!changed) {
        throw bomPetErpError(
          'O ERP não confirmou a gravação da característica Data de Falecimento.',
          'erp_pet_death_date_not_confirmed',
          502
        );
      }
    }

    const characteristicAfterResult = await client.query(
      `SELECT id, valor
         FROM caracteristicas_pessoas
        WHERE pessoa_id = $1
          AND caracteristica_id = $2
        ORDER BY id`,
      [normalizedPessoaId, ERP_PET_DEATH_CHARACTERISTIC_ID]
    );
    const confirmedDate = toDateOnly(characteristicAfterResult.rows[0]?.valor);
    if (characteristicAfterResult.rows.length !== 1 || confirmedDate !== normalizedDate) {
      throw bomPetErpError(
        'O ERP não confirmou a data de falecimento após a atualização.',
        'erp_pet_death_date_not_confirmed',
        502
      );
    }

    await client.query('COMMIT');
    return {
      pessoaId: normalizedPessoaId,
      pessoaCodigo: String(before.pessoa || '').trim() || null,
      dataFalecimento: confirmedDate,
      characteristicId: ERP_PET_DEATH_CHARACTERISTIC_ID,
      changed,
      alreadyApplied: !changed,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export function markBomPetPessoaFalecida(input) {
  return markBomPetPessoaFalecidaWithDb(getErpPool(), input);
}

export function isBomPetErpDeathSyncEnabled(env = process.env) {
  return String(env.BOM_PET_ERP_DEATH_SYNC_ENABLED || '').trim().toLowerCase() === 'true';
}