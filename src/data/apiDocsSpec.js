import {
  KeyRound,
  Database,
  Workflow,
  MessageCircle,
  Car,
  Upload as UploadIcon,
  ShieldCheck,
} from "lucide-react";

export const API_META = {
  baseUrl: "/api",
  productionBaseUrl: "https://app.bomflow.com.br/api",
  authScheme: "Bearer JWT",
  contentType: "application/json",
  description:
    "API REST do CRM Wescctech. Todos os endpoints autenticados exigem o header Authorization: Bearer <accessToken>. O token é obtido via /auth/login e renovado via /auth/refresh.",
};

export const HTTP_METHOD_COLORS = {
  GET: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  POST: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  PUT: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  PATCH: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  DELETE: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
};

export const API_SECTIONS = [
  {
    id: "intro",
    title: "Introdução",
    icon: ShieldCheck,
    overview: `A API do CRM Wescctech é uma REST API JSON sobre HTTPS. Todas as requisições devem incluir o header **Content-Type: application/json** (exceto upload de arquivos, que usa multipart/form-data).\n\nPara endpoints autenticados, envie o token JWT no header **Authorization: Bearer <accessToken>**. O token tem validade de 1 hora; após esse período, use **/auth/refresh** com o refreshToken para obter um novo.\n\n**Códigos de status comuns:**\n- 200 OK — sucesso\n- 201 Created — recurso criado\n- 400 Bad Request — payload inválido\n- 401 Unauthorized — token ausente ou inválido\n- 403 Forbidden — sem permissão para o recurso\n- 404 Not Found — recurso não existe\n- 500 Internal Server Error — erro interno`,
    endpoints: [],
  },
  {
    id: "auth",
    title: "Autenticação",
    icon: KeyRound,
    overview:
      "Endpoints para registro, login, renovação de token e mudança de senha. O sistema usa JWT com access token (1h) e refresh token (7 dias).",
    endpoints: [
      {
        id: "auth-login",
        method: "POST",
        path: "/auth/login",
        title: "Login",
        description: "Autentica um agente e retorna access + refresh tokens.",
        auth: false,
        body: [
          { name: "email", type: "string", required: true, description: "Email do agente" },
          { name: "password", type: "string", required: true, description: "Senha do agente" },
        ],
        response: {
          status: 200,
          example: {
            accessToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
            refreshToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
            user: {
              id: "uuid",
              name: "João Silva",
              email: "joao@empresa.com",
              role: "admin",
              agent_type_key: "admin",
            },
          },
        },
      },
      {
        id: "auth-refresh",
        method: "POST",
        path: "/auth/refresh",
        title: "Renovar Token",
        description:
          "Gera um novo accessToken a partir de um refreshToken válido. Usado pelo interceptor global do frontend de forma transparente.",
        auth: false,
        body: [
          { name: "refreshToken", type: "string", required: true, description: "Refresh token obtido no login" },
        ],
        response: {
          status: 200,
          example: { accessToken: "eyJ...", refreshToken: "eyJ..." },
        },
      },
      {
        id: "auth-me",
        method: "GET",
        path: "/auth/me",
        title: "Usuário Atual",
        description: "Retorna o perfil completo do agente autenticado.",
        auth: true,
        response: {
          status: 200,
          example: {
            id: "uuid",
            name: "João Silva",
            email: "joao@empresa.com",
            role: "admin",
            phone: "(11) 99999-9999",
            agent_type_key: "admin",
            erp_agent_id: 41,
          },
        },
      },
      {
        id: "auth-change-password",
        method: "POST",
        path: "/auth/change-password",
        title: "Alterar Senha",
        description: "Altera a senha do agente autenticado.",
        auth: true,
        body: [
          { name: "currentPassword", type: "string", required: true, description: "Senha atual" },
          { name: "newPassword", type: "string", required: true, description: "Nova senha (mínimo 6 caracteres)" },
        ],
        response: { status: 200, example: { message: "Senha alterada com sucesso" } },
      },
      {
        id: "auth-logout",
        method: "POST",
        path: "/auth/logout",
        title: "Logout",
        description: "Invalida a sessão atual no servidor (limpeza opcional).",
        auth: true,
        response: { status: 200, example: { message: "Logout realizado" } },
      },
      {
        id: "auth-register",
        method: "POST",
        path: "/auth/register",
        title: "Registro",
        description:
          "Cria um novo agente. Restrito a administradores em produção (controlado por configuração system_settings).",
        auth: true,
        body: [
          { name: "name", type: "string", required: true, description: "Nome completo" },
          { name: "email", type: "string", required: true, description: "Email único" },
          { name: "password", type: "string", required: true, description: "Senha inicial" },
          { name: "phone", type: "string", required: false, description: "Telefone" },
          { name: "agent_type_key", type: "string", required: true, description: "Chave do tipo de agente (ex: admin, atendente)" },
          { name: "team_ids", type: "string[]", required: false, description: "IDs das equipes" },
        ],
        response: { status: 201, example: { id: "uuid", message: "Agente criado" } },
      },
    ],
  },
  {
    id: "entities",
    title: "Entidades (CRUD)",
    icon: Database,
    overview: `Mais de 80 entidades expõem operações REST padronizadas via /api/{entity}. Cada uma segue o mesmo contrato:\n\n- **GET /api/{entity}** — lista (suporta query params: page, limit, search, filtros)\n- **GET /api/{entity}/:id** — busca por ID\n- **POST /api/{entity}** — cria\n- **PUT /api/{entity}/:id** — atualiza\n- **DELETE /api/{entity}/:id** — remove\n- **POST /api/{entity}/filter** — filtros avançados (body com critérios)\n\nLimite padrão: 10000 itens por página em listagens.\n\n**Exemplos de entidades disponíveis:** agents, agent-types, teams, tickets, ticket-types, ticket-messages, sla-policies, leads, leads-pj, leads-upsell, activities, activities-pj, activities-upsell, sales-goals, lead-automations, referrals, referral-automations, kb-categories, kb-articles, kb-feedback, csat-surveys, automation-logs, proposal-templates, distribution-rules, system-settings, quality-checklists, call-audits, notification-preferences.`,
    endpoints: [
      {
        id: "entities-list",
        method: "GET",
        path: "/{entity}",
        title: "Listar Recursos",
        description:
          "Lista paginada de uma entidade. Substitua {entity} por o slug do recurso (ex: /agents, /tickets, /leads).",
        auth: true,
        query: [
          { name: "page", type: "number", required: false, description: "Página (default 1)" },
          { name: "limit", type: "number", required: false, description: "Itens por página (default 10000)" },
          { name: "search", type: "string", required: false, description: "Busca em campos de texto da entidade" },
          { name: "sort", type: "string", required: false, description: "Campo de ordenação (ex: created_at:desc)" },
        ],
        response: {
          status: 200,
          example: {
            data: [{ id: "uuid", "/* campos da entidade */": "..." }],
            total: 1,
            page: 1,
            limit: 10000,
          },
        },
      },
      {
        id: "entities-get",
        method: "GET",
        path: "/{entity}/:id",
        title: "Buscar por ID",
        description: "Retorna um único recurso identificado pelo ID.",
        auth: true,
        params: [{ name: "id", type: "string", required: true, description: "ID do recurso" }],
        response: { status: 200, example: { id: "uuid", "/* campos */": "..." } },
      },
      {
        id: "entities-create",
        method: "POST",
        path: "/{entity}",
        title: "Criar Recurso",
        description: "Cria um novo recurso. O body deve conter os campos definidos pela entidade.",
        auth: true,
        body: [{ name: "(campos da entidade)", type: "object", required: true, description: "Campos específicos do recurso" }],
        response: { status: 201, example: { id: "uuid", "/* recurso criado */": "..." } },
      },
      {
        id: "entities-update",
        method: "PUT",
        path: "/{entity}/:id",
        title: "Atualizar Recurso",
        description: "Atualiza campos de um recurso existente. Aceita atualização parcial.",
        auth: true,
        params: [{ name: "id", type: "string", required: true, description: "ID do recurso" }],
        body: [{ name: "(campos a atualizar)", type: "object", required: true, description: "Apenas os campos que serão alterados" }],
        response: { status: 200, example: { id: "uuid", "/* recurso atualizado */": "..." } },
      },
      {
        id: "entities-delete",
        method: "DELETE",
        path: "/{entity}/:id",
        title: "Remover Recurso",
        description: "Remove permanentemente o recurso (hard delete) ou marca como inativo, dependendo da entidade.",
        auth: true,
        params: [{ name: "id", type: "string", required: true, description: "ID do recurso" }],
        response: { status: 200, example: { message: "Removido com sucesso" } },
      },
      {
        id: "entities-filter",
        method: "POST",
        path: "/{entity}/filter",
        title: "Filtros Avançados",
        description:
          "Executa filtros mais complexos via body. Útil para combinar múltiplos critérios e operadores.",
        auth: true,
        body: [
          { name: "filters", type: "object", required: true, description: "Mapa de campo → valor ou operador (ex: { status: 'open', created_at_gte: '2026-01-01' })" },
          { name: "limit", type: "number", required: false, description: "Limite de resultados" },
        ],
        response: { status: 200, example: { data: [], total: 0 } },
      },
    ],
  },
  {
    id: "functions",
    title: "Funções de Negócio",
    icon: Workflow,
    overview:
      "Endpoints de lógica de negócio que vão além do CRUD: distribuição de tickets, SLA, automações, integração ERP, IA, contratos digitais, etc.",
    endpoints: [
      {
        id: "fn-distribute-tickets",
        method: "POST",
        path: "/distribute-tickets",
        title: "Distribuir Tickets",
        description:
          "Distribui tickets não atribuídos seguindo o algoritmo configurado (Round Robin ou Least Active). Restrito a admin/supervisor.",
        auth: true,
        body: [
          { name: "team_id", type: "string", required: false, description: "Equipe alvo (opcional, se omitido distribui para todas)" },
        ],
        response: { status: 200, example: { distributed: 12, agents_assigned: 4 } },
      },
      {
        id: "fn-assign-rr",
        method: "POST",
        path: "/assign-ticket-round-robin",
        title: "Atribuir Ticket (Round Robin)",
        description: "Atribui um ticket específico ao próximo agente disponível por Round Robin.",
        auth: true,
        body: [
          { name: "ticket_id", type: "string", required: true, description: "ID do ticket" },
          { name: "team_id", type: "string", required: true, description: "Equipe responsável" },
        ],
        response: { status: 200, example: { agent_id: "uuid", agent_name: "Maria" } },
      },
      {
        id: "fn-check-sla",
        method: "POST",
        path: "/check-sla",
        title: "Verificar SLA",
        description: "Recalcula e atualiza o status de SLA dos tickets ativos.",
        auth: true,
        response: { status: 200, example: { checked: 45, breached: 3 } },
      },
      {
        id: "fn-validate-whatsapp",
        method: "POST",
        path: "/validate-whatsapp",
        title: "Validar Número WhatsApp",
        description:
          "Valida se um número está ativo no WhatsApp via WHU API. Resultado é cacheado para evitar chamadas repetidas.",
        auth: true,
        body: [
          { name: "phone", type: "string", required: true, description: "Telefone com DDI (ex: 5511999999999)" },
        ],
        response: { status: 200, example: { phone: "5511999999999", valid: true, cached: false } },
      },
      {
        id: "fn-validate-whatsapp-job",
        method: "POST",
        path: "/validate-whatsapp-job",
        title: "Validar Lote WhatsApp (Async)",
        description:
          "Cria um job assíncrono para validar uma lista grande de números. Retorne o ID e consulte /validate-whatsapp-job/:id para acompanhar.",
        auth: true,
        body: [
          { name: "phones", type: "string[]", required: true, description: "Lista de telefones com DDI" },
        ],
        response: { status: 202, example: { job_id: "uuid", status: "queued", total: 500 } },
      },
      {
        id: "fn-validate-whatsapp-job-status",
        method: "GET",
        path: "/validate-whatsapp-job/:id",
        title: "Status do Job de Validação",
        description: "Consulta progresso e resultado parcial/final do job de validação WhatsApp.",
        auth: true,
        params: [{ name: "id", type: "string", required: true, description: "ID do job" }],
        response: {
          status: 200,
          example: {
            job_id: "uuid",
            status: "running",
            processed: 320,
            total: 500,
            valid: 280,
            invalid: 40,
          },
        },
      },
      {
        id: "fn-get-customer-erp",
        method: "POST",
        path: "/get-customer-from-erp",
        title: "Buscar Cliente no ERP",
        description: "Consulta dados de cliente no ERP Bom Pastor a partir do CPF.",
        auth: true,
        body: [{ name: "cpf", type: "string", required: true, description: "CPF apenas dígitos" }],
        response: {
          status: 200,
          example: {
            nome: "Maria Souza",
            cpf: "12345678900",
            telefone: "5511999999999",
            email: "maria@email.com",
            endereco: { cep: "01310100", rua: "Av. Paulista", numero: "1000", cidade: "São Paulo", uf: "SP" },
          },
        },
      },
      {
        id: "fn-get-indicador-erp",
        method: "POST",
        path: "/get-indicador-from-erp",
        title: "Buscar Indicador no ERP",
        description:
          "Consulta dados do indicador (associado responsável pela referência) no ERP via CPF e valida se é elegível para receber comissões.",
        auth: true,
        body: [{ name: "cpf", type: "string", required: true, description: "CPF do indicador" }],
        response: { status: 200, example: { erp_id: 41, nome: "João", elegivel: true } },
      },
      {
        id: "fn-busca-cnpj",
        method: "POST",
        path: "/busca-cnpj",
        title: "Buscar CNPJ",
        description: "Consulta dados públicos de uma empresa via CNPJ.ws.",
        auth: true,
        body: [{ name: "cnpj", type: "string", required: true, description: "CNPJ apenas dígitos" }],
        response: {
          status: 200,
          example: {
            razao_social: "Empresa Exemplo LTDA",
            nome_fantasia: "Empresa Exemplo",
            cnpj: "00000000000100",
            endereco: { logradouro: "Rua Exemplo", numero: "123", municipio: "São Paulo", uf: "SP" },
          },
        },
      },
      {
        id: "fn-generate-proposal",
        method: "POST",
        path: "/generate-proposal",
        title: "Gerar Proposta",
        description: "Gera uma proposta em PDF com base no template selecionado e dados do lead.",
        auth: true,
        body: [
          { name: "lead_id", type: "string", required: true, description: "ID do lead" },
          { name: "template_id", type: "string", required: true, description: "ID do template de proposta" },
          { name: "variables", type: "object", required: false, description: "Variáveis adicionais para substituição" },
        ],
        response: { status: 200, example: { pdf_url: "/uploads/proposta-uuid.pdf" } },
      },
      {
        id: "fn-send-proposal-wa",
        method: "POST",
        path: "/send-proposal-whatsapp",
        title: "Enviar Proposta por WhatsApp",
        description: "Envia o PDF da proposta para o lead via WhatsApp.",
        auth: true,
        body: [
          { name: "lead_id", type: "string", required: true, description: "ID do lead" },
          { name: "pdf_url", type: "string", required: true, description: "URL do PDF gerado" },
          { name: "message", type: "string", required: false, description: "Mensagem que acompanha o PDF" },
        ],
        response: { status: 200, example: { sent: true, chat_id: "abc123" } },
      },
      {
        id: "fn-ai-assistant",
        method: "POST",
        path: "/ai-assistant",
        title: "Assistente de IA",
        description: "Consulta o assistente OpenAI com contexto do CRM (sugestões de resposta, resumo de atendimentos).",
        auth: true,
        body: [
          { name: "prompt", type: "string", required: true, description: "Pergunta ou instrução" },
          { name: "context", type: "object", required: false, description: "Contexto adicional (ticket, lead, histórico)" },
        ],
        response: { status: 200, example: { response: "Sugestão gerada pelo modelo", tokens_used: 234 } },
      },
      {
        id: "fn-process-call-audit",
        method: "POST",
        path: "/process-call-audit",
        title: "Processar Auditoria de Ligação",
        description:
          "Transcreve áudio de ligação, classifica o atendimento e calcula nota baseada no checklist de QA.",
        auth: true,
        body: [
          { name: "audit_id", type: "string", required: true, description: "ID da auditoria" },
          { name: "audio_url", type: "string", required: true, description: "URL do áudio" },
          { name: "checklist_id", type: "string", required: true, description: "ID do checklist QA" },
        ],
        response: { status: 200, example: { transcription: "...", score: 8.5, items: [] } },
      },
      {
        id: "fn-get-public-contract",
        method: "GET",
        path: "/getPublicContract",
        title: "Contrato Público",
        description: "Endpoint público (sem auth) que retorna dados do contrato para assinatura via token.",
        auth: false,
        query: [{ name: "token", type: "string", required: true, description: "Token único do contrato" }],
        response: {
          status: 200,
          example: { contract_id: "uuid", lead_name: "Maria", document_url: "/uploads/contrato.pdf", status: "pending" },
        },
      },
      {
        id: "fn-sign-contract",
        method: "POST",
        path: "/signContract",
        title: "Assinar Contrato",
        description: "Endpoint público para registrar a assinatura digital do contrato.",
        auth: false,
        body: [
          { name: "token", type: "string", required: true, description: "Token único do contrato" },
          { name: "signature", type: "string", required: true, description: "Assinatura em base64" },
          { name: "ip", type: "string", required: false, description: "IP do assinante (registrado para auditoria)" },
        ],
        response: { status: 200, example: { signed: true, signed_at: "2026-04-28T19:30:00Z" } },
      },
      {
        id: "fn-commission-reconciliation",
        method: "POST",
        path: "/commission-reconciliation/run",
        title: "Reconciliar Comissões",
        description:
          "Roda o processo de reconciliação de comissões, comparando dados internos com o ERP. Restrito a quem tem acesso ao submenu.",
        auth: true,
        response: { status: 200, example: { reconciled: 145, divergences: 3 } },
      },
    ],
  },
  {
    id: "whatsapp",
    title: "WhatsApp",
    icon: MessageCircle,
    overview:
      "Endpoints para integração com a WHU API: templates, envio de mensagens, automações e logs.",
    endpoints: [
      {
        id: "wa-templates",
        method: "GET",
        path: "/whatsapp/templates",
        title: "Listar Templates",
        description: "Lista todos os templates de mensagem disponíveis na WHU.",
        auth: true,
        response: { status: 200, example: { templates: [{ id: "abc", name: "boas_vindas", language: "pt_BR" }] } },
      },
      {
        id: "wa-send",
        method: "POST",
        path: "/whatsapp/send-message",
        title: "Enviar Mensagem",
        description: "Envia mensagem livre ou baseada em template para um número.",
        auth: true,
        body: [
          { name: "phone", type: "string", required: true, description: "Telefone com DDI" },
          { name: "message", type: "string", required: false, description: "Texto livre (se não usar template)" },
          { name: "template_id", type: "string", required: false, description: "ID do template" },
          { name: "variables", type: "object", required: false, description: "Variáveis do template" },
        ],
        response: { status: 200, example: { sent: true, chat_id: "abc123", message_id: "msg_456" } },
      },
      {
        id: "wa-test-send",
        method: "POST",
        path: "/whatsapp/test-send",
        title: "Teste de Envio",
        description: "Envia mensagem de teste para validar a configuração da integração WHU.",
        auth: true,
        body: [
          { name: "phone", type: "string", required: true, description: "Telefone alvo" },
          { name: "channel_token", type: "string", required: false, description: "Token específico do canal (se aplicável)" },
        ],
        response: { status: 200, example: { sent: true } },
      },
      {
        id: "wa-test-connection",
        method: "POST",
        path: "/whatsapp/test-connection",
        title: "Testar Conexão",
        description: "Verifica se o token WHU configurado está ativo e respondendo.",
        auth: true,
        response: { status: 200, example: { connected: true, account: "wescctech" } },
      },
      {
        id: "wa-automation-logs",
        method: "GET",
        path: "/whatsapp/automation-logs",
        title: "Logs de Automação",
        description: "Lista os disparos automáticos de WhatsApp executados pelo scheduler.",
        auth: true,
        query: [
          { name: "automation_id", type: "string", required: false, description: "Filtrar por ID da automação" },
          { name: "from", type: "string", required: false, description: "Data inicial (ISO)" },
          { name: "to", type: "string", required: false, description: "Data final (ISO)" },
        ],
        response: { status: 200, example: { logs: [{ id: "uuid", lead_id: "uuid", status: "sent", sent_at: "..." }] } },
      },
      {
        id: "wa-run-automations",
        method: "POST",
        path: "/whatsapp/run-automations",
        title: "Rodar Automações Manualmente",
        description: "Dispara o ciclo de verificação de automações fora do agendamento normal.",
        auth: true,
        response: { status: 200, example: { executed: true, summary: { lead: 3, referral: 1 } } },
      },
      {
        id: "wa-my-channel",
        method: "GET",
        path: "/whatsapp/my-channel-token",
        title: "Token do Canal do Agente",
        description: "Retorna o token WHU específico do agente autenticado, se houver canal dedicado.",
        auth: true,
        response: { status: 200, example: { channel_token: "abc...", channel_label: "Vendas SP" } },
      },
    ],
  },
  {
    id: "bom-auto",
    title: "Bom Auto",
    icon: Car,
    overview:
      "Módulo especializado para consulta veicular e atendimentos do Bom Auto, integrado ao ERP.",
    endpoints: [
      {
        id: "ba-consulta",
        method: "GET",
        path: "/bom-auto/consulta",
        title: "Consulta Veicular",
        description:
          "Consulta dados de cliente e veículo no ERP Bom Auto. Aceita placa ou documento (CPF/CNPJ).",
        auth: true,
        query: [
          { name: "placa", type: "string", required: false, description: "Placa do veículo" },
          { name: "documento", type: "string", required: false, description: "CPF ou CNPJ" },
        ],
        response: {
          status: 200,
          example: {
            cliente: { nome: "João", documento: "12345678900" },
            veiculos: [{ placa: "ABC1D23", modelo: "Onix", ano: 2022 }],
          },
        },
      },
      {
        id: "ba-utilizacoes",
        method: "GET",
        path: "/bom-auto/utilizacoes/:documento",
        title: "Utilizações por Documento",
        description: "Lista as utilizações do serviço Bom Auto para um cliente.",
        auth: true,
        params: [{ name: "documento", type: "string", required: true, description: "CPF ou CNPJ do cliente" }],
        response: { status: 200, example: { utilizacoes: [{ data: "2026-01-15", servico: "Troca de óleo" }] } },
      },
      {
        id: "ba-atendimentos-create",
        method: "POST",
        path: "/bom-auto/atendimentos",
        title: "Criar Atendimento",
        description: "Cria um registro de atendimento Bom Auto.",
        auth: true,
        body: [
          { name: "cliente_documento", type: "string", required: true, description: "Documento do cliente" },
          { name: "placa", type: "string", required: true, description: "Placa do veículo" },
          { name: "servico", type: "string", required: true, description: "Tipo de serviço prestado" },
          { name: "observacoes", type: "string", required: false, description: "Observações" },
        ],
        response: { status: 201, example: { id: "uuid", created_at: "2026-04-28T..." } },
      },
      {
        id: "ba-atendimentos-list",
        method: "GET",
        path: "/bom-auto/atendimentos",
        title: "Listar Atendimentos",
        description: "Lista atendimentos com filtros opcionais.",
        auth: true,
        query: [
          { name: "atendente_id", type: "string", required: false, description: "ID do atendente" },
          { name: "from", type: "string", required: false, description: "Data inicial (ISO)" },
          { name: "to", type: "string", required: false, description: "Data final (ISO)" },
        ],
        response: { status: 200, example: { atendimentos: [], total: 0 } },
      },
      {
        id: "ba-atendimentos-update",
        method: "PUT",
        path: "/bom-auto/atendimentos/:id",
        title: "Atualizar Atendimento",
        description: "Atualiza campos do atendimento existente.",
        auth: true,
        params: [{ name: "id", type: "string", required: true, description: "ID do atendimento" }],
        body: [{ name: "(campos a atualizar)", type: "object", required: true, description: "Campos do atendimento" }],
        response: { status: 200, example: { id: "uuid", updated_at: "..." } },
      },
      {
        id: "ba-imagens",
        method: "POST",
        path: "/bom-auto/atendimentos/:id/imagens",
        title: "Upload de Imagens",
        description: "Anexa imagens ao atendimento (multipart/form-data, campo 'imagens', até 10 arquivos).",
        auth: true,
        params: [{ name: "id", type: "string", required: true, description: "ID do atendimento" }],
        response: { status: 200, example: { uploaded: 3, urls: ["/uploads/img1.jpg"] } },
      },
      {
        id: "ba-historico",
        method: "GET",
        path: "/bom-auto/atendimentos/:id/historico",
        title: "Histórico do Atendimento",
        description: "Retorna o histórico de mudanças (auditoria) do atendimento.",
        auth: true,
        params: [{ name: "id", type: "string", required: true, description: "ID do atendimento" }],
        response: { status: 200, example: { historico: [{ campo: "status", de: "aberto", para: "concluido", em: "..." }] } },
      },
    ],
  },
  {
    id: "upload",
    title: "Upload de Arquivos",
    icon: UploadIcon,
    overview:
      "Endpoints para upload de arquivos (imagens, PDFs, áudios, vídeos). Use multipart/form-data.",
    endpoints: [
      {
        id: "upload-single",
        method: "POST",
        path: "/upload",
        title: "Upload Único",
        description: "Faz upload de um único arquivo. Campo do form: 'file'. Tamanho máximo: 50MB.",
        auth: true,
        body: [
          { name: "file", type: "file", required: true, description: "Arquivo (multipart/form-data)" },
        ],
        response: {
          status: 200,
          example: { url: "/uploads/abc-123.pdf", filename: "abc-123.pdf", size: 102400, mimetype: "application/pdf" },
        },
      },
      {
        id: "upload-multiple",
        method: "POST",
        path: "/upload/multiple",
        title: "Upload Múltiplo",
        description: "Faz upload de até 10 arquivos. Campo do form: 'files'.",
        auth: true,
        body: [
          { name: "files", type: "file[]", required: true, description: "Lista de arquivos (multipart/form-data)" },
        ],
        response: {
          status: 200,
          example: {
            files: [
              { url: "/uploads/abc-1.jpg", filename: "abc-1.jpg" },
              { url: "/uploads/abc-2.jpg", filename: "abc-2.jpg" },
            ],
          },
        },
      },
    ],
  },
];

