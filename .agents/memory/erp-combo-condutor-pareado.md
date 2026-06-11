---
name: COMBO sem produto de condutor — pareamento no Novo Orçamento
description: Por que contratos COMBO precisam de um card de condutor pareado (derivado do veículo, pré-preenchido com o titular) para o fechamento BOM AUTO não sair em branco.
---

# Contratos COMBO não trazem o produto "DADOS DO CONDUTOR"

No título de um contrato COMBO (ex.: "BOM PASTOR - COMBO MULTI ESPECIAL") o ERP lista
SÓ o produto "DADOS DO VEÍCULO" — **sem** o par "DADOS DO CONDUTOR". Já o BOM AUTO puro
("BOM PASTOR - BOM AUTO") traz os dois. Verificável via API_MV_API_PRODUTOS por contrato.

**Why:** por isso, na tela de Novo Orçamento, qualquer flag tipo `isBomAuto` que exija os
dois produtos no título resulta `false` no COMBO, e não nasce nenhuma pessoa real do lado do
auto — o fechamento/adesão do contrato BOM AUTO do combo então sai em branco.

**How to apply (regra do fluxo de orçamento):**
- `isBomAuto` (que monta 2 cards fixos e zera o resto) deve depender SÓ do produto de
  condutor presente diretamente no título — nunca do condutor "pareado". Senão o COMBO
  regride para o layout de BOM AUTO puro e apaga os outros beneficiários.
- O condutor EFETIVO no COMBO é pareado a partir do produto de veículo: troca
  "DADOS DO VEÍCULO" → "DADOS DO CONDUTOR" na descrição (mesma variante CLIENTES /
  NÃO CLIENTES) e busca esse produto na lista completa do ERP. O par fixo é
  CLIENTES 88588931(condutor)/88167567(veículo) e NÃO CLIENTES 88589037/88167862, preço 0,01.
- O card de condutor nasce com os dados do TITULAR (nome/CPF/sexo/telefone). Como no
  fechamento o endereço/contato do veículo é sempre do titular, o item do condutor com o
  CPF do titular reaproveita a pessoa real do contratante (dedup por CPF no backend
  addItemsToPedido) — e o fechamento preenche em vez de sair em branco.
- Sincronizar o par por efeito: adicionar o card condutor quando surge o card de veículo e
  removê-lo quando o veículo é retirado. Manter o produto do card travado (read-only) e fora
  do dropdown manual para o vendedor não desfazer o pareamento.
