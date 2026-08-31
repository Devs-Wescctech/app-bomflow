import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { pool, query } from '../config/database.js';
import { createNotification } from '../services/notificationService.js';
import { addBusinessDays, brtDateStr, preloadHolidays } from '../services/businessDaysService.js';
import { validateDateRange } from '../utils/postsalesFilters.js';
import { enrichPostsalesClientIdentities } from '../services/postsalesClientService.js';
import { getOrcamentoDetalhe } from '../services/erpDbService.js';
import { getApprovalPending } from '../utils/orcamentoDocumentos.js';
import { getErpPool } from '../services/erpDbService.js';
import {
  applyPresalesAddressCorrection,
  assertAddressAdjustmentType,
  assertPendingPresalesAdjustment,
  assertSellerOwnsPresalesAdjustment,
  buildPresalesAdjustmentLink,
  getPresalesBudgetAddress,
  listPresalesCities,
  normalizePresalesAdjustmentType,
  presalesAddressesEqual,
  requirePresalesAdjustmentType,
  withPresalesAdjustmentLock,
} from '../services/presalesAdjustmentAddressService.js';
import {
  applyPostsalesCompleteCorrection,
  getPostsalesCorrectionContext,
} from '../services/postsalesCorrectionService.js';

const router = express.Router();

function approvalHttpError(status, body) {
  const error = new Error(body.error);
  error.approvalStatus = status;
  error.approvalBody = body;
  return error;
}

// Mesma leitura de configuração do job de auto-cancelamento (functions.js), para que
// o painel de acompanhamento exiba os mesmos prazos/flags que o cron usa de fato.
function readAutocancelConfig() {
  const enabled = process.env.PRESALES_AUTOCANCEL_ENABLED !== 'false';
  const dryRun = process.env.PRESALES_AUTOCANCEL_DRYRUN !== 'false';
  const warnFeature = process.env.PRESALES_AUTOCANCEL_WARN_ENABLED !== 'false';

  const rawDeadline = Number(process.env.PRESALES_AUTOCANCEL_DEADLINE_DAYS);
  let deadlineDays = 3;
  if (Number.isInteger(rawDeadline) && rawDeadline > 0) deadlineDays = rawDeadline;

  const rawWarn = Number(process.env.PRESALES_AUTOCANCEL_WARN_DAYS);
  let warnDays = 1;
  if (Number.isInteger(rawWarn) && rawWarn > 0) warnDays = rawWarn;
  if (warnDays >= deadlineDays) warnDays = Math.max(deadlineDays - 1, 0);

  return { enabled, dryRun, warnFeature, deadlineDays, warnDays };
}

const MODULO_LABELS = {
  vendas_pf: 'Vendas PF',
  vendas_pj: 'Vendas PJ',
  upsell: 'Upsell',
  indicacoes: 'Indicações',
};

// Mapeia o módulo do orçamento para a tabela de leads, a coluna do documento
// do cliente e a página de detalhe do lead no frontend.
const MODULO_LEAD_MAP = {
  sales: { table: 'leads', cpfCol: 'cpf', page: 'LeadDetail' },
  sales_pj: { table: 'leads_pj', cpfCol: 'cnpj', page: 'LeadPJDetail' },
  referral: { table: 'referrals', cpfCol: 'referred_cpf', page: 'ReferralDetail' },
  sales_upsell: { table: 'leads_upsell', cpfCol: 'cpf', page: 'LeadUpsellDetail' },
};

// Mesma regra de elegibilidade da Fila Pré Vendas (relatório consolidado):
// admin, agente do tipo "auditoria" ou supervisor do time "Auditoria".
async function resolveAuditor(req) {
  const agentRes = await query(
    `SELECT a.id, a.name, a.email, a.agent_type, t.name AS team_name
       FROM agents a
       LEFT JOIN teams t ON t.id = a.team_id
      WHERE a.id = $1`,
    [req.user.id]
  );
  const agent = agentRes.rows[0];
  if (!agent) return { eligible: false, agent: null };

  const agentType = (agent.agent_type || '').toLowerCase();
  const isAdmin = agentType === 'admin' || (req.user.role || '').toLowerCase() === 'admin';
  const isAuditoria = agentType === 'auditoria';
  const isSupervisor = agentType.includes('supervisor');
  const teamName = (agent.team_name || '').trim().toLowerCase();
  const isAuditTeamSupervisor = isSupervisor && teamName === 'auditoria';

  return { eligible: isAdmin || isAuditoria || isAuditTeamSupervisor, agent };
}

// E-mails dos supervisores do vendedor (via time).
async function getSupervisorEmails(vendedorId) {
  if (!vendedorId) return [];
  const res = await query(
    `SELECT t.supervisor_email, t.supervisor_emails
       FROM agents a
       JOIN teams t ON t.id = a.team_id
      WHERE a.id = $1`,
    [vendedorId]
  );
  const row = res.rows[0];
  if (!row) return [];
  const emails = new Set();
  if (row.supervisor_email) emails.add(row.supervisor_email);
  if (Array.isArray(row.supervisor_emails)) {
    row.supervisor_emails.forEach((e) => e && emails.add(e));
  }
  return [...emails];
}

