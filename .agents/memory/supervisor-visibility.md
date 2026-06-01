---
name: Supervisor visibility leak pattern
description: Why sales_supervisor sees all data on some pages, and the correct visibility pattern to apply.
---

# Supervisor visibility (sales_supervisor) leak

Several Sales pages historically defined `isAdmin` to ALSO include `'supervisor'`/`'sales_supervisor'`. That short-circuits BEFORE the `getVisibleAgents`/`canViewAll`/`canViewTeam` flow runs, so a supervisor is treated as admin and sees ALL leads/reports/tasks.

**Correct rule:** `isAdmin = user?.role === 'admin' || currentAgentType === 'admin'` (admin ONLY). Supervisors must fall through to `canViewAll(currentAgent,'leads'|'leads-pj') → canViewTeam → getVisibleAgents`, which restricts to self + agents linked via `supervisorId`. With no linked agents, a supervisor correctly sees only their own data.

**Why:** `getVisibleAgents` (permissions.jsx) is the single source of truth for scoping. Any page that builds its own admin/super shortcut bypasses it and reintroduces the leak. `agent.permissions` JSON in DB falls back to static `AGENT_PERMISSIONS[agentType]` when a flag is false; for `sales_supervisor` that gives canViewTeamLeads=true, canViewAllLeads=false.

**How to apply:** When auditing visibility on any Sales/list/dashboard page, grep for `isAdmin =` and reject any definition that lists `supervisor` or `*_supervisor`. Top Performers dashboards must gate rows on a `visibleAgentIds` set derived from `getVisibleAgents`.

**Activities/tasks filtering convention:** SalesTasks/SalesAgenda/SalesUpsellTasks filter activities by `assignedTo`/`createdBy` matched against BOTH visible agent **ids** and **emails** (`userEmail||email||user_email`) — NOT by lead owner. Regular agents see own (assigned==email/id, createdBy==id) plus unassigned (`!assignedTo`). Keep new task pages consistent with this.
