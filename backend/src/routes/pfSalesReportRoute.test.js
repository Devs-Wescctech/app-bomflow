import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const entitiesSource = readFileSync(new URL('./entities.js', import.meta.url), 'utf8');
const clientSource = readFileSync(new URL('../../../src/api/base44Client.js', import.meta.url), 'utf8');
const pageSource = readFileSync(new URL('../../../src/pages/SalesReports.jsx', import.meta.url), 'utf8');
const leadSearchSource = readFileSync(new URL('../../../src/pages/LeadSearch.jsx', import.meta.url), 'utf8');
const wonReportSource = readFileSync(new URL('../../../src/pages/SalesWonReport.jsx', import.meta.url), 'utf8');
const schemaSource = readFileSync(new URL('../config/schema.sql', import.meta.url), 'utf8');
const dockerfileSource = readFileSync(new URL('../../../Dockerfile', import.meta.url), 'utf8');

function routeBlock(path, nextPath) {
  const start = entitiesSource.indexOf(`router.get('${path}'`);
  const end = entitiesSource.indexOf(`router.get('${nextPath}'`, start + 1);
  assert.notEqual(start, -1, `rota ${path} deve existir`);
  assert.notEqual(end, -1, `limite da rota ${path} deve existir`);
  return entitiesSource.slice(start, end);
}

test('relatório PF agrega no servidor sem limite de 5.000 registros', () => {
  const route = routeBlock('/reports/sales-pf', '/leads');
  assert.match(route, /FROM leads l/);
  assert.match(route, /GROUP BY operational_source, l\.agent_id, a\.name/);
  assert.match(route, /COUNT\(\*\) FILTER/);
  assert.doesNotMatch(route, /LIMIT\s+5000/i);
  assert.doesNotMatch(pageSource, /Lead\.list\([^)]*5000/);
});

test('publicação inclui a regra compartilhada e o schema canônico suporta promotor PF', () => {
  assert.match(dockerfileSource, /COPY shared\/ \.\/shared\//);
  assert.match(dockerfileSource, /COPY package\.json \.\/package\.json/);
  assert.match(schemaSource, /ALTER TABLE leads ADD COLUMN IF NOT EXISTS promoter_id UUID REFERENCES agents\(id\)/);
  assert.match(schemaSource, /CREATE INDEX IF NOT EXISTS idx_leads_promoter ON leads\(promoter_id\)/);
});

test('período, etapa, agente, equipe e origem são combinados na mesma consulta', () => {
  const route = routeBlock('/reports/sales-pf', '/leads');
  assert.match(route, /l\.created_at >= \?::date/);
  assert.match(route, /l\.created_at < \(\?::date \+ interval '1 day'\)/);
  assert.match(route, /l\.stage = \?/);
  assert.match(route, /\(l\.agent_id = \? OR l\.promoter_id = \?\)/);
  assert.match(route, /\(a\.team_id = \? OR pa\.team_id = \?\)/);
  assert.match(route, /OPERATIONAL_SOURCE_SQL/);
});

test('escopo de supervisor e agente é aplicado antes dos filtros solicitados', () => {
  const route = routeBlock('/reports/sales-pf', '/leads');
  const visibilityPosition = route.indexOf("visibility.type !== 'all'");
  const requestedAgentPosition = route.indexOf("if (agent_id)");
  assert.ok(visibilityPosition > -1);
  assert.ok(requestedAgentPosition > visibilityPosition);
  assert.match(route, /SELECT id FROM agents WHERE supervisor_id = \?/);
  assert.match(route, /l\.promoter_id = \?/);
  assert.match(route, /l\.promoter_id IN \(SELECT id FROM agents WHERE supervisor_id = \?\)/);
});

test('tela e exportação usam a mesma resposta agregada do endpoint', () => {
  assert.match(clientSource, /fetchAPI\(`\/reports\/sales-pf\$\{query\}`\)/);
  assert.match(pageSource, /const sourceStats = report\?\.bySource/);
  assert.match(pageSource, /\.\.\.sourceStats\.map\(stat => \[/);
  assert.match(pageSource, /const sortedAgentStats = \(report\?\.byAgent/);
});

test('extratos PF filtram, exibem e exportam a classificação operacional compartilhada', () => {
  for (const source of [leadSearchSource, wonReportSource]) {
    assert.match(source, /normalizeOperationalSource\((?:lead|l)\.source\)/);
    assert.match(source, /getOperationalSourceLabel\(lead\.source\)/);
    assert.match(source, /Origem [Oo]peracional/);
    assert.match(source, /OPERATIONAL_SOURCE_GROUPS\.map/);
  }
  assert.match(leadSearchSource, /headers = \[[^\n]*'Origem Operacional'/);
  assert.match(wonReportSource, /\['Nome', 'Telefone', 'Origem Operacional'/);
  assert.match(wonReportSource, /hasAdditionalFilters=\{Boolean\(selectedSource \|\| selectedTerritory \|\| searchText\)\}/);
});