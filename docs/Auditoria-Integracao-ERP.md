# Auditoria Técnica — Integração Bom Flow ↔ ERP Bom Pastor

> **Data:** 15/07/2026
> **Método:** análise 100% baseada no código-fonte do repositório. Cada afirmação cita arquivo, função e linha aproximada, com trechos de código como evidência. Quando algo não pôde ser determinado pelo código, está escrito explicitamente: *"Não foi possível determinar pelo código."*
>
> **Arquivos centrais da integração:**
> - `backend/src/routes/erpProxy.js` (1.535 linhas) — rotas HTTP do Bom Flow que falam com o ERP (REST + orquestração)
> - `backend/src/services/erpDbService.js` (1.341 linhas) — acesso direto ao banco PostgreSQL do ERP
> - `backend/src/routes/functions.js` — auto-cancelamento de orçamentos (usa `cancelOrcamentoDB`)
> - `backend/src/routes/orcamentoDocumentos.js` — leitura de detalhes de pedidos (usa `getOrcamentoDetalhe`)
> - `src/pages/UpsellNovoOrcamento.jsx` (2.265 linhas) — wizard de orçamento no frontend (classificação de produtos)

---

## 1. Motivo da escrita direta no banco

### 1.1 Por que foi escolhida escrita direta?

O código contém comentários explícitos justificando cada escrita direta. A razão central, repetida em vários pontos: **a API REST do ERP (`POST /OrcamentoSgprcUsuario`) salva apenas o CABEÇALHO do pedido** — produtos, beneficiários, endereço, contatos, fechamento e pagamento são ignorados ou gravados errado.

**Evidência 1 — `erpDbService.js`, função `addItemsToPedido`, linhas 419–422:**
```js
/**
 * Adiciona MÚLTIPLOS produtos e beneficiário(s) a um pedido ERP já criado via OrcamentoSgprcUsuario.
 * A API REST só salva o cabeçalho; produtos e pessoas ficam em tabelas separadas e precisam
 * de INSERT direto (mesmo padrão de registerAgentInCanal).
```

**Evidência 2 — `erpProxy.js`, rota `POST /orcamento`, linhas 854–855:**
```js
// Extrai itens (múltiplos produtos) e campos de pagamento antes de enviar ao ERP
// (a API REST só salva o cabeçalho; produtos/pessoas são inseridos via DB)
```

**Evidência 3 — `erpDbService.js`, função `ensureContatosEnderecoDB`, linhas 784–791:** a API REST grava dados errados:
```js
/**
 * Garante que o cliente (contratante) tenha, na tabela `enderecos` do ERP, os
 * registros corretos que a API REST OrcamentoSgprcUsuario NÃO cria/cria errado
 * para clientes novos:
 *   - Endereço físico (tipo 577) a partir dos campos un_*.
 *   - Telefone principal reclassificado (a API grava como "Telefone comercial"
 *     573; aqui passa para Celular 565 ou Residencial 574, auto-detectado).
```

**Evidência 4 — `erpDbService.js`, função `finalizeOrcamentoDB`, linhas 683–687:** a API REST ignora campos:
```js
/**
 * Finaliza um pedido ERP recém-criado preenchendo campos que a API REST ignora:
 *   - endereco_id   → busca o endereço do contratante por CEP (...)
 *   - dia_vencimento
 *   - email_contato
```
E na leitura (`getOrcamentoDetalhe`, linhas 250–252):
```js
// A API REST do ERP ignora esses campos; eles são gravados via DB no fechamento, então
// lemos direto da base para a auditoria refletir 100% dos obrigatórios do formulário.
```

**Evidência 5 — `erpDbService.js`, função `applyFechamentoEPagamento`, linhas 985–994:** o Fechamento (M→I) e a guia Pagamento replicam um **processo manual da tela do ERP** — não há endpoint REST citado para isso:
```js
/**
 * Replica o processo manual feito no ERP após o orçamento estar completo:
 *   1. Fechamento: muda a situação do pedido de "M" para "I" ...
 *   2. Pagamento: insere o registro em modos_pagamentos (id == pedido_id, padrão do ERP) ...
 * NÃO avança para "A" (aprovação) — isso continua sendo manual no ERP.
```
Relacionado, em `erpProxy.js` linhas 1044–1047 (rota `/pre-proposta`) há registro de uma **limitação de permissão** do lado REST:
```js
// O campo diz ao ERP quem criou o orçamento; sem ele o ERP usa o dono do token
// (acesso.api) que não tem permissão para o bloco
// SGPRC_USUARIO.CAD_ORCAMENTO_SGPRC_USUARIO_FECHAMENTO.
```

### 1.2 A API REST era insuficiente? Existe limitação documentada?

Sim, conforme os comentários acima (cabeçalho-somente; telefone gravado como "comercial 573"; endereço não criado para clientes novos; campos `endereco_id`/`dia_vencimento`/`email_contato` ignorados; autoria atribuída ao dono do token). Essas limitações estão **documentadas apenas em comentários no código** — não há documento formal do ERP no repositório descrevendo-as.

