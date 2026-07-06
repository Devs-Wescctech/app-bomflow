import { query } from '../config/database.js';
import { normalizeBrazilPhone } from '../utils/phone.js';

// Traduz o `statusMessage` numérico do WHU para um rótulo de entrega estável, persistido
// em whatsapp_messages.status e exibido na thread. O WHU usa: 3=lido, 2=entregue,
// 1=enviado (aceito pelo servidor, ainda não entregue) e <=0 (ex.: -1)=falha definitiva.
// A falha (-1) costuma chegar de forma ASSÍNCRONA, depois do envio — por isso o status
// é reavaliado a cada sincronização. Retorna null quando não há sinal confiável.
export function mapDeliveryStatus(statusMessage) {
  const s = Number(statusMessage);
  if (!Number.isFinite(s)) return null;
  if (s >= 3) return 'read';
  if (s === 2) return 'delivered';
  if (s === 1) return 'sent';
  if (s <= 0) return 'failed';
  return null;
}

// Últimos 8 dígitos: reconcilia o número recebido do WHU (sem o 9 extra) com o número
// que enviamos (com o 9). Como o assinante de 8 dígitos é o mesmo com ou sem o 9,
// essa chave é estável entre as duas variantes (normalizamos antes por segurança).
export function phoneKeyOf(phone) {
  const digits = normalizeBrazilPhone(phone) || String(phone || '').replace(/\D/g, '');
  return digits.slice(-8);
}

// Formato canônico único (só dígitos, com 55 e o nono dígito dos celulares),
// usado como wa_number persistido da conversa.
export function normalizeNumber(phone) {
  return normalizeBrazilPhone(phone);
}

// Cria/atualiza a conversa por phone_key. Só sobrescreve campos quando um novo valor é
// fornecido (COALESCE), para não apagar dados já conhecidos (nome, contato, vendedor).
export async function upsertConversation({
  phone,
  waNumber,
  contactId = null,
  chatId = null,
  name = null,
  avatarUrl = null,
  vendedorId = null,
  vendedorNome = null,
}) {
  const key = phoneKeyOf(phone || waNumber);
  if (!key) throw new Error('phone_key vazio: número inválido');
  const number = normalizeNumber(waNumber || phone);

  const result = await query(
    `INSERT INTO whatsapp_conversations
       (phone_key, wa_number, contact_id, chat_id, name, avatar_url, vendedor_id, vendedor_nome)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (phone_key) DO UPDATE SET
       wa_number = COALESCE(EXCLUDED.wa_number, whatsapp_conversations.wa_number),
       contact_id = COALESCE(EXCLUDED.contact_id, whatsapp_conversations.contact_id),
       chat_id = COALESCE(EXCLUDED.chat_id, whatsapp_conversations.chat_id),
       name = COALESCE(EXCLUDED.name, whatsapp_conversations.name),
       avatar_url = COALESCE(EXCLUDED.avatar_url, whatsapp_conversations.avatar_url),
       vendedor_id = COALESCE(EXCLUDED.vendedor_id, whatsapp_conversations.vendedor_id),
       vendedor_nome = COALESCE(EXCLUDED.vendedor_nome, whatsapp_conversations.vendedor_nome),
       updated_at = NOW()
     RETURNING *`,
    [key, number, contactId, chatId, name, avatarUrl, vendedorId, vendedorNome]
  );
  return result.rows[0];
}

