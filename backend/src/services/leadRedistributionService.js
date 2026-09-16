const MODULES = {
  sales: {
    table: 'leads',
    module: 'sales',
    label: 'Vendas PF',
    name: "COALESCE(l.name, 'Sem nome')",
    phone: 'l.phone',
    source: 'l.source',
    owner: 'agent_id',
    submenu: 'LeadRedistributionSales',
    auditModule: 'leads',
  },
  sales_pj: {
    table: 'leads_pj',
    module: 'sales_pj',
    label: 'Vendas PJ',
    name: "COALESCE(l.nome_fantasia, l.razao_social, 'Sem nome')",
    phone: 'l.contact_phone',
    source: 'l.source',
    owner: 'agent_id',
    submenu: 'LeadRedistributionSalesPJ',
    auditModule: 'leads-pj',
  },
  sales_upsell: {
    table: 'leads_upsell',
    module: 'sales_upsell',
    label: 'Upsell',
    name: "COALESCE(l.name, 'Sem nome')",
    phone: 'l.phone',
    source: 'l.source',
    owner: 'agent_id',
    submenu: 'LeadRedistributionUpsell',
    auditModule: 'leads-upsell',
  },
  referral: {
    table: 'referrals',
    module: 'referral',
    label: 'Indicações',
    name: "COALESCE(l.referred_name, 'Sem nome')",
    phone: 'l.referred_phone',
    source: "'Indicação'",
    owner: 'agent_id',
    submenu: 'LeadRedistributionReferral',
    auditModule: 'referrals',
  },
};

export function getRedistributionModule(key) {
  const config = MODULES[key];
  if (!config) {
    const error = new Error('Módulo de redistribuição inválido.');
    error.status = 400;
    throw error;
  }
  return config;
}

export function isRedistributionManager(req) {
  const type = req.agent?.agentType || '';
  return req.user?.role === 'admin' || type === 'admin' ||
    type.endsWith('_admin') || type === 'supervisor' ||
    type === 'sales_supervisor' || type.endsWith('_supervisor');
}

export async function assertModuleAccess(db, req, moduleKey) {
  const config = getRedistributionModule(moduleKey);
  if (!isRedistributionManager(req) || !req.agent) {
    const error = new Error('Acesso restrito a administradores e supervisores.');
    error.status = 403;
    throw error;
  }
  if (req.user?.role === 'admin' || req.agent.agentType === 'admin') return config;
  const result = await db.query(
    'SELECT modules, allowed_submenus FROM agent_types WHERE key = $1',
    [req.agent.agentType],
  );
  const modules = result.rows[0]?.modules || [];
  if (!modules.includes('all') && !modules.includes(config.module)) {
    const error = new Error('Você não possui acesso a este módulo.');
    error.status = 403;
    throw error;
  }
  const allowedSubmenus = result.rows[0]?.allowed_submenus || [];
  if (!allowedSubmenus.includes(config.submenu)) {
    const error = new Error('Você não possui acesso à redistribuição de leads.');
    error.status = 403;
    throw error;
  }
  return config;
}

export function isTeamScoped(req) {
  const type = req.agent?.agentType || '';
  return req.user?.role !== 'admin' && type !== 'admin' && !type.endsWith('_admin');
}

function addFilter(parts, params, expression, value) {
  params.push(value);
  parts.push(`${expression} = $${params.length}`);
}

export function buildPortfolioWhere(config, req, filters = {}, alias = 'l') {
  const parts = ['1=1'];
  const params = [];
  if (isTeamScoped(req)) {
    if (!req.agent.teamId) {
      parts.push('FALSE');
    } else {
      addFilter(parts, params, 'owner_agent.team_id', req.agent.teamId);
    }
  }
  if (filters.ownerId) addFilter(parts, params, `${alias}.${config.owner}`, filters.ownerId);
  if (filters.teamId) {
    if (isTeamScoped(req) && String(filters.teamId) !== String(req.agent.teamId)) {
      parts.push('FALSE');
    } else {
      addFilter(parts, params, 'owner_agent.team_id', filters.teamId);
    }
  }
  if (filters.status) addFilter(parts, params, `${alias}.status`, filters.status);
  if (filters.search) {
    params.push(`%${String(filters.search).trim()}%`);
    parts.push(`(${config.name} ILIKE $${params.length} OR COALESCE(${config.phone}, '') ILIKE $${params.length})`);
  }
  return { sql: parts.join(' AND '), params };
}

export function normalizeSelection(body) {
  const selection = body?.selection || {};
  if (selection.type === 'allFiltered') {
    return { type: 'allFiltered', filters: selection.filters || {} };
  }
  const ids = [...new Set((selection.ids || []).map(String))];
  if (!ids.length || ids.length > 5000) {
    const error = new Error('Selecione entre 1 e 5.000 leads, ou use toda a carteira filtrada.');
    error.status = 400;
    throw error;
  }
  return { type: 'ids', ids, filters: selection.filters || {} };
}

