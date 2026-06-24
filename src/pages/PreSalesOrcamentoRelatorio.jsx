import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Search, RefreshCw, Calendar, ShieldCheck, Clock, CheckCircle2,
  Loader2, AlertTriangle, XCircle, ThumbsUp, PencilLine, Ban, Eye,
  Inbox, User as UserIcon, Layers, ArrowRight, MoreVertical,
} from "lucide-react";
import OrcamentoDetalheModal from "@/components/presales/OrcamentoDetalheModal";

const API_BASE = '/api';

function getAuthHeaders() {
  const token = localStorage.getItem('accessToken');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

function formatCpf(cpf) {
  if (!cpf) return '-';
  const d = String(cpf).replace(/\D/g, '');
  if (d.length !== 11) return cpf;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

// O ERP armazena datas no horário de Brasília (UTC-3), mas o driver pg as
// serializa sem fuso (como se fossem UTC). Corrige somando 3h ao valor lido.
const ERP_TZ_OFFSET_MS = 3 * 60 * 60 * 1000; // UTC-3 → UTC
function parseErpTs(dateStr) {
  if (!dateStr) return NaN;
  const t = new Date(dateStr).getTime();
  return Number.isNaN(t) ? NaN : t + ERP_TZ_OFFSET_MS;
}

// Tempo de espera desde a criação (proxy de "aguardando há"). Retorna ms ou null.
function waitingMs(dateStr) {
  const t = parseErpTs(dateStr);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Date.now() - t);
}

function humanizeMs(ms) {
  if (ms == null) return '-';
  const h = ms / 36e5;
  if (h < 1) return `${Math.max(1, Math.round(ms / 6e4))} min`;
  if (h < 24) return `${Math.round(h)}h`;
  const d = Math.floor(h / 24);
  return d === 1 ? '1 dia' : `${d} dias`;
}

// Última atividade real (data_alteracao do ERP) — relativa nas últimas 24h
// ("há X min" / "há Xh"); "Ontem HH:MM" ou data curta + hora para mais antigos.
function formatLastActivity(dateStr) {
  const t = parseErpTs(dateStr);
  if (Number.isNaN(t)) return null;
  const diff = Date.now() - t;
  if (diff < 36e5) return `há ${Math.max(1, Math.round(diff / 6e4))} min`;
  if (diff < 24 * 36e5) return `há ${Math.round(diff / 36e5)}h`;
  const d = new Date(t);
  const today = new Date();
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === today.toDateString()) return `Hoje ${time}`;
  const yest = new Date(today); yest.setDate(today.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return `Ontem ${time}`;
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${time}`;
}

const norm = (s) => String(s || '').trim().toLowerCase();

// DE > PARA das situações do ERP — chips suaves, sem bordas. Vermelho reservado
// apenas para criticidade real; status negativos ficam neutros.
const SITUACOES = {
  'I': { label: 'Emitido / Análise', color: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300' },
  'A': { label: 'Aprovado',   color: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300' },
  'C': { label: 'Cancelado',  color: 'bg-slate-100 text-slate-500 dark:bg-slate-700/40 dark:text-slate-300' },
  'P': { label: 'Proposta',   color: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300' },
  'R': { label: 'Perdido',    color: 'bg-slate-100 text-slate-500 dark:bg-slate-700/40 dark:text-slate-300' },
  'M': { label: 'Manutenção', color: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300' },
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

// Vermelho apenas para "crítico". Demais prioridades usam azul/âmbar/verde/cinza.
const PRIORITY_META = {
  critico:   { label: 'Crítico',   bar: 'bg-rose-400',    dot: 'bg-rose-500',    chip: 'bg-rose-50 text-rose-600 ring-1 ring-inset ring-rose-200/60 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/20',       icon: AlertTriangle },
  revisar:   { label: 'Revisar',   bar: 'bg-amber-400',   dot: 'bg-amber-500',   chip: 'bg-amber-50 text-amber-600 ring-1 ring-inset ring-amber-200/60 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/20',    icon: Clock },
  novo:      { label: 'Novo',      bar: 'bg-sky-300',     dot: 'bg-sky-400',     chip: 'bg-sky-50 text-sky-600 ring-1 ring-inset ring-sky-200/60 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/20',          icon: Inbox },
  aprovado:  { label: 'Aprovado',  bar: 'bg-emerald-400', dot: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-600 ring-1 ring-inset ring-emerald-200/60 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/20', icon: CheckCircle2 },
  encerrado: { label: 'Encerrado', bar: 'bg-slate-300',   dot: 'bg-slate-400',   chip: 'bg-slate-100 text-slate-500 ring-1 ring-inset ring-slate-200 dark:bg-slate-700/40 dark:text-slate-300 dark:ring-slate-600/30', icon: XCircle },
};

const PRIORITY_ORDER = { critico: 0, revisar: 1, novo: 2, aprovado: 3, encerrado: 4 };

function sortByUrgency(a, b) {
  const pa = PRIORITY_ORDER[a._priority] ?? 9;
  const pb = PRIORITY_ORDER[b._priority] ?? 9;
  if (pa !== pb) return pa - pb;
  return (b._waitMs ?? 0) - (a._waitMs ?? 0);
}

function Chip({ className = '', children }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium transition-all duration-200 ${className}`}>
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
  const critical = priority === 'critico';
  return (
    <Chip className={`${m.chip} font-semibold ${critical ? 'tracking-wide shadow-[0_0_12px_rgba(239,68,68,0.18)]' : ''}`}>
      <Icon className="w-3 h-3" /> {m.label}
    </Chip>
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
      params.set('situacao', 'I');
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
    return items.filter(o => o.situacao === 'I').map(o => ({
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

    return [...list].sort(sortByUrgency);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enriched, search, tab, currentUser]);

  // KPIs operacionais (consumidos pelo hero).
  const stats = useMemo(() => {
    const pendentes = enriched.filter(o => PENDING_SITUACOES.has(o.situacao));
    const aguardando = pendentes.length;
    const criticos = pendentes.filter(o => o._priority === 'critico').length;
    const oldest = pendentes.reduce((acc, o) => Math.max(acc, o._waitMs ?? 0), 0);
    return { total: enriched.length, aguardando, criticos, oldestMs: pendentes.length ? oldest : null };
  }, [enriched]);

  // Item mais urgente da fila — alvo do CTA "Auditar Agora".
  const topPending = useMemo(() => {
    const pend = enriched.filter(o => PENDING_SITUACOES.has(o.situacao));
    if (!pend.length) return null;
    return [...pend].sort(sortByUrgency)[0];
  }, [enriched]);

  const heroMessage = stats.criticos > 0
    ? `${stats.criticos} ${stats.criticos === 1 ? 'orçamento aguardando decisão prioritária' : 'orçamentos aguardando decisão prioritária'}`
    : stats.aguardando > 0
      ? `${stats.aguardando} ${stats.aguardando === 1 ? 'auditoria pendente requer análise' : 'auditorias pendentes requerem análise'}`
      : 'Tudo em dia — nenhuma auditoria pendente';

  const handleQuickAction = (label, o) => {
    toast({
      title: `${label} — em definição`,
      description: `Ação visual (protótipo) para o orçamento Nº ${o.numero_orcamento || o.erp_id}. O fluxo de aprovação será definido em uma próxima etapa.`,
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-gray-950 dark:to-gray-950 -m-3 md:-m-6 p-4 md:p-6">
      <div className="max-w-[1280px] mx-auto flex flex-col gap-3.5">

        {/* Hero — âncora visual */}
        <div className="relative overflow-hidden rounded-2xl px-5 py-4 md:px-6 md:py-5 text-white shadow-[0_20px_40px_rgba(124,58,237,0.18)] bg-gradient-to-br from-violet-600 via-violet-600 to-indigo-600">
          <div className="pointer-events-none absolute -top-16 -right-8 h-48 w-48 rounded-full bg-white/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 left-1/3 h-44 w-44 rounded-full bg-fuchsia-400/20 blur-3xl" />
          <div className="relative flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2.5">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25 backdrop-blur">
                  <ShieldCheck className="w-4 h-4" />
                </span>
                <h1 className="text-[20px] md:text-[22px] font-semibold tracking-tight leading-none">Fila Pré Vendas</h1>
              </div>
              <p className="mt-2.5 text-[14px] md:text-[15px] font-medium text-white/90">{heroMessage}</p>
            </div>

            <div className="flex items-center gap-4 sm:gap-5">
              {stats.oldestMs != null && (
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wider text-white/60">Pendente mais antigo</div>
                  <div className="text-[18px] font-semibold tabular-nums leading-tight">{humanizeMs(stats.oldestMs)}</div>
                </div>
              )}
              <button
                onClick={loadReport}
                disabled={loading}
                title="Atualizar"
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white ring-1 ring-white/20 transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-60"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              </button>
              <Button
                onClick={() => topPending && setSelected(topPending)}
                disabled={!topPending}
                className="bg-white text-violet-700 hover:bg-violet-50 shadow-md shadow-violet-900/10 font-semibold disabled:opacity-60"
              >
                Auditar Agora <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            </div>
          </div>
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
          <div className="space-y-1.5 flex-1 min-w-[200px]">
            <Label className="text-[10.5px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">Busca rápida</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Nº, CPF, cliente ou vendedor" className="h-9 pl-9 border-slate-200 dark:border-gray-800" />
            </div>
          </div>
          <Button onClick={loadReport} disabled={loading} size="sm" className="h-9 bg-[linear-gradient(135deg,#7C3AED,#9333EA)] text-white shadow-sm transition-all duration-200 hover:brightness-110">
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
            Aplicar
          </Button>
        </div>

        {/* Filtros rápidos — controle segmentado */}
        <div className="flex items-center justify-between gap-3">
          <div className="inline-flex items-center gap-1 max-w-full overflow-x-auto rounded-xl bg-slate-100/80 p-1 dark:bg-gray-900/80">
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
          <span className="hidden sm:inline text-[11.5px] text-slate-400 dark:text-slate-500 tabular-nums shrink-0">
            {filtered.length} na fila
          </span>
        </div>

        {/* Caixa de auditoria — lista densa de cards */}
        <div className="flex flex-col gap-2 overflow-auto max-h-[calc(100vh-290px)] min-h-[300px] pr-0.5 -mr-0.5">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 text-slate-400">
              <Loader2 className="w-7 h-7 animate-spin mb-3" />
              Carregando fila pré vendas…
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
            const pending = PENDING_SITUACOES.has(o.situacao);
            const canal = o.canal_id ? (canaisMap[o.canal_id] || String(o.canal_id)) : null;
            return (
              <div
                key={`${o.erp_id}-${i}`}
                className="group relative flex items-center gap-3 rounded-xl bg-white dark:bg-gray-900 ring-1 ring-slate-200/60 dark:ring-gray-800 shadow-[0_1px_3px_rgba(15,23,42,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:ring-slate-300/70 hover:shadow-[0_12px_32px_rgba(0,0,0,0.08)] pl-4 pr-2.5 py-3.5"
              >
                {/* Acento de prioridade (sutil) */}
                <span className={`absolute left-0 top-3 bottom-3 w-[3px] rounded-full ${pm.bar} opacity-70 transition-opacity group-hover:opacity-100`} />

                {/* Conteúdo (escaneável em 2 linhas) */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <button
                      type="button"
                      onClick={() => setSelected(o)}
                      className="rounded text-[15px] font-bold tracking-[-0.01em] text-slate-900 dark:text-white truncate transition-colors hover:text-violet-600 dark:hover:text-violet-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60 focus-visible:ring-offset-1"
                      title={o.nome_titular || 'Abrir auditoria'}
                      aria-label={`Abrir auditoria do orçamento ${o.numero_orcamento || o.erp_id} — ${o.nome_titular || ''}`}
                    >
                      {o.nome_titular || '-'}
                    </button>
                    {pending ? <PriorityChip priority={o._priority} /> : <SituacaoChip situacao={o.situacao} />}
                  </div>

                  <div className="mt-1.5 flex items-center flex-wrap gap-x-2.5 gap-y-1 text-[11.5px] text-slate-400 dark:text-slate-500">
                    <span className="font-semibold text-slate-500 dark:text-slate-400 tabular-nums">#{o.numero_orcamento || o.erp_id}</span>
                    <span className="font-mono tabular-nums text-slate-400 dark:text-slate-500">{formatCpf(o.cpf_titular)}</span>
                    {pending && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-slate-100/80 px-1.5 py-0.5 font-medium text-slate-500 transition-colors duration-200 dark:bg-gray-800/60 dark:text-slate-300">
                        <Clock className="w-3.5 h-3.5" /> {humanizeMs(o._waitMs)} aguardando
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1" title="Vendedor">
                      <UserIcon className="w-3.5 h-3.5" /> <span className="truncate max-w-[150px]">{o.nome_vendedor || '-'}</span>
                    </span>
                    {canal && (
                      <span className="hidden lg:inline-flex items-center gap-1" title="Canal">
                        <Layers className="w-3.5 h-3.5" /> <span className="truncate max-w-[150px]">{canal}</span>
                      </span>
                    )}
                    <Chip className={MODULO_BADGE[o.modulo] || 'bg-slate-100 text-slate-500'}>{o.modulo_nome || '-'}</Chip>
                  </div>

                  {o.data_ultima_alteracao && (
                    <div className="mt-1 text-[11px] text-slate-400/80 dark:text-slate-500">
                      Última atualização: <span className="font-medium text-slate-500 dark:text-slate-400">{formatLastActivity(o.data_ultima_alteracao)}</span>
                    </div>
                  )}
                </div>

                {/* Ação primária dominante + menu de contexto */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setSelected(o)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[linear-gradient(135deg,#7C3AED,#9333EA)] px-3 py-1.5 text-[12.5px] font-semibold text-white shadow-sm transition-all duration-200 hover:brightness-110 group-hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50"
                  >
                    <Eye className="h-3.5 w-3.5" /> Auditar
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label="Mais ações"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 opacity-60 transition-all hover:bg-slate-100 hover:text-slate-700 group-hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50 focus-visible:opacity-100 dark:hover:bg-gray-800 dark:hover:text-slate-200"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem onClick={() => handleQuickAction('Aprovar', o)}>
                        <ThumbsUp className="mr-2 h-4 w-4 text-emerald-500" /> Aprovar
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleQuickAction('Solicitar ajuste', o)}>
                        <PencilLine className="mr-2 h-4 w-4 text-slate-400" /> Solicitar ajuste
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => handleQuickAction('Rejeitar', o)} className="text-rose-600 focus:text-rose-600 dark:text-rose-400 dark:focus:text-rose-400">
                        <Ban className="mr-2 h-4 w-4" /> Rejeitar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })}
        </div>
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