// POST / — auditor cria um pedido de ajuste para um orçamento da fila.
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { eligible, agent } = await resolveAuditor(req);
    if (!eligible) {
      return res.status(403).json({ error: 'Acesso restrito à auditoria da Fila Pré Vendas.' });
    }

    const erpPedidoId = Number(req.body?.erp_pedido_id);
    const texto = String(req.body?.texto || '').trim();
    if (!erpPedidoId) return res.status(400).json({ error: 'erp_pedido_id é obrigatório.' });
    if (!texto) return res.status(400).json({ error: 'Descreva o que precisa ser ajustado.' });
    const tipoAjuste = requirePresalesAdjustmentType(req.body?.tipo_ajuste);

    // Vínculo do orçamento com o vendedor real do Bom Flow.
    const orcRes = await query(
      `SELECT erp_pedido_id, erp_numero, modulo, agent_id, agent_name, cliente_nome, cliente_cpf
         FROM bomflow_orcamentos WHERE erp_pedido_id = $1`,
      [erpPedidoId]
    );
    const orc = orcRes.rows[0];
    if (!orc) {
      return res.status(404).json({ error: 'Orçamento não encontrado no rastreio do Bom Flow.' });
    }

    // Trava de auditoria: só o auditor que assumiu (status 'em_auditoria') pode solicitar
    // ajuste. Garante no servidor a regra "1 auditor por vez / demais somente leitura".
    const lockRes = await query(
      `SELECT erp_pedido_id, auditor_id, auditor_nome, auditor_email, assumido_at
         FROM presales_auditorias
        WHERE erp_pedido_id = $1 AND status = 'em_auditoria'`,
      [erpPedidoId]
    );
    const activeLock = lockRes.rows[0];
    if (!activeLock) {
      return res.status(409).json({
        error: 'Assuma a auditoria deste orçamento antes de solicitar um ajuste.',
        lock: null,
      });
    }
    if (String(activeLock.auditor_id) !== String(agent.id)) {
      return res.status(409).json({
        error: activeLock.auditor_nome
          ? `Este orçamento está em auditoria por ${activeLock.auditor_nome}. Somente o auditor responsável pode solicitar ajuste.`
          : 'Este orçamento está em auditoria por outro auditor.',
        lock: shapeLock(activeLock, req.user.id),
      });
    }

    const insertRes = await query(
      `INSERT INTO presales_ajustes
         (erp_pedido_id, erp_numero, modulo, vendedor_id, vendedor_nome,
          cliente_nome, cliente_cpf, texto, status, auditor_id, auditor_nome, auditor_email,
          tipo_ajuste)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pendente',$9,$10,$11,$12)
       RETURNING *`,
      [
        orc.erp_pedido_id, orc.erp_numero, orc.modulo, orc.agent_id, orc.agent_name,
        orc.cliente_nome, orc.cliente_cpf, texto, agent.id, agent.name, agent.email,
        tipoAjuste,
      ]
    );
    const ajuste = insertRes.rows[0];

    // Notifica o vendedor que cadastrou a venda.
    const numero = orc.erp_numero || orc.erp_pedido_id;
    if (orc.agent_id) {
      const vendRes = await query(`SELECT email FROM agents WHERE id = $1`, [orc.agent_id]);
      const vendEmail = vendRes.rows[0]?.email;
      if (vendEmail) {
        await createNotification({
          userEmail: vendEmail,
          type: 'presales_ajuste',
          title: 'Ajuste solicitado pela auditoria',
          message: `A auditoria solicitou ajustes no orçamento Nº ${numero}${orc.cliente_nome ? ` (${orc.cliente_nome})` : ''}: "${texto.substring(0, 120)}${texto.length > 120 ? '…' : ''}"`,
          link: buildPresalesAdjustmentLink(ajuste.id, orc.erp_pedido_id),
          entityType: 'presales_ajuste',
          entityId: ajuste.id,
          priority: 'high',
        });
      }
    }

    // Notifica os supervisores do vendedor.
    const supervisorEmails = await getSupervisorEmails(orc.agent_id);
    for (const supEmail of supervisorEmails) {
      await createNotification({
        userEmail: supEmail,
        type: 'presales_ajuste',
        title: 'Ajuste solicitado pela auditoria',
        message: `A auditoria solicitou ajustes no orçamento Nº ${numero}${orc.agent_name ? ` de ${orc.agent_name}` : ''}: "${texto.substring(0, 120)}${texto.length > 120 ? '…' : ''}"`,
        link: buildPresalesAdjustmentLink(ajuste.id, orc.erp_pedido_id),
        entityType: 'presales_ajuste',
        entityId: ajuste.id,
        priority: 'normal',
      });
    }

    return res.json({ ajuste });
  } catch (e) {
    console.error('[presales-ajustes] POST error:', e.message);
    return res.status(e.statusCode || 500).json({
      error: e.statusCode ? e.message : 'Falha ao registrar o pedido de ajuste.',
      fields: e.fields || undefined,
    });
  }
});

// ----- Trava de auditoria (1 auditor por orçamento por vez) -----
// O auditor "assume" manualmente um orçamento; os demais o veem somente para leitura.
// A trava (status 'em_auditoria') só é liberada quando o auditor conclui (clica em
// "Aprovar" no modal), passando a 'concluida'. Não há liberação por tempo nem ao fechar.

// Monta o objeto de trava devolvido ao frontend, incluindo `mine` (se a trava é do
// próprio usuário autenticado) para evitar comparações de id/casing no cliente.
function shapeLock(row, userId) {
  if (!row) return null;
  return {
    erp_pedido_id: Number(row.erp_pedido_id),
    auditor_id: row.auditor_id,
    auditor_nome: row.auditor_nome,
    auditor_email: row.auditor_email,
    assumido_at: row.assumido_at,
    mine: String(row.auditor_id) === String(userId),
  };
}

// POST /locks/status — travas ATIVAS para uma lista de orçamentos (para a Fila exibir
// quem está auditando cada card). Body: { pedidos: [<erp_pedido_id>, ...] }.
router.post('/locks/status', authMiddleware, async (req, res) => {
  try {
    const { eligible } = await resolveAuditor(req);
    if (!eligible) return res.status(403).json({ error: 'Acesso restrito à auditoria da Fila Pré Vendas.' });

    const pedidos = Array.isArray(req.body?.pedidos) ? req.body.pedidos : [];
    const ids = [...new Set(pedidos.map((p) => Number(p)).filter((n) => Number.isInteger(n) && n > 0))];
    if (ids.length === 0) return res.json({ locks: {} });

    const r = await query(
      `SELECT erp_pedido_id, auditor_id, auditor_nome, auditor_email, assumido_at
         FROM presales_auditorias
        WHERE status = 'em_auditoria' AND erp_pedido_id = ANY($1::bigint[])`,
      [ids]
    );
    const locks = {};
    for (const row of r.rows) locks[Number(row.erp_pedido_id)] = shapeLock(row, req.user.id);
    return res.json({ locks });
  } catch (e) {
    console.error('[presales-ajustes] locks/status error:', e.message);
    return res.status(500).json({ error: 'Falha ao consultar as travas de auditoria.' });
  }
});

