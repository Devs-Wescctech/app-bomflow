# API Externa — Bom Flow (Wescctech CRM)

Guia de integração para **consulta de dados** dos módulos **Vendas PF**, **Upsell** e **Indicações** por sistemas externos.

> **Versão:** v1
> **Tipo:** REST / JSON sobre HTTPS
> **Acesso:** somente leitura (apenas requisições `GET`)

---

## 1. Visão geral

A API Externa permite que sistemas de terceiros (BI, dashboards, planilhas automatizadas, etc.) consultem dados do Bom Flow de forma segura, usando uma **API Key** dedicada — sem precisar de login de usuário.

Cada API Key:
- é **somente leitura**;
- possui **escopos** (módulos que pode acessar);
- pode ter **data de expiração**;
- pode ser **revogada** a qualquer momento;
- registra a data do **último uso**.

**Base URL (produção):**
```
https://app.bomflow.com.br/api/external
```

---

## 2. Autenticação

Todas as requisições devem enviar o header:

```
x-api-key: bfk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

A chave é gerada por um administrador no Bom Flow em **APPs → API Keys**. A chave completa é exibida **apenas uma vez** no momento da criação — guarde-a com segurança.

### Códigos de status HTTP

| Código | Significado |
|--------|-------------|
| `200`  | Sucesso |
| `401`  | API key ausente, inválida, expirada ou revogada |
| `403`  | API key sem permissão (escopo) para o recurso |
| `500`  | Erro interno do servidor |

### Escopos disponíveis

| Escopo        | Acesso |
|---------------|--------|
| `vendas_pf`   | Leads de Vendas PF |
| `upsell`      | Leads do Upsell |
| `indicacoes`  | Indicações (referrals) |
| `agentes`     | Lista de agentes (para segmentação) |
| `canais`      | Canais de venda |

---

## 3. Parâmetros de consulta (comuns a todos os endpoints de listagem)

| Parâmetro     | Tipo    | Descrição |
|---------------|---------|-----------|
| `page`        | inteiro | Página (padrão: `1`) |
| `limit`       | inteiro | Itens por página (padrão: `1000`, máx.: `10000`) |
| `start_date`  | data    | Filtra por data de criação a partir de (formato `YYYY-MM-DD`) |
| `end_date`    | data    | Filtra por data de criação até (formato `YYYY-MM-DD`, inclusivo) |

Filtros adicionais por módulo são descritos em cada seção abaixo.

### Formato da resposta de listagem

```json
{
  "data": [ { "...": "..." } ],
  "pagination": {
    "page": 1,
    "limit": 1000,
    "total": 8,
    "totalPages": 1
  }
}
```

---

## 4. Endpoints

### 4.1. Vendas PF

```
GET /v1/vendas-pf
```
**Escopo:** `vendas_pf`

**Filtros adicionais:**

| Parâmetro    | Tipo   | Descrição |
|--------------|--------|-----------|
| `agent_id`   | UUID   | Filtra pelo ID do agente responsável |
| `source`     | texto  | Canal de origem do lead (ver valores abaixo) |
| `stage`      | texto  | Etapa do funil (ver valores abaixo) |
| `status`     | texto  | Situação do lead (ver valores abaixo) |
| `city`       | texto  | Filtra pela cidade do cliente (texto livre) |
| `state`      | texto  | Filtra pelo estado do cliente (ex.: `SP`, `MG`) |

**Valores de `stage` (Vendas PF):**

| Valor            | Significado |
|------------------|-------------|
| `novo`           | Lead recém-criado, ainda não abordado |
| `abordado`       | Primeiro contato realizado |
| `qualificado`    | Lead qualificado pelo vendedor |
| `proposta_enviada` | Proposta comercial enviada ao cliente |
| `fechado_ganho`  | Venda concluída com sucesso |
| `fechado_perdido`| Lead perdido / não convertido |

**Valores de `status`:**

| Valor     | Significado |
|-----------|-------------|
| `ativo`   | Lead ativo no pipeline |
| `inativo` | Lead marcado como inativo |

**Valores de `source` (canal de origem):**

| Valor           | Significado |
|-----------------|-------------|
| `manual`        | Cadastro manual no sistema |
| `porta_a_porta` | Abordagem presencial |
| `whatsapp`      | Originado via WhatsApp |
| `indicacao`     | Indicação de cliente |
| `portal`        | Portal do cliente |
| `campanha`      | Campanha de marketing |

> **Nota:** Os valores de `source` são configuráveis. Os listados acima são os padrões do sistema; seu ambiente pode ter valores personalizados.

**Principais campos retornados:**

| Campo | Descrição |
|-------|-----------|
| `id` | Identificador do lead |
| `name`, `cpf`, `email`, `phone`, `whatsapp` | Dados do cliente |
| `address`, `city`, `state` | Endereço |
| `value` | Valor da venda |
| `source` | Canal de origem |
| `stage` | Etapa do funil |
| `status` | Situação do lead |
| `agentId` | UUID do agente responsável |
| `createdAt`, `convertedAt`, `lostAt`, `lastContactAt` | Datas |

**Exemplo:**
```bash
curl -H "x-api-key: SUA_CHAVE" \
  "https://app.bomflow.com.br/api/external/v1/vendas-pf?stage=fechado_ganho&start_date=2026-01-01&end_date=2026-06-30"
