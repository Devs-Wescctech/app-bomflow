import { pool } from '../config/database.js';

/**
 * Serializa alterações locais do cadastro e sincronizações ERP do mesmo agente.
 * O lock de sessão permanece ativo inclusive enquanto a chamada ao ERP acontece,
 * evitando registrar um canal que foi trocado concorrentemente no Bom Flow.
 */
export async function acquireAgentMutationLock(agentId) {
  const key = String(agentId || '');
  if (!key) throw new Error('agentId é obrigatório para adquirir o lock do agente.');

  const client = await pool.connect();
  try {
    await client.query(
      'SELECT pg_advisory_lock(hashtextextended($1, 0))',
      [key]
    );
  } catch (error) {
    client.release();
    throw error;
  }

  let released = false;
  return {
    client,
    release: async () => {
      if (released) return;
      released = true;
      try {
        await client.query(
          'SELECT pg_advisory_unlock(hashtextextended($1, 0))',
          [key]
        );
      } finally {
        client.release();
      }
    },
  };
}