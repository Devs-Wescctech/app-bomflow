import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  TrendingUp, 
  Users, 
  DollarSign, 
  Target, 
  Activity,
  UserPlus,
  CheckCircle,
  Clock,
  ArrowUpRight,
  Trophy,
  Sparkles,
  Gift,
  HelpCircle
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import StatsCard from "@/components/dashboard/StatsCard";
import DashboardFilters from "@/components/dashboard/DashboardFilters";
import MetricsHelpDialog from "@/components/dashboard/MetricsHelpDialog";
import { canViewAll, canViewTeam } from "@/components/utils/permissions.jsx";
import { isWithinInterval, parseISO, startOfDay, endOfDay } from "date-fns";
import { REFERRAL_STAGES as REFERRAL_STAGES_CONST, isActiveStage, isWonStage, isLostStage } from "@/constants/stages";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 }
};

const REFERRAL_STAGES = REFERRAL_STAGES_CONST;

export default function ReferralDashboard() {
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [selectedStage, setSelectedStage] = useState(null);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState("all");
  const [dateRange, setDateRange] = useState({ from: null, to: null });

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: allAgents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: () => base44.entities.Agent.list(),
    initialData: [],
  });

  const currentAgent = user?.agent;
  const currentAgentType = currentAgent?.agentType || currentAgent?.agent_type;
  const isAdmin = user?.role === 'admin' || currentAgentType === 'admin';
  const isSupervisor = user?.role === 'supervisor' || currentAgentType?.includes('supervisor');

  const { data: rawReferrals = [] } = useQuery({
    queryKey: ['referrals-dashboard', isAdmin ? 'admin' : isSupervisor ? 'supervisor' : currentAgent?.id],
    queryFn: async () => {
      const allReferrals = await base44.entities.Referral.list('-createdAt');
      
      if (isAdmin || isSupervisor) {
        return allReferrals;
      }
      
      if (!currentAgent) return [];
      
      const canSeeAll = canViewAll(currentAgent, 'referrals');
      if (canSeeAll) {
        return allReferrals;
      }
      
      const canSeeTeam = canViewTeam(currentAgent, 'referrals');
      if (canSeeTeam) {
        const teamAgents = allAgents.filter(a => (a.teamId || a.team_id) === (currentAgent.teamId || currentAgent.team_id));
        const teamAgentIds = teamAgents.map(a => a.id);
        return allReferrals.filter(r => 
          teamAgentIds.includes(r.agentId || r.agent_id)
        );
      }
      
      return allReferrals.filter(r => 
        (r.agentId || r.agent_id) === currentAgent.id
      );
    },
    enabled: !!user && !!currentAgent,
  });

  const agents = allAgents;

  const { data: teams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: () => base44.entities.Team.list(),
  });

  const { data: activities = [] } = useQuery({
    queryKey: ['referral-activities'],
    queryFn: () => base44.entities.ReferralActivity.list('-createdDate', 50),
    initialData: [],
  });

  const indicacoesAgents = useMemo(() => {
    return agents.filter(a => {
      const agentType = a.agentType || a.agent_type;
      return agentType === 'indicacoes_atendente';
    });
  }, [agents]);

  const indicacoesAgentIds = useMemo(() => {
    return new Set(indicacoesAgents.map(a => String(a.id)));
  }, [indicacoesAgents]);

  const displayAgents = useMemo(() => {
    if (!selectedTeam) return indicacoesAgents;
    return indicacoesAgents.filter(a => String(a.teamId || a.team_id) === String(selectedTeam));
  }, [indicacoesAgents, selectedTeam]);

  const referrals = useMemo(() => {
    let filtered = rawReferrals.filter(r => {
      const agentId = String(r.agentId || r.agent_id || '');
      return indicacoesAgentIds.has(agentId);
    });

    if (selectedTeam && !selectedAgent) {
      const teamAgentIds = indicacoesAgents
        .filter(a => String(a.teamId || a.team_id) === String(selectedTeam))
        .map(a => String(a.id));
      filtered = filtered.filter(r => teamAgentIds.includes(String(r.agentId || r.agent_id)));
    }

    if (selectedAgent) {
      filtered = filtered.filter(r => (r.agentId || r.agent_id) === selectedAgent);
    }

    if (selectedStage) {
      filtered = filtered.filter(r => r.stage === selectedStage);
    }

    if (dateRange?.from) {
      filtered = filtered.filter(r => {
        const refDate = r.createdAt || r.created_at;
        if (!refDate) return true;
        try {
          const date = typeof refDate === 'string' ? parseISO(refDate) : new Date(refDate);
          const from = startOfDay(dateRange.from);
          const to = dateRange.to ? endOfDay(dateRange.to) : endOfDay(dateRange.from);
          return isWithinInterval(date, { start: from, end: to });
        } catch {
          return true;
        }
      });
    }

    return filtered;
  }, [rawReferrals, selectedAgent, selectedStage, selectedTeam, dateRange, indicacoesAgentIds, indicacoesAgents]);

  const handleClearFilters = () => {
    setSelectedAgent(null);
    setSelectedStage(null);
    setSelectedTeam(null);
    setSelectedPeriod("all");
    setDateRange({ from: null, to: null });
  };

  const totalReferrals = referrals.length;
  const referralsNovos = referrals.filter(r => r.stage === 'novo').length;
  const referralsPropostas = referrals.filter(r => r.stage === 'proposta_enviada').length;
  const conversoes = referrals.filter(r => r.stage === 'fechado_ganho').length;
  const perdidos = referrals.filter(r => r.stage === 'fechado_perdido').length;
  const referralsAtivos = referrals.filter(r => 
    r.stage !== 'fechado_ganho' && r.stage !== 'fechado_perdido'
  ).length;
  const taxaConversao = totalReferrals > 0 ? ((conversoes / totalReferrals) * 100).toFixed(1) : 0;
  
  const getReferralValue = (r) => {
    return parseFloat(r.value) || parseFloat(r.monthlyValue) || parseFloat(r.monthly_value) || 0;
  };

  const comissaoTotal = referrals
    .filter(r => r.stage === 'fechado_ganho')
    .reduce((sum, r) => sum + (parseFloat(r.commissionValue || r.commission_value) || 0), 0);

  const valorPipeline = referrals
    .filter(r => !['fechado_ganho', 'fechado_perdido'].includes(r.stage))
    .reduce((sum, r) => sum + getReferralValue(r), 0);

  const valorGanho = referrals
    .filter(r => r.stage === 'fechado_ganho')
    .reduce((sum, r) => sum + getReferralValue(r), 0);

  const comissaoMedia = conversoes > 0 ? (comissaoTotal / conversoes).toFixed(2) : 0;
  const atividadesPendentes = activities.filter(a => !a.completed && a.type === 'task').length;

  const topAgents = indicacoesAgents
    .map(agent => {
      const agentReferrals = referrals.filter(r => (r.agentId || r.agent_id) === agent.id);
      const agentConversoes = agentReferrals.filter(r => r.stage === 'fechado_ganho').length;
      return { ...agent, conversoes: agentConversoes, total: agentReferrals.length };
    })
    .sort((a, b) => b.conversoes - a.conversoes)
    .slice(0, 5);

  const stageData = REFERRAL_STAGES
    .filter(stage => stage.id !== 'fechado_perdido')
    .map(stage => ({
      stage: stage.label,
      count: referrals.filter(r => r.stage === stage.id).length,
      gradient: stage.gradient
    }));

  return (
    <motion.div 
      className="p-6 space-y-6 min-h-screen"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <motion.div 
        variants={itemVariants}
        className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4"
      >
        <div>
          <h1 className="text-3xl font-bold font-display bg-gradient-to-r from-pink-600 to-rose-600 bg-clip-text text-transparent">
            Dashboard de Indicações
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-2">
            <Gift className="w-4 h-4" />
            Performance e métricas do programa de indicações
          </p>
        </div>
        <div className="flex items-center gap-2">
          <MetricsHelpDialog type="referral">
            <Button variant="outline" size="sm" className="gap-2">
              <HelpCircle className="h-4 w-4" />
              Como funciona?
            </Button>
          </MetricsHelpDialog>
          <Badge variant="glass" className="flex items-center gap-2">
            <Sparkles className="w-3 h-3" />
            {indicacoesAgents.filter(a => a.active).length} agentes ativos
          </Badge>
        </div>
      </motion.div>

      <motion.div variants={itemVariants}>
        <DashboardFilters
          agents={displayAgents}
          stages={REFERRAL_STAGES}
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
          showAgentFilter={isAdmin || isSupervisor}
          showTeamFilter={isAdmin || isSupervisor}
        />
      </motion.div>

      <motion.div 
        variants={itemVariants}
        className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4"
      >
        <StatsCard
          title="Total de Indicações"
          value={totalReferrals}
          icon={UserPlus}
          color="pink"
          subtitle={`${referralsNovos} novas`}
          delay={0}
        />
        <StatsCard
          title="Vendas Fechadas"
          value={`R$ ${valorGanho.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
          icon={Trophy}
          color="green"
          subtitle={`${conversoes} convertidas • ${taxaConversao}% conversão`}
          delay={0.05}
        />
        <StatsCard
          title="Em Andamento"
          value={referralsAtivos}
          icon={Activity}
          color="purple"
          subtitle={`${perdidos} perdidas`}
          delay={0.1}
        />
        <StatsCard
          title="Comissões"
          value={`R$ ${comissaoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
          icon={Gift}
          color="orange"
          subtitle={`Média: R$ ${comissaoMedia}`}
          delay={0.2}
        />
        <StatsCard
          title="Tarefas Pendentes"
          value={atividadesPendentes}
          icon={Clock}
          color="blue"
          delay={0.3}
        />
      </motion.div>

      <div className="grid lg:grid-cols-2 gap-6">
        <motion.div variants={itemVariants}>
          <Card className="glass-card border-0 shadow-soft overflow-hidden">
            <CardHeader className="border-b border-gray-100 dark:border-gray-800 bg-gradient-to-r from-pink-50 to-rose-50 dark:from-pink-950/50 dark:to-rose-950/50">
              <CardTitle className="text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <div className="p-2 rounded-lg bg-gradient-to-br from-pink-500 to-rose-500 text-white">
                  <TrendingUp className="w-4 h-4" />
                </div>
                Pipeline de Indicações
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-5">
              {stageData.map((item, index) => {
                const percentage = totalReferrals > 0 ? (item.count / totalReferrals) * 100 : 0;
                
                return (
                  <motion.div 
                    key={item.stage}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{item.stage}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-gray-900 dark:text-gray-100">{item.count}</span>
                        <Badge variant="glass" className="text-xs">
                          {percentage.toFixed(0)}%
                        </Badge>
                      </div>
                    </div>
                    <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                      <motion.div 
                        className={`h-full bg-gradient-to-r ${item.gradient} rounded-full`}
                        initial={{ width: 0 }}
                        animate={{ width: `${percentage}%` }}
                        transition={{ duration: 0.8, delay: index * 0.1 }}
                      />
                    </div>
                  </motion.div>
                );
              })}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card className="glass-card border-0 shadow-soft overflow-hidden">
            <CardHeader className="border-b border-gray-100 dark:border-gray-800 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/50 dark:to-orange-950/50">
              <CardTitle className="text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <div className="p-2 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 text-white">
                  <Trophy className="w-4 h-4" />
                </div>
                Top Performers - Indicações
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              {topAgents.map((agent, index) => (
                <motion.div 
                  key={agent.id} 
                  className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <div className={`flex items-center justify-center w-10 h-10 rounded-xl text-white font-bold text-sm shadow-md ${
                    index === 0 ? 'bg-gradient-to-br from-amber-400 to-orange-500' :
                    index === 1 ? 'bg-gradient-to-br from-gray-300 to-gray-400' :
                    index === 2 ? 'bg-gradient-to-br from-amber-600 to-amber-700' :
                    'bg-gradient-to-br from-pink-500 to-rose-500'
                  }`}>
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{agent.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{agent.total} indicações • {agent.conversoes} conversões</p>
                  </div>
                  <Badge variant="success" className="shrink-0">
                    {agent.total > 0 ? ((agent.conversoes / agent.total) * 100).toFixed(0) : 0}%
                  </Badge>
                </motion.div>
              ))}
              {topAgents.length === 0 && (
                <div className="text-center py-8">
                  <Users className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                  <p className="text-gray-500 dark:text-gray-400 text-sm">
                    Nenhum dado disponível
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <motion.div 
        variants={itemVariants}
        className="grid md:grid-cols-3 gap-4"
      >
        <Link to={createPageUrl("ReferralPipeline")}>
          <motion.div whileHover={{ y: -4 }} whileTap={{ scale: 0.98 }}>
            <Card className="glass-card border-0 shadow-soft bg-gradient-to-br from-pink-50 to-rose-50 dark:from-pink-950/50 dark:to-rose-950/50 hover:shadow-soft-lg transition-all cursor-pointer group">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-gradient-to-br from-pink-500 to-rose-500 text-white shadow-lg shadow-pink-500/30 group-hover:scale-110 transition-transform">
                    <TrendingUp className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900 dark:text-gray-100">Pipeline de Indicações</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Gerencie indicações</p>
                  </div>
                  <ArrowUpRight className="w-5 h-5 text-gray-400 group-hover:text-pink-500 group-hover:translate-x-1 group-hover:-translate-y-1 transition-all" />
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </Link>

        <Link to={createPageUrl("ReferralAgentsDashboard")}>
          <motion.div whileHover={{ y: -4 }} whileTap={{ scale: 0.98 }}>
            <Card className="glass-card border-0 shadow-soft bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/50 dark:to-teal-950/50 hover:shadow-soft-lg transition-all cursor-pointer group">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/30 group-hover:scale-110 transition-transform">
                    <Users className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900 dark:text-gray-100">Vendedores</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Performance individual</p>
                  </div>
                  <ArrowUpRight className="w-5 h-5 text-gray-400 group-hover:text-emerald-500 group-hover:translate-x-1 group-hover:-translate-y-1 transition-all" />
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </Link>

        <Link to={createPageUrl("ReferralReports")}>
          <motion.div whileHover={{ y: -4 }} whileTap={{ scale: 0.98 }}>
            <Card className="glass-card border-0 shadow-soft bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/50 dark:to-orange-950/50 hover:shadow-soft-lg transition-all cursor-pointer group">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/30 group-hover:scale-110 transition-transform">
                    <Target className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900 dark:text-gray-100">Relatórios</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Análises detalhadas</p>
                  </div>
                  <ArrowUpRight className="w-5 h-5 text-gray-400 group-hover:text-amber-500 group-hover:translate-x-1 group-hover:-translate-y-1 transition-all" />
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </Link>
      </motion.div>
    </motion.div>
  );
}