// GET /locks/:erpPedidoId — estado da trava de um orçamento (null se livre).
router.get('/locks/:erpPedidoId', authMiddleware, async (req, res) => {
  try {
    const { eligible } = await resolveAuditor(req);
    if (!eligible) return res.status(403).json({ error: 'Acesso restrito à auditoria da Fila Pré Vendas.' });

    const erpPedidoId = Number(req.params.erpPedidoId);
    if (!Number.isInteger(erpPedidoId) || erpPedidoId <= 0) {
      return res.status(400).json({ error: 'erp_pedido_id inválido.' });
    }
    const r = await query(
      `SELECT erp_pedido_id, auditor_id, auditor_nome, auditor_email, assumido_at
         FROM presales_auditorias
        WHERE erp_pedido_id = $1 AND status = 'em_auditoria'`,
      [erpPedidoId]
    );
    return res.json({ lock: shapeLock(r.rows[0], req.user.id) });
  } catch (e) {
    console.error('[presales-ajustes] locks GET error:', e.message);
    return res.status(500).json({ error: 'Falha ao consultar a trava de auditoria.' });
  }
});

// POST /locks/:erpPedidoId/assumir — o auditor assume a auditoria (trava o orçamento).
// Atômico via ON CONFLICT: só grava se estiver livre/concluído OU já for do próprio auditor.
// Se outro auditor já está com a trava ativa, devolve 409 com quem está auditando.
router.post('/locks/:erpPedidoId/assumir', authMiddleware, async (req, res) => {
  try {
    const { eligible, agent } = await resolveAuditor(req);
    if (!eligible) return res.status(403).json({ error: 'Acesso restrito à auditoria da Fila Pré Vendas.' });

    const erpPedidoId = Number(req.params.erpPedidoId);
    if (!Number.isInteger(erpPedidoId) || erpPedidoId <= 0) {
      return res.status(400).json({ error: 'erp_pedido_id inválido.' });
    }

    const r = await query(
      `INSERT INTO presales_auditorias
         (erp_pedido_id, auditor_id, auditor_nome, auditor_email, status, assumido_at, concluida_at, resultado, updated_at)
       VALUES ($1, $2, $3, $4, 'em_auditoria', NOW(), NULL, NULL, NOW())
       ON CONFLICT (erp_pedido_id) DO UPDATE
         SET auditor_id = EXCLUDED.auditor_id,
             auditor_nome = EXCLUDED.auditor_nome,
             auditor_email = EXCLUDED.auditor_email,
             status = 'em_auditoria',
             assumido_at = NOW(),
             concluida_at = NULL,
             resultado = NULL,
             updated_at = NOW()
         WHERE presales_auditorias.status <> 'em_auditoria'
            OR presales_auditorias.auditor_id = EXCLUDED.auditor_id
       RETURNING erp_pedido_id, auditor_id, auditor_nome, auditor_email, assumido_at`,
      [erpPedidoId, agent.id, agent.name, agent.email]
    );

    if (r.rows[0]) {
      return res.json({ lock: shapeLock(r.rows[0], req.user.id) });
    }

    // Conflito: outro auditor já está com a trava ativa.
    const cur = await query(
      `SELECT erp_pedido_id, auditor_id, auditor_nome, auditor_email, assumido_at
         FROM presales_auditorias
        WHERE erp_pedido_id = $1 AND status = 'em_auditoria'`,
      [erpPedidoId]
    );
    const lock = shapeLock(cur.rows[0], req.user.id);
    return res.status(409).json({
      error: lock?.auditor_nome
        ? `Este orçamento já está em auditoria por ${lock.auditor_nome}.`
        : 'Este orçamento já está em auditoria por outro auditor.',
      lock,
    });
  } catch (e) {
    console.error('[presales-ajustes] locks/assumir error:', e.message);
    return res.status(500).json({ error: 'Falha ao assumir a auditoria.' });
  }
});

// POST /locks/:erpPedidoId/concluir — conclui a auditoria e libera a trava. Só o auditor
// dono da trava ativa pode concluir. Acionado pelo botão "Aprovar" do modal.
router.post('/locks/:erpPedidoId/concluir', authMiddleware, async (req, res) => {
  try {
    const { eligible, agent } = await resolveAuditor(req);
    if (!eligible) return res.status(403).json({ error: 'Acesso restrito à auditoria da Fila Pré Vendas.' });

    const erpPedidoId = Number(req.params.erpPedidoId);
    if (!Number.isInteger(erpPedidoId) || erpPedidoId <= 0) {
      return res.status(400).json({ error: 'erp_pedido_id inválido.' });
    }
    // APROVAÇÃO não passa por aqui: use POST /aprovacoes/:erpPedidoId, que valida os
    // documentos obrigatórios no servidor. Este endpoint apenas libera a trava sem
    // registrar aprovação (evita burlar o checklist por chamada direta/cliente antigo).
    const resultado = String(req.body?.resultado || 'liberada').slice(0, 20);
    if (resultado === 'aprovado') {
      return res.status(400).json({
        error: 'A aprovação do pré-venda deve ser feita por POST /presales-ajustes/aprovacoes/:erpPedidoId (com validação dos documentos obrigatórios).',
      });
    }

    const r = await query(
      `UPDATE presales_auditorias
          SET status = 'concluida', resultado = $3, concluida_at = NOW(), updated_at = NOW()
        WHERE erp_pedido_id = $1 AND auditor_id = $2 AND status = 'em_auditoria'
        RETURNING erp_pedido_id`,
      [erpPedidoId, agent.id, resultado]
    );

    if (r.rows[0]) return res.json({ ok: true, lock: null });

    // Não era o dono (ou já não havia trava ativa): informa o estado atual.
    const cur = await query(
      `SELECT erp_pedido_id, auditor_id, auditor_nome, auditor_email, assumido_at
         FROM presales_auditorias
        WHERE erp_pedido_id = $1 AND status = 'em_auditoria'`,
      [erpPedidoId]
    );
    if (!cur.rows[0]) return res.json({ ok: true, lock: null });
    const lock = shapeLock(cur.rows[0], req.user.id);
    return res.status(409).json({
      error: lock?.auditor_nome
        ? `Apenas ${lock.auditor_nome}, que assumiu a auditoria, pode concluí-la.`
        : 'Apenas o auditor que assumiu pode concluir esta auditoria.',
      lock,
    });
  } catch (e) {
    console.error('[presales-ajustes] locks/concluir error:', e.message);
    return res.status(500).json({ error: 'Falha ao concluir a auditoria.' });
  }
});

