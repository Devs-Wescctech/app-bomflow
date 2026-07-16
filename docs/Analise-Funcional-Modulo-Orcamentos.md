# Análise Funcional — Módulo de Orçamentos (Bom Flow)

> **Data:** 15/07/2026  
> **Perspectiva:** Product Designer + UX Specialist + Arquiteto de Software  
> **Método:** análise funcional baseada no código-fonte, nos documentos de auditoria e no mapa de integração ERP já produzidos. **Nenhum arquivo foi alterado.**  
> **Escopo:** wizard de criação (UpsellNovoOrcamento), upload de documentos (OrcamentoDocumentos), relatório de orçamentos (ErpOrcamentoRelatorioBase) e os fluxos dos módulos Vendas PF, Upsell, Indicações e Pré-Vendas.

---

## 1. Jornada do Usuário (Vendedor)

A jornada completa começa no lead e termina com o orçamento aprovado, os documentos enviados e a Adesão Zero marcada.

```
[Lead no Kanban]
      │
      ▼
[Abrir Lead]
      │
      ▼
[Criar Orçamento — 6 passos]
      │
      ▼
[Enviar ao ERP — pipeline automático]
      │
      ▼
[Upload de Documentos — 4 tipos]
      │
      ▼
[Marcar Adesão Zero]
      │
      ▼
[Fim]
```

---

### Etapa 1 — Abrir o Lead

| Aspecto | Detalhe |
|---|---|
| **Objetivo do usuário** | Localizar o lead do cliente e acessar a tela de orçamento. |
| **Ações** | Navegar ao Kanban → localizar o card do lead → clicar → abrir detalhe do lead → localizar o botão "Novo Orçamento ERP". |
| **Cliques estimados** | 3–4 |
| **Pontos de espera** | Carregamento do Kanban (lista de leads); carregamento do detalhe do lead. |
| **Riscos de erro** | Lead sem `erp_agent_id` vinculado: o formulário abre mas o orçamento falha na etapa de submissão porque `agente_venda_id` é undefined. O vendedor só descobre o erro no final do wizard (passo 6). |

---

### Etapa 2 — Criar o Orçamento (Wizard 6 passos)

#### Passo 1 — Contratante

| Aspecto | Detalhe |
|---|---|
| **Objetivo** | Identificar o contratante: CPF, nome, contatos, dados pessoais. |
| **Ações** | Digitar CPF → aguardar lookup automático → confirmar/preencher nome → preencher telefone, celular, e-mail, RG, sexo, estado civil, profissão. |
| **Cliques estimados** | 10–12 interações (fields + selects) |
| **Pontos de espera** | Lookup de CPF no ERP (1 chamada REST — sem indicação de tempo restante). |
| **Riscos de erro** | (1) Campo "Telefone" aparece duas vezes na UI (ln 1333 e ln 1362) — duplicação visual. (2) CPF não encontrado no ERP não impede o avanço, mas o `contratante_pessoa` fica vazio e pode causar falha silenciosa no ERP. (3) Celular e Telefone têm validação diferente: celular tem máscara, telefone não — o vendedor pode digitar qualquer formato. (4) Sexo, Estado Civil e Profissão são obrigatórios mas o asterisco vermelho aparece junto ao label `Sexo *` em um campo, e não nos outros dois — inconsistência visual. |

#### Passo 2 — Endereço

| Aspecto | Detalhe |
|---|---|
| **Objetivo** | Registrar o endereço do contratante. |
| **Ações** | Digitar CEP → aguardar autopreenchimento (ViaCEP) → revisar logradouro/bairro/cidade → preencher número e complemento. |
| **Cliques estimados** | 4–6 |
| **Pontos de espera** | Lookup ViaCEP (serviço externo, sem timeout controlado, sem fallback). |
| **Riscos de erro** | (1) Se o ViaCEP retornar dados desatualizados, o vendedor avança com endereço errado sem perceber (os campos são auto-preenchidos e o vendedor tende a não revisar). (2) Sem confirmação visual clara de quando o autopreenchimento terminou. (3) Cidade é preenchida como "CIDADE - UF" (concatenado) — se o vendedor editar manualmente, o formato pode ser inválido para o ERP. |

#### Passo 3 — Plano

| Aspecto | Detalhe |
|---|---|
| **Objetivo** | Selecionar o título do contrato e os produtos do orçamento. |
| **Ações** | Selecionar título do contrato → aguardar filtro de produtos → selecionar produto(s) → informar preço(s) → verificar total. |
| **Cliques estimados** | 5–10 (cresce proporcionalmente ao número de produtos selecionados) |
| **Pontos de espera** | Carregamento inicial da lista de produtos ERP (pode demorar; exibe `Loader2` mas sem barra de progresso nem estimativa). Toda vez que o título é trocado, a lista de produtos é filtrada — se o carregamento estiver em andamento, o vendedor pode selecionar produto da lista anterior. |
| **Riscos de erro** | (1) A lista de títulos de contrato é hardcoded no frontend — se o ERP adicionar um novo título, ele não aparece. (2) O vendedor pode não entender a diferença entre "produtos do titular" e "produtos de beneficiário" que aparecem apenas no passo seguinte. (3) Preço pode ser zerado acidentalmente se o vendedor limpar o campo (bloqueado pela validação, mas o toast de erro não informa qual produto está sem preço de forma clara). (4) Produtos de beneficiário "DEPENDENTE vaga 0,01" não aparecem aqui — o vendedor não sabe quantas vagas terá até o passo 4. |

#### Passo 4 — Beneficiários

