import { normalizeBrazilPhone, alternateBrazilPhone } from '../utils/phone.js';

const RUDO_API_BASE = 'https://api.wescctech.com.br/core/v2/api';

export async function getWhatsAppTemplates() {
  const token = process.env.RUDO_WHATSAPP_TOKEN;
  
  if (!token) {
    throw new Error('RUDO_WHATSAPP_TOKEN not configured');
  }

  const response = await fetch(`${RUDO_API_BASE}/action-cards/templates`, {
    method: 'GET',
    headers: {
      'access-token': token,
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`Failed to fetch templates: ${error.msg || response.statusText}`);
  }

  return response.json();
}

export async function getWhatsAppTemplatesByToken(channelToken) {
  if (!channelToken) {
    throw new Error('Channel token is required');
  }

  const response = await fetch(`${RUDO_API_BASE}/action-cards/templates`, {
    method: 'GET',
    headers: {
      'access-token': channelToken,
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`Failed to fetch templates for channel: ${error.msg || response.statusText}`);
  }

  return response.json();
}

export async function createChatWithToken(params, channelToken) {
  const token = channelToken || process.env.RUDO_WHATSAPP_TOKEN;
  if (!token) {
    throw new Error('No WhatsApp token available');
  }

  const { number, templateId, templateComponents } = params;

  const body = {
    number: normalizeBrazilPhone(number),
    quickAnswerId: templateId,
    quickAnswerComponents: templateComponents || [],
  };

  const response = await fetch(`${RUDO_API_BASE}/chats/create-new`, {
    method: 'POST',
    headers: {
      'access-token': token,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const responseData = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg = responseData.msg || response.statusText;
    const error = new Error(`Failed to create chat: ${errorMsg}`);
    error.apiMessage = errorMsg;
    throw error;
  }

  return responseData;
}

export async function sendTemplateWithToken(params, channelToken) {
  const token = channelToken || process.env.RUDO_WHATSAPP_TOKEN;
  if (!token) {
    throw new Error('No WhatsApp token available');
  }

  const { number, templateId, templateComponents } = params;

  const body = {
    number: normalizeBrazilPhone(number),
    templateId: templateId,
    templateComponents: templateComponents || [],
    forceSend: true,
  };

  const response = await fetch(`${RUDO_API_BASE}/chats/send-template`, {
    method: 'POST',
    headers: {
      'access-token': token,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const responseData = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`Failed to send template: ${responseData.msg || response.statusText}`);
  }

  return responseData;
}

export async function sendWhatsAppMessageWithToken(lead, agent, templateId, channelToken, templateComponents) {
  const phone = lead.phone || lead.referred_phone || lead.contact_phone || lead.whatsapp || lead.cell_phone;

  if (!phone) {
    throw new Error('Lead does not have a phone number');
  }

  const brazilNumber = normalizeBrazilPhone(phone);
  const leadName = lead.name || lead.referred_name || lead.contact_name || 'Cliente';

  const components = Array.isArray(templateComponents) ? templateComponents : [
    {
      type: 'BODY',
      parameters: [
        { type: 'text', text: leadName },
      ],
    },
  ];

  let result;
  let usedFallback = false;

  try {
    result = await createChatWithToken({
      number: brazilNumber,
      templateId,
      templateComponents: components,
    }, channelToken);
  } catch (error) {
    if (error.apiMessage && error.apiMessage.toLowerCase().includes('already open')) {
      usedFallback = true;
      result = await sendTemplateWithToken({
        number: brazilNumber,
        templateId,
        templateComponents: components,
      }, channelToken);
    } else {
      throw error;
    }
  }

  // Conversa nova não devolve messageSentId; completa para permitir o rastreio de entrega.
  if (!usedFallback) {
    result = await enrichWithMessageSentId(result, { channelToken });
  }

  return { ...result, usedFallback };
}

export async function createChat(params) {
  const token = process.env.RUDO_WHATSAPP_TOKEN;
  
  if (!token) {
    throw new Error('RUDO_WHATSAPP_TOKEN not configured');
  }

  const { number, templateId, templateComponents, skipNormalize } = params;

  const body = {
    number: skipNormalize ? String(number).replace(/\D/g, '') : normalizeBrazilPhone(number),
    quickAnswerId: templateId,
    quickAnswerComponents: templateComponents || [],
  };

  const response = await fetch(`${RUDO_API_BASE}/chats/create-new`, {
    method: 'POST',
    headers: {
      'access-token': token,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const responseData = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg = responseData.msg || response.statusText;
    const error = new Error(`Failed to create chat: ${errorMsg}`);
    error.apiMessage = errorMsg;
    throw error;
  }

  return responseData;
}

export async function sendTemplate(params) {
  const token = process.env.RUDO_WHATSAPP_TOKEN;
  
  if (!token) {
    throw new Error('RUDO_WHATSAPP_TOKEN not configured');
  }

  const { number, templateId, templateComponents, skipNormalize } = params;

  // WHU's /chats/send-template expects the components under the lowercase key
  // `templatecomponents` with lowercase component `type` (e.g. "body"), unlike
  // /chats/create-new which uses `quickAnswerComponents` with uppercase "BODY".
  // Sending the camelCase/uppercase shape here makes WHU return 200 but silently
  // drop the template parameters, so the message is never delivered. This mirrors
  // the proven high-volume payload used by whatsappQueueService.
  const normalizedComponents = Array.isArray(templateComponents)
    ? templateComponents.map((c) => ({
        ...c,
        type: typeof c.type === 'string' ? c.type.toLowerCase() : c.type,
      }))
    : [];

  const body = {
    number: skipNormalize ? String(number).replace(/\D/g, '') : normalizeBrazilPhone(number),
    templateId: templateId,
    forceSend: true,
    verifyContact: false,
    templatecomponents: normalizedComponents,
  };

  const response = await fetch(`${RUDO_API_BASE}/chats/send-template`, {
    method: 'POST',
    headers: {
      'access-token': token,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const responseData = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`Failed to send template: ${responseData.msg || response.statusText}`);
  }

  return responseData;
}

export async function sendTextMessage(params) {
  const token = process.env.RUDO_WHATSAPP_TOKEN;
  
  if (!token) {
    throw new Error('RUDO_WHATSAPP_TOKEN not configured');
  }

  const { number, message, skipNormalize } = params;

  const body = {
    number: skipNormalize ? String(number).replace(/\D/g, '') : normalizeBrazilPhone(number),
    message: message,
    forceSend: true,
  };

  const response = await fetch(`${RUDO_API_BASE}/chats/send-text`, {
    method: 'POST',
    headers: {
      'access-token': token,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const responseData = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg = responseData.msg || response.statusText;
    const error = new Error(`Failed to send message: ${errorMsg}`);
    error.apiMessage = errorMsg;
    throw error;
  }

  return responseData;
}

export async function sendDocument(params) {
  const token = process.env.RUDO_WHATSAPP_TOKEN;
  
  if (!token) {
    throw new Error('RUDO_WHATSAPP_TOKEN not configured');
  }

  const { number, documentUrl, caption, filename } = params;

  const body = {
    number: normalizeBrazilPhone(number),
    url: documentUrl,
    caption: caption || '',
    filename: filename || 'proposta.pdf',
    type: 'document',
  };

  const response = await fetch(`${RUDO_API_BASE}/chats/send-media`, {
    method: 'POST',
    headers: {
      'access-token': token,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const responseData = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`Failed to send document: ${responseData.msg || response.statusText}`);
  }

  return responseData;
}

export async function sendTextMessageWithToken({ number, message, channelToken }) {
  if (!channelToken) {
    throw new Error('No WhatsApp channel token provided');
  }

  const brazilNumber = normalizeBrazilPhone(number);

  const response = await fetch(`${RUDO_API_BASE}/chats/send-text`, {
    method: 'POST',
    headers: {
      'access-token': channelToken,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({ number: brazilNumber, message, forceSend: true }),
  });

  const responseData = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg = responseData.msg || response.statusText;
    const error = new Error(`Failed to send message: ${errorMsg}`);
    error.apiMessage = errorMsg;
    throw error;
  }

  return responseData;
}

// Busca o histórico de UMA conversa no WHU. O objeto do chat inclui um array `messages`
// (campos: IdMessage, text, isSentByMe, dhMessage, isSystemMessage, ...) além de contact/
// lastMessage/countUnreadMessages. Usado para complementar a thread na caixa de entrada.
export async function getChatWithMessages(chatId, { timeoutMs = 8000, channelToken = null } = {}) {
  const token = channelToken || process.env.RUDO_WHATSAPP_TOKEN;
  if (!token) throw new Error('RUDO_WHATSAPP_TOKEN not configured');
  if (!chatId) return null;

  // Timeout explícito: evita que uma chamada lenta ao WHU trave quem depende disso
  // (ex.: o sync da lista de conversas, que roda a cada poll).
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${RUDO_API_BASE}/chats/${chatId}?withMessages=true`, {
      method: 'GET',
      headers: {
        'access-token': token,
        'Accept': 'application/json',
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      return null;
    }
    return response.json().catch(() => null);
  } finally {
    clearTimeout(timer);
  }
}

// O create-new (conversa nova) NÃO devolve messageSentId — só o send-template em
// conversa já aberta devolve. Sem esse ID não dá para rastrear entrega/leitura.
// Este helper completa o resultado buscando o ID da última mensagem de saída do
// chat recém-criado. Best-effort: nunca lança; se não achar, devolve como veio.
export async function enrichWithMessageSentId(result, { channelToken = null } = {}) {
  try {
    if (!result || result.messageSentId || result.message_sent_id) return result;
    const chatId = result.chatId || result.currentChatId || result.chat_id || null;
    if (!chatId) return result;
    const chat = await getChatWithMessages(chatId, { channelToken });
    const messages = Array.isArray(chat?.messages) ? chat.messages : [];
    const outbound = [...messages].reverse().find((m) => m && (m.isSentByMe === true || m.fromMe === true));
    const msgId = outbound?.idMessage || outbound?.IdMessage || outbound?.id || null;
    if (msgId) return { ...result, messageSentId: String(msgId) };
    return result;
  } catch {
    return result;
  }
}

// Consulta o status de UMA mensagem no WHU: GET /chats/messages/{id}
// (MessageInfoApiModel). Serviço reutilizável — hoje só o painel de logs consome,
// mas outras telas podem usar depois. Retorna:
//   { ok: true, status, sentAt, deliveredAt, readAt, erroredAt, errorMessage }
//   { ok: false, notFound: true }   → 400 chat_16/chat_17 (mensagem inexistente; não repetir)
//   { ok: false, unavailable: true } → API fora/timeout (tentar de novo depois)
// status: 0 aguardando, 1 enviada, 2 entregue, 3 visualizada, 4 excluída, 5 reproduzida, -1 erro.
// Aceita `channelToken` para mensagens enviadas por canais próprios (automations
// de canal: upsell_channel/referral_channel) — a mensagem só é visível para o
// token do canal que a enviou.
export async function getMessageDeliveryInfo(messageId, { timeoutMs = 8000, channelToken = null } = {}) {
  const token = channelToken || process.env.RUDO_WHATSAPP_TOKEN;
  if (!token) throw new Error('RUDO_WHATSAPP_TOKEN not configured');
  if (!messageId) return { ok: false, notFound: true };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${RUDO_API_BASE}/chats/messages/${encodeURIComponent(messageId)}`, {
      method: 'GET',
      headers: {
        'access-token': token,
        'Accept': 'application/json',
      },
      signal: controller.signal,
    });

    if (response.status === 400 || response.status === 404) {
      // chat_16/chat_17 = mensagem não existe no WHU → não verificável, não reconsultar.
      return { ok: false, notFound: true };
    }
    if (!response.ok) {
      return { ok: false, unavailable: true };
    }

    const data = await response.json().catch(() => null);
    if (!data || typeof data !== 'object') {
      return { ok: false, unavailable: true };
    }

    const status = Number(data.status);
    return {
      ok: true,
      status: Number.isFinite(status) ? status : null,
      sentAt: data.utcDhMessageSent || null,
      deliveredAt: data.utcDhMessageDelivered || null,
      readAt: data.utcDhMessageRead || null,
      erroredAt: data.utcDhMessageErrored || null,
      errorMessage: data.errorMessage || null,
    };
  } catch {
    return { ok: false, unavailable: true };
  } finally {
    clearTimeout(timer);
  }
}

export async function getContactByPhone(phoneNumber) {
  const token = process.env.RUDO_WHATSAPP_TOKEN;
  
  if (!token) {
    throw new Error('RUDO_WHATSAPP_TOKEN not configured');
  }

  const formattedNumber = phoneNumber.replace(/\D/g, '');
  const last8Digits = formattedNumber.slice(-8);

  // Search contacts by last digits of phone number
  const response = await fetch(`${RUDO_API_BASE}/contacts?phone=${last8Digits}`, {
    method: 'GET',
    headers: {
      'access-token': token,
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    return null;
  }

  const contacts = await response.json().catch(() => []);
  
  if (!Array.isArray(contacts) || contacts.length === 0) {
    return null;
  }

  // Find exact match by last 8 digits (handles the extra 9 digit in Brazilian numbers)
  const targetLast8 = formattedNumber.slice(-8);
  const found = contacts.find(c => {
    const contactLast8 = (c.number || '').slice(-8);
    return contactLast8 === targetLast8;
  });

  return found || contacts[0];
}

export async function setContactAttributes(contactId, attributes) {
  const token = process.env.RUDO_WHATSAPP_TOKEN;
  
  if (!token) {
    throw new Error('RUDO_WHATSAPP_TOKEN not configured');
  }

  const response = await fetch(`${RUDO_API_BASE}/contacts/${contactId}/set-attributes`, {
    method: 'POST',
    headers: {
      'access-token': token,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(attributes),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`Failed to set attributes: ${error.msg || response.statusText}`);
  }

  return response.json();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Consulta o status REAL de entrega da última mensagem de saída de uma conversa.
// A WHU embute isso em `statusMessage` (1=enviado, 2=entregue, 3=lido); status <= 0
// (ou um marcador de erro) indica falha de entrega. Retorna:
//   'delivered' | 'failed' | 'unknown'  (best-effort — nunca lança).
// Tratar HTTP 200 do envio como "entregue" mascara números frios (o WhatsApp aceita
// o disparo mas nada chega); por isso conferimos o status da conversa.
export async function checkLastOutboundDelivery(chatId, { attempts = 2, delayMs = 1000 } = {}) {
  if (!chatId) return 'unknown';
  for (let i = 0; i < attempts; i++) {
    let chat = null;
    try {
      chat = await getChatWithMessages(chatId);
    } catch {
      chat = null;
    }
    const messages = Array.isArray(chat?.messages) ? chat.messages : [];
    const outbound = [...messages]
      .reverse()
      .find((m) => m && (m.isSentByMe === true || m.fromMe === true));
    if (outbound) {
      const s = Number(outbound.statusMessage);
      if (Number.isFinite(s) && s >= 2) return 'delivered';
      if ((Number.isFinite(s) && s <= 0) || outbound.error === true || outbound.failed === true) {
        return 'failed';
      }
    }
    if (i < attempts - 1) await sleep(delayMs);
  }
  return 'unknown';
}

// Executa o envio (template com fallback e/ou texto) para UM número já canônico.
// Retorna { result, usedFallback, chatId } — o chatId é usado para conferir a entrega.
async function deliverChatMessage({ targetNumber, message, templateId, templateComponents, hasText }) {
  let result = {};
  let usedFallback = false;

  if (templateId) {
    const components = Array.isArray(templateComponents) ? templateComponents : [];
    try {
      result = await createChat({
        number: targetNumber,
        templateId,
        templateComponents: components,
        skipNormalize: true,
      });
    } catch (error) {
      if (error.apiMessage && error.apiMessage.toLowerCase().includes('already open')) {
        usedFallback = true;
        result = await sendTemplate({
          number: targetNumber,
          templateId,
          templateComponents: components,
          skipNormalize: true,
        });
      } else {
        throw error;
      }
    }

    if (hasText) {
      try {
        await sendTextMessage({ number: targetNumber, message, skipNormalize: true });
      } catch (err) {
        console.error(`[WhatsApp] Failed to send follow-up text to ${targetNumber}:`, err.message);
      }
    }
  } else {
    result = await sendTextMessage({ number: targetNumber, message, skipNormalize: true });
  }

  const chatId =
    result?.chatId || result?.currentChatId || result?.chat_id || result?.chatID || null;
  return { result, usedFallback, chatId };
}

export async function sendChatMessage({ number, message, templateId, templateComponents }) {
  const brazilNumber = normalizeBrazilPhone(number);
  if (!brazilNumber) {
    throw new Error('Número de telefone é obrigatório');
  }

  const hasText = typeof message === 'string' && message.trim().length > 0;
  if (!templateId && !hasText) {
    throw new Error('Informe uma mensagem de texto ou selecione um template');
  }

  // 1) Envia ao número canônico (com o nono dígito quando celular).
  const primary = await deliverChatMessage({
    targetNumber: brazilNumber,
    message,
    templateId,
    templateComponents,
    hasText,
  });

  // 2) Confere a entrega real. Só agimos diante de uma FALHA definitiva reportada
  // pela WHU — "pendente/desconhecido" segue como sucesso (não bloqueamos o envio
  // por causa de destinatário momentaneamente offline).
  const primaryStatus = await checkLastOutboundDelivery(primary.chatId).catch(() => 'unknown');
  if (primaryStatus !== 'failed') {
    return { ...primary.result, usedFallback: primary.usedFallback, brazilNumber };
  }

  // 3) Rede de segurança: tenta a variante alternativa do número (com/sem o 9) UMA vez.
  const altNumber = alternateBrazilPhone(brazilNumber);
  if (!altNumber) {
    throw new Error(
      'Não foi possível entregar a mensagem para este número. Verifique se o número está correto e ativo no WhatsApp.'
    );
  }

  const alternate = await deliverChatMessage({
    targetNumber: altNumber,
    message,
    templateId,
    templateComponents,
    hasText,
  });

  const altStatus = await checkLastOutboundDelivery(alternate.chatId).catch(() => 'unknown');
  if (altStatus === 'failed') {
    throw new Error(
      'Não foi possível entregar a mensagem para este número (tentamos as duas variantes do celular). Verifique se o número está correto e ativo no WhatsApp.'
    );
  }

  return {
    ...alternate.result,
    usedFallback: alternate.usedFallback,
    brazilNumber: altNumber,
    usedAlternateNumber: true,
  };
}

export async function sendWhatsAppMessage(lead, agent, templateId, templateComponents) {
  const phone = lead.phone || lead.referred_phone || lead.contact_phone || lead.whatsapp || lead.cell_phone;
  
  if (!phone) {
    throw new Error('Lead does not have a phone number');
  }

  const brazilNumber = normalizeBrazilPhone(phone);

  const leadName = lead.name || lead.referred_name || lead.contact_name || 'Cliente';

  // Templates with 2 parameters (nome_cliente + nome_vendedor)
  const twoParamTemplates = [
    '6973d5184440c6fe0394dd2e', // apresentacao (boas-vindas)
  ];
  
  // Templates with 1 parameter (only nome_cliente)
  // alguma_duvida, agendar_horario, reforco_importante
  
  const usesTwoParams = twoParamTemplates.includes(templateId);
  
  const components = templateComponents || [
    {
      type: 'BODY',
      parameters: usesTwoParams 
        ? [
            { type: 'text', text: leadName },
            { type: 'text', text: agent?.name || 'Consultor' },
          ]
        : [
            { type: 'text', text: leadName },
          ],
    },
  ];

  let result;
  let usedFallback = false;

  try {
    result = await createChat({
      number: brazilNumber,
      templateId,
      templateComponents: components,
    });
  } catch (error) {
    if (error.apiMessage && error.apiMessage.toLowerCase().includes('already open')) {
      console.log(`[WhatsApp] Chat already opened for ${brazilNumber}, using send-template fallback`);
      usedFallback = true;
      result = await sendTemplate({
        number: brazilNumber,
        templateId,
        templateComponents: components,
      });
    } else {
      throw error;
    }
  }

  // Conversa nova não devolve messageSentId; completa para permitir o rastreio de entrega.
  if (!usedFallback) {
    result = await enrichWithMessageSentId(result);
  }

  // Always update contact attributes when we have an agent
  if (agent) {
    let contactId = result.contactId;
    
    // If no contactId in result (fallback case), try to find the contact by phone
    if (!contactId) {
      try {
        const contact = await getContactByPhone(brazilNumber);
        if (contact && contact.id) {
          contactId = contact.id;
          console.log(`[WhatsApp] Found existing contact ${contactId} for ${brazilNumber}`);
        } else if (contact && contact._id) {
          contactId = contact._id;
          console.log(`[WhatsApp] Found existing contact ${contactId} for ${brazilNumber}`);
        }
      } catch (err) {
        console.error('[WhatsApp] Failed to find contact by phone:', err.message);
      }
    }

    if (contactId) {
      try {
        await setContactAttributes(contactId, [
          { key: 'vendedor_nome', value: agent.name, description: 'Nome do vendedor responsável' },
          { key: 'vendedor_id', value: agent.id, description: 'ID do vendedor no CRM' },
        ]);
        console.log(`[WhatsApp] Updated contact ${contactId} attributes with agent ${agent.name}`);
      } catch (err) {
        console.error('[WhatsApp] Failed to set contact attributes:', err.message);
      }
    } else {
      console.log(`[WhatsApp] No contactId available for ${brazilNumber}, skipping attribute update`);
    }
  }

  return { ...result, usedFallback };
}
