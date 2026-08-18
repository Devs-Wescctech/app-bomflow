import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { query, pool } from '../config/database.js';
import { deactivateInactiveAgents } from './inactivityService.js';
import { checkAgentActiveStatus, invalidateAgentActiveCache, inactiveAccountMessage } from '../middleware/auth.js';
import { requesterCanManageAgents } from '../routes/entities.js';

const MASTER_EMAIL = 'admin@wescctech.com';
const stamp = Date.now();
const emails = {
  old: `test-inactivity-old-${stamp}@test.local`,
  recent: `test-inactivity-recent-${stamp}@test.local`,
  noRecord: `test-inactivity-norecord-${stamp}@test.local`,
  neverUsed: `test-inactivity-neverused-${stamp}@test.local`,
  fresh: `test-inactivity-fresh-${stamp}@test.local`,
};
const ids = {};
let masterBackup = null;

before(async () => {
  // Agente com 40 dias sem atividade → deve ser inativado
  const oldAgent = await query(
    `INSERT INTO agents (name, email, agent_type, active, last_activity_at, last_login_at)
     VALUES ('Teste Inativo', $1, 'support', TRUE, NOW() - INTERVAL '40 days', NOW() - INTERVAL '45 days')
     RETURNING id`, [emails.old]);
  ids.old = oldAgent.rows[0].id;

  // Agente com atividade recente → NÃO deve ser inativado
  const recent = await query(
    `INSERT INTO agents (name, email, agent_type, active, last_activity_at)
     VALUES ('Teste Ativo', $1, 'support', TRUE, NOW() - INTERVAL '2 days')
     RETURNING id`, [emails.recent]);
  ids.recent = recent.rows[0].id;

  // Registro legado sem marco (NULL explícito) → ignorado por segurança
  const noRecord = await query(
    `INSERT INTO agents (name, email, agent_type, active, last_activity_at, last_login_at)
     VALUES ('Teste Sem Registro', $1, 'support', TRUE, NULL, NULL)
     RETURNING id`, [emails.noRecord]);
  ids.noRecord = noRecord.rows[0].id;

  // Conta criada há 40 dias e NUNCA usada (marco inicial = criação, sem login) → deve ser inativada
  const neverUsed = await query(
    `INSERT INTO agents (name, email, agent_type, active, last_activity_at, last_login_at, created_at)
     VALUES ('Teste Nunca Usado', $1, 'support', TRUE, NOW() - INTERVAL '40 days', NULL, NOW() - INTERVAL '40 days')
     RETURNING id`, [emails.neverUsed]);
  ids.neverUsed = neverUsed.rows[0].id;

  // Conta recém-criada sem informar last_activity_at → DEFAULT NOW() garante o marco inicial
  const fresh = await query(
    `INSERT INTO agents (name, email, agent_type, active)
     VALUES ('Teste Recém-Criado', $1, 'support', TRUE)
     RETURNING id, last_activity_at`, [emails.fresh]);
  ids.fresh = fresh.rows[0].id;
  assert.ok(fresh.rows[0].last_activity_at, 'conta nova deve nascer com marco inicial (DEFAULT NOW())');

  // Master: simula 40 dias sem uso para provar a isenção (restaurado no after)
  const master = await query(
    `SELECT id, last_activity_at, last_login_at FROM agents WHERE LOWER(email) = LOWER($1)`, [MASTER_EMAIL]);
  if (master.rows.length > 0) {
    masterBackup = master.rows[0];
    await query(
      `UPDATE agents SET last_activity_at = NOW() - INTERVAL '40 days', last_login_at = NOW() - INTERVAL '40 days' WHERE id = $1`,
      [masterBackup.id]);
  }
});

after(async () => {
  try {
    if (masterBackup) {
      await query(
        `UPDATE agents SET last_activity_at = $2, last_login_at = $3, active = TRUE, deactivated_at = NULL, deactivation_reason = NULL WHERE id = $1`,
        [masterBackup.id, masterBackup.last_activity_at, masterBackup.last_login_at]);
    }
    await query(`DELETE FROM agents WHERE email = ANY($1::text[])`, [Object.values(emails)]);
  } finally {
    await pool.end();
  }
});

