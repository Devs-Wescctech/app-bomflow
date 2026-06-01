---
name: API key casing (camelCase on the wire)
description: The Express API converts all DB rows to camelCase before sending to the frontend; snake_case field access on frontend objects silently fails.
---

# API serializes to camelCase

The backend (`backend/src/routes/entities.js`) runs every agent/entity row through
`convertKeysToCamel(...)` before `res.json(...)`, and `convertKeysToSnake(...)` on
the way in. So DB columns like `supervisor_id`, `team_id`, `agent_type` arrive at
the frontend as `supervisorId`, `teamId`, `agentType`.

**Why this matters:** Frontend code that reads `agent.supervisor_id` (snake_case)
gets `undefined` — the filter silently never matches, with no error. This caused a
supervisor-visibility bug where the `supervisorId` link check never matched and the
code always fell through to a `team_id` fallback that exposed the whole team.

**How to apply:** On the frontend, always read the camelCase key. When in doubt,
use a defensive `obj.camelCase || obj.snake_case`. Note `team_id`/`teamId` and
`agent_type`/`agentType` are often checked both ways in older code — match that.

**Related rule:** Supervisor visibility = self + agents whose `supervisorId` points
to the supervisor. There is NO team_id fallback (removed intentionally). A supervisor
with no linked agents sees only themselves. Links are set in the Agents UI
("Supervisor" field on the agent form). `getVisibleAgents` in
`src/components/utils/permissions.jsx` is the single source of truth; `TicketControl.jsx`
has its own inline copy of the same logic — keep them in sync.
