import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OPERATIONAL_SOURCE_SQL,
  buildPfSalesReport,
  getEffectivePfReportPermissions,
  getPfSalesVisibility,
  normalizeOperationalSource,
} from './pfSalesReport.js';

test('classifica origens manuais com capitalização, espaços e apresentação da interface', () => {
  for (const source of ['manual', ' MANUAL ', '_manual', 'manual-', 'WhatsApp', ' whatsapp ', 'porta_a_porta', 'Porta a Porta', 'PORTA-A-PORTA']) {
    assert.equal(normalizeOperationalSource(source), 'manual', source);
  }
});

test('classifica importação e não presume valores desconhecidos como manuais', () => {
  for (const source of ['importacao_planilha', 'Importação por Planilha', ' IMPORTACAO-PLANILHA ']) {
    assert.equal(normalizeOperationalSource(source), 'spreadsheet_import', source);
  }
  for (const source of [null, undefined, '', '  ', 'Facebook Ads', 'Outro']) {
    assert.equal(normalizeOperationalSource(source), 'unidentified', String(source));
  }
});

test('agrega totais, ganhos, perdas, conversão e receita por origem e agente', () => {
  const report = buildPfSalesReport([
    { operational_source: 'manual', agent_id: 'a', agent_name: 'Ana', total: '4', working: '1', won: '2', lost: '1', revenue: '150.50' },
    { operational_source: 'spreadsheet_import', agent_id: 'a', agent_name: 'Ana', total: '2', working: '0', won: '1', lost: '1', revenue: '50' },
    { operational_source: 'unidentified', agent_id: 'b', agent_name: 'Bia', total: '1', working: '1', won: '0', lost: '0', revenue: '0' },
  ]);
  assert.deepEqual(report.totals, { total: 7, working: 2, won: 3, lost: 2, revenue: 200.5, conversionRate: 42.9 });
  assert.equal(report.bySource[0].conversionRate, 50);
  assert.equal(report.byAgent[0].agentName, 'Ana');
  assert.equal(report.byAgent[0].revenue, 200.5);
});

test('SQL centralizado trata nulo e normaliza a origem antes do agrupamento', () => {
  assert.match(OPERATIONAL_SOURCE_SQL, /COALESCE\(l\.source, ''\)/);
  assert.match(OPERATIONAL_SOURCE_SQL, /translate\(lower\(trim/);
  assert.match(OPERATIONAL_SOURCE_SQL, /porta_a_porta/);
  assert.match(OPERATIONAL_SOURCE_SQL, /importacao_planilha/);
  assert.match(OPERATIONAL_SOURCE_SQL, /ELSE 'unidentified'/);
});

test('define escopo de acesso sem permitir ampliação pelo filtro', () => {
  const permissions = getEffectivePfReportPermissions({ agentType: 'sales_supervisor' });
  assert.deepEqual(getPfSalesVisibility({ agentId: 's1', effectivePermissions: permissions }), { type: 'supervised', agentId: 's1' });
  assert.deepEqual(getPfSalesVisibility({ agentId: 'a1', effectivePermissions: getEffectivePfReportPermissions({ agentType: 'sales' }) }), { type: 'own', agentId: 'a1' });
  assert.deepEqual(getPfSalesVisibility({ agentId: 'a1', effectivePermissions: getEffectivePfReportPermissions({ agentType: 'sales', permissions: { can_view_all_leads: true } }) }), { type: 'all' });
  assert.deepEqual(getPfSalesVisibility({ agentId: 'a1', effectivePermissions: getEffectivePfReportPermissions({ agentType: 'sales', permissions: { can_view_team_leads: true } }) }), { type: 'supervised', agentId: 'a1' });
});

test('permissões efetivas respeitam cada perfil configurado sem inferir pelo sufixo', () => {
  assert.equal(getEffectivePfReportPermissions({ agentType: 'bom_pet_supervisor' }).canViewTeamLeads, false);
  assert.equal(getEffectivePfReportPermissions({ agentType: 'sales_supervisor' }).canViewTeamLeads, true);
  assert.equal(getEffectivePfReportPermissions({ agentType: 'upsell_supervisor' }).canViewAllLeads, true);
  assert.equal(getEffectivePfReportPermissions({ agentType: 'indicacoes_supervisor' }).canViewAllLeads, true);
  assert.equal(getEffectivePfReportPermissions({ agentType: 'indicacoes_admin' }).canAccessReports, true);
  assert.equal(getEffectivePfReportPermissions({ agentType: 'upsell_admin' }).canAccessReports, true);
});