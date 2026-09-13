import test from 'node:test';
import assert from 'node:assert/strict';
import { getTrainingUploadOffset } from './trainingObjectStorage.js';

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