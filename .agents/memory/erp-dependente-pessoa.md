---
name: ERP dependentes como Pessoa + CPF no banco
description: Como cadastrar beneficiários de produto DEPENDENTE como Pessoa global do ERP e onde o CPF vive no banco.
---

# Dependentes do orçamento viram Pessoa no ERP

## Onde o CPF vive no banco do ERP
- A tabela `pessoas` NÃO tem coluna de CPF. O CPF fica em `documentos_pessoas`
  com `tipo_documento_id = 580` e é gravado SEMPRE formatado (`000.000.000-00`).
- `pedidos_pessoas.pessoa_id` é FK para `pessoas.id`. O titular já vem com esse
  campo preenchido (a API REST do orçamento cria a Pessoa dele); beneficiários
  historicamente entravam com `pessoa_id = NULL` (só dentro do pedido).
- `POST /Pessoas` retorna `id` = a PK de `pessoas` (~300M), utilizável direto como
  `pessoa_id`. (Mesma forma usada na criação de agentes: `tipo_pessoa:'Física'`,
  `situacao:'A'`, `nome_completo`, CPF dentro de `documentos`.)
- **`data_nascimento` É campo de RAIZ no POST /Pessoas** (formato `YYYY-MM-DD`) e
  persiste (confirmado por echo + GET /Pessoas/{id}). Diferente do CPF, que precisa
  ir dentro de `documentos`. Sem enviar `data_nascimento`, a Pessoa global nasce com
  nascimento em branco mesmo que `pedidos_pessoas.data_nascimento` esteja preenchido.

## Decisão de negócio (acordada com o usuário)
- Beneficiários de produtos **DEPENDENTE** (vaga 0,01 E faixa etária paga) devem ser
  cadastrados como Pessoa global do ERP e vinculados via `pessoa_id`.
- **Condutor/veículo/pet NÃO** entram nessa regra (veículo/pet não são pessoa).
- Dependente **sem CPF válido** segue como hoje (só no pedido, `pessoa_id` NULL) —
  não bloquear o orçamento nem criar Pessoa "fantasma" sem CPF.
- **Lookup-first por CPF**: reaproveitar Pessoa existente; só criar se não existir.
  **Why:** o ERP bloqueia o mesmo CPF em pessoas diferentes e faz rollback do pedido inteiro.

## Como aplicar
- A resolução (lookup/criação via HTTP) roda FORA da transação de banco — nunca
  segurar a conexão/locks durante chamadas HTTP ao ERP. Resolver `pessoaId` antes,
  gravar no INSERT depois.
- Não confundir com o dedup por CPF já existente dentro do pedido
  (`cpfToPessoaId` → `pedidos_pessoas.id`), que é separado do `pessoa_id` global.
