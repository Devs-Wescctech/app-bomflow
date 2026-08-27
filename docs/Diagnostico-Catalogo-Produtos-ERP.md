# Diagnóstico do catálogo de produtos ERP

**Data da análise:** 26/08/2026  
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

Isso contorna o limite histórico de 100 linhas de APIs do ERP. A consulta realizada durante esta análise devolveu **437 linhas** no catálogo completo.

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