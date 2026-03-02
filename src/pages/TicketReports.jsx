import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { 
  BarChart, 
  Bar, 
  LineChart, 
  Line, 
  PieChart, 
  Pie, 
  Cell, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer 
} from 'recharts';
import { 
  Download, 
  TrendingUp, 
  Clock, 
  CheckCircle, 
  AlertTriangle,
  Users,
  Calendar,
  BarChart3,
  ShieldX,
  UserCheck
} from "lucide-react";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { canAccessReports } from "@/components/utils/permissions.jsx";
import DashboardFilters from "@/components/dashboard/DashboardFilters";

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

const STATUS_OPTIONS = [
  { id: 'novo', label: 'Novo' },
  { id: 'atribuido', label: 'Atribuído' },
  { id: 'em_atendimento', label: 'Em Atendimento' },
  { id: 'aguardando_cliente', label: 'Aguardando Cliente' },
  { id: 'resolvido', label: 'Resolvido' },
];

export default function TicketReports() {
  const [selectedPeriod, setSelectedPeriod] = useState("last7days");
  const [dateRange, setDateRange] = useState({ from: subDays(new Date(), 7), to: new Date() });
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [selectedStage, setSelectedStage] = useState(null);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [selectedQueue, setSelectedQueue] = useState('all');

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const currentAgent = user?.agent;
  const isAdmin = user?.role === 'admin';
  const hasPermission = isAdmin || canAccessReports(currentAgent);

  const { data: allTickets = [], isLoading } = useQuery({
    queryKey: ['allTickets'],
    queryFn: async () => {
      const tickets = await base44.entities.Ticket.list('-createdDate', 2000);
      return tickets.filter(t => t.ticket_type === 'support' || !t.ticket_type);
    },
    enabled: hasPermission,
  });

  const { data: queues = [] } = useQuery({
    queryKey: ['queues'],
    queryFn: () => base44.entities.Queue.list(),
    enabled: hasPermission,
  });

  const { data: teams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: () => base44.entities.Team.list(),
  });

  const { data: agents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: () => base44.entities.Agent.list(),
    enabled: hasPermission,
  });

  const displayAgents = useMemo(() => {
    if (!selectedTeam) return agents;
    return agents.filter(a => String(a.teamId || a.team_id) === String(selectedTeam));
  }, [agents, selectedTeam]);

  const filteredTickets = useMemo(() => {
    const teamAgentIds = selectedTeam ? displayAgents.map(a => String(a.id)) : null;

    return allTickets.filter(t => {
      const ticketDate = new Date(t.createdAt || t.createdDate);
      
      if (dateRange?.from) {
        const start = new Date(dateRange.from);
        start.setHours(0, 0, 0, 0);
        if (ticketDate < start) return false;
      }
      
      if (dateRange?.to) {
        const end = new Date(dateRange.to);
        end.setHours(23, 59, 59, 999);
        if (ticketDate > end) return false;
      }

      if (selectedAgent && t.agentId !== selectedAgent) return false;
      if (selectedStage && t.status !== selectedStage) return false;
      if (selectedQueue !== 'all' && t.queueId !== selectedQueue) return false;

      if (teamAgentIds && !selectedAgent) {
        if (!teamAgentIds.includes(String(t.agentId))) return false;
      }

      return true;
    });
  }, [allTickets, dateRange, selectedAgent, selectedStage, selectedQueue, selectedTeam, displayAgents]);

  const totalTickets = filteredTickets.length;
  const completedTickets = filteredTickets.filter(t => ['resolvido', 'fechado'].includes(t.status)).length;
  const activeTickets = filteredTickets.filter(t => !['resolvido', 'fechado'].includes(t.status)).length;
  const breachedTickets = filteredTickets.filter(t => t.slaBreached).length;
  const avgResolutionTime = filteredTickets
    .filter(t => t.timeToResolution)
    .reduce((sum, t) => sum + t.timeToResolution, 0) / 
    (filteredTickets.filter(t => t.timeToResolution).length || 1);

  const resolutionRate = totalTickets > 0 ? ((completedTickets / totalTickets) * 100).toFixed(1) : 0;
  const slaCompliance = totalTickets > 0 ? (((totalTickets - breachedTickets) / totalTickets) * 100).toFixed(1) : 0;

  const ticketsByDay = useMemo(() => {
    if (!dateRange?.from || !dateRange?.to) return [];
    
    const days = [];
    const start = new Date(dateRange.from);
    const end = new Date(dateRange.to);
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    
    for (let i = diffDays - 1; i >= 0; i--) {
      const date = subDays(end, i);
      const dateStr = format(date, 'dd/MM', { locale: ptBR });
      const count = filteredTickets.filter(t => {
        const ticketDate = new Date(t.createdAt || t.createdDate);
        return format(ticketDate, 'dd/MM') === dateStr;
      }).length;
      days.push({ date: dateStr, tickets: count });
    }
    return days.slice(-30);
  }, [filteredTickets, dateRange]);

  const ticketsByStatus = [
    { name: 'Novo', value: filteredTickets.filter(t => t.status === 'novo').length },
    { name: 'Atribuído', value: filteredTickets.filter(t => t.status === 'atribuido').length },
    { name: 'Em Atendimento', value: filteredTickets.filter(t => t.status === 'em_atendimento').length },
    { name: 'Aguardando', value: filteredTickets.filter(t => t.status === 'aguardando_cliente').length },
    { name: 'Resolvido', value: filteredTickets.filter(t => t.status === 'resolvido').length },
  ].filter(item => item.value > 0);

  const ticketsByPriority = [
    { name: 'P1 - Crítica', value: filteredTickets.filter(t => t.priority === 'P1').length, color: '#ef4444' },
    { name: 'P2 - Alta', value: filteredTickets.filter(t => t.priority === 'P2').length, color: '#f59e0b' },
    { name: 'P3 - Média', value: filteredTickets.filter(t => t.priority === 'P3').length, color: '#3b82f6' },
    { name: 'P4 - Baixa', value: filteredTickets.filter(t => t.priority === 'P4').length, color: '#6b7280' },
  ].filter(item => item.value > 0);

  const agentPerformance = useMemo(() => {
    return agents.map(agent => {
      const agentTickets = filteredTickets.filter(t => t.agentId === agent.id);
      const resolved = agentTickets.filter(t => ['resolvido', 'fechado'].includes(t.status)).length;
      return {
        agent,
        name: agent.name,
        total: agentTickets.length,
        resolved: resolved,
        rate: agentTickets.length > 0 ? ((resolved / agentTickets.length) * 100).toFixed(0) : 0
      };
    }).filter(a => a.total > 0).sort((a, b) => b.total - a.total).slice(0, 10);
  }, [agents, filteredTickets]);

  const handleClearFilters = () => {
    setSelectedPeriod("all");
    setDateRange({ from: null, to: null });
    setSelectedAgent(null);
    setSelectedStage(null);
    setSelectedTeam(null);
    setSelectedQueue('all');
  };

  const handleExport = () => {
    try {
      const periodLabel = dateRange?.from && dateRange?.to 
        ? `${format(dateRange.from, 'dd/MM/yyyy')} - ${format(dateRange.to, 'dd/MM/yyyy')}`
        : 'Todo o período';

      const csv = [
        ['Período', 'Total', 'Finalizados', 'Em Atendimento', 'Taxa Resolução', 'SLA Compliance', 'Tempo Médio'].join(','),
        [
          periodLabel,
          totalTickets,
          completedTickets,
          activeTickets,
          `${resolutionRate}%`,
          `${slaCompliance}%`,
          `${(avgResolutionTime / 60).toFixed(1)}h`
        ].join(','),
        '',
        ['Agente', 'Total', 'Resolvidos', 'Taxa'].join(','),
        ...agentPerformance.map(a => [a.name, a.total, a.resolved, `${a.rate}%`].join(','))
      ].join('\n');

      const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `relatorio-tickets-${format(new Date(), 'yyyy-MM-dd')}.csv`;
      link.click();
      
      toast.success('Relatório exportado com sucesso!');
    } catch (error) {
      toast.error('Erro ao exportar relatório');
      console.error(error);
    }
  };

  if (!hasPermission) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-gray-950">
        <Card className="max-w-md bg-white dark:bg-gray-900">
          <CardContent className="p-8 text-center">
            <ShieldX className="w-16 h-16 mx-auto mb-4 text-red-500" />
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Acesso Restrito</h2>
            <p className="text-gray-600 dark:text-gray-400">
              Você não tem permissão para acessar os relatórios de atendimento.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-950 min-h-screen">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-3">
            <BarChart3 className="w-8 h-8 text-blue-600 dark:text-blue-400" />
            Relatórios de Atendimento
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Análises e métricas detalhadas
          </p>
        </div>
        <Button onClick={handleExport} className="bg-green-600 hover:bg-green-700">
          <Download className="w-4 h-4 mr-2" />
          Exportar CSV
        </Button>
      </div>

      <DashboardFilters
        agents={displayAgents}
        stages={STATUS_OPTIONS}
        teams={teams}
        selectedAgent={selectedAgent}
        selectedStage={selectedStage}
        selectedTeam={selectedTeam}
        selectedPeriod={selectedPeriod}
        dateRange={dateRange}
        onAgentChange={setSelectedAgent}
        onStageChange={setSelectedStage}
        onTeamChange={setSelectedTeam}
        onPeriodChange={setSelectedPeriod}
        onDateRangeChange={setDateRange}
        onClearFilters={handleClearFilters}
        showAgentFilter={true}
        showStageFilter={true}
        showTeamFilter={true}
        showPeriodFilter={true}
      />

      {queues.length > 0 && (
        <Card className="mb-6">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-end gap-4">
              <div className="flex flex-col gap-1.5 min-w-[200px]">
                <Label className="text-xs text-muted-foreground">Fila</Label>
                <Select value={selectedQueue} onValueChange={setSelectedQueue}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Todas as filas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as filas</SelectItem>
                    {queues.map(q => (
                      <SelectItem key={q.id} value={q.id}>{q.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
        <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:shadow-lg transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Total Tickets</p>
                <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{totalTickets}</p>
              </div>
              <div className="p-3 bg-blue-100 dark:bg-blue-950 rounded-xl">
                <TrendingUp className="w-8 h-8 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:shadow-lg transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Finalizados</p>
                <p className="text-3xl font-bold text-green-600 dark:text-green-400">{completedTickets}</p>
              </div>
              <div className="p-3 bg-green-100 dark:bg-green-950 rounded-xl">
                <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:shadow-lg transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Em Atendimento</p>
                <p className="text-3xl font-bold text-orange-600 dark:text-orange-400">{activeTickets}</p>
              </div>
              <div className="p-3 bg-orange-100 dark:bg-orange-950 rounded-xl">
                <Clock className="w-8 h-8 text-orange-600 dark:text-orange-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:shadow-lg transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Taxa Resolução</p>
                <p className="text-3xl font-bold text-purple-600 dark:text-purple-400">{resolutionRate}%</p>
              </div>
              <div className="p-3 bg-purple-100 dark:bg-purple-950 rounded-xl">
                <TrendingUp className="w-8 h-8 text-purple-600 dark:text-purple-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:shadow-lg transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">SLA Compliance</p>
                <p className="text-3xl font-bold text-cyan-600 dark:text-cyan-400">{slaCompliance}%</p>
              </div>
              <div className="p-3 bg-cyan-100 dark:bg-cyan-950 rounded-xl">
                <AlertTriangle className="w-8 h-8 text-cyan-600 dark:text-cyan-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:shadow-lg transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Tempo Médio</p>
                <p className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">
                  {(avgResolutionTime / 60).toFixed(1)}h
                </p>
              </div>
              <div className="p-3 bg-indigo-100 dark:bg-indigo-950 rounded-xl">
                <Clock className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="bg-white dark:bg-gray-900">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Volume Diário
            </CardTitle>
          </CardHeader>
          <CardContent>
            {ticketsByDay.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={ticketsByDay}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="tickets" stroke="#3b82f6" strokeWidth={2} name="Tickets" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-gray-500 dark:text-gray-400 py-8">
                Selecione um período com datas para ver o gráfico
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-gray-900">
          <CardHeader>
            <CardTitle>Distribuição por Status</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={ticketsByStatus}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({name, percent}) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {ticketsByStatus.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <CardHeader className="border-b border-gray-200 dark:border-gray-800">
          <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
            <UserCheck className="w-5 h-5" />
            Top 10 Agentes
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Agente
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Total Tickets
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Resolvidos
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Taxa Resolução
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {agentPerformance.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                      Nenhum dado disponível para o período selecionado
                    </td>
                  </tr>
                ) : (
                  agentPerformance.map((stat, idx) => (
                    <tr key={stat.agent.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center">
                            <span className="text-white font-semibold text-sm">
                              {stat.name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-gray-900 dark:text-gray-100">{stat.name}</p>
                            {idx === 0 && <Badge className="bg-yellow-100 text-yellow-700 text-xs mt-1">Top</Badge>}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <Badge variant="outline" className="font-semibold">{stat.total}</Badge>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <Badge className="bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300">
                          {stat.resolved}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span className={`font-semibold ${
                          parseInt(stat.rate) >= 80 ? 'text-green-600 dark:text-green-400' :
                          parseInt(stat.rate) >= 50 ? 'text-yellow-600 dark:text-yellow-400' :
                          'text-red-600 dark:text-red-400'
                        }`}>
                          {stat.rate}%
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="bg-white dark:bg-gray-900">
          <CardHeader>
            <CardTitle>Distribuição por Prioridade</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={ticketsByPriority}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" name="Tickets">
                  {ticketsByPriority.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-gray-900">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Performance por Agente
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={agentPerformance} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={100} />
                <Tooltip />
                <Legend />
                <Bar dataKey="total" fill="#3b82f6" name="Total" />
                <Bar dataKey="resolved" fill="#10b981" name="Resolvidos" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
