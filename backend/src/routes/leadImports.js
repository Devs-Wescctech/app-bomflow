import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { loadAgentMiddleware } from '../middleware/permissions.js';
import { query, pool } from '../config/database.js';
import {
  normalizePhone,
  isValidPhone,
  normalizeCpf,
  isValidCpf,
  validateRow,
  markDuplicates
} from '../utils/leadImportValidation.js';

export { normalizePhone, isValidPhone, normalizeCpf, isValidCpf };

const router = Router();

// Migração: tabela de histórico de importações de leads PF
pool.query(`
  CREATE TABLE IF NOT EXISTS lead_imports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module VARCHAR(50) DEFAULT 'vendas_pf',
    file_name VARCHAR(500),
    imported_by UUID,
    imported_by_name VARCHAR(255),
    total_rows INTEGER DEFAULT 0,
    imported_count INTEGER DEFAULT 0,
    skipped_count INTEGER DEFAULT 0,
    per_agent JSONB DEFAULT '[]'::jsonb,
    skipped_details JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
`).then(() => console.log('[Migration] lead_imports OK'))
  .catch(e => console.error('[Migration] lead_imports error:', e.message));

// Módulos suportados pela importação
const IMPORT_MODULES = new Set(['vendas_pf', 'indicacoes']);

function isAdminOrSupervisor(req) {
  if (req.user?.role === 'admin') return true;
  const t = req.agent?.agentType;
  if (!t) return false;
  return t === 'admin' || t === 'supervisor' || t === 'sales_supervisor' || t.endsWith('_supervisor');
}

// Autorização por módulo: além das regras gerais (paridade com PF), admins do
// próprio módulo podem importar nele (ex.: indicacoes_admin em 'indicacoes').
function isAllowedForModule(req, module) {
  if (isAdminOrSupervisor(req)) return true;
  const t = req.agent?.agentType;
  if (module === 'indicacoes' && t === 'indicacoes_admin') return true;
  return false;
}

// Middleware que valida a permissão contra o módulo solicitado (body ou query).
// Módulo inválido/ausente cai em 'vendas_pf', mantendo o comportamento original do PF.
function requireImportPermission(req, res, next) {
  const requested = req.body?.module ?? req.query?.module;
  const module = IMPORT_MODULES.has(requested) ? requested : 'vendas_pf';
  if (!isAllowedForModule(req, module)) {
    return res.status(403).json({ message: 'Acesso restrito a administradores e supervisores' });
  }
  req.importModule = module;
  next();
}

// Busca duplicados por telefone nos 4 módulos e por CPF em Vendas PF, em lote
async function findDuplicates(phones, cpfs) {
  const dupMap = new Map(); // phone/cpf -> motivo

  if (phones.length > 0) {
    const checks = [
      { sql: `SELECT DISTINCT REGEXP_REPLACE(COALESCE(whatsapp, phone, ''), '[^0-9]', '', 'g') AS p FROM leads WHERE REGEXP_REPLACE(COALESCE(whatsapp, phone, ''), '[^0-9]', '', 'g') = ANY($1)`, label: 'Vendas PF' },
      { sql: `SELECT DISTINCT REGEXP_REPLACE(COALESCE(phone, contact_phone, ''), '[^0-9]', '', 'g') AS p FROM leads_pj WHERE REGEXP_REPLACE(COALESCE(phone, contact_phone, ''), '[^0-9]', '', 'g') = ANY($1)`, label: 'Vendas PJ' },
      { sql: `SELECT DISTINCT REGEXP_REPLACE(COALESCE(whatsapp, phone, ''), '[^0-9]', '', 'g') AS p FROM leads_upsell WHERE REGEXP_REPLACE(COALESCE(whatsapp, phone, ''), '[^0-9]', '', 'g') = ANY($1)`, label: 'Upsell' },
      { sql: `SELECT DISTINCT REGEXP_REPLACE(COALESCE(referred_phone, ''), '[^0-9]', '', 'g') AS p FROM referrals WHERE REGEXP_REPLACE(COALESCE(referred_phone, ''), '[^0-9]', '', 'g') = ANY($1)`, label: 'Indicações' }
    ];
    for (const check of checks) {
      const result = await query(check.sql, [phones]);
      for (const r of result.rows) {
        const key = `p:${r.p}`;
        if (!dupMap.has(key)) dupMap.set(key, `Telefone já cadastrado em ${check.label}`);
      }
    }
  }

  if (cpfs.length > 0) {
    const result = await query(
      `SELECT DISTINCT REGEXP_REPLACE(COALESCE(cpf, ''), '[^0-9]', '', 'g') AS c FROM leads WHERE REGEXP_REPLACE(COALESCE(cpf, ''), '[^0-9]', '', 'g') = ANY($1)`,
      [cpfs]
    );
    for (const r of result.rows) {
      const key = `c:${r.c}`;
      if (!dupMap.has(key)) dupMap.set(key, 'CPF já cadastrado em Vendas PF');
    }
  }

  return dupMap;
}

