import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Bot, 
  MessageSquare, 
  Zap, 
  Settings, 
  ExternalLink,
  Phone,
  Mail,
  Activity,
  Users,
  TrendingUp,
  DollarSign
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function AIAgents() {
  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  // Configuração dos agentes disponíveis
  const agents = [
    {
      name: "assistente_wescc",
      displayName: "Assistente Virtual Wescc",
      description: "Assistente virtual que auxilia no atendimento ao cliente, responde dúvidas sobre planos e cria tickets.",
      icon: MessageSquare,
      color: "blue",
      capabilities: [
        "Atendimento ao cliente 24/7",
        "Responde dúvidas sobre planos",
        "Cria tickets automaticamente",
        "Consulta contratos e dependentes",
        "Suporte a sinistros"
      ],
      integrations: ["WhatsApp", "Webchat"],
      status: "active"
    },
    {
      name: "agente_vendas",
      displayName: "Agente Comercial",
      description: "Especialista em vendas que qualifica leads, apresenta planos e auxilia no fechamento de negócios.",
      icon: TrendingUp,
      color: "green",
      capabilities: [
        "Qualificação de leads",
        "Apresentação de planos",
        "Agendamento de visitas",
        "Envio de propostas",
        "Gestão de follow-ups"
      ],
      integrations: ["WhatsApp", "Email"],
      status: "active"
    },
    {
      name: "agente_cobranca",
      displayName: "Assistente Financeiro",
      description: "Agente especializado em cobrança amigável e negociação de débitos de forma empática.",
      icon: DollarSign,
      color: "red",
      capabilities: [
        "Cobrança empática",
        "Negociação de acordos",
        "Parcelamento de débitos",
        "Ofertas de desconto",
        "Registro de compromissos"
      ],
      integrations: ["WhatsApp"],
      status: "active"
    }
  ];

  const getColorClasses = (color) => {
    const colors = {
      blue: {
        bg: "bg-blue-50 dark:bg-blue-950",
        border: "border-blue-200 dark:border-blue-800",
        icon: "bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400",
        badge: "bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300"
      },
      green: {
        bg: "bg-green-50 dark:bg-green-950",
        border: "border-green-200 dark:border-green-800",
        icon: "bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-400",
        badge: "bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300"
      },
      red: {
        bg: "bg-red-50 dark:bg-red-950",
        border: "border-red-200 dark:border-red-800",
        icon: "bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-400",
        badge: "bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300"
      }
    };
    return colors[color] || colors.blue;
  };

  const handleConnectWhatsApp = (agentName) => {
    const whatsappUrl = base44.agents.getWhatsAppConnectURL(agentName);
    window.open(whatsappUrl, '_blank');
  };

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-950 min-h-screen">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Agentes de IA</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-2">
          <Bot className="w-4 h-4" />
          Assistentes virtuais inteligentes para automatizar seu atendimento
        </p>
      </div>

      <Alert className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
        <Zap className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        <AlertDescription className="text-blue-800 dark:text-blue-300">
          <strong>Agentes de IA disponíveis!</strong> Seus assistentes virtuais estão prontos para usar. 
          Conecte-os ao WhatsApp e comece a automatizar seu atendimento agora mesmo.
        </AlertDescription>
      </Alert>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {agents.map((agent) => {
          const colors = getColorClasses(agent.color);
          const Icon = agent.icon;

          return (
            <Card key={agent.name} className={`border ${colors.border} hover:shadow-lg transition-all`}>
              <CardHeader className={`${colors.bg} border-b ${colors.border}`}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-xl ${colors.icon} flex items-center justify-center`}>
                      <Icon className="w-6 h-6" />
                    </div>
                    <div>
                      <CardTitle className="text-lg text-gray-900 dark:text-gray-100">
                        {agent.displayName}
                      </CardTitle>
                      <Badge className={`${colors.badge} mt-1 text-xs`}>
                        {agent.status === 'active' ? '🟢 Ativo' : '⚪ Inativo'}
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {agent.description}
                </p>

                <div>
                  <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Capacidades:
                  </p>
                  <ul className="space-y-1">
                    {agent.capabilities.map((cap, idx) => (
                      <li key={idx} className="text-xs text-gray-600 dark:text-gray-400 flex items-start gap-2">
                        <span className="text-green-500 mt-0.5">✓</span>
                        <span>{cap}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Integrações:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {agent.integrations.map((integration) => (
                      <Badge key={integration} variant="outline" className="text-xs bg-white dark:bg-gray-800">
                        {integration}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-200 dark:border-gray-700 space-y-2">
                  <Button
                    onClick={() => handleConnectWhatsApp(agent.name)}
                    className={`w-full ${
                      agent.color === 'green' ? 'bg-green-600 hover:bg-green-700' :
                      agent.color === 'red' ? 'bg-red-600 hover:bg-red-700' :
                      'bg-blue-600 hover:bg-blue-700'
                    }`}
                  >
                    <Phone className="w-4 h-4 mr-2" />
                    Conectar WhatsApp
                  </Button>
                  
                  <a
                    href={`https://app.base44.io/dashboard/agents/${agent.name}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                  >
                    <Button variant="outline" className="w-full">
                      <Settings className="w-4 h-4 mr-2" />
                      Configurar Agente
                      <ExternalLink className="w-3 h-3 ml-2" />
                    </Button>
                  </a>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Guia de Uso */}
      <Card className="border-gray-200 dark:border-gray-800">
        <CardHeader className="border-b border-gray-200 dark:border-gray-800">
          <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
            <Activity className="w-5 h-5" />
            Como usar os Agentes de IA
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-2">
                  <span className="w-6 h-6 bg-blue-100 dark:bg-blue-950 rounded-full flex items-center justify-center text-blue-600 dark:text-blue-400 text-sm">1</span>
                  Conectar ao WhatsApp
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 ml-8">
                  Clique em "Conectar WhatsApp" em qualquer agente. Você será redirecionado para fazer login 
                  e autorizar a integração. Após conectar, o agente estará disponível no WhatsApp.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-2">
                  <span className="w-6 h-6 bg-blue-100 dark:bg-blue-950 rounded-full flex items-center justify-center text-blue-600 dark:text-blue-400 text-sm">2</span>
                  Enviar número para clientes
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 ml-8">
                  Após conectar, você receberá um número de WhatsApp. Compartilhe esse número com seus clientes 
                  para que eles possam conversar com o agente de IA.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-2">
                  <span className="w-6 h-6 bg-blue-100 dark:bg-blue-950 rounded-full flex items-center justify-center text-blue-600 dark:text-blue-400 text-sm">3</span>
                  Monitorar conversas
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 ml-8">
                  Acesse o dashboard de cada agente para ver todas as conversas, métricas de desempenho 
                  e histórico de interações.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-2">
                  <span className="w-6 h-6 bg-green-100 dark:bg-green-950 rounded-full flex items-center justify-center text-green-600 dark:text-green-400 text-sm">4</span>
                  Personalizar instruções
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 ml-8">
                  Clique em "Configurar Agente" para personalizar as instruções, adicionar informações 
                  específicas da sua empresa e ajustar o comportamento do agente.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-2">
                  <span className="w-6 h-6 bg-green-100 dark:bg-green-950 rounded-full flex items-center justify-center text-green-600 dark:text-green-400 text-sm">5</span>
                  Intervenção humana
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 ml-8">
                  Os agentes podem criar tickets automaticamente quando não conseguem resolver algo. 
                  Sua equipe pode assumir a conversa a qualquer momento.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-2">
                  <span className="w-6 h-6 bg-green-100 dark:bg-green-950 rounded-full flex items-center justify-center text-green-600 dark:text-green-400 text-sm">6</span>
                  Análise e melhoria
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 ml-8">
                  Use as métricas do dashboard para entender como os agentes estão performando e 
                  fazer ajustes contínuos para melhorar o atendimento.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Benefícios */}
      <div className="grid md:grid-cols-3 gap-4">
        <Card className="border-gray-200 dark:border-gray-800">
          <CardContent className="pt-6 text-center">
            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-950 rounded-full flex items-center justify-center mx-auto mb-3">
              <Zap className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Atendimento 24/7
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Seus clientes podem ser atendidos a qualquer hora, inclusive fora do horário comercial
            </p>
          </CardContent>
        </Card>

        <Card className="border-gray-200 dark:border-gray-800">
          <CardContent className="pt-6 text-center">
            <div className="w-12 h-12 bg-green-100 dark:bg-green-950 rounded-full flex items-center justify-center mx-auto mb-3">
              <TrendingUp className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Aumento de Vendas
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Qualifique leads automaticamente e aumente a taxa de conversão
            </p>
          </CardContent>
        </Card>

        <Card className="border-gray-200 dark:border-gray-800">
          <CardContent className="pt-6 text-center">
            <div className="w-12 h-12 bg-purple-100 dark:bg-purple-950 rounded-full flex items-center justify-center mx-auto mb-3">
              <Users className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Equipe Escalável
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Atenda mais clientes sem precisar contratar mais pessoas
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}