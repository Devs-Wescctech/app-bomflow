import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import {
  Search, RefreshCw, Calendar, ShieldCheck, Clock, CheckCircle2,
  Loader2, AlertTriangle, XCircle, ThumbsUp, PencilLine, Ban, Eye,
  Inbox, AlertCircle, User as UserIcon, Layers, ArrowRight,
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

const norm = (s) => String(s || '').trim().toLowerCase();

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

// Cores por módulo de origem (badge discreto no card).
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
  revisar:   { label: 'Revisar',   accent: 'border-l-orange-500',  dot: 'bg-orange-500',  chip: 'bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-700', icon: Clock },
  novo:      { label: 'Novo',      accent: 'border-l-sky-400',     dot: 'bg-sky-400',     chip: 'bg-sky-100 text-sky-700 border-sky-300 dark:bg-sky-900/30 dark:text-sky-300 dark:border-sky-700',           icon: Inbox },
  aprovado:  { label: 'Aprovado',  accent: 'border-l-emerald-500', dot: 'bg-emerald-500', chip: 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700', icon: CheckCircle2 },
  encerrado: { label: 'Encerrado', accent: 'border-l-slate-300',   dot: 'bg-slate-400',   chip: 'bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800/50 dark:text-slate-300 dark:border-slate-600', icon: XCircle },
};

const PRIORITY_ORDER = { critico: 0, revisar: 1, novo: 2, aprovado: 3, encerrado: 4 };

// Pendências derivadas SOMENTE de dados disponíveis na lista (status ERP + tempo de
// espera). Validações de documento/CPF exigem abrir a auditoria (modal).
const ISSUE_TONE = {
  crit: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800',
  warn: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800',
  info: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800',
  ok:   'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
  muted:'bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-800/40 dark:text-slate-400 dark:border-slate-700',
};
const ISSUE_ICON = { crit: AlertCircle, warn: AlertTriangle, info: Clock, ok: CheckCircle2, muted: XCircle };

function getPendingIssues(o) {
  if (o.situacao === 'A') return [{ label: 'Sem pendências', tone: 'ok' }];
  if (o.situacao === 'C') return [{ label: 'Cancelado', tone: 'muted' }];
  if (o.situacao === 'R') return [{ label: 'Perdido', tone: 'muted' }];
  const issues = [];
  if (o.situacao === 'M') issues.push({ label: 'Em manutenção', tone: 'warn' });
  if (o._priority === 'critico') issues.push({ label: `Espera crítica · ${humanizeMs(o._waitMs)}`, tone: 'crit' });
  else if (o._priority === 'revisar') issues.push({ label: `Aguardando revisão · ${humanizeMs(o._waitMs)}`, tone: 'warn' });
  else if (o._priority === 'novo') issues.push({ label: 'Aguardando análise', tone: 'info' });
  return issues.length ? issues : [{ label: 'Aguardando análise', tone: 'info' }];
}

// Ação recomendada (texto-guia) derivada da prioridade/status.
function getRecommendedAction(o) {
  if (o.situacao === 'A') return 'Concluído';
  if (o.situacao === 'C' || o.situacao === 'R') return 'Encerrado';
  if (o._priority === 'critico') return 'Auditar agora';
  if (o._priority === 'revisar') return 'Revisar pendências';
  return 'Iniciar auditoria';
}

function SituacaoBadge({ situacao }) {
  const s = SITUACOES[situacao] || { label: situacao || '-', color: 'bg-gray-100 text-gray-700 border-gray-300' };
  return <Badge variant="outline" className={`${s.color} font-medium text-[11px]`}>{s.label}</Badge>;
}

function PriorityBadge({ priority }) {
  const m = PRIORITY_META[priority] || PRIORITY_META.novo;
  const Icon = m.icon;
  return (
    <Badge variant="outline" className={`${m.chip} font-semibold gap-1 text-[11px]`}>
      <Icon className="w-3 h-3" /> {m.label}
    </Badge>
  );
}

// Botão de ação do card (prominente, com rótulo).
function CardAction({ variant = 'ghost', icon: Icon, label, onClick, className = '' }) {
  const VARIANTS = {
    primary: 'bg-violet-600 text-white hover:bg-violet-700 shadow-sm shadow-violet-500/30',
    approve: 'border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-950/70',
    adjust:  'border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-950/70',
    reject:  'border border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/70',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12.5px] font-semibold transition-colors ${VARIANTS[variant]} ${className}`}
    >
      {Icon && <Icon className="h-3.5 w-3.5" />} {label}
    </button>
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

const TABS = [
  { key: 'todas',     label: 'Todos' },
  { key: 'critico',   label: 'Crítico' },
  { key: 'revisar',   label: 'Revisar' },
  { key: 'novo',      label: 'Novos' },
  { key: 'aprovado',  label: 'Aprovados' },
  { key: 'meus',      label: 'Meus' },
];

export default function PreSalesOrcamentoRelatorio() {
  const { toast } = useToast();
  const { data: currentUser } = useQuery({ queryKey: ['currentUser'], queryFn: () => base44.auth.me() });

  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [canais, setCanais] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);

  const [startDate, setStartDate] = useState(monthStartISO());
  const [endDate, setEndDate] = useState(todayISO());
  const [statusFilter, setStatusFilter] = useState('todos');
  const [tab, setTab] = useState('todas');
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

  const isMine = (o) => !!currentUser?.name && norm(o.nome_vendedor) === norm(currentUser.name);

  // Enriquecemos cada item com prioridade + tempo de espera.
  const enriched = useMemo(() => {
    return items.map(o => ({
      ...o,
      _priority: getPriority(o),
      _waitMs: waitingMs(o.data_venda),
    }));
  }, [items]);

  const counts = useMemo(() => {
    const c = { todas: enriched.length, critico: 0, revisar: 0, novo: 0, aprovado: 0, encerrado: 0, meus: 0 };
    enriched.forEach(o => {
      c[o._priority] = (c[o._priority] || 0) + 1;
      if (isMine(o)) c.meus += 1;
    });
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enriched, currentUser]);

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
    if (tab === 'meus') list = list.filter(isMine);
    else if (tab !== 'todas') list = list.filter(o => o._priority === tab);

    return [...list].sort((a, b) => {
      const pa = PRIORITY_ORDER[a._priority] ?? 9;
      const pb = PRIORITY_ORDER[b._priority] ?? 9;
      if (pa !== pb) return pa - pb;
      return (b._waitMs ?? 0) - (a._waitMs ?? 0);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enriched, search, tab, currentUser]);

  // KPIs operacionais (resumo compacto e secundário).
  const stats = useMemo(() => {
    const pendentes = enriched.filter(o => PENDING_SITUACOES.has(o.situacao));
    const aguardando = pendentes.length;
    const criticos = pendentes.filter(o => o._priority === 'critico').length;
    const aprovados = enriched.filter(o => o.situacao === 'A').length;
    const oldest = pendentes.reduce((acc, o) => Math.max(acc, o._waitMs ?? 0), 0);
    return { total: enriched.length, aguardando, criticos, aprovados, oldestMs: pendentes.length ? oldest : null };
  }, [enriched]);

  // Barra de alerta operacional (compacta) — comunica urgência imediatamente.
  const alert = useMemo(() => {
    if (loading) return null;
    if (stats.criticos > 0) {
      return {
        tone: 'crit',
        messages: [
          `${stats.criticos} ${stats.criticos === 1 ? 'orçamento crítico' : 'orçamentos críticos'} aguardando revisão`,
          stats.oldestMs ? `Pendente mais antigo: ${humanizeMs(stats.oldestMs)}` : null,
          'Ação imediata recomendada',
        ].filter(Boolean),
      };
    }
    if (stats.aguardando > 0) {
      return {
        tone: 'warn',
        messages: [
          `${stats.aguardando} ${stats.aguardando === 1 ? 'orçamento aguardando' : 'orçamentos aguardando'} auditoria`,
          stats.oldestMs ? `Pendente mais antigo: ${humanizeMs(stats.oldestMs)}` : null,
        ].filter(Boolean),
      };
    }
    return { tone: 'ok', messages: ['Sem pendências críticas na fila'] };
  }, [loading, stats]);

  const ALERT_TONE = {
    crit: { wrap: 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200', dot: 'bg-red-500', icon: AlertCircle },
    warn: { wrap: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200', dot: 'bg-amber-500', icon: Clock },
    ok:   { wrap: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200', dot: 'bg-emerald-500', icon: CheckCircle2 },
  };

  const handleQuickAction = (label, o) => {
    toast({
      title: `${label} — em definição`,
      description: `Ação visual (protótipo) para o orçamento Nº ${o.numero_orcamento || o.erp_id}. O fluxo de aprovação será definido em uma próxima etapa.`,
    });
  };

  const at = alert ? ALERT_TONE[alert.tone] : null;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-950 -m-3 md:-m-6 p-3 md:p-5">
      <div className="max-w-[1400px] mx-auto flex flex-col gap-3">

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600 text-white shadow-sm shadow-violet-500/30">
              <ShieldCheck className="w-5 h-5" />
            </span>
            <div>
              <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 leading-tight">Caixa de Auditoria</h1>
              <p className="text-[12.5px] text-slate-500 dark:text-slate-400">Vendas PF, PJ, Upsell e Indicações · processe os orçamentos por prioridade</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-[11.5px] text-slate-400 dark:text-slate-500 hidden sm:inline">
                Atualizado {lastUpdated.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <Button onClick={loadReport} disabled={loading} size="sm" className="bg-violet-600 hover:bg-violet-700 text-white shadow-sm shadow-violet-500/30">
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              Atualizar
            </Button>
          </div>
        </div>

        {/* Resumo operacional compacto (secundário) */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-1 text-[12.5px]">
          <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
            <Inbox className="w-3.5 h-3.5 text-violet-500" />
            <b className="text-slate-800 dark:text-slate-100">{stats.aguardando}</b> aguardando auditoria
          </span>
          <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
            <span className="h-2 w-2 rounded-full bg-red-500" />
            <b className="text-red-600 dark:text-red-400">{stats.criticos}</b> críticos
          </span>
          <span className="text-slate-500 dark:text-slate-400">Pendente mais antigo: <b className="text-slate-700 dark:text-slate-200">{humanizeMs(stats.oldestMs)}</b></span>
          <span className="text-slate-500 dark:text-slate-400">Aprovados hoje: <b className="text-slate-300 dark:text-slate-600">—</b></span>
          <span className="text-slate-500 dark:text-slate-400">Aprovados no período: <b className="text-emerald-600 dark:text-emerald-400">{stats.aprovados}</b></span>
        </div>

        {/* Filtros compactos (período/status/busca preservados) */}
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-gray-800 dark:bg-gray-900">
          <div className="space-y-1">
            <Label className="text-[10.5px] text-slate-400 dark:text-slate-500 flex items-center gap-1"><Calendar className="w-3 h-3 text-violet-500" /> De</Label>
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="h-9 w-[150px]" />
          </div>
          <div className="space-y-1">
            <Label className="text-[10.5px] text-slate-400 dark:text-slate-500 flex items-center gap-1"><Calendar className="w-3 h-3 text-violet-500" /> Até</Label>
            <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="h-9 w-[150px]" />
          </div>
          <div className="space-y-1">
            <Label className="text-[10.5px] text-slate-400 dark:text-slate-500">Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                {Object.entries(SITUACOES).map(([code, { label }]) => (
                  <SelectItem key={code} value={code}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 flex-1 min-w-[200px]">
            <Label className="text-[10.5px] text-slate-400 dark:text-slate-500">Busca rápida</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Nº, CPF, cliente ou vendedor" className="h-9 pl-9" />
            </div>
          </div>
          <Button onClick={loadReport} disabled={loading} size="sm" className="h-9 bg-violet-600 hover:bg-violet-700 text-white">
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
            Aplicar
          </Button>
        </div>

        {/* Barra de alerta operacional */}
        {at && (
          <div className={`flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-xl border px-4 py-2.5 ${at.wrap}`}>
            <span className="inline-flex items-center gap-2 font-semibold text-[13px]">
              <at.icon className="w-4 h-4" />
              {alert.messages[0]}
            </span>
            {alert.messages.slice(1).map((m, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 text-[12.5px] opacity-90">
                <span className={`h-1.5 w-1.5 rounded-full ${at.dot}`} /> {m}
              </span>
            ))}
          </div>
        )}

        {/* Abas de filtro rápido (estilo inbox) */}
        <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
          {TABS.map(t => {
            const active = tab === t.key;
            const n = counts[t.key] ?? 0;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                  active
                    ? 'bg-violet-600 text-white shadow-sm shadow-violet-500/30'
                    : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100 dark:bg-gray-900 dark:text-slate-300 dark:ring-gray-800 dark:hover:bg-gray-800'
                }`}
              >
                {t.key === 'meus' && <UserIcon className="w-3.5 h-3.5" />}
                {t.label}
                <span className={`rounded-full px-1.5 py-0.5 text-[10.5px] font-bold ${
                  active ? 'bg-white/25 text-white' : 'bg-slate-200 text-slate-600 dark:bg-gray-700 dark:text-slate-300'
                }`}>
                  {n}
                </span>
              </button>
            );
          })}
        </div>

        {/* Caixa de auditoria (lista de cards — elemento herói) */}
        <div className="flex flex-col gap-2 overflow-auto max-h-[calc(100vh-250px)] min-h-[320px] pr-0.5">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <Loader2 className="w-7 h-7 animate-spin mb-3" />
              Carregando caixa de auditoria…
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white py-20 text-slate-400 dark:border-gray-800 dark:bg-gray-900">
              <Inbox className="w-9 h-9 mb-3 opacity-40" />
              Nenhum orçamento na fila para os filtros selecionados.
            </div>
          ) : filtered.map((o, i) => {
            const pm = PRIORITY_META[o._priority] || PRIORITY_META.novo;
            const issues = getPendingIssues(o);
            const recommended = getRecommendedAction(o);
            const pending = PENDING_SITUACOES.has(o.situacao);
            const canal = o.canal_id ? (canaisMap[o.canal_id] || String(o.canal_id)) : null;
            return (
              <div
                key={`${o.erp_id}-${i}`}
                className={`group flex flex-col md:flex-row md:items-stretch gap-3 md:gap-4 rounded-xl border border-slate-200 dark:border-gray-800 border-l-[5px] ${pm.accent} bg-white dark:bg-gray-900 px-4 py-3 shadow-sm transition-all hover:shadow-md hover:-translate-y-px`}
              >
                {/* Conteúdo do item */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setSelected(o)}
                      className="rounded text-[15px] font-bold text-slate-800 dark:text-slate-100 hover:text-violet-700 dark:hover:text-violet-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-1"
                      title="Abrir auditoria"
                      aria-label={`Abrir auditoria do orçamento ${o.numero_orcamento || o.erp_id}`}
                    >
                      #{o.numero_orcamento || o.erp_id}
                    </button>
                    <PriorityBadge priority={o._priority} />
                    <SituacaoBadge situacao={o.situacao} />
                    {pending && (
                      <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-slate-500 dark:text-slate-400">
                        <span className={`h-1.5 w-1.5 rounded-full ${pm.dot}`} />
                        Aguardando {humanizeMs(o._waitMs)}
                      </span>
                    )}
                  </div>

                  <div className="mt-1.5 flex items-baseline gap-2 flex-wrap">
                    <span className="text-[15px] font-semibold text-slate-900 dark:text-white truncate max-w-full" title={o.nome_titular || ''}>
                      {o.nome_titular || '-'}
                    </span>
                    <span className="font-mono text-[11.5px] text-slate-400 dark:text-slate-500">{formatCpf(o.cpf_titular)}</span>
                  </div>

                  {/* Pendências (evidentes) */}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {issues.map((iss, j) => {
                      const Icon = ISSUE_ICON[iss.tone] || AlertCircle;
                      return (
                        <span key={j} className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11.5px] font-medium ${ISSUE_TONE[iss.tone]}`}>
                          <Icon className="w-3 h-3" /> {iss.label}
                        </span>
                      );
                    })}
                  </div>

                  {/* Meta: vendedor · canal · módulo */}
                  <div className="mt-2.5 flex items-center flex-wrap gap-x-4 gap-y-1 text-[12px] text-slate-500 dark:text-slate-400">
                    <span className="inline-flex items-center gap-1.5" title="Vendedor responsável">
                      <UserIcon className="w-3.5 h-3.5" /> {o.nome_vendedor || '-'}
                    </span>
                    <span className="inline-flex items-center gap-1.5" title="Canal">
                      <Layers className="w-3.5 h-3.5" /> {canal || '—'}
                    </span>
                    <Badge variant="outline" className={`${MODULO_BADGE[o.modulo] || 'bg-gray-50 text-gray-600 border-gray-200'} text-[11px] font-medium`}>
                      {o.modulo_nome || '-'}
                    </Badge>
                  </div>
                </div>

                {/* Ações operacionais (prominentes, com rótulo) */}
                <div className="flex flex-col gap-2 shrink-0 md:w-[184px] md:border-l md:border-slate-100 md:dark:border-gray-800 md:pl-4 md:justify-center">
                  <span className="hidden md:inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    <ArrowRight className="w-3 h-3" /> {recommended}
                  </span>
                  <div className="grid grid-cols-2 md:grid-cols-1 gap-2">
                    <CardAction variant="primary" icon={Eye} label="Auditar" onClick={() => setSelected(o)} className="col-span-2 md:col-span-1" />
                    <CardAction variant="approve" icon={ThumbsUp} label="Aprovar" onClick={() => handleQuickAction('Aprovar', o)} />
                    <CardAction variant="adjust" icon={PencilLine} label="Ajuste" onClick={() => handleQuickAction('Solicitar ajuste', o)} />
                    <CardAction variant="reject" icon={Ban} label="Rejeitar" onClick={() => handleQuickAction('Rejeitar', o)} className="col-span-2 md:col-span-1" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Rodapé da fila */}
        {!loading && filtered.length > 0 && (
          <div className="flex items-center justify-between px-1 text-[12px] text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <Inbox className="w-3.5 h-3.5 text-violet-500" />
              {filtered.length} {filtered.length === 1 ? 'orçamento na fila' : 'orçamentos na fila'}
            </span>
            <span>{stats.total} no período</span>
          </div>
        )}
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
