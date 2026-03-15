import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell, LineChart, Line
} from 'recharts';
import { 
  TrendingUp, 
  Users, 
  DollarSign,
  CheckCircle,
  Gift,
  Target,
  Download,
  BarChart3,
  UserCheck,
  Trophy,
  XCircle,
  Clock,
  ShieldX
} from "lucide-react";
import { format, startOfMonth, endOfMonth, eachMonthOfInterval, eachWeekOfInterval, eachDayOfInterval } from "date-fns";
import { ptBR } from "date-fns/locale";
import DashboardFilters from "@/components/dashboard/DashboardFilters";
import { canViewAll, canViewTeam, canAccessReports } from "@/components/utils/permissions.jsx";
import { REFERRAL_STAGES as REFERRAL_STAGES_CONST } from "@/constants/stages";

const COLORS = ['#ec4899', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'];

const STAGES = REFERRAL_STAGES_CONST;

export default function ReferralReports() {
  const [selectedPeriod, setSelectedPeriod] = useState("thisMonth");
  const [dateRange, setDateRange] = useState({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) });
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [selectedStage, setSelectedStage] = useState(null);
  const [selectedTeam, setSelectedTeam] = useState(null);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const currentAgent = user?.agent;
  const currentAgentType = currentAgent?.agentType || currentAgent?.agent_type;
  const isAdmin = user?.role === 'admin' || currentAgentType === 'admin';
  const isSupervisor = currentAgentType?.includes('supervisor') || currentAgentType === 'supervisor';
  const hasSubmenuAccess = (currentAgent?.allowedSubmenus || []).includes('ReferralReports');
  const hasPermission = isAdmin || isSupervisor || canAccessReports(currentAgent) || hasSubmenuAccess;

  const { data: teams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: () => base44.entities.Team.list(),
  });

  const { data: allAgents = [], isLoading: agentsLoading } = useQuery({
    queryKey: ['referralReportsAgents'],
    queryFn: () => base44.entities.Agent.list(),
    enabled: hasPermission,
  });

  const { data: referrals = [], isLoading: referralsLoading } = useQuery({
    queryKey: ['referralReportsData', isAdmin ? 'admin' : isSupervisor ? 'supervisor' : currentAgent?.id],
    queryFn: async () => {
      const allReferrals = await base44.entities.Referral.list('-createdAt', 5000);
      
      if (isAdmin || isSupervisor) {
        return allReferrals;
      }
      
      if (canViewAll(currentAgent, 'referrals')) {
        return allReferrals;
      }
      
      if (canViewTeam(currentAgent, 'referrals')) {
        const teamAgents = allAgents.filter(a => (a.teamId || a.team_id) === (currentAgent?.teamId || currentAgent?.team_id));
        const teamAgentIds = teamAgents.map(a => a.id);
        return allReferrals.filter(r => 
          teamAgentIds.includes(r.agentId || r.agent_id)
        );
      }
      
      return allReferrals.filter(r => 
        (r.agentId || r.agent_id) === currentAgent?.id
      );
    },
    enabled: hasPermission && !!user && (isAdmin || isSupervisor || !!currentAgent),
  });

  const isLoading = referralsLoading || agentsLoading;

  const activeAgents = useMemo(() => allAgents.filter(a => a.active), [allAgents]);

  const displayAgents = useMemo(() => {
    if (!selectedTeam) return activeAgents;
    return activeAgents.filter(a => String(a.teamId || a.team_id) === String(selectedTeam));
  }, [activeAgents, selectedTeam]);

  const filteredReferrals = useMemo(() => {
    const teamAgentIds = selectedTeam ? displayAgents.map(a => String(a.id)) : null;

    return referrals.filter(referral => {
      const refDate = new Date(referral.createdAt || referral.created_at || referral.createdDate || referral.created_date);
      if (isNaN(refDate.getTime())) return false;
      
      if (dateRange?.from) {
        const start = new Date(dateRange.from);
        start.setHours(0, 0, 0, 0);
        if (refDate < start) return false;
      }
      
      if (dateRange?.to) {
        const end = new Date(dateRange.to);
        end.setHours(23, 59, 59, 999);
        if (refDate > end) return false;
      }
      
      if (selectedAgent) {
        const agentId = referral.agentId || referral.agent_id;
        if (agentId !== selectedAgent) return false;
      }

      if (selectedStage && referral.stage !== selectedStage) return false;

      if (teamAgentIds && !selectedAgent) {
        const agentId = String(referral.agentId || referral.agent_id);
        if (!teamAgentIds.includes(agentId)) return false;
      }
      
      return true;
    });
  }, [referrals, dateRange, selectedAgent, selectedStage, selectedTeam, displayAgents]);

  const getReferralValue = (r) => {
    return parseFloat(r.value) || parseFloat(r.monthlyValue) || parseFloat(r.monthly_value) || 0;
  };

  const stats = useMemo(() => {
    const total = filteredReferrals.length;
    const conversoes = filteredReferrals.filter(r => r.stage === 'fechado_ganho').length;
    const perdidos = filteredReferrals.filter(r => r.stage === 'fechado_perdido').length;
    const emAndamento = filteredReferrals.filter(r => !['fechado_ganho', 'fechado_perdido'].includes(r.stage)).length;
    const taxaConversao = total > 0 ? ((conversoes / total) * 100).toFixed(1) : 0;
    const comissaoTotal = filteredReferrals
      .filter(r => r.stage === 'fechado_ganho')
      .reduce((sum, r) => sum + (parseFloat(r.commissionValue || r.commission_value) || 0), 0);
    const valorPipeline = filteredReferrals
      .filter(r => !['fechado_ganho', 'fechado_perdido'].includes(r.stage))
      .reduce((sum, r) => sum + getReferralValue(r), 0);
    const valorGanho = filteredReferrals
      .filter(r => r.stage === 'fechado_ganho')
      .reduce((sum, r) => sum + getReferralValue(r), 0);

    return { total, conversoes, perdidos, emAndamento, taxaConversao, comissaoTotal, valorPipeline, valorGanho };
  }, [filteredReferrals]);

  const stageDistribution = useMemo(() => {
    return STAGES.map(stage => ({
      name: stage.label,
      value: filteredReferrals.filter(r => r.stage === stage.id).length,
      color: stage.color
    }));
  }, [filteredReferrals]);

  const timelineData = useMemo(() => {
    if (filteredReferrals.length === 0 || !dateRange?.from || !dateRange?.to) return [];
    
    const start = new Date(dateRange.from);
    const end = new Date(dateRange.to);
    
    const intervals = eachMonthOfInterval({ start, end });
    const formatStr = 'MMM/yy';
    
    return intervals.map(date => {
      const periodReferrals = filteredReferrals.filter(r => {
        const refDate = new Date(r.createdAt || r.created_at || r.createdDate || r.created_date);
        return format(refDate, 'MM-yyyy') === format(date, 'MM-yyyy');
      });
      
      return {
        name: format(date, formatStr, { locale: ptBR }),
        total: periodReferrals.length,
        conversoes: periodReferrals.filter(r => r.stage === 'fechado_ganho').length,
        comissao: periodReferrals
          .filter(r => r.stage === 'fechado_ganho')
          .reduce((sum, r) => sum + (parseFloat(r.commissionValue || r.commission_value) || 0), 0)
      };
    });
  }, [filteredReferrals, dateRange]);

  const agentPerformance = useMemo(() => {
    return activeAgents
      .map(agent => {
        const agentReferrals = filteredReferrals.filter(r => (r.agentId || r.agent_id) === agent.id);
        const conversoes = agentReferrals.filter(r => r.stage === 'fechado_ganho').length;
        const comissao = agentReferrals
          .filter(r => r.stage === 'fechado_ganho')
          .reduce((sum, r) => sum + (parseFloat(r.commissionValue || r.commission_value) || 0), 0);
        
        return {
          agent,
          name: agent.name,
          indicacoes: agentReferrals.length,
          conversoes,
          taxa: agentReferrals.length > 0 ? ((conversoes / agentReferrals.length) * 100).toFixed(0) : 0,
          comissao
        };
      })
      .filter(a => a.indicacoes > 0)
      .sort((a, b) => b.conversoes - a.conversoes);
  }, [filteredReferrals, activeAgents]);

  const topPerformer = agentPerformance[0];

  const handleClearFilters = () => {
    setSelectedPeriod("all");
    setDateRange({ from: null, to: null });
    setSelectedAgent(null);
    setSelectedStage(null);
    setSelectedTeam(null);
  };

  const handleExport = () => {
    if (filteredReferrals.length === 0) {
      alert('Nenhuma indicação para exportar');
      return;
    }

    const periodLabel = dateRange?.from && dateRange?.to 
      ? `${format(dateRange.from, 'dd/MM/yyyy', { locale: ptBR })} a ${format(dateRange.to, 'dd/MM/yyyy', { locale: ptBR })}`
      : 'Todo o período';

    const csvData = [
      ['RELATÓRIO DE INDICAÇÕES'],
      [`Período: ${periodLabel}`],
      [''],
      ['Nome', 'Telefone', 'Email', 'Vendedor', 'Etapa', 'Comissão', 'Data Criação'],
      ...filteredReferrals.map(ref => [
        ref.name || '',
        ref.phone || '',
        ref.email || '',
        allAgents.find(a => a.id === (ref.agentId || ref.agent_id))?.name || '',
        STAGES.find(s => s.id === ref.stage)?.label || '',
        ref.stage === 'fechado_ganho' ? (ref.commissionValue || ref.commission_value || 0) : 0,
        ref.createdAt ? new Date(ref.createdAt).toLocaleDateString('pt-BR') : '',
      ])
    ].map(row => row.join(';')).join('\n');

    const blob = new Blob(['\ufeff' + csvData], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `relatorio_indicacoes_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-600 mx-auto"></div>
          <p className="text-gray-500 dark:text-gray-400">Carregando relatórios...</p>
        </div>
      </div>
    );
  }

  if (!hasPermission) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="text-center space-y-4">
          <ShieldX className="w-16 h-16 text-red-500 mx-auto" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Acesso Restrito</h2>
          <p className="text-gray-500 dark:text-gray-400">Você não tem permissão para acessar esta página.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-950 min-h-screen">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-3">
            <BarChart3 className="w-8 h-8 text-pink-600 dark:text-pink-400" />
            Relatórios de Indicações
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Análises detalhadas do programa de indicações
          </p>
        </div>
        <Button onClick={handleExport} className="bg-green-600 hover:bg-green-700">
          <Download className="w-4 h-4 mr-2" />
          Exportar CSV
        </Button>
      </div>

      <DashboardFilters
        agents={displayAgents}
        stages={STAGES}
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

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-4">
        <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:shadow-lg transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Total Indicações</p>
                <p className="text-3xl font-bold text-pink-600 dark:text-pink-400">{stats.total}</p>
              </div>
              <div className="p-3 bg-pink-100 dark:bg-pink-950 rounded-xl">
                <Gift className="w-8 h-8 text-pink-600 dark:text-pink-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-2 border-emerald-200 dark:border-emerald-800 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/50 dark:to-teal-950/50 hover:shadow-lg transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Vendas Fechadas</p>
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                  R$ {stats.valorGanho.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70 mt-1">{stats.conversoes} convertidas</p>
              </div>
              <div className="p-3 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl">
                <Trophy className="w-8 h-8 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:shadow-lg transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Em Andamento</p>
                <p className="text-3xl font-bold text-purple-600 dark:text-purple-400">{stats.emAndamento}</p>
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
                <p className="text-sm text-gray-500 dark:text-gray-400">Conversões</p>
                <p className="text-3xl font-bold text-green-600 dark:text-green-400">{stats.conversoes}</p>
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
                <p className="text-sm text-gray-500 dark:text-gray-400">Perdidos</p>
                <p className="text-3xl font-bold text-red-600 dark:text-red-400">{stats.perdidos}</p>
              </div>
              <div className="p-3 bg-red-100 dark:bg-red-950 rounded-xl">
                <XCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:shadow-lg transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Taxa Conversão</p>
                <p className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">{stats.taxaConversao}%</p>
              </div>
              <div className="p-3 bg-indigo-100 dark:bg-indigo-950 rounded-xl">
                <Target className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:shadow-lg transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Comissões Pagas</p>
                <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                  R$ {stats.comissaoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div className="p-3 bg-orange-100 dark:bg-orange-950 rounded-xl">
                <DollarSign className="w-8 h-8 text-orange-600 dark:text-orange-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {topPerformer && (
        <Card className="border-2 border-yellow-300 dark:border-yellow-700 bg-gradient-to-r from-yellow-50 to-orange-50 dark:from-yellow-950 dark:to-orange-950">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-4 bg-yellow-400 dark:bg-yellow-600 rounded-full">
                <Trophy className="w-8 h-8 text-white" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">TOP PERFORMER DO PERÍODO</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{topPerformer.name}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {topPerformer.conversoes} conversões • {topPerformer.taxa}% taxa • R$ {topPerformer.comissao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} em comissões
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="agents" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="agents">Por Vendedor</TabsTrigger>
          <TabsTrigger value="timeline">Evolução</TabsTrigger>
          <TabsTrigger value="distribution">Distribuição</TabsTrigger>
        </TabsList>

        <TabsContent value="agents" className="mt-6">
          <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
            <CardHeader className="border-b border-gray-200 dark:border-gray-800">
              <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
                <UserCheck className="w-5 h-5" />
                Performance por Vendedor
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Vendedor
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Indicações
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Conversões
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Taxa
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Comissão
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {agentPerformance.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                          Nenhum dado disponível para o período selecionado
                        </td>
                      </tr>
                    ) : (
                      agentPerformance.map((agent, idx) => (
                        <tr key={agent.agent.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-gradient-to-br from-pink-500 to-pink-600 rounded-full flex items-center justify-center">
                                <span className="text-white font-semibold text-sm">
                                  {agent.name.charAt(0).toUpperCase()}
                                </span>
                              </div>
                              <div>
                                <p className="font-medium text-gray-900 dark:text-gray-100">{agent.name}</p>
                                {idx === 0 && <Badge className="bg-yellow-100 text-yellow-700 text-xs mt-1">Top</Badge>}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <Badge className="bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-300">
                              {agent.indicacoes}
                            </Badge>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <Badge className="bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300">
                              {agent.conversoes}
                            </Badge>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <span className={`font-semibold ${
                              parseInt(agent.taxa) >= 30 ? 'text-green-600 dark:text-green-400' :
                              parseInt(agent.taxa) >= 15 ? 'text-yellow-600 dark:text-yellow-400' :
                              'text-red-600 dark:text-red-400'
                            }`}>
                              {agent.taxa}%
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right font-semibold text-purple-600 dark:text-purple-400">
                            R$ {agent.comissao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="timeline" className="mt-6">
          <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
                <TrendingUp className="w-5 h-5" />
                Evolução ao Longo do Tempo
              </CardTitle>
            </CardHeader>
            <CardContent>
              {timelineData.length > 0 ? (
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={timelineData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="total" name="Indicações" stroke="#ec4899" strokeWidth={2} />
                      <Line type="monotone" dataKey="conversoes" name="Conversões" stroke="#10b981" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-center text-gray-500 dark:text-gray-400 py-8">
                  Selecione um período com datas para ver a evolução
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="distribution" className="mt-6">
          <div className="grid lg:grid-cols-2 gap-6">
            <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
              <CardHeader>
                <CardTitle className="text-gray-900 dark:text-gray-100">Distribuição por Etapa</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={stageDistribution}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {stageDistribution.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
              <CardHeader>
                <CardTitle className="text-gray-900 dark:text-gray-100">Quantidade por Etapa</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stageDistribution}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="value" name="Quantidade">
                        {stageDistribution.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