// ----- Aprovação do pré-venda (SEM tocar o ERP) -----
// POST /aprovacoes/:erpPedidoId — aprova o orçamento no pré-venda e o encaminha à fila
// do Pós-Vendas. Registro 100% LOCAL: nada é escrito no ERP (a situação do pedido lá
// permanece como está). Regras impostas no servidor (não só na UI):
//   • só o auditor que detém a trava ativa pode aprovar;
//   • os documentos aplicáveis e os dados obrigatórios precisam estar completos.
// A aprovação grava a decisão na trilha (presales_auditorias: resultado 'aprovado',
// concluida_at, auditor) e libera a trava automaticamente (status 'concluida').
router.post('/aprovacoes/:erpPedidoId', authMiddleware, async (req, res) => {
  let client = null;
  try {
    const { eligible, agent } = await resolveAuditor(req);
    if (!eligible) return res.status(403).json({ error: 'Acesso restrito à auditoria da Fila Pré Vendas.' });

    const erpPedidoId = Number(req.params.erpPedidoId);
    if (!Number.isInteger(erpPedidoId) || erpPedidoId <= 0) {
      return res.status(400).json({ error: 'erp_pedido_id inválido.' });
    }

    client = await pool.connect();
    await client.query('BEGIN');

    // Serializa a conclusão com mudanças na trava e mantém os anexos/decisão
    // lidos abaixo estáveis até o commit da aprovação.
    const lockRes = await client.query(
      `SELECT erp_pedido_id, auditor_id, auditor_nome, auditor_email, assumido_at
         FROM presales_auditorias
         WHERE erp_pedido_id = $1 AND status = 'em_auditoria'
         FOR UPDATE`,
      [erpPedidoId]
    );
    const activeLock = lockRes.rows[0];
    if (!activeLock) {
      throw approvalHttpError(409, {
        error: 'Assuma a auditoria deste orçamento antes de aprová-lo.',
        lock: null,
      });
    }
    if (String(activeLock.auditor_id) !== String(agent.id)) {
      throw approvalHttpError(409, {
        error: activeLock.auditor_nome
          ? `Este orçamento está em auditoria por ${activeLock.auditor_nome}. Somente o auditor responsável pode aprovar.`
          : 'Este orçamento está em auditoria por outro auditor.',
        lock: shapeLock(activeLock, req.user.id),
      });
    }

    const orcRes = await client.query(
      `SELECT erp_pedido_id, cliente_nome, cliente_cpf, adesao_zero
         FROM bomflow_orcamentos
        WHERE erp_pedido_id = $1
        FOR UPDATE`,
      [erpPedidoId]
    );
    const orcamento = orcRes.rows[0];
    if (!orcamento) {
      throw approvalHttpError(404, {
        error: 'Orçamento não encontrado no rastreio do Bom Flow.',
      });
    }

    // A aprovação precisa validar a mesma fonte usada pelo modal. Se o ERP não
    // responder, falhamos fechado em vez de aprovar sem conferir os campos.
    let detalhe;
    try {
      detalhe = await getOrcamentoDetalhe(erpPedidoId);
    } catch (detailError) {
      console.error('[presales-ajustes] detalhe ERP indisponível na aprovação:', detailError.message);
      throw approvalHttpError(503, {
        error: 'Não foi possível validar os dados obrigatórios do orçamento no ERP. Tente novamente.',
        code: 'erp_detalhe_indisponivel',
      });
    }

    const docsRes = await client.query(
      `SELECT tipo FROM orcamento_documentos
        WHERE erp_pedido_id = $1
        FOR UPDATE`,
      [erpPedidoId]
    );
    const anexados = new Set(docsRes.rows.map((r) => r.tipo));
    const validation = getApprovalPending({
      orcamento,
      detalhe,
      documentTypes: anexados,
    });
    if (validation.pending.length > 0) {
      const pendingText = validation.pending.map(({ label }) => label).join(', ');
      throw approvalHttpError(422, {
        error: `Não é possível aprovar: pendências encontradas (${pendingText}).`,
        pending: validation.pending,
        missing_fields: validation.missingFields.map(({ key }) => key),
        missing_docs: validation.missingDocs.map(({ tipo }) => tipo),
      });
    }

    // Registra a decisão e libera a trava — atômico e restrito ao dono da trava.
    const upd = await client.query(
      `UPDATE presales_auditorias
          SET status = 'concluida', resultado = 'aprovado', concluida_at = NOW(), updated_at = NOW()
        WHERE erp_pedido_id = $1 AND auditor_id = $2 AND status = 'em_auditoria'
        RETURNING erp_pedido_id, auditor_nome, concluida_at`,
      [erpPedidoId, agent.id]
    );
    if (!upd.rows[0]) {
      throw approvalHttpError(409, {
        error: 'A trava mudou durante a aprovação. Recarregue e tente novamente.',
      });
    }

    await client.query('COMMIT');
    return res.json({
      ok: true,
      lock: null,
      aprovacao: {
        erp_pedido_id: erpPedidoId,
        auditor_nome: upd.rows[0].auditor_nome,
        aprovado_at: upd.rows[0].concluida_at,
      },
    });
  } catch (e) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    if (e.approvalStatus) {
      return res.status(e.approvalStatus).json(e.approvalBody);
    }
    console.error('[presales-ajustes] aprovacoes error:', e.message);
    return res.status(500).json({ error: 'Falha ao aprovar o orçamento.' });
  } finally {
    client?.release();
  }
});