### 1.3 Há endpoints REST equivalentes não utilizados?

O repositório não contém a documentação oficial da API do ERP; portanto: **Não foi possível determinar pelo código** se existem endpoints REST equivalentes para itens/pessoas/fechamento/pagamento que tenham sido preteridos. O que o código evidencia é que `PrePropostaUsuarioSgprc` (que cria proposta mais completa) existe e é usado em `erpProxy.js` linha 1054, mas com a ressalva de permissão do bloco FECHAMENTO citada acima.

---

## 2. Fluxo completo do orçamento ("Confirmar e Enviar ao ERP")

Sequência exata implementada em `erpProxy.js`, rota `POST /api/erp/orcamento` (linhas 840–1033):

```
Frontend (UpsellNovoOrcamento.jsx / wizard)
  └─ POST /api/erp/orcamento  { cabeçalho + itens[] + prazo_pagamento_id + modulo + lead_id }
      │
      ▼
[1] Backend Bom Flow — validações ANTES de tocar o ERP (linhas 880–899)
      - itens.length > 0, produtoId válido, cada item com ≥1 pessoa,
        plano de pagamento obrigatório  → 400 se falhar (nada criado no ERP)
      - usuario_inclusao resolvido NO SERVIDOR (resolveUsuarioInclusao, linhas 44–58;
        login nativo via erp_agent_id, fallback user.{email})
      │
      ▼
[2] ERP REST — POST {ERP_BASE}/OrcamentoSgprcUsuario (linha 903)
      - Cria SÓ o cabeçalho do pedido (tabela pedidos, situação "M")
      - Sem id na resposta → 502 (linhas 922–928), nada mais é feito
      │
      ▼
[3] ERP REST — resolveDependentePessoas (linhas 933–941; função nas linhas 103–124)
      - Para cada dependente com registrarPessoa: lookup por CPF no banco
        (findPessoaIdByCpf) e, se não existir, POST {ERP_BASE}/Pessoas (linha 85)
      - Falha → 502 "orçamento INCOMPLETO... corrigir manualmente" (cabeçalho já existe)
      │
      ▼
[4] Banco ERP — addItemsToPedido (linha 945; erpDbService.js 450–681) [TRANSAÇÃO]
      - INSERT itens_pedidos, pedidos_pessoas, pedidos_pessoas_produtos
      - UPDATE pedidos.valor_total/valor_mercadorias
      - Falha → ROLLBACK da transação + 502 "INCOMPLETO" (linhas 947–958)
      │
      ▼
[5] Banco ERP — ensureContatosEnderecoDB (linhas 964–979) [BEST-EFFORT, sem transação]
      - INSERT endereço físico (577), telefone (565/574), celular (565), e-mail (566)
      - Falha → apenas console.error "não crítico"; fluxo continua
      │
      ▼
[6] Banco ERP — finalizeOrcamentoDB (linhas 982–989) [BEST-EFFORT]
      - UPDATE pedidos: endereco_id, dia_vencimento, email_contato
      - Falha → retorna null; fluxo continua
      │
      ▼
[7] Banco ERP — applyFechamentoEPagamento (linhas 995–1015) [TRANSAÇÃO]
      - INSERT modos_pagamentos (id == pedido_id) + UPDATE pedidos (situacao 'M'→'I',
        campos fiscais, data de admissão do cliente se faltar)
      - Falha → ROLLBACK da transação + 502 "ficou em M, fechar manualmente"
      │
      ▼
[8] CRM Bom Flow — recordBomflowOrcamento (linhas 1018–1026; função 795–836) [BEST-EFFORT]
      - INSERT/UPSERT em bomflow_orcamentos (módulo, agente real, lead)
      - "O ERP atribui todos os orçamentos criados via API à conta do token (acesso.api),
        então este registro é a ÚNICA fonte confiável de quem/qual módulo" (linhas 792–793)
      │
      ▼
[9] Resposta ao usuário (linha 1028)
      res.json({ ...data, numeroPedido, erpId, dbInserted, fechamento })
```

---

## 3. Rollback

### 3.1 O que tem transação SQL (BEGIN/COMMIT/ROLLBACK)

| Função | Arquivo/linhas | BEGIN | COMMIT | ROLLBACK |
|---|---|---|---|---|
| `addItemsToPedido` | erpDbService.js 455 / 672 / 675 | ✅ | ✅ | ✅ (`catch` → `ROLLBACK` → `throw`) |
| `applyFechamentoEPagamento` | erpDbService.js 1013 / 1119 / 1127 | ✅ | ✅ | ✅ + `SELECT ... FOR UPDATE` (linha 1017) e trava de estado `situacao === 'M'` (linha 1026) |
| `cancelOrcamentoDB` | erpDbService.js 1173 / 1211 / 1215 | ✅ | ✅ | ✅ + `FOR UPDATE` (1176), idempotente (`'C'` → `already_cancelled`, 1186–1189), trava de estado (`só 'I'`, 1191–1194) |

