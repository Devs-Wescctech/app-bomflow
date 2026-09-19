import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createBomPetAuthorizer, isBomPetSupervisor } from './bomPet.js';

const source = fs.readFileSync(new URL('./bomPet.js', import.meta.url), 'utf8');

function routeBlock(start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.ok(from >= 0, `Rota inicial não encontrada: ${start}`);
  assert.ok(to > from, `Rota final não encontrada depois de: ${start}`);
  return source.slice(from, to);
}

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function queryForAgent(agent, type = {}) {
  let call = 0;
  return async () => {
    call += 1;
    return call === 1
      ? { rows: agent ? [agent] : [] }
      : { rows: [{ label: '', modules: [], allowed_submenus: [], ...type }] };
  };
}

async function authorize({ agent, type, tokenRole = 'agent', allowReportOnly = false }) {
  const req = { user: { id: agent?.id || 1, email: agent?.email || 'x@example.com', role: tokenRole } };
  const res = createResponse();
  let nextCalled = false;
  await createBomPetAuthorizer(queryForAgent(agent, type))(
    req,
    res,
    () => { nextCalled = true; },
    { allowReportOnly }
  );
  return { req, res, nextCalled };
}

test('Pós-Vendas não entra na autorização operacional nem no papel de supervisor do Bom Pet', () => {
  const operationalTypes = source.match(/const ALLOWED_AGENT_TYPES = \[([^\]]+)\]/)?.[1] || '';
  const supervisorBlock = source.slice(
    source.indexOf('function isBomPetSupervisor'),
    source.indexOf('function canViewAllBomPetReport')
  );

  assert.doesNotMatch(operationalTypes, /post_sales/);
  assert.match(supervisorBlock, /reportOnly === true \|\| t === 'post_sales'\) return false/);
  assert.doesNotMatch(supervisorBlock, /req\.user\?\.role/);
  assert.match(source, /const REPORT_ONLY_AGENT_TYPES = \['post_sales'\]/);
  assert.match(
    source,
    /const canAccessOperationalModule = !isReportOnly && \(hasModule \|\| hasDynamicModule\)/
  );
  assert.match(
    source,
    /if \(!canAccessOperationalModule && !\(allowReportOnly && isReportOnly\)\)/
  );
});

test('middleware nega operação ao Pós-Vendas mesmo com módulo dinâmico, papel elevado ou token admin antigo', async () => {
  for (const modules of [['bom_pet'], ['all']]) {
    const result = await authorize({
      agent: {
        id: 7,
        email: 'pos@example.com',
        agent_type: 'post_sales',
        role: 'supervisor',
        is_team_supervisor: true,
      },
      type: { label: 'Supervisor Pós-Vendas', modules },
      tokenRole: 'admin',
    });
    assert.equal(result.nextCalled, false);
    assert.equal(result.res.statusCode, 403);
  }
});

test('middleware libera ao Pós-Vendas somente o modo relatório e não o classifica como supervisor', async () => {
  const result = await authorize({
    agent: {
      id: 7,
      email: 'pos@example.com',
      agent_type: 'post_sales',
      role: 'supervisor',
      is_team_supervisor: true,
    },
    type: { label: 'Supervisor Pós-Vendas', modules: ['all'] },
    tokenRole: 'admin',
    allowReportOnly: true,
  });
  assert.equal(result.nextCalled, true);
  assert.equal(result.req.bomPetAgent.reportOnly, true);
  assert.equal(isBomPetSupervisor(result.req), false);
});

test('middleware mantém acesso operacional para os perfis atuais do Bom Pet e admin persistido', async () => {
  for (const agentType of ['bom_pet_atendente', 'bom_pet_supervisor', 'admin']) {
    const result = await authorize({
      agent: { id: 3, email: 'ok@example.com', agent_type: agentType, role: 'agent' },
    });
    assert.equal(result.nextCalled, true, agentType);
    assert.equal(result.res.statusCode, 200, agentType);
  }
});

test('somente as duas rotas do relatório aceitam a autorização dedicada do Pós-Vendas', () => {
  const reportAuthUses = source.match(/bomPetReportAuth/g) || [];
  assert.equal(reportAuthUses.length, 3); // definição + duas rotas
  assert.match(
    source,
    /router\.get\('\/atendimentos\/atendentes', authMiddleware, bomPetReportAuth, requireBomPetReport/
  );
  assert.match(
    source,
    /router\.get\('\/atendimentos', authMiddleware, bomPetReportAuth/
  );
});

test('consulta, criação, detalhe, edição, arquivos e histórico mantêm autorização operacional', () => {
  const expectedOperationalRoutes = [
    "router.get('/consulta', authMiddleware, bomPetAuth",
    "router.post('/atendimentos', authMiddleware, bomPetAuth",
    "router.get('/atendimentos/:id(\\\\d+)', authMiddleware, bomPetAuth",
    "router.put('/atendimentos/:id', authMiddleware, bomPetAuth",
    "router.post('/atendimentos/:id/imagens', authMiddleware, bomPetAuth",
    "router.get('/comprovantes-pagamento/:filename', authMiddleware, bomPetAuth",
    "router.get('/imagens/:filename', authMiddleware, bomPetAuth",
    "router.get('/atendimentos/:id/historico', authMiddleware, bomPetAuth",
  ];

  for (const declaration of expectedOperationalRoutes) {
    assert.ok(source.includes(declaration), `Autorização operacional ausente em ${declaration}`);
  }
});

test('listagem do relatório dá visão ampla ao perfil dedicado sem ampliar acesso por registro', () => {
  const listBlock = routeBlock(
    "router.get('/atendimentos',",
    "router.post('/atendimentos/:id/imagens'"
  );
  const detailBlock = routeBlock(
    "router.get('/atendimentos/:id(\\\\d+)'",
    "router.get('/atendimentos',"
  );

  assert.match(listBlock, /if \(!canViewAllBomPetReport\(req\)\)/);
  assert.match(listBlock, /if \(atendente && canViewAllBomPetReport\(req\)\)/);
  assert.match(detailBlock, /loadAuthorizedAtendimento\(req, res, id\)/);
  assert.doesNotMatch(detailBlock, /canViewAllBomPetReport/);
});