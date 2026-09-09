import { pool, query } from '../config/database.js';
import { getPedidoSituacoes } from './erpDbService.js';
import { notifyLeadStageChanged } from './notificationService.js';
import {
  executeStageChangeAutomation,
  executeUpsellChannelStageChangeAutomation,
} from './automationService.js';

const LOCK_KEY = 'bomflow:erp-approval-reconciliation:v1';
const WON_STAGE = 'fechado_ganho';
const CONFLICT_STAGES = new Set([
  'fechado_perdido', 'closed_lost', 'perdido', 'cancelado', 'cancelada',
  'convertido', 'inativo', 'inativa',
]);

export const MODULE_CONFIG = Object.freeze({
  sales: { table: 'leads', leadType: 'lead' },
  sales_pj: { table: 'leads_pj', leadType: 'lead_pj' },
  sales_upsell: { table: 'leads_upsell', leadType: 'lead_upsell' },
  referral: { table: 'referrals', leadType: 'referral' },
});

function emptyCounts() {
  return {
    atualizado: 0,
    ja_sincronizado: 0,
    sem_vinculo: 0,
    conflito: 0,
    nao_aprovado: 0,
    erro: 0,
  };
}

export function classifyApprovalCandidate({ leadId, modulo, erpSituacao, stage }) {
  if (!leadId || !MODULE_CONFIG[modulo]) return 'sem_vinculo';
  if (erpSituacao !== 'A') return 'nao_aprovado';
  if (stage === WON_STAGE || stage === 'closed_won') return 'ja_sincronizado';
  if (CONFLICT_STAGES.has(String(stage || '').toLowerCase())) return 'conflito';
  return 'atualizado';
}

async function recordItem(client, runId, item, result, detail = null, previousStage = null) {
  const inserted = await client.query(
    `INSERT INTO erp_approval_reconciliation_items
       (run_id, erp_pedido_id, lead_id, modulo, erp_situacao, resultado, detalhe, stage_anterior)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING id`,
    [
      runId, item.erp_pedido_id, item.lead_id || null, item.modulo || null,
      item.erp_situacao || null, result, detail, previousStage,
    ]
  );
  return inserted.rows[0]?.id || null;
}

async function createReferralPerspective(client, referral) {
  let agentName = null;
  if (referral.agent_id) {
    const agent = await client.query('SELECT name FROM agents WHERE id = $1', [referral.agent_id]);
    agentName = agent.rows[0]?.name || null;
  }
  await client.query(
    `INSERT INTO erp_perspectivas_negocios
       (nome_indicador, cpf_indicador, nome_indicado, cpf_indicado, nome_vendedor,
        sit_perspectiva, origem, sincronizado_em)
     SELECT $1,$2,$3,$4,$5,'NEGOCIO FECHADO','crm',NOW()
     WHERE NOT EXISTS (
       SELECT 1 FROM erp_perspectivas_negocios p
        WHERE regexp_replace(COALESCE(p.cpf_indicador, ''), '[^0-9]', '', 'g')
                IS NOT DISTINCT FROM $2
          AND (
            ($4 IS NOT NULL AND regexp_replace(COALESCE(p.cpf_indicado, ''), '[^0-9]', '', 'g')
              IS NOT DISTINCT FROM $4)
            OR
            ($4 IS NULL
              AND (p.cpf_indicado IS NULL OR regexp_replace(COALESCE(p.cpf_indicado, ''), '[^0-9]', '', 'g') = '')
              AND p.nome_indicado IS NOT DISTINCT FROM $3)
          )
     )`,
    [
      referral.referrer_name || null,
      String(referral.referrer_cpf || '').replace(/\D/g, '') || null,
      referral.referred_name || null,
      String(referral.referred_cpf || '').replace(/\D/g, '') || null,
      agentName,
    ]
  );
}

