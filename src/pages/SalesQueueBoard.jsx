
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Search, Filter, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const statuses = [
  { id: 'novo', label: 'Novo', color: 'blue', count: 0 },
  { id: 'atribuido', label: 'Atribuído', color: 'purple', count: 0 },
  { id: 'em_atendimento', label: 'Em Atendimento', color: 'yellow', count: 0 },
  { id: 'aguardando_cliente', label: 'Aguardando Cliente', color: 'orange', count: 0 },
  { id: 'resolvido', label: 'Resolvido', color: 'green', count: 0 },
];

const priorityColors = {
  P1: "bg-red-100 text-red-700 border-red-300",
  P2: "bg-orange-100 text-orange-700 border-orange-300",
  P3: "bg-blue-100 text-blue-700 border-blue-300",
  P4: "bg-gray-100 text-gray-700 border-gray-300",
};

const colorClasses = {
  blue: {
    bg: "bg-blue-500",
    header: "bg-gradient-to-r from-blue-500 to-blue-600",
  },
  purple: {
    bg: "bg-purple-500",
    header: "bg-gradient-to-r from-purple-500 to-purple-600",
  },
  yellow: {
    bg: "bg-yellow-500",
    header: "bg-gradient-to-r from-yellow-500 to-yellow-600",
  },
  orange: {
    bg: "bg-orange-500",
    header: "bg-gradient-to-r from-orange-500 to-orange-600",
  },
  green: {
    bg: "bg-green-500",
    header: "bg-gradient-to-r from-green-500 to-green-600",
  },
};

function StatusColumn({ status, tickets, onStatusChange, currentUserId }) {
  const colors = colorClasses[status.color];

  return (
    <div className="w-80 flex-shrink-0 flex flex-col h-full">
      <Card className="flex flex-col h-full shadow-sm border-gray-200">
        <div className={`pb-3 pt-3 px-4 ${colors.header} text-white rounded-t-lg`}>
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold">{status.label}</h3>
            <Badge variant="secondary" className="bg-white/20 text-white font-semibold backdrop-blur-sm">
              {status.count || tickets.length}
            </Badge>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto space-y-3 p-3 bg-gray-50">
          {tickets.map(ticket => (
            <TicketCard 
              key={ticket.id} 
              ticket={ticket}
              onStatusChange={onStatusChange}
              currentUserId={currentUserId}
            />
          ))}
          {tickets.length === 0 && (
            <div className="text-center py-12 text-gray-400 text-sm">
              <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-gray-200 flex items-center justify-center">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                </svg>
              </div>
              <p>Nenhum ticket</p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function TicketCard({ ticket, onStatusChange, currentUserId }) {
  const queryClient = useQueryClient();

  const assignToMeMutation = useMutation({
    mutationFn: async () => {
      await base44.entities.Ticket.update(ticket.id, {
        agent_id: currentUserId,
        status: 'em_atendimento'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['salesTickets'] });
    },
  });

  const handleAssignToMe = (e) => {
    e.preventDefault();
    e.stopPropagation();
    assignToMeMutation.mutate();
  };

  const isUnassigned = !ticket.agent_id;
  const isAssignedToMe = ticket.agent_id === currentUserId;

  return (
    <Link to={`${createPageUrl("SalesTicketView")}?id=${ticket.id}`}>
      <div className="p-3 border rounded-lg hover:shadow-md transition-all cursor-pointer bg-white border-gray-200 hover:ring-2 hover:ring-blue-500/50">
        <div className="flex items-start justify-between gap-2 mb-2">
          <Badge variant="outline" className={`${priorityColors[ticket.priority]} border font-semibold text-xs`}>
            {ticket.priority}
          </Badge>
          <Badge className={
            ticket.category === 'pre_sales' ? 'bg-blue-100 text-blue-700' :
            ticket.category === 'post_sales' ? 'bg-purple-100 text-purple-700' :
            'bg-green-100 text-green-700'
          }>
            {ticket.category === 'pre_sales' ? 'Pré' : ticket.category === 'post_sales' ? 'Pós' : 'OK'}
          </Badge>
        </div>
        
        <h4 className="font-semibold text-gray-900 text-sm mb-1 line-clamp-2">
          {ticket.subject}
        </h4>

        <div className="flex items-center justify-between text-xs text-gray-500 mt-2">
          <div className="flex items-center gap-1">
            {format(new Date(ticket.created_date), "dd/MM HH:mm", { locale: ptBR })}
          </div>
          {isUnassigned && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleAssignToMe}
              disabled={assignToMeMutation.isPending}
              className="h-6 text-xs"
            >
              {assignToMeMutation.isPending ? 'Assumindo...' : 'Assumir'}
            </Button>
          )}
          {isAssignedToMe && (
            <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700">
              Seu
            </Badge>
          )}
        </div>
      </div>
    </Link>
  );
}

export default function SalesQueueBoard() {
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
    queryKey: ['salesTickets'],
    queryFn: async () => {
      const allTickets = await base44.entities.Ticket.list('-createdDate', 200);
      return allTickets.filter(t => t.ticket_type === 'sales');
    },
    initialData: [],
  });

  const { data: queues = [] } = useQuery({
    queryKey: ['queues'],
    queryFn: () => base44.entities.Queue.list(),
    initialData: [],
  });

  const updateTicketMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Ticket.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['salesTickets'] });
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

  const statusesWithCount = statuses.map(status => ({
    ...status,
    count: getTicketsByStatus(status.id).length
  }));

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header Fixo */}
      <div className="bg-white border-b px-6 py-4 flex-shrink-0">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Board de Pré e Pós Vendas</h1>
            <p className="text-gray-500 mt-1">Gestão visual de tickets de vendas</p>
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
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white border-b px-6 py-3 flex-shrink-0">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Buscar tickets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-gray-50 border-gray-200"
            />
          </div>
          <div className="flex gap-3">
            <Select value={selectedQueue} onValueChange={setSelectedQueue}>
              <SelectTrigger className="w-[180px] bg-gray-50">
                <SelectValue placeholder="Todas as filas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as filas</SelectItem>
                {queues.filter(q => q.name.toLowerCase().includes('venda')).map(queue => (
                  <SelectItem key={queue.id} value={queue.id}>{queue.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-[150px] bg-gray-50">
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
              currentUserId={currentAgent?.id}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
