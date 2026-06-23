import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware } from '../middleware/auth.js';
import { query, pool } from '../config/database.js';
import { getProdutosByPedidoIds } from '../services/erpDbService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

// Pasta de armazenamento dos documentos. Em produção, definir ORCAMENTO_DOCS_DIR apontando
// para uma pasta PERSISTENTE no servidor (fora da área pública e incluída no backup).
// Default de desenvolvimento: backend/data/orcamento-documentos (também fora do static público).
const DOCS_DIR = process.env.ORCAMENTO_DOCS_DIR || path.join(__dirname, '../../data/orcamento-documentos');
try {
  fs.mkdirSync(DOCS_DIR, { recursive: true });
} catch (e) {
  console.error('[OrcamentoDocs] Falha ao criar diretório de documentos:', DOCS_DIR, e.message);
}

const TIPOS_VALIDOS = ['documento_identidade', 'comprovante_residencia', 'taxa_adesao', 'copia_contrato'];
const MODULOS_VALIDOS = ['sales', 'sales_pj', 'sales_upsell', 'referral'];

const MIME_EXT = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
};

const onlyDigits = (s) => String(s || '').replace(/\D/g, '');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (MIME_EXT[file.mimetype]) cb(null, true);
    else cb(new Error(`Tipo de arquivo não permitido: ${file.mimetype}. Aceitos: PDF, JPG, PNG.`), false);
  },
});

// Valida a assinatura real (magic bytes) do arquivo — não confia só na extensão/mimetype.
function validateMagicBytes(buffer, mimetype) {
  if (!buffer || buffer.length < 8) return false;
  if (mimetype === 'application/pdf') {
    return buffer.slice(0, 4).toString('latin1') === '%PDF';
  }
  if (mimetype === 'image/jpeg') {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimetype === 'image/png') {
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return sig.every((b, i) => buffer[i] === b);
  }
  return false;
}

async function getOrcamento(erpPedidoId) {
  const r = await query(
    'SELECT erp_pedido_id, erp_numero, modulo, agent_id, cliente_nome, cliente_cpf, adesao_zero FROM bomflow_orcamentos WHERE erp_pedido_id = $1',
    [Number(erpPedidoId)]
  );
  return r.rows[0] || null;
}

// Admin e supervisor (qualquer agent_type contendo "supervisor") têm acesso total.
async function isPrivileged(req) {
  if (req.user?.role === 'admin' || req.user?.role === 'supervisor') return true;
  if (!req.user?.id) return false;
  const r = await query('SELECT agent_type FROM agents WHERE id = $1', [req.user.id]);
  const at = r.rows[0]?.agent_type || '';
  return at === 'admin' || at.includes('supervisor') || at === 'auditoria';
}

// Permissão: dono do orçamento + supervisor + admin.
async function canManage(req, erpPedidoId) {
  if (await isPrivileged(req)) return true;
  const orc = await getOrcamento(erpPedidoId);
  if (!orc) return false;
  return !!orc.agent_id && orc.agent_id === req.user?.id;
}

// Elegibilidade ESPECÍFICA do Relatório Consolidado de Orçamentos (mais restrita que
// canManage): admin, agent_type 'auditoria' ou supervisor do time "Auditoria". Demais
// usuários só acessam se forem donos do orçamento. Mantém a mesma regra do endpoint
// /relatorio-orcamentos/consolidado, sem alterar canManage/isPrivileged (compartilhados).
async function canViewConsolidadoDocs(req, erpPedidoId) {
  if ((req.user?.role || '').toLowerCase() === 'admin') return true;
  if (!req.user?.id) return false;
  const r = await query(
    `SELECT a.agent_type, t.name AS team_name
       FROM agents a
       LEFT JOIN teams t ON t.id = a.team_id
      WHERE a.id = $1`,
    [req.user.id]
  );
  const row = r.rows[0] || {};
  const at = (row.agent_type || '').toLowerCase();
  const team = (row.team_name || '').trim().toLowerCase();
  if (at === 'admin' || at === 'auditoria') return true;
  if (at.includes('supervisor') && team === 'auditoria') return true;
  const orc = await getOrcamento(erpPedidoId);
  return !!(orc && orc.agent_id && orc.agent_id === req.user?.id);
}

