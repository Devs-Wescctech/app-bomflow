# Validação técnica — status de falecimento do pet no ERP

> **Data da investigação:** 31/08/2026
> **Atualização após correção do destino pelo time do ERP:** 04/09/2026
> **Escopo:** leitura do código, documentos anexados, resposta da API já consumida pelo Bom Flow, metadados do banco e confirmação funcional do time responsável pelo ERP.
> **Segurança:** o ajuste atual foi validado com consultas `SELECT` e testes isolados. A integração permanece desabilitada; nenhuma escrita foi executada em `caracteristicas_pessoas` pelo Bom Flow.

## 1. Parecer executivo

**Decisão atualizada: viável para homologação.**

O time responsável pelo ERP confirmou que, nesse produto, cada pet é cadastrado como uma
**Pessoa**. O destino oficial é `caracteristicas_pessoas.valor`, na característica
`55435402` (`DATA_FALECIMENTO`), e a identidade individual é:

- `pessoas.id`: chave técnica usada nos relacionamentos e na atualização;
- `pessoas.pessoa`: código exibido pela interface do ERP;
- `pessoas_contratos`: vínculo entre a Pessoa do pet e `contratos_servicos.id`.

Os campos da `API_BOM_FLOW_PET` continuam insuficientes isoladamente: `id` representa o
pedido e `contrato_id` representa o contrato. Entretanto, `contrato_id` permite uma segunda
consulta aos usuários do contrato; nela o Bom Flow resolve a Pessoa individual pelo nome
completo do pet e bloqueia resultados ausentes ou ambíguos.

A implementação foi preparada com chave de ativação desabilitada por padrão. O registro
local continua funcionando, e a escrita no ERP somente será ativada durante a homologação.

## 2. Evidências

### 2.1 Leitura usada pelo Bom Flow

O backend faz `GET` paginado em `API_BOM_FLOW_PET` e complementa cada pet com a Pessoa
vinculada ao contrato. A consulta:

- localiza o titular por CPF ou nome;
- considera pet toda linha cujo `texto_original_veiculo` difere do nome do titular;
- extrai o nome do pet do trecho anterior a `" - "`;
- devolve `contrato_id`, descrição e situação do contrato;
- resolve `pessoas.id` e o código `pessoas.pessoa`;
- considera o pet falecido quando a característica `55435402` possui uma data em
  `caracteristicas_pessoas.valor` ou quando
  existe contingência local ainda não confirmada no ERP.

No cadastro do atendimento, o servidor revalida `CPF + contrato_id + nome`, resolve novamente
a Pessoa sem confiar no navegador e persiste a chave técnica e o código exibido. Um pet com
`data_falecimento` já preenchida no ERP não pode abrir novo atendimento.

### 2.2 O que significam `id` e `contrato_id`

Foi lida a primeira página de 100 registros da API, sem exibir ou registrar dados pessoais:

| Medida | Resultado |
|---|---:|
| Linhas | 100 |
| Linhas classificadas como pet | 67 |
| Valores distintos de `id` | 35 |
| Valores distintos de `contrato_id` | 65 |
| Contratos com mais de uma linha de pet | 22 |
| Contratos em que os pets tinham IDs diferentes | 0 |

Correlação somente leitura com o banco do ERP:

- os 35 valores de `id` existiam em `pedidos.id`;
- nenhum desses 35 valores existia em `pedidos_pessoas.id`;
- os 65 valores de `contrato_id` existiam em `contratos_servicos.id`.

Conclusão:

- `id` é o identificador do pedido, não do animal;
- `contrato_id` é o identificador do contrato de serviço, não do animal;
- pets do mesmo contrato repetem ambos os identificadores disponíveis.

### 2.3 Como o pet aparece no banco do ERP

Existe a view `public.vw_dados_bom_pet`. Sua definição seleciona, em essência:

- `itens_pedidos.pedido_id`;
- descrição e preço do item;
- `pedidos_pessoas.nome_pessoa`, nascimento, sexo e telefone.

Ela filtra produtos PET, pedidos ativos/pendentes e linhas de `pedidos_pessoas` com `pessoa_id IS NULL`. A view não projeta `pedidos_pessoas.id`.

Embora a view não exponha a chave individual, ela não é a única fonte disponível. A
confirmação funcional e a correlação no banco mostraram o caminho canônico:

1. `API_BOM_FLOW_PET.contrato_id` → `contratos_servicos.id`;
2. `pessoas_contratos.contrato_id` → usuários daquele contrato;
3. `pessoas_contratos.pessoa_id` → `pessoas.id`;
4. `pessoas.pessoa` → código exibido na tela do ERP;
5. `caracteristicas_pessoas`, por `pessoa_id = pessoas.id` e
   `caracteristica_id = 55435402` → data oficial em `valor`.

O número comercial do contrato (`contratos_servicos.contrato_servicos`) não deve ser
confundido com `contratos_servicos.id`. Da mesma forma, o código visível
`pessoas.pessoa` não deve ser usado no `UPDATE`; a escrita usa `pessoas.id`.

