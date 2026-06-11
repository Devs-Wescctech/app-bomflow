---
name: ERP SGPRC FECHAMENTO block fails via REST
description: Why orçamento FECHAMENTO (closing) cannot be done through the ERP REST API and must be a direct DB write
---

# FECHAMENTO via REST sempre nega — escrita real é via DB direto

`POST` ao bloco de fechamento (`SGPRC_USUARIO.CAD_ORCAMENTO_SGPRC_USUARIO_FECHAMENTO`)
retorna **HTTP 200 com corpo de erro**:
```json
{ "block": "SGPRC_USUARIO.CAD_ORCAMENTO_SGPRC_USUARIO_FECHAMENTO",
  "error": "User does not has access to list records from object!" }
```
O cabeçalho do orçamento é criado, mas o fechamento para em situação `M`.

## O que foi descartado (não repetir)
Cada uma destas foi replicada via DB direto no usuário dono do token (super admin) e
o FECHAMENTO **continuou negando**:
- **Permissão de papel/função** (CANAL DE VENDA.VENDEDOR + USUARIO_SISTEMA).
- **Vínculo de canal** (`pessoas_contratos`).
- **`usuarios.menu_id`** (MENU_VENDEDOR_EXPLORER).
- **`super_usuario='S'`** não fura a checagem no contexto REST.
- **`usuario_inclusao`** é só auditoria; não troca o contexto de execução.

As ACLs relevantes **não estão em tabela gravável** do banco: as views do objeto não
têm filtro e as tabelas de regras de acesso estão vazias. A checagem "access to list
records" é feita na camada de aplicação (Etherum/ERP).

## ROOT CAUSE (definitivo)
O bloqueio é da **camada de sessão do ERP**, não do banco. Operações "list records from
object" exigem o contexto de sessão (estabelecimento/canal/escopo) estabelecido no
**login web** — o token REST não carrega esse contexto. Usuários que fecham OK criam
pela tela web, nunca via token REST.

**Why:** por isso nenhuma concessão gravável (função, canal, menu) destrava o fechamento
para o token REST.

## SOLUÇÃO ADOTADA
O fechamento (e o registro de pagamento) é feito por **INSERT/UPDATE direto no banco do
ERP** após o cabeçalho ser criado — ver [erp-fechamento-pagamento](erp-fechamento-pagamento.md).
A REST cobre só a criação do cabeçalho; produtos, beneficiários, fechamento e pagamento
vão por DB direto.

**How to apply:** nunca tente concluir o orçamento pela REST; o pipeline correto cria o
cabeçalho via REST e completa tudo o resto via `erpDbService`. Não insista em writes de
permissão no usuário do token — já provado que não destrava.
