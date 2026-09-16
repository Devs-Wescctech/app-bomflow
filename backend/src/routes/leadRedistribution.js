import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, withTransaction } from '../config/database.js';
import { authMiddleware } from '../middleware/auth.js';
import { loadAgentMiddleware } from '../middleware/permissions.js';
import {
  MODULES, assertModuleAccess, buildPortfolioWhere,
  createBatchAssignmentNotifications, getEligibleDestinations, normalizeSelection,
  resolveDestinationIds,
} from '../services/leadRedistributionService.js';

const router = express.Router();
router.use(authMiddleware, loadAgentMiddleware);

function handleError(res, error) {
  console.error('[lead-redistribution]', error);
  res.status(error.status || 500).json({ message: error.status ? error.message : 'Erro ao gerenciar redistribuição.' });
}

router.get('/modules', async (req, res) => {
  try {
    const visible = [];
    for (const [key, config] of Object.entries(MODULES)) {
      try {
        await assertModuleAccess({ query }, req, key);
        visible.push({ key, label: config.label });
      } catch (error) {
        if (error.status !== 403) throw error;
      }
    }
    res.json({ modules: visible });
  } catch (error) { handleError(res, error); }
});

router.get('/portfolio', async (req, res) => {
  try {
    const config = await assertModuleAccess({ query }, req, req.query.module);
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(10, Number(req.query.limit) || 25));
    const filters = {
      ownerId: req.query.ownerId || null, teamId: req.query.teamId || null,
      status: req.query.status || null, search: req.query.search || null,
    };
    const where = buildPortfolioWhere(config, req, filters);
    const count = await query(`
      SELECT COUNT(*)::int AS total
        FROM ${config.table} l
        LEFT JOIN agents owner_agent ON owner_agent.id = l.${config.owner}
       WHERE ${where.sql}
    `, where.params);
    const params = [...where.params, limit, (page - 1) * limit];
    const rows = await query(`
      SELECT l.id, ${config.name} AS name, ${config.phone} AS phone,
             ${config.source} AS source, l.status, l.stage,
             l.${config.owner} AS owner_id, owner_agent.name AS owner_name,
             owner_agent.team_id, owner_team.name AS team_name
        FROM ${config.table} l
        LEFT JOIN agents owner_agent ON owner_agent.id = l.${config.owner}
        LEFT JOIN teams owner_team ON owner_team.id = owner_agent.team_id
       WHERE ${where.sql}
       ORDER BY l.updated_at DESC NULLS LAST, l.id
       LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);
    res.json({
      rows: rows.rows.map(row => ({
        id: row.id, name: row.name, phone: row.phone, source: row.source,
        status: row.status, stage: row.stage, ownerId: row.owner_id,
        ownerName: row.owner_name, teamId: row.team_id, teamName: row.team_name,
      })),
      total: count.rows[0].total, page, limit,
    });
  } catch (error) { handleError(res, error); }
});

router.get('/options', async (req, res) => {
  try {
    const config = await assertModuleAccess({ query }, req, req.query.module);
    const destinations = await getEligibleDestinations({ query }, req, config, {
      sourceId: req.query.sourceId, teamId: req.query.teamId,
    });
    const scopeParams = [];
    let scope = '';
    if (req.user?.role !== 'admin' && req.agent.agentType !== 'admin' && !req.agent.agentType.endsWith('_admin')) {
      scopeParams.push(req.agent.teamId);
      scope = `WHERE a.team_id = $1`;
    }
    const origins = await query(`
      SELECT a.id, a.name, a.active, a.team_id, t.name AS team_name
        FROM agents a LEFT JOIN teams t ON t.id = a.team_id
        ${scope}
       ORDER BY a.active DESC, a.name
    `, scopeParams);
    const teams = [...new Map(
      destinations
        .filter(row => row.team_id)
        .map(row => [String(row.team_id), { id: row.team_id, name: row.team_name }]),
    ).values()].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR'));
    const mapAgent = row => ({
      id: row.id, name: row.name, active: row.active, teamId: row.team_id,
      teamName: row.team_name,
    });
    res.json({
      origins: origins.rows.map(mapAgent),
      destinations: destinations.map(mapAgent),
      teams,
    });
  } catch (error) { handleError(res, error); }
});

router.get('/counts', async (req, res) => {
  try {
    const agentId = req.query.agentId;
    if (!agentId) return res.status(400).json({ message: 'Informe o agente.' });
    const counts = [];
    for (const [key, config] of Object.entries(MODULES)) {
      try {
        await assertModuleAccess({ query }, req, key);
        const where = buildPortfolioWhere(config, req, { ownerId: agentId });
        const result = await query(`
          SELECT COUNT(*)::int AS count FROM ${config.table} l
          LEFT JOIN agents owner_agent ON owner_agent.id = l.${config.owner}
          WHERE ${where.sql}`, where.params);
        if (result.rows[0].count) counts.push({ module: key, label: config.label, count: result.rows[0].count });
      } catch (error) {
        if (error.status !== 403) throw error;
      }
    }
    res.json({ counts, total: counts.reduce((sum, item) => sum + item.count, 0) });
  } catch (error) { handleError(res, error); }
});

router.post('/preview', async (req, res) => {
  try {
    const config = await assertModuleAccess({ query }, req, req.body.module);
    const selection = normalizeSelection(req.body);
    if (req.body.sourceId) selection.filters = { ...selection.filters, ownerId: req.body.sourceId };
    const destinations = await resolveDestinationIds({ query }, req, config, req.body);
    const previewId = uuidv4();
    const executorKey = String(req.user?.id || req.user?.email || req.agent.id);
    const count = await withTransaction(async client => {
      await client.query('DELETE FROM lead_redistribution_previews WHERE expires_at <= NOW()');
      await client.query(`
        INSERT INTO lead_redistribution_previews
          (id, module, executor_id, executor_key, request, destination_ids)
        VALUES ($1, $2, $3, $4, $5::jsonb, $6::uuid[])
      `, [previewId, req.body.module, req.agent.id, executorKey, JSON.stringify(req.body), destinations.ids]);
      const where = buildPortfolioWhere(config, req, selection.filters);
      const params = [...where.params];
      const conditions = [where.sql];
      if (selection.type === 'ids') {
        params.push(selection.ids);
        conditions.push(`l.id = ANY($${params.length}::uuid[])`);
      }
      params.push(previewId);
      const previewIdParam = params.length;
      const inserted = await client.query(`
        INSERT INTO lead_redistribution_preview_leads
          (preview_id, lead_id, from_agent_id, sequence_no)
        SELECT $${previewIdParam}::uuid, l.id, l.${config.owner},
               ROW_NUMBER() OVER (ORDER BY l.id)
          FROM ${config.table} l
          LEFT JOIN agents owner_agent ON owner_agent.id = l.${config.owner}
         WHERE ${conditions.join(' AND ')}
      `, params);
      if (selection.type === 'ids' && inserted.rowCount !== selection.ids.length) {
        const error = new Error('Parte da seleção não existe ou está fora do seu escopo.');
        error.status = 409;
        throw error;
      }
      await client.query('UPDATE lead_redistribution_previews SET lead_count = $2 WHERE id = $1', [previewId, inserted.rowCount]);
      return inserted.rowCount;
    });
    const summary = destinations.agents.map((agent, index) => ({
      destinationId: agent.id,
      destinationName: agent.name,
      count: Math.floor(count / destinations.ids.length) + (index < count % destinations.ids.length ? 1 : 0),
    })).filter(item => item.count > 0);
    res.json({
      previewId, expiresInSeconds: 900,
      module: req.body.module, moduleLabel: config.label, count,
      sourceId: req.body.sourceId || null,
      summary,
    });
  } catch (error) { handleError(res, error); }
});

router.post('/execute', async (req, res) => {
  try {
    const result = await withTransaction(async client => {
      const previewResult = await client.query(`
        SELECT * FROM lead_redistribution_previews
         WHERE id = $1 AND consumed_at IS NULL
         FOR UPDATE
      `, [req.body.previewId]);
      const preview = previewResult.rows[0];
      if (!preview || new Date(preview.expires_at) <= new Date()) {
        const error = new Error('A simulação expirou ou já foi utilizada. Gere uma nova simulação.');
        error.status = 409;
        throw error;
      }
      const executorKey = String(req.user?.id || req.user?.email || req.agent.id);
      if (preview.executor_key !== executorKey) {
        const error = new Error('Esta simulação pertence a outro usuário.');
        error.status = 403;
        throw error;
      }
      const config = await assertModuleAccess(client, req, preview.module);
      const storedRequest = preview.request;
      const destinations = await resolveDestinationIds(client, req, config, storedRequest);
      const expected = preview.destination_ids.map(String).sort();
      const current = destinations.ids.map(String).sort();
      if (expected.join(',') !== current.join(',')) {
        const error = new Error('Os destinos elegíveis mudaram. Gere uma nova simulação.');
        error.status = 409;
        throw error;
      }
      const lockParams = [preview.id];
      let currentScope = '';
      if (req.user?.role !== 'admin' && req.agent.agentType !== 'admin' && !req.agent.agentType.endsWith('_admin')) {
        lockParams.push(req.agent.teamId);
        currentScope = `AND owner_agent.team_id = $2`;
      }
      const locked = await client.query(`
        SELECT l.id
          FROM ${config.table} l
          JOIN lead_redistribution_preview_leads p
            ON p.preview_id = $1 AND p.lead_id = l.id
          LEFT JOIN agents owner_agent ON owner_agent.id = l.${config.owner}
         WHERE l.${config.owner} IS NOT DISTINCT FROM p.from_agent_id
           ${currentScope}
         FOR UPDATE OF l
      `, lockParams);
      if (locked.rowCount !== preview.lead_count || !locked.rowCount) {
        const error = new Error('A carteira mudou desde a simulação. Nenhum lead foi alterado; gere uma nova simulação.');
        error.status = 409;
        throw error;
      }
      const batchId = uuidv4();
      const context = storedRequest.context === 'deactivation' ? 'deactivation' : 'management';
      const executed = await client.query(`
        WITH assignments AS (
          SELECT p.lead_id, p.from_agent_id,
                 ($2::uuid[])[((p.sequence_no - 1) % CARDINALITY($2::uuid[])) + 1] AS destination_id
            FROM lead_redistribution_preview_leads p
           WHERE p.preview_id = $1
        ), updated AS (
          UPDATE ${config.table} l
             SET ${config.owner} = a.destination_id, updated_at = NOW()
            FROM assignments a
           WHERE l.id = a.lead_id
          RETURNING l.id, a.from_agent_id, a.destination_id
        ), audited AS (
          INSERT INTO lead_reassignment_log
            (module, lead_id, from_agent_id, to_agent_id, reassigned_by, notes, context, batch_id, executor_email)
          SELECT $3, id, from_agent_id, destination_id, $4, $5, $6, $7, $8
            FROM updated
          RETURNING to_agent_id
        )
        SELECT to_agent_id AS destination_id, COUNT(*)::int AS count
          FROM audited GROUP BY to_agent_id
      `, [
        preview.id, preview.destination_ids, config.auditModule, req.agent.id,
        storedRequest.reason || null, context, batchId, req.user?.email || null,
      ]);
      await createBatchAssignmentNotifications(client, {
        batchId,
        moduleKey: preview.module,
        moduleLabel: config.label,
      });
      await client.query('DELETE FROM lead_redistribution_previews WHERE id = $1', [preview.id]);
      const nameById = new Map(destinations.agents.map(agent => [String(agent.id), agent.name]));
      return {
        count: preview.lead_count,
        summary: executed.rows.map(row => ({
          destinationId: row.destination_id,
          destinationName: nameById.get(String(row.destination_id)) || 'Agente',
          count: row.count,
        })),
      };
    });
    res.json({ success: true, ...result });
  } catch (error) { handleError(res, error); }
});

router.get('/history', async (req, res) => {
  try {
    const config = await assertModuleAccess({ query }, req, req.query.module);
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(10, Number(req.query.limit) || 25));
    const params = [[config.auditModule, req.query.module]];
    let scope = '';
    if (req.user?.role !== 'admin' && req.agent.agentType !== 'admin' && !req.agent.agentType.endsWith('_admin')) {
      params.push(req.agent.teamId);
      scope = `AND (fa.team_id = $2 OR ta.team_id = $2)`;
    }
    const countParams = [...params];
    const count = await query(`
      SELECT COUNT(*)::int AS total
      FROM lead_reassignment_log r
      LEFT JOIN agents fa ON fa.id = r.from_agent_id
      LEFT JOIN agents ta ON ta.id = r.to_agent_id
       WHERE r.module = ANY($1::text[]) ${scope}
    `, countParams);
    params.push(limit, (page - 1) * limit);
    const rows = await query(`
      SELECT r.*, fa.name AS from_agent_name, ta.name AS to_agent_name, ex.name AS executor_name
      FROM lead_reassignment_log r
      LEFT JOIN agents fa ON fa.id = r.from_agent_id
      LEFT JOIN agents ta ON ta.id = r.to_agent_id
      LEFT JOIN agents ex ON ex.id = r.reassigned_by
      WHERE r.module = ANY($1::text[]) ${scope}
      ORDER BY r.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);
    res.json({
      rows: rows.rows, page, limit, total: count.rows[0].total,
      hasMore: page * limit < count.rows[0].total, moduleLabel: config.label,
    });
  } catch (error) { handleError(res, error); }
});

export default router;