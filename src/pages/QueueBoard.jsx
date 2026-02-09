
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Search, Filter, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import TicketCard from "../components/board/TicketCard";
import StatusColumn from "../components/board/StatusColumn";
import { canViewAll, canViewTeam } from "@/components/utils/permissions";

const statuses = [
  { id: 'novo', label: 'Novo', color: 'blue', count: 0 },
  { id: 'atribuido', label: 'Atribuído', color: 'purple', count: 0 },
  { id: 'em_atendimento', label: 'Em Atendimento', color: 'yellow', count: 0 },
  { id: 'aguardando_cliente', label: 'Aguardando Cliente', color: 'orange', count: 0 },
];

export default function QueueBoard() {
  const [selectedQueue, setSelectedQueue] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const queryClient = useQueryClient();

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

  const { data: tickets = [], isLoading, refetch } = useQuery({
    queryKey: ['tickets'],
    queryFn: async () => {
      const allTickets = await base44.entities.Ticket.list('-createdDate', 500);
      
      // Filtrar por tipo de ticket
      const supportTickets = allTickets.filter(t => {
        const isSupportTicket = t.ticket_type === 'support' || !t.ticket_type;
        const isActive = !['resolvido', 'fechado'].includes(t.status);
        return isSupportTicket && isActive;
      });

      // Admin vê tudo
      if (user?.role === 'admin') {
        return supportTickets;
      }

      if (!currentAgent) return [];

      // Verificar permissões
      const canSeeAll = canViewAll(currentAgent, 'tickets');
      if (canSeeAll) return supportTickets;

      const canSeeTeam = canViewTeam(currentAgent, 'tickets');
      if (canSeeTeam) {
        const teamAgents = agents.filter(a => a.team_id === currentAgent.team_id);
        const teamAgentIds = teamAgents.map(a => a.id);
        
        return supportTickets.filter(t => 
          teamAgentIds.includes(t.agent_id) || 
          teamAgentIds.includes(t.created_by_agent_id)
        );
      }

      // Ver apenas seus tickets
      return supportTickets.filter(t => 
        t.agent_id === currentAgent.id || 
        t.created_by_agent_id === currentAgent.id
      );
    },
    initialData: [],
    refetchInterval: 30000,
  });

  const { data: queues = [] } = useQuery({
    queryKey: ['queues'],
    queryFn: () => base44.entities.Queue.list(),
    initialData: [],
  });

  const updateTicketMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Ticket.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
    },
  });

  const filteredTickets = tickets.filter(ticket => {
    if (selectedQueue !== 'all' && ticket.queue_id !== selectedQueue) return false;
    if (priorityFilter !== 'all' && ticket.priority !== priorityFilter) return false;
    if (searchQuery && !ticket.subject.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const getTicketsByStatus = (status) => {
    return filteredTickets.filter(t => t.status === status);
  };

  const handleStatusChange = (ticketId, newStatus) => {
    updateTicketMutation.mutate({
      id: ticketId,
      data: { status: newStatus }
    });
  };

  const atRiskCount = filteredTickets.filter(t => {
    if (!t.sla_resolution_deadline || t.status === 'resolvido' || t.status === 'fechado') return false;
    const deadline = new Date(t.sla_resolution_deadline);
    const hoursLeft = (deadline - new Date()) / (1000 * 60 * 60);
    return hoursLeft > 0 && hoursLeft < 4;
  }).length;

  const breachedCount = filteredTickets.filter(t => t.sla_breached).length;

  const statusesWithCount = statuses.map(status => ({
    ...status,
    count: getTicketsByStatus(status.id).length
  }));

  const totalActive = filteredTickets.length;

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      {/* Header Fixo */}
      <div className="bg-white dark:bg-gray-900 border-b dark:border-gray-800 px-6 py-4 flex-shrink-0">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Board de Atendimento</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              Tickets em atendimento - Auto-refresh 30s
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isLoading}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
            <Badge className="bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-base px-3 py-1">
              {totalActive} em atendimento
            </Badge>
            {atRiskCount > 0 && (
              <Badge className="bg-orange-100 dark:bg-orange-950 text-orange-700 dark:text-orange-300">
                {atRiskCount} em risco
              </Badge>
            )}
            {breachedCount > 0 && (
              <Badge className="bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300">
                {breachedCount} violados
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white dark:bg-gray-900 border-b dark:border-gray-800 px-6 py-3 flex-shrink-0">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
            <Input
              placeholder="Buscar tickets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
            />
          </div>
          <div className="flex gap-3">
            <Select value={selectedQueue} onValueChange={setSelectedQueue}>
              <SelectTrigger className="w-[180px] bg-gray-50 dark:bg-gray-800">
                <SelectValue placeholder="Todas as filas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as filas</SelectItem>
                {queues.map(queue => (
                  <SelectItem key={queue.id} value={queue.id}>{queue.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-[150px] bg-gray-50 dark:bg-gray-800">
                <SelectValue placeholder="Prioridade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="P1">P1 - Crítica</SelectItem>
                <SelectItem value="P2">P2 - Alta</SelectItem>
                <SelectItem value="P3">P3 - Média</SelectItem>
                <SelectItem value="P4">P4 - Baixa</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-6">
        <div className="flex gap-4 h-full min-w-max">
          {statusesWithCount.map(status => (
            <StatusColumn
              key={status.id}
              status={status}
              tickets={getTicketsByStatus(status.id)}
              onStatusChange={handleStatusChange}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
