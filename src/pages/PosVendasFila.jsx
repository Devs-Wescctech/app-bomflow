import { useState, useEffect, useMemo, useCallback } from "react";
import { useToast } from "@/components/ui/use-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  ClipboardCheck, Loader2, CheckCircle2, Undo2, Snowflake, XCircle,
  Lock, Unlock, History, User as UserIcon, X, AlertTriangle, ShieldQuestion,
  UserRound, Calendar, Phone, Mail, MapPin, Package, CreditCard, FileText,
  Eye, ShoppingBag, Users, Search,
} from "lucide-react";
import {
  API_BASE, authHeaders, formatYmd, formatCpf, StatusBadge, PrazoBadge, TrilhaModal,
  Hero, ClienteCell,
} from "@/components/postsales/shared";
import { extractApiError } from "@/utils/apiError";
import { matchesPostSalesSearch } from "@/utils/postsalesSearch";

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

function todayISO() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function monthStartISO() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

function isValidDateRange(startDate, endDate) {
  if (startDate && endDate && startDate > endDate) return false;
  return true;
}

const DOC_LABELS = {
  documento_identidade: "Documento (CPF/RG)",
  comprovante_residencia: "Comprovante de residência",
  taxa_adesao: "Taxa de adesão",
  copia_contrato: "Cópia do contrato",
};

function formatDateOnly(value) {
  if (!value) return "Não informado";
  const raw = String(value);
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? raw : date.toLocaleDateString("pt-BR");
}

function formatMoney(value) {
  if (value == null || value === "") return "Não informado";
  const number = Number(value);
  return Number.isFinite(number)
    ? number.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : "Não informado";
}

function formatAddress(address) {
  if (!address) return "Não informado";
  const line1 = [address.logradouro, address.numero].filter(Boolean).join(", ");
  const complement = address.complemento ? ` (${address.complemento})` : "";
  const line2 = [address.bairro, address.cidade].filter(Boolean).join(" · ");
  const cep = address.cep ? `CEP ${address.cep}` : "";
  return [line1 + complement, line2, cep].filter(Boolean).join(" — ") || "Não informado";
}

function DetailField({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-slate-100 bg-white p-2.5 dark:border-gray-800 dark:bg-gray-900">
      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-gray-800 dark:text-slate-400">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</div>
        <div className="mt-0.5 break-words text-[12.5px] font-medium text-slate-700 dark:text-slate-200">
          {value || "Não informado"}
        </div>
      </div>
    </div>
  );
}

function DetailSectionTitle({ children, count }) {
  return (
    <div className="mb-2 mt-4 flex items-center justify-between border-b border-slate-200 pb-1.5 dark:border-gray-800">
      <h3 className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">{children}</h3>
      {count != null && <span className="text-[11px] text-slate-400">{count} {count === 1 ? "item" : "itens"}</span>}
    </div>
  );
}

