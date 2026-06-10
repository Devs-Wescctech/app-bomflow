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
