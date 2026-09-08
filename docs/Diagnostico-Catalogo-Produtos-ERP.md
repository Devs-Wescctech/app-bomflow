# Diagnóstico do catálogo de produtos ERP

**Data da análise:** 26/08/2026  
**Revalidação dos produtos dependentes:** 28/08/2026
**Escopo:** catálogo usado pelo wizard de novo orçamento do Bom Flow  
**Método:** leitura do código, consulta somente leitura à API e ao banco do ERP e confronto com as imagens fornecidas  
**Mutação realizada:** nenhuma

## 1. Resumo executivo

Os itens aparentemente equivalentes não são o mesmo registro exibido com preços diferentes. O ERP mantém dois produtos distintos para a distância de 1.000 km:

| Cadastro | ID interno usado pela integração | Código visível no ERP | Descrição | Preço do cadastro |
|---|---:|---:|---|---:|
| Histórico | `52247119` | `408` | `QUILOMETRAGEM (1 MIL KM)` | R$ 15,00 |
| Novo | `203567310` | `121242` | `QUILOMETRAGEM (1000 KM)` | R$ 20,00 |

Para o título `BOM PASTOR`, a API `API_MV_API_PRODUTOS` devolve os dois ao mesmo tempo. No banco, o vínculo do produto histórico com esse título está em situação `S`, enquanto o vínculo do produto novo está em situação `A`. Mesmo assim, o endpoint expõe ambos.

O Bom Flow:

1. recebe os dois registros sem filtrar situação;
2. não deduplica descrições semanticamente equivalentes (`1 MIL KM` e `1000 KM`);
3. mostra o `preco_informado` de cada registro;
4. guarda o ID interno do produto selecionado;
5. envia o preço que estava no estado do navegador;
6. não reconfirma no backend se produto, vínculo e preço continuam válidos;
7. grava diretamente esse ID e esse preço em `itens_pedidos`.

**Causa principal — confiança alta:** coexistência, no catálogo retornado pelo ERP, de uma versão histórica/suspensa e uma versão atual/ativa da mesma oferta comercial.

**Fatores agravantes — confiança alta:** ausência de filtro por situação no endpoint/cliente, filtro textual amplo de título no Bom Flow e ausência de validação server-side do preço e do vínculo antes da gravação.

**Cache — descartado como causa da divergência observada:** ele pode atrasar a chegada de uma alteração por pelo menos dez minutos, mas a consulta direta atual ao ERP já retorna simultaneamente os preços de R$ 15,00 e R$ 20,00.

**Mitigação aplicada após o diagnóstico:** o Bom Flow passou a validar, no backend e antes da criação do orçamento, o vínculo ativo do produto com o título exato e o preço atual no banco ERP. A API do ERP ainda deve ser corrigida para não publicar vínculos suspensos.

## 2. Evidências analisadas

As imagens usadas como referência foram:

- `attached_assets/image_1787760598257.png`: cadastro do ERP com os códigos `121241` a `121244`;
- `attached_assets/image_1787760539875.png`: lista do Bom Flow com `QUILOMETRAGEM (1000 KM)` a R$ 20,00 e `QUILOMETRAGEM (1 MIL KM)` a R$ 15,00.

Nenhum dado pessoal foi reproduzido neste relatório.

## 3. Origem do catálogo, de ponta a ponta

### 3.1 Frontend

O wizard `src/pages/UpsellNovoOrcamento.jsx` executa:

```text
GET /api/erp/produtos
Authorization: Bearer <sessão>
```

A resposta é mantida pelo React Query na chave global `["erpProdutos"]`, sem transformação.

Após o usuário escolher um título, o frontend filtra localmente:

```js
const titulo = (p.titulo_contrato || p.descricao || "").toLowerCase();
return titulo.includes(form.titulo_contrato.toLowerCase());
```

Consequências:

- não há filtro por situação, vigência, validade, `produto_adendo` ou contrato ativo;
- não há ordenação;
- não há deduplicação por ID, código, descrição normalizada ou distância;
- o casamento de título é por `includes`, não por igualdade.

O último ponto é especialmente amplo para `BOM PASTOR`: esse texto também casa com `BOM PASTOR - ESSENCIAL`, `BOM PASTOR - IDEAL`, `BOM PASTOR - TOTAL +` e outros títulos. Como o mesmo ID de produto pode aparecer em vários contratos na resposta da API, a lista pode repetir o mesmo registro visualmente. A seleção, porém, é deduplicada por ID.

### 3.2 Proxy do Bom Flow

O backend expõe `GET /api/erp/produtos` em `backend/src/routes/erpProxy.js`. Ele:

