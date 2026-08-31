import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { query } from '../config/database.js';
import { createNotification } from '../services/notificationService.js';
import { addBusinessDays, brtDateStr } from '../services/businessDaysService.js';
import {
  cancelOrcamentoDB,
  getProdutosByPedidoIds,
  getOrcamentoDetalhe,
} from '../services/erpDbService.js';
import { enrichPostsalesClientIdentities } from '../services/postsalesClientService.js';
import { classifyPostsalesDetail } from '../utils/postsalesDetail.js';
import { validateDateRange } from '../utils/postsalesFilters.js';
import {
  POSTSALES_MOTIVOS,
  buildPostsalesReturnNotification,
  getPostsalesReasonLabel,
  normalizePostsalesObservation,
  validatePostsalesReturn,
} from '../utils/postsalesReasons.js';
export { POSTSALES_MOTIVOS };

const router = express.Router();

// ============================================================================
// Módulo Pós-Vendas — fluxograma "Pré e Pós venda - Bom Flow".
// A fila é alimentada pelos orçamentos APROVADOS na auditoria do Pré-venda
// (presales_auditorias.status='concluida' AND resultado='aprovado').
// Estados de postsales_verificacoes.status:
//   fila                    → aguardando um auditor do Pós-Vendas assumir
//   em_verificacao          → assumida por um auditor (trava: 1 auditor por orçamento)
//   devolvida               → devolvida ao coordenador do vendedor (motivo + prazo 3 DU)
//   resolvida               → coordenador marcou como resolvida; volta ao auditor reavaliar
//   congelada               → prazo venceu sem resolução OU reavaliação reprovou; exposta ao Pré-venda
//   aguardando_cancelamento → Pré-venda NÃO liberou; aguarda decisão final do auditor
//   concluida               → pós-venda concluído com sucesso
//   cancelada               → decisão final registrada; pedido cancelado DE FATO no ERP
// ============================================================================

// Prazo do coordenador para resolver a devolução (dias ÚTEIS) — fixo nesta fase.
const DEVOLUCAO_PRAZO_DIAS = 3;

// Motivo de cancelamento no ERP (pedidos_motivos_cancelamentos) — mesmo id já validado
// no auto-cancelamento do Pré-venda ("AJUSTE PRÉ-VENDA NÃO REALIZADO").
const POSTSALES_CANCEL_MOTIVO_ID = 310505360;

const MODULO_LABELS = {
  sales: 'Vendas PF',
  sales_pj: 'Vendas PJ',
  sales_upsell: 'Upsell',
  referral: 'Indicações',
};

const STATUS_LIST = [
  'fila', 'em_verificacao', 'devolvida', 'resolvida',
  'congelada', 'aguardando_cancelamento', 'concluida', 'cancelada',
];

async function loadAgentRow(req) {
  const r = await query(
    `SELECT a.id, a.name, a.email, a.agent_type, a.team_id, a.erp_agent_id, t.name AS team_name
       FROM agents a
       LEFT JOIN teams t ON t.id = a.team_id
      WHERE a.id = $1`,
    [req.user.id]
  );
  return r.rows[0] || null;
}

async function agentTypeModules(agentType) {
  if (!agentType) return [];
  try {
    const r = await query(`SELECT modules FROM agent_types WHERE key = $1`, [agentType]);
    return Array.isArray(r.rows[0]?.modules) ? r.rows[0].modules : [];
  } catch {
    return [];
  }
}

// Elegibilidade do AUDITOR do Pós-Vendas: admin, tipo 'post_sales' ou qualquer tipo
// dinâmico (agent_types) cujo módulo inclua 'post_sales'. Autorização no BACKEND —
// esconder o menu não basta.
async function resolvePostsalesAuditor(req) {
  const agent = await loadAgentRow(req);
  const role = (req.user.role || '').toLowerCase();
  if (!agent) {
    if (role === 'admin') {
      return { eligible: true, isAdmin: true, agent: { id: req.user.id, name: req.user.full_name || 'Admin', email: req.user.email, erp_agent_id: null } };
    }
    return { eligible: false, agent: null };
  }
  const agentType = (agent.agent_type || '').toLowerCase();
  const isAdmin = agentType === 'admin' || role === 'admin';
  if (isAdmin || agentType === 'post_sales') return { eligible: true, isAdmin, agent };
  const mods = await agentTypeModules(agent.agent_type);
  return { eligible: mods.includes('post_sales'), isAdmin: false, agent };
}

// Coordenador/supervisor do vendedor: admin vê tudo; supervisores veem as devoluções
// dos vendedores do SEU time (nunca isAdmin para supervisor — escopo por time).
async function resolveCoordenador(req) {
  const agent = await loadAgentRow(req);
  const role = (req.user.role || '').toLowerCase();
  const agentType = (agent?.agent_type || '').toLowerCase();
  const isAdmin = agentType === 'admin' || role === 'admin';
  const isSupervisor = agentType === 'supervisor' || agentType.endsWith('_supervisor');
  return { eligible: isAdmin || isSupervisor, isAdmin, isSupervisor, agent };
}

// Equipe do Pré-venda (mesma regra da Fila Pré Vendas): admin, tipo 'auditoria' ou
// supervisor do time "Auditoria".
async function resolvePrevenda(req) {
  const agent = await loadAgentRow(req);
  const role = (req.user.role || '').toLowerCase();
  const agentType = (agent?.agent_type || '').toLowerCase();
  const isAdmin = agentType === 'admin' || role === 'admin';
  const isAuditoria = agentType === 'auditoria';
  const isSupervisor = agentType.includes('supervisor');
  const teamName = (agent?.team_name || '').trim().toLowerCase();
  return {
    eligible: isAdmin || isAuditoria || (isSupervisor && teamName === 'auditoria'),
    agent: agent || (isAdmin ? { id: req.user.id, name: req.user.full_name || 'Admin', email: req.user.email } : null),
  };
}

