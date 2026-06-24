import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { query } from '../config/database.js';
import { createNotification } from '../services/notificationService.js';

const router = express.Router();

const MODULO_LABELS = {
  vendas_pf: 'Vendas PF',
  vendas_pj: 'Vendas PJ',
  upsell: 'Upsell',
  indicacoes: 'Indicações',
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
