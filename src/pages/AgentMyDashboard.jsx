import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
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
  Gift,
  Building2,
  User,
  Phone,
  AlertCircle,
  Sparkles
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import StatsCard from "@/components/dashboard/StatsCard";
import DashboardFilters from "@/components/dashboard/DashboardFilters";
import { format, isToday, isPast, isFuture, parseISO, startOfMonth, endOfMonth, isWithinInterval, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";

const isTruthy = (val) => val === true || val === 't' || val === 'true' || val === 1 || val === '1';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 }
};

const STAGES_PF = [
  { id: 'novo', label: 'Novo', color: 'bg-purple-500' },
  { id: 'abordado', label: 'Abordado', color: 'bg-blue-500' },
  { id: 'qualificado', label: 'Qualificado', color: 'bg-indigo-500' },
  { id: 'proposta_enviada', label: 'Proposta Enviada', color: 'bg-amber-500' },
  { id: 'negociacao', label: 'Negociação', color: 'bg-pink-500' },
  { id: 'fechado_ganho', label: 'Ganho', color: 'bg-green-500' },
  { id: 'fechado_perdido', label: 'Perdido', color: 'bg-red-500' },
];

const STAGES_PJ = [
  { id: 'novo', label: 'Novo', color: 'bg-purple-500' },
  { id: 'qualificacao', label: 'Qualificação', color: 'bg-blue-500' },
  { id: 'apresentacao', label: 'Apresentação', color: 'bg-cyan-500' },
  { id: 'proposta_enviada', label: 'Proposta Enviada', color: 'bg-amber-500' },
  { id: 'negociacao', label: 'Negociação', color: 'bg-pink-500' },
  { id: 'fechado_ganho', label: 'Ganho', color: 'bg-green-500' },
  { id: 'fechado_perdido', label: 'Perdido', color: 'bg-red-500' },
];

const STAGES_REFERRAL = [
  { id: 'novo', label: 'Novo', color: 'bg-purple-500' },
  { id: 'contato_iniciado', label: 'Contato', color: 'bg-cyan-500' },
  { id: 'proposta_enviada', label: 'Proposta', color: 'bg-amber-500' },
  { id: 'fechado_ganho', label: 'Convertido', color: 'bg-green-500' },
  { id: 'fechado_perdido', label: 'Perdido', color: 'bg-red-500' },
];

const PERIOD_LABELS = {
  today: 'Hoje',
  yesterday: 'Ontem',
  last7days: 'Últimos 7 dias',
  last30days: 'Últimos 30 dias',
  thisMonth: 'Este mês',
  lastMonth: 'Mês passado',
  thisYear: 'Este ano',
  all: 'Todo período'
};

