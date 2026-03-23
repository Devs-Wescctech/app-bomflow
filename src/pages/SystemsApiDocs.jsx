import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plug, Server, MessageSquare, FileSignature, Building2, AlertTriangle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const apis = [
  {
    name: "ERP Bom Pastor",
    icon: Server,
    status: "Ativa",
    statusColor: "bg-green-100 text-green-800 border-green-200",
    description: "Sistema ERP principal utilizado para gerenciamento de dados de clientes, vendas, contratos e indicações.",
    features: [
      "Busca de base de leads para disparo de WhatsApp",
      "Consulta de dados por CPF do indicador",
      "Validação de conversões do Gerador de Leads",
      "Dados de vendas para ROI e auditoria de comissões",
      "Reconciliação e batch semanal de comissões",
      "Dados de vendas por agente para relatório de comissões",
      "Consulta de veículos e clientes para atendimento Bom Auto",
    ],
    modules: ["Gerador de Leads", "Indicações", "Comissões", "Bom Auto"],
  },
  {
    name: "WHU",
    icon: MessageSquare,
    status: "Ativa",
    statusColor: "bg-green-100 text-green-800 border-green-200",
    description: "Plataforma de comunicação via WhatsApp para envio de mensagens, templates e gerenciamento de contatos.",
    features: [
      "Envio de mensagens via template WhatsApp",
      "Criação de novas conversas WhatsApp",
      "Envio de mensagens de texto simples",
      "Envio de mídia (arquivos e imagens)",
      "Listagem de templates disponíveis",
      "Busca e atualização de contatos",
    ],
    modules: ["Gerador de Leads", "Automações", "Vendas", "Indicações"],
  },
  {
    name: "Autentique",
    icon: FileSignature,
    status: "Ativa",
    statusColor: "bg-green-100 text-green-800 border-green-200",
    description: "Plataforma de assinatura digital de documentos e contratos eletrônicos.",
    features: [
      "Criação de documentos para assinatura digital",
      "Verificação de status de assinatura",
    ],
    modules: ["Vendas PF", "Vendas PJ"],
  },
  {
    name: "CNPJ.ws",
    icon: Building2,
    status: "Ativa",
    statusColor: "bg-green-100 text-green-800 border-green-200",
    description: "Serviço público de consulta de dados cadastrais de empresas pelo CNPJ.",
    features: [
      "Consulta pública de dados de CNPJ",
    ],
    modules: ["Vendas PJ"],
  },
];

const disabledIntegrations = [
  {
    name: "Envio automático de WhatsApp ao cadastrar indicação",
    reason: "Desativado temporariamente para correção de template",
  },
];

export default function SystemsApiDocs() {
  const navigate = useNavigate();

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Plug className="w-6 h-6 text-blue-600" />
            Integrações e APIs
          </h1>
          <p className="text-muted-foreground mt-1">Integrações externas utilizadas pelo sistema</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {apis.map((api) => {
          const Icon = api.icon;
          return (
            <Card key={api.name} className="border shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Icon className="w-5 h-5 text-blue-600" />
                    {api.name}
                  </CardTitle>
                  <Badge variant="outline" className={api.statusColor}>
                    {api.status}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-1">{api.description}</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm font-medium mb-2">Funcionalidades utilizadas:</p>
                  <ul className="space-y-1.5">
                    {api.features.map((feature, i) => (
                      <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                        <span className="text-blue-500 mt-1 shrink-0">•</span>
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="pt-3 border-t">
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Módulos que utilizam:</span>{" "}
                    {api.modules.join(", ")}
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {disabledIntegrations.length > 0 && (
        <Card className="border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20 dark:border-yellow-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-yellow-800 dark:text-yellow-400">
              <AlertTriangle className="w-5 h-5" />
              Integrações temporariamente desativadas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {disabledIntegrations.map((item, i) => (
                <li key={i} className="text-sm">
                  <span className="font-medium text-yellow-900 dark:text-yellow-300">{item.name}</span>
                  <span className="text-yellow-700 dark:text-yellow-500"> — {item.reason}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
