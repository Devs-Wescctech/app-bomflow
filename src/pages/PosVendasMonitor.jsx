import { useState, useEffect, useMemo, useCallback } from "react";
import { useToast } from "@/components/ui/use-toast";
import {
  Activity, Loader2, CheckCircle2, History, User as UserIcon,
} from "lucide-react";
import {
  API_BASE, authHeaders, StatusBadge, PrazoBadge, TrilhaModal, Hero,
  ClienteCell, STATUS_META,
} from "@/components/postsales/shared";

const FUNIL = [
  "fila", "em_verificacao", "devolvida", "resolvida",
  "congelada", "aguardando_cancelamento", "concluida", "cancelada",
];

// Monitor da liderança: funil consolidado do Pós-Vendas + trilha por orçamento.
export default function PosVendasMonitor() {
  const { toast } = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("todos");
  const [trilhaDe, setTrilhaDe] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/postsales/monitor`, { headers: authHeaders() });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Falha ao carregar o monitor.");
      setData(json);
    } catch (e) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const items = data?.items || [];
  const counts = data?.counts || {};
  const filtered = useMemo(
    () => (filtro === "todos" ? items : items.filter((i) => i.status === filtro)),
    [items, filtro]
  );

  return (
    <div className="min-h-screen -m-3 bg-gradient-to-b from-slate-50 to-white p-4 dark:from-gray-950 dark:to-gray-950 md:-m-6 md:p-6">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-3.5">
        <Hero
          icon={Activity}
          title="Monitor Pós-Vendas"
          subtitle="Funil consolidado do Pós-Vendas: fila, devoluções, congelamentos, decisões finais e histórico por orçamento."
          onRefresh={load}
          loading={loading}
        />

        {/* Funil */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
          {FUNIL.map((s) => {
            const meta = STATUS_META[s];
            const active = filtro === s;
            return (
              <button
                key={s}
                onClick={() => setFiltro(active ? "todos" : s)}
                className={`rounded-2xl border p-3 text-left transition-colors ${active ? "border-violet-400 bg-violet-50 dark:border-violet-700 dark:bg-violet-950/30" : "border-slate-200 bg-white hover:bg-slate-50 dark:border-gray-800 dark:bg-gray-900"}`}
              >
                <div className="text-[20px] font-bold tabular-nums text-slate-900 dark:text-white">{counts[s] ?? 0}</div>
                <div className="mt-0.5 text-[10.5px] font-semibold leading-tight text-slate-500 dark:text-slate-400">{meta.label}</div>
              </button>
            );
          })}
        </div>

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
                    <th className="px-3 py-2.5 font-semibold">Status</th>
                    <th className="px-3 py-2.5 font-semibold">Auditor</th>
                    <th className="px-3 py-2.5 font-semibold">Motivo / Prazo</th>
                    <th className="px-3 py-2.5 font-semibold">Cancelamento</th>
                    <th className="px-3 py-2.5 font-semibold">Trilha</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-gray-800/70">
                  {filtered.map((it) => (
                    <tr key={it.id} className="align-top hover:bg-slate-50/60 dark:hover:bg-gray-800/30">
                      <td className="px-3 py-3"><ClienteCell item={it} /></td>
                      <td className="px-3 py-3">
                        <span className="inline-flex items-center gap-1 text-slate-700 dark:text-slate-200">
                          <UserIcon className="h-3.5 w-3.5 text-slate-400" /> {it.vendedor_nome || "-"}
                        </span>
                      </td>
                      <td className="px-3 py-3"><StatusBadge status={it.status} /></td>
                      <td className="px-3 py-3 text-slate-600 dark:text-slate-300">{it.auditor_nome || "—"}</td>
                      <td className="px-3 py-3">
                        {it.motivo_devolucao_nome ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[11.5px] font-semibold text-amber-700 dark:text-amber-300">{it.motivo_devolucao_nome}</span>
                            <PrazoBadge item={it} />
                          </div>
                        ) : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="max-w-[260px] px-3 py-3">
                        {it.cancelamento_info ? (
                          <p className="whitespace-pre-wrap break-words text-[11.5px] text-slate-600 dark:text-slate-300">{it.cancelamento_info}</p>
                        ) : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-3 py-3">
                        <button
                          onClick={() => setTrilhaDe(it)}
                          className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11.5px] font-semibold text-slate-600 hover:bg-slate-200 dark:bg-gray-800 dark:text-slate-300"
                        >
                          <History className="h-3.5 w-3.5" /> Ver
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      {trilhaDe && <TrilhaModal item={trilhaDe} onClose={() => setTrilhaDe(null)} />}
    </div>
  );
}
