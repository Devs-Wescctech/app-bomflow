import test from 'node:test';
import assert from 'node:assert/strict';
import {
  balancedAssignments,
  assertModuleAccess,
  buildPortfolioWhere,
  createBatchAssignmentNotifications,
  getRedistributionModule,
  isTeamScoped,
  normalizeSelection,
  resolveDestinationIds,
  summarizeAssignments,
} from './leadRedistributionService.js';

const supervisorRequest = {
  user: { role: 'agent' },
  agent: { id: 'manager', agentType: 'sales_supervisor', teamId: 'team-a' },
};
const adminRequest = {
  user: { role: 'admin' },
  agent: { id: 'admin', agentType: 'admin', teamId: null },
};

test('recognizes all four canonical modules and rejects unknown modules', () => {
  assert.equal(getRedistributionModule('sales').table, 'leads');
  assert.equal(getRedistributionModule('sales_pj').table, 'leads_pj');
  assert.equal(getRedistributionModule('sales_upsell').table, 'leads_upsell');
  assert.equal(getRedistributionModule('referral').table, 'referrals');
  assert.throws(() => getRedistributionModule('support'), /inválido/);
});

test('supervisor portfolio is always constrained to own team', () => {
  const config = getRedistributionModule('sales');
  const result = buildPortfolioWhere(config, supervisorRequest, { search: 'Maria' });
  assert.match(result.sql, /owner_agent\.team_id = \$1/);
  assert.match(result.sql, /ILIKE \$2/);
  assert.deepEqual(result.params, ['team-a', '%Maria%']);
  assert.equal(isTeamScoped(supervisorRequest), true);
});

test('supervisor cannot force another team through filters', () => {
  const result = buildPortfolioWhere(getRedistributionModule('sales'), supervisorRequest, { teamId: 'team-b' });
  assert.match(result.sql, /FALSE/);
});

test('admin receives no implicit team restriction', () => {
  const result = buildPortfolioWhere(getRedistributionModule('referral'), adminRequest, {});
  assert.equal(result.sql, '1=1');
  assert.deepEqual(result.params, []);
  assert.equal(isTeamScoped(adminRequest), false);
});

test('explicit selection is deduplicated and bounded', () => {
  assert.deepEqual(normalizeSelection({ selection: { type: 'ids', ids: ['1', '1', '2'] } }).ids, ['1', '2']);
  assert.throws(() => normalizeSelection({ selection: { type: 'ids', ids: [] } }), /Selecione/);
  assert.equal(normalizeSelection({ selection: { type: 'allFiltered', filters: { status: 'active' } } }).type, 'allFiltered');
});

test('balanced distribution is deterministic and handles remainder', () => {
  const assignments = balancedAssignments(['a', 'b', 'c', 'd', 'e'], ['x', 'y']);
  assert.deepEqual(assignments.map(item => item.destinationId), ['x', 'y', 'x', 'y', 'x']);
  assert.deepEqual(summarizeAssignments(assignments, [
    { id: 'x', name: 'Ana' }, { id: 'y', name: 'Bia' },
  ]), [
    { destinationId: 'x', destinationName: 'Ana', count: 3 },
    { destinationId: 'y', destinationName: 'Bia', count: 2 },
  ]);
});

test('module authorization uses configured modules and rejects unrelated supervisors', async () => {
  const allowedDb = {
    query: async () => ({
      rows: [{ modules: ['sales'], allowed_submenus: ['LeadRedistributionSales'] }],
    }),
  };
  assert.equal((await assertModuleAccess(allowedDb, supervisorRequest, 'sales')).table, 'leads');
  const deniedDb = {
    query: async () => ({
      rows: [{ modules: ['support'], allowed_submenus: ['LeadRedistributionSales'] }],
    }),
  };
  await assert.rejects(assertModuleAccess(deniedDb, supervisorRequest, 'sales'), error => error.status === 403);
});

test('non-admin managers need the redistribution submenu for the selected channel', async () => {
  const wrongChannelDb = {
    query: async () => ({
      rows: [{ modules: ['sales'], allowed_submenus: ['LeadRedistributionSalesPJ'] }],
    }),
  };
  await assert.rejects(
    assertModuleAccess(wrongChannelDb, supervisorRequest, 'sales'),
    error => error.status === 403 && /redistribuição de leads/.test(error.message),
  );
});

test('team redistribution requires an explicit destination team', async () => {
  let queried = false;
  await assert.rejects(
    resolveDestinationIds(
      { query: async () => { queried = true; return { rows: [] }; } },
      adminRequest,
      getRedistributionModule('sales'),
      { mode: 'team' },
    ),
    error => error.status === 400 && /equipe de destino/.test(error.message),
  );
  assert.equal(queried, false);
});

test('bulk assignment creates one consolidated notification per destination', async () => {
  const calls = [];
  await createBatchAssignmentNotifications(
    { query: async (sql, params) => { calls.push({ sql, params }); return { rows: [] }; } },
    { batchId: 'batch-1', moduleKey: 'sales', moduleLabel: 'Vendas PF' },
  );
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /GROUP BY destination\.id, destination\.email/);
  assert.match(calls[0].sql, /history\.batch_id = \$1::uuid/);
  assert.match(calls[0].sql, /\$2::text/);
  assert.match(calls[0].sql, /\$3::text/);
  assert.match(calls[0].sql, /lead-redistribution:/);
  assert.match(calls[0].sql, /ON CONFLICT \(dedupe_key\)/);
  assert.deepEqual(calls[0].params, ['batch-1', 'sales', 'Vendas PF']);
});