
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { canAccessReports, canViewAll, canViewTeam } from "@/components/utils/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Inbox, Clock, CheckCircle, AlertTriangle, TrendingUp, Users, Activity, ArrowUp, ArrowDown } from "lucide-react";
import StatsCard from "../components/dashboard/StatsCard";
import SLAChart from "../components/dashboard/SLAChart";
import RecentTickets from "../components/dashboard/RecentTickets";
import TeamPerformance from "../components/dashboard/TeamPerformance";

export default function Dashboard() {
  const { data: user, isLoading: userLoading } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: allAgents = [], isLoading: agentsLoading } = useQuery({
    queryKey: ['agents'],
    queryFn: () => base44.entities.Agent.list(),
    enabled: !!user,
    initialData: [],
  });

  const currentAgent = user?.agent || allAgents.find(a => a.user_email === user?.email);

  const hasReportAccess = user?.role === 'admin' || (currentAgent && canAccessReports(currentAgent));

  const { data: tickets = [], isLoading: ticketsLoading, error: ticketsError } = useQuery({
    queryKey: ['tickets'],
    queryFn: async () => {
      console.log('Fetching tickets...');
      const allTickets = await base44.entities.Ticket.list('-created_at', 100);
      console.log('Fetched tickets:', allTickets.length);
      return allTickets;
    },
    staleTime: 0,
    refetchOnMount: true,
  });

  const { data: agents = [] } = useQuery({
    queryKey: ['displayAgents'],
    queryFn: async () => {
      const allDisplayAgents = await base44.entities.Agent.list();
      
      // Admin vê todos
      if (user?.role === 'admin') {
        return allDisplayAgents;
      }

      if (!currentAgent) return [];

      // Ver apenas agentes da equipe
      return allDisplayAgents.filter(a => a.team_id === currentAgent.team_id);
    },
    initialData: [],
  });

  if (userLoading || agentsLoading) {
    return (
      <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-950 min-h-screen">
        <div className="flex flex-col items-center justify-center py-12">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Carregando dashboard...</p>
        </div>
      </div>
    );
  }

  if (!hasReportAccess) {
    return (
      <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-950 min-h-screen">
        <div className="flex flex-col items-center justify-center py-12">
          <div className="w-20 h-20 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
            <Activity className="w-10 h-10 text-gray-400" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Dashboard não disponível
          </h2>
          <p className="text-gray-500 dark:text-gray-400 text-center max-w-md">
            Você não tem permissão para acessar o dashboard completo. Entre em contato com seu supervisor.
          </p>
        </div>
      </div>
    );
  }

  const totalTickets = tickets.length;
  const activeTickets = tickets.filter(t => ['novo', 'atribuido', 'em_atendimento', 'aguardando_cliente'].includes(t.status)).length;
  const resolvedToday = tickets.filter(t => {
    if (!t.resolvedAt) return false;
    const today = new Date();
    const resolvedDate = new Date(t.resolvedAt);
    return resolvedDate.toDateString() === today.toDateString();
  }).length;
  
  const atRisk = tickets.filter(t => {
    if (t.status === 'resolvido' || t.status === 'fechado') return false;
    if (!t.slaDueDate) return false;
    const now = new Date();
    const deadline = new Date(t.slaDueDate);
    const hoursUntilDeadline = (deadline - now) / (1000 * 60 * 60);
    return hoursUntilDeadline > 0 && hoursUntilDeadline < 4;
  }).length;

  const breached = tickets.filter(t => t.slaBreached).length;
  const onlineAgents = agents.filter(a => a.online).length;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const ticketsYesterday = tickets.filter(t => {
    const created = new Date(t.createdAt);
    return created.toDateString() === yesterday.toDateString();
  }).length;
  
  const ticketsToday = tickets.filter(t => {
    const created = new Date(t.createdAt);
    return created.toDateString() === new Date().toDateString();
  }).length;

  const changePercent = ticketsYesterday > 0 
    ? ((ticketsToday - ticketsYesterday) / ticketsYesterday * 100).toFixed(1)
    : 0;

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-950 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Dashboard</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Visão geral do atendimento em tempo real
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <div className="px-3 py-1.5 bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300 rounded-full flex items-center gap-1">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="font-medium">{onlineAgents} agentes online</span>
          </div>
          <div className="text-gray-500 dark:text-gray-400">
            Atualizado agora
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatsCard
          title="Total de Tickets"
          value={totalTickets}
          icon={Inbox}
          color="blue"
          trend={changePercent > 0 ? `+${changePercent}%` : `${changePercent}%`}
          trendUp={changePercent >= 0}
        />
        <StatsCard
          title="Em Atendimento"
          value={activeTickets}
          icon={Clock}
          color="purple"
          subtitle={`${((activeTickets/totalTickets)*100).toFixed(0)}% do total`}
        />
        <StatsCard
          title="Resolvidos Hoje"
          value={resolvedToday}
          icon={CheckCircle}
          color="green"
          trend="+8% vs ontem"
          trendUp={true}
        />
        <StatsCard
          title="SLA em Risco"
          value={atRisk}
          icon={AlertTriangle}
          color="orange"
          pulse={atRisk > 0}
        />
        <StatsCard
          title="SLA Violado"
          value={breached}
          icon={AlertTriangle}
          color="red"
          pulse={breached > 0}
        />
        <StatsCard
          title="Agentes Online"
          value={onlineAgents}
          icon={Users}
          color="indigo"
          subtitle={`${agents.length} total`}
        />
      </div>

      {/* Charts & Lists */}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <SLAChart tickets={tickets} />
          <RecentTickets tickets={tickets.slice(0, 10)} />
        </div>
        <div>
          <TeamPerformance agents={agents} tickets={tickets} />
        </div>
      </div>
    </div>
  );
}