// GET /pos-vendas — fila de ENTRADA do Pós-Vendas: orçamentos aprovados no pré-venda
// (quem aprovou e quando), com os dados de rastreio do Bom Flow. Read-only; base da
// fase 2 do módulo. Mesma elegibilidade da Fila Pré Vendas.
router.get('/pos-vendas', authMiddleware, async (req, res) => {
  try {
    const { eligible } = await resolveAuditor(req);
    if (!eligible) return res.status(403).json({ error: 'Acesso restrito à auditoria da Fila Pré Vendas.' });

    const startDate = req.query.start_date ? String(req.query.start_date) : null;
    const endDate = req.query.end_date ? String(req.query.end_date) : null;
    const dateError = validateDateRange(startDate, endDate);
    if (dateError) return res.status(400).json({ error: dateError });

    const params = [];
    const conditions = ["pa.status = 'concluida'", "pa.resultado = 'aprovado'"];
    if (startDate) {
      params.push(startDate);
      conditions.push(`COALESCE(pa.concluida_at, bo.created_at) >= $${params.length}::date`);
    }
    if (endDate) {
      params.push(endDate);
      conditions.push(`COALESCE(pa.concluida_at, bo.created_at) < ($${params.length}::date + interval '1 day')`);
    }

    const result = await query(
      `SELECT pa.erp_pedido_id, pa.auditor_nome, pa.auditor_email, pa.concluida_at AS aprovado_at,
              bo.erp_numero, bo.modulo, bo.agent_name AS vendedor_nome,
              bo.cliente_nome, bo.cliente_cpf, bo.valor_criacao, bo.created_at AS orcamento_criado_at,
              COALESCE(pa.concluida_at, bo.created_at) AS data_fila
         FROM presales_auditorias pa
         LEFT JOIN bomflow_orcamentos bo ON bo.erp_pedido_id = pa.erp_pedido_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY COALESCE(pa.concluida_at, bo.created_at) DESC`,
      params
    );

    const enrichedRows = await enrichPostsalesClientIdentities(result.rows, {
      context: 'GET /presales-ajustes/pos-vendas',
    });
    const items = enrichedRows.map((r) => ({
      ...r,
      modulo_nome: MODULO_LABELS[
        { sales: 'vendas_pf', sales_pj: 'vendas_pj', sales_upsell: 'upsell', referral: 'indicacoes' }[r.modulo]
      ] || r.modulo || '-',
    }));

    return res.json({ items, count: items.length });
  } catch (e) {
    console.error('[presales-ajustes] GET /pos-vendas error:', e.message);
    return res.status(500).json({ error: 'Falha ao carregar a fila do Pós-Vendas.' });
  }
});

// GET /monitor — painel admin/auditoria: lista os ajustes com prazo final calculado,
// situação do aviso antecipado (aviso_prazo_info) e do cancelamento/simulação
// (cancelamento_info). Read-only; não toca no ERP. Respeita a mesma elegibilidade da
// Fila Pré Vendas (admin / auditoria / supervisor do time Auditoria).
router.get('/monitor', authMiddleware, async (req, res) => {
  try {
    const { eligible } = await resolveAuditor(req);
    if (!eligible) {
      return res.status(403).json({ error: 'Acesso restrito à auditoria da Fila Pré Vendas.' });
    }

    const status = req.query.status;
    const params = [];
    let where = '';
    if (status && status !== 'todos') {
      params.push(status);
      where = `WHERE status = $${params.length}`;
    }

    const result = await query(
      `SELECT id, erp_pedido_id, erp_numero, modulo, vendedor_id, vendedor_nome,
              cliente_nome, cliente_cpf, texto, status, auditor_nome, auditor_email,
              created_at, ajustado_at, cancelado_at, vendedor_comentario,
              aviso_prazo_info, cancelamento_info
         FROM presales_ajustes ${where}
        ORDER BY (status = 'pendente') DESC, created_at ASC`,
      params
    );

    const cfg = readAutocancelConfig();
    const todayYmd = brtDateStr();

    // Pré-carrega feriados de todos os anos envolvidos para acelerar os cálculos por item.
    // Se a API de feriados estiver indisponível, segue sem prazo calculado (read-only).
    let holidaysOk = true;
    try {
      const currentYear = Number(todayYmd.slice(0, 4));
      const years = new Set([currentYear, currentYear + 1]);
      for (const r of result.rows) {
        const y = Number(brtDateStr(r.created_at).slice(0, 4));
        if (Number.isInteger(y)) { years.add(y); years.add(y + 1); }
      }
      await preloadHolidays([...years]);
    } catch (e) {
      holidaysOk = false;
      console.warn('[presales-ajustes] GET /monitor: feriados indisponíveis; prazos não calculados.', e.message);
    }

    const items = [];
    for (const r of result.rows) {
      const startYmd = brtDateStr(r.created_at);
      let deadlineYmd = null;
      let diasUteisRestantes = null;
      let overdue = null;

      if (holidaysOk) {
        try {
          deadlineYmd = await addBusinessDays(startYmd, cfg.deadlineDays);
          overdue = todayYmd > deadlineYmd;
          // Quantos dias úteis faltam para o prazo final (0 = vence hoje; negativo = vencido).
          if (overdue) {
            diasUteisRestantes = -1; // marcador de "já venceu"
          } else {
            for (let n = 0; n <= cfg.deadlineDays; n++) {
              const target = n === 0 ? todayYmd : await addBusinessDays(todayYmd, n);
              if (target === deadlineYmd) { diasUteisRestantes = n; break; }
              if (target > deadlineYmd) { diasUteisRestantes = 0; break; }
            }
          }
        } catch {
          deadlineYmd = null;
        }
      }

      items.push({
        ...r,
        modulo_nome: MODULO_LABELS[r.modulo] || r.modulo || '-',
        start_ymd: startYmd,
        deadline_ymd: deadlineYmd,
        today_ymd: todayYmd,
        overdue,
        dias_uteis_restantes: diasUteisRestantes,
        avisado: !!r.aviso_prazo_info,
        cancelamento_registrado: !!r.cancelamento_info,
      });
    }

    const counts = {
      pendente: result.rows.filter((r) => r.status === 'pendente').length,
      ajustado: result.rows.filter((r) => r.status === 'ajustado').length,
      cancelado_auto: result.rows.filter((r) => r.status === 'cancelado_auto').length,
      todos: result.rows.length,
    };

    return res.json({
      items,
      counts,
      config: cfg,
      holidaysOk,
      today_ymd: todayYmd,
    });
  } catch (e) {
    console.error('[presales-ajustes] GET /monitor error:', e.message);
    return res.status(500).json({ error: 'Falha ao carregar o painel de ajustes.' });
  }
});

