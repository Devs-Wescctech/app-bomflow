import crypto from 'crypto';
import { query } from '../config/database.js';

export const API_KEY_SCOPES = [
  'vendas_pf',
  'upsell',
  'indicacoes',
  'agentes',
  'canais',
];

export function hashApiKey(rawKey) {
  return crypto.createHash('sha256').update(String(rawKey)).digest('hex');
}

export function generateApiKey() {
  const random = crypto.randomBytes(24).toString('hex');
  const plainKey = `bfk_${random}`;
  const keyHash = hashApiKey(plainKey);
  const keyPrefix = plainKey.slice(0, 12);
  return { plainKey, keyHash, keyPrefix };
}

export function apiKeyAuth(requiredScope) {
  return async (req, res, next) => {
    try {
      const rawKey = req.headers['x-api-key'];

      if (!rawKey) {
        return res.status(401).json({ error: 'API key ausente. Envie o header x-api-key.' });
      }

      const keyHash = hashApiKey(rawKey);
      const result = await query('SELECT * FROM api_keys WHERE key_hash = $1 LIMIT 1', [keyHash]);

      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'API key inválida.' });
      }

      const apiKey = result.rows[0];

      if (!apiKey.active || apiKey.revoked_at) {
        return res.status(401).json({ error: 'API key revogada ou inativa.' });
      }

      if (apiKey.expires_at && new Date(apiKey.expires_at) < new Date()) {
        return res.status(401).json({ error: 'API key expirada.' });
      }

      const scopes = apiKey.scopes || [];

      if (requiredScope && !scopes.includes(requiredScope)) {
        return res.status(403).json({ error: `API key sem permissão para o escopo '${requiredScope}'.` });
      }

      req.apiKey = apiKey;

      query('UPDATE api_keys SET last_used_at = NOW() WHERE id = $1', [apiKey.id]).catch(() => {});

      next();
    } catch (err) {
      console.error('[apiKeyAuth] error:', err.message);
      return res.status(500).json({ error: 'Erro interno na autenticação da API key.' });
    }
  };
}
