---
name: ERP itens_pedidos tipo_produto_id/descricao
description: Segunda causa de NPE no Fechamento do ERP (apresentarValoresOrcamento) ao criar orçamentos por DB direto.
---

# itens_pedidos exige tipo_produto_id (e descricao) para o Fechamento

Ao criar itens de pedido por INSERT direto no banco do ERP, **sempre** preencher
`itens_pedidos.tipo_produto_id` e `itens_pedidos.descricao`, copiando do cadastro do
produto (`produtos.tipo_produto_id` / `produtos.descricao`).

**Why:** a tela de Fechamento (`CadOrcamentoSgprcUsuarioFechamento.apresentarValoresOrcamento`)
percorre os itens e desreferencia `tipo_produto_id` ao apresentar/calcular os valores.
Se ficar NULL, estoura NPE (`preRecord` → `apresentarValoresOrcamento`). Orçamentos
criados pelo próprio ERP gravam ambos os campos em todos os itens. Esta é uma causa
**separada** do NPE de beneficiários (data_nascimento/sexo/telefone NULL): um orçamento
pode ter os beneficiários OK e ainda assim falhar aqui por causa do item.

**How to apply:** no `addItemsToPedido` (erpDbService.js), buscar
`SELECT descricao, tipo_produto_id FROM produtos WHERE id=$1` por produto e gravar nas
colunas correspondentes do INSERT em itens_pedidos. Para orçamentos já criados sem esses
campos, fazer backfill: `UPDATE itens_pedidos ip SET descricao=p.descricao,
tipo_produto_id=p.tipo_produto_id FROM produtos p WHERE ip.produto_id=p.id AND ip.pedido_id=<id>`.

# Segunda causa no MESMO NPE: pedidos.valor_desconto NULL

`apresentarValoresOrcamento` também desreferencia **`pedidos.valor_desconto`** ao apresentar
os valores. Nos orçamentos do ERP esse campo é SEMPRE preenchido (0.00 quando não há
desconto) — verificado: 0 nulos em 2191 aprovados. Os criados pela REST OrcamentoSgprcUsuario
deixam NULL → NPE no Fechamento, mesmo com itens já corrigidos (tipo_produto_id/descricao OK)
e beneficiários OK. `data_emissao` também fica NULL na REST e é preenchida nos aprovados.

**How to apply:** no `applyFechamentoEPagamento`, no UPDATE do fechamento (M→I), incluir
`valor_desconto = COALESCE(valor_desconto, 0)` e `data_emissao = COALESCE(data_emissao, CURRENT_DATE)`.
Backfill de orçamentos antigos: `UPDATE pedidos SET valor_desconto=COALESCE(valor_desconto,0),
data_emissao=COALESCE(data_emissao,CURRENT_DATE) WHERE id=<id>`.
NOTA: `modos_pagamentos.quantidade_parcelas=12` NÃO é causa (277 aprovados têm exatamente isso).
