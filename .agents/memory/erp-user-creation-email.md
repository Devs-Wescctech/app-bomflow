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

**A second, different integration token was later tested (read-only diagnosis, secret untouched):** it authenticates fine
(GET returns 200) but reproduces the *identical* collision — creating a user for a fresh email-less Pessoa still fails
naming the same super-user account. This shows the stamped email is a system/config default for API-created users, not
strictly a property of which token account calls. So simply swapping the token (without it being a dedicated service
account whose email does not collide) does NOT fix it. The ERP doc confirms there is no token-generation endpoint: the
Bearer token is a single static integration credential requested from the admin and used on every request (it identifies
the caller, never the user being created — so "one token per login" is not a thing).

**Resolution requires ERP-side action (not our code):** get a dedicated integration token not tied to a real user's
email, OR have the ERP team adjust the validation / expose a way to set a unique Pessoa email via API. Do not keep
adding payload workarounds — they cannot fix a server-side behavior.
