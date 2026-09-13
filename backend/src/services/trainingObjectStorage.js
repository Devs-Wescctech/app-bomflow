import { Storage } from '@google-cloud/storage';
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import fs from 'node:fs';
import { mkdir, open, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pipeline } from 'node:stream/promises';

const SIDECAR = 'http://127.0.0.1:1106';
const storage = new Storage({
  credentials: {
    audience: 'replit',
    subject_token_type: 'access_token',
    token_url: `${SIDECAR}/token`,
    type: 'external_account',
    credential_source: {
      url: `${SIDECAR}/credential`,
      format: { type: 'json', subject_token_field_name: 'access_token' },
    },
    universe_domain: 'googleapis.com',
  },
  projectId: '',
});

export function isTrainingStorageConfigured() {
  const driver = getTrainingStorageDriver();
  if (driver === 'local') {
    return Boolean(process.env.TRAINING_STORAGE_DIR && signingSecret());
  }
  return driver === 'replit' && Boolean(process.env.PRIVATE_OBJECT_DIR);
}

export function getTrainingStorageDriver() {
  const configured = String(process.env.TRAINING_STORAGE_DRIVER || '').trim().toLowerCase();
  if (configured === 'local' || configured === 'replit') return configured;
  if (process.env.TRAINING_STORAGE_DIR) return 'local';
  if (process.env.PRIVATE_OBJECT_DIR) return 'replit';
  return null;
}

export function isTrainingLocalStorage() {
  return getTrainingStorageDriver() === 'local';
}

function signingSecret() {
  return process.env.SESSION_SECRET || process.env.JWT_SECRET || '';
}

function localPath(objectPath) {
  const rootValue = process.env.TRAINING_STORAGE_DIR;
  if (!rootValue) {
    const error = new Error('Armazenamento local de treinamentos não configurado.');
    error.statusCode = 503;
    throw error;
  }
  const root = path.resolve(rootValue);
  const target = path.resolve(root, String(objectPath || '').replace(/^\/+/, ''));
  if (target === root || !target.startsWith(`${root}${path.sep}`)) {
    const error = new Error('Caminho do armazenamento inválido.');
    error.statusCode = 400;
    throw error;
  }
  return target;
}

async function localObjectSize(objectPath) {
  try {
    return (await stat(localPath(objectPath))).size;
  } catch (error) {
    if (error.code === 'ENOENT') return 0;
    throw error;
  }
}

