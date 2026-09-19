import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Buffer } from 'node:buffer';
import { requireDashboardAccess } from '../middleware/permissions.js';

const permissionsSource = fs.readFileSync(
  new URL('../../../src/components/utils/permissions.jsx', import.meta.url),
  'utf8',
);
const route = fs.readFileSync(new URL('./postsales.js', import.meta.url), 'utf8');
const presalesRoute = fs.readFileSync(new URL('./presalesAjustes.js', import.meta.url), 'utf8');

test('dashboard exige autenticação, autorização aditiva e payload explícito', () => {
  const block = route.match(/router\.get\('\/dashboard'[\s\S]*?\n}\);/)?.[0] || '';
  const dashboardSource = route.slice(route.indexOf("router.get(\n  '/dashboard'"), route.indexOf("// GET /:id/detalhe"));
  assert.match(dashboardSource, /authMiddleware/);
  assert.match(dashboardSource, /loadAgentMiddleware/);
  assert.match(dashboardSource, /requireDashboardAccess\('PosVendasDashboard'\)/);
  assert.match(dashboardSource, /resolveLeitura/);
  assert.doesNotMatch(dashboardSource, /SELECT v\.\*/);
  assert.match(dashboardSource, /v\.concluida_at/);
  assert.equal(block, '');
});

test('dashboard do Pré-Vendas usa autorização aditiva além da elegibilidade operacional', () => {
  const dashboardSource = presalesRoute.slice(
    presalesRoute.indexOf("router.get(\n  '/dashboard'"),
    presalesRoute.indexOf('// GET /monitor'),
  );
  assert.match(dashboardSource, /authMiddleware/);
  assert.match(dashboardSource, /loadAgentMiddleware/);
  assert.match(dashboardSource, /requireDashboardAccess\('PreSalesDashboard'\)/);
  assert.match(dashboardSource, /resolveAuditor/);
});

test('Dashboard Pós-Vendas aparece por perfil automático, concessão ou administração', async () => {
  const permissionsUrl = `data:text/javascript;base64,${Buffer.from(permissionsSource).toString('base64')}`;
  const { filterMenuItems } = await import(permissionsUrl);
  const menu = [{
    id: 'postsales',
    moduleId: 'presales',
    items: [{
      title: 'Dashboard',
      url: '/PosVendasDashboard',
      postsalesDashboard: true,
      requiredSubmenu: 'PosVendasDashboard',
      requiresExplicitSubmenu: true,
    }],
  }];
  for (const agent of [
    { agent_type: 'supervisor', modules: [], allowedSubmenus: ['PosVendasDashboard'] },
    { agent_type: 'auditoria', modules: [], allowedSubmenus: ['PosVendasDashboard'] },
    { agent_type: 'post_sales', modules: ['post_sales'], allowedSubmenus: [] },
    { agent_type: 'custom_ps', modules: [], allowedSubmenus: ['PosVendasDashboard'] },
  ]) {
    assert.equal(filterMenuItems(agent, menu)[0]?.items[0]?.title, 'Dashboard');
  }
  for (const agent of [
    { agent_type: 'supervisor', modules: [], allowedSubmenus: [] },
    { agent_type: 'auditoria', modules: [], allowedSubmenus: ['OutraTela'] },
    { agent_type: 'sales', modules: ['sales'], allowedSubmenus: ['OutraTela'] },
  ]) {
    assert.deepEqual(filterMenuItems(agent, menu)[0]?.items || [], []);
  }
  assert.equal(
    filterMenuItems(
      { agent_type: 'admin', modules: [], allowedSubmenus: [] },
      menu,
      { role: 'admin' },
    )[0]?.items[0]?.title,
    'Dashboard',
  );
  assert.deepEqual(filterMenuItems({ agent_type: 'sales', modules: ['sales'], allowedSubmenus: [] }, menu), []);
});

test('Dashboard Pré-Vendas aparece por supervisão da Auditoria, concessão ou administração', async () => {
  const permissionsUrl = `data:text/javascript;base64,${Buffer.from(permissionsSource).toString('base64')}`;
  const { filterMenuItems } = await import(permissionsUrl);
  const menu = [{
    id: 'presales',
    items: [{
      title: 'Dashboard',
      url: '/PreSalesDashboard',
      auditReport: true,
      requiredSubmenu: 'PreSalesDashboard',
      requiresExplicitSubmenu: true,
    }],
  }];

  assert.equal(filterMenuItems({
    agent_type: 'supervisor',
    teamName: 'Auditoria',
    modules: [],
    allowedSubmenus: [],
  }, menu)[0]?.items[0]?.title, 'Dashboard');
  assert.equal(filterMenuItems({
    agent_type: 'sales',
    modules: [],
    allowedSubmenus: ['PreSalesDashboard'],
  }, menu)[0]?.items[0]?.title, 'Dashboard');
  assert.deepEqual(filterMenuItems({
    agent_type: 'supervisor',
    teamName: 'Comercial',
    modules: [],
    allowedSubmenus: [],
  }, menu), []);
});

test('API aplica acesso automático, explícito, administrativo e nega os demais', () => {
  const run = (req) => {
    let nextCalled = false;
    let response = null;
    const res = {
      status(code) {
        return {
          json(payload) {
            response = { code, payload };
          },
        };
      },
    };
    requireDashboardAccess(req.submenu)(req, res, () => { nextCalled = true; });
    return { nextCalled, response };
  };

  assert.equal(run({
    user: { role: 'admin' },
    agent: { agentType: 'admin', allowedSubmenus: [] },
    submenu: 'PosVendasDashboard',
  }).nextCalled, true);
  assert.equal(run({
    user: { role: 'user' },
    agent: { agentType: 'post_sales', allowedSubmenus: [] },
    submenu: 'PosVendasDashboard',
  }).nextCalled, true);
  assert.equal(run({
    user: { role: 'user' },
    agent: { agentType: 'supervisor', teamName: 'Auditoria', allowedSubmenus: [] },
    submenu: 'PreSalesDashboard',
  }).nextCalled, true);
  assert.equal(run({
    user: { role: 'user' },
    agent: { agentType: 'sales', allowedSubmenus: ['PosVendasDashboard'] },
    submenu: 'PosVendasDashboard',
  }).nextCalled, true);
  assert.equal(run({
    user: { role: 'user' },
    agent: { agentType: 'sales', allowedSubmenus: [] },
    submenu: 'PosVendasDashboard',
  }).response.code, 403);
  assert.equal(run({
    user: { role: 'user' },
    agent: null,
    submenu: 'PreSalesDashboard',
  }).response.code, 403);
});