// GET /api/orcamento-documentos/orcamentos?modulo=&cpf=
// Lista os orçamentos do lead (por módulo + CPF) com os documentos anexados e a flag Adesão Zero.
router.get('/orcamentos', authMiddleware, async (req, res) => {
  try {
    const { modulo, cpf } = req.query;
    if (!modulo || !MODULOS_VALIDOS.includes(modulo)) return res.json({ items: [] });
    const cpfDigits = onlyDigits(cpf);
    if (!cpfDigits) return res.json({ items: [] });

    // Escopo de visibilidade: admin/supervisor veem todos; demais só os próprios orçamentos.
    const privileged = await isPrivileged(req);
    const params = [modulo, cpfDigits];
    let ownerFilter = '';
    if (!privileged) {
      params.push(req.user?.id || null);
      ownerFilter = ' AND agent_id = $3';
    }

    const orcs = await query(
      `SELECT erp_pedido_id, erp_numero, modulo, cliente_nome, cliente_cpf,
              adesao_zero, adesao_zero_updated_at, created_at
         FROM bomflow_orcamentos
        WHERE modulo = $1
          AND regexp_replace(COALESCE(cliente_cpf, ''), '\\D', '', 'g') = $2${ownerFilter}
        ORDER BY created_at DESC`,
      params
    );

    const ids = orcs.rows.map((o) => Number(o.erp_pedido_id));
    const docsByPedido = {};
    if (ids.length) {
      const docs = await query(
        `SELECT id, erp_pedido_id, tipo, original_name, mime_type, size_bytes, uploaded_by, created_at
           FROM orcamento_documentos
          WHERE erp_pedido_id = ANY($1)
          ORDER BY created_at`,
        [ids]
      );
      for (const d of docs.rows) {
        const key = Number(d.erp_pedido_id);
        (docsByPedido[key] ||= []).push({
          id: d.id,
          tipo: d.tipo,
          original_name: d.original_name,
          mime_type: d.mime_type,
          size_bytes: d.size_bytes != null ? Number(d.size_bytes) : null,
          created_at: d.created_at,
        });
      }
    }

    // Nome do produto por orçamento (ERP, somente leitura). Best-effort: se a
    // consulta ao ERP falhar, o card continua funcionando sem o nome do produto.
    let produtoByPedido = {};
    if (ids.length) {
      try {
        produtoByPedido = await getProdutosByPedidoIds(ids);
      } catch (e) {
        console.error('[OrcamentoDocs] lookup de produto falhou (não crítico):', e.message);
      }
    }

    const items = orcs.rows.map((o) => ({
      erp_pedido_id: Number(o.erp_pedido_id),
      erp_numero: o.erp_numero != null ? Number(o.erp_numero) : null,
      modulo: o.modulo,
      cliente_nome: o.cliente_nome,
      adesao_zero: o.adesao_zero,
      created_at: o.created_at,
      produto: produtoByPedido[Number(o.erp_pedido_id)] || null,
      documentos: docsByPedido[Number(o.erp_pedido_id)] || [],
    }));

    res.json({ items });
  } catch (e) {
    console.error('[OrcamentoDocs] GET /orcamentos error:', e.message);
    res.status(500).json({ message: e.message });
  }
});

