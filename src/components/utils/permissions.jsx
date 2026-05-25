// Helper de permissões por tipo de agente

export const AGENT_PERMISSIONS = {
  admin: {
    modules: ['my_dashboard', 'support', 'presales', 'sales', 'sales_pj', 'referral', 'collection', 'bom_auto', 'config'],
    canViewAllTickets: true,
    canViewAllLeads: true,
    canAccessReports: true,
    canManageAgents: true,
    canManageSettings: true,
  },
  supervisor: {
    modules: ['support', 'presales', 'sales', 'collection'],
    canViewAllTickets: false,
    canViewTeamTickets: true,
    canViewAllLeads: false,
    canViewTeamLeads: true,
    canAccessReports: true,
    canManageAgents: false,
    canManageSettings: false,
  },
  sales_supervisor: {
    modules: ['my_dashboard', 'sales', 'sales_pj', 'referral'],
    canViewAllTickets: false,
    canViewTeamTickets: false,
    canViewAllLeads: false,
    canViewTeamLeads: true,
    canAccessReports: true,
    canManageAgents: false,
    canManageSettings: false,
  },
  support: {
    modules: ['support'],
    canViewAllTickets: false,
    canViewTeamTickets: false,
    canViewAllLeads: false,
    canViewTeamLeads: false,
    canAccessReports: false,
    canManageAgents: false,
    canManageSettings: false,
  },
  sales: {
    modules: ['my_dashboard', 'sales', 'sales_pj', 'referral'],
    canViewAllTickets: false,
    canViewTeamTickets: false,
    canViewAllLeads: false,
    canViewTeamLeads: false,
    canAccessReports: false,
    canManageAgents: false,
    canManageSettings: false,
  },
  collection: {
    modules: ['collection'],
    canViewAllTickets: false,
    canViewTeamTickets: false,
    canViewAllLeads: false,
    canViewTeamLeads: false,
    canAccessReports: false,
    canManageAgents: false,
    canManageSettings: false,
  },
  pre_sales: {
    modules: ['presales'],
    canViewAllTickets: false,
    canViewTeamTickets: false,
    canViewAllLeads: false,
    canViewTeamLeads: false,
    canAccessReports: false,
    canManageAgents: false,
    canManageSettings: false,
  },
  post_sales: {
    modules: ['presales'],
    canViewAllTickets: false,
    canViewTeamTickets: false,
    canViewAllLeads: false,
    canViewTeamLeads: false,
    canAccessReports: false,
    canManageAgents: false,
    canManageSettings: false,
  },
  bom_auto_supervisor: {
    modules: ['bom_auto'],
    canViewAllTickets: false,
    canViewTeamTickets: false,
    canViewAllLeads: false,
    canViewTeamLeads: false,
    canAccessReports: true,
    canManageAgents: false,
    canManageSettings: false,
  },
  bom_auto_atendente: {
    modules: ['bom_auto'],
    canViewAllTickets: false,
    canViewTeamTickets: false,
    canViewAllLeads: false,
    canViewTeamLeads: false,
    canAccessReports: false,
    canManageAgents: false,
    canManageSettings: false,
  },
  indicacoes_supervisor: {
    modules: ['referral'],
    canViewAllTickets: false,
    canViewTeamTickets: false,
    canViewAllLeads: true,
    canViewTeamLeads: true,
    canAccessReports: true,
    canManageAgents: false,
    canManageSettings: false,
  },
  indicacoes_atendente: {
    modules: ['referral'],
    canViewAllTickets: false,
    canViewTeamTickets: false,
    canViewAllLeads: false,
    canViewTeamLeads: false,
    canAccessReports: false,
    canManageAgents: false,
    canManageSettings: false,
  },
  indicacoes_admin: {
    modules: ['referral'],
    canViewAllTickets: false,
    canViewTeamTickets: false,
    canViewAllLeads: true,
    canViewTeamLeads: true,
    canAccessReports: true,
    canManageAgents: true,
    canManageSettings: false,
  },
  upsell_supervisor: {
    modules: ['sales_upsell'],
    canViewAllTickets: false,
    canViewTeamTickets: false,
    canViewAllLeads: true,
    canViewTeamLeads: true,
    canAccessReports: true,
    canManageAgents: false,
    canManageSettings: false,
  },
  upsell_atendente: {
    modules: ['sales_upsell'],
    canViewAllTickets: false,
    canViewTeamTickets: false,
    canViewAllLeads: false,
    canViewTeamLeads: false,
    canAccessReports: false,
    canManageAgents: false,
    canManageSettings: false,
  },
  upsell_admin: {
    modules: ['sales_upsell'],
    canViewAllTickets: false,
    canViewTeamTickets: false,
    canViewAllLeads: true,
    canViewTeamLeads: true,
    canAccessReports: true,
    canManageAgents: true,
    canManageSettings: false,
  },
};

