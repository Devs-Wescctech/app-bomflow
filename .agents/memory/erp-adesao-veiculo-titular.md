---
name: ERP adesão veículo titular em branco
description: Por que a tela de Adesão do ERP mostra os dados do titular em branco em orçamentos COMBO com veículo (Bom Auto) enquanto em planos simples mostra.
---

# Adesão de veículo (Bom Auto/COMBO): dados do titular em branco no estado "Adesão Solicitada"

Em orçamentos Upsell/SGPRC, a tela nativa do ERP "Pessoas contratos / Adesão" pode mostrar os campos do titular (Endereço, Sexo, Estado civil, Profissão, RG, Fone) **em branco** quando o pedido é um **COMBO que inclui veículo (Bom Auto)** e está em situação **'I'** ("Adesão Solicitada, aguarde"). Num **plano simples (sem veículo)** os mesmos dados aparecem imediatamente.

**Why:** o cadastro do titular está completo e idêntico nos dois casos (mesma pessoa, mesmo `endereco_id`, mesmos telefones) — não é dado faltando nem write quebrado. A diferença é o **caminho de veículo** do ERP: a view `vw_dados_contrato_titular_api` (fonte de titular para contratos de veículo) só retorna linhas quando há `contratos_servicos` e o pedido está em situação **'A' ou 'P'** (produto `produtos_vh` com `preco_informado>1`, documento CPF tipo 580). Em 'I' ela devolve vazio. Em `pedidos_pessoas_produtos` do COMBO, o item do veículo tem `titular_id` apontando para a linha do próprio veículo (pessoa_id NULL) e o item do pet para a linha do pet — só o item principal aponta para o titular real.

**How to apply:** antes de tratar "titular em branco na adesão de veículo" como bug do nosso fluxo de orçamento, verificar a situação do pedido. Se estiver em 'I' (aguardando adesão), o esperado é que os dados do titular do caminho de veículo apareçam só após a adesão ser aprovada/ativada (A/P). Conferir consultando `vw_dados_contrato_titular_api` por `pedido_id` e a situação em `pedidos.situacao`. A tela é nativa do ERP (não há referência a essa view no nosso código), então não dá para mudar a renderização pelo nosso lado — só o que gravamos.
