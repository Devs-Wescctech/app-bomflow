// Auditoria centralizada de TODAS as chamadas de saída ao ERP:
//   - REST (erp.wescctech.com.br / api.grupobompastor.com.br) — interceptação do fetch global
//   - Banco direto do ERP — hook chamado pelo erpDbService
//
// A gravação é assíncrona/best-effort (setImmediate + catch): nunca quebra nem atrasa
// a chamada original. Tokens NUNCA são gravados (headers não são registrados e o
// query param `token` é mascarado na URL).
//
// Origem: propagada via AsyncLocalStorage. O middleware HTTP registra "MÉTODO /rota"
// + e-mail do usuário autenticado; rotinas automáticas usam withErpOrigin('cron:...').

import { AsyncLocalStorage } from 'async_hooks';
import { query } from '../config/database.js';

const originStore = new AsyncLocalStorage();

const ERP_HOSTS = ['erp.wescctech.com.br', 'api.grupobompastor.com.br'];

export function getErpOrigin() {
  return originStore.getStore() || { origin: 'desconhecido', user: null };
}

// Executa fn dentro de um contexto de origem (rotinas automáticas / crons).
export function withErpOrigin(origin, fn) {
  return originStore.run({ origin, user: null }, fn);
}

// Middleware Express: toda requisição HTTP carrega a rota + usuário como origem.
// O user é resolvido "preguiçosamente" na hora do log (authMiddleware roda depois).
export function erpOriginMiddleware(req, res, next) {
  const ctx = {
    get origin() {
      const route = `${req.method} ${req.baseUrl || ''}${req.route?.path || req.path || ''}`;
      return route.length > 200 ? route.slice(0, 200) : route;
    },
    get user() {
      return req.user?.email || null;
    },
  };
  originStore.run(ctx, next);
}

// Mascara valores sensíveis na URL (token nunca pode ir para o log).
function sanitizeUrl(url) {
  try {
    const u = new URL(url);
    for (const p of ['token', 'senha', 'password', 'apikey', 'api_key']) {
      if (u.searchParams.has(p)) u.searchParams.set(p, '***');
    }
    return u.toString();
  } catch {
    return String(url).replace(/([?&](?:token|senha|password|apikey|api_key)=)[^&]*/gi, '$1***');
  }
}

// Gravação assíncrona best-effort — nunca lança nem bloqueia o caminho da chamada.
export function logErpRequest({ kind, endpoint, method, statusCode, success, durationMs, error }) {
  const ctx = getErpOrigin();
  const origin = String(ctx.origin || 'desconhecido').slice(0, 200);
  const user = ctx.user ? String(ctx.user).slice(0, 200) : null;
  setImmediate(() => {
    query(
      `INSERT INTO erp_request_logs (kind, endpoint, method, origin, origin_user, status_code, success, duration_ms, error)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        kind,
        String(endpoint || '').slice(0, 600),
        method ? String(method).toUpperCase().slice(0, 10) : null,
        origin,
        user,
        Number.isFinite(statusCode) ? statusCode : null,
        success !== false,
        Number.isFinite(durationMs) ? Math.round(durationMs) : null,
        error ? String(error).slice(0, 500) : null,
      ]
    ).catch((e) => {
      // best-effort: nunca propaga
      if (!logErpRequest._warned) {
        logErpRequest._warned = true;
        console.warn('[erpAudit] Falha ao gravar log (silenciado nas próximas):', e.message);
      }
    });
  });
}

// Intercepta o fetch global: qualquer chamada aos hosts do ERP é cronometrada e logada,
// sem precisar migrar cada call site individualmente (cobre 100% das chamadas REST).
let fetchInstalled = false;
export function installErpFetchAudit() {
  if (fetchInstalled) return;
  fetchInstalled = true;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async function erpAuditedFetch(input, init) {
    let urlStr = '';
    try {
      urlStr = typeof input === 'string' ? input : (input?.url || String(input));
    } catch { urlStr = ''; }

    const isErp = ERP_HOSTS.some((h) => urlStr.includes(h));
    if (!isErp) return originalFetch(input, init);

    const method = (init?.method || (typeof input === 'object' && input?.method) || 'GET').toUpperCase();
    const endpoint = sanitizeUrl(urlStr);
    const start = Date.now();
    try {
      const resp = await originalFetch(input, init);
      logErpRequest({
        kind: 'rest', endpoint, method,
        statusCode: resp.status, success: resp.ok,
        durationMs: Date.now() - start,
      });
      return resp;
    } catch (err) {
      logErpRequest({
        kind: 'rest', endpoint, method,
        statusCode: null, success: false,
        durationMs: Date.now() - start,
        error: err.message,
      });
      throw err;
    }
  };
  console.log('[erpAudit] Interceptação de fetch para hosts do ERP instalada.');
}

// Resumo legível de uma query SQL ao banco ERP (operação + tabela + trecho).
export function summarizeSql(sql) {
  const compact = String(sql || '').replace(/\s+/g, ' ').trim();
  return compact.length > 300 ? compact.slice(0, 300) + '…' : compact;
}

// Hook para o erpDbService: registra uma query direta ao banco ERP.
export function logErpDbQuery(sql, durationMs, success, errorMsg) {
  logErpRequest({
    kind: 'db',
    endpoint: summarizeSql(sql),
    method: (String(sql || '').trim().split(/\s+/)[0] || 'SQL').toUpperCase(),
    statusCode: null,
    success,
    durationMs,
    error: errorMsg || null,
  });
}

// Limpeza de retenção: remove registros com mais de 30 dias.
export async function cleanupErpRequestLogs(days = 30) {
  try {
    const r = await query(
      `DELETE FROM erp_request_logs WHERE created_at < NOW() - ($1 || ' days')::interval`,
      [days]
    );
    console.log(`[erpAudit] Limpeza de retenção: ${r.rowCount} registros removidos (> ${days} dias).`);
    return r.rowCount;
  } catch (e) {
    console.error('[erpAudit] Erro na limpeza de retenção:', e.message);
    return 0;
  }
}