```

---

### 4.2. Upsell

```
GET /v1/upsell
```
**Escopo:** `upsell`

**Filtros adicionais:**

| Parâmetro            | Tipo   | Descrição |
|----------------------|--------|-----------|
| `agent_id`           | UUID   | Filtra pelo ID do agente criador do lead |
| `assigned_agent_id`  | UUID   | Filtra pelo ID do agente atribuído ao lead |
| `source`             | texto  | Canal de origem (mesmos valores de Vendas PF) |
| `stage`              | texto  | Etapa do funil (ver valores abaixo) |
| `status`             | texto  | Situação do lead (mesmos valores de Vendas PF) |
| `city`               | texto  | Filtra pela cidade do cliente (texto livre) |
| `state`              | texto  | Filtra pelo estado do cliente (ex.: `SP`, `MG`) |

**Valores de `stage` (Upsell):** idênticos ao Vendas PF — `novo`, `abordado`, `qualificado`, `proposta_enviada`, `fechado_ganho`, `fechado_perdido`.

**Principais campos retornados:** mesmos de Vendas PF, com extras: `assignedAgentId`, `territoryId`, `whatsapp`.

**Exemplo:**
```bash
curl -H "x-api-key: SUA_CHAVE" \
  "https://app.bomflow.com.br/api/external/v1/upsell?agent_id=UUID_DO_AGENTE"
```

---

### 4.3. Indicações

```
GET /v1/indicacoes
```
**Escopo:** `indicacoes`

**Filtros adicionais:**

| Parâmetro           | Tipo   | Descrição |
|---------------------|--------|-----------|
| `agent_id`          | UUID   | Filtra pelo ID do agente responsável |
| `stage`             | texto  | Etapa do funil (ver valores abaixo) |
| `status`            | texto  | Situação da indicação (ver valores abaixo) |
| `commission_status` | texto  | Situação da comissão (ver valores abaixo) |

**Valores de `stage` (Indicações):**

| Valor              | Significado |
|--------------------|-------------|
| `novo`             | Indicação recém-criada |
| `contato_iniciado` | Contato realizado com o indicado |
| `proposta_enviada` | Proposta enviada ao indicado |
| `fechado_ganho`    | Indicação convertida em cliente |
| `fechado_perdido`  | Indicação perdida / não convertida |

**Valores de `status` (Indicações):**

| Valor        | Significado |
|--------------|-------------|
| `ativo`      | Indicação ativa no pipeline |
| `inativo`    | Indicação marcada como inativa |
| `convertido` | Indicação concluída com conversão |

**Valores de `commission_status` (situação da comissão):**

| Valor      | Significado |
|------------|-------------|
| `pending`  | Aguardando aprovação |
| `aprovada` | Comissão aprovada para pagamento |
| `paga`     | Comissão efetivamente paga |
| `cancelada`| Comissão cancelada |

**Principais campos retornados:**

| Campo | Descrição |
|-------|-----------|
| `id` | Identificador da indicação |
| `referredName`, `referredCpf`, `referredEmail`, `referredPhone` | Cliente indicado |
| `referrerName`, `referrerCpf`, `referrerPhone` | Quem indicou |
| `value`, `monthlyValue`, `adhesionValue` | Valores |
| `commission`, `commissionValue`, `commissionStatus`, `commissionPaidAt` | Comissão |
| `stage`, `status` | Situação |
| `agentId` | UUID do agente responsável |
| `createdAt`, `convertedAt`, `contractSignedAt` | Datas |

**Exemplo:**
```bash
curl -H "x-api-key: SUA_CHAVE" \
  "https://app.bomflow.com.br/api/external/v1/indicacoes?commission_status=aprovada"
```

---

### 4.4. Agentes (segmentação)

```
GET /v1/agentes
```
**Escopo:** `agentes`

**Filtros adicionais:**

| Parâmetro    | Tipo    | Descrição |
|--------------|---------|-----------|
| `role`       | texto   | Papel do agente no sistema (ver valores abaixo) |
| `agent_type` | texto   | Tipo de agente configurado (ver nota abaixo) |
| `team_id`    | UUID    | ID da equipe à qual o agente pertence |
| `active`     | boolean | `true` retorna apenas ativos, `false` apenas inativos |
| `work_unit`  | texto   | Unidade de trabalho do agente (texto livre) |

**Valores de `role`:**

| Valor        | Significado |
|--------------|-------------|
| `admin`      | Administrador do sistema — acesso total |
| `supervisor` | Supervisor — acesso de gestão à sua equipe |
| `agent`      | Agente operacional |

**Sobre `agent_type`:** os tipos de agente são configuráveis pelo administrador do sistema. Use o endpoint `/v1/agentes` sem filtro para descobrir os valores que existem no seu ambiente.

**Sobre `active`:** passe `true` para listar apenas agentes ativos (padrão da maioria dos relatórios) ou `false` para agentes desativados.

> Use o `id` do agente para cruzar com o campo `agentId` dos leads.

**Campos retornados:** `id`, `name`, `email`, `role`, `agentType`, `teamId`, `active`, `workUnit`, `createdAt`, `updatedAt`.

**Exemplo:**
```bash
curl -H "x-api-key: SUA_CHAVE" \
  "https://app.bomflow.com.br/api/external/v1/agentes?active=true&role=agent"
