import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildPostsalesCounts,
  classifyHistoricalResolution,
  postsalesReevaluationLink,
  runPostsalesReconcileResolved,
  transitionReturnedToResolved,
} from './postsalesReevaluationService.js';
import {
  parsePostsalesQueueTarget,
  postsalesRefreshDetail,
} from '../../../src/utils/postsalesNavigation.js';
import {
  presalesAdjustmentOpenMode,
} from '../../../src/utils/presalesAdjustmentNavigation.js';

test('a resolução troca somente devolução pendente e grava a trilha na mesma unidade', async () => {
  const calls = [];
  const item = {
    id: '8f013bc4-ece8-4a42-aa78-511f49565abc',
    erp_pedido_id: 123,
    erp_numero: 456,
    cliente_nome: 'Cliente',
    auditor_email: 'auditor@example.test',
    status: 'resolvida',
  };
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      return calls.length === 1 ? { rows: [item] } : { rows: [] };
    },
  };

  const result = await transitionReturnedToResolved({
    client,
    id: item.id,
    actor: { id: 'actor-id', name: 'Coordenadora' },
    observation: 'Telefone corrigido',
  });

  assert.equal(result, item);
  assert.match(calls[0].sql, /WHERE id = \$1 AND status = 'devolvida'/);
  assert.match(calls[0].sql, /SET status = 'resolvida'/);
  assert.match(calls[1].sql, /INSERT INTO postsales_eventos/);
  assert.equal(calls[1].params[2], 'resolvida');
  assert.match(calls[1].params[3], /Telefone corrigido/);
  assert.match(calls[2].sql, /INSERT INTO notifications/);
  assert.equal(calls[2].params[0], item.auditor_email);
  assert.match(calls[2].params[3], /status=resolvida/);
  assert.match(calls[2].params[3], new RegExp(`item=${item.id}`));
});

test('uma resolução concorrente não duplica trilha', async () => {
  let calls = 0;
  const client = {
    async query() {
      calls++;
      return { rows: [] };
    },
  };

  const result = await transitionReturnedToResolved({
    client,
    id: 'already-treated',
    actor: { name: 'Coordenadora' },
  });

  assert.equal(result, null);
  assert.equal(calls, 1);
});

test('falha ao persistir a notificação rejeita a transição para permitir rollback', async () => {
  let calls = 0;
  const client = {
    async query() {
      calls++;
      if (calls === 1) {
        return {
          rows: [{
            id: 'verification-id',
            erp_pedido_id: 123,
            status: 'resolvida',
            auditor_email: 'auditor@example.test',
          }],
        };
      }
      if (calls === 3) throw new Error('notification insert failed');
      return { rows: [] };
    },
  };

  await assert.rejects(
    transitionReturnedToResolved({
      client,
      id: 'verification-id',
      actor: { name: 'Coordenadora' },
    }),
    /notification insert failed/
  );
  assert.equal(calls, 3);
});

test('contadores separam devolvidas de itens para reavaliar', () => {
  assert.deepEqual(
    buildPostsalesCounts([
      { status: 'devolvida', n: 2 },
      { status: 'resolvida', n: 3 },
      { status: 'fila', n: 4 },
    ]),
    {
      todos: 9,
      fila: 4,
      em_verificacao: 0,
      devolvida: 2,
      resolvida: 3,
      congelada: 0,
      aguardando_cancelamento: 0,
      concluida: 0,
      cancelada: 0,
    }
  );
});

test('link da notificação abre a aba de reavaliação e identifica o orçamento', () => {
  const link = postsalesReevaluationLink('item-123');
  const [, search = ''] = link.split('?');
  assert.equal(link.startsWith('/PosVendasFila?'), true);
  assert.deepEqual(parsePostsalesQueueTarget(`?${search}`), {
    isReevaluation: true,
    itemId: 'item-123',
  });
  assert.deepEqual(postsalesRefreshDetail({
    type: 'postsales_resolucao',
    entity_id: 'item-123',
  }), {
    status: 'resolvida',
    itemId: 'item-123',
  });
  assert.deepEqual(postsalesRefreshDetail({
    type: 'postsales_resolucao',
    entityId: 'item-camel',
  }), {
    status: 'resolvida',
    itemId: 'item-camel',
  });
});

test('rota mantém resolução, trilha e notificação sob o mesmo BEGIN/COMMIT', () => {
  const routeSource = fs.readFileSync(new URL('../routes/postsales.js', import.meta.url), 'utf8');
  const resolverStart = routeSource.indexOf("router.post('/:id/resolver'");
  const resolverEnd = routeSource.indexOf("router.post('/:id/congelar'", resolverStart);
  const resolverSource = routeSource.slice(resolverStart, resolverEnd);
  assert.ok(resolverStart >= 0 && resolverEnd > resolverStart);
  assert.ok(resolverSource.indexOf("client.query('BEGIN')") >= 0);
  assert.ok(
    resolverSource.indexOf('transitionReturnedToResolved') > resolverSource.indexOf("client.query('BEGIN')")
  );
  assert.ok(
    resolverSource.indexOf("client.query('COMMIT')") > resolverSource.indexOf('transitionReturnedToResolved')
  );
  assert.match(resolverSource, /client\.query\('ROLLBACK'\)/);
});

