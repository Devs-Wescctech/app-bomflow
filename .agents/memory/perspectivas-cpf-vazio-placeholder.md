---
name: Perspectivas cpf_indicado '' vs NULL placeholder
description: Why empty-string cpf_indicado caused duplicate commission rows and the rule for placeholder handling/unification.
---

# cpf_indicado '' (string vazia) deve ser tratado como NULL

Indicação fechada como ganho sem CPF do indicado gera uma linha "placeholder"
em `erp_perspectivas_negocios`. Legado gravava `cpf_indicado = ''`; a regra de
unificação/dedup só reconhecia `IS NULL`, então o UPDATE que preenche o CPF
depois não casava o placeholder e o dedup do INSERT não batia — criando uma
segunda linha (duplicata de comissão) quando o CPF real chegava.

**Why:** a fonte do relatório "Registros de Comissão (ERP)" inflava comissões
(ex.: par indicador+nome_indicado com uma linha '' e outra com CPF real + dados
de pagamento).

**How to apply:**
- Todo write de `cpf_indicado` já normaliza '' → NULL (JS `||null`, SQL
  `NULLIF(regexp_replace(...),'')`/`normalizeCpf`). Mantenha assim.
- Os UPDATEs de unificação (preenchem cpf_indicado em linha CRM existente) devem
  casar placeholder por `(cpf_indicado IS NULL OR regexp_replace(cpf_indicado,'[^0-9]','','g') = '')`,
  não só `IS NULL`. Pontos: PUT `/referrals/:id` (entities.js) e backfill CRM
  (automationService `syncPerspectivaNegociosFromERP`).
- Limpeza one-off de dados legados: `backend/scripts/cleanup_perspectivas_cpf_vazio.mjs`
  (transacional, idempotente, `--dry-run`). Remove placeholder vazio/nulo SEM
  dados reais (lote/pago/data_pagamento/perspectiva nulos) quando há par real
  por cpf_indicador(dígitos)+nome_indicado; normaliza '' → NULL nos órfãos.
  Prod é self-hosted: rodar manualmente, não vai por deploy automático.

## Backstop no banco para placeholders (índice único parcial)
Além da dedup na aplicação, há índice único parcial `idx_erp_perspectivas_crm_placeholder`
(schema.sql) em `(regexp_replace(cpf_indicador,dígitos), nome_indicado)` com
`WHERE origem='crm' AND (cpf_indicado IS NULL OR dígitos='')`. Complementa o
`idx_erp_perspectivas_crm_par` (que só cobre pares com ambos CPFs). Ao preencher
cpf_indicado, a linha sai deste índice e passa a ser coberta pelo de par.
**Why:** sem o índice, dois placeholders idênticos podiam coexistir em corrida/caminhos
não previstos (o INSERT em tempo real nem tinha NOT EXISTS p/ o caso $4 IS NULL).
**How to apply:** o INSERT em PUT `/referrals/:id` agora dedup também o caso placeholder
(cpf_indicador + nome_indicado) — espelha o índice; o índice é o backstop final.

## Gotcha 42P08: cast ::text nos parâmetros do INSERT...SELECT de perspectivas
O INSERT `... SELECT $1,$2,$3,$4 ... WHERE NOT EXISTS (... regexp_replace(...) IS NOT
DISTINCT FROM $n ...)` usa o MESMO parâmetro tanto em coluna varchar (SELECT) quanto
em comparação text (regexp_replace / IS NOT DISTINCT FROM). Postgres não consegue
deduzir um tipo único → erro `42P08 inconsistent types deduced for parameter`.
A versão antiga falhava silenciosamente (try/catch) e só o backfill cron gravava.
**How to apply:** force `$2::text`/`$3::text`/`$4::text` no SELECT E na comparação
(text→varchar é assignment cast válido na coluna). Verificado: pool.query autocommita
por conexão, então BEGIN/ROLLBACK em testes via `query()` NÃO isolam — use uma única
conexão dedicada ou um identificador descartável (ex.: nome_indicador fixo) e limpe depois.