async function transitionTrackedBusiness(client, tracked) {
  const config = MODULE_CONFIG[tracked.modulo];
  if (!config) return { result: 'sem_vinculo', detail: `Módulo inválido: ${tracked.modulo}` };

  const selected = await client.query(
    `SELECT * FROM ${config.table} WHERE id = $1 FOR UPDATE`,
    [tracked.lead_id]
  );
  const business = selected.rows[0];
  if (!business) return { result: 'sem_vinculo', detail: 'Negócio vinculado não encontrado.' };

  const previousStage = business.stage;
  const classification = classifyApprovalCandidate({
    leadId: tracked.lead_id,
    modulo: tracked.modulo,
    erpSituacao: 'A',
    stage: previousStage,
  });
  if (classification === 'ja_sincronizado') {
    return { result: 'ja_sincronizado', previousStage, business };
  }
  if (classification === 'conflito') {
    return {
      result: 'conflito',
      detail: `Negócio encerrado em estágio incompatível: ${previousStage}.`,
      previousStage,
      business,
    };
  }

  const updated = await client.query(
    `UPDATE ${config.table}
        SET stage = $1, updated_at = NOW()
      WHERE id = $2 AND stage IS NOT DISTINCT FROM $3
      RETURNING *`,
    [WON_STAGE, tracked.lead_id, previousStage]
  );
  if (updated.rowCount !== 1) {
    return { result: 'conflito', detail: 'Estágio alterado concorrentemente.', previousStage };
  }

  const lead = updated.rows[0];
  if (tracked.modulo === 'referral') await createReferralPerspective(client, lead);
  return { result: 'atualizado', previousStage, business: lead };
}

async function enqueueEffects(client, runId, itemId, transition) {
  const { tracked, previousStage, business } = transition;
  const effectTypes = tracked.modulo === 'sales'
    ? ['pf_stage_notification']
    : tracked.modulo === 'sales_upsell'
      ? ['upsell_stage_automation', 'upsell_channel_stage_automation']
      : [];
  for (const effectType of effectTypes) {
    await client.query(
      `INSERT INTO erp_approval_reconciliation_effects
         (run_id, item_id, effect_key, effect_type, modulo, lead_id, payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
       ON CONFLICT (effect_key) DO NOTHING`,
      [
        runId, itemId, `${tracked.modulo}:${tracked.lead_id}:${tracked.erp_pedido_id}:erp-approved:${effectType}`,
        effectType, tracked.modulo, tracked.lead_id,
        JSON.stringify({ business, previousStage }),
      ]
    );
  }
}

export async function applyApprovedTrackedBusiness(client, runId, tracked) {
  await client.query('BEGIN');
  try {
    const transition = await transitionTrackedBusiness(client, tracked);
    const itemId = await recordItem(
      client, runId, tracked, transition.result, transition.detail, transition.previousStage
    );
    if (transition.result === 'atualizado') {
      await enqueueEffects(client, runId, itemId, { ...transition, tracked });
    }
    await client.query('COMMIT');
    return transition;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  }
}

async function executeEffect(effect) {
  const payload = typeof effect.payload === 'string' ? JSON.parse(effect.payload) : effect.payload;
  const { business, previousStage } = payload;
  if (effect.effect_type === 'pf_stage_notification') {
    const result = await notifyLeadStageChanged(
      business, previousStage, WON_STAGE, null, { dedupeKey: effect.effect_key }
    );
    if (result?.success === false) throw new Error(result.error || 'Falha ao criar notificação.');
  } else if (effect.effect_type === 'upsell_stage_automation') {
    const result = await executeStageChangeAutomation(
      business, previousStage, WON_STAGE, 'lead_upsell', { eventKey: effect.effect_key }
    );
    if (result?.deferred) return result;
    if (result?.success === false) throw new Error(result.error || 'Falha na automação de Upsell.');
  } else if (effect.effect_type === 'upsell_channel_stage_automation') {
    const result = await executeUpsellChannelStageChangeAutomation(
      business, previousStage, WON_STAGE, { eventKey: effect.effect_key }
    );
    if (result?.deferred) return result;
    if (result?.success === false) throw new Error(result.error || 'Falha na automação por canal.');
  } else {
    throw new Error(`Tipo de efeito desconhecido: ${effect.effect_type}`);
  }
  return { success: true };
}

