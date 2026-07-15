# Health Check — Módulo de Orçamentos (Bom Flow)

> **Data:** 15/07/2026  
> **Método:** análise estática 100% baseada no código-fonte. Nenhum arquivo foi alterado.  
> **Escopo:** wizard de criação de orçamento, relatórios, componentes, camada de API e serviços de backend.  
> **Arquivos analisados:** `UpsellNovoOrcamento.jsx` (2264 ln), `ErpOrcamentoForm.jsx` (1388 ln), `ErpOrcamentoRelatorioBase.jsx` (1132 ln), `OrcamentoDocumentos.jsx` (647 ln), `erpProxy.js` (1535 ln), `erpDbService.js` (1341 ln), `functions.js` (7073 ln, seção de auto-cancelamento), `erpClient.js` (62 ln), `erpService.js` (223 ln).

---

## 1. Organização

### 1.1 Arquivos grandes demais

| Arquivo | Linhas | Problema |
|---|---|---|
| `backend/src/routes/functions.js` | 7.073 | Arquivo "balde": rotas de helpdesk, vendas, leads, collections, auditoria e a lógica de auto-cancelamento de orçamentos todas no mesmo módulo. |
| `src/pages/UpsellNovoOrcamento.jsx` | 2.264 | Página-monólito: estado global do wizard, 12+ useMemos, 4 useEffects de lógica de negócio, 6 componentes de passo (Step1…Step6) e 4 helpers de negócio (montarNomeVeiculo, montarNomePet, etc.) no mesmo arquivo. |
| `backend/src/routes/erpProxy.js` | 1.535 | Proxy HTTP para o ERP + orquestração do pipeline de criação + relatórios + sincronização de agentes. Três responsabilidades distintas. |
| `backend/src/services/erpDbService.js` | 1.341 | Leitura + escrita transacional + auditoria no banco do ERP em um único serviço. |
| `src/pages/ErpOrcamentoForm.jsx` | 1.388 | Formulário de debug/pré-proposta com componentes internos (`SectionCard`, `FieldRow`, `JsonPreview`) que não existem em nenhuma biblioteca compartilhada. |
| `src/components/erp/ErpOrcamentoRelatorioBase.jsx` | 1.132 | Componente compartilhado por 4 páginas que mistura: 5 funções de fetch manuais, 16 `useState`, formatadores, KPIs, gráfico donut, modal de detalhe e exportação CSV/XLSX. |

### 1.2 Funções com mais de uma responsabilidade

| Arquivo | Função / linhas | Responsabilidades misturadas |
|---|---|---|
| `UpsellNovoOrcamento.jsx` | `validateStep` (889–1009) | Valida dados do wizard passo a passo E classifica produtos por tipo (BOM AUTO, BOM PET, DEPENDENTE, COMBO) para determinar o que validar. |
| `UpsellNovoOrcamento.jsx` | `payload useMemo` (766–829) | Monta o payload do ERP E classifica beneficiários por tipo de produto E decide se `registrarPessoa` é necessário — três responsabilidades em 65 linhas. |
| `erpProxy.js` | `POST /orcamento` route handler (840–1033) | Valida entrada, chama ERP REST, cadastra Pessoas, grava itens no DB, grava contatos/endereços, executa fechamento, registra rastreio no CRM — 7 etapas, 190 linhas, nenhum método extraído. |
| `erpDbService.js` | `addItemsToPedido` (450–681) | Gerencia transação, insere itens, insere pessoas (com dedup por CPF), vincula pessoas×itens, ajusta quantidade pós-dedup e atualiza valor total. |
| `erpDbService.js` | `applyFechamentoEPagamento` (1002–1133) | Verifica admissão do cliente, insere doc de admissão se faltar, muda situação do pedido M→I, insere guia de pagamento. |
| `ErpOrcamentoRelatorioBase.jsx` | componente principal (261–fim) | Busca dados, gerencia estado de UI, formata, filtra, calcula KPIs, renderiza modal de detalhe, exporta. |

### 1.3 Componentes com baixa coesão

| Arquivo | Problema |
|---|---|
| `ErpOrcamentoRelatorioBase.jsx` | Componente base genérico que encapsula **fetch manual, estado, lógica, UI e exportação** — faz tudo. Deveria ser dividido em hook de dados + componente de apresentação. |
| `UpsellNovoOrcamento.jsx` | `Step5` (linha 1727) recebe 15 props, gerencia sua própria renderização condicional de 4 tipos de cartão (condutor, veículo, pet, beneficiário comum) e aplica regras de negócio de produto. |
| `OrcamentoDocumentos.jsx` | Define CSS de animação como string no componente (`MOTION_CSS`, linhas 42–66) em vez de usar classes Tailwind ou um arquivo CSS separado. |

### 1.4 O que deveria ser um serviço

| Atual | Deveria ser |
|---|---|
| 5 funções de fetch manuais dentro de `ErpOrcamentoRelatorioBase` (`fetchUser`, `fetchTimes`, `fetchCanais`, `fetchVendedores`, `fetchRelatorio`, linhas 322–392) | Funções de serviço em `src/api/erpService.js` ou módulo dedicado `src/api/orcamentoService.js` |
| `lookupCpfMutation` duplicado em `UpsellNovoOrcamento.jsx` (712) e `ErpOrcamentoForm.jsx` (403) | Função de serviço compartilhada em `erpClient.js` (já existe o padrão, só falta a função) |
| `lookupCepMutation` duplicado (UpsellNovoOrcamento 746, ErpOrcamentoForm 426) | Função utilitária `buscarCep(cep): Promise<CepData>` |

### 1.5 O que deveria ser um hook

