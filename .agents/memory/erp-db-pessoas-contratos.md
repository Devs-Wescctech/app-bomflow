---
name: ERP DB pessoas_contratos
description: Detalhes do INSERT direto no banco do ERP para vincular agente ao canal de vendas (agente_venda_id).
---

# Regra
Ao criar um agente no Bom Flow com `erp_agent_id` + `canal_venda_id`, o backend insere automaticamente em `pessoas_contratos` no banco PostgreSQL do ERP, gerando o `erp_agente_venda_id`.

**Why:** A API REST do ERP não expõe endpoint para criar o vínculo pessoa × canal de venda. O acesso direto ao banco (rede interna 172.16.0.36:5432) é a única forma de automatizar.

**How to apply:** Ver `backend/src/services/erpDbService.js` — função `registerAgentInCanal(pessoaId, contratoId, grupoId)`.

# Campos fixos do INSERT
- `tipo_vinculo_id` = 2094514 (hardcoded — tipo "vendedor no canal")
- `titular` = "N", `ativo` = "S", `valor` = 0.0, resto null
- `id` gerado por `nextval('pk_sequence')` — sequence global do ERP (last_value ~302M)

# Campos dinâmicos
- `pessoa_id` = `agents.erp_agent_id` (PK numérica interna do ERP, magnitude ~301M)
- `contrato_id` = `agents.canal_venda_id` (id da API_CANAL_VENDAS)
- `grupo_id` = `agents.canal_venda_grupo_id` (grupo_id da API_CANAL_VENDAS — campo diferente do id)

# API_CANAL_VENDAS retorna
```json
{ "titulo_contrato": "...", "id": 297856229, "grupo_id": 297856295, "grupo": "VENDAS" }
```
`id` ≠ `grupo_id` — são valores distintos, ambos necessários.

# Idempotência
Faz SELECT por `(pessoa_id, contrato_id)` antes de inserir. Não há UNIQUE constraint — só PK no `id`. Se já existir, retorna o id existente sem duplicar.

# Credenciais
Secrets: `ERP_DB_HOST` (172.16.0.36), `ERP_DB_PORT` (5432), `ERP_DB_NAME` (andriotti), `ERP_DB_USER`, `ERP_DB_PASSWORD`.
