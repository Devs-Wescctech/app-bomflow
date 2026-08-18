import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../config/database.js';
import { generateTokens, verifyToken, authMiddleware } from '../middleware/auth.js';

const router = Router();

router.post('/register', async (req, res) => {
  try {
    const { email, password, full_name } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ message: 'Informe e-mail e senha' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ message: 'A senha deve ter pelo menos 6 caracteres' });
    }
    
    const existing = await query('SELECT id FROM agents WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ message: 'E-mail já cadastrado' });
    }
    
    const password_hash = await bcrypt.hash(password, 10);
    
    const result = await query(
      `INSERT INTO agents (email, password_hash, name, agent_type, role, active) 
       VALUES ($1, $2, $3, 'support', 'agent', true) 
       RETURNING id, email, name, agent_type, role, active, created_at`,
      [email, password_hash, full_name || email.split('@')[0]]
    );
    
    const agent = result.rows[0];
    const tokens = generateTokens(agent);
    
    res.status(201).json({ 
      user: {
        id: agent.id,
        email: agent.email,
        full_name: agent.name,
        role: agent.role,
        agent: {
          id: agent.id,
          name: agent.name,
          agentType: agent.agent_type,
          active: agent.active
        }
      }, 
      ...tokens 
    });
  } catch (error) {
    console.error('Error registering user:', error);
    res.status(500).json({ message: error.message });
  }
});

function buildAgentResponse(agent, agentTypeConfig = { modules: [], allowedSubmenus: [] }) {
  const isSupervisorType = agent.agent_type === 'supervisor' || agent.agent_type === 'sales_supervisor' || agent.agent_type?.endsWith('_supervisor');
  return {
    id: agent.id,
    email: agent.email,
    full_name: agent.name,
    role: agent.agent_type === 'admin' ? 'admin' : (isSupervisorType ? 'supervisor' : 'agent'),
    avatar_url: agent.photo_url,
    agent: {
      id: agent.id,
      name: agent.name,
      agentType: agent.agent_type,
      teamId: agent.team_id,
      teamName: agent.team_name ?? null,
      online: agent.online,
      active: agent.active,
      level: agent.level,
      queueIds: agent.queue_ids || [],
      capacity: agent.capacity || {},
      workingHours: agent.working_hours || {},
      permissions: agent.permissions || {},
      mustResetPassword: agent.must_reset_password || false,
      modules: agentTypeConfig.modules || [],
      allowedSubmenus: agentTypeConfig.allowedSubmenus || [],
      erpAgenteVendaId: agent.erp_agente_venda_id ?? null,
      erpAgentId: agent.erp_agent_id ?? null,
      erpPessoaCode: agent.erp_pessoa_code ?? null,
    }
  };
}

async function getAgentTypeConfig(agentType) {
  try {
    const result = await query('SELECT modules, allowed_submenus FROM agent_types WHERE key = $1', [agentType]);
    if (result.rows.length > 0) {
      return {
        modules: result.rows[0].modules || [],
        allowedSubmenus: result.rows[0].allowed_submenus || []
      };
    }
    return { modules: [], allowedSubmenus: [] };
  } catch (error) {
    console.error('Error fetching agent type config:', error);
    return { modules: [], allowedSubmenus: [] };
  }
}

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ message: 'Informe e-mail e senha' });
    }
    
    const result = await query('SELECT a.*, t.name AS team_name FROM agents a LEFT JOIN teams t ON t.id = a.team_id WHERE a.email = $1', [email]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'E-mail ou senha inválidos' });
    }
    
    const agent = result.rows[0];
    
    if (!agent.password_hash) {
      return res.status(401).json({ message: 'Senha não definida. Contate o administrador.' });
    }
    
    const validPassword = await bcrypt.compare(password, agent.password_hash);
    
    if (!validPassword) {
      return res.status(401).json({ message: 'E-mail ou senha inválidos' });
    }
    
    if (!agent.active) {
      if (agent.deactivation_reason === 'inatividade') {
        return res.status(401).json({ message: 'Conta bloqueada por inatividade. Contate o administrador.' });
      }
      return res.status(401).json({ message: 'Conta inativa. Contate o administrador.' });
    }
    
    // Registra último login e atividade (rastreamento de inatividade)
    query('UPDATE agents SET last_login_at = NOW(), last_activity_at = NOW() WHERE id = $1', [agent.id])
      .catch(err => console.error('[ActivityTracking] Falha ao registrar login:', err.message));
    
    const tokens = generateTokens(agent);
    const agentTypeConfig = await getAgentTypeConfig(agent.agent_type);
    
    res.json({ 
      user: buildAgentResponse(agent, agentTypeConfig), 
      ...tokens 
    });
  } catch (error) {
    console.error('Error logging in:', error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({ message: 'Sessão expirada. Faça login novamente.' });
    }
    
    const decoded = verifyToken(refreshToken);
    
    if (!decoded) {
      return res.status(401).json({ message: 'Sessão expirada. Faça login novamente.' });
    }
    
    const result = await query('SELECT a.*, t.name AS team_name FROM agents a LEFT JOIN teams t ON t.id = a.team_id WHERE a.id = $1', [decoded.id]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Usuário não encontrado' });
    }
    
    const agent = result.rows[0];
    
    if (!agent.active) {
      const message = agent.deactivation_reason === 'inatividade'
        ? 'Conta bloqueada por inatividade. Contate o administrador.'
        : 'Conta inativa. Contate o administrador.';
      return res.status(401).json({ message });
    }
    
    const tokens = generateTokens(agent);
    const agentTypeConfig = await getAgentTypeConfig(agent.agent_type);
    
    res.json({ 
      user: buildAgentResponse(agent, agentTypeConfig), 
      ...tokens 
    });
  } catch (error) {
    console.error('Error refreshing token:', error);
    res.status(500).json({ message: error.message });
  }
});

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const result = await query('SELECT a.*, t.name AS team_name FROM agents a LEFT JOIN teams t ON t.id = a.team_id WHERE a.id = $1', [req.user.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }
    
    const agent = result.rows[0];
    const agentTypeConfig = await getAgentTypeConfig(agent.agent_type);
    
    res.json(buildAgentResponse(agent, agentTypeConfig));
  } catch (error) {
    console.error('Error getting user:', error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/change-password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Informe a senha atual e a nova senha' });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'A nova senha deve ter pelo menos 6 caracteres' });
    }
    
    const result = await query('SELECT * FROM agents WHERE id = $1', [req.user.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }
    
    const agent = result.rows[0];
    const validPassword = await bcrypt.compare(currentPassword, agent.password_hash);
    
    if (!validPassword) {
      return res.status(401).json({ message: 'Senha atual incorreta' });
    }
    
    const newHash = await bcrypt.hash(newPassword, 10);
    
    await query(
      'UPDATE agents SET password_hash = $1, password_updated_at = NOW(), must_reset_password = false WHERE id = $2',
      [newHash, req.user.id]
    );
    
    res.json({ success: true, message: 'Senha alterada com sucesso' });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/logout', (req, res) => {
  res.json({ success: true, message: 'Sessão encerrada' });
});

export default router;
