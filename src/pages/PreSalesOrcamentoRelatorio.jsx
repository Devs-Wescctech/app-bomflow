import { useState, useEffect, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import {
  Search, RefreshCw, Filter, Calendar, ShieldCheck, Clock, CheckCircle2,
  Loader2, AlertTriangle, XCircle, ThumbsUp, PencilLine, Ban, Eye, Timer, Inbox,
} from "lucide-react";
import OrcamentoDetalheModal from "@/components/presales/OrcamentoDetalheModal";

const API_BASE = '/api';

function getAuthHeaders() {
  const token = localStorage.getItem('accessToken');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

function formatDateOnly(dateStr) {
  if (!dateStr) return '-';
  try {
    return new Date(dateStr).toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    });
  } catch { return '-'; }
}

function formatCpf(cpf) {
  if (!cpf) return '-';
  const d = String(cpf).replace(/\D/g, '');
  if (d.length !== 11) return cpf;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

// Tempo de espera desde a criação (proxy de "aguardando há"). Retorna ms ou null.
function waitingMs(dateStr) {
  if (!dateStr) return null;
  const t = new Date(dateStr).getTime();
  if (Number.isNaN(t)) return null;
  return Date.now() - t;
}

function humanizeMs(ms) {
  if (ms == null) return '-';
  const h = ms / 36e5;
  if (h < 1) return `${Math.max(1, Math.round(ms / 6e4))} min`;
  if (h < 24) return `${Math.round(h)}h`;
  const d = Math.floor(h / 24);
  return d === 1 ? '1 dia' : `${d} dias`;
}

// DE > PARA das situações do ERP (código cru -> rótulo + cor de badge).
const SITUACOES = {
  'I': { label: 'Emitido / Análise',   color: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700' },
  'A': { label: 'Aprovado',            color: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700' },
  'C': { label: 'Cancelado',           color: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700' },
  'P': { label: 'Pendente / Proposta', color: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700' },
  'R': { label: 'Perdido',             color: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800/50 dark:text-slate-300 dark:border-slate-600' },
  'M': { label: 'Em manutenção',       color: 'bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-700' },
};

// Situações que representam orçamentos AGUARDANDO auditoria.
const PENDING_SITUACOES = new Set(['I', 'P', 'M']);
// Limiares (horas) de espera para escalonar a prioridade dos pendentes.
const CRITICAL_HOURS = 24;
const REVIEW_HOURS = 8;

// Cores por módulo de origem (badge discreto na tabela).
const MODULO_BADGE = {
  sales:        'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
  sales_pj:     'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-900/30 dark:text-sky-300 dark:border-sky-800',
  sales_upsell: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:border-violet-800',
  referral:     'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800',
};

// Prioridade operacional derivada do status do ERP + tempo de espera.
function getPriority(o) {
  if (o.situacao === 'A') return 'aprovado';
  if (o.situacao === 'C' || o.situacao === 'R') return 'encerrado';
  if (PENDING_SITUACOES.has(o.situacao)) {
    const ms = waitingMs(o.data_venda);
    const h = ms == null ? 0 : ms / 36e5;
    if (h >= CRITICAL_HOURS) return 'critico';
    if (h >= REVIEW_HOURS) return 'revisar';
    return 'novo';
  }
  return 'novo';
}

const PRIORITY_META = {
  critico:   { label: 'Crítico',   accent: 'border-l-red-500',     dot: 'bg-red-500',     chip: 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700',         icon: AlertTriangle },
  revisar:   { label: 'Revisar',   accent: 'border-l-amber-500',   dot: 'bg-amber-500',   chip: 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700', icon: Clock },
  novo:      { label: 'Novo',      accent: 'border-l-sky-400',     dot: 'bg-sky-400',     chip: 'bg-sky-100 text-sky-700 border-sky-300 dark:bg-sky-900/30 dark:text-sky-300 dark:border-sky-700',           icon: Inbox },
  aprovado:  { label: 'Aprovado',  accent: 'border-l-emerald-500', dot: 'bg-emerald-500', chip: 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700', icon: CheckCircle2 },
  encerrado: { label: 'Encerrado', accent: 'border-l-slate-300',   dot: 'bg-slate-400',   chip: 'bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800/50 dark:text-slate-300 dark:border-slate-600', icon: XCircle },
};

const PRIORITY_ORDER = { critico: 0, revisar: 1, novo: 2, aprovado: 3, encerrado: 4 };

function SituacaoBadge({ situacao }) {
  const s = SITUACOES[situacao] || { label: situacao || '-', color: 'bg-gray-100 text-gray-700 border-gray-300' };
  return <Badge variant="outline" className={`${s.color} font-medium`}>{s.label}</Badge>;
}

function PriorityBadge({ priority }) {
  const m = PRIORITY_META[priority] || PRIORITY_META.novo;
  const Icon = m.icon;
  return (
    <Badge variant="outline" className={`${m.chip} font-semibold gap-1`}>
      <Icon className="w-3 h-3" /> {m.label}
    </Badge>
  );
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function monthStartISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export default function PreSalesOrcamentoRelatorio() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [canais, setCanais] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);

  const [startDate, setStartDate] = useState(monthStartISO());
  const [endDate, setEndDate] = useState(todayISO());
  const [statusFilter, setStatusFilter] = useState('todos');
  const [priorityFilter, setPriorityFilter] = useState('todas');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);

  const canaisMap = useMemo(() => {
    const m = {};
    canais.forEach(c => { m[c.id] = c.titulo_contrato || String(c.id); });
    return m;
  }, [canais]);

  const loadCanais = async () => {
    try {
      const res = await fetch(`${API_BASE}/erp/canais-venda`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setCanais(Array.isArray(data) ? data : (data.items || []));
      }
    } catch { /* canal é apenas enriquecimento visual */ }
  };

  const loadReport = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.set('start_date', startDate);
      if (endDate) params.set('end_date', endDate);
      if (statusFilter && statusFilter !== 'todos') params.set('situacao', statusFilter);
      params.set('limit', '1000');

      const res = await fetch(`${API_BASE}/erp/relatorio-orcamentos/consolidado?${params}`, { headers: getAuthHeaders() });
      if (res.status === 403) {
        setItems([]);
        toast({ title: 'Acesso restrito', description: 'Você não tem permissão para este relatório.', variant: 'destructive' });
        return;
      }
      if (!res.ok) throw new Error('Falha ao carregar a fila de auditoria.');
      const data = await res.json();
      setItems(Array.isArray(data.items) ? data.items : []);
      setLastUpdated(new Date());
    } catch (e) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCanais();
    loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Enriquecemos cada item com prioridade + tempo de espera, e ordenamos pela urgência.
  const enriched = useMemo(() => {
    return items.map(o => ({
      ...o,
      _priority: getPriority(o),
      _waitMs: waitingMs(o.data_venda),
    }));
  }, [items]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    let list = enriched;
    if (term) {
      const tDigits = term.replace(/\D/g, '');
      list = list.filter(o => {
        const cpf = String(o.cpf_titular || '').replace(/\D/g, '');
        return (
          String(o.numero_orcamento || '').toLowerCase().includes(term) ||
          String(o.nome_titular || '').toLowerCase().includes(term) ||
          String(o.nome_vendedor || '').toLowerCase().includes(term) ||
          (tDigits && cpf.includes(tDigits))
        );
      });
    }
    if (priorityFilter !== 'todas') {
      list = list.filter(o => o._priority === priorityFilter);
    }
    return [...list].sort((a, b) => {
      const pa = PRIORITY_ORDER[a._priority] ?? 9;
      const pb = PRIORITY_ORDER[b._priority] ?? 9;
      if (pa !== pb) return pa - pb;
      return (b._waitMs ?? 0) - (a._waitMs ?? 0);
    });
  }, [enriched, search, priorityFilter]);

  // KPIs operacionais.
  const stats = useMemo(() => {
    const pendentes = enriched.filter(o => PENDING_SITUACOES.has(o.situacao));
    const aguardando = pendentes.length;
    const precisaRevisao = pendentes.filter(o => o._priority === 'critico' || o._priority === 'revisar').length;
    const criticos = pendentes.filter(o => o._priority === 'critico').length;
    const aprovados = enriched.filter(o => o.situacao === 'A').length;
    const oldest = pendentes.reduce((acc, o) => Math.max(acc, o._waitMs ?? 0), 0);
    return {
      total: enriched.length,
      aguardando,
      precisaRevisao,
      criticos,
      aprovados,
      oldestMs: pendentes.length ? oldest : null,
    };
  }, [enriched]);

  // Área de KPIs dominante. "Aprovados hoje" e "Tempo médio" não têm dado de
  // carimbo de aprovação no sistema, então ficam como indisponíveis (—).
  const kpiCards = [
    { key: 'aguardando', label: 'Aguardando auditoria', value: stats.aguardando, icon: Inbox, tone: 'red', hint: `${stats.criticos} crítico(s)` },
    { key: 'revisao', label: 'Precisa revisão', value: stats.precisaRevisao, icon: AlertTriangle, tone: 'amber', hint: 'Pendentes com espera' },
    { key: 'aprovHoje', label: 'Aprovados hoje', value: '—', icon: CheckCircle2, tone: 'emerald', hint: 'Indisponível', muted: true },
    { key: 'tempoMedio', label: 'Tempo médio de auditoria', value: '—', icon: Timer, tone: 'sky', hint: 'Indisponível', muted: true },
  ];

  const TONES = {
    red:     { chip: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300', value: 'text-red-700 dark:text-red-300' },
    amber:   { chip: 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300', value: 'text-amber-700 dark:text-amber-300' },
    emerald: { chip: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300', value: 'text-emerald-700 dark:text-emerald-300' },
    sky:     { chip: 'bg-sky-100 text-sky-600 dark:bg-sky-900/40 dark:text-sky-300', value: 'text-sky-700 dark:text-sky-300' },
  };

  const handleQuickAction = (label, o) => {
    toast({
      title: `${label} — em definição`,
      description: `Ação visual (protótipo) para o orçamento Nº ${o.numero_orcamento || o.erp_id}. O fluxo de aprovação será definido em uma próxima etapa.`,
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-950 p-4 sm:p-6 lg:p-8">
      <div className="max-w-[1500px] mx-auto space-y-5">

        {/* Header */}
        <div className="rounded-2xl bg-white dark:bg-gray-900 ring-1 ring-slate-200 dark:ring-gray-800 shadow-sm p-5 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-violet-600 dark:text-violet-400 text-xs font-semibold uppercase tracking-widest">
                <ShieldCheck className="w-4 h-4" />
                Pré e Pós Vendas
              </div>
              <h1 className="mt-1.5 text-2xl sm:text-[26px] font-bold text-slate-800 dark:text-slate-100">
                Central de Auditoria de Orçamentos
              </h1>
              <p className="mt-1 text-slate-500 dark:text-slate-400 text-sm max-w-2xl">
                Priorize, valide e libere orçamentos das vendas PF, PJ, Upsell e Indicações.
              </p>
            </div>
            <Button
              onClick={loadReport}
              disabled={loading}
              className="bg-violet-600 hover:bg-violet-700 text-white shadow-sm shadow-violet-500/30 self-start"
            >
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              Atualizar
            </Button>
          </div>
        </div>

        {/* KPIs operacionais */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {kpiCards.map(({ key, label, value, icon: Icon, tone, hint, muted }) => {
            const t = TONES[tone];
            return (
              <div key={key} className="rounded-2xl bg-white dark:bg-gray-900 ring-1 ring-slate-200 dark:ring-gray-800 shadow-sm hover:shadow-md transition-shadow p-5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</span>
                  <span className={`inline-flex items-center justify-center w-9 h-9 rounded-xl ${t.chip}`}>
                    <Icon className="w-5 h-5" />
                  </span>
                </div>
                <div className={`mt-3 text-3xl font-bold ${muted ? 'text-slate-300 dark:text-slate-600' : t.value}`}>{value}</div>
                {hint && (
                  <div className="mt-1 text-[11.5px] text-slate-400 dark:text-slate-500">{hint}</div>
                )}
              </div>
            );
          })}
        </div>

        {/* Painel de carga de trabalho */}
        <div className="rounded-2xl bg-white dark:bg-gray-900 ring-1 ring-slate-200 dark:ring-gray-800 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-violet-100 dark:bg-violet-900/40">
              <Clock className="w-4 h-4 text-violet-600 dark:text-violet-400" />
            </span>
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Carga de trabalho</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-xl border border-slate-100 dark:border-gray-800 p-3.5">
              <div className="text-[12px] text-slate-500 dark:text-slate-400">Aguardando análise</div>
              <div className="mt-0.5 text-xl font-bold text-slate-800 dark:text-slate-100">{stats.aguardando}</div>
            </div>
            <div className="rounded-xl border border-slate-100 dark:border-gray-800 p-3.5">
              <div className="text-[12px] text-slate-500 dark:text-slate-400">Casos críticos</div>
              <div className="mt-0.5 text-xl font-bold text-red-600 dark:text-red-400">{stats.criticos}</div>
            </div>
            <div className="rounded-xl border border-slate-100 dark:border-gray-800 p-3.5">
              <div className="text-[12px] text-slate-500 dark:text-slate-400">Pendente mais antigo</div>
              <div className="mt-0.5 text-xl font-bold text-amber-600 dark:text-amber-400">{humanizeMs(stats.oldestMs)}</div>
            </div>
            <div className="rounded-xl border border-slate-100 dark:border-gray-800 p-3.5">
              <div className="text-[12px] text-slate-500 dark:text-slate-400">Aprovados no período</div>
              <div className="mt-0.5 text-xl font-bold text-emerald-600 dark:text-emerald-400">{stats.aprovados}</div>
            </div>
          </div>
        </div>

        {/* Filtros */}
        <div className="rounded-2xl bg-white dark:bg-gray-900 ring-1 ring-slate-200 dark:ring-gray-800 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-900/40">
              <Filter className="w-4 h-4 text-violet-600 dark:text-violet-400" />
            </span>
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Filtros</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-violet-500" /> De
              </Label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-violet-500" /> Até
              </Label>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-500 dark:text-slate-400">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os status</SelectItem>
                  {Object.entries(SITUACOES).map(([code, { label }]) => (
                    <SelectItem key={code} value={code}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-500 dark:text-slate-400">Prioridade</Label>
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas as prioridades</SelectItem>
                  <SelectItem value="critico">Crítico</SelectItem>
                  <SelectItem value="revisar">Revisar</SelectItem>
                  <SelectItem value="novo">Novo</SelectItem>
                  <SelectItem value="aprovado">Aprovado</SelectItem>
                  <SelectItem value="encerrado">Encerrado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-500 dark:text-slate-400">Busca rápida</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Nº, CPF, cliente ou vendedor"
                  className="h-10 pl-9"
                />
              </div>
            </div>
            <div className="flex items-end">
              <Button onClick={loadReport} disabled={loading} className="h-10 w-full bg-violet-600 hover:bg-violet-700 text-white shadow-sm shadow-violet-500/30">
                {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
                Aplicar
              </Button>
            </div>
          </div>
        </div>

        {/* Fila de auditoria */}
        <div className="rounded-2xl bg-white dark:bg-gray-900 ring-1 ring-slate-200 dark:ring-gray-800 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <Inbox className="w-4 h-4 text-violet-600 dark:text-violet-400" />
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Fila de auditoria · {filtered.length} {filtered.length === 1 ? 'orçamento' : 'orçamentos'}
              </span>
            </div>
            {lastUpdated && (
              <span className="text-xs text-slate-400 dark:text-slate-500">
                Atualizado às {lastUpdated.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-gray-800/50 text-left">
                  {['Prioridade', 'Aguardando', 'Nº', 'Cliente', 'CPF', 'Criação', 'Canal', 'Vendedor', 'Módulo', 'Status', 'Ações'].map(h => (
                    <th key={h} className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
                {loading ? (
                  <tr><td colSpan={11} className="px-4 py-16 text-center text-slate-400">
                    <Loader2 className="w-6 h-6 mx-auto animate-spin mb-2" /> Carregando fila de auditoria…
                  </td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={11} className="px-4 py-16 text-center text-slate-400">
                    <Inbox className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    Nenhum orçamento encontrado para os filtros selecionados.
                  </td></tr>
                ) : filtered.map((o, i) => {
                  const pm = PRIORITY_META[o._priority] || PRIORITY_META.novo;
                  return (
                    <tr
                      key={`${o.erp_id}-${i}`}
                      className={`border-l-4 ${pm.accent} hover:bg-violet-50/40 dark:hover:bg-violet-900/10 transition-colors`}
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        <PriorityBadge priority={o._priority} />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {PENDING_SITUACOES.has(o.situacao) ? (
                          <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                            <span className={`h-2 w-2 rounded-full ${pm.dot}`} />
                            {humanizeMs(o._waitMs)}
                          </span>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setSelected(o)}
                          className="font-semibold text-violet-700 underline-offset-2 hover:underline focus:outline-none focus-visible:underline dark:text-violet-400"
                          title="Abrir auditoria"
                        >
                          {o.numero_orcamento || '-'}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-slate-800 dark:text-slate-100 max-w-[200px] truncate" title={o.nome_titular || ''}>
                        {o.nome_titular || '-'}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {formatCpf(o.cpf_titular)}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {formatDateOnly(o.data_venda)}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300 max-w-[160px] truncate" title={o.canal_id ? canaisMap[o.canal_id] || String(o.canal_id) : ''}>
                        {o.canal_id ? canaisMap[o.canal_id] || String(o.canal_id) : '-'}
                      </td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-200 max-w-[160px] truncate" title={o.nome_vendedor || ''}>
                        {o.nome_vendedor || '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Badge variant="outline" className={`${MODULO_BADGE[o.modulo] || 'bg-gray-50 text-gray-600 border-gray-200'} text-xs font-medium`}>
                          {o.modulo_nome || '-'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <SituacaoBadge situacao={o.situacao} />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setSelected(o)}
                            title="Abrir auditoria"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-violet-600 hover:bg-violet-50 dark:text-violet-400 dark:hover:bg-violet-900/20"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleQuickAction('Aprovar', o)}
                            title="Aprovar"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
                          >
                            <ThumbsUp className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleQuickAction('Solicitar ajuste', o)}
                            title="Solicitar ajuste"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-900/20"
                          >
                            <PencilLine className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleQuickAction('Rejeitar', o)}
                            title="Rejeitar"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                          >
                            <Ban className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {selected && (
        <OrcamentoDetalheModal
          orcamento={selected}
          situacaoBadge={<SituacaoBadge situacao={selected.situacao} />}
          canalLabel={selected.canal_id ? (canaisMap[selected.canal_id] || String(selected.canal_id)) : '-'}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
