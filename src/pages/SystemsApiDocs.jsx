import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plug, AlertTriangle, ArrowLeft, Code, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const apiGroups = [
  {
    group: "ERP Bom Pastor",
    color: "blue",
    apis: [
      {
        name: "API_BASE_LEADS",
        status: "Ativa",
        file: "backend/src/routes/functions.js",
        line: 216,
        usages: [
          { module: "Gerador de Leads", desc: "Busca toda a base de leads do ERP para filtragem, seleção e disparo de campanhas WhatsApp. Fornece os filtros de cidade, UF, produto, situação e tempo ativo de contrato." },
        ],
      },
      {
        name: "API_CPF_INDICADOR",
        status: "Ativa",
        file: "backend/src/routes/functions.js",
        line: 1568,
        usages: [
          { module: "Indicações → Nova Indicação / Busca CPF", desc: "Consulta dados do indicador pelo CPF para validação e preenchimento automático (nome, telefone, endereço). Também usado no Portal do Indicador." },
          { module: "Gerador de Leads → Conversões", desc: "Busca dados do ERP para verificar conversão de leads disparados (cruzamento telefone/CPF).", extraFile: "backend/src/routes/functions.js", extraLine: 1471 },
        ],
      },
      {
        name: "API_DADOS_VENDAS_INDICACOES",
        status: "Ativa",
        file: "backend/src/routes/functions.js",
        line: 823,
        usages: [
          { module: "Gerador de Leads → Métricas ROI", desc: "Busca vendas pagas do ERP para calcular ROI dos disparos (vendas ÷ disparos)." },
          { module: "Gerador de Leads → Auditoria Diária", desc: "Cruza vendas do ERP com disparos do sistema para detectar vendas sem disparo, disparos sem venda, duplicatas e recalcular ROI.", extraFile: "backend/src/routes/functions.js", extraLine: 945 },
          { module: "Comissões → Relatório de Vendas Pagas", desc: "Lista vendas com valores_pagos=SIM para o relatório de comissões e validação de elegibilidade.", extraFile: "backend/src/routes/functions.js", extraLine: 2858 },
          { module: "Comissões → Batch Semanal", desc: "Busca vendas pagas para gerar lotes de pagamento de comissão automaticamente (cron quarta 05h).", extraFile: "backend/src/routes/functions.js", extraLine: 3044 },
        ],
      },
      {
        name: "API_VENDAS_INDICACAO_AGENTES",
        status: "Ativa",
        file: "backend/src/routes/functions.js",
        line: 2763,
        usages: [
          { module: "Indicações → Meu Painel", desc: "Busca vendas de indicação filtradas por erp_agent_id do agente logado para exibir desempenho individual." },
        ],
      },
      {
        name: "API_TESTE_BOM_AUTO",
        status: "Ativa",
        file: "backend/src/routes/bomAuto.js",
        line: 67,
        usages: [
          { module: "Bom Auto → Consulta Veicular", desc: "Busca dados de veículos e clientes no ERP por documento (CPF/CNPJ) ou placa para verificar elegibilidade de serviços." },
        ],
      },
    ],
  },
  {
    group: "WHU (Rudo WhatsApp)",
    color: "green",
    apis: [
      {
        name: "/action-cards/templates",
        status: "Ativa",
        file: "backend/src/services/whatsappService.js",
        line: 10,
        usages: [
          { module: "Automações / Gerador de Leads → Listagem de Templates", desc: "Busca templates WhatsApp disponíveis para seleção em automações e configuração de disparos." },
          { module: "Automações por Canal → Listagem de Templates", desc: "Busca templates usando token de canal customizado (x-channel-token).", extraFile: "backend/src/services/whatsappService.js", extraLine: 31 },
        ],
      },
      {
        name: "/chats/create-new",
        status: "Ativa",
        file: "backend/src/services/whatsappService.js",
        line: 61,
        usages: [
          { module: "Automações → Envio WhatsApp", desc: "Cria nova conversa no WHU quando o contato não existe. Usado como fallback do send-template quando o contato não está cadastrado." },
        ],
      },
      {
        name: "/chats/send-message",
        status: "Ativa",
        file: "backend/src/services/whatsappService.js",
        line: 248,
        usages: [
          { module: "WhatsApp → Envio de Texto Livre", desc: "Envia mensagem de texto livre (não template) para um contato." },
        ],
      },
      {
        name: "/chats/send-media",
        status: "Ativa",
        file: "backend/src/services/whatsappService.js",
        line: 284,
        usages: [
          { module: "WhatsApp → Envio de Documento/Mídia", desc: "Envia arquivos (PDF de proposta, documentos) via WhatsApp." },
        ],
      },
      {
        name: "/chats/send-template",
        status: "Ativa",
        file: "backend/src/services/whatsappService.js",
        line: 98,
        usages: [
          { module: "Automações → Envio de Template WhatsApp", desc: "Envia mensagem baseada em template para leads/indicações (automações de inatividade, follow-up, reengajamento)." },
          { module: "Gerador de Leads → Fila de Disparos", desc: "Envia templates WhatsApp em massa via fila assíncrona com rate limiting (campanhas de disparo).", extraFile: "backend/src/services/whatsappQueueService.js", extraLine: 5 },
          { module: "Vendas → Envio de Proposta por WhatsApp", desc: "Envia proposta comercial como template WhatsApp para o lead.", extraFile: "backend/src/routes/functions.js", extraLine: 1859 },
        ],
      },
      {
        name: "/contacts?phone={phone}",
        status: "Ativa",
        file: "backend/src/services/whatsappService.js",
        line: 314,
        usages: [
          { module: "WhatsApp → Busca de Contato", desc: "Busca contato no WHU pelo telefone para verificar se já existe antes de criar conversa." },
        ],
      },
      {
        name: "/contacts/{id}/set-attributes",
        status: "Ativa",
        file: "backend/src/services/whatsappService.js",
        line: 349,
        usages: [
          { module: "WhatsApp → Atualização de Atributos", desc: "Atualiza atributos do contato no WHU (ex: nome do agente, produto) após envio de mensagem." },
        ],
      },
    ],
  },
  {
    group: "Autentique",
    color: "purple",
    apis: [
      {
        name: "GraphQL — createDocument",
        status: "Ativa",
        file: "backend/src/routes/functions.js",
        line: 2332,
        usages: [
          { module: "Vendas → Assinatura Digital", desc: "Cria documento na Autentique para envio de contrato ao cliente para assinatura eletrônica (via email ou link)." },
        ],
      },
      {
        name: "GraphQL — document(id)",
        status: "Ativa",
        file: "backend/src/routes/functions.js",
        line: 2507,
        usages: [
          { module: "Vendas → Verificação de Assinatura", desc: "Consulta status do documento na Autentique (pendente, assinado, recusado) e baixa o contrato assinado quando finalizado." },
        ],
      },
      {
        name: "GraphQL — documents (test)",
        status: "Ativa",
        file: "backend/src/routes/functions.js",
        line: 2685,
        usages: [
          { module: "Configurações → Teste de Conexão", desc: "Valida que o token Autentique está funcionando listando documentos recentes." },
        ],
      },
    ],
  },
  {
    group: "CNPJ.ws",
    color: "orange",
    apis: [
      {
        name: "publica.cnpj.ws/cnpj/{cnpj}",
        status: "Ativa",
        file: "backend/src/routes/functions.js",
        line: 2016,
        usages: [
          { module: "Vendas PJ → Busca de CNPJ", desc: "Consulta dados públicos de empresa (razão social, endereço, porte, atividade) para preenchimento automático no cadastro de leads PJ." },
        ],
      },
    ],
  },
];