test('fila protege a navegação alvo contra respostas antigas e atualizações periódicas', () => {
  const pageSource = fs.readFileSync(
    new URL('../../../src/pages/PosVendasFila.jsx', import.meta.url),
    'utf8'
  );
  assert.match(pageSource, /latestLoadId/);
  assert.match(pageSource, /loadId !== latestLoadId\.current/);
  assert.match(pageSource, /pinnedTargetId/);
  assert.match(pageSource, /effectiveTargetId = targetItemId \|\| pinnedTargetId\.current/);
  assert.match(pageSource, /postsales\/\$\{effectiveTargetId\}\/state/);
  assert.match(pageSource, /visibilitychange/);
  assert.match(pageSource, /POSTSALES_REFRESH_EVENT/);
});

test('catálogo de acessos permite liberar devoluções somente pelo perfil supervisor', () => {
  const agentsSource = fs.readFileSync(
    new URL('../../../src/pages/Agents.jsx', import.meta.url),
    'utf8'
  );
  const layoutSource = fs.readFileSync(
    new URL('../../../src/pages/Layout.jsx', import.meta.url),
    'utf8'
  );

  assert.match(
    agentsSource,
    /\{ id: "PosVendasDevolucoes", title: "Devoluções Pós-Vendas" \}/
  );
  assert.match(
    layoutSource,
    /createPageUrl\("PosVendasDevolucoes"\).*supervisorOnly: true/
  );
});

