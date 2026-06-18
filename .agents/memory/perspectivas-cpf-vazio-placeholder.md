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