// Liderança (monitor): auditor do Pós-Vendas, qualquer supervisor ou admin.
async function resolveLeitura(req) {
  const ps = await resolvePostsalesAuditor(req);
  if (ps.eligible) return { eligible: true, agent: ps.agent };
  const coord = await resolveCoordenador(req);
  if (coord.eligible) return { eligible: true, agent: coord.agent };
  const pre = await resolvePrevenda(req);
  return { eligible: pre.eligible, agent: pre.agent };
}

async function addEvento(verificacaoId, erpPedidoId, tipo, detalhe, actor) {
  try {
    await query(
      `INSERT INTO postsales_eventos (verificacao_id, erp_pedido_id, tipo, detalhe, actor_id, actor_nome)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [verificacaoId, erpPedidoId, tipo, detalhe || null, actor?.id || null, actor?.name || null]
    );
  } catch (e) {
    console.error('[postsales] evento não registrado:', e.message);
  }
}

async function getVerificacao(id) {
  const r = await query(`SELECT * FROM postsales_verificacoes WHERE id = $1`, [id]);
  return r.rows[0] || null;
}

// E-mails dos supervisores do time do vendedor.
async function getSupervisorEmails(vendedorId) {
  if (!vendedorId) return [];
  const res = await query(
    `SELECT t.supervisor_email, t.supervisor_emails
       FROM agents a JOIN teams t ON t.id = a.team_id
      WHERE a.id = $1`,
    [vendedorId]
  );
  const row = res.rows[0];
  if (!row) return [];
  const emails = new Set();
  if (row.supervisor_email) emails.add(row.supervisor_email);
  if (Array.isArray(row.supervisor_emails)) row.supervisor_emails.forEach((e) => e && emails.add(e));
  return [...emails];
}

function numeroDe(v) {
  return v.erp_numero || v.erp_pedido_id;
}

function shapeItem(row, userId) {
  const todayYmd = brtDateStr();
  return {
    ...row,
    modulo_nome: MODULO_LABELS[row.modulo] || row.modulo || '-',
    motivo_devolucao_nome: getPostsalesReasonLabel(row.motivo_devolucao),
    prazo_vencido: !!(row.status === 'devolvida' && row.prazo_ymd && todayYmd > row.prazo_ymd),
    lock_mine: !!(row.auditor_id && String(row.auditor_id) === String(userId)),
  };
}

// Ingestão idempotente: importa para a fila os orçamentos aprovados no Pré-venda que
// ainda não estão no Pós-Vendas. Não toca no ERP.
async function ingestAprovados() {
  const ins = await query(
    `INSERT INTO postsales_verificacoes
       (erp_pedido_id, erp_numero, modulo, vendedor_id, vendedor_nome, cliente_nome, cliente_cpf, status)
     SELECT bo.erp_pedido_id, bo.erp_numero, bo.modulo, bo.agent_id, bo.agent_name,
            bo.cliente_nome, bo.cliente_cpf, 'fila'
       FROM presales_auditorias pa
       JOIN bomflow_orcamentos bo ON bo.erp_pedido_id = pa.erp_pedido_id
      WHERE pa.status = 'concluida' AND pa.resultado = 'aprovado'
     ON CONFLICT (erp_pedido_id) DO NOTHING
     RETURNING id, erp_pedido_id`
  );
  for (const row of ins.rows) {
    await addEvento(row.id, row.erp_pedido_id, 'entrada_fila',
      'Orçamento aprovado no Pré-venda e encaminhado à fila do Pós-Vendas.', null);
  }
  return ins.rows.length;
}

// GET /fila — fila de verificação do Pós-Vendas (com ingestão dos aprovados).
router.get('/fila', authMiddleware, async (req, res) => {
  try {
    const { eligible } = await resolvePostsalesAuditor(req);
    if (!eligible) return res.status(403).json({ error: 'Acesso restrito à equipe de Pós-Vendas.' });

    const startDate = req.query.start_date ? String(req.query.start_date) : null;
    const endDate = req.query.end_date ? String(req.query.end_date) : null;
    const dateError = validateDateRange(startDate, endDate);
    if (dateError) return res.status(400).json({ error: dateError });

    await ingestAprovados();

    const status = req.query.status;
    const dateParams = [];
    const dateConditions = [];
    if (startDate) {
      dateParams.push(startDate);
      dateConditions.push(`COALESCE(pa.concluida_at, v.created_at) >= $${dateParams.length}::date`);
    }
    if (endDate) {
      dateParams.push(endDate);
      dateConditions.push(`COALESCE(pa.concluida_at, v.created_at) < ($${dateParams.length}::date + interval '1 day')`);
    }
    const dateWhere = dateConditions.length ? `WHERE ${dateConditions.join(' AND ')}` : '';

    const params = [];
    const conditions = [];
    if (status && status !== 'todos' && STATUS_LIST.includes(status)) {
      params.push(status);
      conditions.push(`v.status = $${params.length}`);
    }
    if (startDate) {
      params.push(startDate);
      conditions.push(`COALESCE(pa.concluida_at, v.created_at) >= $${params.length}::date`);
    }
    if (endDate) {
      params.push(endDate);
      conditions.push(`COALESCE(pa.concluida_at, v.created_at) < ($${params.length}::date + interval '1 day')`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const r = await query(
      `SELECT v.*, pa.concluida_at AS aprovado_at,
              COALESCE(pa.concluida_at, v.created_at) AS data_fila
         FROM postsales_verificacoes v
         LEFT JOIN presales_auditorias pa ON pa.erp_pedido_id = v.erp_pedido_id
        ${where}
        ORDER BY CASE v.status
                   WHEN 'aguardando_cancelamento' THEN 0
                   WHEN 'resolvida' THEN 1
                   WHEN 'fila' THEN 2
                   WHEN 'em_verificacao' THEN 3
                   WHEN 'devolvida' THEN 4
                   WHEN 'congelada' THEN 5
                   ELSE 6 END,
                 v.created_at ASC`,
      params
    );
    const cr = await query(
      `SELECT v.status, COUNT(*)::int AS n
         FROM postsales_verificacoes v
         LEFT JOIN presales_auditorias pa ON pa.erp_pedido_id = v.erp_pedido_id
        ${dateWhere}
        GROUP BY v.status`,
      dateParams
    );
    const counts = { todos: 0 };
    for (const s of STATUS_LIST) counts[s] = 0;
    for (const row of cr.rows) { counts[row.status] = row.n; counts.todos += row.n; }

    const enrichedRows = await enrichPostsalesClientIdentities(r.rows, {
      context: 'GET /postsales/fila',
    });

    return res.json({
      items: enrichedRows.map((row) => shapeItem(row, req.user.id)),
      counts,
      motivos: POSTSALES_MOTIVOS,
      prazo_dias: DEVOLUCAO_PRAZO_DIAS,
      today_ymd: brtDateStr(),
    });
  } catch (e) {
    console.error('[postsales] GET /fila error:', e.message);
    return res.status(500).json({ error: 'Falha ao carregar a fila do Pós-Vendas.' });
  }
});

// POST /:id/assumir — auditor assume a verificação (trava: 1 auditor por orçamento).
router.post('/:id/assumir', authMiddleware, async (req, res) => {
  try {
    const { eligible, agent } = await resolvePostsalesAuditor(req);
    if (!eligible) return res.status(403).json({ error: 'Acesso restrito à equipe de Pós-Vendas.' });

    const r = await query(
      `UPDATE postsales_verificacoes
          SET status = 'em_verificacao', auditor_id = $2, auditor_nome = $3, auditor_email = $4,
              assumido_at = NOW(), updated_at = NOW()
        WHERE id = $1
          AND (status IN ('fila','resolvida')
               OR (status = 'em_verificacao' AND auditor_id = $2))
        RETURNING *`,
      [req.params.id, agent.id, agent.name, agent.email]
    );
    if (!r.rows[0]) {
      const cur = await getVerificacao(req.params.id);
      if (!cur) return res.status(404).json({ error: 'Verificação não encontrada.' });
      if (cur.status === 'em_verificacao') {
        return res.status(409).json({
          error: cur.auditor_nome
            ? `Este orçamento já está em verificação por ${cur.auditor_nome}.`
            : 'Este orçamento já está em verificação por outro auditor.',
          item: shapeItem(cur, req.user.id),
        });
      }
      return res.status(409).json({ error: `Não é possível assumir uma verificação em "${cur.status}".`, item: shapeItem(cur, req.user.id) });
    }
    await addEvento(r.rows[0].id, r.rows[0].erp_pedido_id, 'assumida', `Verificação assumida por ${agent.name}.`, agent);
    return res.json({ item: shapeItem(r.rows[0], req.user.id) });
  } catch (e) {
    console.error('[postsales] assumir error:', e.message);
    return res.status(500).json({ error: 'Falha ao assumir a verificação.' });
  }
});

// POST /:id/liberar-trava — o auditor dono devolve o orçamento à fila (desiste da trava).
router.post('/:id/liberar-trava', authMiddleware, async (req, res) => {
  try {
    const { eligible, agent } = await resolvePostsalesAuditor(req);
    if (!eligible) return res.status(403).json({ error: 'Acesso restrito à equipe de Pós-Vendas.' });

    const r = await query(
      `UPDATE postsales_verificacoes
          SET status = 'fila', auditor_id = NULL, auditor_nome = NULL, auditor_email = NULL,
              assumido_at = NULL, updated_at = NOW()
        WHERE id = $1 AND status = 'em_verificacao' AND auditor_id = $2
        RETURNING *`,
      [req.params.id, agent.id]
    );
    if (!r.rows[0]) return res.status(409).json({ error: 'Apenas o auditor que assumiu pode liberar a trava.' });
    await addEvento(r.rows[0].id, r.rows[0].erp_pedido_id, 'trava_liberada', `Trava liberada por ${agent.name}; orçamento voltou à fila.`, agent);
    return res.json({ item: shapeItem(r.rows[0], req.user.id) });
  } catch (e) {
    console.error('[postsales] liberar-trava error:', e.message);
    return res.status(500).json({ error: 'Falha ao liberar a trava.' });
  }
});

// POST /:id/concluir — pós-venda verificado com sucesso; sai da fila.
router.post('/:id/concluir', authMiddleware, async (req, res) => {
  try {
    const { eligible, agent } = await resolvePostsalesAuditor(req);
    if (!eligible) return res.status(403).json({ error: 'Acesso restrito à equipe de Pós-Vendas.' });

    const r = await query(
      `UPDATE postsales_verificacoes
          SET status = 'concluida', concluida_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND status = 'em_verificacao' AND auditor_id = $2
        RETURNING *`,
      [req.params.id, agent.id]
    );
    if (!r.rows[0]) return res.status(409).json({ error: 'Assuma a verificação antes de concluí-la (apenas o auditor responsável pode concluir).' });
    await addEvento(r.rows[0].id, r.rows[0].erp_pedido_id, 'concluida', `Pós-venda concluído com sucesso por ${agent.name}.`, agent);
    return res.json({ item: shapeItem(r.rows[0], req.user.id) });
  } catch (e) {
    console.error('[postsales] concluir error:', e.message);
    return res.status(500).json({ error: 'Falha ao concluir o pós-venda.' });
  }
});

// POST /:id/devolver — devolve ao coordenador do vendedor com motivo padronizado e
// prazo automático de 3 dias úteis. Notifica vendedor e supervisores.
router.post('/:id/devolver', authMiddleware, async (req, res) => {
  try {
    const { eligible, agent } = await resolvePostsalesAuditor(req);
    if (!eligible) return res.status(403).json({ error: 'Acesso restrito à equipe de Pós-Vendas.' });

    const motivo = String(req.body?.motivo || '');
    const observacao = normalizePostsalesObservation(req.body?.observacao);
    const motivoError = validatePostsalesReturn(motivo, observacao);
    if (motivoError) return res.status(400).json({ error: motivoError });

    // Prazo: 3 dias úteis; se a API de feriados falhar, cai para 3 dias corridos.
    const todayYmd = brtDateStr();
    let prazoYmd;
    try {
      prazoYmd = await addBusinessDays(todayYmd, DEVOLUCAO_PRAZO_DIAS);
    } catch {
      const d = new Date(`${todayYmd}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() + DEVOLUCAO_PRAZO_DIAS);
      prazoYmd = d.toISOString().slice(0, 10);
    }

    const r = await query(
      `UPDATE postsales_verificacoes
          SET status = 'devolvida', motivo_devolucao = $3, devolucao_obs = $4,
              devolvida_at = NOW(), prazo_ymd = $5,
              resolvida_at = NULL, resolvida_por_id = NULL, resolvida_por_nome = NULL, resolucao_obs = NULL,
              updated_at = NOW()
        WHERE id = $1 AND status = 'em_verificacao' AND auditor_id = $2
        RETURNING *`,
      [req.params.id, agent.id, motivo, observacao, prazoYmd]
    );
    if (!r.rows[0]) return res.status(409).json({ error: 'Assuma a verificação antes de devolver (apenas o auditor responsável pode devolver).' });
    const v = r.rows[0];

    await addEvento(v.id, v.erp_pedido_id, 'devolvida',
      `Devolvida ao coordenador por ${agent.name}. Motivo: ${POSTSALES_MOTIVOS[motivo]}. Prazo: ${prazoYmd}.${observacao ? ` Obs.: ${observacao}` : ''}`, agent);

    // Notificações internas: vendedor + supervisores do time.
    const numero = numeroDe(v);
    const msg = buildPostsalesReturnNotification({
      numero,
      clienteNome: v.cliente_nome,
      motivo,
      prazoYmd,
      observacao,
    });
    if (v.vendedor_id) {
      const vr = await query(`SELECT email FROM agents WHERE id = $1`, [v.vendedor_id]);
      if (vr.rows[0]?.email) {
        await createNotification({
          userEmail: vr.rows[0].email, type: 'postsales_devolucao',
          title: 'Orçamento devolvido pelo Pós-Vendas', message: msg,
          link: '/PosVendasDevolucoes', entityType: 'postsales_verificacao', entityId: v.id, priority: 'high',
        });
      }
    }
    for (const supEmail of await getSupervisorEmails(v.vendedor_id)) {
      await createNotification({
        userEmail: supEmail, type: 'postsales_devolucao',
        title: 'Devolução do Pós-Vendas para sua equipe', message: msg,
        link: '/PosVendasDevolucoes', entityType: 'postsales_verificacao', entityId: v.id, priority: 'high',
      });
    }

    return res.json({ item: shapeItem(v, req.user.id) });
  } catch (e) {
    console.error('[postsales] devolver error:', e.message);
    return res.status(500).json({ error: 'Falha ao devolver ao coordenador.' });
  }
});