| Aspecto | Detalhe |
|---|---|
| **Objetivo** | Cadastrar pessoas (condutor, dependentes, pets) vinculadas ao plano. |
| **Ações** | Identificar cards automáticos (BOM AUTO / DEPENDENTE PAGO criados automaticamente) → preencher dados de cada card → adicionar beneficiários extras se necessário → vincular cada um a um produto. |
| **Cliques estimados** | 6–25+ (aumenta com o número de beneficiários e tipo de plano) |
| **Pontos de espera** | Nenhum (tudo local). |
| **Riscos de erro** | (1) Limite de 15 beneficiários não é exibido pro-ativamente — o vendedor só descobre quando o botão "+Adicionar" retorna um toast de erro. (2) O card do condutor BOM AUTO exige apenas "nome" — o vendedor pode interpretar como opcional (sem asterisco). (3) Placa de veículo aceita formato Mercosul (ABC1D23) e antigo (ABC1234) — a mensagem de validação não informa os formatos aceitos. (4) Beneficiário com campo de "produto" não atribuído passa pela tela sem erro visual imediato — o erro só aparece no "Próximo". (5) O card de veículo (BOM AUTO) exige modelo, cor, placa e ano — 4 campos obrigatórios sem marcação visual clara de obrigatoriedade. (6) Cards de DEPENDENTE PAGO são criados automaticamente mas sem aviso ao vendedor — ele os encontra "por surpresa" no passo 4. |

#### Passo 5 — Pagamento

| Aspecto | Detalhe |
|---|---|
| **Objetivo** | Selecionar o plano de pagamento, parcelas e dia de vencimento. |
| **Ações** | Aguardar carregamento dos planos → selecionar plano → informar número de parcelas → selecionar dia de vencimento. |
| **Cliques estimados** | 4–6 |
| **Pontos de espera** | Carregamento dos planos de pagamento do ERP (chamada de DB separada). |
| **Riscos de erro** | (1) "Quantidade de parcelas" é campo livre (input text) — o vendedor pode digitar 0 ou valores inválidos; o toast aparece só no "Próximo". (2) O plano de pagamento selecionado exibe `numero_parcelas` mas não deixa claro o que é "parcelas do plano" vs "quantidade de parcelas" do campo manual — dois campos correlacionados sem hierarquia visual. (3) Após selecionar um plano, se o vendedor trocar o plano, o campo de quantidade de parcelas não é resetado automaticamente, podendo ficar com o valor anterior. |

#### Passo 6 — Revisão

| Aspecto | Detalhe |
|---|---|
| **Objetivo** | Confirmar os dados antes de enviar ao ERP. |
| **Ações** | Revisar resumo → clicar "Confirmar e Enviar ao ERP". |
| **Cliques estimados** | 1–3 |
| **Pontos de espera** | **O maior ponto de espera de toda a jornada.** O pipeline de 7 etapas (REST + DB) pode levar 5–30 segundos. O spinner mostra "Enviando ao ERP..." mas sem nenhuma indicação de progresso das etapas individuais. Se o ERP demorar, o vendedor não sabe se está processando ou travado. |
| **Riscos de erro** | (1) O payload completo é exibido em JSON bruto — o vendedor não-técnico não consegue verificar os dados de forma significativa. (2) Após sucesso, o wizard reseta para o passo 1 e exibe um componente `SubmitResult` — mas não há link direto para o novo orçamento no relatório. (3) Falha parcial ("orçamento criado no ERP mas produto não vinculado") retorna mensagem técnica longa. (4) O botão de envio não tem confirmação "Tem certeza?" — um clique acidental reprocessa o orçamento. |

---

### Etapa 3 — Upload de Documentos

| Aspecto | Detalhe |
|---|---|
| **Objetivo** | Anexar os documentos obrigatórios ao orçamento criado. |
| **Ações** | Localizar orçamento na lista → clicar para abrir modal → para cada um dos 4 tipos: clicar "Enviar arquivo" → selecionar arquivo → aguardar upload. |
| **Cliques estimados** | 3 + (2 cliques × número de documentos) = 3–11 |
| **Pontos de espera** | Upload de cada arquivo (sem barra de progresso de upload, apenas spinner no slot). |
| **Riscos de erro** | (1) Limite de 15 MB não é visível antes do clique — o vendedor descobre só após tentar enviar um arquivo grande. (2) Formatos aceitos (PDF/JPG/PNG) estão apenas em texto de rodapé no modal — fácil de passar despercebido. (3) A confirmação de exclusão usa `window.confirm` nativo — diálogo sem contexto (não mostra qual documento será excluído). (4) Se o orçamento ainda não chegou ao CRM (`bomflow_orcamentos`), a lista de orçamentos fica vazia — o vendedor não consegue fazer upload mesmo que o orçamento exista no ERP. |

---

### Etapa 4 — Marcar Adesão Zero

| Aspecto | Detalhe |
|---|---|
| **Objetivo** | Indicar se o cliente tem isenção da taxa de adesão. |
| **Ações** | Abrir modal do orçamento → clicar "Sim" ou "Não" no toggle de Adesão Zero → aguardar confirmação. |
| **Cliques estimados** | 2 |
| **Pontos de espera** | Chamada de PUT ao backend (rápida, mas sem indicação do estado salvo). |
| **Riscos de erro** | (1) O toggle não tem estado de "não definido" — o valor padrão pode ser `null`, exibido como nenhuma opção ativa, mas o campo tem um asterisco vermelho no label indicando obrigatoriedade. O vendedor pode não perceber que precisa definir esse campo. (2) Após salvar, o toast exibe "Adesão Zero atualizada" sem mostrar o valor que foi salvo. |

---

