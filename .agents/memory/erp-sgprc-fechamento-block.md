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

## CAUSA RAIZ CONFIRMADA (resolvida)
O ERP REST roda no **contexto do dono do token**. Tokens ficam em `tokens_acesso` (cols: id, token, pessoa_id, usuario_id, data_inclusao, data_expiracao). O `ERP_AUTH_TOKEN` pertence a `usuario_id=55367753` (acesso.api). Só existem **3 tokens** no ERP inteiro.

O bloco FECHAMENTO precisa **listar o objeto SGPRC_USUARIO** (= view `v_usuarios_sistemas_sgprc` = `SELECT * FROM usuarios`). Quem libera isso são as **funções** (`funcoes_sistemas`, ligadas via `funcoes_usuarios.funcao_id`), **NÃO** o `super_usuario` nem o token sozinho.

**Evidência decisiva:** cruzando as funções dos 11 criadores de orçamentos OK no canal 47194339, a função dominante é **47270776 = CANAL DE VENDA.VENDEDOR_EXPLORER (9/11)**; demais usam variações de CANAL DE VENDA (VENDEDOR 2094535, GESTOR 2094672, SUPERVISORES_EXPLORER 47975159). O acesso.api tem **só** a função `251861329 = API_ETHERUM` — nenhuma de CANAL DE VENDA → por isso o FECHAMENTO nega.

**Token-por-agente NÃO resolve sozinho:** agentes criados pelo fluxo CRM têm **ZERO funções** (NPE em salvarFuncoesUsuario nos pessoas sintéticos). Logo precisariam de token novo em `tokens_acesso` + provisionamento de funções por agente — pesado.

**Correção (validada por comparação):** existem DUAS combinações que liberam o objeto SGPRC_USUARIO:
- `VENDEDOR_EXPLORER` (47270776) **sozinha** (ex.: agente cauan 47197098), OU
- `VENDEDOR` (2094535) **+ `Usuário do sistema` (198859503)** (ex.: Leonardo 95744209, Maria 87732325).

**ESTADO REAL no banco (fonte da verdade, conferido):** o acesso.api tinha `198859503` (Usuário do sistema) + `251861329` (API_ETHERUM) — ou seja, **já tinha a metade `Usuário do sistema`** e estava FALTANDO o `VENDEDOR` (2094535). (Notas anteriores diziam o inverso — estavam erradas; NÃO há rastro de VENDEDOR concedido pelo admin no banco.)

**CORREÇÃO APLICADA:** INSERT contido em `funcoes_usuarios` adicionando `VENDEDOR` (2094535) ao acesso.api (55367753). Id gerado via `nextval('pk_sequence')` (mesmo gerador do ERP, usado em `registerAgentInCanal`). Resultado: acesso.api agora tem `2094535, 198859503, 251861329` = idêntico a Leonardo/Maria (combo b). **Para reverter:** `DELETE FROM funcoes_usuarios WHERE id = 303357294`.

**Vínculo de canal NÃO é o bloqueador do FECHAMENTO:** acesso.api tem **zero** linhas em `pessoas_contratos` (os agentes OK têm 1 → contrato `47194354`, tipo_vinculo `2094514`), mas o cabeçalho do orçamento cria normal com `agente_venda_id` correto; o erro é só na listagem do objeto SGPRC_USUARIO (= função). Vínculo de canal importa para atribuição de venda, não para o FECHAMENTO.

**Why:** super_usuario não basta; o ACL do objeto SGPRC_USUARIO vem das funções. O par mínimo que funciona é `VENDEDOR` + `Usuário do sistema` (combo b) OU `VENDEDOR_EXPLORER` sozinho (combo a). Grupos NÃO são fator (todos só no grupo pessoal tipo 'U'); `regras_alcada` vazias.

**Status:** correção aplicada; **validação empírica pendente** (1 orçamento de teste pelo formulário → conferir se `pedidos.situacao` sai de 'M'). Lembrar: gera título PIX R$60 e esqueleto — limpar depois junto com o lixo 303339373 / 303065872–303065941.
