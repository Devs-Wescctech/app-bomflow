---
name: Perspectivas CPF format & NOT IN NULL quirk
description: Canonical CPF format in erp_perspectivas_negocios and the SQL NOT IN/NULL gotcha in the comissão Perspectiva filters.
---

# Perspectivas CPF: formato canônico = só dígitos

CPF em `erp_perspectivas_negocios` (`cpf_indicador`/`cpf_indicado`) é canônico
**apenas dígitos** (11 dígitos, sem pontuação). A lógica de Perspectiva
(`runPerspectivaBatch`, `getPerspectivaReportData`) sempre agrupa/compara por
CPF normalizado por dígitos, então o formato gravado não afeta agrupamento nem
valores de comissão — só buscas/relatórios visuais.

**Why:** dados vinham em formatos mistos (pontuado vs dígitos). Saneamento via
`backend/scripts/normalize_perspectivas_cpf.mjs` (idempotente, valida
antes×depois, ROLLBACK se divergir).

## Normalizar na entrada (não só saneamento)
Todo write em `erp_perspectivas_negocios` deve gravar CPF já só com dígitos para
não reintroduzir pontuação a cada sync. Pontos cobertos: sync ERP + backfills CRM
(`checkPerspectivaNegocios`/`checkValidacaoPagamento` em `automationService.js`),
insert/update em tempo real no PUT `/referrals/:id` (`entities.js`). JS usa
`(v||'').replace(/\D/g,'')||null`; SQL usa
`NULLIF(regexp_replace(COALESCE(x,''),'[^0-9]','','g'),'')`.

**How to apply:** dedups por par CPF (NOT EXISTS / IS NOT DISTINCT FROM) devem
normalizar **os dois lados** com `regexp_replace`, senão linhas legadas ainda
pontuadas geram falso-negativo e duplicam. O diagnóstico
`/commission-perspectiva/sem-registro-erp` (`functions.js`) também compara por
dígitos pela mesma razão.

## Gotcha crítico: `NOT IN` + NULL nos filtros de exclusão
Os filtros de comissão excluem 2 CPFs hardcoded. Em SQL, `NULL NOT IN (...)`
=> NULL (falsy), então linhas com `cpf_indicador` NULL eram silenciosamente
**excluídas** do relatório (era 523 linhas, não 820). Esse é o comportamento
correto/esperado atual.

**How to apply:** ao mexer nesses filtros, use
`regexp_replace(cpf_indicador,'[^0-9]','','g') NOT IN (<CPFs hardcoded no código>)`.
Os 2 CPFs literais ficam no código-fonte dos filtros de comissão (não aqui).
`regexp_replace(NULL)` retorna NULL, então a semântica de exclusão de NULL é
preservada E o filtro fica format-agnostic. NÃO use `coalesce(...,'')` aqui —
isso transformaria NULL em '' e passaria a INCLUIR as ~297 linhas de CPF NULL,
mudando o total do relatório. Os literais são os mesmos 2 CPFs de sempre,
apenas convertidos para dígitos.
