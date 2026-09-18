import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Buffer } from 'node:buffer';
import { requireExplicitSubmenuAccess } from '../middleware/permissions.js';

const permissionsSource = fs.readFileSync(
  new URL('../../../src/components/utils/permissions.jsx', import.meta.url),
  'utf8',
);
const route = fs.readFileSync(new URL('./postsales.js', import.meta.url), 'utf8');
const presalesRoute = fs.readFileSync(new URL('./presalesAjustes.js', import.meta.url), 'utf8');

test('dashboard exige autenticação, autorização gerencial e payload explícito', () => {
  const block = route.match(/router\.get\('\/dashboard'[\s\S]*?\n}\);/)?.[0] || '';
  const dashboardSource = route.slice(route.indexOf("router.get(\n  '/dashboard'"), route.indexOf("// GET /:id/detalhe"));
  assert.match(dashboardSource, /authMiddleware/);
  assert.match(dashboardSource, /loadAgentMiddleware/);
  assert.match(dashboardSource, /requireExplicitSubmenuAccess\('PosVendasDashboard'\)/);
  assert.match(dashboardSource, /resolveLeitura/);
  assert.doesNotMatch(dashboardSource, /SELECT v\.\*/);
  assert.match(dashboardSource, /v\.concluida_at/);
  assert.equal(block, '');
});

test('dashboard do Pré-Vendas exige concessão explícita além da elegibilidade', () => {
  const dashboardSource = presalesRoute.slice(
    presalesRoute.indexOf("router.get(\n  '/dashboard'"),
    presalesRoute.indexOf('// GET /monitor'),
  );
  assert.match(dashboardSource, /authMiddleware/);
  assert.match(dashboardSource, /loadAgentMiddleware/);
  assert.match(dashboardSource, /requireExplicitSubmenuAccess\('PreSalesDashboard'\)/);
  assert.match(dashboardSource, /resolveAuditor/);
});

test('dashboards só aparecem para administrador master ou perfil elegível com concessão', async () => {
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
    { agent_type: 'post_sales', modules: ['post_sales'], allowedSubmenus: ['PosVendasDashboard'] },
    { agent_type: 'custom_ps', modules: ['post_sales'], allowedSubmenus: ['PosVendasDashboard'] },
  ]) {
    assert.equal(filterMenuItems(agent, menu)[0]?.items[0]?.title, 'Dashboard');
  }
  for (const agent of [
    { agent_type: 'supervisor', modules: [], allowedSubmenus: [] },
    { agent_type: 'auditoria', modules: [], allowedSubmenus: ['OutraTela'] },
    { agent_type: 'post_sales', modules: ['post_sales'], allowedSubmenus: ['OutraTela'] },
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

test('API exige concessão explícita para perfis que não são administrador master', () => {
  const middleware = requireExplicitSubmenuAccess('PosVendasDashboard');
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
    middleware(req, res, () => { nextCalled = true; });
    return { nextCalled, response };
  };

  assert.equal(run({
    user: { role: 'admin' },
    agent: { agentType: 'admin', allowedSubmenus: [] },
  }).nextCalled, true);
  assert.equal(run({
    user: { role: 'user' },
    agent: { agentType: 'post_sales', allowedSubmenus: ['PosVendasDashboard'] },
  }).nextCalled, true);
  assert.equal(run({
    user: { role: 'user' },
    agent: { agentType: 'post_sales', allowedSubmenus: [] },
  }).response.code, 403);
  assert.equal(run({
    user: { role: 'user' },
    agent: null,
  }).response.code, 403);
});