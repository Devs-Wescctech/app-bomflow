import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAuthenticatedOrcamentoPayload,
  classifyAgentErpLink,
  persistResolvedAgentErpLink,
} from './erpAgentLinking.js';

const resolution = (overrides = {}) => ({
  status: 'ok',
  pessoaInternalId: 302000111,
  pessoaCodigo: '2606501',
  usuarioId: 297839054,
  login: 'julia.silva',
  usuarioAtivo: 'S',
  ...overrides,
});

function makeDb({ duplicate = null } = {}) {
  const calls = [];
  const db = async (sql, params) => {
    calls.push({ sql, params });
    if (/SELECT id, name FROM agents WHERE erp_agent_id/.test(sql)) {
      return { rows: duplicate ? [duplicate] : [] };
    }
    return { rows: [], rowCount: 1 };
  };
  db.calls = calls;
  return db;
}

test('usuário ERP existente e correspondente ao CPF permanece com usuarios.id e login nativo', () => {
  const result = classifyAgentErpLink({
    agent: { erp_agent_id: 297839054 },
    resolution: resolution(),
  });

  assert.deepEqual(result, { status: 'ja_vinculado', repairable: false });
});

test('id legado de pessoas é identificado como reparável, nunca como Usuário ERP válido', () => {
  const result = classifyAgentErpLink({
    agent: { erp_agent_id: 302000111 },
    resolution: resolution(),
  });

  assert.deepEqual(result, { status: 'id_pessoa_legado', repairable: true });
});

test('múltiplos usuários para a mesma Pessoa ficam bloqueados para revisão', () => {
  const result = classifyAgentErpLink({
    agent: { erp_agent_id: 302000111 },
    resolution: resolution({ status: 'usuarios_ambiguos', usuarioId: null, login: null }),
  });

  assert.deepEqual(result, { status: 'usuarios_ambiguos', repairable: false });
});

test('usuário recém-resolvido grava usuarios.id e pessoas_contratos.id em campos separados', async () => {
  const db = makeDb();
  const registerCalls = [];
  const result = await persistResolvedAgentErpLink({
    agent: {
      id: 'agent-1',
      erp_agent_id: null,
      erp_agente_venda_id: null,
      canal_venda_id: 77,
      canal_venda_grupo_id: 12,
    },
    resolution: resolution(),
    queryDb: db,
    registerCanal: async (...args) => {
      registerCalls.push(args);
      return 900123;
    },
  });

  assert.equal(result.erpAgentId, 297839054);
  assert.equal(result.erpAgenteVendaId, 900123);
  assert.deepEqual(result.actions, ['vinculo', 'canal']);
  assert.deepEqual(registerCalls, [[302000111, 77, 12]]);
  assert.ok(db.calls.some((c) => /SET erp_agent_id =/.test(c.sql) && c.params[0] === 297839054));
  assert.ok(db.calls.some((c) => /SET erp_agente_venda_id =/.test(c.sql) && c.params[0] === 900123));
});

test('conflito de unicidade não permite vincular o mesmo Usuário ERP a dois agentes', async () => {
  const db = makeDb({ duplicate: { id: 'agent-2', name: 'Outro Agente' } });

  await assert.rejects(
    () => persistResolvedAgentErpLink({
      agent: { id: 'agent-1', erp_agent_id: null },
      resolution: resolution(),
      queryDb: db,
      registerCanal: async () => 1,
    }),
    (error) => error.code === 'usuario_ja_vinculado' && /Outro Agente/.test(error.message)
  );
});

test('vínculo de canal salvo é sempre revalidado e corrigido quando aponta para outro registro', async () => {
  const db = makeDb();
  let registerCount = 0;
  const result = await persistResolvedAgentErpLink({
    agent: {
      id: 'agent-1',
      erp_agent_id: 297839054,
      erp_agente_venda_id: 800001,
      canal_venda_id: 88,
      canal_venda_grupo_id: null,
    },
    resolution: resolution(),
    queryDb: db,
    registerCanal: async () => {
      registerCount += 1;
      return 800002;
    },
  });

  assert.equal(registerCount, 1);
  assert.equal(result.erpAgenteVendaId, 800002);
  assert.deepEqual(result.actions, ['canal']);
});

test('orçamento é bloqueado antes do ERP quando o vínculo de canal está ausente', () => {
  assert.throws(
    () => buildAuthenticatedOrcamentoPayload(
      { usuario_inclusao: 'forjado', agente_venda_id: 123 },
      { erp_agent_id: 297839054, erp_agente_venda_id: null },
      resolution()
    ),
    (error) => error.statusCode === 422 && /canal de vendas/i.test(error.message)
  );
});

test('orçamento é bloqueado quando o Usuário ERP está ausente ou ambíguo', () => {
  assert.throws(
    () => buildAuthenticatedOrcamentoPayload(
      { usuario_inclusao: 'forjado', agente_venda_id: 123 },
      { erp_agent_id: null, erp_agente_venda_id: 900123 },
      resolution()
    ),
    /não está vinculado a um Usuário do ERP/i
  );

  assert.throws(
    () => buildAuthenticatedOrcamentoPayload(
      {},
      { erp_agent_id: 297839054, erp_agente_venda_id: 900123 },
      resolution({ status: 'usuarios_ambiguos', usuarioId: null, login: null })
    ),
    /não corresponde ao CPF/i
  );
});

test('payload final ignora autoria forjada e usa login e vendedor do agente autenticado', () => {
  const payload = buildAuthenticatedOrcamentoPayload(
    {
      tipo_pedido: 'ORÇAMENTO',
      usuario_inclusao: 'login.forjado',
      agente_venda_id: 111,
    },
    {
      erp_agent_id: 297839054,
      erp_agente_venda_id: 900123,
    },
    resolution()
  );

  assert.equal(payload.usuario_inclusao, 'julia.silva');
  assert.equal(payload.agente_venda_id, 900123);
  assert.equal(payload.tipo_pedido, 'ORÇAMENTO');
});