function PostSalesDetail({ item, state, onRetry, onViewDocument, viewingId }) {
  const detalhe = state.detalhe;
  const pessoas = Array.isArray(detalhe?.pessoas) ? detalhe.pessoas : [];
  const titular = pessoas.find((p) => p.is_titular) || null;
  const beneficiarios = pessoas.filter((p) => !p.is_titular);
  const produtos = Array.isArray(detalhe?.produtos) ? detalhe.produtos : [];
  const total = produtos.reduce((sum, p) => {
    const value = Number(p.valor_total);
    return Number.isFinite(value) ? sum + value : sum;
  }, 0);

  return (
    <div className="rounded-2xl border border-violet-100 bg-violet-50/40 p-3.5 dark:border-violet-900/50 dark:bg-violet-950/10">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-violet-700 dark:text-violet-300">
          <FileText className="h-3.5 w-3.5" /> Dados do orçamento
        </div>
        {state.status !== "loading" && (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg px-2 py-1 text-[11px] font-semibold text-violet-700 hover:bg-violet-100 dark:text-violet-300 dark:hover:bg-violet-950/50"
          >
            Tentar novamente
          </button>
        )}
      </div>

      {state.status === "loading" && (
        <div className="flex items-center justify-center gap-2 py-8 text-[12.5px] text-slate-500 dark:text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Consultando dados atualizados no ERP…
        </div>
      )}

      {state.status === "error" && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-[12.5px] text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-semibold">Não foi possível carregar os dados do ERP</div>
            <div className="mt-0.5">{state.error || "A consulta falhou. Tente novamente."}</div>
          </div>
        </div>
      )}

      {state.status === "empty" && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[12.5px] text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-semibold">O ERP não retornou dados deste orçamento</div>
            <div className="mt-0.5">Confira o número do pedido e tente consultar novamente.</div>
          </div>
        </div>
      )}

      {state.status === "ok" && (
        <>
          <DetailSectionTitle>Titular / contratante</DetailSectionTitle>
          <div className="grid gap-2 sm:grid-cols-2">
            <DetailField icon={UserRound} label="Nome" value={titular?.nome || item.cliente_nome} />
            <DetailField
              icon={CreditCard}
              label="CPF"
              value={(titular?.cpf || item.cliente_cpf) ? formatCpf(titular?.cpf || item.cliente_cpf) : null}
            />
            <DetailField icon={Calendar} label="Nascimento" value={formatDateOnly(titular?.data_nascimento)} />
            <DetailField icon={Phone} label="Telefone" value={titular?.telefone} />
            <DetailField icon={Mail} label="E-mail" value={titular?.email || detalhe?.email} />
            <DetailField icon={MapPin} label="Endereço" value={formatAddress(titular?.endereco || detalhe?.endereco)} />
          </div>

          <DetailSectionTitle>Venda</DetailSectionTitle>
          <div className="grid gap-2 sm:grid-cols-2">
            <DetailField icon={Package} label="Produto(s)" value={produtos.map((p) => p.descricao).filter(Boolean).join(" + ")} />
            <DetailField icon={CreditCard} label="Plano de pagamento" value={detalhe?.plano_pagamento} />
            <DetailField icon={CreditCard} label="Valor total dos itens" value={produtos.length ? formatMoney(total) : null} />
            {state.produto && <DetailField icon={ShoppingBag} label="Resumo do ERP" value={state.produto} />}
          </div>

          {produtos.length > 0 && (
            <>
              <DetailSectionTitle count={produtos.length}>Produtos adquiridos</DetailSectionTitle>
              <div className="space-y-2">
                {produtos.map((produto, index) => (
                  <div key={`${produto.descricao || "produto"}-${index}`} className="flex items-start gap-2.5 rounded-xl border border-slate-100 bg-white p-2.5 dark:border-gray-800 dark:bg-gray-900">
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400">
                      <ShoppingBag className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 text-[12px] text-slate-500 dark:text-slate-400">
                      <div className="font-semibold text-slate-700 dark:text-slate-200">{produto.descricao || "Produto sem descrição"}</div>
                      <div className="mt-0.5">
                        {produto.quantidade != null ? `Quantidade: ${produto.quantidade}` : "Quantidade não informada"}
                        {produto.preco != null ? ` · Unitário: ${formatMoney(produto.preco)}` : ""}
                        {produto.valor_total != null ? ` · Total: ${formatMoney(produto.valor_total)}` : ""}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          <DetailSectionTitle count={beneficiarios.length}>Beneficiários / inscritos</DetailSectionTitle>
          {beneficiarios.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-white py-4 text-center text-[12px] text-slate-400 dark:border-gray-800 dark:bg-gray-900">
              Nenhum beneficiário ou inscrito retornado pelo ERP.
            </div>
          ) : (
            <div className="space-y-2">
              {beneficiarios.map((pessoa, index) => (
                <div key={`${pessoa.nome || "beneficiario"}-${index}`} className="flex items-start gap-2.5 rounded-xl border border-slate-100 bg-white p-2.5 dark:border-gray-800 dark:bg-gray-900">
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400">
                    <Users className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 text-[12px] text-slate-500 dark:text-slate-400">
                    <div className="font-semibold text-slate-700 dark:text-slate-200">{pessoa.nome || "Nome não informado"}</div>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                      {pessoa.cpf && <span>CPF: {formatCpf(pessoa.cpf)}</span>}
                      {pessoa.parentesco && <span>Parentesco: {pessoa.parentesco}</span>}
                      {pessoa.data_nascimento && <span>Nasc.: {formatDateOnly(pessoa.data_nascimento)}</span>}
                    </div>
                    {pessoa.produtos?.length > 0 && <div className="mt-0.5 truncate">{pessoa.produtos.join(" · ")}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <DetailSectionTitle count={state.documentos.length}>Documentos disponíveis</DetailSectionTitle>
      {state.documentos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white py-4 text-center text-[12px] text-slate-400 dark:border-gray-800 dark:bg-gray-900">
          Nenhum documento anexado a este orçamento.
        </div>
      ) : (
        <div className="space-y-2">
          {state.documentos.map((documento) => (
            <div key={documento.id} className="flex items-center gap-2.5 rounded-xl border border-slate-100 bg-white p-2.5 dark:border-gray-800 dark:bg-gray-900">
              <FileText className="h-4 w-4 shrink-0 text-violet-500" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] font-semibold text-slate-700 dark:text-slate-200">{DOC_LABELS[documento.tipo] || documento.tipo}</div>
                <div className="truncate text-[11px] text-slate-400" title={documento.original_name || ""}>{documento.original_name || "Arquivo sem nome"}</div>
              </div>
              <button
                type="button"
                onClick={() => onViewDocument(documento)}
                disabled={viewingId === documento.id}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-violet-600 px-2.5 py-1.5 text-[11.5px] font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
              >
                {viewingId === documento.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                Visualizar
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Modal de ação sobre uma verificação: concluir, devolver (5 motivos + prazo 3 dias),
// congelar (reavaliação reprovada) e decisão final de cancelamento no ERP.
function AcaoModal({ item, motivos, onClose, onChanged }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(null);
  const [motivo, setMotivo] = useState("");
  const [obs, setObs] = useState("");
  const [cancelMotivo, setCancelMotivo] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [viewingId, setViewingId] = useState(null);
  const [detailState, setDetailState] = useState({
    status: "loading",
    detalhe: null,
    produto: null,
    documentos: [],
    error: null,
  });

  const loadDetail = useCallback(async () => {
    setDetailState({
      status: "loading",
      detalhe: null,
      produto: null,
      documentos: [],
      error: null,
    });
    try {
      const res = await fetch(`${API_BASE}/postsales/${item.id}/detalhe`, { headers: authHeaders() });
      if (!res.ok) {
        throw new Error(await extractApiError(res, "Falha ao carregar os dados do orçamento."));
      }
      const data = await res.json().catch(() => ({}));
      setDetailState({
        status: data.detail_status || (data.detalhe ? "ok" : "empty"),
        detalhe: data.detalhe || null,
        produto: data.produto || null,
        documentos: Array.isArray(data.documentos) ? data.documentos : [],
        error: data.detail_error || null,
      });
    } catch (e) {
      setDetailState({
        status: "error",
        detalhe: null,
        produto: null,
        documentos: [],
        error: e.message,
      });
    }
  }, [item.id]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => { loadDetail(); }, [loadDetail]);

  const handleViewDocument = async (documento) => {
    setViewingId(documento.id);
    try {
      const res = await fetch(`${API_BASE}/orcamento-documentos/${documento.id}/download`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(await extractApiError(res, "Falha ao abrir o documento."));
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      window.open(objectUrl, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    } catch (e) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setViewingId(null);
    }
  };

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
  const titular = Array.isArray(detailState.detalhe?.pessoas)
    ? detailState.detalhe.pessoas.find((p) => p.is_titular)
    : null;
  const displayName = titular?.nome
    || item.cliente_nome
    || (detailState.status === "loading" ? "Consultando cliente…" : "Nome não informado");

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
              <p className="text-[12px] text-violet-100/90">{displayName} · {item.modulo_nome}</p>
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

          <PostSalesDetail
            item={item}
            state={detailState}
            onRetry={loadDetail}
            onViewDocument={handleViewDocument}
            viewingId={viewingId}
          />

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
  const [initialFilters] = useState(() => ({
    startDate: monthStartISO(),
    endDate: todayISO(),
  }));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("fila");
  const [startDate, setStartDate] = useState(initialFilters.startDate);
  const [endDate, setEndDate] = useState(initialFilters.endDate);
  const [appliedDates, setAppliedDates] = useState(initialFilters);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [trilhaDe, setTrilhaDe] = useState(null);

  const load = useCallback(async ({ startDate: requestedStartDate, endDate: requestedEndDate } = {}) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status: "todos" });
      if (requestedStartDate) params.set("start_date", requestedStartDate);
      if (requestedEndDate) params.set("end_date", requestedEndDate);
      const res = await fetch(`${API_BASE}/postsales/fila?${params}`, { headers: authHeaders() });
      if (!res.ok) throw new Error(await extractApiError(res, "Falha ao carregar a fila."));
      const json = await res.json().catch(() => ({}));
      setData(json);
      return true;
    } catch (e) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
      setData(null);
      return false;
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const refresh = useCallback(() => load(appliedDates), [appliedDates, load]);

  useEffect(() => { load(initialFilters); }, [initialFilters, load]);

  const handleApply = async () => {
    if (!isValidDateRange(startDate, endDate)) {
      toast({
        title: "Período inválido",
        description: "A data inicial não pode ser posterior à data final.",
        variant: "destructive",
      });
      return;
    }
    const nextDates = { startDate, endDate };
    const loaded = await load(nextDates);
    if (loaded) setAppliedDates(nextDates);
  };

  const items = useMemo(() => data?.items || [], [data]);
  const counts = data?.counts || {};
  const filtered = useMemo(() => {
    const byTab = tab === "todos" ? items : items.filter((item) => item.status === tab);
    return byTab.filter((item) => matchesPostSalesSearch(item, search));
  }, [items, search, tab]);
  const hasSearch = Boolean(search.trim());

  return (
    <div className="min-h-screen -m-3 bg-gradient-to-b from-slate-50 to-white p-4 dark:from-gray-950 dark:to-gray-950 md:-m-6 md:p-6">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-3.5">
        <Hero
          icon={ClipboardCheck}
          title="Fila Pós-Vendas"
          subtitle="Verifique os orçamentos aprovados no Pré-venda: conclua, devolva ao coordenador ou registre a decisão final."
          onRefresh={refresh}
          loading={loading}
        />

        <div className="flex flex-wrap items-end gap-2.5 rounded-2xl bg-white/80 px-4 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ring-1 ring-slate-200/70 backdrop-blur dark:bg-gray-900/80 dark:ring-gray-800">
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1 text-[10.5px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
              <Calendar className="h-3 w-3 text-violet-500" /> De
            </Label>
            <Input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className="h-9 w-[150px] border-slate-200 dark:border-gray-800"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1 text-[10.5px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
              <Calendar className="h-3 w-3 text-violet-500" /> Até
            </Label>
            <Input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className="h-9 w-[150px] border-slate-200 dark:border-gray-800"
            />
          </div>
          <div className="min-w-[200px] flex-1 space-y-1.5">
            <Label className="text-[10.5px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Busca rápida
            </Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Nº, CPF, cliente ou vendedor"
                className="h-9 border-slate-200 pl-9 pr-9 dark:border-gray-800"
              />
              {hasSearch && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Limpar busca rápida"
                  className="absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-gray-800 dark:hover:text-slate-200"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
          <Button
            onClick={handleApply}
            disabled={loading}
            size="sm"
            className="h-9 bg-[linear-gradient(135deg,#7C3AED,#9333EA)] text-white shadow-sm transition-all duration-200 hover:brightness-110"
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
            Aplicar
          </Button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
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
          <span className="shrink-0 text-[11.5px] font-medium tabular-nums text-slate-400 dark:text-slate-500">
            {filtered.length} {filtered.length === 1 ? "registro" : "registros"} na lista
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-100 bg-white py-16 text-slate-400 dark:border-gray-800 dark:bg-gray-900">
            <Loader2 className="h-5 w-5 animate-spin" /> Carregando…
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center dark:border-gray-800 dark:bg-gray-900">
            <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-400" />
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
              {items.length === 0
                ? "Nenhum registro no período selecionado."
                : hasSearch
                  ? `Nenhum resultado para “${search.trim()}”.`
                  : "Nenhum registro nesta etapa no período selecionado."}
            </p>
            {hasSearch && items.length > 0 && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="mt-2 text-xs font-semibold text-violet-600 hover:text-violet-700 dark:text-violet-400"
              >
                Limpar busca
              </button>
            )}
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
          onChanged={refresh}
        />
      )}
      {trilhaDe && <TrilhaModal item={trilhaDe} onClose={() => setTrilhaDe(null)} />}
    </div>
  );
}