// GET /devolucoes — coordenador/supervisor vê as devoluções pendentes da SUA equipe
// (admin vê todas). Inclui também as já resolvidas/congeladas para acompanhamento.
router.get('/devolucoes', authMiddleware, async (req, res) => {
  try {
    const { eligible, isAdmin, agent } = await resolveCoordenador(req);
    if (!eligible) return res.status(403).json({ error: 'Acesso restrito a coordenadores/supervisores.' });

    const params = [];
    let where = `WHERE v.status IN ('devolvida','resolvida','congelada')`;
    if (!isAdmin) {
      if (!agent?.team_id) return res.json({ items: [], today_ymd: brtDateStr() });
      params.push(agent.team_id);
      where += ` AND a.team_id = $${params.length}`;
    }
    const r = await query(
      `SELECT v.* FROM postsales_verificacoes v
         LEFT JOIN agents a ON a.id = v.vendedor_id
        ${where}
        ORDER BY (v.status = 'devolvida') DESC, v.prazo_ymd ASC NULLS LAST, v.devolvida_at ASC`,
      params
    );
    return res.json({
      items: r.rows.map((row) => shapeItem(row, req.user.id)),
      motivos: POSTSALES_MOTIVOS,
      today_ymd: brtDateStr(),
    });
  } catch (e) {
    console.error('[postsales] GET /devolucoes error:', e.message);
    return res.status(500).json({ error: 'Falha ao carregar as devoluções.' });
  }
});

