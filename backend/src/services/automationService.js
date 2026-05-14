import { query } from '../config/database.js';
import { sendWhatsAppMessage, sendWhatsAppMessageWithToken } from './whatsappService.js';

async function loadAutomationTeamIds(automations, junctionTable = 'lead_automation_teams') {
  if (!automations || automations.length === 0) return automations;
  const ids = automations.map(a => a.id);
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
  const teamsResult = await query(
    `SELECT automation_id, team_id FROM ${junctionTable} WHERE automation_id IN (${placeholders})`,
    ids
  );
  const teamMap = {};
  for (const row of teamsResult.rows) {
    if (!teamMap[row.automation_id]) teamMap[row.automation_id] = [];
    teamMap[row.automation_id].push(row.team_id);
  }
  return automations.map(a => {
    const fromJunction = teamMap[a.id] || [];
    if (fromJunction.length > 0) {
      a.team_ids = fromJunction;
    } else if (a.team_id) {
      a.team_ids = [a.team_id];
    } else {
      a.team_ids = [];
    }
    return a;
  });
}

export async function checkAndExecuteLeadAutomations() {
  try {
    const automationsResult = await query(`
      SELECT * FROM lead_automations 
      WHERE active = true 
      ORDER BY priority ASC
    `);
    let automations = await loadAutomationTeamIds(automationsResult.rows);

    for (const automation of automations) {
      const triggerConfig = typeof automation.trigger_config === 'string' 
        ? JSON.parse(automation.trigger_config) 
        : automation.trigger_config || {};

      if (automation.trigger_type === 'inactivity' || automation.trigger_type === 'stage_duration') {
        await checkInactivityTrigger(automation, triggerConfig, 'lead', 'leads');
      }
    }
  } catch (error) {
    console.error('Error checking lead automations:', error);
  }
}

export async function checkAndExecuteLeadPJAutomations() {
  try {
    const automationsResult = await query(`
      SELECT * FROM lead_pj_automations 
      WHERE active = true 
      ORDER BY priority ASC
    `);
    let automations = await loadAutomationTeamIds(automationsResult.rows, 'lead_pj_automation_teams');

    for (const automation of automations) {
      const triggerConfig = typeof automation.trigger_config === 'string' 
        ? JSON.parse(automation.trigger_config) 
        : automation.trigger_config || {};

      if (automation.trigger_type === 'inactivity' || automation.trigger_type === 'stage_duration') {
        await checkInactivityTrigger(automation, triggerConfig, 'lead_pj', 'leads_pj');
      }
    }
  } catch (error) {
    console.error('Error checking lead PJ automations:', error);
  }
}

export async function checkAndExecuteLeadUpsellAutomations() {
  try {
    const automationsResult = await query(`
      SELECT * FROM lead_upsell_automations 
      WHERE active = true 
      ORDER BY priority ASC
    `);
    let automations = await loadAutomationTeamIds(automationsResult.rows, 'lead_upsell_automation_teams');

    for (const automation of automations) {
      const triggerConfig = typeof automation.trigger_config === 'string' 
        ? JSON.parse(automation.trigger_config) 
        : automation.trigger_config || {};

      if (automation.trigger_type === 'inactivity' || automation.trigger_type === 'stage_duration') {
        await checkInactivityTrigger(automation, triggerConfig, 'lead_upsell', 'leads_upsell');
      }
    }
  } catch (error) {
    console.error('Error checking lead upsell automations:', error);
  }
}

export async function checkAndExecuteReferralAutomations() {
  try {
    const automationsResult = await query(`
      SELECT * FROM referral_automations 
      WHERE active = true 
      ORDER BY priority ASC
    `);
    const automations = automationsResult.rows;

    for (const automation of automations) {
      const triggerConfig = typeof automation.trigger_config === 'string' 
        ? JSON.parse(automation.trigger_config) 
        : automation.trigger_config || {};

      if (automation.trigger_type === 'inactivity' || automation.trigger_type === 'stage_duration') {
        await checkInactivityTrigger(automation, triggerConfig, 'referral', 'referrals');
      }
    }
  } catch (error) {
    console.error('Error checking referral automations:', error);
  }
}

function isWithinReferralDispatchWindow() {
  // Horário de Brasília (UTC-3)
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const day  = now.getDay(); // 0=Dom, 1=Seg, ..., 5=Sex, 6=Sab
  const hour = now.getHours();
  const isWeekend = day === 0 || day === 6;
  if (isWeekend) {
    // Sábado e domingo: 10h–17h
    return hour >= 10 && hour < 17;
  }
  // Segunda a sexta: 09h–21h
  return hour >= 9 && hour < 21;
}

export async function checkAndExecuteReferralChannelAutomations() {
  if (!isWithinReferralDispatchWindow()) {
    console.log('[ChannelAutomation] Fora da janela de disparo — nenhuma mensagem enviada.');
    return;
  }
  try {
    const automationsResult = await query(`
      SELECT * FROM referral_channel_automations 
      WHERE active = true 
      ORDER BY priority ASC
    `);
    const automations = automationsResult.rows;

    for (const automation of automations) {
      const triggerConfig = typeof automation.trigger_config === 'string' 
        ? JSON.parse(automation.trigger_config) 
        : automation.trigger_config || {};

      if (automation.trigger_type === 'inactivity' || automation.trigger_type === 'stage_duration') {
        await checkInactivityTriggerWithToken(automation, triggerConfig, 'referral_channel', 'referrals', automation.channel_token);
      } else if (automation.trigger_type === 'segundo_contato') {
        await checkContatoSequencialTrigger(automation, 2, automation.channel_token);
      } else if (automation.trigger_type === 'terceiro_contato') {
        await checkContatoSequencialTrigger(automation, 3, automation.channel_token);
      } else if (automation.trigger_type === 'quarto_contato') {
        await checkContatoSequencialTrigger(automation, 4, automation.channel_token);
      }
    }
  } catch (error) {
    console.error('Error checking referral channel automations:', error);
  }
}