function isMultipart(endpoint) {
  return (endpoint.body || []).some((b) => b.type === "file" || b.type === "file[]");
}

export function buildCurlExample(endpoint, baseUrl) {
  const method = endpoint.method;
  const url = `${baseUrl}${endpoint.path}`;
  const headers = [];
  if (endpoint.auth) headers.push(`-H "Authorization: Bearer $TOKEN"`);

  const multipart = isMultipart(endpoint);
  if (!multipart && ["POST", "PUT", "PATCH"].includes(method)) {
    headers.push(`-H "Content-Type: application/json"`);
  }

  let body = "";
  if (endpoint.body && endpoint.body.length > 0) {
    if (multipart) {
      const parts = endpoint.body
        .filter((b) => !b.name.startsWith("("))
        .map((b) =>
          b.type === "file[]"
            ? `-F "${b.name}=@./arquivo1.jpg" -F "${b.name}=@./arquivo2.jpg"`
            : b.type === "file"
            ? `-F "${b.name}=@./arquivo.pdf"`
            : `-F "${b.name}=<${b.name}>"`
        );
      body = ` \\\n  ${parts.join(" \\\n  ")}`;
    } else {
      const obj = {};
      endpoint.body.forEach((b) => {
        if (b.name.startsWith("(")) return;
        obj[b.name] =
          b.type === "string"
            ? `<${b.name}>`
            : b.type === "number"
            ? 0
            : b.type === "string[]"
            ? [`<${b.name}>`]
            : {};
      });
      body = ` \\\n  -d '${JSON.stringify(obj, null, 2)}'`;
    }
  }

  const headerStr = headers.length ? `\n  ${headers.join(" \\\n  ")}` : "";
  return `curl -X ${method} "${url}"${headerStr ? " \\" + headerStr : ""}${body}`;
}