1. autentica a requisição;
2. chama diretamente `http://erp.wescctech.com.br:8080/BP_MULTI/api/API_MV_API_PRODUTOS`;
3. usa `fetchErpAllPages`;
4. devolve o array acumulado sem filtrar, ordenar, validar ou transformar.

Não existe cache de produtos no backend.

### 3.3 Paginação

`backend/src/utils/erpPagination.js` envia:

- `limit=10000`;
- `offset=0`, depois avança pelo número de linhas realmente recebido;
- no máximo 50 páginas;
- timeout de 120 segundos por página.

Isso contorna o limite histórico de 100 linhas de APIs do ERP. A consulta original de 26/08/2026 devolveu **437 linhas** no catálogo completo. Na revalidação de 28/08/2026, o endpoint devolveu **338 linhas**; a diferença de volume não afetou os 38 vínculos de dependentes elegíveis detalhados na seção 13.

### 3.4 Endpoint e campos

O endpoint consultado é `API_MV_API_PRODUTOS`. A resposta observada contém:

| Campo | Uso no fluxo |
|---|---|
| `id` | ID interno do produto; é a identidade usada para selecionar e gravar |
| `produto_id` | Mesmo ID interno nos registros analisados |
| `descricao` | Texto exibido na lista e usado para classificar tipos especiais |
| `titulo_contrato` | Agrupamento de produto por título de contrato |
| `contrato_id` | ID interno do título/contrato no ERP |
| `preco_informado` | Preço padrão mostrado e pré-preenchido |
| `tipo_contrato` | Classificação funcional, por exemplo `QUILOMETRAGEM` |
| `tipo_produto` | Outra classificação funcional, também `QUILOMETRAGEM` nos casos analisados |
| `produto_adendo` | Indica produto de adendo (`S` nos itens confrontados) |
| `idade_minima`, `idade_maxima` | Metadados de faixa etária |
| `exige_cpf` | Metadado de exigência de CPF |
| `tipo_servico`, `qtd_pet` | Metadados de serviço/pet |

O **código comercial visível no ERP** (`produtos.produto`, como `121242`) não é devolvido pelo endpoint. Por isso, a tela do Bom Flow trabalha com o ID interno `203567310`, não com o código `121242`.

Também não são devolvidos:

- situação do produto em `produtos`;
- situação do vínculo em `contratos_servicos_produtos`;
- datas de inclusão/alteração;
- datas de baixa/validade;
- código comercial do produto.

Assim, o frontend não tem dados suficientes para distinguir sozinho um vínculo ativo de um suspenso.

## 4. Confronto dos registros divergentes

### 4.1 Produtos mostrados no cadastro novo

| ID interno | Código ERP | Descrição | Preço | Situação em `produtos` | Inclusão | Baixa/validade |
|---:|---:|---|---:|---|---|---|
| `203567296` | `121241` | QUILOMETRAGEM (500 KM) | R$ 15,00 | `P` | 01/10/2025 | não informada |
| `203567310` | `121242` | QUILOMETRAGEM (1000 KM) | R$ 20,00 | `P` | 01/10/2025 | não informada |
| `203567429` | `121243` | QUILOMETRAGEM (2000 KM) | R$ 40,00 | `P` | 01/10/2025 | não informada |
| `203567456` | `121244` | QUILOMETRAGEM (3000 KM) | R$ 60,00 | `P` | 01/10/2025 | não informada |

Os quatro compartilham `tipo_produto_id = 23261`. O preço vem de `produtos_vh.preco_informado`.

### 4.2 Registro histórico que conflita com 1.000 km

| ID interno | Código ERP | Descrição | Preço | Situação em `produtos` | Inclusão | Alteração |
|---:|---:|---|---:|---|---|---|
| `52247119` | `408` | QUILOMETRAGEM (1 MIL KM) | R$ 15,00 | `P` | 01/02/2024 | 08/09/2025 |

Não há baixa nem validade cadastrada no produto. No relacionamento por título:

| Título | Situação do título | Situação do vínculo do produto histórico |
|---|---|---|
| BOM PASTOR | `A` | `S` |
| BOM PASTOR - ESSENCIAL | `A` | `S` |
| BOM PASTOR - DIGITAL | `A` | `A` |
| EXPLORER CALLCENTER | `A` | `A` |

Para `BOM PASTOR`, o produto novo `203567310` está com vínculo `A`, enquanto o histórico `52247119` está com vínculo `S`.

### 4.3 O que a API devolve para `BOM PASTOR`

A consulta atual devolveu, entre outros:

