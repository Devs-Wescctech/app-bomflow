---
name: ERP Fechamento - pessoas por item (cartão)
description: Regra de validação do ERP na tela Fechamento do orçamento que conta pessoas vinculadas por item vs quantidade do item
---

# Regra "Fechamento do orçamento" — pessoas por cartão

Na tela **Fechamento do orçamento** o ERP valida que **cada item (cartão) tenha um número de pessoas vinculadas (`pedidos_pessoas_produtos`) igual à `quantidade` daquele item** (`itens_pedidos.quantidade`).

Mensagens geradas:
- "Falta(m) ser informada(s) N pessoa(s) neste cartão!" → item tem menos pessoas que a quantidade.
- "Foi(ram) informada(s) N pessoa(s) a mais neste cartão!" → item tem mais pessoas que a quantidade.

**Why:** O orçamento Upsell suporta múltiplos produtos; cada produto vira UM item (cartão). Se a `quantidade` do item não bater com o nº de pessoas vinculadas àquele item, o Fechamento falha. Por isso o modelo correto (fiel ao orçamento ERP 68335) é: `quantidade = (titular incluído ? 1 : 0) + beneficiários atribuídos ao produto`, e `valor_total_item = preço × quantidade`; o `valor_total` do pedido é a soma dos itens. Cada beneficiário pertence a UM único produto (atribuição explícita), e o titular pode ser incluído por produto via checkbox.

**Onde a regra roda:** apenas na tela Fechamento (server-side do ERP). A API REST de criação (`OrcamentoSgprcUsuario`) NÃO executa essa validação e retorna sucesso — por isso o erro nunca chega na resposta do save. Para detectar no Bom Flow, é preciso uma query pós-insert contando pessoas por item vs `quantidade`.

**How to apply:** Ao montar os itens (`addItemsToPedido({itens})`), garanta que cada item tenha >=1 pessoa e que a `quantidade` derive exatamente do nº de pessoas vinculadas. Não crie itens "soltos" com quantidade fixa e depois distribua pessoas em outro item. Valide no frontend (cada produto com >=1 pessoa, cada beneficiário nomeado com produto atribuído) E no backend antes de inserir. O caso BOM PET deixou de ser especial: virou um produto normal selecionável como qualquer outro.
