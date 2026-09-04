import { Router } from 'express';
import { query, withTransaction } from '../config/database.js';
import { authMiddleware } from '../middleware/auth.js';
import { fetchErpAllPages, ErpUpstreamError } from '../utils/erpPagination.js';
import { canAccessAtendimento } from '../utils/bomPetAuthz.js';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import process from 'node:process';
import { fileURLToPath } from 'url';
import {
  getBomPetDeathMarkingConflict,
  isValidBomPetDateOnly,
  serializeBomPetRow,
} from '../utils/bomPetDate.js';
import {
  assertBomPetGuardedUpdateApplied,
  evaluateBomPetDeathEligibility,
} from '../utils/bomPetDeathEligibility.js';
import {
  BOM_PET_PARTNER_STATUSES,
  canManageBomPetPartners,
  partnerValueChanged,
  snapshotActivePartner,
  validatePartnerPayload,
} from '../utils/bomPetPartnerRules.js';
import { lookupPessoaByCpf, resolvePessoa } from '../services/erpPessoaService.js';
import {
  findBomPetOrphanFilenames,
  isBomPetPaymentContentValid,
  normalizeBomPetOrigem,
  parseParticularPaidAmount,
  validateParticularFields,
} from '../utils/bomPetParticularRules.js';
import {
  isBomPetErpDeathSyncEnabled,
  markBomPetPessoaFalecida,
  resolveBomPetPessoa,
} from '../services/bomPetErpDeathService.js';

const router = Router();

const __filename2 = fileURLToPath(import.meta.url);
const __dirname2 = path.dirname(__filename2);
const uploadDir = path.join(__dirname2, '../../../data/bom-pet-images');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});

const imageUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Apenas imagens são permitidas (JPEG, PNG, GIF, WebP)'), false);
    }
  }
});

const paymentUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 3 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Comprovantes devem ser imagens JPEG, PNG, GIF, WebP ou PDF.'), false);
  },
});

function removeUploadedFiles(files = []) {
  files.forEach((file) => {
    try { fs.unlinkSync(file.path); } catch { /* limpeza é idempotente */ }
  });
}

function isPaymentFileContentValid(file) {
  return isBomPetPaymentContentValid(fs.readFileSync(file.path), file.mimetype);
}

function parseBoolean(value) {
  return value === true || value === 'true' || value === '1';
}

export async function cleanupBomPetOrphanFiles({ minAgeMs = 60 * 60 * 1000 } = {}) {
  try {
    const references = await query(
      `SELECT filename FROM bom_pet_imagens
       UNION
       SELECT filename FROM bom_pet_comprovantes_pagamento`
    );
    const entries = fs.readdirSync(uploadDir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => {
        const stat = fs.statSync(path.join(uploadDir, entry.name));
        return { name: entry.name, mtimeMs: stat.mtimeMs };
      });
    const orphans = findBomPetOrphanFilenames(
      entries,
      references.rows.map((row) => row.filename),
      Date.now() - minAgeMs
    );
    let removed = 0;
    for (const filename of orphans) {
      try {
        fs.unlinkSync(path.join(uploadDir, filename));
        removed += 1;
      } catch (error) {
        console.error('[BomPet] Falha ao remover arquivo órfão:', { filename, code: error.code });
      }
    }
    return { checked: entries.length, removed };
  } catch (error) {
    console.error('[BomPet] Falha na reconciliação de arquivos privados:', error.message);
    return { checked: 0, removed: 0, error: true };
  }
}

// ── Autorização por perfil no BACKEND (não só na UI) ──────────────────────
// O JWT carrega apenas id/email/role; o tipo de agente vem do banco.
const ALLOWED_AGENT_TYPES = ['admin', 'bom_pet_supervisor', 'bom_pet_atendente'];

async function bomPetAuth(req, res, next) {
  try {
    if (req.user?.role === 'admin') {
      req.bomPetAgent = { email: req.user.email, agent_type: 'admin', name: req.user.email };
      return next();
    }
    const result = await query(
      'SELECT id, email, name, agent_type FROM agents WHERE id = $1 AND active = true',
      [req.user.id]
    );
    const agent = result.rows[0];
    if (!agent) return res.status(403).json({ message: 'Acesso negado ao módulo Bom Pet.' });

    const typeResult = await query(
      'SELECT modules, allowed_submenus FROM agent_types WHERE key = $1',
      [agent.agent_type]
    );
    const modules = typeResult.rows[0]?.modules || [];
    const allowedSubmenus = typeResult.rows[0]?.allowed_submenus || [];
    const hasModule = ALLOWED_AGENT_TYPES.includes(agent.agent_type);
    const hasDynamicModule = Array.isArray(modules)
      && (modules.includes('bom_pet') || modules.includes('all'));
    if (!hasModule && !hasDynamicModule) {
      return res.status(403).json({ message: 'Acesso negado ao módulo Bom Pet.' });
    }
    req.bomPetAgent = { ...agent, modules, allowedSubmenus };
    next();
  } catch (err) {
    console.error('[BomPet] Erro na autorização:', err.message);
    res.status(500).json({ message: 'Erro ao validar permissões.' });
  }
}

function isBomPetSupervisor(req) {
  const t = req.bomPetAgent?.agent_type;
  return t === 'admin' || t === 'bom_pet_supervisor' || req.user?.role === 'admin';
}

// Usuário SEMPRE extraído do token/banco, nunca do body.
function currentUsuario(req) {
  return req.bomPetAgent?.email || req.user?.email || '';
}

// ── Autorização em nível de registro ──────────────────────────────────────
// Atendentes só acessam atendimentos próprios (usuario == identidade do token);
// supervisores/admins acessam todos. Regra pura em utils/bomPetAuthz.js.

// Carrega o atendimento e aplica a regra de escopo. Responde 404/403 e retorna null,
// ou retorna a linha quando autorizado.
async function loadAuthorizedAtendimento(req, res, id) {
  const result = await query('SELECT * FROM bom_pet_atendimentos WHERE id = $1', [id]);
  if (result.rows.length === 0) {
    res.status(404).json({ message: 'Atendimento não encontrado.' });
    return null;
  }
  const atendimento = result.rows[0];
  if (!canAccessAtendimento({ isSupervisor: isBomPetSupervisor(req), usuario: currentUsuario(req) }, atendimento)) {
    res.status(403).json({ message: 'Acesso negado: este atendimento pertence a outro atendente.' });
    return null;
  }
  return atendimento;
}

// Restringe endpoints de visão geral (relatório, lista de atendentes) a supervisores.
function requireSupervisor(req, res, next) {
  if (!isBomPetSupervisor(req)) {
    return res.status(403).json({ message: 'Acesso restrito a supervisores e administradores.' });
  }
  next();
}

function canManageBomPetPartnersForRequest(req) {
  return canManageBomPetPartners({
    userRole: req.user?.role,
    agentType: req.bomPetAgent?.agent_type,
    modules: req.bomPetAgent?.modules,
    allowedSubmenus: req.bomPetAgent?.allowedSubmenus,
  });
}

function requireBomPetPartnerManagement(req, res, next) {
  if (!canManageBomPetPartnersForRequest(req)) {
    return res.status(403).json({ message: 'Seu perfil não tem permissão para gerenciar parceiros do Bom Pet.' });
  }
  next();
}

function partnerError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function serializePartner(row) {
  if (!row) return row;
  return {
    ...row,
    valor_servico: row.valor_servico === null || row.valor_servico === undefined
      ? null : Number(row.valor_servico),
  };
}

function serializePartnerHistory(row) {
  return serializePartner(row);
}

