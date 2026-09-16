import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from './database.js';

after(async () => {
  await pool.end();
});

test('telefone legado não bloqueia update alheio e novos valores inválidos são rejeitados', async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TEMP TABLE phone_guard_probe (
        id SERIAL PRIMARY KEY,
        phone TEXT,
        status TEXT
      )
    `);
    await client.query(
      `INSERT INTO phone_guard_probe (phone, status)
       VALUES ('(51) 99999-9999', 'legacy')`,
    );
    await client.query(`
      CREATE TRIGGER phone_guard_probe_trigger
        BEFORE INSERT OR UPDATE OF phone ON phone_guard_probe
        FOR EACH ROW
        EXECUTE FUNCTION enforce_bom_flow_phone_national('phone')
    `);

    await client.query(
      `UPDATE phone_guard_probe SET status = 'updated' WHERE id = 1`,
    );
    const legacy = await client.query(
      'SELECT phone, status FROM phone_guard_probe WHERE id = 1',
    );
    assert.deepEqual(legacy.rows[0], {
      phone: '(51) 99999-9999',
      status: 'updated',
    });

    await client.query(
      `INSERT INTO phone_guard_probe (phone, status)
       VALUES ('51999999999', 'valid')`,
    );

    await client.query('SAVEPOINT invalid_phone');
    await assert.rejects(
      client.query(
        `INSERT INTO phone_guard_probe (phone, status)
         VALUES ('519999999', 'invalid')`,
      ),
      (error) => error.code === '23514',
    );
    await client.query('ROLLBACK TO SAVEPOINT invalid_phone');
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
});