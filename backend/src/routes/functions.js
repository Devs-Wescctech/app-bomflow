import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import nodemailer from 'nodemailer';
import { query } from '../config/database.js';
import { authMiddleware, optionalAuth } from '../middleware/auth.js';
import { loadAgentMiddleware, requirePermission, requireRole } from '../middleware/permissions.js';
import { assignTicket, distributeUnassignedTickets, DISTRIBUTION_ALGORITHMS } from '../services/ticketDistribution.js';
import { checkAllSLAWarnings, checkSLABreach, recordFirstResponse, recordStatusChange } from '../services/slaService.js';
import { runAllAutomations, runAutomationsForLead } from '../services/leadAutomation.js';
import { generateProposalPDF } from '../services/pdfService.js';
import { sendWhatsAppMessage, sendDocument, sendTextMessage } from '../services/whatsappService.js';
import { v4 as uuidv4 } from 'uuid';
import { enqueueLeads, processQueue, retryFailed, getQueueStatus, getDashboardMetrics, getLogsWithPagination, normalizePhone, checkConversions, getConversionMetrics, getConversionsList } from '../services/whatsappQueueService.js';
import { getAgentByErpId, getErpAgentMap, resolveAgentFromErp } from '../services/erpIntegrationService.js';
import OpenAI from 'openai';
import FormData from 'form-data';
import axios from 'axios';
import https from 'https';

const router = Router();

const AUTENTIQUE_API_URL = 'https://api.autentique.com.br/v2/graphql';

