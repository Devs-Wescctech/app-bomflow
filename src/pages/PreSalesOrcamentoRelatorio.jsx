import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import {
  FileBarChart, Search, RefreshCw, Filter, Calendar, ShieldCheck,
  Users, Layers, CheckCircle2, Loader2,
} from "lucide-react";

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

// DE > PARA das situações do ERP (código cru -> rótulo + cor de badge).
const SITUACOES = {
  'I': { label: 'Emitido / Análise',   color: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700' },
  'A': { label: 'Aprovado',            color: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700' },
  'C': { label: 'Cancelado',           color: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700' },
  'P': { label: 'Pendente / Proposta', color: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700' },
  'R': { label: 'Perdido',             color: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800/50 dark:text-slate-300 dark:border-slate-600' },
  'M': { label: 'Em manutenção',       color: 'bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-700' },
};

// Cores por módulo de origem (badge discreto na tabela).
const MODULO_BADGE = {
  sales:        'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
  sales_pj:     'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-900/30 dark:text-sky-300 dark:border-sky-800',
  sales_upsell: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:border-violet-800',
  referral:     'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800',
};

function SituacaoBadge({ situacao }) {
  const s = SITUACOES[situacao] || { label: situacao || '-', color: 'bg-gray-100 text-gray-700 border-gray-300' };
  return <Badge variant="outline" className={`${s.color} font-medium`}>{s.label}</Badge>;
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
  const [search, setSearch] = useState('');

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
      if (!res.ok) throw new Error('Falha ao carregar o relatório.');
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

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter(o => {
      const cpf = String(o.cpf_titular || '').replace(/\D/g, '');
      return (
        String(o.numero_orcamento || '').toLowerCase().includes(term) ||
        String(o.nome_titular || '').toLowerCase().includes(term) ||
        String(o.nome_vendedor || '').toLowerCase().includes(term) ||
        cpf.includes(term.replace(/\D/g, ''))
      );
    });
  }, [items, search]);

  const stats = useMemo(() => {
    const total = filtered.length;
    const aprovados = filtered.filter(o => o.situacao === 'A').length;
    const vendedores = new Set(filtered.map(o => o.nome_vendedor).filter(Boolean)).size;
    const modulos = new Set(filtered.map(o => o.modulo).filter(Boolean)).size;
    return { total, aprovados, vendedores, modulos };
  }, [filtered]);

  const kpiCards = [
    { label: 'Orçamentos', value: stats.total, icon: FileBarChart, tone: 'violet' },
    { label: 'Aprovados', value: stats.aprovados, icon: CheckCircle2, tone: 'emerald' },
    { label: 'Vendedores', value: stats.vendedores, icon: Users, tone: 'blue' },
    { label: 'Módulos', value: stats.modulos, icon: Layers, tone: 'sky' },
  ];

  const TONES = {
    violet:  { chip: 'bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-300', value: 'text-violet-700 dark:text-violet-300' },
    emerald: { chip: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300', value: 'text-emerald-700 dark:text-emerald-300' },
    blue:    { chip: 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300', value: 'text-blue-700 dark:text-blue-300' },
    sky:     { chip: 'bg-sky-100 text-sky-600 dark:bg-sky-900/40 dark:text-sky-300', value: 'text-sky-700 dark:text-sky-300' },
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-violet-50/40 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 p-4 sm:p-6 lg:p-8">
      <div className="max-w-[1400px] mx-auto space-y-6">

        {/* Header */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-violet-600 via-violet-600 to-fuchsia-600 p-6 sm:p-8 shadow-lg shadow-violet-500/20">
          <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-white/10 blur-2xl" />
          <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-violet-100 text-xs font-semibold uppercase tracking-widest">
                <ShieldCheck className="w-4 h-4" />
                Auditoria · Pré e Pós Vendas
              </div>
              <h1 className="mt-2 text-2xl sm:text-3xl font-bold text-white">Relatório Consolidado de Orçamentos</h1>
              <p className="mt-1 text-violet-100/90 text-sm max-w-2xl">
                Todos os orçamentos das vendas PF, PJ, Upsell e Indicações em uma única visão.
              </p>
            </div>
            <Button
              onClick={loadReport}
              disabled={loading}
              className="bg-white/15 hover:bg-white/25 text-white border border-white/30 backdrop-blur-sm shadow-sm self-start"
            >
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              Atualizar
            </Button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {kpiCards.map(({ label, value, icon: Icon, tone }) => {
            const t = TONES[tone];
            return (
              <div key={label} className="rounded-2xl bg-white dark:bg-gray-900 ring-1 ring-slate-200 dark:ring-gray-800 shadow-sm hover:shadow-md transition-shadow p-5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</span>
                  <span className={`inline-flex items-center justify-center w-9 h-9 rounded-xl ${t.chip}`}>
                    <Icon className="w-4.5 h-4.5" />
                  </span>
                </div>
                <div className={`mt-3 text-3xl font-bold ${t.value}`}>{value}</div>
              </div>
            );
          })}
        </div>

        {/* Filtros */}
        <div className="rounded-2xl bg-white dark:bg-gray-900 ring-1 ring-slate-200 dark:ring-gray-800 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-900/40">
              <Filter className="w-4 h-4 text-violet-600 dark:text-violet-400" />
            </span>
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Filtros</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
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
            <div className="space-y-1.5 lg:col-span-1">
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

        {/* Tabela */}
        <div className="rounded-2xl bg-white dark:bg-gray-900 ring-1 ring-slate-200 dark:ring-gray-800 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <FileBarChart className="w-4 h-4 text-violet-600 dark:text-violet-400" />
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                {filtered.length} {filtered.length === 1 ? 'orçamento' : 'orçamentos'}
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
                  {['Nº Orçamento', 'CPF', 'Cliente', 'Criação', 'Canal', 'Vendedor', 'Módulo', 'Status'].map(h => (
                    <th key={h} className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
                {loading ? (
                  <tr><td colSpan={8} className="px-4 py-16 text-center text-slate-400">
                    <Loader2 className="w-6 h-6 mx-auto animate-spin mb-2" /> Carregando orçamentos…
                  </td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-16 text-center text-slate-400">
                    <FileBarChart className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    Nenhum orçamento encontrado para os filtros selecionados.
                  </td></tr>
                ) : filtered.map((o, i) => (
                  <tr key={`${o.erp_id}-${i}`} className="hover:bg-violet-50/50 dark:hover:bg-violet-900/10 transition-colors">
                    <td className="px-4 py-3 font-semibold text-violet-700 dark:text-violet-400 whitespace-nowrap">
                      {o.numero_orcamento || '-'}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      {formatCpf(o.cpf_titular)}
                    </td>
                    <td className="px-4 py-3 text-slate-800 dark:text-slate-100 max-w-[220px] truncate" title={o.nome_titular || ''}>
                      {o.nome_titular || '-'}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      {formatDateOnly(o.data_venda)}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300 max-w-[180px] truncate" title={o.canal_id ? canaisMap[o.canal_id] || String(o.canal_id) : ''}>
                      {o.canal_id ? canaisMap[o.canal_id] || String(o.canal_id) : '-'}
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-200 max-w-[180px] truncate" title={o.nome_vendedor || ''}>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