// Classifica todas as linhas: validação + duplicados (banco e dentro do lote)
async function classifyRows(rows) {
  const results = rows.map((row, index) => {
    const v = validateRow(row);
    return { index, row, ...v };
  });

  const validRows = results.filter(r => r.status === 'valid');
  const phones = [...new Set(validRows.map(r => r.normalized.phone))];
  const cpfs = [...new Set(validRows.filter(r => r.normalized.cpfDigits).map(r => r.normalized.cpfDigits))];

  const dupMap = await findDuplicates(phones, cpfs);

  markDuplicates(results, dupMap);

  return results;
}

// POST /preview — recebe { rows: [{cpf, nome, cidade, uf, telefone}] } e classifica cada linha
router.post('/preview', authMiddleware, loadAgentMiddleware, requireImportPermission, async (req, res) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ message: 'Nenhuma linha recebida. Verifique se a planilha tem dados.' });
    }
    if (rows.length > 5000) {
      return res.status(400).json({ message: 'Limite de 5000 linhas por importação.' });
    }

    const results = await classifyRows(rows);

    const summary = {
      total: results.length,
      valid: results.filter(r => r.status === 'valid').length,
      errors: results.filter(r => r.status === 'error').length,
      duplicates: results.filter(r => r.status === 'duplicate').length
    };

    res.json({
      summary,
      rows: results.map(r => ({
        index: r.index,
        status: r.status,
        reason: r.reason || null,
        data: {
          cpf: r.normalized?.cpf ?? String(r.row.cpf ?? '').trim(),
          nome: String(r.row.nome ?? '').trim(),
          cidade: String(r.row.cidade ?? '').trim(),
          uf: String(r.row.uf ?? '').trim().toUpperCase(),
          telefone: r.normalized?.phone ?? String(r.row.telefone ?? '').trim()
        }
      }))
    });
  } catch (error) {
    console.error('[LeadImport] Preview error:', error);
    res.status(500).json({ message: error.message });
  }
});

