import { useEffect, useState, useCallback, useRef } from "react";
import { useToast } from "@/components/ui/use-toast";
import {
  X, FileText, Eye, Loader2, User, Calendar, Layers,
  CreditCard, Hash, Building2, Package, BadgeCheck, Users, PawPrint,
  Car, Phone, ShoppingBag, CheckCircle2, AlertTriangle, XCircle,
  ClipboardCheck, ThumbsUp, PencilLine, Ban, MapPin, Mail, Send, Clock,
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

// Documentos exigidos para a auditoria considerar o orçamento completo.
const REQUIRED_DOCS = ["documento_identidade", "comprovante_residencia", "taxa_adesao", "copia_contrato"];

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

function formatCep(cep) {
  if (!cep) return "";
  const d = String(cep).replace(/\D/g, "");
  if (d.length !== 8) return cep;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

function formatEndereco(end) {
  if (!end) return null;
  const linha1 = [end.logradouro, end.numero].filter(Boolean).join(", ");
  const compl = end.complemento ? ` (${end.complemento})` : "";
  const linha2 = [end.bairro, end.cidade].filter(Boolean).join(" · ");
  const cep = end.cep ? `CEP ${formatCep(end.cep)}` : "";
  return [linha1 + compl, linha2, cep].filter((s) => s && s.trim()).join(" — ") || null;
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

// Resultado da auditoria (derivado do checklist). Não há fluxo de aprovação real aqui —
// é o grau de completude dos dados/documentos do orçamento.
const RESULT_META = {
  pronto: {
    label: "PRONTO PARA APROVAÇÃO", icon: CheckCircle2,
    chip: "bg-emerald-500 text-white",
    soft: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300",
    bar: "bg-emerald-500",
  },
  revisar: {
    label: "REVISÃO NECESSÁRIA", icon: AlertTriangle,
    chip: "bg-amber-500 text-white",
    soft: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
    bar: "bg-amber-500",
  },
};

function InfoRow({ icon: Icon, label, value, title }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-gray-800 dark:text-slate-400">
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
    <div className="mb-2.5 mt-6 flex items-center justify-between border-b border-slate-100 pb-1.5 dark:border-gray-800">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
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

function ChecklistItem({ ok, label }) {
  return (
    <div className="flex items-center gap-2 text-[13px]">
      {ok ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
      ) : (
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
      )}
      <span className={ok ? "text-slate-600 dark:text-slate-300" : "font-medium text-amber-700 dark:text-amber-400"}>
        {label}
      </span>
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
  const [ajustes, setAjustes] = useState([]);
  const [ajusteTexto, setAjusteTexto] = useState("");
  const [savingAjuste, setSavingAjuste] = useState(false);
  const ajusteRef = useRef(null);

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

  const loadAjustes = useCallback(async () => {
    if (!pedidoId) return;
    try {
      const res = await fetch(`${API_BASE}/presales-ajustes/by-pedido/${pedidoId}`, { headers: authHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      setAjustes(Array.isArray(data.items) ? data.items : []);
    } catch {
      /* silencioso — a seção apenas não lista o histórico */
    }
  }, [pedidoId]);

  useEffect(() => { loadAjustes(); }, [loadAjustes]);

  const handleSaveAjuste = async () => {
    const texto = ajusteTexto.trim();
    if (!texto) {
      ajusteRef.current?.focus();
      return;
    }
    setSavingAjuste(true);
    try {
      const res = await fetch(`${API_BASE}/presales-ajustes`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ erp_pedido_id: pedidoId, texto }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Falha ao solicitar o ajuste.");
      toast({ title: "Ajuste solicitado", description: "O vendedor e o supervisor foram notificados." });
      setAjusteTexto("");
      loadAjustes();
    } catch (e) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setSavingAjuste(false);
    }
  };

  const focusAjuste = () => {
    ajusteRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => ajusteRef.current?.focus(), 300);
  };

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
      const objUrl = URL.createObjectURL(blob);
      window.open(objUrl, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(objUrl), 60000);
    } catch (e) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setViewingId(null);
    }
  };

  // Ações de auditoria são apenas visuais (protótipo) — o fluxo real de aprovação
  // vive no ERP e não é alterado por esta tela.
  const handleAuditAction = (label) => {
    toast({
      title: `${label} — em definição`,
      description: "Esta ação ainda é visual (protótipo). O fluxo de aprovação será definido em uma próxima etapa.",
    });
  };

  if (!orcamento) return null;

  const numero = orcamento.numero_orcamento || orcamento.erp_id;
  const valor = formatMoney(orcamento.valor_total);

  const pessoas = Array.isArray(detalhe?.pessoas) ? detalhe.pessoas : [];
  // Produtos "placeholder" de R$ 0,01 (vagas de dependente/pet/condutor/veículo) não são
  // exibidos — não representam um produto adquirido de fato.
  const produtos = (Array.isArray(detalhe?.produtos) ? detalhe.produtos : []).filter(
    (pr) => !(pr.preco != null && Math.abs(Number(pr.preco) - 0.01) < 0.001)
  );
  const titular = pessoas.find((p) => p.is_titular) || null;

  // Agrupa beneficiários (titular fora) por tipo classificado.
  const grupos = { dependente: [], pet: [], veiculo: [], beneficiario: [] };
  for (const p of pessoas) {
    if (p.is_titular) continue;
    const c = classifyPessoa(p);
    grupos[c.kind].push({ ...p, _classified: c });
  }

  // ----- Checklist / resultado da auditoria -----
  const attachedTipos = new Set(documentos.map((d) => d.tipo));
  const cpfOk = !!(titular?.cpf || orcamento.cpf_titular);
  const nomeOk = !!(titular?.nome || orcamento.nome_titular);
  const produtoOk = produtos.length > 0;
  const telOk = !!titular?.telefone;
  const emailOk = !!(titular?.email || detalhe?.email);
  const end = titular?.endereco || detalhe?.endereco || null;
  const enderecoOk = !!(end && end.cep && end.logradouro && end.numero && end.bairro && end.cidade);
  // Título do contrato == canal de vendas selecionado no formulário (já resolvido no relatório).
  const tituloOk = !!(canalLabel && canalLabel !== "-");
  const planoOk = !!detalhe?.plano_pagamento;
  const docIdOk = attachedTipos.has("documento_identidade");
  const compResOk = attachedTipos.has("comprovante_residencia");
  const taxaAdesaoOk = attachedTipos.has("taxa_adesao");
  const copiaContratoOk = attachedTipos.has("copia_contrato");

  // Valida TODOS os campos de preenchimento obrigatório do formulário (CPF, Nome, Telefone,
  // E-mail, Endereço, Título do contrato, Plano de pagamento e Produto) e os 4 documentos que o
  // vendedor precisa anexar. Itens apenas recomendados (data de nascimento, veículo) ficam de fora.
  const checklist = [
    { label: "CPF informado", ok: cpfOk, level: "critico" },
    { label: "Nome completo", ok: nomeOk, level: "critico" },
    { label: "Telefone informado", ok: telOk, level: "critico" },
    { label: "E-mail informado", ok: emailOk, level: "critico" },
    { label: "Endereço completo", ok: enderecoOk, level: "critico" },
    { label: "Título do contrato", ok: tituloOk, level: "critico" },
    { label: "Plano de pagamento", ok: planoOk, level: "critico" },
    { label: "Produto selecionado", ok: produtoOk, level: "critico" },
    { label: "Documento (CPF/RG) anexado", ok: docIdOk, level: "doc" },
    { label: "Comprovante de residência anexado", ok: compResOk, level: "doc" },
    { label: "Taxa de adesão anexada", ok: taxaAdesaoOk, level: "doc" },
    { label: "Cópia do contrato anexada", ok: copiaContratoOk, level: "doc" },
  ];

  const totalCheck = checklist.length;
  const doneCheck = checklist.filter((c) => c.ok).length;
  const faltaCritico = checklist.some((c) => c.level === "critico" && !c.ok);
  const faltaDoc = checklist.some((c) => c.level === "doc" && !c.ok);
  // O "Resumo da auditoria" não bloqueia o orçamento: quando faltam dados obrigatórios
  // ou documentos, sinaliza apenas "REVISÃO NECESSÁRIA". Não existe estado "BLOQUEADO".
  const result = loading || !detalhe
    ? null
    : (faltaCritico || faltaDoc) ? "revisar" : "pronto";
  const rmeta = result ? RESULT_META[result] : null;
  const pct = totalCheck ? Math.round((doneCheck / totalCheck) * 100) : 0;

  const missingRequired = REQUIRED_DOCS.filter((t) => !attachedTipos.has(t));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div onClick={onClose} className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Orçamento Nº ${numero}`}
        className="relative z-10 flex max-h-[94vh] w-full max-w-[720px] flex-col overflow-hidden rounded-t-2xl bg-slate-50 shadow-2xl sm:rounded-2xl dark:bg-gray-950"
      >
        {/* Header */}
        <div className="relative shrink-0 bg-violet-600 px-6 py-4 dark:bg-violet-700">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 text-white ring-1 ring-white/25">
                <ClipboardCheck className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold leading-tight text-white">Auditoria · Orçamento Nº {numero}</h2>
                <p className="text-[12.5px] text-violet-100/90">
                  {orcamento.modulo_nome ? `${orcamento.modulo_nome} · ` : ""}Conferência de dados e documentos
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
          {/* RESUMO DA AUDITORIA */}
          <div className={`rounded-2xl border bg-white p-4 shadow-sm dark:bg-gray-900 ${rmeta ? rmeta.soft : "border-slate-200 dark:border-gray-800"}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                  Resumo da auditoria
                </span>
              </div>
              {loading ? (
                <span className="inline-flex items-center gap-1.5 text-[12px] text-slate-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Calculando…
                </span>
              ) : rmeta && (
                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-bold ${rmeta.chip}`}>
                  <rmeta.icon className="h-3.5 w-3.5" />
                  {rmeta.label}
                </span>
              )}
            </div>

            {loading ? (
              <div className="mt-4 flex items-center gap-2 text-[13px] text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando validações…
              </div>
            ) : (
              <>
                {/* Progresso */}
                <div className="mt-3">
                  <div className="mb-1 flex items-center justify-between text-[12px] text-slate-500 dark:text-slate-400">
                    <span>{doneCheck} de {totalCheck} validações concluídas</span>
                    <span className="font-semibold">{pct}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-gray-800">
                    <div className={`h-full rounded-full transition-all ${rmeta ? rmeta.bar : "bg-slate-300"}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>

                {/* Checklist */}
                <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                  {checklist.map((c, i) => <ChecklistItem key={i} ok={c.ok} label={c.label} />)}
                </div>
              </>
            )}
          </div>

          {/* DADOS DO CLIENTE */}
          <SectionTitle>Dados do cliente</SectionTitle>
          <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
            <InfoRow icon={User} label="Nome" value={titular?.nome || orcamento.nome_titular} />
            <InfoRow icon={CreditCard} label="CPF" value={formatCpf(titular?.cpf || orcamento.cpf_titular)} />
            <InfoRow icon={Calendar} label="Nascimento" value={formatDateOnly(titular?.data_nascimento)} />
            <InfoRow icon={User} label="Sexo" value={titular ? (SEXO_LABEL[titular.sexo] || titular.sexo) : null} />
            <InfoRow icon={Phone} label="Telefone" value={titular?.telefone} />
            <InfoRow icon={Mail} label="E-mail" value={titular?.email || detalhe?.email} />
            <InfoRow icon={MapPin} label="Endereço" value={formatEndereco(titular?.endereco || detalhe?.endereco)} />
          </div>

          {/* DADOS DA VENDA */}
          <SectionTitle>Dados da venda</SectionTitle>
          <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
            <InfoRow icon={Hash} label="Número" value={String(numero)} />
            <InfoRow icon={BadgeCheck} label="Status" value={situacaoBadge || orcamento.situacao} />
            <InfoRow icon={Calendar} label="Criação" value={formatDateOnly(orcamento.data_venda)} />
            <InfoRow icon={Building2} label="Canal de vendas" value={canalLabel} />
            <InfoRow icon={User} label="Vendedor" value={orcamento.nome_vendedor} />
            <InfoRow icon={Layers} label="Módulo de origem" value={orcamento.modulo_nome} />
            {produto && <InfoRow icon={Package} label="Produto(s)" value={produto} />}
            {detalhe?.plano_pagamento && <InfoRow icon={CreditCard} label="Plano de pagamento" value={detalhe.plano_pagamento} />}
            {valor && <InfoRow icon={CreditCard} label="Valor total" value={valor} />}
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
                      className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgba(0,0,0,0.08)] dark:border-gray-800 dark:bg-gray-900"
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
                      className="flex items-start gap-3 rounded-xl border border-slate-100 bg-white p-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgba(0,0,0,0.08)] dark:border-gray-800 dark:bg-gray-900"
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

          {/* DOCUMENTOS */}
          <SectionTitle count={!loading ? documentos.length : undefined}>Documentos</SectionTitle>

          {loading ? (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-100 py-10 text-slate-400 dark:border-gray-800">
              <Loader2 className="h-5 w-5 animate-spin" /> Carregando documentos…
            </div>
          ) : (
            <div className="space-y-2.5">
              {documentos.map((doc) => {
                const isRequired = REQUIRED_DOCS.includes(doc.tipo);
                return (
                  <div
                    key={doc.id}
                    className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-[0_12px_32px_rgba(0,0,0,0.08)] dark:border-gray-800 dark:bg-gray-900 dark:hover:border-violet-800"
                  >
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400">
                      <FileText className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100" title={doc.original_name}>
                          {DOC_TIPO_LABEL[doc.tipo] || doc.tipo}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                          <CheckCircle2 className="h-3 w-3" /> Anexado
                        </span>
                        {isRequired && (
                          <span className="hidden text-[10.5px] font-medium text-slate-400 sm:inline">obrigatório</span>
                        )}
                      </div>
                      <div className="mt-0.5 truncate text-[12px] text-slate-400 dark:text-slate-500" title={doc.original_name}>
                        {doc.original_name}
                        {doc.size_bytes != null ? ` · ${formatBytes(doc.size_bytes)}` : ""}
                        {doc.created_at ? ` · ${formatDateOnly(doc.created_at)}` : ""}
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

              {/* Documentos obrigatórios faltando */}
              {missingRequired.map((tipo) => (
                <div
                  key={tipo}
                  className="flex items-center gap-3 rounded-xl border border-dashed border-red-200 bg-red-50/60 p-3.5 dark:border-red-900 dark:bg-red-950/20"
                >
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-600 dark:bg-red-950/50 dark:text-red-400">
                    <XCircle className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-red-700 dark:text-red-300">
                        {tipo === "comprovante_residencia" ? <MapPin className="mr-1 inline h-3.5 w-3.5" /> : null}
                        {DOC_TIPO_LABEL[tipo] || tipo}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10.5px] font-semibold text-red-700 dark:bg-red-950/50 dark:text-red-300">
                        Faltando
                      </span>
                    </div>
                    <div className="mt-0.5 text-[12px] text-red-600/80 dark:text-red-400/80">
                      Documento obrigatório não anexado.
                    </div>
                  </div>
                </div>
              ))}

              {documentos.length === 0 && missingRequired.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-400 dark:border-gray-800">
                  Nenhum documento anexado.
                </div>
              )}
            </div>
          )}

          {/* SOLICITAR AJUSTE */}
          <SectionTitle>Solicitar ajuste ao vendedor</SectionTitle>
          <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900/60 dark:bg-amber-950/20">
            {ajustes.length > 0 && (
              <div className="mb-3 space-y-2">
                {ajustes.map((a) => {
                  const done = a.status === "ajustado";
                  return (
                    <div
                      key={a.id}
                      className="rounded-xl border border-slate-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900"
                    >
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${
                            done
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                              : "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
                          }`}
                        >
                          {done ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                          {done ? "Ajustado pelo vendedor" : "Aguardando vendedor"}
                        </span>
                        <span className="text-[11px] text-slate-400 dark:text-slate-500">
                          {formatDateOnly(a.created_at)}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap text-[13px] text-slate-700 dark:text-slate-200">{a.texto}</p>
                      {done && a.vendedor_comentario && (
                        <p className="mt-1.5 border-t border-slate-100 pt-1.5 text-[12px] text-emerald-700 dark:border-gray-800 dark:text-emerald-300">
                          <span className="font-semibold">Resposta do vendedor:</span> {a.vendedor_comentario}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <label className="mb-1.5 block text-[12px] font-medium text-slate-600 dark:text-slate-300">
              Descreva o que precisa ser ajustado
            </label>
            <textarea
              ref={ajusteRef}
              value={ajusteTexto}
              onChange={(e) => setAjusteTexto(e.target.value)}
              rows={4}
              placeholder="Ex.: faltou o comprovante de residência e o telefone do titular está incorreto…"
              className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm outline-none transition-colors placeholder:text-slate-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-200 dark:border-gray-700 dark:bg-gray-900 dark:text-slate-100 dark:focus:ring-amber-900"
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-[11px] text-slate-400 dark:text-slate-500">
                O vendedor e o supervisor serão notificados.
              </span>
              <button
                type="button"
                onClick={handleSaveAjuste}
                disabled={savingAjuste || !ajusteTexto.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3.5 py-2 text-[12.5px] font-semibold text-white shadow-sm shadow-amber-500/30 transition-colors hover:bg-amber-700 disabled:opacity-50"
              >
                {savingAjuste ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Solicitar ajuste
              </button>
            </div>
          </div>

          <p className="mt-4 text-[11px] text-slate-400 dark:text-slate-500">
            Os documentos são privados e acessíveis apenas a usuários autorizados.
          </p>
        </div>

        {/* Rodapé de aprovação (sticky) */}
        <div className="shrink-0 border-t border-slate-200 bg-white px-5 py-3 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {rmeta ? (
                <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-bold ${rmeta.soft}`}>
                  <rmeta.icon className="h-3.5 w-3.5" />
                  {rmeta.label}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-[12px] text-slate-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Avaliando…
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={focusAjuste}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[12.5px] font-semibold text-amber-700 transition-colors hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
              >
                <PencilLine className="h-3.5 w-3.5" /> Solicitar ajuste
              </button>
              <button
                type="button"
                onClick={() => handleAuditAction("Rejeitar orçamento")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-[12.5px] font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
              >
                <Ban className="h-3.5 w-3.5" /> Rejeitar
              </button>
              <button
                type="button"
                onClick={() => handleAuditAction("Aprovar orçamento")}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-[12.5px] font-semibold text-white shadow-sm shadow-emerald-500/30 transition-colors hover:bg-emerald-700"
              >
                <ThumbsUp className="h-3.5 w-3.5" /> Aprovar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
