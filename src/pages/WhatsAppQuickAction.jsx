import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UserPlus, Headphones, DollarSign, ChevronRight, Loader2, AlertCircle, Shield } from "lucide-react";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useQuery } from "@tanstack/react-query";

export default function WhatsAppQuickAction() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  const phoneFromWhatsApp = searchParams.get('phone') || '';
  const nameFromWhatsApp = searchParams.get('name') || '';
  const token = searchParams.get('token');

  const [validating, setValidating] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [agent, setAgent] = useState(null);
  const [error, setError] = useState("");

  // Buscar usuário atual (se logado)
  const { data: user, isLoading: loadingUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
    retry: false,
    enabled: !token, // Só busca user se NÃO tem token (acesso direto)
  });

  // Buscar todos os agentes
  const { data: allAgents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: () => base44.entities.Agent.list(),
    initialData: [],
    enabled: !token && !!user, // Só busca se NÃO tem token e tem user
  });

  useEffect(() => {
    if (token) {
      // Fluxo com token WhatsApp (acesso externo)
      validateToken();
    } else {
      // Fluxo direto (usuário logado)
      validateDirectAccess();
    }
  }, [token, user, allAgents]);

  const validateToken = async () => {
    try {
      console.log('🔍 Validando token WhatsApp...');
      
      const response = await base44.functions.invoke('validateWhatsAppToken', { token });
      
      if (!response.data.success) {
        setError(response.data.error || 'Token inválido');
        setValidating(false);
        return;
      }

      console.log('✅ Token válido, agente:', response.data.agent.name);
      
      setAgent(response.data.agent);
      setAuthenticated(true);
      setValidating(false);
    } catch (err) {
      console.error('❌ Erro ao validar token:', err);
      setError('Erro ao validar acesso. Token inválido ou expirado.');
      setValidating(false);
    }
  };

  const validateDirectAccess = async () => {
    if (loadingUser) {
      return; // Aguarda carregar user
    }

    if (!user) {
      // Não está logado, redireciona para login
      console.log('🔐 Usuário não logado, redirecionando...');
      base44.auth.redirectToLogin(window.location.pathname + window.location.search);
      return;
    }

    // Usuário está logado, busca o agente
    console.log('👤 Usuário logado:', user.email);
    
    const currentAgent = allAgents.find(a => a.user_email === user.email);
    
    if (!currentAgent) {
      setError('Você não possui um cadastro de agente. Entre em contato com o administrador.');
      setValidating(false);
      return;
    }

    console.log('✅ Agente encontrado:', currentAgent.name);
    setAgent(currentAgent);
    setAuthenticated(true);
    setValidating(false);
  };

  if (validating || loadingUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-950 dark:to-gray-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-12 text-center">
            <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400">
              {token ? 'Validando acesso...' : 'Carregando...'}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-950 dark:to-gray-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-12">
            <Alert variant="destructive">
              <AlertCircle className="w-5 h-5" />
              <AlertDescription className="text-base">
                {error}
              </AlertDescription>
            </Alert>
            <div className="mt-6 text-center">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Entre em contato com o suporte para obter acesso
              </p>
              <Button onClick={() => navigate(createPageUrl("Dashboard"))}>
                Voltar ao Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Montar URLs das ações
  const baseParams = new URLSearchParams();
  if (phoneFromWhatsApp) baseParams.set('phone', phoneFromWhatsApp);
  if (nameFromWhatsApp) baseParams.set('name', nameFromWhatsApp);
  if (token) baseParams.set('token', token);

  const actions = [
    {
      id: 'lead',
      title: 'Criar Lead',
      description: 'Cadastrar novo prospecto',
      icon: UserPlus,
      color: 'bg-gradient-to-br from-green-500 to-green-600',
      url: `${createPageUrl("WhatsAppQuickLead")}?${baseParams.toString()}`
    },
    {
      id: 'ticket',
      title: 'Criar Atendimento',
      description: 'Abrir ticket de suporte',
      icon: Headphones,
      color: 'bg-gradient-to-br from-blue-500 to-blue-600',
      url: `${createPageUrl("WhatsAppQuickTicket")}?${baseParams.toString()}`
    },
    {
      id: 'collection',
      title: 'Criar Cobrança',
      description: 'Registrar cobrança',
      icon: DollarSign,
      color: 'bg-gradient-to-br from-red-500 to-red-600',
      url: `${createPageUrl("WhatsAppQuickCollection")}?${baseParams.toString()}`
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-950 dark:to-gray-900 p-4">
      <div className="max-w-md mx-auto space-y-4">
        {/* Header com info do agente */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center mx-auto mb-3 shadow-lg">
            <span className="text-3xl">💬</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Ação Rápida</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            {token ? 'Registre rapidamente do WhatsApp' : 'Registre uma ação rápida'}
          </p>
          
          {/* Info do agente autenticado */}
          {agent && (
            <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-green-50 dark:bg-green-950 rounded-full border border-green-200 dark:border-green-800">
              {agent.photo_url ? (
                <img 
                  src={agent.photo_url} 
                  alt={agent.name}
                  className="w-6 h-6 rounded-full object-cover"
                />
              ) : (
                <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                  <span className="text-white text-xs font-semibold">
                    {agent.name.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              <span className="text-sm text-green-700 dark:text-green-300 font-medium">
                {agent.name}
              </span>
              <Shield className="w-4 h-4 text-green-600 dark:text-green-400" />
            </div>
          )}

          {phoneFromWhatsApp && (
            <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 bg-blue-50 dark:bg-blue-950 rounded-full">
              <span className="text-xs text-blue-700 dark:text-blue-300">
                📱 {phoneFromWhatsApp}
              </span>
            </div>
          )}

          {!token && (
            <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 bg-blue-50 dark:bg-blue-950 rounded-full">
              <span className="text-xs text-blue-700 dark:text-blue-300">
                ✅ Acesso direto via sistema
              </span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="space-y-3">
          {actions.map(action => (
            <Card 
              key={action.id}
              className="border-2 hover:border-gray-300 dark:hover:border-gray-600 transition-all cursor-pointer hover:shadow-lg"
              onClick={() => navigate(action.url)}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className={`${action.color} w-14 h-14 rounded-xl flex items-center justify-center shadow-md flex-shrink-0`}>
                    <action.icon className="w-7 h-7 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-gray-900 dark:text-gray-100 text-lg">
                      {action.title}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {action.description}
                    </p>
                  </div>
                  <ChevronRight className="w-6 h-6 text-gray-400 flex-shrink-0" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Footer */}
        <div className="text-center pt-4">
          <div className="flex items-center justify-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <Shield className="w-3 h-3" />
            <span>{token ? 'Acesso seguro via token' : 'Acesso autenticado'}</span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Wescctech CRM • Quick Actions
          </p>
        </div>
      </div>
    </div>
  );
}