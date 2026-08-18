import { query, pool } from '../config/database.js';
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
 * Garante que a tabela de log exista antes de qualquer operação.
 * Resolvida uma vez e reutilizada — evita condição de corrida entre
 * o módulo de entidades (que também cria a tabela) e o cron.
 */
export const logTableReady = pool.query(`
  CREATE TABLE IF NOT EXISTS agent_inactivity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL,
    agent_name VARCHAR(255),
    agent_email VARCHAR(255),
    reason VARCHAR(100) NOT NULL DEFAULT 'inatividade',
    last_activity_at TIMESTAMP,
    last_login_at TIMESTAMP,
    deactivated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_agent_inactivity_log_agent ON agent_inactivity_log(agent_id);
  CREATE INDEX IF NOT EXISTS idx_agent_inactivity_log_created ON agent_inactivity_log(created_at DESC);
`).then(() => {
  console.log('[Inatividade] Tabela agent_inactivity_log OK');
}).catch(e => {
  console.error('[Inatividade] Falha ao criar tabela de log:', e.message);
  throw e; // Re-throw: se não existe a tabela não podemos auditar com segurança
});

/**
 * Inativa agentes ativos sem atividade registrada há 30+ dias.
 * - Toda conta tem um marco inicial: last_activity_at tem DEFAULT NOW() (contas
 *   novas contam a partir da criação) e o backfill da migração inicializou os
 *   registros existentes na data do deploy — ninguém é inativado no dia 1.
 * - Registros legados ainda sem marco (NULL) são ignorados por segurança.
 * - Os e-mails isentos (por requisito, o usuário master) vêm de getExemptEmails().
 * Grava data e motivo ('inatividade') para distinguir de inativação manual.
 *
 * O UPDATE dos agentes e o INSERT no log de auditoria acontecem numa única CTE
 * atômica: se o INSERT falhar, o UPDATE é revertido automaticamente e nenhum
 * agente fica inativado sem registro persistido.
 */
export async function deactivateInactiveAgents() {
  // Aguarda a tabela de log estar disponível antes de prosseguir
  await logTableReady;

  const result = await query(
    `WITH deactivated AS (
       UPDATE agents
          SET active = FALSE,
              deactivated_at = NOW(),
              deactivation_reason = 'inatividade',
              updated_at = NOW()
        WHERE active = TRUE
          AND (email IS NULL OR LOWER(email) <> ALL($1::text[]))
          AND COALESCE(last_activity_at, last_login_at) IS NOT NULL
          AND GREATEST(COALESCE(last_activity_at, '-infinity'::timestamp),
                       COALESCE(last_login_at, '-infinity'::timestamp)) < NOW() - ($2 || ' days')::interval
       RETURNING id, name, email, last_activity_at, last_login_at
     ),
     log_insert AS (
       INSERT INTO agent_inactivity_log
         (agent_id, agent_name, agent_email, reason, last_activity_at, last_login_at, deactivated_at)
       SELECT id, name, email, 'inatividade', last_activity_at, last_login_at, NOW()
       FROM deactivated
     )
     SELECT * FROM deactivated`,
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
