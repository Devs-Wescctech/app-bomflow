import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { createCrudRouter } from '../utils/crud.js';
import { authMiddleware, optionalAuth, invalidateAgentActiveCache } from '../middleware/auth.js';
import { loadAgentMiddleware, requireRole } from '../middleware/permissions.js';
import { query, pool } from '../config/database.js';
import { 
  notifyLeadAssigned, 
  notifyLeadStageChanged, 
  notifyLeadComment,
  notifyVisitScheduled,
  notifyLeadPJAssigned,
  notifyReferralAssigned,
  notifyProposalStatus
} from '../services/notificationService.js';
import { executeLeadCreatedAutomation, executeStageChangeAutomation, executeUpsellChannelLeadCreatedAutomation, executeUpsellChannelStageChangeAutomation } from '../services/automationService.js';

const router = Router();

// Explicit migration: ensure supervisor_emails column exists in teams table
pool.query('ALTER TABLE teams ADD COLUMN IF NOT EXISTS supervisor_emails TEXT[]')
  .then(() => console.log('[Migration] teams.supervisor_emails OK'))
  .catch(e => console.error('[Migration] teams.supervisor_emails error:', e.message));

pool.query(`
  CREATE TABLE IF NOT EXISTS upsell_generator_imported_cpfs (
    cpf VARCHAR(20) PRIMARY KEY,
    imported_at TIMESTAMP DEFAULT NOW(),
    imported_by VARCHAR(255)
  )
`).then(() => console.log('[Migration] upsell_generator_imported_cpfs OK'))
  .catch(e => console.error('[Migration] upsell_generator_imported_cpfs error:', e.message));

pool.query(`
  ALTER TABLE leads_upsell ADD COLUMN IF NOT EXISTS phone_2 VARCHAR(50);
  ALTER TABLE leads_upsell ADD COLUMN IF NOT EXISTS contract_number VARCHAR(50);
  ALTER TABLE leads_upsell ADD COLUMN IF NOT EXISTS contract_status VARCHAR(10);
  ALTER TABLE leads_upsell ADD COLUMN IF NOT EXISTS dependent_name VARCHAR(255);
  ALTER TABLE leads_upsell ADD COLUMN IF NOT EXISTS dependent_cpf VARCHAR(20);
  ALTER TABLE leads_upsell ADD COLUMN IF NOT EXISTS erp_id BIGINT;
  ALTER TABLE leads_upsell ADD COLUMN IF NOT EXISTS erp_city_id INTEGER;
  ALTER TABLE leads_upsell ADD COLUMN IF NOT EXISTS dependents JSONB DEFAULT '[]'::jsonb;
`).then(() => console.log('[Migration] leads_upsell ERP columns OK'))
  .catch(e => console.error('[Migration] leads_upsell ERP columns error:', e.message));

pool.query(`
  ALTER TABLE agents ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP;
  ALTER TABLE agents ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMP;
  ALTER TABLE agents ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMP;
  ALTER TABLE agents ADD COLUMN IF NOT EXISTS deactivation_reason VARCHAR(50);
  ALTER TABLE agents ALTER COLUMN last_activity_at SET DEFAULT NOW();
  UPDATE agents SET last_activity_at = NOW() WHERE last_activity_at IS NULL AND active = TRUE;
`).then(() => console.log('[Migration] agents activity tracking OK'))
  .catch(e => console.error('[Migration] agents activity tracking error:', e.message));

pool.query(`
  CREATE TABLE IF NOT EXISTS agent_inactivity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL,
    agent_name VARCHAR(255),
    agent_email VARCHAR(255),
    reason VARCHAR(100) NOT NULL DEFAULT 'inatividade',
    last_activity_at TIMESTAMP,
    last_login_at TIMESTAMP,
    deactivated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_agent_inactivity_log_agent ON agent_inactivity_log(agent_id);
  CREATE INDEX IF NOT EXISTS idx_agent_inactivity_log_created ON agent_inactivity_log(created_at DESC);
`).then(() => console.log('[Migration] agent_inactivity_log OK'))
  .catch(e => console.error('[Migration] agent_inactivity_log error:', e.message));

pool.query(`
  ALTER TABLE activities_upsell ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES agents(id);
`).then(() => console.log('[Migration] activities_upsell.created_by OK'))
  .catch(e => console.error('[Migration] activities_upsell.created_by error:', e.message));

pool.query(`
  CREATE TABLE IF NOT EXISTS lead_reassignment_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module VARCHAR(50) NOT NULL,
    lead_id UUID NOT NULL,
    from_agent_id UUID,
    to_agent_id UUID NOT NULL,
    reassigned_by UUID,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_reassignment_log_lead ON lead_reassignment_log(lead_id, module);
`).then(() => console.log('[Migration] lead_reassignment_log OK'))
  .catch(e => console.error('[Migration] lead_reassignment_log error:', e.message));

pool.query(`
  CREATE TABLE IF NOT EXISTS lead_pool_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_module VARCHAR(50) NOT NULL,
    from_lead_id UUID NOT NULL,
    to_module VARCHAR(50) NOT NULL,
    to_lead_id UUID,
    pulled_by UUID REFERENCES agents(id),
    pulled_at TIMESTAMPTZ DEFAULT NOW(),
    notes TEXT
  );
  ALTER TABLE leads ADD COLUMN IF NOT EXISTS transferred_out BOOLEAN DEFAULT FALSE;
  ALTER TABLE leads_pj ADD COLUMN IF NOT EXISTS transferred_out BOOLEAN DEFAULT FALSE;
  ALTER TABLE leads_upsell ADD COLUMN IF NOT EXISTS transferred_out BOOLEAN DEFAULT FALSE;
  ALTER TABLE referrals ADD COLUMN IF NOT EXISTS transferred_out BOOLEAN DEFAULT FALSE;
`).then(() => {
  console.log('[Migration] lead_pool OK');
  return pool.query(`
    INSERT INTO system_settings (setting_key, setting_value, setting_type)
    SELECT 'lead_pool_inactivity_days', '20', 'number'
    WHERE NOT EXISTS (SELECT 1 FROM system_settings WHERE setting_key = 'lead_pool_inactivity_days')
  `);
}).catch(e => console.error('[Migration] lead_pool error:', e.message));

pool.query(`
  CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    key_hash VARCHAR(128) NOT NULL UNIQUE,
    key_prefix VARCHAR(32) NOT NULL,
    scopes TEXT[] DEFAULT '{}',
    active BOOLEAN DEFAULT TRUE,
    created_by UUID,
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
`).then(() => console.log('[Migration] api_keys OK'))
  .catch(e => console.error('[Migration] api_keys error:', e.message));

// Log de auditoria de TODAS as chamadas de saída ao ERP (REST + banco direto).
// Gravação assíncrona best-effort pelo erpAuditService; retenção de 30 dias
// via cron de limpeza. NUNCA armazena token (endpoint já vem sanitizado).
pool.query(`
  CREATE TABLE IF NOT EXISTS erp_request_logs (
    id BIGSERIAL PRIMARY KEY,
    kind VARCHAR(10) NOT NULL,
    endpoint TEXT NOT NULL,
    method VARCHAR(10),
    origin VARCHAR(200) NOT NULL DEFAULT 'desconhecido',
    origin_user VARCHAR(200),
    status_code INTEGER,
    success BOOLEAN DEFAULT TRUE,
    duration_ms INTEGER,
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_erp_request_logs_created ON erp_request_logs(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_erp_request_logs_origin ON erp_request_logs(origin, created_at DESC);
`).then(() => console.log('[Migration] erp_request_logs OK'))
  .catch(e => console.error('[Migration] erp_request_logs error:', e.message));

// Histórico de envios/pulos dos relatórios de comissão (legado e Perspectivas).
// Grava cada tentativa de envio (manual ou automática) com o resultado:
// enviado, pulado (automático sem elegíveis), bloqueado (manual sem dados) ou erro.
pool.query(`
  CREATE TABLE IF NOT EXISTS commission_report_log (
    id SERIAL PRIMARY KEY,
    relatorio VARCHAR(32) NOT NULL,
    tipo_envio VARCHAR(16) NOT NULL,
    usuario_envio VARCHAR(255),
    status VARCHAR(16) NOT NULL,
    motivo TEXT,
    total_indicadores INTEGER,
    total_indicacoes INTEGER,
    valor_total NUMERIC,
    destinatarios TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_commission_report_log_created ON commission_report_log(created_at DESC);
`).then(() => console.log('[Migration] commission_report_log OK'))
  .catch(e => console.error('[Migration] commission_report_log error:', e.message));

// Rastreio de orçamentos criados pelo Bom Flow. O ERP atribui todos os orçamentos
// criados via API à conta compartilhada do token (acesso.api), perdendo o módulo e o
// agente real. Esta tabela guarda apenas o que NÃO muda (vínculo com o pedido do ERP,
// módulo e agente que criou); os dados dinâmicos (situação, valor, cliente) são lidos
// ao vivo do ERP no momento do relatório, usando erp_pedido_id como chave.
pool.query(`
  CREATE TABLE IF NOT EXISTS bomflow_orcamentos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    erp_pedido_id BIGINT NOT NULL UNIQUE,
    erp_numero BIGINT,
    modulo VARCHAR(32) NOT NULL,
    agent_id UUID,
    agent_name VARCHAR(255),
    cliente_nome VARCHAR(255),
    cliente_cpf VARCHAR(32),
    valor_criacao NUMERIC,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_bomflow_orcamentos_modulo ON bomflow_orcamentos(modulo);
  CREATE INDEX IF NOT EXISTS idx_bomflow_orcamentos_agent ON bomflow_orcamentos(agent_id);
`).then(() => console.log('[Migration] bomflow_orcamentos OK'))
  .catch(e => console.error('[Migration] bomflow_orcamentos error:', e.message));

// Documentos anexados a cada orçamento (Documento CPF/RG, comprovante de residência,
// taxa de adesão, cópia de contrato) + flag "Adesão Zero" por orçamento. Vínculo duplo:
// erp_pedido_id (orçamento) e lead_id/modulo (lead). Os ARQUIVOS ficam no disco do servidor
// (pasta ORCAMENTO_DOCS_DIR, fora da área pública); aqui no banco ficam só os metadados.
pool.query(`
  ALTER TABLE bomflow_orcamentos ADD COLUMN IF NOT EXISTS adesao_zero BOOLEAN;
  ALTER TABLE bomflow_orcamentos ADD COLUMN IF NOT EXISTS adesao_zero_updated_by UUID;
  ALTER TABLE bomflow_orcamentos ADD COLUMN IF NOT EXISTS adesao_zero_updated_at TIMESTAMPTZ;
  ALTER TABLE bomflow_orcamentos ADD COLUMN IF NOT EXISTS lead_id UUID;
  CREATE INDEX IF NOT EXISTS idx_bomflow_orcamentos_lead ON bomflow_orcamentos(lead_id);
  CREATE TABLE IF NOT EXISTS orcamento_documentos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    erp_pedido_id BIGINT NOT NULL,
    lead_id VARCHAR(64),
    modulo VARCHAR(32) NOT NULL,
    tipo VARCHAR(40) NOT NULL,
    stored_name VARCHAR(255) NOT NULL,
    original_name VARCHAR(255),
    mime_type VARCHAR(128),
    size_bytes BIGINT,
    uploaded_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_orcamento_documentos_pedido ON orcamento_documentos(erp_pedido_id);
  CREATE INDEX IF NOT EXISTS idx_orcamento_documentos_lead ON orcamento_documentos(lead_id);
  CREATE UNIQUE INDEX IF NOT EXISTS uq_orcamento_documentos_pedido_tipo ON orcamento_documentos(erp_pedido_id, tipo);
`).then(() => console.log('[Migration] orcamento_documentos OK'))
  .catch(e => console.error('[Migration] orcamento_documentos error:', e.message));

// Pedidos de ajuste da Fila Pré Vendas. O auditor descreve o que falta no orçamento;
// o vendedor que cadastrou (vendedor_id) é notificado e acompanha pelo painel próprio.
// status: 'pendente' (aguardando o vendedor) -> 'ajustado' (vendedor corrigiu e devolveu
// para a fila do mesmo auditor que solicitou).
pool.query(`
  CREATE TABLE IF NOT EXISTS presales_ajustes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    erp_pedido_id BIGINT NOT NULL,
    erp_numero BIGINT,
    modulo VARCHAR(32),
    vendedor_id UUID,
    vendedor_nome VARCHAR(255),
    cliente_nome VARCHAR(255),
    cliente_cpf VARCHAR(32),
    texto TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pendente',
    auditor_id UUID,
    auditor_nome VARCHAR(255),
    auditor_email VARCHAR(255),
    vendedor_comentario TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    ajustado_at TIMESTAMPTZ
  );
  CREATE INDEX IF NOT EXISTS idx_presales_ajustes_vendedor ON presales_ajustes(vendedor_id);
  CREATE INDEX IF NOT EXISTS idx_presales_ajustes_pedido ON presales_ajustes(erp_pedido_id);
  CREATE INDEX IF NOT EXISTS idx_presales_ajustes_status ON presales_ajustes(status);
  -- Auto-cancelamento por prazo (3 dias úteis sem ajuste). status passa a 'cancelado_auto'.
  -- cancelado_at: quando o cancelamento (ou a simulação, em dry-run) ocorreu.
  -- cancelamento_info: observação de auditoria (modo, motivo, situação ERP, etc.).
  ALTER TABLE presales_ajustes ADD COLUMN IF NOT EXISTS cancelado_at TIMESTAMPTZ;
  ALTER TABLE presales_ajustes ADD COLUMN IF NOT EXISTS cancelamento_info TEXT;
  -- Aviso antecipado de prazo: marcador de dedup p/ o aviso enviado ao vendedor antes do
  -- vencimento (ex.: faltando 1 dia útil). Preenchido uma única vez quando o aviso é disparado.
  ALTER TABLE presales_ajustes ADD COLUMN IF NOT EXISTS aviso_prazo_info TEXT;
`).then(() => console.log('[Migration] presales_ajustes OK'))
  .catch(e => console.error('[Migration] presales_ajustes error:', e.message));

// Histórico de execuções dos jobs de ajuste (aviso antecipado de prazo e auto-cancelamento),
// tanto pelo cron quanto pelo disparo manual. Cada ciclo grava uma linha com os contadores
// retornados pelo job, para auditoria/visibilidade operacional ao longo do tempo.
// tipo: 'aviso' (runPresalesAjusteAvisoPrazo) | 'cancel' (runPresalesAjusteAutoCancel).
pool.query(`
  CREATE TABLE IF NOT EXISTS presales_ajustes_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    executed_at TIMESTAMPTZ DEFAULT NOW(),
    tipo VARCHAR(16) NOT NULL,
    dry_run BOOLEAN,
    checked INTEGER DEFAULT 0,
    overdue INTEGER DEFAULT 0,
    warned INTEGER DEFAULT 0,
    cancelled INTEGER DEFAULT 0,
    simulated INTEGER DEFAULT 0,
    skipped INTEGER DEFAULT 0,
    errors INTEGER DEFAULT 0,
    aborted BOOLEAN DEFAULT FALSE,
    abort_reason VARCHAR(64)
  );
  CREATE INDEX IF NOT EXISTS idx_presales_ajustes_runs_executed ON presales_ajustes_runs(executed_at DESC);
  CREATE INDEX IF NOT EXISTS idx_presales_ajustes_runs_tipo ON presales_ajustes_runs(tipo);
`).then(() => console.log('[Migration] presales_ajustes_runs OK'))
  .catch(e => console.error('[Migration] presales_ajustes_runs error:', e.message));