test('rotina inativa apenas agentes com 30+ dias sem uso, preservando master e sem-registro', async () => {
  const result = await deactivateInactiveAgents();
  const affectedIds = result.agents.map(a => a.id);

  assert.ok(affectedIds.includes(ids.old), 'agente com 40 dias sem uso deve ser inativado');
  assert.ok(affectedIds.includes(ids.neverUsed), 'conta criada há 40 dias e nunca usada deve ser inativada');
  assert.ok(!affectedIds.includes(ids.recent), 'agente com atividade recente não pode ser inativado');
  assert.ok(!affectedIds.includes(ids.fresh), 'conta recém-criada não pode ser inativada no dia 1');
  assert.ok(!affectedIds.includes(ids.noRecord), 'registro legado sem marco é ignorado por segurança');

  const rows = await query(
    `SELECT id, active, deactivated_at, deactivation_reason FROM agents WHERE id = ANY($1::uuid[])`,
    [[ids.old, ids.recent, ids.noRecord, ids.neverUsed, ids.fresh]]);
  const byId = Object.fromEntries(rows.rows.map(r => [r.id, r]));

  assert.equal(byId[ids.old].active, false);
  assert.equal(byId[ids.old].deactivation_reason, 'inatividade');
  assert.ok(byId[ids.old].deactivated_at, 'deve registrar a data da inativação');
  assert.equal(byId[ids.neverUsed].active, false);
  assert.equal(byId[ids.neverUsed].deactivation_reason, 'inatividade');
  assert.equal(byId[ids.recent].active, true);
  assert.equal(byId[ids.fresh].active, true);
  assert.equal(byId[ids.noRecord].active, true);

  if (masterBackup) {
    const master = await query(`SELECT active FROM agents WHERE id = $1`, [masterBackup.id]);
    assert.equal(master.rows[0].active, true, 'usuário master é isento da regra');
  }
});

test('token de agente inativado é rejeitado pela verificação de status ativo', async () => {
  invalidateAgentActiveCache(ids.old);
  const status = await checkAgentActiveStatus(ids.old);
  assert.equal(status.active, false);
  assert.equal(status.reason, 'inatividade');
  assert.equal(inactiveAccountMessage(status.reason), 'Conta bloqueada por inatividade. Contate o administrador.');

  invalidateAgentActiveCache(ids.recent);
  const statusRecent = await checkAgentActiveStatus(ids.recent);
  assert.equal(statusRecent.active, true);
});

test('agente comum NÃO pode gerenciar agentes (ativar/inativar/reativar); admin pode', async () => {
  // Agente comum (support, sem can_manage_agents) — negado, mesmo estando ativo.
  assert.equal(await requesterCanManageAgents({ user: { id: ids.recent } }), false);
  // Agente inativado — negado.
  assert.equal(await requesterCanManageAgents({ user: { id: ids.old } }), false);
  // Master/admin — permitido.
  if (masterBackup) {
    assert.equal(await requesterCanManageAgents({ user: { id: masterBackup.id } }), true);
  }
  // Token de usuário inexistente — negado.
  assert.equal(await requesterCanManageAgents({ user: { id: '00000000-0000-0000-0000-000000000000' } }), false);
});

test('reativação (fluxo do servidor) limpa motivo/data e reinicia o relógio de atividade', async () => {
  // Simula o que o PUT /agents/:id faz quando um admin reativa o agente.
  await query(
    `UPDATE agents SET active = TRUE, deactivated_at = NULL, deactivation_reason = NULL, last_activity_at = NOW() WHERE id = $1`,
    [ids.old]);
  invalidateAgentActiveCache(ids.old);
  const status = await checkAgentActiveStatus(ids.old);
  assert.equal(status.active, true);
  const row = await query(`SELECT deactivated_at, deactivation_reason, last_activity_at FROM agents WHERE id = $1`, [ids.old]);
  assert.equal(row.rows[0].deactivated_at, null);
  assert.equal(row.rows[0].deactivation_reason, null);
  assert.ok(row.rows[0].last_activity_at, 'relógio de atividade reiniciado');

  // Novo ciclo da rotina não pode reinativar quem acabou de ser reativado.
  const rerun = await deactivateInactiveAgents();
  assert.ok(!rerun.agents.map(a => a.id).includes(ids.old));
});