// GET /runs — histórico das últimas execuções dos jobs de ajuste (aviso/cancelamento),
// tanto do cron quanto do disparo manual. Mesma elegibilidade do GET /monitor.
router.get('/runs', authMiddleware, async (req, res) => {
  try {
    const { eligible } = await resolveAuditor(req);
    if (!eligible) {
      return res.status(403).json({ error: 'Acesso restrito à auditoria da Fila Pré Vendas.' });
    }

    const rawLimit = Number(req.query.limit);
    let limit = 20;
    if (Number.isInteger(rawLimit) && rawLimit > 0) limit = Math.min(rawLimit, 100);

    const tipo = req.query.tipo;
    const params = [];
    let where = '';
    if (tipo === 'aviso' || tipo === 'cancel') {
      params.push(tipo);
      where = `WHERE tipo = $${params.length}`;
    }
    params.push(limit);

    const result = await query(
      `SELECT id, executed_at, tipo, dry_run, checked, overdue, warned,
              cancelled, simulated, skipped, errors, aborted, abort_reason
         FROM presales_ajustes_runs ${where}
        ORDER BY executed_at DESC
        LIMIT $${params.length}`,
      params
    );

    return res.json({ items: result.rows });
  } catch (e) {
    console.error('[presales-ajustes] GET /runs error:', e.message);
    return res.status(500).json({ error: 'Falha ao carregar o histórico de execuções.' });
  }
});

// GET /mine — vendedor logado lista somente os ajustes das próprias vendas.
router.get('/mine', authMiddleware, async (req, res) => {
  try {
    const status = req.query.status;
    const params = [req.user.id];
    let where = 'WHERE vendedor_id = $1';
    if (status && status !== 'todos') {
      params.push(status);
      where += ` AND status = $${params.length}`;
    }
    const result = await query(
      `SELECT * FROM presales_ajustes ${where} ORDER BY created_at DESC`,
      params
    );
    const items = result.rows.map((r) => ({
      ...r,
      modulo_nome: MODULO_LABELS[r.modulo] || r.modulo || '-',
    }));
    return res.json({
      items: items.map((item) => ({
        ...item,
        tipo_ajuste: normalizePresalesAdjustmentType(item.tipo_ajuste, item.texto),
      })),
    });
  } catch (e) {
    console.error('[presales-ajustes] GET /mine error:', e.message);
    return res.status(500).json({ error: 'Falha ao carregar seus ajustes.' });
  }
});

// GET /by-pedido/:pedidoId — ajustes de um orçamento (lado auditor, dentro do modal).
router.get('/by-pedido/:pedidoId', authMiddleware, async (req, res) => {
  try {
    const { eligible } = await resolveAuditor(req);
    if (!eligible) {
      return res.status(403).json({ error: 'Acesso restrito à auditoria da Fila Pré Vendas.' });
    }
    const pedidoId = Number(req.params.pedidoId);
    if (!pedidoId) return res.status(400).json({ error: 'pedidoId inválido.' });
    const result = await query(
      `SELECT * FROM presales_ajustes WHERE erp_pedido_id = $1 ORDER BY created_at DESC`,
      [pedidoId]
    );
    return res.json({
      items: result.rows.map((item) => ({
        ...item,
        tipo_ajuste: normalizePresalesAdjustmentType(item.tipo_ajuste, item.texto),
      })),
    });
  } catch (e) {
    console.error('[presales-ajustes] GET /by-pedido error:', e.message);
    return res.status(500).json({ error: 'Falha ao carregar os ajustes do orçamento.' });
  }
});

async function loadSellerAdjustment(id, userId) {
  const result = await query(`SELECT * FROM presales_ajustes WHERE id = $1`, [id]);
  return assertSellerOwnsPresalesAdjustment(result.rows[0], userId);
}

router.get('/cidades', authMiddleware, async (req, res) => {
  try {
    const items = await listPresalesCities(getErpPool(), req.query.search, req.query.limit);
    return res.json({ items });
  } catch (error) {
    console.error('[presales-ajustes] GET /cidades error:', error.message);
    return res.status(500).json({ error: 'Falha ao consultar as cidades do ERP.' });
  }
});