// Trava de auditoria da Fila Pré Vendas: garante que cada orçamento (erp_pedido_id) só
// seja auditado por 1 auditor por vez. O auditor "assume" manualmente (status
// 'em_auditoria'); os demais veem o orçamento somente para leitura, com a indicação de
// quem está auditando. A trava só é liberada quando o auditor conclui (clica em "Aprovar"),
// passando para status 'concluida'. Não há liberação por tempo nem ao fechar a tela.
pool.query(`
  CREATE TABLE IF NOT EXISTS presales_auditorias (
    erp_pedido_id BIGINT PRIMARY KEY,
    auditor_id UUID NOT NULL,
    auditor_nome VARCHAR(255),
    auditor_email VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'em_auditoria',
    resultado VARCHAR(20),
    assumido_at TIMESTAMPTZ DEFAULT NOW(),
    concluida_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_presales_auditorias_status ON presales_auditorias(status);
  CREATE INDEX IF NOT EXISTS idx_presales_auditorias_auditor ON presales_auditorias(auditor_id);
`).then(() => console.log('[Migration] presales_auditorias OK'))
  .catch(e => console.error('[Migration] presales_auditorias error:', e.message));

// Pós-Vendas: acompanha cada orçamento aprovado no Pré-venda pelos estados do fluxograma
// (fila → em_verificacao → devolvida → resolvida → congelada → aguardando_cancelamento →
// concluida/cancelada). Trava de 1 auditor por orçamento (auditor_* + status em_verificacao),
// prazo de devolução em dias úteis (prazo_ymd) e decisão final de cancelamento no ERP.
pool.query(`
  CREATE TABLE IF NOT EXISTS postsales_verificacoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    erp_pedido_id BIGINT NOT NULL UNIQUE,
    erp_numero VARCHAR(50),
    modulo VARCHAR(30),
    vendedor_id UUID,
    vendedor_nome VARCHAR(255),
    cliente_nome VARCHAR(255),
    cliente_cpf VARCHAR(20),
    status VARCHAR(30) NOT NULL DEFAULT 'fila',
    auditor_id UUID,
    auditor_nome VARCHAR(255),
    auditor_email VARCHAR(255),
    assumido_at TIMESTAMPTZ,
    motivo_devolucao VARCHAR(40),
    devolucao_obs TEXT,
    devolvida_at TIMESTAMPTZ,
    prazo_ymd VARCHAR(10),
    resolvida_at TIMESTAMPTZ,
    resolvida_por_id UUID,
    resolvida_por_nome VARCHAR(255),
    resolucao_obs TEXT,
    congelada_at TIMESTAMPTZ,
    congelamento_motivo TEXT,
    prevenda_decisao VARCHAR(20),
    prevenda_decisao_at TIMESTAMPTZ,
    prevenda_decisao_por VARCHAR(255),
    concluida_at TIMESTAMPTZ,
    cancelada_at TIMESTAMPTZ,
    cancelada_por_id UUID,
    cancelada_por_nome VARCHAR(255),
    cancelamento_motivo TEXT,
    cancelamento_info TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_postsales_verif_status ON postsales_verificacoes(status);
  CREATE INDEX IF NOT EXISTS idx_postsales_verif_vendedor ON postsales_verificacoes(vendedor_id);
  CREATE TABLE IF NOT EXISTS postsales_eventos (
    id BIGSERIAL PRIMARY KEY,
    verificacao_id UUID NOT NULL,
    erp_pedido_id BIGINT,
    tipo VARCHAR(40) NOT NULL,
    detalhe TEXT,
    actor_id UUID,
    actor_nome VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_postsales_eventos_verif ON postsales_eventos(verificacao_id);
`).then(() => console.log('[Migration] postsales_verificacoes/eventos OK'))
  .catch(e => console.error('[Migration] postsales error:', e.message));

// Chat WhatsApp v2 (Atendimento): fundação nova. Conexões de canal com token CRIPTOGRAFADO
// (AES-256-GCM, utils/encryption.js) e webhook_secret por conexão; conversas e mensagens
// próprias do atendimento (att_*). phone_key = últimos 8 dígitos (reconcilia números
// com/sem o nono dígito). Dedup de mensagem por external_message_id.
// As tabelas antigas (whatsapp_conversations/messages/webhook_events) são removidas.
pool.query(`
  DROP TABLE IF EXISTS whatsapp_messages;
  DROP TABLE IF EXISTS whatsapp_conversations;
  DROP TABLE IF EXISTS whatsapp_webhook_events;
  CREATE TABLE IF NOT EXISTS channel_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel VARCHAR(30) NOT NULL DEFAULT 'whatsapp',
    name VARCHAR(255) NOT NULL,
    token TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    webhook_secret VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS att_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID NOT NULL REFERENCES channel_connections(id) ON DELETE CASCADE,
    phone VARCHAR(30) NOT NULL,
    phone_key VARCHAR(20) NOT NULL,
    contact_name VARCHAR(255),
    assigned_user_id UUID,
    status VARCHAR(20) NOT NULL DEFAULT 'pendente',
    last_message_at TIMESTAMPTZ,
    unread_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE UNIQUE INDEX IF NOT EXISTS uq_att_conversations_conn_phone
    ON att_conversations(connection_id, phone_key);
  CREATE INDEX IF NOT EXISTS idx_att_conversations_assigned ON att_conversations(assigned_user_id);
  CREATE INDEX IF NOT EXISTS idx_att_conversations_last_at ON att_conversations(last_message_at DESC);
  CREATE TABLE IF NOT EXISTS att_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES att_conversations(id) ON DELETE CASCADE,
    direction VARCHAR(4) NOT NULL,
    content TEXT,
    type VARCHAR(20) NOT NULL DEFAULT 'text',
    user_id UUID,
    external_message_id VARCHAR(64),
    status VARCHAR(20),
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_att_messages_conv ON att_messages(conversation_id, sent_at);
  CREATE UNIQUE INDEX IF NOT EXISTS uq_att_messages_external
    ON att_messages(external_message_id) WHERE external_message_id IS NOT NULL;
`).then(() => console.log('[Migration] attendance_chat_v2 OK'))
  .catch(e => console.error('[Migration] attendance_chat_v2 error:', e.message));

