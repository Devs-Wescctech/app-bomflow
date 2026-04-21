import { query } from '../config/database.js';

const WHATSAPP_API_BASE = 'https://api.wescctech.com.br/core/v2/api';
const VALID_TTL_DAYS = 30;
const INVALID_TTL_DAYS = 90;
const MAX_PARALLEL = 12;
const REQUEST_TIMEOUT_MS = 8000;

function normalizePhone(phone) {
  if (!phone) return '';
  let cleaned = String(phone).replace(/\D/g, '');
  if (!cleaned) return '';
  if (!cleaned.startsWith('55') && (cleaned.length === 10 || cleaned.length === 11)) {
    cleaned = '55' + cleaned;
  }
  return cleaned;
}

async function fetchCachedValidations(phones) {
  if (phones.length === 0) return new Map();
  const result = await query(
    `SELECT phone, status, validated_at FROM whatsapp_number_validations
     WHERE phone = ANY($1::text[])
       AND (
         (status = 'VALID_WA_NUMBER' AND validated_at >= NOW() - INTERVAL '${VALID_TTL_DAYS} days')
         OR (status = 'INVALID_WA_NUMBER' AND validated_at >= NOW() - INTERVAL '${INVALID_TTL_DAYS} days')
       )`,
    [phones]
  );
  const map = new Map();
  for (const row of result.rows) map.set(row.phone, row.status);
  return map;
}

async function upsertValidation(phone, status, rawResponse) {
  await query(
    `INSERT INTO whatsapp_number_validations (phone, status, raw_response, validated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (phone) DO UPDATE
       SET status = EXCLUDED.status,
           raw_response = EXCLUDED.raw_response,
           validated_at = NOW()`,
    [phone, status, rawResponse ? JSON.stringify(rawResponse) : null]
  );
}

async function callWhuCheck(phone, token) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const resp = await fetch(`${WHATSAPP_API_BASE}/wa-number-check/${phone}`, {
      method: 'POST',
      headers: { 'access-token': token, 'Accept': 'application/json' },
      signal: controller.signal,
    });
    const text = await resp.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = { rawText: text }; }
    const status = json?.status;
    if (status === 'VALID_WA_NUMBER' || status === 'INVALID_WA_NUMBER') {
      return { status, raw: json };
    }
    return { status: null, raw: json, httpStatus: resp.status };
  } catch (err) {
    return { status: null, error: err.message };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function runWithConcurrency(items, limit, worker, opts = {}) {
  const { shouldStop } = opts;
  const results = new Array(items.length);
  let cursor = 0;
  async function next() {
    while (true) {
      if (typeof shouldStop === 'function' && shouldStop()) return;
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  }
  const runners = Array.from({ length: Math.min(limit, items.length) }, () => next());
  await Promise.all(runners);
  return results;
}

export { normalizePhone };

/**
 * Streaming/cancellable variant used by the async validation job.
 *
 * Validates `phones` (already deduped + normalized) one-by-one with internal
 * concurrency. As each phone is resolved, `onResult({ phone, status, fromCache, error })`
 * is invoked synchronously so the caller can update progress / accumulate
 * valid phones / decide to stop early via `shouldStop()`.
 *
 * Stops as soon as `shouldStop()` returns true (used both for cancellation
 * and to short-circuit when the target valid count is reached).
 */
export async function validateNumbersStreaming(phones, { onResult, shouldStop, concurrency = MAX_PARALLEL } = {}) {
  const token = process.env.RUDO_WHATSAPP_TOKEN;
  if (!token) throw new Error('RUDO_WHATSAPP_TOKEN not configured');

  const cache = await fetchCachedValidations(phones);

  await runWithConcurrency(phones, concurrency, async (phone) => {
    if (typeof shouldStop === 'function' && shouldStop()) return;

    if (cache.has(phone)) {
      const status = cache.get(phone);
      onResult?.({ phone, status, fromCache: true });
      return;
    }

    const r = await callWhuCheck(phone, token);
    if (r.status === 'VALID_WA_NUMBER' || r.status === 'INVALID_WA_NUMBER') {
      try { await upsertValidation(phone, r.status, r.raw); } catch (e) {
        console.error('[whatsappValidation] upsert failed', phone, e.message);
      }
      onResult?.({ phone, status: r.status, fromCache: false });
    } else {
      onResult?.({ phone, status: 'UNKNOWN', fromCache: false, error: r.error || `http=${r.httpStatus}` });
    }
  }, { shouldStop });
}

export async function validateNumbers(rawPhones) {
  const token = process.env.RUDO_WHATSAPP_TOKEN;
  if (!token) throw new Error('RUDO_WHATSAPP_TOKEN not configured');

  const normalized = [];
  const seen = new Set();
  for (const p of rawPhones || []) {
    const n = normalizePhone(p);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    normalized.push(n);
  }

  const results = {};
  if (normalized.length === 0) return { results, stats: { total: 0, cached: 0, fetched: 0, valid: 0, invalid: 0, errors: 0 } };

  const cache = await fetchCachedValidations(normalized);
  const toFetch = [];
  for (const phone of normalized) {
    if (cache.has(phone)) {
      results[phone] = cache.get(phone);
    } else {
      toFetch.push(phone);
    }
  }

  let errors = 0;
  await runWithConcurrency(toFetch, MAX_PARALLEL, async (phone) => {
    const r = await callWhuCheck(phone, token);
    if (r.status === 'VALID_WA_NUMBER' || r.status === 'INVALID_WA_NUMBER') {
      results[phone] = r.status;
      try { await upsertValidation(phone, r.status, r.raw); } catch (e) {
        console.error('[whatsappValidation] upsert failed', phone, e.message);
      }
    } else {
      errors++;
      results[phone] = 'UNKNOWN';
      console.warn('[whatsappValidation] WHU check failed', phone, r.error || `http=${r.httpStatus}`);
    }
  });

  let valid = 0, invalid = 0;
  for (const k of Object.keys(results)) {
    if (results[k] === 'VALID_WA_NUMBER') valid++;
    else if (results[k] === 'INVALID_WA_NUMBER') invalid++;
  }

  return {
    results,
    stats: {
      total: normalized.length,
      cached: cache.size,
      fetched: toFetch.length,
      valid,
      invalid,
      errors,
    },
  };
}