// POST /:id/resolver — coordenador marca a pendência como resolvida; volta ao auditor
// do Pós-Vendas para reavaliação (status 'resolvida' mantém o auditor original).
router.post('/:id/resolver', authMiddleware, async (req, res) => {
  try {
    const { eligible, isAdmin, agent } = await resolveCoordenador(req);
    if (!eligible) return res.status(403).json({ error: 'Acesso restrito a coordenadores/supervisores.' });

    const cur = await getVerificacao(req.params.id);
    if (!cur) return res.status(404).json({ error: 'Verificação não encontrada.' });
    if (cur.status !== 'devolvida') return res.status(409).json({ error: 'Apenas devoluções pendentes podem ser marcadas como resolvidas.' });

    if (!isAdmin) {
      const tr = await query(`SELECT team_id FROM agents WHERE id = $1`, [cur.vendedor_id]);
      if (!tr.rows[0] || String(tr.rows[0].team_id) !== String(agent?.team_id)) {
        return res.status(403).json({ error: 'Esta devolução não pertence à sua equipe.' });
      }
    }

    const obs = String(req.body?.observacao || '').trim().slice(0, 1000) || null;
    const r = await query(
      `UPDATE postsales_verificacoes
          SET status = 'resolvida', resolvida_at = NOW(), resolvida_por_id = $2,
              resolvida_por_nome = $3, resolucao_obs = $4, updated_at = NOW()
        WHERE id = $1 AND status = 'devolvida'
        RETURNING *`,
      [req.params.id, agent?.id || null, agent?.name || 'Admin', obs]
    );
    if (!r.rows[0]) return res.status(409).json({ error: 'A devolução já foi tratada.' });
    const v = r.rows[0];
    await addEvento(v.id, v.erp_pedido_id, 'resolvida',
      `Pendência marcada como resolvida por ${agent?.name || 'Admin'}.${obs ? ` Obs.: ${obs}` : ''}`, agent);

    // Notifica o auditor do Pós-Vendas para reavaliar.
    if (v.auditor_email) {
      await createNotification({
        userEmail: v.auditor_email, type: 'postsales_resolucao',
        title: 'Devolução resolvida — reavaliar orçamento',
        message: `A pendência do orçamento Nº ${numeroDe(v)}${v.cliente_nome ? ` (${v.cliente_nome})` : ''} foi marcada como resolvida por ${agent?.name || 'Admin'}. Reavalie no Pós-Vendas.`,
        link: '/PosVendasFila', entityType: 'postsales_verificacao', entityId: v.id, priority: 'high',
      });
    }
    return res.json({ item: shapeItem(v, req.user.id) });
  } catch (e) {
    console.error('[postsales] resolver error:', e.message);
    return res.status(500).json({ error: 'Falha ao marcar como resolvida.' });
  }
});

