---
name: ERP pedido — CPF único por pessoa
description: O ERP bloqueia o mesmo CPF em "pessoas diferentes" dentro de um pedido; como gravar beneficiários sem rollback.
---

# Regra do ERP: CPF único por pedido

Ao gravar itens/beneficiários direto no banco do ERP (tabela `pedidos_pessoas`),
o ERP **não permite o mesmo CPF em pessoas diferentes dentro do mesmo pedido**
("Não é permitido cadastrar o mesmo cpf para pessoas diferentes dentro do pedido").
A violação dispara ROLLBACK de TODOS os itens — o cabeçalho do pedido já foi criado
pela API REST, então o pedido fica INCOMPLETO (abas produtos/usuários x produtos vazias).

**Why:** No BOM AUTO o "condutor" frequentemente é o próprio titular/contratante,
então enviar o condutor como beneficiário com o mesmo CPF do contratante colide.
O contratante é inserido automaticamente pela API (linha `pedidos_pessoas` com
`pessoa_id IS NOT NULL`).

**How to apply:** Ao montar os beneficiários, dedup por CPF dentro do pedido —
reaproveite a pessoa já existente (mesma `pedidos_pessoas.id`) em vez de inserir
nova linha; crie apenas o vínculo em `pedidos_pessoas_produtos`. Beneficiários sem
CPF (ex.: o card do veículo, cujo texto vai em `nome_pessoa`) podem inserir pessoa
nova normalmente (CPF NULL não colide). Se a dedup remover um vínculo dentro do
MESMO item, ajuste `itens_pedidos.quantidade` (e colunas de quantidade + valor)
para continuar batendo com a regra do Fechamento (pessoas vinculadas == quantidade).
