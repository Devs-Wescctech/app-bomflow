# Backfill de atendimentos ERP

## Situação do inventário de produção

Consulta somente leitura feita em 15/09/2026: a base publicada possui 45 tabelas,
mas ainda não possui `bom_auto_atendimentos`, `bom_pet_atendimentos` nem
`erp_atendimento_outbox`. Portanto, nesta data, não há protocolos de produção
disponíveis para classificar. O inventário deve ser gerado novamente após a
primeira publicação desta estrutura.

## Prévia revisável

No ambiente que será inventariado, execute:

```sh
cd backend
node scripts/erp-atendimento-backfill.mjs \
  --environment-label=production \
  --output=../erp-atendimento-backfill-preview.json
```

O comando faz somente `SELECT` na base local e nas tabelas espelho do ERP. A saída
separa Bom Auto e Bom Pet e classifica cada protocolo como:

- `elegivel`: completo e ausente no ERP;
- `ja_sincronizado`: outbox concluída ou protocolo já presente no ERP com a mesma identidade;
- `impedido`: campo obrigatório ausente ou protocolo presente no ERP com identidade divergente.

Também distingue `historico_sem_outbox` de `ja_enfileirado`, incluindo status,
tentativas e último erro da fila.

## Preparação sem envio

Após revisar a prévia, mova no máximo 20 protocolos aprovados para `held`. O
código impõe esse teto mesmo que um limite maior seja informado:

```sh
node scripts/erp-atendimento-backfill.mjs --stage \
  --protocols=BA...,BP... --limit=20
```

Antes de inserir, o comando refaz a prévia e aceita somente registros elegíveis,
históricos e ainda sem outbox. `held` é idempotente por módulo, atendimento e
protocolo e é ignorado pelo worker. Repetir o staging não cria duplicatas, não
altera itens `pending`, `processing`, `error` ou `completed` e não escreve no ERP.

## Liberação após autorização explícita

Somente após autorização do usuário:

```sh
node scripts/erp-atendimento-backfill.mjs --release \
  --protocols=BA...,BP... --limit=20 \
  --confirm=LIBERAR_BACKFILL_ERP
```

A liberação revalida os campos e a ausência do protocolo no ERP, e altera apenas
itens `held` aprovados para `pending`. Se o protocolo surgir no ERP entre a prévia
e o processamento, o upsert idempotente não sobrescreve os dados existentes.
O worker existente
processa lotes pequenos sem bloquear novos atendimentos. Progresso e falhas são
acompanhados em `erp_atendimento_outbox` por `status`, `attempts`, `last_error`,
`next_retry_at`, `updated_at` e `completed_at`. Para interromper, não libere o lote
seguinte; itens ainda em `held` permanecem inertes. Colisões de protocolo ficam em
erro terminal e não são retomadas automaticamente.