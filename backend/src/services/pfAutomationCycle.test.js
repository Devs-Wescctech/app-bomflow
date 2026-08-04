// Testes do ciclo de automações PF: parada por resposta, sequência por
// prioridade e cooldown de 30 dias. Sem banco real — usa um db fake que
// registra as queries e devolve resultados programados.

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

import test from 'node:test';
import assert from 'node:assert/strict';

const {
  extractWhuIds,
  isAutomationApplicableToLead,
  getCycleAutomationsForLead,
  hasPendingPriorAutomation,
  getCycleSentAutomationIds,
  startCycleIfNeeded,
  recordDispatchChat,
  finishCycleIfComplete,
  markLeadRespondedByChat,
} = await import('./pfAutomationCycle.js');

function makeDb(handlers = []) {
  const calls = [];
  const db = async (sql, params) => {
    calls.push({ sql, params });
    for (const h of handlers) {
      if (h.match.test(sql)) return h.result(sql, params);
    }
    return { rows: [], rowCount: 0 };
  };
  db.calls = calls;
  return db;
}

const auto = (id, overrides = {}) => ({
  id,
  active: true,
  action_type: 'send_whatsapp',
  trigger_type: 'inactivity',
  team_ids: [],
  ...overrides,
});

test('extractWhuIds cobre as variações de chave da WHU', () => {
  assert.deepEqual(extractWhuIds({ chatId: 123, contactId: 'c1' }), { chatId: '123', contactId: 'c1' });
  assert.deepEqual(extractWhuIds({ currentChatId: 'abc' }).chatId, 'abc');
  assert.deepEqual(extractWhuIds({ chat_id: 'x', contact_id: 'y' }), { chatId: 'x', contactId: 'y' });
  assert.deepEqual(extractWhuIds(null), { chatId: null, contactId: null });
  assert.deepEqual(extractWhuIds({}), { chatId: null, contactId: null });
});

test('isAutomationApplicableToLead respeita filtro de times', () => {
  const lead = { team_id: 't1' };
  assert.equal(isAutomationApplicableToLead(auto('a', { team_ids: [] }), lead), true);
  assert.equal(isAutomationApplicableToLead(auto('a', { team_ids: ['t1'] }), lead), true);
  assert.equal(isAutomationApplicableToLead(auto('a', { team_ids: ['t2'] }), lead), false);
  assert.equal(isAutomationApplicableToLead(auto('a', { team_ids: ['t2'] }), { team_id: null }), false);
});

test('getCycleAutomationsForLead só considera send_whatsapp ativas do ciclo', () => {
  const lead = { team_id: 't1' };
  const automations = [
    auto('a1'),
    auto('a2', { action_type: 'internal_alert' }),
    auto('a3', { active: false }),
    auto('a4', { trigger_type: 'lead_created' }),
    auto('a5', { team_ids: ['t2'] }),
    auto('a6', { trigger_type: 'stage_duration' }),
  ];
  assert.deepEqual(getCycleAutomationsForLead(automations, lead).map(a => a.id), ['a1', 'a6']);
});

test('hasPendingPriorAutomation exige sequência por prioridade', () => {
  const lead = { team_id: null };
  const automations = [auto('a1'), auto('a2'), auto('a3')];
  // a1 é a primeira: nunca tem anterior pendente
  assert.equal(hasPendingPriorAutomation(automations, automations[0], lead, new Set()), false);
  // a2 sem a1 enviada: pendente
  assert.equal(hasPendingPriorAutomation(automations, automations[1], lead, new Set()), true);
  // a2 com a1 enviada: liberada
  assert.equal(hasPendingPriorAutomation(automations, automations[1], lead, new Set(['a1'])), false);
  // a3 com só a1 enviada: pendente (falta a2)
  assert.equal(hasPendingPriorAutomation(automations, automations[2], lead, new Set(['a1'])), true);
  assert.equal(hasPendingPriorAutomation(automations, automations[2], lead, new Set(['a1', 'a2'])), false);
});

test('hasPendingPriorAutomation ignora automações não aplicáveis ao time do lead', () => {
  const lead = { team_id: 't1' };
  const automations = [auto('a1', { team_ids: ['t2'] }), auto('a2', { team_ids: ['t1'] })];
  // a1 não se aplica a este lead → a2 pode disparar direto
  assert.equal(hasPendingPriorAutomation(automations, automations[1], lead, new Set()), false);
});

test('getCycleSentAutomationIds usa o limite do ciclo (cycle_started/cooldown)', async () => {
  const db = makeDb([
    { match: /SELECT DISTINCT automation_id/, result: () => ({ rows: [{ automation_id: 'a1' }] }) },
  ]);
  const lead = { id: 'L1', automation_cycle_started_at: '2026-08-01', automation_cooldown_until: null };
  const sent = await getCycleSentAutomationIds(lead, db);
  assert.deepEqual([...sent], ['a1']);
  assert.match(db.calls[0].sql, /GREATEST/);
  assert.deepEqual(db.calls[0].params, ['L1', '2026-08-01', null]);
});