| Lógica atual | Hook sugerido |
|---|---|
| 12 `useMemo` + 4 `useEffect` + 15+ `useState` dentro de `UpsellNovoOrcamento` gerenciando o estado do wizard | `useOrcamentoWizard({ initialLead, modulo, leadId })` |
| Lógica de classificação de produto (isBomAuto, isBomPet, produtoCondutor, etc.) em `UpsellNovoOrcamento` linhas 412–571 | `useProdutoClassificacao({ erpProdutos, produtosSel, form.titulo_contrato })` |
| 16 `useState` + 5 `useEffect` de fetch em `ErpOrcamentoRelatorioBase` | `useOrcamentoRelatorio({ modulo })` |

### 1.6 O que deveria ser utilitário

| Lógica | Ocorrências atuais |
|---|---|
| `formatCpf` / `formatCpfMask` | `UpsellNovoOrcamento.jsx` ln 232; `ErpOrcamentoForm.jsx` ln 165 — código idêntico |
| `formatCep` / `formatCepMask` | `UpsellNovoOrcamento.jsx` ln 240; `ErpOrcamentoForm.jsx` ln 173 |
| `erpLoginFromEmail` | `UpsellNovoOrcamento.jsx` ln 222; `ErpOrcamentoForm.jsx` ln 119 — cópias idênticas |
| `isValidCpf` | `UpsellNovoOrcamento.jsx` ln 246; inline em `erpService.js` |
| `getAuthHeaders` | `erpClient.js` ln 8; `erpService.js` ln 3; `ErpOrcamentoRelatorioBase.jsx` ln 22; `OrcamentoDocumentos.jsx` ln 28 — 4 cópias com variações |
| `montarNomeVeiculo`, `montarNomePet` | Somente em `UpsellNovoOrcamento.jsx` mas deveriam estar em `src/utils/erpFormatters.js` |
| `formatCurrency`, `formatDateOnly`, `formatDateTime`, `fmtBR` | Definidas inline em `ErpOrcamentoRelatorioBase.jsx` ln 27–75; não compartilhadas |

---

## 2. Complexidade — Top 20 Funções

| # | Arquivo | Função | ~Linhas | Condicionais | Loops | Chamadas externas | Classificação |
|---|---|---|---|---|---|---|---|
| 1 | `erpProxy.js` | `POST /orcamento` handler | 190 | 12 | 0 | 7 (REST+DB) | **Muito Alta** |
| 2 | `erpDbService.js` | `addItemsToPedido` | 230 | 15 | 3 | 10 (DB) | **Muito Alta** |
| 3 | `erpProxy.js` | `resolveAgentErpByCpfViaApi` | 135 | 15 | 0 | 4 (REST) | **Muito Alta** |
| 4 | `UpsellNovoOrcamento.jsx` | `validateStep` | 120 | 22 | 3 | 0 | **Muito Alta** |
| 5 | `erpDbService.js` | `applyFechamentoEPagamento` | 130 | 10 | 0 | 6 (DB) | **Alta** |
| 6 | `erpDbService.js` | `ensureContatosEnderecoDB` | 155 | 15 | 3 | 8 (DB) | **Alta** |
| 7 | `erpProxy.js` | `POST /sync-agentes/commit` | 105 | 12 | 1 | 5 (REST+DB) | **Alta** |
| 8 | `UpsellNovoOrcamento.jsx` | `payload useMemo` | 65 | 10 | 3 | 0 | **Alta** |
| 9 | `erpProxy.js` | `POST /usuario` route handler | 80 | 8 | 0 | 4 (REST) | **Alta** |
| 10 | `UpsellNovoOrcamento.jsx` | `useEffect COMBO condutor` | 30 | 5 | 0 | 2 (setState) | **Média** |
| 11 | `UpsellNovoOrcamento.jsx` | `useEffect DEPENDENTE PAGO` | 30 | 6 | 4 | 2 (setState) | **Média** |
| 12 | `UpsellNovoOrcamento.jsx` | `isBomPet useMemo` | 12 | 4 | 1 (some+find) | 0 | **Média** |
| 13 | `UpsellNovoOrcamento.jsx` | `petBenefProdutoId useMemo` | 14 | 4 | 2 (find+some) | 0 | **Média** |
| 14 | `ErpOrcamentoRelatorioBase.jsx` | `fetchRelatorio` | 30 | 7 | 0 | 1 (fetch) | **Média** |
| 15 | `erpDbService.js` | `cancelOrcamentoDB` | 65 | 5 | 0 | 4 (DB) | **Média** |
| 16 | `erpDbService.js` | `getRelatorioOrcamentos` | 80 | 8 | 0 | 1 (DB) | **Média** |
| 17 | `erpProxy.js` | `GET /relatorio-orcamentos` handler | 90 | 8 | 0 | 3 (DB+ERP) | **Média** |
| 18 | `UpsellNovoOrcamento.jsx` | `produtosResumo useMemo` | 17 | 2 | 2 | 0 (mas chama inline fn) | **Baixa** |
| 19 | `UpsellNovoOrcamento.jsx` | `produtoCondutor useMemo` | 13 | 3 | 1 (find) | 0 | **Baixa** |
| 20 | `ErpOrcamentoForm.jsx` | `payload useMemo` | 60 | 5 | 2 | 0 | **Baixa** |

---

## 3. Duplicação

### 3.1 Código duplicado (funções idênticas em dois arquivos)

