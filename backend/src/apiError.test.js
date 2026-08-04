// Testes do helper de erro de API do frontend (src/utils/apiError.js).
// Garante que respostas de erro JSON, não-JSON (HTML) e com corpo vazio
// produzem mensagens claras para o usuário.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractApiError } from '../../src/utils/apiError.js';

test('erro JSON com campo error usa a mensagem do servidor', async () => {
  const res = new Response(JSON.stringify({ error: 'CPF inválido' }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  });
  assert.equal(await extractApiError(res, 'Falha'), 'CPF inválido');
});

test('erro JSON com campo message usa a mensagem do servidor', async () => {
  const res = new Response(JSON.stringify({ message: 'Sem permissão' }), { status: 403 });
  assert.equal(await extractApiError(res, 'Falha'), 'Sem permissão');
});

test('erro JSON sem mensagem usa o fallback com status HTTP', async () => {
  const res = new Response(JSON.stringify({}), { status: 500 });
  assert.equal(await extractApiError(res, 'Falha ao salvar'), 'Falha ao salvar (HTTP 500)');
});

test('corpo HTML (backend desatualizado) vira "Serviço indisponível (HTTP <status>)"', async () => {
  const res = new Response('<html><body>Cannot POST /api/x</body></html>', { status: 404 });
  const msg = await extractApiError(res, 'Falha');
  assert.match(msg, /^Serviço indisponível \(HTTP 404\)\./);
});

test('corpo vazio vira "Serviço indisponível (HTTP <status>)"', async () => {
  const res = new Response(null, { status: 502 });
  const msg = await extractApiError(res, 'Falha');
  assert.match(msg, /^Serviço indisponível \(HTTP 502\)\./);
});

test('apiErrorMessage com data null vira "Serviço indisponível (HTTP <status>)"', async () => {
  const { apiErrorMessage } = await import('../../src/utils/apiError.js');
  assert.match(apiErrorMessage(404, null, 'Falha'), /^Serviço indisponível \(HTTP 404\)\./);
  assert.equal(apiErrorMessage(400, { error: 'CPF inválido' }, 'Falha'), 'CPF inválido');
  assert.equal(apiErrorMessage(500, {}, 'Falha ao salvar'), 'Falha ao salvar (HTTP 500)');
});
