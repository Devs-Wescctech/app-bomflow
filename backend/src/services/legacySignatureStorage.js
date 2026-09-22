import path from 'path';
import SftpClient from 'ssh2-sftp-client';

const testModeEnabled = () => String(process.env.LEGACY_SIGNATURE_TEST_MODE || '').toLowerCase() === 'true';
const testFileName = () => process.env.LEGACY_SIGNATURE_TEST_FILE
  || 'codex-bomflow-dev-signature-preview.png';
const remoteDirectory = () => process.env.LEGACY_SIGNATURE_SSH_PATH || '/assinaturas';
const remoteTestPath = () => path.posix.join(remoteDirectory(), testFileName());
const MIN_SIGNATURE_SIZE = 2007;

const connection = () => {
  const config = {
    host: process.env.LEGACY_SIGNATURE_SSH_HOST,
    port: Number(process.env.LEGACY_SIGNATURE_SSH_PORT || 22),
    username: process.env.LEGACY_SIGNATURE_SSH_USER,
    password: process.env.LEGACY_SIGNATURE_SSH_PASSWORD,
    readyTimeout: 15000,
  };
  if (!config.host || !config.username || !config.password) {
    const error = new Error('O acesso ao diretório legado de assinaturas não está configurado.');
    error.statusCode = 503;
    throw error;
  }
  return config;
};

const requireTestMode = () => {
  if (!testModeEnabled()) {
    const error = new Error('A homologação de assinatura está desabilitada neste ambiente.');
    error.statusCode = 404;
    throw error;
  }
};

async function withClient(action, { testOnly = true } = {}) {
  if (testOnly) requireTestMode();
  const client = new SftpClient('bomflow-signature-test');
  try {
    await client.connect(connection());
    return await action(client);
  } finally {
    await client.end().catch(() => {});
  }
}

export function signatureFileNameFromReference(fileReference) {
  const normalized = String(fileReference || '').trim().replaceAll('\\', '/');
  const fileName = path.posix.basename(normalized);
  if (!/^\d+\.png$/i.test(fileName)) {
    const error = new Error('A referência do arquivo de assinatura é inválida.');
    error.statusCode = 409;
    throw error;
  }
  return fileName;
}

export async function readLegacySignatureFile(fileReference) {
  const fileName = signatureFileNameFromReference(fileReference);
  const remotePath = path.posix.join(remoteDirectory(), fileName);
  return withClient(async (client) => {
    const exists = await client.exists(remotePath);
    if (!exists) {
      const error = new Error('A assinatura está registrada, mas o arquivo não foi encontrado.');
      error.statusCode = 409;
      throw error;
    }
    const stat = await client.stat(remotePath);
    if (Number(stat.size) <= MIN_SIGNATURE_SIZE) {
      const error = new Error('O arquivo de assinatura registrado está vazio ou incompleto.');
      error.statusCode = 409;
      throw error;
    }
    const data = await client.get(remotePath);
    return {
      buffer: Buffer.isBuffer(data) ? data : Buffer.from(data),
      fileName,
      size: Number(stat.size),
    };
  }, { testOnly: false });
}

export async function saveTestSignature(buffer) {
  return withClient(async (client) => {
    await client.put(buffer, remoteTestPath());
    const stat = await client.stat(remoteTestPath());
    return { fileName: testFileName(), size: Number(stat.size) || buffer.length };
  });
}

export async function readTestSignature() {
  return withClient(async (client) => {
    try {
      const data = await client.get(remoteTestPath());
      return Buffer.isBuffer(data) ? data : Buffer.from(data);
    } catch (cause) {
      const error = new Error('Capture uma assinatura de teste antes de visualizar o modelo.');
      error.statusCode = 404;
      error.cause = cause;
      throw error;
    }
  });
}

export async function deleteTestSignature() {
  return withClient(async (client) => {
    const exists = await client.exists(remoteTestPath());
    if (exists) await client.delete(remoteTestPath());
    return Boolean(exists);
  });
}