export async function checkAndExecuteUpsellChannelAutomations() {
  try {
    const automationsResult = await query(`
      SELECT * FROM upsell_channel_automations 
      WHERE active = true 
      ORDER BY priority ASC
    `);
    const automations = automationsResult.rows;

    for (const automation of automations) {
      const triggerConfig = typeof automation.trigger_config === 'string' 
        ? JSON.parse(automation.trigger_config) 
        : automation.trigger_config || {};

      if (automation.trigger_type === 'inactivity' || automation.trigger_type === 'stage_duration' || automation.trigger_type === 'no_activity' || automation.trigger_type === 'no_contact' || automation.trigger_type === 'no_proposal_response') {
        await checkInactivityTriggerWithToken(automation, triggerConfig, 'upsell_channel', 'leads_upsell', automation.channel_token);
      }
    }
  } catch (error) {
    console.error('Error checking upsell channel automations:', error);
  }
}

export async function executeUpsellChannelLeadCreatedAutomation(lead) {
  try {
    const automationsResult = await query(`
      SELECT * FROM upsell_channel_automations 
      WHERE active = true AND trigger_type = 'lead_created'
      ORDER BY priority ASC
    `);
    if (automationsResult.rows.length === 0) return;

    const agentResult = lead.agent_id 
      ? await query('SELECT name, phone, email FROM agents WHERE id = $1', [lead.agent_id])
      : { rows: [] };
    const agent = agentResult.rows[0] || null;
    const enrichedLead = { ...lead, agent_name: agent?.name, agent_phone: agent?.phone, agent_email: agent?.email };

    for (const automation of automationsResult.rows) {
      await executeChannelAutomationAction(automation, enrichedLead, 'upsell_channel', automation.channel_token);
    }
  } catch (error) {
    console.error('[UpsellChannel] Error executing lead_created automations:', error);
  }
}

export async function executeUpsellChannelStageChangeAutomation(lead, fromStage, toStage) {
  if (!toStage || fromStage === toStage) return;
  try {
    const automationsResult = await query(`
      SELECT * FROM upsell_channel_automations 
      WHERE active = true AND trigger_type = 'stage_change'
      ORDER BY priority ASC
    `);
    if (automationsResult.rows.length === 0) return;

    const agentResult = lead.agent_id 
      ? await query('SELECT name, phone, email FROM agents WHERE id = $1', [lead.agent_id])
      : { rows: [] };
    const agent = agentResult.rows[0] || null;
    const enrichedLead = { ...lead, agent_name: agent?.name, agent_phone: agent?.phone, agent_email: agent?.email };

    for (const automation of automationsResult.rows) {
      const triggerConfig = typeof automation.trigger_config === 'string' 
        ? JSON.parse(automation.trigger_config) : automation.trigger_config || {};
      
      if (triggerConfig.stages && Array.isArray(triggerConfig.stages)) {
        if (!triggerConfig.stages.includes(toStage)) continue;
      } else if (triggerConfig.stage && triggerConfig.stage !== toStage) {
        continue;
      }
      if (triggerConfig.fromStage && triggerConfig.fromStage !== fromStage) continue;

      await executeChannelAutomationAction(automation, enrichedLead, 'upsell_channel', automation.channel_token);
    }
  } catch (error) {
    console.error('[UpsellChannel] Error executing stage_change automations:', error);
  }
}