### 3.2 O que NÃO tem transação

- `ensureContatosEnderecoDB` (erpDbService.js 808–961): série de INSERTs/UPDATEs independentes com `catch` que apenas loga *"erro (não crítico)"* e retorna resultado parcial (linhas 957–960).
- `finalizeOrcamentoDB` (695–762): UPDATE único; `catch` retorna `null` (linhas 758–761).
- `registerAgentInCanal` (381–417): SELECT + INSERT sem transação (idempotente por verificação prévia).

### 3.3 NÃO existe rollback entre etapas (cross-step)

O ponto crítico: **o cabeçalho criado via REST no passo [2] nunca é desfeito** se um passo posterior falhar. O código faz isso deliberadamente:

**`erpProxy.js` linhas 948–957:**
```js
// O cabeçalho já existe no ERP, mas produto/beneficiários falharam (rollback do DB).
// Retorna ERRO REAL (não 2xx) para que o vendedor seja notificado e o orçamento
// incompleto não passe despercebido. NÃO alteramos o ERP automaticamente.
return res.status(502).json({
  error: `O orçamento ... está INCOMPLETO no ERP e precisa ser corrigido manualmente.`,
```

### 3.4 O que fica gravado em cada cenário de falha

| Falha em | Fica gravado | Não fica gravado |
|---|---|---|
| Validações [1] | nada | tudo |
| REST OrcamentoSgprcUsuario [2] | nada | tudo |
| resolveDependentePessoas [3] | cabeçalho (`pedidos` em "M") + eventuais Pessoas já criadas via POST /Pessoas | itens, beneficiários, fechamento |
| addItemsToPedido [4] | cabeçalho + Pessoas de dependentes | itens/pessoas/vínculos (rollback da transação) |
| ensureContatos [5] / finalize [6] | cabeçalho + itens + pessoas (fluxo **continua**) | contatos/endereço/campos do header parciais |
| applyFechamentoEPagamento [7] | tudo acima; pedido fica em "M" | modos_pagamentos + transição para "I" (rollback) |
| recordBomflowOrcamento [8] | tudo no ERP; **perde-se o rastreio de módulo/agente no CRM** (best-effort, linhas 833–835) | linha em bomflow_orcamentos |

---

## 4. Uso da API REST

### 4.1 Todas as chamadas REST ao ERP (base: `ERP_BASE = 'http://erp.wescctech.com.br:8080/BOMPASTOR/api'`, erpProxy.js linha 8)

| # | Endpoint ERP | Método | Objetivo | Arquivo | Função/rota | Linha |
|---|---|---|---|---|---|---|
| 1 | `/Pessoas` | POST | Criar Pessoa Física (dependente/cliente) | erpProxy.js | `criarPessoaErp` | 85 |
| 2 | `/Usuarios?login=` | GET | Recuperar usuário por login (workaround NPE) | erpProxy.js | `fetchUsuarioByLogin` | 131 |
| 3 | `/Pessoas?cpf=` | GET | Resolver Pessoa por CPF (sync de agentes) | erpProxy.js | `resolveAgentErpByCpfViaApi` | 180 |
| 4 | `/API_CADASTRO_PESSOAS?cpf=` | GET | Fallback (clientes com contrato) | erpProxy.js | `resolveAgentErpByCpfViaApi` | 201 |
| 5 | `/Usuarios?pessoa_id=` | GET | Resolver usuário da Pessoa | erpProxy.js | `resolveAgentErpByCpfViaApi` | 229 |
| 6 | `/Usuarios?nome=` | GET | Fallback por nome exato normalizado | erpProxy.js | `resolveAgentErpByCpfViaApi` | 257 |
| 7 | `/API_CADASTRO_PESSOAS?cpf=` | GET | Busca de pessoa p/ formulário | erpProxy.js | rota `GET /pessoa` | 312 |
| 8 | `/Pessoas` | POST | Criar Pessoa (tela de agentes) | erpProxy.js | rota `POST /pessoa` | 362 |
| 9 | `/Usuarios` | POST | Criar usuário ERP (2 passos) | erpProxy.js | rota `POST /usuario` | 414 |
| 10 | `/Usuarios/{id}` | PUT | Copiar direitos do usuário-modelo | erpProxy.js | rota `POST /usuario` | 449 |
| 11 | `/Pessoas?cpf=` | GET | lookup de código Pessoa p/ orçamento | erpProxy.js | rota `GET /lookup-cpf` | 746 |
| 12 | `/API_CADASTRO_PESSOAS?cpf=` | GET | fallback do lookup | erpProxy.js | rota `GET /lookup-cpf` | 767 |
| 13 | `/OrcamentoSgprcUsuario` | POST | Criar CABEÇALHO do orçamento | erpProxy.js | rota `POST /orcamento` | 903 |
| 14 | `/PrePropostaUsuarioSgprc` | POST | Criar proposta completa (fluxo alternativo) | erpProxy.js | rota `POST /pre-proposta` | 1054 |
| 15 | `/API_CANAL_VENDAS` | GET | Listar canais de venda | erpProxy.js | rota `GET /canais-venda` | 1097 |
| 16 | `/API_MV_API_PRODUTOS` | GET | Listar produtos | erpProxy.js | rota `GET /produtos` | 1132 |

