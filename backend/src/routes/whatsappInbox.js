import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { loadAgentMiddleware } from '../middleware/permissions.js';
import { query } from '../config/database.js';
import { sendChatMessage, getChatWithMessages } from '../services/whatsappService.js';
import {
  ingestWebhookEvent,
  upsertConversation,
  recordMessage,
  recordOutbound,
} from '../services/whatsappInboxService.js';

const router = Router();

// Descobre se o usuário autenticado enxerga TODAS as conversas (admin/supervisor) ou apenas
// as suas. Regra específica desta feature: supervisores acompanham a operação inteira.
function resolveViewer(req) {
  const agentType = req.agent?.agentType || null;
  const isAdmin = agentType === 'admin' || req.user?.role === 'admin';
  const isSupervisor =
    agentType === 'supervisor' ||
    agentType === 'sales_supervisor' ||
    (typeof agentType === 'string' && agentType.endsWith('_supervisor'));
  return {
    agentId: req.agent?.id || null,
    canSeeAll: isAdmin || isSupervisor,
  };
}

// ---------------------------------------------------------------------------
// Webhook PÚBLICO (sem auth): o WHU/Rudo posta os eventos de mensagens recebidas aqui.
// Responde sempre 200 rápido para não gerar reentrega; o processamento é best-effort.
// ---------------------------------------------------------------------------
router.post('/webhook', async (req, res) => {
  // Verificação opcional de segredo compartilhado. Se WHATSAPP_WEBHOOK_SECRET estiver
  // configurado, exige-o via header x-webhook-secret ou query ?secret= (o WHU/Rudo pode
  // ser configurado para enviá-lo). Sem o env, o endpoint permanece aberto (compat).
  const expectedSecret = process.env.WHATSAPP_WEBHOOK_SECRET;
  if (expectedSecret) {
    const provided = req.get('x-webhook-secret') || req.query.secret || '';
    if (provided !== expectedSecret) {
      return res.status(200).json({ ok: true });
    }
  }
  try {
    await ingestWebhookEvent(req.body);
  } catch (error) {
    console.error('[WhatsAppInbox] Erro no webhook:', error.message);
  }
  // Resposta genérica: nunca vaza detalhes internos para chamadores não autenticados,
  // e nunca sinaliza reentrega ao provedor.
  return res.status(200).json({ ok: true });
});

// ---------------------------------------------------------------------------
// Rotas autenticadas
// ---------------------------------------------------------------------------
router.use(authMiddleware, loadAgentMiddleware);

