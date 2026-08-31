import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const routeSource = await readFile(
  new URL('./erpProxy.js', import.meta.url),
  'utf8',
);

function routeBlock(start, end) {
  const startIndex = routeSource.indexOf(start);
  const endIndex = routeSource.indexOf(end, startIndex + start.length);

  assert.notEqual(startIndex, -1, `Rota não encontrada: ${start}`);
  assert.notEqual(endIndex, -1, `Limite da rota não encontrado: ${end}`);

  return routeSource.slice(startIndex, endIndex);
}

test('catálogo do seletor usa a API de canais, não o catálogo de produtos', () => {
  const source = routeBlock(
    "router.get('/canais-venda'",
    "router.get('/planos-pagamento'",
  );

  assert.match(source, /API_CANAL_VENDAS/);
  assert.match(source, /fetchErpAllPages/);
  assert.doesNotMatch(source, /API_MV_API_PRODUTOS/);
});

test('endpoint consolidado consulta todos os pedidos elegíveis e preserva Adesão Zero', () => {
  const source = routeBlock(
    "router.get('/relatorio-orcamentos/consolidado'",
    "router.get('/relatorio-orcamentos/by-pedido/:pedidoId'",
  );

  assert.match(
    source,
    /SELECT erp_pedido_id, modulo, agent_name, adesao_zero FROM bomflow_orcamentos WHERE modulo = ANY\(\$1\)/,
  );
  assert.match(source, /\[VALID_MODULOS\]/);
  assert.doesNotMatch(source, /\[pedidoId,\s*VALID_MODULOS\]/);
  assert.match(source, /adesao_zero: meta\.adesao_zero/);
});

test('endpoint consolidado valida e encaminha período, situação, canal e limite', () => {
  const source = routeBlock(
    "router.get('/relatorio-orcamentos/consolidado'",
    "router.get('/relatorio-orcamentos/by-pedido/:pedidoId'",
  );

  assert.match(source, /const canalFilter = parseCanalFilter\(canal_id\)/);
  assert.match(source, /canalFilter\.kind === 'invalid'/);
  assert.match(
    source,
    /getRelatorioOrcamentos\(\{\s*pedidoIds,\s*startDate: start_date \|\| null,\s*endDate: end_date \|\| null,\s*situacao: situacao && situacao !== 'todos' \? situacao : null,\s*canalId: canal_id && canal_id !== 'todos' \? canal_id : null,\s*limit: Math\.min\(Number\(limit\) \|\| 1000, 1000\),\s*offset: 0,\s*\}\)/,
  );
  assert.match(source, /WHERE erp_pedido_id = ANY\(\$1\)/);
  assert.match(source, /\[pedidoIds\]/);
});