### 4.2 Operações feitas diretamente por SQL (banco do ERP)

Todas em `erpDbService.js` (pool próprio via env `ERP_DB_*`, linhas 6–24): leitura de pessoas/usuários/documentos (`findPessoaIdByCpf` 39, `resolveAgentErpByCpf` 72, `getLoginByUsuarioId` 129, `getErpLoginsByIds` 1231), leitura de pedidos p/ relatórios (`getProdutosByPedidoIds` 148, `getOrcamentoDetalhe` 195, `getRelatorioOrcamentos` 1262), planos de pagamento (`getPlanosPagamento` 969), e as escritas listadas na seção 5.

---

## 5. Escrita direta (INSERT/UPDATE/DELETE no banco do ERP)

**Não há nenhum DELETE** no banco do ERP (cancelamento é UPDATE de situação).

| Tabela | Operação | Arquivo | Função | Linha | Finalidade |
|---|---|---|---|---|---|
| `pessoas_contratos` | INSERT | erpDbService.js | `registerAgentInCanal` | 397–412 | Vincular agente ao canal de vendas (tipo_vinculo_id=2094514) |
| `itens_pedidos` | INSERT | erpDbService.js | `addItemsToPedido` | 539–559 | Item-produto do orçamento (situação 'P') |
| `itens_pedidos` | UPDATE | erpDbService.js | `addItemsToPedido` | 649–660 | Ajustar quantidade/valor após dedup de pessoas |
| `pedidos_pessoas` | INSERT | erpDbService.js | `addItemsToPedido` | 599–615 | Beneficiário do pedido |
| `pedidos_pessoas_produtos` | INSERT | erpDbService.js | `addItemsToPedido` | 573–580, 629–636 | Vínculo item ↔ pessoa |
| `pedidos` | UPDATE | erpDbService.js | `addItemsToPedido` | 666–669 | valor_total/valor_mercadorias = soma dos itens |
| `pedidos` | UPDATE | erpDbService.js | `finalizeOrcamentoDB` | 750–753 | endereco_id, dia_vencimento, email_contato (ignorados pela REST) |
| `enderecos` | INSERT | erpDbService.js | `ensureContatosEnderecoDB` | 856–859, 887–890, 927–930, 946–949 | Endereço físico 577, telefone 565/574, celular 565, e-mail 566 |
| `enderecos` | UPDATE | erpDbService.js | `ensureContatosEnderecoDB` | 898, 906–908 | Reclassificar telefone 573→565/574; desativar duplicatas |
| `documentos_pessoas` | INSERT | erpDbService.js | `applyFechamentoEPagamento` | 1041–1049 | Data de admissão (tipo 2657422) exigida pela trigger de fechamento |
| `modos_pagamentos` | INSERT (upsert) | erpDbService.js | `applyFechamentoEPagamento` | 1078–1087 | Guia Pagamento (id == pedido_id, recorrente='S') |
| `pedidos` | UPDATE | erpDbService.js | `applyFechamentoEPagamento` | 1096–1116 | Fechamento M→'I' + campos fiscais/derivados |
| `pedidos` | UPDATE | erpDbService.js | `cancelOrcamentoDB` | 1197–1209 | Cancelamento (situacao='C', situacao_financeiro='L', motivo, valor) |

---

## 6. Dependências do schema do ERP

O Bom Flow depende diretamente de (todas as referências em `erpDbService.js`, salvo indicação):

**Tabelas:** `pedidos`, `itens_pedidos`, `pedidos_pessoas`, `pedidos_pessoas_produtos`, `enderecos`, `modos_pagamentos`, `documentos_pessoas`, `pessoas`, `usuarios`, `pessoas_contratos`, `produtos`, `planos_pagamentos`, `cidades`, `pedidos_motivos_cancelamentos` (referenciada em comentário linha 1151).

**Colunas críticas com semântica assumida:** `pedidos.situacao` ('M'/'I'/'C'/'A'), `pedidos.situacao_financeiro` ('L'), `itens_pedidos.situacao` ('P'), `itens_pedidos.tipo_produto_id` (não pode ser NULL — NPE no Fechamento, linhas 516–533), `pedidos.valor_desconto` (não pode ser NULL — NPE, linhas 1090–1095), `usuarios.login` (prefixo `user.` = login sintético, linha 103), `enderecos.tipo_endereco_id`, `documentos_pessoas.tipo_documento_id`, casts explícitos de tipos (`double precision` vs `numeric`, linhas 537–538).

**Sequence global:** `nextval('pk_sequence')` usada em TODOS os INSERTs (linhas 405, 550, 577, 603, 633, 858, 889, 929, 948, 1043).

