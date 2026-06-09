---
name: ERP Orçamento payload rules
description: Campos obrigatórios e formatos para POST /PrePropostaUsuarioSgprc
---

## Regra crítica: usuario_inclusao

O token de serviço `ERP_AUTH_TOKEN` pertence ao usuário `acesso.api`, que **não tem permissão** para o bloco `SGPRC_USUARIO.CAD_ORCAMENTO_SGPRC_USUARIO_FECHAMENTO`. Sem `usuario_inclusao` no payload, o ERP usa `acesso.api` e retorna:
```json
{ "block": "SGPRC_USUARIO.CAD_ORCAMENTO_SGPRC_USUARIO_FECHAMENTO",
  "error": "User does not has access to list records from object!", "user": "acesso.api" }
```

**Fix:** injetar `usuario_inclusao` no payload com o login ERP do agente autenticado.

**Derivação do login ERP a partir do email:**
```js
function erpLoginFromEmail(email) {
  const atIdx = email.indexOf('@');
  const local = email.slice(0, atIdx).toLowerCase();
  const domain = email.slice(atIdx + 1).replace(/\.[^.]+$/, '').toLowerCase();
  return `user.${local}.${domain}`;
}
// teste3@bomflow.com → user.teste3.bomflow
```

Implementado em `erpProxy.js` (injeta automaticamente do `req.user.email` se não vier no body) **e** em `ErpOrcamentoForm.jsx` (mostra no preview do payload).

**Why:** o `erpLogin` é campo temporário de UI nos Agentes (não persiste no banco). Derivação do email é a única fonte confiável em runtime.

## Produtos

- `produtos` deve ser **número** (produto_id), não string CSV. Ex: `81105507` não `"81105507"`.
- `preco_informado` deve ser incluído do objeto produto ERP (ex: `40`).
- Campos do produto ERP: `{ id, produto_id, preco_informado, contrato_id, titulo_contrato, descricao }` onde `id === produto_id`.

## Beneficiário

- `usua_produtos` deve ser o `produto_id` numérico — auto-preenchido ao selecionar produto na seção Plano.
- `usua_produtos` no payload é coerced para Number se o valor for numérico.

## Campos ausentes descobertos em 2026-06-08 (hipótese payload incompleto)

Comparando nosso payload com pedidos aprovados reais no DB do ERP, dois campos aparecem em **100% dos aprovados** e nunca enviamos:

| campo | tipo | valor observado | adicionado ao payload? |
|---|---|---|---|
| `dia_vencimento` | integer | 10 (maioria) ou 5 | ✅ sim (editável, default 10) |
| `prazo_pagamento_id` | bigint | (antes fixo) | ✅ agora vem do plano escolhido pelo vendedor — ver [erp-fechamento-pagamento](erp-fechamento-pagamento.md) |

Também existe `condicao_pagamento_id` no schema mas é NULL em todos os aprovados → não obrigatório.

**Hipótese:** o ERP pode retornar erro genérico "User does not has access..." quando o payload está incompleto para o FECHAMENTO, mesmo que o real problema seja validação e não permissão. Teste 1: enviar com `dia_vencimento + prazo_pagamento_id` → observar se a mensagem muda.

## Problema de formato no usuario_inclusao para vendedores nativos ERP

Vendedores nativos do ERP (ex: leonardo) têm login `firstname.lastname` (ex: `leonardo.silva`). Nossa derivação gera `user.firstname.domain` — formato INCORRETO para eles. Contas `user.*` criadas pelo BomFlow existem no ERP mas têm **zero funções** e nunca criaram um pedido aprovado. O campo `usuario_inclusao` provavelmente não troca o contexto de permissão do token (isso confirma o diagnóstico de camada de sessão).

**Why:** todos os pedidos aprovados (situacao='A') têm usuario_inclusao_id de contas com login `firstname.lastname`, nunca de contas `user.*`.
