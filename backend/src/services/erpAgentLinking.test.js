import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAuthenticatedOrcamentoPayload,
  classifyAgentCanalAudit,
  classifyCanalSyncState,
  classifyAgentErpLink,
  classifyErpSyncError,
  createMissingErpCanalError,
  hasManagedErpAgentField,
  mirrorConfirmedAgentCanal,
  persistResolvedAgentErpLink,
  sameCpf,
  syncResolvedAgentCanal,
} from './erpAgentLinking.js';
import { selectAgentCanalInspection } from './erpDbService.js';

const resolution = (overrides = {}) => ({
  status: 'ok',
  pessoaInternalId: 302000111,
  pessoaCodigo: '2606501',
  usuarioId: 297839054,
  login: 'julia.silva',
  usuarioAtivo: 'S',
  ...overrides,
});

function makeDb({
  duplicate = null,
  current = {
    cpf: '123.456.789-09',
    erp_agent_id: 297839054,
    canal_venda_id: 77,
    canal_venda_grupo_id: 12,
  },
} = {}) {
  const calls = [];
  const db = async (sql, params) => {
    calls.push({ sql, params });
    if (/SELECT id, name FROM agents WHERE erp_agent_id/.test(sql)) {
      return { rows: duplicate ? [duplicate] : [] };
    }
    if (/SELECT cpf, erp_agent_id, (?:erp_agente_venda_id, )?canal_venda_id/.test(sql)) {
      return {
        rows: [current],
        rowCount: 1,
      };
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

test('id legado de pessoas é identificado e bloqueado, nunca corrigido silenciosamente', () => {
  const result = classifyAgentErpLink({
    agent: { erp_agent_id: 302000111 },
    resolution: resolution(),
  });

  assert.deepEqual(result, { status: 'id_pessoa_legado', repairable: false });
});

test('payloads diretos não podem informar nenhum dos IDs ERP gerenciados', () => {
  assert.equal(hasManagedErpAgentField({ name: 'Agente', erpAgentId: 123 }), true);
  assert.equal(hasManagedErpAgentField({ erp_agent_id: 123 }), true);
  assert.equal(hasManagedErpAgentField({ erpAgenteVendaId: 456 }), true);
  assert.equal(hasManagedErpAgentField({ erp_agente_venda_id: 456 }), true);
  assert.equal(hasManagedErpAgentField({ name: 'Agente', canalVendaId: 77 }), false);
});

test('comparação de CPF ignora máscara, mas detecta troca de identidade', () => {
  assert.equal(sameCpf('123.456.789-09', '12345678909'), true);
  assert.equal(sameCpf('123.456.789-09', '987.654.321-00'), false);
});

test('múltiplos usuários para a mesma Pessoa ficam bloqueados para revisão', () => {
  const result = classifyAgentErpLink({
    agent: { erp_agent_id: 302000111 },
    resolution: resolution({ status: 'usuarios_ambiguos', usuarioId: null, login: null }),
  });

  assert.deepEqual(result, { status: 'usuarios_ambiguos', repairable: false });
});

test('primeiro vínculo já mostra o canal efetivo existente no ERP mesmo com os dois espelhos locais vazios', () => {
  const result = classifyAgentCanalAudit({
    status: 'ok',
    repairable: true,
    currentErpAgenteVendaId: null,
    inspection: {
      ids: [54238947],
      effectiveId: 54238947,
      ambiguous: false,
    },
  });

  assert.deepEqual(result, {
    status: 'ok',
    repairable: true,
    effectiveErpAgenteVendaId: 54238947,
    canalErro: null,
  });
});

test('vínculo de canal existente no ERP, mas não espelhado localmente, é reparável', () => {
  const result = classifyAgentCanalAudit({
    status: 'ja_vinculado',
    repairable: false,
    currentErpAgenteVendaId: null,
    inspection: {
      ids: [54238947],
      effectiveId: 54238947,
      ambiguous: false,
    },
  });

  assert.equal(result.status, 'canal_nao_espelhado');
  assert.equal(result.repairable, true);
  assert.equal(result.effectiveErpAgenteVendaId, 54238947);
});

test('um único vínculo legado da mesma Pessoa e canal é reaproveitado mesmo com grupo antigo', () => {
  assert.deepEqual(
    selectAgentCanalInspection([{ id: 54238947, grupo_id: null }], 777),
    {
      ids: [54238947],
      effectiveId: 54238947,
      ambiguous: false,
      matchKind: 'legacy',
    }
  );
});

test('vínculos duplicados da mesma Pessoa e canal permanecem ambíguos e bloqueados', () => {
  assert.deepEqual(
    selectAgentCanalInspection([
      { id: 54238947, grupo_id: 777 },
      { id: 54238948, grupo_id: null },
    ], 777),
    {
      ids: [54238947, 54238948],
      effectiveId: null,
      ambiguous: true,
      matchKind: null,
    }
  );
});

test('estado do canal só fica confirmado depois de uma leitura inequívoca no ERP', () => {
  assert.deepEqual(
    classifyCanalSyncState({
      hasCanal: true,
      currentErpAgenteVendaId: 54238947,
      inspection: { ids: [54238947], effectiveId: 54238947, ambiguous: false },
    }),
    {
      status: 'canal_confirmado',
      repairable: false,
      confirmed: true,
      effectiveErpAgenteVendaId: 54238947,
    }
  );
});

test('duplicidade e divergência do canal são expostas separadamente do Usuário ERP', () => {
  const duplicated = classifyCanalSyncState({
    hasCanal: true,
    currentErpAgenteVendaId: null,
    inspection: { ids: [54238947, 54238948], effectiveId: null, ambiguous: true },
  });
  assert.equal(duplicated.status, 'canal_ambiguo');
  assert.equal(duplicated.confirmed, false);

  const divergent = classifyCanalSyncState({
    hasCanal: true,
    currentErpAgenteVendaId: 54238947,
    inspection: { ids: [54238948], effectiveId: 54238948, ambiguous: false },
  });
  assert.equal(divergent.status, 'canal_divergente');
  assert.equal(divergent.confirmed, true);
  assert.equal(divergent.repairable, true);
});

test('indisponibilidade do banco ERP é separada de vínculo não encontrado', () => {
  const unavailable = classifyErpSyncError(
    Object.assign(new Error('connect ETIMEDOUT'), { code: 'ETIMEDOUT' })
  );
  const notFound = classifyErpSyncError(
    Object.assign(new Error('Pessoa não encontrada'), { code: 'pessoa_nao_encontrada' })
  );

  assert.deepEqual(unavailable, {
    status: 'erp_indisponivel',
    retryable: true,
    erro: 'connect ETIMEDOUT',
  });
  assert.equal(notFound.status, 'pessoa_nao_encontrada');
  assert.equal(notFound.retryable, false);
});

test('mensagens reais de timeout do pg são sempre tratadas como indisponibilidade operacional', () => {
  for (const message of [
    'timeout expired',
    'timeout exceeded when trying to connect',
    'Query read timeout',
  ]) {
    assert.deepEqual(classifyErpSyncError(new Error(message)), {
      status: 'erp_indisponivel',
      retryable: true,
      erro: message,
    });
  }
});

test('erro sem mensagem recebe diagnóstico da etapa de auditoria do canal', () => {
  const failure = classifyErpSyncError(
    { code: 'ECONNREFUSED' },
    { stage: 'auditoria_canal_erp' }
  );

  assert.deepEqual(failure, {
    status: 'erp_indisponivel',
    retryable: true,
    erro: 'Não foi possível auditar o vínculo de canal no banco do ERP; o ERP não retornou detalhes para o diagnóstico.',
    etapa: 'auditoria_canal_erp',
  });
});

test('erro lançado como texto preserva o diagnóstico e a etapa de persistência', () => {
  const failure = classifyErpSyncError(
    'timeout ao abrir conexão',
    { stage: 'persistencia_vinculo_erp' }
  );

  assert.equal(failure.status, 'erro');
  assert.equal(failure.retryable, false);
  assert.equal(failure.etapa, 'persistencia_vinculo_erp');
  assert.equal(
    failure.erro,
    'Não foi possível gravar o vínculo de canal no banco do ERP: timeout ao abrir conexão'
  );
});

test('falhas de configuração ou credencial do banco ERP não sugerem nova tentativa operacional', () => {
  for (const code of ['28000', '28P01', '3D000']) {
    const failure = classifyErpSyncError(
      Object.assign(new Error('configuração inválida'), { code })
    );
    assert.equal(failure.status, code);
    assert.equal(failure.retryable, false);
  }
});

test('usuário recém-resolvido grava usuarios.id e pessoas_contratos.id em campos separados', async () => {
  const db = makeDb();
  const registerCalls = [];
  const result = await persistResolvedAgentErpLink({
    agent: {
      id: 'agent-1',
      erp_agent_id: null,
      erp_agente_venda_id: null,
      cpf: '123.456.789-09',
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

test('vínculo ERP existente é apenas espelhado sem alterar o ID do Usuário', async () => {
  const db = makeDb({
    current: {
      cpf: '123.456.789-09',
      erp_agent_id: 53209845,
      canal_venda_id: 77,
      canal_venda_grupo_id: 12,
    },
  });
  const result = await persistResolvedAgentErpLink({
    agent: {
      id: 'agent-jullia',
      erp_agent_id: 53209845,
      erp_agente_venda_id: null,
      cpf: '123.456.789-09',
      canal_venda_id: 77,
      canal_venda_grupo_id: 12,
    },
    resolution: resolution({ usuarioId: 53209845, login: 'jullia.santos' }),
    queryDb: db,
    registerCanal: async () => 54238947,
  });

  assert.deepEqual(result, {
    erpAgentId: 53209845,
    erpAgenteVendaId: 54238947,
    actions: ['canal'],
  });
  assert.equal(db.calls.some((call) => /SET erp_agent_id =/.test(call.sql)), false);
  assert.ok(db.calls.some(
    (call) => /SET erp_agente_venda_id =/.test(call.sql) && call.params[0] === 54238947
  ));
});

test('sincronização REST do Usuário não consulta nem altera o vínculo de canal', async () => {
  const db = makeDb();
  let registerCalls = 0;

  const result = await persistResolvedAgentErpLink({
    agent: {
      id: 'agent-rest-only',
      erp_agent_id: null,
      erp_agente_venda_id: 900123,
      cpf: '123.456.789-09',
      canal_venda_id: 77,
      canal_venda_grupo_id: 12,
    },
    resolution: resolution(),
    queryDb: db,
    registerCanal: async () => {
      registerCalls += 1;
      return 800456;
    },
    syncCanal: false,
  });

  assert.deepEqual(result, {
    erpAgentId: 297839054,
    erpAgenteVendaId: 900123,
    actions: ['vinculo'],
  });
  assert.equal(registerCalls, 0);
  assert.equal(db.calls.some((call) => /SET erp_agente_venda_id/.test(call.sql)), false);
});

test('canal sem seleção não apaga o espelho local sem confirmação efetiva no ERP', async () => {
  const db = makeDb({
    current: {
      cpf: '123.456.789-09',
      erp_agent_id: 297839054,
      canal_venda_id: null,
      canal_venda_grupo_id: null,
    },
  });
  let registerCalls = 0;

  const result = await syncResolvedAgentCanal({
    agent: {
      id: 'agent-no-canal',
      cpf: '123.456.789-09',
      erp_agent_id: 297839054,
      erp_agente_venda_id: 900123,
      canal_venda_id: null,
      canal_venda_grupo_id: null,
    },
    resolution: resolution(),
    queryDb: db,
    registerCanal: async () => {
      registerCalls += 1;
      return 900456;
    },
  });

  assert.deepEqual(result, {
    status: 'sem_canal_configurado',
    confirmed: false,
    erpAgenteVendaId: 900123,
    actions: [],
  });
  assert.equal(registerCalls, 0);
  assert.equal(db.calls.some((call) => /SET erp_agente_venda_id/.test(call.sql)), false);
});

test('indisponibilidade do canal não desfaz o Usuário ERP já sincronizado por REST', async () => {
  const db = makeDb();
  const agent = {
    id: 'agent-channel-unavailable',
    cpf: '123.456.789-09',
    erp_agent_id: null,
    erp_agente_venda_id: null,
    canal_venda_id: 77,
    canal_venda_grupo_id: 12,
  };

  const usuario = await persistResolvedAgentErpLink({
    agent,
    resolution: resolution(),
    queryDb: db,
    syncCanal: false,
  });

  await assert.rejects(
    () => syncResolvedAgentCanal({
      agent,
      resolution: resolution(),
      queryDb: db,
      registerCanal: async () => {
        throw Object.assign(new Error('connect ETIMEDOUT'), { code: 'ETIMEDOUT' });
      },
    }),
    (error) => error.code === 'ETIMEDOUT'
  );

  assert.equal(usuario.erpAgentId, 297839054);
  assert.deepEqual(usuario.actions, ['vinculo']);
  assert.ok(db.calls.some((call) => /SET erp_agent_id =/.test(call.sql)));
  assert.equal(db.calls.some((call) => /SET erp_agente_venda_id/.test(call.sql)), false);
});

test('orçamento espelha somente um canal já confirmado, sem criar vínculo no ERP', async () => {
  const db = makeDb({
    current: {
      cpf: '123.456.789-09',
      erp_agent_id: 297839054,
      erp_agente_venda_id: null,
      canal_venda_id: 77,
      canal_venda_grupo_id: 12,
    },
  });
  let inspectCalls = 0;

  const result = await mirrorConfirmedAgentCanal({
    agent: {
      id: 'agent-orcamento',
      cpf: '123.456.789-09',
      erp_agent_id: 297839054,
      erp_agente_venda_id: null,
      canal_venda_id: 77,
      canal_venda_grupo_id: 12,
    },
    resolution: resolution(),
    queryDb: db,
    inspectCanal: async () => {
      inspectCalls += 1;
      return { ids: [54238947], effectiveId: 54238947, ambiguous: false };
    },
  });

  assert.deepEqual(result, {
    status: 'canal_confirmado',
    confirmed: true,
    erpAgenteVendaId: 54238947,
    actions: ['canal'],
  });
  assert.equal(inspectCalls, 1);
  assert.ok(db.calls.some((call) => /SET erp_agente_venda_id/.test(call.sql)));
});

test('orçamento não espelha canal duplicado nem escolhe um ID automaticamente', async () => {
  const db = makeDb();

  await assert.rejects(
    () => mirrorConfirmedAgentCanal({
      agent: {
        id: 'agent-orcamento-duplicado',
        cpf: '123.456.789-09',
        erp_agent_id: 297839054,
        erp_agente_venda_id: null,
        canal_venda_id: 77,
        canal_venda_grupo_id: 12,
      },
      resolution: resolution(),
      queryDb: db,
      inspectCanal: async () => ({
        ids: [54238947, 54238948],
        effectiveId: null,
        ambiguous: true,
      }),
    }),
    (error) => error.code === 'canal_ambiguo'
  );
  assert.equal(db.calls.some((call) => /SET erp_agente_venda_id/.test(call.sql)), false);
});

test('orçamento não cria vínculo de canal ausente durante a auto-reconciliação', async () => {
  const db = makeDb();

  await assert.rejects(
    () => mirrorConfirmedAgentCanal({
      agent: {
        id: 'agent-orcamento-sem-canal',
        cpf: '123.456.789-09',
        erp_agent_id: 297839054,
        erp_agente_venda_id: null,
        canal_venda_id: 77,
        canal_venda_grupo_id: 12,
      },
      resolution: resolution(),
      queryDb: db,
      inspectCanal: async () => ({
        ids: [],
        effectiveId: null,
        ambiguous: false,
      }),
    }),
    (error) =>
      error.code === 'canal_nao_confirmado'
      && error.message === 'Seu usuário ainda não possui vínculo com um canal de vendas no ERP. Solicite a correção em Configurações > Agentes.'
  );
  assert.equal(db.calls.some((call) => /SET erp_agente_venda_id/.test(call.sql)), false);
});

test('vínculo de canal ausente usa uma mensagem curta e orientada à sincronização', () => {
  const error = createMissingErpCanalError();
  assert.equal(error.code, 'canal_nao_confirmado');
  assert.equal(error.statusCode, 422);
  assert.equal(
    error.message,
    'Seu usuário ainda não possui vínculo com um canal de vendas no ERP. Solicite a correção em Configurações > Agentes.'
  );
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

test('ID de Usuário ERP já preenchido nunca é substituído por resolução divergente', async () => {
  const db = makeDb();
  let registerCount = 0;

  await assert.rejects(
    () => persistResolvedAgentErpLink({
      agent: {
        id: 'agent-1',
        erp_agent_id: 111111,
        erp_agente_venda_id: null,
        canal_venda_id: 77,
      },
      resolution: resolution(),
      queryDb: db,
      registerCanal: async () => {
        registerCount += 1;
        return 900123;
      },
    }),
    (error) => error.code === 'usuario_id_divergente' && /imutável/i.test(error.message)
  );

  assert.equal(registerCount, 0);
  assert.equal(db.calls.some((c) => /SET erp_agent_id =/.test(c.sql)), false);
  assert.equal(db.calls.some((c) => /SET erp_agente_venda_id =/.test(c.sql)), false);
});

test('mudança concorrente de CPF bloqueia o primeiro vínculo antes de registrar o canal', async () => {
  const calls = [];
  const db = async (sql, params) => {
    calls.push({ sql, params });
    if (/SELECT id, name FROM agents WHERE erp_agent_id/.test(sql)) {
      return { rows: [] };
    }
    if (/UPDATE agents[\s\S]+erp_agent_id =/.test(sql)) {
      return { rows: [], rowCount: 0 };
    }
    if (/SELECT cpf, erp_agent_id, canal_venda_id/.test(sql)) {
      return {
        rows: [{
          cpf: '987.654.321-00',
          erp_agent_id: null,
          canal_venda_id: 77,
          canal_venda_grupo_id: 12,
        }],
      };
    }
    return { rows: [], rowCount: 1 };
  };
  let registerCount = 0;

  await assert.rejects(
    () => persistResolvedAgentErpLink({
      agent: {
        id: 'agent-1',
        cpf: '123.456.789-09',
        erp_agent_id: null,
        erp_agente_venda_id: null,
        canal_venda_id: 77,
        canal_venda_grupo_id: 12,
      },
      resolution: resolution(),
      queryDb: db,
      registerCanal: async () => {
        registerCount += 1;
        return 900123;
      },
    }),
    (error) => error.code === 'agente_alterado_durante_sync'
  );

  assert.equal(registerCount, 0);
  assert.ok(calls.some((c) => /cpf IS NOT DISTINCT FROM/.test(c.sql)));
});

test('classificação bloqueia divergência por CPF em vez de marcá-la como reparável', () => {
  const result = classifyAgentErpLink({
    agent: { erp_agent_id: 123456 },
    resolution: resolution(),
    storedUsuario: { id: 123456, pessoa: 'OUTRA_PESSOA' },
  });

  assert.deepEqual(result, { status: 'usuario_outro_cpf', repairable: false });
});

test('vínculo de canal salvo é sempre revalidado e corrigido quando aponta para outro registro', async () => {
  const db = makeDb({
    current: {
      cpf: '123.456.789-09',
      erp_agent_id: 297839054,
      canal_venda_id: 88,
      canal_venda_grupo_id: null,
    },
  });
  let registerCount = 0;
  const result = await persistResolvedAgentErpLink({
    agent: {
      id: 'agent-1',
      erp_agent_id: 297839054,
      erp_agente_venda_id: 800001,
      cpf: '123.456.789-09',
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