| ID interno | Descrição | Preço | Situação real do vínculo |
|---:|---|---:|---|
| `52247119` | QUILOMETRAGEM (1 MIL KM) | R$ 15,00 | `S` |
| `203567310` | QUILOMETRAGEM (1000 KM) | R$ 20,00 | `A` |
| `203567296` | QUILOMETRAGEM (500 KM) | R$ 15,00 | `A` |
| `203567429` | QUILOMETRAGEM (2000 KM) | R$ 40,00 | `A` |
| `203567456` | QUILOMETRAGEM (3000 KM) | R$ 60,00 | `A` |
| `114011118` | ESSENCIAL - QUILOMETRAGEM (2 MIL KM) | R$ 30,00 | `S` |
| `128999391` | ESSENCIAL - QUILOMETRAGEM (3 MIL KM) | R$ 45,00 | `S` |

Portanto:

- `1 MIL KM` e `1000 KM` são **produtos distintos**, não duas linhas do mesmo ID;
- semanticamente representam a mesma distância;
- o primeiro é mais antigo e está suspenso no vínculo com `BOM PASTOR`;
- o segundo é mais novo e está ativo nesse vínculo;
- o endpoint não respeita essa situação e publica os dois;
- o mesmo problema inclui outros produtos `ESSENCIAL` suspensos no título genérico.

## 5. Seleção, preço e payload

### 5.1 Pré-preenchimento

Ao marcar um produto, `toggleProduto` salva:

```js
{
  produto_id: String(prod.id),
  preco: String(prod.preco_informado),
  incluir_titular: ...
}
```

Logo, o preço inicial vem diretamente de `API_MV_API_PRODUTOS.preco_informado`, que nos registros analisados corresponde a `produtos_vh.preco_informado`.

### 5.2 O preço pode ser editado?

**Não pela interface atual do wizard.**

O item selecionado mostra o preço em um `div` somente leitura. Existe uma função genérica `setProdutoField`, mas nesta tela ela é usada apenas para alterar `incluir_titular`; não há input nem chamada que altere `preco`.

Isso reduz erro manual na interface, mas não constitui proteção de integridade: um cliente HTTP pode enviar outro valor, e uma alteração posterior no catálogo não atualiza automaticamente um item já selecionado no estado da página.

### 5.3 Identificador e valor enviados

O payload envia, por item:

```json
{
  "produtoId": 203567310,
  "preco": 20,
  "incluirTitular": true,
  "beneficiarios": []
}
```

O identificador efetivo é `produto_id || id` convertido para número. Nos registros atuais, ambos correspondem ao ID interno do produto.

O preço efetivo é `Number(ps.preco) || 0`, isto é, o valor copiado para o estado quando o produto foi selecionado. Não há nova leitura do catálogo ao montar ou enviar o payload.

## 6. Validações e gravação

### 6.1 Frontend

No passo de produto, o wizard exige:

- título selecionado;
- ao menos um produto;
- preço maior que zero para itens que não são classificados como beneficiário.

Para itens de beneficiário, a regra de preço é mais permissiva por existirem placeholders de R$ 0,01.

O frontend **não valida**:

- situação do produto;
- situação do vínculo produto × título;
- validade;
- duplicidade semântica;
- se o produto pertence exatamente ao título;
- se o preço ainda corresponde ao cadastro ERP.

### 6.2 Rota de criação

`POST /api/erp/orcamento` normaliza cada item com:

```js
produtoId: Number(it.produtoId)
preco: Number(it.preco) || 0
```

Antes de criar o cabeçalho, valida:

- existência de ao menos um item;
- `produtoId` numérico e não zero;
- ao menos uma pessoa vinculada ao item;
- plano de pagamento informado.

Antes da mitigação, não havia consulta ao catálogo nessa etapa. A rota não reconfirmava preço, título, situação, validade ou vínculo.

Após a mitigação, a rota executa uma consulta somente leitura no banco ERP antes de resolver a identidade do agente e antes do POST do cabeçalho. Ela exige:

- `contrato_id` único derivado do título exato selecionado;
- correspondência entre `contrato_id` e `titulo_contrato`;
- título globalmente único em `contratos_servicos`;
- produto ligado ao título;
- contrato e vínculo em situação `A`;
- produto em situação comercial `P` e sem validade expirada;
- preço único e atual em `produtos_vh.preco_informado`;
- preço enviado pelo navegador igual ao preço atual, sem frações de centavo;
- gravação com o preço autoritativo devolvido pela validação, não com o valor livre do navegador.

Em caso de falha, retorna `409` e não cria o cabeçalho. Se o banco ERP estiver indisponível, a falha ocorre antes do POST e também não cria o cabeçalho.

Como defesa contra alteração concorrente, os mesmos critérios são revalidados dentro da transação de inserção dos itens, com bloqueio de leitura dos registros de produto, preço, contrato e vínculo até o fim da gravação.

