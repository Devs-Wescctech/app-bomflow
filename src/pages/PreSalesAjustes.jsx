import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { useToast } from "@/components/ui/use-toast";
import {
  ClipboardCheck, Loader2, Clock, CheckCircle2, RefreshCw,
  User as UserIcon, Layers, Hash, Send, AlertTriangle, ExternalLink,
} from "lucide-react";
import { extractApiError } from "@/utils/apiError";

const API_BASE = "/api";

function authHeaders() {
  const token = localStorage.getItem("accessToken");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatCpf(cpf) {
  if (!cpf) return "-";
  const d = String(cpf).replace(/\D/g, "");
  if (d.length !== 11) return cpf;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function formatDate(dateStr) {
  if (!dateStr) return "-";
  try {
    return new Date(dateStr).toLocaleDateString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch { return "-"; }
}

const TABS = [
  { key: "pendente", label: "Pendentes" },
  { key: "ajustado", label: "Ajustados" },
  { key: "todos", label: "Todos" },
];

function AjusteCard({ ajuste, onMarked }) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [comentario, setComentario] = useState("");
  const [saving, setSaving] = useState(false);
  const [opening, setOpening] = useState(false);
  const done = ajuste.status === "ajustado";

  const handleOpenLead = async () => {
    if (opening) return;
    setOpening(true);
    try {
      const res = await fetch(`${API_BASE}/presales-ajustes/${ajuste.id}/lead`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(await extractApiError(res, "Não foi possível abrir o lead do cliente."));
      const data = await res.json().catch(() => ({}));
      navigate(createPageUrl(data.page, { id: data.lead_id }));
    } catch (e) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
      setOpening(false);
    }
  };

  const handleMark = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/presales-ajustes/${ajuste.id}/ajustado`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ comentario: comentario.trim() || null }),
      });
      if (!res.ok) throw new Error(await extractApiError(res, "Falha ao marcar como ajustado."));
      const data = await res.json().catch(() => ({}));
      toast({ title: "Marcado como ajustado", description: "A venda voltou para a fila da auditoria." });
      onMarked();
    } catch (e) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const numero = ajuste.erp_numero || ajuste.erp_pedido_id;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleOpenLead}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleOpenLead();
        }
      }}
      title="Abrir o lead do cliente"
      className={`group relative cursor-pointer rounded-2xl border bg-white p-4 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-violet-300 dark:bg-gray-900 ${
        done ? "border-emerald-200 dark:border-emerald-900/60" : "border-amber-200 dark:border-amber-900/60"
      } ${opening ? "opacity-70" : ""}`}
    >
      <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 opacity-0 transition-opacity group-hover:opacity-100 dark:text-slate-600">
        {opening ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
      </div>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-bold text-slate-900 dark:text-white truncate">
              {ajuste.cliente_nome || "Cliente"}
            </span>
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold ${
              done
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                : "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
            }`}>
              {done ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
              {done ? "Ajustado" : "Aguardando ajuste"}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-slate-400 dark:text-slate-500">
            <span className="inline-flex items-center gap-1 font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
              <Hash className="h-3.5 w-3.5" />{numero}
            </span>
            <span className="font-mono tabular-nums">{formatCpf(ajuste.cliente_cpf)}</span>
            <span className="inline-flex items-center gap-1"><Layers className="h-3.5 w-3.5" />{ajuste.modulo_nome || "-"}</span>
          </div>
        </div>
        <span className="text-[11px] text-slate-400 dark:text-slate-500 whitespace-nowrap">{formatDate(ajuste.created_at)}</span>
      </div>

      <div className="mt-3 rounded-xl bg-slate-50 p-3 dark:bg-gray-800/50">
        <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> O que precisa ser ajustado
        </div>
        <p className="whitespace-pre-wrap text-[13.5px] text-slate-700 dark:text-slate-200">{ajuste.texto}</p>
        {ajuste.auditor_nome && (
          <div className="mt-2 inline-flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500">
            <UserIcon className="h-3.5 w-3.5" /> Solicitado por {ajuste.auditor_nome}
          </div>
        )}
      </div>

      {done ? (
        ajuste.vendedor_comentario && (
          <p className="mt-2.5 text-[12.5px] text-emerald-700 dark:text-emerald-300">
            <span className="font-semibold">Sua resposta:</span> {ajuste.vendedor_comentario}
          </p>
        )
      ) : open ? (
        <div className="mt-3" onClick={(e) => e.stopPropagation()}>
          <textarea
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            rows={3}
            placeholder="Opcional: descreva o que foi corrigido…"
            className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm outline-none transition-colors placeholder:text-slate-400 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200 dark:border-gray-700 dark:bg-gray-900 dark:text-slate-100"
          />
          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setOpen(false); }}
              className="rounded-lg px-3 py-2 text-[12.5px] font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-gray-800"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleMark(); }}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-[12.5px] font-semibold text-white shadow-sm shadow-emerald-500/30 transition-colors hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Confirmar ajuste
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex justify-end" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setOpen(true); }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-[12.5px] font-semibold text-white shadow-sm shadow-emerald-500/30 transition-colors hover:bg-emerald-700"
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Marcar como ajustado
          </button>
        </div>
      )}
    </div>
  );
}

export default function PreSalesAjustes() {
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("pendente");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/presales-ajustes/mine`, { headers: authHeaders() });
      if (!res.ok) throw new Error(await extractApiError(res, "Falha ao carregar seus ajustes."));
      const data = await res.json();
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => ({
    pendente: items.filter((i) => i.status === "pendente").length,
    ajustado: items.filter((i) => i.status === "ajustado").length,
    todos: items.length,
  }), [items]);

  const filtered = useMemo(() => {
    if (tab === "todos") return items;
    return items.filter((i) => i.status === tab);
  }, [items, tab]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-gray-950 dark:to-gray-950 -m-3 md:-m-6 p-4 md:p-6">
      <div className="max-w-[920px] mx-auto flex flex-col gap-3.5">

        {/* Hero */}
        <div className="relative overflow-hidden rounded-2xl px-5 py-4 md:px-6 md:py-5 text-white shadow-[0_20px_40px_rgba(124,58,237,0.18)] bg-gradient-to-br from-violet-600 via-violet-600 to-indigo-600">
          <div className="pointer-events-none absolute -top-16 -right-8 h-48 w-48 rounded-full bg-white/10 blur-3xl" />
          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2.5">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25 backdrop-blur">
                  <ClipboardCheck className="w-4 h-4" />
                </span>
                <h1 className="text-[20px] md:text-[22px] font-semibold tracking-tight leading-none">Retornos da Auditoria</h1>
              </div>
              <p className="mt-2.5 text-[14px] md:text-[15px] font-medium text-white/90">
                {counts.pendente > 0
                  ? `${counts.pendente} ${counts.pendente === 1 ? "venda aguardando seu ajuste" : "vendas aguardando seu ajuste"}`
                  : "Nenhum ajuste pendente — tudo em dia"}
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

        {/* Lista */}
        {loading ? (
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-100 bg-white py-16 text-slate-400 dark:border-gray-800 dark:bg-gray-900">
            <Loader2 className="h-5 w-5 animate-spin" /> Carregando…
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center dark:border-gray-800 dark:bg-gray-900">
            <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-400" />
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
              {tab === "pendente" ? "Nenhum ajuste pendente." : "Nada por aqui."}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map((a) => (
              <AjusteCard key={a.id} ajuste={a} onMarked={load} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
