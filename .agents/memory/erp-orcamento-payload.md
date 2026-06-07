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
