import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { pool } from '../config/database.js';

after(async () => {
  await pool.end();
});

test('histórico mantém uma única vigência atual, sem sobreposição e sem mutação', async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const created = await client.query(
      `INSERT INTO bom_pet_parceiros (nome, valor_servico, data_cadastro, status)
       VALUES ('TESTE AUTOMATIZADO PARCEIRO', 100, CURRENT_DATE, 'Ativo')
       RETURNING id`
    );
    const partnerId = created.rows[0].id;
    await client.query(
      `INSERT INTO bom_pet_parceiros_historico
        (parceiro_id, valor_servico, vigencia_inicio)
       VALUES ($1, 100, clock_timestamp())`,
      [partnerId]
    );

    const changedAt = new Date();
    await client.query(
      `UPDATE bom_pet_parceiros_historico
          SET vigencia_fim = $2
        WHERE parceiro_id = $1 AND vigencia_fim IS NULL`,
      [partnerId, changedAt]
    );
    await client.query(
      `INSERT INTO bom_pet_parceiros_historico
        (parceiro_id, valor_servico, vigencia_inicio)
       VALUES ($1, 125.50, $2)`,
      [partnerId, changedAt]
    );
    await client.query(
      'UPDATE bom_pet_parceiros SET valor_servico = 125.50 WHERE id = $1',
      [partnerId]
    );
    await client.query('SET CONSTRAINTS ALL IMMEDIATE');

    const history = await client.query(
      `SELECT valor_servico, vigencia_inicio, vigencia_fim
         FROM bom_pet_parceiros_historico
        WHERE parceiro_id = $1
        ORDER BY id`,
      [partnerId]
    );
    assert.equal(history.rows.length, 2);
    assert.equal(history.rows.filter((row) => row.vigencia_fim === null).length, 1);
    assert.equal(
      history.rows[0].vigencia_fim.toISOString(),
      history.rows[1].vigencia_inicio.toISOString()
    );

    await client.query('SAVEPOINT immutable_update');
    await assert.rejects(
      client.query(
        `UPDATE bom_pet_parceiros_historico
            SET valor_servico = 999
          WHERE parceiro_id = $1 AND vigencia_fim IS NOT NULL`,
        [partnerId]
      ),
      /Apenas o fechamento da vigência atual é permitido/
    );
    await client.query('ROLLBACK TO SAVEPOINT immutable_update');

    await client.query('SAVEPOINT immutable_delete');
    await assert.rejects(
      client.query(
        'DELETE FROM bom_pet_parceiros_historico WHERE parceiro_id = $1',
        [partnerId]
      ),
      /O histórico de valores do parceiro é imutável/
    );
    await client.query('ROLLBACK TO SAVEPOINT immutable_delete');
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
});

test('banco rejeita parceiro sem uma vigência atual', async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO bom_pet_parceiros (nome, valor_servico, data_cadastro, status)
       VALUES ('TESTE AUTOMATIZADO SEM VIGENCIA', 50, CURRENT_DATE, 'Ativo')`
    );
    await assert.rejects(
      client.query('SET CONSTRAINTS ALL IMMEDIATE'),
      /deve possuir exatamente uma vigência atual/
    );
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
});