### 6.3 Escrita direta no ERP

Depois de criar o cabeçalho pela API REST, `addItemsToPedido` consulta:

```sql
SELECT descricao, tipo_produto_id
FROM produtos
WHERE id = $1
```

Ela rejeita apenas:

- produto inexistente;
- produto sem `tipo_produto_id`;
- item sem pessoa vinculada.

Em seguida grava em `itens_pedidos`:

- `produto_id`: ID recebido;
- `preco`, `preco_lista` e `valor_unitario_item`: preço recebido;
- `valor_total_item`: preço recebido × quantidade;
- `descricao` e `tipo_produto_id`: cadastro atual do produto.

Também atualiza `pedidos.valor_total` e `pedidos.valor_mercadorias` com a soma desses valores.

Não há `JOIN` com `produtos_vh` ou `contratos_servicos_produtos`, nem comparação com `preco_informado`. Portanto, o valor enviado pelo navegador é o valor gravado.

### 6.4 Validação posterior do ERP

O fluxo de fechamento valida outras integridades — por exemplo, tipo do produto, quantidade e pessoas vinculadas — mas o código não demonstra uma rejeição do ERP para:

- vínculo suspenso;
- produto histórico;
- preço divergente do `preco_informado`.

Ao contrário, a aplicação preenche explicitamente as colunas de preço e total antes do fechamento. Não há evidência de que o ERP as substitua pelo preço atual.

## 7. Cache e atualização

### 7.1 Onde existe cache

O único cache do catálogo neste fluxo é o cache em memória do React Query no navegador:

```js
queryKey: ["erpProdutos"]
staleTime: 10 minutos
```

Não existe:

- persistência em `localStorage` ou IndexedDB;
- tabela espelho de catálogo no Bom Flow;
- cache no proxy;
- rotina agendada de sincronização;
- deduplicação automática;
- invalidação explícita de `["erpProdutos"]`;
- polling (`refetchInterval`).

### 7.2 Quando ocorre uma nova consulta

O catálogo é consultado:

1. no primeiro uso da chave `["erpProdutos"]` na sessão da página;
2. ao remontar/refocar/reconectar, se a consulta já estiver stale, conforme o comportamento padrão do React Query;
3. após recarregar completamente a página, porque o cache não é persistente.

O `staleTime` não agenda uma atualização no minuto 10. Ele apenas marca o dado como stale. Se a tela ficar aberta sem remount, foco, reconexão ou recarga, o valor pode permanecer visível por mais de dez minutos.

Como outras telas usam a mesma chave, elas compartilham o mesmo array em memória enquanto a página estiver aberta.

### 7.3 Efeito de uma mudança no ERP

- até dez minutos: uma navegação dentro da aplicação pode reutilizar a cópia fresca;
- depois de dez minutos: um evento de refetch pode buscar o catálogo novamente;
- recarregar a página: força uma nova sessão de cache;
- produto já selecionado: mantém ID e preço copiados no estado do wizard; uma atualização do array não reconcilia automaticamente o item selecionado.

## 8. Diagnóstico ordenado

### 8.1 Causa principal

**Cadastro histórico e cadastro novo coexistem no endpoint para o mesmo título. Confiança: alta.**

Evidências:

- IDs internos diferentes;
- códigos comerciais diferentes;
- descrições semanticamente equivalentes;
- preços diferentes em `produtos_vh`;
- datas de inclusão de 2024 e 2025;
- vínculo histórico `S` e vínculo novo `A` para `BOM PASTOR`;
- ambos retornados simultaneamente pela API atual.

### 8.2 Falha de publicação do catálogo

**O endpoint não exclui vínculos suspensos. Confiança: alta.**

O campo necessário existe no banco (`contratos_servicos_produtos.situacao`), mas não vem na resposta e não impede o registro de aparecer.

### 8.3 Ampliação indevida no Bom Flow

**O filtro por `includes` mistura títulos filhos quando o usuário escolhe um título prefixo. Confiança: alta.**

Isso não cria o conflito principal — os dois registros já vêm no título exato `BOM PASTOR` —, mas aumenta duplicidade e exposição de produtos de outros títulos.

### 8.4 Cache

**Pode explicar atraso de atualização, mas não a divergência atual. Confiança: alta.**

A leitura direta ao ERP, sem passar pelo cache do navegador, reproduziu os dois preços.

## 9. Impacto

Para novos orçamentos:

- no fluxo original, o vendedor podia escolher o produto histórico de R$ 15,00;
- no fluxo original, o orçamento gravava o ID histórico e R$ 15,00;
- após a mitigação, o backend bloqueia produto suspenso, produto fora do título e preço obsoleto antes de criar o cabeçalho;
- a lista ainda pode exibir o registro indevido até a API do ERP ser corrigida, mas ele não pode mais ser gravado por esse endpoint;
- a diferença pode afetar total do pedido, cobrança e rastreabilidade do produto contratado.

