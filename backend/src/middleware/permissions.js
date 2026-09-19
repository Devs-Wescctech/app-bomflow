import { query } from '../config/database.js';
import { getPermissions, getVisibilityFilter, canAccessModule } from '../config/permissions.js';

export async function loadAgentMiddleware(req, res, next) {
  if (!req.user) {
    return next();
  }

  try {
    const result = await query(
      `SELECT a.*, t.name AS team_name
         FROM agents a
         LEFT JOIN teams t ON t.id = a.team_id
        WHERE (a.email = $1 OR a.user_email = $1) AND a.active = true`,
      [req.user.email]
    );

    if (result.rows.length > 0) {
      const agent = result.rows[0];
      req.agent = {
        id: agent.id,
        name: agent.name,
        agentType: agent.agent_type,
        teamId: agent.team_id,
        teamName: agent.team_name,
        level: agent.level || 'pleno',
        online: agent.online,
        capacity: agent.capacity,
        queueIds: agent.queue_ids,
        permissions: agent.permissions || {},
        modules: null,
        allowedSubmenus: []
      };
      req.permissions = getPermissions(agent.agent_type);

      try {
        const typeResult = await query(
          'SELECT allowed_submenus, modules FROM agent_types WHERE key = $1',
          [agent.agent_type]
        );
        if (typeResult.rows.length > 0) {
          req.agent.allowedSubmenus = typeResult.rows[0].allowed_submenus || [];
          req.agent.modules = Array.isArray(typeResult.rows[0].modules)
            ? typeResult.rows[0].modules
            : null;
        }
      } catch (e) {
        console.error('Error loading agent type submenus:', e);
      }
    } else if (req.user.role === 'admin') {
      req.agent = {
        id: null,
        name: req.user.full_name || 'Admin',
        agentType: 'admin',
        teamId: null,
        level: 'specialist',
        online: true,
        capacity: null,
        queueIds: [],
        allowedSubmenus: []
      };
      req.permissions = getPermissions('admin');
    }

    next();
  } catch (error) {
    console.error('Error loading agent:', error);
    next();
  }
}

export function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.permissions) {
      return res.status(403).json({ message: 'No permissions assigned' });
    }

    if (!req.permissions[permission]) {
      return res.status(403).json({ message: `Permission denied: ${permission}` });
    }

    next();
  };
}

export function requireModule(module) {
  return (req, res, next) => {
    if (!req.agent) {
      return res.status(403).json({ message: 'Agent profile required' });
    }

    if (!canAccessModule(req.agent.agentType, module)) {
      return res.status(403).json({ message: `Access denied to module: ${module}` });
    }

    next();
  };
}

export function requireSubmenuAccess(submenuId) {
  return (req, res, next) => {
    if (!req.agent) {
      return res.status(403).json({ message: 'Agent profile required' });
    }

    if (req.agent.agentType === 'admin' || req.user?.role === 'admin') {
      return next();
    }

    const allowedSubmenus = req.agent.allowedSubmenus || [];

    if (allowedSubmenus.length > 0) {
      if (allowedSubmenus.includes(submenuId)) {
        return next();
      }
      return res.status(403).json({ message: `Access denied: ${submenuId}` });
    }

    const isSupervisorType = req.agent.agentType === 'supervisor' ||
      req.agent.agentType === 'sales_supervisor' ||
      req.agent.agentType?.endsWith('_supervisor');
    if (isSupervisorType) {
      return next();
    }

    return res.status(403).json({ message: `Access denied: ${submenuId}` });
  };
}
// Recursos gerenciais sensíveis exigem concessão explícita no tipo de agente.
// Apenas o administrador master herda acesso sem a concessão.
export function requireExplicitSubmenuAccess(submenuId) {
  return (req, res, next) => {
    if (!req.agent) {
      return res.status(403).json({ message: 'Agent profile required' });
    }

    if (req.agent.agentType === 'admin' || req.user?.role === 'admin') {
      return next();
    }

    if ((req.agent.allowedSubmenus || []).includes(submenuId)) {
      return next();
    }

    return res.status(403).json({ message: `Access denied: ${submenuId}` });
  };
}

// Dashboards operacionais usam concessões aditivas: administrador, perfil
// automático do dashboard ou concessão explícita configurada no tipo.
export function requireDashboardAccess(submenuId) {
  return (req, res, next) => {
    if (!req.agent) {
      return res.status(403).json({ message: 'Agent profile required' });
    }

    const agentType = (req.agent.agentType || '').toLowerCase();
    const isAdmin = agentType === 'admin' || req.user?.role === 'admin';
    const hasExplicitGrant = (req.agent.allowedSubmenus || []).includes(submenuId);
    const teamName = (req.agent.teamName || '').trim().toLowerCase();
    const isSupervisor = agentType === 'supervisor' ||
      agentType === 'sales_supervisor' ||
      agentType.endsWith('_supervisor');
    const hasAutomaticAccess = submenuId === 'PreSalesDashboard'
      ? isSupervisor && teamName === 'auditoria'
      : submenuId === 'PosVendasDashboard' && agentType === 'post_sales';

    if (isAdmin || hasExplicitGrant || hasAutomaticAccess) {
      return next();
    }

    return res.status(403).json({ message: `Access denied: ${submenuId}` });
  };
}

// Proteção explícita para recursos sensíveis que não podem herdar o fallback
// permissivo de supervisores. A concessão precisa existir no tipo do agente.
export function requireSalesContractPrinting(req, res, next) {
  if (!req.user) return res.status(401).json({ message: 'Autenticação necessária' });
  if (req.user.role === 'admin' || req.agent?.agentType === 'admin') return next();
  const configuredModules = req.agent?.modules;
  const hasSalesModule = Array.isArray(configuredModules)
    ? configuredModules.includes('sales') || configuredModules.includes('all')
    : canAccessModule(req.agent?.agentType, 'sales');
  if (!req.agent || !hasSalesModule) {
    return res.status(403).json({ message: 'Acesso negado ao módulo Vendas PF' });
  }
  if (!(req.agent.allowedSubmenus || []).includes('SalesContractPrinting')) {
    return res.status(403).json({ message: 'Acesso negado ao submenu Impressão de Contratos - Recepção' });
  }
  return next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.agent) {
      return res.status(403).json({ message: 'Agent profile required' });
    }

    if (!roles.includes(req.agent.agentType) && !roles.includes(req.user?.role)) {
      return res.status(403).json({ message: 'Insufficient role permissions' });
    }

    next();
  };
}

export function applyVisibilityFilter(entity) {
  return (req, res, next) => {
    if (!req.agent) {
      req.visibilityFilter = { type: 'own', agentId: req.user?.id };
    } else {
      req.visibilityFilter = getVisibilityFilter(
        req.agent.agentType,
        req.agent.id,
        req.agent.teamId,
        entity
      );
    }
    next();
  };
}

export function buildVisibilityQuery(baseQuery, filter, entityAlias = '') {
  const prefix = entityAlias ? `${entityAlias}.` : '';
  
  switch (filter.type) {
    case 'all':
      return { query: baseQuery, params: [] };
    case 'team':
      return {
        query: `${baseQuery} WHERE ${prefix}team_id = $1`,
        params: [filter.teamId]
      };
    case 'own':
      return {
        query: `${baseQuery} WHERE ${prefix}assigned_agent_id = $1`,
        params: [filter.agentId]
      };
    default:
      return { query: baseQuery, params: [] };
  }
}
