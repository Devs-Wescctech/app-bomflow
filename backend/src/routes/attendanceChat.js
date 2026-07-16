import { Router } from 'express';
import { authMiddleware, verifyToken } from '../middleware/auth.js';
import { loadAgentMiddleware } from '../middleware/permissions.js';
import { resolveAttendancePermissions } from '../config/permissions.js';
import { query } from '../config/database.js';
import { decrypt } from '../utils/encryption.js';
import { sendText } from '../services/attendanceWhuClient.js';
import { subscribe, emitAttendanceEvent } from '../services/attendanceEvents.js';

// Chat do Atendimento (Chat v2): lista/thread de conversas, envio, atribuição e stream SSE.
// Permissões: attendanceReply (responder as próprias conversas atribuídas) e
// attendanceReplyAny (responder/atribuir qualquer conversa — supervisores e admin).

const router = Router();

function attendancePerms(req) {
  return resolveAttendancePermissions(req.agent?.agentType, req.user?.role);
}

// ---------------------------------------------------------------------------
// Stream SSE — EventSource não envia headers, então o token JWT vem por query.
// Mesmo gate RBAC das rotas REST: resolve o agente e o escopo (replyAny vê tudo;
// os demais só recebem eventos das próprias conversas/fila não atribuída).
// ---------------------------------------------------------------------------
router.get('/stream', async (req, res) => {
  const bearer = (req.headers.authorization || '').split(' ')[1];
  const token = bearer || req.query.token || '';
  const decoded = token ? verifyToken(token) : null;
  if (!decoded) {
    return res.status(401).json({ message: 'Authentication required' });
  }
  try {
    const agentResult = await query(
      'SELECT id, agent_type FROM agents WHERE (email = $1 OR user_email = $1) AND active = true',
      [decoded.email]
    );
    const agent = agentResult.rows[0] || null;
    if (!agent && decoded.role !== 'admin') {
      return res.status(403).json({ message: 'Sem permissão para o módulo de atendimento' });
    }
    const perms = resolveAttendancePermissions(agent?.agent_type || 'admin', decoded.role);
    subscribe(res, { agentId: agent?.id || null, replyAny: perms.attendanceReplyAny });
  } catch (error) {
    console.error('[AttendanceChat] Erro no stream SSE:', error.message);
    res.status(500).json({ message: 'Erro ao abrir stream' });
  }
});

router.use(authMiddleware, loadAgentMiddleware);

function requireAttendanceAccess(req, res, next) {
  const perms = attendancePerms(req);
  if (!perms.attendanceReply && !perms.attendanceReplyAny) {
    return res.status(403).json({ message: 'Sem permissão para o módulo de atendimento' });
  }
  req.attendancePerms = perms;
  next();
}

router.use(requireAttendanceAccess);

