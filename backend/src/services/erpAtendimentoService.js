import { getErpPool } from './erpDbService.js';
import { query } from '../config/database.js';

const MODULES = {
  bom_auto: {
    table: 'bom_auto_atendimentos',
    mirror: upsertBomAutoAtendimentoWithDb,
  },
  bom_pet: {
    table: 'bom_pet_atendimentos',
    mirror: upsertBomPetAtendimentoWithDb,
  },
};

export function isErpAtendimentoSyncEnabled(env = process.env) {
  return env.ERP_ATENDIMENTO_SYNC_ENABLED === 'true';
}

function wrapMirrorError(moduleName, error) {
  const wrapped = new Error(
    `Não foi possível registrar o atendimento ${moduleName} no ERP: ${error.message}`
  );
  wrapped.code = 'erp_atendimento_write_failed';
  wrapped.statusCode = 502;
  wrapped.isErpUpstream = true;
  wrapped.cause = error;
  return wrapped;
}

function protocolCollisionError(moduleName, protocolo) {
  const error = new Error(
    `O protocolo ${protocolo} já existe no ERP com identidade diferente do atendimento ${moduleName}.`
  );
  error.code = 'erp_atendimento_protocol_collision';
  error.statusCode = 409;
  error.isErpUpstream = true;
  return error;
}

export async function upsertBomAutoAtendimentoWithDb(db, atendimento) {
  try {
    const result = await db.query(
      `INSERT INTO public.x_atendimentos_bom_auto
        (protocolo, documento_cliente, placa, nome_cliente, descricao_veiculo,
         tipo_servico, contratos_servicos, telefone_contato, observacoes,
         data_hora, usuario, status_atendimento, data_integracao)
       VALUES
         ($1, $2, $3, $4, $5, $6, $7, $8, $9,
          $10::timestamptz AT TIME ZONE 'America/Sao_Paulo',
          $11, $12, CURRENT_TIMESTAMP)
       ON CONFLICT (protocolo) DO UPDATE SET
         data_integracao = public.x_atendimentos_bom_auto.data_integracao
        WHERE public.x_atendimentos_bom_auto.documento_cliente
                IS NOT DISTINCT FROM EXCLUDED.documento_cliente
          AND public.x_atendimentos_bom_auto.placa
                IS NOT DISTINCT FROM EXCLUDED.placa
       RETURNING id, protocolo, data_integracao`,
      [
        atendimento.protocolo,
        atendimento.documento_cliente,
        atendimento.placa,
        atendimento.nome_cliente,
        atendimento.descricao_veiculo,
        atendimento.tipo_servico,
        atendimento.contratos_servicos,
        atendimento.telefone_contato,
        atendimento.observacoes,
        atendimento.data_hora,
        atendimento.usuario,
        atendimento.status_atendimento,
      ]
    );
    if (!result.rows[0]) {
      throw protocolCollisionError('Bom Auto', atendimento.protocolo);
    }
    return result.rows[0];
  } catch (error) {
    if (error.code === 'erp_atendimento_protocol_collision') throw error;
    throw wrapMirrorError('Bom Auto', error);
  }
}

export async function upsertBomPetAtendimentoWithDb(db, atendimento) {
  try {
    const result = await db.query(
      `INSERT INTO public.x_atendimentos_bom_pet
        (protocolo, pet_contrato_id, documento_cliente, nome_cliente, pet_nome,
         pet_descricao, contratos_servicos, situacao_financeira,
         comprovante_pagamento_recebido, comprovante_pagamento_obs,
         remocao_local, remocao_endereco, clinica_nome, parceiro_nome,
         telefone_contato, observacoes, data_hora, usuario, status_atendimento,
         pet_falecido_marcado, origem, valor_particular, pet_data_falecimento,
         data_integracao)
       VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
          $15, $16, $17::timestamptz AT TIME ZONE 'America/Sao_Paulo',
          $18, $19, $20, $21, $22, $23, CURRENT_TIMESTAMP)
       ON CONFLICT (protocolo) DO UPDATE SET
         data_integracao = public.x_atendimentos_bom_pet.data_integracao
        WHERE public.x_atendimentos_bom_pet.documento_cliente
                IS NOT DISTINCT FROM EXCLUDED.documento_cliente
          AND public.x_atendimentos_bom_pet.pet_contrato_id
                IS NOT DISTINCT FROM EXCLUDED.pet_contrato_id
          AND public.x_atendimentos_bom_pet.pet_nome
                IS NOT DISTINCT FROM EXCLUDED.pet_nome
          AND public.x_atendimentos_bom_pet.origem
                IS NOT DISTINCT FROM EXCLUDED.origem
       RETURNING id, protocolo, data_integracao`,
      [
        atendimento.protocolo,
        atendimento.pet_contrato_id,
        atendimento.documento_cliente,
        atendimento.nome_cliente,
        atendimento.pet_nome,
        atendimento.pet_descricao,
        atendimento.contratos_servicos,
        atendimento.situacao_financeira,
        atendimento.comprovante_pagamento_recebido,
        atendimento.comprovante_pagamento_obs,
        atendimento.remocao_local,
        atendimento.remocao_endereco,
        atendimento.clinica_nome,
        atendimento.parceiro_nome,
        atendimento.telefone_contato,
        atendimento.observacoes,
        atendimento.data_hora,
        atendimento.usuario,
        atendimento.status_atendimento,
        atendimento.pet_falecido_marcado,
        atendimento.origem,
        atendimento.valor_pago_particular,
        atendimento.pet_data_falecimento,
      ]
    );
    if (!result.rows[0]) {
      throw protocolCollisionError('Bom Pet', atendimento.protocolo);
    }
    return result.rows[0];
  } catch (error) {
    if (error.code === 'erp_atendimento_protocol_collision') throw error;
    throw wrapMirrorError('Bom Pet', error);
  }
}

