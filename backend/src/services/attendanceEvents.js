// Hub de eventos SSE do Atendimento (Chat v2). Mantém as conexões abertas em memória e
// distribui eventos (nova mensagem, atualização de conversa) para o frontend em tempo real.
// Cada cliente carrega o próprio escopo RBAC: quem tem attendanceReplyAny recebe tudo;
// os demais só recebem eventos de conversas atribuídas a si ou ainda não atribuídas.
// Processo único — suficiente para o deploy atual; se escalar horizontalmente, trocar por
// um pub/sub externo mantendo a mesma interface (subscribe/emit).

const clients = new Set(); // { res, agentId, replyAny }

const HEARTBEAT_MS = 25000;

export function subscribe(res, { agentId = null, replyAny = false } = {}) {
  const client = { res, agentId, replyAny };
  clients.add(client);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(`event: connected\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);

  const heartbeat = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      cleanup();
    }
  }, HEARTBEAT_MS);

  function cleanup() {
    clearInterval(heartbeat);
    clients.delete(client);
  }

  res.on('close', cleanup);
  return cleanup;
}

// Emite um evento respeitando o escopo. `scope.assignedUserIds` lista quem pode ver o
// evento além dos replyAny: ids de agentes envolvidos e/ou null (= conversa não atribuída,
// visível na fila para todos os atendentes). Best-effort: nunca lança.
export function emitAttendanceEvent(event, data, scope = {}) {
  const allowed = Array.isArray(scope.assignedUserIds) ? scope.assignedUserIds : [null];
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    const canSee =
      client.replyAny ||
      allowed.includes(null) ||
      (client.agentId && allowed.includes(client.agentId));
    if (!canSee) continue;
    try {
      client.res.write(payload);
    } catch {
      clients.delete(client);
    }
  }
}

export function connectedClientsCount() {
  return clients.size;
}