function snakeToCamel(str) {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function convertKeysToCamel(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(convertKeysToCamel);
  if (obj instanceof Date) return obj.toISOString();
  
  return Object.keys(obj).reduce((acc, key) => {
    const camelKey = snakeToCamel(key);
    acc[camelKey] = convertKeysToCamel(obj[key]);
    return acc;
  }, {});
}

function camelToSnake(str) {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

function convertKeysToSnake(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(convertKeysToSnake);
  
  return Object.keys(obj).reduce((acc, key) => {
    const snakeKey = camelToSnake(key);
    acc[snakeKey] = convertKeysToSnake(obj[key]);
    return acc;
  }, {});
}

const entities = {
  teams: { searchFields: ['name'] },
  'agent-types': { tableName: 'agent_types', searchFields: ['key', 'label'], allowedFilters: ['active'] },
  // sales-agents removido - agora usa agents diretamente (tabelas unificadas)
  queues: { searchFields: ['name'], allowedFilters: ['active', 'team_id'] },
  territories: { searchFields: ['name'] },
  accounts: { searchFields: ['name', 'cnpj'] },
  contacts: { searchFields: ['name', 'email', 'document'], allowedFilters: ['account_id'] },
  contracts: { searchFields: ['contract_number'], allowedFilters: ['contact_id', 'account_id', 'status'] },
  dependents: { searchFields: ['name'], allowedFilters: ['contract_id'] },
  'ticket-types': { tableName: 'ticket_types', searchFields: ['name'], allowedFilters: ['active', 'category'] },
  'sla-policies': { tableName: 'sla_policies', searchFields: ['name'] },
  tickets: { searchFields: ['subject'], allowedFilters: ['status', 'priority', 'agent_id', 'queue_id', 'contact_id'] },
  'ticket-messages': { tableName: 'ticket_messages', searchFields: ['body'], allowedFilters: ['ticket_id'] },
  macros: { searchFields: ['name'] },
  templates: { searchFields: ['name', 'category'], allowedFilters: ['category', 'active'] },
  'csat-surveys': { tableName: 'csat_surveys', allowedFilters: ['ticket_id'] },
  'kb-categories': { tableName: 'kb_categories', searchFields: ['name'] },
  'kb-articles': { tableName: 'kb_articles', searchFields: ['title', 'content'], allowedFilters: ['category_id', 'status'] },
  'kb-article-versions': { tableName: 'kb_article_versions', allowedFilters: ['article_id'] },
  'kb-feedback': { tableName: 'kb_feedback', allowedFilters: ['article_id'] },
    'sales-goals': { tableName: 'sales_goals', allowedFilters: ['agent_id', 'year', 'month'] },
  'lead-automations': { tableName: 'lead_automations', searchFields: ['name'] },
    'activities-pj': { tableName: 'activities_pj', allowedFilters: ['lead_id', 'type'] },
  'lead-pj-automations': { tableName: 'lead_pj_automations', searchFields: ['name'] },
  'activities-upsell': { tableName: 'activities_upsell', allowedFilters: ['lead_id', 'type', 'completed', 'created_by'] },
  'visits-upsell': { tableName: 'visits_upsell', allowedFilters: ['lead_id', 'agent_id', 'status'] },
  'sales-goals-upsell': { tableName: 'sales_goals_upsell', allowedFilters: ['agent_id', 'year', 'month'] },
  'lead-history-upsell': { tableName: 'lead_history_upsell', allowedFilters: ['lead_id'] },
  'lead-upsell-automations': { tableName: 'lead_upsell_automations', searchFields: ['name'], allowedFilters: ['active', 'trigger_type'] },
  'referral-automations': { tableName: 'referral_automations', searchFields: ['name'] },
  'referral-channel-automations': { tableName: 'referral_channel_automations', searchFields: ['name'], allowedFilters: ['channel_token', 'active'] },
  'referral-channel-config': { tableName: 'referral_channel_config', searchFields: ['channel_label'] },
  'upsell-channel-automations': { tableName: 'upsell_channel_automations', searchFields: ['name'], allowedFilters: ['channel_token', 'active'] },
  'upsell-channel-config': { tableName: 'upsell_channel_config', searchFields: ['channel_label'] },
  'automation-logs': { tableName: 'automation_logs', allowedFilters: ['automation_id', 'automation_type', 'lead_id', 'referral_id'] },
  'proposal-templates': { tableName: 'proposal_templates', searchFields: ['name'] },
  sales: { allowedFilters: ['lead_id', 'agent_id', 'status'] },
    'referral-activities': { tableName: 'referral_activities', allowedFilters: ['referral_id'] },
  'quick-services': { tableName: 'quick_services', searchFields: ['contact_name'], allowedFilters: ['agent_id', 'service_type'] },
  'distribution-rules': { tableName: 'distribution_rules', searchFields: ['name'] },
  'portal-sessions': { tableName: 'portal_sessions', allowedFilters: ['contact_id'] },
  'system-settings': { tableName: 'system_settings', searchFields: ['setting_key'] },
  notifications: { allowedFilters: ['user_email', 'read', 'type'] },
  'notification-preferences': { tableName: 'notification_preferences', allowedFilters: ['user_email'] },
  'quality-checklists': { tableName: 'quality_checklists', searchFields: ['name'] },
  'call-audits': { tableName: 'call_audits', allowedFilters: ['agent_id', 'ticket_id', 'status'] },
};

async function syncAutomationTeams(automationId, teamIds, junctionTable = 'lead_automation_teams') {
  await query(`DELETE FROM ${junctionTable} WHERE automation_id = $1`, [automationId]);
  if (teamIds && teamIds.length > 0) {
    const valuePlaceholders = teamIds.map((_, i) => `(gen_random_uuid(), $1, $${i + 2}, now())`).join(', ');
    await query(
      `INSERT INTO ${junctionTable} (id, automation_id, team_id, created_at) VALUES ${valuePlaceholders} ON CONFLICT (automation_id, team_id) DO NOTHING`,
      [automationId, ...teamIds]
    );
  }
}

async function enrichAutomationsWithTeams(automations, junctionTable = 'lead_automation_teams') {
  if (!automations || automations.length === 0) return automations;
  const ids = automations.map(a => a.id);
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
  const teamsResult = await query(
    `SELECT automation_id, team_id FROM ${junctionTable} WHERE automation_id IN (${placeholders})`,
    ids
  );
  const teamMap = {};
  for (const row of teamsResult.rows) {
    if (!teamMap[row.automation_id]) teamMap[row.automation_id] = [];
    teamMap[row.automation_id].push(row.team_id);
  }
  return automations.map(a => {
    const fromJunction = teamMap[a.id] || [];
    if (fromJunction.length > 0) {
      return { ...a, team_ids: fromJunction };
    } else if (a.teamId) {
      return { ...a, team_ids: [a.teamId] };
    }
    return { ...a, team_ids: [] };
  });
}

for (const [route, options] of Object.entries(entities)) {
  const tableName = options.tableName || route.replace(/-/g, '_');
  const crud = createCrudRouter(tableName, options);
  
  if (route === 'lead-automations') {
    router.get(`/${route}`, authMiddleware, async (req, res) => {
      try {
        const originalJson = res.json.bind(res);
        await crud.list(req, {
          ...res,
          json: async (data) => {
            const enriched = await enrichAutomationsWithTeams(data);
            const result = enriched.map(a => ({ ...a, teamIds: a.team_ids }));
            result.forEach(r => delete r.team_ids);
            originalJson(result);
          }
        });
      } catch (error) {
        console.error('Error listing lead-automations with teams:', error);
        res.status(500).json({ message: error.message });
      }
    });

    router.get(`/${route}/:id`, authMiddleware, async (req, res) => {
      try {
        const originalJson = res.json.bind(res);
        await crud.get(req, {
          ...res,
          json: async (data) => {
            const enriched = await enrichAutomationsWithTeams([data]);
            const result = { ...enriched[0], teamIds: enriched[0].team_ids };
            delete result.team_ids;
            originalJson(result);
          }
        });
      } catch (error) {
        console.error('Error getting lead-automation with teams:', error);
        res.status(500).json({ message: error.message });
      }
    });

    router.post(`/${route}`, authMiddleware, async (req, res) => {
      try {
        const teamIds = req.body.team_ids || req.body.teamIds || [];
        delete req.body.team_ids;
        delete req.body.teamIds;
        const originalStatus = res.status.bind(res);
        await crud.create(req, {
          ...res,
          status: (code) => {
            const statusRes = originalStatus(code);
            const origStatusJson = statusRes.json.bind(statusRes);
            return {
              ...statusRes,
              json: async (data) => {
                try {
                  if (data && data.id && teamIds.length > 0) {
                    await syncAutomationTeams(data.id, teamIds);
                    data.teamIds = teamIds;
                  }
                } catch (err) {
                  console.error('Error syncing teams on create:', err);
                }
                origStatusJson(data);
              }
            };
          }
        });
      } catch (error) {
        console.error('Error creating lead-automation with teams:', error);
        res.status(500).json({ message: error.message });
      }
    });

    router.put(`/${route}/:id`, authMiddleware, async (req, res) => {
      try {
        const hasTeamIds = 'team_ids' in req.body || 'teamIds' in req.body;
        const teamIds = hasTeamIds ? (req.body.team_ids || req.body.teamIds || []) : null;
        delete req.body.team_ids;
        delete req.body.teamIds;
        delete req.body.team_id;
        delete req.body.teamId;
        const originalJson = res.json.bind(res);
        await crud.update(req, {
          ...res,
          json: async (data) => {
            try {
              if (hasTeamIds) {
                await syncAutomationTeams(req.params.id, teamIds);
                data.teamIds = teamIds;
              }
            } catch (err) {
              console.error('Error syncing teams on update:', err);
            }
            originalJson(data);
          }
        });
      } catch (error) {
        console.error('Error updating lead-automation with teams:', error);
        res.status(500).json({ message: error.message });
      }
    });

    router.delete(`/${route}/:id`, authMiddleware, crud.delete);
    router.post(`/${route}/filter`, authMiddleware, crud.filter);
    continue;
  }

  if (route === 'lead-pj-automations') {
    router.get(`/${route}`, authMiddleware, async (req, res) => {
      try {
        const originalJson = res.json.bind(res);
        await crud.list(req, {
          ...res,
          json: async (data) => {
            const enriched = await enrichAutomationsWithTeams(data, 'lead_pj_automation_teams');
            const result = enriched.map(a => ({ ...a, teamIds: a.team_ids }));
            result.forEach(r => delete r.team_ids);
            originalJson(result);
          }
        });
      } catch (error) {
        console.error('Error listing lead-pj-automations with teams:', error);
        res.status(500).json({ message: error.message });
      }
    });

    router.get(`/${route}/:id`, authMiddleware, async (req, res) => {
      try {
        const originalJson = res.json.bind(res);
        await crud.get(req, {
          ...res,
          json: async (data) => {
            const enriched = await enrichAutomationsWithTeams([data], 'lead_pj_automation_teams');
            const result = { ...enriched[0], teamIds: enriched[0].team_ids };
            delete result.team_ids;
            originalJson(result);
          }
        });
      } catch (error) {
        console.error('Error getting lead-pj-automation with teams:', error);
        res.status(500).json({ message: error.message });
      }
    });

    router.post(`/${route}`, authMiddleware, async (req, res) => {
      try {
        const teamIds = req.body.team_ids || req.body.teamIds || [];
        delete req.body.team_ids;
        delete req.body.teamIds;
        const originalStatus = res.status.bind(res);
        await crud.create(req, {
          ...res,
          status: (code) => {
            const statusRes = originalStatus(code);
            const origStatusJson = statusRes.json.bind(statusRes);
            return {
              ...statusRes,
              json: async (data) => {
                try {
                  if (data && data.id && teamIds.length > 0) {
                    await syncAutomationTeams(data.id, teamIds, 'lead_pj_automation_teams');
                    data.teamIds = teamIds;
                  }
                } catch (err) {
                  console.error('Error syncing PJ teams on create:', err);
                }
                origStatusJson(data);
              }
            };
          }
        });
      } catch (error) {
        console.error('Error creating lead-pj-automation with teams:', error);
        res.status(500).json({ message: error.message });
      }
    });

    router.put(`/${route}/:id`, authMiddleware, async (req, res) => {
      try {
        const hasTeamIds = 'team_ids' in req.body || 'teamIds' in req.body;
        const teamIds = hasTeamIds ? (req.body.team_ids || req.body.teamIds || []) : null;
        delete req.body.team_ids;
        delete req.body.teamIds;
        delete req.body.team_id;
        delete req.body.teamId;
        const originalJson = res.json.bind(res);
        await crud.update(req, {
          ...res,
          json: async (data) => {
            try {
              if (hasTeamIds) {
                await syncAutomationTeams(req.params.id, teamIds, 'lead_pj_automation_teams');
                data.teamIds = teamIds;
              }
            } catch (err) {
              console.error('Error syncing PJ teams on update:', err);
            }
            originalJson(data);
          }
        });
      } catch (error) {
        console.error('Error updating lead-pj-automation with teams:', error);
        res.status(500).json({ message: error.message });
      }
    });

    router.delete(`/${route}/:id`, authMiddleware, crud.delete);
    router.post(`/${route}/filter`, authMiddleware, crud.filter);
    continue;
  }

  if (route === 'lead-upsell-automations') {
    router.get(`/${route}`, authMiddleware, async (req, res) => {
      try {
        await crud.list(req, {
          ...res,
          json: async (data) => {
            const enriched = await enrichAutomationsWithTeams(data, 'lead_upsell_automation_teams');
            const result = enriched.map(a => ({ ...a, teamIds: a.team_ids }));
            result.forEach(r => delete r.team_ids);
            res.json.bind(res)(result);
          }
        });
      } catch (error) {
        console.error('Error listing lead-upsell-automations with teams:', error);
        res.status(500).json({ message: error.message });
      }
    });

    router.get(`/${route}/:id`, authMiddleware, async (req, res) => {
      try {
        await crud.get(req, {
          ...res,
          json: async (data) => {
            const enriched = await enrichAutomationsWithTeams([data], 'lead_upsell_automation_teams');
            const result = { ...enriched[0], teamIds: enriched[0].team_ids };
            delete result.team_ids;
            res.json.bind(res)(result);
          }
        });
      } catch (error) {
        console.error('Error getting lead-upsell-automation with teams:', error);
        res.status(500).json({ message: error.message });
      }
    });

    router.post(`/${route}`, authMiddleware, async (req, res) => {
      try {
        const teamIds = req.body.team_ids || req.body.teamIds || [];
        delete req.body.team_ids;
        delete req.body.teamIds;
        const originalStatus = res.status.bind(res);
        await crud.create(req, {
          ...res,
          status: (code) => {
            const statusRes = originalStatus(code);
            const origStatusJson = statusRes.json.bind(statusRes);
            return {
              ...statusRes,
              json: async (data) => {
                try {
                  if (data && data.id && teamIds.length > 0) {
                    await syncAutomationTeams(data.id, teamIds, 'lead_upsell_automation_teams');
                    data.teamIds = teamIds;
                  }
                } catch (err) {
                  console.error('Error syncing Upsell teams on create:', err);
                }
                origStatusJson(data);
              }
            };
          }
        });
      } catch (error) {
        console.error('Error creating lead-upsell-automation with teams:', error);
        res.status(500).json({ message: error.message });
      }
    });

    router.put(`/${route}/:id`, authMiddleware, async (req, res) => {
      try {
        const hasTeamIds = 'team_ids' in req.body || 'teamIds' in req.body;
        const teamIds = hasTeamIds ? (req.body.team_ids || req.body.teamIds || []) : null;
        delete req.body.team_ids;
        delete req.body.teamIds;
        delete req.body.team_id;
        delete req.body.teamId;
        const originalJson = res.json.bind(res);
        await crud.update(req, {
          ...res,
          json: async (data) => {
            try {
              if (hasTeamIds) {
                await syncAutomationTeams(req.params.id, teamIds, 'lead_upsell_automation_teams');
                data.teamIds = teamIds;
              }
            } catch (err) {
              console.error('Error syncing Upsell teams on update:', err);
            }
            originalJson(data);
          }
        });
      } catch (error) {
        console.error('Error updating lead-upsell-automation with teams:', error);
        res.status(500).json({ message: error.message });
      }
    });

    router.delete(`/${route}/:id`, authMiddleware, crud.delete);
    router.post(`/${route}/filter`, authMiddleware, crud.filter);
    continue;
  }

  router.get(`/${route}`, authMiddleware, crud.list);
  router.get(`/${route}/:id`, authMiddleware, crud.get);
  router.post(`/${route}`, authMiddleware, crud.create);
  if (route === 'referral-channel-config' || route === 'upsell-channel-config') {
    router.put(`/${route}/:id`, authMiddleware, (req, res) => {
      if (req.body.channel_token === null || req.body.channel_token === undefined || req.body.channel_token === '' ||
          req.body.channelToken === null || req.body.channelToken === undefined || req.body.channelToken === '') {
        delete req.body.channel_token;
        delete req.body.channelToken;
      }
      return crud.update(req, res);
    });
  } else if (route === 'teams') {
    router.put(`/${route}/:id`, authMiddleware, async (req, res) => {
      try {
        const { id } = req.params;
        const body = req.body;
        const supervisorEmails = body.supervisorEmails || body.supervisor_emails || null;
        const name = body.name;
        const description = body.description || null;
        const active = body.active !== undefined ? body.active : true;
        const result = await query(
          `UPDATE teams SET name = $1, description = $2, active = $3, supervisor_emails = $4::text[], updated_at = NOW() WHERE id = $5 RETURNING *`,
          [name, description, active, supervisorEmails, id]
        );
        if (result.rows.length === 0) return res.status(404).json({ message: 'Not found' });
        res.json(convertKeysToCamel(result.rows[0]));
      } catch (error) {
        console.error('Error updating team:', error);
        res.status(500).json({ message: error.message });
      }
    });
  } else {
    router.put(`/${route}/:id`, authMiddleware, crud.update);
  }
  router.delete(`/${route}/:id`, authMiddleware, crud.delete);
  router.post(`/${route}/filter`, authMiddleware, crud.filter);
}

router.get('/agents', authMiddleware, async (req, res) => {
  try {
    const result = await query(`
      SELECT id, name, cpf, email, agent_type, team_id, supervisor_id, skills, active, 
             photo_url, permissions, level, online, capacity, working_hours, 
             queue_ids, work_unit, role, must_reset_password, erp_agent_id,
             whatsapp_access_token, whatsapp_token_expires_at,
             canal_venda, canal_venda_id, canal_venda_grupo_id, erp_agente_venda_id,
             last_login_at, last_activity_at, deactivated_at, deactivation_reason,
             created_at, updated_at
      FROM agents 
      ORDER BY created_at DESC 
      LIMIT 10000
    `);
    res.json(result.rows.map(row => {
      delete row.whatsapp_channel_token;
      return convertKeysToCamel(row);
    }));
  } catch (error) {
    console.error('Error listing agents:', error);
    res.status(500).json({ message: error.message });
  }
});

// Histórico de inativações automáticas — somente admin/gestor
router.get('/agents/inactivity-log', authMiddleware, requireAgentManager, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 200, 500);
    const offset = parseInt(req.query.offset) || 0;
    const result = await query(
      `SELECT l.id, l.agent_id, l.agent_name, l.agent_email, l.reason,
              l.last_activity_at, l.last_login_at, l.deactivated_at, l.created_at,
              a.name AS current_name, a.active AS currently_active
         FROM agent_inactivity_log l
         LEFT JOIN agents a ON a.id = l.agent_id
        ORDER BY l.created_at DESC
        LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    const total = await query('SELECT COUNT(*) FROM agent_inactivity_log');
    res.json({
      rows: result.rows.map(convertKeysToCamel),
      total: parseInt(total.rows[0].count),
    });
  } catch (error) {
    console.error('Error fetching inactivity log:', error);
    res.status(500).json({ message: error.message });
  }
});

router.get('/agents/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query(`
      SELECT id, name, cpf, email, agent_type, team_id, supervisor_id, skills, active, 
             photo_url, permissions, level, online, capacity, working_hours, 
             queue_ids, work_unit, role, must_reset_password, erp_agent_id,
             whatsapp_access_token, whatsapp_token_expires_at,
             whatsapp_channel_token,
             canal_venda, canal_venda_id, canal_venda_grupo_id, erp_agente_venda_id,
             last_login_at, last_activity_at, deactivated_at, deactivation_reason,
             created_at, updated_at
      FROM agents WHERE id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Agent not found' });
    }
    
    const agent = result.rows[0];
    const isAdminOrSupervisor = ['admin', 'supervisor'].includes(req.user.role);
    const isSelf = req.user.id === id;
    if (!isAdminOrSupervisor && !isSelf) {
      delete agent.whatsapp_channel_token;
    }

    res.json(convertKeysToCamel(agent));
  } catch (error) {
    console.error('Error getting agent:', error);
    res.status(500).json({ message: error.message });
  }
});

// Autorização de gestão de agentes: verificada SEMPRE no banco (nunca no payload
// ou apenas no token), para impedir auto-promoção e escalada de privilégio.
export async function requesterCanManageAgents(req) {
  const result = await query('SELECT agent_type, permissions, active FROM agents WHERE id = $1', [req.user.id]);
  if (result.rows.length === 0) return false;
  const row = result.rows[0];
  if (row.active === false) return false;
  return row.agent_type === 'admin' || row.permissions?.can_manage_agents === true;
}

function requireAgentManager(req, res, next) {
  requesterCanManageAgents(req)
    .then((ok) => {
      if (!ok) return res.status(403).json({ message: 'Apenas administradores/gestores podem gerenciar agentes.' });
      next();
    })
    .catch((err) => {
      console.error('Error checking agent management permission:', err);
      res.status(503).json({ message: 'Não foi possível verificar permissões. Tente novamente.' });
    });
}

// Campos que um agente comum pode alterar no próprio cadastro (sem privilégios).
const SELF_EDITABLE_AGENT_FIELDS = new Set([
  'name', 'photo_url', 'online', 'working_hours',
  'password_hash', 'password_updated_at', 'must_reset_password',
  'whatsapp_access_token', 'whatsapp_token_expires_at',
]);

function hasManagedErpAgentField(body = {}) {
  return [
    'erpAgentId',
    'erp_agent_id',
    'erpAgenteVendaId',
    'erp_agente_venda_id',
  ].some((key) => Object.prototype.hasOwnProperty.call(body, key));
}

function rejectManagedErpAgentFields(req, res) {
  if (!hasManagedErpAgentField(req.body)) return false;
  res.status(400).json({
    message: 'Os IDs de Usuário ERP e de vínculo do canal são gerenciados pela sincronização por CPF e não podem ser informados manualmente.',
  });
  return true;
}

router.post('/agents', authMiddleware, requireAgentManager, async (req, res) => {
  try {
    if (rejectManagedErpAgentFields(req, res)) return;
    const data = convertKeysToSnake(req.body);
    
    if (!data.email) {
      return res.status(400).json({ message: 'Email is required' });
    }
    
    if (!data.password || data.password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }
    
    const existing = await query('SELECT id FROM agents WHERE email = $1', [data.email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ message: 'Email already registered' });
    }
    
    let password_hash = null;
    if (data.password) {
      password_hash = await bcrypt.hash(data.password, 10);
      delete data.password;
    }
    
    const keys = Object.keys(data).filter(k => k !== 'password');
    const values = keys.map(k => data[k]);
    
    if (password_hash) {
      keys.push('password_hash');
      values.push(password_hash);
    }
    
    if (!keys.includes('role')) {
      keys.push('role');
      values.push('agent');
    }
    
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    const sql = `INSERT INTO agents (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`;
    
    const result = await query(sql, values);
    const agent = result.rows[0];
    delete agent.password_hash;

    res.status(201).json(convertKeysToCamel(agent));
  } catch (error) {
    console.error('Error creating agent:', error);
    res.status(500).json({ message: error.message });
  }
});

