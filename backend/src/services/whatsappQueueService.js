import { query } from '../config/database.js';

const WHATSAPP_API_URL = 'https://api.wescctech.com.br/core/v2/api/chats/send-template';
const WHATSAPP_ACCESS_TOKEN = '66033309381c7ebb4a23a196';
const WHATSAPP_TEMPLATE_ID = '6878e30fed3085944b9841b1';

async function getRateConfig() {
  try {
    const result = await query('SELECT key, value FROM gerador_leads_rate_config');
    const config = {};
    for (const row of result.rows) {
      config[row.key] = row.value;
    }
    return {
      limitePorSegundo: config.limite_por_segundo || 2,
      limitePorMinuto: config.limite_por_minuto || 30,
      limitePorUsuarioDia: config.limite_por_usuario_dia || 5000,
      bloqueioRecorrenciaDias: config.bloqueio_recorrencia_dias || 30,
    };
  } catch (err) {
    console.error('[WhatsAppQueue] Error loading rate config, using defaults:', err.message);
    return {
      limitePorSegundo: 2,
      limitePorMinuto: 30,
      limitePorUsuarioDia: 5000,
      bloqueioRecorrenciaDias: 30,
    };
  }
}

export async function enqueueLeads({ leads, userId, userEmail, teamId, templateId, filtersUsed, batchId }) {
  const rateConfig = await getRateConfig();
  const bloqueioRecorrenciaDias = rateConfig.bloqueioRecorrenciaDias;
  const limitePorUsuarioDia = rateConfig.limitePorUsuarioDia;

  let enqueued = 0;
  let blocked30Days = 0;
  let blockedDuplicate = 0;
  let blockedDailyLimit = 0;
  let skipped = 0;

  const dailyCountResult = await query(
    `SELECT COUNT(*)::int as count FROM gerador_leads_whatsapp_logs
     WHERE user_id = $1 AND sent_at::date = CURRENT_DATE AND status_envio NOT IN ('bloqueado_30_dias', 'bloqueado_duplicidade')`,
    [userId]
  );
  let userDailyCount = dailyCountResult.rows[0]?.count || 0;

  for (const lead of leads) {
    const { number, name, lead_id } = lead;

    if (!number) {
      skipped++;
      continue;
    }

    const cleanNumber = String(number).replace(/\D/g, '');

    try {
      const block30Result = await query(
        `SELECT id FROM gerador_leads_whatsapp_logs
         WHERE lead_number = $1
           AND success = true
           AND sent_at >= NOW() - INTERVAL '1 day' * $2
         LIMIT 1`,
        [cleanNumber, bloqueioRecorrenciaDias]
      );

      if (block30Result.rows.length > 0) {
        await query(
          `INSERT INTO gerador_leads_queue
            (batch_id, lead_id, lead_number, lead_name, template_id, status_envio, user_id, user_email, team_id, filters_used, motivo_bloqueio)
           VALUES ($1, $2, $3, $4, $5, 'bloqueado_30_dias', $6, $7, $8, $9, $10)`,
          [batchId, lead_id || null, cleanNumber, name || null, templateId, userId, userEmail, teamId, filtersUsed ? JSON.stringify(filtersUsed) : null, `Envio realizado nos últimos ${bloqueioRecorrenciaDias} dias`]
        );

        await query(
          `INSERT INTO gerador_leads_whatsapp_logs
            (lead_number, lead_name, user_id, user_email, template_id, status_envio, motivo_bloqueio, batch_id, team_id, success, http_status)
           VALUES ($1, $2, $3, $4, $5, 'bloqueado_30_dias', $6, $7, $8, false, 0)`,
          [cleanNumber, name || null, userId, userEmail, templateId, `Envio realizado nos últimos ${bloqueioRecorrenciaDias} dias`, batchId, teamId]
        );

        blocked30Days++;
        continue;
      }

      const dupResult = await query(
        `SELECT id FROM gerador_leads_whatsapp_logs
         WHERE lead_number = $1
           AND template_id = $2
           AND sent_at::date = CURRENT_DATE
           AND success = true
         LIMIT 1`,
        [cleanNumber, templateId]
      );

      if (dupResult.rows.length > 0) {
        await query(
          `INSERT INTO gerador_leads_queue
            (batch_id, lead_id, lead_number, lead_name, template_id, status_envio, user_id, user_email, team_id, filters_used, motivo_bloqueio)
           VALUES ($1, $2, $3, $4, $5, 'bloqueado_duplicidade', $6, $7, $8, $9, 'Envio já realizado hoje para este número')`,
          [batchId, lead_id || null, cleanNumber, name || null, templateId, userId, userEmail, teamId, filtersUsed ? JSON.stringify(filtersUsed) : null]
        );

        await query(
          `INSERT INTO gerador_leads_whatsapp_logs
            (lead_number, lead_name, user_id, user_email, template_id, status_envio, motivo_bloqueio, batch_id, team_id, success, http_status)
           VALUES ($1, $2, $3, $4, $5, 'bloqueado_duplicidade', 'Envio já realizado hoje para este número', $6, $7, false, 0)`,
          [cleanNumber, name || null, userId, userEmail, templateId, batchId, teamId]
        );

        blockedDuplicate++;
        continue;
      }

      if (userDailyCount + enqueued >= limitePorUsuarioDia) {
        await query(
          `INSERT INTO gerador_leads_queue
            (batch_id, lead_id, lead_number, lead_name, template_id, status_envio, user_id, user_email, team_id, filters_used, motivo_bloqueio)
           VALUES ($1, $2, $3, $4, $5, 'bloqueado_duplicidade', $6, $7, $8, $9, $10)`,
          [batchId, lead_id || null, cleanNumber, name || null, templateId, userId, userEmail, teamId, filtersUsed ? JSON.stringify(filtersUsed) : null, `Limite diário de ${limitePorUsuarioDia} envios atingido`]
        );

        await query(
          `INSERT INTO gerador_leads_whatsapp_logs
            (lead_number, lead_name, user_id, user_email, template_id, status_envio, motivo_bloqueio, batch_id, team_id, success, http_status)
           VALUES ($1, $2, $3, $4, $5, 'bloqueado_duplicidade', $6, $7, $8, false, 0)`,
          [cleanNumber, name || null, userId, userEmail, templateId, `Limite diário de ${limitePorUsuarioDia} envios atingido`, batchId, teamId]
        );

        blockedDailyLimit++;
        continue;
      }

      await query(
        `INSERT INTO gerador_leads_queue
          (batch_id, lead_id, lead_number, lead_name, template_id, status_envio, user_id, user_email, team_id, filters_used)
         VALUES ($1, $2, $3, $4, $5, 'pendente', $6, $7, $8, $9)`,
        [batchId, lead_id || null, cleanNumber, name || null, templateId, userId, userEmail, teamId, filtersUsed ? JSON.stringify(filtersUsed) : null]
      );

      enqueued++;
    } catch (err) {
      console.error(`[WhatsAppQueue] Error enqueuing lead ${cleanNumber}:`, err.message);
      skipped++;
    }
  }

  return { total: leads.length, enqueued, blocked30Days, blockedDuplicate, blockedDailyLimit, skipped };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function processQueue(batchId) {
  const rateConfig = await getRateConfig();
  const delayPerMessage = Math.ceil(1000 / rateConfig.limitePorSegundo);
  const limitPerMinute = rateConfig.limitePorMinuto;

  let sentThisMinute = 0;
  let minuteStart = Date.now();

  const pendingResult = await query(
    `SELECT * FROM gerador_leads_queue
     WHERE batch_id = $1 AND status_envio IN ('pendente', 'reenvio_agendado')
     ORDER BY created_at ASC`,
    [batchId]
  );

  console.log(`[WhatsAppQueue] Processing batch ${batchId}: ${pendingResult.rows.length} items`);

  for (const item of pendingResult.rows) {
    if (Date.now() - minuteStart >= 60000) {
      sentThisMinute = 0;
      minuteStart = Date.now();
    }

    if (sentThisMinute >= limitPerMinute) {
      const waitTime = 60000 - (Date.now() - minuteStart);
      if (waitTime > 0) {
        console.log(`[WhatsAppQueue] Rate limit per minute reached. Waiting ${Math.ceil(waitTime / 1000)}s...`);
        await sleep(waitTime);
      }
      sentThisMinute = 0;
      minuteStart = Date.now();
    }

    await query(
      `UPDATE gerador_leads_queue SET status_envio = 'enviando', updated_at = NOW() WHERE id = $1`,
      [item.id]
    );

    const payload = {
      number: item.lead_number,
      templateId: item.template_id,
      forceSend: true,
      verifyContact: false,
      templatecomponents: [
        {
          type: "body",
          parameters: [
            {
              type: "text",
              text: item.lead_name || ''
            }
          ]
        }
      ]
    };

    let httpStatus = 0;
    let apiResponse = null;
    let success = false;
    let messageSentId = null;

    try {
      const waRes = await fetch(WHATSAPP_API_URL, {
        method: 'POST',
        headers: {
          'access-token': WHATSAPP_ACCESS_TOKEN,
          'Content-Type': 'application/json',
          'accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      httpStatus = waRes.status;
      try {
        apiResponse = await waRes.json();
      } catch {
        const rawText = await waRes.text();
        apiResponse = { raw: rawText };
      }
      success = httpStatus >= 200 && httpStatus < 300;
      messageSentId = apiResponse?.messageSentId || apiResponse?.message_sent_id || apiResponse?.id || null;
    } catch (fetchErr) {
      httpStatus = 0;
      apiResponse = { error: fetchErr.message };
      success = false;
    }

    const currentAttempt = item.tentativa_numero;
    const statusEnvio = success ? 'enviado' : (currentAttempt < item.max_tentativas ? 'reenvio_agendado' : 'falha');

    try {
      await query(
        `INSERT INTO gerador_leads_whatsapp_logs
          (lead_number, lead_name, user_id, user_email, sent_at, http_status, api_response, success, message_sent_id, filters_used, template_id, status_envio, tentativa_numero, batch_id, team_id)
         VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          item.lead_number,
          item.lead_name,
          item.user_id,
          item.user_email,
          httpStatus,
          JSON.stringify(apiResponse),
          success,
          messageSentId ? String(messageSentId) : null,
          item.filters_used ? JSON.stringify(item.filters_used) : null,
          item.template_id,
          statusEnvio,
          currentAttempt,
          batchId,
          item.team_id
        ]
      );
    } catch (dbErr) {
      console.error(`[WhatsAppQueue] DB log error for ${item.lead_number}:`, dbErr.message);
    }

    if (!success) {
      await query(
        `UPDATE gerador_leads_queue SET status_envio = $1, tentativa_numero = tentativa_numero + 1, updated_at = NOW() WHERE id = $2`,
        [statusEnvio, item.id]
      );
    } else {
      await query(
        `UPDATE gerador_leads_queue SET status_envio = $1, updated_at = NOW() WHERE id = $2`,
        [statusEnvio, item.id]
      );
    }

    sentThisMinute++;

    if (delayPerMessage > 0) {
      await sleep(delayPerMessage);
    }
  }

  console.log(`[WhatsAppQueue] Batch ${batchId} processing complete.`);
}

export async function retryFailed(batchId, userId, userEmail, teamId) {
  const rateConfig = await getRateConfig();
  const bloqueioRecorrenciaDias = rateConfig.bloqueioRecorrenciaDias;

  const failedResult = await query(
    `SELECT * FROM gerador_leads_queue
     WHERE batch_id = $1
       AND status_envio IN ('falha', 'reenvio_agendado')
       AND tentativa_numero < max_tentativas
     ORDER BY created_at ASC`,
    [batchId]
  );

  if (failedResult.rows.length === 0) {
    return { total: 0, retried: 0, blocked: 0 };
  }

  let retried = 0;
  let blocked = 0;

  for (const item of failedResult.rows) {
    const existingSuccess = await query(
      `SELECT id FROM gerador_leads_whatsapp_logs
       WHERE lead_number = $1 AND message_sent_id IS NOT NULL AND success = true
       LIMIT 1`,
      [item.lead_number]
    );

    if (existingSuccess.rows.length > 0) {
      await query(
        `UPDATE gerador_leads_queue SET status_envio = 'enviado', updated_at = NOW() WHERE id = $1`,
        [item.id]
      );
      blocked++;
      continue;
    }

    const block30Result = await query(
      `SELECT id FROM gerador_leads_whatsapp_logs
       WHERE lead_number = $1
         AND success = true
         AND sent_at >= NOW() - INTERVAL '1 day' * $2
       LIMIT 1`,
      [item.lead_number, bloqueioRecorrenciaDias]
    );

    if (block30Result.rows.length > 0) {
      await query(
        `UPDATE gerador_leads_queue SET status_envio = 'bloqueado_30_dias', motivo_bloqueio = $1, updated_at = NOW() WHERE id = $2`,
        [`Envio realizado nos últimos ${bloqueioRecorrenciaDias} dias`, item.id]
      );
      blocked++;
      continue;
    }

    await query(
      `UPDATE gerador_leads_queue SET status_envio = 'pendente', tentativa_numero = tentativa_numero + 1, updated_at = NOW() WHERE id = $1`,
      [item.id]
    );
    retried++;
  }

  if (retried > 0) {
    processQueue(batchId).catch(err => {
      console.error(`[WhatsAppQueue] Retry processing error for batch ${batchId}:`, err.message);
    });
  }

  return { total: failedResult.rows.length, retried, blocked };
}

export async function getQueueStatus(batchId) {
  const result = await query(
    `SELECT status_envio, COUNT(*)::int as count
     FROM gerador_leads_queue
     WHERE batch_id = $1
     GROUP BY status_envio`,
    [batchId]
  );

  const status = {
    pendente: 0,
    enviando: 0,
    enviado: 0,
    falha: 0,
    reenvio_agendado: 0,
    bloqueado_30_dias: 0,
    bloqueado_duplicidade: 0,
  };

  let total = 0;
  for (const row of result.rows) {
    status[row.status_envio] = row.count;
    total += row.count;
  }

  const processed = total - status.pendente - status.enviando;
  const isComplete = status.pendente === 0 && status.enviando === 0;

  return { ...status, total, processed, isComplete };
}

export async function getDashboardMetrics({ from, to, userId: filterUserId, teamId: filterTeamId }) {
  const conditions = [];
  const params = [];

  if (from) {
    params.push(from);
    conditions.push(`sent_at >= $${params.length}::timestamp`);
  }
  if (to) {
    params.push(to);
    conditions.push(`sent_at <= $${params.length}::timestamp`);
  }
  if (filterUserId) {
    params.push(filterUserId);
    conditions.push(`user_id = $${params.length}`);
  }
  if (filterTeamId) {
    params.push(filterTeamId);
    conditions.push(`team_id = $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const totalsResult = await query(
    `SELECT
       COUNT(*)::int as total,
       COUNT(*) FILTER (WHERE success = true)::int as enviados,
       COUNT(*) FILTER (WHERE success = false AND status_envio = 'falha')::int as falhas,
       COUNT(*) FILTER (WHERE status_envio = 'bloqueado_30_dias')::int as bloqueados_30d,
       COUNT(*) FILTER (WHERE status_envio = 'bloqueado_duplicidade')::int as bloqueados_dup,
       COUNT(*) FILTER (WHERE success = true)::float / NULLIF(COUNT(*) FILTER (WHERE status_envio NOT IN ('bloqueado_30_dias', 'bloqueado_duplicidade')), 0) * 100 as taxa_sucesso
     FROM gerador_leads_whatsapp_logs ${where}`,
    params
  );

  const byHourResult = await query(
    `SELECT
       EXTRACT(HOUR FROM sent_at)::int as hora,
       COUNT(*)::int as total,
       COUNT(*) FILTER (WHERE success = true)::int as enviados,
       COUNT(*) FILTER (WHERE success = false AND status_envio = 'falha')::int as falhas
     FROM gerador_leads_whatsapp_logs ${where}
     GROUP BY EXTRACT(HOUR FROM sent_at)
     ORDER BY hora`,
    params
  );

  const byUserResult = await query(
    `SELECT
       user_email,
       COUNT(*)::int as total,
       COUNT(*) FILTER (WHERE success = true)::int as enviados,
       COUNT(*) FILTER (WHERE success = false AND status_envio = 'falha')::int as falhas
     FROM gerador_leads_whatsapp_logs ${where}
     GROUP BY user_email
     ORDER BY total DESC`,
    params
  );

  const byTeamResult = await query(
    `SELECT
       glwl.team_id,
       t.name as team_name,
       COUNT(*)::int as total,
       COUNT(*) FILTER (WHERE glwl.success = true)::int as enviados,
       COUNT(*) FILTER (WHERE glwl.success = false AND glwl.status_envio = 'falha')::int as falhas
     FROM gerador_leads_whatsapp_logs glwl
     LEFT JOIN teams t ON glwl.team_id = t.id
     ${where ? where.replace(/sent_at/g, 'glwl.sent_at').replace(/user_id/g, 'glwl.user_id').replace(/team_id/g, 'glwl.team_id') : ''}
     GROUP BY glwl.team_id, t.name
     ORDER BY total DESC`,
    params
  );

  return {
    totals: totalsResult.rows[0] || { total: 0, enviados: 0, falhas: 0, bloqueados_30d: 0, bloqueados_dup: 0, taxa_sucesso: 0 },
    byHour: byHourResult.rows,
    byUser: byUserResult.rows,
    byTeam: byTeamResult.rows,
  };
}

export async function getLogsWithPagination({ page = 1, limit = 50, status, from, to, userId: filterUserId, batchId }) {
  const conditions = [];
  const params = [];

  if (batchId) {
    params.push(batchId);
    conditions.push(`batch_id = $${params.length}`);
  }
  if (status && status !== 'all') {
    params.push(status);
    conditions.push(`status_envio = $${params.length}`);
  }
  if (from) {
    params.push(from);
    conditions.push(`sent_at >= $${params.length}::timestamp`);
  }
  if (to) {
    params.push(to);
    conditions.push(`sent_at <= $${params.length}::timestamp`);
  }
  if (filterUserId) {
    params.push(filterUserId);
    conditions.push(`user_id = $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await query(
    `SELECT COUNT(*)::int as total FROM gerador_leads_whatsapp_logs ${where}`,
    params
  );

  const offset = (page - 1) * limit;
  const dataParams = [...params, limit, offset];
  const dataResult = await query(
    `SELECT * FROM gerador_leads_whatsapp_logs ${where}
     ORDER BY sent_at DESC
     LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
    dataParams
  );

  return {
    data: dataResult.rows,
    total: countResult.rows[0]?.total || 0,
    page,
    limit,
    totalPages: Math.ceil((countResult.rows[0]?.total || 0) / limit),
  };
}