// Insere uma mensagem e atualiza o resumo da conversa (último texto/hora/direção e não-lidas).
// direction: 'in' (do cliente) | 'out' (nosso). Dedup por wa_message_id quando presente.
export async function recordMessage({
  conversationId,
  waMessageId = null,
  direction,
  text = null,
  messageType = 'text',
  status = null,
  senderName = null,
  sentAt = null,
}) {
  if (!conversationId) throw new Error('conversationId obrigatório');
  if (direction !== 'in' && direction !== 'out') throw new Error('direction inválido');

  const when = sentAt ? new Date(sentAt) : new Date();

  const inserted = await query(
    `INSERT INTO whatsapp_messages
       (conversation_id, wa_message_id, direction, text, message_type, status, sender_name, sent_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (wa_message_id) WHERE wa_message_id IS NOT NULL DO NOTHING
     RETURNING *`,
    [conversationId, waMessageId, direction, text, messageType, status, senderName, when]
  );

  // Se a mensagem já existia (dedup por wa_message_id), não atualiza o resumo. Mas ainda
  // atualiza o STATUS de entrega quando o WHU reporta um novo estado — a falha "-1" chega
  // de forma assíncrona (depois do envio), então é numa re-sincronização que ela aparece.
  // Assim o vendedor vê "Não entregue" na thread em vez de achar que a mensagem chegou.
  if (inserted.rows.length === 0) {
    if (status && waMessageId) {
      // Atualização MONOTÔNICA: só avança sent -> delivered -> read; marca 'failed' apenas
      // quando ainda não foi entregue/lida; e 'failed' é TERMINAL (nunca é sobrescrito por
      // um estado posterior). Evita que uma sync tardia faça o status regredir na tela.
      await query(
        `UPDATE whatsapp_messages
            SET status = $2
          WHERE wa_message_id = $1
            AND status IS DISTINCT FROM $2
            AND COALESCE(status, '') <> 'failed'
            AND (
              (CASE $2 WHEN 'sent' THEN 1 WHEN 'delivered' THEN 2 WHEN 'read' THEN 3 ELSE 0 END)
                > (CASE COALESCE(status, '') WHEN 'sent' THEN 1 WHEN 'delivered' THEN 2 WHEN 'read' THEN 3 ELSE 0 END)
              OR ($2 = 'failed' AND COALESCE(status, '') NOT IN ('delivered', 'read'))
            )`,
        [waMessageId, status]
      );
    }
    return null;
  }

  const unreadDelta = direction === 'in' ? 1 : 0;
  // Atualiza o resumo (texto/hora/direção) SOMENTE quando esta mensagem é a mais recente,
  // para que eventos fora de ordem ou backfill não sobrescrevam com dados antigos.
  // O contador de não-lidas é somado independentemente (não depende da ordem temporal).
  await query(
    `UPDATE whatsapp_conversations
       SET last_message_text = CASE WHEN $3 >= COALESCE(last_message_at, '-infinity'::timestamptz)
                                    THEN $2 ELSE last_message_text END,
           last_direction = CASE WHEN $3 >= COALESCE(last_message_at, '-infinity'::timestamptz)
                                 THEN $4 ELSE last_direction END,
           last_message_at = GREATEST($3, COALESCE(last_message_at, '-infinity'::timestamptz)),
           unread_count = unread_count + $5,
           updated_at = NOW()
     WHERE id = $1`,
    [conversationId, text, when, direction, unreadDelta]
  );

  return inserted.rows[0];
}

// Registra uma mensagem de saída enviada pelo CRM (usado no envio manual e nas respostas
// da caixa de entrada). Best-effort: nunca deve derrubar o fluxo de envio.
export async function recordOutbound({
  phone,
  text = null,
  messageType = 'text',
  waMessageId = null,
  contactId = null,
  chatId = null,
  name = null,
  vendedorId = null,
  vendedorNome = null,
  status = null,
}) {
  const conv = await upsertConversation({
    phone,
    waNumber: phone,
    contactId,
    chatId,
    name,
    vendedorId,
    vendedorNome,
  });
  await recordMessage({
    conversationId: conv.id,
    waMessageId,
    direction: 'out',
    text,
    messageType,
    status,
    senderName: vendedorNome || 'Você',
  });
  return conv;
}

// Espelha na Caixa de Entrada um envio de saída feito por automação/API (primeiro
// contato), definindo o VENDEDOR como dono da conversa. Assim a conversa deixa de
// aparecer como "automático" e cai na caixa do vendedor responsável pelo lead.
// Extrai os ids do resultado retornado pela WHU (nomes de campo variam entre
// createChat/sendTemplate). Best-effort: NUNCA lança — não pode derrubar o envio.
export async function mirrorOutboundSend({
  phone,
  sendResult = {},
  vendedorId = null,
  vendedorNome = null,
  text = '[template]',
}) {
  if (!phone) return null;
  try {
    return await recordOutbound({
      phone,
      text,
      waMessageId:
        sendResult.messageSentId || sendResult.message_sent_id || sendResult.id || null,
      contactId:
        sendResult.contactId || sendResult.contact?.id || sendResult.contact?._id || null,
      chatId:
        sendResult.chatId || sendResult.currentChatId || sendResult.chat_id || null,
      vendedorId: vendedorId || null,
      vendedorNome: vendedorNome || null,
    });
  } catch (err) {
    console.error('[WhatsAppInbox] Falha ao espelhar envio de automação (não bloqueia):', err.message);
    return null;
  }
}

