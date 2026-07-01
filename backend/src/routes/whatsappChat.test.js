// Testes de controle de acesso das conversas de WhatsApp.
//
// Objetivo: garantir que um atendente comum nunca acesse (listar / ler / enviar)
// conversas de outro vendedor, enquanto supervisores e admins veem tudo.
//
// Estratégia: os handlers reais são exercitados com objetos req/res simulados.
// A única dependência externa (a API WHU) é acessada exclusivamente via
// `global.fetch`, que aqui é substituído por um mock roteado por URL/método.
// Assim os testes são herméticos: sem banco, sem JWT e sem rede.

// Env precisa estar definido ANTES de importar a cadeia de módulos
// (database.js lança se DATABASE_URL não existir; os serviços exigem o token).
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.RUDO_WHATSAPP_TOKEN = process.env.RUDO_WHATSAPP_TOKEN || 'test-token';

import test from 'node:test';
import assert from 'node:assert/strict';

const { listConversationsHandler, getMessagesHandler, sendMessageHandler } =
  await import('./whatsappChat.js');

const API_HOST = 'api.wescctech.com.br';

// ---------------------------------------------------------------------------
// Estado controlável pelo mock de fetch
// ---------------------------------------------------------------------------
const WESCC_USERS = [
  { email: 'agente@wescc.com', id: 200 },
  { email: 'outro@wescc.com', id: 201 },
];

// Chats por status para POST /chats/list(-lite)
const CHATS_BY_STATUS = {
  2: [
    { id: 'a', currentUser: { id: 200 }, contact: { name: 'Cliente A', number: '5511900000001' } },
    { id: 'b', currentUser: { id: 201 }, contact: { name: 'Cliente B', number: '5511900000002' } },
    { id: 'c', currentUser: { id: 999 }, contact: { name: 'Cliente C', number: '5511900000003' } },
  ],
};

// Chats individuais para GET /chats/:id (ler thread / resolver destino no envio)
const CHATS_BY_ID = {
  owned: { currentUser: { id: 200 }, contact: { id: 'cid1', number: '5511999990000', name: 'Meu Cliente' }, messages: [] },
  other: { currentUser: { id: 999 }, contact: { id: 'cid2', number: '5511888887777', name: 'Cliente Alheio' }, messages: [] },
  nocontact: { currentUser: { id: 200 }, contact: null, messages: [] },
  // 'missing' não existe → 404
};

let sendCalls = [];
let contactCalls = [];

function resetCalls() {
  sendCalls = [];
  contactCalls = [];
}

function makeResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'ERROR',
    json: async () => body,
  };
}

// Mock de fetch roteado por caminho + método.
global.fetch = async (url, opts = {}) => {
  const method = (opts.method || 'GET').toUpperCase();
  const parsed = new URL(url);
  assert.equal(parsed.host, API_HOST, `URL inesperada no teste: ${url}`);
  const path = parsed.pathname;
  const body = opts.body ? JSON.parse(opts.body) : null;

  if (path.endsWith('/users') && method === 'GET') {
    return makeResponse(WESCC_USERS);
  }

  if ((path.endsWith('/chats/list') || path.endsWith('/chats/list-lite')) && method === 'POST') {
    const status = body?.status ?? 0;
    return makeResponse({ chats: CHATS_BY_STATUS[status] || [] });
  }

  if (path.endsWith('/chats/create-new') && method === 'POST') {
    sendCalls.push({ type: 'create-new', body });
    return makeResponse({ contactId: 'created-contact' });
  }
  if (path.endsWith('/chats/send-text') && method === 'POST') {
    sendCalls.push({ type: 'send-text', body });
    return makeResponse({ ok: true });
  }
  if (path.endsWith('/chats/send-template') && method === 'POST') {
    sendCalls.push({ type: 'send-template', body });
    return makeResponse({ ok: true });
  }

  // GET /chats/:id?withMessages=true (a query fica fora de pathname)
  const chatMatch = path.match(/\/chats\/([^/]+)$/);
  if (chatMatch && method === 'GET') {
    const chat = CHATS_BY_ID[chatMatch[1]];
    if (!chat) return makeResponse(null, { ok: false, status: 404 });
    return makeResponse(chat);
  }

  if (path.endsWith('/set-attributes') && method === 'POST') {
    contactCalls.push({ path, body });
    return makeResponse({ ok: true });
  }
  if (path.endsWith('/contacts') && method === 'GET') {
    return makeResponse([]);
  }

  return makeResponse({ msg: 'unmocked' }, { ok: false, status: 500 });
};

// ---------------------------------------------------------------------------
// Fixtures de atores e helpers de req/res
// ---------------------------------------------------------------------------
const AGENT_COMMON = {
  user: { email: 'agente@wescc.com', role: 'agent' },
  agent: { id: 'ag200', name: 'Agente Comum', agentType: 'sales_agent' },
};
const AGENT_UNMAPPED = {
  user: { email: 'ghost@wescc.com', role: 'agent' },
  agent: { id: 'ghost', name: 'Sem WHU', agentType: 'sales_agent' },
};
const SUPERVISOR = {
  user: { email: 'sup@wescc.com', role: 'supervisor' },
  agent: { id: 'sup1', name: 'Supervisor', agentType: 'sales_supervisor' },
};
const ADMIN = {
  user: { email: 'admin@wescc.com', role: 'admin' },
  agent: { id: 'adm1', name: 'Admin', agentType: 'admin' },
};

function makeReq(actor, { params = {}, query = {}, body = {} } = {}) {
  return { user: actor.user, agent: actor.agent, params, query, body };
}

function makeRes() {
  const res = { statusCode: 200, body: undefined };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    res.body = payload;
    return res;
  };
  return res;
}

