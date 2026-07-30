import { useState, useEffect, useMemo, useCallback } from "react";
import { useToast } from "@/components/ui/use-toast";
import {
  ClipboardCheck, Loader2, CheckCircle2, Undo2, Snowflake, XCircle,
  Lock, Unlock, History, User as UserIcon, X, AlertTriangle, ShieldQuestion,
} from "lucide-react";
import {
  API_BASE, authHeaders, formatYmd, StatusBadge, PrazoBadge, TrilhaModal,
  Hero, ClienteCell, STATUS_META,
} from "@/components/postsales/shared";
import { extractApiError } from "@/utils/apiError";

const TABS = [
  { key: "fila", label: "Fila" },
  { key: "em_verificacao", label: "Em verificação" },
  { key: "devolvida", label: "Devolvidas" },
  { key: "resolvida", label: "Reavaliar" },
  { key: "congelada", label: "Congeladas" },
  { key: "aguardando_cancelamento", label: "Decisão final" },
  { key: "concluida", label: "Concluídas" },
  { key: "cancelada", label: "Canceladas" },
  { key: "todos", label: "Todas" },
];

// Modal de ação sobre uma verificação: concluir, devolver (5 motivos + prazo 3 dias),
// congelar (reavaliação reprovada) e decisão final de cancelamento no ERP.
function AcaoModal({ item, motivos, onClose, onChanged }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(null);
  const [motivo, setMotivo] = useState("");
  const [obs, setObs] = useState("");
  const [cancelMotivo, setCancelMotivo] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const call = async (path, body, okMsg) => {
    setBusy(path);
    try {
      const res = await fetch(`${API_BASE}/postsales/${item.id}/${path}`, {
        method: "POST", headers: authHeaders(), body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) throw new Error(await extractApiError(res, "Falha na operação."));
      const json = await res.json().catch(() => ({}));
      toast({ title: okMsg });
      onChanged();
      onClose();
    } catch (e) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
      onChanged();
    } finally {
      setBusy(null);
    }
  };

  const mine = item.lock_mine;
  const emVerif = item.status === "em_verificacao";
  const decisaoFinal = item.status === "aguardando_cancelamento";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div onClick={onClose} className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" />
      <div className="relative z-10 flex max-h-[92vh] w-full max-w-[600px] flex-col overflow-hidden rounded-t-2xl bg-slate-50 shadow-2xl sm:rounded-2xl dark:bg-gray-950">
        <div className="flex items-center justify-between bg-violet-600 px-5 py-4 text-white dark:bg-violet-700">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25">
              <ClipboardCheck className="h-4.5 w-4.5" />
            </span>
            <div>
              <h2 className="text-[16px] font-bold leading-tight">Pós-Vendas · Orçamento Nº {item.erp_numero || item.erp_pedido_id}</h2>
              <p className="text-[12px] text-violet-100/90">{item.cliente_nome || "Cliente"} · {item.modulo_nome}</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="flex h-8 w-8 items-center justify-center rounded-lg text-white/80 hover:bg-white/15 hover:text-white">
            <X className="h-[18px] w-[18px]" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={item.status} />
            {item.auditor_nome && (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-semibold text-slate-600 dark:bg-gray-800 dark:text-slate-300">
                <Lock className="h-3 w-3" /> {item.lock_mine ? "Assumida por você" : `Assumida por ${item.auditor_nome}`}
              </span>
            )}
            {item.motivo_devolucao_nome && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10.5px] font-semibold text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
                <Undo2 className="h-3 w-3" /> {item.motivo_devolucao_nome}{item.prazo_ymd ? ` · prazo ${formatYmd(item.prazo_ymd)}` : ""}
              </span>
            )}
          </div>

          {item.resolucao_obs && (
            <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-[12.5px] text-sky-800 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
              <b>Resolução do coordenador ({item.resolvida_por_nome || "-"}):</b> {item.resolucao_obs}
            </div>
          )}
          {item.congelamento_motivo && (
            <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-3 text-[12.5px] text-cyan-800 dark:border-cyan-900 dark:bg-cyan-950/40 dark:text-cyan-200">
              <b>Congelamento:</b> {item.congelamento_motivo}
            </div>
          )}
          {item.cancelamento_info && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-[12.5px] text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
              <b>Cancelamento:</b> {item.cancelamento_info}
            </div>
          )}

          {/* Assumir / liberar trava */}
          {["fila", "resolvida"].includes(item.status) && (
            <button
              onClick={() => call("assumir", null, "Verificação assumida — você é o responsável.")}
              disabled={!!busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 py-2 text-[12.5px] font-semibold text-white shadow-sm hover:bg-violet-700 disabled:opacity-50"
            >
              {busy === "assumir" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lock className="h-3.5 w-3.5" />}
              {item.status === "resolvida" ? "Assumir para reavaliar" : "Assumir verificação"}
            </button>
          )}

          {emVerif && !mine && (
            <div className="flex items-start gap-2 rounded-xl border border-slate-300 bg-slate-100 p-3 text-[12.5px] text-slate-600 dark:border-gray-700 dark:bg-gray-800/60 dark:text-slate-300">
              <Lock className="mt-0.5 h-4 w-4 shrink-0" /> Em verificação por {item.auditor_nome || "outro auditor"} — somente leitura.
            </div>
          )}

          {emVerif && mine && (
            <>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => call("concluir", null, "Pós-venda concluído com sucesso.")}
                  disabled={!!busy}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-[12.5px] font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                >
                  {busy === "concluir" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  Concluir pós-venda
                </button>
                <button
                  onClick={() => call("liberar-trava", null, "Trava liberada — orçamento voltou à fila.")}
                  disabled={!!busy}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-200 px-3.5 py-2 text-[12.5px] font-semibold text-slate-700 hover:bg-slate-300 disabled:opacity-50 dark:bg-gray-800 dark:text-slate-200"
                >
                  <Unlock className="h-3.5 w-3.5" /> Liberar trava
                </button>
                <button
                  onClick={() => call("congelar", { observacao: obs }, "Orçamento congelado e devolvido ao Pré-venda.")}
                  disabled={!!busy}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3.5 py-2 text-[12.5px] font-semibold text-white shadow-sm hover:bg-cyan-700 disabled:opacity-50"
                >
                  {busy === "congelar" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Snowflake className="h-3.5 w-3.5" />}
                  Congelar (não resolvido)
                </button>
              </div>

              {/* Devolver ao coordenador */}
              <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900/60 dark:bg-amber-950/20">
                <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                  <Undo2 className="h-3.5 w-3.5" /> Devolver ao coordenador (prazo automático: 3 dias)
                </div>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {Object.entries(motivos || {}).map(([key, label]) => (
                    <label key={key} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[12.5px] font-medium transition-colors ${motivo === key ? "border-amber-500 bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-gray-800 dark:bg-gray-900 dark:text-slate-300"}`}>
                      <input type="radio" name="motivo" value={key} checked={motivo === key} onChange={() => setMotivo(key)} className="accent-amber-600" />
                      {label}
                    </label>
                  ))}
                </div>
                <textarea
                  value={obs}
                  onChange={(e) => setObs(e.target.value)}
                  placeholder="Observação (opcional)…"
                  rows={2}
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12.5px] text-slate-700 outline-none focus:border-amber-400 dark:border-gray-800 dark:bg-gray-900 dark:text-slate-200"
                />
                <button
                  onClick={() => motivo && call("devolver", { motivo, observacao: obs }, "Devolvida ao coordenador — vendedor e supervisores notificados.")}
                  disabled={!motivo || !!busy}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3.5 py-2 text-[12.5px] font-semibold text-white shadow-sm hover:bg-amber-600 disabled:opacity-50"
                >
                  {busy === "devolver" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
                  Devolver com este motivo
                </button>
              </div>
            </>
          )}

          {/* Decisão final: cancelamento REAL no ERP */}
          {decisaoFinal && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-4 dark:border-rose-900/60 dark:bg-rose-950/20">
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-rose-700 dark:text-rose-300">
                <ShieldQuestion className="h-3.5 w-3.5" /> Decisão final — cancelamento definitivo no ERP
              </div>
              <p className="mb-2 text-[12.5px] text-rose-700/90 dark:text-rose-300/90">
                O Pré-venda não liberou este orçamento{item.prevenda_decisao_por ? ` (decisão de ${item.prevenda_decisao_por})` : ""}. Ao confirmar, o pedido será cancelado <b>de verdade</b> no ERP (situação C). Esta ação não pode ser desfeita.
              </p>
              <textarea
                value={cancelMotivo}
                onChange={(e) => setCancelMotivo(e.target.value)}
                placeholder="Motivo do cancelamento definitivo (obrigatório)…"
                rows={2}
                className="w-full rounded-lg border border-rose-200 bg-white px-3 py-2 text-[12.5px] text-slate-700 outline-none focus:border-rose-400 dark:border-rose-900 dark:bg-gray-900 dark:text-slate-200"
              />
              <label className="mt-2 flex items-center gap-2 text-[12.5px] font-medium text-rose-700 dark:text-rose-300">
                <input type="checkbox" checked={confirmCancel} onChange={(e) => setConfirmCancel(e.target.checked)} className="accent-rose-600" />
                Confirmo o cancelamento definitivo deste pedido no ERP.
              </label>
              <button
                onClick={() => call("cancelar", { confirmar: true, motivo: cancelMotivo }, "Pedido cancelado no ERP e decisão registrada.")}
                disabled={!confirmCancel || !cancelMotivo.trim() || !!busy}
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3.5 py-2 text-[12.5px] font-semibold text-white shadow-sm hover:bg-rose-700 disabled:opacity-50"
              >
                {busy === "cancelar" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                Cancelar pedido no ERP
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PosVendasFila() {
  const { toast } = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("fila");
  const [selected, setSelected] = useState(null);
  const [trilhaDe, setTrilhaDe] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/postsales/fila?status=todos`, { headers: authHeaders() });
      if (!res.ok) throw new Error(await extractApiError(res, "Falha ao carregar a fila."));
      const json = await res.json().catch(() => ({}));
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
    () => (tab === "todos" ? items : items.filter((i) => i.status === tab)),
    [items, tab]
  );

  return (
    <div className="min-h-screen -m-3 bg-gradient-to-b from-slate-50 to-white p-4 dark:from-gray-950 dark:to-gray-950 md:-m-6 md:p-6">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-3.5">
        <Hero
          icon={ClipboardCheck}
          title="Fila Pós-Vendas"
          subtitle="Verifique os orçamentos aprovados no Pré-venda: conclua, devolva ao coordenador ou registre a decisão final."
          onRefresh={load}
          loading={loading}
        />

        <div className="flex flex-wrap items-center gap-1.5">
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${active ? "bg-violet-600 text-white shadow-sm" : "bg-white text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-gray-900 dark:text-slate-400 dark:ring-gray-800"}`}
              >
                {t.label}
                <span className={`rounded-full px-1.5 text-[11px] tabular-nums ${active ? "bg-white/20" : "bg-slate-100 dark:bg-gray-800"}`}>
                  {counts[t.key] ?? 0}
                </span>
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
                    <th className="px-3 py-2.5 font-semibold">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-gray-800/70">
                  {filtered.map((it) => (
                    <tr key={it.id} className="align-top hover:bg-slate-50/60 dark:hover:bg-gray-800/30">
                      <td className="px-3 py-3"><ClienteCell item={it} /></td>
                      <td className="px-3 py-3">
                        <div className="inline-flex items-center gap-1 text-slate-700 dark:text-slate-200">
                          <UserIcon className="h-3.5 w-3.5 text-slate-400" /> {it.vendedor_nome || "-"}
                        </div>
                      </td>
                      <td className="px-3 py-3"><StatusBadge status={it.status} /></td>
                      <td className="px-3 py-3 text-slate-600 dark:text-slate-300">
                        {it.auditor_nome ? (it.lock_mine ? <b>você</b> : it.auditor_nome) : "—"}
                      </td>
                      <td className="px-3 py-3">
                        {it.motivo_devolucao_nome ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[11.5px] font-semibold text-amber-700 dark:text-amber-300">{it.motivo_devolucao_nome}</span>
                            <PrazoBadge item={it} />
                          </div>
                        ) : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            onClick={() => setSelected(it)}
                            className="rounded-lg bg-violet-600 px-2.5 py-1.5 text-[11.5px] font-semibold text-white hover:bg-violet-700"
                          >
                            Abrir
                          </button>
                          <button
                            onClick={() => setTrilhaDe(it)}
                            title="Trilha"
                            className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11.5px] font-semibold text-slate-600 hover:bg-slate-200 dark:bg-gray-800 dark:text-slate-300"
                          >
                            <History className="h-3.5 w-3.5" /> Trilha
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {selected && (
        <AcaoModal
          item={selected}
          motivos={data?.motivos}
          onClose={() => setSelected(null)}
          onChanged={load}
        />
      )}
      {trilhaDe && <TrilhaModal item={trilhaDe} onClose={() => setTrilhaDe(null)} />}
    </div>
  );
}