// POST /:id/congelar — reavaliação reprovou (ou prazo vencido, manualmente): congela o
// orçamento e o expõe ao Pré-venda. Só o auditor responsável (ou admin).
router.post('/:id/congelar', authMiddleware, async (req, res) => {
  try {
    const { eligible, isAdmin, agent } = await resolvePostsalesAuditor(req);
    if (!eligible) return res.status(403).json({ error: 'Acesso restrito à equipe de Pós-Vendas.' });

    const obs = String(req.body?.observacao || '').trim().slice(0, 1000) || null;
    const params = [req.params.id, obs];
    let ownerCond = '';
    if (!isAdmin) {
      params.push(agent.id);
      ownerCond = ` AND (auditor_id = $3 OR auditor_id IS NULL)`;
    }
    const r = await query(
      `UPDATE postsales_verificacoes
          SET status = 'congelada', congelada_at = NOW(), congelamento_motivo = $2, updated_at = NOW()
        WHERE id = $1 AND status IN ('em_verificacao','devolvida','resolvida')${ownerCond}
        RETURNING *`,
      params
    );
    if (!r.rows[0]) return res.status(409).json({ error: 'Não foi possível congelar: verifique o estado atual e se você é o auditor responsável.' });
    const v = r.rows[0];
    await addEvento(v.id, v.erp_pedido_id, 'congelada',
      `Orçamento congelado por ${agent.name} e devolvido ao Pré-venda como não resolvido.${obs ? ` Obs.: ${obs}` : ''}`, agent);
    return res.json({ item: shapeItem(v, req.user.id) });
  } catch (e) {
    console.error('[postsales] congelar error:', e.message);
    return res.status(500).json({ error: 'Falha ao congelar o orçamento.' });
  }
});

// GET /congelados — equipe do Pré-venda vê os congelados (e o que já foi decidido).
router.get('/congelados', authMiddleware, async (req, res) => {
  try {
    const { eligible } = await resolvePrevenda(req);
    if (!eligible) return res.status(403).json({ error: 'Acesso restrito à auditoria do Pré-venda.' });

    const r = await query(
      `SELECT * FROM postsales_verificacoes
        WHERE status IN ('congelada','aguardando_cancelamento','cancelada')
        ORDER BY (status = 'congelada') DESC, congelada_at ASC NULLS LAST`
    );
    return res.json({ items: r.rows.map((row) => shapeItem(row, req.user.id)), today_ymd: brtDateStr() });
  } catch (e) {
    console.error('[postsales] GET /congelados error:', e.message);
    return res.status(500).json({ error: 'Falha ao carregar os congelados.' });
  }
});

