// Consulta admin-only do log de auditoria das chamadas de saída ao ERP.
//   GET /api/erp-audit/logs        — lista paginada com filtros (período, origem, tipo, status)
//   GET /api/erp-audit/origins     — origens distintas no período (para o filtro)
//   GET /api/erp-audit/aggregates  — chamadas por minuto/hora por origem (detecção de picos)
//   GET /api/erp-audit/summary     — visão geral por origem (total, taxa por minuto, erros)

import { Router } from 'express';
import { query } from '../config/database.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: 'Acesso restrito a administradores.' });
  }
  next();
}

router.use(authMiddleware, requireAdmin);

function buildFilters(req) {
  const { start_date, end_date, origin, kind, success } = req.query;
  const where = [];
  const params = [];
  let i = 1;
  if (start_date) { where.push(`created_at >= $${i++}`); params.push(start_date); }
  if (end_date) { where.push(`created_at <= $${i++}`); params.push(`${end_date}${end_date.length === 10 ? ' 23:59:59' : ''}`); }
  if (origin) { where.push(`origin ILIKE $${i++}`); params.push(`%${origin}%`); }
  if (kind && ['rest', 'db'].includes(kind)) { where.push(`kind = $${i++}`); params.push(kind); }
  if (success === 'true') where.push(`success = true`);
  if (success === 'false') where.push(`success = false`);
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return { clause, params, nextIdx: i };
}

router.get('/logs', async (req, res) => {
  try {
    const { clause, params, nextIdx } = buildFilters(req);
    const limit = Math.min(parseInt(req.query.limit) || 100, 1000);
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const offset = (page - 1) * limit;

    const countR = await query(`SELECT COUNT(*)::bigint AS total FROM erp_request_logs ${clause}`, params);
    const rows = await query(
      `SELECT id, kind, endpoint, method, origin, origin_user, status_code, success, duration_ms, error, created_at
         FROM erp_request_logs ${clause}
        ORDER BY created_at DESC
        LIMIT $${nextIdx} OFFSET $${nextIdx + 1}`,
      [...params, limit, offset]
    );
    res.json({ total: Number(countR.rows[0].total), page, limit, logs: rows.rows });
  } catch (err) {
    console.error('[erp-audit logs] error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

router.get('/origins', async (req, res) => {
  try {
    const { clause, params } = buildFilters(req);
    const rows = await query(
      `SELECT origin, COUNT(*)::bigint AS total FROM erp_request_logs ${clause}
        GROUP BY origin ORDER BY total DESC LIMIT 200`,
      params
    );
    res.json(rows.rows.map(r => ({ origin: r.origin, total: Number(r.total) })));
  } catch (err) {
    console.error('[erp-audit origins] error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// Agregado de frequência: chamadas por minuto ou por hora, por origem.
// Permite enxergar padrões tipo "uma chamada a cada 5 segundos" (≈12/minuto).
router.get('/aggregates', async (req, res) => {
  try {
    const bucket = req.query.bucket === 'hour' ? 'hour' : 'minute';
    const { clause, params } = buildFilters(req);
    const rows = await query(
      `SELECT date_trunc('${bucket}', created_at) AS bucket,
              origin,
              COUNT(*)::bigint AS total,
              COUNT(*) FILTER (WHERE success = false)::bigint AS errors,
              ROUND(AVG(duration_ms))::int AS avg_duration_ms
         FROM erp_request_logs ${clause}
        GROUP BY 1, 2
        ORDER BY 1 DESC, total DESC
        LIMIT 2000`,
      params
    );
    res.json(rows.rows.map(r => ({
      bucket: r.bucket, origin: r.origin,
      total: Number(r.total), errors: Number(r.errors),
      avg_duration_ms: r.avg_duration_ms,
    })));
  } catch (err) {
    console.error('[erp-audit aggregates] error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// Visão geral por origem no período: total, taxa média por minuto e pico por minuto.
router.get('/summary', async (req, res) => {
  try {
    const { clause, params } = buildFilters(req);
    const rows = await query(
      `WITH per_min AS (
         SELECT origin, date_trunc('minute', created_at) AS m, COUNT(*)::bigint AS c
           FROM erp_request_logs ${clause}
          GROUP BY 1, 2
       )
       SELECT origin,
              SUM(c)::bigint AS total,
              MAX(c)::bigint AS peak_per_minute,
              ROUND(AVG(c), 1) AS avg_per_active_minute,
              MIN(m) AS first_seen,
              MAX(m) AS last_seen
         FROM per_min
        GROUP BY origin
        ORDER BY total DESC
        LIMIT 200`,
      params
    );
    res.json(rows.rows.map(r => ({
      origin: r.origin,
      total: Number(r.total),
      peak_per_minute: Number(r.peak_per_minute),
      avg_per_active_minute: Number(r.avg_per_active_minute),
      first_seen: r.first_seen,
      last_seen: r.last_seen,
    })));
  } catch (err) {
    console.error('[erp-audit summary] error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

export default router;
