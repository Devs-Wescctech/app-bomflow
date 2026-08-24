import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..'
);

test('criar ou editar agente não dispara sincronização ERP automaticamente', async () => {
  const source = await readFile(
    path.join(workspaceRoot, 'src/pages/Agents.jsx'),
    'utf8'
  );

  assert.doesNotMatch(source, /commitSyncAgentesErp/);
  assert.doesNotMatch(source, /provision:\s*true/);
  assert.match(
    source,
    /O ERP não foi alterado; use a sincronização manual para revisar os vínculos/
  );
});

test('gravação ERP permanece disponível somente no diálogo manual', async () => {
  const source = await readFile(
    path.join(workspaceRoot, 'src/components/agents/ErpSyncDialog.jsx'),
    'utf8'
  );

  assert.match(source, /commitSyncAgentesErp/);
  assert.match(source, /const gravar = async \(\) =>/);
  assert.match(source, /filter\(\(i\) => selected\.has\(i\.agentId\)/);
});