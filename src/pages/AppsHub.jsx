import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { isAdminUser } from "@/components/utils/permissions";
import { LayoutGrid, Lock, BookOpen, KeyRound, MessageSquare, Inbox, Activity } from "lucide-react";

export default function AppsHub() {
  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const currentAgent = user?.agent;
  const isAdmin = isAdminUser(user, currentAgent);
  const allowedSubmenus = currentAgent?.allowedSubmenus || [];
  const hasSubmenuRestrictions = allowedSubmenus.length > 0;

  const canSeeApp = (app) => {
    if (!app.requiredSubmenu) return true;
    if (isAdmin) return true;
    if (!hasSubmenuRestrictions) return true;
    return allowedSubmenus.includes(app.requiredSubmenu);
  };

  const allApps = [
    {
      id: "api-docs",
      title: "API Reference",
      description: "Documentação completa da API REST do CRM, com exemplos de requisição e resposta.",
      icon: BookOpen,
      gradient: "from-violet-600 to-indigo-600",
      url: createPageUrl("ApiDocumentation"),
      external: true,
    },
    {
      id: "api-keys",
      title: "API Keys",
      description: "Gerencie chaves de leitura para integração de sistemas externos (Vendas PF, Upsell, Indicações).",
      icon: KeyRound,
      gradient: "from-blue-600 to-cyan-600",
      url: createPageUrl("AdminApiKeys"),
    },
    {
      id: "whatsapp-chat",
      title: "Chat WhatsApp",
      description: "Acompanhe e responda as conversas de WhatsApp em tempo real, no estilo WhatsApp Web, com filtro por status e status de entrega.",
      icon: Inbox,
      gradient: "from-teal-600 to-emerald-600",
      url: createPageUrl("WhatsAppInbox"),
      requiredSubmenu: "WhatsAppChat",
    },
    ...(isAdmin
      ? [
          {
            id: "whatsapp-connections",
            title: "Conexões WhatsApp",
            description: "Gerencie as conexões (canais WHU) do Chat de Atendimento: tokens, webhooks e segredos.",
            icon: MessageSquare,
            gradient: "from-green-600 to-emerald-600",
            url: createPageUrl("AdminWhatsAppConnections"),
          },
          {
            id: "erp-audit",
            title: "Auditoria ERP",
            description: "Registro de todas as chamadas de saída ao ERP (REST e banco), com origem, frequência e erros.",
            icon: Activity,
            gradient: "from-orange-600 to-amber-600",
            url: createPageUrl("ErpAuditLogs"),
          },
        ]
      : []),
  ];

  const apps = allApps.filter(canSeeApp);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-600 p-6 shadow-2xl shadow-violet-500/20">
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent" />
          <div className="relative z-10 flex items-center gap-4">
            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
              <LayoutGrid className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">APPs</h1>
              <p className="text-violet-200 text-sm mt-0.5">
                {apps.length > 0
                  ? `${apps.length} aplicativo(s) disponível(is)`
                  : "Central de aplicativos integrados"}
              </p>
            </div>
          </div>
        </div>

        {apps.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-16 h-16 bg-violet-100 dark:bg-violet-900/30 rounded-2xl flex items-center justify-center">
              <LayoutGrid className="w-8 h-8 text-violet-400" />
            </div>
            <div className="text-center">
              <p className="text-base font-semibold text-gray-700 dark:text-gray-300">Nenhum APP disponível ainda</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Os aplicativos serão adicionados aqui em breve.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {apps.map((app) => (
              <AppCard key={app.id} app={app} user={user} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AppCard({ app, user }) {
  const content = (
    <>
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 bg-gradient-to-br ${app.gradient || 'from-violet-500 to-purple-600'} shadow-sm`}>
        {app.icon ? <app.icon className="w-6 h-6 text-white" /> : <LayoutGrid className="w-6 h-6 text-white" />}
      </div>
      <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{app.title}</h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">{app.description}</p>
      {app.locked && (
        <div className="absolute top-4 right-4">
          <Lock className="w-4 h-4 text-gray-400" />
        </div>
      )}
    </>
  );

  const cardClass = "group relative overflow-hidden rounded-2xl bg-white dark:bg-gray-900 ring-1 ring-gray-200 dark:ring-gray-800 shadow-sm hover:shadow-lg hover:ring-violet-300 dark:hover:ring-violet-700 transition-all duration-200 p-6";

  if (app.url && !app.locked) {
    if (app.external) {
      return (
        <a
          href={app.url}
          target="_blank"
          rel="noopener noreferrer"
          className={`${cardClass} block cursor-pointer`}
        >
          {content}
        </a>
      );
    }
    return (
      <Link to={app.url} className={`${cardClass} block cursor-pointer`}>
        {content}
      </Link>
    );
  }
  return <div className={`${cardClass} ${app.locked ? 'opacity-60' : 'cursor-pointer'}`}>{content}</div>;
}
