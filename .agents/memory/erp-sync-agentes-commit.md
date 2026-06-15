---
name: ERP sync-agentes commit idempotente
description: O endpoint /sync-agentes/commit é o ponto único e idempotente de vínculo ERP de agentes (erp_agent_id + canal); reusado pelo lote e pela edição.
---

# /api/erp/sync-agentes/commit — ponto único de vínculo ERP de agentes

**Regra:** todo vínculo ERP de agente (gravar `erp_agent_id` e registrar canal em `pessoas_contratos` → `erp_agente_venda_id`) deve passar pelo `/sync-agentes/commit`, que re-resolve por CPF no servidor (`resolveAgentErpByCpf`) e é **idempotente**:
- preenche `erp_agent_id` se faltar (só com nome batendo, ou `force` para divergência revisada manualmente);
- registra canal preenchendo `erp_agente_venda_id` sempre que houver `canal_venda_id` sem vínculo — **inclusive** quando o agente já está vinculado;
- `recanal: true` por item força re-registro do canal mesmo já tendo `erp_agente_venda_id` (usado quando o `canal_venda_id` muda na edição). `registerAgentInCanal` é idempotente por `(pessoa_id, contrato_id)`, então só conta ação/atualiza quando o id retornado muda.
- retorna `actions[]` (`vinculo`/`canal`) e status `ok`/`ja_vinculado`/`nome_divergente`/`vinculado_sem_canal`/`pessoa_nao_encontrada`/`sem_cpf`.

**Why:** antes o commit parava em `ja_vinculado` quando havia `erp_agent_id`, sem registrar canal — o que deixava agentes editados sem canal no ERP. A edição (`updateAgentMutation.onSuccess` em Agents.jsx) reaproveita o mesmo commit em vez de duplicar a lógica de resolução/escrita.

**How to apply:** ao precisar vincular agente ao ERP em qualquer fluxo novo, chame `commitSyncAgentesErp([{agentId, force?, recanal?}])` em vez de escrever direto. Toda rota de escrita ERP de agente (incl. `/registrar-canal`) exige o middleware `requireManageAgents`, não basta `authMiddleware`.