async function acquireLocalObjectLock(objectPath) {
  const lockPath = `${localPath(objectPath)}.lock`;
  const staleAfterMs = 5 * 60 * 1000;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const handle = await open(lockPath, 'wx', 0o600);
      const heartbeat = setInterval(() => {
        const now = new Date();
        handle.utimes(now, now).catch(() => {});
      }, 30 * 1000);
      heartbeat.unref();
      return async () => {
        clearInterval(heartbeat);
        await handle.close().catch(() => {});
        await unlink(lockPath).catch((error) => {
          if (error.code !== 'ENOENT') throw error;
        });
      };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      try {
        const lockStat = await stat(lockPath);
        if (Date.now() - lockStat.mtimeMs > staleAfterMs) {
          await unlink(lockPath);
          continue;
        }
      } catch (lockError) {
        if (lockError.code === 'ENOENT') continue;
        throw lockError;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  const error = new Error('Outro envio desta sessão ainda está em andamento.');
  error.statusCode = 409;
  throw error;
}

function parsePath(path) {
  const parts = `/${String(path).replace(/^\/+/, '')}`.split('/');
  if (parts.length < 3) throw new Error('Caminho do armazenamento inválido');
  return { bucket: parts[1], object: parts.slice(2).join('/') };
}

function privatePath(objectPath) {
  const root = process.env.PRIVATE_OBJECT_DIR;
  if (!root) {
    const error = new Error('Armazenamento privado indisponível neste ambiente.');
    error.statusCode = 503;
    throw error;
  }
  return `${root.replace(/\/$/, '')}/${objectPath.replace(/^\/+/, '')}`;
}

async function sign({ bucket, object, method, ttlSec }) {
  const response = await fetch(`${SIDECAR}/object-storage/signed-object-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      bucket_name: bucket,
      object_name: object,
      method,
      expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
    }),
  });
  if (!response.ok) throw new Error(`Não foi possível gerar acesso temporário ao arquivo (${response.status}).`);
  return (await response.json()).signed_url;
}

export async function createTrainingUploadUrl(kind, contentType, { trainingId, uploadId } = {}) {
  const objectPath = `training/${kind}/${randomUUID()}`;
  if (isTrainingLocalStorage()) {
    if (!trainingId || !uploadId) throw new Error('Sessão local de envio inválida.');
    await mkdir(path.dirname(localPath(objectPath)), { recursive: true });
    return {
      objectPath,
      uploadUrl: `/api/trainings/${encodeURIComponent(trainingId)}/uploads/${encodeURIComponent(uploadId)}/content`,
      expiresIn: 7 * 24 * 60 * 60,
    };
  }
  const { bucket, object } = parsePath(privatePath(objectPath));
  const [uploadUrl] = await storage.bucket(bucket).file(object).createResumableUpload({
    origin: '*',
    metadata: { contentType },
  });
  return { objectPath, uploadUrl, expiresIn: 3600 };
}

export async function createTrainingReadUrl(objectPath) {
  if (isTrainingLocalStorage()) {
    const secret = signingSecret();
    if (!secret) throw new Error('Assinatura do armazenamento local não configurada.');
    localPath(objectPath);
    const encodedPath = Buffer.from(objectPath, 'utf8').toString('base64url');
    const expires = Math.floor(Date.now() / 1000) + 900;
    const payload = `${encodedPath}.${expires}`;
    const signature = createHmac('sha256', secret).update(payload).digest('base64url');
    return `/api/trainings/storage/${encodedPath}?expires=${expires}&signature=${signature}`;
  }
  const { bucket, object } = parsePath(privatePath(objectPath));
  return sign({ bucket, object, method: 'GET', ttlSec: 900 });
}

export function verifyTrainingReadUrl(encodedPath, expiresValue, signature) {
  if (!isTrainingLocalStorage()) {
    const error = new Error('Arquivo não encontrado.');
    error.statusCode = 404;
    throw error;
  }
  const expires = Number(expiresValue);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isInteger(expires) || expires < now || !signature) {
    const error = new Error('O acesso temporário ao arquivo expirou.');
    error.statusCode = 403;
    throw error;
  }
  const expected = createHmac('sha256', signingSecret())
    .update(`${encodedPath}.${expires}`)
    .digest('base64url');
  const receivedBuffer = Buffer.from(String(signature));
  const expectedBuffer = Buffer.from(expected);
  if (receivedBuffer.length !== expectedBuffer.length || !timingSafeEqual(receivedBuffer, expectedBuffer)) {
    const error = new Error('Assinatura de acesso inválida.');
    error.statusCode = 403;
    throw error;
  }
  const objectPath = Buffer.from(encodedPath, 'base64url').toString('utf8');
  localPath(objectPath);
  return objectPath;
}

export async function getTrainingUploadOffset(uploadUrl, totalSize, objectPath = null) {
  if (isTrainingLocalStorage()) {
    const size = await localObjectSize(objectPath);
    if (size > totalSize) throw new Error('O arquivo recebido excede o tamanho esperado.');
    return size;
  }
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Length': '0',
      'Content-Range': `bytes */${totalSize}`,
    },
  });
  if (response.ok) return totalSize;
  if (response.status === 308) {
    const range = response.headers.get('range');
    return range ? Number(range.split('-')[1]) + 1 : 0;
  }
  const error = new Error(
    response.status === 404 || response.status === 410
      ? 'A sessão de envio expirou. Exclua o envio pendente e comece novamente.'
      : `Não foi possível consultar o ponto de retomada (${response.status}).`
  );
  error.statusCode = response.status === 404 || response.status === 410 ? 410 : 502;
  throw error;
}

export function getTrainingObject(objectPath) {
  if (isTrainingLocalStorage()) {
    const target = localPath(objectPath);
    return {
      async getMetadata() {
        const metadata = await stat(target);
        return [{ size: String(metadata.size) }];
      },
      createReadStream(options = {}) {
        return fs.createReadStream(target, options);
      },
      async delete({ ignoreNotFound = false } = {}) {
        try {
          await unlink(target);
        } catch (error) {
          if (!(ignoreNotFound && error.code === 'ENOENT')) throw error;
        }
      },
    };
  }
  const { bucket, object } = parsePath(privatePath(objectPath));
  return storage.bucket(bucket).file(object);
}

export async function writeLocalTrainingUpload(objectPath, readable, { start, end, total, contentLength }) {
  if (!isTrainingLocalStorage()) {
    const error = new Error('Envio local indisponível neste ambiente.');
    error.statusCode = 404;
    throw error;
  }
  const expectedLength = end - start + 1;
  if (
    !Number.isSafeInteger(start) || start < 0 ||
    !Number.isSafeInteger(end) || end < start ||
    !Number.isSafeInteger(total) || total <= end ||
    contentLength !== expectedLength
  ) {
    const error = new Error('Intervalo de envio inválido.');
    error.statusCode = 400;
    throw error;
  }
  const target = localPath(objectPath);
  await mkdir(path.dirname(target), { recursive: true });
  const releaseLock = await acquireLocalObjectLock(objectPath);
  try {
    const currentSize = await localObjectSize(objectPath);
    if (currentSize !== start) {
      const error = new Error('O arquivo deve continuar a partir do último trecho confirmado.');
      error.statusCode = 409;
      error.confirmedOffset = currentSize;
      throw error;
    }
    await pipeline(readable, fs.createWriteStream(target, {
      flags: start === 0 ? 'w' : 'a',
      mode: 0o600,
    }));
    const confirmedOffset = await localObjectSize(objectPath);
    if (confirmedOffset > total) {
      const error = new Error('O arquivo recebido excede o tamanho esperado.');
      error.statusCode = 422;
      throw error;
    }
    return confirmedOffset;
  } finally {
    await releaseLock();
  }
}

export async function deleteTrainingObject(objectPath) {
  if (!objectPath) return;
  await getTrainingObject(objectPath).delete({ ignoreNotFound: true });
}
