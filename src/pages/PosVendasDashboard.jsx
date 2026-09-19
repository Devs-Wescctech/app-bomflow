import { useCallback, useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import {
  AlertTriangle, BarChart3, CheckCircle2, Clock3, Download,
  FileSpreadsheet, Loader2, RefreshCw, Search, Users, X, Building2,
} from "lucide-react";
import {
  Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import { API_BASE, authHeaders, formatDateTime, STATUS_META, StatusBadge } from "@/components/postsales/shared";
import { extractApiError } from "@/utils/apiError";

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (days) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
};
const periodDates = (period) => {
  if (period === "day") return { start: today(), end: today(), granularity: "day" };
  if (period === "week") return { start: daysAgo(6), end: today(), granularity: "day" };
  if (period === "month") return { start: daysAgo(29), end: today(), granularity: "week" };
  return { start: daysAgo(29), end: today(), granularity: "day" };
};
const duration = (hours) => {
  if (hours === null || hours === undefined) return "—";
  return hours < 24
    ? `${hours.toLocaleString("pt-BR")} h`
    : `${(hours / 24).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} dias`;
};
const shortDate = (value) => value
  ? new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
  : "—";
const periodLabel = (item) => item.period_start === item.period_end
  ? shortDate(item.period_start)
  : `${shortDate(item.period_start)} a ${shortDate(item.period_end)}`;

function DetailModal({ title, subtitle, items, onClose }) {
  useEffect(() => {
    const close = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button aria-label="Fechar modal" onClick={onClose} className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm" />
      <section role="dialog" aria-modal="true" aria-label={title} className="relative z-10 max-h-[88vh] w-full max-w-5xl overflow-hidden rounded-t-2xl bg-white shadow-2xl dark:bg-gray-950 sm:rounded-2xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-gray-800">
          <div><h2 className="font-display font-semibold text-slate-900 dark:text-white">{title}</h2><p className="mt-0.5 text-xs text-slate-500">{subtitle || `${items.length} orçamento(s) no recorte`}</p></div>
          <button onClick={onClose} className="action-pill-ghost !h-9 !w-9 !p-0" aria-label="Fechar"><X className="h-4 w-4" /></button>
        </header>
        <div className="max-h-[72vh] overflow-auto">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="sticky top-0 bg-slate-50 text-slate-500 dark:bg-gray-900"><tr>
              <th className="px-4 py-3">Orçamento / cliente</th><th className="px-4 py-3">Atendente</th>
              <th className="px-4 py-3">Status</th><th className="px-4 py-3">Entrada</th>
              <th className="px-4 py-3">Última movimentação</th><th className="px-4 py-3">Tempo</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-gray-800">{items.map((item) => (
              <tr key={item.id} className="hover:bg-slate-50/70 dark:hover:bg-gray-900">
                <td className="px-4 py-3"><b>Nº {item.erp_numero || item.erp_pedido_id}</b><div className="text-slate-500">{item.cliente_nome || "Não informado"}</div></td>
                <td className="px-4 py-3">{item.auditor_nome || "Sem atendente"}</td><td className="px-4 py-3"><StatusBadge status={item.status} /></td>
                <td className="px-4 py-3">{formatDateTime(item.entry_at)}</td><td className="px-4 py-3">{formatDateTime(item.last_movement_at)}</td>
                <td className="px-4 py-3">{item.sla_breached ? <span className="font-bold text-rose-600">{item.idle_days} dias parado</span> : duration(item.approval_hours ?? item.open_hours)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
DetailModal.propTypes = {
  title: PropTypes.string.isRequired,
  subtitle: PropTypes.string,
  items: PropTypes.arrayOf(PropTypes.object).isRequired,
  onClose: PropTypes.func.isRequired,
};

function ExportActions({ label, disabled, onCsv, onExcel }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="hidden text-[11px] font-semibold text-slate-400 sm:inline">{label}</span>
      <button disabled={disabled} onClick={onCsv} className="action-pill-ghost !h-9 !px-3 text-xs disabled:opacity-50"><Download className="h-3.5 w-3.5" /> CSV</button>
      <button disabled={disabled} onClick={onExcel} className="action-pill-primary !h-9 !px-3 text-xs disabled:opacity-50"><FileSpreadsheet className="h-3.5 w-3.5" /> Excel</button>
    </div>
  );
}
ExportActions.propTypes = {
  label: PropTypes.string.isRequired,
  disabled: PropTypes.bool.isRequired,
  onCsv: PropTypes.func.isRequired,
  onExcel: PropTypes.func.isRequired,
};

const detailExportRow = (item) => ({
  "Nº Orçamento": item.erp_numero || item.erp_pedido_id || "-",
  Cliente: item.cliente_nome || "Não informado",
  Atendente: item.auditor_nome || "Sem atendente",
  Status: STATUS_META[item.status]?.label || item.status,
  Entrada: formatDateTime(item.entry_at),
  "Última movimentação": formatDateTime(item.last_movement_at),
  "Tempo de aprovação (horas)": item.approval_hours ?? "",
  "Tempo sem movimentação (dias)": item.idle_days,
  SLA: item.sla_breached ? "Acima de 5 dias" : "No prazo",
});

export default function PosVendasDashboard() {
  const initial = periodDates("month");
  const [tab, setTab] = useState("overview");
  const [filters, setFilters] = useState({ period: "month", start: initial.start, end: initial.end, granularity: initial.granularity, attendant: "", status: "", client: "" });
  const [clientDraft, setClientDraft] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ start_date: filters.start, end_date: filters.end, granularity: filters.granularity });
      if (filters.attendant) params.set("attendant_id", filters.attendant);
      if (filters.status) params.set("status", filters.status);
      if (filters.client) params.set("client", filters.client);
      const response = await fetch(`${API_BASE}/postsales/dashboard?${params}`, { headers: authHeaders() });
      if (!response.ok) throw new Error(await extractApiError(response, "Falha ao carregar o dashboard."));
      setData(await response.json());
    } catch (err) { setError(err.message); setData(null); }
    finally { setLoading(false); }
  }, [filters]);
  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => data?.items || [], [data]);
  const chartData = useMemo(() => (data?.evolution || []).map((item) => ({ ...item, label: periodLabel(item) })), [data]);
  const updatePeriod = (period) => setFilters((current) => ({ ...current, period, ...periodDates(period) }));
  const openGroup = (kind, group) => {
    const items = kind === "attendant"
      ? rows.filter((item) => (item.auditor_id || "sem-atendente") === group.id)
      : rows.filter((item) => (item.cliente_nome || "Não informado") === group.name);
    setDetail({ title: group.name, subtitle: `${items.length} orçamento(s) detalhado(s)`, items });
  };
  const openPendingAttendant = (attendant) => {
    const items = rows.filter((item) => item.pending && (item.auditor_id || "sem-atendente") === attendant.id);
    setDetail({ title: `Pendências de ${attendant.name}`, subtitle: `${items.length} orçamento(s) aguardando`, items });
  };

  const tabSummaryRows = useMemo(() => {
    if (tab === "attendants") return (data?.attendants || []).map((item) => ({
      Atendente: item.name, "Sob responsabilidade": item.total, Concluídos: item.completed,
      Pendentes: item.pending, "Taxa de aprovação (%)": item.approval_rate,
      "Tempo médio de aprovação": duration(item.avg_approval_hours),
      "Tempo médio pendente": duration(item.avg_pending_hours),
    }));
    if (tab === "clients") return (data?.clients || []).map((item) => ({
      Cliente: item.name, Orçamentos: item.total, Concluídos: item.completed,
      Pendentes: item.pending, "Taxa de aprovação (%)": item.approval_rate,
      "Tempo médio de aprovação": duration(item.avg_approval_hours),
    }));
    return rows.map(detailExportRow);
  }, [data, rows, tab]);

  const exportCsv = () => {
    const headers = Object.keys(tabSummaryRows[0] || {});
    if (!headers.length) return;
    const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const csv = "\ufeff" + [headers.map(quote), ...tabSummaryRows.map((row) => headers.map((key) => quote(row[key])))].map((line) => line.join(";")).join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    link.download = `pos-vendas-${tab}-${today()}.csv`; link.click(); URL.revokeObjectURL(link.href);
  };
  const exportExcel = async () => {
    if (!tabSummaryRows.length) return;
    const XLSX = await import("xlsx");
    const book = XLSX.utils.book_new();
    const summary = XLSX.utils.json_to_sheet(tabSummaryRows);
    summary["!cols"] = Object.keys(tabSummaryRows[0]).map((key) => ({ wch: Math.max(16, key.length + 2) }));
    XLSX.utils.book_append_sheet(book, summary, tab === "attendants" ? "Atendentes" : tab === "clients" ? "Clientes" : "Visão geral");
    if (tab !== "overview") {
      const detailSheet = XLSX.utils.json_to_sheet(rows.map(detailExportRow));
      detailSheet["!cols"] = [{ wch: 16 }, { wch: 28 }, { wch: 25 }, { wch: 24 }, { wch: 20 }, { wch: 22 }, { wch: 24 }, { wch: 28 }, { wch: 18 }];
      XLSX.utils.book_append_sheet(book, detailSheet, "Orçamentos detalhados");
    }
    XLSX.writeFile(book, `pos-vendas-${tab}-${today()}.xlsx`);
  };

  const cards = [
    { label: "Tempo médio de aprovação", value: duration(data?.summary?.avg_approval_hours), icon: Clock3, color: "#534AB7" },
    { label: "Aguardando", value: data?.summary?.pending ?? 0, icon: Users, color: "#D97706", action: () => setDetail({ title: "Orçamentos aguardando", items: rows.filter((item) => item.pending) }) },
    { label: "Concluídos", value: data?.summary?.completed ?? 0, icon: CheckCircle2, color: "#0f766e", action: () => setDetail({ title: "Orçamentos concluídos", items: rows.filter((item) => item.status === "concluida") }) },
    { label: "SLA acima de 5 dias", value: data?.summary?.sla_breached ?? 0, icon: AlertTriangle, color: "#BE123C", action: () => setDetail({ title: "Violações de SLA", items: data?.sla || [] }) },
  ];
  const tabs = [
    { id: "overview", label: "Visão Geral", icon: BarChart3 },
    { id: "attendants", label: "Atendentes", icon: Users },
    { id: "clients", label: "Clientes", icon: Building2 },
  ];
  const pendingAttendants = (data?.attendants || []).filter((item) => item.pending > 0);
  const maxPending = Math.max(1, ...pendingAttendants.map((item) => item.pending));

  return (
    <main className="min-h-screen -m-3 bg-slate-50 p-4 font-sans dark:bg-gray-950 md:-m-6 md:p-6">
      <div className="mx-auto max-w-[1280px] space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Pós-Vendas · Gestão</p><h1 className="font-display text-xl font-semibold tracking-tight text-slate-900 dark:text-white">Dashboard Pós-Vendas</h1><p className="mt-1 text-sm text-slate-500">SLA, evolução e desempenho no recorte selecionado.</p></div>
          <button onClick={load} className="action-pill-ghost !h-10 !w-10 !p-0" aria-label="Atualizar"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs font-semibold text-slate-500">Visão<select value={filters.period} onChange={(e) => updatePeriod(e.target.value)} className="eloom-field mt-1 block !h-9"><option value="day">Dia</option><option value="week">Semana</option><option value="month">Mês</option><option value="custom">Personalizado</option></select></label>
            <label className="text-xs font-semibold text-slate-500">De<input type="date" value={filters.start} onChange={(e) => setFilters((f) => ({ ...f, period: "custom", start: e.target.value }))} className="eloom-field mt-1 block !h-9" /></label>
            <label className="text-xs font-semibold text-slate-500">Até<input type="date" value={filters.end} onChange={(e) => setFilters((f) => ({ ...f, period: "custom", end: e.target.value }))} className="eloom-field mt-1 block !h-9" /></label>
            <label className="min-w-[180px] text-xs font-semibold text-slate-500">Atendente<select value={filters.attendant} onChange={(e) => setFilters((f) => ({ ...f, attendant: e.target.value }))} className="eloom-field mt-1 block !h-9 w-full"><option value="">Todos</option>{data?.filters?.attendants?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
            <label className="min-w-[170px] text-xs font-semibold text-slate-500">Status<select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} className="eloom-field mt-1 block !h-9 w-full"><option value="">Todos</option>{data?.filters?.statuses?.map((s) => <option key={s} value={s}>{STATUS_META[s]?.label || s}</option>)}</select></label>
            <form onSubmit={(e) => { e.preventDefault(); setFilters((f) => ({ ...f, client: clientDraft.trim() })); }} className="min-w-[210px] flex-1"><label className="text-xs font-semibold text-slate-500">Cliente</label><div className="relative mt-1"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input value={clientDraft} onChange={(e) => setClientDraft(e.target.value)} placeholder="Buscar cliente" className="dt-search-input h-9 w-full rounded-full border bg-slate-50 pl-9 pr-3 text-sm" /></div></form>
          </div>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div role="tablist" aria-label="Visões do dashboard" className="inline-flex h-11 rounded-full bg-slate-200/60 p-1 dark:bg-gray-800">
            {tabs.map(({ id, label, icon: Icon }) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`inline-flex h-9 items-center gap-2 rounded-full px-4 text-[13px] font-medium transition ${tab === id ? "bg-white text-slate-900 shadow-sm dark:bg-gray-950 dark:text-white" : "text-slate-500 hover:text-slate-900"}`}><Icon className="h-3.5 w-3.5" />{label}</button>)}
          </div>
          <ExportActions label={`Exportar ${tabs.find((item) => item.id === tab)?.label}`} disabled={!tabSummaryRows.length} onCsv={exportCsv} onExcel={exportExcel} />
        </div>

        {loading && !data ? <div className="flex justify-center rounded-2xl border bg-white py-24 text-slate-500 dark:bg-gray-900"><Loader2 className="mr-2 animate-spin" />Carregando indicadores…</div>
        : error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-8 text-center text-rose-700"><AlertTriangle className="mx-auto mb-2" /><b>Não foi possível carregar o painel.</b><p className="mt-1 text-sm">{error}</p><button onClick={load} className="action-pill-primary mt-4">Tentar novamente</button></div>
        : !rows.length ? <div className="rounded-2xl border border-dashed bg-white p-16 text-center text-slate-500 dark:bg-gray-900"><BarChart3 className="mx-auto mb-2 h-8 w-8 opacity-40" /><b>Nenhum dado no período.</b><p className="text-sm">Altere os filtros para ampliar o recorte.</p></div>
        : <>
          {tab === "overview" && <>
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{cards.map(({ label, value, icon: Icon, color, action }) => <button key={label} onClick={action} disabled={!action} className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-px hover:shadow-md disabled:cursor-default disabled:hover:translate-y-0 dark:border-gray-800 dark:bg-gray-900"><Icon className="mb-3 h-5 w-5" style={{ color }} /><div className="font-display text-2xl font-semibold tabular-nums">{value}</div><div className="text-xs font-semibold text-slate-500">{label}</div></button>)}</section>
            <section className="grid gap-4 lg:grid-cols-3">
              <div className="min-w-0 rounded-2xl border bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900 lg:col-span-2">
                <div className="mb-4"><h2 className="font-display font-semibold">Evolução por período</h2><p className="text-xs text-slate-500">Entradas e conclusões nas barras; tempo médio de aprovação na linha.</p></div>
                <div className="h-72"><ResponsiveContainer><ComposedChart data={chartData} margin={{ top: 8, right: 12, left: -12, bottom: 4 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" fontSize={11} /><YAxis yAxisId="count" allowDecimals={false} fontSize={11} /><YAxis yAxisId="time" orientation="right" fontSize={11} tickFormatter={(value) => `${value}h`} /><Tooltip formatter={(value, name) => [name === "Tempo médio" ? duration(value) : value, name]} labelFormatter={(label) => `Período: ${label}`} /><Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} /><Bar yAxisId="count" dataKey="entered" name="Entradas" fill="#534AB7" radius={[4,4,0,0]} /><Bar yAxisId="count" dataKey="completed" name="Concluídos" fill="#0f766e" radius={[4,4,0,0]} /><Line yAxisId="time" type="monotone" dataKey="avg_approval_hours" name="Tempo médio" stroke="#D97706" strokeWidth={2.5} dot={{ r: 3, fill: "#D97706" }} connectNulls /></ComposedChart></ResponsiveContainer></div>
              </div>
              <div className="rounded-2xl border bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900"><h2 className="font-display font-semibold">Pendências por atendente</h2><p className="text-xs text-slate-500">Volume atual e tempo médio de espera.</p><div className="mt-4 space-y-4">{pendingAttendants.slice(0, 6).map((attendant) => <button onClick={() => openPendingAttendant(attendant)} className="block w-full text-left" key={attendant.id}><div className="flex items-center justify-between gap-2 text-xs"><b className="truncate">{attendant.name}</b><span className="shrink-0 font-semibold tabular-nums text-amber-700">{duration(attendant.avg_pending_hours)}</span></div><div className="mt-1.5 h-1.5 rounded bg-slate-100 dark:bg-gray-800"><div className="h-full rounded bg-teal-700" style={{ width: `${Math.max(5, (attendant.pending / maxPending) * 100)}%` }} /></div><div className="mt-1 flex justify-between text-[10px] text-slate-400"><span>{attendant.pending} pendente(s)</span><span>espera média</span></div></button>)}{!pendingAttendants.length && <p className="py-10 text-center text-xs text-slate-400">Nenhuma pendência neste recorte.</p>}</div></div>
            </section>
            <section className="overflow-hidden rounded-2xl border border-rose-200 bg-white shadow-sm dark:bg-gray-900"><div className="flex items-center justify-between border-b border-rose-100 p-4"><div><h2 className="font-display font-semibold">Parados há mais tempo</h2><p className="text-xs text-slate-500">Sem movimentação real há mais de 5 dias</p></div><button onClick={() => setDetail({ title: "Violações de SLA", items: data.sla })} className="text-xs font-bold text-rose-600">Ver todos</button></div><div className="divide-y dark:divide-gray-800">{data.sla.slice(0, 6).map((item) => <button key={item.id} onClick={() => setDetail({ title: `Orçamento Nº ${item.erp_numero || item.erp_pedido_id}`, items: [item] })} className="flex w-full items-center justify-between p-3 text-left hover:bg-rose-50/50"><div><b className="text-xs">Nº {item.erp_numero || item.erp_pedido_id} · {item.cliente_nome || "Não informado"}</b><div className="text-[11px] text-slate-500">{item.auditor_nome || "Sem atendente"} · {STATUS_META[item.status]?.label}</div></div><span className="text-xs font-bold text-rose-700">{item.idle_days} dias</span></button>)}</div></section>
          </>}

          {tab === "attendants" && <section className="overflow-hidden rounded-2xl border bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900"><div className="flex items-center gap-3 p-5"><Users className="h-5 w-5 text-teal-700" /><div><h2 className="font-display font-semibold">Desempenho por atendente</h2><p className="text-xs text-slate-500">Clique em um atendente para abrir todos os orçamentos do recorte.</p></div></div><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-xs"><thead className="bg-slate-50 text-slate-500 dark:bg-gray-800"><tr><th className="p-3">Atendente</th><th className="p-3">Sob responsabilidade</th><th className="p-3">Concluídos</th><th className="p-3">Pendentes</th><th className="p-3">Taxa de aprovação</th><th className="p-3">Tempo médio</th><th className="p-3"></th></tr></thead><tbody>{data.attendants.map((item) => <tr key={item.id} onClick={() => openGroup("attendant", item)} className="cursor-pointer border-t hover:bg-slate-50 dark:border-gray-800 dark:hover:bg-gray-800"><td className="p-3 font-bold">{item.name}</td><td className="p-3">{item.total}</td><td className="p-3 text-teal-700">{item.completed}</td><td className="p-3 text-amber-600">{item.pending}</td><td className="p-3">{item.approval_rate}%</td><td className="p-3">{duration(item.avg_approval_hours)}</td><td className="p-3 text-right font-semibold text-teal-700">Detalhar</td></tr>)}</tbody></table></div></section>}

          {tab === "clients" && <section className="overflow-hidden rounded-2xl border bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900"><div className="flex items-center gap-3 p-5"><Building2 className="h-5 w-5 text-teal-700" /><div><h2 className="font-display font-semibold">Desempenho por cliente</h2><p className="text-xs text-slate-500">Volume, conclusão, pendências e tempo médio por cliente.</p></div></div><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-xs"><thead className="bg-slate-50 text-slate-500 dark:bg-gray-800"><tr><th className="p-3">Cliente</th><th className="p-3">Orçamentos</th><th className="p-3">Concluídos</th><th className="p-3">Pendentes</th><th className="p-3">Taxa de aprovação</th><th className="p-3">Tempo médio</th><th className="p-3"></th></tr></thead><tbody>{data.clients.map((item) => <tr key={item.id} onClick={() => openGroup("client", item)} className="cursor-pointer border-t hover:bg-slate-50 dark:border-gray-800 dark:hover:bg-gray-800"><td className="p-3 font-bold">{item.name}</td><td className="p-3">{item.total}</td><td className="p-3 text-teal-700">{item.completed}</td><td className="p-3 text-amber-600">{item.pending}</td><td className="p-3">{item.approval_rate}%</td><td className="p-3">{duration(item.avg_approval_hours)}</td><td className="p-3 text-right font-semibold text-teal-700">Detalhar</td></tr>)}</tbody></table></div></section>}
        </>}
      </div>
      {detail && <DetailModal {...detail} onClose={() => setDetail(null)} />}
    </main>
  );
}