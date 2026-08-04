// Ciclo de automações PF (módulo Vendas PF / tabela `leads`).
//
// Regras (alinhadas ao comportamento do Gerador de Leads/Indicações):
//  - Se o cliente responde a QUALQUER disparo do ciclo, nenhuma outra automação
//    é enviada (leads.automation_responded_at, setado pelo webhook WHU).
//  - As automações do ciclo (send_whatsapp ativas, por prioridade) são enviadas
//    em sequência, uma por vez, sem reenvio da mesma automação dentro do ciclo.
//  - Quando todas as automações aplicáveis ao lead foram enviadas com sucesso e
//    não houve resposta, o lead entra em cooldown de 30 dias
//    (leads.automation_cooldown_until). Expirado o prazo, um novo ciclo começa.
//
// Estado persistido em colunas de `leads`:
//   automation_whu_chat_id     — chat WHU do último disparo (p/ detectar resposta)
//   automation_responded_at    — cliente respondeu (para o ciclo em definitivo)
//   automation_cycle_started_at — início do ciclo corrente
//   automation_cooldown_until  — fim do cooldown de 30 dias
import { query as defaultQuery } from '../config/database.js';

export const PF_COOLDOWN_DAYS = 30;

// Limite inferior do ciclo corrente: logs anteriores a esse instante pertencem
// a ciclos antigos. Usa GREATEST(cycle_started_at, cooldown_until) para que,
// após um cooldown expirado, os logs do ciclo anterior deixem de contar.
export const PF_CYCLE_BOUNDARY_SQL = (alias = 'l') =>
  `GREATEST(COALESCE(${alias}.automation_cycle_started_at, '1970-01-01'::timestamp), COALESCE(${alias}.automation_cooldown_until, '1970-01-01'::timestamp))`;

export function extractWhuIds(apiResponse) {
  if (!apiResponse || typeof apiResponse !== 'object') {
    return { chatId: null, contactId: null };
  }
  const chatId = apiResponse.chatId || apiResponse.chat_id || apiResponse.chatID || apiResponse.currentChatId || null;
  const contactId = apiResponse.contactId || apiResponse.contact_id || apiResponse.contactID || null;
  return {
    chatId: chatId ? String(chatId) : null,
    contactId: contactId ? String(contactId) : null,
  };
}

export function isAutomationApplicableToLead(automation, lead) {
  const teamIds = automation.team_ids || [];
  if (teamIds.length === 0) return true;
  return Boolean(lead.team_id) && teamIds.includes(lead.team_id);
}

// Automações que compõem o ciclo de disparos WhatsApp para este lead,
// já na ordem de prioridade (a lista de entrada vem ordenada por priority ASC).
export function getCycleAutomationsForLead(automations, lead) {
  return (automations || []).filter((a) =>
    a.active !== false &&
    a.action_type === 'send_whatsapp' &&
    (a.trigger_type === 'inactivity' || a.trigger_type === 'stage_duration') &&
    isAutomationApplicableToLead(a, lead)
  );
}

// true se existe automação anterior (na ordem do ciclo) ainda não enviada —
// garante o envio "uma por vez, em sequência".
export function hasPendingPriorAutomation(automations, currentAutomation, lead, sentAutomationIds) {
  const cycle = getCycleAutomationsForLead(automations, lead);
  for (const a of cycle) {
    if (a.id === currentAutomation.id) return false;
    if (!sentAutomationIds.has(a.id)) return true;
  }
  return false;
}

// IDs das automações PF já enviadas com sucesso no ciclo corrente do lead.
export async function getCycleSentAutomationIds(lead, db = defaultQuery) {
  const result = await db(
    `SELECT DISTINCT automation_id FROM automation_logs
     WHERE lead_id = $1 AND automation_type = 'lead' AND success = true
       AND executed_at >= GREATEST(COALESCE($2::timestamp, '1970-01-01'::timestamp), COALESCE($3::timestamp, '1970-01-01'::timestamp))`,
    [lead.id, lead.automation_cycle_started_at || null, lead.automation_cooldown_until || null]
  );
  return new Set(result.rows.map((r) => r.automation_id));
}

