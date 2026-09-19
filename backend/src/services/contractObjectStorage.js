import { Storage } from '@google-cloud/storage';
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SIDECAR = 'http://127.0.0.1:1106';
const DELETE_AFTER_MS = 20 * 60 * 1000;
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

export function isContractStorageConfigured() {
  if (process.env.CONTRACT_STORAGE_DIR) {
    return Boolean(process.env.PUBLIC_APP_URL && signingSecret());
  }
  return Boolean(process.env.PRIVATE_OBJECT_DIR);
}

export function isContractLocalStorage() {
  return Boolean(process.env.CONTRACT_STORAGE_DIR);
}

function signingSecret() {
  return process.env.SESSION_SECRET || process.env.JWT_SECRET || '';
}

function localPath(objectPath) {
  const root = path.resolve(process.env.CONTRACT_STORAGE_DIR || '');
  const target = path.resolve(root, String(objectPath || '').replace(/^\/+/, ''));
  if (!root || target === root || !target.startsWith(`${root}${path.sep}`)) {
    const error = new Error('Caminho do armazenamento temporário inválido.');
    error.statusCode = 400;
    throw error;
  }
  return target;
}

function localReadUrl(objectPath, baseUrl) {
  if (!baseUrl || !signingSecret()) {
    const error = new Error('URL pública ou assinatura do armazenamento local não configurada.');
    error.statusCode = 503;
    throw error;
  }
  const encoded = Buffer.from(objectPath, 'utf8').toString('base64url');
  const expires = Math.floor(Date.now() / 1000) + 15 * 60;
  const payload = `${encoded}.${expires}`;
  const signature = createHmac('sha256', signingSecret()).update(payload).digest('base64url');
  return `${baseUrl.replace(/\/$/, '')}/api/sales-pf/contracts/temporary/${encoded}?expires=${expires}&signature=${signature}`;
}

export async function readLocalContract(encoded, expiresValue, signature) {
  if (!isContractLocalStorage()) throw Object.assign(new Error('Arquivo não encontrado.'), { statusCode: 404 });
  const expires = Number(expiresValue);
  const payload = `${encoded}.${expires}`;
  const expected = createHmac('sha256', signingSecret()).update(payload).digest('base64url');
  const valid = Number.isInteger(expires) && expires >= Math.floor(Date.now() / 1000)
    && typeof signature === 'string'
    && signature.length === expected.length
    && timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  if (!valid) throw Object.assign(new Error('Acesso temporário inválido ou expirado.'), { statusCode: 403 });
  const objectPath = Buffer.from(encoded, 'base64url').toString('utf8');
  return readFile(localPath(objectPath));
}

function privatePath(objectPath) {
  const root = process.env.PRIVATE_OBJECT_DIR;
  if (!root) {
    const error = new Error('Armazenamento privado indisponível neste ambiente.');
    error.statusCode = 503;
    throw error;
  }
  return `${root.replace(/\/$/, '')}/${String(objectPath).replace(/^\/+/, '')}`;
}

export function parseContractStoragePath(value) {
  const parts = `/${String(value || '').replace(/^\/+/, '')}`.split('/');
  if (parts.length < 3 || !parts[1] || !parts.slice(2).join('/')) {
    throw new Error('Caminho do armazenamento de contrato inválido.');
  }
  return { bucket: parts[1], object: parts.slice(2).join('/') };
}

async function signedReadUrl(bucket, object) {
  const response = await fetch(`${SIDECAR}/object-storage/signed-object-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      bucket_name: bucket,
      object_name: object,
      method: 'GET',
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    }),
  });
  if (!response.ok) {
    const error = new Error('Não foi possível disponibilizar o contrato temporariamente.');
    error.statusCode = 503;
    throw error;
  }
  return (await response.json()).signed_url;
}

export function createContractObjectPath() {
  return `contracts/whatsapp/${Date.now()}-${randomUUID()}.pdf`;
}

export async function storeContractForWhatsApp(
  pdf,
  objectPath = createContractObjectPath(),
  { baseUrl } = {},
) {
  if (!Buffer.isBuffer(pdf) || pdf.length === 0) throw new Error('PDF do contrato inválido.');
  if (isContractLocalStorage()) {
    const target = localPath(objectPath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, pdf, { mode: 0o600 });
    return { objectPath, url: localReadUrl(objectPath, baseUrl) };
  }
  const { bucket, object } = parseContractStoragePath(privatePath(objectPath));
  const file = storage.bucket(bucket).file(object);
  await file.save(pdf, {
    resumable: false,
    contentType: 'application/pdf',
    metadata: {
      cacheControl: 'private, no-store, max-age=0',
      metadata: { purpose: 'temporary-whatsapp-contract' },
    },
  });
  try {
    return { objectPath, url: await signedReadUrl(bucket, object) };
  } catch (error) {
    await file.delete({ ignoreNotFound: true }).catch(() => {});
    throw error;
  }
}

export async function deleteContractFromStorage(objectPath) {
  if (isContractLocalStorage()) {
    await unlink(localPath(objectPath)).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
    return;
  }
  const { bucket, object } = parseContractStoragePath(privatePath(objectPath));
  await storage.bucket(bucket).file(object).delete({ ignoreNotFound: true });
}

export function scheduleContractDeletion(objectPath) {
  const timer = setTimeout(() => {
    deleteContractFromStorage(objectPath)
      .catch((error) => console.error('[ContractStorage] Falha ao remover contrato temporário:', error.message));
  }, DELETE_AFTER_MS);
  timer.unref();
}