// ── Parceiros Bom Pet ─────────────────────────────────────────────────────
// A lista mínima de parceiros ativos é usada no registro de cremação por
// qualquer perfil autorizado no módulo. Os demais endpoints são administrativos.
router.get('/parceiros/ativos', authMiddleware, bomPetAuth, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, nome, valor_servico
         FROM bom_pet_parceiros
        WHERE status = 'Ativo'
        ORDER BY nome ASC`
    );
    res.json(result.rows.map(serializePartner));
  } catch (error) {
    console.error('Error fetching active Bom Pet partners:', error);
    res.status(500).json({ message: error.message });
  }
});

router.get('/parceiros', authMiddleware, bomPetAuth, requireBomPetPartnerManagement, async (req, res) => {
  try {
    const { status = 'todos', busca = '' } = req.query;
    if (status !== 'todos' && !BOM_PET_PARTNER_STATUSES.includes(status)) {
      return res.status(400).json({ message: 'Filtro de status inválido.' });
    }
    const params = [];
    const conditions = [];
    if (status !== 'todos') {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }
    if (String(busca).trim()) {
      params.push(`%${String(busca).trim()}%`);
      conditions.push(`(nome ILIKE $${params.length} OR email ILIKE $${params.length})`);
    }
    const result = await query(
      `SELECT id, nome, valor_servico, data_cadastro, email, telefone, status,
              data_exclusao, created_at, updated_at
         FROM bom_pet_parceiros
        ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
        ORDER BY CASE WHEN status = 'Ativo' THEN 0 ELSE 1 END, nome ASC`,
      params
    );
    res.json(result.rows.map(serializePartner));
  } catch (error) {
    console.error('Error listing Bom Pet partners:', error);
    res.status(500).json({ message: error.message });
  }
});

router.get('/parceiros/:id(\\d+)', authMiddleware, bomPetAuth, requireBomPetPartnerManagement, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, nome, valor_servico, data_cadastro, email, telefone, status,
              data_exclusao, created_at, updated_at
         FROM bom_pet_parceiros
        WHERE id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Parceiro não encontrado.' });
    }
    const history = await query(
      `SELECT id, parceiro_id, valor_servico, vigencia_inicio, vigencia_fim, created_at
         FROM bom_pet_parceiros_historico
        WHERE parceiro_id = $1
        ORDER BY vigencia_inicio DESC, id DESC`,
      [req.params.id]
    );
    res.json({
      ...serializePartner(result.rows[0]),
      historico: history.rows.map(serializePartnerHistory),
    });
  } catch (error) {
    console.error('Error fetching Bom Pet partner:', error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/parceiros', authMiddleware, bomPetAuth, requireBomPetPartnerManagement, async (req, res) => {
  try {
    const { errors, normalized } = validatePartnerPayload(req.body);
    if (errors.length > 0) return res.status(400).json({ message: errors.join(' ') });
    if (req.body.status && req.body.status !== 'Ativo') {
      return res.status(400).json({ message: 'Novos parceiros devem nascer Ativos.' });
    }
    if (req.body.data_exclusao) {
      return res.status(400).json({ message: 'Um novo parceiro ativo não pode ter data de exclusão.' });
    }

    const partner = await withTransaction(async (client) => {
      const inserted = await client.query(
        `INSERT INTO bom_pet_parceiros
          (nome, valor_servico, data_cadastro, email, telefone, status, data_exclusao)
         VALUES ($1, $2, $3, $4, $5, 'Ativo', NULL)
         RETURNING *`,
        [
          normalized.nome, normalized.valor_servico, normalized.data_cadastro,
          normalized.email ?? null, normalized.telefone ?? null,
        ]
      );
      const row = inserted.rows[0];
      await client.query(
        `INSERT INTO bom_pet_parceiros_historico
          (parceiro_id, valor_servico, vigencia_inicio)
         VALUES ($1, $2, $3::date::timestamp AT TIME ZONE 'America/Sao_Paulo')`,
        [row.id, normalized.valor_servico, normalized.data_cadastro]
      );
      return row;
    });
    res.status(201).json(serializePartner(partner));
  } catch (error) {
    console.error('Error creating Bom Pet partner:', error);
    res.status(error.statusCode || 500).json({ message: error.message });
  }
});

router.put('/parceiros/:id(\\d+)', authMiddleware, bomPetAuth, requireBomPetPartnerManagement, async (req, res) => {
  try {
    const { errors, normalized } = validatePartnerPayload(req.body, { partial: true });
    if (errors.length > 0) return res.status(400).json({ message: errors.join(' ') });

    const result = await withTransaction(async (client) => {
      const currentResult = await client.query(
        'SELECT * FROM bom_pet_parceiros WHERE id = $1 FOR UPDATE',
        [req.params.id]
      );
      if (currentResult.rows.length === 0) throw partnerError('Parceiro não encontrado.', 404);
      const current = currentResult.rows[0];
      const currentRegistrationDate = current.data_cadastro instanceof Date
        ? current.data_cadastro.toISOString().slice(0, 10)
        : String(current.data_cadastro).slice(0, 10);
      if (normalized.data_cadastro && normalized.data_cadastro !== currentRegistrationDate) {
        throw partnerError('A data de cadastro não pode ser alterada após a criação.');
      }
      const currentHistory = await client.query(
        `SELECT COUNT(*)::int AS count
           FROM bom_pet_parceiros_historico
          WHERE parceiro_id = $1 AND vigencia_fim IS NULL`,
        [req.params.id]
      );
      if (currentHistory.rows[0]?.count !== 1) {
        throw partnerError('Histórico de vigência inconsistente para este parceiro.', 409);
      }
      const next = {
        nome: normalized.nome ?? current.nome,
        valor_servico: normalized.valor_servico ?? Number(current.valor_servico),
        data_cadastro: currentRegistrationDate,
        email: Object.prototype.hasOwnProperty.call(normalized, 'email') ? normalized.email : current.email,
        telefone: Object.prototype.hasOwnProperty.call(normalized, 'telefone') ? normalized.telefone : current.telefone,
        status: normalized.status ?? current.status,
        data_exclusao: Object.prototype.hasOwnProperty.call(normalized, 'data_exclusao')
          ? normalized.data_exclusao : current.data_exclusao,
      };

      if (next.status === 'Inativo' && !next.data_exclusao) {
        throw partnerError('Informe a data de exclusão para inativar o parceiro.');
      }
      if (next.status === 'Ativo') next.data_exclusao = null;
      if (next.status === 'Inativo' && next.data_exclusao < next.data_cadastro) {
        throw partnerError('A data de exclusão não pode ser anterior à data de cadastro.');
      }

      const updated = await client.query(
        `UPDATE bom_pet_parceiros
            SET nome = $1, valor_servico = $2, data_cadastro = $3, email = $4,
                telefone = $5, status = $6, data_exclusao = $7, updated_at = CURRENT_TIMESTAMP
          WHERE id = $8
          RETURNING *`,
        [
          next.nome, next.valor_servico, next.data_cadastro, next.email,
          next.telefone, next.status, next.data_exclusao, req.params.id,
        ]
      );

      if (partnerValueChanged(current.valor_servico, next.valor_servico)) {
        const changedAt = new Date();
        const closed = await client.query(
          `UPDATE bom_pet_parceiros_historico
              SET vigencia_fim = $2
            WHERE parceiro_id = $1 AND vigencia_fim IS NULL`,
          [req.params.id, changedAt]
        );
        if (closed.rowCount !== 1) {
          throw partnerError('Histórico de vigência inconsistente para este parceiro.', 409);
        }
        await client.query(
          `INSERT INTO bom_pet_parceiros_historico
            (parceiro_id, valor_servico, vigencia_inicio)
           VALUES ($1, $2, $3)`,
          [req.params.id, next.valor_servico, changedAt]
        );
      }
      return updated.rows[0];
    });
    res.json(serializePartner(result));
  } catch (error) {
    console.error('Error updating Bom Pet partner:', error);
    res.status(error.statusCode || 500).json({ message: error.message });
  }
});

const ERP_BASE = 'http://erp.wescctech.com.br:8080/BP_MULTI/api';
const erpToken = () => process.env.ERP_AUTH_TOKEN || '';

function formatCpf(digits) {
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

// ── Cache do dataset API_BOM_FLOW_PET ─────────────────────────────────────
// A API ignora filtros de query (documento/contratante) e corta em 100 linhas
// por padrão; é obrigatório paginar (limit/offset) e filtrar localmente.
let petCache = { data: null, at: 0, promise: null };
const PET_CACHE_TTL = 5 * 60 * 1000;

async function getPetDataset() {
  const now = Date.now();
  if (petCache.data && now - petCache.at < PET_CACHE_TTL) return petCache.data;
  if (petCache.promise) return petCache.promise;
  petCache.promise = fetchErpAllPages(`${ERP_BASE}/API_BOM_FLOW_PET`, `Bearer ${erpToken()}`, { label: 'BomPet' })
    .then((data) => {
      petCache = { data, at: Date.now(), promise: null };
      return data;
    })
    .catch((err) => {
      petCache.promise = null;
      throw err;
    });
  return petCache.promise;
}

function normalizeName(s) {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
}

function mapSituacaoFinanceira(raw) {
  const s = (raw || '').toUpperCase().trim();
  if (s === 'I' || s.includes('INADIMPLENTE')) return 'INADIMPLENTE';
  if (s === 'A' || s.includes('ADIMPLENTE') || s.includes('EM DIA')) return 'ADIMPLENTE';
  return s || 'N/A';
}

function mapSituacaoContrato(raw) {
  const s = (raw || '').toUpperCase().trim();
  if (s === 'A') return 'ATIVO';
  if (s === 'I') return 'INATIVO';
  if (s === 'C') return 'CANCELADO';
  return s || 'N/A';
}

// GET /api/bom-pet/consulta?documento=... | ?nome=...
router.get('/consulta', authMiddleware, bomPetAuth, async (req, res) => {
  try {
    const { documento, nome } = req.query;

    if (!documento && !nome) {
      return res.status(400).json({ message: 'Informe o CPF ou o nome completo do titular.' });
    }

    let cpfFormatted = null;
    if (documento) {
      const digits = String(documento).replace(/\D/g, '');
      if (digits.length !== 11) {
        return res.status(400).json({ message: 'CPF inválido. Deve conter 11 dígitos.' });
      }
      cpfFormatted = formatCpf(digits);
    }

    // Nome enviado/comparado SEMPRE em maiúsculo.
    const nomeUpper = nome ? normalizeName(nome) : null;

    const dataset = await getPetDataset();

    const rows = dataset.filter((r) => {
      if (cpfFormatted) return (r.documento || '').trim() === cpfFormatted;
      return normalizeName(r.contratante) === nomeUpper;
    });

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Cliente não encontrado na base Bom Pet do ERP.' });
    }

    // Distintos documentos no resultado por nome → exige CPF para desambiguar.
    const docs = [...new Set(rows.map((r) => r.documento))];
    if (docs.length > 1) {
      return res.status(409).json({
        message: 'Mais de um cliente encontrado com este nome. Consulte pelo CPF.',
        documentos: docs,
      });
    }

    const first = rows[0];
    const docDigits = (first.documento || '').replace(/\D/g, '');

    // Linhas onde texto == contratante são o registro do próprio titular;
    // as demais são os pets ("NOME - RAÇA - COR").
    const titularNorm = normalizeName(first.contratante);
    const petRows = rows.filter((r) => normalizeName(r.texto_original_veiculo) !== titularNorm);

    // Status local Falecido (nunca gravado no ERP).
    const falecidosRes = await query(
      `SELECT pet_contrato_id, pet_nome, pet_descricao, erp_pet_pessoa_id, data_falecimento
         FROM bom_pet_pets_falecidos
        WHERE documento_cliente = $1`,
      [docDigits]
    );
    const falecidosPorDescricao = new Set(
      falecidosRes.rows
        .filter((r) => r.pet_descricao)
        .map((r) => `${r.pet_contrato_id}::${normalizeName(r.pet_descricao)}`)
    );
    const falecidosLegadosPorNome = new Set(
      falecidosRes.rows
        .filter((r) => !r.pet_descricao && r.pet_nome)
        .map((r) => `${r.pet_contrato_id}::${normalizeName(r.pet_nome)}`)
    );
    const falecidosSemNome = new Set(
      falecidosRes.rows.filter((r) => !r.pet_nome).map((r) => String(r.pet_contrato_id))
    );
    const falecidosPorPessoa = new Set(
      falecidosRes.rows.filter((r) => r.erp_pet_pessoa_id).map((r) => String(r.erp_pet_pessoa_id))
    );

    const pets = [];
    for (const r of petRows) {
      const nome = (r.texto_original_veiculo || '').split(' - ')[0].trim();
      let identity = null;
      let identityStatus = 'resolved';
      try {
        identity = await resolveBomPetPessoa({
          contratoId: r.contrato_id,
          petDescricao: r.texto_original_veiculo,
          petNome: nome,
          requireExactDescription: true,
        });
      } catch (identityError) {
        identityStatus = getErpIdentityErrorStatus(identityError);
        console.warn(
          `[BomPet] Consulta sem identidade ERP individual no contrato ${r.contrato_id}: ${identityError.code || identityError.message}`
        );
      }
      const falecidoLocal = (identity?.pessoaId && falecidosPorPessoa.has(String(identity.pessoaId))) ||
        falecidosPorDescricao.has(`${r.contrato_id}::${normalizeName(r.texto_original_veiculo)}`) ||
        falecidosLegadosPorNome.has(`${r.contrato_id}::${normalizeName(nome)}`) ||
        falecidosSemNome.has(String(r.contrato_id));
      const falecido = Boolean(identity?.dataFalecimento) || falecidoLocal;
      pets.push({
        nome,
        descricao: r.texto_original_veiculo || '',
        contrato_id: r.contrato_id,
        erp_pessoa_id: identity?.pessoaId || null,
        erp_pessoa_codigo: identity?.pessoaCodigo || null,
        erp_identity_status: identityStatus,
        data_falecimento: identity?.dataFalecimento || null,
        contrato_servicos: r.contrato_servicos,
        situacao_contrato: mapSituacaoContrato(r.situacao_contrato),
        status: falecido ? 'Falecido' : 'Ativo',
      });
    }

    // Única regra de elegibilidade financeira: adimplente/inadimplente.
    const inadimplente = rows.some((r) => mapSituacaoFinanceira(r.situacao_financeira) === 'INADIMPLENTE');

    res.json({
      contratante: first.contratante || '',
      documento: first.documento || '',
      celular: first.celular || '',
      pedido: first.pedido || '',
      situacao_financeira: inadimplente ? 'INADIMPLENTE' : mapSituacaoFinanceira(first.situacao_financeira),
      situacao_contrato: mapSituacaoContrato(first.situacao_contrato),
      contratos_servicos: [...new Set(rows.map((r) => r.contrato_servicos).filter(Boolean))].join(', '),
      pets,
    });
  } catch (error) {
    if (error instanceof ErpUpstreamError) {
      return res.status(502).json({ message: `Erro ao consultar o ERP: ${error.message}` });
    }
    console.error('Error in bom-pet consulta:', error);
    res.status(500).json({ message: error.message });
  }
});

// GET /api/bom-pet/particulares/cliente?cpf=...
// Consulta somente a API oficial de Pessoas; não usa banco do ERP nem cria cadastro.
router.get('/particulares/cliente', authMiddleware, bomPetAuth, async (req, res) => {
  try {
    const cpf = String(req.query.cpf || '').replace(/\D/g, '');
    if (cpf.length !== 11) {
      return res.status(400).json({ message: 'CPF inválido. Deve conter 11 dígitos.' });
    }
    const pessoa = await lookupPessoaByCpf(erpToken(), cpf);
    res.json({ encontrada: Boolean(pessoa), pessoa });
  } catch (error) {
    const status = error.statusCode || (error.code === 'erp_pessoas_ambiguas' ? 409 : 502);
    res.status(status).json({
      message: error.code === 'erp_pessoas_ambiguas'
        ? error.message
        : `Não foi possível consultar a Pessoa no ERP: ${error.message}`,
      code: error.code || 'erp_pessoa_indisponivel',
    });
  }
});

// GET /api/bom-pet/parcelas/:documento — parcelas/boletos pendentes no ERP (somente leitura).
router.get('/parcelas/:documento', authMiddleware, bomPetAuth, async (req, res) => {
  try {
    const digits = req.params.documento.replace(/\D/g, '');
    if (digits.length !== 11) {
      return res.status(400).json({ message: 'CPF inválido.' });
    }
    const cpfFormatted = formatCpf(digits);

    const dataset = await getPetDataset();
    const contratoIds = [...new Set(
      dataset.filter((r) => (r.documento || '').trim() === cpfFormatted).map((r) => r.contrato_id).filter(Boolean)
    )];
    if (contratoIds.length === 0) {
      return res.json({ parcelas: [] });
    }

    const { getErpPool } = await import('../services/erpDbService.js');
    const pool = getErpPool();
    const result = await pool.query(
      `SELECT id, titulo, valor, saldo, data_vencimento, sequencia, situacao, url_pagamento, contrato_id
         FROM titulos
        WHERE contrato_id = ANY($1::bigint[])
          AND COALESCE(saldo, 0) > 0
          AND data_pagamento IS NULL
          AND situacao NOT IN ('C', 'L')
        ORDER BY data_vencimento ASC`,
      [contratoIds]
    );

    const hoje = new Date();
    const parcelas = result.rows.map((t) => ({
      id: t.id,
      titulo: t.titulo,
      valor: t.valor,
      saldo: t.saldo,
      data_vencimento: t.data_vencimento,
      sequencia: t.sequencia,
      contrato_id: t.contrato_id,
      vencida: t.data_vencimento ? new Date(t.data_vencimento) < hoje : false,
      // Nem todo título possui link de pagamento na fonte; quando ausente, exibir sem link.
      link_pagamento: t.url_pagamento || null,
    }));

    res.json({ parcelas });
  } catch (error) {
    console.error('Error in bom-pet parcelas:', error);
    res.status(500).json({ message: 'Erro ao consultar parcelas pendentes no ERP: ' + error.message });
  }
});

// GET /api/bom-pet/utilizacoes/:documento
// Atendente vê apenas os próprios registros do cliente; supervisor/admin vê todos.
router.get('/utilizacoes/:documento', authMiddleware, bomPetAuth, async (req, res) => {
  try {
    const docNorm = req.params.documento.replace(/\D/g, '');
    const scoped = !isBomPetSupervisor(req);
    const listResult = await query(
      `SELECT id, protocolo, origem, status_atendimento, usuario, data_hora, pet_nome, pet_descricao,
               remocao_local, remocao_endereco, clinica_nome, parceiro_nome, parceiro_valor,
              telefone_contato, contratos_servicos, nome_cliente, documento_cliente, observacoes,
              termo_local, termo_rua, termo_valores_combinados, termo_descricao_produto
       FROM bom_pet_atendimentos
       WHERE REPLACE(REPLACE(documento_cliente, '.', ''), '-', '') = $1
       ${scoped ? 'AND LOWER(usuario) = LOWER($2)' : ''}
       ORDER BY data_hora DESC`,
      scoped ? [docNorm, currentUsuario(req)] : [docNorm]
    );
    const count = listResult.rows.filter((r) => r.status_atendimento !== 'Cancelado').length;
    res.json({ count, atendimentos: listResult.rows.map(serializeBomPetRow) });
  } catch (error) {
    console.error('Error in bom-pet utilizacoes:', error);
    res.status(500).json({ message: error.message });
  }
});

const ALLOWED_STATUS = ['Pendente', 'Solucionado', 'Cancelado'];

function stripHtml(s) {
  return s ? String(s).replace(/<[^>]*>/g, '').trim() : null;
}

function todayInSaoPaulo() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function sanitizeErpSyncError(error) {
  return String(error?.message || 'Falha não identificada ao sincronizar com o ERP')
    .replace(/\s+/g, ' ')
    .slice(0, 500);
}

function getErpIdentityErrorStatus(error) {
  if ([
    'erp_pet_identity_ambiguous',
    'erp_pet_identity_weak_match',
    'erp_pet_identity_changed',
    'erp_pet_identity_not_found',
  ].includes(error?.code)) {
    return error.code === 'erp_pet_identity_not_found' ? 'not_found' : 'ambiguous';
  }
  return 'retryable_error';
}

function getErpSyncErrorStatus(error) {
  if ([
    'erp_pet_identity_ambiguous',
    'erp_pet_identity_weak_match',
    'erp_pet_identity_changed',
    'erp_pet_identity_not_found',
    'erp_pet_person_not_found',
    'erp_pet_death_characteristic_not_found',
    'erp_pet_death_characteristic_ambiguous',
    'erp_pet_death_value_invalid',
    'erp_pet_death_date_conflict',
  ].includes(error?.code)) {
    return 'manual_review';
  }
  return 'retryable_error';
}

async function loadBomPetDeathSyncPrerequisites(atendimentoId) {
  const result = await query(
    `SELECT status_atendimento, erp_falecimento_sync_status,
            EXISTS (
              SELECT 1
                FROM bom_pet_imagens i
               WHERE i.atendimento_id = bom_pet_atendimentos.id
            ) AS has_removal_image
       FROM bom_pet_atendimentos
      WHERE id = $1`,
    [atendimentoId]
  );
  if (!result.rows.length) {
    throw partnerError('Atendimento não encontrado.', 404);
  }
  return result.rows[0];
}

async function assertBomPetDeathSyncPrerequisites(atendimentoId, statusCode = 409) {
  const state = await loadBomPetDeathSyncPrerequisites(atendimentoId);
  const eligibility = evaluateBomPetDeathEligibility({
    statusAtendimento: state.status_atendimento,
    hasRemovalImage: state.has_removal_image,
  });
  if (!eligibility.ok) {
    throw partnerError(eligibility.message, statusCode);
  }
  return state;
}

async function resolveBomPetDeathSyncUpdateMiss(atendimentoId) {
  const state = await assertBomPetDeathSyncPrerequisites(atendimentoId, 409);
  if (state.erp_falecimento_sync_status === 'confirmed') {
    return { status: 'confirmed', alreadyApplied: true };
  }
  throw partnerError(
    'O estado do atendimento mudou durante a sincronização. Recarregue os dados antes de tentar novamente.',
    409
  );
}

async function synchronizePetDeathWithErp(atendimento, usuario) {
  if (!isBomPetErpDeathSyncEnabled()) {
    const pendingResult = await query(
      `UPDATE bom_pet_atendimentos
          SET erp_falecimento_sync_status = 'pending_homologation',
              erp_falecimento_sync_error = NULL
        WHERE id = $1
          AND erp_falecimento_sync_status <> 'confirmed'
          AND status_atendimento = 'Solucionado'
          AND EXISTS (
            SELECT 1
              FROM bom_pet_imagens i
             WHERE i.atendimento_id = bom_pet_atendimentos.id
          )
        RETURNING id`,
      [atendimento.id]
    );
    if (!pendingResult.rowCount) {
      return resolveBomPetDeathSyncUpdateMiss(atendimento.id);
    }
    return { status: 'pending_homologation' };
  }

  const processingResult = await query(
    `UPDATE bom_pet_atendimentos
        SET erp_falecimento_sync_status = 'processing',
            erp_falecimento_sync_attempts = erp_falecimento_sync_attempts + 1,
            erp_falecimento_sync_error = NULL,
            erp_falecimento_last_attempt_at = NOW()
      WHERE id = $1
        AND erp_falecimento_sync_status <> 'confirmed'
        AND status_atendimento = 'Solucionado'
        AND EXISTS (
          SELECT 1
            FROM bom_pet_imagens i
           WHERE i.atendimento_id = bom_pet_atendimentos.id
        )
      RETURNING id`,
    [atendimento.id]
  );
  if (!processingResult.rowCount) {
    return resolveBomPetDeathSyncUpdateMiss(atendimento.id);
  }

  try {
    const result = await markBomPetPessoaFalecida({
      pessoaId: atendimento.erp_pet_pessoa_id,
      contratoId: atendimento.pet_contrato_id,
      petDescricao: atendimento.pet_descricao,
      petNome: atendimento.pet_nome,
      dataFalecimento: atendimento.pet_data_falecimento,
    });
    await query(
      `UPDATE bom_pet_atendimentos
          SET erp_falecimento_sync_status = 'confirmed',
              erp_falecimento_sync_error = NULL,
              erp_falecimento_synced_at = NOW(),
              erp_pet_pessoa_id = $2,
              erp_pet_pessoa_codigo = COALESCE($3, erp_pet_pessoa_codigo),
              erp_pet_identity_status = 'resolved',
              erp_pet_identity_error = NULL
        WHERE id = $1`,
      [atendimento.id, result.pessoaId, result.pessoaCodigo]
    );
    await query(
      `UPDATE bom_pet_pets_falecidos
          SET erp_pet_pessoa_id = $2,
              erp_pet_pessoa_codigo = COALESCE($3, erp_pet_pessoa_codigo),
              data_falecimento = $4
        WHERE atendimento_id = $1`,
      [atendimento.id, result.pessoaId, result.pessoaCodigo, result.dataFalecimento]
    );
    await query(
      `INSERT INTO bom_pet_historico_alteracoes
         (atendimento_id, status_anterior, status_novo, usuario, observacao)
       VALUES ($1, $2, $2, $3, $4)`,
      [atendimento.id, atendimento.status_atendimento, usuario,
       result.alreadyApplied
         ? 'Data de Falecimento já estava preenchida e foi confirmada no ERP.'
         : 'Data de Falecimento preenchida e confirmada no ERP.']
    );
    return { status: 'confirmed', alreadyApplied: result.alreadyApplied };
  } catch (error) {
    const status = getErpSyncErrorStatus(error);
    const safeError = sanitizeErpSyncError(error);
    const errorUpdateResult = await query(
      `UPDATE bom_pet_atendimentos
          SET erp_falecimento_sync_status = $2,
              erp_falecimento_sync_error = $3,
              erp_pet_identity_status = $4,
              erp_pet_identity_error = $3
        WHERE id = $1
          AND erp_falecimento_sync_status <> 'confirmed'
        RETURNING id`,
      [atendimento.id, status, safeError, getErpIdentityErrorStatus(error)]
    );
    if (!errorUpdateResult.rowCount) {
      return { status: 'confirmed', alreadyApplied: true };
    }
    await query(
      `INSERT INTO bom_pet_historico_alteracoes
         (atendimento_id, status_anterior, status_novo, usuario, observacao)
       VALUES ($1, $2, $2, $3, $4)`,
      [atendimento.id, atendimento.status_atendimento, usuario,
       `Registro local concluído; sincronização com o ERP pendente (${error.code || 'erro_erp'}).`]
    );
    return { status, error: safeError };
  }
}

// POST /api/bom-pet/atendimentos — JSON para Plano; multipart para Particular.
router.post('/atendimentos', authMiddleware, bomPetAuth, (req, res, next) => {
  paymentUpload.array('comprovantes_pagamento', 3)(req, res, (error) => {
    if (error) {
      removeUploadedFiles(req.files);
      return res.status(400).json({ message: error.message });
    }
    next();
  });
}, async (req, res) => {
  const paymentFiles = req.files || [];
  try {
    const {
      documento_cliente, nome_cliente, pet_nome, pet_descricao, pet_contrato_id,
      comprovante_pagamento_recebido, comprovante_pagamento_obs,
      remocao_local, remocao_endereco, clinica_nome, parceiro_id,
      telefone_contato, observacoes, valor_pago_particular, cliente_data_nascimento, cliente_email,
      cliente_endereco, cliente_cidade, consentimento_comercial,
    } = req.body;
    const origem = normalizeBomPetOrigem(req.body.origem);
    if (!origem) throw partnerError('Origem inválida. Use Plano ou Particular.');
    const paidAmountProvided = valor_pago_particular !== undefined &&
      valor_pago_particular !== null && String(valor_pago_particular).trim() !== '';
    if (origem === 'Plano' && paidAmountProvided) {
      throw partnerError('O valor pago pelo cliente é exclusivo do atendimento Particular.');
    }
    const valorPagoParticular = origem === 'Particular'
      ? parseParticularPaidAmount(valor_pago_particular)
      : null;
    if (origem === 'Particular' && valorPagoParticular === null) {
      throw partnerError('Informe o valor pago pelo cliente usando somente números.');
    }
    const usuario = currentUsuario(req);
    if (!usuario) throw partnerError('Usuário não identificado.', 401);
    if (!/^\d+$/.test(String(parceiro_id || '')) || Number(parceiro_id) <= 0) {
      throw partnerError('Selecione um parceiro ativo.');
    }

    const docDigits = String(documento_cliente || '').replace(/\D/g, '');
    if (docDigits.length !== 11) throw partnerError('CPF inválido. Deve conter 11 dígitos.');
    const cpfFormatted = formatCpf(docDigits);
    const sanitizedTelefone = String(telefone_contato || '').replace(/\D/g, '').slice(0, 15);
    if (sanitizedTelefone.length < 10) throw partnerError('Informe um telefone de contato válido.');
    if (!stripHtml(remocao_local) || !stripHtml(remocao_endereco)) {
      throw partnerError('Informe o local e o endereço da remoção.');
    }

    let resolvedName;
    let resolvedPetName;
    let resolvedPetDescription;
    let resolvedPetContractId = null;
    let resolvedServices = null;
    let situacaoFinanceira = null;
    let pessoa = null;
    let erpPetIdentity = null;
    let erpPetIdentityStatus = origem === 'Plano' ? 'pending' : 'not_applicable';
    let erpPetIdentityError = null;
    let comprovanteFlag = false;
    const comprovanteObs = stripHtml(comprovante_pagamento_obs);

    if (origem === 'Plano') {
      if (!pet_contrato_id) throw partnerError('Campos obrigatórios: documento_cliente, pet_contrato_id');
      if (paymentFiles.length) throw partnerError('Arquivos de pagamento na criação são exclusivos do atendimento Particular.');
      const dataset = await getPetDataset();
      const erpRows = dataset.filter((row) => (row.documento || '').trim() === cpfFormatted);
      if (!erpRows.length) throw partnerError('Cliente não encontrado na base Bom Pet do ERP.', 404);
      const titularNorm = normalizeName(erpRows[0].contratante);
      const bodyPetDescricao = normalizeName(pet_descricao);
      if (!bodyPetDescricao) throw partnerError('A descrição completa do pet é obrigatória.');
      const matchingPetRows = erpRows.filter((row) => {
        if (String(row.contrato_id) !== String(pet_contrato_id)) return false;
        const texto = normalizeName(row.texto_original_veiculo);
        if (texto === titularNorm) return false;
        return texto === bodyPetDescricao;
      });
      if (matchingPetRows.length > 1) {
        throw partnerError('Mais de um pet corresponde à descrição informada. Solicite revisão cadastral no ERP.', 409);
      }
      if (!matchingPetRows.length) throw partnerError('Pet não incluído no plano do cliente — atendimento negado.');
      const petRow = matchingPetRows[0];
      const falecidoRes = await query(
        `SELECT 1 FROM bom_pet_pets_falecidos
          WHERE pet_contrato_id = $1
            AND (
              (pet_descricao IS NOT NULL AND UPPER(BTRIM(pet_descricao)) = UPPER(BTRIM($2)))
              OR (
                pet_descricao IS NULL
                AND (pet_nome IS NULL OR UPPER(BTRIM(pet_nome)) = UPPER(BTRIM($3)))
              )
            )`,
        [
          petRow.contrato_id,
          petRow.texto_original_veiculo || '',
          (petRow.texto_original_veiculo || '').split(' - ')[0].trim(),
        ]
      );
      if (falecidoRes.rows.length) throw partnerError('Este pet já está marcado como Falecido.');
      try {
        erpPetIdentity = await resolveBomPetPessoa({
          contratoId: petRow.contrato_id,
          petDescricao: petRow.texto_original_veiculo,
          petNome: (petRow.texto_original_veiculo || '').split(' - ')[0].trim(),
          requireExactDescription: true,
        });
        erpPetIdentityStatus = 'resolved';
      } catch (identityError) {
        erpPetIdentityStatus = getErpIdentityErrorStatus(identityError);
        erpPetIdentityError = sanitizeErpSyncError(identityError);
        console.warn(
          `[BomPet] Identidade ERP do pet pendente no contrato ${petRow.contrato_id}: ${identityError.code || identityError.message}`
        );
      }
      if (erpPetIdentity?.dataFalecimento) {
        throw partnerError(`Este pet já possui Data de Falecimento registrada no ERP (${erpPetIdentity.dataFalecimento}).`);
      }
      situacaoFinanceira = erpRows.some((row) => mapSituacaoFinanceira(row.situacao_financeira) === 'INADIMPLENTE')
        ? 'INADIMPLENTE' : 'ADIMPLENTE';
      comprovanteFlag = parseBoolean(comprovante_pagamento_recebido);
      if (situacaoFinanceira === 'INADIMPLENTE' && (!comprovanteFlag || !comprovanteObs)) {
        throw partnerError('Cliente inadimplente: confirme o comprovante e preencha a observação obrigatória.');
      }
      resolvedName = erpRows[0].contratante || '';
      resolvedPetName = (petRow.texto_original_veiculo || '').split(' - ')[0].trim();
      resolvedPetDescription = petRow.texto_original_veiculo || null;
      resolvedPetContractId = petRow.contrato_id;
      resolvedServices = [...new Set(erpRows.map((row) => row.contrato_servicos).filter(Boolean))].join(', ') || null;
    } else {
      const particularErrors = validateParticularFields({
        nome: nome_cliente,
        petNome: pet_nome,
        petDescricao: pet_descricao,
      }, paymentFiles);
      if (particularErrors.length) throw partnerError(particularErrors[0]);
      if (paymentFiles.some((file) => !isPaymentFileContentValid(file))) {
        throw partnerError('O conteúdo de um dos comprovantes não corresponde ao formato informado.');
      }
      const partnerPreflight = await query(
        `SELECT id, nome, valor_servico, status
           FROM bom_pet_parceiros
          WHERE id = $1`,
        [parceiro_id]
      );
      if (!snapshotActivePartner(partnerPreflight.rows[0])) {
        throw partnerError('O parceiro selecionado não existe ou foi inativado. Selecione um parceiro ativo.');
      }
      pessoa = await resolvePessoa(erpToken(), {
        cpf: docDigits,
        nome: stripHtml(nome_cliente),
        data_nascimento: cliente_data_nascimento || null,
      });
      if (!pessoa?.id) throw partnerError('Não foi possível confirmar o vínculo da Pessoa no ERP.', 502);
      resolvedName = pessoa.nome || stripHtml(nome_cliente);
      resolvedPetName = stripHtml(pet_nome);
      resolvedPetDescription = stripHtml(pet_descricao) || resolvedPetName;
      comprovanteFlag = true;
    }

    const result = await withTransaction(async (client) => {
      const partnerResult = await client.query(
        `SELECT id, nome, valor_servico, status
           FROM bom_pet_parceiros WHERE id = $1 FOR UPDATE`,
        [parceiro_id]
      );
      const partner = snapshotActivePartner(partnerResult.rows[0]);
      if (!partner) throw partnerError('O parceiro selecionado não existe ou foi inativado. Selecione um parceiro ativo.');

      const inserted = await client.query(
        `WITH lock AS (SELECT pg_advisory_xact_lock(hashtext('bom_pet_protocolo'))),
        next_seq AS (
          SELECT COALESCE(MAX(CASE
            WHEN protocolo LIKE 'BP' || TO_CHAR(CURRENT_DATE, 'YYMMDD') || '%'
            THEN CAST(RIGHT(protocolo, 4) AS INTEGER) ELSE 0 END), 0) + 1 AS seq
          FROM bom_pet_atendimentos, lock
        )
        INSERT INTO bom_pet_atendimentos
         (protocolo, origem, documento_cliente, nome_cliente, pet_nome, pet_descricao, pet_contrato_id,
          erp_pet_pessoa_id, erp_pet_pessoa_codigo, erp_pet_identity_status, erp_pet_identity_error,
          contratos_servicos, situacao_financeira, comprovante_pagamento_recebido, comprovante_pagamento_obs,
          remocao_local, remocao_endereco, clinica_nome, parceiro_nome, parceiro_id, parceiro_valor,
          telefone_contato, observacoes, valor_pago_particular, usuario, status_atendimento, pessoa_erp_id, pessoa_erp_codigo,
          cliente_data_nascimento, cliente_email, cliente_endereco, cliente_cidade,
          consentimento_comercial, consentimento_comercial_em)
        VALUES (
          'BP' || TO_CHAR(CURRENT_DATE, 'YYMMDD') || LPAD((SELECT seq FROM next_seq)::text, 4, '0'),
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
          $17, $18, $19, $20, $21, $22, $23, $24, 'Pendente', $25, $26, $27, $28, $29, $30, $31,
          CASE WHEN $31 THEN CURRENT_TIMESTAMP ELSE NULL END
        ) RETURNING *`,
        [
          origem, cpfFormatted, resolvedName, resolvedPetName, resolvedPetDescription,
          resolvedPetContractId, erpPetIdentity?.pessoaId || null, erpPetIdentity?.pessoaCodigo || null,
          erpPetIdentityStatus, erpPetIdentityError,
          resolvedServices, situacaoFinanceira, comprovanteFlag, comprovanteObs,
          stripHtml(remocao_local), stripHtml(remocao_endereco), stripHtml(clinica_nome),
          partner.parceiro_nome, partner.parceiro_id, partner.parceiro_valor,
          sanitizedTelefone, stripHtml(observacoes), valorPagoParticular, usuario,
          pessoa?.id || null, pessoa?.codigo || null, cliente_data_nascimento || null,
          stripHtml(cliente_email), stripHtml(cliente_endereco), stripHtml(cliente_cidade),
          parseBoolean(consentimento_comercial),
        ]
      );
      const atendimento = inserted.rows[0];
      for (const file of paymentFiles) {
        const url = `/api/bom-pet/comprovantes-pagamento/${file.filename}`;
        await client.query(
          `INSERT INTO bom_pet_comprovantes_pagamento
           (atendimento_id, filename, original_name, mimetype, size, url)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [atendimento.id, file.filename, file.originalname, file.mimetype, file.size, url]
        );
      }
      if (situacaoFinanceira === 'INADIMPLENTE' && comprovanteFlag) {
        await client.query(
          `INSERT INTO bom_pet_historico_alteracoes
           (atendimento_id, status_anterior, status_novo, usuario, observacao)
           VALUES ($1, NULL, 'Pendente', $2, $3)`,
          [atendimento.id, usuario, `Comprovante de pagamento recebido (cliente inadimplente): ${comprovanteObs}`]
        );
      }
      return atendimento;
    });

    res.status(201).json(serializeBomPetRow(result));
  } catch (error) {
    removeUploadedFiles(paymentFiles);
    console.error('Error in bom-pet create atendimento:', {
      code: error.code || null,
      status: error.statusCode || error.status || 500,
    });
    res.status(error.statusCode || 500).json({ message: error.message, code: error.code });
  }
});

