---
name: ERP data de admissão obrigatória no Fechamento
description: Por que o Fechamento (M→I) falha para cliente novo e como garantir a data de admissão.
---

# Data de admissão é obrigatória no Fechamento do pedido

A trigger `tr_pedidos` (no UPDATE) bloqueia a transição `situacao = 'I'` se o
contratante (`pedidos.cliente_id`) NÃO tiver um documento de admissão:
`RAISE EXCEPTION 'Não é possivel concluir a venda sem preencher a data de admissão!'`
A verificação é: existe linha em `documentos_pessoas` com
`tipo_documento_id = 2657422` e `pessoa_id = pedidos.cliente_id`.

**Why:** Clientes NOVOS (recém-criados pela API ao gerar o orçamento) ainda não
têm esse documento, então o Fechamento via DB direto para em "M".

**How to apply:** Antes do UPDATE M→'I', garantir o documento de admissão do
contratante de forma idempotente (só insere se não existir):
- tabela `documentos_pessoas`, `id = nextval('pk_sequence')`, `pessoa_id = cliente_id`,
  `tipo_documento_id = 2657422`, `documento = to_char(CURRENT_DATE,'DD/MM/YYYY')`,
  `pesquisa = to_char(CURRENT_DATE,'DDMMYYYY')` (demais colunas podem ficar NULL).
- A trigger `tr_documentos_pessoas` valida o documento de admissão: formato exato
  `DD/MM/YYYY` (length 10, '/' nas posições 3 e 6), data **não futura** e **no máximo
  20 dias atrás** (`> CURRENT_DATE-20`). Por isso a data de HOJE sempre passa, mas
  reaproveitar datas antigas (>20 dias) seria recusado.
- Clientes que já têm a data de admissão não devem ser alterados (idempotência).
