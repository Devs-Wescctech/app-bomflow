import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

// DE > PARA das situações do ERP — chips suaves, sem bordas pesadas.
const SITUACOES = {
  'I': { label: 'Em análise',  color: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300' },
  'A': { label: 'Aprovado',    color: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300' },
  'C': { label: 'Cancelado',   color: 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300' },
  'P': { label: 'Proposta',    color: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300' },
  'R': { label: 'Perdido',     color: 'bg-slate-100 text-slate-500 dark:bg-slate-700/40 dark:text-slate-300' },
  'M': { label: 'Manutenção',  color: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300' },
};

// Situações que representam orçamentos AGUARDANDO auditoria.
const PENDING_SITUACOES = new Set(['I', 'P', 'M']);
// Limiares (horas) de espera para escalonar a prioridade dos pendentes.
const CRITICAL_HOURS = 24;
const REVIEW_HOURS = 8;

// Cores por módulo de origem (chip discreto).
const MODULO_BADGE = {
  sales:        'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300',
  sales_pj:     'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300',
  sales_upsell: 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300',
  referral:     'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300',
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
  critico:   { label: 'Crítico',   bar: 'bg-rose-400',    dot: 'bg-rose-500',    chip: 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300',       icon: AlertTriangle },
  revisar:   { label: 'Revisar',   bar: 'bg-amber-400',   dot: 'bg-amber-500',   chip: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300',    icon: Clock },
  novo:      { label: 'Novo',      bar: 'bg-sky-300',     dot: 'bg-sky-400',     chip: 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300',          icon: Inbox },
  aprovado:  { label: 'Aprovado',  bar: 'bg-emerald-400', dot: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300', icon: CheckCircle2 },
  encerrado: { label: 'Encerrado', bar: 'bg-slate-300',   dot: 'bg-slate-400',   chip: 'bg-slate-100 text-slate-500 dark:bg-slate-700/40 dark:text-slate-300', icon: XCircle },
};

const PRIORITY_ORDER = { critico: 0, revisar: 1, novo: 2, aprovado: 3, encerrado: 4 };

// Pendências derivadas SOMENTE de dados disponíveis na lista (status ERP + tempo de
// espera). Validações de documento/CPF exigem abrir a auditoria (modal).
const ISSUE_TONE = {
  crit: 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300',
  warn: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300',
  info: 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300',
  ok:   'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300',
  muted:'bg-slate-100 text-slate-500 dark:bg-slate-700/40 dark:text-slate-300',
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

function Chip({ className = '', children }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium ${className}`}>
      {children}
    </span>
  );
}

function SituacaoChip({ situacao }) {
  const s = SITUACOES[situacao] || { label: situacao || '-', color: 'bg-slate-100 text-slate-500' };
  return <Chip className={s.color}>{s.label}</Chip>;
}

function PriorityChip({ priority }) {
  const m = PRIORITY_META[priority] || PRIORITY_META.novo;
  const Icon = m.icon;
  return <Chip className={`${m.chip} font-semibold`}><Icon className="w-3 h-3" /> {m.label}</Chip>;
}

// Botão de ação do card — primário sóbrio (escuro) + secundários "ghost" que
// revelam cor semântica suave no hover (evita excesso de cores e bordas pesadas).
function CardAction({ variant = 'ghost', icon: Icon, label, onClick, className = '' }) {
  const VARIANTS = {
    primary: 'bg-slate-900 text-white hover:bg-slate-800 shadow-sm dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100',
    approve: 'text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 dark:text-slate-400 dark:hover:text-emerald-300 dark:hover:bg-emerald-500/10',
    adjust:  'text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-gray-800',
    reject:  'text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:text-slate-500 dark:hover:text-rose-300 dark:hover:bg-rose-500/10',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50 ${VARIANTS[variant]} ${className}`}
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

  // Barra de alerta operacional (sutil) — comunica urgência sem ruído visual.
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
    crit: { wrap: 'bg-rose-50/70 text-rose-700 ring-1 ring-rose-100 dark:bg-rose-500/10 dark:text-rose-200 dark:ring-rose-500/20', dot: 'bg-rose-500', icon: AlertCircle },
    warn: { wrap: 'bg-amber-50/70 text-amber-700 ring-1 ring-amber-100 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-500/20', dot: 'bg-amber-500', icon: Clock },
    ok:   { wrap: 'bg-emerald-50/60 text-emerald-700 ring-1 ring-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-200 dark:ring-emerald-500/20', dot: 'bg-emerald-500', icon: CheckCircle2 },
  };

  const handleQuickAction = (label, o) => {
    toast({
      title: `${label} — em definição`,
      description: `Ação visual (protótipo) para o orçamento Nº ${o.numero_orcamento || o.erp_id}. O fluxo de aprovação será definido em uma próxima etapa.`,
    });
  };

  const at = alert ? ALERT_TONE[alert.tone] : null;
  const Divider = () => <span className="hidden sm:inline-block h-3.5 w-px bg-slate-200 dark:bg-gray-700" />;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-gray-950 dark:to-gray-950 -m-3 md:-m-6 p-4 md:p-7">
      <div className="max-w-[1320px] mx-auto flex flex-col gap-4">

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3.5">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-violet-600 text-white ring-1 ring-violet-400/30 shadow-lg shadow-violet-500/25">
              <ShieldCheck className="w-5 h-5" />
            </span>
            <div>
              <h1 className="text-[22px] font-semibold tracking-tight text-slate-900 dark:text-slate-50 leading-tight">Caixa de Auditoria</h1>
              <p className="text-[13px] text-slate-500 dark:text-slate-400">Vendas PF, PJ, Upsell e Indicações · priorize e decida com clareza</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-[12px] text-slate-400 dark:text-slate-500 hidden sm:inline tabular-nums">
                Atualizado {lastUpdated.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <Button
              onClick={loadReport}
              disabled={loading}
              size="sm"
              variant="outline"
              className="bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:text-slate-900 shadow-sm dark:bg-gray-900 dark:text-slate-200 dark:border-gray-800 dark:hover:bg-gray-800"
            >
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              Atualizar
            </Button>
          </div>
        </div>

        {/* Resumo operacional compacto (secundário) */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-0.5 text-[13px]">
          <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
            <Inbox className="w-3.5 h-3.5 text-violet-500" />
            <b className="font-semibold text-slate-900 dark:text-slate-100 tabular-nums">{stats.aguardando}</b>
            <span className="text-slate-500 dark:text-slate-400">aguardando</span>
          </span>
          <Divider />
          <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
            <b className="font-semibold text-rose-600 dark:text-rose-400 tabular-nums">{stats.criticos}</b>
            <span className="text-slate-500 dark:text-slate-400">críticos</span>
          </span>
          <Divider />
          <span className="text-slate-500 dark:text-slate-400">Pendente mais antigo <b className="font-semibold text-slate-800 dark:text-slate-200 tabular-nums">{humanizeMs(stats.oldestMs)}</b></span>
          <Divider />
          <span className="text-slate-500 dark:text-slate-400">Aprovados hoje <b className="font-semibold text-slate-300 dark:text-slate-600">—</b></span>
          <Divider />
          <span className="text-slate-500 dark:text-slate-400">Aprovados no período <b className="font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">{stats.aprovados}</b></span>
        </div>

        {/* Filtros (período/status/busca preservados) */}
        <div className="flex flex-wrap items-end gap-2.5 rounded-2xl bg-white/80 backdrop-blur ring-1 ring-slate-200/70 shadow-[0_1px_2px_rgba(15,23,42,0.04)] px-4 py-3 dark:bg-gray-900/80 dark:ring-gray-800">
          <div className="space-y-1.5">
            <Label className="text-[10.5px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1"><Calendar className="w-3 h-3 text-violet-500" /> De</Label>
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="h-9 w-[150px] border-slate-200 dark:border-gray-800" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10.5px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1"><Calendar className="w-3 h-3 text-violet-500" /> Até</Label>
            <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="h-9 w-[150px] border-slate-200 dark:border-gray-800" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10.5px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-[180px] border-slate-200 dark:border-gray-800"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                {Object.entries(SITUACOES).map(([code, { label }]) => (
                  <SelectItem key={code} value={code}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 flex-1 min-w-[200px]">
            <Label className="text-[10.5px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">Busca rápida</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Nº, CPF, cliente ou vendedor" className="h-9 pl-9 border-slate-200 dark:border-gray-800" />
            </div>
          </div>
          <Button onClick={loadReport} disabled={loading} size="sm" className="h-9 bg-slate-900 hover:bg-slate-800 text-white shadow-sm dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100">
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
            Aplicar
          </Button>
        </div>

        {/* Barra de alerta operacional (sutil) */}
        {at && (
          <div className={`flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-2xl px-4 py-2.5 ${at.wrap}`}>
            <span className="inline-flex items-center gap-2 font-semibold text-[13px]">
              <at.icon className="w-4 h-4" />
              {alert.messages[0]}
            </span>
            {alert.messages.slice(1).map((m, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 text-[12.5px] opacity-80">
                <span className={`h-1.5 w-1.5 rounded-full ${at.dot}`} /> {m}
              </span>
            ))}
          </div>
        )}

        {/* Filtros rápidos — controle segmentado (estilo Linear/Notion) */}
        <div className="inline-flex items-center gap-1 self-start max-w-full overflow-x-auto rounded-xl bg-slate-100/80 p-1 dark:bg-gray-900/80">
          {TABS.map(t => {
            const active = tab === t.key;
            const n = counts[t.key] ?? 0;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                aria-pressed={active}
                className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50 ${
                  active
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-gray-800 dark:text-white'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {t.key === 'meus' && <UserIcon className="w-3.5 h-3.5" />}
                {t.label}
                <span className={`rounded-full px-1.5 text-[10.5px] font-semibold tabular-nums ${
                  active ? 'bg-slate-100 text-slate-600 dark:bg-gray-700 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500'
                }`}>
                  {n}
                </span>
              </button>
            );
          })}
        </div>

        {/* Caixa de auditoria (lista de cards — elemento herói) */}
        <div className="flex flex-col gap-2.5 overflow-auto max-h-[calc(100vh-260px)] min-h-[320px] pr-0.5 -mr-0.5">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 text-slate-400">
              <Loader2 className="w-7 h-7 animate-spin mb-3" />
              Carregando caixa de auditoria…
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl bg-white ring-1 ring-slate-200/70 py-24 text-slate-400 dark:bg-gray-900 dark:ring-gray-800">
              <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50 dark:bg-gray-800">
                <Inbox className="w-6 h-6 opacity-50" />
              </div>
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
                className="group relative flex flex-col md:flex-row md:items-stretch gap-4 rounded-2xl bg-white dark:bg-gray-900 ring-1 ring-slate-200/60 dark:ring-gray-800 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:ring-slate-300/70 hover:shadow-[0_14px_34px_-16px_rgba(15,23,42,0.22)] pl-5 pr-4 py-4"
              >
                {/* Acento de prioridade (sutil) */}
                <span className={`absolute left-0 top-4 bottom-4 w-[3px] rounded-full ${pm.bar} opacity-80 transition-opacity group-hover:opacity-100`} />

                {/* Conteúdo do item */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setSelected(o)}
                      className="rounded text-[15px] font-semibold tracking-tight text-slate-900 dark:text-slate-50 hover:text-violet-600 dark:hover:text-violet-400 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60 focus-visible:ring-offset-1"
                      title="Abrir auditoria"
                      aria-label={`Abrir auditoria do orçamento ${o.numero_orcamento || o.erp_id}`}
                    >
                      #{o.numero_orcamento || o.erp_id}
                    </button>
                    <PriorityChip priority={o._priority} />
                    <SituacaoChip situacao={o.situacao} />
                    {pending && (
                      <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-slate-400 dark:text-slate-500">
                        <span className={`h-1.5 w-1.5 rounded-full ${pm.dot}`} />
                        {humanizeMs(o._waitMs)} na fila
                      </span>
                    )}
                  </div>

                  <div className="mt-2 flex items-baseline gap-2 flex-wrap">
                    <span className="text-[15px] font-semibold text-slate-900 dark:text-white truncate max-w-full" title={o.nome_titular || ''}>
                      {o.nome_titular || '-'}
                    </span>
                    <span className="font-mono text-[11.5px] text-slate-400 dark:text-slate-500 tabular-nums">{formatCpf(o.cpf_titular)}</span>
                  </div>

                  {/* Pendências (evidentes, mas suaves) */}
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {issues.map((iss, j) => {
                      const Icon = ISSUE_ICON[iss.tone] || AlertCircle;
                      return (
                        <span key={j} className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11.5px] font-medium ${ISSUE_TONE[iss.tone]}`}>
                          <Icon className="w-3 h-3" /> {iss.label}
                        </span>
                      );
                    })}
                  </div>

                  {/* Meta: vendedor · canal · módulo */}
                  <div className="mt-3 flex items-center flex-wrap gap-x-4 gap-y-1 text-[12px] text-slate-400 dark:text-slate-500">
                    <span className="inline-flex items-center gap-1.5" title="Vendedor responsável">
                      <UserIcon className="w-3.5 h-3.5" /> <span className="text-slate-500 dark:text-slate-400">{o.nome_vendedor || '-'}</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5" title="Canal">
                      <Layers className="w-3.5 h-3.5" /> <span className="text-slate-500 dark:text-slate-400">{canal || '—'}</span>
                    </span>
                    <Chip className={MODULO_BADGE[o.modulo] || 'bg-slate-100 text-slate-500'}>{o.modulo_nome || '-'}</Chip>
                  </div>
                </div>

                {/* Ações operacionais */}
                <div className="flex flex-col gap-1.5 shrink-0 md:w-[156px] md:justify-center md:border-l md:border-slate-100 md:dark:border-gray-800 md:pl-4">
                  <span className="hidden md:inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    <ArrowRight className="w-3 h-3" /> {recommended}
                  </span>
                  <CardAction variant="primary" icon={Eye} label="Auditar" onClick={() => setSelected(o)} className="w-full" />
                  <div className="grid grid-cols-3 md:grid-cols-1 gap-1">
                    <CardAction variant="approve" icon={ThumbsUp} label="Aprovar" onClick={() => handleQuickAction('Aprovar', o)} className="w-full md:justify-start" />
                    <CardAction variant="adjust" icon={PencilLine} label="Ajuste" onClick={() => handleQuickAction('Solicitar ajuste', o)} className="w-full md:justify-start" />
                    <CardAction variant="reject" icon={Ban} label="Rejeitar" onClick={() => handleQuickAction('Rejeitar', o)} className="w-full md:justify-start" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Rodapé da fila */}
        {!loading && filtered.length > 0 && (
          <div className="flex items-center justify-between px-1 text-[12px] text-slate-400 dark:text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <Inbox className="w-3.5 h-3.5 text-violet-500" />
              <span className="tabular-nums">{filtered.length}</span> {filtered.length === 1 ? 'orçamento na fila' : 'orçamentos na fila'}
            </span>
            <span className="tabular-nums">{stats.total} no período</span>
          </div>
        )}
      </div>

      {selected && (
        <OrcamentoDetalheModal
          orcamento={selected}
          situacaoBadge={<SituacaoChip situacao={selected.situacao} />}
          canalLabel={selected.canal_id ? (canaisMap[selected.canal_id] || String(selected.canal_id)) : '-'}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
