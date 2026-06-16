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
https://crm.wescctech.com.br/api/external
```

---

## 2. Autenticação

Todas as requisições devem enviar o header:

```
x-api-key: bfk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

A chave é gerada por um administrador no Bom Flow em **APPs → API Keys**. A chave completa é exibida **apenas uma vez** no momento da criação — guarde-a com segurança.

### Códigos de status

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

## 3. Parâmetros de consulta (comuns)

Os endpoints de listagem aceitam os seguintes parâmetros via query string:

| Parâmetro     | Tipo    | Descrição |
|---------------|---------|-----------|
| `page`        | inteiro | Página (padrão: `1`) |
| `limit`       | inteiro | Itens por página (padrão: `1000`, máx.: `10000`) |
| `start_date`  | data    | Filtra por data de criação a partir de (formato `YYYY-MM-DD`) |
| `end_date`    | data    | Filtra por data de criação até (formato `YYYY-MM-DD`, inclusivo) |

Filtros adicionais por módulo são descritos abaixo.

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

**Filtros adicionais:** `agent_id`, `source`, `stage`, `status`, `city`, `state`

**Principais campos retornados:**

| Campo | Descrição |
|-------|-----------|
| `id` | Identificador do lead |
| `name`, `cpf`, `email`, `phone`, `whatsapp` | Dados do cliente |
| `address`, `city`, `state` | Endereço |
| `value` | Valor do lead |
| `source` | Canal de venda |
| `stage` | Etapa do funil |
| `status` | Situação |
| `agentId` | Agente responsável |
| `createdAt`, `convertedAt`, `lostAt`, `lastContactAt` | Datas |

**Exemplo:**
```bash
curl -H "x-api-key: SUA_CHAVE" \
  "https://crm.wescctech.com.br/api/external/v1/vendas-pf?stage=fechado_ganho&start_date=2026-01-01&end_date=2026-06-30"
```

---

### 4.2. Upsell

```
GET /v1/upsell
```
**Escopo:** `upsell`

**Filtros adicionais:** `agent_id`, `assigned_agent_id`, `source`, `stage`, `status`, `city`, `state`

**Principais campos retornados:** mesmos de Vendas PF, com extras como `assignedAgentId`, `whatsapp`, `territoryId`.

**Exemplo:**
```bash
curl -H "x-api-key: SUA_CHAVE" \
  "https://crm.wescctech.com.br/api/external/v1/upsell?agent_id=UUID_DO_AGENTE"
```

---

### 4.3. Indicações

```
GET /v1/indicacoes
```
**Escopo:** `indicacoes`

**Filtros adicionais:** `agent_id`, `stage`, `status`, `commission_status`

**Principais campos retornados:**

| Campo | Descrição |
|-------|-----------|
| `id` | Identificador da indicação |
| `referredName`, `referredCpf`, `referredEmail`, `referredPhone` | Cliente indicado |
| `referrerName`, `referrerCpf`, `referrerPhone` | Quem indicou |
| `value`, `monthlyValue`, `adhesionValue` | Valores |
| `commission`, `commissionValue`, `commissionStatus`, `commissionPaidAt` | Comissão |
| `stage`, `status` | Situação |
| `agentId` | Agente responsável |
| `createdAt`, `convertedAt`, `contractSignedAt` | Datas |

**Exemplo:**
```bash
curl -H "x-api-key: SUA_CHAVE" \
  "https://crm.wescctech.com.br/api/external/v1/indicacoes?status=ativo"
```

---

### 4.4. Agentes (segmentação)

```
GET /v1/agentes
```
**Escopo:** `agentes`

**Filtros adicionais:** `role`, `agent_type`, `team_id`, `active`, `work_unit`

**Campos retornados:** `id`, `name`, `email`, `role`, `agentType`, `teamId`, `active`, `workUnit`, `createdAt`, `updatedAt`.

> Use o `id` do agente para cruzar com o campo `agentId` dos leads.

**Exemplo:**
```bash
curl -H "x-api-key: SUA_CHAVE" \
  "https://crm.wescctech.com.br/api/external/v1/agentes?active=true"
```

---

### 4.5. Canais de venda

```
GET /v1/canais
```
**Escopo:** `canais`

Retorna os canais de Indicações e de Upsell.

```json
{
  "indicacoes": [ { "id": "...", "channelToken": "...", "channelLabel": "Indicações", "createdAt": "..." } ],
  "upsell": [ { "id": "...", "channelToken": "...", "channelLabel": "...", "createdAt": "..." } ]
}
```

---

### 4.6. Métricas (panorama geral)

```
GET /v1/metrics
```
**Escopo:** requer ao menos um de `vendas_pf`, `upsell` ou `indicacoes` (retorna apenas os módulos liberados pela chave).

**Filtros:** `start_date`, `end_date`

Retorna totais agregados de **leads** e **valores**, com quebra por agente e por canal.

**Resposta:**
```json
{
  "period": { "startDate": "2026-01-01", "endDate": "2026-06-30" },
  "modules": {
    "vendas_pf": {
      "totalLeads": 8,
      "totalValue": 119.93,
      "byAgent": [ { "agentId": "...", "leads": 2, "value": 59.94 } ],
      "bySource": [ { "source": "manual", "leads": 8, "value": 119.93 } ]
    },
    "upsell": { "totalLeads": 16, "totalValue": 0, "byAgent": [], "bySource": [] },
    "indicacoes": { "totalLeads": 3, "totalValue": 0, "byAgent": [] }
  }
}
```

> **Observação:** Indicações não possui `bySource` (o módulo não usa o campo `source` diretamente).

**Exemplo:**
```bash
curl -H "x-api-key: SUA_CHAVE" \
  "https://crm.wescctech.com.br/api/external/v1/metrics?start_date=2026-01-01&end_date=2026-06-30"
```

---

## 5. Exemplo de extração completa (paginação)

```javascript
async function extrairTudo(modulo, apiKey) {
  const baseUrl = "https://crm.wescctech.com.br/api/external/v1";
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

// uso:
// const leads = await extrairTudo("vendas-pf", "bfk_...");
```

---

## 6. Boas práticas e segurança

- **Nunca exponha a API Key** em código de frontend público ou repositórios.
- Crie **uma chave por sistema/parceiro** — facilita rastrear o uso e revogar individualmente.
- Conceda **apenas os escopos necessários** a cada integração.
- Defina **expiração** para chaves temporárias.
- Para grandes volumes, use `limit=10000` e pagine via `page`.
- Use `start_date`/`end_date` para extrações incrementais (apenas o período desejado).

---

*Documento gerado para integração externa do Bom Flow (Wescctech CRM).*
