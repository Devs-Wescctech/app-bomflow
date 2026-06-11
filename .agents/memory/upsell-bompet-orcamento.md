---
name: Upsell BOM PET — orçamento UX
description: Como o modo "BOM PET" mostra campos de pet no passo Beneficiários sem alterar o modelo/fechamento do ERP.
---

# Modo BOM PET no orçamento Upsell

No orçamento Upsell (`UpsellNovoOrcamento.jsx`) há três modos de beneficiário:
plano comum, BOM AUTO e BOM PET. Eles são detectados por **descrição de produto**,
não por flag no banco:

- **Plano/produto de pet do TITULAR**: descrição contém `BOM PET` (regex `/BOM\s*PET/i`).
  É o que liga o modo (`isBomPet`).
- **Produto de pet do BENEFICIÁRIO**: descrição contém `NOME DO PET` (`/NOME DO PET/i`).
  É o produto realmente vinculado a cada pet no ERP (`isPetProduto`/`petProdutoIds`).

## Decisão (opção escolhida pelo usuário)
O vendedor escolhe o plano de pet no passo **"Plano"** (titular). No passo
**"Beneficiários"**, os campos estruturados do pet aparecem assim que um card é
adicionado, **sem** o vendedor precisar selecionar o produto "NOME DO PET" no dropdown.

Como: `isPetCard` retorna true para todo card quando `isBomPet`; o produto de pet
(`petBenefProdutoId`) é **auto-atribuído** ao card (casando variante SAÚDE com o plano
do titular; senão o primeiro produto de pet). O dropdown de produto fica read-only nos
cards de pet. Um `useEffect` atribui/migra o produto correto a cards sem produto ou que
já são pet (cobre troca entre variantes BOM PET ↔ BOM PET SAÚDE), preservando os dados
já digitados (só troca `usua_produtos`).

**Why:** O fechamento no ERP é frágil (ver `erp-sgprc-fechamento-block.md`,
`erp-fechamento-pessoas-por-item.md`). Mudar o modelo de dados/payload (continuar
gravando `usua_produtos` = produto NOME DO PET + `usua_nome_completo` montado) quebraria
o fechamento. Por isso a mudança é só de UX/auto-atribuição; o produto de beneficiário
detectado por "NOME DO PET" continua sendo o vínculo real.

**How to apply:** Não reclassificar `isPetProduto` para `/BOM PET/i` (quebra a validação
do passo "Plano" e o fechamento). Mexer só na camada de UX. Mutual exclusão:
`isBomPet` exige `!isBomAuto`.

## Produtos DEPENDENTE 0,01 = produto de beneficiário
No mesmo orçamento, um produto é "de beneficiário" (some do passo "Plano"/titular e
aparece só no dropdown de Beneficiários) via `isProdutoBeneficiario` =
pet OU condutor OU veículo OU **dependente-0,01**. Produtos com "DEPENDENTE" no nome E
`preco_informado ≈ 0,01` são "vagas" de dependente sem custo → beneficiário. Produtos
DEPENDENTE com **preço real** (faixas etárias, ex.: "ESSENCIAL DEPENDENTES - 0 A 50
ANOS = 7") **continuam no titular** (Plano).

**Why:** decisão do usuário (opção "só os de 0,01 movem"). No ERP há ~137 produtos com
"DEPENDENTE": só ~48 são 0,01; os outros 89 têm preço real e são planos de titular.

**How to apply:** A regra é global por produto (sem guard por contrato) e está CORRETA:
os contratos dedicados `BOM PASTOR - BOM AUTO` e `BOM PASTOR - BOM PET` não contêm
produto DEPENDENTE 0,01, então ficam intocados; os "demais contratos" (DIGITAL, COMBO,
ESSENCIAL, etc.) são exatamente onde a regra deve valer. NÃO adicionar guard por modo —
bloquearia contratos legítimos que compartilham produtos de condutor/veículo/pet.

## Produtos DEPENDENTE pago (> 0,01) = item do titular MAS com beneficiário
Produtos DEPENDENTE com preço real (faixas etárias) continuam sendo **itens do titular
cobrados no passo "Plano"** (não viram produto de beneficiário), porém agora também
**abrem card de beneficiário** para cadastrar o(s) dependente(s) vinculado(s).
`isDependentePagoProduto` = "DEPENDENTE" no nome + `preco_informado` finito > 0,015.

**Why:** no ERP o item de dependente pago é vinculado **só ao(s) dependente(s)**, não ao
titular, e a **quantidade do item = nº de dependentes** (confirmado no pedido ERP real).
Sem cadastrar o beneficiário, o item ficava sem pessoa vinculada e o fechamento falha
(ver `erp-fechamento-pessoas-por-item.md`).

**How to apply:** dependente pago entra em `opcoesBenefProduto`
(`[...produtosBeneficiario, ...dependentePagoSelecionados]`) — só os SELECIONADOS no Plano.
`toggleProduto` nasce com `incluir_titular:false` para esses produtos (quantidade =
dependentes). Um `useEffect` (`depPagoSetupRef`, key = conjunto de ids selecionados)
auto-cria um card de beneficiário aberto por produto faltante; NÃO recria cards removidos
pelo vendedor enquanto o conjunto não mudar; pula `isBomAuto`. No passo Plano o checkbox
"Incluir titular" é escondido para esses itens (substituído por nota). Sem cobrança dupla:
o produto fica só em `produtosSel`, nunca em `produtosBeneficiario`/`benefItens`; o payload
manda beneficiários por item via `usua_produtos === produto_id`.

### Dependente pago NÃO é card de pet (mesmo em modo BOM PET)
Quando o orçamento está em modo BOM PET, `isPetCard = (b) => isBomPet || petProdutoIds.includes(...)`
forçava TODO card a virar card de pet — inclusive o card auto-criado de dependente pago,
que então mostrava campos de pet (nome/tipo/raça/cor/porte) com "Produto/plano = ESSENCIAL
DEPENDENTES". Bug aparece só num orçamento que tem AO MESMO TEMPO um plano BOM PET e um
produto dependente pago.

**Why:** o card de dependente pago tem produto próprio (id do DEPENDENTE) e usa os campos
COMUNS de beneficiário (CPF, nome, parentesco), nunca os de pet.

**How to apply:** passar `dependentePagoIds` (ids selecionados) ao Step5 e excluí-los do
`isPetCard`: `isPetCard = (b) => !dependentePagoIds.includes(id) && (isBomPet || petProdutoIds.includes(id))`.
A MESMA exclusão precisa entrar na validação de CPF (o `!(isBomPet || petProdutoIds...)` pulava
CPF de todos em modo BOM PET) e no título do card (`isPetCard(b)` em vez de `isBomPet` para o
rótulo "Pet N" vs "Beneficiário N"). A regra de pet por `petProdutoIds.includes` (sem isBomPet)
já exclui dependente naturalmente — só os pontos que usam `isBomPet` cru precisaram do ajuste.
