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
  transferWhatsAppChat,
  finalizeWhatsAppChat,
  sendWhatsAppChatMedia,
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
export async function listConversationsHandler(req, res) {
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
}
router.get('/conversations', listConversationsHandler);

// Detalhe (thread) de uma conversa, com o array de mensagens. O status de entrega
// de cada mensagem vem embutido em `statusMessage` (1=enviado, 2=entregue, 3=lido).
export async function getMessagesHandler(req, res) {
  try {
    const { chat, error, statusCode } = await loadAuthorizedChat(req, req.params.attendanceId);
    if (error) return res.status(statusCode).json({ message: error });
    res.json(chat);
  } catch (error) {
    console.error('[WhatsAppChat] Erro ao buscar mensagens:', error.message);
    res.status(500).json({ message: error.message });
  }
}
router.get('/conversations/:attendanceId/messages', getMessagesHandler);

// Envia texto e/ou template para o número da conversa e etiqueta o vendedor
// responsável (vendedor_id/vendedor_nome) no contato.
export async function sendMessageHandler(req, res) {
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
}
router.post('/conversations/:attendanceId/send', sendMessageHandler);

// Transfere a conversa para outro setor/atendente. sectorId e userId obrigatórios.
router.post('/conversations/:attendanceId/transfer', async (req, res) => {
  try {
    const { sectorId, userId } = req.body || {};
    if (!sectorId || !userId) {
      return res.status(400).json({ message: 'sectorId e userId são obrigatórios' });
    }

    const { error, statusCode } = await loadAuthorizedChat(req, req.params.attendanceId);
    if (error) return res.status(statusCode).json({ message: error });

    const result = await transferWhatsAppChat(req.params.attendanceId, sectorId, userId);
    res.json({ success: true, result });
  } catch (error) {
    console.error('[WhatsAppChat] Erro ao transferir conversa:', error.message);
    res.status(500).json({ message: error.message });
  }
});

// Finaliza (resolve) a conversa — passa para status 3.
router.post('/conversations/:attendanceId/finalize', async (req, res) => {
  try {
    const { sendMessageFinalized = true, sendResearchSatisfaction = true } = req.body || {};

    const { error, statusCode } = await loadAuthorizedChat(req, req.params.attendanceId);
    if (error) return res.status(statusCode).json({ message: error });

    const result = await finalizeWhatsAppChat(req.params.attendanceId, {
      sendMessageFinalized,
      sendResearchSatisfaction,
    });
    res.json({ success: true, result });
  } catch (error) {
    console.error('[WhatsAppChat] Erro ao finalizar conversa:', error.message);
    res.status(500).json({ message: error.message });
  }
});

// Passo 1 do envio de mídia: gera uma URL de upload direto para o Object Storage.
// O arquivo NÃO passa pelo backend — o frontend faz PUT direto na uploadURL.
router.post('/conversations/:attendanceId/media/request-url', async (req, res) => {
  try {
    // Envio de mídia depende do Object Storage do Replit (sidecar local +
    // PRIVATE_OBJECT_DIR), que não existe fora do Replit. Em produção o recurso
    // fica desativado com uma mensagem clara, sem derrubar o restante do chat.
    if (!process.env.PRIVATE_OBJECT_DIR) {
      return res.status(503).json({
        message: 'Envio de mídia indisponível neste ambiente.',
      });
    }

    const { error, statusCode } = await loadAuthorizedChat(req, req.params.attendanceId);
    if (error) return res.status(statusCode).json({ message: error });

    // Import tardio: o SDK do Object Storage (@google-cloud/storage) é pesado e
    // só é necessário quando há upload de mídia. Carregar sob demanda mantém o
    // grafo de módulos leve (e testável) fora desse fluxo.
    const { getObjectEntityUploadURL } = await import('../services/objectStorage.js');
    const { uploadURL, objectPath } = await getObjectEntityUploadURL();
    res.json({ uploadURL, objectPath });
  } catch (error) {
    console.error('[WhatsAppChat] Erro ao gerar URL de upload:', error.message);
    res.status(500).json({ message: error.message });
  }
});

// Passo 2 do envio de mídia: com o arquivo já no Object Storage, monta a linkUrl
// pública (servida por /api/whatsapp-media/*) e dispara o envio na conversa.
router.post('/conversations/:attendanceId/send-media', async (req, res) => {
  try {
    if (!process.env.PRIVATE_OBJECT_DIR) {
      return res.status(503).json({
        message: 'Envio de mídia indisponível neste ambiente.',
      });
    }

    const { objectPath, fileName, caption = '' } = req.body || {};
    if (!objectPath || !fileName) {
      return res.status(400).json({ message: 'objectPath e fileName são obrigatórios' });
    }
    const match = /^\/objects\/uploads\/([A-Za-z0-9-]+)$/.exec(objectPath);
    if (!match) {
      return res.status(400).json({ message: 'objectPath inválido' });
    }
    const objectId = match[1];

    const { chat, error, statusCode } = await loadAuthorizedChat(req, req.params.attendanceId);
    if (error) return res.status(statusCode).json({ message: error });

    const number = chat.contact?.number;
    if (!number) {
      return res.status(400).json({ message: 'Conversa sem número de contato válido' });
    }

    const extension = (fileName.includes('.') ? fileName.split('.').pop() : '')
      .toLowerCase()
      .trim();
    if (!extension) {
      return res
        .status(400)
        .json({ message: 'O arquivo precisa ter uma extensão (ex.: .pdf, .jpg).' });
    }

    // Base pública a partir de origem confiável (env), não de headers do cliente,
    // para evitar host spoofing na linkUrl que a WesccTech vai buscar.
    const baseUrl =
      process.env.PUBLIC_APP_URL ||
      (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null) ||
      `https://${req.get('host')}`;
    const linkUrl = `${baseUrl}/api/whatsapp-media/${objectId}`;

    const result = await sendWhatsAppChatMedia(number, {
      linkUrl,
      extension,
      fileName,
      caption,
    });
    res.json({ success: true, result });
  } catch (error) {
    console.error('[WhatsAppChat] Erro ao enviar mídia:', error.message);
    res.status(500).json({ message: error.message });
  }
});

// Usuários e setores — usados nos seletores de transferência e no filtro por vendedor.
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
