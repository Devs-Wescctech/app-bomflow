import { normalizeBrazilPhone } from '../utils/phone.js';

// Cliente WHU do Atendimento (Chat v2). Diferente do whatsappService (automações/campanhas,
// que usam RUDO_WHATSAPP_TOKEN do env), aqui TODO token vem descriptografado da tabela
// channel_connections — nenhuma dependência de variável de ambiente de token.

const WHU_API_BASE = 'https://api.wescctech.com.br/core/v2/api';

async function whuRequest(token, path, { method = 'GET', body, timeoutMs = 10000 } = {}) {
  if (!token) throw new Error('Token do canal é obrigatório');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${WHU_API_BASE}${path}`, {
      method,
      headers: {
        'access-token': token,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const msg = data.msg || data.message || response.statusText;
      const error = new Error(`WHU ${method} ${path} falhou: ${msg}`);
      error.apiMessage = msg;
      error.statusCode = response.status;
      throw error;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

// Valida o token consultando um endpoint autenticado do WHU. Usado no cadastro de
// conexões: se o token for inválido/canal desativado, o WHU responde erro.
export async function getStatus(token) {
  const data = await whuRequest(token, '/action-cards/templates', { timeoutMs: 8000 });
  return { ok: true, templatesCount: Array.isArray(data) ? data.length : 0 };
}

// Envia texto livre. forceSend garante o envio mesmo sem chat aberto.
export async function sendText(token, number, text) {
  const brazilNumber = normalizeBrazilPhone(number);
  if (!brazilNumber) throw new Error('Número de telefone inválido');
  if (typeof text !== 'string' || text.trim().length === 0) {
    throw new Error('Texto da mensagem é obrigatório');
  }
  return whuRequest(token, '/chats/send-text', {
    method: 'POST',
    body: { number: brazilNumber, message: text, forceSend: true },
  });
}

// Envia mídia por URL pública (o WHU busca a fileUrl externamente).
export async function sendMedia(token, number, fileUrl, caption = '', { fileName, extension } = {}) {
  const brazilNumber = normalizeBrazilPhone(number);
  if (!brazilNumber) throw new Error('Número de telefone inválido');
  if (!fileUrl) throw new Error('fileUrl é obrigatório');

  const inferredName = fileName || fileUrl.split('/').pop() || 'arquivo';
  const inferredExt =
    extension || (inferredName.includes('.') ? inferredName.split('.').pop().toLowerCase() : '');

  return whuRequest(token, '/chats/send-media', {
    method: 'POST',
    body: {
      number: brazilNumber,
      forceSend: true,
      verifyContact: false,
      linkUrl: fileUrl,
      extension: inferredExt,
      fileName: inferredName,
      caption,
      delayInSeconds: 0,
      isWhisper: false,
    },
  });
}