// GET /api/orcamento-documentos/by-pedido/:erpPedidoId
// Lista os documentos anexados a UM orçamento específico (busca direta por erp_pedido_id,
// sem indireção por CPF). Usado pelo modal de detalhe do Relatório Consolidado de Orçamentos.
router.get('/by-pedido/:erpPedidoId', authMiddleware, async (req, res) => {
  try {
    const pedidoId = Number(req.params.erpPedidoId);
    if (!pedidoId) return res.status(400).json({ message: 'Orçamento inválido' });
    if (!(await canViewConsolidadoDocs(req, pedidoId))) return res.status(403).json({ message: 'Sem permissão' });

    const orc = await getOrcamento(pedidoId);

    const docsRes = await query(
      `SELECT id, erp_pedido_id, tipo, original_name, mime_type, size_bytes, created_at
         FROM orcamento_documentos
        WHERE erp_pedido_id = $1
        ORDER BY created_at`,
      [pedidoId]
    );
    const documentos = docsRes.rows.map((d) => ({
      id: d.id,
      tipo: d.tipo,
      original_name: d.original_name,
      mime_type: d.mime_type,
      size_bytes: d.size_bytes != null ? Number(d.size_bytes) : null,
      created_at: d.created_at,
    }));

    // Nome do produto (ERP, somente leitura). Best-effort: não derruba o modal se falhar.
    let produto = null;
    try {
      const map = await getProdutosByPedidoIds([pedidoId]);
      produto = map[pedidoId] || null;
    } catch (e) {
      console.error('[OrcamentoDocs] lookup de produto (by-pedido) falhou (não crítico):', e.message);
    }

    res.json({
      erp_pedido_id: pedidoId,
      adesao_zero: orc ? orc.adesao_zero : null,
      produto,
      documentos,
    });
  } catch (e) {
    console.error('[OrcamentoDocs] GET /by-pedido error:', e.message);
    res.status(500).json({ message: e.message });
  }
});

// POST /api/orcamento-documentos  (multipart: file, tipo, erp_pedido_id, lead_id, modulo)
// Envia/reenvia um documento. Reenvio substitui o documento anterior do mesmo tipo.
router.post('/', authMiddleware, (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      return res.status(status).json({ message: err.message });
    }
    try {
      if (!req.file) return res.status(400).json({ message: 'Nenhum arquivo enviado' });
      const { tipo, erp_pedido_id, lead_id } = req.body;
      if (!TIPOS_VALIDOS.includes(tipo)) return res.status(400).json({ message: 'Tipo de documento inválido' });
      const pedidoId = Number(erp_pedido_id);
      if (!pedidoId) return res.status(400).json({ message: 'Orçamento inválido' });
      if (!validateMagicBytes(req.file.buffer, req.file.mimetype)) {
        return res.status(400).json({ message: 'O conteúdo do arquivo não confere com o tipo informado.' });
      }

      // O módulo é derivado do próprio orçamento (não confiamos no valor enviado pelo cliente).
      const orc = await getOrcamento(pedidoId);
      if (!orc) return res.status(404).json({ message: 'Orçamento não encontrado' });
      const privileged = await isPrivileged(req);
      const isOwner = !!orc.agent_id && orc.agent_id === req.user?.id;
      if (!privileged && !isOwner) {
        return res.status(403).json({ message: 'Sem permissão para gerenciar documentos deste orçamento' });
      }
      const modulo = orc.modulo;

      const ext = MIME_EXT[req.file.mimetype];
      const storedName = `${uuidv4()}${ext}`;
      const fullPath = path.join(DOCS_DIR, storedName);

      // Grava o novo arquivo primeiro; troca de registro é transacional.
      fs.writeFileSync(fullPath, req.file.buffer);

      const client = await pool.connect();
      let ins;
      let prevStoredNames = [];
      try {
        await client.query('BEGIN');
        const prev = await client.query(
          'SELECT id, stored_name FROM orcamento_documentos WHERE erp_pedido_id = $1 AND tipo = $2 FOR UPDATE',
          [pedidoId, tipo]
        );
        prevStoredNames = prev.rows.map((p) => p.stored_name);
        await client.query('DELETE FROM orcamento_documentos WHERE erp_pedido_id = $1 AND tipo = $2', [pedidoId, tipo]);
        ins = await client.query(
          `INSERT INTO orcamento_documentos
             (erp_pedido_id, lead_id, modulo, tipo, stored_name, original_name, mime_type, size_bytes, uploaded_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING id, erp_pedido_id, tipo, original_name, mime_type, size_bytes, created_at`,
          [pedidoId, lead_id || null, modulo, tipo, storedName, req.file.originalname, req.file.mimetype, req.file.size, req.user?.id || null]
        );
        await client.query('COMMIT');
      } catch (txErr) {
        await client.query('ROLLBACK').catch(() => {});
        try { fs.unlinkSync(fullPath); } catch { /* novo arquivo descartado */ }
        throw txErr;
      } finally {
        client.release();
      }

      // Remove os arquivos antigos só após o commit bem-sucedido.
      for (const name of prevStoredNames) {
        try { fs.unlinkSync(path.join(DOCS_DIR, name)); } catch { /* arquivo já ausente */ }
      }

      res.json({ success: true, documento: ins.rows[0] });
    } catch (e) {
      console.error('[OrcamentoDocs] POST error:', e.message);
      res.status(500).json({ message: e.message });
    }
  });
});

