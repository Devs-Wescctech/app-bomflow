# Canal de vendas de agentes no ERP

## Limitação da API REST

Em 24 de agosto de 2026, foram consultados no ERP publicado os recursos REST
`/PessoasContratos`, `/Pessoas_Contratos`, `/pessoas_contratos` e
`/API_PESSOAS_CONTRATOS`. Todos retornaram HTTP 500 com `Serviço inválido`,
enquanto um recurso REST conhecido (`/Usuarios`) respondeu normalmente. Isto
confirma que o vínculo Pessoa × Canal não é exposto pela API REST disponível
para esta integração.

## Alternativa adotada

O Usuário ERP continua sendo resolvido por CPF exclusivamente por REST:
Pessoa → Usuário ERP. Essa etapa não acessa nem depende de `ERP_DB_*`.

Somente depois de o Usuário ERP ter sido confirmado, a sincronização do canal
usa a integração direta com o ERP para:

1. consultar `pessoas_contratos` pela Pessoa e canal configurado no cadastro
   local;
2. reutilizar um vínculo único existente ou criar um novo vínculo idempotente;
3. gravar `erp_agente_venda_id` local apenas quando a leitura ou escrita no ERP
   retorna o ID efetivo.

Falhas de configuração, conectividade, duplicidade ou divergência do canal são
exibidas como estado do canal e não desfazem nem bloqueiam o `erp_agent_id`
confirmado. A remoção de um canal local nunca apaga o espelho
`erp_agente_venda_id` por inferência: uma remoção real exige confirmação de uma
operação de negócio no ERP.

## Reconciliação automática antes do orçamento

Quando um agente autenticado ainda não tem o espelho local do canal, o
pré-processamento de orçamento, pré-proposta e o salvamento de um cadastro de
agente com CPF válido podem recuperar somente um vínculo que já exista de forma
única no ERP. Ele resolve CPF → Pessoa → Usuário, consulta `pessoas_contratos`
por `pessoa_id` e `contrato_id` e então espelha o ID confirmado no Bom Flow.

Essa reconciliação não cria vínculo Pessoa × Canal durante uma venda. Canal
ausente, duplicado ou divergente continua bloqueando com diagnóstico explícito.
O cadastro do agente fica bloqueado contra mudanças concorrentes até o cabeçalho
ser aceito pelo ERP, para que o canal validado seja o mesmo canal enviado.

No salvamento do cadastro, a atualização local é concluída primeiro. A
reconciliação em seguida apenas espelha o vínculo existente; indisponibilidade ou
uma divergência do ERP não desfaz o salvamento local. A sincronização manual
continua sendo o único fluxo que pode criar o vínculo de canal quando ele ainda
não existe.

## Checklist operacional

O container que executa o backend precisa receber, pelo gerenciador de variáveis
do Portainer, as cinco chaves `ERP_DB_HOST`, `ERP_DB_PORT`, `ERP_DB_NAME`,
`ERP_DB_USER` e `ERP_DB_PASSWORD`. Seus valores não devem ser incluídos em
código, commits, logs ou respostas HTTP.

Após alterar qualquer configuração ou código do backend:

1. reiniciar o workflow/container do Backend API Server;
2. confirmar no log apenas o resultado do diagnóstico, nunca os valores das
   variáveis;
3. executar uma leitura segura equivalente a `SELECT 1` e verificar que a
   relação `pessoas_contratos` existe;
4. validar um agente controlado no modal administrativo, primeiro com um
   vínculo existente e depois com um caso sem vínculo.

O canal só está confirmado quando a leitura posterior retorna exatamente um
`pessoas_contratos.id` para a Pessoa ERP e o canal selecionado. Repetir a
sincronização deve reutilizar esse ID. Se a configuração, credencial ou rede
falhar, o resultado esperado é Usuário ERP preservado, canal pendente,
`retryable` apenas para falhas transitórias e diagnóstico detalhado restrito
aos logs operacionais.