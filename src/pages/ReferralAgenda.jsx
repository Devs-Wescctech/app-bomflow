import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  Phone,
  CheckCircle2,
  AlertCircle,
  Filter,
  Target,
  Activity,
  ChevronLeft,
  ChevronRight,
  Plus,
  MessageSquare,
  Mail,
  User,
  ListTodo,
  ExternalLink,
  Loader2,
  Trash2
} from "lucide-react";
import { format, startOfWeek, endOfWeek, addDays, isSameDay, isToday, isPast, isFuture, parseISO, startOfMonth, endOfMonth, addMonths, subMonths, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { toast } from "sonner";
import { canViewTeam, getVisibleAgents } from "@/components/utils/permissions.jsx";

const ACTIVITY_TYPES = {
  visit: { label: "Visita", icon: MapPin, color: "bg-blue-500", gradient: "from-blue-500 to-blue-600", bgLight: "bg-blue-50 dark:bg-blue-950/50", textColor: "text-blue-700 dark:text-blue-300" },
  call: { label: "Ligação", icon: Phone, color: "bg-green-500", gradient: "from-green-500 to-green-600", bgLight: "bg-green-50 dark:bg-green-950/50", textColor: "text-green-700 dark:text-green-300" },
  whatsapp: { label: "WhatsApp", icon: MessageSquare, color: "bg-emerald-500", gradient: "from-emerald-500 to-emerald-600", bgLight: "bg-emerald-50 dark:bg-emerald-950/50", textColor: "text-emerald-700 dark:text-emerald-300" },
  email: { label: "E-mail", icon: Mail, color: "bg-purple-500", gradient: "from-purple-500 to-purple-600", bgLight: "bg-purple-50 dark:bg-purple-950/50", textColor: "text-purple-700 dark:text-purple-300" },
  task: { label: "Tarefa", icon: CheckCircle2, color: "bg-orange-500", gradient: "from-orange-500 to-orange-600", bgLight: "bg-orange-50 dark:bg-orange-950/50", textColor: "text-orange-700 dark:text-orange-300" },
};

export default function ReferralAgenda() {
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState('day');
  const [filterType, setFilterType] = useState('all');
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: activities = [], isLoading: loadingActivities } = useQuery({
    queryKey: ['activities'],
    queryFn: () => base44.entities.ReferralActivity.list('-scheduledAt', 500),
    staleTime: 1000 * 60 * 2,
  });

  const { data: referrals = [] } = useQuery({
    queryKey: ['referrals'],
    queryFn: () => base44.entities.Referral.list(),
    staleTime: 1000 * 60 * 2,
  });

  const { data: visits = [] } = useQuery({
    queryKey: ['visits'],
    queryFn: () => base44.entities.Visit.list('-visitedAt', 100),
    staleTime: 1000 * 60 * 2,
  });

  const updateActivityMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ReferralActivity.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activities'] });
    },
  });

  const { data: agents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: () => base44.entities.Agent.list(),
    staleTime: 1000 * 60 * 2,
  });

  const currentAgent = user?.agent || agents.find(a => a.userEmail === user?.email || a.email === user?.email);
  const isAdmin = currentAgent?.agentType === 'admin' || currentAgent?.agent_type === 'admin' || currentAgent?.agentType === 'indicacoes_admin' || currentAgent?.agent_type === 'indicacoes_admin' || user?.role === 'admin';

  const referralActivities = activities.filter(act => act.referralId || act.referral_id);
  
  const myActivities = referralActivities.filter(act => {
    if (isAdmin) return true;
    if (!currentAgent) return true;
    if (canViewTeam(currentAgent, 'referrals')) {
      const visibleAgs = getVisibleAgents(agents, currentAgent);
      const visibleEmails = new Set(visibleAgs.map(a => a.userEmail || a.email || a.user_email).filter(Boolean));
      const visibleIds = new Set(visibleAgs.map(a => a.id));
      return visibleEmails.has(act.assignedTo) || visibleIds.has(act.assignedTo) ||
             visibleEmails.has(act.createdBy) || visibleIds.has(act.createdBy);
    }
    return act.assignedTo === user?.email || act.assignedTo === currentAgent?.id || act.createdBy === currentAgent?.id || !act.assignedTo;
  });

  const filteredActivities = filterType === 'all' 
    ? myActivities 
    : myActivities.filter(act => act.type === filterType);

  const today = new Date();

  const todayActivities = filteredActivities.filter(act => {
    if (!act.scheduledAt) return false;
    try {
      const date = parseISO(act.scheduledAt);
      return isValid(date) && isSameDay(date, today);
    } catch { return false; }
  });

  const overdueActivities = filteredActivities.filter(act => {
    if (!act.scheduledAt || act.completed) return false;
    try {
      const date = parseISO(act.scheduledAt);
      return isValid(date) && isPast(date) && !isSameDay(date, today);
    } catch { return false; }
  });

  const upcomingActivities = filteredActivities.filter(act => {
    if (!act.scheduledAt || act.completed) return false;
    try {
      const actDate = parseISO(act.scheduledAt);
      return isValid(actDate) && isFuture(actDate) && !isSameDay(actDate, today);
    } catch { return false; }
  }).slice(0, 10);

  const selectedDateActivities = filteredActivities.filter(act => {
    if (!act.scheduledAt) return false;
    try {
      const date = parseISO(act.scheduledAt);
      return isValid(date) && isSameDay(date, selectedDate);
    } catch { return false; }
  });

  const todayVisits = visits.filter(v => {
    if (!v.visitedAt) return false;
    try {
      const date = parseISO(v.visitedAt);
      return isValid(date) && isSameDay(date, today);
    } catch { return false; }
  });

  const todayCompleted = todayActivities.filter(a => a.completed).length;
  const todayPending = todayActivities.filter(a => !a.completed).length;

  const weekStart = startOfWeek(today, { locale: ptBR });
  const weekEnd = endOfWeek(today, { locale: ptBR });
  const weekActivities = filteredActivities.filter(act => {
    if (!act.scheduledAt) return false;
    try {
      const actDate = parseISO(act.scheduledAt);
      return isValid(actDate) && actDate >= weekStart && actDate <= weekEnd;
    } catch { return false; }
  });
  const weekCompleted = weekActivities.filter(a => a.completed).length;

  const getReferralById = (referralId) => {
    if (!referralId) return null;
    return referrals.find(l => l.id === referralId || String(l.id) === String(referralId));
  };

  const getActivityIcon = (type) => {
    return ACTIVITY_TYPES[type]?.icon || Activity;
  };

  const getActivityConfig = (type) => {
    return ACTIVITY_TYPES[type] || ACTIVITY_TYPES.task;
  };

  const handleToggleComplete = (activityId, currentStatus) => {
    updateActivityMutation.mutate({
      id: activityId,
      data: {
        completed: !currentStatus,
        completedAt: !currentStatus ? new Date().toISOString() : null
      }
    });
    toast.success(currentStatus ? 'Atividade reaberta' : 'Atividade concluída!');
  };

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { locale: ptBR });
  const calendarEnd = endOfWeek(monthEnd, { locale: ptBR });
  
  const calendarDays = [];
  let day = calendarStart;
  while (day <= calendarEnd) {
    calendarDays.push(day);
    day = addDays(day, 1);
  }

  const getActivitiesForDay = (day) => {
    return filteredActivities.filter(act => {
      if (!act.scheduledAt) return false;
      try {
        const date = parseISO(act.scheduledAt);
        return isValid(date) && isSameDay(date, day);
      } catch { return false; }
    });
  };

  const formatTime = (dateString) => {
    if (!dateString) return '';
    try {
      const date = parseISO(dateString);
      if (!isValid(date)) return '';
      return format(date, "HH:mm");
    } catch { return ''; }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              Agenda de Vendas
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              Organize suas atividades e follow-ups
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link to={createPageUrl("SalesTasks")}>
              <Button variant="outline">
                <ListTodo className="w-4 h-4 mr-2" />
                Tarefas
              </Button>
            </Link>
            <Link to={createPageUrl("ReferralCreate")}>
              <Button className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white">
                <Plus className="w-4 h-4 mr-2" />
                Nova Indicação
              </Button>
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Card className="border-0 shadow-lg bg-gradient-to-br from-blue-500 to-blue-600 text-white overflow-hidden">
              <CardContent className="p-6 relative">
                <div className="absolute right-4 top-4 opacity-20">
                  <CalendarIcon className="w-16 h-16" />
                </div>
                <div>
                  <p className="text-blue-100 text-sm font-medium">Hoje</p>
                  <p className="text-4xl font-bold mt-1">{todayActivities.length}</p>
                  <p className="text-blue-200 text-sm mt-2">
                    {todayCompleted} concluídas, {todayPending} pendentes
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Card className="border-0 shadow-lg bg-gradient-to-br from-red-500 to-red-600 text-white overflow-hidden">
              <CardContent className="p-6 relative">
                <div className="absolute right-4 top-4 opacity-20">
                  <AlertCircle className="w-16 h-16" />
                </div>
                <div>
                  <p className="text-red-100 text-sm font-medium">Atrasadas</p>
                  <p className="text-4xl font-bold mt-1">{overdueActivities.length}</p>
                  <p className="text-red-200 text-sm mt-2">
                    Requer atenção imediata
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <Card className="border-0 shadow-lg bg-gradient-to-br from-green-500 to-green-600 text-white overflow-hidden">
              <CardContent className="p-6 relative">
                <div className="absolute right-4 top-4 opacity-20">
                  <Target className="w-16 h-16" />
                </div>
                <div>
                  <p className="text-green-100 text-sm font-medium">Esta Semana</p>
                  <p className="text-4xl font-bold mt-1">{weekActivities.length}</p>
                  <p className="text-green-200 text-sm mt-2">
                    {weekCompleted} concluídas
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <Card className="border-0 shadow-lg bg-gradient-to-br from-purple-500 to-purple-600 text-white overflow-hidden">
              <CardContent className="p-6 relative">
                <div className="absolute right-4 top-4 opacity-20">
                  <MapPin className="w-16 h-16" />
                </div>
                <div>
                  <p className="text-purple-100 text-sm font-medium">Visitas Hoje</p>
                  <p className="text-4xl font-bold mt-1">{todayVisits.length}</p>
                  <p className="text-purple-200 text-sm mt-2">
                    Realizadas
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Card className="border-0 shadow-lg">
              <CardHeader className="border-b bg-gray-50 dark:bg-gray-800/50">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <CardTitle className="flex items-center gap-2">
                    <CalendarIcon className="w-5 h-5 text-blue-600" />
                    Minha Agenda
                  </CardTitle>
                  <div className="flex items-center gap-4">
                    <div className="flex gap-1 flex-wrap">
                      <Button
                        variant={filterType === 'all' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setFilterType('all')}
                        className={filterType === 'all' ? 'bg-blue-600' : ''}
                      >
                        Todas
                      </Button>
                      {Object.entries(ACTIVITY_TYPES).map(([key, config]) => (
                        <Button
                          key={key}
                          variant={filterType === key ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setFilterType(key)}
                          className={filterType === key ? config.color : ''}
                        >
                          {config.label}
                        </Button>
                      ))}
                    </div>
                    <Tabs value={viewMode} onValueChange={setViewMode}>
                      <TabsList>
                        <TabsTrigger value="day">Dia</TabsTrigger>
                        <TabsTrigger value="week">Semana</TabsTrigger>
                        <TabsTrigger value="month">Mês</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                {loadingActivities ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                  </div>
                ) : (
                  <>
                    {viewMode === 'day' && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between pb-4 border-b">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setSelectedDate(addDays(selectedDate, -1))}
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </Button>
                          <div className="text-center">
                            <h3 className="text-lg font-semibold">
                              {format(selectedDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                            </h3>
                            <p className="text-sm text-gray-500">
                              {isToday(selectedDate) ? 'Hoje' : format(selectedDate, "EEEE", { locale: ptBR })}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {!isToday(selectedDate) && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setSelectedDate(new Date())}
                              >
                                Hoje
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setSelectedDate(addDays(selectedDate, 1))}
                            >
                              <ChevronRight className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>

                        <div className="space-y-3">
                          {selectedDateActivities.length === 0 ? (
                            <div className="text-center py-12">
                              <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                                <CalendarIcon className="w-8 h-8 text-gray-400" />
                              </div>
                              <p className="text-gray-500">Nenhuma atividade agendada para este dia</p>
                            </div>
                          ) : (
                            <AnimatePresence>
                              {selectedDateActivities
                                .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt))
                                .map((activity, index) => {
                                  const config = getActivityConfig(activity.type);
                                  const Icon = getActivityIcon(activity.type);
                                  const lead = getReferralById(activity.referralId);

                                  return (
                                    <motion.div
                                      key={activity.id}
                                      initial={{ opacity: 0, x: -20 }}
                                      animate={{ opacity: 1, x: 0 }}
                                      exit={{ opacity: 0, x: 20 }}
                                      transition={{ delay: index * 0.05 }}
                                    >
                                      <Card className={`border-l-4 transition-all hover:shadow-md ${
                                        activity.completed 
                                          ? 'border-l-green-500 bg-green-50 dark:bg-green-950/20' 
                                          : 'border-l-blue-500'
                                      }`}>
                                        <CardContent className="p-4">
                                          <div className="flex items-start gap-4">
                                            <button
                                              onClick={() => handleToggleComplete(activity.id, activity.completed)}
                                              className={`mt-1 flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                                                activity.completed
                                                  ? 'bg-green-500 border-green-500 text-white'
                                                  : 'border-gray-300 dark:border-gray-600 hover:border-blue-500'
                                              }`}
                                            >
                                              {activity.completed && <CheckCircle2 className="w-4 h-4" />}
                                            </button>

                                            <div className={`p-2 rounded-lg bg-gradient-to-br ${config.gradient}`}>
                                              <Icon className="w-5 h-5 text-white" />
                                            </div>

                                            <div className="flex-1 min-w-0">
                                              <div className="flex items-start justify-between gap-2">
                                                <div>
                                                  <h4 className={`font-semibold text-gray-900 dark:text-gray-100 ${activity.completed ? 'line-through' : ''}`}>
                                                    {activity.title || activity.description || 'Atividade'}
                                                  </h4>
                                                  {activity.description && activity.title && (
                                                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                                                      {activity.description}
                                                    </p>
                                                  )}
                                                  {lead && (
                                                    <Link 
                                                      to={createPageUrl("ReferralDetail", { id: lead.id })}
                                                      className="inline-flex items-center gap-1.5 mt-2 px-2 py-1 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-lg text-sm hover:bg-purple-100 transition-colors"
                                                    >
                                                      <User className="w-3.5 h-3.5" />
                                                      {lead.name}
                                                      <ExternalLink className="w-3 h-3" />
                                                    </Link>
                                                  )}
                                                </div>
                                                <div className="flex flex-col items-end gap-2">
                                                  <div className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
                                                    <Clock className="w-4 h-4" />
                                                    {formatTime(activity.scheduledAt)}
                                                  </div>
                                                  <Badge className={config.bgLight + ' ' + config.textColor}>
                                                    {config.label}
                                                  </Badge>
                                                </div>
                                              </div>
                                            </div>
                                          </div>
                                        </CardContent>
                                      </Card>
                                    </motion.div>
                                  );
                                })}
                            </AnimatePresence>
                          )}
                        </div>
                      </div>
                    )}

                    {viewMode === 'week' && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-center gap-4 pb-4 border-b">
                          <Button variant="ghost" size="icon" onClick={() => setSelectedDate(addDays(selectedDate, -7))}>
                            <ChevronLeft className="w-4 h-4" />
                          </Button>
                          <h3 className="text-lg font-semibold">
                            {format(weekStart, "dd/MM", { locale: ptBR })} - {format(weekEnd, "dd/MM/yyyy", { locale: ptBR })}
                          </h3>
                          <Button variant="ghost" size="icon" onClick={() => setSelectedDate(addDays(selectedDate, 7))}>
                            <ChevronRight className="w-4 h-4" />
                          </Button>
                        </div>
                        <div className="grid grid-cols-7 gap-2">
                          {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((dayName, idx) => (
                            <div key={idx} className="text-center text-xs font-semibold text-gray-600 dark:text-gray-400 py-2">
                              {dayName}
                            </div>
                          ))}
                          {[...Array(7)].map((_, idx) => {
                            const dayDate = addDays(weekStart, idx);
                            const dayActivities = getActivitiesForDay(dayDate);
                            
                            return (
                              <button
                                key={idx}
                                onClick={() => {
                                  setSelectedDate(dayDate);
                                  setViewMode('day');
                                }}
                                className={`min-h-[120px] p-2 border rounded-xl transition-all ${
                                  isToday(dayDate) 
                                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/50 ring-2 ring-blue-200' 
                                    : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                                }`}
                              >
                                <div className={`text-sm font-bold mb-2 ${isToday(dayDate) ? 'text-blue-600' : ''}`}>
                                  {format(dayDate, 'd')}
                                </div>
                                <div className="space-y-1">
                                  {dayActivities.slice(0, 3).map((act, i) => {
                                    const config = getActivityConfig(act.type);
                                    return (
                                      <div
                                        key={i}
                                        className={`text-xs p-1 rounded truncate ${config.bgLight} ${config.textColor}`}
                                      >
                                        {formatTime(act.scheduledAt)} {act.title?.substring(0, 10) || 'Atividade'}
                                      </div>
                                    );
                                  })}
                                  {dayActivities.length > 3 && (
                                    <div className="text-xs text-gray-500 text-center">
                                      +{dayActivities.length - 3} mais
                                    </div>
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {viewMode === 'month' && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-center gap-4 pb-4 border-b">
                          <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                            <ChevronLeft className="w-4 h-4" />
                          </Button>
                          <h3 className="text-lg font-semibold">
                            {format(currentMonth, "MMMM 'de' yyyy", { locale: ptBR })}
                          </h3>
                          <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                            <ChevronRight className="w-4 h-4" />
                          </Button>
                        </div>
                        <div className="grid grid-cols-7 gap-1">
                          {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((dayName, idx) => (
                            <div key={idx} className="text-center text-xs font-semibold text-gray-600 dark:text-gray-400 py-2">
                              {dayName}
                            </div>
                          ))}
                          {calendarDays.map((dayDate, idx) => {
                            const dayActivities = getActivitiesForDay(dayDate);
                            const isCurrentMonth = dayDate.getMonth() === currentMonth.getMonth();
                            
                            return (
                              <button
                                key={idx}
                                onClick={() => {
                                  setSelectedDate(dayDate);
                                  setViewMode('day');
                                }}
                                className={`min-h-[80px] p-1 border rounded-lg transition-all text-sm ${
                                  !isCurrentMonth ? 'opacity-40' : ''
                                } ${
                                  isToday(dayDate) 
                                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/50' 
                                    : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                                }`}
                              >
                                <div className={`text-xs font-bold ${isToday(dayDate) ? 'text-blue-600' : ''}`}>
                                  {format(dayDate, 'd')}
                                </div>
                                {dayActivities.length > 0 && (
                                  <div className="mt-1">
                                    <div className="flex gap-0.5 flex-wrap justify-center">
                                      {dayActivities.slice(0, 3).map((act, i) => {
                                        const config = getActivityConfig(act.type);
                                        return (
                                          <div key={i} className={`w-2 h-2 rounded-full ${config.color}`} />
                                        );
                                      })}
                                    </div>
                                    <div className="text-xs text-gray-500 mt-0.5">
                                      {dayActivities.length}
                                    </div>
                                  </div>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            {overdueActivities.length > 0 && (
              <Card className="border-0 shadow-lg border-l-4 border-l-red-500">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2 text-red-600">
                    <AlertCircle className="w-5 h-5" />
                    Atrasadas ({overdueActivities.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {overdueActivities.slice(0, 5).map(activity => {
                    const config = getActivityConfig(activity.type);
                    const Icon = getActivityIcon(activity.type);
                    const lead = getReferralById(activity.referralId);
                    
                    return (
                      <div key={activity.id} className="flex items-start gap-3 p-3 bg-red-50 dark:bg-red-950/30 rounded-lg">
                        <div className={`p-1.5 rounded ${config.color}`}>
                          <Icon className="w-4 h-4 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{activity.title || 'Atividade'}</p>
                          {lead && (
                            <p className="text-xs text-gray-500 truncate">{lead.name}</p>
                          )}
                          <p className="text-xs text-red-600 mt-1">
                            {activity.scheduledAt && format(parseISO(activity.scheduledAt), "dd/MM 'às' HH:mm", { locale: ptBR })}
                          </p>
                        </div>
                        <button
                          onClick={() => handleToggleComplete(activity.id, false)}
                          className="p-1.5 text-green-600 hover:bg-green-100 rounded transition-colors"
                          title="Marcar como concluída"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            <Card className="border-0 shadow-lg">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Clock className="w-5 h-5 text-blue-600" />
                  Próximas Atividades
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {upcomingActivities.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <CalendarIcon className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                    <p className="text-sm">Nenhuma atividade futura</p>
                  </div>
                ) : (
                  upcomingActivities.map(activity => {
                    const config = getActivityConfig(activity.type);
                    const Icon = getActivityIcon(activity.type);
                    const lead = getReferralById(activity.referralId);
                    
                    return (
                      <div key={activity.id} className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                        <div className={`p-1.5 rounded ${config.color}`}>
                          <Icon className="w-4 h-4 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{activity.title || 'Atividade'}</p>
                          {lead && (
                            <Link 
                              to={createPageUrl("ReferralDetail", { id: lead.id })}
                              className="text-xs text-purple-600 hover:underline"
                            >
                              {lead.name}
                            </Link>
                          )}
                          <p className="text-xs text-gray-500 mt-1">
                            {activity.scheduledAt && format(parseISO(activity.scheduledAt), "dd/MM 'às' HH:mm", { locale: ptBR })}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