### Resumo da Jornada

| Etapa | Objetivo | Ações | Cliques | Esperas | Riscos de Erro |
|---|---|---|---|---|---|
| Abrir Lead | Localizar o cliente | 4 | 3–4 | 2 carregamentos | Agente ERP não vinculado |
| Passo 1 — Contratante | Identificar | 10–12 interações | 10+ | 1 (CPF lookup) | Campo duplicado, CPF não encontrado silencioso |
| Passo 2 — Endereço | Endereçar | 4–6 | 4–6 | 1 (ViaCEP) | Formato de cidade acoplado |
| Passo 3 — Plano | Selecionar produto | 5–10 | 5–10 | 1–2 (produtos ERP) | Lista hardcoded, produtos ocultos |
| Passo 4 — Beneficiários | Cadastrar pessoas | 6–25+ | 6–25+ | 0 | Cards surpresa, validações tardias |
| Passo 5 — Pagamento | Definir pagamento | 4–6 | 4–6 | 1 (planos ERP) | Campos correlacionados confusos |
| Passo 6 — Revisão | Confirmar | 1–3 | 1–3 | **5–30 s (ERP)** | JSON técnico, sem progresso |
| Upload Documentos | Anexar | 3–11 | 3–11 | Por upload | Limite invisível, lista vazia |
| Adesão Zero | Registrar isenção | 2 | 2 | 1 | Estado padrão ambíguo |
| **Total** | — | **~49–79 ações** | **~39–69 cliques** | **~7–10 pontos** | **~18 riscos mapeados** |

---

## 2. Atritos

### 2.1 Confusão / não entender o sistema

| # | Atrito | Onde |
|---|---|---|
| A1 | **Dois campos "Telefone" no Passo 1** — mesmo label, mesma posição, um para fixo e um aparentemente para celular, ambos sem distinção clara. | `UpsellNovoOrcamento.jsx` Step1 ln 1333 e 1362 |
| A2 | **"Orçamento Nº" vs "Nº do Pedido ERP"** — o número exibido pode ser `erp_numero` ou `erp_pedido_id`, sem deixar claro qual é o número oficial do ERP para referência. | `OrcamentoDocumentos.jsx` ln 111 |
| A3 | **Passo 4 chama-se "Beneficiários" mas contém condutor, veículo e pet** — o vendedor de BOM AUTO ou BOM PET abre o passo esperando adicionar pessoas e encontra campos de modelo de carro ou espécie animal. | `UnsellNovoOrcamento.jsx` Step5 |
| A4 | **"Título do contrato" filtra os produtos**, mas essa relação não é explicada — ao selecionar "BOM PASTOR - BOM AUTO" os produtos de veículo aparecem; ao selecionar outro título, desaparecem. O vendedor pode pensar que os produtos sumiram. | Passo 3 |
| A5 | **"Plano de pagamento" e "Quantidade de parcelas" são dois campos separados** sem explicação de quando usar um ou o outro (ou se um substitui o outro). | Passo 5 |
| A6 | **O Passo 6 exibe o payload JSON inteiro** — bloco de texto técnico que o vendedor não consegue interpretar. Não há um resumo legível dos dados que serão enviados. | `UnsellNovoOrcamento.jsx` Step6 |
| A7 | **Cards de DEPENDENTE PAGO aparecem automaticamente no Passo 4** sem aviso prévio — o vendedor não sabe quantos cards surgirão ao avançar do Passo 3. | efeito ln 634 |
| A8 | **Adesão Zero com asterisco (campo obrigatório)** mas sem valor padrão visível — o vendedor pode não perceber que precisa interagir com o toggle. | `OrcamentoDocumentos.jsx` ln 339 |
| A9 | **O relatório filtra por `bomflow_orcamentos`** — se o orçamento existe no ERP mas falhou o registro local, ele simplesmente não aparece. Sem mensagem de que "pode haver orçamentos que não estão aqui". | `ErpOrcamentoRelatorioBase.jsx` |

### 2.2 Preencher errado

| # | Atrito | Onde |
|---|---|---|
| B1 | **CEP sem revisão após autopreenchimento** — o logradouro e bairro são preenchidos em maiúsculas automaticamente; o vendedor raramente confere, e erros do ViaCEP são absorvidos silenciosamente. | Passo 2 |
| B2 | **Placa aceita dois formatos (Mercosul e antigo)** sem instruir o vendedor — mensagem de validação genérica sem exemplo. | Passo 4, card veículo |
| B3 | **Ano do veículo: campo livre de texto com validação `/^\d{4}$/`** — um vendedor pode tentar "2024/2025" ou "24" e só descobre o erro ao clicar "Próximo". | Passo 4, card veículo |
| B4 | **CPF do beneficiário não tem máscara de digitação** — o vendedor precisa digitar os 11 dígitos sem formatação; erro de CPF inválido só aparece ao clicar "Próximo". | Passo 4 |
| B5 | **Parentesco é opção de select (P/M/F/S/C/D)** — siglas curtas que o vendedor pode não memorizar. | Passo 4 |
| B6 | **Campo "Observações" no Passo 1 ou nos dados finais** sem limite de caracteres visível ou indicação do que o ERP faz com esse campo. | Payload |
| B7 | **Profissão é um select fechado** com opções genéricas (MÉDICO, ENFERMEIRO, etc.) sem um campo "OUTRO + texto livre" para exceções. | Passo 1 |

### 2.3 Esquecer informação

