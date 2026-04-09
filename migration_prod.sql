-- =====================================================
-- MIGRAÇÃO BOMFLOW - PRODUÇÃO
-- Data: 2026-04-07
-- Seguro: todos os comandos usam IF NOT EXISTS
-- =====================================================

-- 1. NOVA COLUNA: agents
ALTER TABLE agents ADD COLUMN IF NOT EXISTS erp_agent_id BIGINT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_erp_agent_id ON agents (erp_agent_id) WHERE erp_agent_id IS NOT NULL;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS whatsapp_channel_token VARCHAR(128);

-- 2. NOVAS COLUNAS: referrals
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS referrer_cpf VARCHAR(20);
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS referrer_contract_id VARCHAR(100);
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS referrer_erp_data JSONB;
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS referrer_level INTEGER DEFAULT 1;
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS referrer_total_conversions INTEGER DEFAULT 0;
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS referred_cpf VARCHAR(20);
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS referred_address TEXT;
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS referred_birth_date DATE;
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS relationship VARCHAR(100);
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS interest VARCHAR(255);
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS monthly_value DECIMAL(15,2);
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS adhesion_value DECIMAL(15,2);
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS total_dependents INTEGER;
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS referral_code VARCHAR(50);
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'ativo';
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS stage_history JSONB DEFAULT '[]';
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS commission_value DECIMAL(15,2);
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS commission_paid_at TIMESTAMP;
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS commission_payment_method VARCHAR(100);
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS commission_notes TEXT;
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS concluded BOOLEAN DEFAULT false;
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS lost BOOLEAN DEFAULT false;
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS proposal_url TEXT;
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS contract_token VARCHAR(255);
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS contract_signature_url TEXT;
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS contract_signed_at TIMESTAMP;
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS contract_uploaded_at TIMESTAMPTZ;
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS contract_url TEXT;
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS signature_autentique_id VARCHAR(255);
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS signature_link TEXT;
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS signature_status VARCHAR(50) DEFAULT 'none';

-- 3. AUTOMAÇÕES: lead_automations + times
ALTER TABLE lead_automations ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id);

CREATE TABLE IF NOT EXISTS lead_automation_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id UUID NOT NULL REFERENCES lead_automations(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id),
  created_at TIMESTAMP DEFAULT now(),
  UNIQUE(automation_id, team_id)
);

INSERT INTO lead_automation_teams (automation_id, team_id)
SELECT id, team_id FROM lead_automations
WHERE team_id IS NOT NULL
ON CONFLICT (automation_id, team_id) DO NOTHING;

-- 4. AUTOMAÇÕES PJ: lead_pj + times
ALTER TABLE leads_pj ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id);
ALTER TABLE lead_pj_automations ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id);

CREATE TABLE IF NOT EXISTS lead_pj_automation_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id UUID NOT NULL REFERENCES lead_pj_automations(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id),
  created_at TIMESTAMP DEFAULT now(),
  UNIQUE(automation_id, team_id)
);

INSERT INTO lead_pj_automation_teams (automation_id, team_id)
SELECT id, team_id FROM lead_pj_automations
WHERE team_id IS NOT NULL
ON CONFLICT (automation_id, team_id) DO NOTHING;

-- 5. INDICAÇÕES: canais e automações por canal
CREATE TABLE IF NOT EXISTS referral_channel_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    channel_token VARCHAR(500) NOT NULL,
    channel_label VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS referral_channel_automations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    trigger_type VARCHAR(50),
    trigger_config JSONB,
    action_type VARCHAR(50),
    action_config JSONB,
    whatsapp_template_id VARCHAR(100),
    whatsapp_template_name VARCHAR(255),
    channel_token VARCHAR(500) NOT NULL,
    channel_token_label VARCHAR(255),
    priority INTEGER DEFAULT 0,
    stop_on_trigger BOOLEAN DEFAULT FALSE,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 6. GERADOR DE LEADS: novas colunas no log