### 2.4 Contrato de escrita adotado para homologação

A implementação usa a conexão auditada já existente com o banco do ERP e executa:

1. `SELECT ... FOR UPDATE` da Pessoa individual e do vínculo ativo em `pessoas_contratos`;
2. se a data já for igual, confirma idempotentemente sem novo `UPDATE`;
3. se houver outra data, bloqueia e encaminha para revisão manual;
4. se existir exatamente um registro da característica com `valor` vazio, atualiza `valor`,
   `data_alteracao` e `usuario_alteracao_id`;
5. se não existir, resolve a autoria, obtém um lock curto de escrita da tabela antes de
   qualquer row lock nela, relê a ausência e cria a característica com `nextval('pk_sequence')`;
6. se houver mais de um registro, bloqueia para revisão e nunca escolhe um deles;
7. usa o usuário técnico ativo `acesso.api` como autoria da inclusão ou alteração no ERP;
8. relê a característica da mesma `pessoas.id`;
9. confirma sucesso apenas quando há exatamente um registro e a data relida é igual à solicitada;
10. conclui a transação com `COMMIT`; qualquer falha executa `ROLLBACK`.

O lock da tabela é usado somente no primeiro falecimento, quando a característica ainda não
existe. Ele possui espera máxima de cinco segundos: se o ERP estiver escrevendo nessa tabela,
a tentativa falha sem alteração e pode ser reenviada. Atualizações de linhas existentes usam
somente lock por linha.

Se a característica existir na sondagem inicial, mas desaparecer antes do row lock, a
transação é cancelada sem inserir. O reenvio recomeça a decisão de inclusão sob o lock correto.

O estado local é monotônico: uma tentativa concorrente ou atrasada não substitui
`confirmed` por `processing` ou erro.

A primeira data local também é imutável: o PUT rejeita repetição e data divergente antes de
alterar o atendimento. Reenvios usam exclusivamente a ação `Sincronizar com o ERP`, sempre
com a data original. O UPDATE da primeira marcação exige atomicamente
`pet_falecido_marcado = FALSE`, impedindo duas requisições concorrentes de vencerem.

Nenhum status cadastral da Pessoa é alterado.

### 2.5 Pré-validação do registro autorizado

Em 04/09/2026, uma consulta sem escrita confirmou para o candidato de homologação:

- contrato exibido `229760` e contrato técnico `322387350`;
- código do pet `2628232` e Pessoa técnica `322387353`;
- vínculo ativo e descrição completa correspondentes;
- nenhum registro existente da característica `55435402`;
- permissão de `SELECT`, `INSERT`, `UPDATE` e uso de `pk_sequence`;
- exatamente um usuário técnico ativo `acesso.api`.

Esse candidato exercita o caminho de primeira inclusão. Nenhum dado do ERP foi alterado
durante a pré-validação.

### 2.6 Resultado da homologação pelo front

Em 04/09/2026, o fluxo completo pelo front criou a característica e a atualização foi
confirmada na tela do ERP pelo responsável pelo teste.

Após a confirmação, a limpeza autorizada removeu somente a linha técnica `352053607`, da
Pessoa `322387353`, característica `55435402`, incluída por `acesso.api`. A releitura
confirmou zero registros remanescentes dessa característica para o código de pet `2628232`.
O atendimento e a auditoria local foram preservados.

## 3. Risco existente no status local

O registro local permanece como contingência caso o ERP esteja indisponível. A unicidade
deixou de depender somente do contrato:

- registros resolvidos são únicos por `erp_pet_pessoa_id`;
- registros legados sem Pessoa permanecem protegidos por `contrato + nome`;
- pets diferentes do mesmo contrato podem ser registrados separadamente;
- nome duplicado no mesmo contrato é tratado como identidade ambígua, nunca escolhido
  automaticamente.

## 4. Confirmações recebidas e limites

### 4.1 Identidade

- o pet é uma Pessoa no ERP;
- `pessoas.id` é a chave técnica individual;
- o vínculo ao contrato está em `pessoas_contratos`;
- o código mostrado na tela é `pessoas.pessoa`;
- o seletor do front preserva contrato, descrição completa e Pessoa ERP, permitindo escolher
  corretamente pets homônimos no mesmo contrato;
- o campo oficial é `caracteristicas_pessoas.valor` para `caracteristica_id = 55435402`;
- preencher a data não exige mudar o status cadastral da Pessoa.

### 4.2 Escrita

- destino: `caracteristicas_pessoas.valor`, identificada por
  `pessoa_id = pessoas.id` e `caracteristica_id = 55435402`;
- formato: data civil `YYYY-MM-DD`;
- identidade de escrita: `pessoas.id`;
- sem alteração de `pessoas.situacao`;
- idempotência: mesma Pessoa e mesma data não geram nova alteração;
- conflito: uma data diferente já preenchida nunca é sobrescrita automaticamente.
- ausência: cria a característica somente após serializar e confirmar novamente que ela
  continua ausente.