// Lista de conversas (ordenadas pela última mensagem). Suporta ?search= e ?limit=.
router.get('/conversations', async (req, res) => {
  try {
    const { canSeeAll, agentId } = resolveViewer(req);
    const search = (req.query.search || '').trim();
    const limit = Math.min(parseInt(req.query.limit, 10) || 200, 500);

    const params = [];
    const where = [];

    if (!canSeeAll) {
      params.push(agentId);
      where.push(`vendedor_id = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      where.push(`(name ILIKE $${params.length} OR wa_number ILIKE $${params.length})`);
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(limit);

    const result = await query(
      `SELECT id, phone_key, wa_number, contact_id, chat_id, name, avatar_url,
              vendedor_id, vendedor_nome, last_message_text, last_message_at,
              last_direction, unread_count, status, created_at, updated_at
         FROM whatsapp_conversations
         ${whereClause}
         ORDER BY last_message_at DESC NULLS LAST, updated_at DESC
         LIMIT $${params.length}`,
      params
    );

    res.json(result.rows);
  } catch (error) {
    console.error('[WhatsAppInbox] Erro ao listar conversas:', error.message);
    res.status(500).json({ message: error.message });
  }
});

async function loadConversationForViewer(req, res) {
  const { canSeeAll, agentId } = resolveViewer(req);
  const result = await query('SELECT * FROM whatsapp_conversations WHERE id = $1', [req.params.id]);
  if (result.rows.length === 0) {
    res.status(404).json({ message: 'Conversa não encontrada' });
    return null;
  }
  const conv = result.rows[0];
  // Não-supervisores só acessam conversas explicitamente atribuídas a si.
  // Exige agentId não-nulo E dono correspondente (evita brecha null === null).
  if (!canSeeAll && (!agentId || conv.vendedor_id !== agentId)) {
    res.status(403).json({ message: 'Sem permissão para acessar esta conversa' });
    return null;
  }
  return conv;
}

// Mensagens de uma conversa. Se ?backfill=1 e houver chat_id, complementa (uma vez) com o
// histórico do WHU antes de retornar — útil para preencher conversas antigas.
router.get('/conversations/:id/messages', async (req, res) => {
  try {
    const conv = await loadConversationForViewer(req, res);
    if (!conv) return;

    if (req.query.backfill === '1' && conv.chat_id) {
      await backfillFromWhu(conv).catch((e) =>
        console.error('[WhatsAppInbox] Backfill falhou:', e.message)
      );
    }

    const messages = await query(
      `SELECT id, wa_message_id, direction, text, message_type, status, sender_name, sent_at
         FROM whatsapp_messages
         WHERE conversation_id = $1
         ORDER BY sent_at ASC, created_at ASC`,
      [conv.id]
    );

    res.json({ conversation: conv, messages: messages.rows });
  } catch (error) {
    console.error('[WhatsAppInbox] Erro ao buscar mensagens:', error.message);
    res.status(500).json({ message: error.message });
  }
});

// Marca a conversa como lida (zera não-lidas).
router.post('/conversations/:id/read', async (req, res) => {
  try {
    const conv = await loadConversationForViewer(req, res);
    if (!conv) return;
    await query(
      `UPDATE whatsapp_conversations SET unread_count = 0, updated_at = NOW() WHERE id = $1`,
      [conv.id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('[WhatsAppInbox] Erro ao marcar como lida:', error.message);
    res.status(500).json({ message: error.message });
  }
});

// Envia uma resposta (texto livre; ou template quando a janela de 24h estiver fechada) e
// registra a mensagem de saída na thread. O vendedor é derivado do usuário autenticado.
router.post('/conversations/:id/reply', async (req, res) => {
  try {
    const conv = await loadConversationForViewer(req, res);
    if (!conv) return;

    const { message, templateId, templateComponents } = req.body || {};
    const hasText = typeof message === 'string' && message.trim().length > 0;
    if (!templateId && !hasText) {
      return res.status(400).json({ message: 'Informe uma mensagem de texto ou selecione um template' });
    }

    // Preserva o dono original da conversa. Só define o vendedor quando a conversa ainda não
    // tem dono — evita que admin/supervisor "roube" a conversa ao responder (a listagem filtra
    // por vendedor_id, então trocar o dono removeria a conversa do vendedor original).
    const vendedorId = conv.vendedor_id || req.agent?.id || null;
    const vendedorNome =
      conv.vendedor_nome || req.agent?.name || req.user?.full_name || req.user?.name || null;

    const sendResult = await sendChatMessage({
      number: conv.wa_number,
      message: hasText ? message : undefined,
      templateId: templateId || undefined,
      templateComponents,
    });

    const waMessageId =
      sendResult.messageSentId || sendResult.message_sent_id || sendResult.id || null;

    await recordOutbound({
      phone: conv.wa_number,
      text: hasText ? message : '[template]',
      waMessageId: waMessageId ? String(waMessageId) : null,
      chatId: sendResult.chatId || sendResult.currentChatId || conv.chat_id || null,
      vendedorId,
      vendedorNome,
    }).catch((e) => console.error('[WhatsAppInbox] Falha ao registrar saída:', e.message));

    res.json({ success: true, usedFallback: sendResult.usedFallback || false });
  } catch (error) {
    console.error('[WhatsAppInbox] Erro ao responder:', error.message);
    let userMessage = error.message;
    if (error.message?.includes('already open')) {
      userMessage = 'Já existe uma conversa aberta com este número. Tente novamente em instantes.';
    }
    res.status(500).json({ message: userMessage });
  }
});

// Complementa a conversa com o histórico do WHU (mensagens que não passaram pelo webhook).
// Dedup por wa_message_id garante que não haja duplicação.
async function backfillFromWhu(conv) {
  const chat = await getChatWithMessages(conv.chat_id);
  const messages = chat?.messages;
  if (!Array.isArray(messages) || messages.length === 0) return;

  // Atualiza contato/nome/avatar se o WHU trouxer dados melhores.
  await upsertConversation({
    phone: conv.wa_number,
    waNumber: chat?.contact?.number || conv.wa_number,
    contactId: chat?.contact?.id || conv.contact_id,
    chatId: conv.chat_id,
    name: chat?.contact?.name || conv.name,
  }).catch(() => {});

  for (const m of messages) {
    if (m.isSystemMessage === true) continue;
    const text = typeof m.text === 'string' ? m.text : null;
    if (!text) continue;
    const waMessageId = m.IdMessage || m.id || null;
    let sentAt = null;
    if (m.dhMessage) {
      const d = new Date(m.dhMessage);
      if (!isNaN(d.getTime())) sentAt = d;
    }
    if (!sentAt && m.unixTimeMessage) {
      sentAt = new Date(Number(m.unixTimeMessage) * 1000);
    }
    await recordMessage({
      conversationId: conv.id,
      waMessageId: waMessageId ? String(waMessageId) : null,
      direction: m.isSentByMe ? 'out' : 'in',
      text,
      senderName: m.senderName || (m.isSentByMe ? 'Você' : conv.name),
      sentAt,
    }).catch(() => {});
  }
}

export default router;
