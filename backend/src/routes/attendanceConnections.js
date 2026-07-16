import { Router } from 'express';
import crypto from 'crypto';
import { authMiddleware } from '../middleware/auth.js';
import { loadAgentMiddleware, requireRole } from '../middleware/permissions.js';
import { query } from '../config/database.js';
import { encrypt } from '../utils/encryption.js';
import { getStatus } from '../services/attendanceWhuClient.js';

// Conexões de canal do Atendimento (Chat v2). Admin-only: cadastra o token do canal WHU
// (criptografado em repouso), valida contra o WHU e devolve a URL de webhook a configurar
// no painel WHU/Rudo. O token NUNCA é retornado nas listagens.

const router = Router();

router.use(authMiddleware, loadAgentMiddleware, requireRole('admin'));

function webhookUrlFor(req, connectionId) {
  const baseUrl =
    process.env.PUBLIC_APP_URL ||
    (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null) ||
    `https://${req.get('host')}`;
  return `${baseUrl}/api/webhooks/attendance/whatsapp/${connectionId}`;
}

router.get('/', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, channel, name, status, webhook_secret, created_at, updated_at
         FROM channel_connections
        ORDER BY created_at ASC`
    );
    res.json(
      result.rows.map((c) => ({
        id: c.id,
        channel: c.channel,
        name: c.name,
        status: c.status,
        webhookUrl: webhookUrlFor(req, c.id),
        webhookSecret: c.webhook_secret,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
      }))
    );
  } catch (error) {
    console.error('[AttendanceConnections] Erro ao listar:', error.message);
    res.status(500).json({ message: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, token, channel = 'whatsapp' } = req.body || {};
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ message: 'Nome da conexão é obrigatório' });
    }
    if (!token || typeof token !== 'string' || !token.trim()) {
      return res.status(400).json({ message: 'Token do canal é obrigatório' });
    }

    // Valida o token contra o WHU antes de salvar.
    try {
      await getStatus(token.trim());
    } catch (e) {
      return res.status(400).json({
        message:
          'Token inválido ou canal desativado na plataforma WHU. Verifique o token no painel Rudo/WHU.',
        detail: e.apiMessage || e.message,
      });
    }

    const encryptedToken = encrypt(token.trim());
    const webhookSecret = crypto.randomBytes(24).toString('hex');

    const result = await query(
      `INSERT INTO channel_connections (channel, name, token, status, webhook_secret)
       VALUES ($1, $2, $3, 'active', $4)
       RETURNING id, channel, name, status, webhook_secret, created_at`,
      [channel, name.trim(), encryptedToken, webhookSecret]
    );
    const conn = result.rows[0];

    res.status(201).json({
      id: conn.id,
      channel: conn.channel,
      name: conn.name,
      status: conn.status,
      webhookUrl: webhookUrlFor(req, conn.id),
      webhookSecret: conn.webhook_secret,
      createdAt: conn.created_at,
      instructions:
        'Configure esta URL de webhook no painel WHU/Rudo e envie o webhookSecret no header x-webhook-secret.',
    });
  } catch (error) {
    console.error('[AttendanceConnections] Erro ao criar:', error.message);
    res.status(500).json({ message: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const result = await query('DELETE FROM channel_connections WHERE id = $1 RETURNING id', [
      req.params.id,
    ]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Conexão não encontrada' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('[AttendanceConnections] Erro ao remover:', error.message);
    res.status(500).json({ message: error.message });
  }
});

export default router;