async function processPendingEffects(client, { runId = null, previousRunsOnly = false } = {}) {
  const runFilter = runId
    ? previousRunsOnly ? 'AND run_id <> $1' : 'AND run_id = $1'
    : '';
  const pending = await client.query(
    `SELECT id, effect_key, effect_type, payload
       FROM erp_approval_reconciliation_effects
      WHERE status IN ('pending', 'failed')
        ${runFilter}
      ORDER BY created_at, id`
    , runId ? [runId] : []
  );
  const failures = [];
  for (const effect of pending.rows) {
    try {
      const outcome = await executeEffect(effect);
      if (outcome?.deferred) continue;
      await client.query(
        `UPDATE erp_approval_reconciliation_effects
            SET status = 'completed', attempts = attempts + 1, last_error = NULL, processed_at = NOW()
          WHERE id = $1`,
        [effect.id]
      );
    } catch (error) {
      failures.push({ effectId: effect.id, error: error.message });
      await client.query(
        `UPDATE erp_approval_reconciliation_effects
            SET status = 'failed', attempts = attempts + 1, last_error = $2
          WHERE id = $1`,
        [effect.id, error.message]
      );
    }
  }
  return failures;
}

export async function runErpApprovalReconciliation({
  origin = 'scheduled',
  requestedBy = null,
  getSituacoes = getPedidoSituacoes,
  dbPool = pool,
} = {}) {
  const lockClient = await dbPool.connect();
  let locked = false;
  let runId = null;
  const counts = emptyCounts();
  let effectErrors = [];
  try {
    const lock = await lockClient.query(
      'SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked',
      [LOCK_KEY]
    );
    locked = lock.rows[0]?.locked === true;
    if (!locked) return { skipped: true, reason: 'reconciliation_already_running' };

    const run = await lockClient.query(
      `INSERT INTO erp_approval_reconciliation_runs (origem, solicitado_por, status)
       VALUES ($1,$2,'running') RETURNING id, started_at`,
      [origin, requestedBy]
    );
    runId = run.rows[0].id;

    // Recupera efeitos de execuções anteriores antes de depender da disponibilidade
    // atual do ERP. A fila foi gravada atomicamente com a mudança de estágio.
    effectErrors = await processPendingEffects(lockClient, { runId, previousRunsOnly: true });

    const batchSize = Math.min(Math.max(Number(process.env.ERP_APPROVAL_SYNC_BATCH_SIZE) || 200, 10), 500);
    const maxPerRun = Math.min(Math.max(Number(process.env.ERP_APPROVAL_SYNC_MAX_PER_RUN) || 2000, batchSize), 10000);
    let processed = 0;

    while (processed < maxPerRun) {
      const candidatesResult = await lockClient.query(
        `SELECT b.erp_pedido_id, b.lead_id, b.modulo,
                b.erp_approval_last_situacao,
                b.erp_approval_last_error,
                CASE b.modulo
                  WHEN 'sales' THEN l.stage
                  WHEN 'sales_pj' THEN pj.stage
                  WHEN 'sales_upsell' THEN u.stage
                  WHEN 'referral' THEN r.stage
                END AS local_stage,
                CASE b.modulo
                  WHEN 'sales' THEN l.id IS NOT NULL
                  WHEN 'sales_pj' THEN pj.id IS NOT NULL
                  WHEN 'sales_upsell' THEN u.id IS NOT NULL
                  WHEN 'referral' THEN r.id IS NOT NULL
                  ELSE false
                END AS business_exists
           FROM bomflow_orcamentos b
           LEFT JOIN leads l ON b.modulo = 'sales' AND l.id = b.lead_id
           LEFT JOIN leads_pj pj ON b.modulo = 'sales_pj' AND pj.id = b.lead_id
           LEFT JOIN leads_upsell u ON b.modulo = 'sales_upsell' AND u.id = b.lead_id
           LEFT JOIN referrals r ON b.modulo = 'referral' AND r.id = b.lead_id
          WHERE b.erp_approval_sync_status IN ('pending', 'error')
            AND (b.erp_approval_last_checked_at IS NULL OR b.erp_approval_last_checked_at < $1)
          ORDER BY b.erp_approval_last_checked_at NULLS FIRST, b.created_at, b.erp_pedido_id
          LIMIT $2`,
        [run.rows[0].started_at, Math.min(batchSize, maxPerRun - processed)]
      );
      if (candidatesResult.rows.length === 0) break;
      const candidates = candidatesResult.rows;
      processed += candidates.length;
      const erpEligible = [];

      for (const item of candidates) {
        if (!item.business_exists || !item.lead_id || !MODULE_CONFIG[item.modulo]) {
          counts.sem_vinculo += 1;
          await recordItem(lockClient, runId, item, 'sem_vinculo', 'Vínculo local ausente ou inválido.');
          await lockClient.query(
            `UPDATE bomflow_orcamentos
                SET erp_approval_sync_status = 'missing_link', erp_approval_last_checked_at = NOW(),
                    erp_approval_last_error = 'Vínculo local ausente ou inválido.'
              WHERE erp_pedido_id = $1`,
            [item.erp_pedido_id]
          );
        } else {
          erpEligible.push(item);
        }
      }

      if (erpEligible.length === 0) continue;
      let erpRows;
      try {
        erpRows = await getSituacoes(erpEligible.map((item) => item.erp_pedido_id));
      } catch (error) {
        counts.erro += erpEligible.length;
        for (const item of erpEligible) {
          const detail = `Falha ao consultar ERP: ${error.message}`;
          if (item.erp_approval_last_error !== detail) {
            await recordItem(lockClient, runId, item, 'erro', detail);
          }
          await lockClient.query(
            `UPDATE bomflow_orcamentos SET erp_approval_sync_status = 'error',
                    erp_approval_last_checked_at = NOW(), erp_approval_last_error = $2
              WHERE erp_pedido_id = $1`,
            [item.erp_pedido_id, detail]
          );
        }
        throw error;
      }

      const statusById = new Map(erpRows.map((row) => [
        Number(row.erp_pedido_id), String(row.situacao || '').trim(),
      ]));
      for (const item of erpEligible) {
        const situacao = statusById.get(Number(item.erp_pedido_id));
        const audited = { ...item, erp_situacao: situacao || null };
        if (!situacao) {
          counts.erro += 1;
          const detail = 'Pedido rastreado não encontrado no ERP.';
          if (item.erp_approval_last_error !== detail) await recordItem(lockClient, runId, audited, 'erro', detail);
          await lockClient.query(
            `UPDATE bomflow_orcamentos SET erp_approval_sync_status = 'error',
                    erp_approval_last_checked_at = NOW(), erp_approval_last_error = $2
              WHERE erp_pedido_id = $1`,
            [item.erp_pedido_id, detail]
          );
          continue;
        }
        if (situacao !== 'A') {
          counts.nao_aprovado += 1;
          if (item.erp_approval_last_situacao !== situacao) {
            await recordItem(lockClient, runId, audited, 'nao_aprovado', 'Situação ERP não aprovada.');
          }
          await lockClient.query(
            `UPDATE bomflow_orcamentos SET erp_approval_sync_status = 'pending',
                    erp_approval_last_checked_at = NOW(), erp_approval_last_situacao = $2,
                    erp_approval_last_error = NULL
              WHERE erp_pedido_id = $1`,
            [item.erp_pedido_id, situacao]
          );
          continue;
        }
        try {
          const transition = await applyApprovedTrackedBusiness(lockClient, runId, audited);
          counts[transition.result] += 1;
          const terminalStatus = transition.result === 'conflito'
            ? 'conflict'
            : transition.result === 'sem_vinculo' ? 'missing_link' : 'synchronized';
          await lockClient.query(
            `UPDATE bomflow_orcamentos SET erp_approval_sync_status = $2,
                    erp_approval_last_checked_at = NOW(), erp_approval_last_situacao = 'A',
                    erp_approval_last_error = $3
              WHERE erp_pedido_id = $1`,
            [item.erp_pedido_id, terminalStatus, transition.detail || null]
          );
        } catch (error) {
          counts.erro += 1;
          await recordItem(lockClient, runId, audited, 'erro', error.message);
          await lockClient.query(
            `UPDATE bomflow_orcamentos SET erp_approval_sync_status = 'error',
                    erp_approval_last_checked_at = NOW(), erp_approval_last_error = $2
              WHERE erp_pedido_id = $1`,
            [item.erp_pedido_id, error.message]
          );
        }
      }
    }

    // Inclui também os efeitos enfileirados pelas transições deste próprio lote.
    effectErrors = [...effectErrors, ...await processPendingEffects(lockClient, { runId })];

    await lockClient.query(
      `UPDATE erp_approval_reconciliation_runs
          SET status = $1, finished_at = NOW(), resumo = $2::jsonb, erro = $3
        WHERE id = $4`,
      [effectErrors.length ? 'partial' : 'completed', JSON.stringify(counts),
       effectErrors.length ? JSON.stringify(effectErrors) : null, runId]
    );
    const retentionDays = Math.min(Math.max(Number(process.env.ERP_APPROVAL_AUDIT_RETENTION_DAYS) || 90, 7), 365);
    await lockClient.query(
      `DELETE FROM erp_approval_reconciliation_runs
        WHERE started_at < NOW() - ($1::text || ' days')::interval`,
      [retentionDays]
    );
    return { id: runId, status: effectErrors.length ? 'partial' : 'completed', counts };
  } catch (error) {
    if (runId) {
      await lockClient.query(
        `UPDATE erp_approval_reconciliation_runs
            SET status = 'failed', finished_at = NOW(), resumo = $1::jsonb, erro = $2
          WHERE id = $3`,
        [JSON.stringify(counts), error.message, runId]
      ).catch(() => {});
    }
    return { id: runId, status: 'failed', counts, error: error.message };
  } finally {
    if (locked) {
      await lockClient.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [LOCK_KEY]).catch(() => {});
    }
    lockClient.release();
  }
}

export async function getLatestErpApprovalReconciliation() {
  const run = await query(
    `SELECT id, origem, solicitado_por, status, resumo, erro, started_at, finished_at
       FROM erp_approval_reconciliation_runs
      ORDER BY started_at DESC LIMIT 1`
  );
  if (!run.rows[0]) return null;
  const items = await query(
    `SELECT erp_pedido_id, lead_id, modulo, erp_situacao, resultado, detalhe, stage_anterior, created_at
       FROM erp_approval_reconciliation_items
      WHERE run_id = $1 ORDER BY created_at, erp_pedido_id`,
    [run.rows[0].id]
  );
  const effects = await query(
    `SELECT effect_type, modulo, lead_id, status, attempts, last_error, created_at, processed_at
       FROM erp_approval_reconciliation_effects
      WHERE run_id = $1
         OR status IN ('pending', 'failed')
         OR processed_at >= (
           SELECT started_at FROM erp_approval_reconciliation_runs WHERE id = $1
         )
      ORDER BY created_at`,
    [run.rows[0].id]
  );
  return { ...run.rows[0], items: items.rows, effects: effects.rows };
}