| Código | Arquivo A | Linha | Arquivo B | Linha |
|---|---|---|---|---|
| `erpLoginFromEmail` (corpo completo) | `UpsellNovoOrcamento.jsx` | 222–230 | `ErpOrcamentoForm.jsx` | 119–128 |
| `formatCpf` / `formatCpfMask` | `UpsellNovoOrcamento.jsx` | 232–238 | `ErpOrcamentoForm.jsx` | 165–171 |
| `formatCep` / `formatCepMask` | `UpsellNovoOrcamento.jsx` | 240–244 | `ErpOrcamentoForm.jsx` | 173–177 |
| `lookupCpfMutation` (mutationFn idêntica) | `UpsellNovoOrcamento.jsx` | 712–730 | `ErpOrcamentoForm.jsx` | 403–424 |
| `lookupCepMutation` (chamada viaCEP idêntica) | `UpsellNovoOrcamento.jsx` | 746–764 | `ErpOrcamentoForm.jsx` | 426–448 |
| `useQuery erpProdutos` (queryFn + staleTime=600s) | `UpsellNovoOrcamento.jsx` | 373–384 | `ErpOrcamentoForm.jsx` | 308–325 |

### 3.2 Constantes hardcoded em dois lugares

| Constante | Arquivo A | Linha | Arquivo B | Linha |
|---|---|---|---|---|
| `"LIMEIRA - CNPA"` | `UpsellNovoOrcamento.jsx` | 145 | `ErpOrcamentoForm.jsx` | 114 |
| `"ORÇAMENTO"` (tipo pedido) | `UpsellNovoOrcamento.jsx` | 795 | `ErpOrcamentoForm.jsx` | 113 |
| `1643483` (prazo_pagamento_id fixo) | `ErpOrcamentoForm.jsx` | 385 | (ausente no Upsell) | — |

### 3.3 Validações repetidas