| # | Atrito | Onde |
|---|---|---|
| C1 | **Adesão Zero não tem marcação visual de "ainda não preenchida"** no card da lista de orçamentos — o vendedor pode entregar o processo sem defini-la. | `OrcamentoDocumentos.jsx` `OrcamentoRow` |
| C2 | **Progresso dos documentos mostra "2/4"** mas não indica quais estão faltando sem abrir o modal — o vendedor fecha o modal e não sabe o que fazer a seguir. | `OrcamentoRow` `DocCounter` |
| C3 | **Não há notificação ou badge no lead** indicando que o orçamento foi criado mas os documentos estão incompletos — o lead volta para o Kanban sem sinalização de pendências. | Lead detail |
| C4 | **"Dia de vencimento" no Passo 5** — o vendedor pode avançar sem preencher (o campo não é validado explicitamente em `validateStep step 5`). | Passo 5 |
| C5 | **E-mail do cliente não tem reconfirmação** — digitado uma vez, qualquer typo passa. | Passo 1 |
| C6 | **O nome do pet (campo combinado NOME/TIPO/RAÇA/COR/PORTE)** é invisível para o vendedor — ele vê os selects individualmente, mas não percebe que o nome final enviado ao ERP é a concatenação. Se faltar um campo, o nome fica incompleto. | Passo 4, BOM PET |

### 2.4 Esperar sem feedback

| # | Atrito | Onde |
|---|---|---|
| D1 | **Envio ao ERP (Passo 6)** — pipeline de até 30 segundos. Só exibe "Enviando ao ERP..." com spinner rotativo. Sem etapas, sem progresso, sem estimativa. | `UnsellNovoOrcamento.jsx` ln 1230 |
| D2 | **Lookup de CPF no ERP** — spinner no campo CPF, mas sem texto "Buscando no ERP..." nem estimativa de tempo. | Passo 1 |
| D3 | **Carregamento de produtos ERP** — `Loader2` no lugar da lista, sem texto explicativo. Para planos com muitos produtos, o carregamento pode demorar. | Passo 3 |
| D4 | **Upload de documento** — spinner no slot do documento, mas sem barra de progresso ou porcentagem. Para arquivos próximos de 15 MB, o upload pode demorar 10–20 segundos. | `OrcamentoDocumentos.jsx` |
| D5 | **Carregamento dos planos de pagamento** — sem feedback claro enquanto a lista do ERP DB é buscada. | Passo 5 |

### 2.5 Mensagens pouco claras

| # | Atrito | Onde |
|---|---|---|
| E1 | **"Orçamento criado no ERP, mas o produto/beneficiários NÃO foram vinculados"** — mensagem técnica que o vendedor não entende: o que fazer? Ligar pro suporte? Tentar de novo? | `UnsellNovoOrcamento.jsx` ln 863 |
| E2 | **"Bloco: [NOME_DO_BLOCO]"** — mensagem de erro do ERP exposta diretamente (ex.: "Bloco: FECHAMENTO"). Sem instrução de ação. | ln 852 |
| E3 | **"Erro ao buscar CPF"** — genérico; não informa se o ERP está fora do ar, se o CPF é inválido no sistema ou se houve erro de rede. | lookupCpfMutation onError |
| E4 | **"Adesão Zero atualizada"** — toast de sucesso sem indicar o valor que foi salvo ("Sim" ou "Não"). | `OrcamentoDocumentos.jsx` ln 553 |
| E5 | **`window.confirm("Excluir este documento? Esta ação não pode ser desfeita.")`** — diálogo nativo do browser sem o nome do documento, sem opção de "cancelar" estilizada. | ln 520 |
| E6 | **"Celular deve ser um número de celular válido (DDD + 9 dígitos)"** — a validação dispara ao clicar "Próximo", não em tempo real, e o campo não destaca o erro. | validateStep ln 895 |

---

## 3. Oportunidades de UX

Todas as sugestões abaixo **não alteram nenhuma regra de negócio, SQL, integração ou payload**.

### 3.1 Feedback visual

| # | Oportunidade | Benefício |
|---|---|---|
| F1 | **Progress tracker de etapas durante o envio ao ERP**: "Criando cabeçalho... ✔ / Cadastrando beneficiários... ✔ / Vinculando produtos... ✔" — exibir cada etapa conforme o backend retorna (usando `onSuccess` com data incremental ou streaming simples). | Elimina ansiedade durante a espera de 5–30s. |
| F2 | **Badge de pendências no card do lead** ("Documentos: 2/4" ou "Adesão Zero pendente") para que o Kanban já sinalize o que falta. | Reduz retorno ao lead por esquecimento. |
| F3 | **Highlight dos campos obrigatórios não preenchidos** (borda vermelha inline) ao clicar "Próximo" — em vez de apenas toast. | Elimina a segunda leitura para descobrir qual campo está errado. |
| F4 | **Confirmação inline do CEP**: após autopreenchimento, exibir "CEP encontrado: CIDADE - UF" com ícone ✔ e o nome da cidade por extenso. | Evita endereço errado silencioso. |
| F5 | **Barra de progresso de upload no slot do documento**: percentual de conclusão usando o evento `progress` do XMLHttpRequest. | Reduz percepção de lentidão em arquivos grandes. |
| F6 | **Chip de status no modal de orçamento** mostrando o valor atual da Adesão Zero ("Adesão Zero: Sim ✔" ou "Adesão Zero: Não definida ⚠"). | Torna o estado sempre visível sem o vendedor precisar interagir. |

### 3.2 Validações antecipadas