// GET /:id/context — contexto autoritativo do ajuste e endereço atual do pedido no ERP.
router.get('/:id/context', authMiddleware, async (req, res) => {
  try {
    const ajuste = await loadSellerAdjustment(req.params.id, req.user.id);
    const tipoAjuste = normalizePresalesAdjustmentType(ajuste.tipo_ajuste, ajuste.texto);
    const erp = tipoAjuste === 'endereco'
      ? await getPresalesBudgetAddress(getErpPool(), Number(ajuste.erp_pedido_id))
      : { address: null };
    const relatedResult = await query(
      `SELECT id, texto, status, auditor_nome, vendedor_comentario, tipo_ajuste,
              created_at, ajustado_at
         FROM presales_ajustes
        WHERE erp_pedido_id = $1 AND vendedor_id = $2
        ORDER BY created_at ASC`,
      [ajuste.erp_pedido_id, req.user.id]
    );
    const related = relatedResult.rows.map((item) => ({
      ...item,
      tipo_ajuste: normalizePresalesAdjustmentType(item.tipo_ajuste, item.texto),
    }));

    if (erp.address) {
      const pending = await query(
        `SELECT id, dados_novos
           FROM presales_ajuste_correcoes
          WHERE ajuste_id = $1 AND tipo = 'endereco' AND status = 'pendente'
          ORDER BY created_at DESC`,
        [ajuste.id]
      );
      for (const row of pending.rows) {
        const intended = row.dados_novos || {};
        const sameAddress = presalesAddressesEqual(intended, erp.address);
        if (sameAddress) {
          await query(
            `UPDATE presales_ajuste_correcoes
                SET status = 'aplicada', applied_at = COALESCE(applied_at, NOW()),
                    reconciled_at = NOW()
              WHERE id = $1 AND status = 'pendente'`,
            [row.id]
          );
        }
      }
    }

    return res.json({
      ajuste: {
        id: ajuste.id,
        erp_pedido_id: Number(ajuste.erp_pedido_id),
        erp_numero: ajuste.erp_numero,
        texto: ajuste.texto,
        status: ajuste.status,
        tipo_ajuste: tipoAjuste,
      },
      ajustes: related,
      endereco: erp.address,
    });
  } catch (error) {
    console.error('[presales-ajustes] GET /:id/context error:', error.message);
    return res.status(error.statusCode || 500).json({
      error: error.statusCode ? error.message : 'Falha ao carregar os dados atuais do orçamento.',
    });
  }
});

// PATCH /:id/endereco — corrige somente o endereço do pedido vinculado ao ajuste.
router.patch('/:id/endereco', authMiddleware, async (req, res) => {
  try {
    const ajuste = await loadSellerAdjustment(req.params.id, req.user.id);
    if (ajuste.status !== 'pendente') {
      return res.status(409).json({ error: 'Este ajuste não está mais pendente.' });
    }
    assertAddressAdjustmentType(ajuste);
    const result = await withPresalesAdjustmentLock(pool, ajuste.id, () =>
      applyPresalesAddressCorrection({
        localQuery: query,
        erpDb: getErpPool(),
        ajuste,
        vendedorId: req.user.id,
        input: req.body || {},
      }));
    if (result.auditPending) {
      console.error(
        '[presales-ajustes] endereço aplicado no ERP; trilha será reconciliada:',
        result.auditError?.message
      );
    }
    return res.status(result.auditPending ? 202 : 200).json({
      endereco: result.address,
      reconciliacao_pendente: result.auditPending,
      reconciliado: result.reconciled,
      ja_aplicado: result.alreadyApplied,
    });
  } catch (error) {
    console.error('[presales-ajustes] PATCH /:id/endereco error:', error.message);
    return res.status(error.statusCode || 500).json({
      error: error.statusCode ? error.message : 'Falha ao atualizar o endereço do orçamento no ERP.',
      fields: error.fields || undefined,
    });
  }
});

// GET /:id/correcao — abre o pedido ERP exato para ajustes de cadastro completo.
router.get('/:id/correcao', authMiddleware, async (req, res) => {
  try {
    const ajuste = await loadSellerAdjustment(req.params.id, req.user.id);
    assertPendingPresalesAdjustment(ajuste);
    const tipoAjuste = normalizePresalesAdjustmentType(ajuste.tipo_ajuste, ajuste.texto);
    if (tipoAjuste !== 'cadastro') {
      return res.status(422).json({
        error: 'Este ajuste deve ser tratado no endereço do orçamento.',
      });
    }
    const context = await getPostsalesCorrectionContext(
      getErpPool(),
      Number(ajuste.erp_pedido_id),
      null
    );
    return res.json({
      erp_pedido_id: Number(ajuste.erp_pedido_id),
      motivo_nome: 'Cadastro completo da venda',
      observacao: ajuste.texto,
      ...context,
    });
  } catch (error) {
    console.error('[presales-ajustes] GET /:id/correcao error:', error.message);
    return res.status(error.statusCode || 500).json({
      error: error.statusCode ? error.message : 'Falha ao carregar o pedido no ERP.',
    });
  }
});

// PATCH /:id/correcao — grava o editor completo somente no pedido ERP do ajuste.
router.patch('/:id/correcao', authMiddleware, async (req, res) => {
  try {
    const result = await withPresalesAdjustmentLock(pool, req.params.id, async () => {
      const ajuste = await loadSellerAdjustment(req.params.id, req.user.id);
      assertPendingPresalesAdjustment(ajuste);
      const tipoAjuste = normalizePresalesAdjustmentType(ajuste.tipo_ajuste, ajuste.texto);
      if (tipoAjuste !== 'cadastro') {
        const error = new Error('Este ajuste deve ser tratado no endereço do orçamento.');
        error.statusCode = 422;
        throw error;
      }
      return applyPostsalesCompleteCorrection({
        localQuery: query,
        erpDb: getErpPool(),
        verification: {
          id: ajuste.id,
          erp_pedido_id: Number(ajuste.erp_pedido_id),
          motivo_devolucao: null,
        },
        actor: {
          id: req.user.id,
          name: req.user.full_name || req.user.email || 'Vendedor',
        },
        input: req.body || {},
        auditKind: 'presales',
      });
    });
    return res.json({
      tipo: result.tipo,
      alterado: result.changed,
      ja_aplicado: result.alreadyApplied,
      editor: result.editor,
    });
  } catch (error) {
    console.error('[presales-ajustes] PATCH /:id/correcao error:', error.message);
    return res.status(error.statusCode || 500).json({
      error: error.statusCode ? error.message : 'Falha ao atualizar o pedido no ERP.',
      fields: error.fields || undefined,
    });
  }
});