async function checkContatoSequencialTrigger(automation, contatoNumero, channelToken) {
  try {
    let sqlQuery;
    const contatoLabel = contatoNumero === 2 ? '2° Contato' : contatoNumero === 3 ? '3° Contato' : '4° Contato';

    if (contatoNumero === 2) {
      sqlQuery = `
        SELECT id, lead_number, lead_name, team_id, whu_chat_id
        FROM gerador_leads_whatsapp_logs
        WHERE retorno_whu IS DISTINCT FROM true
        AND data_segundo_contato IS NULL
        AND sent_at <= NOW() - INTERVAL '7 days'
        AND success = true
        ORDER BY sent_at ASC
        LIMIT 50
      `;
    } else if (contatoNumero === 3) {
      sqlQuery = `
        SELECT id, lead_number, lead_name, team_id, whu_chat_id
        FROM gerador_leads_whatsapp_logs
        WHERE retorno_whu IS DISTINCT FROM true
        AND data_terceiro_contato IS NULL
        AND data_segundo_contato IS NOT NULL
        AND data_segundo_contato <= NOW() - INTERVAL '7 days'
        ORDER BY data_segundo_contato ASC
        LIMIT 50
      `;
    } else {
      sqlQuery = `
        SELECT id, lead_number, lead_name, team_id, whu_chat_id
        FROM gerador_leads_whatsapp_logs
        WHERE retorno_whu IS DISTINCT FROM true
        AND data_quarto_contato IS NULL
        AND data_terceiro_contato IS NOT NULL
        AND data_terceiro_contato <= NOW() - INTERVAL '7 days'
        ORDER BY data_terceiro_contato ASC
        LIMIT 50
      `;
    }

    const leadsResult = await query(sqlQuery);
    console.log(`[ChannelAutomation] ${automation.name} (${contatoLabel}): Found ${leadsResult.rows.length} leads matching criteria`);

    for (const logEntry of leadsResult.rows) {
      const lead = {
        id: logEntry.id,
        phone: logEntry.lead_number,
        name: logEntry.lead_name || 'Lead',
      };

      try {
        if (automation.action_type === 'send_whatsapp' && automation.whatsapp_template_id) {
          const actionConfig = typeof automation.action_config === 'string'
            ? JSON.parse(automation.action_config || '{}')
            : automation.action_config || {};
          let hasVars = actionConfig.template_has_variables;
          if (hasVars === undefined && actionConfig.templateMessage) {
            hasVars = /\{\{\d+\}\}/.test(actionConfig.templateMessage);
          }
          const templateComponents = hasVars === false ? [] : undefined;
          console.log(`[ChannelAutomation] ${automation.name}: hasVars=${hasVars}, sending components=${JSON.stringify(templateComponents)}`);
          const result = await sendWhatsAppMessageWithToken(lead, null, automation.whatsapp_template_id, channelToken, templateComponents);

          const colName = contatoNumero === 2 ? 'data_segundo_contato' : contatoNumero === 3 ? 'data_terceiro_contato' : 'data_quarto_contato';
          await query(`UPDATE gerador_leads_whatsapp_logs SET ${colName} = NOW() WHERE id = $1`, [logEntry.id]);

          await logAutomationExecution({
            automationType: 'referral_channel',
            automationId: automation.id,
            automationName: automation.name,
            leadId: logEntry.id,
            leadName: lead.name,
            leadPhone: lead.phone,
            agentId: null,
            agentName: null,
            actionType: automation.action_type,
            status: 'sent',
            message: `${contatoLabel} enviado - Template: ${automation.whatsapp_template_name || automation.whatsapp_template_id}`,
            apiResponse: result
          });

          console.log(`[ChannelAutomation] ${automation.name}: ${contatoLabel} sent to ${lead.name} (${lead.phone})`);
        }
      } catch (sendError) {
        console.error(`[ChannelAutomation] ${automation.name}: Failed ${contatoLabel} to ${lead.name}:`, sendError.message);
        await logAutomationExecution({
          automationType: 'referral_channel',
          automationId: automation.id,
          automationName: automation.name,
          leadId: logEntry.id,
          leadName: lead.name,
          leadPhone: lead.phone,
          agentId: null,
          agentName: null,
          actionType: automation.action_type,
          status: 'error',
          message: `${contatoLabel} falhou`,
          errorMessage: sendError.message
        });
      }
    }
  } catch (error) {
    console.error(`Error checking contato sequencial trigger (${contatoNumero}):`, error);
  }
}

async function checkInactivityTriggerWithToken(automation, triggerConfig, automationType, tableName, channelToken) {
  try {
    const hours = Number(triggerConfig.hours) || 
                  (Number(triggerConfig.days) ? Number(triggerConfig.days) * 24 : 
                  (Number(triggerConfig.duration_days) ? Number(triggerConfig.duration_days) * 24 : 
                  (Number(triggerConfig.duration_hours) || 48)));
    
    const hoursAgo = new Date(Date.now() - hours * 60 * 60 * 1000);

    const closedStages = ['fechado_ganho', 'fechado_perdido', 'convertido', 'perdido', 'cancelado'];
    
    const leadsResult = await query(`
      SELECT l.*, a.name as agent_name, a.phone as agent_phone, a.email as agent_email
      FROM ${tableName} l
      LEFT JOIN agents a ON l.agent_id = a.id
      WHERE l.created_at < $1
        AND (l.stage IS NULL OR l.stage NOT IN ($2, $3, $4, $5, $6))
        AND NOT EXISTS (
          SELECT 1 FROM automation_logs al 
          WHERE al.lead_id = l.id 
            AND al.automation_id = $7
            AND al.executed_at > $8
        )
      LIMIT 10
    `, [hoursAgo.toISOString(), ...closedStages, automation.id, hoursAgo.toISOString()]);

    console.log(`[ChannelAutomation] ${automation.name}: Found ${leadsResult.rows.length} leads matching criteria`);

    for (const lead of leadsResult.rows) {
      await executeChannelAutomationAction(automation, lead, automationType, channelToken);
    }
  } catch (error) {
    console.error(`Error checking inactivity trigger for ${automationType}:`, error);
  }
}