router.put('/agents/:id', authMiddleware, async (req, res) => {
  try {
    if (rejectManagedErpAgentFields(req, res)) return;
    const { id } = req.params;
    const data = convertKeysToSnake(req.body);
    
    // Convert empty strings to null for UUID fields
    const uuidFields = ['team_id', 'supervisor_id'];
    for (const field of uuidFields) {
      if (data[field] === '' || data[field] === undefined) {
        data[field] = null;
      }
    }
    
    if (data.email) {
      const existing = await query('SELECT id FROM agents WHERE email = $1 AND id != $2', [data.email, id]);
      if (existing.rows.length > 0) {
        return res.status(400).json({ message: 'Email already in use by another agent' });
      }
    }
    
    if (data.password) {
      if (data.password.length < 6) {
        return res.status(400).json({ message: 'Password must be at least 6 characters' });
      }
      data.password_hash = await bcrypt.hash(data.password, 10);
      data.password_updated_at = new Date();
      data.must_reset_password = false;
      delete data.password;
    }
    
    // Campos de inativação são controlados exclusivamente pelo servidor.
    delete data.deactivated_at;
    delete data.deactivation_reason;
    delete data.last_activity_at;
    delete data.last_login_at;
    
    // Autorização (sempre pelo banco): gestores editam qualquer agente; um agente
    // comum só edita o PRÓPRIO cadastro e apenas campos sem privilégio (nunca
    // agent_type, role, permissions, active, team, e-mail etc.).
    const canManage = await requesterCanManageAgents(req);
    if (!canManage) {
      if (id !== req.user.id) {
        return res.status(403).json({ message: 'Apenas administradores/gestores podem editar outros agentes.' });
      }
      for (const key of Object.keys(data)) {
        if (!SELF_EDITABLE_AGENT_FIELDS.has(key)) {
          delete data[key];
        }
      }
      if (Object.keys(data).length === 0) {
        return res.status(403).json({ message: 'Campos não permitidos para edição do próprio cadastro.' });
      }
    }
    
    // Mudança de status (ativar/inativar) — só chega aqui com canManage.
    if (data.active !== undefined) {
      const nextActive = data.active === true || data.active === 'true';
      const current = await query('SELECT active FROM agents WHERE id = $1', [id]);
      if (current.rows.length === 0) {
        return res.status(404).json({ message: 'Agent not found' });
      }
      const currentActive = current.rows[0].active !== false;
      if (nextActive !== currentActive && nextActive) {
        // Reativação: limpa dados de inativação e reinicia o relógio de atividade.
        data.deactivated_at = null;
        data.deactivation_reason = null;
        data.last_activity_at = new Date();
      }
      data.active = nextActive;
    }
    
    const keys = Object.keys(data);
    const values = keys.map(k => data[k]);
    
    if (keys.length === 0) {
      return res.status(400).json({ message: 'No data provided' });
    }
    
    const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');
    values.push(id);
    const sql = `UPDATE agents SET ${setClause}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`;
    
    const result = await query(sql, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Agent not found' });
    }
    
    const agent = result.rows[0];
    delete agent.password_hash;
    
    invalidateAgentActiveCache(id);
    
    res.json(convertKeysToCamel(agent));
  } catch (error) {
    console.error('Error updating agent:', error);
    res.status(500).json({ message: error.message });
  }
});

router.delete('/agents/:id', authMiddleware, requireAgentManager, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query('DELETE FROM agents WHERE id = $1 RETURNING id, name, email', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Agent not found' });
    }
    
    res.json({ success: true, deleted: convertKeysToCamel(result.rows[0]) });
  } catch (error) {
    console.error('Error deleting agent:', error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/agents/filter', authMiddleware, async (req, res) => {
  try {
    const filters = convertKeysToSnake(req.body);
    const keys = Object.keys(filters);
    const values = Object.values(filters);
    
    let sql = `
      SELECT id, name, cpf, email, agent_type, team_id, skills, active, 
             photo_url, permissions, level, online, capacity, working_hours, 
             queue_ids, work_unit, role, erp_agent_id,
             canal_venda, canal_venda_id, canal_venda_grupo_id, erp_agente_venda_id,
             created_at, updated_at
      FROM agents
    `;
    
    if (keys.length > 0) {
      const conditions = keys.map((key, i) => `${key} = $${i + 1}`).join(' AND ');
      sql += ` WHERE ${conditions}`;
    }
    
    sql += ` ORDER BY created_at DESC`;
    
    const result = await query(sql, values);
    res.json(result.rows.map(convertKeysToCamel));
  } catch (error) {
    console.error('Error filtering agents:', error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/agents/:id/reset-password', authMiddleware, requireAgentManager, async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;
    
    if (!newPassword) {
      return res.status(400).json({ message: 'New password is required' });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters' });
    }
    
    const password_hash = await bcrypt.hash(newPassword, 10);
    
    const result = await query(
      `UPDATE agents SET password_hash = $1, password_updated_at = NOW(), must_reset_password = true, updated_at = NOW() 
       WHERE id = $2 RETURNING id, name, email`,
      [password_hash, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Agent not found' });
    }
    
    res.json({ success: true, message: 'Password reset successfully', agent: convertKeysToCamel(result.rows[0]) });
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ message: error.message });
  }
});

router.get('/system-settings', optionalAuth, async (req, res, next) => {
  const crud = createCrudRouter('system_settings', {});
  return crud.list(req, res);
});

function normalizeSort(sort) {
  const field = sort.startsWith('-') ? sort.slice(1) : sort;
  const dir = sort.startsWith('-') ? 'DESC' : 'ASC';
  const aliases = {
    'createdDate': 'created_at', 'createdAt': 'created_at', 'created_date': 'created_at',
    'updatedDate': 'updated_at', 'updatedAt': 'updated_at', 'updated_date': 'updated_at'
  };
  return { field: aliases[field] || field.replace(/([A-Z])/g, '_$1').toLowerCase(), dir };
}