// GET /:id/lead — localiza o lead do cliente do orçamento para abrir a tela de detalhe.
router.get('/:id/lead', authMiddleware, async (req, res) => {
  try {
    const id = req.params.id;
    const ajusteRes = await query(`SELECT * FROM presales_ajustes WHERE id = $1`, [id]);
    const ajuste = ajusteRes.rows[0];
    if (!ajuste) return res.status(404).json({ error: 'Ajuste não encontrado.' });
    // Apenas o vendedor dono abre o lead da própria venda para fazer os ajustes.
    // O auditor não precisa acessar os dados do lead.
    if (String(ajuste.vendedor_id) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Você só pode abrir os leads das suas próprias vendas.' });
    }
    // 1) Vínculo direto e confiável: bomflow_orcamentos.lead_id. Orçamentos criados
    // dentro do Bom Flow guardam o lead de origem; usar esse id é mais seguro do que
    // casar por CPF (que pode estar vazio/diferente no cadastro do lead).
    const orcRes = await query(
      `SELECT modulo, lead_id FROM bomflow_orcamentos WHERE erp_pedido_id = $1`,
      [ajuste.erp_pedido_id]
    );
    const orc = orcRes.rows[0];
    if (orc && orc.lead_id) {
      const mod = orc.modulo || ajuste.modulo;
      const m = MODULO_LEAD_MAP[mod];
      if (m) {
        const r = await query(`SELECT id FROM ${m.table} WHERE id = $1 LIMIT 1`, [orc.lead_id]);
        if (r.rows[0]) {
          return res.json({ page: m.page, lead_id: r.rows[0].id, modulo: mod });
        }
      }
    }

    // 2) Fallback por CPF/CNPJ (orçamentos sem lead_id vinculado).
    const map = MODULO_LEAD_MAP[ajuste.modulo];
    if (!map) {
      return res.status(422).json({ error: 'Módulo do orçamento não suporta abertura de lead.' });
    }
    const cpfDigits = String(ajuste.cliente_cpf || '').replace(/\D/g, '');
    if (!cpfDigits) {
      return res.status(404).json({ error: 'Orçamento sem documento do cliente para localizar o lead.' });
    }
    // Compatibilidade para registros antigos sem lead_id: procura apenas no módulo
    // original e só navega quando o documento identifica um único cadastro.
    const candidates = await query(
      `SELECT id FROM ${map.table}
        WHERE regexp_replace(COALESCE(${map.cpfCol}, ''), '[^0-9]', '', 'g') = $1
        ORDER BY created_at DESC
        LIMIT 2`,
      [cpfDigits]
    );
    if (candidates.rows.length === 0) {
      return res.status(404).json({ error: 'Lead do cliente não encontrado.' });
    }
    if (candidates.rows.length > 1) {
      return res.status(409).json({
        error: 'Há mais de um cadastro deste cliente. Abra a venda pela fila de origem para evitar editar o cadastro errado.',
      });
    }
    return res.json({
      page: map.page,
      lead_id: candidates.rows[0].id,
      modulo: ajuste.modulo,
    });
  } catch (e) {
    console.error('[presales-ajustes] GET /:id/lead error:', e.message);
    return res.status(500).json({ error: 'Falha ao localizar o lead do cliente.' });
  }
});

// POST /:id/ajustado — vendedor marca como ajustado; volta para a fila do auditor.
router.post('/:id/ajustado', authMiddleware, async (req, res) => {
  try {
    const id = req.params.id;
    const comentario = String(req.body?.comentario || '').trim() || null;

    const ajusteRes = await query(`SELECT * FROM presales_ajustes WHERE id = $1`, [id]);
    const ajuste = ajusteRes.rows[0];
    if (!ajuste) return res.status(404).json({ error: 'Ajuste não encontrado.' });
    if (String(ajuste.vendedor_id) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Você só pode atualizar os ajustes das suas próprias vendas.' });
    }
    if (ajuste.status === 'ajustado') {
      return res.json({ ajuste });
    }

    const updRes = await query(
      `UPDATE presales_ajustes
          SET status = 'ajustado', ajustado_at = NOW(), vendedor_comentario = $2
        WHERE id = $1
        RETURNING *`,
      [id, comentario]
    );
    const updated = updRes.rows[0];

    // Devolve para o mesmo auditor que solicitou.
    const numero = ajuste.erp_numero || ajuste.erp_pedido_id;
    if (ajuste.auditor_email) {
      await createNotification({
        userEmail: ajuste.auditor_email,
        type: 'presales_ajuste',
        title: 'Orçamento ajustado — reauditar',
        message: `${ajuste.vendedor_nome || 'O vendedor'} ajustou o orçamento Nº ${numero}${ajuste.cliente_nome ? ` (${ajuste.cliente_nome})` : ''}. Disponível na Fila Pré Vendas.`,
        link: '/PreSalesOrcamentoRelatorio',
        entityType: 'presales_ajuste',
        entityId: ajuste.id,
        priority: 'high',
      });
    }

    return res.json({ ajuste: updated });
  } catch (e) {
    console.error('[presales-ajustes] POST /:id/ajustado error:', e.message);
    return res.status(500).json({ error: 'Falha ao marcar como ajustado.' });
  }
});

export default router;