| Validação | Locais |
|---|---|
| CPF: strip não-dígitos + length 11 | `erpService.js` ln 9–13; `buscarIndicadorERP` ln 65; `buscarReativacaoERP` ln 37; `UpsellNovoOrcamento.jsx` `isValidCpf` ln 246; `erpProxy.js` `formatCpf` ln 59 |
| CEP: strip não-dígitos + length 8 | `UpsellNovoOrcamento.jsx` validateStep step 2 ln 902; `ErpOrcamentoForm.jsx` `handleCepLookup` ln 482 |
| E-mail: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` | `UpsellNovoOrcamento.jsx` validateStep ln 899 (inline); `ErpOrcamentoForm.jsx` (implícito via campo) |
| Celular BR: DDD(2) + 9 + 8 dígitos | `ErpOrcamentoForm.jsx` `isValidCelularBR` ln 86–97; `UpsellNovoOrcamento.jsx` `isMobilePhone` (ln 895, sem mostrar definição) |

### 3.4 Formatadores repetidos

| Formatador | Locais |
|---|---|
| `getAuthHeaders` / `authHeaders` | `erpClient.js` ln 8; `erpService.js` ln 3; `ErpOrcamentoRelatorioBase.jsx` ln 22; `OrcamentoDocumentos.jsx` ln 28 — 4 variações, todas com `localStorage.getItem('accessToken')` |
| `formatCurrency` (Intl, BRL) | `ErpOrcamentoRelatorioBase.jsx` ln 46; duplicado em outros relatórios sem extração |
| `fmtBR` / `formatDateOnly` | Inline em `ErpOrcamentoRelatorioBase.jsx` ln 37 e ln 53 |

### 3.5 Regex repetidas

| Regex | Locais |
|---|---|
| `/NOME DO PET/i` | `UpsellNovoOrcamento.jsx` ln 149, 554 |
| `/DADOS DO CONDUTOR/i` | `UpsellNovoOrcamento.jsx` ln 155, 432 |
| `/DADOS DO VE[IÍ]CULO/i` | `UpsellNovoOrcamento.jsx` ln 158, 432 |
| `/DEPENDENTE/i` | `UpsellNovoOrcamento.jsx` ln 165, 174 (2×) |
| `/BOM\s*PET/i` | `UpsellNovoOrcamento.jsx` ln 553, 567 |
| `/SA[UÚ]DE/i` | `UpsellNovoOrcamento.jsx` ln 567, 569 |

---

## 4. Performance

### 4.1 Renders desnecessários / estados duplicados

| Local | Problema | Arquivo/Linha |
|---|---|---|
| `openBenef: boolean[]` + `beneficiarios` | Dois estados paralelos alinhados por índice. Toda operação de add/remove precisa atualizar ambos no mesmo tick; qualquer re-render intermediário pode dessincronizá-los. | `UpsellNovoOrcamento.jsx` ln 292–293 |
| `cpfLookup` / `cepLookup` + estado do form | O resultado do lookup altera dois estados independentes (`cpfLookup` e `form.contratante_pessoa`), causando dois re-renders onde um seria suficiente com estado unificado. | `UpsellNovoOrcamento.jsx` ln 721–726 |
| `ErpOrcamentoRelatorioBase`: 16 `useState` | Estado altamente granular com fetch manual — sem cache, sem staleTime, sem deduplicação. Cada troca de filtro dispara novo fetch sem aproveitar dados em memória. | ln 269–291 |

### 4.2 `useMemo` com dependências excessivas

| `useMemo` | Dependências | Problema | Arquivo/Linha |
|---|---|---|---|
| `payload` | `form, itensSel, produtosFiltrados, erpProdutos, planoSelecionado, beneficiarios, erpAgenteVendaId, user, modulo` (9 deps) | Reconstrói o payload inteiro a cada tecla no nome do contratante ou em qualquer campo de beneficiário, incluindo campos ERP complexos que não mudaram. | ln 766–829 |
| `produtosResumo` | `itensSel, produtosFiltrados, erpProdutos, beneficiarios` | Chama `qtyForProduto` (função inline que filtra todo `beneficiarios`) dentro de `.map()` → O(produtos × beneficiários) a cada keystroke. | ln 501–516 |
| `isBomPet` | `isBomAuto, petProdutoIds, produtosSel, produtosFiltrados, erpProdutos` | `produtosSel.some()` com `produtosFiltrados.find() || erpProdutos.find()` interno — dois `find` por produto selecionado. | ln 546–555 |
| `petBenefProdutoId` | `produtosBeneficiario, produtosSel, produtosFiltrados, erpProdutos` | `produtosSel.some()` com dois `find` aninhados para detectar plano saúde. | ln 559–571 |

### 4.3 `useEffect` problemáticos

| `useEffect` | Problema | Arquivo/Linha |
|---|---|---|
| COMBO condutor | `beneficiarios` está na lista de deps (ln 626) E o efeito chama `setBeneficiarios`. Um change em qualquer campo do condutor (eg nome) pode re-triggerar o efeito. Protegido por guards manuais mas o ciclo de re-avaliação é constante. | ln 600–628 |
| DEPENDENTE PAGO | Deps incluem `beneficiarios` (ln 658) E o efeito chama `setBeneficiarios`. Mesma fragilidade de loop. Guard `if (toAdd.length === 0 && toRemove.size === 0) return;` protege, mas cria avaliação redundante a cada render. | ln 634–658 |
| BOM PET | `beneficiarios` na dep (ln 681) E o efeito chama `setBeneficiarios`. | ln 663–681 |
| `ErpOrcamentoRelatorioBase` — chain de efeitos | `useEffect(() => { fetchUser(); }, [])` → `useEffect(() => { if (!currentUser) ... fetchRelatorio(); }, [currentUser])` → cada navegação dispara 4–5 fetches sequenciais sem cache. | ln 306–319 |
| `ErpOrcamentoRelatorioBase` — `filterTime` | `useEffect(() => { if (isAdmin) fetchVendedores(filterTime); }, [filterTime])` sem `isAdmin` nas deps — comportamento incorreto se `isAdmin` mudar (improvável mas tecnicamente incorreto). | ln 317–319 |

### 4.4 Buscas repetidas

| Padrão | Arquivo/Linha |
|---|---|
| `produtosFiltrados.find(p => ...) || erpProdutos.find(p => ...)` — dois `find` no mesmo `map` | `UpsellNovoOrcamento.jsx` payload ln 769–770 e produtosResumo ln 504–505 |
| `erpProdutos.find(p => String(p.id) === String(ps.produto_id))` — repeated em 4 `useMemo`s | `isBomPet` ln 551–552; `petBenefProdutoId` ln 563–565; `payload` ln 769; `produtosResumo` ln 504 |
| `ErpOrcamentoRelatorioBase`: `fetchCanais` sempre busca a lista completa sem cache | ln 340–348 — lista raramente muda, poderia ter staleTime longo |

---

## 5. Legibilidade

### 5.1 Funções difíceis de entender

| Função | Problema | Arquivo/Linha |
|---|---|---|
| `validateStep` | 120 linhas, 22 condicionais, 5 níveis de if. Validações do passo 4 verificam `isBomAuto`, `isBomPet`, `COMBO`, `DEPENDENTE PAGO` e beneficiários comuns — 5 fluxos paralelos num único bloco. | `UpsellNovoOrcamento.jsx` ln 889–1009 |
| `resolveAgentErpByCpfViaApi` | 4 chamadas REST sequenciais com fallback progressivo; cada retorno parcial tem path de sucesso/erro diferente; nome da função não deixa claro que faz chamadas de rede. | `erpProxy.js` ln 147–285 |
| Derivações em cadeia (BOM AUTO/PET) | `produtoCondutorDireto → produtoCondutor → isBomAuto → produtosBeneficiario → benefItens → itensSel → produtosResumo` — 7 `useMemo`s interdependentes que precisam ser lidos na ordem correta para fazer sentido. | `UpsellNovoOrcamento.jsx` ln 412–520 |
| `addItemsToPedido` | Transação SQL com dedup de CPF embutido: `INSERT ... WHERE NOT EXISTS` seguido de ajuste de quantidade — 4 INSERTs distintos e 1 UPDATE, todos numa transação, com lógica de negócio de dedup acoplada. | `erpDbService.js` ln 450–681 |

### 5.2 Muitos níveis de if

| Função | Máx. nível de aninhamento | Arquivo/Linha |
|---|---|---|
| `validateStep` step 4 | 4 níveis | `UpsellNovoOrcamento.jsx` ln 922–1001 |
| `resolveAgentErpByCpfViaApi` | 4 níveis | `erpProxy.js` ln 185–268 |
| `setBenef` (troca de produto pet→não-pet) | 3 níveis | `UpsellNovoOrcamento.jsx` ln 1040–1059 |
| `applyFechamentoEPagamento` | 3 níveis | `erpDbService.js` ln 1030–1055 |

### 5.3 Nomes pouco claros

| Nome | Problema | Arquivo/Linha |
|---|---|---|
| `step === 4` renderiza `<Step5>` e `step === 5` renderiza `<Step4>` | Steps com nome cruzado — a numeração do componente não corresponde ao número do passo renderizado. | `UpsellNovoOrcamento.jsx` ln 1179–1200 |
| `un_lougradouro` | Erro tipográfico do ERP ("lougradouro" vs "logradouro") usado verbatim em todo o código frontend. Confunde leitores que não sabem da origem. | em todo `UpsellNovoOrcamento.jsx` e `ErpOrcamentoForm.jsx` |
| `openBenef` | Array de booleans alinhado por índice com `beneficiarios` — nome não indica a estrutura; poderia ser `benefOpen` ou simplesmente composto no objeto `beneficiarios`. | `UpsellNovoOrcamento.jsx` ln 293 |
| `benefItens` | Produtos de beneficiário como itens do orçamento — a distinção com `produtosSel` (itens do titular) não é óbvia pelo nome. | `UpsellNovoOrcamento.jsx` ln 482 |
| `usua_*` | Prefixo `usua_` vem do ERP e é mantido verbatim nos campos de beneficiário — leitores sem conhecimento do schema ERP ficam sem contexto. | em todo o wizard |
| `cpf` no payload | O mesmo campo `form.cpf` é o CPF do contratante, mas o campo `usua_cpf` é o CPF do beneficiário — distinção por prefixo, não por nome semântico. | `UpsellNovoOrcamento.jsx` |

### 5.4 Mistura de UI com regra de negócio

| Local | Problema | Arquivo/Linha |
|---|---|---|
| `useEffect` BOM AUTO | Lógica de negócio ("dois cards fixos para BOM AUTO") embutida diretamente no componente de página, não num serviço/hook. | `UpsellNovoOrcamento.jsx` ln 577–593 |
| `validateStep` | Regra de negócio (veículo precisa de modelo/cor/placa/ano; pet precisa de nome/tipo/raça/cor/porte) misturada com lógica de navegação de wizard. | ln 889–1009 |
| `ErpOrcamentoRelatorioBase` | Funções `fetchUser`, `fetchRelatorio` etc. vivem dentro do componente — UI e data fetching no mesmo lugar. | ln 322–392 |
| `payload useMemo` | Montagem do payload ERP (regra de negócio sobre quais campos enviar) dentro do componente de página. | `UpsellNovoOrcamento.jsx` ln 766–829 |

---

## 6. Mapa de Dependências

```
┌─────────────────────────────────────────────────────┐
│              Páginas de Relatório (4x)               │
│  SalesOrcamentoRelatorio (12 ln)                     │
│  SalesUpsellOrcamentoRelatorio (12 ln)               │
│  ReferralOrcamentoRelatorio                          │
│  PreSalesOrcamentoRelatorio (644 ln)                 │
└────────────────────┬────────────────────────────────┘
                     │ props: moduloNome, modulo, gradient, accentColor
                     ▼