export function balancedAssignments(ids, destinationIds) {
  return ids.map((id, index) => ({ id, destinationId: destinationIds[index % destinationIds.length] }));
}

export async function getEligibleDestinations(db, req, config, { sourceId, teamId } = {}) {
  const params = [config.module];
  const conditions = [
    'a.active = TRUE',
    "(at.modules @> ARRAY[$1]::text[] OR at.modules @> ARRAY['all']::text[])",
  ];
  if (sourceId) {
    params.push(sourceId);
    conditions.push(`a.id <> $${params.length}`);
  }
  const effectiveTeam = isTeamScoped(req) ? req.agent.teamId : teamId;
  if (effectiveTeam) {
    params.push(effectiveTeam);
    conditions.push(`a.team_id = $${params.length}`);
  } else if (isTeamScoped(req)) {
    conditions.push('FALSE');
  }
  const result = await db.query(`
    SELECT a.id, a.name, a.team_id, t.name AS team_name
      FROM agents a
      JOIN agent_types at ON at.key = a.agent_type
      LEFT JOIN teams t ON t.id = a.team_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY a.name
  `, params);
  return result.rows;
}

export async function resolveDestinationIds(db, req, config, body) {
  const mode = body.mode;
  if (mode === 'team' && !body.destinationTeamId) {
    const error = new Error('Selecione uma equipe de destino.');
    error.status = 400;
    throw error;
  }
  const eligible = await getEligibleDestinations(db, req, config, {
    sourceId: body.sourceId,
    teamId: body.destinationTeamId,
  });
  const eligibleIds = new Set(eligible.map(row => String(row.id)));
  let ids;
  if (mode === 'person') {
    ids = [String(body.destinationAgentId || '')];
  } else if (mode === 'team') {
    ids = eligible.map(row => String(row.id));
  } else {
    const error = new Error('Escolha redistribuição para pessoa ou equipe.');
    error.status = 400;
    throw error;
  }
  if (!ids.length || ids.some(id => !eligibleIds.has(id))) {
    const error = new Error('Destino inválido, inativo ou fora do escopo permitido.');
    error.status = 400;
    throw error;
  }
  return { ids, agents: eligible.filter(row => ids.includes(String(row.id))) };
}

export async function createBatchAssignmentNotifications(db, {
  batchId,
  moduleKey,
  moduleLabel,
}) {
  return db.query(`
    INSERT INTO notifications
      (user_email, type, title, message, link, priority, read, created_at, dedupe_key)
    SELECT destination.email,
           'lead_assigned',
           'Leads redistribuídos',
           FORMAT('Você recebeu %s lead(s) em uma redistribuição de %s.', COUNT(*), $3::text),
           '/LeadRedistribution?module=' || $2::text,
           'normal',
           FALSE,
           NOW(),
           'lead-redistribution:' || $1::text || ':' || destination.id::text
      FROM lead_reassignment_log history
      JOIN agents destination ON destination.id = history.to_agent_id
     WHERE history.batch_id = $1::uuid
       AND destination.email IS NOT NULL
     GROUP BY destination.id, destination.email
    ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
  `, [batchId, moduleKey, moduleLabel]);
}

export async function selectLeadIds(db, config, req, selection, { lock = false } = {}) {
  const where = buildPortfolioWhere(config, req, selection.filters);
  const params = [...where.params];
  const conditions = [where.sql];
  if (selection.type === 'ids') {
    params.push(selection.ids);
    conditions.push(`l.id = ANY($${params.length}::uuid[])`);
  }
  const result = await db.query(`
    SELECT l.id, l.${config.owner} AS from_agent_id
      FROM ${config.table} l
      LEFT JOIN agents owner_agent ON owner_agent.id = l.${config.owner}
     WHERE ${conditions.join(' AND ')}
     ORDER BY l.id
     ${lock ? 'FOR UPDATE OF l' : ''}
  `, params);
  if (selection.type === 'ids' && result.rows.length !== selection.ids.length) {
    const error = new Error('Parte da seleção não existe ou está fora do seu escopo.');
    error.status = 409;
    throw error;
  }
  return result.rows;
}

export function summarizeAssignments(assignments, agents) {
  const names = new Map(agents.map(agent => [String(agent.id), agent.name]));
  const counts = new Map();
  for (const item of assignments) counts.set(item.destinationId, (counts.get(item.destinationId) || 0) + 1);
  return [...counts].map(([destinationId, count]) => ({
    destinationId,
    destinationName: names.get(destinationId) || 'Agente',
    count,
  }));
}

export { MODULES };