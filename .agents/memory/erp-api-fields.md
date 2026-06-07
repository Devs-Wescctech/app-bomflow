---
name: ERP API field structure
description: Actual field names returned by the Bom Pastor ERP API endpoints used in the Agents ERP integration.
---

## GET /API_CADASTRO_PESSOAS?cpf=XXX

Returns an array. Each element (results[0]) has:
- `nome_titular` — person's full name (NOT `nome_completo`)
- `id` — numeric **contract record ID** (ex: 55569514) — NOT the ERP Pessoa ID, NOT the ERP Pessoa code
- `contrato` — contract number
- `cpf` — formatted as "000.000.000-00"
- Other contract fields (cidade, rua, cep, etc.)

**Important:** This endpoint is for contract/customer lookup only. It does NOT return the ERP "Pessoa" code used for user creation, nor the Pessoa ID used for orçamentos.

## GET /Pessoas?cpf=XXX (lookup for orçamentos)

Returns an array. Each element has:
- `id` — numeric **Pessoa ID** (ex: 150) — **use this as `contratante_pessoa` in PrePropostaUsuarioSgprc**
- `nome_completo` (or `nome`)
- `cpf`

**Why:** `API_CADASTRO_PESSOAS` `id` (ex: 55569514) is the contract record ID — ERP rejects it in orçamentos with "Valor inválido para o campo Contratante". The correct value is `id` from `GET /Pessoas` (ex: 150), which is the internal Pessoa record ID.

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

- Frontend uses `nome_titular` (API_CADASTRO_PESSOAS) or `nome_completo` (GET /Pessoas) to auto-fill name.
- For **orçamentos** (`contratante_pessoa`): use `id` from `GET /Pessoas?cpf=` (ex: 150). The `/api/erp/lookup-cpf` route does this — tries GET /Pessoas first, falls back to API_CADASTRO_PESSOAS.
- For **createUsuario** (`pessoa` field): use `criada.pessoa` from POST /Pessoas response.
- `erpAgentId` stored from `result?.id || result?.usuario` (user creation response).