┌─────────────────────────────────────────────────────┐
│         ErpOrcamentoRelatorioBase (1.132 ln)         │
│  (componente base compartilhado)                     │
│  — 16 useState, 3 useEffect, 7 useMemo               │
│  — 5 funções de fetch manuais (sem React Query)      │
└──┬──────┬───────────┬──────────────────┬────────────┘
   │      │           │                  │
   ▼      ▼           ▼                  ▼
/auth/me /teams  /erp/canais-venda  /erp/relatorio-orcamentos
                                         │
                                         ▼
                               erpProxy.js GET handler
                               ├─ CRM DB: bomflow_orcamentos
                               └─ ERP DB: getRelatorioOrcamentos
                                    └─ pedidos + pedidos_pessoas +
                                       pessoas_contratos + usuarios

┌─────────────────────────────────────────────────────┐
│        UpsellNovoOrcamento (2.264 ln)                │
│  (wizard de criação — fluxo de produção principal)   │
└──┬───────────────────────────────────────────────────┘
   │
   ├─ base44.auth.me (React Query)
   │
   ├─ useQuery: /api/erp/produtos
   │    └─ erpProxy GET /produtos → ERP REST /API_MV_API_PRODUTOS
   │
   ├─ useQuery: /api/erp/planos-pagamento
   │    └─ erpProxy GET /planos-pagamento
   │         └─ erpDbService.getPlanosPagamento → ERP DB planos_pagamentos
   │
   ├─ useMutation: /api/erp/lookup-cpf
   │    └─ erpProxy GET /lookup-cpf → ERP REST /Pessoas → ERP REST /API_CADASTRO_PESSOAS
   │
   ├─ useMutation: https://viacep.com.br  ← EXTERNO DIRETO (sem proxy)
   │
   └─ useMutation: /api/erp/orcamento  [CRÍTICO]
        └─ erpProxy POST /orcamento (190 ln, 7 etapas)
             ├─[1] ERP REST: POST /OrcamentoSgprcUsuario
             ├─[2] ERP REST: POST /Pessoas (dependentes)
             ├─[3] ERP DB txn: addItemsToPedido
             │      └─ itens_pedidos + pedidos_pessoas + pedidos_pessoas_produtos
             ├─[4] ERP DB no-txn: ensureContatosEnderecoDB → enderecos
             ├─[5] ERP DB no-txn: finalizeOrcamentoDB → pedidos
             ├─[6] ERP DB txn: applyFechamentoEPagamento
             │      └─ documentos_pessoas + modos_pagamentos + pedidos (M→I)
             └─[7] CRM DB: bomflow_orcamentos INSERT/UPSERT

┌─────────────────────────────────────────────────────┐
│         ErpOrcamentoForm (1.388 ln) [DEBUG]          │
│  (formulário de pré-proposta / uso interno)          │
└──┬───────────────────────────────────────────────────┘
   ├─ useQuery: /api/erp/produtos  ← mesma query key do UpsellNovoOrcamento
   ├─ useMutation: /api/erp/lookup-cpf
   ├─ useMutation: viacep.com.br direto
   └─ useMutation: /api/erp/pre-proposta
        └─ erpProxy POST /pre-proposta → ERP REST /PrePropostaUsuarioSgprc

