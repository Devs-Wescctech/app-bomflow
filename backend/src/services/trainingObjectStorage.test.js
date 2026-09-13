import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import {
  createTrainingReadUrl,
  createTrainingUploadUrl,
  getTrainingObject,
  getTrainingUploadOffset,
  isTrainingStorageConfigured,
  verifyTrainingReadUrl,
  writeLocalTrainingUpload,
} from './trainingObjectStorage.js';

test('consulta o offset confirmado de uma sessão resumível pelo backend', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(null, {
      status: 308,
      headers: { Range: 'bytes=0-262143' },
    });
    assert.equal(await getTrainingUploadOffset('https://upload.invalid/session', 600000), 262144);

    globalThis.fetch = async () => new Response(null, { status: 200 });
    assert.equal(await getTrainingUploadOffset('https://upload.invalid/session', 600000), 600000);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('sessão expirada retorna erro controlado', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(null, { status: 410 });
    await assert.rejects(
      getTrainingUploadOffset('https://upload.invalid/session', 600000),
      (error) => error.statusCode === 410 && /sessão de envio expirou/i.test(error.message)
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('armazenamento local cria sessão, mede arquivo e assina leitura temporária', async () => {
  const original = {
    driver: process.env.TRAINING_STORAGE_DRIVER,
    directory: process.env.TRAINING_STORAGE_DIR,
    sessionSecret: process.env.SESSION_SECRET,
  };
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'training-storage-'));
  try {
    process.env.TRAINING_STORAGE_DRIVER = 'local';
    process.env.TRAINING_STORAGE_DIR = directory;
    process.env.SESSION_SECRET = 'segredo-de-teste-nao-produtivo';
    assert.equal(isTrainingStorageConfigured(), true);

    const session = await createTrainingUploadUrl('pdf', 'application/pdf', {
      trainingId: 'training-1',
      uploadId: 'upload-1',
    });
    assert.match(session.uploadUrl, /\/api\/trainings\/training-1\/uploads\/upload-1\/content$/);
    await writeLocalTrainingUpload(session.objectPath, Readable.from('%PDF-'), {
      start: 0,
      end: 4,
      total: 13,
      contentLength: 5,
    });
    assert.equal(await getTrainingUploadOffset(session.uploadUrl, 13, session.objectPath), 5);
    await writeLocalTrainingUpload(session.objectPath, Readable.from('conteudo'), {
      start: 5,
      end: 12,
      total: 13,
      contentLength: 8,
    });
    assert.equal(await getTrainingUploadOffset(session.uploadUrl, 100, session.objectPath), 13);
    assert.equal(
      await fs.readFile(path.join(directory, session.objectPath), 'utf8'),
      '%PDF-conteudo'
    );

    const signedUrl = new URL(await createTrainingReadUrl(session.objectPath), 'http://bomflow.local');
    const encodedPath = signedUrl.pathname.split('/').at(-1);
    assert.equal(
      verifyTrainingReadUrl(
        encodedPath,
        signedUrl.searchParams.get('expires'),
        signedUrl.searchParams.get('signature')
      ),
      session.objectPath
    );
    const [metadata] = await getTrainingObject(session.objectPath).getMetadata();
    assert.equal(Number(metadata.size), 13);
    assert.throws(
      () => getTrainingObject('../fora-do-volume'),
      /caminho do armazenamento inválido/i
    );
  } finally {
    if (original.driver === undefined) delete process.env.TRAINING_STORAGE_DRIVER;
    else process.env.TRAINING_STORAGE_DRIVER = original.driver;
    if (original.directory === undefined) delete process.env.TRAINING_STORAGE_DIR;
    else process.env.TRAINING_STORAGE_DIR = original.directory;
    if (original.sessionSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = original.sessionSecret;
    await fs.rm(directory, { recursive: true, force: true });
  }
});