Orçamentos já emitidos não foram consultados nem alterados nesta análise.

## 10. Opções de correção

### 10.1 Saneamento operacional no ERP

Recomendação prioritária:

1. revisar `contratos_servicos_produtos` dos títulos comercializados;
2. manter apenas o vínculo correto em situação ativa para cada oferta/distância;
3. retirar do endpoint vínculos `S`/cancelados;
4. decidir se o produto histórico `52247119` continua ativo apenas em `BOM PASTOR - DIGITAL` e `EXPLORER CALLCENTER`;
5. padronizar descrições e códigos para deixar explícita qualquer diferença comercial real;
6. preencher baixa/vigência quando o processo do ERP permitir, evitando depender somente da situação do vínculo.

Não é recomendado excluir fisicamente produtos usados em histórico. Inativação/vigência preserva referencial de pedidos antigos.

### 10.2 Prevenção técnica no Bom Flow

Em ordem de segurança:

1. **Backend como autoridade:** antes de criar o cabeçalho, recarregar o produto no ERP, validar vínculo ativo com o título e substituir/rejeitar preço diferente do cadastro.
2. **Filtro exato de título:** trocar `includes` por comparação normalizada de igualdade, preferencialmente usando `contrato_id`.
3. **Receber situação/vigência:** ajustar a fonte ERP ou criar uma leitura server-side que entregue somente vínculos ativos e válidos.
4. **Deduplicação defensiva:** agrupar por ID e alertar quando duas descrições normalizadas representarem a mesma oferta com IDs/preços diferentes. Não escolher automaticamente qual delas vence.
5. **Rastreabilidade:** registrar no orçamento o preço de catálogo observado, o preço efetivamente gravado e a data da validação.
6. **Atualização explícita:** oferecer “Atualizar catálogo” e invalidar `["erpProdutos"]` ao abrir um novo orçamento, se o custo da API for aceitável.
7. **Falha fechada:** se o ERP estiver indisponível na validação final, não criar o cabeçalho com dados possivelmente obsoletos.

## 11. Conclusão do diagnóstico

Os dois preços correspondem a dois cadastros distintos do ERP. O registro de R$ 15,00 é histórico e está suspenso para `BOM PASTOR`; o de R$ 20,00 é o cadastro novo e ativo. Na situação original, a fonte do catálogo publicava ambos e o Bom Flow os aceitava sem filtros ou reconferência.

A correção mais segura combina:

- saneamento do vínculo no ERP, preservando histórico;
- filtro de situação/vigência na publicação;
- validação autoritativa de ID, título e preço no backend do Bom Flow antes de qualquer gravação.

Até essas proteções existirem, limpar apenas o cache do navegador não resolve a causa.

## 12. Mitigação aplicada no Bom Flow

Foi implementada uma defesa paliativa em:

- `backend/src/utils/erpCatalogValidation.js`: decisão testável de elegibilidade;
- `backend/src/routes/erpProxy.js`: leitura fresca da `API_MV_API_PRODUTOS`, validação antes do POST `OrcamentoSgprcUsuario` e envio do `contrato_id` de controle;
- `src/pages/UpsellNovoOrcamento.jsx`: identificação única do contrato e filtro exato da lista por título e `contrato_id`;
- `backend/src/utils/erpCatalogValidation.test.js`: testes de igualdade exata de título/contrato, duplicidade e preço alterado.

Essa defesa não altera produtos, vínculos ou preços no ERP. Ela apenas impede a criação de novos orçamentos quando os dados do navegador não correspondem ao catálogo publicado pela API. A elegibilidade de situação e vigência passa a ser responsabilidade da `API_MV_API_PRODUTOS`; o Bom Flow confere contrato, título e produto por igualdade exata e usa o preço da resposta fresca.

### API que precisa ser ajustada pelo time do ERP

O endpoint é:

```text
GET /BP_MULTI/api/API_MV_API_PRODUTOS
```

O Bom Flow o acessa por:

```text
GET /api/erp/produtos
```

O ajuste definitivo deve ser feito na implementação da `API_MV_API_PRODUTOS`, para que ela filtre vínculos suspensos/cancelados. A conferência no Bom Flow continua importante como proteção contra cache, alteração de preço, correspondência parcial de títulos e clientes que tentem enviar payload manualmente.

## 13. Validação global dos produtos de dependentes de R$ 0,01

### 13.1 Critério e resultado