| # | Oportunidade | Benefício |
|---|---|---|
| G1 | **CPF do beneficiário: máscara de digitação e validação em tempo real** (ao sair do campo, não só ao clicar "Próximo"). | Evita erros descobertos só ao final do passo. |
| G2 | **Placa: validar em tempo real com regex** e exibir "Formato: AAA0000 ou AAA0A00" como placeholder. | Reduz erros de formato. |
| G3 | **E-mail com validação em tempo real** (onBlur) antes de avançar. | Detecta typos imediatamente. |
| G4 | **Ano do veículo: input type="number" min="1950" max="2026"** com spinner nativo — elimina formatos como "24" ou "2024/25". | Evita erro de validação no "Próximo". |
| G5 | **Pré-validar o vínculo ERP do agente antes de abrir o wizard** — se `erp_agent_id` estiver ausente, exibir um aviso antes de o vendedor preencher 6 passos. | Elimina frustração de descobrir o problema só no envio. |

### 3.3 Tooltips e instruções contextuais

| # | Oportunidade | Benefício |
|---|---|---|
| H1 | **Tooltip em "Título do contrato"**: "O título define quais produtos estão disponíveis." | Explica a relação oculta. |
| H2 | **Tooltip em "Adesão Zero"**: "Isenção da taxa de entrada cobrada pelo ERP. Deve ser confirmada antes de finalizar o processo." | Explica o campo desconhecido. |
| H3 | **Indicação prévia de quantos beneficiários serão criados automaticamente** ao selecionar certos planos (BOM AUTO: "+2 cards automáticos"; COMBO com DEPENDENTE: "+N vagas"). | Elimina os "cards surpresa". |
| H4 | **Tooltip no campo "Parentesco"** mostrando as siglas: "P = Pai, M = Mãe, F = Filho/Filha…" | Elimina a necessidade de decorar. |
| H5 | **Aviso de limite de beneficiários ("X de 15 adicionados")** como contador sempre visível, não só no erro. | Evita frustração ao tentar adicionar o 16º. |

### 3.4 Resumos e confirmações

| # | Oportunidade | Benefício |
|---|---|---|
| I1 | **Passo 6 com resumo legível** em vez de JSON: nome do cliente, CPF, produto(s), total, forma de pagamento. O JSON pode existir como "Ver detalhes técnicos" colapsado para administradores. | O vendedor consegue confirmar os dados antes de enviar. |
| I2 | **Confirmação antes do envio final**: modal "Você está prestes a enviar o orçamento para [NOME] (CPF [XXX]). Deseja confirmar?" com resumo de 3 linhas. | Previne envios acidentais. |
| I3 | **Após sucesso: card de conclusão** com link direto "Ver no relatório" e "Fazer upload de documentos agora". | Elimina a perda de contexto pós-envio. |

### 3.5 Autopreenchimento e atalhos

| # | Oportunidade | Benefício |
|---|---|---|
| J1 | **Pré-preencher dados do lead** (nome, telefone, e-mail) no Passo 1 quando o orçamento é aberto a partir de um lead que já tem esses dados. | Elimina digitação redundante. |
| J2 | **Atalho de teclado "Enter" para avançar o passo** quando todos os campos obrigatórios estão preenchidos. | Agiliza usuários experientes. |
| J3 | **Lembrar o último título de contrato selecionado** por vendedor (localStorage) — a maioria dos vendedores trabalha com o mesmo título todo dia. | Elimina seleção repetitiva. |
| J4 | **Copiar dados de beneficiário existente** — botão "Copiar do contratante" no primeiro card de beneficiário para titular que também é beneficiário. | Reduz redigitação. |

### 3.6 Persistência de dados

| # | Oportunidade | Benefício |
|---|---|---|
| K1 | **Salvar rascunho do wizard no localStorage** (entre passos) — se o vendedor fecha acidentalmente a aba, os dados não são perdidos. | Elimina necessidade de recomeçar do zero. |
| K2 | **Avisar antes de fechar/navegar para fora** ("Você tem um orçamento em andamento. Deseja sair?") usando o evento `beforeunload`. | Evita perda de dados acidental. |

---

## 4. Oportunidades para a Equipe de Suporte

| # | Oportunidade | O que resolveria |
|---|---|---|
| L1 | **Log de execução por orçamento no CRM**: registro de cada etapa do pipeline (nome da etapa, timestamp, status, duração, payload enviado, resposta recebida). Hoje, se o pipeline falha na etapa 4, o suporte não sabe onde parou. | Diagnóstico remoto sem precisar pedir print ao vendedor. |
| L2 | **Histórico de tentativas**: quantas vezes o mesmo orçamento (mesmo CPF + produto) foi submetido, com timestamps. Indica tentativas repetidas após falha. | Detecta loop de retry manual. |
| L3 | **Status visual do orçamento no CRM** (não só no ERP): "Cabeçalho criado / Itens vinculados / Fechado / Registrado no CRM". | Suporte consegue responder "em qual etapa o orçamento está?" sem acesso ao ERP. |
| L4 | **Tempo de execução de cada etapa** registrado em `bomflow_orcamentos` — campo `execution_ms` por fase. | Permite identificar qual etapa está mais lenta (ERP REST vs DB). |
| L5 | **Identificação do agente ERP usado** (`agente_venda_id`) registrado no orçamento — hoje a coluna existe mas o suporte não vê na interface. | Permite confirmar se o vínculo ERP do vendedor estava correto. |
| L6 | **Filtro de "orçamentos com erro de vinculação" no relatório** (flag `dbWarning=true`) — permite suporte listar e tratar todos os orçamentos com falha parcial. | Proativo em vez de reativo. |
| L7 | **Reprocessamento manual de etapas** — botão admin "Tentar reprocessar vinculação de produtos" para orçamentos com `dbWarning`. | Elimina necessidade de recriar o orçamento do zero. |

---