// Tenta extrair os campos relevantes de um payload de webhook do WHU/Rudo. O formato exato
// é desconhecido, então procura em vários caminhos prováveis. Retorna null se não achar um
// número (evento não relacionado a mensagem) — o payload cru fica salvo para inspeção.
export function parseWebhookEvent(payload) {
  if (!payload || typeof payload !== 'object') return null;

  const p = payload.data && typeof payload.data === 'object' ? payload.data : payload;
  const contact = p.contact || p.chat?.contact || {};
  const msg = p.message || p.lastMessage || p.msg || (p.text ? p : {}) || {};

  const number =
    contact.number ||
    p.number ||
    p.from ||
    p.phone ||
    p.secondaryDescription ||
    p.chat?.secondaryDescription ||
    null;

  if (!number) return null;

  const text =
    (typeof msg.text === 'string' ? msg.text : null) ||
    (typeof p.text === 'string' ? p.text : null) ||
    (typeof p.body === 'string' ? p.body : null) ||
    null;

  const sentByMe =
    msg.isSentByMe === true ||
    msg.fromMe === true ||
    p.isSentByMe === true ||
    p.fromMe === true ||
    (msg.sender && msg.sender.isMe === true);

  const waMessageId =
    msg.IdMessage || msg.id || msg.messageId || p.IdMessage || p.messageId || null;

  const chatId =
    p.attendanceId || p.chatId || p.chat?.id || p.chat?.attendanceId || null;

  const contactId = contact.id || contact._id || p.contactId || null;

  const name =
    contact.name ||
    contact.secondaryName ||
    p.name ||
    p.senderName ||
    msg.senderName ||
    null;

  const avatarUrl = contact.linkImage || p.linkImage || null;

  let sentAt = null;
  const rawDate =
    msg.dhMessage || msg.utcDhMessage || p.dhMessage || p.date || p.timestamp || null;
  if (rawDate) {
    const d = new Date(rawDate);
    if (!isNaN(d.getTime())) sentAt = d;
    else if (typeof rawDate === 'number') sentAt = new Date(rawDate * (rawDate < 1e12 ? 1000 : 1));
  }

  // Ignora mensagens de sistema/eventos internos (ex.: "Chat finalizado por: BOT").
  const isSystem = msg.isSystemMessage === true || p.isSystemMessage === true;

  return {
    number,
    text,
    direction: sentByMe ? 'out' : 'in',
    waMessageId: waMessageId ? String(waMessageId) : null,
    chatId: chatId ? String(chatId) : null,
    contactId: contactId ? String(contactId) : null,
    name: name || null,
    avatarUrl,
    sentAt,
    isSystem,
  };
}

// Processa um evento de webhook: salva o payload cru e, se der para interpretar, grava a
// mensagem na conversa. Retorna um resumo do que aconteceu (para log/depuração).
export async function ingestWebhookEvent(payload) {
  let rawId = null;
  try {
    const raw = await query(
      `INSERT INTO whatsapp_webhook_events (payload) VALUES ($1) RETURNING id`,
      [payload ? JSON.stringify(payload) : null]
    );
    rawId = raw.rows[0]?.id || null;
  } catch (e) {
    console.error('[WhatsAppInbox] Falha ao salvar payload cru do webhook:', e.message);
  }

  const parsed = parseWebhookEvent(payload);
  if (!parsed || parsed.isSystem || !parsed.text) {
    return { stored: !!rawId, parsed: false };
  }

  try {
    const conv = await upsertConversation({
      phone: parsed.number,
      waNumber: parsed.number,
      contactId: parsed.contactId,
      chatId: parsed.chatId,
      name: parsed.name,
      avatarUrl: parsed.avatarUrl,
    });
    await recordMessage({
      conversationId: conv.id,
      waMessageId: parsed.waMessageId,
      direction: parsed.direction,
      text: parsed.text,
      senderName: parsed.direction === 'in' ? parsed.name : 'Você',
      sentAt: parsed.sentAt,
    });
    if (rawId) {
      await query(`UPDATE whatsapp_webhook_events SET parsed = TRUE WHERE id = $1`, [rawId]).catch(() => {});
    }
    return { stored: !!rawId, parsed: true, conversationId: conv.id, direction: parsed.direction };
  } catch (e) {
    console.error('[WhatsAppInbox] Falha ao processar evento de webhook:', e.message);
    return { stored: !!rawId, parsed: false, error: e.message };
  }
}