// POST /:id/prevenda-liberar — Pré-venda LIBERA: o orçamento volta à fila do Pós-Vendas.
router.post('/:id/prevenda-liberar', authMiddleware, async (req, res) => {
  try {
    const { eligible, agent } = await resolvePrevenda(req);
    if (!eligible) return res.status(403).json({ error: 'Acesso restrito à auditoria do Pré-venda.' });

    const r = await query(
      `UPDATE postsales_verificacoes
          SET status = 'fila', auditor_id = NULL, auditor_nome = NULL, auditor_email = NULL,
              assumido_at = NULL, prevenda_decisao = 'liberado', prevenda_decisao_at = NOW(),
              prevenda_decisao_por = $2, updated_at = NOW()
        WHERE id = $1 AND status = 'congelada'
        RETURNING *`,
      [req.params.id, agent?.name || 'Pré-venda']
    );
    if (!r.rows[0]) return res.status(409).json({ error: 'Apenas orçamentos congelados podem ser liberados.' });
    const v = r.rows[0];
    await addEvento(v.id, v.erp_pedido_id, 'prevenda_liberado',
      `Pré-venda liberou o orçamento (${agent?.name || '-'}); voltou à fila do Pós-Vendas.`, agent);
    return res.json({ item: shapeItem(v, req.user.id) });
  } catch (e) {
    console.error('[postsales] prevenda-liberar error:', e.message);
    return res.status(500).json({ error: 'Falha ao liberar o orçamento.' });
  }
});

// POST /:id/prevenda-nao-liberar — Pré-venda NÃO libera: encaminha à decisão final do
// auditor do Pós-Vendas (aguardando_cancelamento).
router.post('/:id/prevenda-nao-liberar', authMiddleware, async (req, res) => {
  try {
    const { eligible, agent } = await resolvePrevenda(req);
    if (!eligible) return res.status(403).json({ error: 'Acesso restrito à auditoria do Pré-venda.' });

    const r = await query(
      `UPDATE postsales_verificacoes
          SET status = 'aguardando_cancelamento', prevenda_decisao = 'nao_liberado',
              prevenda_decisao_at = NOW(), prevenda_decisao_por = $2, updated_at = NOW()
        WHERE id = $1 AND status = 'congelada'
        RETURNING *`,
      [req.params.id, agent?.name || 'Pré-venda']
    );
    if (!r.rows[0]) return res.status(409).json({ error: 'Apenas orçamentos congelados podem ser encaminhados à decisão final.' });
    const v = r.rows[0];
    await addEvento(v.id, v.erp_pedido_id, 'prevenda_nao_liberado',
      `Pré-venda NÃO liberou o orçamento (${agent?.name || '-'}); aguardando decisão final do Pós-Vendas.`, agent);

    if (v.auditor_email) {
      await createNotification({
        userEmail: v.auditor_email, type: 'postsales_decisao_final',
        title: 'Decisão final pendente no Pós-Vendas',
        message: `O Pré-venda não liberou o orçamento Nº ${numeroDe(v)}${v.cliente_nome ? ` (${v.cliente_nome})` : ''}. Registre a decisão final (cancelamento no ERP) no Pós-Vendas.`,
        link: '/PosVendasFila', entityType: 'postsales_verificacao', entityId: v.id, priority: 'high',
      });
    }
    return res.json({ item: shapeItem(v, req.user.id) });
  } catch (e) {
    console.error('[postsales] prevenda-nao-liberar error:', e.message);
    return res.status(500).json({ error: 'Falha ao registrar a decisão do Pré-venda.' });
  }
});