## 5. Oportunidades para Administradores

| # | Oportunidade | Onde exibir |
|---|---|---|
| M1 | **Payload completo enviado ao ERP** — o JSON técnico que hoje aparece para todos no Passo 6 deve ser movido para um painel admin-only (colapsado) na página de detalhes do orçamento. | Página de orçamento no relatório |
| M2 | **Resposta bruta do ERP** (OrcamentoSgprcUsuario response) — o JSON de resposta do ERP gravado junto ao orçamento. | Painel admin no detalhe do orçamento |
| M3 | **Tempo de execução total do pipeline** (ms) visível no relatório para admins — identifica lentidão sistêmica. | Coluna oculta no relatório, visível só para admin |
| M4 | **Status de cada etapa** (1 a 7) com timestamp individual — dashboard de saúde do pipeline. | Seção "Diagnóstico ERP" no detalhe |
| M5 | **Último erro por vendedor** — quais vendedores tiveram mais falhas de orçamento nas últimas 48h, com mensagem do erro. | Novo card no Dashboard de Administração |
| M6 | **Orçamentos sem registro local** — lista de pedidos no ERP que existem sem correspondente em `bomflow_orcamentos` (reconciliação). | Relatório de inconsistências (admin-only) |
| M7 | **Configuração do estabelecimento fixo** ("LIMEIRA - CNPA") via interface admin em vez de hardcoded — quando necessário mudar, evita deploy. | Configurações do sistema |
| M8 | **Log de Adesão Zero**: quem alterou, quando, de qual valor para qual valor. | Histórico do orçamento |

---

## 6. Evoluções de Baixo Risco

Todas as melhorias abaixo **não alteram regras de negócio, SQL, integração, payload ou APIs**.

| # | Melhoria | O que muda | O que não muda |
|---|---|---|---|
| N1 | Remover o campo "Telefone" duplicado no Passo 1 (manter apenas um campo Telefone fixo + um Celular) | UI: apenas ocultar/remover o campo redundante | Payload, validação, API |
| N2 | Substituir o JSON bruto no Passo 6 por um resumo legível com os dados principais; manter JSON em seção colapsada | Componente Step6: apresentação dos dados | Payload, dados enviados |
| N3 | Adicionar placeholder com formato de placa nos campos de veículo: "AAA0000 ou AAA0A00" | `placeholder` do input | Validação, payload |
| N4 | Adicionar máscara de digitação no CPF do beneficiário (igual ao CPF do contratante) | Componente do card de beneficiário: formato visual | Valor enviado (já tem strip de não-dígitos) |
| N5 | Exibir contador "X de 15 beneficiários" proativamente no cabeçalho do Passo 4 | UI do Passo 4 | Limite, lógica de negócio |
| N6 | Exibir o valor atual da Adesão Zero como chip no `OrcamentoRow` da lista (mesmo espaço do `AdesaoChip` já existente, que hoje só mostra se é `true`) | `AdesaoChip`: exibir também "Não definida ⚠" | Dado armazenado, API |
| N7 | Adicionar modal de confirmação antes do envio final ("Confirmar envio para [NOME]?") | Botão "Confirmar e Enviar" → abre modal de confirmação antes de submitMutation | Pipeline, payload |
| N8 | Substituir `window.confirm` na exclusão de documento por modal estilizado com nome do documento | `OrcamentoDocumentos`: handleDelete | API de exclusão, lógica |
| N9 | Exibir texto de ajuda abaixo do toggle de Adesão Zero: "Marque 'Sim' se o cliente estiver isento da taxa de adesão." | Modal de documentos | Campo, API, regra de negócio |
| N10 | Mostrar formatos aceitos e tamanho máximo **no slot vazio** de cada documento (antes do upload), não apenas no rodapé do modal | `DocSlot` vazio: adicionar linha "PDF, JPG ou PNG · máx. 15 MB" | Upload, API |
| N11 | Adicionar texto "Buscando no ERP..." ao spinner do lookup de CPF | Campo CPF: label condicional | Lookup, API |
| N12 | Pré-selecionar o tipo de produto do pet (NOME DO PET) quando o card de beneficiário é criado em modo BOM PET — hoje o select "Produto/Plano" exige seleção manual mesmo sendo o único disponível | Card de beneficiário BOM PET: auto-selecionar o produto | Lógica de beneficiário, payload |
| N13 | Adicionar "Ver no relatório" e "Fazer upload de documentos" como ações no card de sucesso após envio | Componente `SubmitResult` | Pipeline, API |
| N14 | Exibir na lista de orçamentos (OrcamentoDocumentos) **quais tipos de documento estão faltando** sem precisar abrir o modal (tooltip no badge "2/4") | `OrcamentoRow`: tooltip com "Faltam: Comprovante de residência, Cópia do contrato" | API, dados armazenados |
| N15 | Adicionar `beforeunload` para avisar o vendedor antes de sair do wizard com dados não enviados | `UnsellNovoOrcamento.jsx`: evento no efeito | Payload, pipeline |

---

## 7. Priorização

