import { useEffect, useState } from "react";
import {
  ArrowLeft,
  FileText,
  ChevronRight,
  CheckCircle2,
  ShieldCheck,
  Eye,
  Upload,
  Trash2,
  X,
  Calendar,
  Package,
  RefreshCw,
} from "lucide-react";

/* ------------------------------------------------------------------ *
 * DEMO VISUAL ISOLADA — Documentos & Adesão Zero (lista + modal)
 * Dados fictícios, botões não-funcionais. Não toca em módulo real.
 * ------------------------------------------------------------------ */

const DOC_TIPOS = [
  { tipo: "documento_identidade", label: "Documento (CPF/RG)" },
  { tipo: "comprovante_residencia", label: "Comprovante de residência" },
  { tipo: "taxa_adesao", label: "Taxa de adesão" },
  { tipo: "copia_contrato", label: "Cópia do contrato" },
];

const ORCAMENTOS = [
  {
    id: 72240,
    numero: "72240",
    fechamento: "22/06/2026",
    produto: "Plano Familiar",
    adesaoZero: true,
    docs: {
      documento_identidade: { file: "cnh.png", size: "8.4 MB" },
      comprovante_residencia: { file: "Orcamentos_Upsell_20260622 (1).pdf", size: "7 KB" },
      taxa_adesao: null,
      copia_contrato: null,
    },
  },
  {
    id: 72118,
    numero: "72118",
    fechamento: "18/06/2026",
    produto: "Plano Individual + Telemedicina",
    adesaoZero: false,
    docs: {
      documento_identidade: { file: "rg_frente.jpg", size: "1.2 MB" },
      comprovante_residencia: { file: "conta_luz.pdf", size: "210 KB" },
      taxa_adesao: { file: "comprovante_taxa.pdf", size: "98 KB" },
      copia_contrato: { file: "contrato_assinado.pdf", size: "2.4 MB" },
    },
  },
  {
    id: 71990,
    numero: "71990",
    fechamento: "11/06/2026",
    produto: "Plano Familiar + Odonto",
    adesaoZero: false,
    docs: {
      documento_identidade: { file: "cpf.pdf", size: "340 KB" },
      comprovante_residencia: null,
      taxa_adesao: null,
      copia_contrato: null,
    },
  },
];

const loadedCount = (orc) => DOC_TIPOS.filter(({ tipo }) => orc.docs[tipo]).length;

const MOTION_CSS = `
@keyframes od-enter {
  from { opacity: 0; transform: translateY(14px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes od-shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
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
.od-skeleton {
  background: linear-gradient(90deg, #eceaf4 25%, #f6f3ff 37%, #eceaf4 63%);
  background-size: 200% 100%;
  animation: od-shimmer 1.4s ease-in-out infinite;
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
          ? "bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100"
          : "bg-amber-50 text-amber-600 ring-1 ring-amber-100"
      }`}
    >
      {complete ? <CheckCircle2 className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
      {loaded}/{total}
    </span>
  );
}

function AdesaoChip({ value }) {
  const map = {
    true: { label: "Adesão Zero", cls: "bg-violet-50 text-violet-600 ring-violet-100" },
    false: { label: "Sem adesão", cls: "bg-gray-100 text-gray-500 ring-gray-200" },
  };
  const cfg = map[String(value)];
  return (
    <span className={`hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium ring-1 sm:inline-flex ${cfg.cls}`}>
      <ShieldCheck className="h-3.5 w-3.5" />
      {cfg.label}
    </span>
  );
}

function OrcamentoRow({ orc, index, onOpen }) {
  const loaded = loadedCount(orc);
  return (
    <button
      type="button"
      onClick={() => onOpen(orc)}
      style={{ animation: "od-enter 450ms cubic-bezier(0.16,1,0.3,1) both", animationDelay: `${120 + index * 70}ms` }}
      className="group flex w-full items-center gap-4 rounded-xl border border-gray-100 bg-white px-4 py-3.5 text-left transition-all duration-200 hover:-translate-y-px hover:border-violet-200/70 hover:shadow-[0_10px_30px_-18px_rgba(76,29,149,0.35)]"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-50 to-fuchsia-50 text-violet-600 ring-1 ring-violet-100">
        <FileText className="h-5 w-5" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-900 transition-colors duration-200 group-hover:text-violet-700">
            Nº {orc.numero}
          </span>
          <span className="hidden items-center gap-1 text-[12.5px] text-gray-400 sm:inline-flex">
            <Calendar className="h-3.5 w-3.5" />
            {orc.fechamento}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 truncate text-[13px] text-gray-500">
          <Package className="h-3.5 w-3.5 shrink-0 text-gray-400" />
          <span className="truncate">{orc.produto}</span>
        </div>
      </div>

      <AdesaoChip value={orc.adesaoZero} />
      <DocCounter loaded={loaded} total={DOC_TIPOS.length} />

      <ChevronRight className="h-5 w-5 shrink-0 text-gray-300 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-violet-400" />
    </button>
  );
}

