
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { canViewAll, canViewTeam } from "@/components/utils/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Clock, AlertTriangle, CheckCircle2, Activity } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const priorityColors = {
  P1: "bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 border-red-300 dark:border-red-700",
  P2: "bg-orange-100 dark:bg-orange-950 text-orange-700 dark:text-orange-300 border-orange-300 dark:border-orange-700",
  P3: "bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700",
  P4: "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-700",
};

export default function MyTickets() {
  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: agents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: () => base44.entities.Agent.list(),
    initialData: [],
  });

  const currentAgent = agents.find(a => a.user_email === user?.email);

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ['tickets'],
    queryFn: async () => {
      const allTickets = await base44.entities.Ticket.list('-createdDate', 500);
      
      // Admin ou user.role === 'admin' vê tudo
      if (user?.role === 'admin') {
        return allTickets.filter(t => t.ticket_type === 'support' || !t.ticket_type);
      }

      if (!currentAgent) return [];

      // Verificar permissões do agente
      const canSeeAll = canViewAll(currentAgent, 'tickets');
      if (canSeeAll) {
        return allTickets.filter(t => t.ticket_type === 'support' || !t.ticket_type);
      }

      const canSeeTeam = canViewTeam(currentAgent, 'tickets');
      if (canSeeTeam) {
        // Buscar agentes do mesmo time
        const teamAgents = agents.filter(a => a.team_id === currentAgent.team_id);
        const teamAgentIds = teamAgents.map(a => a.id);
        
        return allTickets.filter(t => {
          const isSupportTicket = t.ticket_type === 'support' || !t.ticket_type;
          return isSupportTicket && (
            teamAgentIds.includes(t.agent_id) || 
            teamAgentIds.includes(t.created_by_agent_id)
          );
        });
      }

      // Ver apenas seus próprios tickets
      return allTickets.filter(t => {
        const isSupportTicket = t.ticket_type === 'support' || !t.ticket_type;
        return isSupportTicket && (
          t.agent_id === currentAgent.id || 
          t.created_by_agent_id === currentAgent.id
        );
      });
    },
    initialData: [],
  });

  const activeTickets = tickets.filter(t => ['new', 'assigned', 'in_progress'].includes(t.status));
  const waitingTickets = tickets.filter(t => t.status === 'waiting_customer' || t.status === 'waiting_third_party');
  const resolvedTickets = tickets.filter(t => t.status === 'resolved' || t.status === 'closed');

  const atRiskTickets = activeTickets.filter(t => {
    if (!t.sla_resolution_deadline) return false;
    const deadline = new Date(t.sla_resolution_deadline);
    const hoursLeft = (deadline - new Date()) / (1000 * 60 * 60);
    return hoursLeft > 0 && hoursLeft < 4;
  });

  const renderTicketList = (ticketList) => (
    <div className="space-y-3">
      {ticketList.map(ticket => {
        const isAtRisk = ticket.sla_resolution_deadline && 
          new Date(ticket.sla_resolution_deadline) < new Date(Date.now() + 4 * 60 * 60 * 1000);
        
        // Extrair título formatado
        const getDisplayTitle = () => {
          if (ticket.subject.includes(' - ')) {
            return ticket.subject;
          }
          return ticket.subject;
        };
        
        return (
          <Link 
            key={ticket.id}
            to={`${createPageUrl("TicketView")}?id=${ticket.id}`}
          >
            <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:shadow-lg hover:border-blue-500 dark:hover:border-blue-600 transition-all bg-white dark:bg-gray-800 cursor-pointer">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <Badge variant="outline" className={`${priorityColors[ticket.priority]} border font-semibold text-xs`}>
                      {ticket.priority}
                    </Badge>
                    {isAtRisk && (
                      <Badge className="bg-orange-100 dark:bg-orange-950 text-orange-700 dark:text-orange-300">
                        <AlertTriangle className="w-3 h-3 mr-1" />
                        Em risco
                      </Badge>
                    )}
                    {ticket.sla_breached && (
                      <Badge className="bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300">
                        <AlertTriangle className="w-3 h-3 mr-1" />
                        Violado
                      </Badge>
                    )}
                  </div>
                  <h4 className="font-semibold text-gray-900 dark:text-gray-100 truncate mb-1">
                    {getDisplayTitle()}
                  </h4>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {ticket.category || 'Sem categoria'} • {ticket.channel}
                  </p>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
                    <Clock className="w-4 h-4" />
                    {format(new Date(ticket.created_date), "dd/MM HH:mm", { locale: ptBR })}
                  </div>
                  {ticket.sla_resolution_deadline && (
                    <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                      Vence: {format(new Date(ticket.sla_resolution_deadline), "dd/MM HH:mm", { locale: ptBR })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Link>
        );
      })}
      {ticketList.length === 0 && (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
          <p>Nenhum ticket nesta categoria</p>
        </div>
      )}
    </div>
  );

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-950 min-h-screen">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Meus Tickets</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-2">
          <Activity className="w-4 h-4" />
          Gerencie seus tickets atribuídos
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:shadow-lg transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Ativos</p>
                <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{activeTickets.length}</p>
              </div>
              <div className="p-3 bg-blue-100 dark:bg-blue-950 rounded-xl">
                <Clock className="w-8 h-8 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:shadow-lg transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Em Risco</p>
                <p className="text-3xl font-bold text-orange-600 dark:text-orange-400">{atRiskTickets.length}</p>
              </div>
              <div className="p-3 bg-orange-100 dark:bg-orange-950 rounded-xl">
                <AlertTriangle className="w-8 h-8 text-orange-600 dark:text-orange-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:shadow-lg transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Aguardando</p>
                <p className="text-3xl font-bold text-purple-600 dark:text-purple-400">{waitingTickets.length}</p>
              </div>
              <div className="p-3 bg-purple-100 dark:bg-purple-950 rounded-xl">
                <Clock className="w-8 h-8 text-purple-600 dark:text-purple-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:shadow-lg transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Resolvidos</p>
                <p className="text-3xl font-bold text-green-600 dark:text-green-400">{resolvedTickets.length}</p>
              </div>
              <div className="p-3 bg-green-100 dark:bg-green-950 rounded-xl">
                <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm">
        <CardHeader className="border-b border-gray-200 dark:border-gray-800">
          <CardTitle className="text-gray-900 dark:text-gray-100">Tickets</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <Tabs defaultValue="active">
            <TabsList className="mb-4 bg-gray-100 dark:bg-gray-800">
              <TabsTrigger value="active" className="data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700">
                Ativos ({activeTickets.length})
              </TabsTrigger>
              <TabsTrigger value="waiting" className="data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700">
                Aguardando ({waitingTickets.length})
              </TabsTrigger>
              <TabsTrigger value="resolved" className="data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700">
                Resolvidos ({resolvedTickets.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="active">
              {renderTicketList(activeTickets)}
            </TabsContent>

            <TabsContent value="waiting">
              {renderTicketList(waitingTickets)}
            </TabsContent>

            <TabsContent value="resolved">
              {renderTicketList(resolvedTickets)}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