router.get('/leads', authMiddleware, async (req, res) => {
  try {
    const { sort = '-created_at', limit = 10000 } = req.query;
    const { field: sortField, dir: sortDir } = normalizeSort(sort);
    const result = await query(`SELECT * FROM leads ORDER BY ${sortField} ${sortDir} LIMIT $1`, [parseInt(limit)]);
    res.json(result.rows.map(convertKeysToCamel));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/leads/:id', authMiddleware, async (req, res) => {
  try {
    const result = await query('SELECT * FROM leads WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Not found' });
    res.json(convertKeysToCamel(result.rows[0]));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.delete('/leads/:id', authMiddleware, async (req, res) => {
  try {
    const result = await query('DELETE FROM leads WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Not found' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/leads/filter', authMiddleware, async (req, res) => {
  try {
    const filters = convertKeysToSnake(req.body);
    const keys = Object.keys(filters);
    const values = Object.values(filters);
    let sql = 'SELECT * FROM leads';
    if (keys.length > 0) {
      const conditions = keys.map((key, i) => `${key} = $${i + 1}`).join(' AND ');
      sql += ` WHERE ${conditions}`;
    }
    sql += ' ORDER BY created_at DESC';
    const result = await query(sql, values);
    res.json(result.rows.map(convertKeysToCamel));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/leads', authMiddleware, async (req, res) => {
  try {
    const data = convertKeysToSnake(req.body);
    const dateFields = ['birth_date', 'first_contact_date', 'next_contact_date', 'scheduled_visit_date', 'created_at', 'updated_at'];
    dateFields.forEach(field => {
      if (data[field] === '' || data[field] === 'Invalid Date') {
        data[field] = null;
      }
    });

    const phoneToCheck = data.whatsapp || data.phone;
    if (phoneToCheck) {
      const cleanPhone = phoneToCheck.replace(/\D/g, '');
      const dupCheck = await query(
        `SELECT l.id, l.name, a.name as agent_name FROM leads l LEFT JOIN agents a ON l.agent_id::text = a.id::text WHERE REGEXP_REPLACE(COALESCE(l.whatsapp, l.phone, ''), '[^0-9]', '', 'g') = $1`,
        [cleanPhone]
      );
      if (dupCheck.rows.length > 0) {
        const dup = dupCheck.rows[0];
        return res.status(409).json({ message: `WhatsApp ja cadastrado em Vendas PF. Lead "${dup.name}" com o agente ${dup.agent_name || 'nao atribuido'}.` });
      }
      const dupPJ = await query(
        `SELECT l.id, COALESCE(l.nome_fantasia, l.razao_social, l.contact_name) as display_name, a.name as agent_name FROM leads_pj l LEFT JOIN agents a ON l.agent_id::text = a.id::text WHERE REGEXP_REPLACE(COALESCE(l.phone, l.contact_phone, ''), '[^0-9]', '', 'g') = $1`,
        [cleanPhone]
      );
      if (dupPJ.rows.length > 0) {
        const dup = dupPJ.rows[0];
        return res.status(409).json({ message: `WhatsApp ja cadastrado em Vendas PJ. Lead "${dup.display_name}" com o agente ${dup.agent_name || 'nao atribuido'}.` });
      }
      const dupUpsell = await query(
        `SELECT l.id, l.name, a.name as agent_name FROM leads_upsell l LEFT JOIN agents a ON l.agent_id::text = a.id::text WHERE REGEXP_REPLACE(COALESCE(l.whatsapp, l.phone, ''), '[^0-9]', '', 'g') = $1`,
        [cleanPhone]
      );
      if (dupUpsell.rows.length > 0) {
        const dup = dupUpsell.rows[0];
        return res.status(409).json({ message: `WhatsApp ja cadastrado em Upsell. Lead "${dup.name}" com o agente ${dup.agent_name || 'nao atribuido'}.` });
      }
      const dupRef = await query(
        `SELECT r.id, r.referred_name, a.name as agent_name FROM referrals r LEFT JOIN agents a ON r.agent_id::text = a.id::text WHERE REGEXP_REPLACE(COALESCE(r.referred_phone, ''), '[^0-9]', '', 'g') = $1`,
        [cleanPhone]
      );
      if (dupRef.rows.length > 0) {
        const dup = dupRef.rows[0];
        return res.status(409).json({ message: `WhatsApp ja cadastrado em Indicacoes. Lead "${dup.referred_name}" com o agente ${dup.agent_name || 'nao atribuido'}.` });
      }
    }

    if (data.agent_id && !data.team_id) {
      const agentTeamResult = await query('SELECT team_id FROM agents WHERE id = $1', [data.agent_id]);
      if (agentTeamResult.rows[0]?.team_id) {
        data.team_id = agentTeamResult.rows[0].team_id;
      }
    }

    const keys = Object.keys(data).filter(k => data[k] !== null && data[k] !== undefined && data[k] !== '');
    const values = keys.map(k => {
      const val = data[k];
      if (typeof val === 'object' && val !== null) return JSON.stringify(val);
      return val;
    });
    
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    const sql = `INSERT INTO leads (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`;
    
    const result = await query(sql, values);
    const lead = result.rows[0];
    
    if (lead.agent_id || lead.assigned_agent_id) {
      await notifyLeadAssigned(lead, lead.agent_id || lead.assigned_agent_id);
    }
    
    executeLeadCreatedAutomation(lead, 'lead').catch(err => {
      console.error('[Automation] Error in lead_created automation:', err.message);
    });
    
    res.status(201).json(convertKeysToCamel(lead));
  } catch (error) {
    console.error('Error creating lead:', error);
    res.status(500).json({ message: error.message });
  }
});

router.put('/leads/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const data = convertKeysToSnake(req.body);
    
    const oldLeadResult = await query('SELECT * FROM leads WHERE id = $1', [id]);
    const oldLead = oldLeadResult.rows[0];
    
    if (!oldLead) {
      return res.status(404).json({ message: 'Lead not found' });
    }
    
    const keys = Object.keys(data);
    const values = keys.map(k => {
      const val = data[k];
      if (val === null || val === undefined) return val;
      if (Array.isArray(val)) return JSON.stringify(val);
      if (typeof val === 'object') return JSON.stringify(val);
      if (typeof val === 'string' && (val.startsWith('[') || val.startsWith('{'))) {
        try {
          JSON.parse(val);
          return val;
        } catch (e) {
          return val;
        }
      }
      return val;
    });
    
    const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');
    values.push(id);
    const sql = `UPDATE leads SET ${setClause}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`;
    
    const result = await query(sql, values);
    const lead = result.rows[0];
    
    const currentUserId = req.user?.id;
    
    if (data.stage && data.stage !== oldLead.stage) {
      await notifyLeadStageChanged(lead, oldLead.stage, data.stage, currentUserId);
    }
    
    const newAgentId = data.agent_id || data.assigned_agent_id;
    const oldAgentId = oldLead.agent_id || oldLead.assigned_agent_id;
    if (newAgentId && newAgentId !== oldAgentId) {
      await notifyLeadAssigned(lead, newAgentId);
    }
    
    if (data.proposal_status && data.proposal_status !== oldLead.proposal_status) {
      if (data.proposal_status === 'accepted' || data.proposal_status === 'rejected') {
        await notifyProposalStatus(lead, data.proposal_status);
      }
    }
    
    res.json(convertKeysToCamel(lead));
  } catch (error) {
    console.error('Error updating lead:', error);
    res.status(500).json({ message: error.message });
  }
});

router.put('/leads/:id/reassign', authMiddleware, loadAgentMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { toAgentId, notes } = req.body;
    const agentType = req.agent?.agentType;
    const role = req.user?.role;
    const isAdminRole = role === 'admin' || agentType === 'admin';
    const allowedSupervisorTypes = ['supervisor', 'sales_supervisor'];
    const isSupervisorRole = allowedSupervisorTypes.includes(agentType);
    if (!isAdminRole && !isSupervisorRole) {
      return res.status(403).json({ message: 'Sem permissão para redistribuir leads.' });
    }
    const leadResult = await query('SELECT * FROM leads WHERE id = $1', [id]);
    if (leadResult.rows.length === 0) return res.status(404).json({ message: 'Lead não encontrado.' });
    const lead = leadResult.rows[0];
    const targetAgent = await query('SELECT * FROM agents WHERE id = $1 AND active = true', [toAgentId]);
    if (targetAgent.rows.length === 0) return res.status(404).json({ message: 'Agente destino não encontrado.' });
    const fromAgentId = lead.agent_id;
    const updateResult = await query('UPDATE leads SET agent_id = $1, updated_at = NOW() WHERE id = $2 RETURNING *', [toAgentId, id]);
    const updatedLead = updateResult.rows[0];
    await query(
      `INSERT INTO lead_reassignment_log (module, lead_id, from_agent_id, to_agent_id, reassigned_by, notes) VALUES ('leads', $1, $2, $3, $4, $5)`,
      [id, fromAgentId, toAgentId, req.agent?.id || null, notes || null]
    );
    try { await notifyLeadAssigned(updatedLead, toAgentId); } catch (e) { console.error('[Reassign leads] notify error:', e.message); }
    res.json({ success: true, lead: convertKeysToCamel(updatedLead) });
  } catch (error) {
    console.error('Error reassigning lead:', error);
    res.status(500).json({ message: error.message });
  }
});

router.get('/leads/:id/reassignment-log', authMiddleware, loadAgentMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query(
      `SELECT r.*, fa.name AS from_agent_name, ta.name AS to_agent_name, ra.name AS reassigned_by_name
       FROM lead_reassignment_log r
       LEFT JOIN agents fa ON fa.id = r.from_agent_id
       LEFT JOIN agents ta ON ta.id = r.to_agent_id
       LEFT JOIN agents ra ON ra.id = r.reassigned_by
       WHERE r.lead_id = $1 AND r.module = 'leads'
       ORDER BY r.created_at DESC`,
      [id]
    );
    res.json(result.rows.map(convertKeysToCamel));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/leads-pj', authMiddleware, async (req, res) => {
  try {
    const { sort = '-created_at', limit = 10000 } = req.query;
    const { field: sortField, dir: sortDir } = normalizeSort(sort);
    const result = await query(`SELECT * FROM leads_pj ORDER BY ${sortField} ${sortDir} LIMIT $1`, [parseInt(limit)]);
    res.json(result.rows.map(convertKeysToCamel));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/leads-pj/:id', authMiddleware, async (req, res) => {
  try {
    const result = await query('SELECT * FROM leads_pj WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Not found' });
    res.json(convertKeysToCamel(result.rows[0]));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.delete('/leads-pj/:id', authMiddleware, async (req, res) => {
  try {
    const result = await query('DELETE FROM leads_pj WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Not found' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/leads-pj/filter', authMiddleware, async (req, res) => {
  try {
    const filters = convertKeysToSnake(req.body);
    const keys = Object.keys(filters);
    const values = Object.values(filters);
    let sql = 'SELECT * FROM leads_pj';
    if (keys.length > 0) {
      const conditions = keys.map((key, i) => `${key} = $${i + 1}`).join(' AND ');
      sql += ` WHERE ${conditions}`;
    }
    sql += ' ORDER BY created_at DESC';
    const result = await query(sql, values);
    res.json(result.rows.map(convertKeysToCamel));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/leads-pj', authMiddleware, async (req, res) => {
  try {
    const data = convertKeysToSnake(req.body);
    const dateFields = ['foundation_date', 'first_contact_date', 'next_contact_date', 'scheduled_visit_date', 'created_at', 'updated_at'];
    dateFields.forEach(field => {
      if (data[field] === '' || data[field] === 'Invalid Date') {
        data[field] = null;
      }
    });

    const phoneToCheck = data.phone;
    if (phoneToCheck) {
      const cleanPhone = phoneToCheck.replace(/\D/g, '');
      const dupPF = await query(
        `SELECT l.id, l.name, a.name as agent_name FROM leads l LEFT JOIN agents a ON l.agent_id::text = a.id::text WHERE REGEXP_REPLACE(COALESCE(l.whatsapp, l.phone, ''), '[^0-9]', '', 'g') = $1`,
        [cleanPhone]
      );
      if (dupPF.rows.length > 0) {
        const dup = dupPF.rows[0];
        return res.status(409).json({ message: `WhatsApp ja cadastrado em Vendas PF. Lead "${dup.name}" com o agente ${dup.agent_name || 'nao atribuido'}.` });
      }
      const dupPJ = await query(
        `SELECT l.id, COALESCE(l.nome_fantasia, l.razao_social, l.contact_name) as display_name, a.name as agent_name FROM leads_pj l LEFT JOIN agents a ON l.agent_id::text = a.id::text WHERE REGEXP_REPLACE(COALESCE(l.phone, l.contact_phone, ''), '[^0-9]', '', 'g') = $1`,
        [cleanPhone]
      );
      if (dupPJ.rows.length > 0) {
        const dup = dupPJ.rows[0];
        return res.status(409).json({ message: `WhatsApp ja cadastrado em Vendas PJ. Lead "${dup.display_name}" com o agente ${dup.agent_name || 'nao atribuido'}.` });
      }
      const dupUpsell = await query(
        `SELECT l.id, l.name, a.name as agent_name FROM leads_upsell l LEFT JOIN agents a ON l.agent_id::text = a.id::text WHERE REGEXP_REPLACE(COALESCE(l.whatsapp, l.phone, ''), '[^0-9]', '', 'g') = $1`,
        [cleanPhone]
      );
      if (dupUpsell.rows.length > 0) {
        const dup = dupUpsell.rows[0];
        return res.status(409).json({ message: `WhatsApp ja cadastrado em Upsell. Lead "${dup.name}" com o agente ${dup.agent_name || 'nao atribuido'}.` });
      }
      const dupRef = await query(
        `SELECT r.id, r.referred_name, a.name as agent_name FROM referrals r LEFT JOIN agents a ON r.agent_id::text = a.id::text WHERE REGEXP_REPLACE(COALESCE(r.referred_phone, ''), '[^0-9]', '', 'g') = $1`,
        [cleanPhone]
      );
      if (dupRef.rows.length > 0) {
        const dup = dupRef.rows[0];
        return res.status(409).json({ message: `WhatsApp ja cadastrado em Indicacoes. Lead "${dup.referred_name}" com o agente ${dup.agent_name || 'nao atribuido'}.` });
      }
    }

    if (data.agent_id && !data.team_id) {
      const agentTeamResult = await query('SELECT team_id FROM agents WHERE id = $1', [data.agent_id]);
      if (agentTeamResult.rows[0]?.team_id) {
        data.team_id = agentTeamResult.rows[0].team_id;
      }
    }

    const keys = Object.keys(data).filter(k => data[k] !== null && data[k] !== undefined && data[k] !== '');
    const values = keys.map(k => {
      const val = data[k];
      if (typeof val === 'object' && val !== null) return JSON.stringify(val);
      return val;
    });
    
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    const sql = `INSERT INTO leads_pj (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`;
    
    const result = await query(sql, values);
    const lead = result.rows[0];
    
    if (lead.agent_id) {
      await notifyLeadPJAssigned(lead, lead.agent_id);
    }
    
    executeLeadCreatedAutomation(lead, 'lead_pj').catch(err => {
      console.error('[Automation] Error in lead_pj_created automation:', err.message);
    });
    
    res.status(201).json(convertKeysToCamel(lead));
  } catch (error) {
    console.error('Error creating lead PJ:', error);
    res.status(500).json({ message: error.message });
  }
});

router.put('/leads-pj/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const data = convertKeysToSnake(req.body);
    
    const oldLeadResult = await query('SELECT * FROM leads_pj WHERE id = $1', [id]);
    const oldLead = oldLeadResult.rows[0];
    
    if (!oldLead) {
      return res.status(404).json({ message: 'Lead PJ not found' });
    }
    
    const keys = Object.keys(data);
    const values = keys.map(k => {
      const val = data[k];
      if (val === null || val === undefined) return val;
      if (Array.isArray(val)) return JSON.stringify(val);
      if (typeof val === 'object') return JSON.stringify(val);
      if (typeof val === 'string' && (val.startsWith('[') || val.startsWith('{'))) {
        try {
          JSON.parse(val);
          return val;
        } catch (e) {
          return val;
        }
      }
      return val;
    });
    
    const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');
    values.push(id);
    const sql = `UPDATE leads_pj SET ${setClause}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`;
    
    const result = await query(sql, values);
    const lead = result.rows[0];
    
    if (data.agent_id && data.agent_id !== oldLead.agent_id) {
      await notifyLeadPJAssigned(lead, data.agent_id);
    }
    
    res.json(convertKeysToCamel(lead));
  } catch (error) {
    console.error('Error updating lead PJ:', error);
    res.status(500).json({ message: error.message });
  }
});

router.put('/leads-pj/:id/reassign', authMiddleware, loadAgentMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { toAgentId, notes } = req.body;
    const agentType = req.agent?.agentType;
    const role = req.user?.role;
    const isAdminRole = role === 'admin' || agentType === 'admin';
    const allowedSupervisorTypes = ['supervisor', 'sales_supervisor'];
    const isSupervisorRole = allowedSupervisorTypes.includes(agentType);
    if (!isAdminRole && !isSupervisorRole) {
      return res.status(403).json({ message: 'Sem permissão para redistribuir leads PJ.' });
    }
    const leadResult = await query('SELECT * FROM leads_pj WHERE id = $1', [id]);
    if (leadResult.rows.length === 0) return res.status(404).json({ message: 'Lead PJ não encontrado.' });
    const lead = leadResult.rows[0];
    const targetAgent = await query('SELECT * FROM agents WHERE id = $1 AND active = true', [toAgentId]);
    if (targetAgent.rows.length === 0) return res.status(404).json({ message: 'Agente destino não encontrado.' });
    const fromAgentId = lead.agent_id;
    const updateResult = await query('UPDATE leads_pj SET agent_id = $1, updated_at = NOW() WHERE id = $2 RETURNING *', [toAgentId, id]);
    const updatedLead = updateResult.rows[0];
    await query(
      `INSERT INTO lead_reassignment_log (module, lead_id, from_agent_id, to_agent_id, reassigned_by, notes) VALUES ('leads-pj', $1, $2, $3, $4, $5)`,
      [id, fromAgentId, toAgentId, req.agent?.id || null, notes || null]
    );
    try { await notifyLeadPJAssigned(updatedLead, toAgentId); } catch (e) { console.error('[Reassign leads-pj] notify error:', e.message); }
    res.json({ success: true, lead: convertKeysToCamel(updatedLead) });
  } catch (error) {
    console.error('Error reassigning lead PJ:', error);
    res.status(500).json({ message: error.message });
  }
});

router.get('/leads-pj/:id/reassignment-log', authMiddleware, loadAgentMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query(
      `SELECT r.*, fa.name AS from_agent_name, ta.name AS to_agent_name, ra.name AS reassigned_by_name
       FROM lead_reassignment_log r
       LEFT JOIN agents fa ON fa.id = r.from_agent_id
       LEFT JOIN agents ta ON ta.id = r.to_agent_id
       LEFT JOIN agents ra ON ra.id = r.reassigned_by
       WHERE r.lead_id = $1 AND r.module = 'leads-pj'
       ORDER BY r.created_at DESC`,
      [id]
    );
    res.json(result.rows.map(convertKeysToCamel));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ===== LEADS UPSELL =====
router.get('/leads-upsell', authMiddleware, async (req, res) => {
  try {
    const { sort = '-created_at', limit = 10000 } = req.query;
    const { field: sortField, dir: sortDir } = normalizeSort(sort);
    const result = await query(`SELECT * FROM leads_upsell ORDER BY ${sortField} ${sortDir} LIMIT $1`, [parseInt(limit)]);
    res.json(result.rows.map(convertKeysToCamel));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/leads-upsell/:id', authMiddleware, async (req, res) => {
  try {
    const result = await query('SELECT * FROM leads_upsell WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Not found' });
    res.json(convertKeysToCamel(result.rows[0]));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.delete('/leads-upsell/:id', authMiddleware, async (req, res) => {
  try {
    const result = await query('DELETE FROM leads_upsell WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Not found' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/leads-upsell/filter', authMiddleware, async (req, res) => {
  try {
    const filters = convertKeysToSnake(req.body);
    const keys = Object.keys(filters);
    const values = Object.values(filters);
    let sql = 'SELECT * FROM leads_upsell';
    if (keys.length > 0) {
      const conditions = keys.map((key, i) => `${key} = $${i + 1}`).join(' AND ');
      sql += ` WHERE ${conditions}`;
    }
    sql += ' ORDER BY created_at DESC';
    const result = await query(sql, values);
    res.json(result.rows.map(convertKeysToCamel));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/leads-upsell', authMiddleware, async (req, res) => {
  try {
    const data = convertKeysToSnake(req.body);
    const dateFields = ['birth_date', 'first_contact_date', 'next_contact_date', 'scheduled_visit_date', 'created_at', 'updated_at', 'last_contact_at', 'converted_at', 'lost_at'];
    dateFields.forEach(field => {
      if (data[field] === '' || data[field] === 'Invalid Date') {
        data[field] = null;
      }
    });

    const phoneToCheck = data.whatsapp || data.phone;
    if (phoneToCheck) {
      const cleanPhone = phoneToCheck.replace(/\D/g, '');
      const dupPF = await query(
        `SELECT l.id, l.name, a.name as agent_name FROM leads l LEFT JOIN agents a ON l.agent_id::text = a.id::text WHERE REGEXP_REPLACE(COALESCE(l.whatsapp, l.phone, ''), '[^0-9]', '', 'g') = $1`,
        [cleanPhone]
      );
      if (dupPF.rows.length > 0) {
        const dup = dupPF.rows[0];
        return res.status(409).json({ message: `WhatsApp ja cadastrado em Vendas PF. Lead "${dup.name}" com o agente ${dup.agent_name || 'nao atribuido'}.` });
      }
      const dupPJ = await query(
        `SELECT l.id, COALESCE(l.nome_fantasia, l.razao_social, l.contact_name) as display_name, a.name as agent_name FROM leads_pj l LEFT JOIN agents a ON l.agent_id::text = a.id::text WHERE REGEXP_REPLACE(COALESCE(l.phone, l.contact_phone, ''), '[^0-9]', '', 'g') = $1`,
        [cleanPhone]
      );
      if (dupPJ.rows.length > 0) {
        const dup = dupPJ.rows[0];
        return res.status(409).json({ message: `WhatsApp ja cadastrado em Vendas PJ. Lead "${dup.display_name}" com o agente ${dup.agent_name || 'nao atribuido'}.` });
      }
      const dupUpsell = await query(
        `SELECT l.id, l.name, a.name as agent_name FROM leads_upsell l LEFT JOIN agents a ON l.agent_id::text = a.id::text WHERE REGEXP_REPLACE(COALESCE(l.whatsapp, l.phone, ''), '[^0-9]', '', 'g') = $1`,
        [cleanPhone]
      );
      if (dupUpsell.rows.length > 0) {
        const dup = dupUpsell.rows[0];
        return res.status(409).json({ message: `WhatsApp ja cadastrado em Upsell. Lead "${dup.name}" com o agente ${dup.agent_name || 'nao atribuido'}.` });
      }
      const dupRef = await query(
        `SELECT r.id, r.referred_name, a.name as agent_name FROM referrals r LEFT JOIN agents a ON r.agent_id::text = a.id::text WHERE REGEXP_REPLACE(COALESCE(r.referred_phone, ''), '[^0-9]', '', 'g') = $1`,
        [cleanPhone]
      );
      if (dupRef.rows.length > 0) {
        const dup = dupRef.rows[0];
        return res.status(409).json({ message: `WhatsApp ja cadastrado em Indicacoes. Lead "${dup.referred_name}" com o agente ${dup.agent_name || 'nao atribuido'}.` });
      }
    }

    const keys = Object.keys(data).filter(k => data[k] !== null && data[k] !== undefined && data[k] !== '');
    const values = keys.map(k => {
      const val = data[k];
      if (typeof val === 'object' && val !== null) return JSON.stringify(val);
      return val;
    });

    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    const sql = `INSERT INTO leads_upsell (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`;

    const result = await query(sql, values);
    const lead = result.rows[0];

    if (lead.agent_id || lead.assigned_agent_id) {
      try { await notifyLeadAssigned(lead, lead.agent_id || lead.assigned_agent_id); } catch (e) { console.error('[Upsell] notify error:', e.message); }
    }

    executeLeadCreatedAutomation(lead, 'lead_upsell').catch(err => {
      console.error('[Upsell] executeLeadCreatedAutomation error:', err.message);
    });

    executeUpsellChannelLeadCreatedAutomation(lead).catch(err => {
      console.error('[UpsellChannel] executeLeadCreatedAutomation error:', err.message);
    });

    res.status(201).json(convertKeysToCamel(lead));
  } catch (error) {
    console.error('Error creating lead upsell:', error);
    res.status(500).json({ message: error.message });
  }
});

router.put('/leads-upsell/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const data = convertKeysToSnake(req.body);

    const oldLeadResult = await query('SELECT * FROM leads_upsell WHERE id = $1', [id]);
    const oldLead = oldLeadResult.rows[0];

    if (!oldLead) {
      return res.status(404).json({ message: 'Lead Upsell not found' });
    }

    const keys = Object.keys(data);
    const values = keys.map(k => {
      const val = data[k];
      if (val === null || val === undefined) return val;
      if (Array.isArray(val)) return JSON.stringify(val);
      if (typeof val === 'object') return JSON.stringify(val);
      return val;
    });

    const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');
    values.push(id);
    const sql = `UPDATE leads_upsell SET ${setClause}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`;

    const result = await query(sql, values);
    const lead = result.rows[0];

    const newAgentId = data.agent_id || data.assigned_agent_id;
    const oldAgentId = oldLead.agent_id || oldLead.assigned_agent_id;
    if (newAgentId && newAgentId !== oldAgentId) {
      try { await notifyLeadAssigned(lead, newAgentId); } catch (e) { console.error('[Upsell] notify error:', e.message); }
    }

    if (data.stage && data.stage !== oldLead.stage) {
      executeStageChangeAutomation(lead, oldLead.stage, data.stage, 'lead_upsell').catch(err => {
        console.error('[Upsell] executeStageChangeAutomation error:', err.message);
      });

      executeUpsellChannelStageChangeAutomation(lead, oldLead.stage, data.stage).catch(err => {
        console.error('[UpsellChannel] executeStageChangeAutomation error:', err.message);
      });
    }

    res.json(convertKeysToCamel(lead));
  } catch (error) {
    console.error('Error updating lead upsell:', error);
    res.status(500).json({ message: error.message });
  }
});

router.put('/leads-upsell/:id/reassign', authMiddleware, loadAgentMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { toAgentId, notes } = req.body;
    const agentType = req.agent?.agentType;
    const role = req.user?.role;
    const isAdminRole = role === 'admin' || agentType === 'admin';
    const allowedSupervisorTypes = ['supervisor', 'upsell_supervisor', 'upsell_admin'];
    const isSupervisorRole = allowedSupervisorTypes.includes(agentType);
    if (!isAdminRole && !isSupervisorRole) {
      return res.status(403).json({ message: 'Sem permissão para redistribuir leads Upsell.' });
    }
    const leadResult = await query('SELECT * FROM leads_upsell WHERE id = $1', [id]);
    if (leadResult.rows.length === 0) return res.status(404).json({ message: 'Lead Upsell não encontrado.' });
    const lead = leadResult.rows[0];
    const targetAgent = await query('SELECT * FROM agents WHERE id = $1 AND active = true', [toAgentId]);
    if (targetAgent.rows.length === 0) return res.status(404).json({ message: 'Agente destino não encontrado.' });
    const fromAgentId = lead.agent_id;
    const updateResult = await query('UPDATE leads_upsell SET agent_id = $1, updated_at = NOW() WHERE id = $2 RETURNING *', [toAgentId, id]);
    const updatedLead = updateResult.rows[0];
    await query(
      `INSERT INTO lead_reassignment_log (module, lead_id, from_agent_id, to_agent_id, reassigned_by, notes) VALUES ('leads-upsell', $1, $2, $3, $4, $5)`,
      [id, fromAgentId, toAgentId, req.agent?.id || null, notes || null]
    );
    try { await notifyLeadAssigned(updatedLead, toAgentId); } catch (e) { console.error('[Reassign leads-upsell] notify error:', e.message); }
    res.json({ success: true, lead: convertKeysToCamel(updatedLead) });
  } catch (error) {
    console.error('Error reassigning lead upsell:', error);
    res.status(500).json({ message: error.message });
  }
});

router.get('/leads-upsell/:id/reassignment-log', authMiddleware, loadAgentMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query(
      `SELECT r.*, fa.name AS from_agent_name, ta.name AS to_agent_name, ra.name AS reassigned_by_name
       FROM lead_reassignment_log r
       LEFT JOIN agents fa ON fa.id = r.from_agent_id
       LEFT JOIN agents ta ON ta.id = r.to_agent_id
       LEFT JOIN agents ra ON ra.id = r.reassigned_by
       WHERE r.lead_id = $1 AND r.module = 'leads-upsell'
       ORDER BY r.created_at DESC`,
      [id]
    );
    res.json(result.rows.map(convertKeysToCamel));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ===== END LEADS UPSELL =====

router.get('/referrals', authMiddleware, async (req, res) => {
  try {
    const { sort = '-created_at', limit = 10000 } = req.query;
    const { field: sortField, dir: sortDir } = normalizeSort(sort);
    const result = await query(`SELECT * FROM referrals ORDER BY ${sortField} ${sortDir} LIMIT $1`, [parseInt(limit)]);
    res.json(result.rows.map(convertKeysToCamel));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/referrals/:id', authMiddleware, async (req, res) => {
  try {
    const result = await query('SELECT * FROM referrals WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Not found' });
    res.json(convertKeysToCamel(result.rows[0]));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.delete('/referrals/:id', authMiddleware, async (req, res) => {
  try {
    const result = await query('DELETE FROM referrals WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Not found' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.delete('/referrals/:id/hard', authMiddleware, loadAgentMiddleware, requireRole('indicacoes_supervisor', 'indicacoes_admin', 'admin'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const snapshotResult = await client.query('SELECT * FROM referrals WHERE id = $1', [req.params.id]);
    if (snapshotResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Lead de Indicação não encontrado.' });
    }
    const snapshot = snapshotResult.rows[0];

    await client.query('DELETE FROM referrals WHERE id = $1', [req.params.id]);

    await client.query('COMMIT');

    const agentType = req.agent?.agentType || 'unknown';
    const agentId = req.agent?.id || null;
    const userEmail = req.user?.email || 'unknown';
    console.log(JSON.stringify({
      event: 'hard_delete_referral',
      module: 'indicações',
      referral_id: req.params.id,
      referred_name: snapshot.referred_name,
      deleted_by_agent_id: agentId,
      deleted_by_email: userEmail,
      deleted_by_agent_type: agentType,
      deleted_at: new Date().toISOString(),
    }));

    res.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Hard delete referral error:', error);
    res.status(500).json({ message: 'Erro interno ao excluir o lead de Indicações.' });
  } finally {
    client.release();
  }
});

router.post('/referrals/reactivations', authMiddleware, loadAgentMiddleware, async (req, res) => {
  try {
    const agentType = req.agent?.agentType;
    const agentId = req.agent?.id;

    const allowedRoles = ['indicacoes_supervisor', 'indicacoes_admin', 'admin', 'indicacoes_atendente'];
    if (!agentType || !allowedRoles.includes(agentType)) {
      return res.status(403).json({ message: 'Acesso negado. Apenas Indicações - Supervisor, Indicações - Admin, Admin ou Indicações - Atendente podem registrar reativações.' });
    }

    const { cpf, nome_completo_cliente, telefone, observacoes, atendente_id } = req.body;

    const cleanCpf = (cpf || '').replace(/\D/g, '');
    if (cleanCpf.length > 0 && cleanCpf.length !== 11) {
      return res.status(400).json({ message: 'CPF inválido. Informe 11 dígitos ou deixe em branco.' });
    }
    if (!nome_completo_cliente || !nome_completo_cliente.trim()) {
      return res.status(400).json({ message: 'Nome completo do cliente é obrigatório.' });
    }

    let resolvedAtendenteId;

    if (agentType === 'indicacoes_atendente') {
      if (!agentId) return res.status(400).json({ message: 'Perfil de atendente não encontrado.' });
      resolvedAtendenteId = agentId;
    } else {
      if (!atendente_id) {
        return res.status(400).json({ message: 'Atendente responsável é obrigatório.' });
      }
      const validAgent = await query(
        `SELECT id FROM agents WHERE id = $1 AND agent_type = 'indicacoes_atendente' AND active = true`,
        [atendente_id]
      );
      if (validAgent.rows.length === 0) {
        return res.status(400).json({ message: 'Atendente selecionado inválido ou inativo.' });
      }
      resolvedAtendenteId = atendente_id;
    }

    const cleanTelefone = (telefone || '').replace(/\D/g, '') || null;

    const result = await query(
      `INSERT INTO referral_reactivations (cpf, nome_completo_cliente, telefone, atendente_id, observacoes)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [cleanCpf || null, nome_completo_cliente.trim(), cleanTelefone, resolvedAtendenteId, observacoes?.trim() || null]
    );

    res.status(201).json({ success: true, data: convertKeysToCamel(result.rows[0]) });
  } catch (error) {
    console.error('Error creating reactivation:', error);
    res.status(500).json({ message: 'Erro interno ao registrar reativação.' });
  }
});

router.get('/referrals/reactivations', authMiddleware, loadAgentMiddleware, async (req, res) => {
  try {
    const agentType = req.agent?.agentType;
    const agentId = req.agent?.id;

    const allowedRoles = ['indicacoes_supervisor', 'indicacoes_admin', 'admin', 'indicacoes_atendente'];
    if (!agentType || !allowedRoles.includes(agentType)) {
      return res.status(403).json({ message: 'Acesso negado.' });
    }

    let sql, params;
    if (agentType === 'indicacoes_atendente' && agentId) {
      sql = `SELECT rr.*, a.name as atendente_nome FROM referral_reactivations rr LEFT JOIN agents a ON rr.atendente_id = a.id WHERE rr.atendente_id = $1 ORDER BY rr.created_at DESC`;
      params = [agentId];
    } else {
      sql = `SELECT rr.*, a.name as atendente_nome FROM referral_reactivations rr LEFT JOIN agents a ON rr.atendente_id = a.id ORDER BY rr.created_at DESC`;
      params = [];
    }

    const result = await query(sql, params);
    res.json(result.rows.map(convertKeysToCamel));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.put('/referrals/reactivations/:id', authMiddleware, loadAgentMiddleware, async (req, res) => {
  try {
    const agentType = req.agent?.agentType;
    const agentId = req.agent?.id;

    const allowedRoles = ['indicacoes_supervisor', 'indicacoes_admin', 'admin', 'indicacoes_atendente'];
    if (!agentType || !allowedRoles.includes(agentType)) {
      return res.status(403).json({ message: 'Acesso negado.' });
    }

    const { id } = req.params;
    const { cpf, nome_completo_cliente, telefone, atendente_id, observacoes } = req.body;

    const existing = await query(`SELECT * FROM referral_reactivations WHERE id = $1`, [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ message: 'Reativação não encontrada.' });
    }
    const record = existing.rows[0];

    if (agentType === 'indicacoes_atendente' && record.atendente_id !== agentId) {
      return res.status(403).json({ message: 'Você só pode editar suas próprias reativações.' });
    }

    let resolvedAtendenteId = record.atendente_id;
    if (agentType !== 'indicacoes_atendente' && atendente_id && atendente_id !== record.atendente_id) {
      const validAgent = await query(
        `SELECT id FROM agents WHERE id = $1 AND agent_type = 'indicacoes_atendente' AND active = true`,
        [atendente_id]
      );
      if (validAgent.rows.length === 0) {
        return res.status(400).json({ message: 'Atendente selecionado inválido ou inativo.' });
      }
      resolvedAtendenteId = atendente_id;
    }

    let newCpf = record.cpf;
    if (cpf !== undefined) {
      const cleanCpf = (cpf || '').replace(/\D/g, '');
      if (cleanCpf.length > 0 && cleanCpf.length !== 11) {
        return res.status(400).json({ message: 'CPF inválido. Informe 11 dígitos ou deixe em branco.' });
      }
      newCpf = cleanCpf || null;
    }

    const cleanTelefone = telefone ? (telefone.replace(/\D/g, '') || null) : record.telefone;
    const newNome = nome_completo_cliente?.trim() || record.nome_completo_cliente;
    const newObs = observacoes !== undefined ? (observacoes?.trim() || null) : record.observacoes;

    const result = await query(
      `UPDATE referral_reactivations
       SET cpf = $1, nome_completo_cliente = $2, telefone = $3, atendente_id = $4, observacoes = $5, updated_at = NOW()
       WHERE id = $6
       RETURNING *`,
      [newCpf, newNome, cleanTelefone, resolvedAtendenteId, newObs, id]
    );

    res.json({ success: true, data: convertKeysToCamel(result.rows[0]) });
  } catch (error) {
    console.error('Error updating reactivation:', error);
    res.status(500).json({ message: 'Erro interno ao atualizar reativação.' });
  }
});

router.delete('/referrals/reactivations/:id', authMiddleware, loadAgentMiddleware, async (req, res) => {
  try {
    const agentType = req.agent?.agentType;

    const allowedRoles = ['indicacoes_supervisor', 'indicacoes_admin', 'admin'];
    if (!agentType || !allowedRoles.includes(agentType)) {
      return res.status(403).json({ message: 'Acesso negado. Apenas supervisores e administradores podem excluir reativações.' });
    }

    const { id } = req.params;
    const existing = await query(`SELECT * FROM referral_reactivations WHERE id = $1`, [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ message: 'Reativação não encontrada.' });
    }

    await query(`DELETE FROM referral_reactivations WHERE id = $1`, [id]);

    res.json({ success: true, message: 'Reativação excluída com sucesso.' });
  } catch (error) {
    console.error('Error deleting reactivation:', error);
    res.status(500).json({ message: 'Erro interno ao excluir reativação.' });
  }
});

router.get('/referrals/reactivations/report', authMiddleware, loadAgentMiddleware, async (req, res) => {
  try {
    const agentType = req.agent?.agentType;
    const agentId = req.agent?.id;

    const allowedRoles = ['indicacoes_supervisor', 'indicacoes_admin', 'admin', 'indicacoes_atendente'];
    if (!agentType || !allowedRoles.includes(agentType)) {
      return res.status(403).json({ message: 'Acesso negado.' });
    }

    const { start_date, end_date, atendente_id } = req.query;

    const conditions = [];
    const params = [];

    if (agentType === 'indicacoes_atendente') {
      params.push(agentId);
      conditions.push(`rr.atendente_id = $${params.length}`);
    } else if (atendente_id) {
      params.push(atendente_id);
      conditions.push(`rr.atendente_id = $${params.length}`);
    }

    if (start_date) {
      params.push(start_date);
      conditions.push(`rr.created_at >= $${params.length}::timestamptz`);
    }
    if (end_date) {
      params.push(end_date);
      conditions.push(`rr.created_at <= ($${params.length}::timestamptz + interval '1 day' - interval '1 second')`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT
        rr.id,
        rr.cpf,
        rr.nome_completo_cliente,
        rr.telefone,
        rr.created_at,
        rr.observacoes,
        rr.atendente_id,
        a.name AS atendente_nome
      FROM referral_reactivations rr
      LEFT JOIN agents a ON rr.atendente_id = a.id
      ${where}
      ORDER BY rr.created_at DESC
      LIMIT 5000
    `;

    const result = await query(sql, params);
    res.json(result.rows.map(convertKeysToCamel));
  } catch (error) {
    console.error('Error fetching reactivations report:', error);
    res.status(500).json({ message: 'Erro interno ao carregar relatório.' });
  }
});

router.post('/referrals/filter', authMiddleware, async (req, res) => {
  try {
    const filters = convertKeysToSnake(req.body);
    const keys = Object.keys(filters);
    const values = Object.values(filters);
    let sql = 'SELECT * FROM referrals';
    if (keys.length > 0) {
      const conditions = keys.map((key, i) => `${key} = $${i + 1}`).join(' AND ');
      sql += ` WHERE ${conditions}`;
    }
    sql += ' ORDER BY created_at DESC';
    const result = await query(sql, values);
    res.json(result.rows.map(convertKeysToCamel));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/referrals', authMiddleware, async (req, res) => {
  try {
    const data = convertKeysToSnake(req.body);
    const dateFields = ['birth_date', 'referred_birth_date', 'created_at', 'updated_at', 'converted_at', 'commission_paid_at'];
    dateFields.forEach(field => {
      if (data[field] === '' || data[field] === 'Invalid Date') {
        data[field] = null;
      }
    });

    const phoneToCheck = data.referred_phone;
    if (phoneToCheck) {
      const cleanPhone = phoneToCheck.replace(/\D/g, '');
      const dupPF = await query(
        `SELECT l.id, l.name, a.name as agent_name FROM leads l LEFT JOIN agents a ON l.agent_id::text = a.id::text WHERE REGEXP_REPLACE(COALESCE(l.whatsapp, l.phone, ''), '[^0-9]', '', 'g') = $1`,
        [cleanPhone]
      );
      if (dupPF.rows.length > 0) {
        const dup = dupPF.rows[0];
        return res.status(409).json({ message: `WhatsApp ja cadastrado em Vendas PF. Lead "${dup.name}" com o agente ${dup.agent_name || 'nao atribuido'}.` });
      }
      const dupPJ = await query(
        `SELECT l.id, COALESCE(l.nome_fantasia, l.razao_social, l.contact_name) as display_name, a.name as agent_name FROM leads_pj l LEFT JOIN agents a ON l.agent_id::text = a.id::text WHERE REGEXP_REPLACE(COALESCE(l.phone, l.contact_phone, ''), '[^0-9]', '', 'g') = $1`,
        [cleanPhone]
      );
      if (dupPJ.rows.length > 0) {
        const dup = dupPJ.rows[0];
        return res.status(409).json({ message: `WhatsApp ja cadastrado em Vendas PJ. Lead "${dup.display_name}" com o agente ${dup.agent_name || 'nao atribuido'}.` });
      }
      const dupRef = await query(
        `SELECT r.id, r.referred_name, a.name as agent_name FROM referrals r LEFT JOIN agents a ON r.agent_id::text = a.id::text WHERE REGEXP_REPLACE(COALESCE(r.referred_phone, ''), '[^0-9]', '', 'g') = $1`,
        [cleanPhone]
      );
      if (dupRef.rows.length > 0) {
        const dup = dupRef.rows[0];
        return res.status(409).json({ message: `WhatsApp ja cadastrado em Indicacoes. Lead "${dup.referred_name}" com o agente ${dup.agent_name || 'nao atribuido'}.` });
      }
    }

    const keys = Object.keys(data).filter(k => data[k] !== null && data[k] !== undefined && data[k] !== '');
    const values = keys.map(k => {
      const val = data[k];
      if (typeof val === 'object' && val !== null) return JSON.stringify(val);
      return val;
    });
    
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    const sql = `INSERT INTO referrals (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`;
    
    const result = await query(sql, values);
    const referral = result.rows[0];
    
    if (referral.agent_id) {
      await notifyReferralAssigned(referral, referral.agent_id);
    }
    
    // TEMPORARIAMENTE DESATIVADO — template incorreto
    // Reativar após correção do template
    // executeLeadCreatedAutomation(referral, 'referral').catch(err => {
    //   console.error('[Automation] Error in referral_created automation:', err.message);
    // });
    
    res.status(201).json(convertKeysToCamel(referral));
  } catch (error) {
    console.error('Error creating referral:', error);
    res.status(500).json({ message: error.message });
  }
});

router.put('/referrals/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const data = convertKeysToSnake(req.body);
    
    const oldResult = await query('SELECT * FROM referrals WHERE id = $1', [id]);
    const oldReferral = oldResult.rows[0];
    
    if (!oldReferral) {
      return res.status(404).json({ message: 'Referral not found' });
    }
    
    const keys = Object.keys(data);
    const values = keys.map(k => {
      const val = data[k];
      if (val === null || val === undefined) return val;
      if (Array.isArray(val)) return JSON.stringify(val);
      if (typeof val === 'object') return JSON.stringify(val);
      if (typeof val === 'string' && (val.startsWith('[') || val.startsWith('{'))) {
        try {
          JSON.parse(val);
          return val;
        } catch (e) {
          return val;
        }
      }
      return val;
    });
    
    const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');
    values.push(id);
    const sql = `UPDATE referrals SET ${setClause}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`;
    
    const result = await query(sql, values);
    const referral = result.rows[0];
    
    if (data.agent_id && data.agent_id !== oldReferral.agent_id) {
      await notifyReferralAssigned(referral, data.agent_id);
    }

    // Quando lead é marcado como fechado_ganho, registra na tabela de perspectivas
    if (data.stage === 'fechado_ganho' && oldReferral.stage !== 'fechado_ganho') {
      try {
        let nomeVendedor = null;
        const agentId = referral.agent_id || oldReferral.agent_id;
        if (agentId) {
          const agentResult = await query('SELECT name FROM agents WHERE id = $1', [agentId]);
          if (agentResult.rows.length > 0) nomeVendedor = agentResult.rows[0].name;
        }
        // Deduplicação por par indicador/indicado: não cria uma segunda linha de
        // comissão quando já existe um registro (qualquer origem) com o mesmo
        // cpf_indicador e cpf_indicado. A checagem é por par independente da origem,
        // alinhada ao backfill (automationService) e ao alerta sem-registro-erp.
        // Dois casos de dedup:
        //  - Com CPF do indicado ($4 IS NOT NULL): dedup por par cpf_indicador + cpf_indicado.
        //  - Sem CPF do indicado ($4 IS NULL, registro "placeholder"): dedup por
        //    cpf_indicador + nome_indicado contra outros placeholders, espelhando o
        //    índice único parcial idx_erp_perspectivas_crm_placeholder (schema.sql).
        //    Isso evita criar um segundo placeholder e mantém o insert controlado
        //    mesmo em condições de corrida (o índice é o backstop no nível do banco).
        const perspInsert = await query(
          `INSERT INTO erp_perspectivas_negocios
            (nome_indicador, cpf_indicador, nome_indicado, cpf_indicado, nome_vendedor, sit_perspectiva, origem, sincronizado_em)
           SELECT $1,$2::text,$3::text,$4::text,$5,'NEGOCIO FECHADO','crm',NOW()
           WHERE NOT EXISTS (
             SELECT 1 FROM erp_perspectivas_negocios p
             WHERE regexp_replace(COALESCE(p.cpf_indicador, ''), '[^0-9]', '', 'g') IS NOT DISTINCT FROM $2::text
               AND (
                 ($4 IS NOT NULL
                   AND regexp_replace(COALESCE(p.cpf_indicado, ''), '[^0-9]', '', 'g') IS NOT DISTINCT FROM $4::text)
                 OR
                 ($4 IS NULL
                   AND (p.cpf_indicado IS NULL OR regexp_replace(COALESCE(p.cpf_indicado, ''), '[^0-9]', '', 'g') = '')
                   AND p.nome_indicado IS NOT DISTINCT FROM $3::text)
               )
           )`,
          [
            referral.referrer_name || null,
            (referral.referrer_cpf || '').replace(/\D/g, '') || null,
            referral.referred_name || null,
            (referral.referred_cpf || '').replace(/\D/g, '') || null,
            nomeVendedor
          ]
        );
        if (perspInsert.rowCount > 0) {
          console.log(`[PerspectivaNegócios] Lead convertido registrado: ${referral.referred_name}`);
        } else {
          console.log(`[PerspectivaNegócios] Lead convertido ignorado (par indicador/indicado já registrado): ${referral.referred_name}`);
        }
      } catch (perspErr) {
        console.error('[PerspectivaNegócios] Erro ao registrar lead convertido:', perspErr.message);
      }
    }

    // Quando o CPF do indicado é preenchido em um lead já fechado_ganho,
    // atualiza imediatamente a linha CRM correspondente em erp_perspectivas_negocios
    if (
      referral.stage === 'fechado_ganho' &&
      data.referred_cpf &&
      data.referred_cpf !== (oldReferral.referred_cpf || '')
    ) {
      try {
        const cpfResult = await query(
          `UPDATE erp_perspectivas_negocios
           SET cpf_indicado = $1, sincronizado_em = NOW()
           WHERE origem = 'crm'
             AND (cpf_indicado IS NULL OR regexp_replace(cpf_indicado, '[^0-9]', '', 'g') = '')
             AND nome_indicado IS NOT DISTINCT FROM $2
             AND regexp_replace(COALESCE(cpf_indicador, ''), '[^0-9]', '', 'g') IS NOT DISTINCT FROM $3`,
          [
            (data.referred_cpf || '').replace(/\D/g, '') || null,
            referral.referred_name,
            (referral.referrer_cpf || '').replace(/\D/g, '') || null
          ]
        );
        if (cpfResult.rowCount > 0) {
          console.log(`[PerspectivaNegócios] CPF indicado atualizado em tempo real: ${data.referred_cpf} (lead: ${referral.referred_name})`);
        }
      } catch (perspErr) {
        console.error('[PerspectivaNegócios] Erro ao atualizar cpf_indicado:', perspErr.message);
      }
    }

    res.json(convertKeysToCamel(referral));
  } catch (error) {
    console.error('Error updating referral:', error);
    res.status(500).json({ message: error.message });
  }
});

router.put('/referrals/:id/reassign', authMiddleware, loadAgentMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { toAgentId, notes } = req.body;
    const agentType = req.agent?.agentType;
    const role = req.user?.role;
    const isAdminRole = role === 'admin' || agentType === 'admin';
    const allowedSupervisorTypes = ['supervisor', 'indicacoes_supervisor', 'indicacoes_admin'];
    const isSupervisorRole = allowedSupervisorTypes.includes(agentType);
    if (!isAdminRole && !isSupervisorRole) {
      return res.status(403).json({ message: 'Sem permissão para redistribuir indicações.' });
    }
    const refResult = await query('SELECT * FROM referrals WHERE id = $1', [id]);
    if (refResult.rows.length === 0) return res.status(404).json({ message: 'Indicação não encontrada.' });
    const referral = refResult.rows[0];
    const targetAgent = await query('SELECT * FROM agents WHERE id = $1 AND active = true', [toAgentId]);
    if (targetAgent.rows.length === 0) return res.status(404).json({ message: 'Agente destino não encontrado.' });
    const fromAgentId = referral.agent_id;
    const updateResult = await query('UPDATE referrals SET agent_id = $1, updated_at = NOW() WHERE id = $2 RETURNING *', [toAgentId, id]);
    const updatedReferral = updateResult.rows[0];
    await query(
      `INSERT INTO lead_reassignment_log (module, lead_id, from_agent_id, to_agent_id, reassigned_by, notes) VALUES ('referrals', $1, $2, $3, $4, $5)`,
      [id, fromAgentId, toAgentId, req.agent?.id || null, notes || null]
    );
    try { await notifyReferralAssigned(updatedReferral, toAgentId); } catch (e) { console.error('[Reassign referrals] notify error:', e.message); }
    res.json({ success: true, referral: convertKeysToCamel(updatedReferral) });
  } catch (error) {
    console.error('Error reassigning referral:', error);
    res.status(500).json({ message: error.message });
  }
});

router.get('/referrals/:id/reassignment-log', authMiddleware, loadAgentMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query(
      `SELECT r.*, fa.name AS from_agent_name, ta.name AS to_agent_name, ra.name AS reassigned_by_name
       FROM lead_reassignment_log r
       LEFT JOIN agents fa ON fa.id = r.from_agent_id
       LEFT JOIN agents ta ON ta.id = r.to_agent_id
       LEFT JOIN agents ra ON ra.id = r.reassigned_by
       WHERE r.lead_id = $1 AND r.module = 'referrals'
       ORDER BY r.created_at DESC`,
      [id]
    );
    res.json(result.rows.map(convertKeysToCamel));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ============================================================
// REFERRAL NOTES (timeline) — list/create/update/delete
// ============================================================
router.get('/referrals/:id/notes', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query(
      `SELECT n.*, a.name AS agent_full_name
       FROM referral_notes n
       LEFT JOIN agents a ON a.id = n.agent_id
       WHERE n.referral_id = $1
       ORDER BY n.created_at ASC`,
      [id]
    );
    res.json(result.rows.map(convertKeysToCamel));
  } catch (error) {
    console.error('Error listing referral notes:', error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/referrals/:id/notes', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body || {};
    if (!content || !String(content).trim()) {
      return res.status(400).json({ message: 'O conteúdo da nota é obrigatório.' });
    }

    const refCheck = await query('SELECT id FROM referrals WHERE id = $1', [id]);
    if (refCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Indicação não encontrada.' });
    }

    const userId = req.user?.id || null;
    let agentName = req.user?.name || null;
    if (userId && !agentName) {
      const a = await query('SELECT name FROM agents WHERE id = $1', [userId]);
      if (a.rows[0]) agentName = a.rows[0].name;
    }

    const result = await query(
      `INSERT INTO referral_notes (referral_id, content, agent_id, agent_name)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [id, String(content).trim(), userId, agentName]
    );
    res.status(201).json(convertKeysToCamel(result.rows[0]));
  } catch (error) {
    console.error('Error creating referral note:', error);
    res.status(500).json({ message: error.message });
  }
});

function canMutateNote(req, note) {
  const role = req.user?.role;
  if (role === 'admin' || role === 'supervisor') return true;
  return !!note.agent_id && note.agent_id === req.user?.id;
}

router.put('/referral-notes/:noteId', authMiddleware, async (req, res) => {
  try {
    const { noteId } = req.params;
    const { content } = req.body || {};
    if (!content || !String(content).trim()) {
      return res.status(400).json({ message: 'O conteúdo da nota é obrigatório.' });
    }

    const existing = await query('SELECT * FROM referral_notes WHERE id = $1', [noteId]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ message: 'Nota não encontrada.' });
    }
    if (!canMutateNote(req, existing.rows[0])) {
      return res.status(403).json({ message: 'Apenas o autor da nota ou um administrador pode editá-la.' });
    }

    const result = await query(
      `UPDATE referral_notes
       SET content = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [String(content).trim(), noteId]
    );
    res.json(convertKeysToCamel(result.rows[0]));
  } catch (error) {
    console.error('Error updating referral note:', error);
    res.status(500).json({ message: error.message });
  }
});

router.delete('/referral-notes/:noteId', authMiddleware, async (req, res) => {
  try {
    const { noteId } = req.params;
    const existing = await query('SELECT * FROM referral_notes WHERE id = $1', [noteId]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ message: 'Nota não encontrada.' });
    }
    if (!canMutateNote(req, existing.rows[0])) {
      return res.status(403).json({ message: 'Apenas o autor da nota ou um administrador pode excluí-la.' });
    }

    await query('DELETE FROM referral_notes WHERE id = $1', [noteId]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting referral note:', error);
    res.status(500).json({ message: error.message });
  }
});

router.get('/activities', authMiddleware, async (req, res) => {
  try {
    const { sort = '-scheduled_at', limit = 100, lead_id } = req.query;
    const { field: sortField, dir: sortDir } = normalizeSort(sort);
    let sql = `SELECT * FROM activities`;
    const params = [];
    if (lead_id) {
      params.push(lead_id);
      sql += ` WHERE lead_id = $1`;
    }
    sql += ` ORDER BY ${sortField} ${sortDir} LIMIT $${params.length + 1}`;
    params.push(parseInt(limit));
    const result = await query(sql, params);
    res.json(result.rows.map(convertKeysToCamel));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/activities/:id', authMiddleware, async (req, res) => {
  try {
    const result = await query('SELECT * FROM activities WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Not found' });
    res.json(convertKeysToCamel(result.rows[0]));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.delete('/activities/:id', authMiddleware, async (req, res) => {
  try {
    const result = await query('DELETE FROM activities WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Not found' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/activities/filter', authMiddleware, async (req, res) => {
  try {
    const filters = convertKeysToSnake(req.body);
    const keys = Object.keys(filters);
    const values = Object.values(filters);
    let sql = 'SELECT * FROM activities';
    if (keys.length > 0) {
      const conditions = keys.map((key, i) => `${key} = $${i + 1}`).join(' AND ');
      sql += ` WHERE ${conditions}`;
    }
    sql += ' ORDER BY created_at DESC';
    const result = await query(sql, values);
    res.json(result.rows.map(convertKeysToCamel));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.put('/activities/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const data = convertKeysToSnake(req.body);
    const keys = Object.keys(data);
    const values = keys.map(k => {
      const val = data[k];
      if (typeof val === 'object' && val !== null && !Array.isArray(val)) return JSON.stringify(val);
      return val;
    });
    const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');
    values.push(id);
    const sql = `UPDATE activities SET ${setClause} WHERE id = $${values.length} RETURNING *`;
    const result = await query(sql, values);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Not found' });
    res.json(convertKeysToCamel(result.rows[0]));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/activities', authMiddleware, async (req, res) => {
  try {
    const data = convertKeysToSnake(req.body);
    const keys = Object.keys(data).filter(k => data[k] !== null && data[k] !== undefined);
    const values = keys.map(k => {
      const val = data[k];
      // Serialize both objects and arrays as JSON for JSONB fields
      if (typeof val === 'object' && val !== null) return JSON.stringify(val);
      return val;
    });
    
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    const sql = `INSERT INTO activities (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`;
    
    const result = await query(sql, values);
    const activity = result.rows[0];
    
    if (activity.type === 'comment' && activity.lead_id) {
      const leadResult = await query('SELECT * FROM leads WHERE id = $1', [activity.lead_id]);
      const lead = leadResult.rows[0];
      if (lead) {
        await notifyLeadComment(lead, activity.agent_id, activity.description || activity.notes || '');
      }
    }
    
    res.status(201).json(convertKeysToCamel(activity));
  } catch (error) {
    console.error('Error creating activity:', error);
    res.status(500).json({ message: error.message });
  }
});

router.get('/visits', authMiddleware, async (req, res) => {
  try {
    const { sort = '-visited_at', limit = 100, lead_id } = req.query;
    const { field: sortField, dir: sortDir } = normalizeSort(sort);
    let sql = `SELECT * FROM visits`;
    const params = [];
    if (lead_id) {
      params.push(lead_id);
      sql += ` WHERE lead_id = $1`;
    }
    sql += ` ORDER BY ${sortField} ${sortDir} LIMIT $${params.length + 1}`;
    params.push(parseInt(limit));
    const result = await query(sql, params);
    res.json(result.rows.map(convertKeysToCamel));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/visits/:id', authMiddleware, async (req, res) => {
  try {
    const result = await query('SELECT * FROM visits WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Not found' });
    res.json(convertKeysToCamel(result.rows[0]));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.delete('/visits/:id', authMiddleware, async (req, res) => {
  try {
    const result = await query('DELETE FROM visits WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Not found' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/visits/filter', authMiddleware, async (req, res) => {
  try {
    const filters = convertKeysToSnake(req.body);
    const keys = Object.keys(filters);
    const values = Object.values(filters);
    let sql = 'SELECT * FROM visits';
    if (keys.length > 0) {
      const conditions = keys.map((key, i) => `${key} = $${i + 1}`).join(' AND ');
      sql += ` WHERE ${conditions}`;
    }
    sql += ' ORDER BY visited_at DESC';
    const result = await query(sql, values);
    res.json(result.rows.map(convertKeysToCamel));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.put('/visits/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const data = convertKeysToSnake(req.body);
    const keys = Object.keys(data);
    const values = keys.map(k => {
      const val = data[k];
      if (typeof val === 'object' && val !== null && !Array.isArray(val)) return JSON.stringify(val);
      return val;
    });
    const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');
    values.push(id);
    const sql = `UPDATE visits SET ${setClause} WHERE id = $${values.length} RETURNING *`;
    const result = await query(sql, values);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Not found' });
    res.json(convertKeysToCamel(result.rows[0]));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/visits', authMiddleware, async (req, res) => {
  try {
    const data = convertKeysToSnake(req.body);
    const currentUserId = req.user?.id;
    
    const keys = Object.keys(data).filter(k => data[k] !== null && data[k] !== undefined);
    const values = keys.map(k => {
      const val = data[k];
      // Serialize both objects and arrays as JSON for JSONB fields
      if (typeof val === 'object' && val !== null) return JSON.stringify(val);
      return val;
    });
    
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    const sql = `INSERT INTO visits (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`;
    
    const result = await query(sql, values);
    const visit = result.rows[0];
    
    if (visit.lead_id) {
      const leadResult = await query('SELECT * FROM leads WHERE id = $1', [visit.lead_id]);
      const lead = leadResult.rows[0];
      await notifyVisitScheduled(visit, lead, currentUserId);
    }
    
    res.status(201).json(convertKeysToCamel(visit));
  } catch (error) {
    console.error('Error creating visit:', error);
    res.status(500).json({ message: error.message });
  }
});

// ─── Lead Pool ──────────────────────────────────────────────────────────────

router.get('/lead-pool/check', authMiddleware, loadAgentMiddleware, async (req, res) => {
  try {
    const { phone } = req.query;
    const phoneDigits = (phone || '').replace(/\D/g, '');
    if (phoneDigits.length < 10) return res.json({ found: false });

    const settingResult = await query("SELECT setting_value FROM system_settings WHERE setting_key = 'lead_pool_inactivity_days'");
    const inactivityDays = parseInt(settingResult.rows[0]?.setting_value || '20', 10);

    const [r1, r2, r3, r4] = await Promise.all([
      query(
        `SELECT l.id, l.name, l.phone, l.updated_at, l.agent_id, a.name as agent_name
         FROM leads l LEFT JOIN agents a ON a.id = l.agent_id
         WHERE REGEXP_REPLACE(l.phone, '[^0-9]', '', 'g') = $1
           AND (l.transferred_out IS NULL OR l.transferred_out = FALSE)
           AND (l.concluded IS NULL OR l.concluded = FALSE)
         LIMIT 1`,
        [phoneDigits]
      ),
      query(
        `SELECT l.id, COALESCE(l.nome_fantasia, l.razao_social, l.contact_name, 'Lead PJ') as name, l.phone, l.updated_at, l.agent_id, a.name as agent_name
         FROM leads_pj l LEFT JOIN agents a ON a.id = l.agent_id
         WHERE REGEXP_REPLACE(l.phone, '[^0-9]', '', 'g') = $1
           AND (l.transferred_out IS NULL OR l.transferred_out = FALSE)
           AND (l.concluded IS NULL OR l.concluded = FALSE)
         LIMIT 1`,
        [phoneDigits]
      ),
      query(
        `SELECT l.id, l.name, l.phone, l.updated_at, l.agent_id, a.name as agent_name
         FROM leads_upsell l LEFT JOIN agents a ON a.id = l.agent_id
         WHERE REGEXP_REPLACE(l.phone, '[^0-9]', '', 'g') = $1
           AND (l.transferred_out IS NULL OR l.transferred_out = FALSE)
           AND (l.concluded IS NULL OR l.concluded = FALSE)
         LIMIT 1`,
        [phoneDigits]
      ),
      query(
        `SELECT r.id, r.referred_name as name, r.referred_phone as phone, r.updated_at, r.agent_id, a.name as agent_name
         FROM referrals r LEFT JOIN agents a ON a.id = r.agent_id
         WHERE REGEXP_REPLACE(r.referred_phone, '[^0-9]', '', 'g') = $1
           AND (r.transferred_out IS NULL OR r.transferred_out = FALSE)
           AND (r.concluded IS NULL OR r.concluded = FALSE)
         LIMIT 1`,
        [phoneDigits]
      ),
    ]);

    const moduleKeys   = ['leads', 'leads_pj', 'leads_upsell', 'referrals'];
    const moduleLabels = { leads: 'Vendas PF', leads_pj: 'Vendas PJ', leads_upsell: 'Upsell', referrals: 'Indicações' };
    const checks = [r1, r2, r3, r4];

    for (let i = 0; i < checks.length; i++) {
      if (checks[i].rows.length > 0) {
        const lead = checks[i].rows[0];
        const daysInactive = Math.floor((Date.now() - new Date(lead.updated_at).getTime()) / 86400000);
        return res.json({
          found: true,
          module: moduleKeys[i],
          moduleLabel: moduleLabels[moduleKeys[i]],
          leadId: lead.id,
          leadName: lead.name || 'Sem nome',
          agentName: lead.agent_name || null,
          daysInactive,
          claimable: daysInactive >= inactivityDays,
          inactivityDays,
        });
      }
    }
    res.json({ found: false });
  } catch (error) {
    console.error('[Lead Pool] Check error:', error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/lead-pool/claim', authMiddleware, loadAgentMiddleware, async (req, res) => {
  try {
    const { fromModule, fromLeadId, toModule, notes } = req.body;
    if (!fromModule || !fromLeadId || !toModule) {
      return res.status(400).json({ message: 'fromModule, fromLeadId e toModule são obrigatórios.' });
    }

    const srcMap = {
      leads:        { table: 'leads',        sel: `id, name, phone, email, cpf, updated_at, agent_id` },
      leads_pj:     { table: 'leads_pj',     sel: `id, COALESCE(nome_fantasia, razao_social, contact_name, 'Lead PJ') as name, phone, email, NULL::text as cpf, updated_at, agent_id` },
      leads_upsell: { table: 'leads_upsell', sel: `id, name, phone, email, cpf, updated_at, agent_id` },
      referrals:    { table: 'referrals',    sel: `id, referred_name as name, referred_phone as phone, referred_email as email, referred_cpf as cpf, updated_at, agent_id` },
    };
    const src = srcMap[fromModule];
    if (!src)              return res.status(400).json({ message: 'Módulo de origem inválido.' });
    if (!srcMap[toModule]) return res.status(400).json({ message: 'Módulo destino inválido.' });

    const sourceResult = await query(
      `SELECT ${src.sel}, transferred_out FROM ${src.table} WHERE id = $1`,
      [fromLeadId]
    );
    if (!sourceResult.rows.length) return res.status(404).json({ message: 'Lead de origem não encontrado.' });
    const lead = sourceResult.rows[0];
    if (lead.transferred_out) return res.status(409).json({ message: 'Este lead já foi transferido por outro vendedor.' });

    const settingResult = await query("SELECT setting_value FROM system_settings WHERE setting_key = 'lead_pool_inactivity_days'");
    const inactivityDays = parseInt(settingResult.rows[0]?.setting_value || '20', 10);
    const daysInactive = Math.floor((Date.now() - new Date(lead.updated_at).getTime()) / 86400000);
    if (daysInactive < inactivityDays) {
      return res.status(403).json({ message: `Lead ainda ativo (${daysInactive} dias). Necessário ${inactivityDays} dias de inatividade.` });
    }

    await query(`UPDATE ${src.table} SET transferred_out = TRUE, updated_at = NOW() WHERE id = $1`, [fromLeadId]);

    const agentId = req.agent.id;
    const name  = lead.name  || 'Lead importado';
    const phone = lead.phone || '';
    const email = lead.email || null;
    const cpf   = lead.cpf   || null;

    let newLeadId;
    if (toModule === 'leads') {
      const r = await query(
        `INSERT INTO leads (name, phone, email, cpf, agent_id, created_at, updated_at, last_contact_at) VALUES ($1,$2,$3,$4,$5,NOW(),NOW(),NOW()) RETURNING id`,
        [name, phone, email, cpf, agentId]
      );
      newLeadId = r.rows[0].id;
    } else if (toModule === 'leads_pj') {
      const r = await query(
        `INSERT INTO leads_pj (razao_social, phone, email, agent_id, created_at, updated_at) VALUES ($1,$2,$3,$4,NOW(),NOW()) RETURNING id`,
        [name, phone, email, agentId]
      );
      newLeadId = r.rows[0].id;
    } else if (toModule === 'leads_upsell') {
      const r = await query(
        `INSERT INTO leads_upsell (name, phone, email, cpf, agent_id, created_at, updated_at, last_contact_at) VALUES ($1,$2,$3,$4,$5,NOW(),NOW(),NOW()) RETURNING id`,
        [name, phone, email, cpf, agentId]
      );
      newLeadId = r.rows[0].id;
    } else {
      const r = await query(
        `INSERT INTO referrals (referred_name, referred_phone, referred_email, referred_cpf, agent_id, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,NOW(),NOW()) RETURNING id`,
        [name, phone, email, cpf, agentId]
      );
      newLeadId = r.rows[0].id;
    }

    await query(
      `INSERT INTO lead_pool_transfers (from_module, from_lead_id, to_module, to_lead_id, pulled_by, notes) VALUES ($1,$2,$3,$4,$5,$6)`,
      [fromModule, fromLeadId, toModule, newLeadId, agentId, notes || null]
    );

    if (lead.agent_id) {
      try {
        const ar = await query('SELECT email, name FROM agents WHERE id = $1', [lead.agent_id]);
        if (ar.rows.length > 0) {
          await query(
            `INSERT INTO notifications (user_email, type, title, message, created_at) VALUES ($1,'lead_pool',$2,$3,NOW())`,
            [ar.rows[0].email, 'Lead transferido por inatividade',
             `O lead ${name} foi puxado pelo vendedor ${req.agent.name} após ${daysInactive} dias de inatividade.`]
          );
        }
      } catch (ne) { console.error('[Lead Pool] notify error:', ne.message); }
    }

    res.json({ success: true, newLeadId });
  } catch (error) {
    console.error('[Lead Pool] Claim error:', error);
    res.status(500).json({ message: error.message });
  }
});

export default router;
