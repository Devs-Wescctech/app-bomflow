const RESOLUTION_EVENT = 'resolvida';

export const POSTSALES_STATUS_LIST = [
  'fila', 'em_verificacao', 'devolvida', 'resolvida',
  'congelada', 'aguardando_cancelamento', 'concluida', 'cancelada',
];

export function buildPostsalesCounts(rows = []) {
  const counts = { todos: 0 };
  for (const status of POSTSALES_STATUS_LIST) counts[status] = 0;
  for (const row of rows) {
    if (!POSTSALES_STATUS_LIST.includes(row.status)) continue;
    const amount = Number(row.n) || 0;
    counts[row.status] = amount;
    counts.todos += amount;
  }
  return counts;
}

export function postsalesReevaluationLink(id) {
  const params = new URLSearchParams({ status: 'resolvida', item: String(id) });
  return `/PosVendasFila?${params.toString()}`;
}

export async function transitionReturnedToResolved({
  client,
  id,
  actor,
  observation = null,
}) {
  const updated = await client.query(
    `UPDATE postsales_verificacoes
        SET status = 'resolvida', resolvida_at = NOW(), resolvida_por_id = $2,
            resolvida_por_nome = $3, resolucao_obs = $4, updated_at = NOW()
      WHERE id = $1 AND status = 'devolvida'
      RETURNING *`,
    [id, actor?.id || null, actor?.name || 'Admin', observation]
  );
  const item = updated.rows[0] || null;
  if (!item) return null;

  await client.query(
    `INSERT INTO postsales_eventos
       (verificacao_id, erp_pedido_id, tipo, detalhe, actor_id, actor_nome)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [
      item.id,
      item.erp_pedido_id,
      RESOLUTION_EVENT,
      `Pendência marcada como resolvida por ${actor?.name || 'Admin'}.${observation ? ` Obs.: ${observation}` : ''}`,
      actor?.id || null,
      actor?.name || 'Admin',
    ]
  );

  if (item.auditor_email) {
    await client.query(
      `INSERT INTO notifications
         (user_email, type, title, message, link, entity_type, entity_id, priority, read, created_at)
       VALUES ($1, 'postsales_resolucao', $2, $3, $4, 'postsales_verificacao', $5, 'high', false, NOW())`,
      [
        item.auditor_email,
        'Devolução resolvida — reavaliar orçamento',
        `A pendência do orçamento Nº ${item.erp_numero || item.erp_pedido_id}${item.cliente_nome ? ` (${item.cliente_nome})` : ''} foi marcada como resolvida por ${actor?.name || 'Admin'}. Reavalie no Pós-Vendas.`,
        postsalesReevaluationLink(item.id),
        item.id,
      ]
    );
  }
  return item;
}

export function classifyHistoricalResolution(row) {
  if (!row?.resolution_event_id) return 'without_evidence';
  if (!row.last_return_event_at) return 'ambiguous';

  const resolutionAt = new Date(row.resolution_event_at).getTime();
  const returnedAt = new Date(row.last_return_event_at).getTime();
  const resolutionId = Number(row.resolution_event_id);
  const returnId = Number(row.last_return_event_id);
  const evidenceCount = Number(row.resolution_events_after_return) || 0;
  if (!Number.isFinite(resolutionAt) || !Number.isFinite(returnedAt)) return 'ambiguous';
  const resolutionIsLater = resolutionAt > returnedAt
    || (resolutionAt === returnedAt && resolutionId > returnId);
  if (!resolutionIsLater || evidenceCount !== 1) return 'ambiguous';
  return 'safe';
}

export async function runPostsalesReconcileResolved({
  queryFn,
  withVerificationLock = async (_id, work) => work(),
}) {
  const result = {
    checked: 0,
    eligible: 0,
    reconciled: 0,
    pending_without_evidence: 0,
    ambiguous: [],
    errors: 0,
  };

  const candidates = await queryFn(
    `SELECT v.id, v.erp_pedido_id, v.erp_numero,
            latest_resolution.id AS resolution_event_id,
            latest_resolution.created_at AS resolution_event_at,
            latest_resolution.actor_id AS resolution_actor_id,
            latest_resolution.actor_nome AS resolution_actor_nome,
            latest_return.id AS last_return_event_id,
            latest_return.created_at AS last_return_event_at,
            (
              SELECT COUNT(*)::int
                FROM postsales_eventos evidence_count
               WHERE evidence_count.verificacao_id = v.id
                 AND evidence_count.tipo = 'resolvida'
                 AND latest_return.created_at IS NOT NULL
                 AND (evidence_count.created_at, evidence_count.id)
                     > (latest_return.created_at, latest_return.id)
            ) AS resolution_events_after_return
       FROM postsales_verificacoes v
       LEFT JOIN LATERAL (
         SELECT e.id, e.created_at, e.actor_id, e.actor_nome
           FROM postsales_eventos e
          WHERE e.verificacao_id = v.id AND e.tipo = 'resolvida'
          ORDER BY e.created_at DESC, e.id DESC
          LIMIT 1
       ) latest_resolution ON TRUE
       LEFT JOIN LATERAL (
         SELECT e.id, e.created_at
           FROM postsales_eventos e
          WHERE e.verificacao_id = v.id AND e.tipo = 'devolvida'
          ORDER BY e.created_at DESC, e.id DESC
          LIMIT 1
       ) latest_return ON TRUE
      WHERE v.status = 'devolvida'
      ORDER BY v.created_at, v.id`
  );

  result.checked = candidates.rows.length;
  for (const row of candidates.rows) {
    const classification = classifyHistoricalResolution(row);
    if (classification === 'without_evidence') {
      result.pending_without_evidence++;
      continue;
    }
    if (classification === 'ambiguous') {
      result.ambiguous.push({
        id: row.id,
        erp_pedido_id: row.erp_pedido_id,
        erp_numero: row.erp_numero,
        reason: 'A trilha não comprova uma única resolução posterior à devolução mais recente.',
      });
      continue;
    }

    result.eligible++;
    try {
      const moved = await withVerificationLock(row.id, () =>
        queryFn(
          `WITH proof AS (
           SELECT id, verificacao_id, created_at
             FROM postsales_eventos
            WHERE id = $2
              AND tipo = 'resolvida'
         ), moved AS (
           UPDATE postsales_verificacoes v
              SET status = 'resolvida',
                  resolvida_at = proof.created_at,
                  resolvida_por_id = $3,
                  resolvida_por_nome = $4,
                  updated_at = NOW()
              FROM proof
            WHERE v.id = $1
              AND v.status = 'devolvida'
              AND proof.verificacao_id = v.id
              AND NOT EXISTS (
                SELECT 1 FROM postsales_eventos newer_return
                 WHERE newer_return.verificacao_id = v.id
                   AND newer_return.tipo = 'devolvida'
                   AND (newer_return.created_at, newer_return.id)
                       > (proof.created_at, proof.id)
              )
            RETURNING v.*
         ), recorded AS (
           INSERT INTO postsales_eventos
             (verificacao_id, erp_pedido_id, tipo, detalhe, actor_id, actor_nome)
           SELECT id, erp_pedido_id, 'resolvida_reconciliada',
                  'Status reconciliado com uma resolução já comprovada na trilha.',
                  $3, COALESCE($4, 'Reconciliação automática')
             FROM moved
           RETURNING verificacao_id
         )
         SELECT moved.* FROM moved JOIN recorded ON recorded.verificacao_id = moved.id`,
          [
            row.id,
            row.resolution_event_id,
            row.resolution_actor_id,
            row.resolution_actor_nome,
          ]
        )
      );
      if (moved.rows[0]) result.reconciled++;
    } catch (error) {
      result.errors++;
      console.error('[postsales] reconciliação histórica falhou:', error.message);
    }
  }
  return result;
}