test('startCycleIfNeeded reseta ciclo e cooldown apenas quando aplicável', async () => {
  const started = new Date('2026-08-04T12:00:00Z');
  const db = makeDb([
    { match: /UPDATE leads SET\s+automation_cycle_started_at = NOW\(\)/, result: () => ({ rows: [{ automation_cycle_started_at: started }] }) },
  ]);
  const lead = { id: 'L1', automation_cycle_started_at: null, automation_cooldown_until: '2020-01-01' };
  await startCycleIfNeeded(lead, db);
  assert.equal(lead.automation_cycle_started_at, started);
  assert.equal(lead.automation_cooldown_until, null);
  assert.match(db.calls[0].sql, /automation_cycle_started_at IS NULL/);
  assert.match(db.calls[0].sql, /automation_cooldown_until <= NOW\(\)/);
});

test('recordDispatchChat grava chat id quando presente e ignora quando ausente', async () => {
  const db = makeDb();
  const out = await recordDispatchChat('L1', { chatId: 999 }, db);
  assert.equal(out.chatId, '999');
  assert.equal(db.calls.length, 1);
  assert.match(db.calls[0].sql, /automation_whu_chat_id = \$2/);
  assert.deepEqual(db.calls[0].params, ['L1', '999']);

  const db2 = makeDb();
  const out2 = await recordDispatchChat('L1', { msg: 'ok' }, db2);
  assert.equal(out2.chatId, null);
  assert.equal(db2.calls.length, 0);
});

test('finishCycleIfComplete só fecha o ciclo quando TODAS foram enviadas', async () => {
  const lead = { id: 'L1', team_id: null, automation_cycle_started_at: '2026-08-01', automation_cooldown_until: null };
  const automations = [auto('a1'), auto('a2'), auto('a3')];

  // Parcial (2 de 3): não fecha
  const dbPartial = makeDb([
    { match: /SELECT DISTINCT automation_id/, result: () => ({ rows: [{ automation_id: 'a1' }, { automation_id: 'a2' }] }) },
  ]);
  assert.equal(await finishCycleIfComplete(lead, automations, dbPartial), false);
  assert.equal(dbPartial.calls.some(c => /INTERVAL '30 days'/.test(c.sql)), false);

  // Completo (3 de 3): fecha com cooldown de 30 dias
  const dbFull = makeDb([
    { match: /SELECT DISTINCT automation_id/, result: () => ({ rows: [{ automation_id: 'a1' }, { automation_id: 'a2' }, { automation_id: 'a3' }] }) },
  ]);
  assert.equal(await finishCycleIfComplete(lead, automations, dbFull), true);
  const cooldownCall = dbFull.calls.find(c => /INTERVAL '30 days'/.test(c.sql));
  assert.ok(cooldownCall, 'deveria setar cooldown de 30 dias');
  assert.match(cooldownCall.sql, /automation_responded_at IS NULL/);
});

test('finishCycleIfComplete sem automações no ciclo não faz nada', async () => {
  const db = makeDb();
  assert.equal(await finishCycleIfComplete({ id: 'L1', team_id: 't9' }, [auto('a1', { team_ids: ['t1'] })], db), false);
  assert.equal(db.calls.length, 0);
});

test('markLeadRespondedByChat resolve pelo chat id', async () => {
  const db = makeDb([
    { match: /UPDATE leads SET automation_responded_at = NOW\(\)[\s\S]*WHERE automation_whu_chat_id = \$1/, result: () => ({ rows: [{ id: 'L1' }] }) },
  ]);
  assert.equal(await markLeadRespondedByChat('chat-1', null, db), true);
  assert.deepEqual(db.calls[0].params, ['chat-1']);
});

test('markLeadRespondedByChat retorna true se lead já estava marcado', async () => {
  const db = makeDb([
    { match: /UPDATE leads SET automation_responded_at/, result: () => ({ rows: [] }) },
    { match: /SELECT 1 FROM leads WHERE automation_whu_chat_id/, result: () => ({ rows: [{ '?column?': 1 }] }) },
  ]);
  assert.equal(await markLeadRespondedByChat('chat-1', null, db), true);
});

test('markLeadRespondedByChat cai no fallback por telefone (últimos 8 dígitos)', async () => {
  const db = makeDb([
    { match: /RIGHT\(regexp_replace/, result: (sql, params) => {
        assert.deepEqual(params, ['98765432']);
        return { rows: [{ id: 'L2' }] };
      } },
  ]);
  assert.equal(await markLeadRespondedByChat('chat-x', '+55 (31) 9 9876-5432', db), true);
  // fallback só marca leads que já receberam disparo de automação
  const fallbackCall = db.calls.find(c => /RIGHT\(regexp_replace/.test(c.sql));
  assert.match(fallbackCall.sql, /automation_whu_chat_id IS NOT NULL/);
});

test('markLeadRespondedByChat sem match retorna false', async () => {
  const db = makeDb();
  assert.equal(await markLeadRespondedByChat('chat-x', '123', db), false);
});
