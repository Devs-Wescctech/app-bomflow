---
name: ERP user creation email conflict
description: ERP (Bom Pastor) POST /Usuarios "e-mail já utilizado" error is triggered by the `ativo` field; omitting it bypasses the check. A separate salvarFuncoesUsuario NPE then surfaces on synthetic pessoas.
---

## ⭐ BREAKTHROUGH (latest, supersedes the "ERP-side only" conclusion below)

The empty-email collision on `POST /Usuarios` is **triggered by sending the `ativo` field**. Proven by adding
one field at a time to a minimal payload (login+pessoa+estabelecimento_padrao) against an email-less pessoa, with a
duplicate login so nothing persists: ONLY `ativo:"S"` reproduced the email-collision error; `senha_prot`, `super_usuario`,
`observacoes`, `copiar_direitos_de`, and `email` all passed the email check (failed only on the intended duplicate-login).

**Fix applied client-side:** stop sending `ativo` (it is `Requerido: Não` in the ERP doc). The proxy
(`backend/src/routes/erpProxy.js` POST /usuario) and `src/pages/Agents.jsx` now send only the necessary documented fields:
`login`, `pessoa`, `estabelecimento_padrao` (always 104) + `senha_prot` + `copiar_direitos_de`. No `ativo`, `email`,
`super_usuario`, `observacoes`.

**New blocker uncovered once `ativo` is removed:** the create then fails with
`null pointer em br.com.eligo.intf.CadUsuarios.salvarFuncoesUsuario linha 2457`. **CONFIRMED on a real CPF via the UI**
(not only synthetic API pessoas), so it is NOT a synthetic-pessoa artifact. Failed creates roll back (no user persists).
Per the ERP doc, only `login` + `pessoa` are `Requerido: Sim`; everything else (estabelecimento_padrao, copiar_direitos_de,
menu, grupo, funcoes, sugerir_senha...) is optional. `funcoes` = "Funções do sistema atribuídas ao usuário".
**RESOLVED — salvarFuncoesUsuario NPE is non-fatal on POST.** Confirmed by live ERP tests:
- The NPE fires on EVERY POST /Usuarios create (with or without copiar_direitos_de, with or without menu) — it is a
  server-side ERP bug in the function/rights save routine, NOT a payload problem.
- BUT the ERP still CREATES the user despite returning HTTP 500 with that NPE. The `menu` sent in the POST body IS applied
  to the created user even when the NPE is returned.
- `PUT /Usuarios/{id}` does NOT trip the NPE. `PUT {copiar_direitos_de: "base.upsell"}` returns HTTP 200, so rights are
  copied via PUT. `PUT {ativo:"N"}` works too (used to deactivate leftover test users).

**Implemented two-step flow** in `backend/src/routes/erpProxy.js` POST /usuario:
1. POST /Usuarios with `{login, pessoa, estabelecimento_padrao:104, senha_prot, menu:MENU_VENDEDOR_PAP}` (no copiar, no ativo).
2. If the response is the salvarFuncoesUsuario NPE, fetch the just-created user by login (`fetchUsuarioByLogin`) instead of
   failing; other errors (duplicate login, email) still propagate as real errors.