ALTER TABLE gerador_leads_whatsapp_logs ADD COLUMN IF NOT EXISTS team_id UUID;
ALTER TABLE gerador_leads_whatsapp_logs ADD COLUMN IF NOT EXISTS template_id VARCHAR(255);
ALTER TABLE gerador_leads_whatsapp_logs ADD COLUMN IF NOT EXISTS status_envio VARCHAR(50) DEFAULT 'enviado';
ALTER TABLE gerador_leads_whatsapp_logs ADD COLUMN IF NOT EXISTS tentativa_numero INTEGER DEFAULT 1;
ALTER TABLE gerador_leads_whatsapp_logs ADD COLUMN IF NOT EXISTS motivo_bloqueio TEXT;
ALTER TABLE gerador_leads_whatsapp_logs ADD COLUMN IF NOT EXISTS batch_id UUID;
ALTER TABLE gerador_leads_whatsapp_logs ADD COLUMN IF NOT EXISTS whu_chat_id VARCHAR(64);
ALTER TABLE gerador_leads_whatsapp_logs ADD COLUMN IF NOT EXISTS whu_contact_id VARCHAR(64);
ALTER TABLE gerador_leads_whatsapp_logs ADD COLUMN IF NOT EXISTS endpoint_used VARCHAR(32);
ALTER TABLE gerador_leads_whatsapp_logs ADD COLUMN IF NOT EXISTS retorno_whu BOOLEAN DEFAULT NULL;
ALTER TABLE gerador_leads_whatsapp_logs ADD COLUMN IF NOT EXISTS data_segundo_contato TIMESTAMP DEFAULT NULL;
ALTER TABLE gerador_leads_whatsapp_logs ADD COLUMN IF NOT EXISTS data_terceiro_contato TIMESTAMP DEFAULT NULL;
ALTER TABLE gerador_leads_whatsapp_logs ADD COLUMN IF NOT EXISTS data_quarto_contato TIMESTAMP DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_glwl_block_check ON gerador_leads_whatsapp_logs (lead_number, success, sent_at);
CREATE INDEX IF NOT EXISTS idx_glwl_whu_chat_id ON gerador_leads_whatsapp_logs (whu_chat_id);
CREATE INDEX IF NOT EXISTS idx_glwl_sent_at ON gerador_leads_whatsapp_logs (sent_at);
CREATE INDEX IF NOT EXISTS idx_glwl_batch ON gerador_leads_whatsapp_logs (batch_id);
CREATE INDEX IF NOT EXISTS idx_glwl_segundo_contato ON gerador_leads_whatsapp_logs (data_segundo_contato);
CREATE INDEX IF NOT EXISTS idx_glwl_terceiro_contato ON gerador_leads_whatsapp_logs (data_terceiro_contato);
CREATE INDEX IF NOT EXISTS idx_glwl_quarto_contato ON gerador_leads_whatsapp_logs (data_quarto_contato);

-- 7. FILA DE DISPAROS
CREATE TABLE IF NOT EXISTS gerador_leads_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  batch_id UUID NOT NULL,
  lead_id UUID,
  lead_number VARCHAR(50) NOT NULL,
  lead_name VARCHAR(255),
  template_id VARCHAR(255) NOT NULL,
  status_envio VARCHAR(50) DEFAULT 'pendente',
  tentativa_numero INTEGER DEFAULT 1,
  max_tentativas INTEGER DEFAULT 3,
  user_id UUID,
  user_email VARCHAR(255),
  team_id UUID,
  filters_used JSONB,
  motivo_bloqueio TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  scheduled_at TIMESTAMP
);