**Convenções estruturais:** `modos_pagamentos.id == pedido_id` (linha 1070–1073, incl. FK `fk_pedi_modpag_modo_pagamento`); regra do Fechamento "pessoas vinculadas ao item == quantidade do item" (linhas 424–427); trigger de admissão no fechamento (1031–1036); trigger de data em `documentos_pessoas` ("não futura e no máximo 20 dias atrás", 1034–1035).

**Comportamentos de views REST assumidos:** `API_CADASTRO_PESSOAS` exige CPF formatado (erpProxy.js 60–62) e retorna `id` = id do contrato, não da Pessoa (erpProxy.js 732–733, 209–210).

---

## 7. Valores hardcoded

### Backend (`erpDbService.js`)
| Valor | Significado | Linha |
|---|---|---|
| `580` | tipo_documento CPF (`ERP_TIPO_DOCUMENTO_CPF`) | 38 |
| `2657422` | tipo_documento "data de admissão" | 1043, 1047 |
| `565` | tipo_endereco Celular (`TIPO_CELULAR`) | 766 |
| `566` | tipo_endereco E-mail (`TIPO_EMAIL`) | 767 |
| `573` | Telefone comercial (o que a REST grava errado) | 768 |
| `574` | Telefone residencial | 769 |
| `577` | Endereço residencial | 770 |
| `2094514` | `tipo_vinculo_id` em pessoas_contratos | 407 |
| `'M'`, `'I'`, `'C'`, `'P'`, `'L'`, `'S'`, `'N'` | situações/flags | 1026, 1098, 1199, 551, 1200 etc. |
| `nextval('pk_sequence')` | sequence global do ERP | 10 ocorrências |
| CPF formatado `000.000.000-00` | formato canônico em documentos_pessoas | 26–32 |

### Backend (`erpProxy.js`)
| Valor | Significado | Linha |
|---|---|---|
| `http://erp.wescctech.com.br:8080/BOMPASTOR/api` | URL base do ERP (HTTP, sem TLS) | 8 |
| `104` | estabelecimento padrão (default de env) | 10 |
| `'base.upsell'` | usuário-modelo p/ copiar direitos (default) | 12 |
| `'MENU_VENDEDOR_PAP'` | menu padrão de novos usuários (default) | 13 |
| `user.{local}.{domínio}` | padrão de login derivado do e-mail | 27–36 |
| `/salvarFuncoesUsuario/i` | regex p/ detectar NPE "esperado" do ERP | 425 |
| `15` | máximo de beneficiários por item | 873 |
| `VALID_MODULOS = ['sales','sales_pj','sales_upsell','referral']` | módulos rastreáveis | 1159 |
| `'acesso.api'` | conta dona do token (citada em comentários) | 793, 1046, 1342 |

### Frontend (`src/pages/UpsellNovoOrcamento.jsx`)
| Valor | Significado | Linha |
|---|---|---|
| `NOME_ESTABELECIMENTO_FIXO = "LIMEIRA - CNPA"` | estabelecimento fixo do orçamento | 145 |
| `/NOME DO PET/i` | classifica produto PET | 149 |
| `/DADOS DO CONDUTOR/i` | classifica produto condutor | 155 |
| `/DADOS DO VE[IÍ]CULO/i` | classifica produto veículo | 158 |
| `/DEPENDENTE/i` + preço ≈ 0,01 | vaga de dependente | 164–168 |
| `/DEPENDENTE/i` + preço > 0,015 | dependente pago | 174–178 |
| `"BOM PASTOR - COMBO MULTI ESPECIAL"`, `"... SELEÇÃO"` | títulos de contrato COMBO | 48 |
| `/^[A-Z]{3}[0-9][0-9A-Z][0-9]{2}$/` | validação de placa (antiga + Mercosul) | 190 |
| Formatos `MODELO/COR/PLACA/ANO` e `NOME/TIPO/RAÇA/COR/PORTE` | veículo/pet serializados no NOME da pessoa | 193–220 |

---

## 8. Classificação dos produtos

A classificação é **inteiramente por REGEX sobre a descrição do produto**, no frontend (`src/pages/UpsellNovoOrcamento.jsx`). Não há classificação por ID nem categoria estruturada.

| Tipo | Critério | Função | Linha |
|---|---|---|---|
| Pet | descrição contém `NOME DO PET` | `isPetProduto` | 148–150 |
| Condutor | descrição contém `DADOS DO CONDUTOR` | `isCondutorProduto` | 154–156 |
| Veículo | descrição contém `DADOS DO VEÍCULO` (com/sem acento) | `isVeiculoProduto` | 157–159 |
| Dependente (vaga) | `DEPENDENTE` no nome **E** `|preço − 0,01| < 0,005` | `isDependenteProduto` | 164–168 |
| Dependente (pago) | `DEPENDENTE` no nome **E** preço > 0,015 | `isDependentePagoProduto` | 174–178 |
| Bom Auto | derivado: existe produto condutor direto **E** produto veículo → `const isBomAuto = !!(produtoCondutorDireto && produtoVeiculo)` | — | 423 |
| Bom Pet | derivado: `useMemo` que retorna false se `isBomAuto`, senão avalia produtos pet selecionados | — | 546–555 |
| Combo | pelo **título do contrato** (lista fixa com `"COMBO MULTI ESPECIAL"`/`"SELEÇÃO"`, linha 48) + comportamento especial: "nos contratos COMBO o título traz só 'DADOS DO VEÍCULO' (sem o condutor). Pareia o..." (linhas 424, 595–601) |

