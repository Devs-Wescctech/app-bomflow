---
name: ERP Fechamento + Pagamento (orçamento Upsell)
description: Como replicar no Bom Flow o processo manual do ERP que move o orçamento de "M" para "I" e registra a guia Pagamento.
---

# Contexto
Depois de criar o orçamento (API REST cria o cabeçalho em situação "M"), o ERP exige duas etapas manuais que o Bom Flow agora automatiza via gravação direta no banco do ERP (não há endpoint REST):
1. **Fechamento**: muda `pedidos.situacao` de "M" → "I".
2. **Pagamento**: registra a guia em `modos_pagamentos`.

**Why:** o ERP não expõe endpoint REST para fechamento nem pagamento; o padrão já existente no projeto (addItemsToPedido/finalizeOrcamentoDB) é gravar direto no banco. Usuário aprovou explicitamente a gravação direta, incluindo situação e campos fiscais.

# Convenção crítica: modos_pagamentos.id == pedido_id
`modos_pagamentos.id` é PRIMARY KEY e **sempre** igual ao `pedido_id` (não usa sequence). `pedidos.modo_pagamento_id` aponta de volta = pedido_id. Por isso o upsert usa `ON CONFLICT (id)`.

# Regras de estado
- Só fechar pedidos em situação "M" (validar antes do UPDATE — evita transicionar pedido já aprovado/cancelado).
- O fluxo PARA em "I" por decisão do usuário; a aprovação ("I" → "A") continua MANUAL no ERP.
- `plano_pagamento_id` é obrigatório no fluxo: sem ele o orçamento ficaria preso em "M". Backend valida com 400 antes de criar o cabeçalho.

# Plano de pagamento
- O vendedor ESCOLHE o plano de uma lista real (`GET /api/erp/planos-pagamento` → `SELECT ... FROM planos_pagamentos WHERE ativo='S' AND valido='S'`) e DIGITA a quantidade de parcelas.
- `prazo_pagamento_id` do pedido = id do plano escolhido (antes era fixo 1643483).
- `pedidos.numero_parcelas` = numero_parcelas do plano (informativo); `modos_pagamentos.quantidade_parcelas` = valor digitado pelo vendedor.

# Campos fiscais no fechamento
No UPDATE de fechamento, o ERP zera `valor_ipi`, `outros_valores`, `valor_total_base_icms_st`, `valor_total_icms_st`, `outros_valores_nao_influencia`, `valor_total_diferencial_icms`; seta `valor_total_pedido`/`valor_saldo` = valor_total, `data_emissao_pedido_analise = CURRENT_DATE`, `data_alteracao = NOW()`.

# Tratamento de erro
Tudo numa transação (BEGIN/COMMIT/ROLLBACK). Se o fechamento/pagamento falhar, o endpoint retorna 502 com `incomplete:true` (o orçamento ficou em "M") — falha visível, nunca silenciosa.
