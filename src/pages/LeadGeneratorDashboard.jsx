import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Send, CheckCircle2, XCircle, Lock, ShieldAlert, TrendingUp,
  Users, Calendar, Loader2, ChevronLeft, ChevronRight, BarChart3
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";

const API_BASE = '/api';

function getAuthHeaders() {
  const token = localStorage.getItem('accessToken');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

const PERIOD_PRESETS = [
  { value: 'today', label: 'Hoje' },
  { value: '7d', label: 'Últimos 7 dias' },
  { value: '30d', label: 'Últimos 30 dias' },
  { value: '90d', label: 'Últimos 90 dias' },
  { value: 'custom', label: 'Personalizado' },
];

function getDateRange(period) {
  const now = new Date();
  switch (period) {
    case 'today':
      return { from: startOfDay(now).toISOString(), to: endOfDay(now).toISOString() };
    case '7d':
      return { from: startOfDay(subDays(now, 7)).toISOString(), to: endOfDay(now).toISOString() };
    case '30d':
      return { from: startOfDay(subDays(now, 30)).toISOString(), to: endOfDay(now).toISOString() };
    case '90d':
      return { from: startOfDay(subDays(now, 90)).toISOString(), to: endOfDay(now).toISOString() };
    default:
      return { from: null, to: null };
  }
}

export default function LeadGeneratorDashboard() {
  const [period, setPeriod] = useState('today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [selectedUser, setSelectedUser] = useState('all');
  const [selectedTeam, setSelectedTeam] = useState('all');
  const [logsPage, setLogsPage] = useState(1);
  const [logsStatus, setLogsStatus] = useState('all');

  const dateRange = useMemo(() => {
    if (period === 'custom') {
      return {
        from: customFrom ? new Date(customFrom).toISOString() : null,
        to: customTo ? endOfDay(new Date(customTo)).toISOString() : null,
      };
    }
    return getDateRange(period);
  }, [period, customFrom, customTo]);

  const dashboardQueryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (dateRange.from) params.set('from', dateRange.from);
    if (dateRange.to) params.set('to', dateRange.to);
    if (selectedUser !== 'all') params.set('userId', selectedUser);
    if (selectedTeam !== 'all') params.set('teamId', selectedTeam);
    return params.toString();
  }, [dateRange, selectedUser, selectedTeam]);

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

  const logsQueryParams = useMemo(() => {
    const params = new URLSearchParams();
    params.set('page', logsPage);
    params.set('limit', '20');
    if (logsStatus !== 'all') params.set('status', logsStatus);
    if (dateRange.from) params.set('from', dateRange.from);
    if (dateRange.to) params.set('to', dateRange.to);
    if (selectedUser !== 'all') params.set('userId', selectedUser);
    return params.toString();
  }, [logsPage, logsStatus, dateRange, selectedUser]);

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

  const { data: agents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: () => base44.entities.Agent.list(),
  });

  const totals = dashboardData?.totals || {};
  const byHour = dashboardData?.byHour || [];
  const byUser = dashboardData?.byUser || [];
  const byTeam = dashboardData?.byTeam || [];

  const hourChartData = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, i) => ({
      hora: `${String(i).padStart(2, '0')}h`,
      enviados: 0,
      falhas: 0,
    }));
    byHour.forEach(h => {
      if (h.hora >= 0 && h.hora < 24) {
        hours[h.hora].enviados = h.enviados || 0;
        hours[h.hora].falhas = h.falhas || 0;
      }
    });
    return hours;
  }, [byHour]);

  const taxaSucesso = totals.taxa_sucesso != null ? Number(totals.taxa_sucesso).toFixed(1) : '0.0';

  const getStatusBadge = (status) => {
    switch (status) {
      case 'enviado':
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300">Enviado</Badge>;
      case 'falha':
        return <Badge className="bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300">Falha</Badge>;
      case 'bloqueado_30_dias':
        return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">Bloq. 30d</Badge>;
      case 'bloqueado_duplicidade':
        return <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300">Duplicidade</Badge>;
      case 'reenvio_agendado':
        return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300">Reenvio</Badge>;
      default:
        return <Badge variant="secondary">{status || '-'}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="w-5 h-5 text-amber-500" />
            Painel de Disparos WhatsApp
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <Label className="text-xs">Período</Label>
              <Select value={period} onValueChange={(val) => { setPeriod(val); setLogsPage(1); }}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PERIOD_PRESETS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {period === 'custom' && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">De</Label>
                  <Input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="w-40" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Até</Label>
                  <Input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="w-40" />
                </div>
              </>
            )}
            {teams.length > 0 && (
              <div className="space-y-1">
                <Label className="text-xs">Time</Label>
                <Select value={selectedTeam} onValueChange={(val) => { setSelectedTeam(val); setLogsPage(1); }}>
                  <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os Times</SelectItem>
                    {teams.map(t => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {loadingDashboard ? (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
            <p className="text-gray-500">Carregando métricas...</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-green-600">{totals.enviados || 0}</p>
                    <p className="text-xs text-gray-500">Enviados</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30">
                    <XCircle className="w-5 h-5 text-red-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-red-500">{totals.falhas || 0}</p>
                    <p className="text-xs text-gray-500">Falhas</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                    <Lock className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-amber-600">{(totals.bloqueados_30d || 0) + (totals.bloqueados_dup || 0)}</p>
                    <p className="text-xs text-gray-500">Bloqueados</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                    <TrendingUp className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-blue-600">{taxaSucesso}%</p>
                    <p className="text-xs text-gray-500">Taxa de Sucesso</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-700 dark:text-gray-300">Envios por Hora</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={hourChartData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="hora" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="enviados" fill="#22c55e" name="Enviados" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="falhas" fill="#ef4444" name="Falhas" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                  <Users className="w-4 h-4" /> Por Usuário
                </CardTitle>
              </CardHeader>
              <CardContent>
                {byUser.length === 0 ? (
                  <p className="text-sm text-gray-400 py-4 text-center">Nenhum dado disponível</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-gray-700">
                          <th className="text-left py-2 px-3 font-medium text-gray-500">Usuário</th>
                          <th className="text-center py-2 px-3 font-medium text-gray-500">Total</th>
                          <th className="text-center py-2 px-3 font-medium text-green-600">Enviados</th>
                          <th className="text-center py-2 px-3 font-medium text-red-500">Falhas</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {byUser.map((u, i) => (
                          <tr key={i}>
                            <td className="py-2 px-3 text-gray-700 dark:text-gray-300">{u.user_email || '-'}</td>
                            <td className="py-2 px-3 text-center font-medium">{u.total}</td>
                            <td className="py-2 px-3 text-center text-green-600">{u.enviados}</td>
                            <td className="py-2 px-3 text-center text-red-500">{u.falhas}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                  <Users className="w-4 h-4" /> Por Time
                </CardTitle>
              </CardHeader>
              <CardContent>
                {byTeam.length === 0 ? (
                  <p className="text-sm text-gray-400 py-4 text-center">Nenhum dado disponível</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-gray-700">
                          <th className="text-left py-2 px-3 font-medium text-gray-500">Time</th>
                          <th className="text-center py-2 px-3 font-medium text-gray-500">Total</th>
                          <th className="text-center py-2 px-3 font-medium text-green-600">Enviados</th>
                          <th className="text-center py-2 px-3 font-medium text-red-500">Falhas</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {byTeam.map((t, i) => (
                          <tr key={i}>
                            <td className="py-2 px-3 text-gray-700 dark:text-gray-300">{t.team_name || 'Sem time'}</td>
                            <td className="py-2 px-3 text-center font-medium">{t.total}</td>
                            <td className="py-2 px-3 text-center text-green-600">{t.enviados}</td>
                            <td className="py-2 px-3 text-center text-red-500">{t.falhas}</td>
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

      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <CardTitle className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
              <Calendar className="w-4 h-4" /> Logs Recentes
            </CardTitle>
            <Select value={logsStatus} onValueChange={(val) => { setLogsStatus(val); setLogsPage(1); }}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Status</SelectItem>
                <SelectItem value="enviado">Enviado</SelectItem>
                <SelectItem value="falha">Falha</SelectItem>
                <SelectItem value="bloqueado_30_dias">Bloqueado 30d</SelectItem>
                <SelectItem value="bloqueado_duplicidade">Duplicidade</SelectItem>
                <SelectItem value="reenvio_agendado">Reenvio</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loadingLogs ? (
            <div className="py-8 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left py-2.5 px-3 font-medium text-gray-500">Data/Hora</th>
                      <th className="text-left py-2.5 px-3 font-medium text-gray-500">Número</th>
                      <th className="text-left py-2.5 px-3 font-medium text-gray-500">Nome</th>
                      <th className="text-left py-2.5 px-3 font-medium text-gray-500">Status</th>
                      <th className="text-left py-2.5 px-3 font-medium text-gray-500">Tentativa</th>
                      <th className="text-left py-2.5 px-3 font-medium text-gray-500">Usuário</th>
                      <th className="text-left py-2.5 px-3 font-medium text-gray-500">MSG ID</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {(logsData?.data || []).length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-gray-400">Nenhum log encontrado</td>
                      </tr>
                    ) : (
                      (logsData?.data || []).map((log, i) => (
                        <tr key={log.id || i} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                          <td className="py-2 px-3 text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">
                            {log.sent_at ? format(new Date(log.sent_at), 'dd/MM/yy HH:mm', { locale: ptBR }) : '-'}
                          </td>
                          <td className="py-2 px-3 text-gray-700 dark:text-gray-300">{log.lead_number}</td>
                          <td className="py-2 px-3 text-gray-700 dark:text-gray-300">{log.lead_name || '-'}</td>
                          <td className="py-2 px-3">{getStatusBadge(log.status_envio)}</td>
                          <td className="py-2 px-3 text-center text-gray-500">{log.tentativa_numero || 1}</td>
                          <td className="py-2 px-3 text-xs text-gray-500 max-w-[150px] truncate">{log.user_email || '-'}</td>
                          <td className="py-2 px-3 text-xs text-gray-400 max-w-[120px] truncate" title={log.message_sent_id || ''}>
                            {log.message_sent_id ? log.message_sent_id.substring(0, 12) + '...' : '-'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {logsData && logsData.totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-xs text-gray-500">
                    Página {logsData.page} de {logsData.totalPages} ({logsData.total} registros)
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={logsPage <= 1}
                      onClick={() => setLogsPage(p => p - 1)}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={logsPage >= logsData.totalPages}
                      onClick={() => setLogsPage(p => p + 1)}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
