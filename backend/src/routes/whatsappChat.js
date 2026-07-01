import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { loadAgentMiddleware } from '../middleware/permissions.js';
import {
  listWhatsAppChats,
  getChatWithMessages,
  getWhatsAppUsers,
  getWhatsAppSectors,
  sendChatMessage,
  getWhatsAppTemplates,
  setContactAttributes,
  getContactByPhone,
} from '../services/whatsappService.js';

const router = Router();

// Cache curto dos usuários WesccTech, usado para mapear o agente do CRM ao seu
// usuário WHU (por e-mail) e assim filtrar as conversas por vendedor.
let usersCache = { data: null, at: 0 };
const USERS_TTL = 5 * 60 * 1000;
async function getWesccUsersCached() {
  const now = Date.now();
  if (usersCache.data && now - usersCache.at < USERS_TTL) return usersCache.data;
  const users = await getWhatsAppUsers().catch(() => []);
  usersCache = { data: Array.isArray(users) ? users : [], at: now };
  return usersCache.data;
}

// Supervisores e admins acompanham a operação inteira; demais agentes só as suas.
function isSupervisorOrAdmin(req) {
  const agentType = req.agent?.agentType || null;
  const isAdmin = agentType === 'admin' || req.user?.role === 'admin';
  const isSupervisor =
    agentType === 'supervisor' ||
    agentType === 'sales_supervisor' ||
    (typeof agentType === 'string' && agentType.endsWith('_supervisor'));
  return isAdmin || isSupervisor;
}

async function resolveWesccUserId(req) {
  const email = (req.user?.email || '').toLowerCase();
  if (!email) return null;
  const users = await getWesccUsersCached();
  const me = users.find((u) => (u.email || '').toLowerCase() === email);
  return me?.id || null;
}

// Carrega a conversa e garante que agentes comuns só acessem as próprias.
// Retorna { chat } quando autorizado ou { error, statusCode } caso contrário.
async function loadAuthorizedChat(req, attendanceId) {
  const chat = await getChatWithMessages(attendanceId);
  if (!chat) return { error: 'Conversa não encontrada', statusCode: 404 };

  if (!isSupervisorOrAdmin(req)) {
    const myId = await resolveWesccUserId(req);
    const ownerId = chat.currentUser?.id ?? null;
    if (!myId || ownerId !== myId) {
      return { error: 'Você não tem acesso a esta conversa', statusCode: 403 };
    }
  }
  return { chat };
}

router.use(authMiddleware, loadAgentMiddleware);

// Lista conversas por status (0=IA, 1=Fila, 2=Atendimento, 3=Resolvido).
// Não-supervisores só enxergam as conversas cujo agente responsável (currentUser)
// é o seu próprio usuário WesccTech.
router.get('/conversations', async (req, res) => {
  try {
    const status = Number.parseInt(req.query.status, 10) || 0;
    const page = Number.parseInt(req.query.page, 10) || 0;
    const search = (req.query.search || '').trim().toLowerCase();

    const result = await listWhatsAppChats({ typeChat: 2, status, page });
    let chats = result.chats;

    if (!isSupervisorOrAdmin(req)) {
      const myId = await resolveWesccUserId(req);
      chats = myId ? chats.filter((c) => c.currentUser?.id === myId) : [];
    }

    if (search) {
      chats = chats.filter((c) => {
        const name = (c.contact?.name || c.description || '').toLowerCase();
        const number = (c.contact?.number || c.secondaryDescription || '').toLowerCase();
        return name.includes(search) || number.includes(search);
      });
    }

    res.json({ ...result, chats });
  } catch (error) {
    console.error('[WhatsAppChat] Erro ao listar conversas:', error.message);
    res.status(500).json({ message: error.message });
  }
});

// Detalhe (thread) de uma conversa, com o array de mensagens. O status de entrega
// de cada mensagem vem embutido em `statusMessage` (1=enviado, 2=entregue, 3=lido).
router.get('/conversations/:attendanceId/messages', async (req, res) => {
  try {
    const { chat, error, statusCode } = await loadAuthorizedChat(req, req.params.attendanceId);
    if (error) return res.status(statusCode).json({ message: error });
    res.json(chat);
  } catch (error) {
    console.error('[WhatsAppChat] Erro ao buscar mensagens:', error.message);
    res.status(500).json({ message: error.message });
  }
});

// Envia texto e/ou template para o número da conversa e etiqueta o vendedor
// responsável (vendedor_id/vendedor_nome) no contato.
router.post('/conversations/:attendanceId/send', async (req, res) => {
  try {
    const { message, templateId, templateComponents } = req.body || {};
    const hasText = typeof message === 'string' && message.trim().length > 0;

    if (!templateId && !hasText) {
      return res.status(400).json({ message: 'Informe uma mensagem de texto ou selecione um template' });
    }

    // Autoriza e resolve o destino a partir da própria conversa (nunca confiar
    // no número enviado pelo cliente — evita envio para números arbitrários).
    const { chat, error, statusCode } = await loadAuthorizedChat(req, req.params.attendanceId);
    if (error) return res.status(statusCode).json({ message: error });

    const number = chat.contact?.number;
    const contactIdFromChat = chat.contact?.id || null;
    if (!number) {
      return res.status(400).json({ message: 'Conversa sem número de contato válido' });
    }

    const sendResult = await sendChatMessage({
      number,
      message: hasText ? message : undefined,
      templateId: templateId || undefined,
      templateComponents,
    });

    // Etiquetagem do vendedor (best-effort — não bloqueia o envio).
    try {
      let cId = contactIdFromChat || sendResult.contactId || null;
      if (!cId) {
        const contact = await getContactByPhone(number);
        cId = contact?.id || contact?._id || null;
      }
      if (cId && req.agent?.id) {
        await setContactAttributes(cId, [
          { key: 'vendedor_nome', value: req.agent.name, description: 'Nome do vendedor responsável' },
          { key: 'vendedor_id', value: req.agent.id, description: 'ID do vendedor no CRM' },
        ]);
      }
    } catch (e) {
      console.error('[WhatsAppChat] Falha ao etiquetar vendedor:', e.message);
    }

    res.json({ success: true, usedFallback: sendResult.usedFallback || false });
  } catch (error) {
    console.error('[WhatsAppChat] Erro ao enviar mensagem:', error.message);
    let userMessage = error.message;
    if (error.message?.includes('already open')) {
      userMessage = 'Já existe uma conversa aberta com este número. Tente novamente em instantes.';
    }
    res.status(500).json({ message: userMessage });
  }
});

// Usuários e setores — usados nos seletores de transferência (Fase 2) e no filtro por vendedor.
router.get('/users', async (req, res) => {
  try {
    res.json(await getWesccUsersCached());
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/sectors', async (req, res) => {
  try {
    res.json(await getWhatsAppSectors());
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/templates', async (req, res) => {
  try {
    res.json(await getWhatsAppTemplates());
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