const MODULE_ALIASES = {
  'presales': ['pre_sales', 'post_sales'],
};

export function canAccessModule(agent, moduleId) {
  const agentType = agent?.agent_type || agent?.agentType;
  if (!agent || !agentType) return false;
  
  if (agentType === 'admin') return true;
  
  // If agent has modules array (from agent_type config), use it exclusively
  // This ensures ADM configurations are respected
  if (agent.modules !== undefined && agent.modules !== null) {
    // Empty array means no access
    if (agent.modules.length === 0) return false;
    
    if (agent.modules.includes('all')) return true;
    if (agent.modules.includes(moduleId)) return true;
    
    const aliases = MODULE_ALIASES[moduleId];
    if (aliases && aliases.some(alias => agent.modules.includes(alias))) {
      return true;
    }
    
    return false;
  }
  
  // Fallback to static permissions only if no config from database
  const basePermissions = AGENT_PERMISSIONS[agentType] || AGENT_PERMISSIONS.support;
  return basePermissions.modules.includes(moduleId);
}

export function canViewAll(agent, resourceType = 'tickets') {
  const agentType = agent?.agent_type || agent?.agentType;
  if (!agent || !agentType) return false;
  
  if (agentType === 'admin') return true;
  
  const basePermissions = AGENT_PERMISSIONS[agentType];
  
  if (agent.permissions) {
    if (resourceType === 'tickets' && agent.permissions.can_view_all_tickets) return true;
    if ((resourceType === 'leads' || resourceType === 'leads-pj' || resourceType === 'referrals') && agent.permissions.can_view_all_leads) return true;
  }
  
  if (resourceType === 'tickets') return basePermissions?.canViewAllTickets;
  if (resourceType === 'leads' || resourceType === 'leads-pj' || resourceType === 'referrals') return basePermissions?.canViewAllLeads;
  
  return false;
}

export function canViewTeam(agent, resourceType = 'tickets') {
  const agentType = agent?.agent_type || agent?.agentType;
  if (!agent || !agentType) return false;
  
  if (agentType === 'admin') return true;
  
  const basePermissions = AGENT_PERMISSIONS[agentType];
  
  if (agent.permissions) {
    if (resourceType === 'tickets' && agent.permissions.can_view_team_tickets) return true;
    if ((resourceType === 'leads' || resourceType === 'leads-pj' || resourceType === 'referrals') && agent.permissions.can_view_team_leads) return true;
  }
  
  if (resourceType === 'tickets') return basePermissions?.canViewTeamTickets;
  if (resourceType === 'leads' || resourceType === 'leads-pj' || resourceType === 'referrals') return basePermissions?.canViewTeamLeads;
  
  return false;
}

export function canAccessReports(agent) {
  const agentType = agent?.agent_type || agent?.agentType;
  if (!agent || !agentType) return false;
  
  if (agentType === 'admin') return true;
  
  if (agent.permissions?.can_access_reports) return true;
  
  const basePermissions = AGENT_PERMISSIONS[agentType];
  return basePermissions?.canAccessReports || false;
}

export function canManageAgents(agent) {
  const agentType = agent?.agent_type || agent?.agentType;
  if (!agent || !agentType) return false;
  
  if (agentType === 'admin') return true;
  
  if (agent.modules && agent.modules.length > 0) {
    if (agent.modules.includes('all') || agent.modules.includes('config')) return true;
  }
  
  if (agent.permissions?.can_manage_agents) return true;
  
  return false;
}

export function canManageSettings(agent) {
  const agentType = agent?.agent_type || agent?.agentType;
  if (!agent || !agentType) return false;
  
  if (agentType === 'admin') return true;
  
  if (agent.modules && agent.modules.length > 0) {
    if (agent.modules.includes('all') || agent.modules.includes('config')) return true;
  }
  
  if (agent.permissions?.can_manage_settings) return true;
  
  return false;
}

export function isSupervisorType(agentType) {
  return agentType === 'supervisor' || agentType === 'sales_supervisor' || agentType?.endsWith('_supervisor');
}