async function executeChannelAutomationAction(automation, lead, automationType, channelToken) {
  const actionConfig = typeof automation.action_config === 'string' 
    ? JSON.parse(automation.action_config) 
    : automation.action_config || {};

  const leadName = lead.name || lead.referred_name || lead.company_name || lead.fantasy_name || 'Lead';
  const leadPhone = lead.phone || lead.referred_phone || lead.cell_phone || lead.whatsapp;

  try {
    if (automation.action_type === 'send_whatsapp') {
      if (!leadPhone) {
        console.log(`[ChannelAutomation] ${automation.name}: Lead ${leadName} has no phone number, skipping`);
        await logAutomationExecution({
          automationType,
          automationId: automation.id,
          automationName: automation.name,
          leadId: lead.id,
          leadName,
          leadPhone: null,
          agentId: lead.agent_id || null,
          agentName: lead.agent_name || null,
          actionType: automation.action_type,
          status: 'skipped',
          message: 'Lead sem telefone cadastrado'
        });
        return;
      }

      const message = actionConfig.templateMessage
        ?.replace(/\{\{nome_cliente\}\}/gi, leadName)
        ?.replace(/\{\{nome_vendedor\}\}/gi, lead.agent_name || 'Consultor')
        ?.replace(/\{\{nome\}\}/gi, leadName)
        ?.replace(/\(Nome cliente\)/gi, leadName)
        ?.replace(/\(Nome Vendedor\)/gi, lead.agent_name || 'Consultor')
        ?.replace(/\(Nome Cliente\)/gi, leadName)
        ?.replace(/\(Nome\)/gi, leadName);

      if (automation.whatsapp_template_id) {
        try {
          const agent = lead.agent_id ? { id: lead.agent_id, name: lead.agent_name, phone: lead.agent_phone } : null;
          let hasVarsAction = actionConfig.template_has_variables;
          if (hasVarsAction === undefined && actionConfig.templateMessage) {
            hasVarsAction = /\{\{\d+\}\}/.test(actionConfig.templateMessage);
          }
          const templateComponents = hasVarsAction === false ? [] : undefined;
          const result = await sendWhatsAppMessageWithToken(lead, agent, automation.whatsapp_template_id, channelToken, templateComponents);
          
          await logAutomationExecution({
            automationType,
            automationId: automation.id,
            automationName: automation.name,
            leadId: lead.id,
            leadName,
            leadPhone,
            agentId: lead.agent_id || null,
            agentName: lead.agent_name || null,
            actionType: automation.action_type,
            status: 'sent',
            message: message || `Template: ${automation.whatsapp_template_name}`,
            apiResponse: result
          });

          console.log(`[ChannelAutomation] ${automation.name}: Message sent to ${leadName} (${leadPhone})`, result);
        } catch (sendError) {
          console.error(`[ChannelAutomation] ${automation.name}: Failed to send WhatsApp to ${leadName}:`, sendError.message);
          await logAutomationExecution({
            automationType,
            automationId: automation.id,
            automationName: automation.name,
            leadId: lead.id,
            leadName,
            leadPhone,
            agentId: lead.agent_id || null,
            agentName: lead.agent_name || null,
            actionType: automation.action_type,
            status: 'error',
            message: message,
            errorMessage: sendError.message
          });
        }
      } else {
        await logAutomationExecution({
          automationType,
          automationId: automation.id,
          automationName: automation.name,
          leadId: lead.id,
          leadName,
          leadPhone,
          agentId: lead.agent_id || null,
          agentName: lead.agent_name || null,
          actionType: automation.action_type,
          status: 'pending',
          message: message || 'Mensagem personalizada aguardando template'
        });
        console.log(`[ChannelAutomation] ${automation.name}: Logged pending message for ${leadName} (no template configured)`);
      }

      await updateAutomationCount(automation.id, automationType);
      
    } else if (automation.action_type === 'internal_alert') {
      await logAutomationExecution({
        automationType,
        automationId: automation.id,
        automationName: automation.name,
        leadId: lead.id,
        leadName,
        leadPhone,
        agentId: lead.agent_id || null,
        agentName: lead.agent_name || null,
        actionType: automation.action_type,
        status: 'executed',
        message: actionConfig.alertMessage
      });

      if (actionConfig.notifyRole === 'supervisor') {
        try {
          const supervisorsResult = await query(`
            SELECT email, name FROM agents 
            WHERE agent_type = 'sales_supervisor' AND active = true
          `);
          
          const alertMessage = actionConfig.alertMessage
            ?.replace(/\{\{nome_cliente\}\}/gi, leadName)
            ?.replace(/\{\{nome_vendedor\}\}/gi, lead.agent_name || 'Não atribuído') 
            || 'Verificar lead';
          
          for (const supervisor of supervisorsResult.rows) {
            await query(`
              INSERT INTO notifications (user_email, title, message, type, created_at)
              VALUES ($1, $2, $3, $4, NOW())
            `, [
              supervisor.email,
              `Alerta: ${automation.name}`,
              alertMessage,
              'automation_alert'
            ]);
          }
        } catch (notifError) {
          console.error(`[ChannelAutomation] Failed to create notification:`, notifError.message);
        }
      }

      await updateAutomationCount(automation.id, automationType);
      console.log(`[ChannelAutomation] ${automation.name}: Internal alert logged for ${leadName}`);
    }
  } catch (error) {
    console.error(`[ChannelAutomation] ${automation.name}: Error executing action for ${leadName}:`, error);
    await logAutomationExecution({
      automationType,
      automationId: automation.id,
      automationName: automation.name,
      leadId: lead.id,
      leadName,
      leadPhone,
      agentId: lead.agent_id || null,
      agentName: lead.agent_name || null,
      actionType: automation.action_type,
      status: 'error',
      message: actionConfig.templateMessage || actionConfig.alertMessage,
      errorMessage: error.message
    });
  }
}

