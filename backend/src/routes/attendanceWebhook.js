import { Router } from 'express';
import { query } from '../config/database.js';
import { normalizeBrazilPhone } from '../utils/phone.js';
import { emitAttendanceEvent } from '../services/attendanceEvents.js';

// Webhook de entrada do Atendimento (Chat v2). Um endpoint POR CONEXÃO
// (/api/webhooks/attendance/whatsapp/:connectionId) — assim cada canal WHU identifica a
// própria conexão e o segredo é validado por registro (channel_connections.webhook_secret).
// Responde sempre 200 rápido; o processamento é best-effort e deduplicado por
// external_message_id.

const router = Router();

// Últimos 8 dígitos — reconcilia números com/sem o nono dígito (mesmo assinante).
function phoneKeyOf(phone) {
  const digits = normalizeBrazilPhone(phone) || String(phone || '').replace(/\D/g, '');
  return digits.slice(-8);
}

// Extrai os campos relevantes do payload do WHU/Rudo (formato varia entre eventos).
export function parseWebhookEvent(payload) {
  if (!payload || typeof payload !== 'object') return null;

  const p = payload.data && typeof payload.data === 'object' ? payload.data : payload;
  const contact = p.contact || p.chat?.contact || {};
  const msg = p.message || p.lastMessage || p.msg || (p.text ? p : {}) || {};

  const number =
    contact.number || p.number || p.from || p.phone || p.secondaryDescription ||
    p.chat?.secondaryDescription || null;
  if (!number) return null;

  const text =
    (typeof msg.text === 'string' ? msg.text : null) ||
    (typeof p.text === 'string' ? p.text : null) ||
    (typeof p.body === 'string' ? p.body : null) ||
    null;

  const sentByMe =
    msg.isSentByMe === true || msg.fromMe === true || p.isSentByMe === true ||
    p.fromMe === true || (msg.sender && msg.sender.isMe === true);

  const externalMessageId =
    msg.IdMessage || msg.id || msg.messageId || p.IdMessage || p.messageId || null;

  const name =
    contact.name || contact.secondaryName || p.name || p.senderName || msg.senderName || null;

  let sentAt = null;
  if (msg.unixTimeMessage || p.unixTimeMessage) {
    const d = new Date(Number(msg.unixTimeMessage || p.unixTimeMessage) * 1000);
    if (!isNaN(d.getTime())) sentAt = d;
  }
  if (!sentAt) {
    const rawDate = msg.dhMessage || p.dhMessage || p.date || p.timestamp || null;
    if (rawDate) {
      // dhMessage vem em horário de Brasília sem timezone — tratamos como -03:00.
      const d =
        typeof rawDate === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(rawDate) && !/[Z+-]\d{0,2}:?\d{0,2}$/.test(rawDate)
          ? new Date(`${rawDate}-03:00`)
          : new Date(typeof rawDate === 'number' ? rawDate * (rawDate < 1e12 ? 1000 : 1) : rawDate);
      if (!isNaN(d.getTime())) sentAt = d;
    }
  }

  const isSystem = msg.isSystemMessage === true || p.isSystemMessage === true;

  return {
    number,
    text,
    direction: sentByMe ? 'out' : 'in',
    externalMessageId: externalMessageId ? String(externalMessageId) : null,
    name: name || null,
    sentAt,
    isSystem,
  };
}

router.post('/whatsapp/:connectionId', async (req, res) => {
  // Resposta genérica sempre 200: não vaza detalhes internos nem sinaliza reentrega.
  const respond = () => res.status(200).json({ ok: true });

  try {
    const connResult = await query(
      `SELECT id, status, webhook_secret FROM channel_connections WHERE id = $1`,
      [req.params.connectionId]
    ).catch(() => ({ rows: [] }));
    const connection = connResult.rows[0];
    if (!connection || connection.status !== 'active') return respond();

    // Segredo por conexão via header (ou query, para provedores sem headers custom).
    const provided = req.get('x-webhook-secret') || req.query.secret || '';
    if (!connection.webhook_secret || provided !== connection.webhook_secret) {
      return respond();
    }

    const parsed = parseWebhookEvent(req.body);
    if (!parsed || parsed.isSystem || !parsed.text) return respond();

    const key = phoneKeyOf(parsed.number);
    if (!key) return respond();
    const waNumber = normalizeBrazilPhone(parsed.number) || String(parsed.number).replace(/\D/g, '');

    // Dedup por external_message_id: se já processado, não repete.
    if (parsed.externalMessageId) {
      const dup = await query(
        `SELECT id FROM att_messages WHERE external_message_id = $1 LIMIT 1`,
        [parsed.externalMessageId]
      );
      if (dup.rows.length > 0) return respond();
    }

    // Cria/atualiza a conversa desta conexão para este telefone.
    const convResult = await query(
      `INSERT INTO att_conversations (connection_id, phone, phone_key, contact_name, status)
       VALUES ($1, $2, $3, $4, 'pendente')
       ON CONFLICT (connection_id, phone_key) DO UPDATE SET
         phone = EXCLUDED.phone,
         contact_name = COALESCE(EXCLUDED.contact_name, att_conversations.contact_name),
         status = CASE WHEN att_conversations.status = 'fechada' THEN 'pendente'
                       ELSE att_conversations.status END,
         updated_at = NOW()
       RETURNING *`,
      [connection.id, waNumber, key, parsed.name]
    );
    const conversation = convResult.rows[0];

    const when = parsed.sentAt || new Date();
    const msgResult = await query(
      `INSERT INTO att_messages
         (conversation_id, direction, content, type, external_message_id, status, sent_at)
       VALUES ($1, $2, $3, 'text', $4, $5, $6)
       ON CONFLICT (external_message_id) WHERE external_message_id IS NOT NULL DO NOTHING
       RETURNING *`,
      [
        conversation.id,
        parsed.direction,
        parsed.text,
        parsed.externalMessageId,
        parsed.direction === 'out' ? 'sent' : null,
        when,
      ]
    );
    if (msgResult.rows.length === 0) return respond();
    const message = msgResult.rows[0];

    const unreadDelta = parsed.direction === 'in' ? 1 : 0;
    await query(
      `UPDATE att_conversations
          SET last_message_at = GREATEST($2, COALESCE(last_message_at, '-infinity'::timestamptz)),
              unread_count = unread_count + $3,
              updated_at = NOW()
        WHERE id = $1`,
      [conversation.id, when, unreadDelta]
    );

    emitAttendanceEvent(
      'message',
      {
        conversationId: conversation.id,
        connectionId: connection.id,
        message: {
          id: message.id,
          direction: message.direction,
          content: message.content,
          type: message.type,
          status: message.status,
          sentAt: message.sent_at,
        },
        conversation: {
          id: conversation.id,
          phone: conversation.phone,
          contactName: conversation.contact_name,
          assignedUserId: conversation.assigned_user_id,
          status: conversation.status,
        },
      },
      { assignedUserIds: [conversation.assigned_user_id ?? null] }
    );

    return respond();
  } catch (error) {
    console.error('[AttendanceWebhook] Erro ao processar evento:', error.message);
    return respond();
  }
});

export default router;