ALTER TABLE gerador_leads_queue ADD COLUMN IF NOT EXISTS channel_token VARCHAR(500);
ALTER TABLE gerador_leads_queue ADD COLUMN IF NOT EXISTS lead_uf VARCHAR(2);
ALTER TABLE gerador_leads_queue ADD COLUMN IF NOT EXISTS lead_cidade VARCHAR(255);
ALTER TABLE gerador_leads_queue ADD COLUMN IF NOT EXISTS lead_produto VARCHAR(255);
ALTER TABLE gerador_leads_queue ADD COLUMN IF NOT EXISTS lead_situacao VARCHAR(100);
ALTER TABLE gerador_leads_queue ADD COLUMN IF NOT EXISTS agent_id UUID;
ALTER TABLE gerador_leads_queue ADD COLUMN IF NOT EXISTS agent_name VARCHAR(255);
ALTER TABLE gerador_leads_queue ADD COLUMN IF NOT EXISTS template_name VARCHAR(255);
ALTER TABLE gerador_leads_queue ADD COLUMN IF NOT EXISTS automation_name VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_glq_batch ON gerador_leads_queue (batch_id);
CREATE INDEX IF NOT EXISTS idx_glq_status ON gerador_leads_queue (status_envio);
CREATE INDEX IF NOT EXISTS idx_glq_batch_status ON gerador_leads_queue (batch_id, status_envio);