async function run(handler, req) {
  const res = makeRes();
  await handler(req, res);
  return res;
}

// ===========================================================================
// LISTAR conversas
// ===========================================================================
test('listar: agente comum vê apenas as próprias conversas', async () => {
  resetCalls();
  const res = await run(listConversationsHandler, makeReq(AGENT_COMMON, { query: { status: '2' } }));
  assert.equal(res.statusCode, 200);
  const ids = res.body.chats.map((c) => c.id);
  assert.deepEqual(ids, ['a'], 'deve retornar somente o chat cujo currentUser é o próprio agente');
});

test('listar: agente sem usuário WHU correspondente não vê nenhuma conversa', async () => {
  const res = await run(listConversationsHandler, makeReq(AGENT_UNMAPPED, { query: { status: '2' } }));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.chats, [], 'sem mapeamento de vendedor => lista vazia (nunca todas)');
});

test('listar: supervisor vê todas as conversas', async () => {
  const res = await run(listConversationsHandler, makeReq(SUPERVISOR, { query: { status: '2' } }));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.chats.map((c) => c.id), ['a', 'b', 'c']);
});

test('listar: admin vê todas as conversas', async () => {
  const res = await run(listConversationsHandler, makeReq(ADMIN, { query: { status: '2' } }));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.chats.map((c) => c.id), ['a', 'b', 'c']);
});

// ===========================================================================
// LER thread
// ===========================================================================
test('ler thread: agente comum lê a própria conversa', async () => {
  const res = await run(getMessagesHandler, makeReq(AGENT_COMMON, { params: { attendanceId: 'owned' } }));
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.contact.id, 'cid1');
});

test('ler thread: agente comum recebe 403 na conversa de outro vendedor', async () => {
  const res = await run(getMessagesHandler, makeReq(AGENT_COMMON, { params: { attendanceId: 'other' } }));
  assert.equal(res.statusCode, 403);
});

test('ler thread: conversa inexistente retorna 404', async () => {
  const res = await run(getMessagesHandler, makeReq(AGENT_COMMON, { params: { attendanceId: 'missing' } }));
  assert.equal(res.statusCode, 404);
});

test('ler thread: supervisor lê a conversa de qualquer vendedor', async () => {
  const res = await run(getMessagesHandler, makeReq(SUPERVISOR, { params: { attendanceId: 'other' } }));
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.contact.id, 'cid2');
});

test('ler thread: admin lê a conversa de qualquer vendedor', async () => {
  const res = await run(getMessagesHandler, makeReq(ADMIN, { params: { attendanceId: 'other' } }));
  assert.equal(res.statusCode, 200);
});

// ===========================================================================
// ENVIAR mensagem
// ===========================================================================
test('enviar: agente comum envia na própria conversa e o destino vem da conversa (ignora number do corpo)', async () => {
  resetCalls();
  const res = await run(
    sendMessageHandler,
    makeReq(AGENT_COMMON, {
      params: { attendanceId: 'owned' },
      // number malicioso no corpo: precisa ser ignorado.
      body: { message: 'olá', number: '5599999999999' },
    })
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  const textSends = sendCalls.filter((c) => c.type === 'send-text');
  assert.equal(textSends.length, 1, 'deve enviar exatamente um texto');
  assert.equal(textSends[0].body.number, '5511999990000', 'usa o número da conversa');
  assert.notEqual(textSends[0].body.number, '5599999999999', 'nunca usa o number do corpo');
});

test('enviar: agente comum recebe 403 e NADA é enviado na conversa de outro vendedor', async () => {
  resetCalls();
  const res = await run(
    sendMessageHandler,
    makeReq(AGENT_COMMON, {
      params: { attendanceId: 'other' },
      body: { message: 'tentando invadir' },
    })
  );
  assert.equal(res.statusCode, 403);
  assert.equal(sendCalls.length, 0, 'nenhuma chamada de envio deve ocorrer em conversa alheia');
});

test('enviar: sem texto nem template retorna 400', async () => {
  resetCalls();
  const res = await run(
    sendMessageHandler,
    makeReq(AGENT_COMMON, { params: { attendanceId: 'owned' }, body: {} })
  );
  assert.equal(res.statusCode, 400);
  assert.equal(sendCalls.length, 0);
});

test('enviar: conversa sem número de contato retorna 400', async () => {
  resetCalls();
  const res = await run(
    sendMessageHandler,
    makeReq(AGENT_COMMON, { params: { attendanceId: 'nocontact' }, body: { message: 'oi' } })
  );
  assert.equal(res.statusCode, 400);
  assert.equal(sendCalls.length, 0);
});

test('enviar: supervisor envia em conversa de qualquer vendedor', async () => {
  resetCalls();
  const res = await run(
    sendMessageHandler,
    makeReq(SUPERVISOR, { params: { attendanceId: 'other' }, body: { message: 'suporte' } })
  );
  assert.equal(res.statusCode, 200);
  const textSends = sendCalls.filter((c) => c.type === 'send-text');
  assert.equal(textSends.length, 1);
  assert.equal(textSends[0].body.number, '5511888887777', 'usa o número da conversa alvo');
});

test('enviar: admin envia em conversa de qualquer vendedor', async () => {
  resetCalls();
  const res = await run(
    sendMessageHandler,
    makeReq(ADMIN, { params: { attendanceId: 'other' }, body: { message: 'admin aqui' } })
  );
  assert.equal(res.statusCode, 200);
  const textSends = sendCalls.filter((c) => c.type === 'send-text');
  assert.equal(textSends.length, 1);
  assert.equal(textSends[0].body.number, '5511888887777', 'usa o número da conversa alvo');
});
