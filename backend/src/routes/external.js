import { Router } from 'express';
import { query } from '../config/database.js';
import { apiKeyAuth } from '../middleware/apiKeyAuth.js';

const router = Router();

function snakeToCamel(str) {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function rowToCamel(row) {
  if (!row || typeof row !== 'object') return row;
  const out = {};
  for (const key of Object.keys(row)) {
    let value = row[key];
    if (value instanceof Date) value = value.toISOString();
    out[snakeToCamel(key)] = value;
  }
  return out;
}

function parsePagination(req) {
  let page = parseInt(req.query.page, 10) || 1;
  let limit = parseInt(req.query.limit, 10) || 1000;
  if (page < 1) page = 1;
  if (limit < 1) limit = 1;
  if (limit > 10000) limit = 10000;
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

async function listEntity(req, res, { table, allowedFilters, dateColumn = 'created_at', selectColumns = '*' }) {
  try {
    const { page, limit, offset } = parsePagination(req);
    const conditions = [];
    const params = [];

    for (const field of allowedFilters) {
      const camel = snakeToCamel(field);
      const val = req.query[field] !== undefined ? req.query[field] : req.query[camel];
      if (val !== undefined && val !== '') {
        params.push(val);
        conditions.push(`${field} = $${params.length}`);
      }
    }

    if (req.query.start_date) {
      params.push(req.query.start_date);
      conditions.push(`${dateColumn} >= $${params.length}`);
    }
    if (req.query.end_date) {
      params.push(req.query.end_date);
      conditions.push(`${dateColumn} < ($${params.length}::date + INTERVAL '1 day')`);
    }

    const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await query(`SELECT COUNT(*)::int AS total FROM ${table}${where}`, params);
    const total = countRes.rows[0].total;

    const dataParams = [...params, limit, offset];
    const dataRes = await query(
      `SELECT ${selectColumns} FROM ${table}${where} ORDER BY ${dateColumn} DESC NULLS LAST LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
      dataParams
    );

    res.json({
      data: dataRes.rows.map(rowToCamel),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 0 },
    });
  } catch (err) {
    console.error(`[external ${table}] error:`, err.message);
    res.status(500).json({ error: 'Erro ao consultar os dados.' });
  }
}

// ----- Vendas PF -----
router.get('/v1/vendas-pf', apiKeyAuth('vendas_pf'), (req, res) =>
  listEntity(req, res, {
    table: 'leads',
    allowedFilters: ['agent_id', 'source', 'stage', 'status', 'city', 'state'],
  })
);

// ----- Upsell -----
router.get('/v1/upsell', apiKeyAuth('upsell'), (req, res) =>
  listEntity(req, res, {
    table: 'leads_upsell',
    allowedFilters: ['agent_id', 'assigned_agent_id', 'source', 'stage', 'status', 'city', 'state'],
  })
);

// ----- Indicações -----
router.get('/v1/indicacoes', apiKeyAuth('indicacoes'), (req, res) =>
  listEntity(req, res, {
    table: 'referrals',
    allowedFilters: ['agent_id', 'stage', 'status', 'commission_status'],
  })
);

// ----- Agentes -----
router.get('/v1/agentes', apiKeyAuth('agentes'), (req, res) =>
  listEntity(req, res, {
    table: 'agents',
    allowedFilters: ['role', 'agent_type', 'team_id', 'active', 'work_unit'],
    selectColumns: 'id, name, email, role, agent_type, team_id, active, work_unit, created_at, updated_at',
  })
);

// ----- Canais de venda -----
router.get('/v1/canais', apiKeyAuth('canais'), async (req, res) => {
  try {
    const ref = await query(
      'SELECT id, channel_token, channel_label, created_at FROM referral_channel_config ORDER BY created_at DESC'
    );
    const ups = await query(
      'SELECT id, channel_token, channel_label, created_at FROM upsell_channel_config ORDER BY created_at DESC'
    );
    res.json({
      indicacoes: ref.rows.map(rowToCamel),
      upsell: ups.rows.map(rowToCamel),
    });
  } catch (err) {
    console.error('[external canais] error:', err.message);
    res.status(500).json({ error: 'Erro ao consultar os canais de venda.' });
  }
});

// ----- Métricas (panorama geral) -----
const METRIC_MODULES = [
  { scope: 'vendas_pf', table: 'leads', groupField: 'source' },
  { scope: 'upsell', table: 'leads_upsell', groupField: 'source' },
  { scope: 'indicacoes', table: 'referrals', groupField: null },
];

router.get('/v1/metrics', apiKeyAuth(), async (req, res) => {
  try {
    const scopes = req.apiKey.scopes || [];
    const wanted = METRIC_MODULES.filter((m) => scopes.includes(m.scope));

    if (wanted.length === 0) {
      return res.status(403).json({ error: 'API key sem escopo de dados para métricas (vendas_pf, upsell ou indicacoes).' });
    }

    const dateConditions = [];
    const dateParams = [];
    if (req.query.start_date) {
      dateParams.push(req.query.start_date);
      dateConditions.push(`created_at >= $${dateParams.length}`);
    }
    if (req.query.end_date) {
      dateParams.push(req.query.end_date);
      dateConditions.push(`created_at < ($${dateParams.length}::date + INTERVAL '1 day')`);
    }
    const where = dateConditions.length ? ` WHERE ${dateConditions.join(' AND ')}` : '';

    const result = {};

    for (const mod of wanted) {
      const totalsRes = await query(
        `SELECT COUNT(*)::int AS total_leads, COALESCE(SUM(value), 0)::float AS total_value FROM ${mod.table}${where}`,
        dateParams
      );

      const byAgentRes = await query(
        `SELECT agent_id, COUNT(*)::int AS leads, COALESCE(SUM(value), 0)::float AS value
         FROM ${mod.table}${where}
         GROUP BY agent_id
         ORDER BY value DESC`,
        dateParams
      );

      const moduleResult = {
        totalLeads: totalsRes.rows[0].total_leads,
        totalValue: totalsRes.rows[0].total_value,
        byAgent: byAgentRes.rows.map(rowToCamel),
      };

      if (mod.groupField) {
        const bySourceRes = await query(
          `SELECT ${mod.groupField} AS source, COUNT(*)::int AS leads, COALESCE(SUM(value), 0)::float AS value
           FROM ${mod.table}${where}
           GROUP BY ${mod.groupField}
           ORDER BY value DESC`,
          dateParams
        );
        moduleResult.bySource = bySourceRes.rows.map(rowToCamel);
      }

      result[mod.scope] = moduleResult;
    }

    res.json({
      period: {
        startDate: req.query.start_date || null,
        endDate: req.query.end_date || null,
      },
      modules: result,
    });
  } catch (err) {
    console.error('[external metrics] error:', err.message);
    res.status(500).json({ error: 'Erro ao calcular as métricas.' });
  }
});

export default router;