export function mirrorBomAutoAtendimento(atendimento) {
  return upsertBomAutoAtendimentoWithDb(getErpPool(), atendimento);
}

export function mirrorBomPetAtendimento(atendimento) {
  return upsertBomPetAtendimentoWithDb(getErpPool(), atendimento);
}

export async function enqueueErpAtendimento(client, modulo, atendimento) {
  if (!MODULES[modulo]) throw new Error(`Módulo de atendimento inválido: ${modulo}`);
  const result = await client.query(
    `INSERT INTO erp_atendimento_outbox (modulo, atendimento_id, protocolo)
     VALUES ($1, $2, $3)
     ON CONFLICT (modulo, atendimento_id) DO UPDATE SET
       protocolo = EXCLUDED.protocolo,
       status = CASE
         WHEN erp_atendimento_outbox.status = 'completed' THEN 'completed'
         ELSE 'pending'
       END,
       next_retry_at = CURRENT_TIMESTAMP,
       updated_at = CURRENT_TIMESTAMP
     RETURNING id`,
    [modulo, atendimento.id, atendimento.protocolo]
  );
  return Number(result.rows[0].id);
}

async function markOutboxError(id, attempt, error, localQuery) {
  const safeError = String(error?.code || error?.message || 'erro_erp_desconhecido').slice(0, 500);
  await localQuery(
    `UPDATE erp_atendimento_outbox
        SET status = 'error',
            last_error = $2,
            next_retry_at = CURRENT_TIMESTAMP
              + (LEAST(30, GREATEST(1, attempts)) * INTERVAL '1 minute'),
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
        AND status = 'processing'
        AND attempts = $3`,
    [id, safeError, attempt]
  );
}

export async function syncErpAtendimentoOutboxItemWithDeps(
  id,
  {
    localQuery = query,
    getErpDb = getErpPool,
    syncEnabled = isErpAtendimentoSyncEnabled,
  } = {}
) {
  if (!syncEnabled()) return { status: 'disabled' };

  let claimed;
  try {
    const claimResult = await localQuery(
      `UPDATE erp_atendimento_outbox
          SET status = 'processing',
              attempts = attempts + 1,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
          AND (
            status IN ('pending', 'error')
            OR (status = 'processing' AND updated_at < CURRENT_TIMESTAMP - INTERVAL '5 minutes')
          )
        RETURNING id, modulo, atendimento_id, protocolo, attempts`,
      [id]
    );
    claimed = claimResult.rows[0];
    if (!claimed) return { status: 'skipped' };

    const config = MODULES[claimed.modulo];
    if (!config) throw new Error(`Módulo inválido na fila: ${claimed.modulo}`);
    const atendimentoResult = await localQuery(
      `SELECT * FROM ${config.table} WHERE id = $1`,
      [claimed.atendimento_id]
    );
    const atendimento = atendimentoResult.rows[0];
    if (!atendimento) throw new Error('Atendimento local não encontrado para integração.');
    if (atendimento.protocolo !== claimed.protocolo) {
      throw new Error('Protocolo local diverge do protocolo enfileirado.');
    }

    await config.mirror(getErpDb(), atendimento);
    const completed = await localQuery(
      `UPDATE erp_atendimento_outbox
          SET status = 'completed',
              last_error = NULL,
              completed_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
          AND status = 'processing'
          AND attempts = $2`,
      [claimed.id, claimed.attempts]
    );
    return { status: completed.rowCount === 1 ? 'completed' : 'skipped' };
  } catch (error) {
    if (claimed?.id) {
      await markOutboxError(
        claimed.id,
        claimed.attempts,
        error,
        localQuery
      ).catch((markError) => {
        console.error('[ErpAtendimento] Falha ao registrar erro da fila:', markError.message);
      });
    }
    console.error('[ErpAtendimento] Integração pendente:', {
      outboxId: claimed?.id || id,
      modulo: claimed?.modulo || null,
      code: error.code || null,
    });
    return { status: 'pending' };
  }
}

export function syncErpAtendimentoOutboxItem(id) {
  return syncErpAtendimentoOutboxItemWithDeps(id);
}

export async function reconcilePendingErpAtendimentosWithDeps({
  limit = 20,
  localQuery = query,
  syncItem = syncErpAtendimentoOutboxItem,
  syncEnabled = isErpAtendimentoSyncEnabled,
} = {}) {
  const summary = {
    checked: 0,
    completed: 0,
    pending: 0,
    skipped: 0,
    disabled: !syncEnabled(),
  };
  if (summary.disabled) return summary;

  const pending = await localQuery(
    `SELECT id
       FROM erp_atendimento_outbox
      WHERE (
         status IN ('pending', 'error')
         AND next_retry_at <= CURRENT_TIMESTAMP
         AND last_error IS DISTINCT FROM 'erp_atendimento_protocol_collision'
      ) OR (
        status = 'processing' AND updated_at < CURRENT_TIMESTAMP - INTERVAL '5 minutes'
      )
      ORDER BY next_retry_at, id
      LIMIT $1`,
    [Math.max(1, Math.min(100, Number(limit) || 20))]
  );
  summary.checked = pending.rows.length;
  for (const row of pending.rows) {
    const result = await syncItem(row.id);
    summary[result.status] = (summary[result.status] || 0) + 1;
  }
  return summary;
}

export function reconcilePendingErpAtendimentos(options) {
  return reconcilePendingErpAtendimentosWithDeps(options);
}