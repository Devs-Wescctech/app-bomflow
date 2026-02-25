-- Wescctech CRM Database Schema
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================
-- USERS & AUTH
-- =====================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    role VARCHAR(50) DEFAULT 'user',
    avatar_url TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- =====================
-- ORGANIZATIONAL STRUCTURE
-- =====================
CREATE TABLE IF NOT EXISTS teams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    supervisor_email VARCHAR(255),
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    cpf VARCHAR(20),
    email VARCHAR(255) UNIQUE,
    password_hash VARCHAR(255),
    role VARCHAR(50) DEFAULT 'agent',
    must_reset_password BOOLEAN DEFAULT FALSE,
    password_updated_at TIMESTAMP,
    agent_type VARCHAR(50) DEFAULT 'support',
    team_id UUID REFERENCES teams(id),
    skills TEXT[],
    active BOOLEAN DEFAULT TRUE,
    photo_url TEXT,
    permissions JSONB DEFAULT '{}',
    level VARCHAR(50) DEFAULT 'pleno',
    online BOOLEAN DEFAULT FALSE,
    capacity JSONB DEFAULT '{"P1": 2, "P2": 5, "P3": 10, "P4": 20}',
    working_hours JSONB DEFAULT '{"start": "08:00", "end": "18:00", "days": [1,2,3,4,5]}',
    queue_ids TEXT[],
    work_unit VARCHAR(100),
    whatsapp_access_token TEXT,
    whatsapp_token_expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- sales_agents table removed - unified with agents table
-- Fields phone and territories were added to agents table

