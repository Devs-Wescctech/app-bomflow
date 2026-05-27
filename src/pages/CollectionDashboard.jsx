import { useQuery, useMemo } from "@tanstack/react-query";
import React from "react";
import { base44 } from "@/api/base44Client";
import { canViewAll, canViewTeam } from "@/components/utils/permissions.jsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, Phone, CheckCircle, TrendingUp, Users, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function CollectionDashboard() {
  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: allAgents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: () => base44.entities.Agent.list(),
    initialData: [],
  });

  const currentAgent = user?.agent || allAgents.find(a => a.userEmail === user?.email || a.user_email === user?.email);

  const { data: allTicketsRaw = [] } = useQuery({
    queryKey: ['collectionTickets'],
    queryFn: async () => {
      const t = await base44.entities.Ticket.list('-createdDate', 200);
      return t.filter(t => t.ticket_type === 'collection');
    },
    initialData: [],
  });

  // Filtro de visibilidade por equipe/agente
  const tickets = React.useMemo(() => {
    if (!currentAgent) return allTicketsRaw;
    if (canViewAll(currentAgent, 'tickets')) return allTicketsRaw;
    if (canViewTeam(currentAgent, 'tickets')) {
      const tid = currentAgent.team_id || currentAgent.teamId;
      if (!tid) return allTicketsRaw;
      const teamAgentIds = allAgents.filter(a => String(a.team_id || a.teamId) === String(tid)).map(a => a.id);
      return allTicketsRaw.filter(t => teamAgentIds.includes(t.agent_id) || teamAgentIds.includes(t.created_by_agent_id));
    }
    return allTicketsRaw.filter(t => t.agent_id === currentAgent.id || t.created_by_agent_id === currentAgent.id);
  }, [allTicketsRaw, allAgents, currentAgent]);

  const agents = allAgents;

  const activeTickets = tickets.filter(t => t.status !== 'resolved' && t.status !== 'closed').length;
  const resolvedTickets = tickets.filter(t => t.status === 'resolved' || t.status === 'closed').length;
  
  const totalDebt = tickets.reduce((sum, ticket) => {
    if (ticket.status === 'resolved' || ticket.status === 'closed') return sum;
    const desc = JSON.parse(ticket.description || '{}');
    return sum + (desc.debt_value || 0);
  }, 0);

  const recoveredAmount = tickets.reduce((sum, ticket) => {
    if (ticket.status !== 'resolved' && ticket.status !== 'closed') return sum;
    const desc = JSON.parse(ticket.description || '{}');
    const agreement = desc.agreement;
    return sum + (agreement?.amount || 0);
  }, 0);

  const totalContactAttempts = tickets.reduce((sum, ticket) => {
    const desc = JSON.parse(ticket.description || '{}');
    return sum + (desc.contact_attempts?.length || 0);
  }, 0);

  const recoveryRate = tickets.length > 0 ? ((resolvedTickets / tickets.length) * 100).toFixed(1) : 0;

  const onlineAgents = agents.filter(a => a.online).length;

  const recentTickets = tickets.slice(0, 10);

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-950 min-h-screen">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Dashboard de Cobrança</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Visão geral da inadimplência</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <Card className="relative overflow-hidden border-none shadow-sm hover:shadow-lg transition-all bg-red-50 dark:bg-red-950">
          <div className="absolute top-0 right-0 w-32 h-32 transform translate-x-16 -translate-y-16 bg-gradient-to-br from-red-500 to-red-600 rounded-full opacity-10" />
          <CardHeader className="p-5 relative">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <p className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-2">
                  Total em Débito
                </p>
                <CardTitle className="text-3xl font-bold text-red-600 dark:text-red-400 mb-1">
                  R$ {totalDebt.toFixed(2).replace('.', ',')}
                </CardTitle>
              </div>
              <div className="p-3 rounded-xl bg-gradient-to-br from-red-500 to-red-600 shadow-lg ring-4 ring-red-100 dark:ring-red-900">
                <DollarSign className="w-5 h-5 text-white" />
              </div>
            </div>
          </CardHeader>
        </Card>

        <Card className="relative overflow-hidden border-none shadow-sm hover:shadow-lg transition-all bg-orange-50 dark:bg-orange-950">
          <div className="absolute top-0 right-0 w-32 h-32 transform translate-x-16 -translate-y-16 bg-gradient-to-br from-orange-500 to-orange-600 rounded-full opacity-10" />
          <CardHeader className="p-5 relative">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <p className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-2">
                  Em Cobrança
                </p>
                <CardTitle className="text-3xl font-bold text-orange-600 dark:text-orange-400 mb-1">
                  {activeTickets}
                </CardTitle>
              </div>
              <div className="p-3 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 shadow-lg ring-4 ring-orange-100 dark:ring-orange-900">
                <Clock className="w-5 h-5 text-white" />
              </div>
            </div>
          </CardHeader>
        </Card>

        <Card className="relative overflow-hidden border-none shadow-sm hover:shadow-lg transition-all bg-green-50 dark:bg-green-950">
          <div className="absolute top-0 right-0 w-32 h-32 transform translate-x-16 -translate-y-16 bg-gradient-to-br from-green-500 to-green-600 rounded-full opacity-10" />
          <CardHeader className="p-5 relative">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <p className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-2">
                  Valor Recuperado
                </p>
                <CardTitle className="text-3xl font-bold text-green-600 dark:text-green-400 mb-1">
                  R$ {recoveredAmount.toFixed(2).replace('.', ',')}
                </CardTitle>
              </div>
              <div className="p-3 rounded-xl bg-gradient-to-br from-green-500 to-green-600 shadow-lg ring-4 ring-green-100 dark:ring-green-900">
                <CheckCircle className="w-5 h-5 text-white" />
              </div>
            </div>
          </CardHeader>
        </Card>

        <Card className="relative overflow-hidden border-none shadow-sm hover:shadow-lg transition-all bg-blue-50 dark:bg-blue-950">
          <div className="absolute top-0 right-0 w-32 h-32 transform translate-x-16 -translate-y-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full opacity-10" />
          <CardHeader className="p-5 relative">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <p className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-2">
                  Acordos Feitos
                </p>
                <CardTitle className="text-3xl font-bold text-blue-600 dark:text-blue-400 mb-1">
                  {resolvedTickets}
                </CardTitle>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  Taxa: {recoveryRate}%
                </p>
              </div>
              <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg ring-4 ring-blue-100 dark:ring-blue-900">
                <TrendingUp className="w-5 h-5 text-white" />
              </div>
            </div>
          </CardHeader>
        </Card>

        <Card className="relative overflow-hidden border-none shadow-sm hover:shadow-lg transition-all bg-purple-50 dark:bg-purple-950">
          <div className="absolute top-0 right-0 w-32 h-32 transform translate-x-16 -translate-y-16 bg-gradient-to-br from-purple-500 to-purple-600 rounded-full opacity-10" />
          <CardHeader className="p-5 relative">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <p className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-2">
                  Tentativas de Contato
                </p>
                <CardTitle className="text-3xl font-bold text-purple-600 dark:text-purple-400 mb-1">
                  {totalContactAttempts}
                </CardTitle>
              </div>
              <div className="p-3 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 shadow-lg ring-4 ring-purple-100 dark:ring-purple-900">
                <Phone className="w-5 h-5 text-white" />
              </div>
            </div>
          </CardHeader>
        </Card>

        <Card className="relative overflow-hidden border-none shadow-sm hover:shadow-lg transition-all bg-indigo-50 dark:bg-indigo-950">
          <div className="absolute top-0 right-0 w-32 h-32 transform translate-x-16 -translate-y-16 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-full opacity-10" />
          <CardHeader className="p-5 relative">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <p className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-2">
                  Agentes Online
                </p>
                <CardTitle className="text-3xl font-bold text-indigo-600 dark:text-indigo-400 mb-1">
                  {onlineAgents}
                </CardTitle>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  {agents.length} total
                </p>
              </div>
              <div className="p-3 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 shadow-lg ring-4 ring-indigo-100 dark:ring-indigo-900">
                <Users className="w-5 h-5 text-white" />
              </div>
            </div>
          </CardHeader>
        </Card>
      </div>

      {/* Recent Tickets */}
      <Card className="shadow-sm border-gray-200 dark:border-gray-800">
        <CardHeader className="border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center justify-between">
            <CardTitle className="text-gray-900 dark:text-gray-100">Tickets Recentes de Cobrança</CardTitle>
            <Link 
              to={createPageUrl("CollectionBoard")}
              className="text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 flex items-center gap-1"
            >
              Ver todos
            </Link>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-gray-200 dark:divide-gray-800">
            {recentTickets.map((ticket) => {
              const desc = JSON.parse(ticket.description || '{}');
              const isResolved = ticket.status === 'resolved' || ticket.status === 'closed';
              
              return (
                <Link 
                  key={ticket.id} 
                  to={`${createPageUrl("CollectionTicketView")}?id=${ticket.id}`}
                  className="block hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
                >
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <Badge variant="outline" className="bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 border-red-300 dark:border-red-700 font-semibold text-xs">
                            {ticket.priority}
                          </Badge>
                          <Badge className={
                            isResolved ? 'bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300' :
                            'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300'
                          }>
                            {isResolved ? 'Acordo Feito' : 'Em Cobrança'}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {desc.days_overdue || 0} dias em atraso
                          </Badge>
                        </div>
                        <h4 className="font-semibold text-gray-900 dark:text-gray-100 truncate mb-1">
                          {ticket.subject}
                        </h4>
                        <p className="text-sm font-bold text-red-600 dark:text-red-400">
                          Débito: R$ {(desc.debt_value || 0).toFixed(2).replace('.', ',')}
                        </p>
                      </div>
                      <div className="text-right text-xs text-gray-500 dark:text-gray-400 flex flex-col items-end gap-1">
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {format(new Date(ticket.created_date), "HH:mm", { locale: ptBR })}
                        </div>
                        <div>
                          {format(new Date(ticket.created_date), "dd/MM", { locale: ptBR })}
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
            {recentTickets.length === 0 && (
              <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                Nenhum ticket de cobrança encontrado
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}