async function checkInactivityTrigger(automation, triggerConfig, automationType, tableName) {
  try {
    const hours = Number(triggerConfig.hours) || 
                  (Number(triggerConfig.days) ? Number(triggerConfig.days) * 24 : 
                  (Number(triggerConfig.duration_days) ? Number(triggerConfig.duration_days) * 24 : 
                  (Number(triggerConfig.duration_hours) || 48)));
    
    const hoursAgo = new Date(Date.now() - hours * 60 * 60 * 1000);

    const closedStages = ['fechado_ganho', 'fechado_perdido', 'convertido', 'perdido', 'cancelado'];
    
    const params = [hoursAgo.toISOString(), ...closedStages, automation.id, hoursAgo.toISOString()];
    let teamFilter = '';
    if (automation.team_ids && automation.team_ids.length > 0) {
      const teamPlaceholders = automation.team_ids.map((tid, i) => {
        params.push(tid);
        return `$${params.length}`;
      }).join(', ');
      teamFilter = ` AND l.team_id IN (${teamPlaceholders})`;
    }

    const leadsResult = await query(`
      SELECT l.*, a.name as agent_name, a.phone as agent_phone, a.email as agent_email
      FROM ${tableName} l
      LEFT JOIN agents a ON l.agent_id = a.id
      WHERE l.created_at < $1
        AND (l.stage IS NULL OR l.stage NOT IN ($2, $3, $4, $5, $6))
        AND NOT EXISTS (
          SELECT 1 FROM automation_logs al 
          WHERE al.lead_id = l.id 
            AND al.automation_id = $7
            AND al.executed_at > $8
        )${teamFilter}
      LIMIT 10
    `, params);

    console.log(`[Automation] ${automation.name}: Found ${leadsResult.rows.length} leads matching criteria${automation.team_ids?.length ? ` (teams: ${automation.team_ids.join(', ')})` : ''}`);

    for (const lead of leadsResult.rows) {
      await executeAutomationAction(automation, lead, automationType);
    }
  } catch (error) {
    console.error(`Error checking inactivity trigger for ${automationType}:`, error);
  }
}

async function executeAutomationAction(automation, lead, automationType) {
  const actionConfig = typeof automation.action_config === 'string' 
    ? JSON.parse(automation.action_config) 
    : automation.action_config || {};

  const leadName = lead.name || lead.referred_name || lead.company_name || lead.fantasy_name || 'Lead';
  const leadPhone = lead.phone || lead.referred_phone || lead.cell_phone || lead.whatsapp;

  try {
    if (automation.action_type === 'send_whatsapp') {
      if (!leadPhone) {
        console.log(`[Automation] ${automation.name}: Lead ${leadName} has no phone number, skipping`);
        await logAutomationExecution({
          automationType,
          automationId: automation.id,
          automationName: automation.name,
          leadId: lead.id,
          leadName,
          leadPhone: null,
          agentId: lead.agent_id || null,
          agentName: lead.agent_name || null,
          actionType: automation.action_type,
          status: 'skipped',
          message: 'Lead sem telefone cadastrado'
        });
        return;
      }

      const message = actionConfig.templateMessage
        ?.replace(/\{\{nome_cliente\}\}/gi, leadName)
        ?.replace(/\{\{nome_vendedor\}\}/gi, lead.agent_name || 'Consultor')
        ?.replace(/\{\{nome\}\}/gi, leadName)
        ?.replace(/\(Nome cliente\)/gi, leadName)
        ?.replace(/\(Nome Vendedor\)/gi, lead.agent_name || 'Consultor')
        ?.replace(/\(Nome Cliente\)/gi, leadName)
        ?.replace(/\(Nome\)/gi, leadName);

      if (automation.whatsapp_template_id) {
        try {
          const agent = lead.agent_id ? { id: lead.agent_id, name: lead.agent_name, phone: lead.agent_phone } : null;
          const result = await sendWhatsAppMessage(lead, agent, automation.whatsapp_template_id);
          
          await logAutomationExecution({
            automationType,
            automationId: automation.id,
            automationName: automation.name,
            leadId: lead.id,
            leadName,
            leadPhone,
            agentId: lead.agent_id || null,
            agentName: lead.agent_name || null,
            actionType: automation.action_type,
            status: 'sent',
            message: message || `Template: ${automation.whatsapp_template_name}`,
            apiResponse: result
          });

          console.log(`[Automation] ${automation.name}: Message sent to ${leadName} (${leadPhone})`, result);
        } catch (sendError) {
          console.error(`[Automation] ${automation.name}: Failed to send WhatsApp to ${leadName}:`, sendError.message);
          await logAutomationExecution({
            automationType,
            automationId: automation.id,
            automationName: automation.name,
            leadId: lead.id,
            leadName,
            leadPhone,
            agentId: lead.agent_id || null,
            agentName: lead.agent_name || null,
            actionType: automation.action_type,
            status: 'error',
            message: message,
            errorMessage: sendError.message
          });
        }
      } else {
        await logAutomationExecution({
          automationType,
          automationId: automation.id,
          automationName: automation.name,
          leadId: lead.id,
          leadName,
          leadPhone,
          agentId: lead.agent_id || null,
          agentName: lead.agent_name || null,
          actionType: automation.action_type,
          status: 'pending',
          message: message || 'Mensagem personalizada aguardando template'
        });
        console.log(`[Automation] ${automation.name}: Logged pending message for ${leadName} (no template configured)`);
      }

      await updateAutomationCount(automation.id, automationType);
      
    } else if (automation.action_type === 'internal_alert') {
      await logAutomationExecution({
        automationType,
        automationId: automation.id,
        automationName: automation.name,
        leadId: lead.id,
        leadName,
        leadPhone,
        agentId: lead.agent_id || null,
        agentName: lead.agent_name || null,
        actionType: automation.action_type,
        status: 'executed',
        message: actionConfig.alertMessage
      });

      // Send notification to sales supervisors only (gestão)
      if (actionConfig.notifyRole === 'supervisor') {
        try {
          // Get all sales supervisors
          const supervisorsResult = await query(`
            SELECT email, name FROM agents 
            WHERE agent_type = 'sales_supervisor' AND active = true
          `);
          
          const alertMessage = actionConfig.alertMessage
            ?.replace(/\{\{nome_cliente\}\}/gi, leadName)
            ?.replace(/\{\{nome_vendedor\}\}/gi, lead.agent_name || 'Não atribuído') 
            || 'Verificar lead';
          
          for (const supervisor of supervisorsResult.rows) {
            await query(`
              INSERT INTO notifications (user_email, title, message, type, created_at)
              VALUES ($1, $2, $3, $4, NOW())
            `, [
              supervisor.email,
              `Alerta: ${automation.name}`,
              alertMessage,
              'automation_alert'
            ]);
            console.log(`[Automation] Notification sent to sales supervisor: ${supervisor.name}`);
          }
        } catch (notifError) {
          console.error(`[Automation] Failed to create notification:`, notifError.message);
        }
      }

      await updateAutomationCount(automation.id, automationType);
      console.log(`[Automation] ${automation.name}: Internal alert logged for ${leadName}`);
    }
  } catch (error) {
    console.error(`[Automation] ${automation.name}: Error executing action for ${leadName}:`, error);
    await logAutomationExecution({
      automationType,
      automationId: automation.id,
      automationName: automation.name,
      leadId: lead.id,
      leadName,
      leadPhone,
      agentId: lead.agent_id || null,
      agentName: lead.agent_name || null,
      actionType: automation.action_type,
      status: 'error',
      message: actionConfig.templateMessage || actionConfig.alertMessage,
      errorMessage: error.message
    });
  }
}