-- 8. AUDITORIA E RATE CONFIG
CREATE TABLE IF NOT EXISTS gerador_leads_audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  batch_id UUID,
  user_id UUID,
  user_email VARCHAR(255),
  action VARCHAR(100),
  details JSONB,
  ip_address VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gerador_leads_rate_config (
  id SERIAL PRIMARY KEY,
  key VARCHAR(100) UNIQUE NOT NULL,
  value INTEGER NOT NULL,
  description TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO gerador_leads_rate_config (key, value, description) VALUES
  ('max_per_batch', 500, 'Máximo de leads por lote'),
  ('delay_between_ms', 2000, 'Delay entre envios em milissegundos'),
  ('max_retries', 3, 'Máximo de tentativas por lead'),
  ('daily_limit', 5000, 'Limite diário global de envios'),
  ('cooldown_minutes', 30, 'Tempo mínimo entre lotes do mesmo usuário')
ON CONFLICT (key) DO NOTHING;

-- 9. CONVERSÕES DO GERADOR
CREATE TABLE IF NOT EXISTS gerador_leads_conversoes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_number_normalized VARCHAR(20) NOT NULL,
  lead_name VARCHAR(255),
  erp_contrato VARCHAR(100),
  erp_valor DECIMAL(15,2),
  erp_data_adesao DATE,
  data_venda DATE,
  dispatch_user_id UUID,
  dispatch_user_email VARCHAR(255),
  dispatch_date TIMESTAMP,
  dispatch_batch_id UUID,
  days_to_convert INTEGER,
  matched_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_glc_lead_number ON gerador_leads_conversoes (lead_number_normalized);
CREATE INDEX IF NOT EXISTS idx_glc_data_venda ON gerador_leads_conversoes (data_venda);
CREATE INDEX IF NOT EXISTS idx_glc_dispatch_user ON gerador_leads_conversoes (dispatch_user_id);
CREATE INDEX IF NOT EXISTS idx_glc_batch ON gerador_leads_conversoes (dispatch_batch_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_glc_unique_conversion ON gerador_leads_conversoes (lead_number_normalized, erp_contrato);
ALTER TABLE gerador_leads_conversoes ADD COLUMN IF NOT EXISTS team_id UUID;

-- 10. AUDITORIA DIÁRIA
CREATE TABLE IF NOT EXISTS gerador_leads_auditoria (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  data_execucao DATE NOT NULL,
  tipo VARCHAR(50) NOT NULL,
  total_registros INTEGER DEFAULT 0,
  registros_corrigidos INTEGER DEFAULT 0,
  detalhes JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gla_data_execucao ON gerador_leads_auditoria (data_execucao);

-- 11. COMISSÕES: deduplicação e reconciliação
CREATE TABLE IF NOT EXISTS processed_referral_sales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_identifier VARCHAR(255) UNIQUE NOT NULL,
  referral_id UUID,
  cpf_indicador VARCHAR(20),
  cpf_indicado VARCHAR(20),
  valor_contrato DECIMAL(15,2),
  processed_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_processed_referral_sales_identifier ON processed_referral_sales (sale_identifier);

CREATE TABLE IF NOT EXISTS processed_referral_contracts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contrato_servicos VARCHAR(100) NOT NULL,
  cpf_indicador VARCHAR(20),
  cpf_indicado VARCHAR(20),
  valor_contrato DECIMAL(15,2),
  referral_id UUID,
  processed_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_processed_referral_contracts_contrato ON processed_referral_contracts (contrato_servicos);

CREATE TABLE IF NOT EXISTS commission_reconciliation_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  execution_date TIMESTAMP DEFAULT NOW(),
  tipo_problema VARCHAR(100),
  descricao TEXT,
  dados JSONB,
  resolvido BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commission_reconciliation_date ON commission_reconciliation_logs (execution_date);
CREATE INDEX IF NOT EXISTS idx_commission_reconciliation_tipo ON commission_reconciliation_logs (tipo_problema);

-- 12. PAGAMENTO DE COMISSÕES
CREATE TABLE IF NOT EXISTS commission_payment_batches (
  id SERIAL PRIMARY KEY,
  periodo_inicio TIMESTAMP NOT NULL,
  periodo_fim TIMESTAMP NOT NULL,
  data_geracao TIMESTAMP DEFAULT NOW(),
  total_indicadores INTEGER DEFAULT 0,
  valor_total DECIMAL(15,2) DEFAULT 0,
  status VARCHAR(50) DEFAULT 'aberto',
  created_at TIMESTAMP DEFAULT NOW(),
  email_enviado BOOLEAN DEFAULT FALSE,
  data_envio_email TIMESTAMP,
  usuario_envio VARCHAR(255),
  tipo_envio VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS commission_payment_control (
  id SERIAL PRIMARY KEY,
  cpf_indicador VARCHAR(20),
  nome_indicador VARCHAR(255),
  cel_indicador VARCHAR(50),
  cpf_indicado VARCHAR(20),
  nome_indicado VARCHAR(255),
  data_contrato DATE,
  valor_contrato DECIMAL(15,2),
  contrato_servicos VARCHAR(100),
  status_pagamento VARCHAR(50) DEFAULT 'elegivel',
  periodo_pagamento VARCHAR(100),
  lote_pagamento_id INTEGER REFERENCES commission_payment_batches(id),
  data_confirmacao_pagamento TIMESTAMP,
  usuario_confirmacao VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_commission_payment_control_contrato ON commission_payment_control (contrato_servicos);
CREATE INDEX IF NOT EXISTS idx_commission_payment_control_lote ON commission_payment_control (lote_pagamento_id);
CREATE INDEX IF NOT EXISTS idx_commission_payment_control_status ON commission_payment_control (status_pagamento);

-- 13. EMAIL SETTINGS
CREATE TABLE IF NOT EXISTS email_commission_settings (
  id SERIAL PRIMARY KEY,
  smtp_server VARCHAR(255) DEFAULT 'smtp.gmail.com',
  smtp_port INTEGER DEFAULT 587,
  smtp_user VARCHAR(255) DEFAULT '',
  smtp_password VARCHAR(255) DEFAULT '',
  email_from VARCHAR(255) DEFAULT '',
  email_to TEXT DEFAULT '',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO email_commission_settings (smtp_server, smtp_port, smtp_user, email_from, email_to)
SELECT 'smtp.gmail.com', 587, '', '', ''
WHERE NOT EXISTS (SELECT 1 FROM email_commission_settings);

-- 14. SNAPSHOT SEMANAL
CREATE TABLE IF NOT EXISTS commission_weekly_snapshot (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  batch_id INTEGER REFERENCES commission_payment_batches(id),
  cycle_start DATE NOT NULL,
  cycle_end DATE NOT NULL,
  cpf_indicador VARCHAR(20),
  nome_indicador VARCHAR(255),
  cel_indicador VARCHAR(50),
  total_conversions INTEGER DEFAULT 0,
  tier INTEGER DEFAULT 1,
  unit_value DECIMAL(15,2) DEFAULT 0,
  total_commission DECIMAL(15,2) DEFAULT 0,
  details JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commission_snapshot_cycle ON commission_weekly_snapshot (cycle_start, cycle_end);
CREATE INDEX IF NOT EXISTS idx_commission_snapshot_batch ON commission_weekly_snapshot (batch_id);
CREATE INDEX IF NOT EXISTS idx_commission_snapshot_cpf ON commission_weekly_snapshot (cpf_indicador);

-- 15. PIX DOS INDICADORES
CREATE TABLE IF NOT EXISTS indicadores_pix (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cpf_indicador VARCHAR(20) NOT NULL UNIQUE,
  chave_pix VARCHAR(255),
  tipo_chave VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_indicadores_pix_cpf ON indicadores_pix (cpf_indicador);

-- 16. LOG ESTRUTURADO DE DISPAROS
CREATE TABLE IF NOT EXISTS gerador_leads_log_estruturado (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  batch_id UUID NOT NULL,
  disparado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processado_em TIMESTAMPTZ,
  duracao_ms INTEGER,
  lead_number VARCHAR(20) NOT NULL,
  lead_name VARCHAR(255),
  lead_uf VARCHAR(2),
  lead_cidade VARCHAR(255),
  lead_produto VARCHAR(255),
  lead_situacao VARCHAR(100),
  agent_id UUID,
  agent_name VARCHAR(255),
  agent_email VARCHAR(255),
  template_id VARCHAR(100),
  template_name VARCHAR(255),
  channel_token VARCHAR(500),
  automation_name VARCHAR(255),
  tentativa_numero INTEGER DEFAULT 1,
  status_envio VARCHAR(50) NOT NULL,
  http_status INTEGER,
  message_sent_id VARCHAR(255),
  api_response JSONB,
  motivo_bloqueio TEXT,
  convertido BOOLEAN DEFAULT FALSE,
  data_conversao TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE gerador_leads_log_estruturado ADD COLUMN IF NOT EXISTS whu_chat_id VARCHAR(64);
ALTER TABLE gerador_leads_log_estruturado ADD COLUMN IF NOT EXISTS whu_contact_id VARCHAR(64);
ALTER TABLE gerador_leads_log_estruturado ADD COLUMN IF NOT EXISTS endpoint_used VARCHAR(32);

CREATE INDEX IF NOT EXISTS idx_log_est_batch_id ON gerador_leads_log_estruturado(batch_id);
CREATE INDEX IF NOT EXISTS idx_log_est_disparado_em ON gerador_leads_log_estruturado(disparado_em);
CREATE INDEX IF NOT EXISTS idx_log_est_lead_number ON gerador_leads_log_estruturado(lead_number);
CREATE INDEX IF NOT EXISTS idx_log_est_agent_id ON gerador_leads_log_estruturado(agent_id);
CREATE INDEX IF NOT EXISTS idx_log_est_status_envio ON gerador_leads_log_estruturado(status_envio);
CREATE INDEX IF NOT EXISTS idx_log_est_convertido ON gerador_leads_log_estruturado(convertido);

-- 17. CONTATOS WHATSAPP POR AGENTE
CREATE TABLE IF NOT EXISTS lead_whatsapp_contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID NOT NULL,
  agent_id UUID NOT NULL REFERENCES agents(id),
  message TEXT,
  channel_token_masked VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_wa_contacts_lead ON lead_whatsapp_contacts(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_wa_contacts_agent ON lead_whatsapp_contacts(agent_id);
CREATE INDEX IF NOT EXISTS idx_lead_wa_contacts_created ON lead_whatsapp_contacts(created_at);

-- =====================================================
-- FIM DA MIGRAÇÃO
-- =====================================================