// GET /api/orcamento-documentos/:id/download — download/visualização autenticada (sem link público).
router.get('/:id/download', authMiddleware, async (req, res) => {
  try {
    const r = await query('SELECT * FROM orcamento_documentos WHERE id = $1', [req.params.id]);
    const doc = r.rows[0];
    if (!doc) return res.status(404).json({ message: 'Documento não encontrado' });
    if (!(await canManage(req, doc.erp_pedido_id))) return res.status(403).json({ message: 'Sem permissão' });

    const fullPath = path.join(DOCS_DIR, doc.stored_name);
    if (!fs.existsSync(fullPath)) return res.status(404).json({ message: 'Arquivo não encontrado no servidor' });

    res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.original_name || doc.stored_name)}"`);
    fs.createReadStream(fullPath).pipe(res);
  } catch (e) {
    console.error('[OrcamentoDocs] download error:', e.message);
    res.status(500).json({ message: e.message });
  }
});

// DELETE /api/orcamento-documentos/:id
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const r = await query('SELECT * FROM orcamento_documentos WHERE id = $1', [req.params.id]);
    const doc = r.rows[0];
    if (!doc) return res.status(404).json({ message: 'Documento não encontrado' });
    if (!(await canManage(req, doc.erp_pedido_id))) return res.status(403).json({ message: 'Sem permissão' });

    try { fs.unlinkSync(path.join(DOCS_DIR, doc.stored_name)); } catch { /* arquivo já ausente */ }
    await query('DELETE FROM orcamento_documentos WHERE id = $1', [doc.id]);
    res.json({ success: true });
  } catch (e) {
    console.error('[OrcamentoDocs] delete error:', e.message);
    res.status(500).json({ message: e.message });
  }
});

// PUT /api/orcamento-documentos/adesao-zero  (json: erp_pedido_id, adesao_zero)
router.put('/adesao-zero', authMiddleware, async (req, res) => {
  try {
    const { erp_pedido_id, adesao_zero } = req.body;
    const pedidoId = Number(erp_pedido_id);
    if (!pedidoId) return res.status(400).json({ message: 'Orçamento inválido' });
    if (typeof adesao_zero !== 'boolean') return res.status(400).json({ message: 'adesao_zero deve ser true/false' });
    if (!(await canManage(req, pedidoId))) return res.status(403).json({ message: 'Sem permissão' });

    const upd = await query(
      `UPDATE bomflow_orcamentos
          SET adesao_zero = $1, adesao_zero_updated_by = $2, adesao_zero_updated_at = NOW()
        WHERE erp_pedido_id = $3
        RETURNING erp_pedido_id, adesao_zero`,
      [adesao_zero, req.user?.id || null, pedidoId]
    );
    if (!upd.rows[0]) return res.status(404).json({ message: 'Orçamento não encontrado' });
    res.json({ success: true, adesao_zero: upd.rows[0].adesao_zero });
  } catch (e) {
    console.error('[OrcamentoDocs] adesao-zero error:', e.message);
    res.status(500).json({ message: e.message });
  }
});

export default router;
