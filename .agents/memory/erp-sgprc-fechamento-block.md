---
name: ERP PrePropostaUsuarioSgprc FECHAMENTO block fails via REST
description: Why orçamento creation via the ERP REST API stops at the SGPRC_USUARIO closing block
---

# PrePropostaUsuarioSgprc — bloco FECHAMENTO falha via API REST

`POST /PrePropostaUsuarioSgprc` (proxy `/api/erp/pre-proposta`) cria o cabeçalho do orçamento mas retorna **HTTP 200 com corpo de erro**:

```json
{
  "block": "SGPRC_USUARIO.CAD_ORCAMENTO_SGPRC_USUARIO_FECHAMENTO",
  "error": "User does not has access to list records from object!",
  "user": "acesso.api"
}
```

## O que foi descartado (confirmado, não repetir)
- **Permissão de papel**: `acesso.api` é super admin com acesso total de listar/ler tudo (confirmado pelo usuário no ERP admin).
- **`usuario_inclusao`**: não muda o contexto de execução — o ERP sempre usa o dono do token (`acesso.api`). É só auditoria.
- **`usua_produtos`**: não é a causa; remover (deixar de auto-preencher com produto_id) não altera o erro.
- **`produtos`/`preco_informado`**: enviar como número correto não altera o erro.
- **Estabelecimento**: `LIMEIRA - CNPA` (fixo) é o correto segundo o usuário — não é problema de acesso a estabelecimento.
- **`contratante_pessoa`**: usa o campo `pessoa` (ex "2") do GET /Pessoas, não o `id` — correto.

## Causa provável (arquitetural)
O bloco FECHAMENTO dispara quando há dados de beneficiário (`usua_*`). A API REST do ERP (Bearer token) **não executa esse bloco de escrita** — a mensagem "does not has access to list records" é o sintoma genérico dessa limitação.

**Evidência forte:** o próprio codebase já contorna a API REST escrevendo **direto no banco do ERP** (`backend/src/services/erpDbService.js`, `registerAgentInCanal` → INSERT em `pessoas_contratos` usando ERP_DB_HOST/USER/PASSWORD). Ou seja, já existe precedente de que escritas no ERP são feitas por INSERT direto, não pela API REST. Há também o secret ausente `ERP_SESSION_ID`, sugerindo que algumas operações exigem sessão web, não Bearer token.

**Why:** depois de esgotar todas as variações de payload e confirmar super admin + estabelecimento corretos, o erro nunca muda — indica limitação do canal de escrita (REST), não dos dados.

**How to apply:** se for preciso gravar o orçamento completo (com produto/valor/beneficiário) no ERP, as opções reais são (a) o time do ERP habilitar o bloco FECHAMENTO via API REST/documentar os campos exigidos, ou (b) replicar a escrita via INSERT direto no banco (como `registrar-canal` faz) — decisão que exige conhecimento do schema de orçamento/SGPRC_USUARIO e aval do usuário. Não insistir em mais variações de payload na API REST.