async function logAutomationExecution(data) {
  try {
    const actionResult = {
      automation_name: data.automationName,
      lead_name: data.leadName,
      lead_phone: data.leadPhone,
      agent_name: data.agentName || null,
      agent_id: data.agentId || null,
      status: data.status,
      message: data.message,
      api_response: data.apiResponse || null
    };

    const success = data.status === 'sent' || data.status === 'executed';

    await query(`
      INSERT INTO automation_logs (
        automation_type, automation_id, lead_id,
        action_type, action_result, success, error_message, executed_at,
        agent_id, agent_name
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8, $9)
    `, [
      data.automationType,
      data.automationId,
      data.leadId,
      data.actionType,
      JSON.stringify(actionResult),
      success,
      data.errorMessage || null,
      data.agentId || null,
      data.agentName || null
    ]);
  } catch (error) {
    console.error('Error logging automation execution:', error);
  }
}

async function updateAutomationCount(automationId, automationType) {
}

export async function executeLeadCreatedAutomation(lead, leadType = 'lead') {
  const tableName = leadType === 'lead' ? 'lead_automations' 
    : leadType === 'lead_pj' ? 'lead_pj_automations' 
    : leadType === 'lead_upsell' ? 'lead_upsell_automations'
    : 'referral_automations';
  
  const leadsTableName = leadType === 'lead' ? 'leads' 
    : leadType === 'lead_pj' ? 'leads_pj' 
    : leadType === 'lead_upsell' ? 'leads_upsell'
    : 'referrals';

  try {
    const automationsResult = await query(`
      SELECT * FROM ${tableName} 
      WHERE active = true 
        AND trigger_type = 'lead_created'
        AND whatsapp_template_id IS NOT NULL
      ORDER BY priority ASC
    `);
    
    const junctionTable = leadType === 'lead_pj' ? 'lead_pj_automation_teams' 
      : leadType === 'lead_upsell' ? 'lead_upsell_automation_teams'
      : 'lead_automation_teams';
    let automations = await loadAutomationTeamIds(automationsResult.rows, junctionTable);
    
    if (automations.length === 0) {
      console.log(`[Automation] No lead_created automations configured for ${leadType}`);
      return;
    }

    const agentResult = lead.agent_id 
      ? await query('SELECT name, phone, email FROM agents WHERE id = $1', [lead.agent_id])
      : { rows: [] };
    
    const agent = agentResult.rows[0] || null;
    const enrichedLead = {
      ...lead,
      agent_name: agent?.name || 'Consultor',
      agent_phone: agent?.phone || '',
      agent_email: agent?.email || ''
    };

    for (const automation of automations) {
      if (automation.team_ids && automation.team_ids.length > 0 && !automation.team_ids.includes(lead.team_id)) {
        console.log(`[Automation] Skipping ${automation.name} — lead team (${lead.team_id}) not in automation teams (${automation.team_ids.join(', ')})`);
        continue;
      }
      console.log(`[Automation] Executing ${automation.name} for new ${leadType}`);
      await executeAutomationAction(automation, enrichedLead, leadType);
    }
  } catch (error) {
    console.error(`[Automation] Error executing lead_created automations for ${leadType}:`, error);
  }
}

