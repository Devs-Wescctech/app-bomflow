import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogTitle, DialogPortal, DialogOverlay, DialogClose } from "@/components/ui/dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useToast } from "@/components/ui/use-toast";
import {
  Search, Filter, Loader2,
  Calendar, ChevronDown, ChevronUp, FileSpreadsheet, FileText,
  User, Hash, Clock, Tag, Store, TrendingUp,
  CheckCircle2, XCircle, Receipt, Users,
  X, Wallet, Sparkles, History, BadgeCheck
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RTooltip } from "recharts";

const API_BASE = '/api';

function getAuthHeaders() {
  const token = localStorage.getItem('accessToken');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  try {
    return new Date(dateStr).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  } catch { return '-'; }
}

function formatDateOnly(dateStr) {
  if (!dateStr) return '-';
  try {
    return new Date(dateStr).toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    });
  } catch { return '-'; }
}

function formatCurrency(val) {
  const n = Number(val);
  if (isNaN(n)) return '-';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Formata 'YYYY-MM-DD' (input date) como DD/MM/YYYY sem deslocamento de fuso.
function fmtBR(isoDate) {
  if (!isoDate) return '-';
  const [y, m, d] = String(isoDate).split('-');
  return d && m && y ? `${d}/${m}/${y}` : isoDate;
}

function timeAgo(date) {
  if (!date) return null;
  const sec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (sec < 45) return 'agora mesmo';
  const min = Math.floor(sec / 60);
  if (min < 1) return 'há menos de 1 min';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return `há ${d} ${d === 1 ? 'dia' : 'dias'}`;
}

function formatDateForFile() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

// DE > PARA das situações do ERP (código cru I/A/C/P/R/M -> rótulo de exibição).
// Fonte única para badge, filtro e exportações. A ordem define a listagem do filtro.
const SITUACOES = {
  'I': { label: 'Emitido / Análise',   color: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700' },
  'A': { label: 'Aprovado',            color: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700' },
  'C': { label: 'Cancelado',           color: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700' },
  'P': { label: 'Pendente / Proposta', color: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700' },
  'R': { label: 'Perdido',             color: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800/50 dark:text-slate-300 dark:border-slate-600' },
  'M': { label: 'Em manutenção',       color: 'bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-700' },
};

// Cores sólidas (hex) por código de situação — usadas no gráfico donut.
const STATUS_COLORS = {
  'I': '#3b82f6', // blue   — Emitido / Análise
  'A': '#10b981', // emerald— Aprovado
  'C': '#ef4444', // red    — Cancelado
  'P': '#f59e0b', // amber  — Pendente / Proposta
  'R': '#64748b', // slate  — Perdido
  'M': '#6366f1', // indigo — Em manutenção
};

// Tons dos cards de KPI (estilo SaaS: card branco + leve gradiente + chip do ícone).
const KPI_TONES = {
  slate:   { ring: 'ring-slate-200 dark:ring-gray-800',   icon: 'bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300',       value: 'text-slate-900 dark:text-slate-100',     grad: 'from-white to-slate-50/70' },
  emerald: { ring: 'ring-emerald-200 dark:ring-emerald-900/40', icon: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300', value: 'text-emerald-700 dark:text-emerald-300', grad: 'from-white to-emerald-50/70' },
  blue:    { ring: 'ring-blue-200 dark:ring-blue-900/40',  icon: 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300',          value: 'text-blue-700 dark:text-blue-300',       grad: 'from-white to-blue-50/70' },
  red:     { ring: 'ring-red-200 dark:ring-red-900/40',    icon: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300',             value: 'text-red-700 dark:text-red-300',         grad: 'from-white to-red-50/70' },
  sky:     { ring: 'ring-sky-200 dark:ring-sky-900/40',    icon: 'bg-sky-100 text-sky-600 dark:bg-sky-900/40 dark:text-sky-300',             value: 'text-sky-700 dark:text-sky-300',         grad: 'from-white to-sky-50/70' },
  teal:    { ring: 'ring-teal-200 dark:ring-teal-900/40',  icon: 'bg-teal-100 text-teal-600 dark:bg-teal-900/40 dark:text-teal-300',          value: 'text-teal-700 dark:text-teal-300',       grad: 'from-white to-teal-50/70' },
  violet:  { ring: 'ring-violet-200 dark:ring-violet-900/40', icon: 'bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-300', value: 'text-violet-700 dark:text-violet-300',   grad: 'from-white to-violet-50/70' },
};

function SituacaoBadge({ situacao }) {
  const s = SITUACOES[situacao] || { label: situacao || '-', color: 'bg-gray-100 text-gray-700 border-gray-300' };
  return <Badge variant="outline" className={s.color}>{s.label}</Badge>;
}

// Per-accent Tailwind class sets
const ACCENT = {
  blue: {
    btn:        'bg-blue-600 hover:bg-blue-700 shadow-blue-500/30',
    filterBg:   'bg-blue-100 dark:bg-blue-900/40',
    filterIcon: 'text-blue-600 dark:text-blue-400',
    iconField:  'text-blue-500',
    rowHover:   'hover:bg-blue-50/60 dark:hover:bg-blue-900/10',
    numColor:   'text-blue-700 dark:text-blue-400 group-hover:text-blue-900 dark:group-hover:text-blue-300',
    badge:      'bg-blue-100 text-blue-800 border border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800',
    modalIcon:  'bg-blue-100 dark:bg-blue-900/40',
    modalIconColor: 'text-blue-600 dark:text-blue-400',
  },
  sky: {
    btn:        'bg-sky-600 hover:bg-sky-700 shadow-sky-500/30',
    filterBg:   'bg-sky-100 dark:bg-sky-900/40',
    filterIcon: 'text-sky-600 dark:text-sky-400',
    iconField:  'text-sky-500',
    rowHover:   'hover:bg-sky-50/60 dark:hover:bg-sky-900/10',
    numColor:   'text-sky-700 dark:text-sky-400 group-hover:text-sky-900 dark:group-hover:text-sky-300',
    badge:      'bg-sky-100 text-sky-800 border border-sky-200 dark:bg-sky-900/40 dark:text-sky-300 dark:border-sky-800',
    modalIcon:  'bg-sky-100 dark:bg-sky-900/40',
    modalIconColor: 'text-sky-600 dark:text-sky-400',
  },
  teal: {
    btn:        'bg-teal-600 hover:bg-teal-700 shadow-teal-500/30',
    filterBg:   'bg-teal-100 dark:bg-teal-900/40',
    filterIcon: 'text-teal-600 dark:text-teal-400',
    iconField:  'text-teal-500',
    rowHover:   'hover:bg-teal-50/60 dark:hover:bg-teal-900/10',
    numColor:   'text-teal-700 dark:text-teal-400 group-hover:text-teal-900 dark:group-hover:text-teal-300',
    badge:      'bg-teal-100 text-teal-800 border border-teal-200 dark:bg-teal-900/40 dark:text-teal-300 dark:border-teal-800',
    modalIcon:  'bg-teal-100 dark:bg-teal-900/40',
    modalIconColor: 'text-teal-600 dark:text-teal-400',
  },
  violet: {
    btn:        'bg-violet-600 hover:bg-violet-700 shadow-violet-500/30',
    filterBg:   'bg-violet-100 dark:bg-violet-900/40',
    filterIcon: 'text-violet-600 dark:text-violet-400',
    iconField:  'text-violet-500',
    rowHover:   'hover:bg-violet-50/60 dark:hover:bg-violet-900/10',
    numColor:   'text-violet-700 dark:text-violet-400 group-hover:text-violet-900 dark:group-hover:text-violet-300',
    badge:      'bg-violet-100 text-violet-800 border border-violet-200 dark:bg-violet-900/40 dark:text-violet-300 dark:border-violet-800',
    modalIcon:  'bg-violet-100 dark:bg-violet-900/40',
    modalIconColor: 'text-violet-600 dark:text-violet-400',
  },
};

// Anel reforçado quando o KPI está ativo (filtrando).
const KPI_ACTIVE_RING = {
  slate:   'ring-2 ring-slate-400 dark:ring-slate-500',
  emerald: 'ring-2 ring-emerald-400 dark:ring-emerald-500',
  blue:    'ring-2 ring-blue-400 dark:ring-blue-500',
  red:     'ring-2 ring-red-400 dark:ring-red-500',
  sky:     'ring-2 ring-sky-400 dark:ring-sky-500',
  teal:    'ring-2 ring-teal-400 dark:ring-teal-500',
  violet:  'ring-2 ring-violet-400 dark:ring-violet-500',
};

function KpiCard({ icon: Icon, label, value, tone = 'slate', clickable = false, active = false, onClick }) {
  const t = KPI_TONES[tone] || KPI_TONES.slate;
  const ringCls = active ? (KPI_ACTIVE_RING[tone] || KPI_ACTIVE_RING.slate) : `ring-1 ${t.ring}`;
  const Comp = clickable ? 'button' : 'div';
  return (
    <Comp
      {...(clickable ? { type: 'button', onClick } : {})}
      className={`group text-left w-full rounded-2xl bg-gradient-to-br ${t.grad} dark:from-gray-900 dark:to-gray-900 p-4 md:p-5 ${ringCls} shadow-sm transition-all duration-200
        ${clickable ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98]' : ''}
        ${active ? 'shadow-md -translate-y-0.5' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 truncate">{label}</p>
        <span className={`p-1.5 rounded-lg shrink-0 ${t.icon}`}>
          <Icon className="w-4 h-4" />
        </span>
      </div>
      <p className={`mt-2 text-2xl md:text-3xl font-bold tracking-tight truncate ${t.value}`}>{value}</p>
      {clickable && (
        <p className="mt-1 text-[10px] font-medium text-gray-400 dark:text-gray-500 truncate">
          {active ? 'Filtrando • clique p/ limpar' : 'Clique para filtrar'}
        </p>
      )}
    </Comp>
  );
}

// Tema visual do header do modal por código de situação.
// Gradientes dessaturados (tons profundos 600→700/800) p/ leitura premium e sóbria.
const STATUS_THEME = {
  I: { grad: 'from-blue-600 to-blue-800',       soft: 'bg-blue-50 dark:bg-blue-900/20',    dot: 'bg-blue-500',    accentText: 'text-blue-600 dark:text-blue-400',    ring: 'ring-blue-200/70 dark:ring-blue-900/40',    glow: 'bg-blue-400/25' },
  A: { grad: 'from-emerald-600 to-teal-800',    soft: 'bg-emerald-50 dark:bg-emerald-900/20', dot: 'bg-emerald-500', accentText: 'text-emerald-600 dark:text-emerald-400', ring: 'ring-emerald-200/70 dark:ring-emerald-900/40', glow: 'bg-emerald-400/25' },
  C: { grad: 'from-rose-600 to-red-800',        soft: 'bg-red-50 dark:bg-red-900/20',      dot: 'bg-red-500',     accentText: 'text-red-600 dark:text-red-400',      ring: 'ring-red-200/70 dark:ring-red-900/40',      glow: 'bg-rose-400/25' },
  P: { grad: 'from-amber-500 to-orange-700',    soft: 'bg-amber-50 dark:bg-amber-900/20',  dot: 'bg-amber-500',   accentText: 'text-amber-600 dark:text-amber-400',  ring: 'ring-amber-200/70 dark:ring-amber-900/40',  glow: 'bg-amber-400/25' },
  R: { grad: 'from-slate-600 to-slate-800',     soft: 'bg-slate-50 dark:bg-slate-800/50',  dot: 'bg-slate-500',   accentText: 'text-slate-600 dark:text-slate-400',  ring: 'ring-slate-200/70 dark:ring-slate-700/50',  glow: 'bg-slate-400/25' },
  M: { grad: 'from-indigo-600 to-violet-800',   soft: 'bg-indigo-50 dark:bg-indigo-900/20', dot: 'bg-indigo-500', accentText: 'text-indigo-600 dark:text-indigo-400', ring: 'ring-indigo-200/70 dark:ring-indigo-900/40', glow: 'bg-indigo-400/25' },
};

// Card de informação do modal (glassmorphism, hover-lift, entrada animada escalonada).
// `sub` é uma linha secundária de-emphasizada (ex.: CPF abaixo do nome).
function InfoCard({ icon: Icon, label, value, sub, subMono = false, delay = 0, className = '' }) {
  return (
    <div
      className={`group rounded-2xl border border-gray-200/60 dark:border-gray-700/50 bg-white/55 dark:bg-gray-800/35 backdrop-blur-md p-4 shadow-sm ring-1 ring-black/[0.02] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:bg-white/80 dark:hover:bg-gray-800/55 animate-in fade-in slide-in-from-bottom-3 ${className}`}
      style={{ animationDelay: `${delay}ms`, animationFillMode: 'both' }}
    >
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1.5">
        <Icon className="w-3.5 h-3.5 shrink-0" />{label}
      </div>
      <p className="text-sm font-semibold leading-snug text-gray-800 dark:text-gray-100 break-words">
        {value}
      </p>
      {sub && (
        <p className={`mt-1 text-xs text-gray-400 dark:text-gray-500 break-words ${subMono ? 'font-mono tracking-tight' : ''}`}>
          {sub}
        </p>
      )}
    </div>
  );
}

// Nó da timeline/histórico do modal (entrada animada lateral; dot com anel e ping no atual).
function TimelineNode({ icon: Icon, title, time, dotClass, last = false, active = false, delay = 0 }) {
  return (
    <div
      className="relative flex gap-3 pb-5 last:pb-0 animate-in fade-in slide-in-from-left-3"
      style={{ animationDelay: `${delay}ms`, animationFillMode: 'both' }}
    >
      {!last && <span className="absolute left-[13px] top-8 bottom-1 w-px bg-gradient-to-b from-gray-200 to-gray-200/30 dark:from-gray-700 dark:to-gray-700/20" />}
      <span className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white shadow-sm ring-4 ring-white dark:ring-gray-900 ${dotClass}`}>
        {active && <span className={`absolute inset-0 rounded-full ${dotClass} opacity-40 animate-ping`} />}
        <Icon className="relative h-3 w-3" />
      </span>
      <div className="min-w-0 pt-0.5">
        <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{title}</p>
        {time && <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{time}</p>}
      </div>
    </div>
  );
}

/**
 * Shared Orçamento Report base component.
 * Props:
 *   moduloNome   {string}  — ex: "Vendas PF"
 *   gradient     {string}  — Tailwind gradient classes for the header
 *   accentColor  {string}  — key into ACCENT map: "blue" | "sky" | "teal" | "violet"
 */
export default function ErpOrcamentoRelatorioBase({ moduloNome, modulo, gradient, accentColor = 'blue' }) {
  const { toast } = useToast();
  const ac = ACCENT[accentColor] || ACCENT.blue;

  const today = new Date();
  const firstDay = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
  const todayStr = today.toISOString().slice(0, 10);

  const [currentUser, setCurrentUser]     = useState(null);
  const [loadingUser, setLoadingUser]     = useState(true);
  const [orcamentos, setOrcamentos]       = useState([]);
  const [loading, setLoading]             = useState(false);
  const [filtersOpen, setFiltersOpen]     = useState(false);
  const [selectedItem, setSelectedItem]   = useState(null);
  const [lastUpdated, setLastUpdated]     = useState(null);
  const [vendedores, setVendedores]       = useState([]);
  const [canais, setCanais]               = useState([]);
  const [times, setTimes]                 = useState([]);
  const [exporting, setExporting]         = useState(null);
  const [hasSearched, setHasSearched]     = useState(false);

  const [filterDateStart, setFilterDateStart] = useState(firstDay);
  const [filterDateEnd,   setFilterDateEnd]   = useState(todayStr);
  const [filterSituacao,  setFilterSituacao]  = useState('todos');
  const [filterVendedor,  setFilterVendedor]  = useState('todos');
  const [filterCanal,     setFilterCanal]     = useState('todos');
  const [filterTime,      setFilterTime]      = useState('todos');

  // Filtros locais (client-side) aplicados sobre o resultado já carregado
  const [activeStatus,    setActiveStatus]    = useState(null); // código de situação ou null
  const [searchQuery,     setSearchQuery]     = useState('');

  const canaisMap = useMemo(() => {
    const m = {};
    canais.forEach(c => { m[c.id] = c.titulo_contrato || String(c.id); });
    return m;
  }, [canais]);

  const agentType      = (currentUser?.agent?.agentType || currentUser?.agentType || '').toLowerCase();
  const role           = (currentUser?.role || '').toLowerCase();
  const isAdmin        = agentType === 'admin' || role === 'admin';
  const isSupervisor   = !isAdmin && agentType.includes('supervisor');
  const showVendedor   = isAdmin || isSupervisor;

  // ─── initial load ────────────────────────────────────────────────────────
  useEffect(() => { fetchUser(); }, []);

  useEffect(() => {
    if (!currentUser) return;
    if (isAdmin) { fetchTimes(); fetchCanais(); }
    if (showVendedor) fetchVendedores('todos');
    fetchRelatorio();
  }, [currentUser]);

  // When admin changes the time filter, reload vendedores list scoped to that time
  useEffect(() => {
    if (isAdmin && currentUser) fetchVendedores(filterTime);
  }, [filterTime]);

  // ─── fetchers ────────────────────────────────────────────────────────────
  async function fetchUser() {
    try {
      const res = await fetch(`${API_BASE}/auth/me`, { headers: getAuthHeaders() });
      if (res.ok) setCurrentUser(await res.json());
    } catch {}
    setLoadingUser(false);
  }

  async function fetchTimes() {
    try {
      const res = await fetch(`${API_BASE}/teams`, { headers: getAuthHeaders() });
      if (res.ok) {
        const d = await res.json();
        setTimes(Array.isArray(d) ? d : (d.teams || []));
      }
    } catch {}
  }

  async function fetchCanais() {
    try {
      const res = await fetch(`${API_BASE}/erp/canais-venda`, { headers: getAuthHeaders() });
      if (res.ok) {
        const d = await res.json();
        setCanais(Array.isArray(d) ? d : []);
      }
    } catch {}
  }

  async function fetchVendedores(teamId = 'todos') {
    try {
      const params = new URLSearchParams();
      if (teamId && teamId !== 'todos') params.set('team_id', teamId);
      if (modulo) params.set('modulo', modulo);
      const res = await fetch(`${API_BASE}/erp/relatorio-orcamentos/vendedores?${params}`, { headers: getAuthHeaders() });
      if (res.ok) {
        const d = await res.json();
        setVendedores(d.vendedores || []);
        setFilterVendedor('todos'); // reset vendedor when time changes
      }
    } catch {}
  }

  async function fetchRelatorio() {
    setLoading(true);
    setHasSearched(true);
    try {
      const params = new URLSearchParams();
      if (filterDateStart)                    params.set('start_date',     filterDateStart);
      if (filterDateEnd)                      params.set('end_date',       filterDateEnd);
      if (filterSituacao  !== 'todos')        params.set('situacao',       filterSituacao);
      if (filterVendedor  !== 'todos')        params.set('vendedor_id', filterVendedor);
      if (filterCanal     !== 'todos')        params.set('canal_id',       filterCanal);
      if (filterTime      !== 'todos' && isAdmin) params.set('team_id',   filterTime);
      if (modulo)                             params.set('modulo',       modulo);

      const res = await fetch(`${API_BASE}/erp/relatorio-orcamentos?${params}`, { headers: getAuthHeaders() });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Erro ao buscar relatório');
      }
      const d = await res.json();
      setOrcamentos(d.items || []);
      setActiveStatus(null);
      setSearchQuery('');
      setLastUpdated(new Date());
    } catch (err) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  const kpis = useMemo(() => {
    const total      = orcamentos.length;
    const aprovados  = orcamentos.filter(o => o.situacao === 'A').length;
    const emitidos   = orcamentos.filter(o => o.situacao === 'I').length;
    const cancelados = orcamentos.filter(o => o.situacao === 'C').length;
    const valorTotal = orcamentos.filter(o => o.situacao === 'A').reduce((acc, o) => acc + Number(o.valor_total || 0), 0);
    return { total, aprovados, emitidos, cancelados, valorTotal };
  }, [orcamentos]);

  // Resultado visível: aplica filtro de status (clique no KPI) + busca rápida.
  const filteredOrcamentos = useMemo(() => {
    let list = orcamentos;
    if (activeStatus) list = list.filter(o => o.situacao === activeStatus);
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(o =>
        String(o.numero_orcamento || '').toLowerCase().includes(q) ||
        String(o.nome_titular || '').toLowerCase().includes(q) ||
        String(o.cpf_titular || '').toLowerCase().includes(q) ||
        String(o.nome_vendedor || o.login_vendedor || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [orcamentos, activeStatus, searchQuery]);

  // Receita do subconjunto visível (aprovados dentro do filtro local).
  const viewReceita = useMemo(
    () => filteredOrcamentos.filter(o => o.situacao === 'A').reduce((acc, o) => acc + Number(o.valor_total || 0), 0),
    [filteredOrcamentos]
  );

  // Distribuição por situação para o gráfico donut (sobre o resultado visível).
  const distribuicao = useMemo(() => {
    const counts = {};
    filteredOrcamentos.forEach(o => { const s = o.situacao || '?'; counts[s] = (counts[s] || 0) + 1; });
    return Object.entries(counts)
      .map(([code, value]) => ({
        code,
        name: SITUACOES[code]?.label || code,
        value,
        color: STATUS_COLORS[code] || '#94a3b8',
      }))
      .sort((a, b) => b.value - a.value);
  }, [filteredOrcamentos]);

  // Insights automáticos do período (sobre o conjunto carregado, sem filtro local).
  const insights = useMemo(() => {
    const t = orcamentos.length;
    if (!t) return [];
    const pct = (n) => Math.round((n / t) * 100);
    const arr = [];
    if (kpis.aprovados) {
      arr.push(`${kpis.aprovados} de ${t} ${t === 1 ? 'orçamento' : 'orçamentos'} aprovado${kpis.aprovados > 1 ? 's' : ''} (${pct(kpis.aprovados)}%).`);
    } else {
      arr.push('Nenhum orçamento foi aprovado no período.');
    }
    if (kpis.emitidos) arr.push(`${pct(kpis.emitidos)}% dos orçamentos estão em análise.`);
    arr.push(`Receita acumulada no período: ${formatCurrency(kpis.valorTotal)}.`);
    if (kpis.aprovados) arr.push(`Ticket médio dos aprovados: ${formatCurrency(kpis.valorTotal / kpis.aprovados)}.`);
    if (kpis.cancelados) {
      arr.push(`${kpis.cancelados} cancelamento${kpis.cancelados > 1 ? 's' : ''} (${pct(kpis.cancelados)}%).`);
    } else {
      arr.push('Não houve cancelamentos.');
    }
    return arr;
  }, [orcamentos, kpis]);

  function toggleStatus(code) {
    setActiveStatus(prev => (prev === code ? null : code));
  }

  function handleFilter(e) {
    e.preventDefault();
    fetchRelatorio();
  }

  function handleClear() {
    setFilterDateStart(firstDay);
    setFilterDateEnd(todayStr);
    setFilterSituacao('todos');
    setFilterVendedor('todos');
    setFilterCanal('todos');
    setFilterTime('todos');
    setActiveStatus(null);
    setSearchQuery('');
    setOrcamentos([]);
    setHasSearched(false);
  }

  // ─── export helpers ───────────────────────────────────────────────────────
  function getExportRows() {
    return orcamentos.map(o => ({
      'Nº Orçamento':     o.numero_orcamento || '-',
      'CPF Titular':      o.cpf_titular || '-',
      'Nome Titular':     o.nome_titular || '-',
      'Data Venda':       formatDateOnly(o.data_venda),
      'Situação':         SITUACOES[o.situacao]?.label || o.situacao || '-',
      'Vendedor':         o.nome_vendedor || o.login_vendedor || '-',
      'Canal de Vendas':  (o.canal_id ? canaisMap[o.canal_id] || String(o.canal_id) : '-'),
      'Valor Total (R$)': Number(o.valor_total || 0).toFixed(2),
      'Última Alteração': formatDateTime(o.data_ultima_alteracao),
    }));
  }

  async function handleExportExcel() {
    if (!orcamentos.length) { toast({ title: 'Aviso', description: 'Nenhum dado para exportar.', variant: 'destructive' }); return; }
    setExporting('excel');
    try {
      const XLSX = await import('xlsx');
      const ws = XLSX.utils.json_to_sheet(getExportRows());
      ws['!cols'] = [{ wch: 14 }, { wch: 18 }, { wch: 30 }, { wch: 14 }, { wch: 14 }, { wch: 25 }, { wch: 30 }, { wch: 16 }, { wch: 20 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Orçamentos');
      XLSX.writeFile(wb, `Orcamentos_${moduloNome.replace(/\s/g, '_')}_${formatDateForFile()}.xlsx`);
      toast({ title: 'Sucesso', description: 'Exportado em Excel.' });
    } catch (err) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally { setExporting(null); }
  }

  async function handleExportPDF() {
    if (!orcamentos.length) { toast({ title: 'Aviso', description: 'Nenhum dado para exportar.', variant: 'destructive' }); return; }
    setExporting('pdf');
    try {
      const jsPDFModule    = await import('jspdf');
      const jsPDF          = jsPDFModule.jsPDF || jsPDFModule.default?.jsPDF || jsPDFModule.default;
      const autoTableMod   = await import('jspdf-autotable');
      const autoTable      = autoTableMod.default || autoTableMod.applyPlugin || autoTableMod;

      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      doc.setFontSize(16); doc.setFont('helvetica', 'bold');
      doc.text(`Relatório de Orçamentos — ${moduloNome}`, 14, 18);
      doc.setFontSize(9); doc.setFont('helvetica', 'normal');
      doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 25);
      doc.text(`Total: ${orcamentos.length} | Aprovados: ${kpis.aprovados} | Receita: ${formatCurrency(kpis.valorTotal)}`, 14, 30);

      const fn = typeof doc.autoTable === 'function' ? doc.autoTable.bind(doc) : (o) => autoTable(doc, o);
      fn({
        head: [['Nº Orçamento', 'CPF Titular', 'Nome Titular', 'Data Venda', 'Situação', 'Vendedor', 'Canal']],
        body: orcamentos.map(o => [
          String(o.numero_orcamento || '-'),
          o.cpf_titular || '-',
          o.nome_titular || '-',
          formatDateOnly(o.data_venda),
          SITUACOES[o.situacao]?.label || o.situacao || '-',
          o.nome_vendedor || o.login_vendedor || '-',
          (o.canal_id ? canaisMap[o.canal_id] || String(o.canal_id) : '-'),
        ]),
        startY: 35,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold', fontSize: 8 },
        alternateRowStyles: { fillColor: [239, 246, 255] },
        margin: { left: 14, right: 14 },
        didDrawPage: (d) => {
          const pg = doc.internal.getNumberOfPages();
          doc.setFontSize(8);
          doc.text(`Página ${d.pageNumber} de ${pg}`, doc.internal.pageSize.getWidth() - 30, doc.internal.pageSize.getHeight() - 8);
        },
      });

      doc.save(`Orcamentos_${moduloNome.replace(/\s/g, '_')}_${formatDateForFile()}.pdf`);
      toast({ title: 'Sucesso', description: 'Exportado em PDF.' });
    } catch (err) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally { setExporting(null); }
  }

  // ─── render ───────────────────────────────────────────────────────────────
  if (loadingUser) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-950">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  const periodoLabel = `${fmtBR(filterDateStart)} até ${fmtBR(filterDateEnd)}`;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-950">

      {/* ── Cabeçalho inteligente ─────────────────────────────────── */}
      <div className={`bg-gradient-to-br ${gradient} px-4 md:px-8 pt-6 pb-6`}>
        <div className="max-w-7xl mx-auto flex items-center gap-3.5">
          <div className="p-2.5 rounded-xl bg-white/15 ring-1 ring-white/20 shrink-0">
            <Receipt className="w-6 h-6 text-white" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl md:text-2xl font-bold text-white leading-tight">
                Relatório de Orçamentos
              </h1>
              <span className="px-2 py-0.5 rounded-md bg-white/15 text-white text-xs font-semibold">
                {moduloNome}
              </span>
            </div>
            <p className="text-white/75 text-xs md:text-sm mt-1 flex items-center gap-x-2 gap-y-0.5 flex-wrap">
              {hasSearched && !loading && (
                <span className="font-medium">
                  {orcamentos.length} {orcamentos.length === 1 ? 'registro encontrado' : 'registros encontrados'}
                </span>
              )}
              {hasSearched && !loading && <span className="text-white/40">•</span>}
              <span>Período {periodoLabel}</span>
              {lastUpdated && <span className="text-white/40">•</span>}
              {lastUpdated && (
                <span className="inline-flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Atualizado {timeAgo(lastUpdated)}
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">

        {/* ── Indicadores (KPIs) — clicáveis p/ filtrar tabela + gráfico ── */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
          <KpiCard icon={Hash}         label="Total"      value={kpis.total}      tone="slate"
            clickable active={activeStatus === null} onClick={() => setActiveStatus(null)} />
          <KpiCard icon={CheckCircle2} label="Aprovados"  value={kpis.aprovados}  tone="emerald"
            clickable active={activeStatus === 'A'} onClick={() => toggleStatus('A')} />
          <KpiCard icon={FileText}     label="Em Análise" value={kpis.emitidos}   tone="blue"
            clickable active={activeStatus === 'I'} onClick={() => toggleStatus('I')} />
          <KpiCard icon={XCircle}      label="Cancelados" value={kpis.cancelados} tone="red"
            clickable active={activeStatus === 'C'} onClick={() => toggleStatus('C')} />
          <KpiCard icon={TrendingUp}   label="Receita"    value={formatCurrency(kpis.valorTotal)} tone={accentColor} />
        </div>

        {/* ── Resumo visual (donut) + Insights ─────────────────────── */}
        {!loading && orcamentos.length > 0 && (
          <div className="grid lg:grid-cols-3 gap-5">
            {/* Donut + resumo textual */}
            <Card className="border-0 shadow-sm rounded-2xl lg:col-span-2">
              <CardHeader className="pb-1 pt-4">
                <CardTitle className="text-sm font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-2">
                  Distribuição por Situação
                  {activeStatus && (
                    <Badge variant="outline" className="text-[10px] font-normal text-gray-500 border-gray-200">
                      filtrado: {SITUACOES[activeStatus]?.label || activeStatus}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-1 pb-4">
                <div className="grid sm:grid-cols-2 gap-4 items-center">
                  <div className="relative h-[230px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={distribuicao}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={64}
                          outerRadius={96}
                          paddingAngle={2}
                          stroke="none"
                          isAnimationActive
                          animationDuration={450}
                        >
                          {distribuicao.map(d => <Cell key={d.code} fill={d.color} />)}
                        </Pie>
                        <RTooltip formatter={(v, n) => [`${v} orçamento${v === 1 ? '' : 's'}`, n]} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-3xl font-bold text-gray-900 dark:text-gray-100">{filteredOrcamentos.length}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">orçamentos</span>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {/* Resumo textual (Total + Receita) */}
                    <div className="flex gap-6 pb-3 border-b border-gray-100 dark:border-gray-800">
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-gray-400">Total</p>
                        <p className="text-lg font-bold text-gray-900 dark:text-gray-100 tabular-nums">{filteredOrcamentos.length}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-gray-400">Receita</p>
                        <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">{formatCurrency(viewReceita)}</p>
                      </div>
                    </div>
                    {/* % por status */}
                    <div className="space-y-2.5">
                      {distribuicao.map(d => (
                        <div key={d.code} className="flex items-center justify-between text-sm">
                          <span className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                            {d.name}
                          </span>
                          <span className="font-semibold tabular-nums text-gray-800 dark:text-gray-100">
                            {d.value}
                            <span className="ml-1 text-gray-400 font-normal">
                              ({filteredOrcamentos.length ? Math.round((d.value / filteredOrcamentos.length) * 100) : 0}%)
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Insights automáticos */}
            <Card className="border-0 shadow-sm rounded-2xl">
              <CardHeader className="pb-1 pt-4">
                <CardTitle className="text-sm font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-2">
                  <TrendingUp className={`w-4 h-4 ${ac.filterIcon}`} /> Insights do Período
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-2 pb-4">
                <ul className="space-y-2.5">
                  {insights.map((txt, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
                      <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${ac.filterIcon} bg-current`} />
                      <span>{txt}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Filtros ──────────────────────────────────────────────── */}
        <Card className="border-0 shadow-sm rounded-2xl">
          <CardContent className="pt-5 pb-5">
            <form onSubmit={handleFilter} className="space-y-4">

              {/* Filtros principais — sempre visíveis */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                    <Calendar className={`w-3.5 h-3.5 ${ac.iconField}`} /> Data Início
                  </Label>
                  <Input type="date" value={filterDateStart} onChange={e => setFilterDateStart(e.target.value)} />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                    <Calendar className={`w-3.5 h-3.5 ${ac.iconField}`} /> Data Fim
                  </Label>
                  <Input type="date" value={filterDateEnd} onChange={e => setFilterDateEnd(e.target.value)} />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                    <Tag className={`w-3.5 h-3.5 ${ac.iconField}`} /> Situação
                  </Label>
                  <Select value={filterSituacao} onValueChange={setFilterSituacao}>
                    <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todas</SelectItem>
                      {Object.entries(SITUACOES).map(([code, { label }]) => (
                        <SelectItem key={code} value={code}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Toggle dos filtros avançados */}
                {(isAdmin || showVendedor) && (
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => setFiltersOpen(v => !v)}
                      className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:opacity-80 transition-opacity"
                    >
                      <span className={`p-1.5 rounded-lg ${ac.filterBg}`}>
                        <Filter className={`w-3.5 h-3.5 ${ac.filterIcon}`} />
                      </span>
                      Filtros avançados
                      {filtersOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                )}
              </div>

              {/* Filtros avançados — recolhidos por padrão */}
              {filtersOpen && (isAdmin || showVendedor) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                  {/* Time — admin only */}
                  {isAdmin && times.length > 0 && (
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                        <Users className={`w-3.5 h-3.5 ${ac.iconField}`} /> Time
                      </Label>
                      <Select value={filterTime} onValueChange={setFilterTime}>
                        <SelectTrigger><SelectValue placeholder="Todos os times" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todos">Todos os times</SelectItem>
                          {times.map(t => (
                            <SelectItem key={t.id} value={String(t.id)}>
                              {t.name || String(t.id)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Vendedor — supervisor + admin */}
                  {showVendedor && vendedores.length > 0 && (
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                        <User className={`w-3.5 h-3.5 ${ac.iconField}`} /> Vendedor
                      </Label>
                      <Select value={filterVendedor} onValueChange={setFilterVendedor}>
                        <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todos">Todos os vendedores</SelectItem>
                          {vendedores.map(v => (
                            <SelectItem key={v.id} value={v.id}>
                              {v.nome || v.id}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Canal de Vendas — admin only */}
                  {isAdmin && canais.length > 0 && (
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                        <Store className={`w-3.5 h-3.5 ${ac.iconField}`} /> Canal de Vendas
                      </Label>
                      <Select value={filterCanal} onValueChange={setFilterCanal}>
                        <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todos">Todos os canais</SelectItem>
                          {canais.map(c => (
                            <SelectItem key={c.id} value={String(c.id)}>
                              {c.titulo_contrato || String(c.id)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-3 flex-wrap pt-1">
                <Button type="submit" disabled={loading}
                  className={`text-white shadow-sm transition-transform hover:scale-[1.02] active:scale-95 ${ac.btn}`}>
                  {loading
                    ? <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    : <Search className="w-4 h-4 mr-2" />}
                  Buscar
                </Button>
                <Button type="button" variant="outline" onClick={handleClear} disabled={loading}
                  className="transition-transform hover:scale-[1.02] active:scale-95">
                  Limpar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* ── Loading ───────────────────────────────────────────────── */}
        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
              <p className="text-sm text-gray-500 dark:text-gray-400">Buscando orçamentos no ERP…</p>
            </div>
          </div>
        )}

        {/* ── Results table ─────────────────────────────────────────── */}
        {!loading && orcamentos.length > 0 && (
          <Card className="border-0 shadow-sm rounded-2xl overflow-hidden">
            <CardHeader className="pb-3 pt-4 border-b border-gray-100 dark:border-gray-800 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <span>Resultados</span>
                  <Badge className={ac.badge}>
                    {(activeStatus || searchQuery.trim())
                      ? `${filteredOrcamentos.length} de ${orcamentos.length}`
                      : `${orcamentos.length} registro${orcamentos.length !== 1 ? 's' : ''}`}
                  </Badge>
                </CardTitle>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleExportExcel} disabled={!!exporting}
                    className="text-emerald-700 border-emerald-300 hover:bg-emerald-50 dark:text-emerald-400 dark:border-emerald-700 dark:hover:bg-emerald-900/20 transition-colors">
                    {exporting === 'excel' ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <FileSpreadsheet className="w-4 h-4 mr-1.5" />}
                    Excel
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleExportPDF} disabled={!!exporting}
                    className="text-red-700 border-red-300 hover:bg-red-50 dark:text-red-400 dark:border-red-700 dark:hover:bg-red-900/20 transition-colors">
                    {exporting === 'pdf' ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <FileText className="w-4 h-4 mr-1.5" />}
                    PDF
                  </Button>
                </div>
              </div>
              {/* Busca rápida em tempo real */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <Input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Buscar por Nº, cliente, CPF ou vendedor…"
                  className="pl-9 h-9"
                />
              </div>
            </CardHeader>

            <div className="overflow-auto max-h-[640px]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-gray-50/95 dark:bg-gray-800/95 backdrop-blur text-left border-b border-gray-200 dark:border-gray-700">
                    <th className="px-5 py-3.5 font-semibold text-gray-500 dark:text-gray-300 text-xs uppercase tracking-wide whitespace-nowrap">Nº Orçamento</th>
                    <th className="px-5 py-3.5 font-semibold text-gray-500 dark:text-gray-300 text-xs uppercase tracking-wide whitespace-nowrap">Cliente</th>
                    {showVendedor && (
                      <th className="px-5 py-3.5 font-semibold text-gray-500 dark:text-gray-300 text-xs uppercase tracking-wide whitespace-nowrap">Vendedor</th>
                    )}
                    <th className="px-5 py-3.5 font-semibold text-gray-500 dark:text-gray-300 text-xs uppercase tracking-wide whitespace-nowrap">Status</th>
                    <th className="px-5 py-3.5 font-semibold text-gray-500 dark:text-gray-300 text-xs uppercase tracking-wide whitespace-nowrap">Data</th>
                    <th className="px-5 py-3.5 font-semibold text-gray-500 dark:text-gray-300 text-xs uppercase tracking-wide whitespace-nowrap text-right">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {filteredOrcamentos.length === 0 && (
                    <tr>
                      <td colSpan={showVendedor ? 6 : 5} className="px-5 py-12 text-center text-sm text-gray-500 dark:text-gray-400">
                        Nenhum resultado para os filtros aplicados.
                      </td>
                    </tr>
                  )}
                  {filteredOrcamentos.map((o, idx) => (
                    <tr
                      key={o.erp_id || idx}
                      onClick={() => setSelectedItem(o)}
                      className={`cursor-pointer transition-colors duration-150 group ${ac.rowHover}`}
                    >
                      <td className="px-5 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 font-mono font-bold text-sm transition-colors ${ac.numColor}`}>
                          <Hash className="w-3.5 h-3.5 opacity-60" />
                          {o.numero_orcamento || '-'}
                        </span>
                      </td>
                      <td className="px-5 py-4 max-w-[280px]">
                        <span
                          className="block truncate font-medium text-gray-800 dark:text-gray-100"
                          title={o.cpf_titular ? `CPF: ${o.cpf_titular}` : (o.nome_titular || '')}
                        >
                          {o.nome_titular || '-'}
                        </span>
                      </td>
                      {showVendedor && (
                        <td className="px-5 py-4 whitespace-nowrap text-xs text-gray-600 dark:text-gray-300">
                          {o.nome_vendedor || o.login_vendedor || '-'}
                        </td>
                      )}
                      <td className="px-5 py-4 whitespace-nowrap">
                        <SituacaoBadge situacao={o.situacao} />
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                        {formatDateOnly(o.data_venda)}
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap text-right font-semibold">
                        {Number(o.valor_total) > 0
                          ? <span className={o.situacao === 'A' ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-700 dark:text-gray-200'}>{formatCurrency(o.valor_total)}</span>
                          : <span className="text-gray-400">-</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* ── Empty state ───────────────────────────────────────────── */}
        {!loading && hasSearched && orcamentos.length === 0 && (
          <Card className="border-0 shadow-sm rounded-2xl">
            <CardContent className="py-20 text-center">
              <div className={`mx-auto w-16 h-16 rounded-full ${ac.filterBg} flex items-center justify-center mb-4`}>
                <Receipt className={`w-8 h-8 ${ac.filterIcon} opacity-60`} />
              </div>
              <p className="text-gray-700 dark:text-gray-300 font-medium mb-1">Nenhum orçamento encontrado</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Ajuste os filtros ou amplie o período de busca.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ── Detail Modal (premium SaaS detail view) ──────────────────── */}
      <Dialog open={!!selectedItem} onOpenChange={() => setSelectedItem(null)}>
        <DialogPortal>
          <DialogOverlay className="bg-black/40 backdrop-blur-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className="fixed left-[50%] top-[50%] z-50 w-[calc(100%-2rem)] max-w-lg translate-x-[-50%] translate-y-[-50%] overflow-hidden rounded-3xl border border-white/40 dark:border-gray-700/60 bg-white dark:bg-gray-900 shadow-2xl shadow-black/20 duration-300 focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-bottom-3 data-[state=open]:slide-in-from-bottom-3"
          >
            <DialogTitle className="sr-only">Detalhes do Orçamento</DialogTitle>

            {selectedItem && (() => {
              const th = STATUS_THEME[selectedItem.situacao] || STATUS_THEME.I;
              const sit = SITUACOES[selectedItem.situacao] || { label: selectedItem.situacao || '-' };
              const approved = selectedItem.situacao === 'A';
              const temValor = Number(selectedItem.valor_total) > 0;
              const canal = selectedItem.canal_id ? canaisMap[selectedItem.canal_id] : null;
              const updatedDate = selectedItem.data_ultima_alteracao ? new Date(selectedItem.data_ultima_alteracao) : null;
              const updatedAgo = updatedDate && !isNaN(updatedDate.getTime()) ? timeAgo(updatedDate) : null;
              return (
                <div className="flex max-h-[88vh] flex-col">
                  {/* Header dessaturado + status visual + resumo contextual */}
                  <div className={`relative shrink-0 overflow-hidden bg-gradient-to-br ${th.grad} px-6 pt-7 pb-16`}>
                    <div className="pointer-events-none absolute inset-0 opacity-[0.12] bg-[radial-gradient(circle_at_top_right,white,transparent_60%)]" />
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent" />
                    <div className={`pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full ${th.glow} blur-3xl`} />
                    {/* Fade suave na base do header → transição elegante para o card flutuante */}
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-b from-transparent to-black/15" />
                    <DialogClose className="absolute right-4 top-4 z-10 rounded-full bg-white/10 p-1.5 text-white/80 ring-1 ring-white/15 backdrop-blur-md transition hover:bg-white/25 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/50">
                      <X className="h-4 w-4" />
                      <span className="sr-only">Fechar</span>
                    </DialogClose>

                    <div className="relative flex items-start gap-3">
                      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25 backdrop-blur-md">
                        <Receipt className="h-5 w-5 text-white" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/60">Orçamento</p>
                        <h2 className="truncate text-2xl font-bold tracking-tight text-white">#{selectedItem.numero_orcamento || '-'}</h2>
                      </div>
                    </div>

                    <div className="relative mt-4 flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white ring-1 ring-white/20 backdrop-blur-md">
                        <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" /> {sit.label}
                      </span>
                      {canal && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/90 backdrop-blur-md">
                          <Store className="h-3 w-3" /> {canal}
                        </span>
                      )}
                    </div>

                    {/* Resumo contextual: criado + última atualização */}
                    <p className="relative mt-3 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-medium text-white/60">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="h-3 w-3" /> Criado em {formatDateOnly(selectedItem.data_venda)}
                      </span>
                      {updatedAgo && (
                        <>
                          <span className="text-white/30">•</span>
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" /> Atualizado {updatedAgo}
                          </span>
                        </>
                      )}
                    </p>
                  </div>

                  {/* Corpo rolável */}
                  <div className="flex-1 space-y-4 overflow-y-auto bg-gradient-to-b from-gray-50/80 to-gray-100/40 px-6 pb-6 dark:from-gray-900 dark:to-gray-900">
                    {/* Valor em destaque (sobreposto ao header) com accent dinâmico de status */}
                    <div
                      className={`relative -mt-14 overflow-hidden rounded-3xl border border-gray-200/70 bg-white/90 px-6 py-6 shadow-2xl shadow-black/10 ring-1 ${th.ring} backdrop-blur-2xl dark:border-gray-700/50 dark:bg-gray-800/85 animate-in fade-in slide-in-from-bottom-3 duration-300`}
                      style={{ animationFillMode: 'both', animationDelay: '80ms' }}
                    >
                      {/* Carteira como marca d'água decorativa — não compete com o valor */}
                      <Wallet
                        className={`pointer-events-none absolute -bottom-5 -right-4 h-28 w-28 opacity-[0.06] ${approved ? 'text-emerald-500 dark:text-emerald-400' : th.accentText}`}
                        strokeWidth={1.25}
                      />

                      <div className="relative flex items-center gap-2">
                        <span className={`h-1.5 w-1.5 rounded-full ${approved ? 'bg-emerald-500' : th.dot}`} />
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500">Valor Total</p>
                        {approved && (
                          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300">
                            <BadgeCheck className="h-3 w-3" /> Aprovado
                          </span>
                        )}
                      </div>

                      <p className={`relative mt-2 truncate text-[2.75rem] font-black leading-none tracking-tight ${approved ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-900 dark:text-white'}`}>
                        {temValor ? formatCurrency(selectedItem.valor_total) : '—'}
                      </p>

                      {!approved && (
                        <p className="relative mt-3 flex items-center gap-1.5 text-[11px] text-gray-400 dark:text-gray-500">
                          <Sparkles className="h-3 w-3 shrink-0" /> Orçamento não aprovado — valor sujeito a alteração.
                        </p>
                      )}
                    </div>

                    {/* Cards de informação (CPF de-emphasizado como subtítulo do titular) */}
                    <div className="grid grid-cols-2 gap-3">
                      <InfoCard
                        icon={User}
                        label="Titular"
                        value={selectedItem.nome_titular || '-'}
                        sub={selectedItem.cpf_titular ? `CPF ${selectedItem.cpf_titular}` : null}
                        subMono
                        delay={60}
                        className="col-span-2"
                      />
                      <InfoCard
                        icon={Users}
                        label="Vendedor"
                        value={selectedItem.nome_vendedor || selectedItem.login_vendedor || '-'}
                        delay={110}
                        className={canal ? '' : 'col-span-2'}
                      />
                      {canal && (
                        <InfoCard icon={Store} label="Canal de Vendas" value={canal} delay={160} />
                      )}
                    </div>

                    {/* Timeline / Histórico */}
                    <div className="rounded-2xl border border-gray-200/60 bg-white/70 p-4 shadow-sm ring-1 ring-black/[0.02] backdrop-blur-md dark:border-gray-700/50 dark:bg-gray-800/40">
                      <p className="mb-4 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                        <History className="h-3.5 w-3.5" /> Histórico
                      </p>
                      <TimelineNode icon={Calendar} title="Orçamento registrado" time={formatDateOnly(selectedItem.data_venda)} dotClass={th.dot} delay={120} />
                      <TimelineNode icon={Clock} title="Última alteração" time={formatDateTime(selectedItem.data_ultima_alteracao)} dotClass="bg-gray-400 dark:bg-gray-600" delay={190} />
                      <TimelineNode icon={BadgeCheck} title={`Situação atual • ${sit.label}`} dotClass={th.dot} active last delay={260} />
                    </div>
                  </div>
                </div>
              );
            })()}
          </DialogPrimitive.Content>
        </DialogPortal>
      </Dialog>
    </div>
  );
}