// Lista de conversas. Quem tem attendanceReplyAny vê tudo; demais veem as suas
// (atribuídas a si) e as não atribuídas (pendentes na fila).
router.get('/conversations', async (req, res) => {
  try {
    const perms = req.attendancePerms;
    const search = (req.query.search || '').trim();
    const status = (req.query.status || '').trim();
    const limit = Math.min(parseInt(req.query.limit, 10) || 200, 500);

    const params = [];
    const where = [];

    if (!perms.attendanceReplyAny) {
      params.push(req.agent?.id || null);
      where.push(`(assigned_user_id = $${params.length} OR assigned_user_id IS NULL)`);
    }
    if (status) {
      params.push(status);
      where.push(`c.status = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      where.push(`(contact_name ILIKE $${params.length} OR phone ILIKE $${params.length})`);
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(limit);

    const result = await query(
      `SELECT c.*, cc.name AS connection_name,
              (SELECT content FROM att_messages m
                WHERE m.conversation_id = c.id ORDER BY m.sent_at DESC LIMIT 1) AS last_message_text
         FROM att_conversations c
         LEFT JOIN channel_connections cc ON cc.id = c.connection_id
         ${whereClause}
         ORDER BY c.last_message_at DESC NULLS LAST, c.updated_at DESC
         LIMIT $${params.length}`,
      params
    );
    res.json(result.rows);
  } catch (error) {
    console.error('[AttendanceChat] Erro ao listar conversas:', error.message);
    res.status(500).json({ message: error.message });
  }
});

async function loadConversation(req, res) {
  const result = await query('SELECT * FROM att_conversations WHERE id = $1', [req.params.id]);
  if (result.rows.length === 0) {
    res.status(404).json({ message: 'Conversa não encontrada' });
    return null;
  }
  const conv = result.rows[0];
  const perms = req.attendancePerms;
  // Sem replyAny, o operador só acessa conversas atribuídas a si (ou não atribuídas).
  if (!perms.attendanceReplyAny) {
    const mine = req.agent?.id && conv.assigned_user_id === req.agent.id;
    const unassigned = conv.assigned_user_id === null;
    if (!mine && !unassigned) {
      res.status(403).json({ message: 'Sem permissão para acessar esta conversa' });
      return null;
    }
  }
  return conv;
}

router.get('/conversations/:id/messages', async (req, res) => {
  try {
    const conv = await loadConversation(req, res);
    if (!conv) return;
    const messages = await query(
      `SELECT id, direction, content, type, user_id, external_message_id, status, sent_at, created_at
         FROM att_messages
        WHERE conversation_id = $1
        ORDER BY sent_at ASC, created_at ASC`,
      [conv.id]
    );
    res.json({ conversation: conv, messages: messages.rows });
  } catch (error) {
    console.error('[AttendanceChat] Erro ao buscar mensagens:', error.message);
    res.status(500).json({ message: error.message });
  }
});

router.post('/conversations/:id/read', async (req, res) => {
  try {
    const conv = await loadConversation(req, res);
    if (!conv) return;
    await query(
      `UPDATE att_conversations SET unread_count = 0, updated_at = NOW() WHERE id = $1`,
      [conv.id]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Envio de mensagem: verifica permissão do operador, usa o token da conexão CORRETA
// (descriptografado) e grava a saída com o user_id do operador.
router.post('/conversations/:id/send', async (req, res) => {
  try {
    const conv = await loadConversation(req, res);
    if (!conv) return;

    const perms = req.attendancePerms;
    const isOwner = req.agent?.id && conv.assigned_user_id === req.agent.id;
    if (!perms.attendanceReplyAny && !isOwner) {
      return res
        .status(403)
        .json({ message: 'Assuma a conversa antes de responder' });
    }

    const { message } = req.body || {};
    if (typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ message: 'Mensagem de texto é obrigatória' });
    }

    const connResult = await query(
      `SELECT id, token, status FROM channel_connections WHERE id = $1`,
      [conv.connection_id]
    );
    const connection = connResult.rows[0];
    if (!connection || connection.status !== 'active') {
      return res.status(400).json({ message: 'Conexão do canal indisponível' });
    }

    const token = decrypt(connection.token);
    const sendResult = await sendText(token, conv.phone, message.trim());

    const externalMessageId =
      sendResult.messageSentId || sendResult.message_sent_id || sendResult.id || null;

    const inserted = await query(
      `INSERT INTO att_messages
         (conversation_id, direction, content, type, user_id, external_message_id, status, sent_at)
       VALUES ($1, 'out', $2, 'text', $3, $4, 'sent', NOW())
       ON CONFLICT (external_message_id) WHERE external_message_id IS NOT NULL DO NOTHING
       RETURNING *`,
      [conv.id, message.trim(), req.agent?.id || null, externalMessageId ? String(externalMessageId) : null]
    );

    await query(
      `UPDATE att_conversations
          SET last_message_at = NOW(), updated_at = NOW(),
              status = CASE WHEN status = 'pendente' THEN 'aberta' ELSE status END
        WHERE id = $1`,
      [conv.id]
    );

    const msg = inserted.rows[0] || null;
    if (msg) {
      emitAttendanceEvent(
        'message',
        {
          conversationId: conv.id,
          connectionId: conv.connection_id,
          message: {
            id: msg.id,
            direction: 'out',
            content: msg.content,
            type: msg.type,
            status: msg.status,
            userId: msg.user_id,
            sentAt: msg.sent_at,
          },
        },
        { assignedUserIds: [conv.assigned_user_id ?? null] }
      );
    }

    res.json({ success: true, messageId: msg?.id || null });
  } catch (error) {
    console.error('[AttendanceChat] Erro ao enviar:', error.message);
    res.status(500).json({ message: error.apiMessage || error.message });
  }
});

// Atribuir a si ou a outro agente — requer attendanceReplyAny.
router.post('/conversations/:id/assign', async (req, res) => {
  try {
    if (!req.attendancePerms.attendanceReplyAny) {
      return res.status(403).json({ message: 'Sem permissão para atribuir conversas' });
    }
    const conv = await loadConversation(req, res);
    if (!conv) return;

    const targetUserId = req.body?.userId || req.agent?.id || null;
    if (!targetUserId) {
      return res.status(400).json({ message: 'userId é obrigatório' });
    }

    const updated = await query(
      `UPDATE att_conversations
          SET assigned_user_id = $2,
              status = CASE WHEN status = 'pendente' THEN 'aberta' ELSE status END,
              updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [conv.id, targetUserId]
    );
    const row = updated.rows[0];
    emitAttendanceEvent(
      'conversation',
      {
        conversationId: row.id,
        assignedUserId: row.assigned_user_id,
        status: row.status,
      },
      { assignedUserIds: [conv.assigned_user_id ?? null, row.assigned_user_id] }
    );
    res.json(row);
  } catch (error) {
    console.error('[AttendanceChat] Erro ao atribuir:', error.message);
    res.status(500).json({ message: error.message });
  }
});

// Assumir para si — qualquer operador com attendanceReply pode assumir uma conversa
// ainda não atribuída (quem tem replyAny pode assumir mesmo já atribuída).
router.post('/conversations/:id/claim', async (req, res) => {
  try {
    const conv = await loadConversation(req, res);
    if (!conv) return;
    if (!req.agent?.id) {
      return res.status(400).json({ message: 'Perfil de agente não encontrado' });
    }
    if (conv.assigned_user_id && conv.assigned_user_id !== req.agent.id && !req.attendancePerms.attendanceReplyAny) {
      return res.status(403).json({ message: 'Conversa já atribuída a outro agente' });
    }

    const updated = await query(
      `UPDATE att_conversations
          SET assigned_user_id = $2,
              status = CASE WHEN status = 'pendente' THEN 'aberta' ELSE status END,
              updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [conv.id, req.agent.id]
    );
    const row = updated.rows[0];
    emitAttendanceEvent(
      'conversation',
      {
        conversationId: row.id,
        assignedUserId: row.assigned_user_id,
        status: row.status,
      },
      { assignedUserIds: [conv.assigned_user_id ?? null, row.assigned_user_id] }
    );
    res.json(row);
  } catch (error) {
    console.error('[AttendanceChat] Erro ao assumir:', error.message);
    res.status(500).json({ message: error.message });
  }
});

export default router;