// POST /confirm — revalida no servidor, distribui em rodízio e grava tudo em uma transação
router.post('/confirm', authMiddleware, loadAgentMiddleware, requireImportPermission, async (req, res) => {
  const client = await pool.connect();
  try {
    const { rows, agentIds, stage, fileName } = req.body;
    const module = req.importModule || 'vendas_pf';
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ message: 'Nenhuma linha recebida.' });
    }
    if (rows.length > 5000) {
      return res.status(400).json({ message: 'Limite de 5000 linhas por importação.' });
    }
    if (!Array.isArray(agentIds) || agentIds.length === 0) {
      return res.status(400).json({ message: 'Selecione ao menos um vendedor para a distribuição.' });
    }

    const agentsResult = await query(
      'SELECT id, name, team_id, agent_type FROM agents WHERE id = ANY($1::uuid[]) AND active = true',
      [agentIds]
    );
    let eligibleAgents = agentsResult.rows;

    if (module === 'indicacoes') {
      // Somente agentes cujo tipo pertence ao módulo Indicações (referral) ou 'all'
      const typesResult = await query(
        `SELECT key FROM agent_types WHERE active = true AND ('referral' = ANY(modules) OR 'all' = ANY(modules))`
      );
      const referralTypes = new Set(typesResult.rows.map(t => t.key));
      eligibleAgents = eligibleAgents.filter(a => referralTypes.has(a.agent_type));
      if (eligibleAgents.length === 0) {
        return res.status(400).json({ message: 'Nenhum dos vendedores selecionados pertence ao módulo Indicações.' });
      }
    }

    const agentsById = new Map(eligibleAgents.map(a => [a.id, a]));
    const orderedAgents = agentIds.filter(id => agentsById.has(id)).map(id => agentsById.get(id));
    if (orderedAgents.length === 0) {
      return res.status(400).json({ message: 'Nenhum dos vendedores selecionados está ativo.' });
    }

    const leadStage = String(stage || 'novo');

    // Revalidação completa no servidor (fonte da verdade)
    const results = await classifyRows(rows);
    const validRows = results.filter(r => r.status === 'valid');
    const skipped = results
      .filter(r => r.status !== 'valid')
      .map(r => ({
        linha: r.index + 1,
        nome: String(r.row.nome ?? '').trim(),
        telefone: String(r.row.telefone ?? '').trim(),
        status: r.status === 'duplicate' ? 'duplicado' : 'erro',
        motivo: r.reason
      }));

    // Distribuição round-robin igualitária, sobra em sequência
    const perAgentCount = new Map(orderedAgents.map(a => [a.id, 0]));
    const assignments = validRows.map((r, i) => {
      const agent = orderedAgents[i % orderedAgents.length];
      perAgentCount.set(agent.id, perAgentCount.get(agent.id) + 1);
      return { row: r, agent };
    });

    let importRecord = null;
    await client.query('BEGIN');
    try {
      for (const { row, agent } of assignments) {
        const n = row.normalized;
        if (module === 'indicacoes') {
          const address = [n.city, n.state].filter(Boolean).join(' - ') || null;
          await client.query(
            `INSERT INTO referrals (referred_name, referred_phone, referred_cpf, referred_address, stage, agent_id, status, notes)
             VALUES ($1, $2, $3, $4, $5, $6, 'ativo', 'Importado via planilha')`,
            [n.name, n.phone, n.cpf, address, leadStage, agent.id]
          );
        } else {
          await client.query(
            `INSERT INTO leads (name, cpf, phone, whatsapp, city, state, stage, agent_id, team_id, source, status)
             VALUES ($1, $2, $3, $3, $4, $5, $6, $7, $8, 'importacao_planilha', 'active')`,
            [n.name, n.cpf, n.phone, n.city, n.state, leadStage, agent.id, agent.team_id || null]
          );
        }
      }

      const perAgent = orderedAgents.map(a => ({
        agentId: a.id,
        agentName: a.name,
        count: perAgentCount.get(a.id)
      }));

      const logResult = await client.query(
        `INSERT INTO lead_imports (module, file_name, imported_by, imported_by_name, total_rows, imported_count, skipped_count, per_agent, skipped_details)
         VALUES ($9, $1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          fileName || null,
          req.agent?.id || null,
          req.agent?.name || req.user?.full_name || req.user?.email || 'Admin',
          results.length,
          assignments.length,
          skipped.length,
          JSON.stringify(perAgent),
          JSON.stringify(skipped.slice(0, 500)),
          module
        ]
      );
      importRecord = logResult.rows[0];

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    }

    // Importação silenciosa: sem automações de boas-vindas e sem notificações em massa.
    res.json({
      imported: assignments.length,
      skipped,
      perAgent: orderedAgents.map(a => ({
        agentId: a.id,
        agentName: a.name,
        count: perAgentCount.get(a.id)
      })),
      importId: importRecord?.id
    });
  } catch (error) {
    console.error('[LeadImport] Confirm error:', error);
    res.status(500).json({ message: error.message });
  } finally {
    client.release();
  }
});

// GET / — histórico de importações
router.get('/', authMiddleware, loadAgentMiddleware, requireImportPermission, async (req, res) => {
  try {
    const module = req.importModule || 'vendas_pf';
    const result = await query(
      `SELECT id, module, file_name, imported_by_name, total_rows, imported_count, skipped_count, per_agent, created_at
       FROM lead_imports WHERE module = $1 ORDER BY created_at DESC LIMIT 50`,
      [module]
    );
    res.json(result.rows.map(r => ({
      id: r.id,
      fileName: r.file_name,
      importedByName: r.imported_by_name,
      totalRows: r.total_rows,
      importedCount: r.imported_count,
      skippedCount: r.skipped_count,
      perAgent: r.per_agent,
      createdAt: r.created_at
    })));
  } catch (error) {
    console.error('[LeadImport] History error:', error);
    res.status(500).json({ message: error.message });
  }
});

export default router;
