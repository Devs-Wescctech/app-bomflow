import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('catálogo de Tipos de Agente permite liberar módulo e submenu do portal', () => {
  const agentsPage = read('src/pages/Agents.jsx');
  assert.match(agentsPage, /id:\s*"portal_experience"/);
  assert.match(agentsPage, /id:\s*"ProductTraining"/);
});

test('falha de limpeza após commit nunca remove a mídia recém-ativada', () => {
  const route = read('backend/src/routes/trainings.js');
  assert.match(route, /committed = true/);
  assert.match(route, /if \(committed\) return next\(error\)/);
  assert.match(route, /media_object_path=\$2 OR cover_object_path=\$2/);
  assert.match(route, /Limpeza pós-substituição será repetida/);
});

test('catálogo público não expõe nome original nem tamanho do arquivo', () => {
  const route = read('backend/src/routes/trainings.js');
  assert.match(route, /const adminFields = isAdmin/);
  assert.match(route, /\? 't\.original_name, t\.mime_type, t\.size_bytes,'/);
  assert.match(route, /: '';/);
  assert.match(route, /t\.duration_seconds, t\.page_count/);
});

test('card publicado continua abrindo sem depender de metadados privados', () => {
  const page = read('src/pages/ProductTraining.jsx');
  assert.match(page, /disabled=\{training\.upload_status !== "ready"\}/);
  assert.doesNotMatch(page, /disabled=\{!training\.size_bytes\}/);
  assert.match(page, /trainingApi\.access\(item\.id\)/);
});
