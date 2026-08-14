// Sincroniza o status de entrega/leitura (segundo nível) das mensagens WhatsApp
// registradas em automation_logs, consultando a WHU por mensagem
// (GET /chats/messages/{id}) via getMessageDeliveryInfo.
//
// Regra monotônica: o status só avança (sent → delivered → read); 'failed' só
// entra se ainda não entregue/lido. 'read', 'failed' e 'unverifiable' são
// terminais e nunca reconsultados.

import { query } from '../config/database.js';
import { getMessageDeliveryInfo } from './whatsappService.js';

const TERMINAL_STATUSES = ['read', 'failed', 'unverifiable'];
const RECENT_WINDOW_DAYS = 7;
const RECHECK_THROTTLE_MINUTES = 2;
const CONCURRENCY = 4;

const STATUS_RANK = { sent: 1, delivered: 2, read: 3 };

// Apesar do nome "utcDh*", a WHU devolve esses timestamps SEM fuso e no horário
// de Brasília (verificado em teste real: entrega marcada 3h "antes" do envio).
// Interpretamos como -03:00 quando não há marcador de fuso.
export function parseWhuTimestamp(value) {
  if (!value) return null;
  const s = String(value).trim();
  if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(`${s}-03:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Mapeia o status numérico da WHU para o nosso delivery_status.
// 0 aguardando → 'sent' (já foi aceita); 1 enviada → 'sent'; 2 entregue → 'delivered';
// 3 visualizada / 5 reproduzida → 'read'; -1 erro → 'failed'; 4 excluída → mantém.
export function mapWhuStatus(status) {
  if (status === 2) return 'delivered';
  if (status === 3 || status === 5) return 'read';
  if (status === -1) return 'failed';
  if (status === 0 || status === 1) return 'sent';
  return null;
}

// Decide o próximo delivery_status respeitando a regra monotônica.
// Retorna null quando não há avanço a aplicar.
export function nextDeliveryStatus(current, incoming) {
  if (!incoming) return null;
  if (current && TERMINAL_STATUSES.includes(current)) return null;
  if (incoming === 'failed') {
    // Erro só vale se ainda não entregue/lido.
    if (current === 'delivered' || current === 'read') return null;
    return 'failed';
  }
  const curRank = STATUS_RANK[current] || 0;
  const newRank = STATUS_RANK[incoming] || 0;
  return newRank > curRank ? incoming : null;
}

async function syncOneLog(log) {
  const messageId = log.message_sent_id;
  const info = await getMessageDeliveryInfo(messageId, { channelToken: log.channel_token || null });

  if (!info.ok) {
    if (info.notFound) {
      await query(
        `UPDATE automation_logs
         SET delivery_status = 'unverifiable', delivery_checked_at = NOW()
         WHERE id = $1`,
        [log.id]
      );
    }
    // API indisponível: não grava nada além do throttle, tenta de novo depois.
    if (info.unavailable) {
      await query(
        `UPDATE automation_logs SET delivery_checked_at = NOW() WHERE id = $1`,
        [log.id]
      );
    }
    return;
  }

  const incoming = mapWhuStatus(info.status);
  const next = nextDeliveryStatus(log.delivery_status, incoming);

  if (!next) {
    await query(
      `UPDATE automation_logs SET delivery_checked_at = NOW() WHERE id = $1`,
      [log.id]
    );
    return;
  }

  await query(
    `UPDATE automation_logs SET
       delivery_status = $2::varchar,
       delivered_at = COALESCE(delivered_at, $3::timestamptz),
       read_at = COALESCE(read_at, $4::timestamptz),
       delivery_error_at = CASE WHEN $2::varchar = 'failed' THEN COALESCE(delivery_error_at, $5::timestamptz, NOW()) ELSE delivery_error_at END,
       delivery_error_message = CASE WHEN $2::varchar = 'failed' THEN COALESCE($6::text, delivery_error_message) ELSE delivery_error_message END,
       delivery_checked_at = NOW()
     WHERE id = $1`,
    [
      log.id,
      next,
      parseWhuTimestamp(info.deliveredAt),
      parseWhuTimestamp(info.readAt),
      parseWhuTimestamp(info.erroredAt),
      info.errorMessage || null,
    ]
  );
}

let syncInFlight = false;

// Seleciona logs elegíveis e sincroniza com a WHU, com limite de concorrência.
// Elegível: envio bem-sucedido, com messageSentId no action_result.api_response,
// status não-terminal, dentro da janela recente e fora do throttle de recheck.
export async function syncDeliveryStatuses({ automationType = null, limit = 40 } = {}) {
  if (!process.env.RUDO_WHATSAPP_TOKEN) return { synced: 0, skipped: 'no-token' };
  if (syncInFlight) return { synced: 0, skipped: 'in-flight' };
  syncInFlight = true;
  try {
    const params = [limit];
    let typeFilter = '';
    if (automationType) {
      params.push(automationType);
      typeFilter = `AND automation_type = $${params.length}`;
    }

    const result = await query(
      `SELECT id, delivery_status,
              COALESCE(
                action_result->'api_response'->>'messageSentId',
                action_result->'api_response'->>'message_sent_id'
              ) AS message_sent_id,
              -- Automations de canal enviam com token próprio; a consulta de status
              -- precisa usar o MESMO token, senão a WHU responde 400 (mensagem "inexistente").
              CASE
                WHEN automation_type = 'upsell_channel' THEN
                  (SELECT channel_token FROM upsell_channel_automations u WHERE u.id = automation_logs.automation_id)
                WHEN automation_type = 'referral_channel' THEN
                  (SELECT channel_token FROM referral_channel_automations r WHERE r.id = automation_logs.automation_id)
                ELSE NULL
              END AS channel_token
       FROM automation_logs
       WHERE success = TRUE
         AND action_type = 'send_whatsapp'
         AND COALESCE(
               action_result->'api_response'->>'messageSentId',
               action_result->'api_response'->>'message_sent_id'
             ) IS NOT NULL
         AND (delivery_status IS NULL OR delivery_status NOT IN ('read', 'failed', 'unverifiable'))
         AND executed_at > NOW() - INTERVAL '${RECENT_WINDOW_DAYS} days'
         AND (delivery_checked_at IS NULL OR delivery_checked_at < NOW() - INTERVAL '${RECHECK_THROTTLE_MINUTES} minutes')
         ${typeFilter}
       ORDER BY executed_at DESC
       LIMIT $1`,
      params
    );

    const logs = result.rows;
    let synced = 0;
    for (let i = 0; i < logs.length; i += CONCURRENCY) {
      const batch = logs.slice(i, i + CONCURRENCY);
      await Promise.all(
        batch.map((log) =>
          syncOneLog(log)
            .then(() => { synced++; })
            .catch((err) => console.error(`[DeliverySync] Erro no log ${log.id}:`, err.message))
        )
      );
    }
    return { synced, eligible: logs.length };
  } finally {
    syncInFlight = false;
  }
}
