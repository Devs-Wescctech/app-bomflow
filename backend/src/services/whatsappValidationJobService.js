import { randomUUID } from 'crypto';
import { validateNumbersStreaming, normalizePhone } from './whatsappValidationService.js';

const JOBS = new Map();

const JOB_TTL_MS = 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [id, job] of JOBS.entries()) {
    const ref = job.finishedAt || job.lastAccessedAt || job.startedAt;
    if (ref && (now - ref) > JOB_TTL_MS) {
      JOBS.delete(id);
    }
  }
}, CLEANUP_INTERVAL_MS).unref?.();

function publicView(job) {
  return {
    jobId: job.id,
    status: job.status,
    processed: job.processed,
    total: job.total,
    target: job.target,
    validFound: job.validPhones.length,
    remaining: Math.max(0, (job.total || 0) - (job.processed || 0)),
    invalid: job.invalid,
    errors: job.errors,
    cached: job.cached,
    fetched: job.fetched,
    cancelled: job.cancelRequested,
    finished: job.status === 'done' || job.status === 'cancelled' || job.status === 'error',
    error: job.error || null,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    validPhones: job.validPhones,
  };
}

export function startValidationJob({ rawPhones, target, userId }) {
  const phones = [];
  const seen = new Set();
  for (const p of rawPhones || []) {
    const n = normalizePhone(p);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    phones.push(n);
  }

  const id = randomUUID();
  const job = {
    id,
    userId,
    status: 'running',
    phones,
    target: Math.max(0, Number(target) || 0),
    total: phones.length,
    processed: 0,
    invalid: 0,
    errors: 0,
    cached: 0,
    fetched: 0,
    validPhones: [],
    cancelRequested: false,
    startedAt: Date.now(),
    finishedAt: null,
    lastAccessedAt: Date.now(),
    error: null,
  };
  JOBS.set(id, job);

  (async () => {
    try {
      await validateNumbersStreaming(phones, {
        concurrency: 16,
        shouldStop: () => job.cancelRequested || (job.target > 0 && job.validPhones.length >= job.target),
        onResult: ({ phone, status, fromCache }) => {
          job.processed++;
          if (fromCache) job.cached++; else job.fetched++;
          if (status === 'VALID_WA_NUMBER') {
            if (job.target === 0 || job.validPhones.length < job.target) {
              job.validPhones.push(phone);
            }
          } else if (status === 'INVALID_WA_NUMBER') {
            job.invalid++;
          } else {
            job.errors++;
          }
        },
      });
      job.status = job.cancelRequested ? 'cancelled' : 'done';
    } catch (err) {
      console.error('[whatsappValidationJob] failed', id, err);
      job.status = 'error';
      job.error = err.message || String(err);
    } finally {
      job.finishedAt = Date.now();
    }
  })();

  return publicView(job);
}

export function getValidationJob(id, userId, { isAdmin = false } = {}) {
  const job = JOBS.get(id);
  if (!job) return null;
  if (!isAdmin && job.userId !== userId) return null;
  job.lastAccessedAt = Date.now();
  return publicView(job);
}

export function cancelValidationJob(id, userId, { isAdmin = false } = {}) {
  const job = JOBS.get(id);
  if (!job) return null;
  if (!isAdmin && job.userId !== userId) return null;
  if (job.status === 'running') {
    job.cancelRequested = true;
  }
  job.lastAccessedAt = Date.now();
  return publicView(job);
}