export async function executeStageChangeAutomation(lead, fromStage, toStage, leadType = 'lead') {
  if (!toStage || fromStage === toStage) return;

  const tableName = leadType === 'lead' ? 'lead_automations' 
    : leadType === 'lead_pj' ? 'lead_pj_automations' 
    : leadType === 'lead_upsell' ? 'lead_upsell_automations'
    : 'referral_automations';

  const junctionTable = leadType === 'lead_pj' ? 'lead_pj_automation_teams' 
    : leadType === 'lead_upsell' ? 'lead_upsell_automation_teams'
    : 'lead_automation_teams';

  try {
    const automationsResult = await query(`
      SELECT * FROM ${tableName} 
      WHERE active = true 
        AND trigger_type = 'stage_change'
      ORDER BY priority ASC
    `);

    let automations = await loadAutomationTeamIds(automationsResult.rows, junctionTable);

    if (automations.length === 0) {
      console.log(`[Automation] No stage_change automations configured for ${leadType}`);
      return;
    }

    const agentResult = lead.agent_id 
      ? await query('SELECT name, phone, email FROM agents WHERE id = $1', [lead.agent_id])
      : { rows: [] };

    const agent = agentResult.rows[0] || null;
    const enrichedLead = {
      ...lead,
      agent_name: agent?.name || 'Consultor',
      agent_phone: agent?.phone || '',
      agent_email: agent?.email || ''
    };

    for (const automation of automations) {
      const triggerConfig = typeof automation.trigger_config === 'string' 
        ? JSON.parse(automation.trigger_config) 
        : automation.trigger_config || {};

      // Filtra por estágio configurado: aceita string única ou array de stages
      const targetStages = Array.isArray(triggerConfig.stages)
        ? triggerConfig.stages
        : (triggerConfig.stage ? [triggerConfig.stage] : null);

      if (targetStages && !targetStages.includes(toStage)) {
        continue;
      }

      // Filtro opcional do stage de origem
      if (triggerConfig.fromStage && triggerConfig.fromStage !== fromStage) {
        continue;
      }

      // Filtro de equipe
      if (automation.team_ids && automation.team_ids.length > 0 && !automation.team_ids.includes(lead.team_id)) {
        console.log(`[Automation] Skipping ${automation.name} — lead team (${lead.team_id}) not in automation teams`);
        continue;
      }

      console.log(`[Automation] Executing stage_change automation ${automation.name} for ${leadType} (${fromStage} → ${toStage})`);
      await executeAutomationAction(automation, enrichedLead, leadType);
    }
  } catch (error) {
    console.error(`[Automation] Error executing stage_change automations for ${leadType}:`, error);
  }
}

export async function syncPerspectivaNegociosFromERP() {
  try {
    const erpAuthToken = process.env.ERP_AUTH_TOKEN;
    if (!erpAuthToken) {
      console.error('[PerspectivaNegócios] ERP_AUTH_TOKEN não configurado.');
      return;
    }
    const authHeader = erpAuthToken.startsWith('Bearer ') ? erpAuthToken : `Bearer ${erpAuthToken}`;
    const url = 'http://erp.wescctech.com.br:8080/BOMPASTOR/api/API_PERSPECTIVA_NEGOCIOS';
    console.log('[PerspectivaNegócios] Iniciando sincronização com ERP...');
    const response = await fetch(url, {
      headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
    });
    if (!response.ok) {
      console.error(`[PerspectivaNegócios] ERP retornou status ${response.status}`);
      return;
    }
    const data = await response.json();
    const records = Array.isArray(data) ? data : [data];
    if (records.length === 0) {
      console.log('[PerspectivaNegócios] Nenhum registro retornado pelo ERP.');
      return;
    }
    await query(`DELETE FROM erp_perspectivas_negocios WHERE origem = 'erp'`);
    for (const rec of records) {
      await query(
        `INSERT INTO erp_perspectivas_negocios
          (perspectiva, nome_indicador, cpf_indicador, nome_indicado, cpf_indicado, nome_vendedor, sit_titulo, sit_perspectiva, observacoes, origem, sincronizado_em)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'erp',NOW())`,
        [
          rec.perspectiva    || null,
          rec.nome_indicador || null,
          rec.cpf_indicador  || null,
          rec.nome_indicado  || null,
          rec.cpf_indicado   || null,
          rec.nome_vendedor  || null,
          rec.sit_titulo     || null,
          rec.sit_perspectiva|| null,
          rec.observacoes    || null
        ]
      );
    }
    console.log(`[PerspectivaNegócios] Sincronização concluída — ${records.length} registros importados.`);

    // Backfill: importa leads fechado_ganho do CRM que ainda não estão na tabela
    const backfillResult = await query(`
      INSERT INTO erp_perspectivas_negocios
        (nome_indicador, cpf_indicador, nome_indicado, cpf_indicado, nome_vendedor, sit_perspectiva, origem, sincronizado_em)
      SELECT
        r.referrer_name,
        r.referrer_cpf,
        r.referred_name,
        r.referred_cpf,
        a.name,
        'NEGOCIO FECHADO',
        'crm',
        NOW()
      FROM referrals r
      LEFT JOIN agents a ON a.id = r.agent_id
      WHERE r.stage = 'fechado_ganho'
        AND NOT EXISTS (
          SELECT 1 FROM erp_perspectivas_negocios p
          WHERE p.origem = 'crm'
            AND p.nome_indicado IS NOT DISTINCT FROM r.referred_name
            AND p.cpf_indicador IS NOT DISTINCT FROM r.referrer_cpf
        )
    `);
    if (backfillResult.rowCount > 0) {
      console.log(`[PerspectivaNegócios] Backfill CRM: ${backfillResult.rowCount} lead(s) fechado_ganho importados.`);
    }
  } catch (error) {
    console.error('[PerspectivaNegócios] Erro na sincronização:', error.message);
  }
}

