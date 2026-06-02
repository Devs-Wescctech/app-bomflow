---
name: ERP Usuarios API write limitations
description: Which fields the BOMPASTOR ERP REST API actually persists on Usuarios create/update
---

# ERP Usuarios (BOMPASTOR) — campos somente-leitura na API REST

A integração cria/edita usuários do ERP via REST com Bearer token (`erpProxy.js`, `/Usuarios`). Nem todo campo visível no GET é gravável.

## acesso_todos_estabelecimentos (radio "Outros estabelecimentos")
- **NÃO é gravável via API REST.** POST e PUT retornam HTTP 200 mas o valor não muda (testado: partial PUT, full-record PUT, POST na criação, vários nomes/valores candidatos — todos ignorados).
- O ERP só persiste esse campo pela **tela web interna** (servlet `CadUsuarios`, dica: campo `menu_padrao` vem como HTML `<a href="CadMenu?Z_ACTION=...">`). Esse servlet usa sessão web, não o Bearer token da API.
- `copiar_direitos_de: 'base.upsell'` (passo 2 do PUT) **não** copia esse campo, mesmo `base.upsell` tendo `"S"`.
- Valores observados: `"S"` = Automático para todos; ausente/`"N"` = Sem automatização (manual). Endpoint de **busca/lista** (`/Usuarios?login=`) não retorna o campo; só o **GET por ID** (`/Usuarios/{id}`) retorna.

**Conclusão prática:** "Automático para todos os estabelecimentos" não pode ser setado pela integração BomFlow→ERP. Tem que ser manual no ERP, ou o time do ERP precisa expor o campo na API / embutir no `copiar_direitos_de`.

**Why:** usuário pediu para novos agentes nascerem com acesso a todos estabelecimentos; adicionar o campo ao payload parecia resolver mas o ERP descarta silenciosamente (200 sem efeito).