CREATE TABLE IF NOT EXISTS queues (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    team_id UUID REFERENCES teams(id),
    default_priority VARCHAR(10) DEFAULT 'P3',
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key VARCHAR(50) UNIQUE NOT NULL,
    label VARCHAR(100) NOT NULL,
    description TEXT,
    color VARCHAR(100) DEFAULT 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    modules TEXT[],
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS territories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    region VARCHAR(100),
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- =====================
-- CRM - CONTACTS & ACCOUNTS
-- =====================
CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    cnpj VARCHAR(20),
    fantasy_name VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(50),
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(50),
    zip_code VARCHAR(20),
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    document VARCHAR(20),
    email VARCHAR(255),
    phone VARCHAR(50),
    whatsapp VARCHAR(50),
    account_id UUID REFERENCES accounts(id),
    birth_date DATE,
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(50),
    notes TEXT,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contracts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contact_id UUID REFERENCES contacts(id),
    account_id UUID REFERENCES accounts(id),
    contract_number VARCHAR(50),
    status VARCHAR(50) DEFAULT 'active',
    start_date DATE,
    end_date DATE,
    value DECIMAL(15,2),
    plan_name VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dependents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contract_id UUID REFERENCES contracts(id),
    name VARCHAR(255) NOT NULL,
    document VARCHAR(20),
    birth_date DATE,
    relationship VARCHAR(50),
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- =====================
-- TICKETS & HELPDESK
-- =====================
CREATE TABLE IF NOT EXISTS ticket_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    description TEXT,
    default_queue_id UUID REFERENCES queues(id),
    form_schema JSONB,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sla_policies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    priority VARCHAR(10),
    response_time_hours INTEGER,
    resolution_time_hours INTEGER,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_number SERIAL,
    subject VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'novo',
    priority VARCHAR(10) DEFAULT 'P3',
    contact_id UUID REFERENCES contacts(id),
    contract_id UUID REFERENCES contracts(id),
    queue_id UUID REFERENCES queues(id),
    agent_id UUID REFERENCES agents(id),
    ticket_type_id UUID REFERENCES ticket_types(id),
    sla_policy_id UUID REFERENCES sla_policies(id),
    channel VARCHAR(50) DEFAULT 'web',
    sla_due_date TIMESTAMP,
    first_response_at TIMESTAMP,
    resolved_at TIMESTAMP,
    closed_at TIMESTAMP,
    tags TEXT[],
    custom_fields JSONB,
    created_by_agent_id UUID REFERENCES agents(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ticket_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id UUID REFERENCES tickets(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    message_type VARCHAR(50) DEFAULT 'public',
    sender_type VARCHAR(50) DEFAULT 'agent',
    sender_id UUID,
    sender_name VARCHAR(255),
    attachments JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS macros (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    actions JSONB,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    subject VARCHAR(255),
    body TEXT,
    variables TEXT[],
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS csat_surveys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id UUID REFERENCES tickets(id),
    rating INTEGER,
    comment TEXT,
    submitted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- =====================
-- KNOWLEDGE BASE
-- =====================
CREATE TABLE IF NOT EXISTS kb_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255),
    description TEXT,
    parent_id UUID REFERENCES kb_categories(id),
    icon VARCHAR(50),
    sort_order INTEGER DEFAULT 0,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kb_articles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255),
    content TEXT,
    category_id UUID REFERENCES kb_categories(id),
    author_id UUID REFERENCES agents(id),
    status VARCHAR(50) DEFAULT 'draft',
    views INTEGER DEFAULT 0,
    helpful_count INTEGER DEFAULT 0,
    not_helpful_count INTEGER DEFAULT 0,
    tags TEXT[],
    published_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kb_article_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    article_id UUID REFERENCES kb_articles(id) ON DELETE CASCADE,
    content TEXT,
    version_number INTEGER,
    changed_by UUID REFERENCES agents(id),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kb_feedback (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    article_id UUID REFERENCES kb_articles(id) ON DELETE CASCADE,
    is_helpful BOOLEAN,
    comment TEXT,
    user_email VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW()
);

-- =====================
-- SALES & LEADS (PF)
-- =====================
CREATE TABLE IF NOT EXISTS leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    cpf VARCHAR(20),
    email VARCHAR(255),
    phone VARCHAR(50),
    whatsapp VARCHAR(50),
    source VARCHAR(100),
    stage VARCHAR(50) DEFAULT 'novo',
    agent_id UUID REFERENCES agents(id),
    territory_id UUID REFERENCES territories(id),
    value DECIMAL(15,2),
    status VARCHAR(50) DEFAULT 'active',
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(50),
    lat DECIMAL(10,8),
    lng DECIMAL(11,8),
    notes TEXT,
    custom_fields JSONB,
    last_contact_at TIMESTAMP,
    converted_at TIMESTAMP,
    lost_reason TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    type VARCHAR(50),
    title VARCHAR(255),
    description TEXT,
    scheduled_at TIMESTAMP,
    completed_at TIMESTAMP,
    completed BOOLEAN DEFAULT FALSE,
    outcome VARCHAR(100),
    priority VARCHAR(20) DEFAULT 'media',
    assigned_to VARCHAR(255),
    metadata JSONB,
    created_by UUID REFERENCES agents(id),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS visits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    agent_id UUID REFERENCES agents(id),
    scheduled_at TIMESTAMP,
    visited_at TIMESTAMP,
    check_in_lat DECIMAL(10,8),
    check_in_lng DECIMAL(11,8),
    notes TEXT,
    status VARCHAR(50) DEFAULT 'scheduled',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sales_goals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID REFERENCES agents(id),
    period VARCHAR(20),
    year INTEGER,
    month INTEGER,
    target_value DECIMAL(15,2),
    achieved_value DECIMAL(15,2) DEFAULT 0,
    target_leads INTEGER,
    achieved_leads INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lead_automations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    trigger_type VARCHAR(50),
    trigger_config JSONB,
    action_type VARCHAR(50),
    action_config JSONB,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- =====================
-- SALES & LEADS (PJ)
-- =====================
CREATE TABLE IF NOT EXISTS leads_pj (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cnpj VARCHAR(20),
    razao_social VARCHAR(255),
    nome_fantasia VARCHAR(255),
    contact_name VARCHAR(255),
    contact_email VARCHAR(255),
    contact_phone VARCHAR(50),
    source VARCHAR(100),
    stage VARCHAR(50) DEFAULT 'novo',
    agent_id UUID REFERENCES agents(id),
    value DECIMAL(15,2),
    status VARCHAR(50) DEFAULT 'active',
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(50),
    employees_count INTEGER,
    segment VARCHAR(100),
    notes TEXT,
    custom_fields JSONB,
    last_contact_at TIMESTAMP,
    converted_at TIMESTAMP,
    lost_reason TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activities_pj (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID REFERENCES leads_pj(id) ON DELETE CASCADE,
    type VARCHAR(50),
    description TEXT,
    scheduled_at TIMESTAMP,
    completed_at TIMESTAMP,
    completed BOOLEAN DEFAULT FALSE,
    outcome VARCHAR(100),
    created_by UUID REFERENCES agents(id),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lead_pj_automations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    trigger_type VARCHAR(50),
    trigger_config JSONB,
    action_type VARCHAR(50),
    action_config JSONB,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- =====================
-- PROPOSALS & SALES
-- =====================
CREATE TABLE IF NOT EXISTS proposal_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    content TEXT,
    variables JSONB,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID,
    lead_pj_id UUID,
    agent_id UUID REFERENCES agents(id),
    value DECIMAL(15,2),
    status VARCHAR(50) DEFAULT 'pending',
    proposal_url TEXT,
    signed_at TIMESTAMP,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- =====================
-- REFERRALS
-- =====================
CREATE TABLE IF NOT EXISTS referrals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    referrer_name VARCHAR(255),
    referrer_email VARCHAR(255),
    referrer_phone VARCHAR(50),
    referred_name VARCHAR(255),
    referred_email VARCHAR(255),
    referred_phone VARCHAR(50),
    stage VARCHAR(50) DEFAULT 'novo',
    agent_id UUID REFERENCES agents(id),
    value DECIMAL(15,2),
    commission DECIMAL(15,2),
    commission_status VARCHAR(50) DEFAULT 'pending',
    notes TEXT,
    converted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS referral_activities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    referral_id UUID REFERENCES referrals(id) ON DELETE CASCADE,
    type VARCHAR(50),
    description TEXT,
    created_by UUID REFERENCES agents(id),
    created_at TIMESTAMP DEFAULT NOW()
);

-- =====================
-- QUICK SERVICE
-- =====================
CREATE TABLE IF NOT EXISTS quick_services (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contact_id UUID REFERENCES contacts(id),
    contact_name VARCHAR(255),
    contact_cpf VARCHAR(20),
    contact_phone VARCHAR(50),
    service_type VARCHAR(100),
    description TEXT,
    agent_id UUID REFERENCES agents(id),
    status VARCHAR(50) DEFAULT 'completed',
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- =====================
-- DISTRIBUTION RULES
-- =====================
CREATE TABLE IF NOT EXISTS distribution_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    rule_type VARCHAR(50),
    conditions JSONB,
    target_queue_id UUID REFERENCES queues(id),
    target_agent_id UUID REFERENCES agents(id),
    priority INTEGER DEFAULT 0,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- =====================
-- PORTAL & SESSIONS
-- =====================
CREATE TABLE IF NOT EXISTS portal_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contact_id UUID REFERENCES contacts(id),
    token VARCHAR(255) UNIQUE,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- =====================
-- SYSTEM SETTINGS
-- =====================
CREATE TABLE IF NOT EXISTS system_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value TEXT,
    setting_type VARCHAR(50) DEFAULT 'string',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- =====================
-- NOTIFICATIONS
-- =====================
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_email VARCHAR(255),
    title VARCHAR(255),
    message TEXT,
    type VARCHAR(50),
    link TEXT,
    read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notification_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_email VARCHAR(255),
    notification_type VARCHAR(100),
    email_enabled BOOLEAN DEFAULT TRUE,
    push_enabled BOOLEAN DEFAULT TRUE,
    in_app_enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- =====================
-- QUALITY & AUDITS
-- =====================
CREATE TABLE IF NOT EXISTS quality_checklists (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    items JSONB,
    is_default BOOLEAN DEFAULT FALSE,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS call_audits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID REFERENCES agents(id),
    ticket_id UUID REFERENCES tickets(id),
    checklist_id UUID REFERENCES quality_checklists(id),
    audio_url TEXT,
    duration INTEGER,
    transcription TEXT,
    dialogue JSONB,
    analysis JSONB,
    score INTEGER,
    status VARCHAR(50) DEFAULT 'processing',
    processed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- =====================
-- TICKET STATUS HISTORY (for SLA tracking)
-- =====================
CREATE TABLE IF NOT EXISTS ticket_status_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id UUID REFERENCES tickets(id) ON DELETE CASCADE,
    old_status VARCHAR(50),
    new_status VARCHAR(50),
    changed_by UUID,
    created_at TIMESTAMP DEFAULT NOW()
);

-- =====================
-- LEAD HISTORY (for automation tracking)
-- =====================
CREATE TABLE IF NOT EXISTS lead_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    action VARCHAR(100),
    old_value TEXT,
    new_value TEXT,
    changed_by UUID,
    created_at TIMESTAMP DEFAULT NOW()
);

-- =====================
-- ADDITIONAL COLUMNS FOR BUSINESS RULES
-- =====================
ALTER TABLE agents ADD COLUMN IF NOT EXISTS online BOOLEAN DEFAULT TRUE;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS level VARCHAR(50) DEFAULT 'pleno';
ALTER TABLE agents ADD COLUMN IF NOT EXISTS capacity JSONB DEFAULT '{"P1": 2, "P2": 5, "P3": 10, "P4": 20}';
ALTER TABLE agents ADD COLUMN IF NOT EXISTS queue_ids UUID[] DEFAULT '{}';
ALTER TABLE agents ADD COLUMN IF NOT EXISTS working_hours JSONB;

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS assigned_agent_id UUID REFERENCES agents(id);
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMP;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS sla_breached BOOLEAN DEFAULT FALSE;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id);

ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned_agent_id UUID REFERENCES agents(id);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS stage_changed_at TIMESTAMP;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id);

ALTER TABLE lead_automations ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0;
ALTER TABLE lead_automations ADD COLUMN IF NOT EXISTS stop_on_trigger BOOLEAN DEFAULT FALSE;

-- Extend automations for WhatsApp integration
ALTER TABLE lead_automations ADD COLUMN IF NOT EXISTS whatsapp_template_id VARCHAR(100);
ALTER TABLE lead_automations ADD COLUMN IF NOT EXISTS whatsapp_template_name VARCHAR(255);
ALTER TABLE lead_automations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

ALTER TABLE lead_pj_automations ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0;
ALTER TABLE lead_pj_automations ADD COLUMN IF NOT EXISTS stop_on_trigger BOOLEAN DEFAULT FALSE;
ALTER TABLE lead_pj_automations ADD COLUMN IF NOT EXISTS whatsapp_template_id VARCHAR(100);
ALTER TABLE lead_pj_automations ADD COLUMN IF NOT EXISTS whatsapp_template_name VARCHAR(255);
ALTER TABLE lead_pj_automations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- =====================
-- REFERRAL AUTOMATIONS
-- =====================
CREATE TABLE IF NOT EXISTS referral_automations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    trigger_type VARCHAR(50),
    trigger_config JSONB,
    action_type VARCHAR(50),
    action_config JSONB,
    whatsapp_template_id VARCHAR(100),
    whatsapp_template_name VARCHAR(255),
    priority INTEGER DEFAULT 0,
    stop_on_trigger BOOLEAN DEFAULT FALSE,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- =====================
-- AUTOMATION EXECUTION LOG
-- =====================
CREATE TABLE IF NOT EXISTS automation_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    automation_id UUID,
    automation_type VARCHAR(50),
    lead_id UUID,
    referral_id UUID,
    action_type VARCHAR(50),
    action_result JSONB,
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT,
    executed_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE sla_policies ADD COLUMN IF NOT EXISTS first_response_minutes INTEGER;
ALTER TABLE sla_policies ADD COLUMN IF NOT EXISTS resolution_minutes INTEGER;
ALTER TABLE sla_policies ADD COLUMN IF NOT EXISTS pause_on_statuses TEXT[] DEFAULT '{"awaiting_customer", "awaiting_third_party", "on_hold"}';

-- =====================
-- INDEXES
-- =====================
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_agent ON tickets(agent_id);
CREATE INDEX IF NOT EXISTS idx_tickets_queue ON tickets(queue_id);
CREATE INDEX IF NOT EXISTS idx_tickets_created ON tickets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_agent_id ON tickets(assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_leads_agent ON leads(agent_id);
CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads(stage);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_agent_id ON leads(assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_leads_pj_agent ON leads_pj(agent_id);
CREATE INDEX IF NOT EXISTS idx_contacts_document ON contacts(document);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_email);
CREATE INDEX IF NOT EXISTS idx_audits_agent ON call_audits(agent_id);
CREATE INDEX IF NOT EXISTS idx_ticket_status_history_ticket_id ON ticket_status_history(ticket_id);
CREATE INDEX IF NOT EXISTS idx_lead_history_lead_id ON lead_history(lead_id);

-- =====================
-- TRIGGERS FOR UPDATED_AT
-- =====================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DO $$
DECLARE
    t text;
BEGIN
    FOR t IN 
        SELECT table_name FROM information_schema.columns 
        WHERE column_name = 'updated_at' 
        AND table_schema = 'public'
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS update_%I_updated_at ON %I', t, t);
        EXECUTE format('CREATE TRIGGER update_%I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()', t, t);
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- =====================
-- DEFAULT DATA
-- =====================
INSERT INTO system_settings (setting_key, setting_value) VALUES 
    ('company_name', 'Wescctech CRM'),
    ('company_logo', ''),
    ('primary_color', '#0066cc')
ON CONFLICT (setting_key) DO NOTHING;

INSERT INTO teams (name, description) VALUES 
    ('Suporte', 'Equipe de suporte ao cliente')
ON CONFLICT (name) DO NOTHING;

INSERT INTO queues (name, default_priority) VALUES 
    ('Geral', 'P3')
ON CONFLICT (name) DO NOTHING;

-- =====================
-- BOM AUTO
-- =====================
CREATE TABLE IF NOT EXISTS bom_auto_atendimentos (
  id SERIAL PRIMARY KEY,
  protocolo VARCHAR(20) NOT NULL UNIQUE,
  documento_cliente VARCHAR(20) NOT NULL,
  nome_cliente VARCHAR(255) NOT NULL,
  placa VARCHAR(20) NOT NULL,
  descricao_veiculo VARCHAR(255),
  tipo_servico VARCHAR(100) NOT NULL,
  observacoes TEXT,
  data_hora TIMESTAMP DEFAULT NOW(),
  usuario VARCHAR(255) NOT NULL,
  status_atendimento VARCHAR(50) NOT NULL DEFAULT 'Pendente',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bom_auto_imagens (
  id SERIAL PRIMARY KEY,
  atendimento_id INTEGER NOT NULL REFERENCES bom_auto_atendimentos(id) ON DELETE CASCADE,
  filename VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mimetype VARCHAR(100) NOT NULL,
  size INTEGER NOT NULL,
  url VARCHAR(500) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE bom_auto_atendimentos ADD COLUMN IF NOT EXISTS telefone_contato VARCHAR(20);
ALTER TABLE bom_auto_atendimentos ADD COLUMN IF NOT EXISTS data_hora_inicio_tratamento TIMESTAMP;
ALTER TABLE bom_auto_atendimentos ADD COLUMN IF NOT EXISTS usuario_responsavel_tratamento VARCHAR(255);
ALTER TABLE bom_auto_atendimentos ADD COLUMN IF NOT EXISTS observacoes_tratamento TEXT;

CREATE TABLE IF NOT EXISTS bom_auto_historico_alteracoes (
  id SERIAL PRIMARY KEY,
  atendimento_id INTEGER NOT NULL REFERENCES bom_auto_atendimentos(id) ON DELETE CASCADE,
  status_anterior VARCHAR(50),
  status_novo VARCHAR(50),
  usuario VARCHAR(255) NOT NULL,
  data_hora TIMESTAMP DEFAULT NOW(),
  observacao TEXT
);