Acoplamentos identificados:
  ● 4 páginas dependem de 1 componente base (ErpOrcamentoRelatorioBase)
  ● erpDbService.js acoplado a 14 tabelas + 1 sequence do schema ERP
  ● viacep.com.br acessado diretamente do frontend (sem proxy, sem cache)
  ● ErpOrcamentoRelatorioBase gerencia seu próprio auth (fetchUser manual)
    em vez de usar o contexto de auth já disponível (base44.auth.me)
```

---

## 7. Pontos Frágeis

| # | Trecho | Risco | Arquivo/Linha | Motivo |
|---|---|---|---|---|
| 1 | `openBenef` array paralelo a `beneficiarios` | Alto | `UpsellNovoOrcamento.jsx` ln 292–293 | Dois estados alinhados por índice. Toda remoção/inserção exige atualizar ambos simultaneamente. Uma chamada de `setBeneficiarios` sem o correspondente `setOpenBenef` corrompe silenciosamente: o painel errado fica aberto/fechado, e o próximo `toggleBenef(i)` inverte o estado do índice errado. |
| 2 | Efeitos `beneficiarios`→`setBeneficiarios` (COMBO, DEP PAGO, BOM PET) | Médio-Alto | `UpsellNovoOrcamento.jsx` ln 600, 634, 663 | Três `useEffect` têm `beneficiarios` nas deps E chamam `setBeneficiarios`. Guards manuais evitam loop, mas qualquer mudança nos guards pode criar ciclo. Dependências de `form.cpf`, `form.pessoa_contato` (ln 626) fazem o efeito COMBO re-avaliar em cada keystroke do contratante. |
| 3 | Threshold de preço 0,01 para classificar dependente | Alto | `UpsellNovoOrcamento.jsx` ln 164–168 | `isDependenteProduto`: `Math.abs(preco - 0.01) < 0.005`. Se o ERP mudar o preço de "vaga" de 0,01 para 0,00 (gratuito) ou 0,02 (pequeno ajuste), a classificação muda silenciosamente e o produto aparece como item do titular em vez de vaga de beneficiário — sem erro, sem aviso. |
| 4 | `String(b.usua_produtos) === String(produtoId)` | Médio | `UpsellNovoOrcamento.jsx` (múltiplos) | Comparação String. Se `usua_produtos` for `null` ou `undefined`, `String(null) === String(null)` → `"null" === "null"` → `true`. Um beneficiário sem produto atribuído pode ser incorretamente associado a outro sem produto. |
| 5 | `recordBomflowOrcamento` best-effort | Alto (impacto operacional) | `erpProxy.js` ln 795–836 | Falha silenciosa. O orçamento existe no ERP mas não aparece em nenhum relatório do Bom Flow (o relatório filtra por `bomflow_orcamentos`). A única evidência é um `console.error`. |
| 6 | Step labels cruzados (step 4 = `<Step5>`, step 5 = `<Step4>`) | Médio | `UpsellNovoOrcamento.jsx` ln 1179–1200 | Discrepância entre índice de passo e nome de componente. Manutenção futura (reordenar passos, adicionar validação ao passo 5) tende a atingir o componente errado. |
| 7 | Chamada direta a `viacep.com.br` sem proxy | Baixo-Médio | `UpsellNovoOrcamento.jsx` ln 749; `ErpOrcamentoForm.jsx` ln 429 | Depende de disponibilidade de serviço externo sem fallback, sem timeout e sem cache. CORS pode bloquear em futuros ambientes. |
| 8 | `resolveAgentErpByCpfViaApi` fallback por nome | Médio | `erpProxy.js` ln 250–268 | O fallback busca usuário por nome exato normalizado. Se dois agentes tiverem o mesmo nome no ERP (ou nome muito similar após normalização), o primeiro resultado é retornado — vínculo de agente errado criado silenciosamente. |
| 9 | `finalizeOrcamentoDB` e `ensureContatosEnderecoDB` sem transação e sem erro visível | Médio | `erpDbService.js` ln 695–762, 808–961 | Falhas nessas etapas retornam `null` / log sem notificar o vendedor. O orçamento é tratado como sucesso mesmo com endereço ou campos financeiros ausentes. |
| 10 | `NOVO_ORCAMENTO_ALLOWED_EMAILS` hardcoded | Baixo | `UpsellNovoOrcamento.jsx` ln 280–285 | Lista de e-mails autorizados (`["teste3@bomflow.com", "bomflow4@wescctech.com.br"]`) hardcoded no frontend, contornável pelo papel `admin`. Gate de acesso inconsistente: `embedded=true` ignora a lista. |

---

## 8. Risco de Alteração

| Arquivo | Risco | Justificativa |
|---|---|---|
| `erpDbService.js` — `addItemsToPedido` | **CRÍTICO** | SQL direto em 6 tabelas do ERP com transação. Qualquer erro de tipo (`double precision` vs `numeric`), schema change no ERP ou NPE não mapeado quebra o fluxo completo de orçamento de produção. |
| `erpDbService.js` — `applyFechamentoEPagamento` | **CRÍTICO** | Fecha o pedido (M→I) no ERP. Erro deixa pedidos presos em "M" exigindo intervenção manual. Guarda de estado (`FOR UPDATE`) protege concorrência, mas qualquer mudança na lógica de admissão ou pagamento pode quebrar o fechamento. |
| `erpProxy.js` — `POST /orcamento` handler | **CRÍTICO** | Orquestra 7 etapas de escrita (REST+DB) sem compensação automática. Mudança de ordem, adição de etapa ou alteração de campo pode deixar orçamentos em estado incompleto para cada usuário que tentar criar. |
| `UpsellNovoOrcamento.jsx` — lógica de efeitos BOM AUTO/COMBO/PET | **Alto** | 5 modos interdependentes (normal, BOM AUTO, BOM PET, COMBO, DEPENDENTE PAGO). Qualquer mudança num modo pode afetar os outros via os efeitos compartilhados sobre `beneficiarios`. |
| `UpsellNovoOrcamento.jsx` — `validateStep` | **Alto** | Validação de 6 passos em função monolítica. Adição de campo obrigatório no passo 3 pode inadvertidamente impactar validação do passo 4 se a lógica cruzar tipos de produto. |
| `ErpOrcamentoRelatorioBase.jsx` | **Médio** | Compartilhado por 4 páginas. Qualquer mudança de prop ou comportamento impacta relatórios de Vendas PF, Upsell, Indicações e Pré-Vendas simultaneamente. |
| `erpDbService.js` — `ensureContatosEnderecoDB` | **Médio** | 9 operações de banco best-effort sobre endereços e contatos do cliente. Mudança de tipos de endereço (constantes 565/566/573/574/577) no ERP não gera erro — apenas dados gravados errado. |
| `backend/src/routes/functions.js` (seção auto-cancelamento) | **Médio** | Usa `cancelOrcamentoDB` dentro de um job cron. Mudança na lógica de prazo ou no `PRESALES_AUTOCANCEL_MOTIVO_ID` afeta cancelamentos automáticos em produção. |
| `src/api/erpService.js` | **Médio** | Usada por vários módulos além de Orçamentos (Referrals, gestão de agentes). Mudança de contrato ou URL impacta áreas não relacionadas. |
| `ErpOrcamentoForm.jsx` | **Baixo** | Formulário de debug/pré-proposta. Uso em produção limitado. Mudanças não impactam o fluxo principal (UpsellNovoOrcamento). |
| `src/api/erpClient.js` | **Baixo** | 3 funções de wrapping HTTP simples. Mudanças facilmente localizáveis e testáveis. |
| `OrcamentoDocumentos.jsx` | **Baixo** | Componente de upload de documentos. Dependência dos tipos fixos `DOC_TIPOS` e endpoint de upload; mudanças são isoladas ao componente. |

---

## 9. Refatorações Seguras (sem alteração de comportamento, regra de negócio, integração ERP ou SQL)

| # | Refatoração | O que muda | O que NÃO muda |
|---|---|---|---|
| 1 | Extrair `formatCpf`, `formatCep`, `erpLoginFromEmail`, `isValidCpf` para `src/utils/erpFormatters.js` e importar nos 2 arquivos | Localização do código | Comportamento, lógica |
| 2 | Extrair `getAuthHeaders` para `src/utils/authHeaders.js` e importar nos 4 usos | Localização | Comportamento |
| 3 | Extrair `NOME_ESTABELECIMENTO_FIXO`, `TIPO_PEDIDO_FIXO`, `SITUACOES`, `STATUS_COLORS` para `src/constants/erpConstants.js` | Localização das constantes | Valores, uso |
| 4 | Mover `ProgressBar`, `Step1`, `Step2`, `Step6` (revisão) para `src/components/orcamento/wizard/` sem alterar props | Estrutura de arquivos | Interface, lógica |
| 5 | Mover `SectionCard`, `FieldRow`, `JsonToken`, `JsonPreview` do `ErpOrcamentoForm.jsx` para `src/components/erp/` | Estrutura de arquivos | Comportamento, renderização |
| 6 | Corrigir nomes cruzados: renomear `<Step5>` → `<StepBeneficiarios>` e `<Step4>` → `<StepPagamento>` (nomes semânticos, sem alterar ordem ou lógica) | Nome dos componentes internos | Renderização, ordem dos passos, props |
| 7 | Mover `MOTION_CSS` de `OrcamentoDocumentos.jsx` (ln 42) para `src/index.css` ou arquivo CSS dedicado | Local de definição do CSS | Classes, animações, comportamento visual |
| 8 | Unificar `openBenef: boolean[]` no objeto `beneficiarios` como `{ ...EMPTY_BENEFICIARIO, open: true }` — estado único, sem mudar nenhuma lógica de negócio | Estrutura de estado (uma array em vez de duas) | Comportamento de abertura/fechamento de cards |
| 9 | Adicionar `displayName` aos componentes internos anônimos de `UpsellNovoOrcamento` para melhorar legibilidade no React DevTools | Metadado de debug | Comportamento |
| 10 | Extrair a função inline `qtyForProduto` (ln 476) como função nomeada fora do componente, sem alterar seu corpo | Localização (closure → função pura) | Cálculo de quantidade |

---

## 10. Roadmap

### Quick Wins (< 1 hora cada)

| Item | Benefício | Risco | Esforço |
|---|---|---|---|
| Extrair `getAuthHeaders` compartilhado | Elimina 4 cópias; futura troca de token só num lugar | Mínimo | 15 min |
| Extrair `formatCpf`, `formatCep`, `erpLoginFromEmail`, `isValidCpf` para utils | Elimina duplicação em 2 arquivos | Mínimo | 20 min |
| Corrigir nomes cruzados Step4/Step5 | Elimina confusão de manutenção | Mínimo (rename) | 10 min |
| Extrair constantes `SITUACOES`, `STATUS_COLORS`, `NOME_ESTABELECIMENTO_FIXO` | Fonte única de verdade para mapeamento de situações | Mínimo | 15 min |
| Adicionar `displayName` a componentes internos | Melhor experiência de debug | Zero | 10 min |

### Pequenas Melhorias (1–4 horas)

| Item | Benefício | Risco | Esforço |
|---|---|---|---|
| Mover `ProgressBar`, `Step1`, `Step2`, `Step6` para arquivos separados | Reduz UpsellNovoOrcamento de 2264 para ~1400 linhas | Baixo (rename de imports) | 1–2 h |
| Mover `SectionCard`, `FieldRow`, `JsonPreview` do ErpOrcamentoForm | Reutilizáveis; desafoga o arquivo de debug | Baixo | 1 h |
| Mover `MOTION_CSS` para arquivo CSS | Separa preocupações; CSS em lugar correto | Zero | 15 min |
| Extrair `qtyForProduto` como função pura fora do componente | Testável individualmente; mais legível | Zero | 10 min |
| Unificar `openBenef + beneficiarios` → array de objetos | Elimina dessincronização estrutural | Baixo | 2 h |

### Melhorias Médias (1–3 dias)

| Item | Benefício | Risco | Esforço |
|---|---|---|---|
| Extrair `useOrcamentoWizard` hook dos ~800 linhas de lógica de `UpsellNovoOrcamento` | Separação clara estado/UI; lógica testável isoladamente | Médio (refatoração de escopo) | 2–3 dias |
| Migrar `ErpOrcamentoRelatorioBase` para React Query (substituir 5 fetchers manuais) | Cache automático, deduplicação, staleTime; menos re-fetches | Baixo-médio | 1 dia |
| Extrair `useProdutoClassificacao` hook (isBomAuto, isBomPet, produtoCondutor, etc.) | Isola lógica complexa de produto; testável | Médio | 1 dia |
| Adicionar timeout (`AbortController`, 15s) nos fetch calls de `erpProxy.js` | Evita requisições penduradas quando ERP degrada | Baixo | 2 h |
| Proxy para ViaCEP no backend (GET `/api/utils/cep`) | Elimina dependência externa direta do frontend; permite cache e fallback | Baixo | 3 h |

### Grandes Evoluções (1+ semana)

| Item | Benefício | Risco | Esforço |
|---|---|---|---|
| Dividir `erpProxy.js` em 3 módulos: `erpAgentRoutes`, `erpOrcamentoRoutes`, `erpRelatorioRoutes` | Reduz complexidade; cada módulo < 500 linhas; responsabilidade única | Médio (reorganização de imports/exports) | 3 dias |
| Dividir `erpDbService.js` em `erpWriteService` e `erpReadService` | Separação clara entre leitura (sem transações) e escrita (transacional) | Médio | 2 dias |
| Dividir `functions.js` extraindo a seção de orçamentos para módulo próprio | Reduz o arquivo de 7073 linhas; facilita manutenção | Alto (arquivo central) | 1 semana |
| Implementar "saga" de criação de orçamento: persistir estado das 7 etapas no CRM para recuperação automática | Elimina orçamentos incompletos irrecuperáveis; melhora resiliência | Alto (nova feature de infra) | 2+ semanas |
| Substituir classificação de produto por regex → mapa configurável por ID | Elimina fragilidade de renomeação de produto no ERP | Médio (requer mapeamento inicial) | 3 dias + setup operacional |
| Testes de integração para o pipeline POST /orcamento (7 etapas) | Detecta regressões antes de produção | Baixo (apenas adição) | 1 semana |

---

## Tabela Geral de Oportunidades

| # | Oportunidade | Impacto | Esforço | Risco |
|---|---|---|---|---|
| 1 | Extrair utilitários compartilhados (formatCpf, formatCep, erpLoginFromEmail, isValidCpf, getAuthHeaders) | Médio | **Baixo** | Mínimo |
| 2 | Corrigir nomes cruzados Step4/Step5 | Baixo | **Baixo** | Mínimo |
| 3 | Extrair constantes compartilhadas (SITUACOES, STATUS_COLORS, NOME_ESTABELECIMENTO_FIXO) | Médio | **Baixo** | Mínimo |
| 4 | Unificar openBenef+beneficiarios em array de objetos | **Alto** | Médio | Baixo |
| 5 | Mover Step1/Step2/ProgressBar/Step6 para arquivos separados | Médio | **Baixo** | Baixo |
| 6 | Extrair useOrcamentoWizard hook | **Alto** | Alto | Médio |
| 7 | Migrar ErpOrcamentoRelatorioBase para React Query | **Alto** | Médio | Baixo |
| 8 | Extrair useProdutoClassificacao hook | Médio | Médio | Médio |
| 9 | Timeout/AbortController nas chamadas REST de erpProxy | **Alto** | **Baixo** | Mínimo |
| 10 | Proxy backend para ViaCEP | Médio | **Baixo** | Mínimo |
| 11 | Dividir erpProxy.js em 3 módulos | Médio | Alto | Médio |
| 12 | Dividir erpDbService.js em read/write service | Médio | Alto | Médio |
| 13 | Extrair seção de orçamentos de functions.js | Médio | Alto | **Alto** |
| 14 | Saga de criação de orçamento (recuperação automática) | **Alto** | **Alto** | Alto |
| 15 | Substituir regex de produto por mapa configurável | **Alto** | Médio | Baixo |
| 16 | Testes de integração do pipeline POST /orcamento | **Alto** | Alto | Mínimo |
| 17 | Mover MOTION_CSS para CSS file | Baixo | **Baixo** | Mínimo |
| 18 | Extrair SectionCard/FieldRow/JsonPreview de ErpOrcamentoForm | Baixo | **Baixo** | Mínimo |
| 19 | displayName em componentes internos | Baixo | **Baixo** | Mínimo |
| 20 | Extrair qtyForProduto como função pura | Baixo | **Baixo** | Mínimo |

> **Legenda:** Impacto e Risco = **Alto** / Médio / Baixo; Esforço = **Alto** / Médio / **Baixo**
