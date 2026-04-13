import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { 
  Search, 
  Filter, 
  Download, 
  Clock, 
  CheckCircle, 
  Activity,
  AlertTriangle,
  Calendar,
  User,
  RefreshCw
} from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

const priorityColors = {
  P1: "bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 border-red-300 dark:border-red-700",
  P2: "bg-orange-100 dark:bg-orange-950 text-orange-700 dark:text-orange-300 border-orange-300 dark:border-orange-700",
  P3: "bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700",
  P4: "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-700",
};

const statusLabels = {
  novo: 'Novo',
  atribuido: 'Atribuído',
  em_atendimento: 'Em Atendimento',
  aguardando_cliente: 'Aguardando Cliente',
  aguardando_terceiro: 'Aguardando Terceiro',
  resolvido: 'Resolvido',
  fechado: 'Fechado',
};

export default function TicketControl() {
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [queueFilter, setQueueFilter] = useState('all');
  const [agentFilter, setAgentFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all'); // today, week, month, all
  const [activeTab, setActiveTab] = useState('active');

  const { data: allTickets = [], isLoading, refetch } = useQuery({
    queryKey: ['allTickets'],
    queryFn: async () => {
      const tickets = await base44.entities.Ticket.list('-createdDate', 1000);
      return tickets.filter(t => t.ticket_type === 'support' || !t.ticket_type);
    },
    initialData: [],
  });

  const { data: queues = [] } = useQuery({
    queryKey: ['queues'],
    queryFn: () => base44.entities.Queue.list(),
    initialData: [],
  });

  const { data: agents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: () => base44.entities.Agent.list(),
    initialData: [],
  });

  // Separar tickets ativos e finalizados
  const activeTickets = allTickets.filter(t => !['resolvido', 'fechado'].includes(t.status));
  const completedTickets = allTickets.filter(t => ['resolvido', 'fechado'].includes(t.status));

  // Aplicar filtros
  const applyFilters = (tickets) => {
    return tickets.filter(ticket => {
      // Busca
      if (searchQuery && !ticket.subject.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      
      // Prioridade
      if (priorityFilter !== 'all' && ticket.priority !== priorityFilter) return false;
      
      // Fila
      if (queueFilter !== 'all' && ticket.queue_id !== queueFilter) return false;
      
      // Agente
      if (agentFilter !== 'all' && ticket.agent_id !== agentFilter) return false;
      
      // Data
      if (dateFilter !== 'all') {
        const ticketDate = new Date(ticket.created_date);
        const now = new Date();
        const diffDays = Math.floor((now - ticketDate) / (1000 * 60 * 60 * 24));
        
        if (dateFilter === 'today' && diffDays > 0) return false;
        if (dateFilter === 'week' && diffDays > 7) return false;
        if (dateFilter === 'month' && diffDays > 30) return false;
      }
      
      return true;
    });
  };

  const filteredActiveTickets = applyFilters(activeTickets);
  const filteredCompletedTickets = applyFilters(completedTickets);

  // Estatísticas
  const stats = {
    total: allTickets.length,
    active: activeTickets.length,
    completed: completedTickets.length,
    atRisk: activeTickets.filter(t => {
      if (!t.sla_resolution_deadline) return false;
      const deadline = new Date(t.sla_resolution_deadline);
      const hoursLeft = (deadline - new Date()) / (1000 * 60 * 60);
      return hoursLeft > 0 && hoursLeft < 4;
    }).length,
    breached: activeTickets.filter(t => t.sla_breached).length,
    today: allTickets.filter(t => {
      const created = new Date(t.created_date);
      return created.toDateString() === new Date().toDateString();
    }).length,
  };

  const handleExport = (tickets) => {
    try {
      const csv = [
        ['ID', 'Assunto', 'Status', 'Prioridade', 'Criado em', 'Resolvido em', 'Tempo de Resolução'].join(','),
        ...tickets.map(t => [
          t.id.slice(0, 8),
          `"${t.subject}"`,
          statusLabels[t.status],
          t.priority,
          format(new Date(t.created_date), 'dd/MM/yyyy HH:mm'),
          t.resolved_at ? format(new Date(t.resolved_at), 'dd/MM/yyyy HH:mm') : '-',
          t.time_to_resolution ? `${Math.floor(t.time_to_resolution / 60)}h` : '-'
        ].join(','))
      ].join('\n');

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `tickets-${activeTab}-${format(new Date(), 'yyyy-MM-dd')}.csv`;
      link.click();
      
      toast.success('Relatório exportado com sucesso!');
    } catch (error) {
      toast.error('Erro ao exportar relatório');
      console.error(error);
    }
  };

  const renderTicketRow = (ticket) => {
    const isAtRisk = ticket.sla_resolution_deadline && 
      new Date(ticket.sla_resolution_deadline) < new Date(Date.now() + 4 * 60 * 60 * 1000) &&
      ticket.status !== 'resolvido' && ticket.status !== 'fechado';

    const agent = agents.find(a => a.id === ticket.agent_id);

    return (
      <Link 
        key={ticket.id}
        to={`${createPageUrl("TicketView")}?id=${ticket.id}`}
        className="block"
      >
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <Badge variant="outline" className={`${priorityColors[ticket.priority]} border font-semibold text-xs`}>
                  {ticket.priority}
                </Badge>
                <Badge className="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs">
                  {statusLabels[ticket.status]}
                </Badge>
                {isAtRisk && (
                  <Badge className="bg-orange-100 dark:bg-orange-950 text-orange-700 dark:text-orange-300 text-xs">
                    <AlertTriangle className="w-3 h-3 mr-1" />
                    Em risco
                  </Badge>
                )}
                {ticket.sla_breached && (
                  <Badge className="bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 text-xs">
                    SLA Violado
                  </Badge>
                )}
              </div>
              
              <h4 className="font-semibold text-gray-900 dark:text-gray-100 truncate mb-1">
                {ticket.subject}
              </h4>
              
              <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                <div className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  {format(new Date(ticket.created_date), "dd/MM HH:mm", { locale: ptBR })}
                </div>
                {agent && (
                  <div className="flex items-center gap-1">
                    <User className="w-4 h-4" />
                    {agent.name}
                  </div>
                )}
                {ticket.resolved_at && (
                  <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                    <CheckCircle className="w-4 h-4" />
                    Resolvido em {format(new Date(ticket.resolved_at), "dd/MM HH:mm")}
                  </div>
                )}
              </div>
            </div>
            
            <div className="text-right flex-shrink-0">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                #{ticket.id.slice(0, 8)}
              </p>
              {ticket.time_to_resolution && (
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                  {Math.floor(ticket.time_to_resolution / 60)}h de atendimento
                </p>
              )}
            </div>
          </div>
        </div>
      </Link>
    );
  };

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-950 min-h-screen">
      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Controle de Tickets</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Visão completa de todos os tickets de atendimento
          </p>
        </div>
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

      {/* Estatísticas */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-center">
              <p className="text-sm text-gray-500 dark:text-gray-400">Total</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.total}</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="text-center">
              <p className="text-sm text-gray-500 dark:text-gray-400">Em Atendimento</p>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.active}</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="text-center">
              <p className="text-sm text-gray-500 dark:text-gray-400">Finalizados</p>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.completed}</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="text-center">
              <p className="text-sm text-gray-500 dark:text-gray-400">Hoje</p>
              <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{stats.today}</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="text-center">
              <p className="text-sm text-gray-500 dark:text-gray-400">Em Risco</p>
              <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{stats.atRisk}</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="text-center">
              <p className="text-sm text-gray-500 dark:text-gray-400">Violados</p>
              <p className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.breached}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Buscar..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger>
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
            
            <Select value={queueFilter} onValueChange={setQueueFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Fila" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as filas</SelectItem>
                {queues.map(q => (
                  <SelectItem key={q.id} value={q.id}>{q.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select value={agentFilter} onValueChange={setAgentFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Agente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os agentes</SelectItem>
                {agents.map(a => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="today">Hoje</SelectItem>
                <SelectItem value="week">Última semana</SelectItem>
                <SelectItem value="month">Último mês</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Card>
        <CardHeader className="border-b">
          <div className="flex items-center justify-between">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <div className="flex items-center justify-between">
                <TabsList>
                  <TabsTrigger value="active">
                    Em Atendimento ({filteredActiveTickets.length})
                  </TabsTrigger>
                  <TabsTrigger value="completed">
                    Finalizados ({filteredCompletedTickets.length})
                  </TabsTrigger>
                </TabsList>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExport(activeTab === 'active' ? filteredActiveTickets : filteredCompletedTickets)}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Exportar CSV
                </Button>
              </div>
            </Tabs>
          </div>
        </CardHeader>
        
        <CardContent className="p-0">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsContent value="active" className="m-0">
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredActiveTickets.length > 0 ? (
                  filteredActiveTickets.map(renderTicketRow)
                ) : (
                  <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                    <Activity className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                    <p>Nenhum ticket em atendimento encontrado</p>
                  </div>
                )}
              </div>
            </TabsContent>
            
            <TabsContent value="completed" className="m-0">
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredCompletedTickets.length > 0 ? (
                  filteredCompletedTickets.map(renderTicketRow)
                ) : (
                  <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                    <CheckCircle className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                    <p>Nenhum ticket finalizado encontrado</p>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}