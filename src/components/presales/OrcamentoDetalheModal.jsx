import { useEffect, useState, useCallback, useRef } from "react";
import { useToast } from "@/components/ui/use-toast";
import {
  X, FileText, Eye, Loader2, FileWarning, User, Calendar, Layers,
  CreditCard, Hash, Building2, Package, BadgeCheck, Users, PawPrint,
  Car, Phone, ShoppingBag,
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

const SEXO_LABEL = { M: "Masculino", F: "Feminino" };
const PARENTESCO_LABEL = {
  D: "Dependente", F: "Filho(a)", C: "Cônjuge", P: "Pai/Mãe", T: "Titular",
};

// Pet/veículo são gravados no ERP como o NOME da pessoa, no formato montado:
//   pet:     NOME/TIPO/RAÇA/COR/PORTE   (5 partes)
//   veículo: MODELO/COR/PLACA/ANO       (4 partes)
// Aqui classificamos cada pessoa (titular fora) por produto vinculado + formato do nome.
function classifyPessoa(p) {
  const desc = (p.produtos || []).join(" ").toUpperCase();
  const parts = String(p.nome || "").split("/").map((s) => s.trim());
  const isPetDesc = /\bPET\b|NOME DO PET/.test(desc);
  const isVeicDesc = /VE[IÍ]CULO/.test(desc);

  // Só inferimos pet/veículo quando o PRODUTO vinculado confirma o tipo. A contagem de "/"
  // é usada apenas para tentar separar o nome montado; se o nome não estiver no formato
  // esperado, mostramos o nome cru (evita classificar errado um nome comum que contenha "/").
  if (isPetDesc) {
    return {
      kind: "pet",
      campos: parts.length === 5
        ? [["Nome", parts[0]], ["Tipo", parts[1]], ["Raça", parts[2]], ["Cor", parts[3]], ["Porte", parts[4]]]
        : [["Nome", p.nome]],
    };
  }
  if (isVeicDesc) {
    return {
      kind: "veiculo",
      campos: parts.length === 4
        ? [["Modelo", parts[0]], ["Cor", parts[1]], ["Placa", parts[2]], ["Ano", parts[3]]]
        : [["Descrição", p.nome]],
    };
  }
  if (p.parentesco === "D" || /DEPENDENTE/.test(desc)) return { kind: "dependente", campos: null };
  return { kind: "beneficiario", campos: null };
}

const GROUP_META = {
  dependente: { title: "Dependentes", icon: Users, color: "text-sky-600 dark:text-sky-400", bg: "bg-sky-50 dark:bg-sky-950/40" },
  pet: { title: "Pets", icon: PawPrint, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/40" },
  veiculo: { title: "Veículos", icon: Car, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/40" },
  beneficiario: { title: "Beneficiários", icon: Users, color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-50 dark:bg-violet-950/40" },
};

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

function SectionTitle({ children, count }) {
  return (
    <div className="mb-2.5 mt-5 flex items-center justify-between">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">
        {children}
      </h3>
      {count != null && (
        <span className="text-[12px] font-medium text-slate-400 dark:text-slate-500">
          {count} {count === 1 ? "item" : "itens"}
        </span>
      )}
    </div>
  );
}

export default function OrcamentoDetalheModal({ orcamento, situacaoBadge, canalLabel, onClose }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [documentos, setDocumentos] = useState([]);
  const [produto, setProduto] = useState(null);
  const [detalhe, setDetalhe] = useState(null);
  const [viewingId, setViewingId] = useState(null);
  const [previews, setPreviews] = useState({});
  const previewUrlsRef = useRef([]);

  const pedidoId = orcamento?.erp_id;

  const loadDocs = useCallback(async () => {
    if (!pedidoId) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/orcamento-documentos/by-pedido/${pedidoId}`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Falha ao carregar os detalhes do orçamento.");
      const data = await res.json();
      setDocumentos(Array.isArray(data.documentos) ? data.documentos : []);
      setProduto(data.produto || null);
      setDetalhe(data.detalhe || null);
    } catch (e) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
      setDocumentos([]);
    } finally {
      setLoading(false);
    }
  }, [pedidoId, toast]);

  useEffect(() => { loadDocs(); }, [loadDocs]);

  // Pré-carrega thumbnails dos anexos de imagem (lazy, um blob autenticado por imagem).
  // PDFs não geram prévia — exibem só o botão "Visualizar".
  useEffect(() => {
    let cancelled = false;
    // Revoga prévias anteriores ao trocar a lista de documentos (evita leak de object URL).
    previewUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    previewUrlsRef.current = [];
    setPreviews({});
    const imgs = documentos.filter((d) => (d.mime_type || "").startsWith("image/"));
    if (imgs.length === 0) return () => { cancelled = true; };
    (async () => {
      for (const doc of imgs) {
        try {
          const res = await fetch(`${API_BASE}/orcamento-documentos/${doc.id}/download`, { headers: authHeaders() });
          if (!res.ok) continue;
          const blob = await res.blob();
          if (cancelled) return;
          const url = URL.createObjectURL(blob);
          previewUrlsRef.current.push(url);
          setPreviews((prev) => ({ ...prev, [doc.id]: url }));
        } catch { /* ignora prévia que falhar */ }
      }
    })();
    return () => { cancelled = true; };
  }, [documentos]);

  useEffect(() => () => {
    previewUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    previewUrlsRef.current = [];
  }, []);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleView = async (doc) => {
    setViewingId(doc.id);
    try {
      const url = previews[doc.id];
      if (url) {
        window.open(url, "_blank", "noopener");
        return;
      }
      const res = await fetch(`${API_BASE}/orcamento-documentos/${doc.id}/download`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Falha ao abrir o documento.");
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      window.open(objUrl, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(objUrl), 60000);
    } catch (e) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setViewingId(null);
    }
  };

  if (!orcamento) return null;

  const numero = orcamento.numero_orcamento || orcamento.erp_id;
  const valor = formatMoney(orcamento.valor_total);

  const pessoas = Array.isArray(detalhe?.pessoas) ? detalhe.pessoas : [];
  const produtos = Array.isArray(detalhe?.produtos) ? detalhe.produtos : [];
  const titular = pessoas.find((p) => p.is_titular) || null;

  // Agrupa beneficiários (titular fora) por tipo classificado.
  const grupos = { dependente: [], pet: [], veiculo: [], beneficiario: [] };
  for (const p of pessoas) {
    if (p.is_titular) continue;
    const c = classifyPessoa(p);
    grupos[c.kind].push({ ...p, _classified: c });
  }

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
            <InfoRow icon={Calendar} label="Criação" value={formatDateOnly(orcamento.data_venda)} />
            <InfoRow icon={Building2} label="Canal de vendas" value={canalLabel} />
            <InfoRow icon={User} label="Vendedor" value={orcamento.nome_vendedor} />
            <InfoRow icon={Layers} label="Módulo de origem" value={orcamento.modulo_nome} />
            {produto && <InfoRow icon={Package} label="Produto(s)" value={produto} />}
            {valor && <InfoRow icon={CreditCard} label="Valor total" value={valor} />}
          </div>

          {/* Dados cadastrais (titular) */}
          <SectionTitle>Dados cadastrais do titular</SectionTitle>
          <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
            <InfoRow icon={User} label="Nome" value={titular?.nome || orcamento.nome_titular} />
            <InfoRow icon={CreditCard} label="CPF" value={formatCpf(titular?.cpf || orcamento.cpf_titular)} />
            <InfoRow icon={Calendar} label="Nascimento" value={formatDateOnly(titular?.data_nascimento)} />
            <InfoRow icon={User} label="Sexo" value={titular ? (SEXO_LABEL[titular.sexo] || titular.sexo) : null} />
            <InfoRow icon={Phone} label="Telefone" value={titular?.telefone} />
          </div>

          {/* Produtos adquiridos */}
          {produtos.length > 0 && (
            <>
              <SectionTitle count={produtos.length}>Produtos adquiridos</SectionTitle>
              <div className="space-y-2">
                {produtos.map((pr, i) => {
                  const v = formatMoney(pr.valor_total);
                  return (
                    <div
                      key={i}
                      className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-3 dark:border-gray-800 dark:bg-gray-900"
                    >
                      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400">
                        <ShoppingBag className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100" title={pr.descricao || ""}>
                          {pr.descricao || "Produto"}
                        </div>
                        <div className="text-[12px] text-slate-400 dark:text-slate-500">
                          {pr.quantidade != null ? `Qtd: ${pr.quantidade}` : ""}
                          {pr.quantidade != null && v ? " · " : ""}
                          {v ? `Total: ${v}` : ""}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Grupos: dependentes / pets / veículos / beneficiários */}
          {["dependente", "pet", "veiculo", "beneficiario"].map((kind) => {
            const list = grupos[kind];
            if (list.length === 0) return null;
            const meta = GROUP_META[kind];
            const Icon = meta.icon;
            return (
              <div key={kind}>
                <SectionTitle count={list.length}>{meta.title}</SectionTitle>
                <div className="space-y-2">
                  {list.map((p, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 rounded-xl border border-slate-100 bg-white p-3 dark:border-gray-800 dark:bg-gray-900"
                    >
                      <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${meta.bg} ${meta.color}`}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        {p._classified.campos ? (
                          <>
                            <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                              {p._classified.campos[0][1] || "-"}
                            </div>
                            <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[12px] text-slate-500 dark:text-slate-400">
                              {p._classified.campos.slice(1).map(([label, val], j) => (
                                <span key={j}>
                                  <span className="text-slate-400 dark:text-slate-500">{label}:</span> {val || "-"}
                                </span>
                              ))}
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100" title={p.nome || ""}>
                              {p.nome || "-"}
                            </div>
                            <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[12px] text-slate-500 dark:text-slate-400">
                              {p.cpf && (
                                <span><span className="text-slate-400 dark:text-slate-500">CPF:</span> {formatCpf(p.cpf)}</span>
                              )}
                              {p.parentesco && (
                                <span><span className="text-slate-400 dark:text-slate-500">Parentesco:</span> {PARENTESCO_LABEL[p.parentesco] || p.parentesco}</span>
                              )}
                              {p.data_nascimento && (
                                <span><span className="text-slate-400 dark:text-slate-500">Nasc.:</span> {formatDateOnly(p.data_nascimento)}</span>
                              )}
                            </div>
                            {p.produtos?.length > 0 && (
                              <div className="mt-0.5 truncate text-[11px] text-slate-400 dark:text-slate-500" title={p.produtos.join(" · ")}>
                                {p.produtos.join(" · ")}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

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
              <Loader2 className="h-5 w-5 animate-spin" /> Carregando detalhes…
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
              {documentos.map((doc) => {
                const isImg = (doc.mime_type || "").startsWith("image/");
                const previewUrl = previews[doc.id];
                return (
                  <div
                    key={doc.id}
                    className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-3.5 transition-colors hover:border-violet-200 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-violet-800"
                  >
                    {isImg && previewUrl ? (
                      <button
                        type="button"
                        onClick={() => handleView(doc)}
                        className="group relative h-12 w-12 shrink-0 overflow-hidden rounded-lg ring-1 ring-slate-200 dark:ring-gray-700"
                        title="Abrir imagem"
                      >
                        <img src={previewUrl} alt={doc.original_name} className="h-full w-full object-cover" />
                        <span className="absolute inset-0 hidden items-center justify-center bg-black/40 group-hover:flex">
                          <Eye className="h-4 w-4 text-white" />
                        </span>
                      </button>
                    ) : (
                      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400">
                        {isImg ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-5 w-5" />}
                      </span>
                    )}
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
                );
              })}
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
