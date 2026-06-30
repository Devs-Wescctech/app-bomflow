// Serviço de dias úteis / feriados para o auto-cancelamento da Fila Pré Vendas.
//
// Feriados via API invertexto (https://api.invertexto.com/v1/holidays/{ano}?token=...&state=SP).
// O token vem SEMPRE de process.env.INVERTEXTO_TOKEN (nunca hardcoded). O estado é
// configurável por INVERTEXTO_STATE (padrão SP). Resultado em cache por ano (TTL 7 dias).
//
// FAIL-SAFE: se o token não estiver configurado ou a API falhar/indisponível, as funções
// LANÇAM erro. O job de auto-cancelamento captura esse erro e ABSTÉM-SE de cancelar no ciclo
// (adiar é mais seguro do que cancelar num possível feriado).

const STATE = (process.env.INVERTEXTO_STATE || 'SP').toUpperCase();
const HOLIDAYS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const BRT_TZ = 'America/Sao_Paulo';

// year -> { set: Set<'YYYY-MM-DD'>, ts: number }
const holidayCache = new Map();

// Data (calendário) no fuso de São Paulo, no formato 'YYYY-MM-DD' (en-CA => YYYY-MM-DD).
export function brtDateStr(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BRT_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function parseYmd(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fmtYmd(dt) {
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isWeekendUTC(dt) {
  const wd = dt.getUTCDay();
  return wd === 0 || wd === 6; // domingo ou sábado
}

async function fetchHolidays(year) {
  const token = process.env.INVERTEXTO_TOKEN;
  if (!token) {
    throw new Error('INVERTEXTO_TOKEN não configurado (necessário para calcular dias úteis).');
  }
  const url = `https://api.invertexto.com/v1/holidays/${year}?token=${encodeURIComponent(token)}&state=${encodeURIComponent(STATE)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!resp.ok) {
      throw new Error(`API de feriados retornou HTTP ${resp.status}`);
    }
    const data = await resp.json();
    if (!Array.isArray(data)) {
      throw new Error('Resposta inesperada da API de feriados (esperado array).');
    }
    const set = new Set();
    for (const h of data) {
      if (h && typeof h.date === 'string') set.add(h.date.slice(0, 10));
    }
    return set;
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') throw new Error('Timeout ao consultar a API de feriados.');
    throw err;
  }
}

async function getHolidaySet(year) {
  const cached = holidayCache.get(year);
  if (cached && (Date.now() - cached.ts) < HOLIDAYS_TTL_MS) return cached.set;
  const set = await fetchHolidays(year);
  holidayCache.set(year, { set, ts: Date.now() });
  return set;
}

// Adiciona N dias úteis a partir de startYmd ('YYYY-MM-DD'), EXCLUINDO o próprio dia inicial.
// Pula fins de semana e feriados (estado configurado). Carrega feriados sob demanda por ano.
export async function addBusinessDays(startYmd, n) {
  let dt = parseYmd(startYmd);
  const sets = new Map();
  const setFor = async (y) => {
    if (!sets.has(y)) sets.set(y, await getHolidaySet(y));
    return sets.get(y);
  };
  let added = 0;
  let guard = 0;
  while (added < n) {
    dt = new Date(dt.getTime() + 24 * 60 * 60 * 1000);
    const hs = await setFor(dt.getUTCFullYear());
    if (!isWeekendUTC(dt) && !hs.has(fmtYmd(dt))) added++;
    if (++guard > 3650) throw new Error('addBusinessDays: guard de laço excedido.');
  }
  return fmtYmd(dt);
}

// Retorna se HOJE (fuso BRT) já passou do prazo de `businessDays` dias úteis a partir de `fromDate`.
// fromDate: Date (ex.: created_at vindo do pg). asOf: data de referência (padrão = agora).
// Lança erro se os feriados não puderem ser obtidos (fail-safe a cargo do chamador).
export async function isPastBusinessDayDeadline(fromDate, businessDays, asOf = new Date()) {
  const startYmd = brtDateStr(fromDate);
  const deadlineYmd = await addBusinessDays(startYmd, businessDays);
  const todayYmd = brtDateStr(asOf);
  return { overdue: todayYmd > deadlineYmd, startYmd, deadlineYmd, todayYmd };
}