// Abre um novo ciclo (primeiro disparo de todos, ou primeiro após cooldown
// expirado). Deve rodar ANTES do envio, para que o log do envio fique com
// executed_at >= automation_cycle_started_at.
export async function startCycleIfNeeded(lead, db = defaultQuery) {
  const result = await db(
    `UPDATE leads SET
       automation_cycle_started_at = NOW(),
       automation_cooldown_until = NULL,
       updated_at = NOW()
     WHERE id = $1
       AND (automation_cycle_started_at IS NULL
         OR (automation_cooldown_until IS NOT NULL AND automation_cooldown_until <= NOW()))
     RETURNING automation_cycle_started_at`,
    [lead.id]
  );
  if (result.rows.length > 0) {
    lead.automation_cycle_started_at = result.rows[0].automation_cycle_started_at;
    lead.automation_cooldown_until = null;
  }
}

// Persiste o chat WHU retornado pelo envio, para o webhook conseguir resolver
// a resposta do cliente de volta ao lead.
export async function recordDispatchChat(leadId, apiResponse, db = defaultQuery) {
  const { chatId, contactId } = extractWhuIds(apiResponse);
  if (chatId) {
    await db(
      `UPDATE leads SET automation_whu_chat_id = $2, updated_at = NOW() WHERE id = $1`,
      [leadId, chatId]
    );
  }
  return { chatId, contactId };
}

// Se todas as automações do ciclo aplicáveis ao lead já foram enviadas com
// sucesso, marca o cooldown de 30 dias. Retorna true quando o ciclo fechou.
export async function finishCycleIfComplete(lead, automations, db = defaultQuery) {
  const cycle = getCycleAutomationsForLead(automations, lead);
  if (cycle.length === 0) return false;
  const sent = await getCycleSentAutomationIds(lead, db);
  const allSent = cycle.every((a) => sent.has(a.id));
  if (!allSent) return false;
  await db(
    `UPDATE leads SET
       automation_cooldown_until = NOW() + INTERVAL '${PF_COOLDOWN_DAYS} days',
       updated_at = NOW()
     WHERE id = $1 AND automation_responded_at IS NULL
       AND (automation_cooldown_until IS NULL OR automation_cooldown_until <= NOW())`,
    [lead.id]
  );
  return true;
}

// Marca leads PF como "respondeu" a partir do retorno do webhook WHU.
// 1º pelo chat gravado no disparo; fallback por telefone normalizado
// (últimos 8 dígitos — tolera o 9º dígito), restrito a leads que já
// receberam disparo de automação (automation_whu_chat_id preenchido).
export async function markLeadRespondedByChat(chatId, rawPhone, db = defaultQuery) {
  const chat = chatId ? String(chatId) : null;
  if (chat) {
    const updated = await db(
      `UPDATE leads SET automation_responded_at = NOW(), updated_at = NOW()
       WHERE automation_whu_chat_id = $1 AND automation_responded_at IS NULL
       RETURNING id`,
      [chat]
    );
    if (updated.rows.length > 0) return true;
    const exists = await db(
      `SELECT 1 FROM leads WHERE automation_whu_chat_id = $1 LIMIT 1`,
      [chat]
    );
    if (exists.rows.length > 0) return true; // já estava marcado
  }
  const digits = String(rawPhone || '').replace(/\D/g, '');
  const last8 = digits.slice(-8);
  if (last8.length === 8) {
    const updated = await db(
      `UPDATE leads SET automation_responded_at = NOW(), updated_at = NOW()
       WHERE automation_whu_chat_id IS NOT NULL AND automation_responded_at IS NULL
         AND RIGHT(regexp_replace(COALESCE(phone, whatsapp, ''), '\\D', '', 'g'), 8) = $1
       RETURNING id`,
      [last8]
    );
    if (updated.rows.length > 0) return true;
  }
  return false;
}
