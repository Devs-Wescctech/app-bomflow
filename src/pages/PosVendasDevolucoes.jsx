import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/components/ui/use-toast";
import {
  Undo2, Loader2, CheckCircle2, History, User as UserIcon,
} from "lucide-react";
import {
  API_BASE, authHeaders, StatusBadge, PrazoBadge, TrilhaModal, Hero, ClienteCell,
} from "@/components/postsales/shared";
import { extractApiError } from "@/utils/apiError";

// Coordenador/supervisor: devoluções do Pós-Vendas para a sua equipe, com motivo e
// prazo de 3 dias. "Marcar como resolvida" devolve o orçamento ao auditor reavaliar.
export default function PosVendasDevolucoes() {
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(null);
  const [obs, setObs] = useState({});
  const [trilhaDe, setTrilhaDe] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/postsales/devolucoes`, { headers: authHeaders() });
      if (!res.ok) throw new Error(await extractApiError(res, "Falha ao carregar as devoluções."));
      const json = await res.json().catch(() => ({}));
      setItems(Array.isArray(json.items) ? json.items : []);
    } catch (e) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const resolver = async (item) => {
    setResolving(item.id);
    try {
      const res = await fetch(`${API_BASE}/postsales/${item.id}/resolver`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ observacao: obs[item.id] || "" }),
      });
      if (!res.ok) throw new Error(await extractApiError(res, "Falha ao marcar como resolvida."));
      const json = await res.json().catch(() => ({}));
      toast({ title: "Pendência resolvida", description: "O auditor do Pós-Vendas foi notificado para reavaliar." });
      await load();
    } catch (e) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setResolving(null);
    }
  };

  const pendentes = items.filter((i) => i.status === "devolvida");
  const outras = items.filter((i) => i.status !== "devolvida");

  return (
    <div className="min-h-screen -m-3 bg-gradient-to-b from-slate-50 to-white p-4 dark:from-gray-950 dark:to-gray-950 md:-m-6 md:p-6">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-3.5">
        <Hero
          icon={Undo2}
          title="Devoluções do Pós-Vendas"
          subtitle="Pendências devolvidas pelo Pós-Vendas para a sua equipe — resolva dentro do prazo de 3 dias."
          onRefresh={load}
          loading={loading}
        />

        {loading ? (
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-100 bg-white py-16 text-slate-400 dark:border-gray-800 dark:bg-gray-900">
            <Loader2 className="h-5 w-5 animate-spin" /> Carregando…
          </div>
        ) : (
          <>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Pendentes ({pendentes.length})
            </div>
            {pendentes.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-12 text-center dark:border-gray-800 dark:bg-gray-900">
                <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-400" />
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Nenhuma devolução pendente para a sua equipe.</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {pendentes.map((it) => (
                  <div key={it.id} className="rounded-2xl border border-amber-200 bg-white p-4 shadow-sm dark:border-amber-900/50 dark:bg-gray-900">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <ClienteCell item={it} />
                      <div className="flex items-center gap-2">
                        <PrazoBadge item={it} />
                        <button
                          onClick={() => setTrilhaDe(it)}
                          className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11.5px] font-semibold text-slate-600 hover:bg-slate-200 dark:bg-gray-800 dark:text-slate-300"
                        >
                          <History className="h-3.5 w-3.5" /> Trilha
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px]">
                      <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300">
                        <UserIcon className="h-3.5 w-3.5 text-slate-400" /> {it.vendedor_nome || "-"}
                      </span>
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10.5px] font-bold text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
                        {it.motivo_devolucao_nome}
                      </span>
                      {it.devolucao_obs && (
                        <span className="text-[12px] text-slate-500 dark:text-slate-400">Obs.: {it.devolucao_obs}</span>
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <input
                        value={obs[it.id] || ""}
                        onChange={(e) => setObs((p) => ({ ...p, [it.id]: e.target.value }))}
                        placeholder="O que foi corrigido? (opcional)"
                        className="min-w-[220px] flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12.5px] text-slate-700 outline-none focus:border-emerald-400 dark:border-gray-800 dark:bg-gray-950 dark:text-slate-200"
                      />
                      <button
                        onClick={() => resolver(it)}
                        disabled={resolving === it.id}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-[12.5px] font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {resolving === it.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                        Marcar como resolvida
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {outras.length > 0 && (
              <>
                <div className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Acompanhamento ({outras.length})
                </div>
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
                  <table className="w-full text-left text-[12.5px]">
                    <thead className="border-b border-slate-100 bg-slate-50 text-[10.5px] uppercase tracking-wider text-slate-400 dark:border-gray-800 dark:bg-gray-800/50 dark:text-slate-500">
                      <tr>
                        <th className="px-3 py-2.5 font-semibold">Orçamento</th>
                        <th className="px-3 py-2.5 font-semibold">Vendedor</th>
                        <th className="px-3 py-2.5 font-semibold">Motivo</th>
                        <th className="px-3 py-2.5 font-semibold">Status</th>
                        <th className="px-3 py-2.5 font-semibold">Trilha</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-gray-800/70">
                      {outras.map((it) => (
                        <tr key={it.id} className="align-top">
                          <td className="px-3 py-3"><ClienteCell item={it} /></td>
                          <td className="px-3 py-3 text-slate-600 dark:text-slate-300">{it.vendedor_nome || "-"}</td>
                          <td className="px-3 py-3 text-slate-600 dark:text-slate-300">{it.motivo_devolucao_nome || "—"}</td>
                          <td className="px-3 py-3"><StatusBadge status={it.status} /></td>
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
              </>
            )}
          </>
        )}
      </div>
      {trilhaDe && <TrilhaModal item={trilhaDe} onClose={() => setTrilhaDe(null)} />}
    </div>
  );
}
