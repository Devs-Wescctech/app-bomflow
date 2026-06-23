import { useEffect, useState, useCallback } from "react";
import { useToast } from "@/components/ui/use-toast";
import {
  X, FileText, Eye, Loader2, FileWarning, User, Calendar, Layers,
  CreditCard, Hash, Building2, Package, BadgeCheck,
} from "lucide-react";

const API_BASE = "/api";

function authHeaders() {
  const token = localStorage.getItem("accessToken");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const DOC_TIPO_LABEL = {
  documento_identidade: "Documento (CPF/RG)",
  comprovante_residencia: "Comprovante de residência",
  taxa_adesao: "Taxa de adesão",
  copia_contrato: "Cópia do contrato",
};

function formatBytes(bytes) {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateOnly(dateStr) {
  if (!dateStr) return "-";
  try {
    return new Date(dateStr).toLocaleDateString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric",
    });
  } catch { return "-"; }
}

function formatCpf(cpf) {
  if (!cpf) return "-";
  const d = String(cpf).replace(/\D/g, "");
  if (d.length !== 11) return cpf;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function formatMoney(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (Number.isNaN(n)) return null;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function InfoRow({ icon: Icon, label, value, title }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</div>
        <div className="truncate text-sm font-medium text-slate-800 dark:text-slate-100" title={title || (typeof value === "string" ? value : "")}>
          {value || "-"}
        </div>
      </div>
    </div>
  );
}

export default function OrcamentoDetalheModal({ orcamento, situacaoBadge, canalLabel, onClose }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [documentos, setDocumentos] = useState([]);
  const [produto, setProduto] = useState(null);
  const [viewingId, setViewingId] = useState(null);

  const pedidoId = orcamento?.erp_id;

  const loadDocs = useCallback(async () => {
    if (!pedidoId) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/orcamento-documentos/by-pedido/${pedidoId}`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Falha ao carregar os anexos.");
      const data = await res.json();
      setDocumentos(Array.isArray(data.documentos) ? data.documentos : []);
      setProduto(data.produto || null);
    } catch (e) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
      setDocumentos([]);
    } finally {
      setLoading(false);
    }
  }, [pedidoId, toast]);

  useEffect(() => { loadDocs(); }, [loadDocs]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleView = async (doc) => {
    setViewingId(doc.id);
    try {
      const res = await fetch(`${API_BASE}/orcamento-documentos/${doc.id}/download`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Falha ao abrir o documento.");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setViewingId(null);
    }
  };

  if (!orcamento) return null;

  const numero = orcamento.numero_orcamento || orcamento.erp_id;
  const valor = formatMoney(orcamento.valor_total);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div onClick={onClose} className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Orçamento Nº ${numero}`}
        className="relative z-10 flex max-h-[92vh] w-full max-w-[680px] flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl dark:bg-gray-900"
      >
        {/* Header */}
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-r from-violet-600 via-violet-600 to-fuchsia-600 px-6 py-5">
          <div className="absolute -top-8 -right-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
          <div className="relative flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 text-white ring-1 ring-white/30">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold leading-tight text-white">Orçamento Nº {numero}</h2>
                <p className="text-[12.5px] text-violet-100/90">
                  {orcamento.modulo_nome ? `${orcamento.modulo_nome} · ` : ""}Detalhes e anexos
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Fechar"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-white/80 transition-colors hover:bg-white/15 hover:text-white"
            >
              <X className="h-[18px] w-[18px]" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* Dados do orçamento */}
          <div className="mb-2 flex items-center gap-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">
              Dados do orçamento
            </h3>
          </div>
          <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
            <InfoRow icon={Hash} label="Número" value={String(numero)} />
            <InfoRow icon={BadgeCheck} label="Status" value={situacaoBadge || orcamento.situacao} />
            <InfoRow icon={User} label="Cliente" value={orcamento.nome_titular} />
            <InfoRow icon={CreditCard} label="CPF" value={formatCpf(orcamento.cpf_titular)} />
            <InfoRow icon={Calendar} label="Criação" value={formatDateOnly(orcamento.data_venda)} />
            <InfoRow icon={Building2} label="Canal de vendas" value={canalLabel} />
            <InfoRow icon={User} label="Vendedor" value={orcamento.nome_vendedor} />
            <InfoRow icon={Layers} label="Módulo de origem" value={orcamento.modulo_nome} />
            {produto && <InfoRow icon={Package} label="Produto" value={produto} />}
            {valor && <InfoRow icon={CreditCard} label="Valor total" value={valor} />}
          </div>

          {/* Anexos */}
          <div className="mt-5 mb-2.5 flex items-center justify-between">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">
              Arquivos anexados
            </h3>
            {!loading && documentos.length > 0 && (
              <span className="text-[12px] font-medium text-slate-400 dark:text-slate-500">
                {documentos.length} {documentos.length === 1 ? "arquivo" : "arquivos"}
              </span>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-100 py-10 text-slate-400 dark:border-gray-800">
              <Loader2 className="h-5 w-5 animate-spin" /> Carregando anexos…
            </div>
          ) : documentos.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-amber-200 bg-amber-50/50 py-10 text-center dark:border-amber-900 dark:bg-amber-950/20">
              <FileWarning className="h-8 w-8 text-amber-500" />
              <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">Nenhum documento anexado</p>
              <p className="text-[12.5px] text-amber-600/80 dark:text-amber-500/80">
                Este orçamento não possui arquivos anexados.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {documentos.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-3.5 transition-colors hover:border-violet-200 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-violet-800"
                >
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400">
                    <FileText className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100" title={doc.original_name}>
                      {DOC_TIPO_LABEL[doc.tipo] || doc.tipo}
                    </div>
                    <div className="truncate text-[12px] text-slate-400 dark:text-slate-500" title={doc.original_name}>
                      {doc.original_name}{doc.size_bytes != null ? ` · ${formatBytes(doc.size_bytes)}` : ""}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleView(doc)}
                    disabled={viewingId === doc.id}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-[12.5px] font-medium text-white shadow-sm shadow-violet-500/30 transition-colors hover:bg-violet-700 disabled:opacity-60"
                  >
                    {viewingId === doc.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                    Visualizar
                  </button>
                </div>
              ))}
            </div>
          )}

          <p className="mt-4 text-[11px] text-slate-400 dark:text-slate-500">
            Os documentos são privados e acessíveis apenas a usuários autorizados.
          </p>
        </div>
      </div>
    </div>
  );
}
