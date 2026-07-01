import { Storage } from '@google-cloud/storage';
import { randomUUID } from 'crypto';

// Cliente do Object Storage do Replit. Usa o sidecar local para autenticação
// (external_account) — nenhuma credencial precisa ser configurada manualmente.
const REPLIT_SIDECAR_ENDPOINT = 'http://127.0.0.1:1106';

export const objectStorageClient = new Storage({
  credentials: {
    audience: 'replit',
    subject_token_type: 'access_token',
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: 'external_account',
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: { type: 'json', subject_token_field_name: 'access_token' },
    },
    universe_domain: 'googleapis.com',
  },
  projectId: '',
});

export class ObjectNotFoundError extends Error {
  constructor() {
    super('Object not found');
    this.name = 'ObjectNotFoundError';
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

function getPrivateObjectDir() {
  const dir = process.env.PRIVATE_OBJECT_DIR || '';
  if (!dir) {
    throw new Error(
      'PRIVATE_OBJECT_DIR não configurado. Crie um bucket na ferramenta Object Storage.'
    );
  }
  return dir;
}

// Divide um caminho no formato /<bucket>/<objeto> em bucketName + objectName.
function parseObjectPath(path) {
  let p = path;
  if (!p.startsWith('/')) p = `/${p}`;
  const parts = p.split('/');
  if (parts.length < 3) {
    throw new Error('Caminho inválido: precisa conter ao menos um bucket');
  }
  return { bucketName: parts[1], objectName: parts.slice(2).join('/') };
}

// Gera uma URL assinada (via sidecar) para o método informado.
async function signObjectURL({ bucketName, objectName, method, ttlSec }) {
  const request = {
    bucket_name: bucketName,
    object_name: objectName,
    method,
    expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
  };
  const response = await fetch(
    `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    }
  );
  if (!response.ok) {
    throw new Error(
      `Falha ao assinar URL do objeto (código ${response.status}); verifique se está rodando no Replit`
    );
  }
  const { signed_url: signedURL } = await response.json();
  return signedURL;
}

// Gera uma URL de upload (PUT) para um novo objeto e devolve também o caminho
// interno (/objects/uploads/<uuid>) usado depois para servir/enviar o arquivo.
export async function getObjectEntityUploadURL() {
  const privateObjectDir = getPrivateObjectDir();
  const objectId = randomUUID();
  const fullPath = `${privateObjectDir}/uploads/${objectId}`;
  const { bucketName, objectName } = parseObjectPath(fullPath);
  const uploadURL = await signObjectURL({
    bucketName,
    objectName,
    method: 'PUT',
    ttlSec: 900,
  });
  return { uploadURL, objectPath: `/objects/uploads/${objectId}` };
}

// Resolve o arquivo do Object Storage a partir de um caminho /objects/...
export async function getObjectEntityFile(objectPath) {
  if (!objectPath.startsWith('/objects/')) {
    throw new ObjectNotFoundError();
  }
  const parts = objectPath.slice(1).split('/');
  if (parts.length < 2) {
    throw new ObjectNotFoundError();
  }
  const entityId = parts.slice(1).join('/');
  let entityDir = getPrivateObjectDir();
  if (!entityDir.endsWith('/')) entityDir = `${entityDir}/`;
  const { bucketName, objectName } = parseObjectPath(`${entityDir}${entityId}`);
  const objectFile = objectStorageClient.bucket(bucketName).file(objectName);
  const [exists] = await objectFile.exists();
  if (!exists) {
    throw new ObjectNotFoundError();
  }
  return objectFile;
}

// Faz o streaming do objeto para a resposta HTTP. Como a rota é pública e o
// conteúdo é enviado por usuários, forçamos download (attachment) e nosniff
// para não renderizar conteúdo ativo (ex.: HTML/JS) inline no mesmo domínio.
export async function downloadObject(file, res, cacheTtlSec = 3600) {
  const [metadata] = await file.getMetadata();
  res.set({
    'Content-Type': metadata.contentType || 'application/octet-stream',
    'Content-Length': metadata.size,
    'Cache-Control': `public, max-age=${cacheTtlSec}`,
    'Content-Disposition': 'attachment',
    'X-Content-Type-Options': 'nosniff',
  });
  const stream = file.createReadStream();
  stream.on('error', (err) => {
    console.error('[ObjectStorage] Erro no streaming:', err.message);
    if (!res.headersSent) res.status(500).json({ message: 'Erro ao ler o arquivo' });
  });
  stream.pipe(res);
}
