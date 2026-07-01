import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { getWhatsAppTemplates, getWhatsAppTemplatesByToken, sendWhatsAppMessage, sendWhatsAppMessageWithToken, sendTextMessageWithToken, setContactAttributes, sendChatMessage, getContactByPhone } from '../services/whatsappService.js';
import { query } from '../config/database.js';
import { runAllAutomations, getAutomationLogs } from '../services/automationService.js';
import { createLeadWhatsAppContact, getLeadWhatsAppContacts } from '../services/leadWhatsAppContactService.js';
import { recordOutbound } from '../services/whatsappInboxService.js';

function snakeToCamel(str) {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function convertKeysToCamel(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(item => typeof item === 'object' && item !== null ? convertKeysToCamel(item) : item);
  if (obj instanceof Date) return obj.toISOString();
  return Object.keys(obj).reduce((acc, key) => {
    acc[snakeToCamel(key)] = convertKeysToCamel(obj[key]);
    return acc;
  }, {});
}

const router = Router();

router.get('/templates', authMiddleware, async (req, res) => {
  try {
    const templates = await getWhatsAppTemplates();
    res.json(templates);
  } catch (error) {
    console.error('Error fetching WhatsApp templates:', error);
    res.status(500).json({ message: error.message });
  }
});

router.get('/templates-by-token', authMiddleware, async (req, res) => {
  try {
    const channelToken = req.headers['x-channel-token'];
    if (!channelToken) {
      return res.status(400).json({ message: 'Channel token is required (header "x-channel-token")' });
    }
    const templates = await getWhatsAppTemplatesByToken(channelToken);
    res.json(templates);
  } catch (error) {
    console.error('Error fetching WhatsApp templates by token:', error);
    if (error.message?.includes('Channel cannot be found')) {
      return res.status(400).json({
        message: 'Token inválido ou canal desativado na plataforma WHU. Acesse o painel da Rudo/WHU, verifique se o canal está ativo e gere um novo token se necessário.'
      });
    }
    res.status(500).json({ message: error.message });
  }
});

router.post('/test-send', authMiddleware, async (req, res) => {
  try {
    const { phone, templateId, templateName, channelToken, templateHasVariables } = req.body;

    if (!phone) {
      return res.status(400).json({ success: false, error: 'Número de telefone é obrigatório' });
    }
    if (!templateId) {
      return res.status(400).json({ success: false, error: 'Template é obrigatório' });
    }
    if (!channelToken) {
      return res.status(400).json({ success: false, error: 'Token do canal é obrigatório' });
    }

    const formattedPhone = phone.replace(/\D/g, '');

    const mockLead = {
      name: 'Teste de Envio',
      full_name: 'Teste de Envio',
      phone: formattedPhone,
    };

    const mockAgent = {
      name: req.user?.full_name || req.user?.name || 'Vendedor Teste',
      full_name: req.user?.full_name || req.user?.name || 'Vendedor Teste',
      phone: req.user?.phone || '',
      id: req.user?.id,
    };

    const templateComponents = templateHasVariables === false ? [] : undefined;
    const result = await sendWhatsAppMessageWithToken(mockLead, mockAgent, templateId, channelToken, templateComponents);
    res.json({ success: true, message: `Mensagem de teste enviada para ${formattedPhone}` });
  } catch (error) {
    console.error('Error in test-send:', error);

    let userMessage = error.message;
    if (error.message?.includes('Channel cannot be found')) {
      return res.status(400).json({
        success: false,
        error: 'Token inválido ou canal desativado na plataforma WHU. Acesse o painel da Rudo/WHU, verifique se o canal está ativo e gere um novo token se necessário.'
      });
    }
    if (error.message?.includes('already open')) {
      userMessage = 'Já existe uma conversa aberta com este número na plataforma WHU. Tente com outro número ou aguarde o chat ser fechado.';
    }

    res.status(500).json({ success: false, error: userMessage });
  }
});

router.post('/send-message', authMiddleware, async (req, res) => {
  try {
    const { leadId, leadType, templateId, templateComponents } = req.body;
    
    let lead;
    let tableName;
    
    if (leadType === 'pf') {
      tableName = 'leads';
    } else if (leadType === 'pj') {
      tableName = 'leads_pj';
    } else if (leadType === 'referral') {
      tableName = 'referrals';
    } else {
      return res.status(400).json({ message: 'Invalid lead type' });
    }

    const leadResult = await query(`SELECT * FROM ${tableName} WHERE id = $1`, [leadId]);
    if (leadResult.rows.length === 0) {
      return res.status(404).json({ message: 'Lead not found' });
    }
    lead = leadResult.rows[0];

    const agentId = lead.agent_id || lead.promoter_id;
    let agent = null;
    if (agentId) {
      const agentResult = await query('SELECT * FROM agents WHERE id = $1', [agentId]);
      agent = agentResult.rows[0];
    }

    const result = await sendWhatsAppMessage(lead, agent, templateId, templateComponents);
    
    await query(
      `INSERT INTO automation_logs (automation_type, lead_id, action_type, action_result, success)
       VALUES ($1, $2, $3, $4, $5)`,
      ['manual_whatsapp', leadId, 'send_whatsapp_message', JSON.stringify(result), true]
    );

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Error sending WhatsApp message:', error);
    
    await query(
      `INSERT INTO automation_logs (automation_type, lead_id, action_type, success, error_message)
       VALUES ($1, $2, $3, $4, $5)`,
      ['manual_whatsapp', req.body.leadId, 'send_whatsapp_message', false, error.message]
    ).catch(console.error);

    res.status(500).json({ message: error.message });
  }
});

router.post('/send-and-tag', authMiddleware, async (req, res) => {
  const log = (req.log && typeof req.log.error === 'function') ? req.log.error.bind(req.log) : console.error;
  // Vendedor is derived from the authenticated user, never trusted from the client.
  // Declared outside the try so the error handler can still record who attempted the send.
  let vendedorNome = null;
  let vendedorId = null;
  try {
    const { phone, message, templateId, templateComponents } = req.body;

    if (!phone) {
      return res.status(400).json({ success: false, message: 'Número de telefone é obrigatório' });
    }
    const hasText = typeof message === 'string' && message.trim().length > 0;
    if (!templateId && !hasText) {
      return res.status(400).json({ success: false, message: 'Informe uma mensagem de texto ou selecione um template' });
    }

    try {
      const agentResult = await query(
        'SELECT id, name FROM agents WHERE (email = $1 OR user_email = $1) AND active = true LIMIT 1',
        [req.user.email]
      );
      if (agentResult.rows.length > 0) {
        vendedorId = agentResult.rows[0].id;
        vendedorNome = agentResult.rows[0].name;
      }
    } catch (err) {
      log('[WhatsApp] Failed to resolve vendedor from authenticated user:', err.message);
    }
    if (!vendedorId && req.user?.id) vendedorId = req.user.id;
    if (!vendedorNome) vendedorNome = req.user?.full_name || req.user?.name || null;

    // 1) Send the message to the customer
    const sendResult = await sendChatMessage({ phone, message, templateId, templateComponents, number: phone });

    // 2) Resolve the contactId (from the send response, fallback to lookup by phone)
    let contactId = sendResult.contactId || sendResult.contact?.id || sendResult.contact?._id || null;
    if (!contactId) {
      try {
        const contact = await getContactByPhone(sendResult.brazilNumber || phone);
        contactId = contact?.id || contact?._id || null;
      } catch (err) {
        log('[WhatsApp] Failed to look up contact by phone for tagging:', err.message);
      }
    }

    // 3) Tag the contact with the seller — only when seller data is present (best-effort)
    let tagged = false;
    if (vendedorNome && vendedorId) {
      if (contactId) {
        try {
          await setContactAttributes(contactId, [
            { key: 'vendedor_nome', value: String(vendedorNome), description: 'Nome do vendedor responsável' },
            { key: 'vendedor_id', value: String(vendedorId), description: 'ID do vendedor no CRM' },
          ]);
          tagged = true;
        } catch (err) {
          log('[WhatsApp] Failed to set contact attributes (send not blocked):', err.message);
        }
      } else {
        log('[WhatsApp] No contactId available, skipping seller tagging for', phone);
      }
    }

    // 3.5) Espelha a mensagem enviada na Caixa de Entrada WhatsApp (best-effort)
    await recordOutbound({
      phone,
      text: hasText ? message : '[template]',
      waMessageId:
        sendResult.messageSentId || sendResult.message_sent_id || sendResult.id || null,
      contactId: contactId || null,
      chatId: sendResult.chatId || sendResult.currentChatId || sendResult.chat_id || null,
      vendedorId,
      vendedorNome,
    }).catch((err) => log('[WhatsApp] Falha ao espelhar envio na caixa de entrada (não bloqueia):', err.message));

    // 4) Persist an audit record of the send (best-effort — never blocks the send)
    await query(
      `INSERT INTO automation_logs (automation_type, action_type, action_result, success)
       VALUES ($1, $2, $3, $4)`,
      ['manual_whatsapp', 'send_and_tag', JSON.stringify({
        vendedor: vendedorNome ? { id: vendedorId, name: vendedorNome } : null,
        phone,
        templateId: templateId || null,
        text: hasText ? message : null,
        contactId,
        tagged,
        usedFallback: sendResult.usedFallback || false,
        whuResponse: {
          msg: sendResult.msg || sendResult.message || null,
          status: sendResult.status || null,
          chatId: sendResult.chatId || sendResult.currentChatId || sendResult.chat_id || null,
          messageSentId:
            sendResult.messageSentId || sendResult.message_sent_id || sendResult.id || null,
        },
      }), true]
    ).catch((err) => log('[WhatsApp] Failed to log send-and-tag (send not blocked):', err.message));

    res.json({
      success: true,
      tagged,
      contactId,
      vendedor: vendedorNome ? { id: vendedorId, name: vendedorNome } : null,
      usedFallback: sendResult.usedFallback || false,
    });
  } catch (error) {
    console.error('Error in send-and-tag:', error);

    await query(
      `INSERT INTO automation_logs (automation_type, action_type, action_result, success, error_message)
       VALUES ($1, $2, $3, $4, $5)`,
      ['manual_whatsapp', 'send_and_tag', JSON.stringify({
        vendedor: vendedorNome ? { id: vendedorId, name: vendedorNome } : null,
        phone: req.body?.phone || null,
        templateId: req.body?.templateId || null,
        text: (typeof req.body?.message === 'string' && req.body.message.trim().length > 0) ? req.body.message : null,
      }), false, error.message]
    ).catch((err) => log('[WhatsApp] Failed to log send-and-tag error:', err.message));

    let userMessage = error.message;
    if (error.message?.includes('already open')) {
      userMessage = 'Já existe uma conversa aberta com este número. Tente novamente em instantes.';
    }
    res.status(500).json({ success: false, message: userMessage });
  }
});

router.post('/set-attributes/:contactId', authMiddleware, async (req, res) => {
  try {
    const { contactId } = req.params;
    const { attributes } = req.body;
    
    const result = await setContactAttributes(contactId, attributes);
    res.json(result);
  } catch (error) {
    console.error('Error setting contact attributes:', error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/test-connection', authMiddleware, async (req, res) => {
  try {
    const templates = await getWhatsAppTemplates();
    res.json({ 
      success: true, 
      message: 'Connection successful',
      templatesCount: Array.isArray(templates) ? templates.length : 0 
    });
  } catch (error) {
    console.error('Error testing WhatsApp connection:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/test-automation', authMiddleware, async (req, res) => {
  try {
    const { automationType, automationId, testPhone, templateId, sampleData } = req.body;
    
    if (!testPhone) {
      return res.status(400).json({ message: 'Telefone de teste é obrigatório' });
    }
    if (!templateId) {
      return res.status(400).json({ message: 'Template é obrigatório' });
    }

    const leadName = sampleData?.name || 'Lead de Teste';
    const agentName = req.user?.full_name || req.user?.name || 'Vendedor Teste';

    const mockLead = {
      name: leadName,
      full_name: leadName,
      phone: testPhone,
      email: sampleData?.email || 'teste@exemplo.com',
    };

    const mockAgent = {
      name: agentName,
      full_name: agentName,
      phone: req.user?.phone || '',
      id: req.user?.id,
    };

    // Don't pass templateComponents - let sendWhatsAppMessage determine the correct number of parameters
    const result = await sendWhatsAppMessage(mockLead, mockAgent, templateId, null);
    
    await query(
      `INSERT INTO automation_logs (automation_type, action_type, action_result, success)
       VALUES ($1, $2, $3, $4)`,
      [`test_${automationType}`, 'send_whatsapp', JSON.stringify({ ...result, testPhone, templateId }), true]
    );

    res.json({ 
      success: true, 
      message: `Mensagem de teste enviada para ${testPhone}`,
      ...result 
    });
  } catch (error) {
    console.error('Error testing automation:', error);
    
    await query(
      `INSERT INTO automation_logs (automation_type, action_type, success, error_message)
       VALUES ($1, $2, $3, $4)`,
      [`test_${req.body.automationType}`, 'send_whatsapp', false, error.message]
    ).catch(console.error);

    let userMessage = error.message;
    if (error.message.includes('Chat already open')) {
      userMessage = 'Já existe uma conversa aberta com este número na plataforma WHU. Tente com outro número ou aguarde o chat ser fechado.';
    } else if (error.message.includes('needs components')) {
      userMessage = 'O template requer parâmetros que não foram fornecidos corretamente.';
    }

    res.status(500).json({ message: userMessage });
  }
});

router.get('/automation-logs', authMiddleware, async (req, res) => {
  try {
    const { automationType, status, automationId } = req.query;
    const logs = await getAutomationLogs({ automationType, status, automationId });
    res.json(logs);
  } catch (error) {
    console.error('Error fetching automation logs:', error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/run-automations', authMiddleware, async (req, res) => {
  try {
    await runAllAutomations();
    res.json({ message: 'Automações executadas com sucesso' });
  } catch (error) {
    console.error('Error running automations:', error);
    res.status(500).json({ message: error.message });
  }
});

router.delete('/automation-logs/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    await query('DELETE FROM automation_logs WHERE id = $1', [id]);
    res.json({ message: 'Log removido' });
  } catch (error) {
    console.error('Error deleting automation log:', error);
    res.status(500).json({ message: error.message });
  }
});

router.delete('/automation-logs', authMiddleware, async (req, res) => {
  try {
    const { automationType } = req.query;
    if (automationType) {
      await query('DELETE FROM automation_logs WHERE automation_type = $1', [automationType]);
    } else {
      await query('DELETE FROM automation_logs');
    }
    res.json({ message: 'Logs limpos' });
  } catch (error) {
    console.error('Error clearing automation logs:', error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/indications/leads/:leadId/whatsapp-send', authMiddleware, async (req, res) => {
  try {
    const { leadId } = req.params;
    const { message } = req.body;
    const agentId = req.user.id;

    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, error: 'Mensagem é obrigatória.' });
    }

    const agentResult = await query('SELECT id, name, agent_type, whatsapp_channel_token FROM agents WHERE id = $1', [agentId]);
    if (agentResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Agente não encontrado.' });
    }
    const agent = agentResult.rows[0];

    if (agent.agent_type !== 'indicacoes_atendente') {
      return res.status(403).json({ success: false, error: 'Apenas atendentes de indicações podem enviar mensagens por esta rota.' });
    }

    if (!agent.whatsapp_channel_token) {
      return res.status(400).json({ success: false, error: 'Seu canal WhatsApp não está configurado. Fale com o administrador.' });
    }

    const leadResult = await query('SELECT id, referred_name, referred_phone FROM referrals WHERE id = $1', [leadId]);
    if (leadResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Lead não encontrado.' });
    }
    const lead = leadResult.rows[0];

    if (!lead.referred_phone) {
      return res.status(400).json({ success: false, error: 'Este lead não possui telefone cadastrado.' });
    }

    try {
      await sendTextMessageWithToken({
        number: lead.referred_phone,
        message: message.trim(),
        channelToken: agent.whatsapp_channel_token,
      });
    } catch (sendError) {
      const apiMsg = sendError.apiMessage || sendError.message || '';
      if (apiMsg.toLowerCase().includes('channel cannot be found')) {
        return res.status(400).json({
          success: false,
          error: 'Token inválido ou canal desativado na plataforma WHU. Peça ao administrador para atualizar o seu token.',
        });
      }
      console.error('[WhatsApp Agent Send] Error:', sendError);
      return res.status(500).json({ success: false, error: `Erro ao enviar mensagem: ${apiMsg}` });
    }

    try {
      await createLeadWhatsAppContact({
        leadId,
        agentId,
        message: message.trim(),
        channelToken: agent.whatsapp_channel_token,
      });
    } catch (logError) {
      console.error('[WhatsApp Agent Send] Log insert failed (message was sent):', logError);
    }

    res.json({ success: true, message: `Mensagem enviada para ${lead.referred_name || 'o lead'}.` });
  } catch (error) {
    console.error('[WhatsApp Agent Send] Unexpected error:', error);
    res.status(500).json({ success: false, error: 'Erro interno ao enviar mensagem.' });
  }
});

router.get('/my-channel-token', authMiddleware, async (req, res) => {
  try {
    const agentId = req.user.id;
    const result = await query(
      'SELECT whatsapp_channel_token FROM agents WHERE id = $1',
      [agentId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Agent not found' });
    }
    res.json({ channelToken: result.rows[0].whatsapp_channel_token || null });
  } catch (error) {
    console.error('Error fetching agent channel token:', error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/lead-contacts', authMiddleware, async (req, res) => {
  try {
    const { leadId, message, channelToken } = req.body;
    if (!leadId) {
      return res.status(400).json({ message: 'leadId is required' });
    }
    const contact = await createLeadWhatsAppContact({
      leadId,
      agentId: req.user.id,
      message,
      channelToken,
    });
    res.status(201).json(convertKeysToCamel(contact));
  } catch (error) {
    console.error('Error creating lead WhatsApp contact log:', error);
    res.status(500).json({ message: error.message });
  }
});

router.get('/lead-contacts/:leadId', authMiddleware, async (req, res) => {
  try {
    const contacts = await getLeadWhatsAppContacts(req.params.leadId);
    res.json(contacts.map(convertKeysToCamel));
  } catch (error) {
    console.error('Error fetching lead WhatsApp contacts:', error);
    res.status(500).json({ message: error.message });
  }
});

// Server-side search for leads across all modules (used by Conversa WhatsApp lead selector).
// Filters by name or phone term on the DB instead of downloading every list.
router.get('/search-leads', authMiddleware, async (req, res) => {
  try {
    const term = (req.query.term || '').toString().trim();
    if (term.length < 2) {
      return res.json([]);
    }

    const perTypeLimit = Math.min(parseInt(req.query.limit, 10) || 10, 25);
    const like = `%${term}%`;
    const digits = term.replace(/\D/g, '');
    const phoneLike = digits.length >= 2 ? `%${digits}%` : null;

    // Each query returns id, name, phone. Phone match strips non-digits so a
    // typed number matches formatted values in the DB.
    const buildPhoneCondition = (cols) =>
      phoneLike
        ? cols
            .map(
              (c) =>
                `REGEXP_REPLACE(COALESCE(${c}, ''), '[^0-9]', '', 'g') ILIKE $2`
            )
            .join(' OR ')
        : null;

    const runSearch = async (sql, hasPhone) => {
      const params = hasPhone && phoneLike ? [like, phoneLike] : [like];
      const result = await query(sql, params);
      return result.rows;
    };

    const pfPhone = buildPhoneCondition(['phone', 'whatsapp']);
    const pfSql = `SELECT id, name, phone, stage, agent_id, interest FROM leads
      WHERE (name ILIKE $1${pfPhone ? ` OR ${pfPhone}` : ''})
      ORDER BY created_at DESC LIMIT ${perTypeLimit}`;

    const pjPhone = buildPhoneCondition(['contact_phone']);
    const pjSql = `SELECT id, COALESCE(nome_fantasia, razao_social, contact_name) AS name, contact_phone AS phone FROM leads_pj
      WHERE (COALESCE(nome_fantasia, '') ILIKE $1 OR COALESCE(razao_social, '') ILIKE $1 OR COALESCE(contact_name, '') ILIKE $1${pjPhone ? ` OR ${pjPhone}` : ''})
      ORDER BY created_at DESC LIMIT ${perTypeLimit}`;

    const upsellPhone = buildPhoneCondition(['phone', 'whatsapp']);
    const upsellSql = `SELECT id, name, phone, stage, agent_id, interest FROM leads_upsell
      WHERE (name ILIKE $1${upsellPhone ? ` OR ${upsellPhone}` : ''})
      ORDER BY created_at DESC LIMIT ${perTypeLimit}`;

    const refPhone = buildPhoneCondition(['referred_phone']);
    const refSql = `SELECT id, referred_name AS name, referred_phone AS phone, stage, agent_id, interest FROM referrals
      WHERE (COALESCE(referred_name, '') ILIKE $1${refPhone ? ` OR ${refPhone}` : ''})
      ORDER BY created_at DESC LIMIT ${perTypeLimit}`;

    const [pf, pj, ups, ind] = await Promise.all([
      runSearch(pfSql, true).catch(() => []),
      runSearch(pjSql, true).catch(() => []),
      runSearch(upsellSql, true).catch(() => []),
      runSearch(refSql, true).catch(() => []),
    ]);

    const norm = (rows, type) =>
      (rows || [])
        .map((l) => ({
          id: `${type}-${l.id}`,
          type,
          name: (l.name || '').toString().trim(),
          phone: (l.phone || '').toString().trim(),
          stage: l.stage ?? null,
          agentId: l.agent_id ?? null,
          interest: (l.interest || '').toString().trim() || null,
        }))
        .filter((l) => l.phone && l.phone.replace(/\D/g, '').length >= 10);

    res.json([
      ...norm(pf, 'pf'),
      ...norm(pj, 'pj'),
      ...norm(ups, 'upsell'),
      ...norm(ind, 'indicacao'),
    ]);
  } catch (error) {
    console.error('Error searching leads for Conversa WhatsApp:', error);
    res.status(500).json({ message: error.message });
  }
});

export default router;