export default function AgentMyDashboard() {
  const navigate = useNavigate();
  const [selectedPeriod, setSelectedPeriod] = useState("thisMonth");
  const [dateRange, setDateRange] = useState({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) });

  const { data: user, isLoading: loadingUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const currentAgent = user?.agent;
  const currentAgentId = currentAgent?.id;
  const agentType = currentAgent?.agent_type || currentAgent?.agentType;
  const isSalesAgentOnly = agentType === 'sales';

  useEffect(() => {
    if (!loadingUser && currentAgent && !isSalesAgentOnly) {
      navigate('/Dashboard');
    }
  }, [loadingUser, currentAgent, isSalesAgentOnly, navigate]);

  const { data: leadsPF = [], isLoading: loadingLeadsPF } = useQuery({
    queryKey: ['leads'],
    queryFn: () => base44.entities.Lead.list('-createdDate'),
    enabled: !!currentAgentId,
    staleTime: 0,
  });

  const { data: leadsPJ = [], isLoading: loadingLeadsPJ } = useQuery({
    queryKey: ['leadsPJ'],
    queryFn: () => base44.entities.LeadPJ.list('-createdDate'),
    enabled: !!currentAgentId,
    staleTime: 0,
  });

  const { data: referrals = [], isLoading: loadingReferrals } = useQuery({
    queryKey: ['referrals'],
    queryFn: () => base44.entities.Referral.list('-createdAt'),
    enabled: !!currentAgentId,
    staleTime: 0,
  });

  const { data: activities = [], isLoading: loadingActivities } = useQuery({
    queryKey: ['activities'],
    queryFn: () => base44.entities.Activity.list('-scheduledAt', 200),
    enabled: !!currentAgentId,
    staleTime: 0,
  });

  const { data: visits = [], isLoading: loadingVisits } = useQuery({
    queryKey: ['visits'],
    queryFn: () => base44.entities.Visit.list('-visitedAt', 100),
    enabled: !!currentAgentId,
    staleTime: 0,
  });

  const myLeadsPF = useMemo(() => {
    if (!currentAgentId) return [];
    return leadsPF.filter(l => (l.agentId || l.agent_id) === currentAgentId);
  }, [leadsPF, currentAgentId]);

  const myLeadsPJ = useMemo(() => {
    if (!currentAgentId) return [];
    return leadsPJ.filter(l => (l.agentId || l.agent_id) === currentAgentId);
  }, [leadsPJ, currentAgentId]);

  const myReferrals = useMemo(() => {
    if (!currentAgentId) return [];
    return referrals.filter(r => (r.agentId || r.agent_id) === currentAgentId);
  }, [referrals, currentAgentId]);

  const myLeadIds = useMemo(() => {
    const pfIds = myLeadsPF.map(l => l.id);
    const pjIds = myLeadsPJ.map(l => l.id);
    return new Set([...pfIds, ...pjIds]);
  }, [myLeadsPF, myLeadsPJ]);

  const myActivities = useMemo(() => {
    if (!currentAgentId || myLeadIds.size === 0) return [];
    return activities.filter(a => {
      const leadId = a.leadId || a.lead_id;
      const assignedTo = a.assignedTo || a.assigned_to;
      const createdBy = a.createdBy || a.created_by;
      return myLeadIds.has(leadId) || assignedTo === currentAgentId || createdBy === currentAgentId;
    });
  }, [activities, currentAgentId, myLeadIds]);

  const myVisits = useMemo(() => {
    if (!currentAgentId) return [];
    return visits.filter(v => (v.agentId || v.agent_id) === currentAgentId);
  }, [visits, currentAgentId]);

  const filterByPeriod = (items, dateField) => {
    if (selectedPeriod === 'all' || !dateRange.from || !dateRange.to) return items;
    const from = startOfDay(dateRange.from);
    const to = endOfDay(dateRange.to);
    
    const snakeCaseField = dateField.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    
    return items.filter(item => {
      const date = item[dateField] || item[snakeCaseField];
      if (!date) return false;
      try {
        const parsed = typeof date === 'string' ? parseISO(date) : date;
        return isWithinInterval(parsed, { start: from, end: to });
      } catch {
        return false;
      }
    });
  };

  const pfStats = useMemo(() => {
    const filtered = selectedPeriod === 'all' ? myLeadsPF : filterByPeriod(myLeadsPF, 'createdAt');
    const total = filtered.length;
    const won = filtered.filter(l => l.stage === 'fechado_ganho').length;
    const lost = filtered.filter(l => l.stage === 'fechado_perdido').length;
    const active = filtered.filter(l => l.stage !== 'fechado_ganho' && l.stage !== 'fechado_perdido').length;
    const getLeadValue = (lead) => {
      return parseFloat(lead.value) || parseFloat(lead.monthlyValue) || parseFloat(lead.monthly_value) || 0;
    };
    const wonValue = filtered.filter(l => l.stage === 'fechado_ganho').reduce((sum, l) => sum + getLeadValue(l), 0);
    const lostValue = filtered.filter(l => l.stage === 'fechado_perdido').reduce((sum, l) => sum + getLeadValue(l), 0);
    const pipelineValue = filtered.filter(l => l.stage !== 'fechado_ganho' && l.stage !== 'fechado_perdido').reduce((sum, l) => sum + getLeadValue(l), 0);
    const conversionRate = total > 0 ? ((won / total) * 100).toFixed(1) : 0;
    
    console.log('[AgentMyDashboard] PF Stats Debug:', {
      currentAgentId,
      allLeadsPF: leadsPF.length,
      myLeadsPFCount: myLeadsPF.length,
      filteredCount: filtered.length,
      selectedPeriod,
      wonCount: won,
      wonValue,
      lostCount: lost,
      lostValue,
      pipelineValue,
    });
    
    return { total, won, lost, active, wonValue, lostValue, pipelineValue, conversionRate };
  }, [myLeadsPF, selectedPeriod, dateRange, leadsPF, currentAgentId]);

  const pjStats = useMemo(() => {
    const filtered = selectedPeriod === 'all' ? myLeadsPJ : filterByPeriod(myLeadsPJ, 'createdAt');
    const total = filtered.length;
    const won = filtered.filter(l => l.stage === 'fechado_ganho').length;
    const lost = filtered.filter(l => l.stage === 'fechado_perdido').length;
    const active = filtered.filter(l => !['fechado_ganho', 'fechado_perdido'].includes(l.stage)).length;
    
    const getLeadValue = (lead) => {
      const value = parseFloat(lead.value) || parseFloat(lead.monthlyValue) || parseFloat(lead.monthly_value) || parseFloat(lead.monthlyRevenue) || parseFloat(lead.monthly_revenue) || 0;
      return value;
    };
    
    const wonValue = filtered.filter(l => l.stage === 'fechado_ganho').reduce((sum, l) => sum + getLeadValue(l), 0);
    const lostValue = filtered.filter(l => l.stage === 'fechado_perdido').reduce((sum, l) => sum + getLeadValue(l), 0);
    const pipelineValue = filtered.filter(l => !['fechado_ganho', 'fechado_perdido'].includes(l.stage)).reduce((sum, l) => sum + getLeadValue(l), 0);
    const conversionRate = total > 0 ? ((won / total) * 100).toFixed(1) : 0;
    
    console.log('[AgentMyDashboard] PJ Stats Debug:', {
      currentAgentId,
      allLeadsPJ: leadsPJ.length,
      myLeadsPJCount: myLeadsPJ.length,
      filteredCount: filtered.length,
      selectedPeriod,
      wonValue,
      lostValue,
      wonLeads: filtered.filter(l => l.stage === 'fechado_ganho').map(l => ({ id: l.id, value: l.value, monthly_value: l.monthly_value })),
      lostLeads: filtered.filter(l => l.stage === 'fechado_perdido').map(l => ({ id: l.id, value: l.value, monthly_value: l.monthly_value })),
    });
    
    return { total, won, lost, active, wonValue, lostValue, pipelineValue, conversionRate };
  }, [myLeadsPJ, selectedPeriod, dateRange, leadsPJ, currentAgentId]);

  const referralStats = useMemo(() => {
    const filtered = selectedPeriod === 'all' ? myReferrals : filterByPeriod(myReferrals, 'createdAt');
    const total = filtered.length;
    const converted = filtered.filter(r => r.stage === 'fechado_ganho').length;
    const lost = filtered.filter(r => r.stage === 'fechado_perdido').length;
    const active = filtered.filter(r => !['fechado_ganho', 'fechado_perdido'].includes(r.stage)).length;
    
    const getReferralValue = (r) => {
      return parseFloat(r.value) || parseFloat(r.monthlyValue) || parseFloat(r.monthly_value) || 0;
    };
    
    const totalCommission = filtered.reduce((sum, r) => sum + (parseFloat(r.commissionValue || r.commission_value) || 0), 0);
    const paidCommission = filtered.filter(r => r.commissionStatus === 'paga' || r.commission_status === 'paga').reduce((sum, r) => sum + (parseFloat(r.commissionValue || r.commission_value) || 0), 0);
    const pendingCommission = totalCommission - paidCommission;
    const wonValue = filtered.filter(r => r.stage === 'fechado_ganho').reduce((sum, r) => sum + getReferralValue(r), 0);
    const lostValue = filtered.filter(r => r.stage === 'fechado_perdido').reduce((sum, r) => sum + getReferralValue(r), 0);
    const pipelineValue = filtered.filter(r => !['fechado_ganho', 'fechado_perdido'].includes(r.stage)).reduce((sum, r) => sum + getReferralValue(r), 0);
    const conversionRate = total > 0 ? ((converted / total) * 100).toFixed(1) : 0;
    
    console.log('[AgentMyDashboard] Referral Debug:', {
      currentAgentId,
      allReferrals: referrals.length,
      myReferralsCount: myReferrals.length,
      filteredCount: filtered.length,
      selectedPeriod,
      dateRange: dateRange ? { from: dateRange.from?.toISOString(), to: dateRange.to?.toISOString() } : null,
      stages: filtered.map(r => r.stage),
      pipelineValue,
      wonValue,
      lostValue,
    });
    
    return { total, converted, lost, active, totalCommission, paidCommission, pendingCommission, wonValue, lostValue, pipelineValue, conversionRate };
  }, [myReferrals, selectedPeriod, dateRange, referrals, currentAgentId]);

  const activityStats = useMemo(() => {
    const now = new Date();
    const todayActivities = myActivities.filter(a => {
      try {
        const scheduledAt = a.scheduledAt || a.scheduled_at;
        if (!scheduledAt) return false;
        const date = parseISO(scheduledAt);
        return isToday(date);
      } catch {
        return false;
      }
    });
    const pendingToday = todayActivities.filter(a => !isTruthy(a.completed) && !isTruthy(a.is_completed)).length;
    const completedToday = todayActivities.filter(a => isTruthy(a.completed) || isTruthy(a.is_completed)).length;
    const overdue = myActivities.filter(a => {
      try {
        const scheduledAt = a.scheduledAt || a.scheduled_at;
        if (!scheduledAt) return false;
        const date = parseISO(scheduledAt);
        const isCompleted = isTruthy(a.completed) || isTruthy(a.is_completed);
        return isPast(date) && !isCompleted && !isToday(date);
      } catch {
        return false;
      }
    }).length;
    const upcoming = myActivities.filter(a => {
      try {
        const scheduledAt = a.scheduledAt || a.scheduled_at;
        if (!scheduledAt) return false;
        const date = parseISO(scheduledAt);
        const isCompleted = isTruthy(a.completed) || isTruthy(a.is_completed);
        return isFuture(date) && !isCompleted;
      } catch {
        return false;
      }
    }).length;
    console.log('[AgentMyDashboard] Activity Stats Debug:', {
      currentAgentId,
      allActivities: activities?.length || 0,
      myActivitiesCount: myActivities.length,
      myLeadIdsCount: myLeadIds?.size || 0,
      todayActivitiesCount: todayActivities.length,
      pendingToday,
      completedToday,
      overdue,
      upcoming,
      sampleActivities: myActivities.slice(0, 3).map(a => ({ 
        id: a.id, 
        type: a.type || a.activity_type, 
        leadId: a.leadId || a.lead_id,
        scheduledAt: a.scheduledAt || a.scheduled_at,
        completed: a.completed
      })),
    });
    
    return { pendingToday, completedToday, overdue, upcoming, todayActivities };
  }, [myActivities, activities, currentAgentId, myLeadIds]);

  const visitStats = useMemo(() => {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);
    
    const visitActivities = myActivities.filter(a => {
      const activityType = a.type || a.activity_type;
      return activityType === 'visit';
    });
    
    const thisMonthVisits = visitActivities.filter(v => {
      try {
        const scheduledAt = v.scheduledAt || v.scheduled_at;
        if (!scheduledAt) return false;
        const date = parseISO(scheduledAt);
        return isWithinInterval(date, { start: monthStart, end: monthEnd });
      } catch {
        return false;
      }
    });
    
    const completedVisits = visitActivities.filter(v => {
      const isCompleted = isTruthy(v.completed) || isTruthy(v.is_completed);
      return isCompleted;
    });
    
    const scheduledVisits = visitActivities.filter(v => {
      const isCompleted = isTruthy(v.completed) || isTruthy(v.is_completed);
      return !isCompleted;
    });
    
    return { 
      thisMonth: thisMonthVisits.length, 
      total: visitActivities.length,
      scheduled: scheduledVisits.length,
      completed: completedVisits.length,
      visitActivities: visitActivities
    };
  }, [myActivities]);

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2
    }).format(value || 0);
  };

  const isLoading = loadingUser || loadingLeadsPF || loadingLeadsPJ || loadingReferrals || loadingActivities || loadingVisits;

  if (isLoading || !isSalesAgentOnly) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  const totalWonValue = pfStats.wonValue + pjStats.wonValue;
  const totalLostValue = pfStats.lostValue + pjStats.lostValue;
  const totalPipelineValue = pfStats.pipelineValue + pjStats.pipelineValue;
  const totalWonDeals = pfStats.won + pjStats.won;
  const totalLostDeals = pfStats.lost + pjStats.lost;
  const totalActiveDeals = pfStats.active + pjStats.active;
  const periodLabel = PERIOD_LABELS[selectedPeriod] || selectedPeriod;

  return (
    <motion.div
      className="min-h-screen p-3 md:p-6"
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      <div className="max-w-7xl mx-auto space-y-4 md:space-y-6">
        <motion.div variants={itemVariants} className="page-header-title-section">
          <div>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
              Meu Dashboard
            </h1>
            <p className="text-gray-500 mt-1 text-sm md:text-base">
              Bem-vindo(a), {currentAgent?.name || 'Vendedor'}!
            </p>
          </div>
        </motion.div>

        <motion.div variants={itemVariants}>
          <DashboardFilters
            selectedPeriod={selectedPeriod}
            dateRange={dateRange}
            onPeriodChange={setSelectedPeriod}
            onDateRangeChange={setDateRange}
            onClearFilters={() => {
              setSelectedPeriod("thisMonth");
              setDateRange({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) });
            }}
            showAgentFilter={false}
            showStageFilter={false}
            showTeamFilter={false}
            showPeriodFilter={true}
          />
        </motion.div>

        <motion.div variants={itemVariants} className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4">
          <Card className="bg-gradient-to-br from-green-500 to-emerald-600 text-white border-0">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-green-100 text-sm">Valor Ganho <span className="opacity-75">({periodLabel})</span></p>
                  <p className="text-2xl font-bold">{formatCurrency(totalWonValue)}</p>
                  <p className="text-green-100 text-xs mt-1">{totalWonDeals} negócios</p>
                </div>
                <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
                  <Trophy className="w-6 h-6" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-red-500 to-rose-600 text-white border-0">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-red-100 text-sm">Valor Perdido <span className="opacity-75">({periodLabel})</span></p>
                  <p className="text-2xl font-bold">{formatCurrency(totalLostValue)}</p>
                  <p className="text-red-100 text-xs mt-1">{totalLostDeals} negócios</p>
                </div>
                <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
                  <AlertCircle className="w-6 h-6" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white border-0">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-100 text-sm">Pipeline <span className="opacity-75">({periodLabel})</span></p>
                  <p className="text-2xl font-bold">{formatCurrency(totalPipelineValue)}</p>
                  <p className="text-blue-100 text-xs mt-1">{totalActiveDeals} em andamento</p>
                </div>
                <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
                  <TrendingUp className="w-6 h-6" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-500 to-violet-600 text-white border-0">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-purple-100 text-sm">Atividades Hoje</p>
                  <p className="text-2xl font-bold">{activityStats.pendingToday + activityStats.completedToday}</p>
                  <p className="text-purple-100 text-xs mt-1">
                    {activityStats.completedToday} ok, {activityStats.pendingToday} pend.
                  </p>
                </div>
                <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
                  <Activity className="w-6 h-6" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          <motion.div variants={itemVariants}>
            <Card className="h-full border-yellow-200 bg-gradient-to-br from-yellow-50 to-amber-50 dark:from-yellow-950/20 dark:to-amber-950/20">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-yellow-800 dark:text-yellow-200">
                  <div className="flex items-center gap-2">
                    <User className="w-5 h-5" />
                    Vendas PF
                  </div>
                  <Badge variant="secondary" className="text-xs font-normal">{periodLabel}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white/70 dark:bg-gray-800/50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">Total</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{pfStats.total}</p>
                  </div>
                  <div className="bg-white/70 dark:bg-gray-800/50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">Ativos</p>
                    <p className="text-2xl font-bold text-blue-600">{pfStats.active}</p>
                  </div>
                  <div className="bg-white/70 dark:bg-gray-800/50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">Ganhos</p>
                    <p className="text-2xl font-bold text-green-600">{pfStats.won}</p>
                  </div>
                  <div className="bg-white/70 dark:bg-gray-800/50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">Conversão</p>
                    <p className="text-2xl font-bold text-purple-600">{pfStats.conversionRate}%</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Pipeline</span>
                    <span className="font-semibold">{formatCurrency(pfStats.pipelineValue)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Ganho</span>
                    <span className="font-semibold text-green-600">{formatCurrency(pfStats.wonValue)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Perdido</span>
                    <span className="font-semibold text-red-600">{formatCurrency(pfStats.lostValue)}</span>
                  </div>
                </div>
                <Link to={createPageUrl("LeadsKanban")}>
                  <Button variant="outline" size="sm" className="w-full border-yellow-300 hover:bg-yellow-100">
                    Ver Pipeline PF
                    <ArrowUpRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={itemVariants}>
            <Card className="h-full border-indigo-200 bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-950/20 dark:to-blue-950/20">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-indigo-800 dark:text-indigo-200">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-5 h-5" />
                    Vendas PJ
                  </div>
                  <Badge variant="secondary" className="text-xs font-normal">{periodLabel}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white/70 dark:bg-gray-800/50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">Total</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{pjStats.total}</p>
                  </div>
                  <div className="bg-white/70 dark:bg-gray-800/50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">Ativos</p>
                    <p className="text-2xl font-bold text-blue-600">{pjStats.active}</p>
                  </div>
                  <div className="bg-white/70 dark:bg-gray-800/50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">Ganhos</p>
                    <p className="text-2xl font-bold text-green-600">{pjStats.won}</p>
                  </div>
                  <div className="bg-white/70 dark:bg-gray-800/50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">Conversão</p>
                    <p className="text-2xl font-bold text-purple-600">{pjStats.conversionRate}%</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Pipeline</span>
                    <span className="font-semibold">{formatCurrency(pjStats.pipelineValue)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Ganho</span>
                    <span className="font-semibold text-green-600">{formatCurrency(pjStats.wonValue)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Perdido</span>
                    <span className="font-semibold text-red-600">{formatCurrency(pjStats.lostValue)}</span>
                  </div>
                </div>
                <Link to={createPageUrl("LeadsPJKanban")}>
                  <Button variant="outline" size="sm" className="w-full border-indigo-300 hover:bg-indigo-100">
                    Ver Pipeline PJ
                    <ArrowUpRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </motion.div>

        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
          <motion.div variants={itemVariants} className="h-full">
            <Card className="h-full flex flex-col">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-purple-600" />
                  Atividades de Hoje
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-4 text-center">
                    <CheckCircle className="w-8 h-8 text-green-600 mx-auto mb-2" />
                    <p className="text-2xl font-bold text-green-700">{activityStats.completedToday}</p>
                    <p className="text-sm text-green-600">Concluídas</p>
                  </div>
                  <div className="bg-yellow-50 dark:bg-yellow-950/30 rounded-lg p-4 text-center">
                    <Clock className="w-8 h-8 text-yellow-600 mx-auto mb-2" />
                    <p className="text-2xl font-bold text-yellow-700">{activityStats.pendingToday}</p>
                    <p className="text-sm text-yellow-600">Pendentes</p>
                  </div>
                </div>
                {activityStats.overdue > 0 && (
                  <div className="bg-red-50 dark:bg-red-950/30 rounded-lg p-3 flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 text-red-600" />
                    <div>
                      <p className="font-semibold text-red-700">{activityStats.overdue} atividade(s) atrasada(s)</p>
                      <p className="text-xs text-red-600">Requerem atenção imediata</p>
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  {activityStats.todayActivities.slice(0, 5).map((activity) => {
                    const isCompleted = isTruthy(activity.completed) || isTruthy(activity.is_completed);
                    const scheduledAt = activity.scheduledAt || activity.scheduled_at;
                    const activityType = activity.type || activity.activity_type || 'task';
                    
                    return (
                      <div 
                        key={activity.id}
                        className={`flex items-center justify-between p-3 rounded-lg ${
                          isCompleted 
                            ? 'bg-gray-50 dark:bg-gray-800/50' 
                            : 'bg-purple-50 dark:bg-purple-950/30'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {isCompleted ? (
                            <CheckCircle className="w-5 h-5 text-green-600" />
                          ) : (
                            <Clock className="w-5 h-5 text-purple-600" />
                          )}
                          <div>
                            <p className={`text-sm font-medium ${isCompleted ? 'line-through text-gray-400' : 'text-gray-900 dark:text-white'}`}>
                              {activity.title || activity.description}
                            </p>
                            <p className="text-xs text-gray-500">
                              {scheduledAt ? format(parseISO(scheduledAt), 'HH:mm', { locale: ptBR }) : ''}
                            </p>
                          </div>
                        </div>
                        <Badge variant={isCompleted ? 'secondary' : 'default'} className="text-xs">
                          {activityType === 'visit' ? 'Visita' : 
                           activityType === 'call' ? 'Ligação' : 
                           activityType === 'whatsapp' ? 'WhatsApp' : 
                           activityType === 'email' ? 'E-mail' : 'Tarefa'}
                        </Badge>
                      </div>
                    );
                  })}
                  {activityStats.todayActivities.length === 0 && (
                    <div className="text-center py-6 text-gray-500">
                      <Calendar className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                      <p>Nenhuma atividade para hoje</p>
                    </div>
                  )}
                </div>
                <div className="flex-1"></div>
                <Link to={createPageUrl("SalesAgenda")} className="mt-auto">
                  <Button variant="outline" size="sm" className="w-full">
                    Ver Agenda Completa
                    <ArrowUpRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={itemVariants} className="h-full">
            <Card className="h-full flex flex-col">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-blue-600" />
                  Visitas
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-4 text-center">
                    <MapPin className="w-8 h-8 text-blue-600 mx-auto mb-2" />
                    <p className="text-2xl font-bold text-blue-700">{visitStats.thisMonth}</p>
                    <p className="text-sm text-blue-600">Este Mês</p>
                  </div>
                  <div className="bg-purple-50 dark:bg-purple-950/30 rounded-lg p-4 text-center">
                    <Clock className="w-8 h-8 text-purple-600 mx-auto mb-2" />
                    <p className="text-2xl font-bold text-purple-700">{visitStats.scheduled}</p>
                    <p className="text-sm text-purple-600">Agendadas</p>
                  </div>
                  <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-4 text-center">
                    <CheckCircle className="w-8 h-8 text-green-600 mx-auto mb-2" />
                    <p className="text-2xl font-bold text-green-700">{visitStats.completed}</p>
                    <p className="text-sm text-green-600">Realizadas</p>
                  </div>
                </div>
                <div className="space-y-2">
                  {visitStats.visitActivities.length === 0 ? (
                    <div className="text-center py-6 text-gray-500">
                      <MapPin className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                      <p>Nenhuma visita agendada</p>
                    </div>
                  ) : (
                    visitStats.visitActivities.slice(0, 4).map((visit) => {
                      const isCompleted = isTruthy(visit.completed) || isTruthy(visit.is_completed);
                      const scheduledAt = visit.scheduledAt || visit.scheduled_at;
                      return (
                        <div 
                          key={visit.id}
                          className={`flex items-center justify-between p-3 rounded-lg ${isCompleted ? 'bg-green-50 dark:bg-green-950/30' : 'bg-blue-50 dark:bg-blue-950/30'}`}
                        >
                          <div className="flex items-center gap-3">
                            {isCompleted ? (
                              <CheckCircle className="w-5 h-5 text-green-600" />
                            ) : (
                              <MapPin className="w-5 h-5 text-blue-600" />
                            )}
                            <div>
                              <p className={`text-sm font-medium ${isCompleted ? 'text-green-700' : 'text-gray-900 dark:text-white'}`}>
                                {visit.title || visit.description || 'Visita'}
                              </p>
                              <p className="text-xs text-gray-500">
                                {scheduledAt 
                                  ? format(parseISO(scheduledAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) 
                                  : ''}
                              </p>
                            </div>
                          </div>
                          <Badge variant={isCompleted ? 'secondary' : 'default'} className="text-xs">
                            {isCompleted ? 'Realizada' : 'Agendada'}
                          </Badge>
                        </div>
                      );
                    })
                  )}
                </div>
                <div className="flex-1"></div>
                <Link to={createPageUrl("SalesRoutes")} className="mt-auto">
                  <Button variant="outline" size="sm" className="w-full">
                    Ver Rotas
                    <ArrowUpRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        <motion.div variants={itemVariants}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-600" />
                Ações Rápidas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Link to={createPageUrl("NewLead")}>
                  <Button variant="outline" className="w-full h-20 flex-col gap-2 hover:bg-yellow-50 hover:border-yellow-300">
                    <User className="w-6 h-6 text-yellow-600" />
                    <span className="text-sm">Novo Lead PF</span>
                  </Button>
                </Link>
                <Link to={createPageUrl("NewLeadPJ")}>
                  <Button variant="outline" className="w-full h-20 flex-col gap-2 hover:bg-indigo-50 hover:border-indigo-300">
                    <Building2 className="w-6 h-6 text-indigo-600" />
                    <span className="text-sm">Novo Lead PJ</span>
                  </Button>
                </Link>
                <Link to={createPageUrl("SalesAgenda")}>
                  <Button variant="outline" className="w-full h-20 flex-col gap-2 hover:bg-purple-50 hover:border-purple-300">
                    <Calendar className="w-6 h-6 text-purple-600" />
                    <span className="text-sm">Minha Agenda</span>
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  );
}