```

---

### 4.5. Canais de venda

```
GET /v1/canais
```
**Escopo:** `canais`

Retorna os canais de Indicações e de Upsell cadastrados no sistema. Sem filtros adicionais.

```json
{
  "indicacoes": [ { "id": "...", "channelToken": "...", "channelLabel": "Indicações", "createdAt": "..." } ],
  "upsell":     [ { "id": "...", "channelToken": "...", "channelLabel": "...", "createdAt": "..." } ]
}
```

**Exemplo:**
```bash
curl -H "x-api-key: SUA_CHAVE" \
  "https://app.bomflow.com.br/api/external/v1/canais"
```

---

### 4.6. Métricas (panorama geral)

```
GET /v1/metrics
```
**Escopo:** requer ao menos um de `vendas_pf`, `upsell` ou `indicacoes`. A resposta inclui apenas os módulos liberados pela chave.

**Filtros:**

| Parâmetro    | Tipo | Descrição |
|--------------|------|-----------|
| `start_date` | data | Início do período (`YYYY-MM-DD`) |
| `end_date`   | data | Fim do período (`YYYY-MM-DD`, inclusivo) |

**Resposta:**
```json
{
  "period": { "startDate": "2026-01-01", "endDate": "2026-06-30" },
  "modules": {
    "vendas_pf": {
      "totalLeads": 8,
      "totalValue": 119.93,
      "byAgent":  [ { "agentId": "...", "leads": 2, "value": 59.94 } ],
      "bySource": [ { "source": "manual", "leads": 8, "value": 119.93 } ]
    },
    "upsell":    { "totalLeads": 16, "totalValue": 0, "byAgent": [], "bySource": [] },
    "indicacoes":{ "totalLeads": 3,  "totalValue": 0, "byAgent": [] }
  }
}
```

> **Observação:** Indicações não possui `bySource` (o módulo não usa o campo `source`).

**Exemplo:**
```bash
curl -H "x-api-key: SUA_CHAVE" \
  "https://app.bomflow.com.br/api/external/v1/metrics?start_date=2026-01-01&end_date=2026-06-30"
```

---

## 5. Exemplo de extração completa (paginação)

```javascript
async function extrairTudo(modulo, apiKey) {
  const baseUrl = "https://app.bomflow.com.br/api/external/v1";
  let page = 1;
  let todos = [];

  while (true) {
    const res = await fetch(`${baseUrl}/${modulo}?page=${page}&limit=10000`, {
      headers: { "x-api-key": apiKey },
    });
    const json = await res.json();
    todos = todos.concat(json.data);
    if (page >= json.pagination.totalPages) break;
    page++;
  }
  return todos;
}

// Uso:
// const leads = await extrairTudo("vendas-pf", "bfk_...");
// const upsell = await extrairTudo("upsell", "bfk_...");
// const indicacoes = await extrairTudo("indicacoes", "bfk_...");
```

---

## 6. Configuração do Nginx (produção)

Para que as requisições à API externa cheguem ao container, o Nginx precisa encaminhar `/api/external/` ao backend. Configuração recomendada:

```nginx
server {
    listen 443 ssl;
    server_name app.bomflow.com.br;

    # Todas as rotas de API (incluindo /api/external/) vão para o container
    location /api/ {
        proxy_pass         http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }

    # Frontend SPA e assets estáticos
    location / {
        proxy_pass         http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade    $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host       $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

> **Atenção:** se o Nginx tiver blocos `location` separados por rota (ex.: `location /api/auth/`, `location /api/entities/`), adicione explicitamente:
> ```nginx
> location /api/external/ {
>     proxy_pass http://localhost:5000;
>     proxy_http_version 1.1;
>     proxy_set_header Host $host;
>     proxy_set_header X-Real-IP $remote_addr;
>     proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
>     proxy_set_header X-Forwarded-Proto $scheme;
> }
> ```

---

## 7. Boas práticas e segurança

- **Nunca exponha a API Key** em código de frontend público ou repositórios.
- Crie **uma chave por sistema/parceiro** — facilita rastrear o uso e revogar individualmente.
- Conceda **apenas os escopos necessários** a cada integração.
- Defina **expiração** para chaves temporárias.
- Para grandes volumes, use `limit=10000` e pagine via `page`.
- Use `start_date`/`end_date` para extrações incrementais (apenas o período desejado).

---

*Documento de integração — Bom Flow (Wescctech CRM) — app.bomflow.com.br*