test('editor da devolução mantém escopo por equipe e atualiza somente itens devolvidos', () => {
  const routeSource = fs.readFileSync(new URL('../routes/postsales.js', import.meta.url), 'utf8');
  const shortcutStart = routeSource.indexOf("router.get('/:id/correcao'");
  const shortcutEnd = routeSource.indexOf("router.post('/:id/resolver'", shortcutStart);
  const shortcutSource = routeSource.slice(shortcutStart, shortcutEnd);
  const pageSource = fs.readFileSync(
    new URL('../../../src/pages/PosVendasDevolucoes.jsx', import.meta.url),
    'utf8'
  );

  assert.ok(shortcutStart >= 0 && shortcutEnd > shortcutStart);
  assert.match(routeSource, /loadCoordinatorVerification/);
  assert.match(routeSource, /seller\.rows\[0\]\.team_id/);
  assert.match(shortcutSource, /verificacao\.status !== 'devolvida'/);
  assert.match(shortcutSource, /applyPostsalesCompleteCorrection/);
  assert.match(shortcutSource, /withPostsalesCorrectionLock/);
  assert.match(routeSource, /router\.post\('\/:id\/resolver'[\s\S]*withPostsalesCorrectionLock/);
  assert.match(routeSource, /router\.post\('\/:id\/congelar'[\s\S]*withPostsalesCorrectionLock/);
  assert.match(routeSource, /runPostsalesCongelarVencidas[\s\S]*withPostsalesCorrectionLock/);
  assert.match(routeSource, /runPostsalesReconciliarResolvidas[\s\S]*withVerificationLock/);
  assert.match(pageSource, /Tratar ajuste no orçamento/);
  assert.match(pageSource, /PostsalesCorrectionModal/);
});

test('ajuste de cadastro completo abre o pedido ERP sem redirecionar para o lead', () => {
  const routeSource = fs.readFileSync(new URL('../routes/presalesAjustes.js', import.meta.url), 'utf8');
  const documentsSource = fs.readFileSync(
    new URL('../../../src/components/orcamento/OrcamentoDocumentos.jsx', import.meta.url),
    'utf8'
  );
  const editorSource = fs.readFileSync(
    new URL('../../../src/components/postsales/PostsalesCorrectionModal.jsx', import.meta.url),
    'utf8'
  );
  const pageSource = fs.readFileSync(
    new URL('../../../src/pages/PreSalesAjustes.jsx', import.meta.url),
    'utf8'
  );

  assert.match(routeSource, /router\.get\('\/:id\/correcao'/);
  assert.match(routeSource, /router\.patch\('\/:id\/correcao'/);
  assert.match(routeSource, /auditKind: 'presales'/);
  assert.match(routeSource, /router\.get\('\/:id\/correcao'[\s\S]*assertPendingPresalesAdjustment\(ajuste\)[\s\S]*getPostsalesCorrectionContext/);
  assert.match(routeSource, /router\.patch\('\/:id\/correcao'[\s\S]*assertPendingPresalesAdjustment\(ajuste\)[\s\S]*applyPostsalesCompleteCorrection/);
  assert.match(documentsSource, /correctionPath=\{`\/api\/presales-ajustes\/\$\{encodeURIComponent\(correctionItem\.id\)\}\/correcao`\}/);
  assert.match(documentsSource, /<PostsalesCorrectionModal/);
  assert.doesNotMatch(documentsSource, /window\.location\.assign/);
  assert.match(editorSource, /fetch\(correctionPath/);
  assert.match(pageSource, /presalesAdjustmentOpenMode\(ajuste\) === "erp-correction"/);
  assert.match(pageSource, /onOpenCorrection/);
  assert.equal(
    presalesAdjustmentOpenMode({
      id: 'sem-lead',
      status: 'pendente',
      tipo_ajuste: 'cadastro',
      erp_pedido_id: 551,
    }),
    'erp-correction'
  );
  assert.equal(
    presalesAdjustmentOpenMode({
      id: 'legado-cpf-ambiguo',
      status: 'pendente',
      tipo_ajuste: null,
      texto: 'Corrigir telefone e nome do titular',
      erp_pedido_id: 552,
    }),
    'erp-correction'
  );
  assert.equal(
    presalesAdjustmentOpenMode({
      id: 'endereco',
      status: 'pendente',
      tipo_ajuste: 'endereco',
      erp_pedido_id: 553,
    }),
    'documents'
  );
});

test('rotas de notificação sempre usam o e-mail autenticado como dono', () => {
  const entitySource = fs.readFileSync(new URL('../routes/entities.js', import.meta.url), 'utf8');
  const ownerRoutesStart = entitySource.indexOf("if (route === 'notifications')");
  const ownerRoutesEnd = entitySource.indexOf('continue;', ownerRoutesStart);
  const ownerRoutes = entitySource.slice(ownerRoutesStart, ownerRoutesEnd);
  assert.ok(ownerRoutesStart >= 0 && ownerRoutesEnd > ownerRoutesStart);
  assert.match(ownerRoutes, /req\.user\.email/);
  assert.match(ownerRoutes, /LOWER\(user_email\) = LOWER\(\$1\)/);
  assert.match(ownerRoutes, /LOWER\(user_email\) = LOWER\(\$2\)/);
  assert.match(ownerRoutes, /LOWER\(user_email\) = LOWER\(\$4\)/);
  assert.doesNotMatch(ownerRoutes, /body\.user_email/);
});

test('reconciliação só move evidência única posterior à última devolução', async () => {
  const safe = {
    id: 'safe',
    erp_pedido_id: 10,
    resolution_event_id: 12,
    resolution_event_at: '2026-08-28T12:05:00Z',
    resolution_actor_id: 'actor',
    resolution_actor_nome: 'Coordenação',
    last_return_event_id: 11,
    last_return_event_at: '2026-08-28T12:00:00Z',
    resolution_events_after_return: 1,
  };
  const ambiguous = {
    ...safe,
    id: 'ambiguous',
    erp_pedido_id: 11,
    resolution_events_after_return: 2,
  };
  const pending = {
    id: 'pending',
    erp_pedido_id: 12,
    resolution_event_id: null,
    last_return_event_id: 20,
    last_return_event_at: '2026-08-28T12:00:00Z',
    resolution_events_after_return: 0,
  };
  const calls = [];
  const queryFn = async (sql, params) => {
    calls.push({ sql, params });
    if (calls.length === 1) return { rows: [safe, ambiguous, pending] };
    return { rows: [{ id: safe.id, status: 'resolvida' }] };
  };

  const result = await runPostsalesReconcileResolved({ queryFn });

  assert.equal(classifyHistoricalResolution(safe), 'safe');
  assert.equal(classifyHistoricalResolution(ambiguous), 'ambiguous');
  assert.equal(classifyHistoricalResolution(pending), 'without_evidence');
  assert.equal(result.checked, 3);
  assert.equal(result.eligible, 1);
  assert.equal(result.reconciled, 1);
  assert.equal(result.pending_without_evidence, 1);
  assert.equal(result.ambiguous.length, 1);
  assert.equal(calls.length, 2);
  assert.match(calls[1].sql, /status = 'resolvida'/);
  assert.match(calls[1].sql, /resolvida_reconciliada/);
  assert.match(calls[1].sql, /resolvida_at = proof\.created_at/);
  assert.match(calls[1].sql, /> \(proof\.created_at, proof\.id\)/);
  assert.doesNotMatch(calls[1].sql, /\$3::timestamptz/);
});

test('ordem por id desempata eventos gravados no mesmo instante', () => {
  const base = {
    resolution_event_at: '2026-08-28T12:00:00Z',
    last_return_event_at: '2026-08-28T12:00:00Z',
    resolution_events_after_return: 1,
  };
  assert.equal(classifyHistoricalResolution({
    ...base,
    resolution_event_id: 22,
    last_return_event_id: 21,
  }), 'safe');
  assert.equal(classifyHistoricalResolution({
    ...base,
    resolution_event_id: 20,
    last_return_event_id: 21,
  }), 'ambiguous');
});