export function isAdminUser(user, agent) {
  const agentType = agent?.agent_type || agent?.agentType;
  return (
    user?.role === 'admin' ||
    agentType === 'admin'
  );
}

export function isUpsellAdmin(user, agent) {
  const agentType = agent?.agent_type || agent?.agentType;
  return (
    user?.role === 'admin' ||
    agentType === 'admin' ||
    agentType === 'upsell_admin'
  );
}

// Privilégios elevados no Upsell (admin OU supervisor) — usado para "ver tudo".
export function isUpsellPrivileged(user, agent) {
  const agentType = agent?.agent_type || agent?.agentType;
  if (isUpsellAdmin(user, agent)) return true;
  if (user?.role === 'supervisor') return true;
  if (agentType === 'supervisor') return true;
  if (agentType === 'sales_supervisor') return true;
  if (agentType === 'upsell_supervisor') return true;
  if (agentType?.endsWith('_supervisor')) return true;
  return false;
}

export function filterMenuItems(agent, menuItems, user = null) {
  const agentType = agent?.agent_type || agent?.agentType;
  if (!agent || !agentType) return [];
  
  const isSupervisor = isSupervisorType(agentType);
  const isAdmin = agentType === 'admin' || user?.role === 'admin';
  const isSalesAgentOnly = agentType === 'sales';
  
  // Get allowed submenus from agent type config (loaded from database)
  const allowedSubmenus = agent.allowedSubmenus || [];
  const hasSubmenuRestrictions = allowedSubmenus.length > 0;
  
  return menuItems
    .filter(item => {
      // salesOnly items are only visible to sales agents (not supervisors or admins)
      if (item.salesOnly && !isSalesAgentOnly) return false;
      
      // Admin sees everything except salesOnly items
      if (isAdmin) return true;
      
      // Check if agent can access this module (use moduleId alias if present)
      const effectiveModuleId = item.moduleId || item.id;
      if (!canAccessModule(agent, effectiveModuleId)) return false;
      
      if (item.requiredSubmenu) {
        if (hasSubmenuRestrictions && !allowedSubmenus.includes(item.requiredSubmenu)) {
          return false;
        }
      }

      return true;
    })
    .map(item => {
      // Admin sees all sub-items
      if (isAdmin) return item;
      
      // If no sub-items, return as-is
      if (!item.items || item.items.length === 0) return item;
      
      // Filter sub-items based on permissions (create new array to avoid mutation)
      const filteredItems = item.items.filter(subItem => {
        // Extract page name from URL (remove leading slash)
        const urlPageName = subItem.url ? subItem.url.replace(/^\//, '').split('?')[0] : null;
        const submenuKey = urlPageName || subItem.title;
        
        // If allowedSubmenus is configured in ADM, it has PRIORITY over hardcoded flags
        // This allows admin to explicitly grant access to any submenu
        if (hasSubmenuRestrictions) {
          // If item has an explicit requiredSubmenu key, use that for lookup instead of URL-derived key
          const lookupKey = subItem.requiredSubmenu || submenuKey;
          // If item is explicitly allowed in ADM, show it regardless of other flags
          if (allowedSubmenus.includes(lookupKey)) {
            // Config items still require special permissions even if in allowedSubmenus
            if (item.id === 'config') {
              if (subItem.title === 'Agentes') {
                return canManageAgents(agent);
              }
              return canManageSettings(agent);
            }
            return true;
          }
          // If allowedSubmenus is set but item is not in the list (neither by requiredSubmenu nor URL key), hide it
          return false;
        }
        
        // No ADM submenu restrictions - use hardcoded flag-based permissions
        
        // supervisorOnly: only visible to supervisors, admins, and module admins (_admin types)
        const hasElevatedAccess = isSupervisor || isAdmin || agentType?.endsWith('_admin');
        if (subItem.supervisorOnly && !hasElevatedAccess) {
          return false;
        }
        
        // agentOnly: only visible to regular agents (not supervisors or admins)
        if (subItem.agentOnly && (isSupervisor || isAdmin)) {
          return false;
        }
        
        // Config items require special permissions
        if (item.id === 'config') {
          if (subItem.title === 'Agentes') {
            return canManageAgents(agent);
          }
          return canManageSettings(agent);
        }
        
        return true;
      });
      
      // Return new object with filtered items (preserves icons and other properties)
      return { ...item, items: filteredItems };
    });
}