router.get('/atendimentos/atendentes', authMiddleware, bomPetAuth, requireSupervisor, async (req, res) => {
  try {
    const result = await query(
      `SELECT DISTINCT usuario FROM bom_pet_atendimentos WHERE usuario IS NOT NULL ORDER BY usuario ASC`
    );
    res.json(result.rows.map((r) => r.usuario));
  } catch (error) {
    console.error('Error fetching bom-pet atendentes:', error);
    res.status(500).json({ message: error.message });
  }
});

router.get('/atendimentos/contadores', authMiddleware, bomPetAuth, async (req, res) => {
  try {
    // Atendente vê apenas os próprios números; supervisor/admin vê o total.
    const scoped = !isBomPetSupervisor(req);
    const result = await query(
      `SELECT
        COUNT(*) FILTER (WHERE status_atendimento = 'Pendente') AS pendentes,
        COUNT(*) FILTER (WHERE status_atendimento = 'Solucionado') AS solucionados,
        COUNT(*) FILTER (WHERE status_atendimento = 'Cancelado') AS cancelados,
        COUNT(*) AS total
       FROM bom_pet_atendimentos
       ${scoped ? 'WHERE LOWER(usuario) = LOWER($1)' : ''}`,
      scoped ? [currentUsuario(req)] : []
    );
    const row = result.rows[0];
    res.json({
      pendentes: parseInt(row.pendentes, 10),
      solucionados: parseInt(row.solucionados, 10),
      cancelados: parseInt(row.cancelados, 10),
      total: parseInt(row.total, 10),
    });
  } catch (error) {
    console.error('Error fetching bom-pet contadores:', error);
    res.status(500).json({ message: error.message });
  }
});

