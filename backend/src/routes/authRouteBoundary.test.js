import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..'
);

async function authSource() {
  return readFile(path.join(workspaceRoot, 'backend/src/routes/auth.js'), 'utf8');
}

function routeBlock(source, method, route) {
  const marker = `router.${method}('${route}'`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `Rota ${route} não encontrada`);
  const nextRoute = source.indexOf('\nrouter.', start + marker.length);
  return source.slice(start, nextRoute === -1 ? source.length : nextRoute);
}

test('cadastro cria o agente com os dados recebidos sem depender de usuário autenticado', async () => {
  const source = await authSource();
  const register = routeBlock(source, 'post', '/register');

  assert.match(register, /INSERT INTO agents \(email, password_hash, name, agent_type, role, active\)/);
  assert.match(register, /\[email, password_hash, full_name \|\| email\.split\('@'\)\[0\]\]/);
  assert.doesNotMatch(register, /req\.user/);
});

test('login busca por e-mail e compara a senha enviada', async () => {
  const source = await authSource();
  const login = routeBlock(source, 'post', '/login');

  assert.match(login, /WHERE a\.email = \$1', \[email\]/);
  assert.match(login, /bcrypt\.compare\(password, agent\.password_hash\)/);
  assert.doesNotMatch(login, /currentPassword/);
  assert.doesNotMatch(login, /req\.user/);
});

test('renovação usa a identidade validada do refresh token', async () => {
  const source = await authSource();
  const refresh = routeBlock(source, 'post', '/refresh');

  assert.match(refresh, /WHERE a\.id = \$1', \[decoded\.id\]/);
  assert.doesNotMatch(refresh, /req\.user/);
});

test('perfil autenticado preserva o nome da equipe', async () => {
  const source = await authSource();
  const me = routeBlock(source, 'get', '/me');

  assert.match(me, /LEFT JOIN teams t ON t\.id = a\.team_id/);
  assert.match(me, /\[req\.user\.id\]/);
});