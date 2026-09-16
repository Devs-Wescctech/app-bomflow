import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Buffer } from 'node:buffer';

const route = fs.readFileSync(new URL('./leadRedistribution.js', import.meta.url), 'utf8');
const schema = fs.readFileSync(new URL('../config/schema.sql', import.meta.url), 'utf8');
const agentsPage = fs.readFileSync(new URL('../../../src/pages/Agents.jsx', import.meta.url), 'utf8');
const layoutPage = fs.readFileSync(new URL('../../../src/pages/Layout.jsx', import.meta.url), 'utf8');
const permissionsSource = fs.readFileSync(
  new URL('../../../src/components/utils/permissions.jsx', import.meta.url),
  'utf8',
);
const entitiesRoute = fs.readFileSync(new URL('./entities.js', import.meta.url), 'utf8');

test('all management endpoints require authentication and loaded agent', () => {
  assert.match(route, /router\.use\(authMiddleware, loadAgentMiddleware\)/);
});

test('execution uses one transaction, row locks and grouped updates', () => {
  assert.match(route, /withTransaction\(async client/);
  assert.match(route, /FOR UPDATE OF l/);
  assert.match(route, /lead_redistribution_preview_leads/);
  assert.match(route, /UPDATE \$\{config\.table\}/);
  assert.match(route, /WITH assignments AS/);
  assert.match(route, /INSERT INTO lead_reassignment_log/);
  assert.match(route, /createBatchAssignmentNotifications\(client/);
});

test('bulk and individual reassignment histories share canonical module identifiers', () => {
  for (const auditModule of ['leads', 'leads-pj', 'leads-upsell', 'referrals']) {
    assert.match(
      fs.readFileSync(new URL('../services/leadRedistributionService.js', import.meta.url), 'utf8'),
      new RegExp(`auditModule: '${auditModule}'`),
    );
  }
  assert.match(route, /config\.auditModule/);
  assert.match(route, /r\.module = ANY\(\$1::text\[\]\)/);
  assert.match(entitiesRoute, /ARRAY\['leads', 'sales'\]/);
  assert.match(entitiesRoute, /ARRAY\['leads-pj', 'sales_pj'\]/);
  assert.match(entitiesRoute, /ARRAY\['leads-upsell', 'sales_upsell'\]/);
  assert.match(entitiesRoute, /ARRAY\['referrals', 'referral'\]/);
});

test('canonical schema owns audit fields and owner indexes', () => {
  assert.match(schema, /CREATE TABLE IF NOT EXISTS lead_reassignment_log/);
  assert.match(schema, /context VARCHAR\(30\)/);
  assert.match(schema, /batch_id UUID/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS lead_redistribution_previews/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS lead_redistribution_preview_leads/);
  assert.match(schema, /executor_key VARCHAR\(255\) NOT NULL/);
  assert.match(route, /DELETE FROM lead_redistribution_previews WHERE expires_at <= NOW\(\)/);
  assert.match(route, /owner_agent\.team_id = \$2/);
  for (const index of ['idx_leads_agent_id', 'idx_leads_pj_agent_id', 'idx_leads_upsell_agent_id', 'idx_referrals_agent_id']) {
    assert.match(schema, new RegExp(index));
  }
});

test('manual deactivation uses the system choice dialog instead of a browser confirmation', () => {
  assert.match(agentsPage, /<AlertDialog[\s\S]*Redistribuir carteira antes de sair\?/);
  assert.match(agentsPage, /Apenas desativar/);
  assert.match(agentsPage, /Desativar e redistribuir/);
  assert.doesNotMatch(
    agentsPage,
    /window\.confirm\([\s\S]{0,500}abrir a redistribuição/,
  );
});

test('destination teams are derived only from module-eligible active destinations', () => {
  assert.match(route, /const teams = \[\.\.\.new Map\([\s\S]*destinations[\s\S]*row\.team_id/);
  assert.doesNotMatch(route, /SELECT DISTINCT t\.id, t\.name FROM teams/);
});

test('preview keeps portfolio placeholders aligned when a source filter is present', () => {
  assert.match(route, /const params = \[\.\.\.where\.params\]/);
  assert.match(route, /params\.push\(previewId\);\s*const previewIdParam = params\.length/);
  assert.match(route, /SELECT \$\$\{previewIdParam\}::uuid, l\.id/);
  assert.doesNotMatch(route, /const params = \[previewId, \.\.\.where\.params\]/);
});

test('redistribution submenu is configurable and requires an explicit non-admin grant', () => {
  for (const submenu of [
    'LeadRedistributionSales',
    'LeadRedistributionSalesPJ',
    'LeadRedistributionUpsell',
    'LeadRedistributionReferral',
  ]) {
    assert.match(agentsPage, new RegExp(`id: "${submenu}", title: "Redistribuição de leads"`));
    assert.match(layoutPage, new RegExp(`requiredSubmenu: "${submenu}", requiresExplicitSubmenu: true`));
  }
  assert.doesNotMatch(
    layoutPage,
    /title: "Redistribuição de leads"[\s\S]{0,180}alwaysVisible: true/,
  );
  assert.match(agentsPage, /allowedSubmenus \|\| \[\]\)\.some\(submenu => redistributionSubmenus\.has\(submenu\)\)/);
});

test('module admins only see redistribution after the matching channel grant', async () => {
  const permissionsUrl = `data:text/javascript;base64,${Buffer.from(permissionsSource).toString('base64')}`;
  const { filterMenuItems } = await import(permissionsUrl);
  const redistributionItem = {
    title: 'Redistribuição de leads',
    url: '/LeadRedistribution?module=sales_upsell',
    supervisorOnly: true,
    requiredSubmenu: 'LeadRedistributionUpsell',
    requiresExplicitSubmenu: true,
  };
  const dashboardItem = {
    title: 'Dashboard',
    url: '/SalesUpsellDashboard',
    supervisorOnly: true,
  };
  const menu = [{ id: 'sales_upsell', items: [dashboardItem, redistributionItem] }];

  const withoutGrant = filterMenuItems({
    agent_type: 'upsell_admin',
    modules: ['sales_upsell'],
    allowedSubmenus: [],
  }, menu);
  assert.deepEqual(withoutGrant[0].items.map(item => item.title), ['Dashboard']);

  const withGrant = filterMenuItems({
    agent_type: 'upsell_admin',
    modules: ['sales_upsell'],
    allowedSubmenus: ['LeadRedistributionUpsell'],
  }, menu);
  assert.deepEqual(
    withGrant[0].items.map(item => item.title),
    ['Dashboard', 'Redistribuição de leads'],
  );

  const masterAdmin = filterMenuItems(
    { agent_type: 'admin', modules: [], allowedSubmenus: [] },
    menu,
    { role: 'admin' },
  );
  assert.deepEqual(
    masterAdmin[0].items.map(item => item.title),
    ['Dashboard', 'Redistribuição de leads'],
  );
});