---
name: ERP user creation email conflict
description: Why ERP (Bom Pastor) POST /Usuarios always fails with an "e-mail já utilizado" error, and what cannot fix it from our payload.
---

Creating a login in the Bom Pastor ERP via `POST /Usuarios` (proxied in `backend/src/routes/erpProxy.js`) fails 500 with
"Pessoa X não pode ser utilizada pois possui um e-mail já sendo utilizado pelo usuário <conta>".

**Root cause (proven by direct ERP API testing):** the ERP attributes the *API token owner's* email to every new Pessoa
created through the API, so the user-creation uniqueness check always collides with that token-owner account. The
`email`/`e_mail` we send is ignored.

**Why:** the API token in `ERP_AUTH_TOKEN` belongs to a real ERP user account (a super-user). A fresh Pessoa created via
`POST /Pessoas` always comes back with `meios_contato: []` (no own email), and the ERP falls back to the token owner's email.

**How to apply / what does NOT work (all tested, all give the same error):**
- sending a unique `email` on POST /Usuarios (a unique address belonging to no one — still rejected)
- omitting `email`
- `e_mail` on POST /Pessoas (ignored outside "importação de bloco"; meios_contato stays [])
- changing `estabelecimento_padrao`
- with/without `copiar_direitos_de`
- adding `menu` + `sugerir_senha` to mirror a working user
- `POST /EnderecosPessoas` with tipo_endereco "E-MAIL" → "Valor inválido para o campo Tipo de endereço"

**The only working reference user was created through the ERP screen (UI), not the API** — the UI sets the Pessoa's own
email. There is no documented API endpoint to set a Pessoa's email/contact.

**A second integration token was tested (read-only diagnosis, secret untouched), including the two strongest isolations:**
(1) an *exclusive email was added to that token's own service account*, and (2) a *brand-new Pessoa was created via POST
/Pessoas using that very token* and then used for the user-creation attempt. BOTH still fail naming the same super-user
account. This is conclusive: the stamped email is a **fixed GLOBAL default inside the ERP** for API-created users — it does
NOT come from the token's account, nor from the Pessoa, nor from anything we send. A fresh Pessoa always returns
`meios_contato: []` and the ERP falls back to that global default, which collides with the default account. Therefore no
client-side change (token swap, adding an email to the token account, fresh pessoa, payload tweaks) can fix it. The ERP doc
also confirms there is no token-generation endpoint: the Bearer token is a single static integration credential requested
from the admin and used on every request (it identifies the caller, never the user being created — "one token per login"
is not a thing).

**Token-owner ruled out (confirmed by the ERP admin):** the tested token belongs to a *separate* service account
(`acesso.api`) that even had its own exclusive email added — and creation STILL stamps the same super-user's email. So the
fallback is NOT the caller's email; it is a fixed ERP-side default. This is the strongest possible isolation.

**Why we cannot set the Pessoa's email via API (all doc-confirmed):**
- `e_mail` on POST /Pessoas works ONLY in the "importação de bloco" operation; on a normal POST it is ignored and
  `meios_contato` stays `[]`. (The email would be stored under the NFE-email address type, per preference
  `PESSOAS.CAD_PESSOAS.TIPO_ENDERECO_EMAIL_NFE_ID`.)
- POST /EnderecosPessoas only exposes `tipo_endereco` values `ENDERECO_COMERCIAL` / `ENDERECO RESIDENCIAL` — there is no
  documented email type, and `"E-MAIL"` is rejected. The actual configured email-type name is an ERP preference we don't
  know. If the admin gives us that exact configured email `tipo_endereco` value, we could POST the Pessoa's own email and
  the marcelo fallback would never trigger (potential client-side fix).

**Resolution requires ERP-side action (not our code):** (a) change/remove the fixed default email used for API-created
users, OR (b) give us the configured email `tipo_endereco` value so we can set the Pessoa's email via /EnderecosPessoas,
OR (c) adjust the validation / honor the email param. Do not keep adding blind payload workarounds.