function formatCpf(cpf) {
  if (!cpf) return null;
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return cpf; // retorna como está se não for 11 dígitos
  return `${digits.slice(0,3)}.${digits.slice(3,6)}.${digits.slice(6,9)}-${digits.slice(9)}`;
}

export async function checkValidacaoPagamento() {
  try {
    const erpAuthToken = process.env.ERP_AUTH_TOKEN;
    if (!erpAuthToken) {
      console.error('[ValidacaoPagamento] ERP_AUTH_TOKEN não configurado.');
      return;
    }
    const authHeader = erpAuthToken.startsWith('Bearer ') ? erpAuthToken : `Bearer ${erpAuthToken}`;

    // Busca registros com cpf_indicado preenchido e ainda não liquidados
    const pendentes = await query(`
      SELECT DISTINCT cpf_indicado
      FROM erp_perspectivas_negocios
      WHERE cpf_indicado IS NOT NULL
        AND cpf_indicado != ''
        AND sit_titulo != 'Liquidado'
    `);

    if (pendentes.rows.length === 0) {
      console.log('[ValidacaoPagamento] Nenhum CPF pendente de validação.');
      return;
    }

    console.log(`[ValidacaoPagamento] Verificando ${pendentes.rows.length} CPF(s)...`);
    let liquidados = 0;

    for (const row of pendentes.rows) {
      const cpfFormatado = formatCpf(row.cpf_indicado);
      if (!cpfFormatado) continue;

      try {
        const url = `http://erp.wescctech.com.br:8080/BOMPASTOR/api/API_VALIDACAO_PAGAMENTO?cpf=${encodeURIComponent(cpfFormatado)}`;
        const response = await fetch(url, { headers: { 'Authorization': authHeader } });

        if (!response.ok) {
          console.warn(`[ValidacaoPagamento] CPF ${cpfFormatado}: status ${response.status}`);
          continue;
        }

        const data = await response.json();
        const pagamentos = Array.isArray(data) ? data : [];

        if (pagamentos.length > 0) {
          const dataPagamento = pagamentos[0].data_pagamento || null;
          await query(`
            UPDATE erp_perspectivas_negocios
            SET sit_titulo = 'Liquidado', data_pagamento = $1
            WHERE cpf_indicado = $2
              AND sit_titulo != 'Liquidado'
          `, [dataPagamento, row.cpf_indicado]);
          console.log(`[ValidacaoPagamento] CPF ${cpfFormatado} liquidado em ${dataPagamento}`);
          liquidados++;
        }
      } catch (cpfErr) {
        console.warn(`[ValidacaoPagamento] Erro ao verificar CPF ${cpfFormatado}:`, cpfErr.message);
      }
    }

    console.log(`[ValidacaoPagamento] Concluído — ${liquidados} de ${pendentes.rows.length} CPF(s) liquidados.`);
  } catch (error) {
    console.error('[ValidacaoPagamento] Erro geral:', error.message);
  }
}

export async function runAllAutomations() {
  console.log('[Automations] Running all automation checks...');
  try {
    await checkAndExecuteLeadAutomations();
    await checkAndExecuteLeadPJAutomations();
    await checkAndExecuteLeadUpsellAutomations();
    await checkAndExecuteReferralAutomations();
    await checkAndExecuteReferralChannelAutomations();
    await checkAndExecuteUpsellChannelAutomations();
    await syncPerspectivaNegociosFromERP();
    await checkValidacaoPagamento();
    console.log('[Automations] Automation checks completed.');
  } catch (error) {
    console.error('[Automations] Error running automations:', error);
  }
}

export async function getAutomationLogs(filters = {}) {
  let whereClause = 'WHERE 1=1';
  const params = [];
  let paramIndex = 1;

  if (filters.automationType) {
    whereClause += ` AND automation_type = $${paramIndex}`;
    params.push(filters.automationType);
    paramIndex++;
  }

  if (filters.status) {
    whereClause += ` AND status = $${paramIndex}`;
    params.push(filters.status);
    paramIndex++;
  }

  if (filters.automationId) {
    whereClause += ` AND automation_id = $${paramIndex}`;
    params.push(filters.automationId);
    paramIndex++;
  }

  const result = await query(`
    SELECT * FROM automation_logs 
    ${whereClause}
    ORDER BY executed_at DESC 
    LIMIT 100
  `, params);

  return result.rows;
}

export async function getEnvioRegulamentoConfig() {
  const result = await query(
    `SELECT id, name, channel_token, whatsapp_template_id, whatsapp_template_name, active
     FROM referral_channel_automations
     WHERE name = 'Envio Regulamento' AND active = true
     LIMIT 1`
  );

  if (result.rows.length === 0) {
    throw new Error("Automação 'Envio Regulamento' não encontrada ou inativa. Configure-a em Indicações > Automações por Canal antes de disparar.");
  }

  const config = result.rows[0];

  if (!config.channel_token) {
    throw new Error("Token do canal não configurado na automação 'Envio Regulamento'.");
  }

  if (!config.whatsapp_template_id) {
    throw new Error("Template WhatsApp não configurado na automação 'Envio Regulamento'.");
  }

  return {
    channelToken: config.channel_token,
    templateId: config.whatsapp_template_id,
    templateName: config.whatsapp_template_name || '',
    automationName: config.name || 'Envio Regulamento',
  };
}
