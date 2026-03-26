import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  Phone,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Plus,
  MessageSquare,
  Mail,
  User,
  ExternalLink,
  Loader2,
  RefreshCw,
  CalendarDays,
  CalendarRange,
  LayoutList,
  Circle,
  Unlink,
  Link2,
} from "lucide-react";
import {
  format,
  startOfWeek,
  endOfWeek,
  addDays,
  isSameDay,
  isToday,
  isPast,
  isFuture,
  parseISO,
  startOfMonth,
  endOfMonth,
  addMonths,
  subMonths,
  isValid,
  isSameMonth,
  differenceInMinutes,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { toast } from "sonner";

const BRAND = { burgundy: "#5A2A3C", coral: "#F98F6F" };

const ACTIVITY_TYPES = {
  visit: { label: "Visita", icon: MapPin, dot: "#3b82f6" },
  call: { label: "Ligação", icon: Phone, dot: "#22c55e" },
  whatsapp: { label: "WhatsApp", icon: MessageSquare, dot: "#10b981" },
  email: { label: "E-mail", icon: Mail, dot: "#a855f7" },
  task: { label: "Tarefa", icon: CheckCircle2, dot: "#f97316" },
  meeting: { label: "Reunião", icon: CalendarIcon, dot: "#6366f1" },
};

const HOURS = Array.from({ length: 14 }, (_, i) => i + 7);

function getVal(obj, ...keys) {
  for (const k of keys) { if (obj[k] !== undefined && obj[k] !== null) return obj[k]; }
  return null;
}

export default function SalesAgenda() {
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState("day");
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [filterType, setFilterType] = useState("all");
  const [showGoogleEvents, setShowGoogleEvents] = useState(true);

  const { data: user } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => base44.auth.me(),
  });

  const { data: activitiesPJ = [], isLoading: loadingPJ } = useQuery({
    queryKey: ["activitiesPJ"],
    queryFn: () => base44.entities.ActivityPJ.list("-scheduledAt", 500),
    staleTime: 1000 * 60 * 2,
  });

  const { data: activitiesPF = [], isLoading: loadingPF } = useQuery({
    queryKey: ["activities"],
    queryFn: () => base44.entities.Activity.list("-scheduledAt", 500),
    staleTime: 1000 * 60 * 2,
  });

  const loading = loadingPJ || loadingPF;

  const activities = useMemo(() => [
    ...activitiesPF.map((a) => ({ ...a, _leadType: "pf" })),
    ...activitiesPJ.map((a) => ({ ...a, _leadType: "pj" })),
  ], [activitiesPF, activitiesPJ]);

  const { data: leads = [] } = useQuery({
    queryKey: ["leads"],
    queryFn: () => base44.entities.Lead.list(),
    staleTime: 1000 * 60 * 2,
  });

  const { data: leadsPJ = [] } = useQuery({
    queryKey: ["leadsPJ"],
    queryFn: () => base44.entities.LeadPJ.list(),
    staleTime: 1000 * 60 * 2,
  });

  const { data: agents = [] } = useQuery({
    queryKey: ["agents"],
    queryFn: () => base44.entities.Agent.list(),
    staleTime: 1000 * 60 * 2,
  });

  const { data: gcalStatus } = useQuery({
    queryKey: ["gcalStatus"],
    queryFn: async () => {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/functions/google-calendar/status", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return { configured: false, connected: false };
      return res.json();
    },
    staleTime: 1000 * 60 * 5,
  });

  const { data: googleEvents = [] } = useQuery({
    queryKey: ["googleCalendarEvents", currentMonth.toISOString()],
    queryFn: async () => {
      const token = localStorage.getItem("token");
      const monthS = startOfMonth(currentMonth);
      const monthE = endOfMonth(currentMonth);
      const res = await fetch(
        `/api/functions/google-calendar/events?timeMin=${monthS.toISOString()}&timeMax=${monthE.toISOString()}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) return [];
      return res.json();
    },
    enabled: gcalStatus?.connected === true && showGoogleEvents,
    staleTime: 1000 * 60 * 3,
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/functions/google-calendar/sync", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast.success(`Sincronizado! ${data.synced} eventos enviados ao Google Calendar.`);
      queryClient.invalidateQueries({ queryKey: ["googleCalendarEvents"] });
    },
  });

  const updateActivityMutation = useMutation({
    mutationFn: ({ id, data, leadType }) => {
      if (leadType === "pj") return base44.entities.ActivityPJ.update(id, data);
      return base44.entities.Activity.update(id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activities"] });
      queryClient.invalidateQueries({ queryKey: ["activitiesPJ"] });
    },
  });

  const currentAgent = user?.agent || agents.find((a) => a.userEmail === user?.email || a.email === user?.email);
  const isAdmin = currentAgent?.agentType === "admin" || currentAgent?.agent_type === "admin";

  const myActivities = useMemo(() => {
    return activities.filter((act) => {
      if (isAdmin) return true;
      if (!currentAgent) return true;
      const assignedTo = getVal(act, "assignedTo", "assigned_to");
      const createdBy = getVal(act, "createdBy", "created_by");
      return assignedTo === user?.email || assignedTo === currentAgent?.id || createdBy === currentAgent?.id || !assignedTo;
    });
  }, [activities, isAdmin, currentAgent, user]);

  const filtered = filterType === "all" ? myActivities : myActivities.filter((a) => a.type === filterType);

  const today = new Date();

  const stats = useMemo(() => {
    const todayActs = filtered.filter((a) => {
      if (!a.scheduledAt) return false;
      try { return isSameDay(parseISO(a.scheduledAt), today); } catch { return false; }
    });
    const overdue = filtered.filter((a) => {
      if (!a.scheduledAt || a.completed) return false;
      try { const d = parseISO(a.scheduledAt); return isPast(d) && !isSameDay(d, today); } catch { return false; }
    });
    const weekS = startOfWeek(today, { locale: ptBR });
    const weekE = endOfWeek(today, { locale: ptBR });
    const weekActs = filtered.filter((a) => {
      if (!a.scheduledAt) return false;
      try { const d = parseISO(a.scheduledAt); return d >= weekS && d <= weekE; } catch { return false; }
    });
    return {
      today: todayActs.length,
      todayDone: todayActs.filter((a) => a.completed).length,
      todayPending: todayActs.filter((a) => !a.completed).length,
      overdue: overdue.length,
      overdueList: overdue.sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt)),
      week: weekActs.length,
      weekDone: weekActs.filter((a) => a.completed).length,
    };
  }, [filtered, today]);

  const getActivitiesForDay = (day) =>
    filtered.filter((a) => {
      if (!a.scheduledAt) return false;
      try { return isSameDay(parseISO(a.scheduledAt), day); } catch { return false; }
    });

  const selectedDayActivities = useMemo(
    () =>
      getActivitiesForDay(selectedDate).sort(
        (a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt)
      ),
    [filtered, selectedDate]
  );

  const getLeadById = (leadId, leadType) => {
    if (!leadId) return null;
    if (leadType === "pj") {
      const pj = leadsPJ.find((l) => String(l.id) === String(leadId));
      if (pj) return { ...pj, _leadType: "pj" };
    }
    const pf = leads.find((l) => String(l.id) === String(leadId));
    if (pf) return { ...pf, _leadType: "pf" };
    const pjFallback = leadsPJ.find((l) => String(l.id) === String(leadId));
    if (pjFallback) return { ...pjFallback, _leadType: "pj" };
    return null;
  };

  const handleToggle = (id, current, leadType) => {
    updateActivityMutation.mutate({ id, leadType, data: { completed: !current, completed_at: !current ? new Date().toISOString() : null } });
    toast.success(current ? "Atividade reaberta" : "Atividade concluída!");
  };

  const fmtTime = (d) => { try { const p = parseISO(d); return isValid(p) ? format(p, "HH:mm") : ""; } catch { return ""; } };

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart, { locale: ptBR });
  const calEnd = endOfWeek(monthEnd, { locale: ptBR });
  const calDays = [];
  let d = calStart;
  while (d <= calEnd) { calDays.push(d); d = addDays(d, 1); }

  const weekStart = startOfWeek(selectedDate, { locale: ptBR });

  const googleEventsForDay = (day) => {
    if (!showGoogleEvents || !googleEvents.length) return [];
    return googleEvents.filter((ev) => {
      const start = ev.start?.dateTime || ev.start?.date;
      if (!start) return false;
      try { return isSameDay(parseISO(start), day); } catch { return false; }
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-[1440px] mx-auto px-4 py-5 space-y-5">

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: BRAND.burgundy }}>
              Agenda
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {format(today, "EEEE, dd 'de' MMMM", { locale: ptBR })}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {gcalStatus?.connected && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending}
                className="text-xs"
              >
                {syncMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1" />}
                Sincronizar Google
              </Button>
            )}
            {gcalStatus?.connected ? (
              <Badge className="text-xs gap-1 bg-green-50 text-green-700 border-green-200">
                <Link2 className="w-3 h-3" /> Google conectado
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs gap-1 text-gray-500">
                <Unlink className="w-3 h-3" /> Google não conectado
              </Badge>
            )}
            <Link to={createPageUrl("NewLeadPJ")}>
              <Button size="sm" style={{ background: `linear-gradient(135deg, ${BRAND.burgundy}, ${BRAND.coral})` }} className="text-white text-xs">
                <Plus className="w-3.5 h-3.5 mr-1" /> Novo Lead
              </Button>
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Hoje", value: stats.today, sub: `${stats.todayDone} feitas · ${stats.todayPending} pendentes`, bg: BRAND.burgundy },
            { label: "Atrasadas", value: stats.overdue, sub: "Requer atenção", bg: "#dc2626" },
            { label: "Semana", value: stats.week, sub: `${stats.weekDone} concluídas`, bg: "#16a34a" },
            { label: "Google Cal", value: googleEvents.length, sub: gcalStatus?.connected ? "Eventos sincronizados" : "Não conectado", bg: BRAND.coral },
          ].map((s, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card className="border-0 shadow-sm overflow-hidden">
                <CardContent className="p-4 relative" style={{ borderLeft: `4px solid ${s.bg}` }}>
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{s.label}</p>
                  <p className="text-2xl font-bold mt-0.5" style={{ color: s.bg }}>{s.value}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{s.sub}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="flex bg-white dark:bg-gray-800 rounded-lg border p-0.5 mr-2">
            {[
              { key: "day", icon: LayoutList, label: "Dia" },
              { key: "week", icon: CalendarRange, label: "Semana" },
              { key: "month", icon: CalendarDays, label: "Mês" },
            ].map((v) => (
              <button
                key={v.key}
                onClick={() => setViewMode(v.key)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  viewMode === v.key ? "text-white" : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                }`}
                style={viewMode === v.key ? { background: BRAND.burgundy } : {}}
              >
                <v.icon className="w-3.5 h-3.5" /> {v.label}
              </button>
            ))}
          </div>

          <div className="flex gap-1 flex-wrap">
            <button
              onClick={() => setFilterType("all")}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                filterType === "all" ? "text-white" : "text-gray-600 bg-gray-100 dark:bg-gray-800 dark:text-gray-300"
              }`}
              style={filterType === "all" ? { background: BRAND.burgundy } : {}}
            >
              Todas
            </button>
            {Object.entries(ACTIVITY_TYPES).map(([key, cfg]) => (
              <button
                key={key}
                onClick={() => setFilterType(key)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                  filterType === key ? "text-white" : "text-gray-600 bg-gray-100 dark:bg-gray-800 dark:text-gray-300"
                }`}
                style={filterType === key ? { background: cfg.dot } : {}}
              >
                <Circle className="w-2 h-2" style={{ fill: filterType === key ? "#fff" : cfg.dot, color: filterType === key ? "#fff" : cfg.dot }} />
                {cfg.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid lg:grid-cols-[1fr_320px] gap-5">

          <Card className="border-0 shadow-sm overflow-hidden">
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-6 h-6 animate-spin" style={{ color: BRAND.burgundy }} />
                </div>
              ) : (
                <>
                  {viewMode === "day" && (
                    <DayView
                      selectedDate={selectedDate}
                      setSelectedDate={setSelectedDate}
                      activities={selectedDayActivities}
                      googleEvents={googleEventsForDay(selectedDate)}
                      showGoogleEvents={showGoogleEvents}
                      getLeadById={getLeadById}
                      handleToggle={handleToggle}
                      fmtTime={fmtTime}
                    />
                  )}
                  {viewMode === "week" && (
                    <WeekView
                      weekStart={weekStart}
                      selectedDate={selectedDate}
                      setSelectedDate={setSelectedDate}
                      setViewMode={setViewMode}
                      getActivitiesForDay={getActivitiesForDay}
                      googleEventsForDay={googleEventsForDay}
                      showGoogleEvents={showGoogleEvents}
                    />
                  )}
                  {viewMode === "month" && (
                    <MonthView
                      currentMonth={currentMonth}
                      setCurrentMonth={setCurrentMonth}
                      calDays={calDays}
                      selectedDate={selectedDate}
                      setSelectedDate={setSelectedDate}
                      setViewMode={setViewMode}
                      getActivitiesForDay={getActivitiesForDay}
                      googleEventsForDay={googleEventsForDay}
                      showGoogleEvents={showGoogleEvents}
                    />
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <div className="space-y-4">
            {stats.overdue > 0 && (
              <Card className="border-0 shadow-sm" style={{ borderLeft: `4px solid #dc2626` }}>
                <CardContent className="p-4">
                  <h3 className="text-sm font-semibold text-red-600 flex items-center gap-1.5 mb-3">
                    <AlertCircle className="w-4 h-4" /> Atrasadas ({stats.overdue})
                  </h3>
                  <div className="space-y-2 max-h-[280px] overflow-y-auto">
                    {stats.overdueList.slice(0, 8).map((act) => (
                      <OverdueItem key={act.id} activity={act} getLeadById={getLeadById} handleToggle={handleToggle} />
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-1.5 mb-3">
                  <Clock className="w-4 h-4" style={{ color: BRAND.burgundy }} /> Próximas
                </h3>
                <UpcomingList filtered={filtered} today={today} getLeadById={getLeadById} />
              </CardContent>
            </Card>

            <MiniCalendar
              currentMonth={currentMonth}
              setCurrentMonth={setCurrentMonth}
              selectedDate={selectedDate}
              setSelectedDate={(d) => { setSelectedDate(d); setViewMode("day"); }}
              getActivitiesForDay={getActivitiesForDay}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function DayView({ selectedDate, setSelectedDate, activities, googleEvents, showGoogleEvents, getLeadById, handleToggle, fmtTime }) {
  return (
    <div>
      <div className="flex items-center justify-between px-5 py-3 border-b bg-white dark:bg-gray-800">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedDate(addDays(selectedDate, -1))}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div className="text-center">
          <p className="text-sm font-semibold">
            {isToday(selectedDate) ? "Hoje" : format(selectedDate, "EEEE", { locale: ptBR })}
          </p>
          <p className="text-xs text-gray-500">{format(selectedDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</p>
        </div>
        <div className="flex items-center gap-1">
          {!isToday(selectedDate) && (
            <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => setSelectedDate(new Date())}>Hoje</Button>
          )}
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedDate(addDays(selectedDate, 1))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="divide-y">
        {activities.length === 0 && (!showGoogleEvents || googleEvents.length === 0) ? (
          <div className="text-center py-16">
            <CalendarIcon className="w-10 h-10 mx-auto mb-3 text-gray-300" />
            <p className="text-sm text-gray-500">Nenhuma atividade neste dia</p>
          </div>
        ) : (
          <>
            <AnimatePresence>
              {activities.map((act, i) => (
                <ActivityRow key={act.id} activity={act} index={i} getLeadById={getLeadById} handleToggle={handleToggle} fmtTime={fmtTime} />
              ))}
            </AnimatePresence>
            {showGoogleEvents && googleEvents.length > 0 && (
              <div className="px-5 py-3 bg-blue-50/50 dark:bg-blue-950/20">
                <p className="text-[11px] font-medium text-blue-600 mb-2 flex items-center gap-1">
                  <CalendarIcon className="w-3 h-3" /> Google Calendar
                </p>
                {googleEvents.map((ev, i) => (
                  <div key={ev.id || i} className="flex items-center gap-3 py-1.5 text-sm">
                    <span className="text-xs text-blue-500 font-mono w-12">
                      {ev.start?.dateTime ? format(parseISO(ev.start.dateTime), "HH:mm") : "dia"}
                    </span>
                    <span className="text-gray-700 dark:text-gray-300 truncate">{ev.summary}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ActivityRow({ activity, index, getLeadById, handleToggle, fmtTime }) {
  const cfg = ACTIVITY_TYPES[activity.type] || ACTIVITY_TYPES.task;
  const Icon = cfg.icon;
  const leadId = getVal(activity, "leadId", "lead_id");
  const lead = getLeadById(leadId, activity._leadType);

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0 }}
      transition={{ delay: index * 0.03 }}
      className={`flex items-start gap-3 px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${
        activity.completed ? "opacity-60" : ""
      }`}
    >
      <button
        onClick={() => handleToggle(activity.id, activity.completed, activity._leadType)}
        className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all"
        style={{
          borderColor: activity.completed ? "#22c55e" : "#d1d5db",
          backgroundColor: activity.completed ? "#22c55e" : "transparent",
        }}
      >
        {activity.completed && <CheckCircle2 className="w-3 h-3 text-white" />}
      </button>

      <div className="flex-shrink-0 w-12 text-right">
        <span className="text-xs font-mono text-gray-500">{fmtTime(activity.scheduledAt)}</span>
      </div>

      <div className="w-1 self-stretch rounded-full flex-shrink-0" style={{ backgroundColor: cfg.dot }} />

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className={`text-sm font-medium ${activity.completed ? "line-through text-gray-400" : "text-gray-900 dark:text-gray-100"}`}>
              {activity.title || activity.description || "Atividade"}
            </p>
            {activity.description && activity.title && (
              <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{activity.description}</p>
            )}
            {lead && (
              <Link
                to={createPageUrl(lead._leadType === "pj" ? "LeadPJDetail" : "LeadDetail", { id: lead.id })}
                className="inline-flex items-center gap-1 mt-1 text-xs hover:underline"
                style={{ color: BRAND.burgundy }}
              >
                <User className="w-3 h-3" />
                {lead.name || lead.company_name || lead.companyName}
                {lead._leadType === "pj" && <Badge className="text-[9px] px-1 py-0 bg-blue-100 text-blue-700">PJ</Badge>}
                <ExternalLink className="w-2.5 h-2.5" />
              </Link>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Icon className="w-3.5 h-3.5" style={{ color: cfg.dot }} />
            <span className="text-[11px] font-medium" style={{ color: cfg.dot }}>{cfg.label}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function WeekView({ weekStart, selectedDate, setSelectedDate, setViewMode, getActivitiesForDay, googleEventsForDay, showGoogleEvents }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <div>
      <div className="flex items-center justify-between px-5 py-3 border-b bg-white dark:bg-gray-800">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedDate(addDays(selectedDate, -7))}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <p className="text-sm font-semibold">
          {format(weekStart, "dd MMM", { locale: ptBR })} - {format(addDays(weekStart, 6), "dd MMM yyyy", { locale: ptBR })}
        </p>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedDate(addDays(selectedDate, 7))}>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
      <div className="grid grid-cols-7 divide-x">
        {days.map((day) => {
          const acts = getActivitiesForDay(day);
          const gEvents = googleEventsForDay(day);
          const todayHighlight = isToday(day);
          return (
            <button
              key={day.toISOString()}
              onClick={() => { setSelectedDate(day); setViewMode("day"); }}
              className={`min-h-[160px] p-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${
                todayHighlight ? "bg-orange-50/50 dark:bg-orange-950/10" : ""
              }`}
            >
              <div className="mb-2">
                <p className="text-[10px] uppercase text-gray-500 font-medium">
                  {format(day, "EEE", { locale: ptBR })}
                </p>
                <p className={`text-lg font-bold ${todayHighlight ? "" : "text-gray-700 dark:text-gray-200"}`} style={todayHighlight ? { color: BRAND.burgundy } : {}}>
                  {format(day, "dd")}
                </p>
              </div>
              <div className="space-y-1">
                {acts.slice(0, 4).map((act) => {
                  const cfg = ACTIVITY_TYPES[act.type] || ACTIVITY_TYPES.task;
                  return (
                    <div key={act.id} className="flex items-center gap-1 text-[10px] leading-tight">
                      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: cfg.dot }} />
                      <span className={`truncate ${act.completed ? "line-through text-gray-400" : "text-gray-700 dark:text-gray-300"}`}>
                        {act.title || act.description || "Atividade"}
                      </span>
                    </div>
                  );
                })}
                {acts.length > 4 && (
                  <p className="text-[10px] text-gray-400 pl-2.5">+{acts.length - 4} mais</p>
                )}
                {showGoogleEvents && gEvents.slice(0, 2).map((ev, i) => (
                  <div key={`g-${i}`} className="flex items-center gap-1 text-[10px] leading-tight text-blue-600">
                    <CalendarIcon className="w-2 h-2 flex-shrink-0" />
                    <span className="truncate">{ev.summary}</span>
                  </div>
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MonthView({ currentMonth, setCurrentMonth, calDays, selectedDate, setSelectedDate, setViewMode, getActivitiesForDay, googleEventsForDay, showGoogleEvents }) {
  return (
    <div>
      <div className="flex items-center justify-between px-5 py-3 border-b bg-white dark:bg-gray-800">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <p className="text-sm font-semibold capitalize">
          {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
        </p>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
      <div className="grid grid-cols-7">
        {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((n) => (
          <div key={n} className="text-center text-[10px] uppercase font-semibold text-gray-500 py-2 border-b">{n}</div>
        ))}
        {calDays.map((day, idx) => {
          const acts = getActivitiesForDay(day);
          const isMonth = isSameMonth(day, currentMonth);
          const isT = isToday(day);
          const isSel = isSameDay(day, selectedDate);
          return (
            <button
              key={idx}
              onClick={() => { setSelectedDate(day); setViewMode("day"); }}
              className={`min-h-[70px] p-1 border-b border-r text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50 ${
                !isMonth ? "opacity-30" : ""
              } ${isT ? "bg-orange-50/50" : ""}`}
            >
              <p className={`text-xs font-medium mb-0.5 ${isT ? "font-bold" : ""}`} style={isT ? { color: BRAND.burgundy } : {}}>
                {format(day, "d")}
              </p>
              {acts.length > 0 && (
                <div className="flex flex-wrap gap-0.5">
                  {acts.slice(0, 3).map((a) => {
                    const c = ACTIVITY_TYPES[a.type] || ACTIVITY_TYPES.task;
                    return <div key={a.id} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c.dot }} />;
                  })}
                  {acts.length > 3 && <span className="text-[9px] text-gray-400">+{acts.length - 3}</span>}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MiniCalendar({ currentMonth, setCurrentMonth, selectedDate, setSelectedDate, getActivitiesForDay }) {
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart, { locale: ptBR });
  const calEnd = endOfWeek(monthEnd, { locale: ptBR });
  const days = [];
  let day = calStart;
  while (day <= calEnd) { days.push(day); day = addDays(day, 1); }

  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-1 hover:bg-gray-100 rounded">
            <ChevronLeft className="w-3.5 h-3.5 text-gray-500" />
          </button>
          <p className="text-xs font-semibold capitalize text-gray-700 dark:text-gray-200">
            {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
          </p>
          <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-1 hover:bg-gray-100 rounded">
            <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {["D", "S", "T", "Q", "Q", "S", "S"].map((n, i) => (
            <div key={i} className="text-center text-[10px] text-gray-400 font-medium py-0.5">{n}</div>
          ))}
          {days.map((d, i) => {
            const isMonth = isSameMonth(d, currentMonth);
            const isT = isToday(d);
            const isSel = isSameDay(d, selectedDate);
            const hasActs = getActivitiesForDay(d).length > 0;
            return (
              <button
                key={i}
                onClick={() => setSelectedDate(d)}
                className={`relative text-[11px] py-1 rounded transition-colors ${
                  !isMonth ? "text-gray-300 dark:text-gray-600" : "text-gray-700 dark:text-gray-200"
                } ${isSel ? "text-white font-bold" : ""} ${isT && !isSel ? "font-bold" : ""} hover:bg-gray-100 dark:hover:bg-gray-700`}
                style={isSel ? { background: BRAND.burgundy } : isT ? { color: BRAND.coral } : {}}
              >
                {format(d, "d")}
                {hasActs && !isSel && (
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full" style={{ background: BRAND.coral }} />
                )}
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function OverdueItem({ activity, getLeadById, handleToggle }) {
  const cfg = ACTIVITY_TYPES[activity.type] || ACTIVITY_TYPES.task;
  const Icon = cfg.icon;
  const leadId = getVal(activity, "leadId", "lead_id");
  const lead = getLeadById(leadId, activity._leadType);

  return (
    <div className="flex items-start gap-2 p-2 rounded-lg bg-red-50 dark:bg-red-950/20">
      <Icon className="w-3.5 h-3.5 mt-0.5 text-red-400 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate text-gray-800 dark:text-gray-200">{activity.title || "Atividade"}</p>
        {lead && <p className="text-[10px] text-gray-500 truncate">{lead.name || lead.company_name || lead.companyName}</p>}
        <p className="text-[10px] text-red-500 mt-0.5">
          {activity.scheduledAt && format(parseISO(activity.scheduledAt), "dd/MM HH:mm", { locale: ptBR })}
        </p>
      </div>
      <button
        onClick={() => handleToggle(activity.id, false, activity._leadType)}
        className="p-1 text-green-600 hover:bg-green-100 rounded flex-shrink-0"
      >
        <CheckCircle2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function UpcomingList({ filtered, today, getLeadById }) {
  const upcoming = filtered
    .filter((a) => {
      if (!a.scheduledAt || a.completed) return false;
      try { const d = parseISO(a.scheduledAt); return isFuture(d) && !isSameDay(d, today); } catch { return false; }
    })
    .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt))
    .slice(0, 8);

  if (!upcoming.length) {
    return (
      <div className="text-center py-6">
        <CalendarIcon className="w-8 h-8 mx-auto mb-2 text-gray-300" />
        <p className="text-xs text-gray-400">Nenhuma atividade futura</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {upcoming.map((act) => {
        const cfg = ACTIVITY_TYPES[act.type] || ACTIVITY_TYPES.task;
        const Icon = cfg.icon;
        const leadId = getVal(act, "leadId", "lead_id");
        const lead = getLeadById(leadId, act._leadType);
        return (
          <div key={act.id} className="flex items-start gap-2 p-2 rounded-lg bg-gray-50 dark:bg-gray-800/50">
            <div className="w-1 self-stretch rounded-full flex-shrink-0" style={{ background: cfg.dot }} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{act.title || "Atividade"}</p>
              {lead && (
                <Link
                  to={createPageUrl(lead._leadType === "pj" ? "LeadPJDetail" : "LeadDetail", { id: lead.id })}
                  className="text-[10px] hover:underline"
                  style={{ color: BRAND.burgundy }}
                >
                  {lead.name || lead.company_name || lead.companyName}
                </Link>
              )}
              <p className="text-[10px] text-gray-500 mt-0.5">
                {act.scheduledAt && format(parseISO(act.scheduledAt), "dd/MM HH:mm", { locale: ptBR })}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
