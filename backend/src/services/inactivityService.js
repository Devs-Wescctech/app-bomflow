import { query } from '../config/database.js';
import { invalidateAgentActiveCache } from '../middleware/auth.js';

// Política de isenção: por requisito, o usuário master (conta administradora
// principal, seed admin@wescctech.com) é isento da regra. Configurável via env
// INACTIVITY_EXEMPT_EMAILS (lista separada por vírgula).
export function getExemptEmails() {
  const raw = process.env.INACTIVITY_EXEMPT_EMAILS || 'admin@wescctech.com';
  return raw.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
}

const INACTIVITY_DAYS = 30;

/**
 * Inativa agentes ativos sem atividade registrada há 30+ dias.
 * - Toda conta tem um marco inicial: last_activity_at tem DEFAULT NOW() (contas
 *   novas contam a partir da criação) e o backfill da migração inicializou os
 *   registros existentes na data do deploy — ninguém é inativado no dia 1.
 * - Registros legados ainda sem marco (NULL) são ignorados por segurança.
 * - Os e-mails isentos (por requisito, o usuário master) vêm de getExemptEmails().
 * Grava data e motivo ('inatividade') para distinguir de inativação manual.
 */
export async function deactivateInactiveAgents() {
  const result = await query(
    `UPDATE agents
        SET active = FALSE,
            deactivated_at = NOW(),
            deactivation_reason = 'inatividade',
            updated_at = NOW()
      WHERE active = TRUE
        AND (email IS NULL OR LOWER(email) <> ALL($1::text[]))
        AND COALESCE(last_activity_at, last_login_at) IS NOT NULL
        AND GREATEST(COALESCE(last_activity_at, '-infinity'::timestamp),
                     COALESCE(last_login_at, '-infinity'::timestamp)) < NOW() - ($2 || ' days')::interval
      RETURNING id, name, email, last_activity_at, last_login_at`,
    [getExemptEmails(), String(INACTIVITY_DAYS)]
  );

  for (const row of result.rows) {
    invalidateAgentActiveCache(row.id);
    console.log(
      `[Inatividade] Agente inativado por ${INACTIVITY_DAYS}+ dias sem uso: ${row.name} <${row.email}> ` +
      `(id=${row.id}, última atividade=${row.last_activity_at?.toISOString?.() || row.last_activity_at}, ` +
      `último login=${row.last_login_at?.toISOString?.() || row.last_login_at})`
    );
  }

  if (result.rows.length === 0) {
    console.log('[Inatividade] Nenhum agente para inativar.');
  }

  return { deactivated: result.rows.length, agents: result.rows };
}