Em 28/08/2026 foi feita uma nova consulta somente leitura ao banco ERP e à `API_MV_API_PRODUTOS`. O critério reproduziu a regra do wizard:

- a descrição do produto contém `DEPENDENTE`, sem diferenciar maiúsculas e minúsculas;
- o preço autoritativo é aproximadamente R$ 0,01 (`|preço - 0,01| < 0,005`);
- o produto está em situação `P`;
- o vínculo em `contratos_servicos_produtos` está em situação `A`;
- o título em `contratos_servicos` está em situação `A`.

O resultado foi:

| Conferência | Resultado |
|---|---:|
| Linhas no catálogo completo da API | 338 |
| Vínculos elegíveis no banco | 38 |
| Linhas elegíveis publicadas pela API | 38 |
| Títulos com vínculos elegíveis | 13 |
| Vínculos ativos ausentes na API | 0 |
| Linhas da API sem vínculo ativo correspondente | 0 |
| Títulos elegíveis ausentes das opções do wizard | 0 |

O cruzamento foi feito por `contrato_id` + título exato + ID interno do produto. Portanto, não depende de semelhança textual entre títulos.

### 13.2 Inventário confirmado

Todas as 38 linhas abaixo têm preço **R$ 0,01**, situação do produto **`P`**, situação do vínculo **`A`**, situação do título **`A`** e publicação confirmada na API para o mesmo `contrato_id`, título e ID interno.

| Título (`contrato_id`) | Código ERP | ID interno | Descrição |
|---|---:|---:|---|
| BOM PASTOR (`40477738`) | `25` | `47219026` | DEPENDENTE TOTAL + |
| BOM PASTOR (`40477738`) | `2307` | `55482336` | BOM MED - DEPENDENTE 0,00 |
| BOM PASTOR (`40477738`) | `2311` | `55482462` | SAFIRA - DEPENDENTE 0,00 |
| BOM PASTOR (`40477738`) | `2312` | `55482510` | TOPAZIO - DEPENDENTE 0,00 |
| BOM PASTOR (`40477738`) | `18732` | `63969482` | RUBI - DEPENDENTE 0,00 |
| BOM PASTOR (`40477738`) | `95418` | `106134686` | BD FAMILIA- DEPENDENTE 0,00 |
| BOM PASTOR (`40477738`) | `114054` | `111294788` | CACONDE - PRATA DEPENDENTE |
| BOM PASTOR (`40477738`) | `121221` | `195750242` | DEPENDENTE EXTRA |
| BOM PASTOR (`40477738`) | `121878` | `214480569` | BOM DESCANSO IDEAL (DEPENDENTE) |
| BOM PASTOR - BOM DESCANSO FAMILIA (`106133840`) | `2307` | `55482336` | BOM MED - DEPENDENTE 0,00 |
| BOM PASTOR - BOM DESCANSO FAMILIA (`106133840`) | `95418` | `106134686` | BD FAMILIA- DEPENDENTE 0,00 |
| BOM PASTOR - BOM DESCANSO FAMILIA (`106133840`) | `121794` | `212085487` | BOM MED - SEM CPF DEPENDENTE |
| BOM PASTOR - BOM MED (`82790080`) | `2307` | `55482336` | BOM MED - DEPENDENTE 0,00 |
| BOM PASTOR - BOM MED (`82790080`) | `121794` | `212085487` | BOM MED - SEM CPF DEPENDENTE |
| BOM PASTOR - COMBO MULTI ESPECIAL (`293025223`) | `2307` | `55482336` | BOM MED - DEPENDENTE 0,00 |
| BOM PASTOR - COMBO MULTI ESPECIAL (`293025223`) | `123297` | `294416738` | ESSENCIAL DEPENDENTE 0,01 |
| BOM PASTOR - DIGITAL (`47882407`) | `25` | `47219026` | DEPENDENTE TOTAL + |
| BOM PASTOR - DIGITAL (`47882407`) | `2307` | `55482336` | BOM MED - DEPENDENTE 0,00 |
| BOM PASTOR - DIGITAL (`47882407`) | `2309` | `55482411` | PEROLA - DEPENDENTE 0,00 |
| BOM PASTOR - DIGITAL (`47882407`) | `2310` | `55482437` | PEROLA - DEPENDENTE 0,00 |
| BOM PASTOR - DIGITAL (`47882407`) | `2311` | `55482462` | SAFIRA - DEPENDENTE 0,00 |
| BOM PASTOR - DIGITAL (`47882407`) | `13715` | `57574423` | RUBI - DEPENDENTE 0,00 |
| BOM PASTOR - DIGITAL (`47882407`) | `18737` | `64026858` | LIMEIRA - RUBI DEPENDENTES 0,00 |
| BOM PASTOR - ESSENCIAL (`82786307`) | `2307` | `55482336` | BOM MED - DEPENDENTE 0,00 |
| BOM PASTOR - IDEAL (`272893002`) | `121878` | `214480569` | BOM DESCANSO IDEAL (DEPENDENTE) |
| BOM PASTOR - PEROLA (`82787358`) | `2309` | `55482411` | PEROLA - DEPENDENTE 0,00 |
| BOM PASTOR - PEROLA (`82787358`) | `2310` | `55482437` | PEROLA - DEPENDENTE 0,00 |
| BOM PASTOR - RUBI (`82787874`) | `13715` | `57574423` | RUBI - DEPENDENTE 0,00 |
| BOM PASTOR - RUBI (`82787874`) | `18732` | `63969482` | RUBI - DEPENDENTE 0,00 |
| BOM PASTOR - RUBI (`82787874`) | `18736` | `64024649` | CAMPINAS - RUBI DEPENDENTES 0,00 |
| BOM PASTOR - RUBI (`82787874`) | `18737` | `64026858` | LIMEIRA - RUBI DEPENDENTES 0,00 |
| BOM PASTOR - SAFIRA (`82789243`) | `2311` | `55482462` | SAFIRA - DEPENDENTE 0,00 |
| BOM PASTOR - SAFIRA (`82789243`) | `114054` | `111294788` | CACONDE - PRATA DEPENDENTE |
| BOM PASTOR - TOPAZIO (`82792117`) | `2312` | `55482510` | TOPAZIO - DEPENDENTE 0,00 |
| BOM PASTOR - TOTAL + (`82789571`) | `25` | `47219026` | DEPENDENTE TOTAL + |
| BOM PASTOR - TOTAL + (`82789571`) | `2307` | `55482336` | BOM MED - DEPENDENTE 0,00 |
| EXPLORER CALLCENTER (`47194339`) | `25` | `47219026` | DEPENDENTE TOTAL + |
| EXPLORER CALLCENTER (`47194339`) | `2307` | `55482336` | BOM MED - DEPENDENTE 0,00 |