export function buildJsExample(endpoint, baseUrl) {
  const method = endpoint.method;
  const url = `${baseUrl}${endpoint.path}`;
  const headers = {};
  if (endpoint.auth) headers["Authorization"] = "Bearer ${token}";

  const multipart = isMultipart(endpoint);
  if (!multipart && ["POST", "PUT", "PATCH"].includes(method)) {
    headers["Content-Type"] = "application/json";
  }

  let bodyBlock = "";
  let preamble = "";
  if (endpoint.body && endpoint.body.length > 0) {
    if (multipart) {
      const lines = endpoint.body
        .filter((b) => !b.name.startsWith("("))
        .map((b) =>
          b.type === "file[]"
            ? `arquivos.forEach((f) => form.append("${b.name}", f));`
            : b.type === "file"
            ? `form.append("${b.name}", arquivo);`
            : `form.append("${b.name}", <${b.name}>);`
        );
      preamble = `const form = new FormData();\n${lines.join("\n")}\n\n`;
      bodyBlock = `,\n  body: form`;
    } else {
      const obj = {};
      endpoint.body.forEach((b) => {
        if (b.name.startsWith("(")) return;
        obj[b.name] =
          b.type === "string"
            ? `<${b.name}>`
            : b.type === "number"
            ? 0
            : b.type === "string[]"
            ? [`<${b.name}>`]
            : {};
      });
      bodyBlock = `,\n  body: JSON.stringify(${JSON.stringify(obj, null, 2).replace(/\n/g, "\n  ")})`;
    }
  }

  const headersBlock = Object.keys(headers).length
    ? `,\n  headers: ${JSON.stringify(headers, null, 2)
        .replace(/"\$\{token\}"/g, "`Bearer ${token}`")
        .replace(/\n/g, "\n  ")}`
    : "";

  return `${preamble}const res = await fetch("${url}", {\n  method: "${method}"${headersBlock}${bodyBlock}\n});\nconst data = await res.json();`;
}
