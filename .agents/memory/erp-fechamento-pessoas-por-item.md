---
name: ERP Fechamento - pessoas por item (cartão)
description: Regra de validação do ERP na tela Fechamento do orçamento que conta pessoas vinculadas por item vs quantidade do item
---

# Regra "Fechamento do orçamento" — pessoas por cartão

Na tela **Fechamento do orçamento** o ERP valida que **cada item (cartão) tenha um número de pessoas vinculadas (`pedidos_pessoas_produtos`) igual à `quantidade` daquele item** (`itens_pedidos.quantidade`).

Mensagens geradas:
- "Falta(m) ser informada(s) N pessoa(s) neste cartão!" → item tem menos pessoas que a quantidade.
- "Foi(ram) informada(s) N pessoa(s) a mais neste cartão!" → item tem mais pessoas que a quantidade.

**Why:** No caso BOM PET, a inserção via DB (`addItemsToPedido`) vincula TODOS os beneficiários ao item BOM PET (seq 2, produto NOME DO PET) e NENHUM ao item principal (seq 1). Isso quebra a regra: item principal fica com 0 pessoas (qtd 1) e o item BOM PET fica com 2 pessoas (qtd 1).

**Onde a regra roda:** apenas na tela Fechamento (server-side do ERP). A API REST de criação (`OrcamentoSgprcUsuario`) NÃO executa essa validação e retorna sucesso — por isso o erro nunca chega na resposta do save. Para detectar no Bom Flow, é preciso uma query pós-insert contando pessoas por item vs `quantidade`.

**How to apply:** Ao montar itens BOM PET (ou multi-beneficiário em geral), a distribuição de pessoas por item e a `quantidade` de cada item precisam bater. Não basta criar o item BOM PET separado e jogar todos os beneficiários nele.
