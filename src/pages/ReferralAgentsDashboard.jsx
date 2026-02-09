import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { 
  Trophy, 
  TrendingUp, 
  Users, 
  Target,
  DollarSign,
  CheckCircle,
  Gift,
  Medal,
  Award,
  Activity,
  ShieldAlert
} from "lucide-react";
import { format, startOfMonth, endOfMonth, startOfDay, endOfDay } from "date-fns";
import DashboardFilters from "@/components/dashboard/DashboardFilters";

export default function ReferralAgentsDashboard() {
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState("thisMonth");
  const [dateRange, setDateRange] = useState({ 
    from: startOfMonth(new Date()), 
    to: endOfMonth(new Date()) 
  });
  const [sortBy, setSortBy] = useState("conversoes");

  const { data: user, isLoading: userLoading } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const currentAgent = user?.agent;
  const currentAgentType = currentAgent?.agentType || currentAgent?.agent_type;
  const isAdmin = user?.role === 'admin' || currentAgentType === 'admin';
  const isSupervisor = user?.role === 'supervisor' || currentAgentType?.includes('supervisor');
  const isSalesAgent = currentAgentType === 'sales' || currentAgentType === 'pre_sales' || currentAgentType === 'post_sales';
  const hasPermission = isAdmin || isSupervisor || isSalesAgent;
  const canFetchData = !!user && !!currentAgent && hasPermission;

  const { data: agents = [], isLoading: agentsLoading } = useQuery({
    queryKey: ['referralDashboardAgents'],
    queryFn: () => base44.entities.Agent.list(),
    enabled: canFetchData,
  });

  const { data: teams = [], isLoading: teamsLoading } = useQuery({
    queryKey: ['referralDashboardTeams'],
    queryFn: () => base44.entities.Team.list(),
    enabled: canFetchData,
  });

  const { data: referrals = [], isLoading: referralsLoading } = useQuery({
    queryKey: ['referralDashboardReferrals'],
    queryFn: () => base44.entities.Referral.list('-createdAt', 5000),
    enabled: canFetchData,
  });

  const canSeeAllAgents = isAdmin || isSupervisor;
  const isLoading = agentsLoading || teamsLoading || referralsLoading;

  const teamsForFilter = useMemo(() => {
    return teams.map(team => ({
      id: team.id,
      name: team.name
    }));
  }, [teams]);

  const filteredReferralsByDate = useMemo(() => {
    return referrals.filter(referral => {
      const refDate = new Date(referral.createdAt || referral.created_at || referral.createdDate || referral.created_date);
      if (isNaN(refDate.getTime())) return false;
      
      if (!dateRange?.from && !dateRange?.to) return true;
      
      const start = dateRange.from ? startOfDay(new Date(dateRange.from)) : null;
      const end = dateRange.to ? endOfDay(new Date(dateRange.to)) : null;
      
      if (start && end) {
        return refDate >= start && refDate <= end;
      } else if (start) {
        return refDate >= start;
      } else if (end) {
        return refDate <= end;
      }
      return true;
    });
  }, [referrals, dateRange]);

  const agentStats = useMemo(() => {
    return agents
      .filter(agent => {
        if (!canSeeAllAgents && agent.id !== currentAgent?.id) return false;
        const agentTeamId = agent.teamId || agent.team_id;
        if (selectedTeam && agentTeamId !== selectedTeam) return false;
        return agent.active;
      })
      .map(agent => {
        const agentReferrals = filteredReferralsByDate.filter(r => (r.agentId || r.agent_id) === agent.id);
        const totalReferrals = agentReferrals.length;
        const novos = agentReferrals.filter(r => r.stage === 'novo').length;
        const qualificados = agentReferrals.filter(r => r.stage === 'qualificado').length;
        const propostasEnviadas = agentReferrals.filter(r => r.stage === 'proposta_enviada').length;
        const conversoes = agentReferrals.filter(r => r.stage === 'fechado_ganho').length;
        const perdidos = agentReferrals.filter(r => r.stage === 'fechado_perdido').length;
        const taxaConversao = totalReferrals > 0 ? ((conversoes / totalReferrals) * 100) : 0;
        const comissao = agentReferrals
          .filter(r => r.stage === 'fechado_ganho')
          .reduce((sum, r) => sum + (parseFloat(r.commissionValue || r.commission_value) || 0), 0);
        const comissaoMedia = conversoes > 0 ? (comissao / conversoes) : 0;
        const referralsAtivos = agentReferrals.filter(r => 
          r.stage !== 'fechado_ganho' && r.stage !== 'fechado_perdido'
        ).length;

        return {
          agent,
          totalReferrals,
          novos,
          qualificados,
          propostasEnviadas,
          conversoes,
          perdidos,
          referralsAtivos,
          taxaConversao: parseFloat(taxaConversao.toFixed(1)),
          comissao,
          comissaoMedia,
        };
      });
  }, [agents, filteredReferralsByDate, canSeeAllAgents, currentAgent, selectedTeam]);

  const sortedAgents = useMemo(() => {
    return [...agentStats].sort((a, b) => {
      switch(sortBy) {
        case "conversoes": return b.conversoes - a.conversoes;
        case "indicacoes": return b.totalReferrals - a.totalReferrals;
        case "conversao": return b.taxaConversao - a.taxaConversao;
        case "comissao": return b.comissao - a.comissao;
        default: return b.conversoes - a.conversoes;
      }
    });
  }, [agentStats, sortBy]);

  const top3 = sortedAgents.slice(0, 3);
  const totalGeralReferrals = agentStats.reduce((sum, a) => sum + a.totalReferrals, 0);
  const totalGeralConversoes = agentStats.reduce((sum, a) => sum + a.conversoes, 0);
  const totalGeralComissao = agentStats.reduce((sum, a) => sum + a.comissao, 0);
  const taxaGeralConversao = totalGeralReferrals > 0 ? ((totalGeralConversoes / totalGeralReferrals) * 100).toFixed(1) : 0;

  const handleClearFilters = () => {
    setSelectedTeam(null);
    setSelectedPeriod("all");
    setDateRange({ from: null, to: null });
  };

  if (userLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-600 mx-auto"></div>
          <p className="text-gray-500 dark:text-gray-400">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!hasPermission) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <div className="mx-auto w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                <ShieldAlert className="w-8 h-8 text-red-600 dark:text-red-400" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                Acesso Restrito
              </h2>
              <p className="text-gray-500 dark:text-gray-400">
                Você não tem permissão para acessar esta página.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-600 mx-auto"></div>
          <p className="text-gray-500 dark:text-gray-400">Carregando dados...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-950 min-h-screen">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Dashboard dos Vendedores - Indicações</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-2">
          <Gift className="w-4 h-4" />
          Performance individual no programa de indicações
        </p>
      </div>

      <DashboardFilters
        agents={canSeeAllAgents ? teamsForFilter : []}
        selectedAgent={selectedTeam}
        onAgentChange={setSelectedTeam}
        selectedPeriod={selectedPeriod}
        onPeriodChange={setSelectedPeriod}
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        onClearFilters={handleClearFilters}
        showAgentFilter={canSeeAllAgents}
        showStageFilter={false}
      />

      <Card className="mb-6">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-end gap-4">
            <div className="flex flex-col gap-1.5 min-w-[200px]">
              <Label className="text-xs text-muted-foreground">Ordenar Por</Label>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="conversoes">Conversões</SelectItem>
                  <SelectItem value="indicacoes">Total de Indicações</SelectItem>
                  <SelectItem value="conversao">Taxa de Conversão</SelectItem>
                  <SelectItem value="comissao">Comissão Total</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-pink-200 dark:border-pink-800 bg-gradient-to-br from-pink-50 to-pink-100 dark:from-pink-950 dark:to-pink-900">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-pink-600 dark:text-pink-400 font-medium">Total de Indicações</p>
                <p className="text-3xl font-bold text-pink-700 dark:text-pink-300">{totalGeralReferrals}</p>
                <p className="text-xs text-pink-600 dark:text-pink-400 mt-1">{agentStats.length} agentes ativos</p>
              </div>
              <Gift className="w-10 h-10 text-pink-500 dark:text-pink-400 opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-green-200 dark:border-green-800 bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-green-600 dark:text-green-400 font-medium">Conversões</p>
                <p className="text-3xl font-bold text-green-700 dark:text-green-300">{totalGeralConversoes}</p>
                <p className="text-xs text-green-600 dark:text-green-400 mt-1">Taxa: {taxaGeralConversao}%</p>
              </div>
              <CheckCircle className="w-10 h-10 text-green-500 dark:text-green-400 opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-purple-200 dark:border-purple-800 bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950 dark:to-purple-900">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-purple-600 dark:text-purple-400 font-medium">Comissões Pagas</p>
                <p className="text-3xl font-bold text-purple-700 dark:text-purple-300">R$ {totalGeralComissao.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</p>
                <p className="text-xs text-purple-600 dark:text-purple-400 mt-1">Média: R$ {totalGeralConversoes > 0 ? (totalGeralComissao / totalGeralConversoes).toFixed(0) : 0}</p>
              </div>
              <DollarSign className="w-10 h-10 text-purple-500 dark:text-purple-400 opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-orange-200 dark:border-orange-800 bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-950 dark:to-orange-900">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-orange-600 dark:text-orange-400 font-medium">Taxa de Conversão</p>
                <p className="text-3xl font-bold text-orange-700 dark:text-orange-300">{taxaGeralConversao}%</p>
                <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">Média do time</p>
              </div>
              <Target className="w-10 h-10 text-orange-500 dark:text-orange-400 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {top3.length > 0 && (
        <Card className="border-2 border-yellow-300 dark:border-yellow-700 bg-gradient-to-r from-yellow-50 via-orange-50 to-red-50 dark:from-yellow-950 dark:via-orange-950 dark:to-red-950">
          <CardHeader className="border-b border-yellow-200 dark:border-yellow-800">
            <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
              <Trophy className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
              Top 3 - Indicações
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="grid md:grid-cols-3 gap-4">
              {top3.map((stat, idx) => {
                const Icon = idx === 0 ? Trophy : idx === 1 ? Medal : Award;
                const colorClass = idx === 0 ? 'from-yellow-400 to-yellow-600' : idx === 1 ? 'from-gray-400 to-gray-600' : 'from-orange-400 to-orange-600';
                
                return (
                  <Card key={stat.agent.id} className={`border-2 ${idx === 0 ? 'border-yellow-400 dark:border-yellow-600' : idx === 1 ? 'border-gray-400 dark:border-gray-600' : 'border-orange-400 dark:border-orange-600'} relative overflow-hidden`}>
                    <div className={`absolute top-0 right-0 w-16 h-16 bg-gradient-to-br ${colorClass} flex items-center justify-center`}>
                      <span className="text-white font-bold text-2xl">{idx + 1}º</span>
                    </div>
                    <CardContent className="p-6 text-center">
                      <div className="flex flex-col items-center">
                        <div className={`w-20 h-20 rounded-full bg-gradient-to-br ${colorClass} flex items-center justify-center border-4 border-white dark:border-gray-800 shadow-lg mb-3`}>
                          <span className="text-white font-bold text-2xl">{stat.agent.name.charAt(0).toUpperCase()}</span>
                        </div>
                        <Icon className={`w-8 h-8 mb-2 ${idx === 0 ? 'text-yellow-600' : idx === 1 ? 'text-gray-600' : 'text-orange-600'}`} />
                        <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100 mb-1">{stat.agent.name}</h3>
                        <div className="grid grid-cols-2 gap-2 w-full mt-3">
                          <div className="bg-green-100 dark:bg-green-950 p-2 rounded">
                            <p className="text-xs text-gray-600 dark:text-gray-400">Conversões</p>
                            <p className="text-lg font-bold text-green-600 dark:text-green-400">{stat.conversoes}</p>
                          </div>
                          <div className="bg-pink-100 dark:bg-pink-950 p-2 rounded">
                            <p className="text-xs text-gray-600 dark:text-gray-400">Indicações</p>
                            <p className="text-lg font-bold text-pink-600 dark:text-pink-400">{stat.totalReferrals}</p>
                          </div>
                          <div className="bg-purple-100 dark:bg-purple-950 p-2 rounded">
                            <p className="text-xs text-gray-600 dark:text-gray-400">Conv.</p>
                            <p className="text-lg font-bold text-purple-600 dark:text-purple-400">{stat.taxaConversao}%</p>
                          </div>
                          <div className="bg-orange-100 dark:bg-orange-950 p-2 rounded">
                            <p className="text-xs text-gray-600 dark:text-gray-400">Comissão</p>
                            <p className="text-sm font-bold text-orange-600 dark:text-orange-400">R$ {stat.comissao.toFixed(0)}</p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <CardHeader className="border-b border-gray-200 dark:border-gray-800">
          <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
            <TrendingUp className="w-5 h-5" />
            Ranking Completo - Indicações
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-gray-200 dark:divide-gray-800">
            {sortedAgents.map((stat, idx) => (
              <div key={stat.agent.id} className="p-4 md:p-6 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className={`w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center font-bold text-base md:text-lg ${
                      idx === 0 ? 'bg-yellow-100 dark:bg-yellow-950 text-yellow-700 dark:text-yellow-300' :
                      idx === 1 ? 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300' :
                      idx === 2 ? 'bg-orange-100 dark:bg-orange-950 text-orange-700 dark:text-orange-300' :
                      'bg-pink-100 dark:bg-pink-950 text-pink-700 dark:text-pink-300'
                    }`}>
                      {idx + 1}º
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">{stat.agent.name}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{stat.referralsAtivos} indicações ativas</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-4 text-center">
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Indicações</p>
                      <p className="font-bold text-pink-600 dark:text-pink-400">{stat.totalReferrals}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Conversões</p>
                      <p className="font-bold text-green-600 dark:text-green-400">{stat.conversoes}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Conv.</p>
                      <p className="font-bold text-purple-600 dark:text-purple-400">{stat.taxaConversao}%</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Comissão</p>
                      <p className="font-bold text-orange-600 dark:text-orange-400">R$ {stat.comissao.toFixed(0)}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {sortedAgents.length === 0 && (
              <div className="p-8 text-center">
                <Users className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                <p className="text-gray-500 dark:text-gray-400">Nenhum vendedor encontrado com os filtros aplicados</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
