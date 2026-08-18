import jwt from 'jsonwebtoken';
import { query } from '../config/database.js';

const JWT_SECRET = process.env.JWT_SECRET;

// Throttle de escrita da "última atividade": no máximo 1 UPDATE a cada
// ACTIVITY_THROTTLE_MS por agente (mantém o rastreio barato).
const ACTIVITY_THROTTLE_MS = 5 * 60 * 1000;
const lastActivityWrites = new Map();

export function touchAgentActivity(agentId) {
  if (!agentId) return;
  const now = Date.now();
  const last = lastActivityWrites.get(agentId);
  if (last && now - last < ACTIVITY_THROTTLE_MS) return;
  lastActivityWrites.set(agentId, now);
  // Fire-and-forget: nunca bloqueia nem falha a requisição.
  query('UPDATE agents SET last_activity_at = NOW() WHERE id = $1', [agentId])
    .catch((err) => {
      lastActivityWrites.delete(agentId);
      console.error('[ActivityTracking] Falha ao atualizar last_activity_at:', err.message);
    });
}

if (!JWT_SECRET) {
  console.error('WARNING: JWT_SECRET environment variable is not set!');
}

function deriveRoleFromAgentType(agentType, existingRole) {
  if (existingRole) return existingRole;
  if (agentType === 'admin') return 'admin';
  if (agentType === 'supervisor') return 'supervisor';
  return 'agent';
}

export function generateTokens(user) {
  const role = deriveRoleFromAgentType(user.agent_type, user.role);
  const accessToken = jwt.sign(
    { id: user.id, email: user.email, role },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
  
  const refreshToken = jwt.sign(
    { id: user.id, email: user.email },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
  
  return { accessToken, refreshToken };
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

// Cache curto do status ativo do agente: tokens já emitidos deixam de valer
// no máximo ACTIVE_CACHE_TTL_MS após a inativação, sem custo de 1 query/request.
const ACTIVE_CACHE_TTL_MS = 60 * 1000;
const activeStatusCache = new Map();

export async function checkAgentActiveStatus(agentId) {
  const cached = activeStatusCache.get(agentId);
  if (cached && Date.now() - cached.at < ACTIVE_CACHE_TTL_MS) {
    return cached.value;
  }
  const result = await query('SELECT active, deactivation_reason FROM agents WHERE id = $1', [agentId]);
  const value = result.rows.length === 0
    ? { found: false, active: false, reason: null }
    : { found: true, active: result.rows[0].active !== false, reason: result.rows[0].deactivation_reason || null };
  activeStatusCache.set(agentId, { value, at: Date.now() });
  return value;
}

export function invalidateAgentActiveCache(agentId) {
  activeStatusCache.delete(agentId);
}

export function inactiveAccountMessage(reason) {
  return reason === 'inatividade'
    ? 'Conta bloqueada por inatividade. Contate o administrador.'
    : 'Conta inativa. Contate o administrador.';
}

export async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return res.status(401).json({ message: 'Autenticação necessária' });
  }
  
  const token = authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ message: 'Token não informado' });
  }
  
  const decoded = verifyToken(token);
  
  if (!decoded) {
    return res.status(401).json({ message: 'Sessão inválida ou expirada' });
  }
  
  // Rejeita tokens de contas inativadas (inativação derruba sessões em <=60s
  // de cache + validade do access token).
  try {
    const status = await checkAgentActiveStatus(decoded.id);
    if (!status.active) {
      return res.status(401).json({ message: inactiveAccountMessage(status.reason) });
    }
  } catch (err) {
    // Fail closed: sem confirmação de que a conta está ativa, a requisição não passa.
    console.error('[ActivityTracking] Falha ao verificar status ativo:', err.message);
    return res.status(503).json({ message: 'Não foi possível validar a sessão. Tente novamente.' });
  }
  
  req.user = decoded;
  touchAgentActivity(decoded.id);
  next();
}

export async function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (authHeader) {
    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);
    if (decoded) {
      try {
        const status = await checkAgentActiveStatus(decoded.id);
        if (status.active) {
          req.user = decoded;
          touchAgentActivity(decoded.id);
        }
      } catch (err) {
        // Fail closed: sem confirmação, segue como não autenticado.
        console.error('[ActivityTracking] Falha ao verificar status ativo (optionalAuth):', err.message);
      }
    }
  }
  
  next();
}