### 4.3 Permissões e efeitos colaterais

- a ativação depende de `BOM_PET_ERP_DEATH_SYNC_ENABLED=true`;
- a homologação deve usar registro autorizado;
- o Bom Flow mantém auditoria de usuário, atendimento, tentativas, erro e confirmação;
- a rotina de reversão de uma marcação indevida continua fora da automação até ser
  explicitamente homologada.

## 5. Roteiro de homologação

Executar somente em ambiente de homologação ou registro formalmente autorizado.

### 5.1 Preparação

1. Selecionar contrato autorizado com dois pets, incluindo nomes iguais ou parecidos.
2. Registrar `pessoas.id` e `pessoas.pessoa` de cada animal.
3. Capturar leitura inicial do recurso, tela do ERP, contrato, cobrança e benefícios.
4. Confirmar usuário/token e permissão de escrita.

### 5.2 Ciclo controlado

1. Consultar o pet e confirmar a Pessoa resolvida.
2. Habilitar a integração somente no ambiente de homologação.
3. Solucionar o atendimento com comprovante e data de falecimento.
4. Reler `caracteristicas_pessoas.valor` para a característica `55435402` e conferir a tela do ERP.
5. Repetir o reenvio manual com a mesma data.
6. Tentar uma data divergente e confirmar que foi bloqueada.
7. Confirmar que o segundo pet permaneceu inalterado.
8. Conferir contratos, cobrança, benefícios, relatórios e integrações.
9. Validar com a WESCC o procedimento de correção/reversão.

### 5.3 Cenários obrigatórios

- chave inexistente;
- pet de outro contrato;
- dois pets com mesmo nome;
- requisição repetida;
- duas requisições concorrentes;
- data inválida/futura;
- transição já aplicada;
- usuário sem permissão;
- `401`, `403`, `404`, `409`, `422`, `5xx` e timeout;
- falha depois do ERP aceitar a escrita, mas antes de o Bom Flow receber a resposta;
- correção de marcação indevida.

### 5.4 Critério de aprovação

GO somente quando houver:

- chave individual comprovada;
- contrato de escrita documentado e versionado;
- ciclo escrever/reler/repetir/corrigir aprovado;
- nenhum efeito financeiro ou contratual inesperado;
- auditoria com autoria e correlação;
- autorização formal para manter a chave de ativação ligada em produção.

## 6. Implementação preparada

### 6.1 Momento da sincronização

O gatilho permanece no fechamento do atendimento:

1. atendimento chega a `Solucionado`;
2. há comprovante de remoção anexado;
3. operador confirma “Marcar pet como Falecido”;
4. o operador informa a Data de Falecimento;
5. o Bom Flow grava estado local e pendência de sincronização na mesma transação;
6. com a integração habilitada, atualiza a Pessoa do pet no ERP;
7. a marcação só fica `confirmed` após releitura da mesma `pessoas.id`.

O registro local não deve depender da disponibilidade imediata do ERP. Ele continua garantindo o encerramento operacional e funciona como contingência até a confirmação externa.

### 6.2 Estado da sincronização

Persistência implementada:

- `erp_pet_pessoa_id` e `erp_pet_pessoa_codigo`;
- `erp_pet_identity_status`;
- `erp_falecimento_sync_status`: `not_requested`, `pending_homologation`, `pending`,
  `processing`, `confirmed`, `retryable_error` ou `manual_review`;
- número de tentativas;
- instante da solicitação e da confirmação;
- erro sanitizado;
- usuário solicitante e atendimento de origem;
- Data de Falecimento solicitada.

Não registrar token, payload com CPF integral ou comprovante em log técnico.

### 6.3 Idempotência e reenvio

- uma identidade local por `pessoas.id`;
- antes de reenviar após timeout, reler o pet;
- se já estiver falecido com os mesmos dados, confirmar sem nova escrita;
- o endpoint de reenvio reaplica a mesma Pessoa e data;
- conflito de identidade ou de data vai para revisão manual;
- indisponibilidade fica como erro reenviável, sem loop automático.

### 6.4 Auditoria e correção

- manter histórico append-only de cada tentativa e resposta sanitizada;
- registrar autoria do usuário do Bom Flow e, se disponível, autoria reconhecida pelo ERP;
- exigir supervisor para corrigir marcação indevida;
- usar exclusivamente a operação de reversão homologada pela WESCC;
- nunca apagar a trilha original;
- após correção, reler o ERP e registrar o estado final nos dois sistemas.

## 7. Próxima ação objetiva

Executar o roteiro da seção 5 com um registro autorizado. Até essa homologação:

- manter `BOM_PET_ERP_DEATH_SYNC_ENABLED` desabilitada;
- continuar usando o registro local como contingência;
- não executar atualização retroativa;
- não automatizar reversão de data divergente.