// POST /:id/cancelar — DECISÃO FINAL do auditor do Pós-Vendas: cancela o pedido DE FATO
// no ERP (situacao=C, escrita direta já validada). Exige confirmar=true e motivo.
router.post('/:id/cancelar', authMiddleware, async (req, res) => {
  try {
    const { eligible, agent } = await resolvePostsalesAuditor(req);
    if (!eligible) return res.status(403).json({ error: 'Acesso restrito à equipe de Pós-Vendas.' });

    if (req.body?.confirmar !== true) {
      return res.status(400).json({ error: 'Confirme explicitamente o cancelamento definitivo (confirmar=true).' });
    }
    const motivoTexto = String(req.body?.motivo || '').trim();
    if (!motivoTexto) return res.status(400).json({ error: 'Descreva o motivo do cancelamento definitivo.' });

    const cur = await getVerificacao(req.params.id);
    if (!cur) return res.status(404).json({ error: 'Verificação não encontrada.' });
    if (cur.status !== 'aguardando_cancelamento') {
      return res.status(409).json({ error: 'O cancelamento definitivo só é permitido após o Pré-venda não liberar o orçamento.' });
    }

    const erpUserId = agent?.erp_agent_id ? Number(agent.erp_agent_id) : null;
    if (!erpUserId) {
      return res.status(400).json({ error: 'Seu usuário não possui vínculo com o ERP (erp_agent_id). Solicite o vínculo antes de registrar o cancelamento.' });
    }

    // Cancelamento REAL no ERP.
    let cancelRes;
    try {
      cancelRes = await cancelOrcamentoDB(cur.erp_pedido_id, {
        usuarioAlteracaoId: erpUserId,
        motivoId: POSTSALES_CANCEL_MOTIVO_ID,
        motivoTexto: `Pós-Vendas: ${motivoTexto}`,
      });
    } catch (e) {
      console.error('[postsales] cancelOrcamentoDB error:', e.message);
      return res.status(502).json({ error: `Falha ao cancelar no ERP: ${e.message}. Nada foi alterado localmente.` });
    }

    if (cancelRes.status === 'not_found') {
      return res.status(409).json({ error: 'Pedido não encontrado no ERP; cancelamento não realizado.' });
    }
    if (cancelRes.status === 'invalid_state') {
      return res.status(409).json({ error: `O pedido não está mais em análise no ERP (situação "${cancelRes.situacao}"); cancelamento não realizado.` });
    }

    const info = cancelRes.status === 'already_cancelled'
      ? `Pedido já estava cancelado no ERP (situacao=C). Decisão registrada por ${agent.name} em ${brtDateStr()}.`
      : `Cancelado no ERP (situacao=C, valor ${cancelRes.valorCancelado ?? '-'}) por ${agent.name} (ERP ${erpUserId}) em ${brtDateStr()}. Motivo: ${motivoTexto}`;

    const r = await query(
      `UPDATE postsales_verificacoes
          SET status = 'cancelada', cancelada_at = NOW(), cancelada_por_id = $2,
              cancelada_por_nome = $3, cancelamento_motivo = $4, cancelamento_info = $5, updated_at = NOW()
        WHERE id = $1 AND status = 'aguardando_cancelamento'
        RETURNING *`,
      [req.params.id, agent.id, agent.name, motivoTexto, info]
    );
    const v = r.rows[0] || cur;
    await addEvento(v.id, v.erp_pedido_id, 'cancelada', info, agent);

    // Notifica vendedor e supervisores.
    const msg = `O orçamento Nº ${numeroDe(v)}${v.cliente_nome ? ` (${v.cliente_nome})` : ''} foi cancelado definitivamente no ERP pelo Pós-Vendas. Motivo: ${motivoTexto}`;
    if (v.vendedor_id) {
      const vr = await query(`SELECT email FROM agents WHERE id = $1`, [v.vendedor_id]);
      if (vr.rows[0]?.email) {
        await createNotification({
          userEmail: vr.rows[0].email, type: 'postsales_cancelamento',
          title: 'Orçamento cancelado pelo Pós-Vendas', message: msg,
          link: '/PosVendasDevolucoes', entityType: 'postsales_verificacao', entityId: v.id, priority: 'high',
        });
      }
    }
    for (const supEmail of await getSupervisorEmails(v.vendedor_id)) {
      await createNotification({
        userEmail: supEmail, type: 'postsales_cancelamento',
        title: 'Orçamento da sua equipe cancelado pelo Pós-Vendas', message: msg,
        link: '/PosVendasDevolucoes', entityType: 'postsales_verificacao', entityId: v.id, priority: 'high',
      });
    }

    return res.json({ item: shapeItem(v, req.user.id), erp: cancelRes });
  } catch (e) {
    console.error('[postsales] cancelar error:', e.message);
    return res.status(500).json({ error: 'Falha ao registrar o cancelamento definitivo.' });
  }
});

// GET /monitor — funil consolidado para a liderança + itens.
router.get('/monitor', authMiddleware, async (req, res) => {
  try {
    const { eligible } = await resolveLeitura(req);
    if (!eligible) return res.status(403).json({ error: 'Acesso restrito à liderança e à equipe de Pós-Vendas.' });

    await ingestAprovados();

    const r = await query(`SELECT * FROM postsales_verificacoes ORDER BY updated_at DESC`);
    const counts = { todos: r.rows.length };
    for (const s of STATUS_LIST) counts[s] = 0;
    for (const row of r.rows) counts[row.status] = (counts[row.status] || 0) + 1;

    return res.json({
      items: r.rows.map((row) => shapeItem(row, req.user.id)),
      counts,
      motivos: POSTSALES_MOTIVOS,
      prazo_dias: DEVOLUCAO_PRAZO_DIAS,
      today_ymd: brtDateStr(),
    });
  } catch (e) {
    console.error('[postsales] GET /monitor error:', e.message);
    return res.status(500).json({ error: 'Falha ao carregar o monitor do Pós-Vendas.' });
  }
});

