import test from 'node:test';
import assert from 'node:assert/strict';

import { acquireAgentMutationLock } from './agentMutationLock.js';
import { pool } from '../config/database.js';

test('edição e sincronização do mesmo agente são serializadas durante chamadas assíncronas', async () => {
  const key = `agent-lock-test-${process.pid}-${Date.now()}`;
  const first = await acquireAgentMutationLock(key);

  let secondAcquired = false;
  const second = acquireAgentMutationLock(key).then(async (lock) => {
    secondAcquired = true;
    await lock.release();
  });

  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(secondAcquired, false);

  await first.release();
  await second;
  assert.equal(secondAcquired, true);
});

test('consultas protegidas progridem usando as próprias conexões mesmo com o pool ocupado', async () => {
  const poolSize = pool.options.max || 10;
  const locks = await Promise.all(
    Array.from(
      { length: poolSize },
      (_, index) => acquireAgentMutationLock(`agent-lock-saturation-${process.pid}-${Date.now()}-${index}`)
    )
  );

  try {
    const results = await Promise.all(
      locks.map((lock) => lock.client.query('SELECT 1 AS ok'))
    );
    assert.equal(results.every((result) => result.rows[0]?.ok === 1), true);
  } finally {
    await Promise.all(locks.map((lock) => lock.release()));
  }
});