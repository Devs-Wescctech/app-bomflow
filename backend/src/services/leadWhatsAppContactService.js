import { query } from '../config/database.js';

function maskToken(token) {
  if (!token || token.length < 8) return '***';
  return token.slice(0, 4) + '...' + token.slice(-4);
}

export async function createLeadWhatsAppContact({ leadId, agentId, message, channelToken }) {
  const result = await query(
    `INSERT INTO lead_whatsapp_contacts (lead_id, agent_id, message, channel_token_masked)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [leadId, agentId, message || null, maskToken(channelToken)]
  );
  return result.rows[0];
}

export async function getLeadWhatsAppContacts(leadId) {
  const result = await query(
    `SELECT lwc.*, a.name as agent_name
     FROM lead_whatsapp_contacts lwc
     LEFT JOIN agents a ON a.id = lwc.agent_id
     WHERE lwc.lead_id = $1
     ORDER BY lwc.created_at DESC`,
    [leadId]
  );
  return result.rows;
}
