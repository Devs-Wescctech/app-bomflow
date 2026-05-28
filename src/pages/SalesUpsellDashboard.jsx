import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { upsell } from "@/api/upsellClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  TrendingUp, 
  Users, 
  DollarSign, 
  Target, 
  Activity,
  Calendar,
  MapPin,
  CheckCircle,
  Clock,
  ArrowUpRight,
  Trophy,
  Sparkles,
  HelpCircle
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import StatsCard from "@/components/dashboard/StatsCard";
import DashboardFilters from "@/components/dashboard/DashboardFilters";
import MetricsHelpDialog from "@/components/dashboard/MetricsHelpDialog";
import { canViewAll, canViewTeam, getVisibleAgents, isUpsellPrivileged } from "@/components/utils/permissions.jsx";
import { isWithinInterval, parseISO, startOfDay, endOfDay } from "date-fns";
import { LEAD_PF_STAGES, isActiveStage, isWonStage, isLostStage } from "@/constants/stages";

const STAGES = LEAD_PF_STAGES;

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

export default function SalesUpsellDashboard() {
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
  const isAdmin = isUpsellPrivileged(user, currentAgent);
  const isSupervisor = user?.role === 'supervisor' || currentAgentType?.includes('supervisor');

  const { data: rawLeads = [] } = useQuery({
    queryKey: ['leads-dashboard', isAdmin ? 'admin' : currentAgent?.id],
    queryFn: async () => {
      const allLeads = await upsell.entities.LeadUpsell.list('-createdDate');

      if (isAdmin) return allLeads;

      if (!currentAgent) return [];

      if (isSupervisor) {
        const visibleAgs = getVisibleAgents(allAgents, currentAgent);
        const visibleIds = new Set(visibleAgs.map(a => a.id));
        return allLeads.filter(l => visibleIds.has(l.agentId) || visibleIds.has(l.promoterId));
      }

      const canSeeAll = canViewAll(currentAgent, 'leads');
      if (canSeeAll) return allLeads;

      const canSeeTeam = canViewTeam(currentAgent, 'leads');
      if (canSeeTeam) {
        const visibleAgs = getVisibleAgents(allAgents, currentAgent);
        const visibleIds = new Set(visibleAgs.map(a => a.id));
        return allLeads.filter(l => visibleIds.has(l.agentId) || visibleIds.has(l.promoterId));
      }

      return allLeads.filter(l =>
        l.agentId === currentAgent.id || l.promoterId === currentAgent.id
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
    queryKey: ['activities'],
    queryFn: () => upsell.entities.ActivityUpsell.list('-createdDate', 50),
    initialData: [],
  });

  const displayAgents = useMemo(() => {
    const base = isAdmin ? agents : getVisibleAgents(agents, currentAgent);
    const salesFiltered = base.filter(a => {
      const agentType = a.agentType || a.agent_type;
      return agentType?.includes('sales') || agentType?.includes('vendas') || agentType === 'admin' || agentType?.includes('supervisor');
    });
    if (!selectedTeam) return salesFiltered;
    return salesFiltered.filter(a => String(a.teamId || a.team_id) === String(selectedTeam));
  }, [agents, currentAgent, isAdmin, selectedTeam]);

  const leads = useMemo(() => {
    let filtered = [...rawLeads];

    if (selectedTeam && !selectedAgent) {
      const teamAgentIds = allAgents
        .filter(a => String(a.teamId || a.team_id) === String(selectedTeam))
        .map(a => String(a.id));
      filtered = filtered.filter(l => teamAgentIds.includes(String(l.agentId)) || teamAgentIds.includes(String(l.promoterId)));
    }

    if (selectedAgent) {
      filtered = filtered.filter(l => l.agentId === selectedAgent || l.promoterId === selectedAgent);
    }

    if (selectedStage) {
      filtered = filtered.filter(l => l.stage === selectedStage);
    }

    if (dateRange?.from) {
      filtered = filtered.filter(l => {
        const leadDate = l.createdAt || l.created_at || l.createdDate;
        if (!leadDate) return true;
        try {
          const date = typeof leadDate === 'string' ? parseISO(leadDate) : new Date(leadDate);
          const from = startOfDay(dateRange.from);
          const to = dateRange.to ? endOfDay(dateRange.to) : endOfDay(dateRange.from);
          return isWithinInterval(date, { start: from, end: to });
        } catch {
          return true;
        }
      });
    }

    return filtered;
  }, [rawLeads, selectedAgent, selectedStage, selectedTeam, dateRange, allAgents]);

  const handleClearFilters = () => {
    setSelectedAgent(null);
    setSelectedStage(null);
    setSelectedTeam(null);
    setSelectedPeriod("all");
    setDateRange({ from: null, to: null });
  };

  const totalLeads = leads.length;
  const leadsNovos = leads.filter(l => l.stage === 'novo').length;
  const leadsQualificados = leads.filter(l => l.stage === 'qualificado').length;
  const vendas = leads.filter(l => isWonStage(l.stage)).length;
  const perdidos = leads.filter(l => isLostStage(l.stage)).length;
  const taxaConversao = totalLeads > 0 ? ((vendas / totalLeads) * 100).toFixed(1) : 0;
  
  const getLeadValue = (lead) => {
    return parseFloat(lead.value) || parseFloat(lead.monthlyValue) || parseFloat(lead.monthly_value) || 0;
  };

  const receitaTotal = leads
    .filter(l => isWonStage(l.stage))
    .reduce((sum, l) => sum + getLeadValue(l), 0);

  const ticketMedio = vendas > 0 ? (receitaTotal / vendas).toFixed(2) : 0;
  const atividadesPendentes = activities.filter(a => !a.completed && a.type === 'task').length;

  const topAgents = agents
    .map(agent => {
      const agentLeads = leads.filter(l => l.agentId === agent.id);
      const agentVendas = agentLeads.filter(l => isWonStage(l.stage)).length;
      return { ...agent, vendas: agentVendas, total: agentLeads.length };
    })
    .sort((a, b) => b.vendas - a.vendas)
    .slice(0, 5);

  const leadsAtivos = leads.filter(l => isActiveStage(l.stage)).length;

  const stageData = [
    { stage: 'Novo', count: leadsNovos, color: 'blue', gradient: 'from-blue-500 to-cyan-500' },
    { stage: 'Abordado', count: leads.filter(l => l.stage === 'abordado').length, color: 'purple', gradient: 'from-purple-500 to-violet-500' },
    { stage: 'Qualificado', count: leadsQualificados, color: 'indigo', gradient: 'from-indigo-500 to-blue-500' },
    { stage: 'Proposta', count: leads.filter(l => l.stage === 'proposta_enviada').length, color: 'amber', gradient: 'from-amber-500 to-orange-500' },
    { stage: 'Negociação', count: leads.filter(l => l.stage === 'negociacao').length, color: 'pink', gradient: 'from-pink-500 to-rose-500' },
    { stage: 'Fechado', count: leads.filter(l => isWonStage(l.stage)).length, color: 'emerald', gradient: 'from-emerald-500 to-teal-500' },
  ];

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
          <h1 className="text-3xl font-bold font-display bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
            Dashboard de Upsell
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Performance e métricas do time de vendas
          </p>
        </div>
        <div className="flex items-center gap-2">
          <MetricsHelpDialog type="sales">
            <Button variant="outline" size="sm" className="gap-2">
              <HelpCircle className="h-4 w-4" />
              Como funciona?
            </Button>
          </MetricsHelpDialog>
          <Badge variant="glass" className="flex items-center gap-2">
            <Sparkles className="w-3 h-3" />
            {agents.filter(a => a.active).length} agentes ativos
          </Badge>
        </div>
      </motion.div>

      <motion.div variants={itemVariants}>
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
          showAgentFilter={isAdmin || isSupervisor}
          showTeamFilter={isAdmin || isSupervisor}
        />
      </motion.div>

      <motion.div 
        variants={itemVariants}
        className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4"
      >
        <StatsCard
          title="Total de Leads"
          value={totalLeads}
          icon={Users}
          color="blue"
          subtitle={`${leadsNovos} novos`}
          delay={0}
        />
        <StatsCard
          title="Vendas Fechadas"
          value={`R$ ${receitaTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
          icon={Trophy}
          color="green"
          subtitle={`${vendas} vendas • ${taxaConversao}% conversão`}
          delay={0.05}
        />
        <StatsCard
          title="Leads Ativos"
          value={leadsAtivos}
          icon={Activity}
          color="purple"
          subtitle={`${perdidos} perdidos`}
          delay={0.1}
        />
        <StatsCard
          title="Ticket Médio"
          value={`R$ ${parseFloat(ticketMedio).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
          icon={Target}
          color="blue"
          delay={0.2}
        />
        <StatsCard
          title="Tarefas Pendentes"
          value={atividadesPendentes}
          icon={Clock}
          color="orange"
          delay={0.3}
        />
      </motion.div>

      <div className="grid lg:grid-cols-2 gap-6">
        <motion.div variants={itemVariants}>
          <Card className="glass-card border-0 shadow-soft overflow-hidden">
            <CardHeader className="border-b border-gray-100 dark:border-gray-800 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/50 dark:to-teal-950/50">
              <CardTitle className="text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <div className="p-2 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 text-white">
                  <TrendingUp className="w-4 h-4" />
                </div>
                Pipeline de Vendas
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-5">
              {stageData.map((item, index) => {
                const percentage = totalLeads > 0 ? (item.count / totalLeads) * 100 : 0;
                
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
                Top Performers
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
                    'bg-gradient-to-br from-blue-500 to-cyan-500'
                  }`}>
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{agent.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{agent.total} leads • {agent.vendas} vendas</p>
                  </div>
                  <Badge variant="success" className="shrink-0">
                    {agent.total > 0 ? ((agent.vendas / agent.total) * 100).toFixed(0) : 0}%
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
        <Link to={createPageUrl("LeadsUpsellKanban")}>
          <motion.div whileHover={{ y: -4 }} whileTap={{ scale: 0.98 }}>
            <Card className="glass-card border-0 shadow-soft bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-950/50 dark:to-cyan-950/50 hover:shadow-soft-lg transition-all cursor-pointer group">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 text-white shadow-lg shadow-blue-500/30 group-hover:scale-110 transition-transform">
                    <TrendingUp className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900 dark:text-gray-100">Pipeline de Vendas</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Gerencie seus leads</p>
                  </div>
                  <ArrowUpRight className="w-5 h-5 text-gray-400 group-hover:text-blue-500 group-hover:translate-x-1 group-hover:-translate-y-1 transition-all" />
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </Link>

        <Link to={createPageUrl("LeadsUpsellKanban")}>
          <motion.div whileHover={{ y: -4 }} whileTap={{ scale: 0.98 }}>
            <Card className="glass-card border-0 shadow-soft bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/50 dark:to-teal-950/50 hover:shadow-soft-lg transition-all cursor-pointer group">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/30 group-hover:scale-110 transition-transform">
                    <MapPin className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900 dark:text-gray-100">Mapa de Leads</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Visão geográfica</p>
                  </div>
                  <ArrowUpRight className="w-5 h-5 text-gray-400 group-hover:text-emerald-500 group-hover:translate-x-1 group-hover:-translate-y-1 transition-all" />
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </Link>

        <Link to={createPageUrl("SalesTasks")}>
          <motion.div whileHover={{ y: -4 }} whileTap={{ scale: 0.98 }}>
            <Card className="glass-card border-0 shadow-soft bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/50 dark:to-orange-950/50 hover:shadow-soft-lg transition-all cursor-pointer group">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/30 group-hover:scale-110 transition-transform">
                    <Calendar className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900 dark:text-gray-100">Tarefas & Follow-ups</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{atividadesPendentes} pendentes</p>
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