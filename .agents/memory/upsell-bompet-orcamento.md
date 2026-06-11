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
