import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const routeSource = await readFile(
  new URL('./erpProxy.js', import.meta.url),
  'utf8',
);

function orcamentoRouteBlock() {
  const start = routeSource.indexOf("router.post('/orcamento'");
  const end = routeSource.indexOf("router.post('/pre-proposta'", start);
  assert.notEqual(start, -1, 'Rota POST /orcamento não encontrada');
  assert.notEqual(end, -1, 'Limite da rota POST /orcamento não encontrado');
  return routeSource.slice(start, end);
}

test('rota de orçamento usa o catálogo fresco e somente os itens validados antes de gravar', () => {
  const source = orcamentoRouteBlock();
  const fetchCatalog = source.indexOf('API_MV_API_PRODUTOS');
  const validateCatalog = source.indexOf('assessCatalogSelection');
  const useValidatedItems = source.indexOf('itens = catalogValidation.items');
  const postHeader = source.indexOf('OrcamentoSgprcUsuario');

  assert.ok(fetchCatalog >= 0, 'rota deve carregar o catálogo ERP fresco');
  assert.ok(validateCatalog > fetchCatalog, 'validação deve ocorrer depois da leitura do catálogo');
  assert.ok(useValidatedItems > validateCatalog, 'rota deve substituir os itens pelos itens validados');
  assert.ok(postHeader > useValidatedItems, 'validação deve terminar antes do POST do cabeçalho');
});