3. PUT /Usuarios/{id} `{copiar_direitos_de: ERP_COPIAR_DIREITOS_DE}` to copy the model user's rights.
Returns `{id, login, direitosCopiados}`. Env: `ERP_MENU_PADRAO` (default MENU_VENDEDOR_PAP) added.
**Why:** a duplicate login short-circuits before salvarFuncoesUsuario, so any successful POST persists a real user — cannot
dry-run; the workaround sidesteps the unfixable server bug by copying rights through PUT (which the bug doesn't affect).
**Still to confirm with the user:** that PUT copiar_direitos_de truly grants the same permissions as base.upsell in the
ERP UI (PUT returns 200 but the rights effect can't be verified via GET).

**Two `ativo` caveats to validate:** (1) without `ativo`, confirm new users are created active (ERP default unknown,
couldn't verify because of the NPE); if they come inactive, may need a follow-up PUT to set `ativo:"S"`. (2) the CPF-reuse
path (existing real pessoa) should work cleanly — real pessoas have their own email + setup.

---

## Original diagnosis (kept for history — the "intrinsic to the Pessoa / ERP-side only" theory was true ONLY while `ativo` was being sent)

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
(a dedicated API service account) that even had its own exclusive email added — and creation STILL stamps the same super-user's email. So the
fallback is NOT the caller's email; it is a fixed ERP-side default. This is the strongest possible isolation.

**Why we cannot set the Pessoa's email via API (all doc-confirmed):**
- `e_mail` on POST /Pessoas works ONLY in the "importação de bloco" operation; on a normal POST it is ignored and
  `meios_contato` stays `[]`. (The email would be stored under the NFE-email address type, per preference
  `PESSOAS.CAD_PESSOAS.TIPO_ENDERECO_EMAIL_NFE_ID`.)
- POST /EnderecosPessoas only exposes `tipo_endereco` values `ENDERECO_COMERCIAL` / `ENDERECO RESIDENCIAL` — there is no
  documented email type, and `"E-MAIL"` is rejected. The actual configured email-type name is an ERP preference we don't
  know. If the admin gives us that exact configured email `tipo_endereco` value, we could POST the Pessoa's own email and
  the empty-email fallback would never trigger (potential client-side fix).

**REFINED ROOT CAUSE (proven, supersedes the "auto-assign" theory):** the super-user collision is *intrinsic to the
Pessoa* and independent of our payload. Controlled tests on one email-less Pessoa, all → identical super-user error:
unique email sent / no email sent / `copiar_direitos_de` removed / unique login. So it is NOT the caller email, NOT
copiar_direitos_de, NOT the login, NOT the email we POST to /Usuarios. It is an **empty-email collision**: a Pessoa with
no email of its own collides with the super-user account (whose user record apparently has an empty/default
email). The admin's wording confirms it: there is no auto-assign rule — the ERP simply *requires the Pessoa to have its
own (unique) email*. (Consistent with base.upsell: it HAS an email, so its error named base.upsell, not the super-user.)

**Sending email at user-creation time does NOT fix it** — the email on POST /Usuarios attaches to the user, not the
Pessoa; the empty-email collision on the Pessoa still fires first.

**CONCLUSIVE: there is NO API path to register a Pessoa's own email (all three ruled out empirically):**
1. `e_mail` on POST /Pessoas → IGNORED on a normal create. Proven: created a Pessoa with `e_mail` populated and the
   response came back `"meios_contato":[]`; subsequent user creation still failed with the email-collision error. (Doc was right:
   the field only works in "importação de bloco".)
2. POST /EnderecosPessoas → rejects every email-like `tipo_endereco` tried: EMAIL, E-MAIL, E_MAIL, EMAIL_NFE, EMAIL NFE,
   E-MAIL NFE, NFE, CONTATO, WEBSITE, ENDERECO_EMAIL, "E MAIL". It accepts ONLY `ENDERECO_COMERCIAL` / `ENDERECO
   RESIDENCIAL`. So the configured EMAIL "meio de contato" type is not settable through this generic API.
3. `email` on POST /Usuarios → attaches to the user, not the Pessoa; the empty-email collision on the Pessoa fires first.

**Therefore the fix is ERP-side, not in our code.** Viable resolutions for the ERP vendor/admin: (a) honor `e_mail` on a
normal POST /Pessoas (or expose a Meios-de-contato / EMAIL endpoint), (b) register the Pessoa's EMAIL manually in the ERP
UI before creating the user (manual workaround, not automatable), or (c) adjust the user-creation validation so an
empty Pessoa email does not collide with the super-user's empty email. Our code already sends a unique email to
/Usuarios; that alone cannot fix it.
