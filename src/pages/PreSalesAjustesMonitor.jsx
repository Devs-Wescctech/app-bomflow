import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import {
  ShieldAlert, Loader2, RefreshCw, Clock, CheckCircle2, XCircle,
  AlertTriangle, BellRing, BellOff, PlayCircle, Hash, Layers, User as UserIcon,
  CalendarClock, FlaskConical, Power, ExternalLink,
} from "lucide-react";

const API_BASE = "/api";

function authHeaders() {
  const token = localStorage.getItem("accessToken");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function formatCpf(cpf) {
  if (!cpf) return "-";
  const d = String(cpf).replace(/\D/g, "");
  if (d.length !== 11) return cpf;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function formatDate(value) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleDateString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric",
    });
  } catch { return "-"; }
}

function formatYmd(ymd) {
  if (!ymd) return "-";
  const [y, m, d] = String(ymd).split("-");
  if (!y || !m || !d) return ymd;
  return `${d}/${m}/${y}`;
}

const TABS = [
  { key: "pendente", label: "Pendentes" },
  { key: "cancelado_auto", label: "Cancelados" },
  { key: "ajustado", label: "Ajustados" },
  { key: "todos", label: "Todos" },
];

function StatusBadge({ status }) {
  if (status === "cancelado_auto") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10.5px] font-bold text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
        <XCircle className="h-3 w-3" /> Cancelado
      </span>
    );
  }
  if (status === "ajustado") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10.5px] font-bold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
        <CheckCircle2 className="h-3 w-3" /> Ajustado
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10.5px] font-bold text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
      <Clock className="h-3 w-3" /> Pendente
    </span>
  );
}

function PrazoCell({ ajuste }) {
  if (ajuste.status !== "pendente") {
    return <span className="text-slate-400 dark:text-slate-500">{formatYmd(ajuste.deadline_ymd)}</span>;
  }
  if (!ajuste.deadline_ymd) {
    return <span className="text-slate-400 dark:text-slate-500">indisponível</span>;
  }
  const n = ajuste.dias_uteis_restantes;
  let chip;
  if (ajuste.overdue || n === -1) {
    chip = <span className="inline-flex items-center gap-1 rounded-md bg-rose-100 px-1.5 py-0.5 text-[10.5px] font-bold text-rose-700 dark:bg-rose-950/50 dark:text-rose-300"><AlertTriangle className="h-3 w-3" /> Vencido</span>;
  } else if (n === 0) {
    chip = <span className="rounded-md bg-orange-100 px-1.5 py-0.5 text-[10.5px] font-bold text-orange-700 dark:bg-orange-950/50 dark:text-orange-300">vence hoje</span>;
  } else if (n === 1) {
    chip = <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10.5px] font-bold text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">falta 1 dia útil</span>;
  } else {
    chip = <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10.5px] font-bold text-slate-600 dark:bg-gray-800 dark:text-slate-300">faltam {n} dias úteis</span>;
  }
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-semibold text-slate-700 tabular-nums dark:text-slate-200">{formatYmd(ajuste.deadline_ymd)}</span>
      {chip}
    </div>
  );
}

function ConfigPill({ icon: Icon, label, value, tone = "slate" }) {
  const tones = {
    slate: "bg-slate-100 text-slate-600 dark:bg-gray-800 dark:text-slate-300",
    emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
    amber: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
    rose: "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11.5px] font-semibold ${tones[tone]}`}>
      <Icon className="h-3.5 w-3.5" /> {label}: <span className="tabular-nums">{value}</span>
    </span>
  );
}

