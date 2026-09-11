import { Storage } from '@google-cloud/storage';
import { randomUUID } from 'crypto';
import process from 'node:process';

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
  return Boolean(process.env.PRIVATE_OBJECT_DIR);
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

export async function createTrainingUploadUrl(kind, contentType) {
  const objectPath = `training/${kind}/${randomUUID()}`;
  const { bucket, object } = parsePath(privatePath(objectPath));
  const [uploadUrl] = await storage.bucket(bucket).file(object).createResumableUpload({
    origin: '*',
    metadata: { contentType },
  });
  return { objectPath, uploadUrl, expiresIn: 3600 };
}

export async function createTrainingReadUrl(objectPath) {
  const { bucket, object } = parsePath(privatePath(objectPath));
  return sign({ bucket, object, method: 'GET', ttlSec: 900 });
}

export async function getTrainingUploadOffset(uploadUrl, totalSize) {
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
  const { bucket, object } = parsePath(privatePath(objectPath));
  return storage.bucket(bucket).file(object);
}

export async function deleteTrainingObject(objectPath) {
  if (!objectPath || !isTrainingStorageConfigured()) return;
  await getTrainingObject(objectPath).delete({ ignoreNotFound: true });
}