### 13.3 Exceções e vínculos não elegíveis

A publicação está completa para os vínculos ativos, mas há diferenças de metadados que não mudam a classificação atual do wizard:

- o código `121794` (`BOM MED - SEM CPF DEPENDENTE`), publicado em dois títulos, vem da API com `tipo_contrato = BOM MED`, e não `DEPENDENTE`;
- o código `123297` vem com `tipo_contrato = Dependente`, apenas com capitalização diferente;
- o código `18737` vem com `tipo_produto` vazio;
- os códigos `114054`, `121221` e `123297` têm pelo menos uma publicação com `produto_adendo` vazio.

Essas diferenças não impedem o destino correto porque a vaga gratuita é reconhecida pela **descrição + preço**, e sua inclusão direta nas opções de beneficiário não depende da whitelist de `tipo_contrato`.

Além dos 38 vínculos elegíveis, o banco contém 11 registros que casam com descrição e preço, mas não atendem ao estado ativo completo:

| Título | Códigos | Motivo |
|---|---|---|
| BOM PASTOR | `13715`, `18736`, `2309`, `2310`, `2312` | vínculos `S`; o código `2312` também possui outro vínculo `A`, que é o elegível publicado |
| BOM PASTOR - COMBO MULTI SELEÇÃO | `123297`, `2307` | vínculos `S` |
| BOM PASTOR - DIGITAL | `18736`, `2312` | vínculos `S` |
| BOM SAMBA | `121794`, `2307` | vínculos `A`, mas título em situação `P` |

Nenhuma combinação sem ao menos um vínculo ativo correspondente apareceu entre as 38 linhas elegíveis da API.

### 13.4 Destino no wizard

O comportamento observado se aplica aos 38 vínculos:

1. `isDependenteProduto` reconhece qualquer descrição com `DEPENDENTE` e preço aproximadamente R$ 0,01;
2. a etapa **Produtos / planos** exibe esses itens na lista principal, com checkbox e identificação **Beneficiário**;
3. a seleção cria o item do orçamento sem permitir incluir o titular; a pessoa correspondente deve ser vinculada na etapa **Beneficiários** antes de avançar;
4. produtos de veículo só podem avançar quando o mesmo contrato e título também publicam o condutor correspondente; itens de outro título nunca são injetados.
5. quando um produto especial já foi selecionado no Plano, a atribuição do beneficiário usa o mesmo item em vez de criar uma linha duplicada;
6. antes da criação do orçamento, o backend recarrega o catálogo e exige o mesmo `contrato_id`, título exato, ID interno e preço.

