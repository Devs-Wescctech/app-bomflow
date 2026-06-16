import { Router } from 'express';
import { query } from '../config/database.js';
import { authMiddleware } from '../middleware/auth.js';
import { generateApiKey, API_KEY_SCOPES } from '../middleware/apiKeyAuth.js';

const router = Router();

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: 'Acesso restrito a administradores.' });
  }
  next();
}

function serializeKey(row) {
  return {
    id: row.id,
    name: row.name,
    keyPrefix: row.key_prefix,
    scopes: row.scopes || [],
    active: row.active,
    lastUsedAt: row.last_used_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
  };
}

router.use(authMiddleware, requireAdmin);

// List all API keys (never returns the raw key or its hash)
router.get('/', async (req, res) => {
  try {
    const result = await query('SELECT * FROM api_keys ORDER BY created_at DESC');
    res.json(result.rows.map(serializeKey));
  } catch (err) {
    console.error('[api-keys list] error:', err.message);
    res.status(500).json({ message: 'Erro ao listar API keys.' });
  }
});

// Create a new API key. Returns the plaintext key ONCE.
router.post('/', async (req, res) => {
  try {
    const { name, scopes, expiresAt } = req.body || {};

    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: 'O nome da API key é obrigatório.' });
    }

    const requestedScopes = Array.isArray(scopes) ? scopes : [];
    const invalid = requestedScopes.filter((s) => !API_KEY_SCOPES.includes(s));
    if (invalid.length > 0) {
      return res.status(400).json({ message: `Escopo(s) inválido(s): ${invalid.join(', ')}.` });
    }
    if (requestedScopes.length === 0) {
      return res.status(400).json({ message: 'Selecione ao menos um escopo de acesso.' });
    }

    const { plainKey, keyHash, keyPrefix } = generateApiKey();

    const result = await query(
      `INSERT INTO api_keys (name, key_hash, key_prefix, scopes, created_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [String(name).trim(), keyHash, keyPrefix, requestedScopes, req.user?.id || null, expiresAt || null]
    );

    res.status(201).json({
      ...serializeKey(result.rows[0]),
      plainKey,
    });
  } catch (err) {
    console.error('[api-keys create] error:', err.message);
    res.status(500).json({ message: 'Erro ao criar API key.' });
  }
});

// Revoke an API key (keeps the audit record)
router.post('/:id/revoke', async (req, res) => {
  try {
    const result = await query(
      `UPDATE api_keys SET active = FALSE, revoked_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'API key não encontrada.' });
    }
    res.json(serializeKey(result.rows[0]));
  } catch (err) {
    console.error('[api-keys revoke] error:', err.message);
    res.status(500).json({ message: 'Erro ao revogar API key.' });
  }
});

// Permanently delete an API key
router.delete('/:id', async (req, res) => {
  try {
    const result = await query('DELETE FROM api_keys WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'API key não encontrada.' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[api-keys delete] error:', err.message);
    res.status(500).json({ message: 'Erro ao excluir API key.' });
  }
});

export default router;