export default function PreSalesAjustesMonitor() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { data: user } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => base44.auth.me(),
  });
  const currentAgent = user?.agent;
  const currentAgentType = currentAgent?.agentType || currentAgent?.agent_type;
  const isAdmin = user?.role === "admin" || currentAgentType === "admin";

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("pendente");
  const [running, setRunning] = useState(null);
  const [lastRun, setLastRun] = useState(null);
  const [openingId, setOpeningId] = useState(null);

  // Abre o lead do cliente do orçamento; se não houver lead, cai na Fila Pré
  // Vendas já filtrada pelo nº do orçamento para o auditor localizá-lo.
  const openLead = useCallback(async (ajuste) => {
    if (openingId) return;
    setOpeningId(ajuste.id);
    try {
      const res = await fetch(`${API_BASE}/presales-ajustes/${ajuste.id}/lead`, {
        headers: authHeaders(),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.page && json.lead_id) {
        navigate(createPageUrl(json.page, { id: json.lead_id }));
        return;
      }
      if (res.status === 404) {
        const termo = ajuste.erp_numero || ajuste.cliente_cpf || ajuste.erp_pedido_id || "";
        toast({
          title: "Lead não encontrado",
          description: "Abrindo o orçamento na Fila Pré Vendas.",
        });
        navigate(createPageUrl("PreSalesOrcamentoRelatorio", termo ? { q: termo } : undefined));
        return;
      }
      throw new Error(json.error || "Não foi possível abrir o lead do cliente.");
    } catch (e) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setOpeningId(null);
    }
  }, [openingId, navigate, toast]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/presales-ajustes/monitor?status=todos`, { headers: authHeaders() });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Falha ao carregar o painel.");
      setData(json);
    } catch (e) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const runJob = useCallback(async (kind) => {
    const path = kind === "aviso"
      ? "/functions/presales-ajuste-aviso-prazo/run"
      : "/functions/presales-ajuste-auto-cancel/run";
    setRunning(kind);
    setLastRun(null);
    try {
      const res = await fetch(`${API_BASE}${path}`, { method: "POST", headers: authHeaders() });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.success === false) {
        throw new Error(json.error || "Falha ao executar o job.");
      }
      setLastRun({ kind, result: json.result });
      toast({
        title: kind === "aviso" ? "Aviso de prazo executado" : "Auto-cancelamento executado",
        description: "Veja o resumo abaixo do botão.",
      });
      await load();
    } catch (e) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setRunning(null);
    }
  }, [toast, load]);

  const items = data?.items || [];
  const counts = data?.counts || { pendente: 0, ajustado: 0, cancelado_auto: 0, todos: 0 };
  const cfg = data?.config;

  const filtered = useMemo(() => {
    if (tab === "todos") return items;
    return items.filter((i) => i.status === tab);
  }, [items, tab]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-gray-950 dark:to-gray-950 -m-3 md:-m-6 p-4 md:p-6">
      <div className="max-w-[1180px] mx-auto flex flex-col gap-3.5">

        {/* Hero */}
        <div className="relative overflow-hidden rounded-2xl px-5 py-4 md:px-6 md:py-5 text-white shadow-[0_20px_40px_rgba(124,58,237,0.18)] bg-gradient-to-br from-violet-600 via-violet-600 to-indigo-600">
          <div className="pointer-events-none absolute -top-16 -right-8 h-48 w-48 rounded-full bg-white/10 blur-3xl" />
          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2.5">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25 backdrop-blur">
                  <ShieldAlert className="w-4 h-4" />
                </span>
                <h1 className="text-[20px] md:text-[22px] font-semibold tracking-tight leading-none">Painel de Ajustes — Avisos & Cancelamentos</h1>
              </div>
              <p className="mt-2.5 text-[14px] md:text-[15px] font-medium text-white/90">
                Acompanhe prazos, avisos antecipados e o auto-cancelamento dos ajustes da Fila Pré Vendas.
              </p>
            </div>
            <button
              onClick={load}
              disabled={loading}
              title="Atualizar"
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white ring-1 ring-white/20 transition-colors hover:bg-white/20 disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Config + Jobs */}
        <div className="grid gap-3.5 lg:grid-cols-2">
          {/* Configuração ativa */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              <CalendarClock className="h-3.5 w-3.5" /> Configuração ativa
            </div>
            {cfg ? (
              <div className="flex flex-wrap gap-2">
                <ConfigPill icon={Power} label="Auto-cancelamento" value={cfg.enabled ? "ligado" : "desligado"} tone={cfg.enabled ? "emerald" : "rose"} />
                <ConfigPill icon={FlaskConical} label="Modo" value={cfg.dryRun ? "simulação (dry-run)" : "REAL"} tone={cfg.dryRun ? "amber" : "rose"} />
                <ConfigPill icon={CalendarClock} label="Prazo" value={`${cfg.deadlineDays} dias úteis`} />
                <ConfigPill icon={BellRing} label="Aviso" value={cfg.warnFeature ? `${cfg.warnDays} dia(s) antes` : "desligado"} tone={cfg.warnFeature ? "slate" : "rose"} />
                {data && !data.holidaysOk && (
                  <ConfigPill icon={AlertTriangle} label="Feriados" value="indisponível" tone="rose" />
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-400">—</p>
            )}
          </div>

          {/* Disparo manual */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              <PlayCircle className="h-3.5 w-3.5" /> Disparo manual
            </div>
            {isAdmin ? (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => runJob("aviso")}
                  disabled={!!running}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3.5 py-2 text-[12.5px] font-semibold text-white shadow-sm shadow-amber-500/30 transition-colors hover:bg-amber-600 disabled:opacity-50"
                >
                  {running === "aviso" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BellRing className="h-3.5 w-3.5" />}
                  Rodar avisos de prazo
                </button>
                <button
                  onClick={() => runJob("cancel")}
                  disabled={!!running}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3.5 py-2 text-[12.5px] font-semibold text-white shadow-sm shadow-rose-500/30 transition-colors hover:bg-rose-700 disabled:opacity-50"
                >
                  {running === "cancel" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5" />}
                  Rodar auto-cancelamento
                </button>
              </div>
            ) : (
              <p className="text-[12.5px] text-slate-400 dark:text-slate-500">
                Disparo manual disponível apenas para administradores.
              </p>
            )}
            {lastRun && (
              <div className="mt-3 rounded-xl bg-slate-50 p-2.5 dark:bg-gray-800/50">
                <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Resultado — {lastRun.kind === "aviso" ? "avisos de prazo" : "auto-cancelamento"}
                </div>
                <pre className="overflow-x-auto whitespace-pre-wrap break-all text-[11.5px] text-slate-600 dark:text-slate-300">
                  {JSON.stringify(lastRun.result, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1.5">
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                  active
                    ? "bg-violet-600 text-white shadow-sm"
                    : "bg-white text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-gray-900 dark:text-slate-400 dark:ring-gray-800"
                }`}
              >
                {t.label}
                <span className={`rounded-full px-1.5 text-[11px] tabular-nums ${active ? "bg-white/20" : "bg-slate-100 dark:bg-gray-800"}`}>
                  {counts[t.key] ?? 0}
                </span>
              </button>
            );
          })}
        </div>

        {/* Tabela */}
        {loading ? (
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-100 bg-white py-16 text-slate-400 dark:border-gray-800 dark:bg-gray-900">
            <Loader2 className="h-5 w-5 animate-spin" /> Carregando…
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center dark:border-gray-800 dark:bg-gray-900">
            <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-400" />
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Nada por aqui.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[12.5px]">
                <thead className="border-b border-slate-100 bg-slate-50 text-[10.5px] uppercase tracking-wider text-slate-400 dark:border-gray-800 dark:bg-gray-800/50 dark:text-slate-500">
                  <tr>
                    <th className="px-3 py-2.5 font-semibold">Orçamento</th>
                    <th className="px-3 py-2.5 font-semibold">Vendedor</th>
                    <th className="px-3 py-2.5 font-semibold">Solicitado</th>
                    <th className="px-3 py-2.5 font-semibold">Prazo final</th>
                    <th className="px-3 py-2.5 font-semibold">Status</th>
                    <th className="px-3 py-2.5 font-semibold">Aviso</th>
                    <th className="px-3 py-2.5 font-semibold">Cancelamento / Simulação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-gray-800/70">
                  {filtered.map((a) => {
                    const numero = a.erp_numero || a.erp_pedido_id;
                    const opening = openingId === a.id;
                    return (
                      <tr
                        key={a.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => openLead(a)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openLead(a);
                          }
                        }}
                        title="Abrir o lead do cliente"
                        className={`group cursor-pointer align-top transition-colors hover:bg-violet-50/60 focus:outline-none focus-visible:bg-violet-50/60 dark:hover:bg-violet-950/20 dark:focus-visible:bg-violet-950/20 ${opening ? "opacity-60" : ""}`}
                      >
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-900 dark:text-white">{a.cliente_nome || "Cliente"}</span>
                            {opening ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-500" />
                            ) : (
                              <ExternalLink className="h-3.5 w-3.5 text-slate-300 opacity-0 transition-opacity group-hover:opacity-100 dark:text-slate-600" />
                            )}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-400 dark:text-slate-500">
                            <span className="inline-flex items-center gap-1 font-semibold text-slate-500 dark:text-slate-400 tabular-nums"><Hash className="h-3 w-3" />{numero}</span>
                            <span className="font-mono tabular-nums">{formatCpf(a.cliente_cpf)}</span>
                            <span className="inline-flex items-center gap-1"><Layers className="h-3 w-3" />{a.modulo_nome}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="inline-flex items-center gap-1 text-slate-700 dark:text-slate-200">
                            <UserIcon className="h-3.5 w-3.5 text-slate-400" /> {a.vendedor_nome || "-"}
                          </div>
                          {a.auditor_nome && (
                            <div className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">aud.: {a.auditor_nome}</div>
                          )}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-slate-600 dark:text-slate-300 tabular-nums">{formatDate(a.created_at)}</td>
                        <td className="px-3 py-3 whitespace-nowrap"><PrazoCell ajuste={a} /></td>
                        <td className="px-3 py-3"><StatusBadge status={a.status} /></td>
                        <td className="px-3 py-3">
                          {a.avisado ? (
                            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400" title={a.aviso_prazo_info || ""}>
                              <BellRing className="h-3.5 w-3.5" /> Avisado
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-slate-400 dark:text-slate-500">
                              <BellOff className="h-3.5 w-3.5" /> —
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 max-w-[280px]">
                          {a.cancelamento_registrado ? (
                            <p className="whitespace-pre-wrap break-words text-[11.5px] text-slate-600 dark:text-slate-300">{a.cancelamento_info}</p>
                          ) : (
                            <span className="text-slate-400 dark:text-slate-500">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
