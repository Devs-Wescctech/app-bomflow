import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/components/ui/use-toast";
import {
  Snowflake, Loader2, CheckCircle2, XCircle, History, User as UserIcon,
} from "lucide-react";
import {
  API_BASE, authHeaders, StatusBadge, TrilhaModal, Hero, ClienteCell, formatDateTime,
} from "@/components/postsales/shared";
import { extractApiError } from "@/utils/apiError";

// Equipe do Pré-venda: orçamentos congelados pelo Pós-Vendas ("não resolvido").
// Liberar = volta à fila do Pós-Vendas. Não liberar = encaminha à decisão final
// de cancelamento do auditor do Pós-Vendas.
export default function PosVendasCongelados() {
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [trilhaDe, setTrilhaDe] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/postsales/congelados`, { headers: authHeaders() });
      if (!res.ok) throw new Error(await extractApiError(res, "Falha ao carregar os congelados."));
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

  const decidir = async (item, acao) => {
    const path = acao === "liberar" ? "prevenda-liberar" : "prevenda-nao-liberar";
    setBusy(`${item.id}:${acao}`);
    try {
      const res = await fetch(`${API_BASE}/postsales/${item.id}/${path}`, {
        method: "POST", headers: authHeaders(),
      });
      if (!res.ok) throw new Error(await extractApiError(res, "Falha ao registrar a decisão."));
      const json = await res.json().catch(() => ({}));
      toast({
        title: acao === "liberar" ? "Orçamento liberado" : "Não liberado",
        description: acao === "liberar"
          ? "O orçamento voltou à fila do Pós-Vendas."
          : "Encaminhado à decisão final de cancelamento do Pós-Vendas.",
      });
      await load();
    } catch (e) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const congelados = items.filter((i) => i.status === "congelada");
  const decididos = items.filter((i) => i.status !== "congelada");

  return (
    <div className="min-h-screen -m-3 bg-gradient-to-b from-slate-50 to-white p-4 dark:from-gray-950 dark:to-gray-950 md:-m-6 md:p-6">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-3.5">
        <Hero
          icon={Snowflake}
          title="Congelados do Pós-Vendas"
          subtitle="Orçamentos devolvidos como não resolvidos: libere (volta ao Pós-Vendas) ou não libere (decisão final de cancelamento)."
          onRefresh={load}
          loading={loading}
        />

        {loading ? (
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-100 bg-white py-16 text-slate-400 dark:border-gray-800 dark:bg-gray-900">
            <Loader2 className="h-5 w-5 animate-spin" /> Carregando…
          </div>
        ) : congelados.length === 0 && decididos.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center dark:border-gray-800 dark:bg-gray-900">
            <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-400" />
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Nenhum orçamento congelado.</p>
          </div>
        ) : (
          <>
            {congelados.map((it) => (
              <div key={it.id} className="rounded-2xl border border-cyan-200 bg-white p-4 shadow-sm dark:border-cyan-900/50 dark:bg-gray-900">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <ClienteCell item={it} />
                  <button
                    onClick={() => setTrilhaDe(it)}
                    className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11.5px] font-semibold text-slate-600 hover:bg-slate-200 dark:bg-gray-800 dark:text-slate-300"
                  >
                    <History className="h-3.5 w-3.5" /> Trilha
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-slate-600 dark:text-slate-300">
                  <span className="inline-flex items-center gap-1"><UserIcon className="h-3.5 w-3.5 text-slate-400" /> {it.vendedor_nome || "-"}</span>
                  {it.motivo_devolucao_nome && <span>Motivo da devolução: <b>{it.motivo_devolucao_nome}</b></span>}
                  <span>Congelado em {formatDateTime(it.congelada_at)}</span>
                </div>
                {it.congelamento_motivo && (
                  <p className="mt-1.5 text-[12.5px] text-cyan-800 dark:text-cyan-200">{it.congelamento_motivo}</p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => decidir(it, "liberar")}
                    disabled={!!busy}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-[12.5px] font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {busy === `${it.id}:liberar` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    Liberar (volta ao Pós-Vendas)
                  </button>
                  <button
                    onClick={() => decidir(it, "nao-liberar")}
                    disabled={!!busy}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3.5 py-2 text-[12.5px] font-semibold text-white shadow-sm hover:bg-rose-700 disabled:opacity-50"
                  >
                    {busy === `${it.id}:nao-liberar` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                    Não liberar (decisão final)
                  </button>
                </div>
              </div>
            ))}

            {decididos.length > 0 && (
              <>
                <div className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Já decididos ({decididos.length})
                </div>
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
                  <table className="w-full text-left text-[12.5px]">
                    <thead className="border-b border-slate-100 bg-slate-50 text-[10.5px] uppercase tracking-wider text-slate-400 dark:border-gray-800 dark:bg-gray-800/50 dark:text-slate-500">
                      <tr>
                        <th className="px-3 py-2.5 font-semibold">Orçamento</th>
                        <th className="px-3 py-2.5 font-semibold">Status</th>
                        <th className="px-3 py-2.5 font-semibold">Decisão do Pré-venda</th>
                        <th className="px-3 py-2.5 font-semibold">Trilha</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-gray-800/70">
                      {decididos.map((it) => (
                        <tr key={it.id} className="align-top">
                          <td className="px-3 py-3"><ClienteCell item={it} /></td>
                          <td className="px-3 py-3"><StatusBadge status={it.status} /></td>
                          <td className="px-3 py-3 text-slate-600 dark:text-slate-300">
                            {it.prevenda_decisao === "nao_liberado" ? "Não liberado" : it.prevenda_decisao === "liberado" ? "Liberado" : "—"}
                            {it.prevenda_decisao_por ? ` · ${it.prevenda_decisao_por}` : ""}
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
              </>
            )}
          </>
        )}
      </div>
      {trilhaDe && <TrilhaModal item={trilhaDe} onClose={() => setTrilhaDe(null)} />}
    </div>
  );
}
