---
name: ERP sync de agentes — autorização e resolução
description: Regras para vincular agentes existentes ao ERP em lote (preview/commit) e por que o backend precisa autorizar sozinho.
---

# Sincronização ERP de agentes (a partir do CPF)

Endpoints que CONSULTAM dados pessoais no ERP (CPF→nome) e/ou GRAVAM vínculos
(`agents.erp_agent_id`, `erp_agente_venda_id`) devem autorizar no backend
replicando a regra de "gerenciar agentes" (admin, módulo `all`/`config`, ou
`permissions.can_manage_agents`). NÃO basta `authMiddleware`.

**Why:** o gating só no frontend (botão escondido) deixa o endpoint aberto a
qualquer usuário autenticado — risco de IDOR/exposição de PII e escrita indevida.
A rota legada `registrar-canal` usava só `authMiddleware`; não copie esse padrão
para operações em lote/sensíveis.

**How to apply:** middleware `requireManageAgents` em `erpProxy.js` (consulta
`agents.agent_type/permissions` + `agent_types.modules`). Reaproveitar para
futuras rotas administrativas de ERP.

## Resolução read-only (CPF → vínculo)
`resolveAgentErpByCpf` resolve no banco do ERP: documentos_pessoas (CPF) →
pessoa_id → pessoas (código/nome) → usuarios (id = erp_agent_id, login).
Preferir login NATIVO (não `user.%`) e usuário ativo — é o que permite o
orçamento sair como criado pelo vendedor real depois.

**Commit:** re-resolve no servidor (não confia no cliente), grava só quando o
nome bate (ou `force` para divergência revisada manualmente) e trata erro do
UPDATE porque `erp_agent_id` tem índice único (duas pessoas → mesmo usuário falha).