Trecho-prova (linhas 147–150):
```js
// Produtos cujo nome contém "NOME DO PET" são planos de pet, atrelados aos beneficiários (não ao titular).
function isPetProduto(prod) {
  return /NOME DO PET/i.test(prod?.descricao || prod?.titulo_contrato || "");
}
```

Além disso, pet e veículo **não têm campos estruturados no ERP**: são serializados no nome da pessoa beneficiária (`montarNomeVeiculo`/`montarNomePet`, linhas 195–220) e o parsing reverso é feito na leitura (`getOrcamentoDetalhe`, erpDbService.js linhas 184–187).

---

## 9. Transações críticas

| Operação | Impacto | Risco | Possibilidade de inconsistência | Tratamento de erro |
|---|---|---|---|---|
| Criar cabeçalho (REST, erpProxy.js 903) | Cria pedido "M" no ERP | Falha de rede/timeout sem retry | Baixa isolada; alta como 1ª etapa de cadeia sem compensação | `!r.ok` → repassa status; sem id → 502 |
| Criar Pessoas de dependentes (REST, 933–941) | Cadastro global no ERP | Pessoa criada e pedido abortado depois → Pessoa "órfã" (sem vínculo) | Média | 502 explícito "INCOMPLETO" |
| `addItemsToPedido` (transação) | Itens/beneficiários/valores | NPE do Fechamento se dados faltarem (mitigado por validações 516–533) | Baixa dentro da transação; **cabeçalho órfão** se falhar | ROLLBACK + 502 "INCOMPLETO" |
| `ensureContatosEnderecoDB` (sem transação) | Contatos/endereço do cliente | Escrita parcial (ex.: endereço criado, telefone não) | Média (parcial silencioso) | catch → log "não crítico", **fluxo continua** |
| `finalizeOrcamentoDB` (sem transação) | endereco_id/vencimento/email | Campos ficarem NULL silenciosamente | Média | catch → return null, fluxo continua |
| `applyFechamentoEPagamento` (transação, FOR UPDATE) | Transição M→I + pagamento + admissão | Estado inválido / concorrência | Baixa (lock + guard de estado) | ROLLBACK + 502 "ficou em M" |
| `cancelOrcamentoDB` (transação, FOR UPDATE) | Cancela pedido no ERP (automático via cron, functions.js 6839) | Cancelar estado errado | Baixa (idempotente, só cancela 'I') | ROLLBACK + status estruturado; caller trata `already_cancelled`/`invalid_state` (6850–6865) |
| `recordBomflowOrcamento` (CRM) | Rastreio de módulo/agente | Se falhar, orçamento existe no ERP **sem autoria no CRM** (relatórios o omitem — o filtro parte de `bomflow_orcamentos`, erpProxy.js 1322–1326) | Alta em caso de falha | best-effort: catch → log (833–835) |

---

## 10. Riscos arquiteturais

1. **Ausência de rollback entre etapas (compensação).** O pipeline REST→DB tem 5 etapas de escrita; a partir da etapa 2 qualquer falha deixa estado parcial no ERP exigindo correção manual — por decisão explícita ("NÃO alteramos o ERP automaticamente", erpProxy.js 950). Mitigado pelos 502 com mensagens claras, mas a recuperação é 100% humana.
2. **SQL direto acoplado ao schema.** 14 tabelas, sequence global, triggers e convenções internas (seção 6). Qualquer migração/upgrade do ERP pode quebrar a integração silenciosamente. Os INSERTs replicam até bugs/NPEs internos do ERP (tipo_produto_id, valor_desconto).
3. **Dependência de descrição de produto (regex).** Renomear um produto no ERP ("NOME DO PET" → outro texto) muda a classificação e o comportamento do wizard sem nenhum erro (seção 8). Preço 0,01 como "flag" de vaga de dependente é convenção frágil (linhas 161–168).
4. **Timeout/retry.** O pool tem `connectionTimeoutMillis: 10000` (erpDbService.js 15); os `fetch` REST **não têm timeout nem retry configurados** (nenhuma ocorrência de `AbortController`/`signal`/retry em erpProxy.js). Uma pendura do ERP pode segurar a requisição do vendedor indefinidamente (até o timeout default do Node/proxy).
5. **Concorrência/corrida.** Bem tratada nos pontos críticos: `FOR UPDATE` + guarda de estado no fechamento e cancelamento; `INSERT ... WHERE NOT EXISTS` idempotente para admissão (1039–1049); `ON CONFLICT` em modos_pagamentos. Mas `registerAgentInCanal` usa SELECT-depois-INSERT sem lock (381–412) — duas execuções simultâneas podem duplicar o vínculo.
6. **Perda de rastreio (autoria).** `recordBomflowOrcamento` é best-effort; se falhar, o pedido some dos relatórios do Bom Flow (o relatório parte de `bomflow_orcamentos`, erpProxy.js 1322–1326), pois o ERP atribui tudo a `acesso.api`.
7. **Pool pequeno e sem SSL.** `max: 3` conexões e `ssl: false` para o banco do ERP (linhas 14–17); a URL REST é `http://` (linha 8) — tráfego sem criptografia. Se a rede entre CRM e ERP não for privada: **Não foi possível determinar pelo código** (a topologia de rede não está no repositório).
8. **Best-effort silencioso.** Etapas [5] e [6] engolem erros (só log). O vendedor recebe "sucesso" mesmo com endereço/contatos parcialmente gravados.

