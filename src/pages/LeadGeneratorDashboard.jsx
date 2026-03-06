import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Send, CheckCircle2, XCircle, Lock, TrendingUp,
  Users, Calendar, Loader2, ChevronLeft, ChevronRight, BarChart3,
  Target, DollarSign, RefreshCw, Phone, ArrowRightLeft,
  AlertTriangle, Activity, UserCheck, Clock
} from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from "recharts";
import { format, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

const API_BASE = '/api';

function getAuthHeaders() {
  const token = localStorage.getItem('accessToken');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

export default function LeadGeneratorDashboard() {
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [logsPage, setLogsPage] = useState(1);
  const [checkingConversions, setCheckingConversions] = useState(false);

  const dateRange = useMemo(() => ({
    from: dateFrom ? `${dateFrom}T00:00:00` : null,
    to: dateTo ? `${dateTo}T23:59:59` : null,
  }), [dateFrom, dateTo]);

  const dashboardQueryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (dateRange.from) params.set('from', dateRange.from);
    if (dateRange.to) params.set('to', dateRange.to);
    return params.toString();
  }, [dateRange]);

  const { data: dashboardData, isLoading: loadingDashboard, refetch: refetchDashboard } = useQuery({
    queryKey: ['lead-generator-dashboard', dashboardQueryParams],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/functions/lead-generator-whatsapp-dashboard?${dashboardQueryParams}`, {
        headers: { ...getAuthHeaders() },
      });
      if (!res.ok) throw new Error('Erro ao carregar dashboard');
      return res.json();
    },
    refetchInterval: 30000,
  });

  const { data: conversionData, isLoading: loadingConversions, refetch: refetchConversions } = useQuery({
    queryKey: ['lead-generator-conversions', dashboardQueryParams],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/functions/lead-generator-conversions-metrics?${dashboardQueryParams}`, {
        headers: { ...getAuthHeaders() },
      });
      if (!res.ok) throw new Error('Erro ao carregar conversões');
      return res.json();
    },
    refetchInterval: 60000,
  });

  const logsQueryParams = useMemo(() => {
    const params = new URLSearchParams();
    params.set('page', logsPage);
    params.set('limit', '15');
    if (dateRange.from) params.set('from', dateRange.from);
    if (dateRange.to) params.set('to', dateRange.to);
    return params.toString();
  }, [logsPage, dateRange]);

  const { data: logsData, isLoading: loadingLogs } = useQuery({
    queryKey: ['lead-generator-logs', logsQueryParams],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/functions/lead-generator-whatsapp-logs-list?${logsQueryParams}`, {
        headers: { ...getAuthHeaders() },
      });
      if (!res.ok) throw new Error('Erro ao carregar logs');
      return res.json();
    },
    refetchInterval: 30000,
  });

  const { data: teams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: () => base44.entities.Team.list(),
  });

  const handleCheckConversions = async () => {
    setCheckingConversions(true);
    try {
      const res = await fetch(`${API_BASE}/functions/lead-generator-check-conversions`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: dateRange.from, to: dateRange.to }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro');
      if (data.matched > 0) {
        toast.success(`${data.matched} nova(s) conversão(ões) identificada(s)!`);
      } else {
        toast.info('Nenhuma nova conversão encontrada.');
      }
      refetchConversions();
      refetchDashboard();
    } catch (err) {
      toast.error(`Erro: ${err.message}`);
    } finally {
      setCheckingConversions(false);
    }
  };

  const totals = dashboardData?.totals || {};
  const byHour = dashboardData?.byHour || [];
  const byDay = dashboardData?.byDay || [];
  const byUser = dashboardData?.byUser || [];
  const byTeam = dashboardData?.byTeam || [];

  const convTotals = conversionData?.totals || {};
  const convByDay = conversionData?.byDay || [];
  const convByUser = conversionData?.byUser || [];
  const convRecent = conversionData?.recent || [];

  const dayChartData = useMemo(() => {
    return byDay.map(d => ({
      dia: d.dia ? format(new Date(d.dia), 'dd/MM', { locale: ptBR }) : '',
      total: d.total || 0,
      enviados: d.enviados || 0,
      falhas: d.falhas || 0,
    }));
  }, [byDay]);

  const convDayChartData = useMemo(() => {
    return convByDay.map(d => ({
      dia: d.dia ? format(new Date(d.dia), 'dd/MM', { locale: ptBR }) : '',
      conversoes: d.conversoes || 0,
    }));
  }, [convByDay]);

  const hourChartData = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, i) => ({
      hora: `${String(i).padStart(2, '0')}h`,
      total: 0,
    }));
    byHour.forEach(h => {
      if (h.hora >= 0 && h.hora < 24) {
        hours[h.hora].total = h.total || 0;
      }
    });
    return hours;
  }, [byHour]);

  const userPerformanceData = useMemo(() => {
    const convMap = new Map();
    convByUser.forEach(u => {
      convMap.set(u.dispatch_user_email, u.conversoes || 0);
    });
    return byUser.slice(0, 10).map(u => ({
      usuario: (u.user_email || '').split('@')[0] || '-',
      disparos: u.total || 0,
      conversoes: convMap.get(u.user_email) || 0,
    }));
  }, [byUser, convByUser]);

  const teamPerformanceData = useMemo(() => {
    const convByTeamData = conversionData?.byTeam || [];
    const convMap = new Map();
    convByTeamData.forEach(t => {
      convMap.set(String(t.team_id), t.conversoes || 0);
    });
    return byTeam.map(t => ({
      time: t.team_name || 'Sem time',
      disparos: t.total || 0,
      conversoes: convMap.get(String(t.team_id)) || 0,
    }));
  }, [byTeam, conversionData]);

  const taxaSucesso = totals.taxa_sucesso != null ? Number(totals.taxa_sucesso).toFixed(1) : '0.0';
  const taxaFalha = totals.total > 0 ? ((totals.falhas || 0) / totals.total * 100) : 0;
  const totalBloqueios = (totals.bloqueados_30d || 0) + (totals.bloqueados_dup || 0);
  const taxaConversao = convTotals.taxa_conversao || 0;

  const alerts = useMemo(() => {
    const list = [];
    if (taxaFalha > 10) {
      list.push({ type: 'error', message: `Taxa de falha em ${taxaFalha.toFixed(1)}% — acima do limite de 10%` });
    }
    if (totalBloqueios > 0 && totals.total > 0 && (totalBloqueios / totals.total * 100) > 30) {
      list.push({ type: 'warning', message: `Alto volume de bloqueios: ${totalBloqueios} registros (${(totalBloqueios / totals.total * 100).toFixed(1)}%)` });
    }
    if (byDay.length >= 3) {
      const lastDays = byDay.slice(-3);
      if (lastDays.length === 3 && lastDays[2].total < lastDays[0].total * 0.5) {
        list.push({ type: 'warning', message: 'Queda brusca no volume de disparos nos últimos dias' });
      }
    }
    return list;
  }, [taxaFalha, totalBloqueios, totals, byDay]);

  const getStatusBadge = (status) => {
    const statusMap = {
      'enviado': { cls: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300', label: 'Enviado' },
      'falha': { cls: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300', label: 'Falha' },
      'bloqueado_30_dias': { cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300', label: 'Bloq. 30d' },
      'bloqueado_duplicidade': { cls: 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300', label: 'Duplicidade' },
      'reenvio_agendado': { cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300', label: 'Reenvio' },
    };
    const s = statusMap[status];
    if (s) return <Badge className={s.cls}>{s.label}</Badge>;
    return <Badge variant="secondary">{status || '-'}</Badge>;
  };

  const isLoading = loadingDashboard || loadingConversions;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="w-5 h-5 text-indigo-500" />
              Dashboard de Disparos e Conversões
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCheckConversions}
                disabled={checkingConversions}
                className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-300"
              >
                {checkingConversions ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
                Verificar Conversões
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { refetchDashboard(); refetchConversions(); }}>
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Data Inicial</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={e => { setDateFrom(e.target.value); setLogsPage(1); }}
                className="w-40"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Data Final</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={e => { setDateTo(e.target.value); setLogsPage(1); }}
                className="w-40"
              />
            </div>
            <div className="flex gap-1 ml-2">
              {[
                { label: 'Hoje', fn: () => { const t = format(new Date(), 'yyyy-MM-dd'); setDateFrom(t); setDateTo(t); } },
                { label: '7d', fn: () => { setDateFrom(format(subDays(new Date(), 7), 'yyyy-MM-dd')); setDateTo(format(new Date(), 'yyyy-MM-dd')); } },
                { label: '30d', fn: () => { setDateFrom(format(subDays(new Date(), 30), 'yyyy-MM-dd')); setDateTo(format(new Date(), 'yyyy-MM-dd')); } },
                { label: '90d', fn: () => { setDateFrom(format(subDays(new Date(), 90), 'yyyy-MM-dd')); setDateTo(format(new Date(), 'yyyy-MM-dd')); } },
              ].map(p => (
                <Button key={p.label} variant="outline" size="sm" className="text-xs px-2 h-8" onClick={() => { p.fn(); setLogsPage(1); }}>
                  {p.label}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a, i) => (
            <div key={i} className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
              a.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800' :
              'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800'
            }`}>
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {a.message}
            </div>
          ))}
        </div>
      )}

      {isLoading ? (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
            <p className="text-gray-500">Carregando métricas...</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Card>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30">
                    <Send className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-indigo-600">{totals.total || 0}</p>
                    <p className="text-[11px] text-gray-500">Total Disparos</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-green-600">{totals.enviados || 0}</p>
                    <p className="text-[11px] text-gray-500">Com Sucesso</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30">
                    <XCircle className="w-4 h-4 text-red-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-red-500">{totals.falhas || 0}</p>
                    <p className="text-[11px] text-gray-500">Falhas</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                    <Lock className="w-4 h-4 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-amber-600">{totalBloqueios}</p>
                    <p className="text-[11px] text-gray-500">Bloqueios</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                    <TrendingUp className="w-4 h-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-blue-600">{taxaSucesso}%</p>
                    <p className="text-[11px] text-gray-500">Taxa Sucesso</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card className="border-emerald-200 dark:border-emerald-800">
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                    <Target className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-emerald-600">{convTotals.total_conversoes || 0}</p>
                    <p className="text-[11px] text-gray-500">Conversões</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-emerald-200 dark:border-emerald-800">
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                    <Activity className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-emerald-600">{taxaConversao}%</p>
                    <p className="text-[11px] text-gray-500">Taxa Conversão</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-emerald-200 dark:border-emerald-800">
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                    <DollarSign className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-lg font-bold text-emerald-600">
                      {convTotals.valor_total ? `R$ ${Number(convTotals.valor_total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'R$ 0,00'}
                    </p>
                    <p className="text-[11px] text-gray-500">Valor Total Vendas</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-emerald-200 dark:border-emerald-800">
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                    <UserCheck className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-emerald-600">{convTotals.leads_unicos || 0}</p>
                    <p className="text-[11px] text-gray-500">Leads Convertidos</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-indigo-500" /> Disparos por Dia
                </CardTitle>
              </CardHeader>
              <CardContent>
                {dayChartData.length === 0 ? (
                  <p className="text-sm text-gray-400 py-8 text-center">Nenhum dado disponível</p>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={dayChartData}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="dia" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="total" stroke="#6366f1" name="Total" strokeWidth={2} dot={{ r: 2 }} />
                      <Line type="monotone" dataKey="enviados" stroke="#22c55e" name="Sucessos" strokeWidth={2} dot={{ r: 2 }} />
                      <Line type="monotone" dataKey="falhas" stroke="#ef4444" name="Falhas" strokeWidth={1.5} dot={{ r: 2 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                  <Target className="w-4 h-4 text-emerald-500" /> Conversões por Dia
                </CardTitle>
              </CardHeader>
              <CardContent>
                {convDayChartData.length === 0 ? (
                  <p className="text-sm text-gray-400 py-8 text-center">Nenhuma conversão no período</p>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={convDayChartData}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="dia" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="conversoes" fill="#10b981" name="Conversões" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                  <Users className="w-4 h-4 text-indigo-500" /> Performance por Usuário
                </CardTitle>
              </CardHeader>
              <CardContent>
                {userPerformanceData.length === 0 ? (
                  <p className="text-sm text-gray-400 py-8 text-center">Nenhum dado disponível</p>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={userPerformanceData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis type="number" tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="usuario" tick={{ fontSize: 10 }} width={90} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="disparos" fill="#6366f1" name="Disparos" radius={[0, 4, 4, 0]} />
                      <Bar dataKey="conversoes" fill="#10b981" name="Conversões" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                  <Users className="w-4 h-4 text-indigo-500" /> Performance por Time
                </CardTitle>
              </CardHeader>
              <CardContent>
                {teamPerformanceData.length === 0 ? (
                  <p className="text-sm text-gray-400 py-8 text-center">Nenhum dado disponível</p>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={teamPerformanceData}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="disparos" fill="#6366f1" name="Disparos" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="conversoes" fill="#10b981" name="Conversões" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-500" /> Disparos por Hora do Dia
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={hourChartData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="hora" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="total" fill="#818cf8" name="Disparos" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                  <Calendar className="w-4 h-4" /> Disparos Recentes
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingLogs ? (
                  <div className="py-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-indigo-500" /></div>
                ) : (
                  <>
                    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                            <th className="text-left py-2 px-2 font-medium text-gray-500">Data/Hora</th>
                            <th className="text-left py-2 px-2 font-medium text-gray-500">Telefone</th>
                            <th className="text-left py-2 px-2 font-medium text-gray-500">Usuário</th>
                            <th className="text-left py-2 px-2 font-medium text-gray-500">Status</th>
                            <th className="text-center py-2 px-2 font-medium text-gray-500">Tent.</th>
                            <th className="text-left py-2 px-2 font-medium text-gray-500">MSG ID</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                          {(logsData?.data || []).length === 0 ? (
                            <tr><td colSpan={6} className="py-6 text-center text-gray-400">Nenhum log encontrado</td></tr>
                          ) : (
                            (logsData?.data || []).map((log, i) => (
                              <tr key={log.id || i} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                                <td className="py-1.5 px-2 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                                  {log.sent_at ? format(new Date(log.sent_at), 'dd/MM HH:mm', { locale: ptBR }) : '-'}
                                </td>
                                <td className="py-1.5 px-2 text-gray-700 dark:text-gray-300">{log.lead_number}</td>
                                <td className="py-1.5 px-2 text-gray-500 max-w-[100px] truncate">{(log.user_email || '').split('@')[0] || '-'}</td>
                                <td className="py-1.5 px-2">{getStatusBadge(log.status_envio)}</td>
                                <td className="py-1.5 px-2 text-center text-gray-500">{log.tentativa_numero || 1}</td>
                                <td className="py-1.5 px-2 text-gray-400 max-w-[80px] truncate" title={log.message_sent_id || ''}>
                                  {log.message_sent_id ? log.message_sent_id.substring(0, 10) + '…' : '-'}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                    {logsData && logsData.totalPages > 1 && (
                      <div className="flex items-center justify-between mt-3">
                        <p className="text-[11px] text-gray-500">Pág. {logsData.page}/{logsData.totalPages} ({logsData.total})</p>
                        <div className="flex gap-1">
                          <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={logsPage <= 1} onClick={() => setLogsPage(p => p - 1)}>
                            <ChevronLeft className="w-3 h-3" />
                          </Button>
                          <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={logsPage >= logsData.totalPages} onClick={() => setLogsPage(p => p + 1)}>
                            <ChevronRight className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="border-emerald-200 dark:border-emerald-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                  <ArrowRightLeft className="w-4 h-4" /> Conversões Recentes
                </CardTitle>
              </CardHeader>
              <CardContent>
                {convRecent.length === 0 ? (
                  <div className="py-8 text-center">
                    <p className="text-sm text-gray-400">Nenhuma conversão encontrada</p>
                    <p className="text-xs text-gray-400 mt-1">Clique em "Verificar Conversões" para cruzar dados com o ERP</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-emerald-200 dark:border-emerald-800">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-emerald-50/50 dark:bg-emerald-900/20 border-b border-emerald-200 dark:border-emerald-800">
                          <th className="text-left py-2 px-2 font-medium text-gray-500">Telefone</th>
                          <th className="text-left py-2 px-2 font-medium text-gray-500">Titular</th>
                          <th className="text-left py-2 px-2 font-medium text-gray-500">Produto</th>
                          <th className="text-left py-2 px-2 font-medium text-gray-500">Contrato</th>
                          <th className="text-right py-2 px-2 font-medium text-gray-500">Valor</th>
                          <th className="text-left py-2 px-2 font-medium text-gray-500">Disparado por</th>
                          <th className="text-left py-2 px-2 font-medium text-gray-500">Disparo</th>
                          <th className="text-left py-2 px-2 font-medium text-gray-500">Venda</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-emerald-100 dark:divide-emerald-900/30">
                        {convRecent.slice(0, 15).map((c, i) => (
                          <tr key={i} className="hover:bg-emerald-50/30 dark:hover:bg-emerald-900/10">
                            <td className="py-1.5 px-2 text-gray-700 dark:text-gray-300">
                              <div className="flex items-center gap-1">
                                <Phone className="w-3 h-3 text-gray-400" />
                                {c.lead_number}
                              </div>
                            </td>
                            <td className="py-1.5 px-2 text-gray-700 dark:text-gray-300 max-w-[120px] truncate">{c.erp_titular || '-'}</td>
                            <td className="py-1.5 px-2 text-gray-600 max-w-[100px] truncate">{c.erp_produto || '-'}</td>
                            <td className="py-1.5 px-2 text-gray-600">{c.erp_contrato || '-'}</td>
                            <td className="py-1.5 px-2 text-right font-medium text-emerald-600">
                              R$ {Number(c.erp_valor_contrato || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="py-1.5 px-2 text-gray-500 max-w-[90px] truncate">{(c.dispatch_user_email || '').split('@')[0] || '-'}</td>
                            <td className="py-1.5 px-2 text-gray-500 whitespace-nowrap">
                              {c.dispatch_date ? format(new Date(c.dispatch_date), 'dd/MM/yy', { locale: ptBR }) : '-'}
                            </td>
                            <td className="py-1.5 px-2 text-gray-500 whitespace-nowrap">
                              {c.data_venda ? format(new Date(c.data_venda), 'dd/MM/yy', { locale: ptBR }) : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