// Base interna para futura conversão comercial. Não cria lead e só retorna
// particulares que consentiram, mantendo o mesmo escopo por atendente.
router.get('/particulares/elegiveis', authMiddleware, bomPetAuth, async (req, res) => {
  try {
    const scoped = !isBomPetSupervisor(req);
    const result = await query(
      `SELECT id AS atendimento_id, protocolo, pessoa_erp_id, pessoa_erp_codigo,
              nome_cliente, documento_cliente, telefone_contato, cliente_email,
              cliente_cidade, valor_pago_particular, consentimento_comercial_em, data_hora
         FROM bom_pet_atendimentos
        WHERE origem = 'Particular' AND consentimento_comercial = TRUE
        ${scoped ? 'AND LOWER(usuario) = LOWER($1)' : ''}
        ORDER BY data_hora DESC
        LIMIT 500`,
      scoped ? [currentUsuario(req)] : []
    );
    res.json(result.rows.map(serializeBomPetRow));
  } catch (error) {
    console.error('Error fetching eligible Bom Pet particulars:', error);
    res.status(500).json({ message: error.message });
  }
});

router.get('/atendimentos/:id(\\d+)', authMiddleware, bomPetAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const atendimento = await loadAuthorizedAtendimento(req, res, id);
    if (!atendimento) return;
    const imagensResult = await query(
      'SELECT * FROM bom_pet_imagens WHERE atendimento_id = $1 ORDER BY created_at ASC',
      [id]
    );
    const comprovantesResult = await query(
      'SELECT * FROM bom_pet_comprovantes_pagamento WHERE atendimento_id = $1 ORDER BY created_at ASC',
      [id]
    );
    res.json({
      ...serializeBomPetRow(atendimento),
      imagens: imagensResult.rows.map(serializeBomPetRow),
      comprovantes_pagamento: comprovantesResult.rows.map(serializeBomPetRow),
    });
  } catch (error) {
    console.error('Error fetching bom-pet atendimento detail:', error);
    res.status(500).json({ message: error.message });
  }
});

