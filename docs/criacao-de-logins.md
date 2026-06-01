# Documentação: Criação de Logins no Wescctech CRM

## Visão Geral

No sistema, cada login corresponde a um **agente** (tabela `agents`). Não existe cadastro público de usuários — todos os logins são criados por um administrador através da página **Configurações → Agentes**.

---

## 1. Onde Criar

**Frontend:** `Configurações → Agentes` (`/agents`)

Apenas usuários com `agent_type = 'admin'` têm permissão para criar e editar agentes.

---

## 2. Campos do Formulário

| Campo | Obrigatório | Descrição |
|---|---|---|
| **Nome** | ✅ | Nome completo do agente |
| **E-mail** | ✅ | Usado para login. Deve ser único no sistema |
| **Senha** | ✅ (criação) | Mínimo recomendado: 8 caracteres. Armazenada como hash bcrypt |
| **Tipo de Agente** | ✅ | Define os módulos e permissões de acesso (ver seção 3) |
| **Time** | ⬜ | Vincula o agente a um time (tabela `teams`) |
| **Supervisor** | ⬜ | Supervisor responsável pelo agente |
| **CPF** | ⬜ | Usado em integrações com ERP |
| **Skills** | ⬜ | Habilidades para distribuição de tickets |
| **Status** | ✅ | Ativo / Inativo |

---

## 3. Tipos de Agente (`agent_type`)

O tipo de agente determina **quais módulos o usuário vê** no menu e **quais ações pode executar**.

### Tipos Principais (globais)

| Tipo | Label | Acesso |
|---|---|---|
| `admin` | Administrador | Acesso total ao sistema |
| `supervisor` | Supervisor | Supervisão geral (helpdesk, relatórios) |
| `support` | Suporte | Módulo Helpdesk (atendimento de tickets) |
| `sales` | Vendas | Módulo Sales PF (leads B2C) |
| `sales_supervisor` | Supervisor de Vendas | Supervisão do módulo Sales PF |
| `pre_sales` | Pré-Vendas | Acesso a pipeline pré-venda |
| `post_sales` | Pós-Vendas | Acesso a pipeline pós-venda |
| `collection` | Cobrança | Módulo Cobranças |

### Tipos do Módulo Upsell

| Tipo | Label | Acesso |
|---|---|---|
| `upsell_admin` | Upsell - Admin | Visibilidade total do módulo Upsell |
| `upsell_supervisor` | Upsell - Supervisor | Dashboards, relatórios e automações Upsell |
| `upsell_atendente` | Upsell - Atendente | Cadastro e gestão de leads Upsell |

### Tipos do Módulo Indicações

| Tipo | Label | Acesso |
|---|---|---|
| `indicacoes_admin` | Indicações - Admin | Visibilidade total do módulo Indicações |
| `indicacoes_supervisor` | Indicações - Supervisor | Supervisão, relatórios e comissões |
| `indicacoes_atendente` | Indicações - Atendente | Cadastro e gestão de leads de indicação |

> **Regra de role derivada:** o campo `role` é calculado automaticamente:
> - `agent_type = 'admin'` → `role = 'admin'`
> - `agent_type` termina em `_supervisor` → `role = 'supervisor'`
> - Demais → `role = 'agent'`

---

## 4. Fluxo Técnico de Criação

```
Administrador preenche formulário (Agents.jsx)
        ↓
POST /api/agents  (entities.js)
        ↓
bcrypt.hash(password, 10)  →  password_hash
        ↓
INSERT INTO agents (name, email, password_hash, agent_type, team_id, ...)
        ↓
Agente ativo no banco — pode fazer login
```

---

## 5. Fluxo de Login

```
Usuário informa e-mail + senha (Login.jsx)
        ↓
POST /api/auth/login  (auth.js)
        ↓
SELECT * FROM agents WHERE email = $1
        ↓
bcrypt.compare(senha_digitada, password_hash)
        ↓
Gera accessToken (JWT curto prazo) + refreshToken
        ↓
Consulta agent_types WHERE key = agent_type
  → retorna modules[] e allowed_submenus[]
        ↓
Frontend armazena tokens no localStorage
Redireciona conforme agent_type e módulos permitidos
```

---

## 6. Banco de Dados — Tabela `agents`

```sql
CREATE TABLE agents (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(255) NOT NULL,
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   VARCHAR(255),
    role            VARCHAR(50)  DEFAULT 'agent',
    agent_type      VARCHAR(50)  DEFAULT 'support',
    team_id         UUID REFERENCES teams(id),
    supervisor_id   UUID,
    cpf             VARCHAR(20),
    skills          TEXT[],
    active          BOOLEAN DEFAULT TRUE,
    permissions     JSONB DEFAULT '{}',
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);
```

---

## 7. Redefinição de Senha

O administrador pode redefinir a senha de qualquer agente pela tela de Agentes (botão **Redefinir Senha**).

Endpoint: `POST /api/agents/:id/reset-password`

O sistema aplica `bcrypt.hash(novaSenha, 10)` e salva no campo `password_hash`. O campo `must_reset_password` é marcado como `true`, forçando o agente a trocar a senha no próximo acesso.

---

## 8. Desativação de Conta

Não há exclusão física de agentes. Para revogar acesso, basta marcar `active = false` pelo formulário de edição. O login será bloqueado na validação do `auth.js`.

---

## 9. Arquivos Relevantes

| Arquivo | Função |
|---|---|
| `src/pages/Agents.jsx` | Interface de criação/edição de agentes |
| `src/pages/Login.jsx` | Tela de login |
| `backend/src/routes/auth.js` | Endpoints de login, registro e refresh token |
| `backend/src/routes/entities.js` | CRUD de agentes (`POST /api/agents`) |
| `backend/src/middleware/auth.js` | Validação de JWT em rotas protegidas |
| `backend/src/config/schema.sql` | Definição das tabelas `agents` e `agent_types` |
