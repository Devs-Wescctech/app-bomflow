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

## Race condition: visible-agent set must be in the React Query key
A leads/list query whose result is computed via `getVisibleAgents(allAgents, currentAgent)` MUST include the resulting visible-agent-id signature in its `queryKey`. The `allAgents` and `leads` queries fire in parallel; if `leads` runs before `/agents` resolves, `getVisibleAgents` sees an empty `allAgents`, yields only the supervisor (no team members), caches an under-scoped result, and does NOT auto-refetch when agents load (key unchanged) — so a supervisor sees their team's leads missing from the pipeline.

**Fix pattern:** compute `visibleAgentIds` in a `useMemo` (return `null` for "see all", else an id array) and put `visibleAgentIds===null ? 'all' : [...ids].sort().join(',')` into the `queryKey`; have the queryFn filter from that same memo. When `/agents` resolves and the team set grows, the key changes and React Query refetches automatically.

**Why:** symptom was a sales supervisor correctly scoped on other screens but NOT seeing a lead created by a linked team agent in the PF pipeline (`LeadsKanban`), even though the API returned the lead and the filter logic was correct for the data.

**How to apply:** any Kanban/list using getVisibleAgents inside a queryFn has this latent bug. `LeadsPJKanban` (leadsPJ query) still has it as of this fix — apply the same memo+key pattern if the PJ pipeline shows the same symptom. Keep the mutation's optimistic-update key (getQueryData/setQueryData are exact-match) in sync with the new multi-segment query key, or optimistic drag updates silently no-op. Data gotcha: supervisor agent rows can have `user_email` EMPTY (only the `email` column set), so currentAgent fallbacks that match on userEmail/user_email only will miss them — match on `email` too.
