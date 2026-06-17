---
name: Relatório de Orçamentos por módulo
description: Como o relatório de orçamentos é escopado para mostrar só orçamentos criados pelo Bom Flow, separados por módulo, via rastreio no CRM.
---

# Relatório de Orçamentos — escopo Bom Flow + por módulo

O relatório (páginas Vendas PF / Vendas PJ / Upsell / Indicações) mostra **apenas**
orçamentos criados pelo Bom Flow, separados por módulo.

**Regra central / Why:** o ERP atribui TODOS os orçamentos criados via API à conta
do token (`acesso.api`), perdendo o agente real e o módulo. Logo, NÃO dá para
separar por módulo usando dados do ERP (`pedidos.usuario_inclusao_id`). A autoria/
módulo é rastreada no CRM no momento da criação.

**Como funciona (modelo atual):**
- Tabela CRM `bomflow_orcamentos` guarda o que NÃO muda: `erp_pedido_id` (vínculo,
  UNIQUE), `erp_numero`, `modulo`, `agent_id` (uuid CRM), `agent_name`, snapshot.
- Gravação best-effort em `recordBomflowOrcamento` (nunca derruba a criação),
  chamada em POST `/orcamento` (Upsell) e POST `/pre-proposta` (legacy). O campo
  `modulo` vem do payload do frontend e é **removido antes de enviar ao ERP**.
- Leitura do relatório: resolve QUAIS pedidos exibir a partir do CRM
  (`modulo` + escopo de permissão por `agent_id`), passa os `erp_pedido_id` para
  `getRelatorioOrcamentos({ pedidoIds })` que busca os dados **ao vivo no ERP**
  (situação, valor, cliente, canal). O `nome_vendedor` do ERP (acesso.api) é
  sobrescrito pelo `agent_name` do CRM.

**Permissão por agente CRM (uuid), não mais por login ERP:** admin=todos do módulo
(getModuleAgentIds via `agent_types.modules`); supervisor=time(`supervisor_id`)+ele;
agente=só ele. Filtros extras: `team_id` (admin) e `vendedor_id` (uuid). O frontend
envia `vendedor_id` (antigo `vendedor_login`) e o select usa `v.id`/`v.nome`.

**Mapeamento módulo:** `agent_types.modules` (array). `sales`->PF, `sales_pj`->PJ,
`sales_upsell`->Upsell, `referral`->Indicações; admin=`{all}`. PF/PJ se sobrepõem
no tipo `sales` (aceito).

**Limitação conhecida:** só orçamentos com `modulo` no payload são rastreados.
Hoje só `UpsellNovoOrcamento` envia `modulo` (`sales_upsell`). PF/PJ/Indicações
não têm fluxo de criação Bom Flow em produção (só `ErpOrcamentoForm`, legacy/
teste3-only). Quando esses fluxos existirem, basta o frontend enviar `modulo` que
o hook em `/pre-proposta` (ou `/orcamento`) já registra. Orçamentos antigos sob
`acesso.api` não têm como ser atribuídos retroativamente com segurança.
