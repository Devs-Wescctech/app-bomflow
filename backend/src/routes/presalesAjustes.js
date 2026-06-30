import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { query } from '../config/database.js';
import { createNotification } from '../services/notificationService.js';
import { addBusinessDays, brtDateStr, preloadHolidays } from '../services/businessDaysService.js';

const router = express.Router();

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

    const insertRes = await query(
      `INSERT INTO presales_ajustes
         (erp_pedido_id, erp_numero, modulo, vendedor_id, vendedor_nome,
          cliente_nome, cliente_cpf, texto, status, auditor_id, auditor_nome, auditor_email)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pendente',$9,$10,$11)
       RETURNING *`,
      [
        orc.erp_pedido_id, orc.erp_numero, orc.modulo, orc.agent_id, orc.agent_name,
        orc.cliente_nome, orc.cliente_cpf, texto, agent.id, agent.name, agent.email,
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
          link: '/PreSalesAjustes',
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
        link: '/PreSalesAjustes',
        entityType: 'presales_ajuste',
        entityId: ajuste.id,
        priority: 'normal',
      });
    }

    return res.json({ ajuste });
  } catch (e) {
    console.error('[presales-ajustes] POST error:', e.message);
    return res.status(500).json({ error: 'Falha ao registrar o pedido de ajuste.' });
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
    return res.json({ items });
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
    return res.json({ items: result.rows });
  } catch (e) {
    console.error('[presales-ajustes] GET /by-pedido error:', e.message);
    return res.status(500).json({ error: 'Falha ao carregar os ajustes do orçamento.' });
  }
});

// GET /:id/lead — localiza o lead do cliente do orçamento para abrir a tela de detalhe.
router.get('/:id/lead', authMiddleware, async (req, res) => {
  try {
    const id = req.params.id;
    const ajusteRes = await query(`SELECT * FROM presales_ajustes WHERE id = $1`, [id]);
    const ajuste = ajusteRes.rows[0];
    if (!ajuste) return res.status(404).json({ error: 'Ajuste não encontrado.' });
    // O vendedor dono pode abrir o lead da própria venda; admin/auditoria (mesma
    // elegibilidade da Fila Pré Vendas) também podem abrir para investigar.
    const isOwner = ajuste.vendedor_id === req.user.id;
    if (!isOwner) {
      const { eligible } = await resolveAuditor(req);
      if (!eligible) {
        return res.status(403).json({ error: 'Você só pode abrir os leads das suas próprias vendas.' });
      }
    }
    const map = MODULO_LEAD_MAP[ajuste.modulo];
    if (!map) {
      return res.status(422).json({ error: 'Módulo do orçamento não suporta abertura de lead.' });
    }
    const cpfDigits = String(ajuste.cliente_cpf || '').replace(/\D/g, '');
    if (!cpfDigits) {
      return res.status(404).json({ error: 'Orçamento sem documento do cliente para localizar o lead.' });
    }
    // Tenta primeiro na tabela do módulo do orçamento; se não achar,
    // percorre os demais módulos em ordem de prioridade (fallback).
    const ALL_MODULOS = ['sales', 'sales_upsell', 'referral', 'sales_pj'];
    const searchOrder = [
      ajuste.modulo,
      ...ALL_MODULOS.filter((m) => m !== ajuste.modulo),
    ];

    let found = null;
    for (const mod of searchOrder) {
      const m = MODULO_LEAD_MAP[mod];
      if (!m) continue;
      const r = await query(
        `SELECT id FROM ${m.table}
          WHERE regexp_replace(COALESCE(${m.cpfCol}, ''), '[^0-9]', '', 'g') = $1
          ORDER BY created_at DESC
          LIMIT 1`,
        [cpfDigits]
      );
      if (r.rows[0]) {
        found = { page: m.page, lead_id: r.rows[0].id, modulo: mod };
        break;
      }
    }

    if (!found) {
      return res.status(404).json({ error: 'Lead do cliente não encontrado.' });
    }
    return res.json(found);
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
    if (ajuste.vendedor_id !== req.user.id) {
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
