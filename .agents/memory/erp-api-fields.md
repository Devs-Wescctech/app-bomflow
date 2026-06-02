---
name: ERP API field structure
description: Actual field names returned by the Bom Pastor ERP API endpoints used in the Agents ERP integration.
---

## GET /API_CADASTRO_PESSOAS?cpf=XXX

Returns an array. Each element (results[0]) has:
- `nome_titular` — person's full name (NOT `nome_completo`)
- `id` — numeric contract record ID (NOT the ERP Pessoa code)
- `contrato` — contract number
- `cpf` — formatted as "000.000.000-00"
- Other contract fields (cidade, rua, cep, etc.)

**Important:** This endpoint is for contract/customer lookup only. It does NOT return the ERP "Pessoa" code used for user creation.

## POST /Pessoas (create new Pessoa)

Returns:
- `pessoa` — alphanumeric ERP Pessoa code (e.g. "2606501") — **use this for createUsuario**
- `id` — numeric internal record ID (e.g. 301224889) — NOT the Pessoa code
- `nome_completo`, `situacao`, `tipo_pessoa`, etc.

**Why:** `pessoa` (not `id`) must be passed as the `pessoa` field when calling POST /Usuarios.

### CPF on /Pessoas is NOT a root field — it lives in `documentos`

POST /Pessoas does NOT accept a root `cpf` field. Sending `cpf` at the top level makes the ERP save the person (nome etc.) but silently DROP the CPF — the create echo shows `documentos: []` and the person is then unfindable by CPF.

Correct shape: put CPF inside the `documentos` array:
```
documentos: [{ tipo_documento: 'CPF', documento: '000.000.000-00' }]
```
- `documento` must be the FORMATTED CPF (000.000.000-00), same format the ERP stores.
- Other doc types coexist in the same array on real people: `CONTRATO`, `DATA DE ADMISSÃO`, etc.

**CPF lookup format matters:** `API_CADASTRO_PESSOAS?cpf=` only matches with the FORMATTED CPF — digits-only returns 0 even for people that exist. `/Pessoas?cpf=` matches either format. The backend `formatCpf()` helper normalizes both on GET and POST.

**Indexing latency:** right after POST /Pessoas, the CPF search can take a few seconds to become findable; persistence itself is immediate (confirm via GET /Pessoas/{id} `documentos`).

## POST /Usuarios (create ERP user)

Payload sent: `{ login, pessoa }` — backend injects `estabelecimento_padrao` (104), `senha_prot`, `copiar_direitos_de`.
Do NOT send `ativo`: it triggers the Pessoa email-collision validation and blocks creation (see erp-user-creation-email.md).
`email`, `super_usuario`, `observacoes` are not required and are no longer sent.

## How to apply

- Frontend uses `nome_titular` (GET) to auto-fill agent name.
- On save: `criada.pessoa || criada.id` (prefer `pessoa`) for the codigo passed to createUsuarioErp.
- `erpAgentId` stored from `result?.id || result?.usuario` (user creation response).