// GET /:id/detalhe — dados vivos do ERP + documentos de uma verificação.
// O id da verificação é obrigatório no caminho: não expõe uma consulta genérica
// por pedido e mantém o escopo exatamente na fila do Pós-Vendas.
router.get('/:id/detalhe', authMiddleware, async (req, res) => {
  try {
    const { eligible } = await resolvePostsalesAuditor(req);
    if (!eligible) {
      return res.status(403).json({ error: 'Acesso restrito à equipe de Pós-Vendas.' });
    }

    const verificacao = await getVerificacao(req.params.id);
    if (!verificacao) return res.status(404).json({ error: 'Verificação não encontrada.' });

    const pedidoId = Number(verificacao.erp_pedido_id);
    if (!Number.isSafeInteger(pedidoId) || pedidoId <= 0) {
      return res.status(422).json({ error: 'A verificação não possui um orçamento ERP válido.' });
    }

    // Documentos são locais e continuam disponíveis mesmo quando o ERP estiver
    // temporariamente indisponível. Assim o auditor vê o motivo real da falha e
    // pode tentar novamente sem perder o retrato local.
    const docsRes = await query(
      `SELECT id, tipo, original_name, mime_type, size_bytes, created_at
         FROM orcamento_documentos
        WHERE erp_pedido_id = $1
        ORDER BY created_at`,
      [pedidoId]
    );
    const documentos = docsRes.rows.map((d) => ({
      id: d.id,
      tipo: d.tipo,
      original_name: d.original_name,
      mime_type: d.mime_type,
      size_bytes: d.size_bytes != null ? Number(d.size_bytes) : null,
      created_at: d.created_at,
    }));

    let produto = null;
    try {
      const produtos = await getProdutosByPedidoIds([pedidoId]);
      produto = produtos[pedidoId] || null;
    } catch (e) {
      // O detalhe contém os produtos e é a fonte principal; esta consulta é
      // apenas compatibilidade com o resumo usado no modal do Pré-Vendas.
      console.error('[postsales] lookup de produto falhou (não crítico):', e.message);
    }

    let detalhe = null;
    let detailStatus = 'empty';
    let detailError = null;
    try {
      detalhe = await getOrcamentoDetalhe(pedidoId);
      detailStatus = classifyPostsalesDetail(detalhe);
    } catch (e) {
      detailStatus = classifyPostsalesDetail(null, e);
      detailError = 'Não foi possível consultar os dados do orçamento no ERP. Tente novamente.';
      console.error('[postsales] lookup de detalhe falhou:', e.message);
    }

    return res.json({
      erp_pedido_id: pedidoId,
      item: shapeItem(verificacao, req.user.id),
      produto,
      detalhe,
      documentos,
      detail_status: detailStatus,
      detail_error: detailError,
    });
  } catch (e) {
    console.error('[postsales] GET /detalhe error:', e.message);
    return res.status(500).json({ error: 'Falha ao carregar os dados do orçamento no Pós-Vendas.' });
  }
});

// GET /:id/eventos — trilha completa de um orçamento no Pós-Vendas.
router.get('/:id/eventos', authMiddleware, async (req, res) => {
  try {
    const lead = await resolveLeitura(req);
    const pre = lead.eligible ? { eligible: true } : await resolvePrevenda(req);
    if (!lead.eligible && !pre.eligible) return res.status(403).json({ error: 'Acesso restrito.' });

    const r = await query(
      `SELECT id, tipo, detalhe, actor_nome, created_at
         FROM postsales_eventos WHERE verificacao_id = $1
        ORDER BY created_at ASC, id ASC`,
      [req.params.id]
    );
    return res.json({ items: r.rows });
  } catch (e) {
    console.error('[postsales] GET /eventos error:', e.message);
    return res.status(500).json({ error: 'Falha ao carregar a trilha.' });
  }
});

// ----- Job: congelamento automático das devoluções com prazo vencido -----
// Roda no cron diário (07:00) e pode ser disparado manualmente por admin.
export async function runPostsalesCongelarVencidas() {
  const result = { checked: 0, frozen: 0, errors: 0 };
  const todayYmd = brtDateStr();
  const r = await query(
    `SELECT * FROM postsales_verificacoes
      WHERE status = 'devolvida' AND prazo_ymd IS NOT NULL AND prazo_ymd < $1`,
    [todayYmd]
  );
  result.checked = r.rows.length;
  for (const v of r.rows) {
    try {
      const u = await query(
        `UPDATE postsales_verificacoes
            SET status = 'congelada', congelada_at = NOW(),
                congelamento_motivo = $2, updated_at = NOW()
          WHERE id = $1 AND status = 'devolvida'
          RETURNING id`,
        [v.id, `Prazo de ${DEVOLUCAO_PRAZO_DIAS} dias vencido em ${v.prazo_ymd} sem resolução do coordenador.`]
      );
      if (!u.rows[0]) continue;
      result.frozen++;
      await addEvento(v.id, v.erp_pedido_id, 'congelada_automatica',
        `Prazo vencido em ${v.prazo_ymd} sem resolução; orçamento congelado e devolvido ao Pré-venda.`, null);
      if (v.auditor_email) {
        await createNotification({
          userEmail: v.auditor_email, type: 'postsales_congelamento',
          title: 'Devolução vencida — orçamento congelado',
          message: `O prazo da devolução do orçamento Nº ${numeroDe(v)}${v.cliente_nome ? ` (${v.cliente_nome})` : ''} venceu sem resolução. O orçamento foi congelado e devolvido ao Pré-venda.`,
          link: '/PosVendasFila', entityType: 'postsales_verificacao', entityId: v.id, priority: 'high',
        });
      }
      for (const supEmail of await getSupervisorEmails(v.vendedor_id)) {
        await createNotification({
          userEmail: supEmail, type: 'postsales_congelamento',
          title: 'Prazo de devolução vencido — orçamento congelado',
          message: `A devolução do orçamento Nº ${numeroDe(v)} venceu em ${v.prazo_ymd} sem resolução e foi congelada (voltou ao Pré-venda).`,
          link: '/PosVendasDevolucoes', entityType: 'postsales_verificacao', entityId: v.id, priority: 'high',
        });
      }
    } catch (e) {
      result.errors++;
      console.error('[postsales] congelar vencida erro:', e.message);
    }
  }
  return result;
}

// POST /jobs/congelar-vencidas/run — disparo manual (admin ou equipe Pós-Vendas).
router.post('/jobs/congelar-vencidas/run', authMiddleware, async (req, res) => {
  try {
    const { eligible } = await resolvePostsalesAuditor(req);
    if (!eligible) return res.status(403).json({ error: 'Acesso restrito à equipe de Pós-Vendas.' });
    const result = await runPostsalesCongelarVencidas();
    return res.json({ success: true, result });
  } catch (e) {
    console.error('[postsales] job congelar-vencidas error:', e.message);
    return res.status(500).json({ error: 'Falha ao executar o congelamento de vencidas.' });
  }
});

export default router;
