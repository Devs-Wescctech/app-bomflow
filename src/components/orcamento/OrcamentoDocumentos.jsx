import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  FileText,
  Upload,
  Trash2,
  Eye,
  Loader2,
  RefreshCw,
  CheckCircle2,
  ShieldCheck,
  ChevronRight,
  Calendar,
  Package,
  X,
  MapPin,
  Save,
  AlertTriangle,
  Search,
  ExternalLink,
} from "lucide-react";
import { extractApiError } from "@/utils/apiError";
import { DOC_TIPOS, getRequiredDocTipos, isDocumentUploadAllowed } from "@/utils/orcamentoDocumentos";
import PostsalesCorrectionModal from "@/components/postsales/PostsalesCorrectionModal";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const ACCEPT = ".pdf,.jpg,.jpeg,.png";
const MAX_BYTES = 15 * 1024 * 1024;

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
});

function formatBytes(bytes) {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const docFor = (orc, tipo) => (orc.documentos || []).find((d) => d.tipo === tipo) || null;
const loadedCount = (orc) => getRequiredDocTipos(orc.adesao_zero)
  .filter(({ tipo }) => docFor(orc, tipo)).length;
const totalCount = (orc) => getRequiredDocTipos(orc.adesao_zero).length;

const MOTION_CSS = `
@keyframes od-enter {
  from { opacity: 0; transform: translateY(14px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes od-backdrop {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes od-modal {
  from { opacity: 0; transform: translateY(18px) scale(0.97); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes od-bar {
  from { transform: scaleX(0); }
  to { transform: scaleX(1); }
}
@media (prefers-reduced-motion: reduce) {
  [style*="od-enter"], [style*="od-modal"], [style*="od-backdrop"], [style*="od-bar"] {
    animation: none !important;
    opacity: 1 !important;
    transform: none !important;
  }
}
`;

/* ---------------------------- list pieces ---------------------------- */

function DocCounter({ loaded, total }) {
  const complete = loaded === total;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold ${
        complete
          ? "bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-400 dark:ring-emerald-900"
          : "bg-amber-50 text-amber-600 ring-1 ring-amber-100 dark:bg-amber-950/40 dark:text-amber-400 dark:ring-amber-900"
      }`}
    >
      {complete ? <CheckCircle2 className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
      {loaded}/{total}
    </span>
  );
}

function AdesaoChip({ value }) {
  const map = {
    true: {
      label: "Adesão Zero",
      cls: "bg-violet-50 text-violet-600 ring-violet-100 dark:bg-violet-950/40 dark:text-violet-400 dark:ring-violet-900",
    },
    false: {
      label: "Sem adesão",
      cls: "bg-gray-100 text-gray-500 ring-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-700",
    },
  };
  const cfg = map[String(value)];
  if (!cfg) return null;
  return (
    <span
      className={`hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium ring-1 sm:inline-flex ${cfg.cls}`}
    >
      <ShieldCheck className="h-3.5 w-3.5" />
      {cfg.label}
    </span>
  );
}

function OrcamentoRow({ orc, index, onOpen }) {
  const loaded = loadedCount(orc);
  const total = totalCount(orc);
  const numero = orc.erp_numero || orc.erp_pedido_id;
  const dataCriacao = orc.created_at
    ? new Date(orc.created_at).toLocaleDateString("pt-BR")
    : null;
  return (
    <button
      type="button"
      onClick={() => onOpen(orc)}
      style={{ animation: "od-enter 450ms cubic-bezier(0.16,1,0.3,1) both", animationDelay: `${80 + index * 60}ms` }}
      className="group flex w-full items-center gap-4 rounded-xl border border-gray-100 bg-white px-4 py-3.5 text-left transition-all duration-200 hover:-translate-y-px hover:border-teal-300/70 hover:shadow-[0_10px_30px_-18px_rgba(15,118,110,0.35)] dark:border-gray-700 dark:bg-gray-900 dark:hover:border-teal-700/60"
    >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-50 to-cyan-50 text-teal-700 ring-1 ring-teal-100 dark:from-teal-950/40 dark:to-cyan-950/30 dark:text-teal-300 dark:ring-teal-900">
        <FileText className="h-5 w-5" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-900 transition-colors duration-200 group-hover:text-teal-700 dark:text-gray-100 dark:group-hover:text-teal-300">
            Nº {numero}
          </span>
          {dataCriacao && (
            <span className="hidden items-center gap-1 text-[12.5px] text-gray-400 sm:inline-flex dark:text-gray-500">
              <Calendar className="h-3.5 w-3.5" />
              {dataCriacao}
            </span>
          )}
        </div>
        {orc.produto && (
          <div className="mt-0.5 flex items-center gap-1.5 truncate text-[13px] text-gray-500 dark:text-gray-400">
            <Package className="h-3.5 w-3.5 shrink-0 text-gray-400 dark:text-gray-500" />
            <span className="truncate">{orc.produto}</span>
          </div>
        )}
      </div>

      <AdesaoChip value={orc.adesao_zero} />
       <DocCounter loaded={loaded} total={total} />

      <ChevronRight className="h-5 w-5 shrink-0 text-gray-300 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-teal-500 dark:text-gray-600" />
    </button>
  );
}

/* ---------------------------- modal pieces ---------------------------- */

function SegToggle({ value, disabled, onChange }) {
  const options = [
    { label: "Sim", v: true },
    { label: "Não", v: false },
  ];
  return (
    <div className="flex rounded-lg bg-gray-100 p-0.5 dark:bg-gray-800">
      {options.map((opt) => {
        const active = value === opt.v;
        return (
          <button
            key={opt.label}
            type="button"
            disabled={disabled}
            onClick={() => onChange(opt.v)}
            className={`rounded-md px-5 py-1.5 text-[13px] font-medium transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60 ${
              active
                ? "bg-white text-violet-700 shadow-sm dark:bg-gray-900 dark:text-violet-300"
                : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function DocSlot({ label, doc, canManage, canUpload = true, uploading, deleting, onView, onUpload, onDelete }) {
  if (doc) {
    return (
      <div className="rounded-xl border border-gray-100 bg-white p-4 ring-1 ring-transparent transition-all duration-200 hover:ring-emerald-100 dark:border-gray-700 dark:bg-gray-900 dark:hover:ring-emerald-900">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
          <span className="text-[13px] font-semibold text-gray-800 dark:text-gray-200">{label}</span>
        </div>
        <p className="mt-1.5 truncate text-[12px] text-gray-400 dark:text-gray-500" title={doc.original_name}>
          {doc.original_name} · {formatBytes(doc.size_bytes)}
        </p>
        <div className="mt-3 flex items-center justify-between border-t border-gray-50 pt-2.5 dark:border-gray-800">
          <button
            type="button"
            onClick={onView}
            className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-violet-600 transition-colors duration-200 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300"
          >
            <Eye className="h-3.5 w-3.5" /> Visualizar
          </button>
          {canManage && (
            <div className="flex items-center gap-1">
              {canUpload && (
                <button
                  type="button"
                  title="Reenviar"
                  aria-label="Reenviar documento"
                  disabled={uploading}
                  onClick={onUpload}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 transition-colors duration-200 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-60 dark:hover:bg-gray-800 dark:hover:text-gray-300"
                >
                  {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                </button>
              )}
              <button
                type="button"
                title="Excluir"
                aria-label="Excluir documento"
                disabled={deleting}
                onClick={onDelete}
                className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 transition-colors duration-200 hover:bg-red-50 hover:text-red-500 disabled:opacity-60 dark:hover:bg-red-950/40"
              >
                {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/40 p-4 dark:border-gray-700 dark:bg-gray-800/40">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 shrink-0 text-gray-300 dark:text-gray-600" />
        <span className="text-[13px] font-semibold text-gray-500 dark:text-gray-400">{label}</span>
      </div>
      {canManage && canUpload ? (
        <button
          type="button"
          disabled={uploading}
          onClick={onUpload}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-violet-200 py-2.5 text-[12.5px] font-medium text-violet-600 transition-all duration-200 hover:border-violet-300 hover:bg-violet-50 disabled:opacity-60 dark:border-violet-800 dark:text-violet-400 dark:hover:bg-violet-950/30"
        >
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          Enviar arquivo
        </button>
      ) : (
        <p className="mt-3 text-[12px] text-gray-400 dark:text-gray-500">
          {canUpload ? "Nenhum arquivo enviado" : "Não aplicável com Adesão Zero"}
        </p>
      )}
    </div>
  );
}

const EMPTY_ADDRESS = {
  cep: "",
  logradouro: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
};

function inferAdjustmentType(ajuste) {
  if (ajuste?.tipo_ajuste === "endereco" || ajuste?.tipo_ajuste === "cadastro") return ajuste.tipo_ajuste;
  return /endere[cç]o|cep|cidade|munic[ií]pio|uf|logradouro|bairro|complemento|resid[eê]ncia|rua|avenida|n[úu]mero\s+(?:do\s+endere[cç]o|da\s+(?:casa|resid[eê]ncia))/i.test(ajuste?.texto || "") ? "endereco" : "cadastro";
}

function OrcamentoModal({
  orc,
  canManage,
  busyKey,
  fileInputs,
  onClose,
  onView,
  onDelete,
  onAdesao,
  adjustmentContext,
  addressForm,
  addressSaving,
  onAddressChange,
  onAddressSave,
  cityOptions,
  cityOpen,
  cityLoading,
  onCitySearch,
  onCitySelect,
  selectedCity,
  onCityFocus,
  onCityClose,
  onOpenCadastro,
}) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const loaded = loadedCount(orc);
  const total = totalCount(orc);
  const pct = Math.round((loaded / total) * 100);
  const complete = loaded === total;
  const numero = orc.erp_numero || orc.erp_pedido_id;
  const dataCriacao = orc.created_at
    ? new Date(orc.created_at).toLocaleDateString("pt-BR")
    : null;
  const azBusy = busyKey === `az:${orc.erp_pedido_id}`;
  const adjustmentType = inferAdjustmentType(adjustmentContext?.ajuste);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        onClick={onClose}
        style={{ animation: "od-backdrop 220ms ease-out both" }}
        className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Orçamento Nº ${numero}`}
        style={{ animation: "od-modal 320ms cubic-bezier(0.16,1,0.3,1) both" }}
        className="relative z-10 flex max-h-[92vh] w-full max-w-[640px] flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl dark:bg-gray-900"
      >
        {/* header */}
        <div className="relative shrink-0 overflow-hidden border-b border-gray-100 px-6 py-5 dark:border-gray-700">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_120%_at_0%_0%,rgba(167,139,250,0.10),transparent)]" />
          <div className="relative flex items-start justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-100 text-violet-600 dark:bg-violet-950/50 dark:text-violet-400">
                <FileText className="h-[18px] w-[18px]" />
              </div>
              <div>
                <h2 className="text-[17px] font-bold leading-tight text-gray-900 dark:text-gray-100">
                  Orçamento Nº {numero}
                </h2>
                <p className="text-[12.5px] text-gray-400 dark:text-gray-500">
                  {dataCriacao ? `Criado em ${dataCriacao}` : "Orçamento"}
                  {orc.produto ? ` · ${orc.produto}` : ""}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Fechar"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors duration-200 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
            >
              <X className="h-[18px] w-[18px]" />
            </button>
          </div>

          {/* progresso documentos */}
          <div className="relative mt-4">
            <div className="flex items-center justify-between text-[12px]">
              <span className="font-medium text-gray-500 dark:text-gray-400">
                {loaded} de {total} documentos
              </span>
              <span className={`font-semibold ${complete ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                {pct}%
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
              <div
                style={{ width: `${pct}%`, animation: "od-bar 700ms ease-out both", transformOrigin: "left" }}
                className={`h-full rounded-full ${complete ? "bg-emerald-500" : "bg-gradient-to-r from-violet-500 to-fuchsia-500"}`}
              />
            </div>
          </div>
        </div>

        {/* body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {adjustmentContext?.ajuste && (
            <section className="mb-5 rounded-2xl border border-amber-200 bg-white p-4 shadow-sm dark:border-amber-900 dark:bg-gray-900">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    Ajuste solicitado pela auditoria
                  </h3>
                  <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-gray-600 dark:text-gray-300">
                    {adjustmentContext.ajuste.texto}
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <span className="rounded-md border border-slate-300 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:border-gray-700 dark:text-slate-300">
                      {adjustmentType === "endereco" ? "Corrigir no endereço do orçamento" : "Corrigir no cadastro completo"}
                    </span>
                  </div>
                </div>
              </div>
            </section>
          )}
          {adjustmentContext?.ajustes?.length > 1 && (
            <section className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Solicitações deste orçamento</h3>
                <span className="text-[11px] text-slate-400">{adjustmentContext.ajustes.length} no total</span>
              </div>
              <div className="space-y-2">
                {adjustmentContext.ajustes.map((item) => {
                  const type = inferAdjustmentType(item);
                  return (
                    <div key={item.id} className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-gray-700 dark:bg-gray-900">
                      <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${item.status === "ajustado" ? "bg-teal-600" : "bg-amber-500"}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">{type === "endereco" ? "Endereço do orçamento" : "Cadastro completo da venda"}</span>
                          <span className="text-[10px] text-slate-400">{item.status === "ajustado" ? "Concluído" : "Pendente"}</span>
                        </div>
                        <p className="mt-0.5 text-[12px] text-slate-500 dark:text-slate-400">{item.texto}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {adjustmentContext?.ajuste && adjustmentType === "endereco" && (
            <section className="mb-5 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900">
              <div className="mb-4 flex items-start gap-3">
                <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-teal-700 dark:text-teal-400" />
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    Endereço do orçamento
                  </h3>
                  <p className="mt-0.5 text-[12px] text-gray-500 dark:text-gray-400">
                    Estes dados são gravados no pedido existente do ERP.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {[
                  ["cep", "CEP"],
                  ["logradouro", "Logradouro"],
                  ["numero", "Número"],
                  ["complemento", "Complemento"],
                  ["bairro", "Bairro"],
                  ["cidade", "Cidade - UF"],
                ].map(([field, label]) => (
                  <label key={field} className={field === "logradouro" ? "sm:col-span-2" : ""}>
                    <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      {label}{field !== "complemento" ? " *" : ""}
                    </span>
                    {field === "cidade" ? (
                      <div className="relative">
                        <div className="relative">
                          <input
                            type="text"
                            role="combobox"
                            aria-autocomplete="list"
                            aria-expanded={cityOpen}
                            value={addressForm[field] || ""}
                            onChange={(event) => onCitySearch(event.target.value)}
                            onFocus={onCityFocus}
                            onBlur={onCityClose}
                            disabled={!canManage || addressSaving}
                            placeholder="Digite ao menos 2 letras"
                            className="eloom-field w-full pr-9"
                          />
                          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        </div>
                        {cityOpen && (
                          <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-900">
                            {cityLoading ? <div className="px-3 py-2 text-xs text-gray-400">Consultando cidades do ERP…</div> : addressForm.cidade.trim().length < 2 ? <div className="px-3 py-2 text-xs text-gray-400">Digite ao menos 2 letras para pesquisar.</div> : cityOptions.length ? cityOptions.map((city) => (
                              <button key={city.id} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => onCitySelect(city)} className="w-full rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-accent dark:text-gray-200">{city.cidade}</button>
                            )) : <div className="px-3 py-2 text-xs text-gray-400">Nenhuma cidade encontrada no ERP.</div>}
                          </div>
                        )}
                        {!!addressForm[field] && selectedCity !== addressForm[field] && <p className="mt-1 text-[11px] text-red-600">Selecione uma cidade da lista do ERP.</p>}
                      </div>
                    ) : <input type="text" value={addressForm[field] || ""} onChange={(event) => onAddressChange(field, event.target.value)} disabled={!canManage || addressSaving} className="eloom-field w-full" />}
                  </label>
                ))}
              </div>
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={onAddressSave}
                  disabled={!canManage || addressSaving || selectedCity !== addressForm.cidade}
                  className="action-pill-primary"
                >
                  {addressSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Salvar endereço no orçamento
                </button>
              </div>
            </section>
          )}
          {adjustmentContext?.ajuste && adjustmentType === "cadastro" && (
            <section className="mb-5 flex flex-col gap-4 rounded-2xl border border-violet-200 bg-violet-50 p-4 dark:border-violet-900/60 dark:bg-violet-950/20 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Correção no cadastro completo</h3>
                <p className="mt-1 text-[12px] leading-relaxed text-gray-600 dark:text-gray-300">Abra a venda exata no cadastro para corrigir os dados solicitados. Depois, volte aqui e marque este ajuste como concluído.</p>
              </div>
              <button type="button" onClick={onOpenCadastro} className="action-pill-primary min-h-11 w-full shrink-0 px-5 text-sm sm:w-auto sm:min-w-[176px]">
                <ExternalLink className="action-pill-icon h-4 w-4" /> Abrir cadastro completo
              </button>
            </section>
          )}

          {/* Adesão Zero */}
          <div className="flex items-center justify-between gap-4 rounded-xl border border-violet-100 bg-violet-50/50 px-4 py-3 dark:border-violet-900 dark:bg-violet-950/20">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="h-5 w-5 text-violet-600 dark:text-violet-400" />
              <p className="text-[13.5px] font-semibold text-gray-900 dark:text-gray-100">
                Adesão Zero <span className="text-red-500">*</span>
              </p>
            </div>
            <SegToggle
              value={orc.adesao_zero}
              disabled={!canManage || azBusy}
              onChange={(v) => onAdesao(orc, v)}
            />
          </div>

          {/* documentos */}
          <div className="mt-5">
            <div className="mb-2.5 flex items-center justify-between">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400 dark:text-gray-500">
                Documentos
              </h3>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {DOC_TIPOS.map(({ tipo, label }) => {
                const doc = docFor(orc, tipo);
                const inputKey = `${orc.erp_pedido_id}:${tipo}`;
                return (
                  <DocSlot
                    key={tipo}
                    label={label}
                    doc={doc}
                    canManage={canManage}
                    canUpload={isDocumentUploadAllowed(tipo, orc.adesao_zero)}
                    uploading={busyKey === inputKey}
                    deleting={doc && busyKey === `del:${doc.id}`}
                    onView={() => onView(doc)}
                    onUpload={() => fileInputs.current[inputKey]?.click()}
                    onDelete={() => onDelete(doc)}
                  />
                );
              })}
            </div>
          </div>

          <p className="mt-4 text-[11px] text-gray-400 dark:text-gray-500">
            Formatos aceitos: PDF, JPG ou PNG (até 15 MB). Os documentos são privados e
            acessíveis apenas a usuários autorizados.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------- skeleton ---------------------------- */

function ListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 rounded-xl border border-gray-100 px-4 py-3.5 dark:border-gray-700"
        >
          <div className="h-11 w-11 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-40 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
            <div className="h-3 w-56 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
          </div>
          <div className="h-6 w-16 animate-pulse rounded-full bg-gray-100 dark:bg-gray-800" />
        </div>
      ))}
    </div>
  );
}

/* ---------------------------- component ---------------------------- */

/**
 * Documentos & Adesão Zero por orçamento do lead.
 * Props:
 *  - modulo: 'sales' | 'sales_pj' | 'sales_upsell' | 'referral'
 *  - cpf: documento do cliente (CPF/CNPJ) para localizar os orçamentos
 *  - leadId: id do lead (vínculo do documento ao lead)
 *  - canManage: se o usuário pode enviar/reenviar/excluir e marcar Adesão Zero
 */
export default function OrcamentoDocumentos({
  modulo,
  cpf,
  leadId,
  canManage = false,
  ajusteId = null,
  initialSelectedId = null,
  hideList = false,
  onModalClose,
}) {
  const [orcamentos, setOrcamentos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyKey, setBusyKey] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [adjustmentContext, setAdjustmentContext] = useState(null);
  const [addressForm, setAddressForm] = useState(EMPTY_ADDRESS);
  const [addressSaving, setAddressSaving] = useState(false);
  const [correctionItem, setCorrectionItem] = useState(null);
  const [cityOptions, setCityOptions] = useState([]);
  const [cityOpen, setCityOpen] = useState(false);
  const [cityLoading, setCityLoading] = useState(false);
  const [selectedCity, setSelectedCity] = useState("");
  const [deleteDoc, setDeleteDoc] = useState(null);
  const citySearchTimer = useRef(null);
  const citySearchSequence = useRef(0);
  const fileInputs = useRef({});

  const fetchOrcamentos = useCallback(async () => {
    if (!modulo || (!cpf && !leadId)) {
      setOrcamentos([]);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({ modulo });
      if (cpf) params.set("cpf", cpf);
      if (leadId) params.set("lead_id", leadId);
      const res = await fetch(
        `/api/orcamento-documentos/orcamentos?${params.toString()}`,
        { headers: authHeaders() }
      );
      if (!res.ok) throw new Error(await extractApiError(res, "Falha ao carregar orçamentos"));
      const data = await res.json();
      setOrcamentos(Array.isArray(data.items) ? data.items : []);
      const requestedId = Number(initialSelectedId);
      if (Number.isSafeInteger(requestedId) && requestedId > 0) {
        setSelectedId(requestedId);
      }
    } catch (e) {
      console.error("[OrcamentoDocumentos] fetch error:", e);
      toast.error("Não foi possível carregar os orçamentos.");
    } finally {
      setLoading(false);
    }
  }, [cpf, initialSelectedId, leadId, modulo]);

  useEffect(() => {
    fetchOrcamentos();
  }, [fetchOrcamentos]);

  const fetchAdjustmentContext = useCallback(async () => {
    if (!ajusteId) {
      setAdjustmentContext(null);
      setAddressForm(EMPTY_ADDRESS);
      return;
    }
    try {
      const res = await fetch(`/api/presales-ajustes/${ajusteId}/context`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(await extractApiError(res, "Falha ao carregar o ajuste"));
      const data = await res.json();
      setAdjustmentContext(data);
      setAddressForm({ ...EMPTY_ADDRESS, ...(data.endereco || {}) });
      setSelectedCity(data.endereco?.cidade || "");
    } catch (error) {
      toast.error(error.message || "Não foi possível carregar o ajuste solicitado.");
    }
  }, [ajusteId]);

  useEffect(() => {
    fetchAdjustmentContext();
  }, [fetchAdjustmentContext]);

  // Recarrega a lista quando um orçamento é criado no formulário irmão (mesmo módulo),
  // para o orçamento recém-criado já aparecer com os campos de upload + Adesão Zero.
  useEffect(() => {
    const handler = (e) => {
      if (!e?.detail?.modulo || e.detail.modulo === modulo) fetchOrcamentos();
    };
    window.addEventListener("orcamento:created", handler);
    return () => window.removeEventListener("orcamento:created", handler);
  }, [modulo, fetchOrcamentos]);

  // Mantém o modal em sincronia com os dados após cada refetch (docs/adesão atualizados).
  const selected = selectedId != null
    ? orcamentos.find((o) => Number(o.erp_pedido_id) === Number(selectedId)) || null
    : null;

  async function handleUpload(orc, tipo, file) {
    if (!file) return;
    if (!isDocumentUploadAllowed(tipo, orc.adesao_zero)) {
      toast.error("A taxa de adesão não pode ser anexada quando Adesão Zero está marcada como Sim.");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Arquivo muito grande (máximo 15 MB).");
      return;
    }
    const key = `${orc.erp_pedido_id}:${tipo}`;
    setBusyKey(key);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("tipo", tipo);
      fd.append("erp_pedido_id", String(orc.erp_pedido_id));
      fd.append("modulo", modulo);
      if (leadId) fd.append("lead_id", String(leadId));

      const res = await fetch("/api/orcamento-documentos", {
        method: "POST",
        headers: authHeaders(),
        body: fd,
      });
      if (!res.ok) throw new Error(await extractApiError(res, "Falha no envio"));
      const data = await res.json().catch(() => ({}));
      toast.success("Documento enviado.");
      await fetchOrcamentos();
    } catch (e) {
      toast.error(e.message || "Falha ao enviar documento.");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleView(doc) {
    if (!doc) return;
    try {
      const res = await fetch(`/api/orcamento-documentos/${doc.id}/download`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(await extractApiError(res, "Falha ao abrir documento"));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      toast.error(e.message || "Não foi possível abrir o documento.");
    }
  }

  async function handleDelete(doc) {
    if (!doc) return;
    const key = `del:${doc.id}`;
    setBusyKey(key);
    try {
      const res = await fetch(`/api/orcamento-documentos/${doc.id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(await extractApiError(res, "Falha ao excluir"));
      const data = await res.json().catch(() => ({}));
      toast.success("Documento excluído.");
      await fetchOrcamentos();
    } catch (e) {
      toast.error(e.message || "Falha ao excluir documento.");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleAdesaoZero(orc, value) {
    const key = `az:${orc.erp_pedido_id}`;
    setBusyKey(key);
    try {
      const res = await fetch("/api/orcamento-documentos/adesao-zero", {
        method: "PUT",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ erp_pedido_id: orc.erp_pedido_id, adesao_zero: value }),
      });
      if (!res.ok) throw new Error(await extractApiError(res, "Falha ao salvar"));
      const data = await res.json().catch(() => ({}));
      toast.success("Adesão Zero atualizada.");
      await fetchOrcamentos();
    } catch (e) {
      toast.error(e.message || "Falha ao salvar Adesão Zero.");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleAddressSave() {
    if (!ajusteId) return;
    if (!selectedCity || selectedCity !== addressForm.cidade) {
      toast.error("Selecione uma cidade válida na lista do ERP.");
      return;
    }
    setAddressSaving(true);
    try {
      const res = await fetch(`/api/presales-ajustes/${ajusteId}/endereco`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(addressForm),
      });
      if (!res.ok) throw new Error(await extractApiError(res, "Falha ao salvar o endereço"));
      const data = await res.json();
      setAddressForm({ ...EMPTY_ADDRESS, ...(data.endereco || {}) });
      toast.success("Endereço do orçamento atualizado no ERP.");
      await fetchAdjustmentContext();
    } catch (error) {
      toast.error(error.message || "Não foi possível atualizar o endereço.");
    } finally {
      setAddressSaving(false);
    }
  }

  const loadCityOptions = useCallback((value, immediate = false) => {
    setCityOpen(true);
    window.clearTimeout(citySearchTimer.current);
    if (value.trim().length < 2) {
      setCityOptions([]);
      setCityLoading(false);
      return;
    }
    const sequence = ++citySearchSequence.current;
    citySearchTimer.current = window.setTimeout(async () => {
      setCityLoading(true);
      try {
        const res = await fetch(`/api/presales-ajustes/cidades?search=${encodeURIComponent(value)}`, { headers: authHeaders() });
        if (!res.ok) throw new Error(await extractApiError(res, "Falha ao consultar cidades"));
        const data = await res.json();
        if (sequence === citySearchSequence.current) {
          setCityOptions(Array.isArray(data.items) ? data.items : []);
        }
      } catch (error) {
        if (sequence === citySearchSequence.current) {
          setCityOptions([]);
          toast.error(error.message || "Não foi possível consultar as cidades do ERP.");
        }
      } finally {
        if (sequence === citySearchSequence.current) setCityLoading(false);
      }
    }, immediate ? 0 : 250);
  }, []);

  const searchCities = useCallback((value) => {
    setAddressForm((current) => ({ ...current, cidade: value }));
    setSelectedCity((current) => current === value ? current : "");
    loadCityOptions(value);
  }, [loadCityOptions]);

  const openCityOptions = useCallback(() => {
    loadCityOptions(addressForm.cidade || "", true);
  }, [addressForm.cidade, loadCityOptions]);

  const closeCityOptions = useCallback(() => {
    window.setTimeout(() => setCityOpen(false), 120);
  }, []);

  useEffect(() => () => {
    window.clearTimeout(citySearchTimer.current);
    citySearchSequence.current += 1;
  }, []);

  const selectCity = useCallback((city) => {
    setAddressForm((current) => ({ ...current, cidade: city.cidade }));
    setSelectedCity(city.cidade);
    setCityOpen(false);
  }, []);

  const openCadastro = useCallback(() => {
    if (!ajusteId || !adjustmentContext?.ajuste) return;
    setSelectedId(null);
    setCorrectionItem({
      id: ajusteId,
      erp_pedido_id: adjustmentContext.ajuste.erp_pedido_id,
      erp_numero: adjustmentContext.ajuste.erp_numero,
      motivo_devolucao_nome: "Cadastro completo da venda",
      devolucao_obs: adjustmentContext.ajuste.texto,
    });
  }, [adjustmentContext, ajusteId]);

  return (
    <div className={hideList ? "" : "mt-6 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900"}>
      <style>{MOTION_CSS}</style>

      {!hideList && (
      <>
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-gray-700">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-100 text-violet-600 dark:bg-violet-950/50 dark:text-violet-400">
            <FileText className="h-[18px] w-[18px]" />
          </div>
          <div>
            <h3 className="text-[15px] font-bold leading-tight text-gray-900 dark:text-gray-100">
              Documentos &amp; Adesão Zero
            </h3>
            <p className="text-[12.5px] text-gray-400 dark:text-gray-500">
              {orcamentos.length > 0
                ? `${orcamentos.length} ${orcamentos.length === 1 ? "orçamento" : "orçamentos"} · clique no número para gerenciar`
                : "Documentos por orçamento do lead"}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={fetchOrcamentos}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] text-gray-500 transition-colors duration-200 hover:bg-gray-100 hover:text-violet-600 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-violet-400"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </button>
      </div>

      <div className="p-5">
        {loading && orcamentos.length === 0 ? (
          <ListSkeleton />
        ) : !loading && orcamentos.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            <FileText className="mx-auto mb-2 h-8 w-8 opacity-40" />
            Nenhum orçamento encontrado para este lead. Os documentos ficam disponíveis
            após a criação de um orçamento.
          </div>
        ) : (
          <div className="space-y-3">
            {orcamentos.map((orc, i) => (
              <OrcamentoRow
                key={orc.erp_pedido_id}
                orc={orc}
                index={i}
                onOpen={(o) => setSelectedId(o.erp_pedido_id)}
              />
            ))}
          </div>
        )}
      </div>
      </>
      )}

      {/* Inputs de arquivo (ficam montados fora do modal para sobreviverem ao refetch). */}
      {orcamentos.map((orc) =>
        DOC_TIPOS.map(({ tipo }) => {
          const inputKey = `${orc.erp_pedido_id}:${tipo}`;
          return (
            <input
              key={inputKey}
              ref={(el) => (fileInputs.current[inputKey] = el)}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                handleUpload(orc, tipo, f);
              }}
            />
          );
        })
      )}

      {selected && (
        <OrcamentoModal
          orc={selected}
          canManage={canManage}
          busyKey={busyKey}
          fileInputs={fileInputs}
          onClose={() => {
            setSelectedId(null);
            onModalClose?.();
          }}
          onView={handleView}
           onDelete={setDeleteDoc}
          onAdesao={handleAdesaoZero}
          adjustmentContext={
            Number(adjustmentContext?.ajuste?.erp_pedido_id) === Number(selected.erp_pedido_id)
              ? adjustmentContext
              : null
          }
          addressForm={addressForm}
          addressSaving={addressSaving}
          onAddressChange={(field, value) => setAddressForm((current) => ({ ...current, [field]: value }))}
          onAddressSave={handleAddressSave}
          cityOptions={cityOptions}
          cityOpen={cityOpen}
          cityLoading={cityLoading}
          onCitySearch={searchCities}
          onCitySelect={selectCity}
          selectedCity={selectedCity}
            onCityFocus={openCityOptions}
            onCityClose={closeCityOptions}
          onOpenCadastro={openCadastro}
        />
      )}
      {correctionItem && (
        <PostsalesCorrectionModal
          item={correctionItem}
          correctionPath={`/api/presales-ajustes/${encodeURIComponent(correctionItem.id)}/correcao`}
          onClose={() => setCorrectionItem(null)}
          onSaved={async () => {
            await Promise.all([fetchOrcamentos(), fetchAdjustmentContext()]);
          }}
        />
      )}
      <AlertDialog open={!!deleteDoc} onOpenChange={(open) => !open && setDeleteDoc(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir documento?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita. O arquivo será removido deste orçamento.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { const doc = deleteDoc; setDeleteDoc(null); handleDelete(doc); }}>Excluir documento</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
