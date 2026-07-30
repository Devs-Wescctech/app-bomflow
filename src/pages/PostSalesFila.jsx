import { useState, useEffect, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import {
  Search, RefreshCw, Loader2, Inbox, CheckCircle2, User as UserIcon,
  ShieldCheck, Layers, Calendar, ArrowRight, ClipboardCheck,
} from "lucide-react";
import { extractApiError } from "@/utils/apiError";

const API_BASE = "/api";

function getAuthHeaders() {
  const token = localStorage.getItem("accessToken");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatCpf(cpf) {
  if (!cpf) return "-";
  const d = String(cpf).replace(/\D/g, "");
  if (d.length !== 11) return cpf;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function formatDateTime(dateStr) {
  if (!dateStr) return "-";
  try {
    const d = new Date(dateStr);
    return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  } catch { return "-"; }
}

// Cores por módulo de origem (mesma paleta da Fila Pré-Vendas).
const MODULO_BADGE = {
  sales: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300",
  sales_pj: "bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300",
  sales_upsell: "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300",
  referral: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300",
};

// Fila de ENTRADA do Pós-Vendas: orçamentos aprovados na auditoria do pré-venda
// (registro local — o ERP não é alterado). Ponto de partida da fase 2 do módulo
// (retorno ao coordenador, congelamento, cancelamento etc.).
export default function PostSalesFila() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/presales-ajustes/pos-vendas`, { headers: getAuthHeaders() });
      if (res.status === 403) {
        setItems([]);
        toast({ title: "Acesso restrito", description: "Você não tem permissão para esta fila.", variant: "destructive" });
        return;
      }
      if (!res.ok) throw new Error(await extractApiError(res, "Falha ao carregar a fila do Pós-Vendas."));
      const data = await res.json();
      setItems(Array.isArray(data.items) ? data.items : []);
      setLastUpdated(new Date());
    } catch (e) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return items;
    const tDigits = term.replace(/\D/g, "");
    return items.filter((o) => {
      const cpf = String(o.cliente_cpf || "").replace(/\D/g, "");
      return (
        String(o.erp_numero || o.erp_pedido_id || "").toLowerCase().includes(term) ||
        String(o.cliente_nome || "").toLowerCase().includes(term) ||
        String(o.vendedor_nome || "").toLowerCase().includes(term) ||
        String(o.auditor_nome || "").toLowerCase().includes(term) ||
        (tDigits && cpf.includes(tDigits))
      );
    });
  }, [items, search]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-gray-950 dark:to-gray-950 -m-3 md:-m-6 p-4 md:p-6">
      <div className="max-w-[1280px] mx-auto flex flex-col gap-3.5">

        {/* Hero */}
        <div className="relative overflow-hidden rounded-2xl px-5 py-4 md:px-6 md:py-5 text-white shadow-[0_24px_60px_-12px_rgba(5,150,105,0.4)] ring-1 ring-white/10 bg-[linear-gradient(135deg,#047857_0%,#059669_46%,#0d9488_100%)]">
          <div className="pointer-events-none absolute inset-0 opacity-[0.06] [background-image:radial-gradient(rgba(255,255,255,0.9)_1px,transparent_1px)] [background-size:16px_16px]" />
          <div className="pointer-events-none absolute -top-16 -right-8 h-48 w-48 rounded-full bg-white/10 blur-3xl" />
          <div className="relative flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2.5">
                <span className="relative inline-flex h-8 w-8 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25 backdrop-blur">
                  <ClipboardCheck className="relative w-4 h-4" />
                </span>
                <h1 className="text-[20px] md:text-[22px] font-bold tracking-tight leading-none drop-shadow-sm">Fila Pós-Vendas</h1>
              </div>
              <p className="mt-2.5 text-[14px] md:text-[15px] font-medium text-white/80">
                {items.length === 0
                  ? "Nenhum orçamento aprovado aguardando o pós-venda"
                  : `${items.length} ${items.length === 1 ? "orçamento aprovado no pré-venda" : "orçamentos aprovados no pré-venda"} — entrada da fase de pós-venda`}
              </p>
            </div>
            <button
              onClick={load}
              disabled={loading}
              title="Atualizar"
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white ring-1 ring-white/20 transition-colors hover:bg-white/20 disabled:opacity-60"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Busca */}
        <div className="flex items-center gap-3 rounded-2xl bg-white/80 backdrop-blur ring-1 ring-slate-200/70 px-4 py-3 dark:bg-gray-900/80 dark:ring-gray-800">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nº, CPF, cliente, vendedor ou auditor"
              className="h-9 pl-9 border-slate-200 dark:border-gray-800"
            />
          </div>
          <span className="hidden sm:inline text-[11.5px] text-slate-400 dark:text-slate-500 tabular-nums shrink-0">
            {filtered.length} na fila{lastUpdated ? ` · atualizado ${lastUpdated.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : ""}
          </span>
        </div>

        {/* Lista */}
        <div className="flex flex-col gap-2">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 text-slate-400">
              <Loader2 className="w-7 h-7 animate-spin mb-3" />
              Carregando fila pós-vendas…
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl bg-white ring-1 ring-slate-200/70 py-24 text-slate-400 dark:bg-gray-900 dark:ring-gray-800">
              <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50 dark:bg-gray-800">
                <Inbox className="w-6 h-6 opacity-50" />
              </div>
              Nenhum orçamento aprovado no pré-venda até o momento.
            </div>
          ) : filtered.map((o) => (
            <div
              key={o.erp_pedido_id}
              className="group relative flex items-center gap-3 rounded-2xl bg-white dark:bg-gray-900 ring-1 ring-slate-200/60 dark:ring-gray-800 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:ring-emerald-300/50 pl-4 pr-3 py-3.5"
            >
              <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full bg-emerald-400 opacity-70 group-hover:opacity-100" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  <span className="text-[17px] leading-tight font-bold tracking-[-0.015em] text-slate-900 dark:text-white truncate">
                    {o.cliente_nome || "-"}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-bold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                    <CheckCircle2 className="h-3 w-3" /> Aprovado no pré-venda
                  </span>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${MODULO_BADGE[o.modulo] || "bg-slate-100 text-slate-500"}`}>
                    {o.modulo_nome || "-"}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center flex-wrap gap-x-2.5 gap-y-1 text-[11.5px] text-slate-400 dark:text-slate-500">
                  <span className="font-semibold text-slate-500 dark:text-slate-400 tabular-nums">#{o.erp_numero || o.erp_pedido_id}</span>
                  <span className="font-mono tabular-nums">{formatCpf(o.cliente_cpf)}</span>
                  <span className="inline-flex items-center gap-1" title="Vendedor">
                    <UserIcon className="w-3.5 h-3.5" /> {o.vendedor_nome || "-"}
                  </span>
                  <span className="inline-flex items-center gap-1" title="Auditor que aprovou">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" /> {o.auditor_nome || "-"}
                  </span>
                  <span className="inline-flex items-center gap-1" title="Data da aprovação">
                    <Calendar className="w-3.5 h-3.5" /> {formatDateTime(o.aprovado_at)}
                  </span>
                </div>
              </div>
              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-medium text-slate-300 dark:text-slate-600" title="Tratamento completo do pós-venda chega na próxima fase">
                Aguardando pós-venda <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </div>
          ))}
        </div>

        <p className="text-[11px] text-slate-400 dark:text-slate-500">
          A aprovação do pré-venda é um registro interno — a situação do orçamento no ERP não é alterada.
        </p>
      </div>
    </div>
  );
}
