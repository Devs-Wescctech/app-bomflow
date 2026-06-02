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

## POST /Usuarios (create ERP user)

Payload sent: `{ login, pessoa }` — backend injects `estabelecimento_padrao` (104), `senha_prot`, `copiar_direitos_de`.
Do NOT send `ativo`: it triggers the Pessoa email-collision validation and blocks creation (see erp-user-creation-email.md).
`email`, `super_usuario`, `observacoes` are not required and are no longer sent.

## How to apply

- Frontend uses `nome_titular` (GET) to auto-fill agent name.
- On save: `criada.pessoa || criada.id` (prefer `pessoa`) for the codigo passed to createUsuarioErp.
- `erpAgentId` stored from `result?.id || result?.usuario` (user creation response).
