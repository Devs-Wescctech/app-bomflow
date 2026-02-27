import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  FileDown, 
  Loader2, 
  DollarSign, 
  TrendingUp, 
  Users, 
  ShieldX,
  BarChart3,
  CheckCircle,
  Clock,
  AlertTriangle
} from "lucide-react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { canAccessReports } from "@/components/utils/permissions.jsx";
import DashboardFilters from "@/components/dashboard/DashboardFilters";

const STATUS_OPTIONS = [
  { id: 'active', label: 'Em Cobrança' },
  { id: 'resolved', label: 'Resolvidos' },
];

export default function CollectionReports() {
  const [selectedPeriod, setSelectedPeriod] = useState("thisMonth");
  const [dateRange, setDateRange] = useState({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) });
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [selectedStage, setSelectedStage] = useState(null);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const currentAgent = user?.agent;
  const isAdmin = user?.role === 'admin';
  const hasPermission = isAdmin || canAccessReports(currentAgent);

  const { data: tickets = [] } = useQuery({
    queryKey: ['collectionTickets'],
    queryFn: async () => {
      const allTickets = await base44.entities.Ticket.list('-createdDate', 1000);
      return allTickets.filter(t => t.ticket_type === 'collection');
    },
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
    return agents.filter(a => (a.teamId || a.team_id) === selectedTeam);
  }, [agents, selectedTeam]);

  const filteredTickets = useMemo(() => {
    const teamAgentIds = selectedTeam ? displayAgents.map(a => a.id) : null;

    return tickets.filter(ticket => {
      const ticketDate = new Date(ticket.createdAt || ticket.createdDate);
      
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

      if (selectedAgent && ticket.agentId !== selectedAgent) return false;

      if (selectedStage) {
        if (selectedStage === 'resolved' && ticket.status !== 'resolved' && ticket.status !== 'closed') return false;
        if (selectedStage === 'active' && (ticket.status === 'resolved' || ticket.status === 'closed')) return false;
      }

      if (teamAgentIds && !selectedAgent) {
        if (!teamAgentIds.includes(ticket.agentId)) return false;
      }

      return true;
    });
  }, [tickets, dateRange, selectedAgent, selectedStage, selectedTeam, displayAgents]);

  const totalDebt = filteredTickets.reduce((sum, ticket) => {
    if (ticket.status === 'resolved' || ticket.status === 'closed') return sum;
    try {
      const desc = JSON.parse(ticket.description || '{}');
      return sum + (desc.debt_value || 0);
    } catch {
      return sum;
    }
  }, 0);

  const recoveredAmount = filteredTickets.reduce((sum, ticket) => {
    if (ticket.status !== 'resolved' && ticket.status !== 'closed') return sum;
    try {
      const desc = JSON.parse(ticket.description || '{}');
      const agreement = desc.agreement;
      return sum + (agreement?.amount || 0);
    } catch {
      return sum;
    }
  }, 0);

  const totalContacts = filteredTickets.reduce((sum, ticket) => {
    try {
      const desc = JSON.parse(ticket.description || '{}');
      return sum + (desc.contact_attempts?.length || 0);
    } catch {
      return sum;
    }
  }, 0);

  const resolvedCount = filteredTickets.filter(t => t.status === 'resolved' || t.status === 'closed').length;
  const activeCount = filteredTickets.length - resolvedCount;
  const recoveryRate = filteredTickets.length > 0 ? ((resolvedCount / filteredTickets.length) * 100).toFixed(1) : 0;

  const handleClearFilters = () => {
    setSelectedPeriod("all");
    setDateRange({ from: null, to: null });
    setSelectedAgent(null);
    setSelectedStage(null);
    setSelectedTeam(null);
  };

  const handleExportExcel = async () => {
    setIsGenerating(true);
    try {
      const data = filteredTickets.map(ticket => {
        let desc = {};
        try {
          desc = JSON.parse(ticket.description || '{}');
        } catch {}
        const agreement = desc.agreement;
        
        return {
          'Ticket ID': ticket.id.slice(0, 8),
          'Data Criação': format(new Date(ticket.createdAt || ticket.createdDate), 'dd/MM/yyyy HH:mm', { locale: ptBR }),
          'Cliente': ticket.subject.split(' - ')[1] || '',
          'Dias em Atraso': desc.days_overdue || 0,
          'Valor em Débito': `R$ ${(desc.debt_value || 0).toFixed(2)}`,
          'Plano': desc.plan || '-',
          'Prioridade': ticket.priority,
          'Status': ticket.status === 'resolved' || ticket.status === 'closed' ? 'Resolvido' : 'Em Cobrança',
          'Tentativas de Contato': desc.contact_attempts?.length || 0,
          'Acordo': agreement ? agreement.type : '-',
          'Valor Acordado': agreement ? `R$ ${agreement.amount.toFixed(2)}` : '-',
          'Data Resolução': ticket.resolvedAt ? format(new Date(ticket.resolvedAt), 'dd/MM/yyyy', { locale: ptBR }) : '-'
        };
      });

      const headers = Object.keys(data[0] || {});
      const csvContent = [
        headers.join(','),
        ...data.map(row => headers.map(header => `"${row[header]}"`).join(','))
      ].join('\n');

      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `relatorio-cobranca-${format(new Date(), 'dd-MM-yyyy')}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success('Relatório exportado com sucesso!');
    } catch (error) {
      console.error('Erro ao exportar:', error);
      toast.error('Erro ao gerar relatório');
    }
    setIsGenerating(false);
  };

  if (!hasPermission) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-gray-950">
        <Card className="max-w-md bg-white dark:bg-gray-900">
          <CardContent className="p-8 text-center">
            <ShieldX className="w-16 h-16 mx-auto mb-4 text-red-500" />
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Acesso Restrito</h2>
            <p className="text-gray-600 dark:text-gray-400">
              Você não tem permissão para acessar os relatórios de cobrança.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-6 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-3">
            <BarChart3 className="w-8 h-8 text-red-600 dark:text-red-400" />
            Relatórios de Cobrança
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Exporte dados de cobrança e acordos
          </p>
        </div>
        <Button
          onClick={handleExportExcel}
          disabled={isGenerating || filteredTickets.length === 0}
          className="bg-green-600 hover:bg-green-700"
        >
          {isGenerating ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <FileDown className="w-4 h-4 mr-2" />
          )}
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
        <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:shadow-lg transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Total Tickets</p>
                <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{filteredTickets.length}</p>
              </div>
              <div className="p-3 bg-blue-100 dark:bg-blue-950 rounded-xl">
                <Users className="w-8 h-8 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:shadow-lg transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Em Cobrança</p>
                <p className="text-3xl font-bold text-orange-600 dark:text-orange-400">{activeCount}</p>
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
                <p className="text-sm text-gray-500 dark:text-gray-400">Resolvidos</p>
                <p className="text-3xl font-bold text-green-600 dark:text-green-400">{resolvedCount}</p>
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
                <p className="text-sm text-gray-500 dark:text-gray-400">Total em Débito</p>
                <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                  R$ {totalDebt.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
                </p>
              </div>
              <div className="p-3 bg-red-100 dark:bg-red-950 rounded-xl">
                <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:shadow-lg transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Valor Recuperado</p>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                  R$ {recoveredAmount.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
                </p>
              </div>
              <div className="p-3 bg-green-100 dark:bg-green-950 rounded-xl">
                <DollarSign className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:shadow-lg transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Taxa Recuperação</p>
                <p className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">{recoveryRate}%</p>
              </div>
              <div className="p-3 bg-indigo-100 dark:bg-indigo-950 rounded-xl">
                <TrendingUp className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
          <CardHeader className="border-b border-gray-200 dark:border-gray-800">
            <CardTitle className="text-gray-900 dark:text-gray-100">Resumo do Período</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="grid md:grid-cols-3 gap-6">
              <div className="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Tickets Criados</p>
                <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">{filteredTickets.length}</p>
              </div>
              <div className="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Tentativas de Contato</p>
                <p className="text-3xl font-bold text-purple-600 dark:text-purple-400">{totalContacts}</p>
              </div>
              <div className="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Média por Ticket</p>
                <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                  {filteredTickets.length > 0 ? (totalContacts / filteredTickets.length).toFixed(1) : 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
          <CardHeader className="border-b border-gray-200 dark:border-gray-800">
            <CardTitle className="text-gray-900 dark:text-gray-100">Status dos Tickets</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-orange-50 dark:bg-orange-950 rounded-lg">
                <div className="flex items-center gap-3">
                  <Clock className="w-6 h-6 text-orange-600 dark:text-orange-400" />
                  <span className="font-medium text-gray-900 dark:text-gray-100">Em Cobrança</span>
                </div>
                <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300 text-lg px-3 py-1">
                  {activeCount}
                </Badge>
              </div>
              <div className="flex items-center justify-between p-4 bg-green-50 dark:bg-green-950 rounded-lg">
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
                  <span className="font-medium text-gray-900 dark:text-gray-100">Resolvidos</span>
                </div>
                <Badge className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 text-lg px-3 py-1">
                  {resolvedCount}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