---

## 11. Melhorias possíveis (sem alterar regra de negócio)

| Prioridade | Melhoria | Detalhe |
|---|---|---|
| **Alta** | Timeout + retry nas chamadas REST | `AbortController` com timeout (ex. 15s) e 1–2 retries idempotentes nos GETs; nenhum retry no POST de criação (não idempotente) sem chave de idempotência. |
| **Alta** | Tabela de "saga"/estado do pipeline | Persistir no CRM o progresso das etapas por pedido (criado→itens→contatos→fechado). Hoje o 502 informa, mas não há fila de pendências consultável; um job poderia listar/retomar orçamentos incompletos. |
| **Alta** | Alerta operacional quando `recordBomflowOrcamento` falhar | Hoje é só `console.error`; o pedido some dos relatórios. Notificação/registro de reconciliação resolveria. |
| **Média** | Unificar `ensureContatosEnderecoDB` + `finalizeOrcamentoDB` numa transação | São escritas relacionadas ao mesmo pedido; transação única elimina estados parciais silenciosos e permite reportar falha real ao vendedor. |
| **Média** | Classificação de produtos por ID/atributo em vez de regex | Manter mapa de produto_id→tipo (config no CRM) com fallback para o regex atual; elimina a fragilidade de renomeação. |
| **Média** | Lock/upsert em `registerAgentInCanal` | Trocar SELECT+INSERT por `INSERT ... ON CONFLICT` ou advisory lock. |
| **Média** | Circuit breaker / health-check do ERP | Curto-circuitar rapidamente quando ERP está fora, com mensagem clara, em vez de esperar timeouts. |
| **Baixa** | Cache de catálogos (produtos, canais, planos) | GETs de catálogo são estáveis; cache de minutos reduz dependência de disponibilidade do ERP. |
| **Baixa** | Reduzir logs com PII | Vários `console.log` imprimem payloads completos com CPF/nome (erpProxy.js 320–325, 901, 913, 1053). |
| **Baixa** | Extrair constantes hardcoded (IDs de tipos) para módulo de configuração único | Já estão razoavelmente centralizadas em erpDbService.js; formalizar num só objeto documentado. |

---

## 12. APIs do ERP não utilizadas

A documentação oficial da API do ERP **não está no repositório**. A comparação "código × documentação do ERP" portanto não é possível: **Não foi possível determinar pelo código** se existem endpoints REST documentados capazes de substituir os INSERTs diretos (itens, pessoas do pedido, endereços, fechamento, pagamento).

O que o código permite afirmar:
- `PrePropostaUsuarioSgprc` (usado em `/pre-proposta`, erpProxy.js 1054) é descrito no comentário como "proposta completa (header + endereço + produto + 1 beneficiário)" (linha 1036) — ou seja, cobre mais que `OrcamentoSgprcUsuario` —, porém com a limitação de permissão do bloco `...FECHAMENTO` registrada nas linhas 1044–1047, e limitado a 1 beneficiário conforme o comentário.
- Os comentários registram que as capacidades REST testadas eram insuficientes/incorretas para: itens múltiplos, beneficiários, endereço/contatos, campos do cabeçalho e fechamento (evidências na seção 1).

---

## 13. Dívida técnica