| # | Melhoria | Benefício | Esforço | Risco | Impacto Usuário | Impacto Suporte | Prioridade |
|---|---|---|---|---|---|---|---|
| F1 | Progress tracker etapas ERP | Elimina ansiedade na maior espera da jornada | Médio | Baixo | **Alto** | Alto | 🔴 P1 |
| G5 | Pré-validar vínculo ERP do agente | Evita 6 passos preenchidos sem resultado | Baixo | Mínimo | **Alto** | Alto | 🔴 P1 |
| N2 | Resumo legível no Passo 6 (remover JSON bruto) | Vendedor consegue confirmar o que está enviando | Baixo | Mínimo | **Alto** | Médio | 🔴 P1 |
| N7 | Confirmação antes do envio final | Evita envios acidentais | Baixo | Mínimo | **Alto** | Baixo | 🔴 P1 |
| L1 | Log de etapas por orçamento no CRM | Diagnóstico remoto pelo suporte | Médio | Baixo | Médio | **Alto** | 🔴 P1 |
| F3 | Highlight de campo inválido inline | Usuário sabe exatamente qual campo corrigir | Baixo | Mínimo | **Alto** | Baixo | 🟠 P2 |
| F2 | Badge de pendências no card do lead | Reduz orçamentos esquecidos sem documentos | Médio | Baixo | **Alto** | Médio | 🟠 P2 |
| N1 | Remover campo "Telefone" duplicado | Elimina confusão imediata | **Baixo** | **Mínimo** | Médio | Baixo | 🟠 P2 |
| N4 | Máscara CPF no beneficiário | Reduz erros de CPF inválido no passo 4 | Baixo | Mínimo | Médio | Médio | 🟠 P2 |
| N6 | Chip Adesão Zero com estado "Não definida" | Torna pendência visível sem abrir modal | Baixo | Mínimo | Médio | Baixo | 🟠 P2 |
| N5 | Contador "X/15 beneficiários" visível | Evita frustração do limite invisível | Baixo | Mínimo | Médio | Baixo | 🟠 P2 |
| J1 | Pré-preencher dados do lead no Passo 1 | Elimina redigitação de nome/fone/e-mail | Médio | Baixo | **Alto** | Baixo | 🟠 P2 |
| H3 | Aviso de cards automáticos ao selecionar plano | Elimina surpresa no Passo 4 | Baixo | Mínimo | Médio | Baixo | 🟠 P2 |
| N8 | Modal estilizado para excluir documento | Substitui `window.confirm` genérico | Baixo | Mínimo | Baixo | Baixo | 🟡 P3 |
| N10 | Formatos aceitos no slot vazio do documento | Evita upload com formato errado | Baixo | Mínimo | Baixo | Baixo | 🟡 P3 |
| N11 | Texto "Buscando no ERP..." no CPF lookup | Feedback contextual | Baixo | Mínimo | Baixo | Baixo | 🟡 P3 |
| N9 | Texto explicativo no toggle Adesão Zero | Reduz dúvida sobre o campo | Baixo | Mínimo | Baixo | Baixo | 🟡 P3 |
| K1 | Rascunho do wizard no localStorage | Evita perda de dados por fechamento acidental | Alto | Baixo | Alto | Baixo | 🟡 P3 |
| N15 | `beforeunload` ao sair do wizard | Avisa antes de perder dados | Baixo | Mínimo | Médio | Baixo | 🟡 P3 |
| L6 | Filtro de orçamentos com erro parcial | Suporte proativo nos `dbWarning` | Médio | Baixo | Baixo | **Alto** | 🟡 P3 |
| M1/M2 | Payload + resposta ERP admin-only | Diagnóstico técnico sem suporte externo | Médio | Baixo | Baixo | **Alto** | 🟡 P3 |
| N14 | Tooltip com docs faltantes no badge "X/4" | Vendedor sabe o que falta sem abrir modal | Baixo | Mínimo | Médio | Baixo | 🟡 P3 |
| L7 | Reprocessamento manual de etapas | Resolve casos de falha parcial sem recriar | Alto | Médio | Médio | **Alto** | 🔵 P4 |
| M7 | Configuração do estabelecimento via UI | Elimina hardcoded e dependência de deploy | Médio | Baixo | Baixo | Médio | 🔵 P4 |
| J3 | Lembrar último título de contrato selecionado | Elimina seleção repetitiva | Baixo | Mínimo | Médio | Baixo | 🔵 P4 |
| N13 | Links "Ver no relatório" + "Upload de docs" no sucesso | Elimina perda de contexto pós-envio | Baixo | Mínimo | Médio | Baixo | 🔵 P4 |

---

## 8. Roadmap

### Sprint 1 — Reduzir atritos críticos (maior impacto, menor risco)

**Foco:** eliminar os maiores pontos de frustração do vendedor sem tocar em nenhuma lógica de negócio.

| Item | Descrição | Prioridade |
|---|---|---|
| **N2** | Substituir JSON bruto no Passo 6 por resumo legível (nome, CPF, produto, valor, pagamento). JSON mantido colapsado para admin. | P1 |
| **G5** | Validar presença de `erp_agent_id` antes de abrir o wizard. Exibir aviso "Seu vínculo com o ERP não foi configurado. Contate o administrador." se ausente. | P1 |
| **N7** | Modal de confirmação antes do envio final: "Enviar orçamento para [NOME] (CPF [XXX])?". | P1 |
| **N1** | Remover o campo "Telefone" duplicado no Passo 1. | P2 |
| **F3** | Adicionar highlight inline (borda vermelha) nos campos inválidos ao clicar "Próximo" — além do toast. | P2 |
| **N4** | Máscara de CPF nos campos de beneficiário (Passo 4). | P2 |
| **N5** | Contador "X de 15 beneficiários" sempre visível no cabeçalho do Passo 4. | P2 |
| **N11** | Texto "Buscando no ERP..." ao lado do spinner de CPF lookup. | P3 |
| **N9** | Texto explicativo sob o toggle de Adesão Zero. | P3 |
| **N10** | Exibir formatos aceitos e tamanho máximo no slot vazio de cada documento. | P3 |

---

### Sprint 2 — Melhorar feedback e visibilidade de estado