/* ---------------------------- modal pieces ---------------------------- */

function SegToggle({ value }) {
  const options = [
    { label: "Sim", v: true },
    { label: "Não", v: false },
  ];
  return (
    <div className="flex rounded-lg bg-gray-100 p-0.5">
      {options.map((opt) => {
        const active = value === opt.v;
        return (
          <button
            key={opt.label}
            type="button"
            className={`rounded-md px-5 py-1.5 text-[13px] font-medium transition-all duration-200 ${
              active
                ? "bg-white text-violet-700 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function DocSlot({ label, doc }) {
  if (doc) {
    return (
      <div className="rounded-xl border border-gray-100 bg-white p-4 ring-1 ring-transparent transition-all duration-200 hover:ring-emerald-100">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
          <span className="text-[13px] font-semibold text-gray-800">{label}</span>
        </div>
        <p className="mt-1.5 truncate text-[12px] text-gray-400" title={doc.file}>
          {doc.file} · {doc.size}
        </p>
        <div className="mt-3 flex items-center justify-between border-t border-gray-50 pt-2.5">
          <button className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-violet-600 transition-colors duration-200 hover:text-violet-700">
            <Eye className="h-3.5 w-3.5" /> Visualizar
          </button>
          <div className="flex items-center gap-1">
            <button
              title="Reenviar"
              aria-label="Reenviar documento"
              className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 transition-colors duration-200 hover:bg-gray-100 hover:text-gray-600"
            >
              <Upload className="h-3.5 w-3.5" />
            </button>
            <button
              title="Excluir"
              aria-label="Excluir documento"
              className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 transition-colors duration-200 hover:bg-red-50 hover:text-red-500"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/40 p-4">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 shrink-0 text-gray-300" />
        <span className="text-[13px] font-semibold text-gray-500">{label}</span>
      </div>
      <button className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-violet-200 py-2.5 text-[12.5px] font-medium text-violet-600 transition-all duration-200 hover:border-violet-300 hover:bg-violet-50">
        <Upload className="h-3.5 w-3.5" /> Enviar arquivo
      </button>
    </div>
  );
}

function OrcamentoModal({ orc, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const loaded = loadedCount(orc);
  const total = DOC_TIPOS.length;
  const pct = Math.round((loaded / total) * 100);
  const complete = loaded === total;

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
        aria-label={`Orçamento Nº ${orc.numero}`}
        style={{ animation: "od-modal 320ms cubic-bezier(0.16,1,0.3,1) both" }}
        className="relative z-10 flex max-h-[92vh] w-full max-w-[640px] flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
      >
        {/* header */}
        <div className="relative shrink-0 overflow-hidden border-b border-gray-100 px-6 py-5">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_120%_at_0%_0%,rgba(167,139,250,0.10),transparent)]" />
          <div className="relative flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-100 text-violet-600">
                  <FileText className="h-[18px] w-[18px]" />
                </div>
                <div>
                  <h2 className="text-[17px] font-bold leading-tight text-gray-900">
                    Orçamento Nº {orc.numero}
                  </h2>
                  <p className="text-[12.5px] text-gray-400">
                    Fechamento {orc.fechamento} · {orc.produto}
                  </p>
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Fechar"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors duration-200 hover:bg-gray-100 hover:text-gray-700"
            >
              <X className="h-[18px] w-[18px]" />
            </button>
          </div>

          {/* progresso documentos */}
          <div className="relative mt-4">
            <div className="flex items-center justify-between text-[12px]">
              <span className="font-medium text-gray-500">
                {loaded} de {total} documentos
              </span>
              <span className={`font-semibold ${complete ? "text-emerald-600" : "text-amber-600"}`}>
                {complete ? "Completo" : `${pct}%`}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100">
              <div
                style={{ width: `${pct}%`, animation: "od-bar 700ms ease-out both", transformOrigin: "left" }}
                className={`h-full rounded-full ${complete ? "bg-emerald-500" : "bg-gradient-to-r from-violet-500 to-fuchsia-500"}`}
              />
            </div>
          </div>
        </div>

        {/* body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* Adesão Zero */}
          <div className="flex items-center justify-between gap-4 rounded-xl border border-violet-100 bg-violet-50/50 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="h-5 w-5 text-violet-600" />
              <div>
                <p className="text-[13.5px] font-semibold text-gray-900">
                  Adesão Zero <span className="text-red-500">*</span>
                </p>
              </div>
            </div>
            <SegToggle value={orc.adesaoZero} />
          </div>

          {/* documentos */}
          <div className="mt-5">
            <div className="mb-2.5 flex items-center justify-between">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">
                Documentos
              </h3>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {DOC_TIPOS.map(({ tipo, label }) => (
                <DocSlot key={tipo} label={label} doc={orc.docs[tipo]} />
              ))}
            </div>
          </div>

          <p className="mt-4 text-[11px] text-gray-400">
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
        <div key={i} className="flex items-center gap-4 rounded-xl border border-gray-100 px-4 py-3.5">
          <div className="od-skeleton h-11 w-11 rounded-xl" />
          <div className="flex-1 space-y-2">
            <div className="od-skeleton h-4 w-40 rounded" />
            <div className="od-skeleton h-3 w-56 rounded" />
          </div>
          <div className="od-skeleton h-6 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/* ---------------------------- page ---------------------------- */

export default function OrcamentoDocumentosRedesignDemo() {
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 750);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-[#faf9fe] via-[#fdfcff] to-white font-['Inter'] text-gray-900 antialiased">
      <style>{MOTION_CSS}</style>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[360px] bg-[radial-gradient(55%_100%_at_18%_0%,rgba(167,139,250,0.10),transparent),radial-gradient(45%_85%_at_88%_0%,rgba(232,121,249,0.06),transparent)]" />

      {/* Top bar */}
      <header className="sticky top-0 z-30 bg-white/60 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[920px] items-center justify-between px-6 py-3.5">
          <div className="flex items-center gap-2.5 text-[13px] text-gray-400">
            <button className="-ml-1.5 flex h-7 w-7 items-center justify-center rounded-md text-gray-400 transition-colors duration-200 hover:bg-gray-100 hover:text-gray-700">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <span className="transition-colors duration-200 hover:text-gray-600">Upsell</span>
            <span className="text-gray-300">/</span>
            <span className="transition-colors duration-200 hover:text-gray-600">TAIS DEQUI</span>
            <span className="text-gray-300">/</span>
            <span className="font-medium text-gray-600">Orçamento</span>
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-[920px] px-6 pb-20 pt-6">
        {/* Card: Documentos & Adesão Zero */}
        <section
          style={{ animation: "od-enter 450ms cubic-bezier(0.16,1,0.3,1) both" }}
          className="overflow-hidden rounded-2xl bg-white shadow-[0_1px_3px_rgba(16,24,40,0.04),0_18px_44px_-22px_rgba(76,29,149,0.12)] ring-1 ring-gray-100/80"
        >
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-100 text-violet-600">
                <FileText className="h-[18px] w-[18px]" />
              </div>
              <div>
                <h1 className="text-[15px] font-bold leading-tight text-gray-900">
                  Documentos &amp; Adesão Zero
                </h1>
                <p className="text-[12.5px] text-gray-400">
                  {ORCAMENTOS.length} orçamentos · clique no número para gerenciar
                </p>
              </div>
            </div>
            <button className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] text-gray-500 transition-colors duration-200 hover:bg-gray-100 hover:text-violet-600">
              <RefreshCw className="h-4 w-4" /> Atualizar
            </button>
          </div>

          <div className="p-5">
            {loading ? (
              <ListSkeleton />
            ) : (
              <div className="space-y-3">
                {ORCAMENTOS.map((orc, i) => (
                  <OrcamentoRow key={orc.id} orc={orc} index={i} onOpen={setSelected} />
                ))}
              </div>
            )}
          </div>
        </section>

        <p className="mt-4 px-1 text-[12px] text-gray-400">
          Demonstração visual · dados fictícios · os botões não executam ações reais.
        </p>
      </main>

      {selected && <OrcamentoModal orc={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
