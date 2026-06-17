---
name: Relatório de Orçamentos por módulo
description: Como o relatório de orçamentos do ERP é escopado para mostrar só orçamentos criados pelo Bom Flow, separados por módulo.
---

# Relatório de Orçamentos — escopo Bom Flow + por módulo

O relatório de orçamentos (páginas Vendas PF / Vendas PJ / Upsell / Indicações)
deve mostrar **apenas** orçamentos criados a partir do Bom Flow, separados por
módulo. Os orçamentos do ERP são atribuídos ao criador via
`pedidos.usuario_inclusao_id` -> `usuarios.id`/`usuarios.login`.

**Regra central:** nunca passar `logins = null` para a query (isso significava
"sem filtro" e trazia todo o ERP, ~70k). O universo é sempre os agentes Bom Flow
(agentes do CRM com `erp_agent_id` preenchido).

**Mapeamento módulo -> agentes:** times (`teams`) NÃO têm campo de módulo. O
módulo vem de `agent_types.modules` (array). Chaves: `sales`->Vendas PF,
`sales_pj`->Vendas PJ, `sales_upsell`->Upsell, `referral`->Indicações. Admin tem
`{all}` e entra em todos os módulos. Caveat conhecido e aceito: o tipo `sales`/
`sales_supervisor` pertence a `sales` E `sales_pj`, então PF e PJ se sobrepõem —
não há como distinguir PF/PJ a partir do dado do ERP.

**Permissão x módulo:** o resultado final é a interseção de dois conjuntos de
logins: (1) universo do módulo e (2) escopo do visualizador (admin=todos do
módulo; supervisor=time+ele; agente=só ele). Mesma lógica aplicada ao dropdown
de vendedores.

**Why:** sem restringir ao universo Bom Flow, admin vazava todo o ERP; sem o
módulo obrigatório, chamadas sem `modulo` agregariam todos os módulos juntos.

**How to apply:** backend valida `modulo` contra allowlist
(`sales|sales_pj|sales_upsell|referral`); ausente/inválido => retorna vazio. As 4
páginas sempre enviam a prop `modulo`.

Nota factual (jun/2026): no ambiente atual existem 11 usuários ERP "BOM FLOW"
(login tipo `user.*.bom*`/`user.*.bomflow`) mas com 0 pedidos em qualquer campo
(usuario_inclusao_id, vendedor_id, agente_id, agente_venda_id). Ou seja, ainda
não há orçamentos Bom Flow no ERP — relatório vazio é o comportamento correto
até que agentes criem orçamentos de fato.
