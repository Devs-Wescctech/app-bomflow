import express from 'express';
import { randomUUID } from 'crypto';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import jwt from 'jsonwebtoken';
import { authMiddleware } from '../middleware/auth.js';
import { loadAgentMiddleware } from '../middleware/permissions.js';
import { pool, query } from '../config/database.js';
import {
  createTrainingReadUrl,
  createTrainingUploadUrl,
  deleteTrainingObject,
  getTrainingObject,
  isTrainingStorageConfigured,
} from '../services/trainingObjectStorage.js';
import { matchesMagicBytes, validateTrainingUpload } from '../utils/trainingValidation.js';

const router = express.Router();
const MODULE_KEY = 'portal_experience';
const SUBMENU_KEY = 'ProductTraining';

router.get('/:id/download', async (req, res, next) => {
  try {
    const payload = jwt.verify(String(req.query.token || ''), process.env.JWT_SECRET);
    if (payload.purpose !== 'training-download' || payload.trainingId !== req.params.id) {
      return res.status(401).json({ message: 'Link de download inválido.' });
    }
    const training = (await query(
      `SELECT media_object_path, original_name, mime_type
         FROM trainings WHERE id=$1 AND media_object_path IS NOT NULL`,
      [req.params.id]
    )).rows[0];
    if (!training) return res.status(404).json({ message: 'Treinamento não encontrado.' });
    const file = getTrainingObject(training.media_object_path);
    const [metadata] = await file.getMetadata();
    const safeName = String(training.original_name || 'treinamento')
      .replace(/[\r\n"]/g, '_')
      .slice(0, 240);
    res.set({
      'Content-Type': training.mime_type || metadata.contentType || 'application/octet-stream',
      'Content-Length': metadata.size,
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    file.createReadStream()
      .on('error', next)
      .pipe(res);
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Link de download inválido ou expirado.' });
    }
    next(error);
  }
});

router.use(authMiddleware, loadAgentMiddleware);

function isCurrentAdmin(req) {
  return req.agent?.agentType === 'admin';
}

async function authorize(req, res, next) {
  if (isCurrentAdmin(req)) return next();
  try {
    const result = await query(
      `SELECT modules, allowed_submenus
         FROM agent_types WHERE key = $1 AND active = true`,
      [req.agent?.agentType]
    );
    const config = result.rows[0];
    const modules = config?.modules || [];
    const submenus = config?.allowed_submenus || [];
    if (!modules.includes('all') && !modules.includes(MODULE_KEY)) {
      return res.status(403).json({ message: 'Sem acesso ao Portal e Experiência do Usuário.' });
    }
    if (submenus.length && !submenus.includes(SUBMENU_KEY)) {
      return res.status(403).json({ message: 'Sem acesso ao Treinamento Produtos.' });
    }
    next();
  } catch (error) {
    next(error);
  }
}

function adminOnly(req, res, next) {
  if (isCurrentAdmin(req)) return next();
  return res.status(403).json({ message: 'Apenas o admin master pode administrar treinamentos.' });
}

async function cleanupExpiredTrainingUploads() {
  const expired = await query(
    `SELECT id, training_id, object_path, asset_kind FROM training_uploads
      WHERE completed_at IS NULL AND expires_at < NOW()`
  );
  for (const row of expired.rows) {
    try {
      await deleteTrainingObject(row.object_path);
      await query('DELETE FROM training_uploads WHERE id=$1 AND completed_at IS NULL', [row.id]);
      if (row.asset_kind !== 'cover') {
        await query(
          `UPDATE trainings SET upload_status='failed', published=false
            WHERE id=$1 AND upload_status='uploading'`,
          [row.training_id]
        );
      }
    } catch (cleanupError) {
      console.error('[Trainings] Falha ao limpar upload expirado:', row.id, cleanupError.message);
    }
  }
  const pendingDeletes = await query(
    `SELECT id, object_path FROM training_object_deletions
      WHERE completed_at IS NULL AND next_attempt_at <= NOW()
      ORDER BY created_at LIMIT 50`
  );
  for (const row of pendingDeletes.rows) await processDeletion(row.id, row.object_path);
}

async function processDeletion(id, objectPath) {
  try {
    await deleteTrainingObject(objectPath);
    await query(
      `UPDATE training_object_deletions
          SET completed_at=NOW(), last_error=NULL WHERE id=$1`,
      [id]
    );
    return true;
  } catch (error) {
    await query(
      `UPDATE training_object_deletions
          SET attempts=attempts+1, last_error=$2,
              next_attempt_at=NOW() + LEAST(INTERVAL '1 hour', (attempts + 1) * INTERVAL '5 minutes')
        WHERE id=$1`,
      [id, String(error.message || error).slice(0, 1000)]
    ).catch(() => {});
    return false;
  }
}

async function enqueueDeletion(objectPath, client = null) {
  if (!objectPath) return null;
  const executor = client || { query };
  const result = await executor.query(
    `INSERT INTO training_object_deletions (object_path)
     VALUES ($1) ON CONFLICT (object_path) DO UPDATE
       SET completed_at=NULL, next_attempt_at=NOW()
     RETURNING id`,
    [objectPath]
  );
  return result.rows[0]?.id;
}

const cleanupTimer = setInterval(() => {
  cleanupExpiredTrainingUploads().catch((error) => {
    if (error.code !== '42P01') console.error('[Trainings] Limpeza periódica falhou:', error.message);
  });
}, 15 * 60 * 1000);
cleanupTimer.unref();

router.use(authorize);

router.get('/', async (req, res, next) => {
  try {
    const isAdmin = isCurrentAdmin(req);
    const result = await query(
      `SELECT t.id, t.title, t.description, t.media_type, t.original_name, t.mime_type, t.size_bytes,
              t.sort_order, t.published, t.upload_status, t.cover_object_path IS NOT NULL AS has_cover,
              t.created_at, t.updated_at,
              u.id AS pending_upload_id, u.original_name AS pending_original_name,
              u.mime_type AS pending_mime_type, u.expected_size AS pending_expected_size,
              u.asset_kind AS pending_asset_kind
         FROM trainings t
         LEFT JOIN LATERAL (
           SELECT id, original_name, mime_type, expected_size, asset_kind
             FROM training_uploads
            WHERE training_id=t.id AND completed_at IS NULL AND expires_at > NOW()
            ORDER BY created_at DESC LIMIT 1
         ) u ON ${isAdmin ? 'true' : 'false'}
        ${isAdmin ? '' : "WHERE t.published = true AND t.upload_status = 'ready'"}
        ORDER BY t.sort_order ASC, t.created_at ASC`
    );
    res.json({ trainings: result.rows, canAdminister: isAdmin, storageConfigured: isTrainingStorageConfigured() });
  } catch (error) {
    next(error);
  }
});

router.post('/', adminOnly, async (req, res, next) => {
  try {
    const title = String(req.body.title || '').trim();
    const description = String(req.body.description || '').trim();
    const mediaType = req.body.mediaType;
    if (!title) return res.status(400).json({ message: 'Informe o título.' });
    if (!['video', 'pdf'].includes(mediaType)) return res.status(400).json({ message: 'Tipo de mídia inválido.' });
    const result = await query(
      `INSERT INTO trainings (title, description, media_type, sort_order, created_by)
       VALUES ($1, $2, $3, COALESCE((SELECT MAX(sort_order) + 1 FROM trainings), 0), $4)
       RETURNING *`,
      [title, description, mediaType, req.user?.id || null]
    );
    res.status(201).json({ training: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.put('/order', adminOnly, async (req, res, next) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
  if (!ids.length || new Set(ids).size !== ids.length) return res.status(400).json({ message: 'Ordenação inválida.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (let i = 0; i < ids.length; i += 1) {
      await client.query('UPDATE trainings SET sort_order = $1, updated_at = NOW() WHERE id = $2', [i, ids[i]]);
    }
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    next(error);
  } finally {
    client.release();
  }
});

router.put('/:id', adminOnly, async (req, res, next) => {
  try {
    const fields = [];
    const params = [];
    const add = (column, value) => { params.push(value); fields.push(`${column} = $${params.length}`); };
    if (req.body.mediaType !== undefined) {
      const current = await query('SELECT media_type FROM trainings WHERE id = $1', [req.params.id]);
      if (!current.rows[0]) return res.status(404).json({ message: 'Treinamento não encontrado.' });
      if (req.body.mediaType !== current.rows[0].media_type) {
        return res.status(400).json({ message: 'O formato não pode ser alterado. Crie um novo conteúdo.' });
      }
    }
    if (req.body.title !== undefined) {
      const title = String(req.body.title).trim();
      if (!title) return res.status(400).json({ message: 'Informe o título.' });
      add('title', title);
    }
    if (req.body.description !== undefined) add('description', String(req.body.description || '').trim());
    if (req.body.published !== undefined) {
      if (req.body.published) {
        const current = await query('SELECT upload_status FROM trainings WHERE id = $1', [req.params.id]);
        if (current.rows[0]?.upload_status !== 'ready') {
          return res.status(422).json({ message: 'Finalize o envio de um arquivo válido antes de publicar.' });
        }
      }
      add('published', Boolean(req.body.published));
      add('published_at', req.body.published ? new Date() : null);
    }
    if (!fields.length) return res.status(400).json({ message: 'Nenhuma alteração informada.' });
    params.push(req.params.id);
    const result = await query(
      `UPDATE trainings SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (!result.rows[0]) return res.status(404).json({ message: 'Treinamento não encontrado.' });
    res.json({ training: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/uploads', adminOnly, async (req, res, next) => {
  try {
    if (!isTrainingStorageConfigured()) return res.status(503).json({ message: 'Armazenamento privado indisponível neste ambiente.' });
    const training = (await query('SELECT * FROM trainings WHERE id = $1', [req.params.id])).rows[0];
    if (!training) return res.status(404).json({ message: 'Treinamento não encontrado.' });
    const kind = req.body.kind === 'cover' ? 'cover' : training.media_type;
    const mimeType = String(req.body.mimeType || '').toLowerCase();
    const sizeBytes = Number(req.body.sizeBytes);
    const validationError = validateTrainingUpload(kind, mimeType, sizeBytes);
    if (validationError) return res.status(400).json({ message: validationError });

    await cleanupExpiredTrainingUploads();
    const signed = await createTrainingUploadUrl(kind, mimeType);
    const uploadId = randomUUID();
    await query(
      `INSERT INTO training_uploads
       (id, training_id, asset_kind, object_path, upload_url, original_name, mime_type, expected_size, expires_at, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW() + INTERVAL '7 days',$9)`,
      [uploadId, training.id, kind, signed.objectPath, signed.uploadUrl, String(req.body.originalName || 'arquivo'), mimeType, sizeBytes, req.user?.id || null]
    );
    if (kind !== 'cover' && !training.media_object_path) {
      await query(`UPDATE trainings SET upload_status = 'uploading' WHERE id = $1`, [training.id]);
    }
    res.status(201).json({ uploadId, uploadUrl: signed.uploadUrl, expiresIn: signed.expiresIn });
  } catch (error) {
    next(error);
  }
});

router.get('/:id/uploads/:uploadId/resume', adminOnly, async (req, res, next) => {
  try {
    const upload = (await query(
      `SELECT id, upload_url, original_name, mime_type, expected_size, asset_kind
         FROM training_uploads
        WHERE id=$1 AND training_id=$2 AND completed_at IS NULL AND expires_at > NOW()`,
      [req.params.uploadId, req.params.id]
    )).rows[0];
    if (!upload) return res.status(404).json({ message: 'Envio pendente não encontrado ou expirado.' });
    res.json({
      uploadId: upload.id,
      uploadUrl: upload.upload_url,
      originalName: upload.original_name,
      mimeType: upload.mime_type,
      sizeBytes: Number(upload.expected_size),
      kind: upload.asset_kind,
    });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id/uploads/:uploadId', adminOnly, async (req, res, next) => {
  try {
    const upload = (await query(
      `SELECT object_path, asset_kind FROM training_uploads
        WHERE id=$1 AND training_id=$2 AND completed_at IS NULL`,
      [req.params.uploadId, req.params.id]
    )).rows[0];
    if (upload?.object_path) {
      await deleteTrainingObject(upload.object_path);
      await query('DELETE FROM training_uploads WHERE id=$1 AND completed_at IS NULL', [req.params.uploadId]);
    }
    if (upload && upload.asset_kind !== 'cover') {
      await query(
        `UPDATE trainings SET upload_status=CASE WHEN media_object_path IS NULL THEN 'failed' ELSE 'ready' END
          WHERE id=$1`,
        [req.params.id]
      );
    }
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/uploads/:uploadId/complete', adminOnly, async (req, res, next) => {
  let upload;
  let committed = false;
  try {
    upload = (await query(
      `SELECT * FROM training_uploads WHERE id = $1 AND training_id = $2 AND completed_at IS NULL`,
      [req.params.uploadId, req.params.id]
    )).rows[0];
    if (!upload) return res.status(404).json({ message: 'Envio não encontrado ou já finalizado.' });
    const file = getTrainingObject(upload.object_path);
    const [metadata] = await file.getMetadata();
    const actualSize = Number(metadata.size);
    const validationError = validateTrainingUpload(upload.asset_kind, upload.mime_type, actualSize);
    if (validationError || actualSize !== Number(upload.expected_size)) throw new Error(validationError || 'O envio foi interrompido antes de terminar.');
    const chunks = [];
    await new Promise((resolve, reject) => {
      file.createReadStream({ start: 0, end: 31 })
        .on('data', (chunk) => chunks.push(chunk))
        .on('end', resolve)
        .on('error', reject);
    });
    if (!matchesMagicBytes(upload.asset_kind, Buffer.concat(chunks))) throw new Error('O conteúdo do arquivo não confere com o formato informado.');

    const client = await pool.connect();
    let previousPath;
    try {
      await client.query('BEGIN');
      const locked = (await client.query('SELECT * FROM trainings WHERE id = $1 FOR UPDATE', [req.params.id])).rows[0];
      previousPath = upload.asset_kind === 'cover' ? locked.cover_object_path : locked.media_object_path;
      if (upload.asset_kind === 'cover') {
        await client.query('UPDATE trainings SET cover_object_path = $1, updated_at = NOW() WHERE id = $2', [upload.object_path, locked.id]);
      } else {
        await client.query(
          `UPDATE trainings SET media_object_path=$1, original_name=$2, mime_type=$3, size_bytes=$4,
             upload_status='ready', updated_at=NOW() WHERE id=$5`,
          [upload.object_path, upload.original_name, upload.mime_type, actualSize, locked.id]
        );
      }
      if (previousPath && previousPath !== upload.object_path) {
        await enqueueDeletion(previousPath, client);
      }
      await client.query('UPDATE training_uploads SET completed_at = NOW() WHERE id = $1', [upload.id]);
      await client.query('COMMIT');
      committed = true;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
    if (previousPath && previousPath !== upload.object_path) {
      try {
        const deletion = await query(
          'SELECT id FROM training_object_deletions WHERE object_path=$1 AND completed_at IS NULL',
          [previousPath]
        );
        if (deletion.rows[0]) await processDeletion(deletion.rows[0].id, previousPath);
      } catch (cleanupError) {
        console.error('[Trainings] Limpeza pós-substituição será repetida:', cleanupError.message);
      }
    }
    res.json({ success: true });
  } catch (error) {
    if (committed) return next(error);
    const active = upload?.object_path
      ? (await query(
          `SELECT 1 FROM trainings
            WHERE id=$1 AND (media_object_path=$2 OR cover_object_path=$2)`,
          [upload.training_id, upload.object_path]
        ).catch(() => ({ rows: [] }))).rows.length > 0
      : false;
    if (active) return next(error);
    let removed = false;
    if (upload?.object_path) {
      removed = await deleteTrainingObject(upload.object_path).then(() => true).catch(() => false);
    }
    if (upload?.id && removed) {
      await query(`DELETE FROM training_uploads WHERE id = $1`, [upload.id]).catch(() => {});
    } else if (upload?.id) {
      await query(`UPDATE training_uploads SET expires_at=NOW() WHERE id=$1`, [upload.id]).catch(() => {});
    }
    if (upload?.id) {
      if (upload.asset_kind !== 'cover') {
        await query(
          `UPDATE trainings SET upload_status=CASE WHEN media_object_path IS NULL THEN 'failed' ELSE 'ready' END
            WHERE id=$1`,
          [upload.training_id]
        ).catch(() => {});
      }
    }
    error.statusCode = error.statusCode || 422;
    next(error);
  }
});

router.get('/:id/access', async (req, res, next) => {
  try {
    const isAdmin = isCurrentAdmin(req);
    const training = (await query(
      `SELECT * FROM trainings WHERE id = $1 ${isAdmin ? '' : "AND published=true AND upload_status='ready'"}`,
      [req.params.id]
    )).rows[0];
    if (!training) return res.status(404).json({ message: 'Treinamento não encontrado.' });
    if (!training.media_object_path || training.upload_status !== 'ready') {
      return res.status(422).json({ message: 'Este treinamento ainda não possui uma mídia pronta.' });
    }
    if (req.query.download === '1') {
      const token = jwt.sign(
        { purpose: 'training-download', trainingId: training.id },
        process.env.JWT_SECRET,
        { expiresIn: '5m' }
      );
      return res.json({
        url: `/api/trainings/${training.id}/download?token=${encodeURIComponent(token)}`,
        expiresIn: 300,
      });
    }
    res.json({
      url: await createTrainingReadUrl(training.media_object_path),
      expiresIn: 900,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:id/cover', async (req, res, next) => {
  try {
    const isAdmin = isCurrentAdmin(req);
    const training = (await query(
      `SELECT cover_object_path FROM trainings WHERE id=$1 ${isAdmin ? '' : "AND published=true AND upload_status='ready'"}`,
      [req.params.id]
    )).rows[0];
    if (!training?.cover_object_path) return res.status(404).json({ message: 'Capa não encontrada.' });
    res.json({ url: await createTrainingReadUrl(training.cover_object_path), expiresIn: 900 });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', adminOnly, async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT media_object_path, cover_object_path
         FROM trainings WHERE id=$1 FOR UPDATE`,
      [req.params.id]
    );
    if (!result.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Treinamento não encontrado.' });
    }
    const pending = await client.query(
      `SELECT object_path FROM training_uploads
        WHERE training_id=$1 AND completed_at IS NULL FOR UPDATE`,
      [req.params.id]
    );
    const paths = [
      result.rows[0].media_object_path,
      result.rows[0].cover_object_path,
      ...pending.rows.map((row) => row.object_path),
    ].filter(Boolean);
    const queued = [];
    for (const objectPath of paths) {
      const deletionId = await enqueueDeletion(objectPath, client);
      if (deletionId) queued.push({ id: deletionId, objectPath });
    }
    await client.query('DELETE FROM trainings WHERE id=$1', [req.params.id]);
    await client.query('COMMIT');
    await Promise.allSettled(queued.map((item) => processDeletion(item.id, item.objectPath)));
    res.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    next(error);
  } finally {
    client.release();
  }
});

export default router;
