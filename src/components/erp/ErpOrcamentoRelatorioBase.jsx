import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import {
  FileBarChart, Search, Filter, Loader2,
  Calendar, ChevronDown, ChevronUp, FileSpreadsheet, FileText,
  User, Hash, CreditCard, Clock, Tag, Store, TrendingUp,
  CheckCircle2, XCircle, RefreshCw, Receipt, Users
} from "lucide-react";

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

function formatDateForFile() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

const SITUACOES = {
  'I': { label: 'Finalizado',   color: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700' },
  'M': { label: 'Em Montagem', color: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700' },
  'C': { label: 'Cancelado',   color: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700' },
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

function KpiCard({ icon: Icon, label, value, kpiBg }) {
  return (
    <div className={`rounded-2xl border p-4 bg-gradient-to-br backdrop-blur-sm ${kpiBg}`}>
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-white/10">
          <Icon className="w-5 h-5 text-white/80" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-white/70 font-medium truncate">{label}</p>
          <p className="text-xl font-bold text-white truncate">{value}</p>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ icon: Icon, label, value, mono = false, highlight = false, span2 = false }) {
  return (
    <div className={span2 ? 'col-span-2' : ''}>
      <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5 mb-0.5">
        <Icon className="w-3.5 h-3.5 shrink-0" />{label}
      </p>
      <p className={`text-sm font-medium text-gray-800 dark:text-gray-100 ${mono ? 'font-mono' : ''} ${highlight ? 'font-bold' : ''}`}>
        {value}
      </p>
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
  const [filtersOpen, setFiltersOpen]     = useState(true);
  const [selectedItem, setSelectedItem]   = useState(null);
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
      if (filterVendedor  !== 'todos')        params.set('vendedor_login', filterVendedor);
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
    } catch (err) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  const kpis = useMemo(() => {
    const total      = orcamentos.length;
    const finalizados = orcamentos.filter(o => o.situacao === 'I').length;
    const montagem   = orcamentos.filter(o => o.situacao === 'M').length;
    const cancelados = orcamentos.filter(o => o.situacao === 'C').length;
    const valorTotal = orcamentos.filter(o => o.situacao === 'I').reduce((acc, o) => acc + Number(o.valor_total || 0), 0);
    return { total, finalizados, montagem, cancelados, valorTotal };
  }, [orcamentos]);

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
      doc.text(`Total: ${orcamentos.length} | Finalizados: ${kpis.finalizados} | Receita: ${formatCurrency(kpis.valorTotal)}`, 14, 30);

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

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">

      {/* ── Hero Header ──────────────────────────────────────────── */}
      <div className={`bg-gradient-to-br ${gradient} px-4 md:px-8 pt-8 pb-6`}>
        <div className="max-w-7xl mx-auto">
          <div className="flex items-start gap-4 mb-7">
            <div className="p-3 rounded-2xl bg-white/15 shadow-lg ring-1 ring-white/20 shrink-0">
              <Receipt className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-white leading-tight">
                Relatório de Orçamentos
              </h1>
              <p className="text-white/70 text-sm mt-1 font-medium">{moduloNome}</p>
              <p className="text-white/50 text-xs mt-0.5">
                {isAdmin ? 'Visão completa — todos os vendedores e canais' :
                 isSupervisor ? 'Visão da equipe — seus vendedores' :
                 'Seus orçamentos no ERP'}
              </p>
            </div>
          </div>

          {/* KPI strip */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <KpiCard icon={Hash}         label="Total"           value={kpis.total}                      kpiBg="from-white/10 to-white/5 border-white/20" />
            <KpiCard icon={CheckCircle2} label="Finalizados"     value={kpis.finalizados}                kpiBg="from-emerald-500/30 to-emerald-600/20 border-emerald-400/30" />
            <KpiCard icon={RefreshCw}    label="Em Montagem"     value={kpis.montagem}                   kpiBg="from-amber-500/30 to-amber-600/20 border-amber-400/30" />
            <KpiCard icon={XCircle}      label="Cancelados"      value={kpis.cancelados}                 kpiBg="from-red-500/30 to-red-600/20 border-red-400/30" />
            <KpiCard icon={TrendingUp}   label="Receita (Final)" value={formatCurrency(kpis.valorTotal)} kpiBg="from-white/15 to-white/5 border-white/25" />
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-5">

        {/* ── Filters ──────────────────────────────────────────────── */}
        <Card className="border-0 shadow-md dark:shadow-gray-900/30">
          <CardHeader className="pb-2 pt-4">
            <button
              type="button"
              onClick={() => setFiltersOpen(v => !v)}
              className="flex items-center gap-2.5 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:opacity-80 transition-opacity w-fit"
            >
              <span className={`p-1.5 rounded-lg ${ac.filterBg}`}>
                <Filter className={`w-3.5 h-3.5 ${ac.filterIcon}`} />
              </span>
              Filtros Avançados
              {filtersOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </CardHeader>

          {filtersOpen && (
            <CardContent className="pt-3">
              <form onSubmit={handleFilter}>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-5">

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
                        <SelectItem value="I">Finalizado</SelectItem>
                        <SelectItem value="M">Em Montagem</SelectItem>
                        <SelectItem value="C">Cancelado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

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
                            <SelectItem key={v.login} value={v.login}>
                              {v.nome || v.login}
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

                <div className="flex gap-3 flex-wrap">
                  <Button type="submit" disabled={loading} className={`text-white shadow-sm ${ac.btn}`}>
                    {loading
                      ? <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      : <Search className="w-4 h-4 mr-2" />}
                    Buscar
                  </Button>
                  <Button type="button" variant="outline" onClick={handleClear} disabled={loading}>
                    Limpar
                  </Button>
                </div>
              </form>
            </CardContent>
          )}
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
          <Card className="border-0 shadow-md dark:shadow-gray-900/30 overflow-hidden">
            <CardHeader className="pb-3 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <span>Resultados</span>
                  <Badge className={ac.badge}>
                    {orcamentos.length} registro{orcamentos.length !== 1 ? 's' : ''}
                  </Badge>
                </CardTitle>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleExportExcel} disabled={!!exporting}
                    className="text-emerald-700 border-emerald-300 hover:bg-emerald-50 dark:text-emerald-400 dark:border-emerald-700 dark:hover:bg-emerald-900/20">
                    {exporting === 'excel' ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <FileSpreadsheet className="w-4 h-4 mr-1.5" />}
                    Excel
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleExportPDF} disabled={!!exporting}
                    className="text-red-700 border-red-300 hover:bg-red-50 dark:text-red-400 dark:border-red-700 dark:hover:bg-red-900/20">
                    {exporting === 'pdf' ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <FileText className="w-4 h-4 mr-1.5" />}
                    PDF
                  </Button>
                </div>
              </div>
            </CardHeader>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800/60 text-left border-b border-gray-100 dark:border-gray-800">
                    <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-300 whitespace-nowrap">Nº Orçamento</th>
                    <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-300 whitespace-nowrap">CPF Titular</th>
                    <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-300 whitespace-nowrap">Nome Titular</th>
                    <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-300 whitespace-nowrap">Data Venda</th>
                    <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-300 whitespace-nowrap">Situação</th>
                    {showVendedor && (
                      <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-300 whitespace-nowrap">Vendedor</th>
                    )}
                    <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-300 whitespace-nowrap">Canal</th>
                    <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-300 whitespace-nowrap text-right">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {orcamentos.map((o, idx) => (
                    <tr
                      key={o.erp_id || idx}
                      onClick={() => setSelectedItem(o)}
                      className={`cursor-pointer transition-colors group ${ac.rowHover}`}
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 font-mono font-bold text-sm transition-colors ${ac.numColor}`}>
                          <Hash className="w-3.5 h-3.5 opacity-60" />
                          {o.numero_orcamento || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-mono text-xs text-gray-500 dark:text-gray-400">
                        {o.cpf_titular || '-'}
                      </td>
                      <td className="px-4 py-3 max-w-[200px]">
                        <span className="block truncate text-gray-800 dark:text-gray-200 font-medium" title={o.nome_titular}>
                          {o.nome_titular || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                        {formatDateOnly(o.data_venda)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <SituacaoBadge situacao={o.situacao} />
                      </td>
                      {showVendedor && (
                        <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-600 dark:text-gray-300">
                          {o.nome_vendedor || o.login_vendedor || '-'}
                        </td>
                      )}
                      <td className="px-4 py-3 max-w-[160px]">
                        <span className="block truncate text-xs text-gray-500 dark:text-gray-400" title={o.canal_id ? canaisMap[o.canal_id] : ''}>
                          {o.canal_id ? (canaisMap[o.canal_id] || String(o.canal_id)) : '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right font-semibold">
                        {o.situacao === 'I'
                          ? <span className="text-emerald-700 dark:text-emerald-400">{formatCurrency(o.valor_total)}</span>
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
          <Card className="border-0 shadow-md">
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

      {/* ── Detail Modal ──────────────────────────────────────────── */}
      <Dialog open={!!selectedItem} onOpenChange={() => setSelectedItem(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5">
              <span className={`p-1.5 rounded-lg ${ac.modalIcon}`}>
                <Receipt className={`w-4 h-4 ${ac.modalIconColor}`} />
              </span>
              Orçamento #{selectedItem?.numero_orcamento || '-'}
            </DialogTitle>
          </DialogHeader>

          {selectedItem && (
            <div className="space-y-5">
              <div className="flex items-center gap-2 flex-wrap">
                <SituacaoBadge situacao={selectedItem.situacao} />
                {selectedItem.canal_id && canaisMap[selectedItem.canal_id] && (
                  <Badge variant="outline" className="text-gray-600 border-gray-200 bg-gray-50 dark:text-gray-300 dark:border-gray-700 dark:bg-gray-800 text-xs">
                    <Store className="w-3 h-3 mr-1" />{canaisMap[selectedItem.canal_id]}
                  </Badge>
                )}
              </div>

              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <DetailRow icon={Hash}       label="Nº Orçamento"    value={`#${selectedItem.numero_orcamento || '-'}`} highlight />
                <DetailRow icon={CreditCard} label="CPF Titular"     value={selectedItem.cpf_titular || '-'} mono />
                <DetailRow icon={User}       label="Nome Titular"    value={selectedItem.nome_titular || '-'} span2 />
                <DetailRow icon={Calendar}   label="Data da Venda"   value={formatDateOnly(selectedItem.data_venda)} />
                <DetailRow icon={Clock}      label="Última Alteração" value={formatDateTime(selectedItem.data_ultima_alteracao)} />
                <DetailRow icon={User}       label="Vendedor"        value={selectedItem.nome_vendedor || selectedItem.login_vendedor || '-'} />
                <DetailRow icon={TrendingUp} label="Valor Total"     value={formatCurrency(selectedItem.valor_total)} />
                {selectedItem.canal_id && canaisMap[selectedItem.canal_id] && (
                  <DetailRow icon={Store}    label="Canal de Vendas" value={canaisMap[selectedItem.canal_id]} span2 />
                )}
              </div>

              {selectedItem.situacao !== 'I' && (
                <p className="text-xs text-gray-400 dark:text-gray-500 italic">
                  * Orçamento não finalizado — valor sujeito a alteração.
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
