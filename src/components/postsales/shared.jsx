import { useEffect, useState } from "react";
import {
  X, Clock, CheckCircle2, XCircle, AlertTriangle, Snowflake, Undo2,
  ShieldQuestion, Loader2, History, UserRound, Search,
} from "lucide-react";

export const API_BASE = "/api";

export function authHeaders() {
  const token = localStorage.getItem("accessToken");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export function formatCpf(cpf) {
  if (!cpf) return "-";
  const d = String(cpf).replace(/\D/g, "");
  if (d.length !== 11) return cpf;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function formatYmd(ymd) {
  if (!ymd) return "-";
  const [y, m, d] = String(ymd).split("-");
  if (!y || !m || !d) return ymd;
  return `${d}/${m}/${y}`;
}

export function formatDateTime(value) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return "-"; }
}

// Metadados de cada estado do fluxo do Pós-Vendas.
export const STATUS_META = {
  fila: { label: "Na fila", icon: Clock, cls: "bg-slate-100 text-slate-600 dark:bg-gray-800 dark:text-slate-300" },
  em_verificacao: { label: "Em verificação", icon: Search, cls: "bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300" },
  devolvida: { label: "Devolvida ao coordenador", icon: Undo2, cls: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300" },
  resolvida: { label: "Resolvida — reavaliar", icon: CheckCircle2, cls: "bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300" },
  congelada: { label: "Congelada (Pré-venda)", icon: Snowflake, cls: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300" },
  aguardando_cancelamento: { label: "Decisão final", icon: ShieldQuestion, cls: "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300" },
  concluida: { label: "Concluída", icon: CheckCircle2, cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" },
  cancelada: { label: "Cancelada no ERP", icon: XCircle, cls: "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300" },
};

export function StatusBadge({ status }) {
  const meta = STATUS_META[status] || { label: status, icon: Clock, cls: "bg-slate-100 text-slate-600" };
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold ${meta.cls}`}>
      <Icon className="h-3 w-3" /> {meta.label}
    </span>
  );
}

export function PrazoBadge({ item }) {
  if (!item.prazo_ymd) return <span className="text-slate-400">—</span>;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-semibold tabular-nums text-slate-700 dark:text-slate-200">{formatYmd(item.prazo_ymd)}</span>
      {item.status === "devolvida" && (item.prazo_vencido ? (
        <span className="inline-flex w-fit items-center gap-1 rounded-md bg-rose-100 px-1.5 py-0.5 text-[10.5px] font-bold text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
          <AlertTriangle className="h-3 w-3" /> Vencido
        </span>
      ) : (
        <span className="w-fit rounded-md bg-slate-100 px-1.5 py-0.5 text-[10.5px] font-bold text-slate-600 dark:bg-gray-800 dark:text-slate-300">no prazo</span>
      ))}
    </div>
  );
}

// Trilha (histórico de eventos) de uma verificação, em modal.
export function TrilhaModal({ item, onClose }) {
  const [eventos, setEventos] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/postsales/${item.id}/eventos`, { headers: authHeaders() });
        const json = await res.json().catch(() => ({}));
        if (alive) setEventos(Array.isArray(json.items) ? json.items : []);
      } catch { if (alive) setEventos([]); }
    })();
    return () => { alive = false; };
  }, [item.id]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div onClick={onClose} className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" />
      <div className="relative z-10 flex max-h-[86vh] w-full max-w-[560px] flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl dark:bg-gray-950">
        <div className="flex items-center justify-between bg-violet-600 px-5 py-3.5 text-white dark:bg-violet-700">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4" />
            <h2 className="text-[15px] font-bold">Trilha · Orçamento Nº {item.erp_numero || item.erp_pedido_id}</h2>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="flex h-7 w-7 items-center justify-center rounded-lg text-white/80 hover:bg-white/15 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {eventos === null ? (
            <div className="flex items-center justify-center gap-2 py-10 text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
          ) : eventos.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">Nenhum evento registrado.</p>
          ) : (
            <ol className="relative ml-2 space-y-4 border-l border-slate-200 pl-4 dark:border-gray-800">
              {eventos.map((ev) => (
                <li key={ev.id} className="relative">
                  <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-violet-500 ring-2 ring-white dark:ring-gray-950" />
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    {formatDateTime(ev.created_at)}
                  </div>
                  <div className="mt-0.5 whitespace-pre-wrap break-words text-[13px] text-slate-700 dark:text-slate-200">{ev.detalhe || ev.tipo}</div>
                  {ev.actor_nome && (
                    <div className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500">
                      <UserRound className="h-3 w-3" /> {ev.actor_nome}
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}

export function Hero({ icon: Icon, title, subtitle, onRefresh, loading }) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-600 via-violet-600 to-indigo-600 px-5 py-4 text-white shadow-[0_20px_40px_rgba(124,58,237,0.18)] md:px-6 md:py-5">
      <div className="pointer-events-none absolute -top-16 -right-8 h-48 w-48 rounded-full bg-white/10 blur-3xl" />
      <div className="relative flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25 backdrop-blur">
              <Icon className="h-4 w-4" />
            </span>
            <h1 className="text-[20px] font-semibold leading-none tracking-tight md:text-[22px]">{title}</h1>
          </div>
          <p className="mt-2.5 text-[14px] font-medium text-white/90 md:text-[15px]">{subtitle}</p>
        </div>
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={loading}
            title="Atualizar"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white ring-1 ring-white/20 transition-colors hover:bg-white/20 disabled:opacity-60"
          >
            <Loader2 className={`h-4 w-4 ${loading ? "animate-spin" : "hidden"}`} />
            {!loading && <RefreshIcon />}
          </button>
        )}
      </div>
    </div>
  );
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ClienteCell({ item }) {
  return (
    <div>
      <div className="font-bold text-slate-900 dark:text-white">{item.cliente_nome || "Cliente"}</div>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-400 dark:text-slate-500">
        <span className="font-semibold tabular-nums text-slate-500 dark:text-slate-400">Nº {item.erp_numero || item.erp_pedido_id}</span>
        <span className="font-mono tabular-nums">{formatCpf(item.cliente_cpf)}</span>
        <span>{item.modulo_nome}</span>
      </div>
    </div>
  );
}