router.post('/portal-auth', async (req, res) => {
  try {
    const { document, phone } = req.body;
    
    const result = await query(
      'SELECT * FROM contacts WHERE document = $1 OR phone = $2 OR whatsapp = $2',
      [document, phone]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Contact not found' });
    }
    
    const contact = result.rows[0];
    const token = uuidv4();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    
    await query(
      'INSERT INTO portal_sessions (contact_id, token, expires_at) VALUES ($1, $2, $3)',
      [contact.id, token, expiresAt]
    );
    
    res.json({ success: true, token, contact });
  } catch (error) {
    console.error('Error in portal auth:', error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/validate-token', async (req, res) => {
  try {
    const { token } = req.body;
    
    const result = await query(
      `SELECT ps.*, c.* FROM portal_sessions ps 
       JOIN contacts c ON ps.contact_id = c.id 
       WHERE ps.token = $1 AND ps.expires_at > NOW()`,
      [token]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ valid: false, message: 'Invalid or expired token' });
    }
    
    res.json({ valid: true, contact: result.rows[0] });
  } catch (error) {
    console.error('Error validating token:', error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/assign-ticket-round-robin', authMiddleware, loadAgentMiddleware, async (req, res) => {
  try {
    const { ticket_id, queue_id, algorithm } = req.body;
    
    const result = await assignTicket(ticket_id, queue_id, algorithm);
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    res.json(result);
  } catch (error) {
    console.error('Error assigning ticket:', error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/distribute-tickets', authMiddleware, loadAgentMiddleware, requireRole('admin', 'supervisor'), async (req, res) => {
  try {
    const results = await distributeUnassignedTickets();
    res.json({ 
      success: true, 
      distributed: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      details: results 
    });
  } catch (error) {
    console.error('Error distributing tickets:', error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/check-sla', authMiddleware, loadAgentMiddleware, async (req, res) => {
  try {
    const { ticket_id } = req.body;
    
    if (ticket_id) {
      const slaStatus = await checkSLABreach(ticket_id);
      return res.json(slaStatus);
    }
    
    const result = await checkAllSLAWarnings();
    res.json(result);
  } catch (error) {
    console.error('Error checking SLA:', error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/record-first-response', authMiddleware, loadAgentMiddleware, async (req, res) => {
  try {
    const { ticket_id } = req.body;
    const result = await recordFirstResponse(ticket_id);
    res.json(result);
  } catch (error) {
    console.error('Error recording first response:', error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/run-lead-automations', authMiddleware, loadAgentMiddleware, requireRole('admin', 'supervisor'), async (req, res) => {
  try {
    const { lead_id } = req.body;
    
    if (lead_id) {
      const result = await runAutomationsForLead(lead_id);
      return res.json(result);
    }
    
    const result = await runAllAutomations();
    res.json(result);
  } catch (error) {
    console.error('Error running automations:', error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/record-status-change', authMiddleware, loadAgentMiddleware, async (req, res) => {
  try {
    const { ticket_id, old_status, new_status } = req.body;
    await recordStatusChange(ticket_id, old_status, new_status, req.user?.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error recording status change:', error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/create-notification', authMiddleware, async (req, res) => {
  try {
    const { user_email, title, message, type, link } = req.body;
    
    const result = await query(
      'INSERT INTO notifications (user_email, title, message, type, link) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [user_email, title, message, type, link]
    );
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error creating notification:', error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/check-notifications', authMiddleware, async (req, res) => {
  try {
    const { user_email } = req.body;
    
    const result = await query(
      'SELECT * FROM notifications WHERE user_email = $1 AND read = false ORDER BY created_at DESC LIMIT 50',
      [user_email]
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error checking notifications:', error);
    res.status(500).json({ message: error.message });
  }
});

let leadGeneratorOptionsCache = { data: null, timestamp: 0 };
const CACHE_TTL = 10 * 60 * 1000;

async function fetchLeadGeneratorFromERP(queryParams = {}) {
  const erpAuthToken = process.env.ERP_AUTH_TOKEN;
  if (!erpAuthToken) {
    throw new Error('Credenciais do ERP não configuradas.');
  }

  const params = new URLSearchParams();
  const allowedParams = ['canal', 'cidade', 'uf', 'produto', 'situacao_contrato'];
  for (const key of allowedParams) {
    if (queryParams[key]) {
      params.set(key, queryParams[key]);
    }
  }

  const erpUrl = `http://erp.wescctech.com.br:8080/BOMPASTOR/api/API_BASE_LEADS${params.toString() ? '?' + params.toString() : ''}`;
  const authHeader = erpAuthToken.startsWith('Bearer ') ? erpAuthToken : `Bearer ${erpAuthToken}`;

  console.log(`[LeadGenerator] Fetching from ERP: ${erpUrl}`);

  const erpResponse = await fetch(erpUrl, {
    method: 'GET',
    headers: {
      'Authorization': authHeader,
      'Accept': 'application/json'
    }
  });

  if (!erpResponse.ok) {
    throw new Error(`ERP returned status ${erpResponse.status}`);
  }

  const data = await erpResponse.json();
  return Array.isArray(data) ? data : [];
}

const MIN_RECORDS_FOR_VALID_OPTIONS = 50;

router.get('/lead-generator-options', authMiddleware, async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    const now = Date.now();

    if (!forceRefresh && leadGeneratorOptionsCache.data && (now - leadGeneratorOptionsCache.timestamp) < CACHE_TTL) {
      console.log('[LeadGenerator] Returning cached filter options');
      return res.json(leadGeneratorOptionsCache.data);
    }

    const allData = await fetchLeadGeneratorFromERP();
    console.log(`[LeadGenerator] Loaded ${allData.length} records for filter options`);

    if (allData.length < MIN_RECORDS_FOR_VALID_OPTIONS) {
      console.warn(`[LeadGenerator] ERP returned only ${allData.length} records — too few, likely incomplete response. Skipping cache update.`);

      if (leadGeneratorOptionsCache.data) {
        console.log('[LeadGenerator] Returning stale cache instead of incomplete data');
        return res.json(leadGeneratorOptionsCache.data);
      }

      let retryData = [];
      for (let attempt = 1; attempt <= 2; attempt++) {
        console.log(`[LeadGenerator] Retry attempt ${attempt}...`);
        await new Promise(r => setTimeout(r, 2000));
        retryData = await fetchLeadGeneratorFromERP();
        console.log(`[LeadGenerator] Retry ${attempt} returned ${retryData.length} records`);
        if (retryData.length >= MIN_RECORDS_FOR_VALID_OPTIONS) break;
      }

      if (retryData.length >= MIN_RECORDS_FOR_VALID_OPTIONS) {
        const unique = (field) => [...new Set(retryData.map(d => d[field]).filter(Boolean))].sort();
        const options = {
          canal: unique('canal'),
          cidade: unique('cidade'),
          uf: unique('uf'),
          produto: unique('produto'),
          situacao_contrato: unique('situacao_contrato'),
        };
        leadGeneratorOptionsCache = { data: options, timestamp: now };
        return res.json(options);
      }

      const unique = (field) => [...new Set(allData.map(d => d[field]).filter(Boolean))].sort();
      return res.json({
        canal: unique('canal'),
        cidade: unique('cidade'),
        uf: unique('uf'),
        produto: unique('produto'),
        situacao_contrato: unique('situacao_contrato'),
        _partial: true,
        _recordCount: allData.length,
      });
    }

    const unique = (field) => [...new Set(allData.map(d => d[field]).filter(Boolean))].sort();

    const options = {
      canal: unique('canal'),
      cidade: unique('cidade'),
      uf: unique('uf'),
      produto: unique('produto'),
      situacao_contrato: unique('situacao_contrato'),
    };

    leadGeneratorOptionsCache = { data: options, timestamp: now };
    res.json(options);
  } catch (error) {
    console.error('Error fetching lead generator options:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/lead-generator-base', authMiddleware, async (req, res) => {
  try {
    const data = await fetchLeadGeneratorFromERP(req.query);
    console.log(`[LeadGenerator] Search returned ${data.length} leads`);
    res.json(data);
  } catch (error) {
    console.error('Error fetching lead generator base:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

const WHATSAPP_TEMPLATE_ID = '6878e30fed3085944b9841b1';

const DISPATCH_FORBIDDEN_TYPES = ['vendas', 'sales', 'bom_auto_atendente', 'support', 'collection', 'pre_sales', 'post_sales'];

async function getAgentForDispatchCheck(req) {
  const agentResult = await query('SELECT id, agent_type, team_id, email, name FROM agents WHERE id = $1', [req.user.id]);
  return agentResult.rows[0] || null;
}

async function logUnauthorizedAttempt(req, agent, action) {
  try {
    await query(
      `INSERT INTO gerador_leads_audit_log (user_id, user_email, agent_type, action, details, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        req.user?.id,
        req.user?.email || agent?.email,
        agent?.agent_type || 'unknown',
        action,
        JSON.stringify({ timestamp: new Date().toISOString(), path: req.originalUrl }),
        req.ip || req.headers['x-forwarded-for'] || null
      ]
    );
  } catch (err) {
    console.error('[WhatsAppQueue] Audit log error:', err.message);
  }
}

router.post('/lead-generator-whatsapp-send', authMiddleware, async (req, res) => {
  try {
    const agent = await getAgentForDispatchCheck(req);
    if (!agent || DISPATCH_FORBIDDEN_TYPES.includes(agent.agent_type)) {
      await logUnauthorizedAttempt(req, agent, 'whatsapp_dispatch_attempt');
      return res.status(403).json({ success: false, error: 'Você não tem permissão para realizar disparos de WhatsApp.' });
    }

    const { leads, filtersUsed } = req.body;
    const userId = req.user?.id || null;
    const userEmail = req.user?.email || agent?.email || null;
    const teamId = agent?.team_id || null;

    if (!Array.isArray(leads) || leads.length === 0) {
      return res.status(400).json({ success: false, error: 'Nenhum lead selecionado para envio.' });
    }

    if (leads.length > 1000) {
      return res.status(400).json({ success: false, error: 'Limite máximo de 1000 leads por disparo.' });
    }

    const batchId = uuidv4();

    console.log(`[WhatsAppQueue] Enqueuing batch ${batchId}: ${leads.length} leads by ${userEmail}`);

    const summary = await enqueueLeads({
      leads,
      userId,
      userEmail,
      teamId,
      templateId: WHATSAPP_TEMPLATE_ID,
      filtersUsed,
      batchId,
    });

    processQueue(batchId).catch(err => {
      console.error(`[WhatsAppQueue] Processing error for batch ${batchId}:`, err.message);
    });

    res.json({
      success: true,
      batchId,
      summary,
    });
  } catch (error) {
    console.error('[WhatsAppQueue] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/lead-generator-queue-status/:batchId', authMiddleware, async (req, res) => {
  try {
    const status = await getQueueStatus(req.params.batchId);
    res.json({ success: true, ...status });
  } catch (error) {
    console.error('[WhatsAppQueue] Status error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/lead-generator-whatsapp-retry', authMiddleware, async (req, res) => {
  try {
    const agent = await getAgentForDispatchCheck(req);
    if (!agent || DISPATCH_FORBIDDEN_TYPES.includes(agent.agent_type)) {
      await logUnauthorizedAttempt(req, agent, 'whatsapp_retry_attempt');
      return res.status(403).json({ success: false, error: 'Você não tem permissão para reenviar disparos.' });
    }

    const { batchId } = req.body;
    if (!batchId) {
      return res.status(400).json({ success: false, error: 'batchId é obrigatório.' });
    }

    const result = await retryFailed(batchId, req.user?.id, req.user?.email, agent?.team_id);

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[WhatsAppQueue] Retry error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/lead-generator-whatsapp-dashboard', authMiddleware, async (req, res) => {
  try {
    const agent = await getAgentForDispatchCheck(req);
    if (!agent || DISPATCH_FORBIDDEN_TYPES.includes(agent.agent_type)) {
      return res.status(403).json({ success: false, error: 'Sem permissão para acessar o painel de disparos.' });
    }

    const { from, to, userId: filterUserId, teamId: filterTeamId } = req.query;
    const metrics = await getDashboardMetrics({ from, to, userId: filterUserId, teamId: filterTeamId });

    res.json({ success: true, ...metrics });
  } catch (error) {
    console.error('[WhatsAppQueue] Dashboard error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

function stripPhoneTo55Local(phone) {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length >= 12) {
    return digits.slice(2);
  }
  return digits;
}

function parseBRCurrency(value) {
  if (value == null) return 0;
  const str = String(value).trim();
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(str)) {
    return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0;
  }
  return parseFloat(str) || 0;
}

router.get('/lead-generator-roi-metrics', authMiddleware, async (req, res) => {
  try {
    const agent = await getAgentForDispatchCheck(req);
    if (!agent || DISPATCH_FORBIDDEN_TYPES.includes(agent.agent_type)) {
      return res.status(403).json({ success: false, error: 'Sem permissão para acessar métricas ROI.' });
    }

    const { from, to, userId: filterUserId, teamId: filterTeamId } = req.query;

    const logConditions = [];
    const logParams = [];

    if (from) {
      logParams.push(from);
      logConditions.push(`sent_at >= $${logParams.length}::timestamp`);
    }
    if (to) {
      logParams.push(to);
      logConditions.push(`sent_at <= $${logParams.length}::timestamp`);
    }
    if (filterUserId) {
      logParams.push(filterUserId);
      logConditions.push(`user_id = $${logParams.length}`);
    }
    if (filterTeamId) {
      logParams.push(filterTeamId);
      logConditions.push(`team_id = $${logParams.length}`);
    }

    const logWhere = logConditions.length > 0 ? `WHERE ${logConditions.join(' AND ')}` : '';

    const totalDisparosResult = await query(
      `SELECT COUNT(*)::int as total FROM gerador_leads_whatsapp_logs ${logWhere}`,
      logParams
    );
    const totalDisparos = totalDisparosResult.rows[0]?.total || 0;

    const successConditions = [...logConditions, 'success = true'];
    const successWhere = `WHERE ${successConditions.join(' AND ')}`;

    const successResult = await query(
      `SELECT
         COUNT(*)::int as total,
         COUNT(DISTINCT lead_number)::int as leads_unicos
       FROM gerador_leads_whatsapp_logs ${successWhere}`,
      logParams
    );
    const disparosSucesso = successResult.rows[0]?.total || 0;
    const leadsDisparadosSucesso = successResult.rows[0]?.leads_unicos || 0;

    const dispatchedPhonesResult = await query(
      `SELECT lead_number, MIN(sent_at) as first_sent
       FROM gerador_leads_whatsapp_logs
       ${successWhere}
       GROUP BY lead_number`,
      logParams
    );

    const dispatchMap = new Map();
    for (const row of dispatchedPhonesResult.rows) {
      const normalized = stripPhoneTo55Local(row.lead_number);
      if (normalized) {
        dispatchMap.set(normalized, row.first_sent);
      }
    }

    const erpAuthToken = process.env.ERP_AUTH_TOKEN;
    if (!erpAuthToken) {
      return res.status(500).json({ success: false, error: 'ERP_AUTH_TOKEN não configurado.' });
    }

    const authHeader = erpAuthToken.startsWith('Bearer ') ? erpAuthToken : `Bearer ${erpAuthToken}`;
    const erpUrl = 'http://erp.wescctech.com.br:8080/BOMPASTOR/api/API_DADOS_VENDAS_INDICACOES';

    console.log(`[ROI Metrics] Fetching ERP sales data from API_DADOS_VENDAS_INDICACOES...`);
    const erpResponse = await fetch(erpUrl, {
      method: 'GET',
      headers: { 'Authorization': authHeader, 'Accept': 'application/json' }
    });

    if (!erpResponse.ok) {
      return res.status(502).json({ success: false, error: `ERP retornou status ${erpResponse.status}` });
    }

    const erpData = await erpResponse.json();
    const vendasERP = Array.isArray(erpData) ? erpData : [];
    console.log(`[ROI Metrics] ERP returned ${vendasERP.length} sales records`);

    const matchedContracts = new Set();
    const convertedPhones = new Set();
    let valorTotalVendas = 0;
    const conversoesPorDia = {};
    const valorPorDia = {};

    for (const venda of vendasERP) {
      const celIndicador = venda.cel_indicador ? String(venda.cel_indicador).replace(/\D/g, '') : '';
      if (!celIndicador) continue;

      const celNormalized = celIndicador.startsWith('55') && celIndicador.length >= 12
        ? celIndicador.slice(2)
        : celIndicador;

      const dispatchDate = dispatchMap.get(celNormalized);
      if (!dispatchDate) continue;

      const dataContrato = venda.data_contrato ? new Date(venda.data_contrato) : null;
      if (!dataContrato || isNaN(dataContrato.getTime())) continue;

      if (dataContrato < new Date(dispatchDate)) continue;

      const contratoId = venda.contrato_servicos || '';
      const contratoKey = contratoId
        ? `${celNormalized}_${contratoId}`
        : `${celNormalized}_${venda.cpf_indicado || ''}_${venda.data_contrato || ''}`;
      if (matchedContracts.has(contratoKey)) continue;
      matchedContracts.add(contratoKey);

      const valorContrato = parseBRCurrency(venda.valor_contrato);

      convertedPhones.add(celNormalized);
      valorTotalVendas += valorContrato;

      const diaKey = dataContrato.toISOString().split('T')[0];
      conversoesPorDia[diaKey] = (conversoesPorDia[diaKey] || 0) + 1;
      valorPorDia[diaKey] = (valorPorDia[diaKey] || 0) + valorContrato;
    }

    const conversoes = matchedContracts.size;
    const leadsConvertidos = convertedPhones.size;
    const taxaConversao = leadsDisparadosSucesso > 0 ? Number(((leadsConvertidos / leadsDisparadosSucesso) * 100).toFixed(2)) : 0;
    const roi = totalDisparos > 0 ? Number((valorTotalVendas / totalDisparos).toFixed(2)) : 0;

    const allDays = new Set([...Object.keys(conversoesPorDia), ...Object.keys(valorPorDia)]);
    const sortedDays = Array.from(allDays).sort();

    res.json({
      success: true,
      totals: {
        total_disparos: totalDisparos,
        disparos_sucesso: disparosSucesso,
        conversoes,
        leads_convertidos: leadsConvertidos,
        valor_total_vendas: valorTotalVendas,
        taxa_conversao: taxaConversao,
        roi
      },
      series: {
        conversoes_por_dia: sortedDays.map(dia => ({ dia, conversoes: conversoesPorDia[dia] || 0 })),
        valor_vendas_por_dia: sortedDays.map(dia => ({ dia, valor: valorPorDia[dia] || 0 }))
      }
    });
  } catch (error) {
    console.error('[ROI Metrics] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

async function executeMetricsAudit({ from, to, userId, teamId } = {}) {
  const logConditions = [];
  const logParams = [];
  if (from) { logParams.push(from); logConditions.push(`sent_at >= $${logParams.length}::timestamp`); }
  if (to) { logParams.push(to); logConditions.push(`sent_at <= $${logParams.length}::timestamp`); }
  if (userId) { logParams.push(userId); logConditions.push(`user_id = $${logParams.length}`); }
  if (teamId) { logParams.push(teamId); logConditions.push(`team_id = $${logParams.length}`); }

  const logWhere = logConditions.length > 0 ? `WHERE ${logConditions.join(' AND ')}` : '';
  const successConditions = [...logConditions, 'success = true'];
  const successWhere = `WHERE ${successConditions.join(' AND ')}`;

  const [totalResult, successCountResult, dispatchResult] = await Promise.all([
    query(`SELECT COUNT(*)::int as total FROM gerador_leads_whatsapp_logs ${logWhere}`, logParams),
    query(`SELECT COUNT(*)::int as total, COUNT(DISTINCT lead_number)::int as leads_unicos FROM gerador_leads_whatsapp_logs ${successWhere}`, logParams),
    query(`SELECT lead_number, MIN(sent_at) as first_sent FROM gerador_leads_whatsapp_logs ${successWhere} GROUP BY lead_number`, logParams),
  ]);

  const totalLeadsDisparados = totalResult.rows[0]?.total || 0;
  const totalLeadsSucesso = successCountResult.rows[0]?.total || 0;
  const leadsUnicosDisparados = successCountResult.rows[0]?.leads_unicos || 0;

  const dispatchMap = new Map();
  for (const row of dispatchResult.rows) {
    const normalized = stripPhoneTo55Local(row.lead_number);
    if (normalized) {
      dispatchMap.set(normalized, { firstSent: row.first_sent, leadNumber: row.lead_number });
    }
  }

  const erpAuthToken = process.env.ERP_AUTH_TOKEN;
  if (!erpAuthToken) {
    throw new Error('ERP_AUTH_TOKEN não configurado.');
  }
  const authHeader = erpAuthToken.startsWith('Bearer ') ? erpAuthToken : `Bearer ${erpAuthToken}`;

  console.log(`[Audit] Fetching ERP sales data...`);
  const erpResponse = await fetch('http://erp.wescctech.com.br:8080/BOMPASTOR/api/API_DADOS_VENDAS_INDICACOES', {
    method: 'GET',
    headers: { 'Authorization': authHeader, 'Accept': 'application/json' }
  });
  if (!erpResponse.ok) {
    throw new Error(`ERP retornou status ${erpResponse.status}`);
  }
  const erpBody = await erpResponse.json();
  const vendasList = Array.isArray(erpBody) ? erpBody : [];
  console.log(`[Audit] ERP returned ${vendasList.length} sales records`);

  const vendasSemDisparo = [];
  const matchedContracts = new Set();
  const convertedPhones = new Set();
  const phoneContractCount = new Map();
  let valorTotalERP = 0;
  let valorDashboard = 0;

  for (const venda of vendasList) {
    const celRaw = venda.cel_indicador ? String(venda.cel_indicador).replace(/\D/g, '') : '';
    if (!celRaw) continue;

    const celNormalized = celRaw.startsWith('55') && celRaw.length >= 12 ? celRaw.slice(2) : celRaw;
    const valorContrato = parseBRCurrency(venda.valor_contrato);
    valorTotalERP += valorContrato;

    const count = phoneContractCount.get(celNormalized) || 0;
    phoneContractCount.set(celNormalized, count + 1);

    const dataContrato = venda.data_contrato ? new Date(venda.data_contrato) : null;
    const dispatchInfo = dispatchMap.get(celNormalized);

    if (!dispatchInfo) {
      vendasSemDisparo.push({
        cel_indicador: venda.cel_indicador,
        nome_indicador: venda.nome_indicador,
        contrato_servicos: venda.contrato_servicos,
        valor_contrato: valorContrato,
        data_contrato: venda.data_contrato,
        situacao_contrato: venda.situacao_contrato
      });
      continue;
    }

    if (!dataContrato || isNaN(dataContrato.getTime()) || dataContrato < new Date(dispatchInfo.firstSent)) {
      vendasSemDisparo.push({
        cel_indicador: venda.cel_indicador,
        nome_indicador: venda.nome_indicador,
        contrato_servicos: venda.contrato_servicos,
        valor_contrato: valorContrato,
        data_contrato: venda.data_contrato,
        situacao_contrato: venda.situacao_contrato,
        motivo: dataContrato ? 'data_contrato anterior ao disparo' : 'sem data de contrato'
      });
      continue;
    }

    const contratoId = venda.contrato_servicos || '';
    const contratoKey = contratoId
      ? `${celNormalized}_${contratoId}`
      : `${celNormalized}_${venda.cpf_indicado || ''}_${venda.data_contrato || ''}`;

    if (!matchedContracts.has(contratoKey)) {
      matchedContracts.add(contratoKey);
      valorDashboard += valorContrato;
    }
    convertedPhones.add(celNormalized);
  }

  const disparosSemVenda = [];
  for (const [phone, info] of dispatchMap.entries()) {
    if (!convertedPhones.has(phone)) {
      disparosSemVenda.push({
        lead_number: info.leadNumber,
        telefone_normalizado: phone,
        data_disparo: info.firstSent
      });
    }
  }

  const possiveisDuplicidades = [];
  for (const [phone, count] of phoneContractCount.entries()) {
    if (count > 1) {
      const contratos = vendasList
        .filter(v => {
          const cel = String(v.cel_indicador || '').replace(/\D/g, '');
          const norm = cel.startsWith('55') && cel.length >= 12 ? cel.slice(2) : cel;
          return norm === phone;
        })
        .map(v => ({ contrato: v.contrato_servicos, valor: parseBRCurrency(v.valor_contrato), data: v.data_contrato, situacao: v.situacao_contrato }));
      possiveisDuplicidades.push({ telefone: phone, total_contratos: count, contratos });
    }
  }

  const conversoes = matchedContracts.size;
  const leadsConvertidos = convertedPhones.size;
  const taxaRecalculada = leadsUnicosDisparados > 0 ? Number(((leadsConvertidos / leadsUnicosDisparados) * 100).toFixed(2)) : 0;
  const roiRecalculado = totalLeadsDisparados > 0 ? Number((valorDashboard / totalLeadsDisparados).toFixed(2)) : 0;

  return {
    totais: {
      leads_disparados: totalLeadsDisparados,
      leads_sucesso: totalLeadsSucesso,
      leads_unicos_disparados: leadsUnicosDisparados,
      vendas_erp: vendasList.length,
      vendas_vinculadas: conversoes,
      valor_total_erp: Number(valorTotalERP.toFixed(2)),
      valor_total_dashboard: Number(valorDashboard.toFixed(2))
    },
    inconsistencias: {
      vendas_sem_disparo: vendasSemDisparo,
      disparos_sem_venda: disparosSemVenda,
      possiveis_duplicidades: possiveisDuplicidades
    },
    validacao_metricas: {
      taxa_conversao_recalculada: taxaRecalculada,
      roi_recalculado: roiRecalculado,
      conversoes_identificadas: conversoes,
      leads_convertidos: leadsConvertidos
    }
  };
}

router.get('/lead-generator-metrics-audit', authMiddleware, async (req, res) => {
  try {
    const agent = await getAgentForDispatchCheck(req);
    if (!agent || DISPATCH_FORBIDDEN_TYPES.includes(agent.agent_type)) {
      return res.status(403).json({ success: false, error: 'Sem permissão para acessar auditoria de métricas.' });
    }

    const { from, to, userId, teamId } = req.query;
    const result = await executeMetricsAudit({ from, to, userId, teamId });
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[Audit] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

async function runLeadGeneratorAudit(options = {}) {
  const now = new Date();
  const from = options.from || new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const to = options.to || now.toISOString();

  console.log(`[Lead Generator Audit] Executando auditoria para período: ${from} até ${to}`);

  const auditResult = await executeMetricsAudit({ from, to, userId: options.userId, teamId: options.teamId });

  const divergencias =
    auditResult.inconsistencias.vendas_sem_disparo.length +
    auditResult.inconsistencias.disparos_sem_venda.length +
    auditResult.inconsistencias.possiveis_duplicidades.length;

  await query(
    `INSERT INTO gerador_leads_auditoria
      (periodo_inicio, periodo_fim, leads_disparados, disparos_sucesso, vendas_erp, vendas_vinculadas, valor_total_erp, valor_total_dashboard, divergencias, detalhes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      from,
      to,
      auditResult.totais.leads_disparados,
      auditResult.totais.leads_sucesso,
      auditResult.totais.vendas_erp,
      auditResult.totais.vendas_vinculadas,
      auditResult.totais.valor_total_erp,
      auditResult.totais.valor_total_dashboard,
      divergencias,
      JSON.stringify(auditResult)
    ]
  );

  if (divergencias > 0) {
    const valorAfetado = Math.abs(auditResult.totais.valor_total_erp - auditResult.totais.valor_total_dashboard);
    console.log(`[Lead Generator Audit] Divergências encontradas nas métricas`);
    console.log(`[Lead Generator Audit]   - Total de divergências: ${divergencias}`);
    console.log(`[Lead Generator Audit]   - Vendas sem disparo: ${auditResult.inconsistencias.vendas_sem_disparo.length}`);
    console.log(`[Lead Generator Audit]   - Disparos sem venda: ${auditResult.inconsistencias.disparos_sem_venda.length}`);
    console.log(`[Lead Generator Audit]   - Possíveis duplicidades: ${auditResult.inconsistencias.possiveis_duplicidades.length}`);
    console.log(`[Lead Generator Audit]   - Valor afetado: R$ ${valorAfetado.toFixed(2)}`);
    console.log(`[Lead Generator Audit]   - Período: ${from} até ${to}`);
  } else {
    console.log(`[Lead Generator Audit] Nenhuma divergência encontrada. Métricas consistentes.`);
  }

  return { divergencias, auditResult };
}

router.get('/run-lead-generator-audit', authMiddleware, async (req, res) => {
  try {
    const agent = await getAgentForDispatchCheck(req);
    if (!agent || DISPATCH_FORBIDDEN_TYPES.includes(agent.agent_type)) {
      return res.status(403).json({ success: false, error: 'Sem permissão para executar auditoria.' });
    }

    const { from, to, userId, teamId } = req.query;
    const { divergencias, auditResult } = await runLeadGeneratorAudit({ from, to, userId, teamId });

    res.json({
      success: true,
      message: divergencias > 0
        ? `Auditoria concluída. ${divergencias} divergência(s) encontrada(s).`
        : 'Auditoria concluída. Nenhuma divergência encontrada.',
      divergencias,
      ...auditResult
    });
  } catch (error) {
    console.error('[Lead Generator Audit] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export { runLeadGeneratorAudit };

async function runCommissionReconciliation() {
  console.log('[Commission Reconciliation] Starting reconciliation...');
  const issues = [];

  try {
    const erpToken = process.env.ERP_AUTH_TOKEN;
    if (!erpToken) {
      console.error('[Commission Reconciliation] ERP_AUTH_TOKEN not configured');
      return { success: false, error: 'ERP_AUTH_TOKEN not configured', issues: [] };
    }

    const API_URL = `https://api.grupobompastor.com.br/api/dados-vendas-indicacoes?token=${erpToken}`;
    const erpResponse = await fetch(API_URL);
    if (!erpResponse.ok) throw new Error(`ERP API error: ${erpResponse.status}`);
    const erpData = await erpResponse.json();
    const allRecords = Array.isArray(erpData) ? erpData : (erpData.data || []);

    const paidSales = allRecords.filter(r =>
      r.valores_pagos && String(r.valores_pagos).toUpperCase() === 'SIM'
    );

    const referralsResult = await query(
      "SELECT id, referred_cpf, commission_status, commission_value, created_at, stage FROM referrals WHERE stage = 'fechado_ganho' AND commission_value > 0 ORDER BY created_at ASC"
    );
    const referrals = referralsResult.rows;

    const usedContractsResult = await query('SELECT contrato_servicos, referral_id FROM processed_referral_contracts');
    const usedContractsMap = {};
    for (const row of usedContractsResult.rows) {
      usedContractsMap[row.contrato_servicos] = row.referral_id;
    }

    const referralsByCpf = {};
    for (const ref of referrals) {
      const cpf = ref.referred_cpf ? String(ref.referred_cpf).replace(/\D/g, '') : '';
      if (cpf && cpf.length >= 11) {
        if (!referralsByCpf[cpf]) referralsByCpf[cpf] = [];
        referralsByCpf[cpf].push(ref);
      }
    }

    const processedContracts = new Set();
    for (const sale of paidSales) {
      const contratoId = sale.contrato_servicos ? String(sale.contrato_servicos).trim() : '';
      if (!contratoId || processedContracts.has(contratoId)) continue;
      processedContracts.add(contratoId);

      const cpfIndicado = sale.cpf_indicado ? String(sale.cpf_indicado).replace(/\D/g, '') : '';
      const matchingReferrals = cpfIndicado ? (referralsByCpf[cpfIndicado] || []) : [];

      if (matchingReferrals.length === 0) {
        issues.push({
          contrato_servicos: contratoId,
          referral_id: null,
          cpf_indicado: cpfIndicado || null,
          tipo_problema: 'venda_sem_comissao',
          descricao: `Venda paga (contrato ${contratoId}) sem indicação correspondente no sistema`
        });
        continue;
      }

      const usedByReferralId = usedContractsMap[contratoId];
      if (!usedByReferralId) {
        issues.push({
          contrato_servicos: contratoId,
          referral_id: matchingReferrals[0].id,
          cpf_indicado: cpfIndicado,
          tipo_problema: 'venda_sem_comissao',
          descricao: `Venda paga (contrato ${contratoId}) com indicação existente mas contrato não vinculado a comissão`
        });
      }
    }

    for (const ref of referrals) {
      if (ref.commission_status === 'aprovada' || ref.commission_status === 'paga') {
        const refCpf = ref.referred_cpf ? String(ref.referred_cpf).replace(/\D/g, '') : '';
        const hasPaidSale = paidSales.some(s => {
          const cpf = s.cpf_indicado ? String(s.cpf_indicado).replace(/\D/g, '') : '';
          return cpf === refCpf;
        });

        if (!hasPaidSale) {
          issues.push({
            contrato_servicos: null,
            referral_id: ref.id,
            cpf_indicado: refCpf || null,
            tipo_problema: 'comissao_sem_venda',
            descricao: `Comissão ${ref.commission_status} para indicação ${ref.id} sem venda paga correspondente no ERP`
          });
        }
      }
    }

    const contractCommissionCount = {};
    for (const [contrato, refId] of Object.entries(usedContractsMap)) {
      if (!contractCommissionCount[contrato]) contractCommissionCount[contrato] = [];
      contractCommissionCount[contrato].push(refId);
    }
    for (const ref of referrals) {
      if (ref.commission_status === 'paga' || ref.commission_status === 'aprovada') {
        const refCpf = ref.referred_cpf ? String(ref.referred_cpf).replace(/\D/g, '') : '';
        const matchingSales = paidSales.filter(s => {
          const cpf = s.cpf_indicado ? String(s.cpf_indicado).replace(/\D/g, '') : '';
          return cpf === refCpf;
        });
        for (const sale of matchingSales) {
          const cid = sale.contrato_servicos ? String(sale.contrato_servicos).trim() : '';
          if (cid && usedContractsMap[cid] && usedContractsMap[cid] !== ref.id) {
            issues.push({
              contrato_servicos: cid,
              referral_id: ref.id,
              cpf_indicado: refCpf || null,
              tipo_problema: 'contrato_duplicado',
              descricao: `Contrato ${cid} vinculado a outra indicação, mas indicação ${ref.id} também possui comissão ${ref.commission_status}`
            });
          }
        }
      }
    }

    for (const ref of referrals) {
      if (ref.commission_status === 'paga') {
        const refCpf = ref.referred_cpf ? String(ref.referred_cpf).replace(/\D/g, '') : '';
        const currentErpSales = allRecords.filter(s => {
          const cpf = s.cpf_indicado ? String(s.cpf_indicado).replace(/\D/g, '') : '';
          return cpf === refCpf;
        });
        const hasUnpaidNow = currentErpSales.some(s =>
          String(s.valores_pagos || '').toUpperCase() !== 'SIM'
        ) && !currentErpSales.some(s =>
          String(s.valores_pagos || '').toUpperCase() === 'SIM'
        );

        if (hasUnpaidNow && currentErpSales.length > 0) {
          issues.push({
            contrato_servicos: null,
            referral_id: ref.id,
            cpf_indicado: refCpf || null,
            tipo_problema: 'venda_cancelada',
            descricao: `Comissão paga para indicação ${ref.id} mas ERP não possui mais venda paga para este CPF`
          });
        }
      }
    }

    const today = new Date().toISOString().split('T')[0];

    await query("DELETE FROM commission_reconciliation_logs WHERE execution_date = $1 AND resolved = false", [today]);

    for (const issue of issues) {
      await query(
        `INSERT INTO commission_reconciliation_logs (contrato_servicos, referral_id, cpf_indicado, tipo_problema, descricao, execution_date)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [issue.contrato_servicos, issue.referral_id, issue.cpf_indicado, issue.tipo_problema, issue.descricao, today]
      );
    }

    console.log(`[Commission Reconciliation] Completed. Found ${issues.length} issues.`);
    return { success: true, issuesFound: issues.length, issues };

  } catch (error) {
    console.error('[Commission Reconciliation] Error:', error.message);
    return { success: false, error: error.message, issues: [] };
  }
}

export { runCommissionReconciliation };

router.post('/commission-reconciliation/run', authMiddleware, async (req, res) => {
  try {
    const result = await runCommissionReconciliation();
    res.json(result);
  } catch (error) {
    console.error('[Commission Reconciliation] Manual run error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/commission-reconciliation/logs', authMiddleware, async (req, res) => {
  try {
    const { date, tipo, resolved } = req.query;
    let sql = 'SELECT * FROM commission_reconciliation_logs WHERE 1=1';
    const params = [];

    if (date) {
      params.push(date);
      sql += ` AND execution_date = $${params.length}`;
    }
    if (tipo) {
      params.push(tipo);
      sql += ` AND tipo_problema = $${params.length}`;
    }
    if (resolved !== undefined) {
      params.push(resolved === 'true');
      sql += ` AND resolved = $${params.length}`;
    }

    sql += ' ORDER BY created_at DESC LIMIT 500';

    const result = await query(sql, params);
    res.json({ success: true, logs: result.rows });
  } catch (error) {
    console.error('[Commission Reconciliation] Logs error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/commission-reconciliation/summary', authMiddleware, async (req, res) => {
  try {
    const summaryResult = await query(`
      SELECT 
        tipo_problema,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE resolved = false) as pending,
        COUNT(*) FILTER (WHERE resolved = true) as resolved,
        MAX(execution_date) as last_execution
      FROM commission_reconciliation_logs
      GROUP BY tipo_problema
    `);

    const lastRunResult = await query(`
      SELECT MAX(execution_date) as last_run, COUNT(*) as total_issues
      FROM commission_reconciliation_logs
      WHERE execution_date = (SELECT MAX(execution_date) FROM commission_reconciliation_logs)
    `);

    res.json({
      success: true,
      byType: summaryResult.rows,
      lastRun: lastRunResult.rows[0] || null
    });
  } catch (error) {
    console.error('[Commission Reconciliation] Summary error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/commission-reconciliation/resolve/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userEmail = req.user?.email || req.user?.userEmail || 'admin';

    const result = await query(
      `UPDATE commission_reconciliation_logs 
       SET resolved = true, resolved_at = NOW(), resolved_by = $1 
       WHERE id = $2 RETURNING *`,
      [userEmail, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Log not found' });
    }

    res.json({ success: true, log: result.rows[0] });
  } catch (error) {
    console.error('[Commission Reconciliation] Resolve error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/lead-generator-whatsapp-logs-list', authMiddleware, async (req, res) => {
  try {
    const agent = await getAgentForDispatchCheck(req);
    if (!agent || DISPATCH_FORBIDDEN_TYPES.includes(agent.agent_type)) {
      return res.status(403).json({ success: false, error: 'Sem permissão para acessar logs de disparos.' });
    }

    const { page = 1, limit = 50, status, from, to, userId: filterUserId, batchId } = req.query;
    const result = await getLogsWithPagination({
      page: parseInt(page),
      limit: parseInt(limit),
      status,
      from,
      to,
      userId: filterUserId,
      batchId,
    });

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[WhatsAppQueue] Logs list error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/lead-generator-check-conversions', authMiddleware, async (req, res) => {
  try {
    const agent = await getAgentForDispatchCheck(req);
    if (!agent || DISPATCH_FORBIDDEN_TYPES.includes(agent.agent_type)) {
      return res.status(403).json({ success: false, error: 'Sem permissão para verificar conversões.' });
    }

    const { from, to } = req.body;

    const erpAuthToken = process.env.ERP_AUTH_TOKEN;
    if (!erpAuthToken) {
      return res.status(500).json({ success: false, error: 'ERP_AUTH_TOKEN não configurado.' });
    }

    const logsResult = await query(
      `SELECT DISTINCT lead_number FROM gerador_leads_whatsapp_logs WHERE success = true`
    );

    if (logsResult.rows.length === 0) {
      return res.json({ success: true, matched: 0, message: 'Nenhum disparo encontrado.' });
    }

    const dispatchedNumbers = logsResult.rows.map(r => normalizePhone(r.lead_number)).filter(Boolean);

    const authHeader = erpAuthToken.startsWith('Bearer ') ? erpAuthToken : `Bearer ${erpAuthToken}`;

    console.log(`[Conversions] Fetching ERP data from API_CPF_INDICADOR for conversion check...`);
    const erpResponse = await fetch(
      'http://erp.wescctech.com.br:8080/BOMPASTOR/api/API_CPF_INDICADOR',
      {
        method: 'GET',
        headers: { 'Authorization': authHeader, 'Accept': 'application/json' }
      }
    );

    if (!erpResponse.ok) {
      return res.status(502).json({ success: false, error: `ERP retornou status ${erpResponse.status}` });
    }

    const erpData = await erpResponse.json();
    const erpRecords = Array.isArray(erpData) ? erpData : [];

    const activeContracts = erpRecords.filter(r => r.situacao_contrato === 'A');

    console.log(`[Conversions] ERP returned ${erpRecords.length} records, ${activeContracts.length} active contracts. Checking against ${dispatchedNumbers.length} dispatched numbers.`);

    const result = await checkConversions({
      erpRecords: activeContracts,
      from: from || null,
      to: to || null,
    });

    console.log(`[Conversions] Found ${result.matched} new conversions.`);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[Conversions] Check error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/lead-generator-conversions-metrics', authMiddleware, async (req, res) => {
  try {
    const agent = await getAgentForDispatchCheck(req);
    if (!agent || DISPATCH_FORBIDDEN_TYPES.includes(agent.agent_type)) {
      return res.status(403).json({ success: false, error: 'Sem permissão.' });
    }

    const { from, to, userId: filterUserId, teamId: filterTeamId } = req.query;
    const metrics = await getConversionMetrics({ from, to, userId: filterUserId, teamId: filterTeamId });

    res.json({ success: true, ...metrics });
  } catch (error) {
    console.error('[Conversions] Metrics error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/lead-generator-conversions-list', authMiddleware, async (req, res) => {
  try {
    const agent = await getAgentForDispatchCheck(req);
    if (!agent || DISPATCH_FORBIDDEN_TYPES.includes(agent.agent_type)) {
      return res.status(403).json({ success: false, error: 'Sem permissão.' });
    }

    const { page = 1, limit = 50, from, to, userId: filterUserId, teamId: filterTeamId } = req.query;
    const result = await getConversionsList({
      page: parseInt(page),
      limit: parseInt(limit),
      from, to,
      userId: filterUserId,
      teamId: filterTeamId,
    });

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[Conversions] List error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/get-customer-from-erp', authMiddleware, async (req, res) => {
  try {
    const { cpf } = req.body;
    
    if (!cpf) {
      return res.status(400).json({ success: false, error: 'CPF é obrigatório' });
    }
    
    const cpfLimpo = cpf.replace(/\D/g, '');
    
    if (cpfLimpo.length !== 11) {
      return res.status(400).json({ success: false, error: 'CPF inválido' });
    }
    
    const erpAuthToken = process.env.ERP_AUTH_TOKEN;
    
    if (!erpAuthToken) {
      console.error('ERP credentials not configured');
      return res.status(500).json({ 
        success: false, 
        error: 'Credenciais do ERP não configuradas. Configure ERP_AUTH_TOKEN.' 
      });
    }
    
    const cpfFormatado = cpfLimpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    const erpUrl = `http://erp.wescctech.com.br:8080/BOMPASTOR/api/API_CPF_INDICADOR?cpf=${cpfFormatado}`;
    
    console.log(`Fetching ERP data for CPF: ${cpfLimpo} -> ${erpUrl}`);
    
    const authHeader = erpAuthToken.startsWith('Bearer ') ? erpAuthToken : `Bearer ${erpAuthToken}`;
    
    const erpResponse = await fetch(erpUrl, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json'
      }
    });
    
    if (!erpResponse.ok) {
      if (erpResponse.status === 404) {
        return res.status(404).json({
          success: false,
          error: 'Nenhum dado encontrado para este CPF',
          notFound: true,
          noContract: true
        });
      }
      if (erpResponse.status === 401) {
        console.error('ERP returned 401 - Token may be expired or invalid');
        return res.status(401).json({
          success: false,
          error: 'Token de autenticação do ERP inválido ou expirado. Verifique o ERP_AUTH_TOKEN.'
        });
      }
      throw new Error(`ERP returned status ${erpResponse.status}`);
    }
    
    const erpData = await erpResponse.json();
    
    if (!erpData || (Array.isArray(erpData) && erpData.length === 0)) {
      return res.status(404).json({
        success: false,
        error: 'Nenhum dado encontrado para este CPF',
        notFound: true,
        noContract: true
      });
    }
    
    const rawData = Array.isArray(erpData) ? erpData : [erpData];
    const firstRecord = rawData[0];

    console.log(`[ERP CPF] Received ${rawData.length} records for CPF ${cpfLimpo}`);

    const situacaoMap = { 'A': 'Ativo', 'C': 'Cancelado', 'S': 'Suspenso' };

    const contractMap = new Map();
    let contratosAtivos = 0;
    let valorTotalMensal = 0;
    const indicadosSet = new Set();

    for (const record of rawData) {
      const contratoKey = String(record.contrato_servicos || record.id || '');
      if (contratoKey && !contractMap.has(contratoKey)) {
        const sit = situacaoMap[record.situacao_contrato] || record.situacao_contrato || 'Ativo';
        const valor = parseFloat(record.valor_contrato || 0);
        contractMap.set(contratoKey, {
          numero_contrato: contratoKey,
          plano: record.produto || '',
          valor_mensal: valor,
          inicio_vigencia: record.data_contrato || '',
          situacao: sit,
          status_pagamento: record.parcelas_abertas > 0 ? 'INADIMPLENTE' : 'EM DIA',
          nome_cliente_indicado: record.nome_cliente_indicado || null,
          cpf_indicado: record.cpf_indicado || null,
          canal: record.canal || '',
          vendedor: record.vendedor || record.vendedor_receptivo || '',
          data_vencimento: record.data_vencimento || '',
          vidas: record.vidas || 0,
        });
        if (sit.toLowerCase().includes('ativ')) contratosAtivos++;
        valorTotalMensal += valor;
      }
      if (record.nome_cliente_indicado) {
        indicadosSet.add(record.nome_cliente_indicado);
      }
    }

    const contracts = Array.from(contractMap.values());

    const cidadeUf = firstRecord.cidade || '';
    const cidadeParts = cidadeUf.split(' - ');
    const cidadeNome = cidadeParts[0]?.trim() || '';
    const ufValue = firstRecord.uf || cidadeParts[1]?.trim() || '';

    console.log(`[ERP CPF] Deduplicated to ${contracts.length} unique contracts, ${indicadosSet.size} unique indicated clients`);
    
    const response = {
      success: true,
      source: 'erp_bompastor',
      synced_at: new Date().toISOString(),
      data: {
        contact: {
          id: firstRecord.id || null,
          name: firstRecord.titular || firstRecord.nome || firstRecord.nome_cliente || '',
          document: firstRecord.cpf || cpfFormatado,
          birth_date: firstRecord.data_nascimento || firstRecord.nascimento || '',
          phones: [firstRecord.cel_indicador, firstRecord.cel, firstRecord.telefone, firstRecord.celular].filter(Boolean),
          emails: [firstRecord.e_mail, firstRecord.email].filter(Boolean),
          address: {
            logradouro: firstRecord.endereco || firstRecord.logradouro || '',
            numero: firstRecord.numero || '',
            complemento: firstRecord.complemento || '',
            bairro: firstRecord.bairro || '',
            cidade: cidadeNome,
            uf: ufValue,
            cep: firstRecord.cep || ''
          },
          vip: firstRecord.vip || false,
          codigo_erp: firstRecord.codigo || firstRecord.id_pessoa || firstRecord.id || null
        },
        contracts: contracts.slice(0, 50),
        dependents: (firstRecord.dependentes || []).map(dep => ({
          id_dependente_erp: dep.id || dep.codigo,
          nome: dep.nome,
          data_nascimento: dep.data_nascimento,
          status_vida: dep.status || 'VIVO'
        })),
        financial: {
          total_contratos: contracts.length,
          valor_total_mensal: valorTotalMensal,
          contratos_ativos: contratosAtivos,
          total_indicados: indicadosSet.size,
          total_registros_erp: rawData.length,
          status_geral: contratosAtivos > 0 ? 'EM DIA' : 'SEM CONTRATO ATIVO'
        },
        raw_erp_data: [firstRecord]
      }
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error getting customer from ERP:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erro ao consultar ERP: ' + error.message 
    });
  }
});

router.post('/generate-proposal', authMiddleware, async (req, res) => {
  try {
    const { template_id, lead_id, lead_type } = req.body;
    
    if (!template_id || !lead_id) {
      return res.status(400).json({ success: false, error: 'Template ID e Lead ID são obrigatórios' });
    }
    
    const templateResult = await query('SELECT * FROM proposal_templates WHERE id = $1', [template_id]);
    if (templateResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Template não encontrado' });
    }
    const template = templateResult.rows[0];
    
    const tableName = lead_type === 'pj' ? 'leads_pj' : lead_type === 'referral' ? 'referrals' : 'leads';
    const leadResult = await query(`SELECT * FROM ${tableName} WHERE id = $1`, [lead_id]);
    if (leadResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Lead não encontrado' });
    }
    const lead = leadResult.rows[0];
    
    let agent = null;
    const agentId = lead.agent_id;
    if (agentId) {
      const agentResult = await query('SELECT * FROM agents WHERE id = $1', [agentId]);
      if (agentResult.rows.length > 0) {
        agent = agentResult.rows[0];
      }
    }
    
    const pdfResult = await generateProposalPDF(template, lead, agent);
    
    await query(
      `UPDATE ${tableName} SET proposal_url = $1 WHERE id = $2`,
      [pdfResult.publicUrl, lead_id]
    );
    
    res.json({ 
      success: true, 
      proposal_url: pdfResult.publicUrl,
      file_name: pdfResult.fileName
    });
  } catch (error) {
    console.error('Error generating proposal:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/send-proposal-whatsapp', authMiddleware, async (req, res) => {
  try {
    const { leadId, proposalUrl, lead_type } = req.body;
    
    if (!leadId) {
      return res.status(400).json({ success: false, error: 'Lead ID é obrigatório' });
    }
    
    const tableName = lead_type === 'pj' ? 'leads_pj' : lead_type === 'referral' ? 'referrals' : 'leads';
    const leadResult = await query(`SELECT * FROM ${tableName} WHERE id = $1`, [leadId]);
    if (leadResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Lead não encontrado' });
    }
    const lead = leadResult.rows[0];
    
    const phone = lead.phone || lead.cell_phone || lead.whatsapp;
    if (!phone) {
      return res.status(400).json({ success: false, error: 'Lead não possui telefone cadastrado' });
    }
    
    const pdfUrl = proposalUrl || lead.proposal_url;
    if (!pdfUrl) {
      return res.status(400).json({ success: false, error: 'Proposta não foi gerada. Gere a proposta primeiro.' });
    }
    
    let agent = null;
    const agentId = lead.agent_id;
    if (agentId) {
      const agentResult = await query('SELECT * FROM agents WHERE id = $1', [agentId]);
      if (agentResult.rows.length > 0) {
        agent = agentResult.rows[0];
      }
    }
    
    const leadName = lead.name || lead.full_name || lead.contact_name || 'Cliente';
    
    const formattedPhone = phone.replace(/\D/g, '');
    const brazilNumber = formattedPhone.startsWith('55') ? formattedPhone : `55${formattedPhone}`;
    
    // Build public URL for the PDF
    let baseUrl;
    if (process.env.APP_DOMAIN) {
      baseUrl = process.env.APP_DOMAIN;
    } else if (process.env.REPLIT_DEV_DOMAIN) {
      baseUrl = `https://${process.env.REPLIT_DEV_DOMAIN}`;
    } else if (process.env.REPLIT_DOMAINS) {
      const domains = process.env.REPLIT_DOMAINS.split(',');
      baseUrl = `https://${domains[0]}`;
    } else {
      baseUrl = `http://localhost:${process.env.PORT || 3001}`;
    }
    
    // Ensure URL ends with .pdf and is absolute
    let fullPdfUrl = pdfUrl.startsWith('http') ? pdfUrl : `${baseUrl}${pdfUrl}`;
    if (!fullPdfUrl.endsWith('.pdf')) {
      fullPdfUrl = fullPdfUrl + '.pdf';
    }
    
    console.log('[WhatsApp] PDF URL:', fullPdfUrl);
    
    const PROPOSAL_TEMPLATE_ID = '697a2b0d532f3df41d2288dc';
    
    const templateComponents = [
      {
        type: 'BODY',
        parameters: [
          { type: 'text', text: leadName }
        ]
      },
      {
        type: 'HEADER',
        parameters: [
          {
            type: 'document',
            document: {
              link: fullPdfUrl,
              fileName: `Proposta - ${leadName}`
            }
          }
        ]
      }
    ];
    
    const token = process.env.RUDO_WHATSAPP_TOKEN;
    if (!token) {
      throw new Error('RUDO_WHATSAPP_TOKEN não configurado');
    }
    
    const body = {
      forceSend: true,
      templateId: PROPOSAL_TEMPLATE_ID,
      verifyContact: false,
      number: brazilNumber,
      templateComponents: templateComponents
    };
    
    console.log('[WhatsApp] Sending proposal template:', JSON.stringify(body, null, 2));
    
    const response = await fetch('https://api.wescctech.com.br/core/v2/api/chats/send-template', {
      method: 'POST',
      headers: {
        'access-token': token,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(body),
    });
    
    const responseData = await response.json().catch(() => ({}));
    
    if (!response.ok) {
      console.error('[WhatsApp] Template send failed:', responseData);
      throw new Error(`Falha ao enviar template: ${responseData.msg || response.statusText}`);
    }
    
    console.log('[WhatsApp] Proposal sent successfully:', responseData);
    
    if (lead_type === 'referral') {
      await query(
        `INSERT INTO referral_activities (referral_id, type, title, description, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [leadId, 'note', 'Proposta enviada via WhatsApp', `Proposta (PDF) enviada para ${phone}`]
      );
    } else {
      const activityColumn = lead_type === 'pj' ? 'lead_pj_id' : 'lead_id';
      await query(
        `INSERT INTO activities (${activityColumn}, type, title, description, assigned_to, completed)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [leadId, 'note', 'Proposta enviada via WhatsApp', `Proposta (PDF) enviada para ${phone}`, agentId, true]
      );
    }
    
    res.json({ 
      success: true, 
      message: 'Proposta enviada via WhatsApp com PDF anexado',
      ...responseData
    });
  } catch (error) {
    console.error('Error sending proposal via WhatsApp:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/send-proposal-email', authMiddleware, async (req, res) => {
  try {
    const { lead_id, proposal_url } = req.body;
    res.json({ success: false, error: 'Envio de e-mail não implementado. Configure um serviço de e-mail.' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/ai-assistant', authMiddleware, async (req, res) => {
  try {
    const { prompt, context, conversationHistory = [] } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ message: 'Prompt is required' });
    }
    
    const openai = new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });
    
    const systemMessage = {
      role: 'system',
      content: `Você é um assistente de CRM especializado em atendimento ao cliente, vendas e suporte técnico. 
Você ajuda agentes de suporte, vendedores e gerentes a:
- Redigir respostas para clientes
- Sugerir soluções para problemas técnicos
- Analisar situações de vendas e sugerir abordagens
- Resumir históricos de atendimento
- Criar templates de mensagens profissionais

${context ? `Contexto adicional: ${context}` : ''}

Responda sempre em português brasileiro de forma profissional e objetiva.`
    };
    
    const messages = [
      systemMessage,
      ...conversationHistory.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      { role: 'user', content: prompt }
    ];
    
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      max_tokens: 1024,
      temperature: 0.7,
    });
    
    const assistantMessage = completion.choices[0]?.message?.content || 'Não foi possível gerar uma resposta.';
    
    res.json({ 
      success: true, 
      response: assistantMessage,
      usage: completion.usage
    });
  } catch (error) {
    console.error('Error in AI assistant:', error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/process-call-audit', authMiddleware, async (req, res) => {
  try {
    const { audio_url, agent_id, checklist_id, ticket_id } = req.body;
    
    const result = await query(
      `INSERT INTO call_audits (audio_url, agent_id, checklist_id, ticket_id, status) 
       VALUES ($1, $2, $3, $4, 'pending') RETURNING *`,
      [audio_url, agent_id, checklist_id, ticket_id]
    );
    
    res.json({ 
      success: true, 
      audit: result.rows[0],
      message: 'Audit created - processing not implemented (integrate with OpenAI Whisper)'
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

function mapPorteToSelect(porteDescricao) {
  if (!porteDescricao) return '';
  const porte = porteDescricao.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (porte.includes('microempreendedor') || porte === 'mei') return 'MEI';
  if (porte.includes('micro empresa') || porte.includes('microempresa') || porte === 'me') return 'ME';
  if (porte.includes('pequeno porte') || porte.includes('epp') || porte.includes('pequena empresa')) return 'EPP';
  if (porte.includes('medio porte') || porte.includes('media empresa')) return 'Médio';
  if (porte.includes('grande porte') || porte.includes('grande empresa')) return 'Grande';
  if (porte.includes('demais')) return 'Grande';
  return '';
}

router.post('/busca-cnpj', authMiddleware, async (req, res) => {
  try {
    const { cnpj } = req.body;
    
    if (!cnpj) {
      return res.status(400).json({ success: false, error: 'CNPJ é obrigatório' });
    }
    
    const cleanCnpj = cnpj.replace(/\D/g, '');
    
    if (cleanCnpj.length !== 14) {
      return res.status(400).json({ success: false, error: 'CNPJ inválido' });
    }
    
    const response = await fetch(`https://publica.cnpj.ws/cnpj/${cleanCnpj}`);
    
    if (!response.ok) {
      if (response.status === 404) {
        return res.json({ success: false, error: 'CNPJ não encontrado' });
      }
      return res.json({ success: false, error: 'Erro ao consultar CNPJ' });
    }
    
    const apiData = await response.json();
    
    const mappedData = {
      razao_social: apiData.razao_social || '',
      nome_fantasia: apiData.estabelecimento?.nome_fantasia || apiData.razao_social || '',
      contact_name: apiData.socios?.[0]?.nome || '',
      atividade_principal: apiData.estabelecimento?.atividade_principal?.descricao || '',
      situacao_cadastral: apiData.estabelecimento?.situacao_cadastral || '',
      porte: mapPorteToSelect(apiData.porte?.descricao),
      street: apiData.estabelecimento?.logradouro ? 
        `${apiData.estabelecimento.tipo_logradouro || ''} ${apiData.estabelecimento.logradouro}`.trim() : '',
      number: apiData.estabelecimento?.numero || '',
      complement: apiData.estabelecimento?.complemento || '',
      neighborhood: apiData.estabelecimento?.bairro || '',
      city: apiData.estabelecimento?.cidade?.nome || '',
      state: apiData.estabelecimento?.estado?.sigla || '',
      cep: apiData.estabelecimento?.cep || '',
      phone: apiData.estabelecimento?.ddd1 && apiData.estabelecimento?.telefone1 ? 
        `(${apiData.estabelecimento.ddd1}) ${apiData.estabelecimento.telefone1}` : '',
      phone_secondary: apiData.estabelecimento?.ddd2 && apiData.estabelecimento?.telefone2 ?
        `(${apiData.estabelecimento.ddd2}) ${apiData.estabelecimento.telefone2}` : '',
      email: (apiData.estabelecimento?.email || '').toLowerCase(),
    };
    
    res.json({ 
      success: true, 
      data: mappedData,
      raw: apiData 
    });
  } catch (error) {
    console.error('Erro ao buscar CNPJ:', error);
    res.status(500).json({ success: false, error: 'Erro ao consultar dados do CNPJ' });
  }
});

router.get('/getPublicContract', async (req, res) => {
  try {
    const { token } = req.query;
    
    if (!token) {
      return res.status(400).json({ success: false, error: 'Token nao fornecido' });
    }

    const leadResult = await query(
      `SELECT * FROM leads WHERE contract_token = $1`,
      [token]
    );
    
    if (leadResult.rows.length === 0) {
      const leadPJResult = await query(
        `SELECT * FROM leads_pj WHERE contract_token = $1`,
        [token]
      );
      
      if (leadPJResult.rows.length === 0) {
        const referralResult = await query(
          `SELECT * FROM referrals WHERE contract_token = $1`,
          [token]
        );
        
        if (referralResult.rows.length === 0) {
          return res.status(404).json({ success: false, error: 'Contrato nao encontrado' });
        }
        
        const referral = referralResult.rows[0];
        return res.json({
          success: true,
          lead: {
            id: referral.id,
            name: referral.name,
            phone: referral.phone,
            email: referral.email,
            cpf: referral.cpf,
          },
          contract: {
            proposal_url: referral.proposal_url,
            product_name: referral.proposal_product,
            price: referral.proposal_price,
            payment_due_day: referral.payment_due_day || 10,
            signature_url: referral.contract_signature_url,
            signed_at: referral.contract_signed_at,
          }
        });
      }
      
      const lead = leadPJResult.rows[0];
      return res.json({
        success: true,
        lead: {
          id: lead.id,
          name: lead.company_name || lead.contact_name,
          phone: lead.phone,
          email: lead.email,
          cpf: lead.cnpj,
        },
        contract: {
          proposal_url: lead.proposal_url,
          product_name: lead.proposal_product,
          price: lead.proposal_price,
          payment_due_day: lead.payment_due_day || 10,
          signature_url: lead.contract_signature_url,
          signed_at: lead.contract_signed_at,
        }
      });
    }
    
    const lead = leadResult.rows[0];
    res.json({
      success: true,
      lead: {
        id: lead.id,
        name: lead.name,
        phone: lead.phone,
        email: lead.email,
        cpf: lead.cpf,
      },
      contract: {
        proposal_url: lead.proposal_url,
        product_name: lead.proposal_product,
        price: lead.proposal_price,
        payment_due_day: lead.payment_due_day || 10,
        signature_url: lead.contract_signature_url,
        signed_at: lead.contract_signed_at,
      }
    });
  } catch (error) {
    console.error('Erro ao buscar contrato:', error);
    res.status(500).json({ success: false, error: 'Erro ao carregar contrato' });
  }
});

router.post('/signContract', async (req, res) => {
  try {
    const { token, signatureDataUrl } = req.body;
    
    if (!token || !signatureDataUrl) {
      return res.status(400).json({ success: false, error: 'Token e assinatura sao obrigatorios' });
    }

    let lead = null;
    let tableName = 'leads';

    const leadResult = await query(
      `SELECT * FROM leads WHERE contract_token = $1`,
      [token]
    );
    
    if (leadResult.rows.length === 0) {
      const leadPJResult = await query(
        `SELECT * FROM leads_pj WHERE contract_token = $1`,
        [token]
      );
      
      if (leadPJResult.rows.length === 0) {
        const referralResult = await query(
          `SELECT * FROM referrals WHERE contract_token = $1`,
          [token]
        );
        
        if (referralResult.rows.length === 0) {
          return res.status(404).json({ success: false, error: 'Contrato nao encontrado' });
        }
        
        lead = referralResult.rows[0];
        tableName = 'referrals';
      } else {
        lead = leadPJResult.rows[0];
        tableName = 'leads_pj';
      }
    } else {
      lead = leadResult.rows[0];
    }

    if (lead.contract_signature_url) {
      return res.status(400).json({ success: false, error: 'Contrato ja foi assinado' });
    }

    const base64Data = signatureDataUrl.replace(/^data:image\/png;base64,/, '');
    const fileName = `assinatura_contrato_${lead.id}_${Date.now()}.png`;
    const filePath = path.join(process.cwd(), 'public', 'signatures', fileName);
    
    const signaturesDir = path.join(process.cwd(), 'public', 'signatures');
    if (!fs.existsSync(signaturesDir)) {
      fs.mkdirSync(signaturesDir, { recursive: true });
    }

    fs.writeFileSync(filePath, base64Data, 'base64');

    const appDomain = process.env.APP_DOMAIN || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : `http://localhost:${process.env.PORT || 3001}`);
    const signatureUrl = `${appDomain}/public/signatures/${fileName}`;

    await query(
      `UPDATE ${tableName} SET contract_signature_url = $1, contract_signed_at = $2 WHERE id = $3`,
      [signatureUrl, new Date().toISOString(), lead.id]
    );

    let activityTable = 'activities';
    let leadIdColumn = 'lead_id';
    if (tableName === 'leads_pj') {
      activityTable = 'activities_pj';
    } else if (tableName === 'referrals') {
      activityTable = 'referral_activities';
      leadIdColumn = 'referral_id';
    }
    await query(
      `INSERT INTO ${activityTable} (${leadIdColumn}, type, title, description, created_at) VALUES ($1, $2, $3, $4, $5)`,
      [lead.id, 'note', 'Contrato assinado digitalmente', 'Cliente assinou o contrato via link digital', new Date().toISOString()]
    );

    res.json({
      success: true,
      signatureUrl,
      message: 'Contrato assinado com sucesso'
    });
  } catch (error) {
    console.error('Erro ao assinar contrato:', error);
    res.status(500).json({ success: false, error: 'Erro ao salvar assinatura' });
  }
});

router.post('/send-contract-whatsapp', authMiddleware, async (req, res) => {
  try {
    const { leadId, lead_type = 'pf' } = req.body;
    
    let tableName = 'leads';
    if (lead_type === 'pj') {
      tableName = 'leads_pj';
    } else if (lead_type === 'referral') {
      tableName = 'referrals';
    }
    const leadResult = await query(`SELECT * FROM ${tableName} WHERE id = $1`, [leadId]);
    
    if (leadResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Lead nao encontrado' });
    }

    const lead = leadResult.rows[0];
    
    if (!lead.proposal_url) {
      return res.status(400).json({ success: false, error: 'Gere a proposta primeiro antes de enviar o contrato' });
    }

    const crypto = await import('crypto');
    const contractToken = crypto.randomBytes(32).toString('hex');
    
    await query(
      `UPDATE ${tableName} SET contract_token = $1 WHERE id = $2`,
      [contractToken, leadId]
    );

    const appDomain = process.env.APP_DOMAIN || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : `http://localhost:${process.env.PORT || 3001}`);
    const contractUrl = `${appDomain}/PublicContractSign?token=${contractToken}`;

    let phone = lead.phone || lead.whatsapp;
    if (!phone) {
      return res.status(400).json({ success: false, error: 'Lead nao possui telefone' });
    }
    phone = phone.replace(/\D/g, '');
    if (phone.length === 11 && !phone.startsWith('55')) {
      phone = '55' + phone;
    }

    const message = `Ola ${lead.name || lead.company_name || lead.contact_name}! 📋

Segue o link para assinatura digital do seu contrato:

${contractUrl}

Por favor, acesse o link acima para visualizar e assinar seu contrato digitalmente.

Qualquer duvida, estamos a disposicao!`;

    const body = {
      phone,
      message,
    };

    const whuResponse = await fetch(`${WHU_API_URL}/api/v1/1/messages/send-text`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.RUDO_WHATSAPP_TOKEN}`,
      },
      body: JSON.stringify(body),
    });

    const responseData = await whuResponse.json();
    console.log('[WhatsApp] Contract link sent:', responseData);

    const activityTable = tableName === 'leads' ? 'activities' : 'activities_pj';
    await query(
      `INSERT INTO ${activityTable} (lead_id, type, title, description, created_at) VALUES ($1, $2, $3, $4, $5)`,
      [leadId, 'whatsapp', 'Link de contrato enviado via WhatsApp', `Link de assinatura digital enviado para ${phone}`, new Date().toISOString()]
    );

    res.json({
      success: true,
      message: 'Link de contrato enviado via WhatsApp',
      contractUrl,
      ...responseData
    });
  } catch (error) {
    console.error('Erro ao enviar contrato via WhatsApp:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/autentiqueCreateDocument', authMiddleware, async (req, res) => {
  try {
    console.log('[Autentique] Creating document, body:', JSON.stringify(req.body));
    const { lead_id, contract_url, send_method = 'email', lead_type = 'pf' } = req.body;
    
    if (!lead_id || !contract_url) {
      console.log('[Autentique] Missing required fields');
      return res.status(400).json({ success: false, error: 'lead_id e contract_url sao obrigatorios' });
    }

    const AUTENTIQUE_TOKEN = process.env.AUTENTIQUE_TOKEN;
    if (!AUTENTIQUE_TOKEN) {
      console.log('[Autentique] Token not configured');
      return res.status(500).json({ success: false, error: 'Token Autentique nao configurado' });
    }
    console.log('[Autentique] Token found, length:', AUTENTIQUE_TOKEN.length);

    let tableName = 'leads';
    if (lead_type === 'pj') {
      tableName = 'leads_pj';
    } else if (lead_type === 'referral') {
      tableName = 'referrals';
    }

    const leadResult = await query(`SELECT * FROM ${tableName} WHERE id = $1`, [lead_id]);
    if (leadResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Lead nao encontrado' });
    }

    const lead = leadResult.rows[0];
    const signerEmail = lead.email;
    const signerName = lead.name || lead.company_name || lead.contact_name || 'Cliente';

    if (!signerEmail && send_method === 'email') {
      console.log('[Autentique] Lead has no email and send_method is email');
      return res.status(400).json({ success: false, error: 'Lead nao possui email cadastrado. Cadastre o email ou use o metodo "link".' });
    }
    console.log('[Autentique] Signer:', signerName, '| Email:', signerEmail || '(none - link mode)', '| Method:', send_method);

    let pdfBuffer;
    if (contract_url.startsWith('/uploads/')) {
      const localPath = path.join(process.cwd(), contract_url);
      console.log('[Autentique] Reading PDF from local file:', localPath);
      if (!fs.existsSync(localPath)) {
        console.log('[Autentique] File not found at:', localPath);
        return res.status(404).json({ success: false, error: 'Arquivo do contrato nao encontrado no servidor' });
      }
      pdfBuffer = fs.readFileSync(localPath);
      console.log('[Autentique] PDF read from disk, size:', pdfBuffer.length);
    } else if (contract_url.startsWith('/')) {
      const appDomain = process.env.APP_DOMAIN || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : `http://localhost:${process.env.PORT || 3001}`);
      const fullContractUrl = `${appDomain}${contract_url}`;
      console.log('[Autentique] Downloading PDF from:', fullContractUrl);
      const pdfResponse = await axios.get(fullContractUrl, { 
        responseType: 'arraybuffer',
        timeout: 30000
      });
      pdfBuffer = Buffer.from(pdfResponse.data);
      console.log('[Autentique] PDF downloaded, size:', pdfBuffer.length);
    } else {
      console.log('[Autentique] Downloading PDF from external URL:', contract_url);
      const pdfResponse = await axios.get(contract_url, { 
        responseType: 'arraybuffer',
        timeout: 30000
      });
      pdfBuffer = Buffer.from(pdfResponse.data);
      console.log('[Autentique] PDF downloaded, size:', pdfBuffer.length);
    }

    const documentName = `Contrato - ${signerName} - ${new Date().toLocaleDateString('pt-BR')}`;

    const mutation = `mutation CreateDocumentMutation($document: DocumentInput!, $signers: [SignerInput!]!, $file: Upload!) {
      createDocument(document: $document, signers: $signers, file: $file) {
        id
        name
        created_at
        signatures {
          public_id
          name
          email
          link {
            short_link
          }
        }
      }
    }`;

    const signerData = {
      action: 'SIGN',
      name: signerName
    };
    if (signerEmail) {
      signerData.email = signerEmail;
    }

    const variables = {
      document: {
        name: documentName
      },
      signers: [signerData],
      file: null
    };

    const formData = new FormData();
    formData.append('operations', JSON.stringify({
      query: mutation,
      variables: variables
    }));
    formData.append('map', JSON.stringify({ 'file': ['variables.file'] }));
    formData.append('file', pdfBuffer, {
      filename: 'contrato.pdf',
      contentType: 'application/pdf'
    });

    const autentiqueResponse = await axios.post(AUTENTIQUE_API_URL, formData, {
      headers: {
        'Authorization': `Bearer ${AUTENTIQUE_TOKEN}`,
        ...formData.getHeaders()
      },
      timeout: 60000
    });

    const responseData = autentiqueResponse.data;

    if (responseData.errors) {
      console.error('Erro Autentique:', responseData.errors);
      return res.status(400).json({ 
        success: false, 
        error: responseData.errors[0]?.message || 'Erro na API Autentique' 
      });
    }

    const createdDocument = responseData.data?.createDocument;
    if (!createdDocument) {
      return res.status(500).json({ success: false, error: 'Resposta invalida da Autentique' });
    }

    const signatureLink = createdDocument.signatures?.[0]?.link?.short_link || null;
    const autentiqueId = createdDocument.id;

    await query(
      `UPDATE ${tableName} SET signature_autentique_id = $1, signature_link = $2, signature_status = $3 WHERE id = $4`,
      [autentiqueId, signatureLink, 'pending', lead_id]
    );

    let activityTable = 'activities';
    let leadIdColumn = 'lead_id';
    if (tableName === 'leads_pj') {
      activityTable = 'activities_pj';
    } else if (tableName === 'referrals') {
      activityTable = 'referral_activities';
      leadIdColumn = 'referral_id';
    }
    
    await query(
      `INSERT INTO ${activityTable} (${leadIdColumn}, type, title, description, created_at) VALUES ($1, $2, $3, $4, $5)`,
      [lead_id, 'note', 'Contrato enviado para assinatura', `Documento enviado via Autentique para ${signerEmail}`, new Date().toISOString()]
    );

    res.json({
      success: true,
      autentique_id: autentiqueId,
      signature_link: signatureLink,
      message: send_method === 'email' ? 'Contrato enviado para assinatura via e-mail' : 'Link de assinatura gerado'
    });
  } catch (error) {
    console.error('[Autentique] Error creating document:', error.message);
    if (error.response) {
      console.error('[Autentique] Response status:', error.response.status);
      console.error('[Autentique] Response data:', JSON.stringify(error.response.data));
    }
    res.status(500).json({ success: false, error: error.message || 'Erro ao processar documento' });
  }
});

router.post('/autentiqueCheckStatus', authMiddleware, async (req, res) => {
  try {
    const { lead_id, lead_type = 'pf' } = req.body;
    
    if (!lead_id) {
      return res.status(400).json({ success: false, error: 'lead_id e obrigatorio' });
    }

    const AUTENTIQUE_TOKEN = process.env.AUTENTIQUE_TOKEN;
    if (!AUTENTIQUE_TOKEN) {
      return res.status(500).json({ success: false, error: 'Token Autentique nao configurado' });
    }

    let tableName = 'leads';
    if (lead_type === 'pj') {
      tableName = 'leads_pj';
    } else if (lead_type === 'referral') {
      tableName = 'referrals';
    }

    const leadResult = await query(`SELECT * FROM ${tableName} WHERE id = $1`, [lead_id]);
    if (leadResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Lead nao encontrado' });
    }

    const lead = leadResult.rows[0];
    const autentiqueId = lead.signature_autentique_id;

    if (!autentiqueId) {
      return res.status(400).json({ success: false, error: 'Nenhum documento em assinatura' });
    }

    const queryGraphQL = `query {
      document(id: "${autentiqueId}") {
        id
        name
        signatures {
          public_id
          name
          email
          signed {
            created_at
          }
          rejected {
            created_at
            reason
          }
        }
      }
    }`;

    const autentiqueResponse = await axios.post(AUTENTIQUE_API_URL, {
      query: queryGraphQL
    }, {
      headers: {
        'Authorization': `Bearer ${AUTENTIQUE_TOKEN}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    const responseData = autentiqueResponse.data;
    console.log('[Autentique] Response:', JSON.stringify(responseData, null, 2));

    if (responseData.errors) {
      console.error('Erro Autentique:', responseData.errors);
      return res.status(400).json({ 
        success: false, 
        error: responseData.errors[0]?.message || 'Erro na API Autentique' 
      });
    }

    const document = responseData.data?.document;
    if (!document) {
      return res.status(404).json({ success: false, error: 'Documento nao encontrado na Autentique' });
    }

    const signatures = document.signatures || [];
    let newStatus = 'pending';
    
    const clientSignature = signatures.find(s => s.email === lead.email) || signatures[signatures.length - 1];
    
    if (clientSignature?.signed?.created_at) {
      newStatus = 'signed';
    } else if (clientSignature?.rejected?.created_at) {
      newStatus = 'rejected';
    }
    
    const signature = clientSignature;

    if (newStatus !== lead.signature_status) {
      await query(
        `UPDATE ${tableName} SET signature_status = $1 WHERE id = $2`,
        [newStatus, lead_id]
      );

      if (newStatus === 'signed') {
        let activityTable = 'activities';
        let leadIdColumn = 'lead_id';
        if (tableName === 'leads_pj') {
          activityTable = 'activities_pj';
        } else if (tableName === 'referrals') {
          activityTable = 'referral_activities';
          leadIdColumn = 'referral_id';
        }
        
        await query(
          `INSERT INTO ${activityTable} (${leadIdColumn}, type, title, description, created_at) VALUES ($1, $2, $3, $4, $5)`,
          [lead_id, 'note', 'Contrato assinado', 'Cliente assinou o contrato via Autentique', new Date().toISOString()]
        );

        try {
          const downloadQuery = `query {
            document(id: "${autentiqueId}") {
              files {
                signed
              }
            }
          }`;

          const downloadResponse = await axios.post(AUTENTIQUE_API_URL, {
            query: downloadQuery
          }, {
            headers: {
              'Authorization': `Bearer ${AUTENTIQUE_TOKEN}`,
              'Content-Type': 'application/json'
            },
            timeout: 30000
          });

          const signedFileUrl = downloadResponse.data?.data?.document?.files?.signed;
          
          if (signedFileUrl) {
            const pdfResponse = await axios.get(signedFileUrl, {
              responseType: 'arraybuffer',
              timeout: 60000
            });

            const signedFileName = `${lead_id}_signed_${Date.now()}.pdf`;
            const signedFilePath = path.join(process.cwd(), 'uploads', signedFileName);
            
            fs.writeFileSync(signedFilePath, pdfResponse.data);
            
            const signedContractUrl = `/uploads/${signedFileName}`;
            await query(
              `UPDATE ${tableName} SET contract_url = $1, contract_signed_at = $2 WHERE id = $3`,
              [signedContractUrl, new Date().toISOString(), lead_id]
            );
            
            console.log(`[Autentique] Contrato assinado salvo: ${signedContractUrl}`);
          }
        } catch (downloadError) {
          console.error('[Autentique] Erro ao baixar contrato assinado:', downloadError.message);
        }
      }
    }

    res.json({
      success: true,
      status: newStatus,
      document: {
        id: document.id,
        name: document.name,
        signature: signature ? {
          name: signature.name,
          email: signature.email,
          signed_at: signature.signed?.created_at || null,
          rejected_at: signature.rejected?.created_at || null,
          rejection_reason: signature.rejected?.reason || null
        } : null
      }
    });
  } catch (error) {
    console.error('Erro ao verificar status Autentique:', error);
    res.status(500).json({ success: false, error: error.message || 'Erro ao verificar status' });
  }
});

router.get('/autentiqueTest', authMiddleware, async (req, res) => {
  try {
    const AUTENTIQUE_TOKEN = process.env.AUTENTIQUE_TOKEN;
    if (!AUTENTIQUE_TOKEN) {
      return res.status(500).json({ success: false, error: 'Token Autentique nao configurado' });
    }

    const graphqlQuery = `
      query {
        me {
          id
          name
          email
        }
      }
    `;

    const response = await axios.post(AUTENTIQUE_API_URL, {
      query: graphqlQuery
    }, {
      headers: {
        'Authorization': `Bearer ${AUTENTIQUE_TOKEN}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    if (response.data.errors) {
      console.error('Erro Autentique Test:', response.data.errors);
      return res.status(400).json({ 
        success: false, 
        error: response.data.errors[0]?.message || 'Erro na API Autentique',
        details: response.data.errors
      });
    }

    const userData = response.data.data?.me;
    
    res.json({
      success: true,
      message: 'Conexao com Autentique estabelecida com sucesso!',
      account: userData
    });
  } catch (error) {
    console.error('Erro ao testar Autentique:', error.response?.data || error.message);
    res.status(500).json({ 
      success: false, 
      error: error.response?.data?.errors?.[0]?.message || error.message || 'Erro ao conectar com Autentique'
    });
  }
});

router.get('/indicacoes-agent-dashboard', authMiddleware, async (req, res) => {
  try {
    const agentId = req.user.id;

    const agentResult = await query('SELECT erp_agent_id FROM agents WHERE id = $1', [agentId]);
    if (!agentResult.rows.length) {
      return res.status(404).json({ success: false, error: 'Agente não encontrado.' });
    }

    const erpAgentId = agentResult.rows[0].erp_agent_id;
    if (!erpAgentId) {
      return res.json({
        success: true,
        totais: { vendas: 0, valor_total: 0, ticket_medio: 0 },
        series: { vendas_por_dia: [], valor_por_dia: [] },
        ultimas_vendas: [],
        erp_agent_id_missing: true
      });
    }

    const erpAuthToken = process.env.ERP_AUTH_TOKEN;
    if (!erpAuthToken) {
      return res.status(500).json({ success: false, error: 'ERP_AUTH_TOKEN não configurado.' });
    }

    const authHeader = erpAuthToken.startsWith('Bearer ') ? erpAuthToken : `Bearer ${erpAuthToken}`;
    const erpUrl = 'http://erp.wescctech.com.br:8080/BOMPASTOR/api/API_VENDAS_INDICACAO_AGENTES';

    console.log(`[Indicações Meu Painel] Fetching ERP data for erp_agent_id=${erpAgentId}...`);
    const erpResponse = await fetch(erpUrl, {
      method: 'GET',
      headers: { 'Authorization': authHeader, 'Accept': 'application/json' }
    });

    if (!erpResponse.ok) {
      return res.status(502).json({ success: false, error: `ERP retornou status ${erpResponse.status}` });
    }

    const erpData = await erpResponse.json();
    const allRecords = Array.isArray(erpData) ? erpData : [];
    console.log(`[Indicações Meu Painel] ERP returned ${allRecords.length} total records`);

    const agentRecords = allRecords.filter(r => {
      const recordErpId = r.id_agente != null ? Number(r.id_agente) : null;
      return recordErpId === Number(erpAgentId);
    });
    console.log(`[Indicações Meu Painel] ${agentRecords.length} records match erp_agent_id=${erpAgentId}`);

    const vendasEfetivadas = agentRecords.filter(r => {
      const vp = (r.valores_pagos || '').toString().trim().toUpperCase();
      return vp === 'SIM';
    });
    console.log(`[Indicações Meu Painel] ${vendasEfetivadas.length} records with valores_pagos=SIM`);

    let valorTotal = 0;
    const vendasPorDia = {};
    const valorPorDia = {};

    for (const venda of vendasEfetivadas) {
      const valor = parseBRCurrency(venda.valor_contrato);
      valorTotal += valor;

      let diaKey = 'sem_data';
      if (venda.data_contrato) {
        const parsedDate = new Date(venda.data_contrato);
        if (!isNaN(parsedDate.getTime())) {
          diaKey = parsedDate.toISOString().split('T')[0];
        }
      }

      if (diaKey !== 'sem_data') {
        vendasPorDia[diaKey] = (vendasPorDia[diaKey] || 0) + 1;
        valorPorDia[diaKey] = (valorPorDia[diaKey] || 0) + valor;
      }
    }

    const totalVendas = vendasEfetivadas.length;
    const ticketMedio = totalVendas > 0 ? Number((valorTotal / totalVendas).toFixed(2)) : 0;

    const sortedDays = Object.keys(vendasPorDia).sort();

    const ultimasVendas = vendasEfetivadas
      .filter(v => v.data_contrato && !isNaN(new Date(v.data_contrato).getTime()))
      .sort((a, b) => new Date(b.data_contrato) - new Date(a.data_contrato))
      .slice(0, 50)
      .map(v => ({
        nome_indicado: v.nome_indicado || '',
        data_contrato: v.data_contrato || '',
        valor_contrato: parseBRCurrency(v.valor_contrato),
        canal: v.canal || '',
        situacao_contrato: v.situacao_contrato || '',
        contrato_servicos: v.contrato_servicos || ''
      }));

    res.json({
      success: true,
      totais: {
        vendas: totalVendas,
        valor_total: Number(valorTotal.toFixed(2)),
        ticket_medio: ticketMedio
      },
      series: {
        vendas_por_dia: sortedDays.map(dia => ({ dia, vendas: vendasPorDia[dia] || 0 })),
        valor_por_dia: sortedDays.map(dia => ({ dia, valor: valorPorDia[dia] || 0 }))
      },
      ultimas_vendas: ultimasVendas
    });
  } catch (error) {
    console.error('[Indicações Meu Painel] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/referral-paid-sales', authMiddleware, loadAgentMiddleware, async (req, res) => {
  try {
    const erpAuthToken = process.env.ERP_AUTH_TOKEN;
    if (!erpAuthToken) {
      return res.status(500).json({ success: false, error: 'ERP_AUTH_TOKEN não configurado.' });
    }

    const authHeader = erpAuthToken.startsWith('Bearer ') ? erpAuthToken : `Bearer ${erpAuthToken}`;
    const erpUrl = 'http://erp.wescctech.com.br:8080/BOMPASTOR/api/API_DADOS_VENDAS_INDICACOES';

    console.log('[Comissões] Fetching ERP sales data from API_DADOS_VENDAS_INDICACOES...');
    const erpResponse = await fetch(erpUrl, {
      method: 'GET',
      headers: { 'Authorization': authHeader, 'Accept': 'application/json' }
    });

    if (!erpResponse.ok) {
      return res.status(502).json({ success: false, error: `ERP retornou status ${erpResponse.status}` });
    }

    const erpData = await erpResponse.json();
    const allSales = Array.isArray(erpData) ? erpData : [];
    console.log(`[Comissões] ERP returned ${allSales.length} total records`);

    const paidSales = allSales.filter(r => {
      const vp = (r.valores_pagos || '').toString().trim().toUpperCase();
      return vp === 'SIM';
    });
    console.log(`[Comissões] ${paidSales.length} records with valores_pagos=SIM`);

    const existingResult = await query('SELECT sale_identifier FROM processed_referral_sales');
    const existingIdentifiers = new Set(existingResult.rows.map(r => r.sale_identifier));
    console.log(`[Comissões] ${existingIdentifiers.size} previously processed sales in DB`);

    const seenIdentifiers = new Set();
    const paidByCpfIndicado = {};
    let duplicatesSkipped = 0;
    const newSalesToPersist = [];

    for (const sale of paidSales) {
      const contratoId = sale.contrato_servicos ? String(sale.contrato_servicos).trim() : '';
      const cpfIndicado = sale.cpf_indicado ? String(sale.cpf_indicado).replace(/\D/g, '') : '';
      const cpfIndicador = sale.cpf_indicador ? String(sale.cpf_indicador).replace(/\D/g, '') : '';
      const valorContrato = sale.valor_contrato ? String(sale.valor_contrato).trim() : '';
      const dataContrato = sale.data_contrato ? String(sale.data_contrato).trim() : '';

      let saleIdentifier = '';
      if (contratoId) {
        saleIdentifier = `contrato:${contratoId}`;
      } else {
        const compositeKey = [cpfIndicado || cpfIndicador, valorContrato, dataContrato].filter(Boolean).join('|');
        saleIdentifier = `composite:${compositeKey}`;
      }

      if (!saleIdentifier || saleIdentifier === 'contrato:' || saleIdentifier === 'composite:') {
        continue;
      }

      if (seenIdentifiers.has(saleIdentifier)) {
        duplicatesSkipped++;
        continue;
      }
      seenIdentifiers.add(saleIdentifier);

      if (!existingIdentifiers.has(saleIdentifier)) {
        newSalesToPersist.push({
          saleIdentifier,
          cpf: cpfIndicador,
          phone: sale.cel_indicador ? String(sale.cel_indicador).replace(/\D/g, '') : '',
          name: sale.nome_indicador || '',
          contratoId,
          valorContrato,
          dataContrato
        });
      }

      if (cpfIndicado && cpfIndicado.length >= 11) {
        if (!paidByCpfIndicado[cpfIndicado]) {
          paidByCpfIndicado[cpfIndicado] = [];
        }
        paidByCpfIndicado[cpfIndicado].push({
          contrato_servicos: contratoId,
          valor_contrato: valorContrato,
          data_contrato: dataContrato
        });
      }
    }

    if (newSalesToPersist.length > 0) {
      console.log(`[Comissões] Persisting ${newSalesToPersist.length} new sales to processed_referral_sales`);
      for (const s of newSalesToPersist) {
        try {
          await query(
            `INSERT INTO processed_referral_sales (sale_identifier, indicator_cpf, indicator_phone, indicator_name, contrato_servicos, valor_contrato, data_contrato)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (sale_identifier) DO NOTHING`,
            [s.saleIdentifier, s.cpf || null, s.phone || null, s.name || null, s.contratoId || null, s.valorContrato || null, s.dataContrato || null]
          );
        } catch (persistErr) {
          console.error(`[Comissões] Error persisting sale ${s.saleIdentifier}:`, persistErr.message);
        }
      }
    }

    const usedContractsResult = await query('SELECT contrato_servicos, referral_id, cpf_indicado FROM processed_referral_contracts');
    const usedContracts = {};
    for (const row of usedContractsResult.rows) {
      usedContracts[row.contrato_servicos] = {
        referralId: row.referral_id,
        cpfIndicado: row.cpf_indicado
      };
    }

    const uniquePaidCount = seenIdentifiers.size;
    const paidCpfIndicadoCount = Object.keys(paidByCpfIndicado).length;
    console.log(`[Comissões] ${uniquePaidCount} unique sales (${duplicatesSkipped} duplicates skipped), ${paidCpfIndicadoCount} unique CPFs indicados with paid sales, ${Object.keys(usedContracts).length} contracts already used`);

    res.json({
      success: true,
      totalPaidSales: uniquePaidCount,
      duplicatesSkipped,
      paidByCpfIndicado,
      usedContracts
    });
  } catch (error) {
    console.error('[Comissões] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/referral-use-contract', authMiddleware, async (req, res) => {
  try {
    const contratoServicos = req.body.contratoServicos || req.body.contrato_servicos;
    const referralId = req.body.referralId || req.body.referral_id;
    const cpfIndicado = req.body.cpfIndicado || req.body.cpf_indicado;

    if (!contratoServicos || !referralId) {
      return res.status(400).json({ success: false, error: 'contratoServicos and referralId are required' });
    }

    const result = await query(
      `INSERT INTO processed_referral_contracts (contrato_servicos, referral_id, cpf_indicado)
       VALUES ($1, $2, $3)
       ON CONFLICT (contrato_servicos) DO NOTHING
       RETURNING *`,
      [String(contratoServicos).trim(), referralId, cpfIndicado || null]
    );

    if (result.rows.length === 0) {
      return res.json({ success: false, alreadyUsed: true, message: 'Contract already used for another commission' });
    }

    console.log(`[Comissões] Contract ${contratoServicos} recorded for referral ${referralId}`);
    res.json({ success: true, contract: result.rows[0] });
  } catch (error) {
    console.error('[Comissões] Error recording contract:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

function getWeeklyCycleDates(referenceDate = new Date()) {
  const d = new Date(referenceDate);
  const dayOfWeek = d.getDay();

  let cycleEnd = new Date(d);
  let cycleStart = new Date(d);

  if (dayOfWeek === 3) {
    cycleEnd.setDate(d.getDate() - 1);
    cycleEnd.setHours(23, 59, 59, 999);
    cycleStart.setDate(d.getDate() - 6);
    cycleStart.setHours(0, 0, 0, 0);
  } else {
    const daysToLastTuesday = ((dayOfWeek + 7 - 2) % 7) || 7;
    cycleEnd = new Date(d);
    cycleEnd.setDate(d.getDate() - daysToLastTuesday);
    cycleEnd.setHours(23, 59, 59, 999);
    cycleStart = new Date(cycleEnd);
    cycleStart.setDate(cycleEnd.getDate() - 5);
    cycleStart.setHours(0, 0, 0, 0);
  }

  return {
    start: cycleStart,
    end: cycleEnd,
    label: `${cycleStart.toISOString().split('T')[0]} a ${cycleEnd.toISOString().split('T')[0]}`
  };
}

async function runWeeklyCommissionBatch() {
  console.log('[Commission Batch] Starting weekly batch generation...');

  try {
    const erpAuthToken = process.env.ERP_AUTH_TOKEN;
    if (!erpAuthToken) {
      console.error('[Commission Batch] ERP_AUTH_TOKEN not configured');
      return { success: false, error: 'ERP_AUTH_TOKEN not configured' };
    }

    const authHeader = erpAuthToken.startsWith('Bearer ') ? erpAuthToken : `Bearer ${erpAuthToken}`;
    const erpUrl = 'http://erp.wescctech.com.br:8080/BOMPASTOR/api/API_DADOS_VENDAS_INDICACOES';

    const erpResponse = await fetch(erpUrl, {
      method: 'GET',
      headers: { 'Authorization': authHeader, 'Accept': 'application/json' }
    });

    if (!erpResponse.ok) throw new Error(`ERP API error: ${erpResponse.status}`);
    const erpData = await erpResponse.json();
    const allSales = Array.isArray(erpData) ? erpData : [];

    const paidSales = allSales.filter(r => {
      const vp = (r.valores_pagos || '').toString().trim().toUpperCase();
      return vp === 'SIM';
    });

    console.log(`[Commission Batch] ERP returned ${allSales.length} records, ${paidSales.length} paid`);

    const existingResult = await query('SELECT contrato_servicos FROM commission_payment_control');
    const existingContracts = new Set(existingResult.rows.map(r => r.contrato_servicos));

    const cycle = getWeeklyCycleDates();
    let newCount = 0;

    const newEligible = [];
    for (const sale of paidSales) {
      const contratoId = sale.contrato_servicos ? String(sale.contrato_servicos).trim() : '';
      if (!contratoId || existingContracts.has(contratoId)) continue;

      newEligible.push(sale);
      existingContracts.add(contratoId);

      await query(
        `INSERT INTO commission_payment_control 
         (cpf_indicador, nome_indicador, cel_indicador, cpf_indicado, nome_indicado, data_contrato, valor_contrato, contrato_servicos, status_pagamento, periodo_pagamento)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'elegivel', $9)
         ON CONFLICT (contrato_servicos) DO NOTHING`,
        [
          sale.cpf_indicador || null,
          sale.nome_indicador || null,
          sale.cel_indicador || null,
          sale.cpf_indicado || null,
          sale.nome_indicado || null,
          sale.data_contrato || null,
          sale.valor_contrato || null,
          contratoId,
          cycle.label
        ]
      );
      newCount++;
    }

    console.log(`[Commission Batch] Registered ${newCount} new eligible commissions`);

    const elegiveisResult = await query(
      "SELECT * FROM commission_payment_control WHERE status_pagamento = 'elegivel' AND lote_pagamento_id IS NULL"
    );
    const elegiveis = elegiveisResult.rows;

    if (elegiveis.length === 0) {
      console.log('[Commission Batch] No eligible commissions to batch');
      return { success: true, newCommissions: newCount, batchId: null, message: 'No eligible commissions for batch' };
    }

    const indicatorMap = {};
    for (const e of elegiveis) {
      const key = e.cpf_indicador || e.nome_indicador || 'unknown';
      if (!indicatorMap[key]) {
        indicatorMap[key] = {
          nome: e.nome_indicador,
          cpf: e.cpf_indicador,
          cel: e.cel_indicador,
          count: 0,
          total: 0
        };
      }
      indicatorMap[key].count += 1;
      const val = parseBRCurrency(e.valor_contrato);
      indicatorMap[key].total += val;
    }

    const totalIndicadores = Object.keys(indicatorMap).length;
    const valorTotal = Object.values(indicatorMap).reduce((s, i) => s + i.total, 0);

    const batchResult = await query(
      `INSERT INTO commission_payment_batches (periodo_inicio, periodo_fim, total_indicadores, valor_total, status)
       VALUES ($1, $2, $3, $4, 'aberto') RETURNING id`,
      [cycle.start, cycle.end, totalIndicadores, valorTotal]
    );
    const batchId = batchResult.rows[0].id;

    const ids = elegiveis.map(e => e.id);
    await query(
      `UPDATE commission_payment_control SET lote_pagamento_id = $1 WHERE id = ANY($2)`,
      [batchId, ids]
    );

    console.log(`[Commission Batch] Batch #${batchId} created: ${totalIndicadores} indicators, R$ ${valorTotal.toFixed(2)}`);

    return {
      success: true,
      newCommissions: newCount,
      batchId,
      totalIndicadores,
      valorTotal,
      cycle: cycle.label,
      indicators: Object.values(indicatorMap)
    };
  } catch (error) {
    console.error('[Commission Batch] Error:', error.message);
    return { success: false, error: error.message };
  }
}

router.post('/commission-payment/run-batch', authMiddleware, loadAgentMiddleware, requireRole('admin', 'supervisor'), async (req, res) => {
  try {
    const result = await runWeeklyCommissionBatch();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/commission-payment/batches', authMiddleware, loadAgentMiddleware, requireRole('admin', 'supervisor'), async (req, res) => {
  try {
    const result = await query('SELECT * FROM commission_payment_batches ORDER BY created_at DESC LIMIT 50');
    res.json({ success: true, batches: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/commission-payment/control', authMiddleware, loadAgentMiddleware, requireRole('admin', 'supervisor'), async (req, res) => {
  try {
    const { status, lote_id, limit: lim } = req.query;
    let sql = 'SELECT * FROM commission_payment_control WHERE 1=1';
    const params = [];

    if (status) {
      params.push(status);
      sql += ` AND status_pagamento = $${params.length}`;
    }
    if (lote_id) {
      params.push(parseInt(lote_id));
      sql += ` AND lote_pagamento_id = $${params.length}`;
    }

    sql += ` ORDER BY created_at DESC LIMIT ${parseInt(lim) || 500}`;

    const result = await query(sql, params);
    res.json({ success: true, records: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/commission-payment/summary', authMiddleware, loadAgentMiddleware, requireRole('admin', 'supervisor'), async (req, res) => {
  try {
    const statusResult = await query(`
      SELECT status_pagamento, COUNT(*) as total
      FROM commission_payment_control GROUP BY status_pagamento
    `);

    const batchResult = await query(`
      SELECT COUNT(*) as total_batches, 
             COUNT(*) FILTER (WHERE status = 'aberto') as abertos,
             COUNT(*) FILTER (WHERE status = 'pago') as pagos
      FROM commission_payment_batches
    `);

    res.json({
      success: true,
      byStatus: statusResult.rows,
      batches: batchResult.rows[0] || {}
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/commission-payment/confirm/:id', authMiddleware, loadAgentMiddleware, requireRole('admin', 'supervisor'), async (req, res) => {
  try {
    const { id } = req.params;
    const userEmail = req.user?.email || req.user?.userEmail || 'admin';

    const result = await query(
      `UPDATE commission_payment_control 
       SET status_pagamento = 'pago', data_confirmacao_pagamento = NOW(), usuario_confirmacao = $1
       WHERE id = $2 AND status_pagamento = 'elegivel' RETURNING *`,
      [userEmail, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Record not found or already paid' });
    }

    res.json({ success: true, record: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/commission-payment/confirm-batch/:batchId', authMiddleware, loadAgentMiddleware, requireRole('admin', 'supervisor'), async (req, res) => {
  try {
    const { batchId } = req.params;
    const userEmail = req.user?.email || req.user?.userEmail || 'admin';

    const updateResult = await query(
      `UPDATE commission_payment_control 
       SET status_pagamento = 'pago', data_confirmacao_pagamento = NOW(), usuario_confirmacao = $1
       WHERE lote_pagamento_id = $2 AND status_pagamento = 'elegivel'`,
      [userEmail, parseInt(batchId)]
    );

    await query(
      `UPDATE commission_payment_batches SET status = 'pago' WHERE id = $1`,
      [parseInt(batchId)]
    );

    res.json({ success: true, updatedCount: updateResult.rowCount });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

async function getEmailSettings() {
  const result = await query('SELECT * FROM email_commission_settings ORDER BY id DESC LIMIT 1');
  return result.rows[0] || null;
}

async function getCommissionReportData() {
  const cycle = getWeeklyCycleDates();

  const batchResult = await query(
    `SELECT id FROM commission_payment_batches WHERE periodo_inicio = $1 AND periodo_fim = $2 ORDER BY id DESC LIMIT 1`,
    [cycle.start, cycle.end]
  );
  const currentBatchId = batchResult.rows[0]?.id;

  let controlResult;
  if (currentBatchId) {
    controlResult = await query(
      "SELECT * FROM commission_payment_control WHERE lote_pagamento_id = $1 ORDER BY nome_indicador, created_at",
      [currentBatchId]
    );
  } else {
    controlResult = await query(
      "SELECT * FROM commission_payment_control WHERE status_pagamento = 'elegivel' AND lote_pagamento_id IS NULL ORDER BY nome_indicador, created_at"
    );
  }
  const records = controlResult.rows;

  const indicatorMap = {};
  for (const r of records) {
    const key = r.cpf_indicador || r.nome_indicador || 'unknown';
    if (!indicatorMap[key]) {
      indicatorMap[key] = {
        nome: r.nome_indicador || '-',
        cpf: r.cpf_indicador || '-',
        cel: r.cel_indicador || '-',
        count: 0,
        total: 0,
        details: []
      };
    }
    indicatorMap[key].count += 1;
    const val = parseBRCurrency(r.valor_contrato);
    indicatorMap[key].total += val;
    indicatorMap[key].details.push(r);
  }

  const totalIndicadores = Object.keys(indicatorMap).length;
  const totalIndicacoes = records.length;
  const valorTotal = Object.values(indicatorMap).reduce((s, i) => s + i.total, 0);

  return { cycle, indicators: indicatorMap, totalIndicadores, totalIndicacoes, valorTotal, records };
}

function buildCommissionEmailHtml(data) {
  const { cycle, indicators, totalIndicadores, totalIndicacoes, valorTotal, records } = data;

  const formatDate = (d) => {
    if (!d) return '-';
    try {
      const dt = new Date(d);
      return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
    } catch { return String(d); }
  };

  const periodoInicio = formatDate(cycle.start);
  const periodoFim = formatDate(cycle.end);

  let summaryHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 900px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #f59e0b, #d97706); padding: 20px 30px; border-radius: 12px; color: white; margin-bottom: 24px;">
        <h1 style="margin: 0; font-size: 22px;">Relatório Semanal de Comissões de Indicação</h1>
        <p style="margin: 8px 0 0; font-size: 14px; opacity: 0.9;">Período: ${periodoInicio} → ${periodoFim}</p>
      </div>

      <div style="display: flex; gap: 16px; margin-bottom: 24px;">
        <div style="flex: 1; background: #fef3c7; padding: 16px; border-radius: 8px; text-align: center;">
          <div style="font-size: 28px; font-weight: bold; color: #92400e;">${totalIndicadores}</div>
          <div style="font-size: 12px; color: #78350f;">Indicadores</div>
        </div>
        <div style="flex: 1; background: #dbeafe; padding: 16px; border-radius: 8px; text-align: center;">
          <div style="font-size: 28px; font-weight: bold; color: #1e40af;">${totalIndicacoes}</div>
          <div style="font-size: 12px; color: #1e3a5f;">Indicações</div>
        </div>
        <div style="flex: 1; background: #d1fae5; padding: 16px; border-radius: 8px; text-align: center;">
          <div style="font-size: 28px; font-weight: bold; color: #065f46;">R$ ${valorTotal.toFixed(2)}</div>
          <div style="font-size: 12px; color: #064e3b;">Valor Total</div>
        </div>
      </div>

      <h2 style="font-size: 16px; color: #1f2937; border-bottom: 2px solid #f59e0b; padding-bottom: 8px;">Resumo por Indicador</h2>
      <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 24px;">
        <thead>
          <tr style="background: #f9fafb;">
            <th style="padding: 10px; border: 1px solid #e5e7eb; text-align: left;">Indicador</th>
            <th style="padding: 10px; border: 1px solid #e5e7eb; text-align: left;">CPF</th>
            <th style="padding: 10px; border: 1px solid #e5e7eb; text-align: left;">Telefone</th>
            <th style="padding: 10px; border: 1px solid #e5e7eb; text-align: center;">Qtde</th>
            <th style="padding: 10px; border: 1px solid #e5e7eb; text-align: right;">Valor Total</th>
          </tr>
        </thead>
        <tbody>`;

  for (const [key, ind] of Object.entries(indicators)) {
    summaryHtml += `
          <tr>
            <td style="padding: 8px 10px; border: 1px solid #e5e7eb;">${ind.nome}</td>
            <td style="padding: 8px 10px; border: 1px solid #e5e7eb;">${ind.cpf}</td>
            <td style="padding: 8px 10px; border: 1px solid #e5e7eb;">${ind.cel}</td>
            <td style="padding: 8px 10px; border: 1px solid #e5e7eb; text-align: center;">${ind.count}</td>
            <td style="padding: 8px 10px; border: 1px solid #e5e7eb; text-align: right;">R$ ${ind.total.toFixed(2)}</td>
          </tr>`;
  }

  summaryHtml += `
        </tbody>
      </table>

      <h2 style="font-size: 16px; color: #1f2937; border-bottom: 2px solid #3b82f6; padding-bottom: 8px;">Detalhamento (Auditoria)</h2>
      <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 24px;">
        <thead>
          <tr style="background: #f9fafb;">
            <th style="padding: 8px; border: 1px solid #e5e7eb; text-align: left;">Indicador</th>
            <th style="padding: 8px; border: 1px solid #e5e7eb; text-align: left;">CPF Indicado</th>
            <th style="padding: 8px; border: 1px solid #e5e7eb; text-align: left;">Nome Indicado</th>
            <th style="padding: 8px; border: 1px solid #e5e7eb; text-align: left;">Data Contrato</th>
            <th style="padding: 8px; border: 1px solid #e5e7eb; text-align: right;">Valor Contrato</th>
          </tr>
        </thead>
        <tbody>`;

  for (const r of records) {
    summaryHtml += `
          <tr>
            <td style="padding: 6px 8px; border: 1px solid #e5e7eb;">${r.nome_indicador || '-'}</td>
            <td style="padding: 6px 8px; border: 1px solid #e5e7eb;">${r.cpf_indicado || '-'}</td>
            <td style="padding: 6px 8px; border: 1px solid #e5e7eb;">${r.nome_indicado || '-'}</td>
            <td style="padding: 6px 8px; border: 1px solid #e5e7eb;">${r.data_contrato || '-'}</td>
            <td style="padding: 6px 8px; border: 1px solid #e5e7eb; text-align: right;">${r.valor_contrato || '-'}</td>
          </tr>`;
  }

  summaryHtml += `
        </tbody>
      </table>

      <div style="font-size: 11px; color: #9ca3af; text-align: center; padding-top: 16px; border-top: 1px solid #e5e7eb;">
        Bom Flow CRM — Relatório gerado automaticamente em ${new Date().toLocaleString('pt-BR')}
      </div>
    </div>`;

  return summaryHtml;
}

async function sendCommissionReport(options = {}) {
  const { tipo_envio = 'automatico', usuario_envio = 'system' } = options;

  const settings = await getEmailSettings();
  if (!settings || !settings.smtp_password) {
    throw new Error('Configurações SMTP não encontradas ou senha não definida. Configure em Indicações → Automações.');
  }

  const reportData = await getCommissionReportData();

  if (reportData.records.length === 0 && tipo_envio === 'automatico') {
    console.log('[Commission Email] No eligible commissions to report, skipping automatic send');
    return { success: true, skipped: true, message: 'Sem comissões elegíveis para reportar' };
  }

  if (tipo_envio === 'automatico') {
    const existingResult = await query(
      `SELECT id FROM commission_payment_batches WHERE email_enviado = TRUE AND periodo_inicio = $1 AND periodo_fim = $2`,
      [reportData.cycle.start, reportData.cycle.end]
    );
    if (existingResult.rows.length > 0) {
      console.log('[Commission Email] Report already sent for this period, skipping');
      return { success: true, skipped: true, message: 'Relatório já enviado para este período' };
    }
  }

  const formatDateBR = (d) => {
    const dt = new Date(d);
    return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
  };

  const subject = `Relatório Semanal de Comissões de Indicação - Período: ${formatDateBR(reportData.cycle.start)} - ${formatDateBR(reportData.cycle.end)}`;
  const html = buildCommissionEmailHtml(reportData);

  const transporter = nodemailer.createTransport({
    host: settings.smtp_server,
    port: settings.smtp_port,
    secure: true,
    auth: {
      user: settings.smtp_user,
      pass: settings.smtp_password
    },
    tls: { rejectUnauthorized: false }
  });

  const recipients = (settings.email_to || '').split(',').map(e => e.trim()).filter(Boolean);
  if (recipients.length === 0) throw new Error('Nenhum destinatário configurado');

  await transporter.sendMail({
    from: settings.email_from || settings.smtp_user,
    to: recipients.join(', '),
    subject,
    html
  });

  console.log(`[Commission Email] Report sent to ${recipients.join(', ')}`);

  const batchResult = await query(
    `SELECT id FROM commission_payment_batches WHERE periodo_inicio = $1 AND periodo_fim = $2 ORDER BY id DESC LIMIT 1`,
    [reportData.cycle.start, reportData.cycle.end]
  );

  if (batchResult.rows.length > 0) {
    await query(
      `UPDATE commission_payment_batches SET email_enviado = TRUE, data_envio_email = NOW(), usuario_envio = $1, tipo_envio = $2 WHERE id = $3`,
      [usuario_envio, tipo_envio, batchResult.rows[0].id]
    );
  }

  return {
    success: true,
    recipients,
    totalIndicadores: reportData.totalIndicadores,
    totalIndicacoes: reportData.totalIndicacoes,
    valorTotal: reportData.valorTotal,
    periodo: reportData.cycle.label
  };
}

export { runWeeklyCommissionBatch, sendCommissionReport };

router.get('/email-commission-settings', authMiddleware, loadAgentMiddleware, requireRole('admin', 'supervisor'), async (req, res) => {
  try {
    const settings = await getEmailSettings();
    if (settings) {
      settings.smtp_password = settings.smtp_password ? '********' : '';
    }
    res.json({ success: true, settings: settings || null });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/email-commission-settings', authMiddleware, loadAgentMiddleware, requireRole('admin', 'supervisor'), async (req, res) => {
  try {
    const { smtp_server, smtp_port, smtp_user, smtp_password, email_from, email_to,
            smtpServer, smtpPort, smtpUser, smtpPassword, emailFrom, emailTo } = req.body;

    const server = smtp_server || smtpServer;
    const port = smtp_port || smtpPort;
    const user = smtp_user || smtpUser;
    const password = smtp_password || smtpPassword;
    const from = email_from || emailFrom;
    const to = email_to || emailTo;

    const existing = await getEmailSettings();

    if (existing) {
      const finalPassword = (password && password !== '********') ? password : existing.smtp_password;
      await query(
        `UPDATE email_commission_settings SET smtp_server = $1, smtp_port = $2, smtp_user = $3, smtp_password = $4, email_from = $5, email_to = $6, updated_at = NOW() WHERE id = $7`,
        [server, parseInt(port), user, finalPassword, from, to, existing.id]
      );
    } else {
      await query(
        `INSERT INTO email_commission_settings (smtp_server, smtp_port, smtp_user, smtp_password, email_from, email_to) VALUES ($1, $2, $3, $4, $5, $6)`,
        [server, parseInt(port), user, password, from, to]
      );
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/commission-report/send', authMiddleware, loadAgentMiddleware, requireRole('admin', 'supervisor'), async (req, res) => {
  try {
    const userEmail = req.user?.email || req.user?.userEmail || 'admin';
    const result = await sendCommissionReport({ tipo_envio: 'manual', usuario_envio: userEmail });
    res.json(result);
  } catch (error) {
    console.error('[Commission Email] Manual send error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/commission-report/test', authMiddleware, loadAgentMiddleware, requireRole('admin', 'supervisor'), async (req, res) => {
  try {
    const settings = await getEmailSettings();
    if (!settings || !settings.smtp_password) {
      return res.status(400).json({ success: false, error: 'Configurações SMTP não encontradas ou senha não definida.' });
    }

    const transporter = nodemailer.createTransport({
      host: settings.smtp_server,
      port: settings.smtp_port,
      secure: true,
      auth: { user: settings.smtp_user, pass: settings.smtp_password },
      tls: { rejectUnauthorized: false }
    });

    const recipients = (settings.email_to || '').split(',').map(e => e.trim()).filter(Boolean);
    if (recipients.length === 0) return res.status(400).json({ success: false, error: 'Nenhum destinatário configurado' });

    const reportData = await getCommissionReportData();
    const html = buildCommissionEmailHtml(reportData);

    await transporter.sendMail({
      from: settings.email_from || settings.smtp_user,
      to: recipients.join(', '),
      subject: `[TESTE] Relatório Semanal de Comissões de Indicação`,
      html
    });

    res.json({ success: true, message: `Email de teste enviado para ${recipients.join(', ')}` });
  } catch (error) {
    console.error('[Commission Email] Test error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
