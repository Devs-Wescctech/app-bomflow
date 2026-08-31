import { Router } from 'express';
import { query, withTransaction } from '../config/database.js';
import { authMiddleware } from '../middleware/auth.js';
import { fetchErpAllPages, ErpUpstreamError } from '../utils/erpPagination.js';
import { canAccessAtendimento } from '../utils/bomPetAuthz.js';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import { fileURLToPath } from 'url';
import {
  isValidBomPetDateOnly,
  serializeBomPetRow,
} from '../utils/bomPetDate.js';
import {
  BOM_PET_PARTNER_STATUSES,
  canManageBomPetPartners,
  partnerValueChanged,
  snapshotActivePartner,
  validatePartnerPayload,
} from '../utils/bomPetPartnerRules.js';

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
    const hasModule = ALLOWED_AGENT_TYPES.includes(agent.agent_type);
    let hasDynamicModule = false;
    if (!hasModule) {
      const t = await query('SELECT modules FROM agent_types WHERE key = $1', [agent.agent_type]);
      const mods = t.rows[0]?.modules;
      hasDynamicModule = Array.isArray(mods) && (mods.includes('bom_pet') || mods.includes('all'));
    }
    if (!hasModule && !hasDynamicModule) {
      return res.status(403).json({ message: 'Acesso negado ao módulo Bom Pet.' });
    }
    req.bomPetAgent = agent;
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

function isBomPetAdmin(req) {
  return canManageBomPetPartners({
    userRole: req.user?.role,
    agentType: req.bomPetAgent?.agent_type,
  });
}