Os 13 títulos estão na lista `TITULO_CONTRATO_OPTIONS`. Todos também possuem produtos restantes para a etapa Plano; a quantidade de opções de Plano varia de 5 a 66 depois da retirada dos itens especiais. Portanto, não foi encontrado título elegível que fique sem plano selecionável por causa desta regra.

### 13.5 Conclusão específica

Não há falha de catálogo nem de classificação para os produtos dependentes ativos de R$ 0,01 na fotografia de 28/08/2026. Os 38 vínculos ativos dos 13 títulos estão publicados e seguem o desenho esperado:

- **aparecem em Produtos / planos, identificados como produtos de Beneficiário e com seleção por checkbox**;
- **aparecem como opções de produto em Beneficiários**;
- **entram no orçamento quando selecionados e recebem quantidade ao serem vinculados a um beneficiário**;
- **não dependem de `tipo_contrato = DEPENDENTE` para funcionar**.

Esses itens são selecionáveis na lista principal, mas a seleção não marca o titular como pessoa do item. O vínculo e a quantidade continuam vindo da etapa Beneficiários. Produtos com `DEPENDENTE` e preço real superior a R$ 0,015 também permanecem selecionáveis em Plano e recebem o dependente vinculado ao próprio item.

## 14. Validação complementar: produtos especiais de BOM AUTO e BOM PET

Os três códigos sinalizados depois da primeira consolidação não estavam na seção 13 porque suas descrições não contêm `DEPENDENTE`. Eles pertencem à mesma família funcional de itens de R$ 0,01 vinculados ao beneficiário, mas usam classificadores próprios:

- `DADOS DO VEÍCULO` para BOM AUTO;
- `NOME DO PET` para BOM PET.

### 14.1 Cadastro e publicação

A conferência somente leitura confirmou:

| Título (`contrato_id`) | Código ERP | ID interno | Descrição | Preço | Produto / vínculo / título | API |
|---|---:|---:|---|---:|---|---|
| BOM PASTOR - BOM AUTO (`82860478`) | `94413` | `88167567` | BOM AUTO CLIENTES - DADOS DO VEÍCULO | R$ 0,01 | `P` / `A` / `A` | publicado |
| BOM PASTOR - BOM AUTO (`82860478`) | `94414` | `88167862` | BOM AUTO NÃO CLIENTES - DADOS DO VEÍCULO | R$ 0,01 | `P` / `A` / `A` | publicado |
| BOM PASTOR - BOM PET (`82789405`) | `76719` | `79080781` | BOM PET SAÚDE - NOME DO PET | R$ 0,01 | `P` / `A` / `A` | publicado |

O título BOM AUTO também publica os pares de condutor necessários:

| Variante | Código ERP | ID interno | Descrição | Preço | Produto / vínculo / título | API |
|---|---:|---:|---|---:|---|---|
| Clientes | `94430` | `88588931` | BOM AUTO CLIENTES - DADOS DO CONDUTOR | R$ 0,01 | `P` / `A` / `A` | publicado |
| Não clientes | `94431` | `88589037` | BOM AUTO NAO CLIENTES - DADOS DO CONDUTOR | R$ 0,01 | `P` / `A` / `A` | publicado |

Há uma diferença de classificação na API: o código `94413` vem com `tipo_contrato = DEPENDENTE`, enquanto o `94414` vem com `tipo_contrato = BOM AUTO`. Isso não afeta o wizard, que identifica ambos por `DADOS DO VEÍCULO`.

### 14.2 Destino na jornada e ajuste

Esses produtos aparecem na lista principal de **Produtos / planos**, identificados como Beneficiário e selecionáveis por checkbox. A seleção cria o item sem incluir o titular por padrão:

- os códigos `94413` e `94414` viram o card estruturado de veículo em Beneficiários;
- os códigos `94430` e `94431` viram o card pareado de condutor somente quando publicados no mesmo contrato e título do veículo;
- o código `76719` é atribuído automaticamente ao card de pet quando o vendedor escolhe o plano BOM PET SAÚDE.

O catálogo já estava completo. O problema específico do BOM AUTO estava na escolha local: como o título publica dois pares, o wizard usava o primeiro veículo e o primeiro condutor encontrados. O ajuste passou a usar a variante do plano selecionado:

- plano **CLIENTES** → condutor `94430` + veículo `94413`;
- plano **NÃO CLIENTES** → condutor `94431` + veículo `94414`.

A comparação também normaliza acentos, porque o ERP grava `NÃO CLIENTES` na descrição do veículo e `NAO CLIENTES` na descrição do condutor. O fluxo BOM PET já selecionava corretamente o produto `76719`; para ele, foi necessária apenas a inclusão nesta validação documental.