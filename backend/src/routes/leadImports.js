import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { loadAgentMiddleware } from '../middleware/permissions.js';
import { query, pool } from '../config/database.js';

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

function isAdminOrSupervisor(req) {
  if (req.user?.role === 'admin') return true;
  const t = req.agent?.agentType;
  if (!t) return false;
  return t === 'admin' || t === 'supervisor' || t === 'sales_supervisor' || t.endsWith('_supervisor');
}

function requireAdminOrSupervisor(req, res, next) {
  if (!isAdminOrSupervisor(req)) {
    return res.status(403).json({ message: 'Acesso restrito a administradores e supervisores' });
  }
  next();
}

const UFS = new Set([
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
  'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'
]);

export function normalizePhone(raw) {
  if (raw === null || raw === undefined) return '';
  let digits = String(raw).replace(/\D/g, '');
  // remove código do país 55 quando presente
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) {
    digits = digits.slice(2);
  }
  return digits;
}

export function isValidPhone(digits) {
  if (!digits) return false;
  if (digits.length !== 10 && digits.length !== 11) return false;
  const ddd = parseInt(digits.slice(0, 2), 10);
  if (ddd < 11 || ddd > 99) return false;
  if (/^(\d)\1+$/.test(digits)) return false;
  return true;
}

export function normalizeCpf(raw) {
  if (raw === null || raw === undefined) return '';
  let digits = String(raw).replace(/\D/g, '');
  // Excel pode remover zeros à esquerda
  if (digits.length > 0 && digits.length < 11) {
    digits = digits.padStart(11, '0');
  }
  return digits;
}

export function isValidCpf(cpf) {
  if (!cpf || cpf.length !== 11) return false;
  if (/^(\d)\1+$/.test(cpf)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(cpf[i], 10) * (10 - i);
  let d1 = (sum * 10) % 11;
  if (d1 === 10) d1 = 0;
  if (d1 !== parseInt(cpf[9], 10)) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(cpf[i], 10) * (11 - i);
  let d2 = (sum * 10) % 11;
  if (d2 === 10) d2 = 0;
  return d2 === parseInt(cpf[10], 10);
}

function formatCpf(digits) {
  if (!digits || digits.length !== 11) return digits || '';
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

// Valida uma linha e retorna { status, reason, normalized }
function validateRow(row) {
  const nome = String(row.nome ?? '').trim();
  const cidade = String(row.cidade ?? '').trim();
  const uf = String(row.uf ?? '').trim().toUpperCase();
  const cpfDigits = normalizeCpf(row.cpf);
  const phoneDigits = normalizePhone(row.telefone);

  if (!nome) {
    return { status: 'error', reason: 'Nome vazio' };
  }
  if (!phoneDigits) {
    return { status: 'error', reason: 'Telefone vazio' };
  }
  if (!isValidPhone(phoneDigits)) {
    return { status: 'error', reason: 'Telefone inválido' };
  }
  if (cpfDigits && !isValidCpf(cpfDigits)) {
    return { status: 'error', reason: 'CPF inválido' };
  }
  if (uf && !UFS.has(uf)) {
    return { status: 'error', reason: 'UF inexistente' };
  }

  return {
    status: 'valid',
    normalized: {
      name: nome,
      cpf: cpfDigits ? formatCpf(cpfDigits) : null,
      cpfDigits: cpfDigits || null,
      city: cidade || null,
      state: uf || null,
      phone: phoneDigits
    }
  };
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

  const seenPhones = new Set();
  const seenCpfs = new Set();
  for (const r of results) {
    if (r.status !== 'valid') continue;
    const dbDupPhone = dupMap.get(`p:${r.normalized.phone}`);
    const dbDupCpf = r.normalized.cpfDigits ? dupMap.get(`c:${r.normalized.cpfDigits}`) : null;
    if (dbDupPhone || dbDupCpf) {
      r.status = 'duplicate';
      r.reason = dbDupPhone || dbDupCpf;
      continue;
    }
    if (seenPhones.has(r.normalized.phone)) {
      r.status = 'duplicate';
      r.reason = 'Telefone duplicado na própria planilha';
      continue;
    }
    if (r.normalized.cpfDigits && seenCpfs.has(r.normalized.cpfDigits)) {
      r.status = 'duplicate';
      r.reason = 'CPF duplicado na própria planilha';
      continue;
    }
    seenPhones.add(r.normalized.phone);
    if (r.normalized.cpfDigits) seenCpfs.add(r.normalized.cpfDigits);
  }

  return results;
}

// POST /preview — recebe { rows: [{cpf, nome, cidade, uf, telefone}] } e classifica cada linha
router.post('/preview', authMiddleware, loadAgentMiddleware, requireAdminOrSupervisor, async (req, res) => {
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
router.post('/confirm', authMiddleware, loadAgentMiddleware, requireAdminOrSupervisor, async (req, res) => {
  const client = await pool.connect();
  try {
    const { rows, agentIds, stage, fileName } = req.body;
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
      'SELECT id, name, team_id FROM agents WHERE id = ANY($1::uuid[]) AND active = true',
      [agentIds]
    );
    const agentsById = new Map(agentsResult.rows.map(a => [a.id, a]));
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
        await client.query(
          `INSERT INTO leads (name, cpf, phone, whatsapp, city, state, stage, agent_id, team_id, source, status)
           VALUES ($1, $2, $3, $3, $4, $5, $6, $7, $8, 'importacao_planilha', 'active')`,
          [n.name, n.cpf, n.phone, n.city, n.state, leadStage, agent.id, agent.team_id || null]
        );
      }

      const perAgent = orderedAgents.map(a => ({
        agentId: a.id,
        agentName: a.name,
        count: perAgentCount.get(a.id)
      }));

      const logResult = await client.query(
        `INSERT INTO lead_imports (module, file_name, imported_by, imported_by_name, total_rows, imported_count, skipped_count, per_agent, skipped_details)
         VALUES ('vendas_pf', $1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          fileName || null,
          req.agent?.id || null,
          req.agent?.name || req.user?.full_name || req.user?.email || 'Admin',
          results.length,
          assignments.length,
          skipped.length,
          JSON.stringify(perAgent),
          JSON.stringify(skipped.slice(0, 500))
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
router.get('/', authMiddleware, loadAgentMiddleware, requireAdminOrSupervisor, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, module, file_name, imported_by_name, total_rows, imported_count, skipped_count, per_agent, created_at
       FROM lead_imports WHERE module = 'vendas_pf' ORDER BY created_at DESC LIMIT 50`
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