function requireBomPetAdmin(req, res, next) {
  if (!isBomPetAdmin(req)) {
    return res.status(403).json({ message: 'Acesso restrito a administradores.' });
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

router.get('/parceiros', authMiddleware, bomPetAuth, requireBomPetAdmin, async (req, res) => {
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

router.get('/parceiros/:id(\\d+)', authMiddleware, bomPetAuth, requireBomPetAdmin, async (req, res) => {
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

router.post('/parceiros', authMiddleware, bomPetAuth, requireBomPetAdmin, async (req, res) => {
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

router.put('/parceiros/:id(\\d+)', authMiddleware, bomPetAuth, requireBomPetAdmin, async (req, res) => {
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
      'SELECT pet_contrato_id, pet_nome FROM bom_pet_pets_falecidos WHERE documento_cliente = $1',
      [docDigits]
    );
    // Pets do mesmo plano compartilham o contrato_id — o nome desambigua.
    const falecidos = new Set(
      falecidosRes.rows.map((r) => `${r.pet_contrato_id}::${normalizeName(r.pet_nome)}`)
    );
    const falecidosSemNome = new Set(
      falecidosRes.rows.filter((r) => !r.pet_nome).map((r) => String(r.pet_contrato_id))
    );

    const pets = petRows.map((r) => {
      const nome = (r.texto_original_veiculo || '').split(' - ')[0].trim();
      const falecido = falecidos.has(`${r.contrato_id}::${normalizeName(nome)}`) ||
        falecidosSemNome.has(String(r.contrato_id));
      return {
        nome,
        descricao: r.texto_original_veiculo || '',
        contrato_id: r.contrato_id,
        contrato_servicos: r.contrato_servicos,
        situacao_contrato: mapSituacaoContrato(r.situacao_contrato),
        status: falecido ? 'Falecido' : 'Ativo',
      };
    });

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
      `SELECT id, protocolo, status_atendimento, usuario, data_hora, pet_nome, pet_descricao,
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

// POST /api/bom-pet/atendimentos — registro de atendimento de cremação.
router.post('/atendimentos', authMiddleware, bomPetAuth, async (req, res) => {
  try {
    const {
      documento_cliente, nome_cliente, pet_nome, pet_descricao, pet_contrato_id,
      contratos_servicos, situacao_financeira,
      comprovante_pagamento_recebido, comprovante_pagamento_obs,
      remocao_local, remocao_endereco, clinica_nome, parceiro_id,
      telefone_contato, observacoes,
    } = req.body;

    const usuario = currentUsuario(req);
    if (!usuario) return res.status(401).json({ message: 'Usuário não identificado.' });

    if (!documento_cliente || !pet_contrato_id) {
      return res.status(400).json({ message: 'Campos obrigatórios: documento_cliente, pet_contrato_id' });
    }
    if (!/^\d+$/.test(String(parceiro_id || '')) || Number(parceiro_id) <= 0) {
      return res.status(400).json({ message: 'Selecione um parceiro ativo.' });
    }

    // ── Validação SERVER-SIDE contra o ERP (não confiar no body) ─────────
    const docDigits = String(documento_cliente).replace(/\D/g, '');
    if (docDigits.length !== 11) {
      return res.status(400).json({ message: 'CPF inválido. Deve conter 11 dígitos.' });
    }
    const cpfFormatted = formatCpf(docDigits);
    const dataset = await getPetDataset();
    const erpRows = dataset.filter((r) => (r.documento || '').trim() === cpfFormatted);
    if (erpRows.length === 0) {
      return res.status(404).json({ message: 'Cliente não encontrado na base Bom Pet do ERP.' });
    }

    const titularNorm = normalizeName(erpRows[0].contratante);
    // Pets do mesmo plano compartilham o contrato_id; o nome (validado contra o ERP)
    // desambigua qual pet foi selecionado.
    const bodyPetNome = normalizeName(pet_nome);
    const petRow = erpRows.find((r) => {
      if (String(r.contrato_id) !== String(pet_contrato_id)) return false;
      const texto = normalizeName(r.texto_original_veiculo);
      if (texto === titularNorm) return false;
      if (!bodyPetNome) return true;
      return texto.split(' - ')[0].trim() === bodyPetNome;
    });
    if (!petRow) {
      return res.status(400).json({ message: 'Pet não incluído no plano do cliente — atendimento negado.' });
    }

    // Pet já marcado como Falecido localmente não pode gerar novo atendimento.
    const falecidoRes = await query(
      `SELECT 1 FROM bom_pet_pets_falecidos
        WHERE pet_contrato_id = $1 AND (pet_nome IS NULL OR UPPER(pet_nome) = UPPER($2))`,
      [petRow.contrato_id, (petRow.texto_original_veiculo || '').split(' - ')[0].trim()]
    );
    if (falecidoRes.rows.length > 0) {
      return res.status(400).json({ message: 'Este pet já está marcado como Falecido.' });
    }

    // Situação financeira derivada do ERP, nunca do body.
    void situacao_financeira; void nome_cliente; void pet_descricao; void contratos_servicos;
    const sitFin = erpRows.some((r) => mapSituacaoFinanceira(r.situacao_financeira) === 'INADIMPLENTE')
      ? 'INADIMPLENTE' : 'ADIMPLENTE';
    const comprovanteFlag = comprovante_pagamento_recebido === true;
    const comprovanteObs = stripHtml(comprovante_pagamento_obs);

    // Bloqueio de inadimplência: só libera com comprovante marcado + observação obrigatória.
    if (sitFin === 'INADIMPLENTE') {
      if (!comprovanteFlag) {
        return res.status(400).json({ message: 'Cliente inadimplente: o registro fica bloqueado até estar adimplente ou o comprovante de pagamento ser recebido.' });
      }
      if (!comprovanteObs) {
        return res.status(400).json({ message: 'Observação do comprovante de pagamento é obrigatória.' });
      }
    }

    const sanitizedTelefone = telefone_contato ? String(telefone_contato).replace(/\D/g, '').slice(0, 15) : null;

    // A leitura do parceiro e o INSERT ficam na mesma transação. O lock impede
    // que uma inativação concorrente altere a fotografia entre as duas operações.
    const result = await withTransaction(async (client) => {
      const partnerResult = await client.query(
        `SELECT id, nome, valor_servico, status
           FROM bom_pet_parceiros
          WHERE id = $1
          FOR UPDATE`,
        [parceiro_id]
      );
      const partner = snapshotActivePartner(partnerResult.rows[0]);
      if (!partner) {
        throw partnerError('O parceiro selecionado não existe ou foi inativado. Selecione um parceiro ativo.');
      }

      const inserted = await client.query(
        `WITH lock AS (SELECT pg_advisory_xact_lock(hashtext('bom_pet_protocolo'))),
        next_seq AS (
          SELECT COALESCE(MAX(
            CASE WHEN protocolo LIKE 'BP' || TO_CHAR(CURRENT_DATE, 'YYMMDD') || '%'
            THEN CAST(RIGHT(protocolo, 4) AS INTEGER) ELSE 0 END
          ), 0) + 1 AS seq
          FROM bom_pet_atendimentos, lock
        )
        INSERT INTO bom_pet_atendimentos
         (protocolo, documento_cliente, nome_cliente, pet_nome, pet_descricao, pet_contrato_id,
          contratos_servicos, situacao_financeira, comprovante_pagamento_recebido, comprovante_pagamento_obs,
          remocao_local, remocao_endereco, clinica_nome, parceiro_nome, parceiro_id, parceiro_valor,
          telefone_contato, observacoes, usuario, status_atendimento)
        VALUES (
          'BP' || TO_CHAR(CURRENT_DATE, 'YYMMDD') || LPAD((SELECT seq FROM next_seq)::text, 4, '0'),
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
          $14, $15, $16, $17, $18, 'Pendente'
        )
        RETURNING *`,
        [
          cpfFormatted,
          erpRows[0].contratante || '',
          (petRow.texto_original_veiculo || '').split(' - ')[0].trim(),
          petRow.texto_original_veiculo || null,
          petRow.contrato_id,
          [...new Set(erpRows.map((r) => r.contrato_servicos).filter(Boolean))].join(', ') || null,
          sitFin,
          comprovanteFlag, comprovanteObs,
          stripHtml(remocao_local), stripHtml(remocao_endereco),
          stripHtml(clinica_nome), partner.parceiro_nome, partner.parceiro_id, partner.parceiro_valor,
          sanitizedTelefone, stripHtml(observacoes), usuario,
        ]
      );
      return inserted;
    });

    const atendimento = result.rows[0];

    // Comprovante recebido sob inadimplência: registrado no histórico.
    if (sitFin === 'INADIMPLENTE' && comprovanteFlag) {
      await query(
        `INSERT INTO bom_pet_historico_alteracoes (atendimento_id, status_anterior, status_novo, usuario, observacao)
         VALUES ($1, NULL, 'Pendente', $2, $3)`,
        [atendimento.id, usuario, `Comprovante de pagamento recebido (cliente inadimplente): ${comprovanteObs}`]
      );
    }

    res.status(201).json(serializeBomPetRow(atendimento));
  } catch (error) {
    console.error('Error in bom-pet create atendimento:', error);
    res.status(error.statusCode || 500).json({ message: error.message });
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

router.get('/atendimentos/:id(\\d+)', authMiddleware, bomPetAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const atendimento = await loadAuthorizedAtendimento(req, res, id);
    if (!atendimento) return;
    const imagensResult = await query(
      'SELECT * FROM bom_pet_imagens WHERE atendimento_id = $1 ORDER BY created_at ASC',
      [id]
    );
    res.json({
      ...serializeBomPetRow(atendimento),
      imagens: imagensResult.rows.map(serializeBomPetRow),
    });
  } catch (error) {
    console.error('Error fetching bom-pet atendimento detail:', error);
    res.status(500).json({ message: error.message });
  }
});

router.get('/atendimentos', authMiddleware, bomPetAuth, async (req, res) => {
  try {
    const { documento, status, data_inicio, data_fim, nome, pet, atendente } = req.query;

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
    const { status_atendimento, observacoes_tratamento, marcar_pet_falecido } = req.body;
    const usuario = currentUsuario(req);

    if (status_atendimento && !ALLOWED_STATUS.includes(status_atendimento)) {
      return res.status(400).json({ message: `Status inválido. Permitidos: ${ALLOWED_STATUS.join(', ')}` });
    }

    const atendimento = await loadAuthorizedAtendimento(req, res, id);
    if (!atendimento) return;
    const statusAnterior = atendimento.status_atendimento;

    if (status_atendimento === 'Solucionado') {
      const imgCount = await query('SELECT COUNT(*) FROM bom_pet_imagens WHERE atendimento_id = $1', [id]);
      if (parseInt(imgCount.rows[0].count, 10) === 0) {
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
      const finalStatus = status_atendimento || statusAnterior;
      if (finalStatus !== 'Solucionado') {
        return res.status(400).json({ message: 'O pet só pode ser marcado como Falecido ao solucionar o atendimento.' });
      }
      if (!atendimento.pet_contrato_id) {
        return res.status(400).json({ message: 'Atendimento sem contrato ERP do pet vinculado; não é possível marcar como Falecido.' });
      }
      updateSql += `, pet_falecido_marcado = TRUE`;
      falecidoMarcado = true;
    }

    updateSql += ` WHERE id = $${paramIdx++} RETURNING *`;
    updateParams.push(id);

    const result = await query(updateSql, updateParams);

    if (falecidoMarcado) {
      await query(
        `INSERT INTO bom_pet_pets_falecidos (pet_contrato_id, pet_nome, documento_cliente, atendimento_id, usuario)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (pet_contrato_id) DO NOTHING`,
        [atendimento.pet_contrato_id, atendimento.pet_nome,
         (atendimento.documento_cliente || '').replace(/\D/g, ''), id, usuario]
      );
    }

    const statusChanged = status_atendimento && status_atendimento !== statusAnterior;
    const hasObs = stripHtml(observacoes_tratamento);
    if (statusChanged || hasObs || falecidoMarcado) {
      const obsHist = [hasObs, falecidoMarcado ? 'Pet marcado como Falecido (status local, sem escrita no ERP).' : null]
        .filter(Boolean).join(' | ') || null;
      await query(
        `INSERT INTO bom_pet_historico_alteracoes (atendimento_id, status_anterior, status_novo, usuario, observacao)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, statusAnterior, statusChanged ? status_atendimento : statusAnterior, usuario, obsHist]
      );
    }

    res.json(serializeBomPetRow(result.rows[0]));
  } catch (error) {
    console.error('Error updating bom-pet atendimento:', error);
    res.status(500).json({ message: error.message });
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