**Foco:** o vendedor sempre sabe o que está acontecendo e o que falta fazer.

| Item | Descrição | Prioridade |
|---|---|---|
| **F1** | Progress tracker de etapas durante o envio ao ERP (pelo menos 3 estados: "Criando / Vinculando / Finalizando"). | P1 |
| **N6** | Chip de Adesão Zero com estado "Não definida ⚠" visível diretamente no card da lista de orçamentos. | P2 |
| **N14** | Tooltip no badge "X/4" mostrando quais documentos faltam sem abrir o modal. | P3 |
| **N13** | Links "Ver no relatório" e "Ir para upload de documentos" no card de sucesso após envio. | P4 |
| **H3** | Aviso antes do Passo 4 indicando quantos cards serão criados automaticamente com base no plano selecionado. | P2 |
| **N8** | Substituir `window.confirm` na exclusão de documento por modal estilizado com nome do documento e botão "Excluir". | P3 |
| **N15** | `beforeunload` no wizard — avisar o vendedor antes de sair da página com dados não enviados. | P3 |
| **F4** | Confirmação visual do autopreenchimento do CEP: "CEP encontrado: [CIDADE] - [UF]" com ícone ✔. | P2 |
| **G1–G4** | Validações em tempo real: CPF de beneficiário, placa, e-mail e ano do veículo. | P2 |

---

### Sprint 3 — Eficiência e suporte proativo

**Foco:** reduzir tempo de preenchimento e dar ferramentas para o time de suporte.

| Item | Descrição | Prioridade |
|---|---|---|
| **J1** | Pré-preencher dados do lead (nome, telefone, e-mail) no Passo 1 quando o wizard é aberto a partir de um lead com esses dados. | P2 |
| **J3** | Lembrar o último título de contrato selecionado por vendedor (localStorage). | P4 |
| **F2** | Badge de pendências no card do lead no Kanban: "Docs: 2/4" e/ou "Adesão Zero pendente". | P2 |
| **L1** | Registro de log de etapas por orçamento em `bomflow_orcamentos`: etapa, timestamp, status, duração e mensagem de erro por fase. | P1 |
| **L6** | Filtro de "orçamentos com erro de vinculação" no relatório de orçamentos (campo `db_warning`). | P3 |
| **M1/M2** | Seção "Diagnóstico ERP" (admin-only) na página de detalhe do orçamento: payload enviado + resposta recebida + tempo de execução. | P3 |
| **M5** | Card de "Últimos erros por vendedor" no Dashboard de Administração (últimas 48h). | P3 |
| **K1** | Rascunho do wizard salvo no localStorage: se o vendedor fechar acidentalmente, os dados são recuperados ao reabrir. | P3 |

---

### Sprint 4 — Administração e resiliência

**Foco:** ferramentas de recuperação, configuração via UI e monitoramento avançado.

| Item | Descrição | Prioridade |
|---|---|---|
| **L7** | Botão de reprocessamento manual de etapas para orçamentos com `db_warning=true` (admin-only). | P4 |
| **M7** | Configuração do estabelecimento fixo ("LIMEIRA - CNPA") via painel de administração em vez de hardcoded. | P4 |
| **M6** | Relatório de inconsistências: orçamentos no ERP sem correspondente no CRM (`bomflow_orcamentos`). | P4 |
| **M8** | Log de alterações de Adesão Zero: quem alterou, quando, de qual valor para qual. | P4 |
| **L4** | Tempo de execução de cada etapa do pipeline em ms, visível no diagnóstico do orçamento. | P4 |
| **N12** | Auto-selecionar produto de pet no card de beneficiário BOM PET (quando há apenas um produto disponível). | P4 |
| **J4** | Botão "Copiar dados do contratante" no primeiro card de beneficiário. | P4 |
| **M3** | Coluna de tempo de execução total (ms) no relatório — visível apenas para admin. | P4 |

---

## Visão Geral do Roadmap

```
Sprint 1                Sprint 2                Sprint 3                Sprint 4
───────────────────    ───────────────────    ───────────────────    ───────────────────
✦ Resumo legível P6   ✦ Progress tracker ERP  ✦ Pré-preencher lead   ✦ Reprocessamento
✦ Validar vínculo ERP  ✦ Chip Adesão Zero      ✦ Badge pendências     ✦ Config estabelecimento
✦ Modal confirmação    ✦ Tooltip docs faltando  ✦ Log etapas CRM       ✦ Relatório inconsistências
✦ Campo Telefone dup.  ✦ Links pós-sucesso      ✦ Filtro dbWarning     ✦ Log Adesão Zero
✦ Highlight inválidos  ✦ Cards automáticos aviso ✦ Diagnóstico admin   ✦ Auto-seleção produto pet
✦ Máscara CPF benef.   ✦ Modal excluir doc      ✦ Erros por vendedor   ✦ Copiar dados contratante
✦ Contador beneficiários ✦ beforeunload wizard  ✦ Rascunho localStorage ✦ Tempo exec. relatório
✦ Feedback CPF lookup  ✦ Confirmação CEP        
✦ Texto Adesão Zero    ✦ Validações tempo real  
✦ Formatos doc visíveis 

Impacto: ████████████   Impacto: ████████████   Impacto: ████████        Impacto: ████████
Risco:   ░░░░░░░░░░░░   Risco:   ░░░░░░░░░░░░   Risco:   ░░░░░░░░        Risco:   ░░░░░░
```

> **Critério de priorização:** Maior impacto para o vendedor + menor risco de introduzir defeito. Nenhum item das 4 sprints altera SQL, payload ERP, APIs ou regras de negócio.
