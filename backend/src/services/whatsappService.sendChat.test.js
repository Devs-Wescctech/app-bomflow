// Testes do caminho de envio (sendChatMessage) focados na correção do nono dígito
// e na rede de segurança de entrega. Segue o padrão de mock da WHU via global.fetch
// já usado em whatsappChat.test.js: sem banco, sem rede real.

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.RUDO_WHATSAPP_TOKEN = process.env.RUDO_WHATSAPP_TOKEN || 'test-token';

import test from 'node:test';
import assert from 'node:assert/strict';

const { sendChatMessage } = await import('./whatsappService.js');

const API_HOST = 'api.wescctech.com.br';

let sendCalls = [];
// Status de entrega retornado por GET /chats/:id, por número enviado no create-new.
// Chave = número; valor = statusMessage (2=entregue, 0=falha).
let deliveryByNumber = {};
let lastCreatedNumber = null;

function reset() {
  sendCalls = [];
  deliveryByNumber = {};
  lastCreatedNumber = null;
}

function makeResponse(body, { ok = true, status = 200 } = {}) {
  return { ok, status, statusText: ok ? 'OK' : 'ERROR', json: async () => body };
}

global.fetch = async (url, opts = {}) => {
  const method = (opts.method || 'GET').toUpperCase();
  const parsed = new URL(url);
  assert.equal(parsed.host, API_HOST, `URL inesperada: ${url}`);
  const path = parsed.pathname;
  const body = opts.body ? JSON.parse(opts.body) : null;

  if (path.endsWith('/chats/create-new') && method === 'POST') {
    sendCalls.push({ type: 'create-new', number: body.number });
    lastCreatedNumber = body.number;
    // chatId codifica o número para o GET conseguir devolver o status certo.
    return makeResponse({ chatId: `chat:${body.number}`, contactId: 'c1' });
  }
  if (path.endsWith('/chats/send-text') && method === 'POST') {
    sendCalls.push({ type: 'send-text', number: body.number });
    return makeResponse({ ok: true });
  }
  if (path.endsWith('/chats/send-template') && method === 'POST') {
    sendCalls.push({ type: 'send-template', number: body.number });
    return makeResponse({ ok: true });
  }

  // GET /chats/:id?withMessages=true → devolve a thread com o status de entrega.
  const chatMatch = path.match(/\/chats\/([^/]+)$/);
  if (chatMatch && method === 'GET') {
    const chatId = decodeURIComponent(chatMatch[1]);
    const number = chatId.startsWith('chat:') ? chatId.slice(5) : null;
    const statusMessage = number != null ? deliveryByNumber[number] : undefined;
    return makeResponse({
      messages: statusMessage === undefined
        ? []
        : [{ isSentByMe: true, statusMessage }],
    });
  }

  return makeResponse({ msg: 'unmocked' }, { ok: false, status: 500 });
};

test('texto: número sem o nono dígito chega canônico (com o 9) à API', async () => {
  reset();
  const res = await sendChatMessage({ number: '(51) 8153-2008', message: 'olá' });
  const textSends = sendCalls.filter((c) => c.type === 'send-text');
  assert.equal(textSends.length, 1);
  assert.equal(textSends[0].number, '5551981532008', 'deve enviar com o nono dígito');
  assert.equal(res.brazilNumber, '5551981532008');
});

test('template: número canônico é usado no create-new', async () => {
  reset();
  // Sem status de entrega configurado → 'unknown' → não tenta variante.
  await sendChatMessage({ number: '51 8153-2008', templateId: 'tpl1' });
  const creates = sendCalls.filter((c) => c.type === 'create-new');
  assert.equal(creates.length, 1);
  assert.equal(creates[0].number, '5551981532008');
});

test('entrega confirmada no número canônico: sucesso sem tentar a variante', async () => {
  reset();
  deliveryByNumber['5551981532008'] = 2; // entregue
  const res = await sendChatMessage({ number: '51 98153-2008', templateId: 'tpl1' });
  const creates = sendCalls.filter((c) => c.type === 'create-new');
  assert.equal(creates.length, 1, 'não deve tentar a variante quando entregou');
  assert.equal(res.brazilNumber, '5551981532008');
  assert.notEqual(res.usedAlternateNumber, true);
});

test('falha no canônico: tenta a variante alternativa (sem o 9) automaticamente', async () => {
  reset();
  deliveryByNumber['5551981532008'] = 0; // falha no canônico (com o 9)
  deliveryByNumber['555181532008'] = 2; // entregue na variante (sem o 9)
  const res = await sendChatMessage({ number: '51 98153-2008', templateId: 'tpl1' });
  const creates = sendCalls.filter((c) => c.type === 'create-new').map((c) => c.number);
  assert.deepEqual(creates, ['5551981532008', '555181532008'], 'canônico e depois a variante');
  assert.equal(res.usedAlternateNumber, true);
  assert.equal(res.brazilNumber, '555181532008');
});

test('falha nas duas variantes: erro claro, nunca reporta sucesso silencioso', async () => {
  reset();
  deliveryByNumber['5551981532008'] = 0;
  deliveryByNumber['555181532008'] = 0;
  await assert.rejects(
    () => sendChatMessage({ number: '51 98153-2008', templateId: 'tpl1' }),
    /não foi possível entregar/i
  );
  const creates = sendCalls.filter((c) => c.type === 'create-new').map((c) => c.number);
  assert.deepEqual(creates, ['5551981532008', '555181532008']);
});
