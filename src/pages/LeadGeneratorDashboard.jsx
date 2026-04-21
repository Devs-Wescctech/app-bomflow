import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Send, CheckCircle2, XCircle, Lock, TrendingUp,
  Users, Loader2, ChevronLeft, ChevronRight, BarChart3,
  Target, DollarSign, RefreshCw, Phone, ArrowRightLeft,
  AlertTriangle, Activity, UserCheck, Clock, Award,
  ShoppingBag, Zap, ChevronDown, ChevronUp, Hash
} from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, FunnelChart, Funnel,
  LabelList, Cell
} from "recharts";
import { format, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

const API_BASE = '/api';
const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

function getAuthHeaders() {
  const token = localStorage.getItem('accessToken');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function CollapsibleSection({ title, icon: Icon, iconColor = "text-indigo-500", children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card>
      <CardHeader className="pb-2 cursor-pointer select-none" onClick={() => setOpen(!open)}>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
            <Icon className={`w-4 h-4 ${iconColor}`} /> {title}
          </CardTitle>
          {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </CardHeader>
      {open && <CardContent>{children}</CardContent>}
    </Card>
  );
}

export default function LeadGeneratorDashboard() {
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [logsPage, setLogsPage] = useState(1);
  const [checkingConversions, setCheckingConversions] = useState(false);
  const [campaignPage, setCampaignPage] = useState(1);
  const [valChannel, setValChannel] = useState('');
  const [valUf, setValUf] = useState('');
  const [valProduto, setValProduto] = useState('');

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

  const { data: roiData, isLoading: loadingRoi, refetch: refetchRoi } = useQuery({
    queryKey: ['lead-generator-roi-metrics', dashboardQueryParams],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/functions/lead-generator-roi-metrics?${dashboardQueryParams}`, {
        headers: { ...getAuthHeaders() },
      });
      if (!res.ok) throw new Error('Erro ao carregar métricas ROI');
      return res.json();
    },
    refetchInterval: 60000,
  });

  const validationQueryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (dateRange.from) params.set('from', dateRange.from);
    if (dateRange.to) params.set('to', dateRange.to);
    if (valChannel) params.set('channelToken', valChannel);
    if (valUf) params.set('uf', valUf);
    if (valProduto) params.set('produto', valProduto);
    return params.toString();
  }, [dateRange, valChannel, valUf, valProduto]);

  const { data: validationsData, isLoading: loadingValidations } = useQuery({
    queryKey: ['whatsapp-validations-stats', validationQueryParams],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/functions/whatsapp-validations-stats?${validationQueryParams}`, {
        headers: { ...getAuthHeaders() },
      });
      if (!res.ok) return { success: false, totals: {}, base: {}, runs: {}, byDay: [] };
      return res.json();
    },
    refetchInterval: 60000,
  });

  const { data: validationFilters } = useQuery({
    queryKey: ['whatsapp-validations-filters'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/functions/whatsapp-validations-filters`, {
        headers: { ...getAuthHeaders() },
      });
      if (!res.ok) return { channels: [], ufs: [], produtos: [] };
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: failureReasonsData } = useQuery({
    queryKey: ['lead-generator-failure-reasons', dashboardQueryParams],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/functions/lead-generator-log-estruturado/failure-reasons?${dashboardQueryParams}`, {
        headers: { ...getAuthHeaders() },
      });
      if (!res.ok) return { success: false, reasons: [] };
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
      refetchRoi();
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
  const byBatch = dashboardData?.byBatch || [];

  const convTotals = conversionData?.totals || {};
  const convByDay = conversionData?.byDay || [];
  const convByUser = conversionData?.byUser || [];
  const convByTeam = conversionData?.byTeam || [];
  const convByProduct = conversionData?.byProduct || [];
  const convByBatch = conversionData?.byBatch || [];
  const convRecent = conversionData?.recent || [];

  const roiTotals = roiData?.totals || {};
  const roiSeries = roiData?.series || {};

  const taxaSucesso = totals.taxa_sucesso != null ? Number(totals.taxa_sucesso).toFixed(1) : '0.0';
  const taxaFalha = totals.total > 0 ? ((totals.falhas || 0) / totals.total * 100) : 0;
  const totalBloqueios = (totals.bloqueados_30d || 0) + (totals.bloqueados_dup || 0);
  const taxaConversao = roiTotals.taxa_conversao || 0;
  const roiComercial = roiTotals.roi || 0;

  const totalEnviados = (totals.total || 0) - totalBloqueios;
  const funnelData = useMemo(() => [
    { name: 'Leads Processados', value: totals.total || 0, fill: '#6366f1' },
    { name: 'Mensagens Enviadas', value: totalEnviados, fill: '#3b82f6' },
    { name: 'Com Sucesso', value: totals.enviados || 0, fill: '#10b981' },
    { name: 'Conversões', value: roiTotals.conversoes || 0, fill: '#f59e0b' },
  ], [totals, totalEnviados, roiTotals]);

  const dayChartData = useMemo(() => byDay.map(d => ({
    dia: d.dia ? format(new Date(d.dia), 'dd/MM', { locale: ptBR }) : '',
    total: d.total || 0,
    enviados: d.enviados || 0,
    falhas: d.falhas || 0,
  })), [byDay]);

  const roiConvPorDia = roiSeries.conversoes_por_dia || [];
  const roiValorPorDia = roiSeries.valor_vendas_por_dia || [];

  const convDayChartData = useMemo(() => roiConvPorDia.map(d => ({
    dia: d.dia ? format(new Date(d.dia), 'dd/MM', { locale: ptBR }) : '',
    conversoes: d.conversoes || 0,
  })), [roiConvPorDia]);

  const valueDayChartData = useMemo(() => roiValorPorDia.map(d => ({
    dia: d.dia ? format(new Date(d.dia), 'dd/MM', { locale: ptBR }) : '',
    valor: d.valor || 0,
  })), [roiValorPorDia]);

  const hourChartData = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, i) => ({ hora: `${String(i).padStart(2, '0')}h`, total: 0 }));
    byHour.forEach(h => { if (h.hora >= 0 && h.hora < 24) hours[h.hora].total = h.total || 0; });
    return hours;
  }, [byHour]);

  const userRankingData = useMemo(() => {
    const convMap = new Map();
    convByUser.forEach(u => convMap.set(u.dispatch_user_email, { conversoes: u.conversoes || 0, valor: u.valor_total || 0 }));
    return byUser.map(u => {
      const conv = convMap.get(u.user_email) || { conversoes: 0, valor: 0 };
      const successCount = u.enviados || 0;
      return {
        usuario: (u.user_email || '').split('@')[0] || '-',
        email: u.user_email,
        disparos: u.total || 0,
        sucessos: successCount,
        conversoes: conv.conversoes,
        taxaConv: successCount > 0 ? ((conv.conversoes / successCount) * 100).toFixed(1) : '0.0',
        valor: conv.valor,
      };
    }).sort((a, b) => b.valor - a.valor);
  }, [byUser, convByUser]);

  const teamPerformanceData = useMemo(() => {
    const convMap = new Map();
    convByTeam.forEach(t => convMap.set(String(t.team_id), { conversoes: t.conversoes || 0, valor: t.valor_total || 0 }));
    return byTeam.map(t => {
      const conv = convMap.get(String(t.team_id)) || { conversoes: 0, valor: 0 };
      return {
        time: t.team_name || 'Sem time',
        disparos: t.total || 0,
        conversoes: conv.conversoes,
        valor: conv.valor,
      };
    });
  }, [byTeam, convByTeam]);

  const productChartData = useMemo(() => convByProduct.slice(0, 10).map(p => ({
    produto: (p.produto || 'N/A').length > 20 ? (p.produto || 'N/A').substring(0, 20) + '…' : (p.produto || 'N/A'),
    produtoFull: p.produto || 'N/A',
    contratos: p.contratos || 0,
    valor: p.valor_total || 0,
  })), [convByProduct]);

  const campaignData = useMemo(() => {
    const convBatchMap = new Map();
    convByBatch.forEach(c => {
      convBatchMap.set(c.batch_id, { conversoes: c.conversoes || 0, valor: c.valor_total || 0 });
    });
    return byBatch.map(b => {
      const conv = convBatchMap.get(b.batch_id) || { conversoes: 0, valor: 0 };
      return {
        batch_id: b.batch_id,
        usuario: (b.user_email || '').split('@')[0] || '-',
        data: b.started_at,
        total_leads: b.total_leads || 0,
        enviados: b.enviados || 0,
        falhas: b.falhas || 0,
        bloqueados: b.bloqueados || 0,
        conversoes: conv.conversoes,
        taxa: b.enviados > 0 ? ((conv.conversoes / b.enviados) * 100).toFixed(1) : '0.0',
        valor: conv.valor,
      };
    });
  }, [byBatch, convByBatch]);

  const campaignPageSize = 10;
  const campaignTotalPages = Math.ceil(campaignData.length / campaignPageSize) || 1;
  const campaignPageData = campaignData.slice((campaignPage - 1) * campaignPageSize, campaignPage * campaignPageSize);

  const alerts = useMemo(() => {
    const list = [];
    if (taxaConversao > 0 && taxaConversao < 1) {
      list.push({ type: 'warning', message: `Taxa de conversão em ${taxaConversao}% — abaixo de 1%` });
    }
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
  }, [taxaConversao, taxaFalha, totalBloqueios, totals, byDay]);

  const getStatusBadge = (status) => {
    const map = {
      'enviado': { cls: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300', label: 'Enviado' },
      'falha': { cls: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300', label: 'Falha' },
      'bloqueado_30_dias': { cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300', label: 'Bloq. 30d' },
      'bloqueado_duplicidade': { cls: 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300', label: 'Duplicidade' },
      'reenvio_agendado': { cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300', label: 'Reenvio' },
    };
    const s = map[status];
    return s ? <Badge className={s.cls}>{s.label}</Badge> : <Badge variant="secondary">{status || '-'}</Badge>;
  };

  const isLoading = loadingDashboard || loadingConversions || loadingRoi;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="w-5 h-5 text-indigo-500" />
              Cockpit Comercial
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleCheckConversions} disabled={checkingConversions}
                className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-300">
                {checkingConversions ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
                Verificar Conversões
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { refetchDashboard(); refetchConversions(); refetchRoi(); }}>
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Data Inicial</Label>
              <Input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setLogsPage(1); }} className="w-40" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Data Final</Label>
              <Input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setLogsPage(1); }} className="w-40" />
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
        <Card><CardContent className="py-12 flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
          <p className="text-gray-500">Carregando métricas...</p>
        </CardContent></Card>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: 'Total Disparos', value: totals.total || 0, icon: Send, color: 'indigo', bg: 'bg-indigo-100 dark:bg-indigo-900/30' },
              { label: 'Com Sucesso', value: totals.enviados || 0, icon: CheckCircle2, color: 'green', bg: 'bg-green-100 dark:bg-green-900/30' },
              { label: 'Falhas', value: totals.falhas || 0, icon: XCircle, color: 'red', bg: 'bg-red-100 dark:bg-red-900/30' },
              { label: 'Bloqueios', value: totalBloqueios, icon: Lock, color: 'amber', bg: 'bg-amber-100 dark:bg-amber-900/30' },
              { label: 'Taxa Sucesso', value: `${taxaSucesso}%`, icon: TrendingUp, color: 'blue', bg: 'bg-blue-100 dark:bg-blue-900/30' },
              { label: 'ROI / Disparo', value: formatCurrency(roiComercial), icon: Zap, color: 'purple', bg: 'bg-purple-100 dark:bg-purple-900/30', small: true },
            ].map((c, i) => (
              <Card key={i}>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-2">
                    <div className={`p-2 rounded-lg ${c.bg}`}>
                      <c.icon className={`w-4 h-4 text-${c.color}-600`} />
                    </div>
                    <div>
                      <p className={`${c.small ? 'text-sm' : 'text-xl'} font-bold text-${c.color}-600`}>{c.value}</p>
                      <p className="text-[10px] text-gray-500 leading-tight">{c.label}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'Conversões', value: roiTotals.conversoes || 0, icon: Target },
              { label: 'Taxa Conversão', value: `${taxaConversao}%`, icon: Activity },
              { label: 'Valor Total Vendas', value: formatCurrency(roiTotals.valor_total_vendas), icon: DollarSign, small: true },
              { label: 'Leads Convertidos', value: roiTotals.leads_convertidos || 0, icon: UserCheck },
            ].map((c, i) => (
              <Card key={i} className="border-emerald-200 dark:border-emerald-800">
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                      <c.icon className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div>
                      <p className={`${c.small ? 'text-sm' : 'text-xl'} font-bold text-emerald-600`}>{c.value}</p>
                      <p className="text-[10px] text-gray-500 leading-tight">{c.label}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <CollapsibleSection title="Validações de WhatsApp (WHU)" icon={Phone} iconColor="text-emerald-500" defaultOpen={false}>
            {loadingValidations ? (
              <div className="py-6 flex items-center justify-center text-gray-500 text-xs gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Carregando validações...
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-end gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px] text-gray-500">Canal</Label>
                    <select
                      value={valChannel}
                      onChange={e => setValChannel(e.target.value)}
                      className="h-8 text-xs border rounded px-2 bg-white dark:bg-gray-900 dark:border-gray-700 min-w-[160px]"
                    >
                      <option value="">Todos os canais</option>
                      {(validationFilters?.channels || []).map(c => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-gray-500">UF</Label>
                    <select
                      value={valUf}
                      onChange={e => setValUf(e.target.value)}
                      className="h-8 text-xs border rounded px-2 bg-white dark:bg-gray-900 dark:border-gray-700"
                    >
                      <option value="">Todas</option>
                      {(validationFilters?.ufs || []).map(u => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-gray-500">Produto</Label>
                    <select
                      value={valProduto}
                      onChange={e => setValProduto(e.target.value)}
                      className="h-8 text-xs border rounded px-2 bg-white dark:bg-gray-900 dark:border-gray-700 min-w-[160px]"
                    >
                      <option value="">Todos</option>
                      {(validationFilters?.produtos || []).map(p => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                  {(valChannel || valUf || valProduto) && (
                    <Button variant="ghost" size="sm" className="text-xs h-8" onClick={() => { setValChannel(''); setValUf(''); setValProduto(''); }}>
                      Limpar
                    </Button>
                  )}
                </div>
                <p className="text-[11px] text-gray-500">
                  Totais e gráfico respeitam o período e os filtros. "Buscas no período" e "Taxa cache hit" usam o período (sem filtros de canal/UF/produto). "Atividade recente" e "Tabela de cache" sempre consideram toda a base.
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                  {(() => {
                    const t = validationsData?.totals || {};
                    const cards = [
                      { label: 'Total no período', value: (t.total || 0).toLocaleString('pt-BR'), icon: Hash, color: 'indigo', bg: 'bg-indigo-100 dark:bg-indigo-900/30' },
                      { label: 'Válidos', value: `${(t.valid || 0).toLocaleString('pt-BR')} (${t.valid_pct || 0}%)`, icon: CheckCircle2, color: 'green', bg: 'bg-green-100 dark:bg-green-900/30', small: true },
                      { label: 'Inválidos', value: `${(t.invalid || 0).toLocaleString('pt-BR')} (${t.invalid_pct || 0}%)`, icon: XCircle, color: 'red', bg: 'bg-red-100 dark:bg-red-900/30', small: true },
                      { label: 'Expirando (válidos)', value: (t.valid_expiring_soon || 0).toLocaleString('pt-BR'), icon: Clock, color: 'amber', bg: 'bg-amber-100 dark:bg-amber-900/30' },
                      { label: 'Expirando (inválidos)', value: (t.invalid_expiring_soon || 0).toLocaleString('pt-BR'), icon: Clock, color: 'orange', bg: 'bg-orange-100 dark:bg-orange-900/30' },
                      { label: 'Taxa cache hit', value: `${validationsData?.runs?.cache_hit_rate_pct || 0}%`, icon: Activity, color: 'blue', bg: 'bg-blue-100 dark:bg-blue-900/30' },
                    ];
                    return cards.map((c, i) => (
                      <Card key={i}>
                        <CardContent className="pt-4 pb-3">
                          <div className="flex items-center gap-2">
                            <div className={`p-2 rounded-lg ${c.bg}`}>
                              <c.icon className={`w-4 h-4 text-${c.color}-600`} />
                            </div>
                            <div>
                              <p className={`${c.small ? 'text-sm' : 'text-xl'} font-bold text-${c.color}-600`}>{c.value}</p>
                              <p className="text-[10px] text-gray-500 leading-tight">{c.label}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ));
                  })()}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Card>
                    <CardContent className="pt-4 pb-3 text-xs space-y-1">
                      <p className="font-medium text-gray-700 dark:text-gray-300">Atividade recente (toda a base)</p>
                      <p className="text-gray-500">Nas últimas 24h: <span className="font-semibold text-gray-800 dark:text-gray-200">{(validationsData?.base?.validated_24h || 0).toLocaleString('pt-BR')}</span> checagens</p>
                      <p className="text-gray-500">Nos últimos 7 dias: <span className="font-semibold text-gray-800 dark:text-gray-200">{(validationsData?.base?.validated_7d || 0).toLocaleString('pt-BR')}</span> checagens</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4 pb-3 text-xs space-y-1">
                      <p className="font-medium text-gray-700 dark:text-gray-300">Tabela de cache (toda a base)</p>
                      <p className="text-gray-500">Total armazenado: <span className="font-semibold text-gray-800 dark:text-gray-200">{(validationsData?.base?.total_in_table || 0).toLocaleString('pt-BR')}</span></p>
                      <p className="text-gray-500">Ainda dentro da janela (30/90d): <span className="font-semibold text-gray-800 dark:text-gray-200">{(validationsData?.base?.still_cached || 0).toLocaleString('pt-BR')}</span> ({validationsData?.base?.cache_coverage_pct || 0}%)</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4 pb-3 text-xs space-y-1">
                      <p className="font-medium text-gray-700 dark:text-gray-300">Buscas no período</p>
                      <p className="text-gray-500">Buscas executadas: <span className="font-semibold text-gray-800 dark:text-gray-200">{(validationsData?.runs?.runs || 0).toLocaleString('pt-BR')}</span></p>
                      <p className="text-gray-500">
                        Reaproveitados do cache: <span className="font-semibold text-gray-800 dark:text-gray-200">{(validationsData?.runs?.cached || 0).toLocaleString('pt-BR')}</span>
                        {' / '}
                        Consultados na WHU: <span className="font-semibold text-gray-800 dark:text-gray-200">{(validationsData?.runs?.fetched || 0).toLocaleString('pt-BR')}</span>
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {validationsData?.byDay?.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-2">Validações por dia</p>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={[...validationsData.byDay].reverse().map(d => ({
                        dia: d.dia ? format(new Date(d.dia), 'dd/MM', { locale: ptBR }) : '',
                        validos: d.valid || 0,
                        invalidos: d.invalid || 0,
                      }))}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="dia" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="validos" stackId="a" fill="#10b981" name="Válidos" />
                        <Bar dataKey="invalidos" stackId="a" fill="#ef4444" name="Inválidos" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            )}
          </CollapsibleSection>

          {failureReasonsData?.reasons?.length > 0 && (
            <CollapsibleSection title="Principais Motivos de Falha" icon={AlertTriangle} iconColor="text-red-500" defaultOpen={false}>
              <div className="space-y-2">
                {failureReasonsData.reasons.map((r, i) => {
                  const maxTotal = failureReasonsData.reasons[0]?.total || 1;
                  const pct = ((r.total / maxTotal) * 100).toFixed(0);
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-gray-700 dark:text-gray-300 truncate max-w-[300px]" title={r.motivo}>{r.motivo}</span>
                          <span className="text-xs font-semibold text-red-600 ml-2">{r.total}</span>
                        </div>
                        <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-1.5">
                          <div className="bg-red-400 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CollapsibleSection>
          )}

          <CollapsibleSection title="Funil Comercial" icon={ArrowRightLeft} iconColor="text-indigo-500">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="flex flex-col items-center gap-1 py-4">
                {funnelData.map((step, i) => {
                  const maxVal = funnelData[0].value || 1;
                  const widthPct = Math.max(30, (step.value / maxVal) * 100);
                  const convRate = i > 0 && funnelData[i - 1].value > 0
                    ? ((step.value / funnelData[i - 1].value) * 100).toFixed(1) : null;
                  return (
                    <div key={i} className="w-full flex flex-col items-center gap-1">
                      {i > 0 && convRate !== null && (
                        <span className="text-[10px] text-gray-400">{convRate}%</span>
                      )}
                      <div
                        className="rounded-lg py-2.5 px-4 text-center text-white text-xs font-medium transition-all"
                        style={{ width: `${widthPct}%`, backgroundColor: step.fill, minWidth: '120px' }}
                      >
                        {step.name}: {step.value.toLocaleString('pt-BR')}
                      </div>
                    </div>
                  );
                })}
                {funnelData[0].value > 0 && (
                  <div className="mt-3 text-center">
                    <span className="text-xs text-gray-500">Taxa de Conversão do Funil: </span>
                    <span className="text-sm font-bold text-amber-600">
                      {((funnelData[3].value / funnelData[0].value) * 100).toFixed(2)}%
                    </span>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-500">Etapas do Funil</p>
                {funnelData.map((step, i) => (
                  <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-gray-50 dark:bg-gray-800/30">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: step.fill }} />
                    <span className="text-sm text-gray-700 dark:text-gray-300 flex-1">{step.name}</span>
                    <span className="text-sm font-bold text-gray-800 dark:text-gray-200">{step.value.toLocaleString('pt-BR')}</span>
                  </div>
                ))}
              </div>
            </div>
          </CollapsibleSection>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <CollapsibleSection title="Disparos por Dia" icon={Activity} iconColor="text-indigo-500">
              {dayChartData.length === 0 ? (
                <p className="text-sm text-gray-400 py-8 text-center">Nenhum dado disponível</p>
              ) : (
                <ResponsiveContainer width="100%" height={250}>
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
            </CollapsibleSection>

            <CollapsibleSection title="Conversões por Dia" icon={Target} iconColor="text-emerald-500">
              {convDayChartData.length === 0 ? (
                <p className="text-sm text-gray-400 py-8 text-center">Nenhuma conversão no período</p>
              ) : (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={convDayChartData}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="dia" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="conversoes" fill="#10b981" name="Conversões" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CollapsibleSection>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <CollapsibleSection title="Valor Gerado por Dia" icon={DollarSign} iconColor="text-emerald-500">
              {valueDayChartData.length === 0 ? (
                <p className="text-sm text-gray-400 py-8 text-center">Nenhum dado disponível</p>
              ) : (
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={valueDayChartData}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="dia" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v) => [formatCurrency(v), 'Valor']} />
                    <Line type="monotone" dataKey="valor" stroke="#10b981" name="Valor" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CollapsibleSection>

            <CollapsibleSection title="Disparos por Hora do Dia" icon={Clock} iconColor="text-indigo-500">
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={hourChartData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="hora" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="total" fill="#818cf8" name="Disparos" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CollapsibleSection>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <CollapsibleSection title="Performance por Usuário" icon={Users} iconColor="text-indigo-500">
              {userRankingData.length === 0 ? (
                <p className="text-sm text-gray-400 py-8 text-center">Nenhum dado disponível</p>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(200, userRankingData.slice(0, 10).length * 36)}>
                  <BarChart data={userRankingData.slice(0, 10)} layout="vertical">
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
            </CollapsibleSection>

            <CollapsibleSection title="Performance por Time" icon={Users} iconColor="text-blue-500">
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
            </CollapsibleSection>
          </div>

          <CollapsibleSection title="Produtos Mais Vendidos" icon={ShoppingBag} iconColor="text-amber-500">
            {productChartData.length === 0 ? (
              <p className="text-sm text-gray-400 py-8 text-center">Nenhuma conversão com produto identificado</p>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <ResponsiveContainer width="100%" height={Math.max(200, productChartData.length * 36)}>
                  <BarChart data={productChartData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="produto" tick={{ fontSize: 9 }} width={130} />
                    <Tooltip formatter={(v, name) => [name === 'Valor' ? formatCurrency(v) : v, name]} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="contratos" fill="#f59e0b" name="Contratos" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                        <th className="text-left py-2 px-2 font-medium text-gray-500">Produto</th>
                        <th className="text-center py-2 px-2 font-medium text-gray-500">Contratos</th>
                        <th className="text-right py-2 px-2 font-medium text-gray-500">Valor Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {productChartData.map((p, i) => (
                        <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                          <td className="py-1.5 px-2 text-gray-700 dark:text-gray-300" title={p.produtoFull}>{p.produto}</td>
                          <td className="py-1.5 px-2 text-center font-medium text-amber-600">{p.contratos}</td>
                          <td className="py-1.5 px-2 text-right font-medium text-emerald-600">{formatCurrency(p.valor)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CollapsibleSection>

          <CollapsibleSection title="Ranking de Usuários" icon={Award} iconColor="text-amber-500">
            {userRankingData.length === 0 ? (
              <p className="text-sm text-gray-400 py-8 text-center">Nenhum dado disponível</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                      <th className="text-center py-2 px-2 font-medium text-gray-500 w-8">#</th>
                      <th className="text-left py-2 px-2 font-medium text-gray-500">Usuário</th>
                      <th className="text-center py-2 px-2 font-medium text-gray-500">Disparos</th>
                      <th className="text-center py-2 px-2 font-medium text-gray-500">Conversões</th>
                      <th className="text-center py-2 px-2 font-medium text-gray-500">Taxa Conv.</th>
                      <th className="text-right py-2 px-2 font-medium text-gray-500">Valor Vendas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {userRankingData.map((u, i) => (
                      <tr key={i} className={`hover:bg-gray-50 dark:hover:bg-gray-800/30 ${i < 3 ? 'bg-amber-50/30 dark:bg-amber-900/10' : ''}`}>
                        <td className="py-2 px-2 text-center">
                          {i < 3 ? (
                            <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold text-white ${
                              i === 0 ? 'bg-amber-500' : i === 1 ? 'bg-gray-400' : 'bg-amber-700'
                            }`}>{i + 1}</span>
                          ) : (
                            <span className="text-gray-400">{i + 1}</span>
                          )}
                        </td>
                        <td className="py-2 px-2 text-gray-700 dark:text-gray-300 font-medium">{u.usuario}</td>
                        <td className="py-2 px-2 text-center text-indigo-600 font-medium">{u.disparos}</td>
                        <td className="py-2 px-2 text-center text-emerald-600 font-medium">{u.conversoes}</td>
                        <td className="py-2 px-2 text-center">
                          <Badge className={Number(u.taxaConv) >= 5 ? 'bg-emerald-100 text-emerald-700' : Number(u.taxaConv) >= 1 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}>
                            {u.taxaConv}%
                          </Badge>
                        </td>
                        <td className="py-2 px-2 text-right font-bold text-emerald-600">{formatCurrency(u.valor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CollapsibleSection>

          <CollapsibleSection title="Análise de Campanhas" icon={Hash} iconColor="text-violet-500">
            {campaignPageData.length === 0 ? (
              <p className="text-sm text-gray-400 py-8 text-center">Nenhuma campanha encontrada</p>
            ) : (
              <>
                <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                        <th className="text-left py-2 px-2 font-medium text-gray-500">Batch ID</th>
                        <th className="text-left py-2 px-2 font-medium text-gray-500">Usuário</th>
                        <th className="text-left py-2 px-2 font-medium text-gray-500">Data</th>
                        <th className="text-center py-2 px-2 font-medium text-gray-500">Leads</th>
                        <th className="text-center py-2 px-2 font-medium text-gray-500">Enviados</th>
                        <th className="text-center py-2 px-2 font-medium text-gray-500">Conv.</th>
                        <th className="text-center py-2 px-2 font-medium text-gray-500">Taxa</th>
                        <th className="text-right py-2 px-2 font-medium text-gray-500">Valor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {campaignPageData.map((c, i) => (
                        <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                          <td className="py-1.5 px-2 text-gray-500 font-mono text-[10px]" title={c.batch_id}>
                            {c.batch_id ? c.batch_id.substring(0, 8) + '…' : '-'}
                          </td>
                          <td className="py-1.5 px-2 text-gray-700 dark:text-gray-300">{c.usuario}</td>
                          <td className="py-1.5 px-2 text-gray-500 whitespace-nowrap">
                            {c.data ? format(new Date(c.data), 'dd/MM HH:mm', { locale: ptBR }) : '-'}
                          </td>
                          <td className="py-1.5 px-2 text-center text-gray-600">{c.total_leads}</td>
                          <td className="py-1.5 px-2 text-center text-green-600 font-medium">{c.enviados}</td>
                          <td className="py-1.5 px-2 text-center text-emerald-600 font-medium">{c.conversoes}</td>
                          <td className="py-1.5 px-2 text-center">
                            <Badge className={Number(c.taxa) > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}>
                              {c.taxa}%
                            </Badge>
                          </td>
                          <td className="py-1.5 px-2 text-right font-medium text-emerald-600">{formatCurrency(c.valor)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {campaignTotalPages > 1 && (
                  <div className="flex items-center justify-between mt-3">
                    <p className="text-[11px] text-gray-500">Pág. {campaignPage}/{campaignTotalPages}</p>
                    <div className="flex gap-1">
                      <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={campaignPage <= 1} onClick={() => setCampaignPage(p => p - 1)}>
                        <ChevronLeft className="w-3 h-3" />
                      </Button>
                      <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={campaignPage >= campaignTotalPages} onClick={() => setCampaignPage(p => p + 1)}>
                        <ChevronRight className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CollapsibleSection>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                  <Send className="w-4 h-4 text-indigo-500" /> Disparos Recentes
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
                          <th className="text-left py-2 px-2 font-medium text-gray-500">Usuário</th>
                          <th className="text-left py-2 px-2 font-medium text-gray-500">Disparo</th>
                          <th className="text-left py-2 px-2 font-medium text-gray-500">Venda</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-emerald-100 dark:divide-emerald-900/30">
                        {convRecent.slice(0, 15).map((c, i) => (
                          <tr key={i} className="hover:bg-emerald-50/30 dark:hover:bg-emerald-900/10">
                            <td className="py-1.5 px-2 text-gray-700 dark:text-gray-300">
                              <div className="flex items-center gap-1"><Phone className="w-3 h-3 text-gray-400" />{c.lead_number}</div>
                            </td>
                            <td className="py-1.5 px-2 text-gray-700 dark:text-gray-300 max-w-[120px] truncate">{c.erp_titular || '-'}</td>
                            <td className="py-1.5 px-2 text-gray-600 max-w-[100px] truncate">{c.erp_produto || '-'}</td>
                            <td className="py-1.5 px-2 text-gray-600">{c.erp_contrato || '-'}</td>
                            <td className="py-1.5 px-2 text-right font-medium text-emerald-600">
                              {formatCurrency(c.erp_valor_contrato)}
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