const groupColors = {
  blue: { border: "border-l-blue-500", badge: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700", heading: "text-blue-700 dark:text-blue-400", line: "border-blue-200 dark:border-blue-800", bullet: "text-blue-500" },
  green: { border: "border-l-green-500", badge: "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700", heading: "text-green-700 dark:text-green-400", line: "border-green-200 dark:border-green-800", bullet: "text-green-500" },
  purple: { border: "border-l-purple-500", badge: "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-700", heading: "text-purple-700 dark:text-purple-400", line: "border-purple-200 dark:border-purple-800", bullet: "text-purple-500" },
  orange: { border: "border-l-orange-500", badge: "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-700", heading: "text-orange-700 dark:text-orange-400", line: "border-orange-200 dark:border-orange-800", bullet: "text-orange-500" },
};

export default function SystemsApiDocs() {
  const navigate = useNavigate();

  const totalApis = apiGroups.reduce((sum, g) => sum + g.apis.length, 0);

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Plug className="w-6 h-6 text-blue-600" />
            Integrações e APIs
          </h1>
          <p className="text-muted-foreground mt-1">
            {totalApis} APIs mapeadas em {apiGroups.length} fornecedores
          </p>
        </div>
      </div>

      {apiGroups.map((group) => {
        const colors = groupColors[group.color];
        return (
          <div key={group.group} className="space-y-4">
            <div className={`flex items-center gap-3 border-b-2 ${colors.line} pb-2`}>
              <h2 className={`text-lg font-semibold ${colors.heading}`}>
                {group.group}
              </h2>
              <Badge variant="outline" className={colors.badge}>
                {group.apis.length} {group.apis.length === 1 ? "API" : "APIs"}
              </Badge>
            </div>

            <div className="space-y-3">
              {group.apis.map((api) => (
                <Card key={api.name} className={`border shadow-sm border-l-4 ${colors.border}`}>
                  <CardHeader className="pb-2 pt-4 px-5">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <CardTitle className="text-base font-mono font-semibold flex items-center gap-2">
                        <Code className="w-4 h-4 text-muted-foreground shrink-0" />
                        {api.name}
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={colors.badge}>
                          {group.group.split(" (")[0]}
                        </Badge>
                        <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700">
                          {api.status}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="text-xs font-mono text-muted-foreground">
                        {api.file}:{api.line}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="px-5 pb-4 pt-1">
                    <p className="text-sm font-medium text-muted-foreground mb-2">Onde é usada:</p>
                    <ul className="space-y-2">
                      {api.usages.map((usage, i) => (
                        <li key={i} className="text-sm flex items-start gap-2">
                          <span className={`${colors.bullet} mt-0.5 shrink-0`}>•</span>
                          <div>
                            <span className="font-medium text-foreground">{usage.module}</span>
                            <span className="text-muted-foreground"> — {usage.desc}</span>
                            {usage.extraFile && (
                              <div className="flex items-center gap-1 mt-0.5">
                                <FileText className="w-3 h-3 text-muted-foreground shrink-0" />
                                <span className="text-xs font-mono text-muted-foreground">
                                  {usage.extraFile}:{usage.extraLine}
                                </span>
                              </div>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        );
      })}

      <Card className="border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20 dark:border-yellow-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2 text-yellow-800 dark:text-yellow-400">
            <AlertTriangle className="w-5 h-5" />
            Integrações temporariamente desativadas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm">
            <span className="font-medium text-yellow-900 dark:text-yellow-300">
              executeLeadCreatedAutomation → /chats/send-template (WHU)
            </span>
            <span className="text-yellow-700 dark:text-yellow-500">
              {" "}— Envio automático de WhatsApp ao cadastrar indicação desativado temporariamente para correção de template.
            </span>
            <div className="flex items-center gap-1 mt-1">
              <FileText className="w-3 h-3 text-yellow-600 dark:text-yellow-500 shrink-0" />
              <span className="text-xs font-mono text-yellow-600 dark:text-yellow-500">
                backend/src/routes/entities.js:789
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