router.get('/atendimentos', authMiddleware, bomPetAuth, async (req, res) => {
  try {
    const { documento, status, data_inicio, data_fim, nome, pet, atendente, origem } = req.query;

    let sql = 'SELECT * FROM bom_pet_atendimentos WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    // Atendente só lista os próprios atendimentos (escopo aplicado no servidor);
    // o filtro "atendente" fica reservado a supervisores/admins.
    if (!isBomPetSupervisor(req)) {
      sql += ` AND LOWER(usuario) = LOWER($${paramIndex++})`;
      params.push(currentUsuario(req));
    }

    if (status) {
      if (!ALLOWED_STATUS.includes(status)) {
        return res.status(400).json({ message: 'Status inválido.' });
      }
      sql += ` AND status_atendimento = $${paramIndex++}`;
      params.push(status);
    }
    if (origem) {
      if (!['Plano', 'Particular'].includes(origem)) {
        return res.status(400).json({ message: 'Origem inválida. Use Plano ou Particular.' });
      }
      sql += ` AND origem = $${paramIndex++}`;
      params.push(origem);
    }
    if (documento) {
      sql += ` AND REPLACE(REPLACE(REPLACE(documento_cliente, '.', ''), '-', ''), ' ', '') ILIKE $${paramIndex++}`;
      params.push(`%${documento.replace(/\D/g, '')}%`);
    }
    if (nome) {
      sql += ` AND nome_cliente ILIKE $${paramIndex++}`;
      params.push(`%${nome}%`);
    }
    if (pet) {
      sql += ` AND (pet_nome ILIKE $${paramIndex} OR pet_descricao ILIKE $${paramIndex})`;
      paramIndex++;
      params.push(`%${pet}%`);
    }
    if (data_inicio) {
      if (!isValidBomPetDateOnly(data_inicio)) {
        return res.status(400).json({ message: 'data_inicio inválida. Use o formato YYYY-MM-DD.' });
      }
      sql += ` AND data_hora >= ($${paramIndex++}::date AT TIME ZONE 'America/Sao_Paulo')`;
      params.push(data_inicio);
    }
    if (data_fim) {
      if (!isValidBomPetDateOnly(data_fim)) {
        return res.status(400).json({ message: 'data_fim inválida. Use o formato YYYY-MM-DD.' });
      }
      sql += ` AND data_hora < (($${paramIndex++}::date + INTERVAL '1 day') AT TIME ZONE 'America/Sao_Paulo')`;
      params.push(data_fim);
    }
    if (atendente && isBomPetSupervisor(req)) {
      sql += ` AND usuario ILIKE $${paramIndex++}`;
      params.push(`%${atendente}%`);
    }

    sql += ` ORDER BY CASE WHEN status_atendimento = 'Pendente' THEN 0 ELSE 1 END, data_hora DESC LIMIT 500`;

    const result = await query(sql, params);
    res.json(result.rows.map(serializeBomPetRow));
  } catch (error) {
    console.error('Error in bom-pet list atendimentos:', error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/atendimentos/:id/imagens', authMiddleware, bomPetAuth, (req, res, next) => {
  imageUpload.array('imagens', 10)(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message });
    next();
  });
}, async (req, res) => {
  try {
    const { id } = req.params;
    // Verificação de existência + escopo ANTES de aceitar as imagens no banco.
    const exists = await query('SELECT id, usuario FROM bom_pet_atendimentos WHERE id = $1', [id]);
    if (exists.rows.length === 0) {
      (req.files || []).forEach((f) => { try { fs.unlinkSync(f.path); } catch { /* já removido */ } });
      return res.status(404).json({ message: 'Atendimento não encontrado.' });
    }
    if (!canAccessAtendimento({ isSupervisor: isBomPetSupervisor(req), usuario: currentUsuario(req) }, exists.rows[0])) {
      (req.files || []).forEach((f) => { try { fs.unlinkSync(f.path); } catch { /* já removido */ } });
      return res.status(403).json({ message: 'Acesso negado: este atendimento pertence a outro atendente.' });
    }
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'Nenhuma imagem enviada.' });
    }
    const inserted = [];
    for (const file of req.files) {
      // Servida apenas via endpoint autenticado e com escopo por registro.
      const url = `/api/bom-pet/imagens/${file.filename}`;
      const result = await query(
        `INSERT INTO bom_pet_imagens (atendimento_id, filename, original_name, mimetype, size, url)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [id, file.filename, file.originalname, file.mimetype, file.size, url]
      );
      inserted.push(result.rows[0]);
    }
    res.status(201).json(inserted.map(serializeBomPetRow));
  } catch (error) {
    console.error('Error uploading bom-pet images:', error);
    res.status(500).json({ message: error.message });
  }
});

// PUT /api/bom-pet/atendimentos/:id — tratamento (status + observações + marcar pet falecido).
router.put('/atendimentos/:id', authMiddleware, bomPetAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      status_atendimento,
      observacoes_tratamento,
      marcar_pet_falecido,
      data_falecimento,
    } = req.body;
    const usuario = currentUsuario(req);

    if (status_atendimento && !ALLOWED_STATUS.includes(status_atendimento)) {
      return res.status(400).json({ message: `Status inválido. Permitidos: ${ALLOWED_STATUS.join(', ')}` });
    }

    const atendimento = await loadAuthorizedAtendimento(req, res, id);
    if (!atendimento) return;
    const statusAnterior = atendimento.status_atendimento;
    const finalStatus = status_atendimento || statusAnterior;
    const statusChanged = Boolean(status_atendimento && status_atendimento !== statusAnterior);
    let hasRemovalImage = null;

    if (atendimento.pet_falecido_marcado && statusChanged && finalStatus !== 'Solucionado') {
      return res.status(409).json({
        message: 'Um atendimento com falecimento registrado deve permanecer Solucionado. Correções exigem revisão manual.',
      });
    }

    if (status_atendimento === 'Solucionado') {
      const imageResult = await query(
        'SELECT EXISTS (SELECT 1 FROM bom_pet_imagens WHERE atendimento_id = $1) AS has_removal_image',
        [id]
      );
      hasRemovalImage = imageResult.rows[0]?.has_removal_image === true;
      if (!hasRemovalImage) {
        return res.status(400).json({ message: 'Para marcar como Solucionado, é obrigatório anexar o comprovante de remoção (imagem).' });
      }
    }

    let updateSql = `UPDATE bom_pet_atendimentos SET status_atendimento = $1`;
    let updateParams = [status_atendimento || statusAnterior];
    let paramIdx = 2;

    if (observacoes_tratamento !== undefined && observacoes_tratamento !== null) {
      updateSql += `, observacoes_tratamento = $${paramIdx++}`;
      updateParams.push(stripHtml(observacoes_tratamento) || '');
    }

    if (!atendimento.data_hora_inicio_tratamento) {
      updateSql += `, data_hora_inicio_tratamento = NOW(), usuario_responsavel_tratamento = $${paramIdx++}`;
      updateParams.push(usuario);
    }

    // Marcar o pet como Falecido: só ao solucionar com comprovante anexado; status é LOCAL.
    let falecidoMarcado = false;
    if (marcar_pet_falecido === true) {
      if (hasRemovalImage === null) {
        const imageResult = await query(
          'SELECT EXISTS (SELECT 1 FROM bom_pet_imagens WHERE atendimento_id = $1) AS has_removal_image',
          [id]
        );
        hasRemovalImage = imageResult.rows[0]?.has_removal_image === true;
      }
      const eligibility = evaluateBomPetDeathEligibility({
        statusAtendimento: finalStatus,
        hasRemovalImage,
      });
      if (!eligibility.ok) {
        return res.status(eligibility.statusCode).json({ message: eligibility.message });
      }
      if (!atendimento.pet_contrato_id) {
        return res.status(400).json({ message: 'Atendimento sem contrato ERP do pet vinculado; não é possível marcar como Falecido.' });
      }
      if (!isValidBomPetDateOnly(data_falecimento)) {
        return res.status(400).json({ message: 'Informe uma Data de Falecimento válida no formato YYYY-MM-DD.' });
      }
      if (data_falecimento > todayInSaoPaulo()) {
        return res.status(400).json({ message: 'A Data de Falecimento não pode estar no futuro.' });
      }
      const deathMarkingConflict = getBomPetDeathMarkingConflict({
        marked: atendimento.pet_falecido_marcado,
        existingDate: atendimento.pet_data_falecimento,
        requestedDate: data_falecimento,
      });
      if (deathMarkingConflict === 'date_conflict') {
        return res.status(409).json({
          message: 'Este pet já possui outra Data de Falecimento registrada neste atendimento. A correção exige revisão manual.',
        });
      }
      if (deathMarkingConflict === 'already_marked') {
        return res.status(409).json({
          message: 'O falecimento já foi registrado com esta data. Use a ação Sincronizar com o ERP para reenviar.',
        });
      }
      updateSql += `, pet_falecido_marcado = TRUE,
        pet_data_falecimento = $${paramIdx++},
        erp_falecimento_sync_status = $${paramIdx++},
        erp_falecimento_sync_error = NULL`;
      updateParams.push(
        data_falecimento,
        isBomPetErpDeathSyncEnabled() ? 'pending' : 'pending_homologation'
      );
      falecidoMarcado = true;
    }

    updateSql += ` WHERE id = $${paramIdx++}`;
    updateParams.push(id);
    if (falecidoMarcado || statusChanged) {
      // O WHERE vê o estado anterior ao SET: este parâmetro é intencionalmente
      // statusAnterior, impedindo que uma requisição obsoleta sobrescreva outra.
      updateSql += ` AND status_atendimento = $${paramIdx++}`;
      updateParams.push(statusAnterior);
    }
    if (falecidoMarcado) {
      updateSql += ' AND pet_falecido_marcado = FALSE';
    }
    if (falecidoMarcado || status_atendimento === 'Solucionado') {
      updateSql += ` AND EXISTS (
          SELECT 1
            FROM bom_pet_imagens i
           WHERE i.atendimento_id = bom_pet_atendimentos.id
        )`;
    }
    if (statusChanged && finalStatus !== 'Solucionado') {
      updateSql += ' AND pet_falecido_marcado = FALSE';
    }
    updateSql += ' RETURNING *';

    const hasObs = stripHtml(observacoes_tratamento);
    const result = await withTransaction(async (client) => {
      const updated = await client.query(updateSql, updateParams);
      assertBomPetGuardedUpdateApplied({
        rowCount: updated.rowCount,
        guarded: falecidoMarcado || statusChanged,
      });

      if (falecidoMarcado) {
        await client.query(
          `INSERT INTO bom_pet_pets_falecidos
             (pet_contrato_id, pet_nome, pet_descricao, erp_pet_pessoa_id, erp_pet_pessoa_codigo,
              data_falecimento, documento_cliente, atendimento_id, usuario)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT DO NOTHING`,
          [
            atendimento.pet_contrato_id,
            atendimento.pet_nome,
            atendimento.pet_descricao,
            atendimento.erp_pet_pessoa_id || null,
            atendimento.erp_pet_pessoa_codigo || null,
            data_falecimento,
            (atendimento.documento_cliente || '').replace(/\D/g, ''),
            id,
            usuario,
          ]
        );
      }

      if (statusChanged || hasObs || falecidoMarcado) {
        const obsHist = [
          hasObs,
          falecidoMarcado
            ? `Pet marcado como Falecido em ${data_falecimento}; registro local concluído e sincronização ERP iniciada.`
            : null,
        ].filter(Boolean).join(' | ') || null;
        await client.query(
          `INSERT INTO bom_pet_historico_alteracoes
             (atendimento_id, status_anterior, status_novo, usuario, observacao)
           VALUES ($1, $2, $3, $4, $5)`,
          [id, statusAnterior, statusChanged ? status_atendimento : statusAnterior, usuario, obsHist]
        );
      }

      return updated;
    });

    let responseRow = result.rows[0];
    let erpSync = null;
    if (falecidoMarcado) {
      erpSync = await synchronizePetDeathWithErp(responseRow, usuario);
      const refreshed = await query('SELECT * FROM bom_pet_atendimentos WHERE id = $1', [id]);
      responseRow = refreshed.rows[0] || responseRow;
    }

    res.json({
      ...serializeBomPetRow(responseRow),
      erp_falecimento_sync: erpSync,
    });
  } catch (error) {
    console.error('Error updating bom-pet atendimento:', error);
    res.status(error.statusCode || 500).json({ message: error.message });
  }
});

// POST /api/bom-pet/atendimentos/:id/sincronizar-falecimento — reenvio manual seguro.
router.post('/atendimentos/:id/sincronizar-falecimento', authMiddleware, bomPetAuth, async (req, res) => {
  try {
    const atendimento = await loadAuthorizedAtendimento(req, res, req.params.id);
    if (!atendimento) return;
    if (!atendimento.pet_falecido_marcado || !atendimento.pet_data_falecimento) {
      return res.status(400).json({
        message: 'Este atendimento ainda não possui uma marcação local de falecimento para sincronizar.',
      });
    }
    await assertBomPetDeathSyncPrerequisites(atendimento.id, 409);

    const erpSync = await synchronizePetDeathWithErp(atendimento, currentUsuario(req));
    const refreshed = await query(
      'SELECT * FROM bom_pet_atendimentos WHERE id = $1',
      [atendimento.id]
    );
    const statusCode = erpSync.status === 'confirmed' ? 200 : 202;
    res.status(statusCode).json({
      ...serializeBomPetRow(refreshed.rows[0] || atendimento),
      erp_falecimento_sync: erpSync,
    });
  } catch (error) {
    console.error('Error retrying bom-pet ERP death sync:', error);
    res.status(error.statusCode || 500).json({ message: error.message });
  }
});

router.patch('/atendimentos/:id/termo', authMiddleware, bomPetAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { termo_local, termo_rua, termo_valores_combinados, termo_descricao_produto } = req.body;

    const authorized = await loadAuthorizedAtendimento(req, res, id);
    if (!authorized) return;

    const result = await query(
      `UPDATE bom_pet_atendimentos
          SET termo_local = $1, termo_rua = $2, termo_valores_combinados = $3, termo_descricao_produto = $4
        WHERE id = $5 RETURNING *`,
      [
        stripHtml(termo_local), stripHtml(termo_rua),
        stripHtml(termo_valores_combinados), stripHtml(termo_descricao_produto), id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Atendimento não encontrado.' });
    }
    res.json(serializeBomPetRow(result.rows[0]));
  } catch (error) {
    console.error('Error saving bom-pet termo:', error);
    res.status(500).json({ message: error.message });
  }
});

// GET /api/bom-pet/comprovantes-pagamento/:filename — arquivo privado tipado.
router.get('/comprovantes-pagamento/:filename', authMiddleware, bomPetAuth, async (req, res) => {
  try {
    const filename = path.basename(req.params.filename);
    const result = await query(
      `SELECT c.filename, c.original_name, c.mimetype, a.usuario
         FROM bom_pet_comprovantes_pagamento c
         JOIN bom_pet_atendimentos a ON a.id = c.atendimento_id
        WHERE c.filename = $1`,
      [filename]
    );
    if (!result.rows.length) return res.status(404).json({ message: 'Comprovante não encontrado.' });
    const row = result.rows[0];
    if (!canAccessAtendimento({ isSupervisor: isBomPetSupervisor(req), usuario: currentUsuario(req) }, row)) {
      return res.status(403).json({ message: 'Acesso negado: este comprovante pertence a outro atendente.' });
    }
    const filePath = path.join(uploadDir, filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ message: 'Arquivo não encontrado no servidor.' });
    res.type(row.mimetype || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${String(row.original_name || 'comprovante').replace(/["\r\n]/g, '')}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(filePath);
  } catch (error) {
    console.error('Error serving Bom Pet payment proof:', error);
    res.status(500).json({ message: error.message });
  }
});

// GET /api/bom-pet/imagens/:filename — download autenticado e com escopo por registro
// (substitui o mount estático público; comprovantes de remoção não são servidos sem authz).
router.get('/imagens/:filename', authMiddleware, bomPetAuth, async (req, res) => {
  try {
    const filename = path.basename(req.params.filename); // evita path traversal
    const imgRes = await query(
      `SELECT i.filename, i.mimetype, a.usuario
         FROM bom_pet_imagens i
         JOIN bom_pet_atendimentos a ON a.id = i.atendimento_id
        WHERE i.filename = $1`,
      [filename]
    );
    if (imgRes.rows.length === 0) {
      return res.status(404).json({ message: 'Imagem não encontrada.' });
    }
    const row = imgRes.rows[0];
    if (!canAccessAtendimento({ isSupervisor: isBomPetSupervisor(req), usuario: currentUsuario(req) }, row)) {
      return res.status(403).json({ message: 'Acesso negado: este comprovante pertence a outro atendente.' });
    }
    const filePath = path.join(uploadDir, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'Arquivo não encontrado no servidor.' });
    }
    if (row.mimetype) res.type(row.mimetype);
    res.sendFile(filePath);
  } catch (error) {
    console.error('Error serving bom-pet image:', error);
    res.status(500).json({ message: error.message });
  }
});

router.get('/atendimentos/:id/historico', authMiddleware, bomPetAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const authorized = await loadAuthorizedAtendimento(req, res, id);
    if (!authorized) return;
    const result = await query(
      `SELECT * FROM bom_pet_historico_alteracoes WHERE atendimento_id = $1 ORDER BY data_hora DESC`,
      [id]
    );
    res.json(result.rows.map(serializeBomPetRow));
  } catch (error) {
    console.error('Error fetching bom-pet historico:', error);
    res.status(500).json({ message: error.message });
  }
});

export default router;
