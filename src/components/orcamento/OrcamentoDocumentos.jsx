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
} from "lucide-react";

const DOC_TIPOS = [
  { tipo: "documento_identidade", label: "Documento (CPF/RG)" },
  { tipo: "comprovante_residencia", label: "Comprovante de residência" },
  { tipo: "taxa_adesao", label: "Taxa de adesão" },
  { tipo: "copia_contrato", label: "Cópia do contrato" },
];

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

/**
 * Documentos & Adesão Zero por orçamento do lead.
 * Props:
 *  - modulo: 'sales' | 'sales_pj' | 'sales_upsell' | 'referral'
 *  - cpf: documento do cliente (CPF/CNPJ) para localizar os orçamentos
 *  - leadId: id do lead (vínculo do documento ao lead)
 *  - canManage: se o usuário pode enviar/reenviar/excluir e marcar Adesão Zero
 */
export default function OrcamentoDocumentos({ modulo, cpf, leadId, canManage = false }) {
  const [orcamentos, setOrcamentos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyKey, setBusyKey] = useState(null);
  const fileInputs = useRef({});

  const fetchOrcamentos = useCallback(async () => {
    if (!cpf || !modulo) {
      setOrcamentos([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/orcamento-documentos/orcamentos?modulo=${encodeURIComponent(modulo)}&cpf=${encodeURIComponent(cpf)}`,
        { headers: authHeaders() }
      );
      if (!res.ok) throw new Error("Falha ao carregar orçamentos");
      const data = await res.json();
      setOrcamentos(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      console.error("[OrcamentoDocumentos] fetch error:", e);
      toast.error("Não foi possível carregar os orçamentos.");
    } finally {
      setLoading(false);
    }
  }, [cpf, modulo]);

  useEffect(() => {
    fetchOrcamentos();
  }, [fetchOrcamentos]);

  const docFor = (orc, tipo) => (orc.documentos || []).find((d) => d.tipo === tipo) || null;

  async function handleUpload(orc, tipo, file) {
    if (!file) return;
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
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Falha no envio");
      toast.success("Documento enviado.");
      await fetchOrcamentos();
    } catch (e) {
      toast.error(e.message || "Falha ao enviar documento.");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleView(doc) {
    try {
      const res = await fetch(`/api/orcamento-documentos/${doc.id}/download`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error("Falha ao abrir documento");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      toast.error(e.message || "Não foi possível abrir o documento.");
    }
  }

  async function handleDelete(doc) {
    if (!window.confirm("Excluir este documento? Esta ação não pode ser desfeita.")) return;
    const key = `del:${doc.id}`;
    setBusyKey(key);
    try {
      const res = await fetch(`/api/orcamento-documentos/${doc.id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Falha ao excluir");
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
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Falha ao salvar");
      toast.success("Adesão Zero atualizada.");
      await fetchOrcamentos();
    } catch (e) {
      toast.error(e.message || "Falha ao salvar Adesão Zero.");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="mt-6 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-violet-600" />
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">
            Documentos &amp; Adesão Zero
          </h3>
        </div>
        <button
          type="button"
          onClick={fetchOrcamentos}
          className="inline-flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300 hover:text-violet-600 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </button>
      </div>

      <div className="p-5 space-y-5">
        {loading && orcamentos.length === 0 && (
          <div className="flex items-center gap-2 text-gray-500 text-sm py-6 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando orçamentos...
          </div>
        )}

        {!loading && orcamentos.length === 0 && (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400 text-sm">
            <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
            Nenhum orçamento encontrado para este lead. Os documentos ficam disponíveis
            após a criação de um orçamento.
          </div>
        )}

        {orcamentos.map((orc) => {
          const azPending = orc.adesao_zero === null || orc.adesao_zero === undefined;
          return (
            <div
              key={orc.erp_pedido_id}
              className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700">
                <div className="text-sm">
                  <span className="font-semibold text-gray-900 dark:text-gray-100">
                    Orçamento Nº {orc.erp_numero || orc.erp_pedido_id}
                  </span>
                  {orc.created_at && (
                    <span className="text-gray-500 ml-2">
                      {new Date(orc.created_at).toLocaleDateString("pt-BR")}
                    </span>
                  )}
                </div>
              </div>

              <div className="p-4 space-y-4">
                {/* Adesão Zero (obrigatório) */}
                <div className="flex flex-wrap items-center gap-3 rounded-lg bg-violet-50 dark:bg-violet-950/30 border border-violet-100 dark:border-violet-900 px-3 py-2.5">
                  <ShieldCheck className="w-4 h-4 text-violet-600 shrink-0" />
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    Adesão Zero <span className="text-red-500">*</span>
                  </span>
                  <div className="flex gap-2 ml-auto">
                    {[
                      { label: "Sim", value: true },
                      { label: "Não", value: false },
                    ].map((opt) => {
                      const active = orc.adesao_zero === opt.value;
                      return (
                        <button
                          key={opt.label}
                          type="button"
                          disabled={!canManage || busyKey === `az:${orc.erp_pedido_id}`}
                          onClick={() => handleAdesaoZero(orc, opt.value)}
                          className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors disabled:opacity-60 ${
                            active
                              ? "bg-violet-600 text-white border-violet-600"
                              : "bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:border-violet-400"
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                  {azPending && (
                    <span className="w-full sm:w-auto text-xs text-amber-600 dark:text-amber-400">
                      Preenchimento obrigatório
                    </span>
                  )}
                </div>

                {/* 4 slots de documentos */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {DOC_TIPOS.map(({ tipo, label }) => {
                    const doc = docFor(orc, tipo);
                    const inputKey = `${orc.erp_pedido_id}:${tipo}`;
                    const uploading = busyKey === inputKey;
                    return (
                      <div
                        key={tipo}
                        className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 flex flex-col gap-2"
                      >
                        <div className="flex items-center gap-2">
                          {doc ? (
                            <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                          ) : (
                            <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                          )}
                          <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                            {label}
                          </span>
                        </div>

                        {doc ? (
                          <div className="flex flex-col gap-1">
                            <span className="text-xs text-gray-500 truncate" title={doc.original_name}>
                              {doc.original_name} · {formatBytes(doc.size_bytes)}
                            </span>
                            <div className="flex items-center gap-2 flex-wrap">
                              <button
                                type="button"
                                onClick={() => handleView(doc)}
                                className="inline-flex items-center gap-1 text-xs text-violet-600 hover:underline"
                              >
                                <Eye className="w-3.5 h-3.5" /> Visualizar
                              </button>
                              {canManage && (
                                <>
                                  <button
                                    type="button"
                                    disabled={uploading}
                                    onClick={() => fileInputs.current[inputKey]?.click()}
                                    className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300 hover:underline disabled:opacity-60"
                                  >
                                    {uploading ? (
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      <Upload className="w-3.5 h-3.5" />
                                    )}
                                    Reenviar
                                  </button>
                                  <button
                                    type="button"
                                    disabled={busyKey === `del:${doc.id}`}
                                    onClick={() => handleDelete(doc)}
                                    className="inline-flex items-center gap-1 text-xs text-red-600 hover:underline disabled:opacity-60"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" /> Excluir
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        ) : canManage ? (
                          <button
                            type="button"
                            disabled={uploading}
                            onClick={() => fileInputs.current[inputKey]?.click()}
                            className="inline-flex items-center justify-center gap-1.5 text-xs text-violet-600 border border-dashed border-violet-300 dark:border-violet-700 rounded-md py-2 hover:bg-violet-50 dark:hover:bg-violet-950/30 disabled:opacity-60"
                          >
                            {uploading ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Upload className="w-3.5 h-3.5" />
                            )}
                            Enviar arquivo
                          </button>
                        ) : (
                          <span className="text-xs text-gray-400">Nenhum arquivo enviado</span>
                        )}

                        <input
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
                      </div>
                    );
                  })}
                </div>

                <p className="text-[11px] text-gray-400">
                  Formatos aceitos: PDF, JPG ou PNG (até 15 MB). Os documentos são privados e
                  acessíveis apenas a usuários autorizados.
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
