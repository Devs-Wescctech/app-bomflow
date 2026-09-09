export {
  OPERATIONAL_SOURCE_GROUPS,
  normalizeOperationalSource,
} from '../../../shared/operationalSource.js';
import { OPERATIONAL_SOURCE_GROUPS } from '../../../shared/operationalSource.js';

const PF_REPORT_TYPE_PERMISSIONS = {
  admin: { canAccessReports: true, canViewAllLeads: true, canViewTeamLeads: true },
  supervisor: { canAccessReports: true, canViewAllLeads: false, canViewTeamLeads: true },
  sales_supervisor: { canAccessReports: true, canViewAllLeads: false, canViewTeamLeads: true },
  bom_auto_supervisor: { canAccessReports: true, canViewAllLeads: false, canViewTeamLeads: false },
  bom_pet_supervisor: { canAccessReports: true, canViewAllLeads: false, canViewTeamLeads: false },
  indicacoes_supervisor: { canAccessReports: true, canViewAllLeads: true, canViewTeamLeads: true },
  indicacoes_admin: { canAccessReports: true, canViewAllLeads: true, canViewTeamLeads: true },
  upsell_supervisor: { canAccessReports: true, canViewAllLeads: true, canViewTeamLeads: true },
  upsell_admin: { canAccessReports: true, canViewAllLeads: true, canViewTeamLeads: true },
  auditoria: { canAccessReports: true, canViewAllLeads: false, canViewTeamLeads: false },
};

export function getEffectivePfReportPermissions({ userRole, agentType, permissions = {} }) {
  if (userRole === 'admin' || agentType === 'admin') {
    return { canAccessReports: true, canViewAllLeads: true, canViewTeamLeads: true };
  }
  const defaults = PF_REPORT_TYPE_PERMISSIONS[agentType] || {
    canAccessReports: false,
    canViewAllLeads: false,
    canViewTeamLeads: false,
  };
  return {
    canAccessReports: Boolean(defaults.canAccessReports || permissions.can_access_reports),
    canViewAllLeads: Boolean(defaults.canViewAllLeads || permissions.can_view_all_leads),
    canViewTeamLeads: Boolean(defaults.canViewTeamLeads || permissions.can_view_team_leads),
  };
}

export function getPfSalesVisibility({ agentId, effectivePermissions }) {
  if (effectivePermissions.canViewAllLeads) return { type: 'all' };
  if (!agentId) return { type: 'none' };
  if (effectivePermissions.canViewTeamLeads) {
    return { type: 'supervised', agentId };
  }
  return { type: 'own', agentId };
}

export const OPERATIONAL_SOURCE_SQL = `
  CASE
    WHEN trim(BOTH '_' FROM regexp_replace(
      translate(lower(trim(COALESCE(l.source, ''))), 'áàâãéêíóôõúç', 'aaaaeeiooouc'),
      '[^a-z0-9]+', '_', 'g'
    )) IN ('manual', 'whatsapp', 'porta_a_porta') THEN 'manual'
    WHEN trim(BOTH '_' FROM regexp_replace(
      translate(lower(trim(COALESCE(l.source, ''))), 'áàâãéêíóôõúç', 'aaaaeeiooouc'),
      '[^a-z0-9]+', '_', 'g'
    )) IN ('importacao_planilha', 'importacao_por_planilha') THEN 'spreadsheet_import'
    ELSE 'unidentified'
  END
`;

export function buildPfSalesReport(rows) {
  const emptyMetric = key => ({
    key,
    label: OPERATIONAL_SOURCE_GROUPS.find(group => group.key === key)?.label || key,
    total: 0,
    working: 0,
    won: 0,
    lost: 0,
    revenue: 0,
    conversionRate: 0,
  });
  const sources = Object.fromEntries(OPERATIONAL_SOURCE_GROUPS.map(({ key }) => [key, emptyMetric(key)]));
  const agents = new Map();

  for (const row of rows) {
    const metric = {
      total: Number(row.total) || 0,
      working: Number(row.working) || 0,
      won: Number(row.won) || 0,
      lost: Number(row.lost) || 0,
      revenue: Number(row.revenue) || 0,
    };
    const source = sources[row.operational_source] || sources.unidentified;
    for (const field of Object.keys(metric)) source[field] += metric[field];

    const agentKey = row.agent_id || 'unassigned';
    if (!agents.has(agentKey)) {
      agents.set(agentKey, {
        agentId: row.agent_id || null,
        agentName: row.agent_name || 'Sem agente',
        total: 0, working: 0, won: 0, lost: 0, revenue: 0,
      });
    }
    const agent = agents.get(agentKey);
    for (const field of Object.keys(metric)) agent[field] += metric[field];
  }

  const withRate = metric => ({
    ...metric,
    conversionRate: metric.total > 0 ? Number(((metric.won / metric.total) * 100).toFixed(1)) : 0,
  });
  const bySource = OPERATIONAL_SOURCE_GROUPS.map(({ key }) => withRate(sources[key]));
  const byAgent = [...agents.values()].map(withRate).sort((a, b) => b.won - a.won);
  const totals = withRate(bySource.reduce((sum, item) => {
    for (const field of ['total', 'working', 'won', 'lost', 'revenue']) sum[field] += item[field];
    return sum;
  }, { total: 0, working: 0, won: 0, lost: 0, revenue: 0 }));

  return { totals, bySource, byAgent };
}