| # | Ponto | Gravidade | Impacto | Facilidade de correção |
|---|---|---|---|---|
| 1 | Sem rollback/compensação entre etapas REST→DB (pedido órfão em "M") | Alta | Correção manual recorrente no ERP | Difícil (exige saga/estado persistido) |
| 2 | Classificação de produto por regex de descrição + preço-sentinela 0,01 | Alta | Renomear produto quebra o wizard silenciosamente | Média (mapa por ID com fallback) |
| 3 | Fetch REST sem timeout/retry/circuit breaker | Alta | Requisições penduradas quando ERP degrada | Fácil (AbortController) |
| 4 | Acoplamento total ao schema do ERP (14 tabelas, sequence, triggers, NPEs replicados) | Alta | Upgrade do ERP pode quebrar tudo | Difícil (estrutural; mitigável com testes de contrato) |
| 5 | Best-effort silencioso em contatos/endereço/finalize | Média | Dados parciais sem o vendedor saber | Fácil/Média (transação + erro real) |
| 6 | `recordBomflowOrcamento` best-effort → pedido invisível nos relatórios | Média | Perda de rastreio de autoria/módulo | Fácil (alerta + reconciliação) |
| 7 | Corrida em `registerAgentInCanal` (SELECT+INSERT) | Média | Vínculo duplicado no canal | Fácil (ON CONFLICT) |
| 8 | URL do ERP hardcoded com `http://` (linha 8) e `ssl:false` no pool | Média | Tráfego sem TLS; ambiente único | Fácil (env var); TLS depende do ERP |
| 9 | Logs com PII (CPF, nomes, payloads completos) | Média | Exposição em logs | Fácil |
| 10 | Workarounds de bugs do ERP embutidos (NPE salvarFuncoesUsuario, tipo_produto_id, valor_desconto, admissão) | Média | Se o ERP corrigir os bugs, os workarounds viram ruído/risco | Média (documentados em comentários e em docs/Auditoria-Orcamento.md) |
| 11 | `NOME_ESTABELECIMENTO_FIXO`/estabelecimento 104 hardcoded | Baixa | Multiestabelecimento exigiria mudança de código | Fácil |
| 12 | Duplicação de utilitários (`erpLoginFromEmail`, `formatCpf` existem em backend e frontend) | Baixa | Divergência futura | Fácil |

---

## 14. Avaliação geral (notas 0–10)

| Critério | Nota | Justificativa (baseada no código) |
|---|---|---|
| **Arquitetura** | 5 | Separação clara proxy REST (erpProxy) × acesso DB (erpDbService) e pipeline bem ordenado com validações antecipadas (erpProxy 877–899). Porém o desenho híbrido REST+SQL sem camada de compensação/estado é estruturalmente frágil (seções 3 e 10). |
| **Organização** | 7 | Código concentrado em 2 arquivos coesos, funções com responsabilidade única e comentários excepcionalmente detalhados explicando cada decisão e cada bug do ERP contornado. Arquivos grandes (1,3–1,5k linhas) mas navegáveis. |
| **Segurança** | 6 | Pontos fortes: autoria resolvida SEMPRE no servidor ("não pode ser forjada pelo frontend", erpProxy 846–848), RBAC no backend (`requireManageAgents` 512–529, `isConsolidadoEligible` 1372–1389), SQL 100% parametrizado (nenhuma concatenação de valores encontrada). Pontos fracos: HTTP sem TLS na URL base (linha 8), `ssl:false` no pool, PII em logs. |
| **Escalabilidade** | 4 | Pool de 3 conexões, sem cache, sem fila; pipeline síncrono de ~7 passos por orçamento segurando a requisição HTTP do vendedor. Adequado ao volume atual de vendas assistidas; não escala para alto volume sem refatoração. |
| **Manutenibilidade** | 6 | Comentários e logs excelentes elevam muito; mas a manutenção exige conhecer o schema interno do ERP e suas triggers — conhecimento que vive só nos comentários e em docs/Auditoria-Orcamento.md. |
| **Acoplamento** | 2 | Acoplamento máximo: schema, sequence global, triggers, códigos de tipo, formatos de texto, e até NPEs internos do ERP são replicados no CRM. É a maior fraqueza estrutural (seção 6). |
| **Boas práticas** | 6 | Transações com FOR UPDATE, idempotência (cancelamento, admissão, upsert de pagamento), guards de estado, validações fail-fast antes de efeitos colaterais, erros 502 explícitos em vez de sucesso falso. Contra: best-effort silencioso, sem timeout/retry, sem testes automatizados da integração encontrados no repositório. |
| **Complexidade** | 5 | A complexidade essencial é alta (imposta pelo ERP) e o código a espelha honestamente; a complexidade acidental é moderada (duplicação de helpers, dois fluxos de criação — orcamento e pre-proposta). |
| **Confiabilidade** | 5 | Dentro de cada transação, sólida (rollback correto, locks). Entre etapas, dependente de intervenção manual em falhas parciais; sem retry, um blip de rede gera orçamento incompleto. Falhas são ao menos ruidosas (502 com instrução), exceto nas etapas best-effort. |

**Síntese:** a integração é um espelho fiel e cuidadosamente documentado do funcionamento interno do ERP, construída por engenharia reversa (pedidos reais citados nos comentários: 68335 na linha 424 do erpDbService, 68923 na linha 173 do UpsellNovoOrcamento). Sua força é a disciplina transacional e a transparência dos erros; sua fraqueza estrutural é o acoplamento total ao schema do ERP e a ausência de compensação/retry entre as etapas do pipeline.
