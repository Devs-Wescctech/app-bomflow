import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Phone,
  Mail,
  Calendar,
  MapPin,
  FileText,
  FileSignature,
  Calculator,
  Activity,
  ListTodo,
  Bell,
  ArrowUpRight,
  Check,
  MoreHorizontal,
  Plus,
  Sparkles,
  MessageSquare,
  TrendingUp,
  Clock,
  Gauge,
  ChevronRight,
  Wallet,
  Zap,
} from "lucide-react";

const STAGES = [
  { value: "novo", label: "Novo" },
  { value: "abordado", label: "Abordado" },
  { value: "qualificado", label: "Qualificado" },
  { value: "proposta_enviada", label: "Proposta Enviada" },
  { value: "fechado", label: "Fechado" },
];
const CURRENT = 2;

const TABS = [
  { value: "activities", label: "Atividades", icon: Activity },
  { value: "tasks", label: "Tarefas", icon: ListTodo, badge: 1 },
  { value: "proposal", label: "Proposta", icon: FileText },
  { value: "orcamento", label: "Orçamento", icon: Calculator },
  { value: "contract", label: "Contrato", icon: FileSignature },
];

const TIMELINE = [
  {
    icon: TrendingUp,
    title: "Etapa alterada para Qualificado",
    by: "TESTE3",
    when: "Hoje · 17:42",
    accent: "violet",
  },
  {
    icon: MessageSquare,
    title: "Nota adicionada",
    desc: "Cliente demonstrou interesse no Plano Familiar. Tem 2 dependentes e quer incluir telemedicina.",
    by: "TESTE3",
    when: "Hoje · 17:38",
    accent: "gray",
  },
  {
    icon: Phone,
    title: "Contato via WhatsApp",
    desc: "Primeiro contato realizado. Cliente respondeu e agendou retorno.",
    by: "TESTE3",
    when: "Hoje · 17:30",
    accent: "emerald",
  },
  {
    icon: Sparkles,
    title: "Lead criado",
    desc: "Origem: Indicação",
    by: "Sistema",
    when: "16/06 · 09:12",
    accent: "gray",
  },
];

const ACCENTS = {
  violet: { node: "bg-violet-100 text-violet-600", bar: "bg-violet-400" },
  emerald: { node: "bg-emerald-100 text-emerald-600", bar: "bg-emerald-400" },
  gray: { node: "bg-gray-100 text-gray-400", bar: "bg-transparent" },
};

function MetaRow({ label, value, mono }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <span className="shrink-0 text-[13px] text-gray-400">{label}</span>
      <span
        className={`text-right text-[13px] font-medium text-gray-700 ${mono ? "font-mono tracking-tight" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

function Collapsible({ icon: Icon, label, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-[0_1px_3px_rgba(16,24,40,0.04),0_14px_36px_-22px_rgba(76,29,149,0.16)] ring-1 ring-gray-100/80">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-5 py-3.5 transition-colors duration-200 hover:bg-gray-50/70"
      >
        <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-gray-500">
          {Icon && <Icon className="h-3.5 w-3.5 text-violet-400" />} {label}
        </span>
        <ChevronRight
          className={`h-4 w-4 text-gray-300 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
        />
      </button>
      {open && <div className="px-5 pb-5">{children}</div>}
    </div>
  );
}

function ScoreRing({ score, size = 58 }) {
  const stroke = size >= 56 ? 5 : 4;
  const r = (size - stroke) / 2 - 1;
  const c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;
  const center = size / 2;
  return (
    <div className="relative shrink-0" style={{ height: size, width: size }}>
      <svg className="h-full w-full -rotate-90" viewBox={`0 0 ${size} ${size}`}>
        <circle cx={center} cy={center} r={r} fill="none" stroke="rgb(237 233 254)" strokeWidth={stroke} />
        <circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          stroke="url(#scoreGrad)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{
            "--ring-c": c,
            animation: "lead-ring 1000ms ease-out both",
            animationDelay: "300ms",
          }}
        />
        <defs>
          <linearGradient id="scoreGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgb(16 185 129)" />
            <stop offset="100%" stopColor="rgb(34 197 94)" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span
          className="font-semibold tracking-tight text-gray-900"
          style={{ fontSize: size >= 56 ? 16 : 14 }}
        >
          {score}
        </span>
      </div>
    </div>
  );
}

const MOTION_CSS = `
@keyframes lead-enter {
  from { opacity: 0; transform: translateY(14px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes lead-grow {
  from { transform: scaleX(0); }
  to { transform: scaleX(1); }
}
@keyframes lead-bar {
  from { transform: scaleX(0); }
  to { transform: scaleX(1); }
}
@keyframes lead-ring {
  from { stroke-dashoffset: var(--ring-c); }
}
@keyframes lead-shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
@keyframes lead-avatar-glow {
  0%, 100% { opacity: 0.24; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(1.05); }
}
@keyframes lead-halo {
  0%, 100% { opacity: 0.4; transform: scale(1); }
  50% { opacity: 0.08; transform: scale(1.4); }
}
@keyframes lead-pulse {
  0% { opacity: 0.6; transform: scale(1); }
  70% { opacity: 0; transform: scale(2.1); }
  100% { opacity: 0; transform: scale(2.1); }
}
@keyframes lead-pulse-node {
  0%, 100% { box-shadow: 0 4px 6px -1px rgba(167,139,250,0.6), 0 0 0 0 rgba(167,139,250,0.45); }
  50% { box-shadow: 0 4px 10px -1px rgba(167,139,250,0.8), 0 0 0 5px rgba(167,139,250,0); }
}
.lead-skeleton {
  background: linear-gradient(90deg, #eceaf4 25%, #f6f3ff 37%, #eceaf4 63%);
  background-size: 200% 100%;
  animation: lead-shimmer 1.4s ease-in-out infinite;
}
@media (prefers-reduced-motion: reduce) {
  [style*="lead-enter"], [style*="lead-grow"], [style*="lead-ring"], [style*="lead-bar"] {
    animation: none !important;
    opacity: 1 !important;
    transform: none !important;
  }
  [style*="lead-avatar-glow"], [style*="lead-halo"], [style*="lead-pulse"] {
    animation: none !important;
  }
}
`;

function MainSkeleton() {
  return (
    <div className="mt-6 space-y-6">
      {/* compact hero */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="lead-skeleton h-[52px] w-[52px] rounded-full" />
          <div className="space-y-2.5">
            <div className="lead-skeleton h-6 w-56 rounded-lg" />
            <div className="flex gap-2">
              <div className="lead-skeleton h-5 w-24 rounded-full" />
              <div className="lead-skeleton h-5 w-20 rounded-full" />
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <div className="lead-skeleton h-8 w-28 rounded-lg" />
          <div className="lead-skeleton h-8 w-24 rounded-lg" />
        </div>
      </div>
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="lead-skeleton h-[108px] rounded-2xl" />
        ))}
      </div>
      {/* pipeline */}
      <div className="lead-skeleton h-[76px] rounded-2xl" />
      {/* body */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-5 rounded-[24px] bg-white p-8 shadow-[0_1px_3px_rgba(16,24,40,0.04),0_18px_44px_-22px_rgba(76,29,149,0.12)] ring-1 ring-gray-100/80">
          <div className="flex gap-7">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="lead-skeleton h-4 w-20 rounded" />
            ))}
          </div>
          <div className="lead-skeleton h-12 w-full rounded-xl" />
          <div className="space-y-5 pt-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex gap-4">
                <div className="lead-skeleton h-8 w-8 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="lead-skeleton h-4 w-1/2 rounded" />
                  <div className="lead-skeleton h-3 w-3/4 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <div className="lead-skeleton h-12 rounded-2xl" />
          <div className="lead-skeleton h-12 rounded-2xl" />
          <div className="lead-skeleton h-12 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

const fmtBRL = (n) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function useCountUp(target, { duration = 1100, delay = 0, start = true } = {}) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!start) return undefined;
    if (
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setValue(target);
      return undefined;
    }
    let raf;
    let startTs;
    const timeout = setTimeout(() => {
      const tick = (ts) => {
        if (startTs === undefined) startTs = ts;
        const p = Math.min((ts - startTs) / duration, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        setValue(target * eased);
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, delay);
    return () => {
      clearTimeout(timeout);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [target, duration, delay, start]);
  return value;
}

export default function UpsellLeadRedesignDemo() {
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 750);
    return () => clearTimeout(t);
  }, []);
  const dealValue = useCountUp(139.9, { duration: 1100, delay: 450, start: !loading });
  return (
    <div className="relative min-h-screen bg-gradient-to-b from-[#f5f3ff] via-[#fbfaff] to-white font-['Inter'] text-gray-900 antialiased">
      <style>{MOTION_CSS}</style>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[440px] bg-[radial-gradient(55%_100%_at_18%_0%,rgba(167,139,250,0.18),transparent),radial-gradient(45%_85%_at_88%_0%,rgba(232,121,249,0.12),transparent)]" />

      {/* Top bar */}
      <header className="sticky top-0 z-30 bg-white/60 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between px-8 py-3.5">
          <div className="flex items-center gap-2.5 text-[13px] text-gray-400">
            <button className="-ml-1.5 flex h-7 w-7 items-center justify-center rounded-md text-gray-400 transition-colors duration-200 hover:bg-gray-100 hover:text-gray-700">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <span className="transition-colors duration-200 hover:text-gray-600">Upsell</span>
            <span className="text-gray-300">/</span>
            <span className="transition-colors duration-200 hover:text-gray-600">Leads</span>
            <span className="text-gray-300">/</span>
            <span className="font-medium text-gray-600">TAIS DEQUI</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors duration-200 hover:bg-gray-100 hover:text-gray-700">
              <Bell className="h-[18px] w-[18px]" />
            </button>
            <button className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors duration-200 hover:bg-gray-100 hover:text-gray-700">
              <MoreHorizontal className="h-[18px] w-[18px]" />
            </button>
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-[1180px] px-8 pb-16">
        {loading ? (
          <MainSkeleton />
        ) : (
          <>
            {/* ===== Compact hero ===== */}
            <section
              style={{ animation: "lead-enter 450ms cubic-bezier(0.16,1,0.3,1) both" }}
              className="mt-6 flex flex-wrap items-center justify-between gap-4"
            >
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div
                    style={{ animation: "lead-avatar-glow 6s ease-in-out infinite" }}
                    className="absolute -inset-1.5 rounded-full bg-gradient-to-br from-violet-400 to-fuchsia-400 opacity-30 blur-lg"
                  />
                  <div className="relative flex h-[52px] w-[52px] items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-xl font-semibold text-white shadow-lg shadow-violet-300/50 ring-[3px] ring-white">
                    T
                  </div>
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                    <h1 className="text-[26px] font-semibold leading-none tracking-[-0.02em] text-gray-900">
                      TAIS DEQUI
                    </h1>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-100/80 px-2.5 py-1 text-[12px] font-medium text-violet-700 ring-1 ring-violet-200/60">
                      <span className="h-1.5 w-1.5 rounded-full bg-violet-500" /> Qualificado
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100/80 px-2.5 py-1 text-[12px] font-medium text-amber-700 ring-1 ring-amber-200/60">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> Morno
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-gray-400">
                    <span className="font-medium text-gray-500">Agente TESTE3</span>
                    <span className="text-gray-300">•</span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3 text-gray-300" /> Última interação hoje às 17:42
                    </span>
                    <span className="text-gray-300">•</span>
                    <span>Plano Familiar · 2 dependentes</span>
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button className="flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-[13px] font-medium text-gray-600 ring-1 ring-gray-200/70 transition-all duration-200 hover:-translate-y-px hover:text-gray-900 hover:shadow-md">
                  <Phone className="h-4 w-4" /> WhatsApp
                </button>
                <button className="flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-[13px] font-medium text-gray-600 ring-1 ring-gray-200/70 transition-all duration-200 hover:-translate-y-px hover:text-gray-900 hover:shadow-md">
                  <Mail className="h-4 w-4" /> E-mail
                </button>
                <button className="flex items-center gap-2 rounded-lg bg-gradient-to-b from-gray-800 to-gray-900 px-3.5 py-1.5 text-[13px] font-medium text-white shadow-sm shadow-gray-300 transition-all duration-200 hover:from-gray-700 hover:to-gray-800 active:scale-[0.98]">
                  Avançar etapa <ArrowUpRight className="h-4 w-4" />
                </button>
              </div>
            </section>

            {/* ===== KPI row — business cockpit ===== */}
            <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
              {/* Valor do negócio — premium focal KPI with count-up */}
              <div
                style={{ animation: "lead-enter 450ms cubic-bezier(0.16,1,0.3,1) both", animationDelay: "60ms" }}
                className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-600 via-violet-700 to-indigo-800 p-5 text-white shadow-[0_12px_40px_-14px_rgba(91,33,182,0.7)] ring-1 ring-white/10 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_56px_-14px_rgba(91,33,182,0.85)]"
              >
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/15 to-transparent" />
                <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-fuchsia-400/25 blur-2xl" />
                <p className="relative flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-violet-200">
                  <Wallet className="h-3.5 w-3.5" /> Valor do negócio
                </p>
                <p className="relative mt-3 text-[28px] font-semibold leading-none tracking-[-0.02em] [font-variant-numeric:tabular-nums] drop-shadow-sm">
                  R$ {fmtBRL(dealValue)}
                </p>
                <p className="relative mt-2 text-[12px] text-violet-200/80">mensal · adesão inclusa</p>
              </div>

              {/* Lead Score */}
              <div
                style={{ animation: "lead-enter 450ms cubic-bezier(0.16,1,0.3,1) both", animationDelay: "120ms" }}
                className="flex items-center gap-4 rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(16,24,40,0.04),0_14px_36px_-22px_rgba(76,29,149,0.16)] ring-1 ring-gray-100/80 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_1px_3px_rgba(16,24,40,0.05),0_22px_50px_-22px_rgba(76,29,149,0.24)]"
              >
                <ScoreRing score={82} size={54} />
                <div>
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">
                    <Gauge className="h-3.5 w-3.5" /> Lead Score
                  </p>
                  <p className="mt-1.5 text-[20px] font-semibold leading-none text-gray-900 [font-variant-numeric:tabular-nums]">
                    82<span className="text-[13px] font-normal text-gray-400"> /100</span>
                  </p>
                  <span className="mt-1.5 inline-flex items-center gap-1.5 text-[12px] font-medium text-emerald-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Alto potencial
                  </span>
                </div>
              </div>

              {/* Chance de fechamento */}
              <div
                style={{ animation: "lead-enter 450ms cubic-bezier(0.16,1,0.3,1) both", animationDelay: "180ms" }}
                className="rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(16,24,40,0.04),0_14px_36px_-22px_rgba(76,29,149,0.16)] ring-1 ring-gray-100/80 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_1px_3px_rgba(16,24,40,0.05),0_22px_50px_-22px_rgba(76,29,149,0.24)]"
              >
                <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-gray-400">
                  <TrendingUp className="h-3.5 w-3.5 text-emerald-500" /> Chance de fechamento
                </p>
                <p className="mt-3 text-[28px] font-semibold leading-none text-gray-900 [font-variant-numeric:tabular-nums]">
                  82%
                </p>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-green-500"
                    style={{
                      width: "82%",
                      transformOrigin: "left",
                      animation: "lead-bar 900ms cubic-bezier(0.16,1,0.3,1) both",
                      animationDelay: "450ms",
                    }}
                  />
                </div>
              </div>

              {/* Próxima ação */}
              <div
                style={{ animation: "lead-enter 450ms cubic-bezier(0.16,1,0.3,1) both", animationDelay: "240ms" }}
                className="group flex flex-col justify-between rounded-2xl bg-violet-50/70 p-5 ring-1 ring-violet-200/60 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_44px_-22px_rgba(124,58,237,0.45)]"
              >
                <div>
                  <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-violet-500">
                    <Zap className="h-3.5 w-3.5" /> Próxima ação
                  </p>
                  <p className="mt-2.5 text-[15px] font-semibold leading-snug tracking-tight text-gray-900">
                    Enviar mensagem via WhatsApp
                  </p>
                </div>
                <button className="mt-3 flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-b from-violet-600 to-violet-700 px-3 py-2 text-[12px] font-semibold text-white shadow-md shadow-violet-300/50 transition-all duration-200 hover:from-violet-500 hover:to-violet-600 active:scale-[0.97]">
                  Executar <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* ===== Full-width pipeline ===== */}
            <div
              style={{ animation: "lead-enter 450ms cubic-bezier(0.16,1,0.3,1) both", animationDelay: "300ms" }}
              className="mt-4 rounded-2xl bg-white px-7 py-5 shadow-[0_1px_3px_rgba(16,24,40,0.04),0_14px_36px_-22px_rgba(76,29,149,0.16)] ring-1 ring-gray-100/80"
            >
              <div className="relative flex items-center">
                {STAGES.map((s, i) => {
                  const done = i < CURRENT;
                  const current = i === CURRENT;
                  return (
                    <div key={s.value} className="flex flex-1 items-center last:flex-none">
                      <div className="group flex cursor-pointer items-center gap-2">
                        <span
                          style={
                            current ? { animation: "lead-pulse-node 2.2s ease-in-out infinite" } : undefined
                          }
                          className={`relative flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold transition-all duration-200 group-hover:scale-110 ${
                            done
                              ? "bg-violet-100 text-violet-600 group-hover:bg-violet-200"
                              : current
                                ? "bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white ring-4 ring-violet-100"
                                : "bg-gray-100 text-gray-400 group-hover:bg-gray-200"
                          }`}
                        >
                          {current && (
                            <>
                              <span
                                style={{ animation: "lead-pulse 2.2s ease-out infinite" }}
                                className="absolute inset-0 rounded-full ring-2 ring-violet-400/70"
                              />
                              <span
                                style={{ animation: "lead-pulse 2.2s ease-out infinite", animationDelay: "1.1s" }}
                                className="absolute inset-0 rounded-full ring-2 ring-violet-400/70"
                              />
                            </>
                          )}
                          {done ? <Check className="h-3 w-3" /> : i + 1}
                        </span>
                        <span
                          className={`whitespace-nowrap transition-all duration-200 ${
                            current
                              ? "text-[14px] font-semibold text-gray-900"
                              : done
                                ? "text-[13px] text-gray-500"
                                : "text-[13px] text-gray-300"
                          }`}
                        >
                          {s.label}
                        </span>
                      </div>
                      {i !== STAGES.length - 1 && (
                        <div className="mx-3 h-1 flex-1 rounded-full bg-gray-100">
                          <div
                            style={
                              done
                                ? {
                                    animation: "lead-grow 700ms cubic-bezier(0.16,1,0.3,1) both",
                                    animationDelay: `${250 + i * 130}ms`,
                                    transformOrigin: "left",
                                  }
                                : undefined
                            }
                            className={`h-full rounded-full ${
                              done ? "bg-gradient-to-r from-violet-300 to-violet-400" : "bg-transparent"
                            }`}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ===== Body: timeline (main) + secondary collapsible sidebar ===== */}
            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
              {/* Main column — the lead's story */}
              <div
                style={{ animation: "lead-enter 450ms cubic-bezier(0.16,1,0.3,1) both", animationDelay: "360ms" }}
                className="rounded-[24px] bg-white px-8 pb-8 pt-7 shadow-[0_1px_3px_rgba(16,24,40,0.04),0_18px_44px_-22px_rgba(76,29,149,0.18)] ring-1 ring-gray-100/80 transition-shadow duration-300 hover:shadow-[0_1px_3px_rgba(16,24,40,0.05),0_26px_60px_-24px_rgba(76,29,149,0.26)]"
              >
                <div className="flex items-center gap-7 border-b border-gray-100">
                  {TABS.map((t) => {
                    const active = t.value === "activities";
                    const Icon = t.icon;
                    return (
                      <button
                        key={t.value}
                        className={`relative -mb-px flex items-center gap-2 pb-3 text-[13px] font-medium transition-colors duration-200 ${
                          active ? "text-gray-900" : "text-gray-400 hover:text-gray-700"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        {t.label}
                        {t.badge && (
                          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-violet-100 px-1 text-[10px] font-semibold text-violet-600">
                            {t.badge}
                          </span>
                        )}
                        {active && (
                          <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500" />
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Composer */}
                <div className="mt-7 flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-[13px] font-medium text-white shadow-sm">
                    T
                  </div>
                  <div className="flex-1">
                    <textarea
                      rows={1}
                      placeholder="Escreva uma nota sobre este lead…"
                      className="w-full resize-none border-b border-gray-200 bg-transparent pb-2 text-[14px] leading-relaxed text-gray-800 outline-none transition-colors duration-200 placeholder:text-gray-400 focus:border-violet-400"
                    />
                    <div className="mt-2.5 flex justify-end">
                      <button className="flex items-center gap-1.5 rounded-lg bg-gradient-to-b from-violet-600 to-violet-700 px-3 py-1.5 text-[12px] font-semibold text-white shadow-sm shadow-violet-200 transition-all duration-200 hover:from-violet-500 hover:to-violet-600 active:scale-[0.98]">
                        <Plus className="h-3.5 w-3.5" /> Adicionar nota
                      </button>
                    </div>
                  </div>
                </div>

                {/* Timeline */}
                <div className="mt-11">
                  <p className="mb-5 text-[13px] font-semibold text-gray-900">Linha do tempo</p>
                  <div className="relative">
                    <span className="absolute left-[15px] top-3 h-[calc(100%-3.5rem)] w-px bg-gradient-to-b from-gray-200 via-gray-100 to-transparent" />
                    <div className="space-y-1">
                      {TIMELINE.map((item, i) => {
                        const Icon = item.icon;
                        const a = ACCENTS[item.accent];
                        const highlighted = item.accent !== "gray";
                        return (
                          <div
                            key={i}
                            style={{
                              animation: "lead-enter 380ms cubic-bezier(0.16,1,0.3,1) both",
                              animationDelay: `${400 + i * 80}ms`,
                            }}
                            className="group/item relative -mx-3 flex gap-4 rounded-xl py-3.5 pl-3 pr-3 transition-all duration-200 hover:translate-x-0.5 hover:bg-gray-50/80 hover:shadow-sm"
                          >
                            {highlighted && (
                              <span
                                className={`absolute left-0 top-1/2 h-7 w-[3px] -translate-y-1/2 rounded-full transition-all duration-200 group-hover/item:h-9 ${a.bar}`}
                              />
                            )}
                            <div
                              className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-4 ring-white transition-transform duration-200 group-hover/item:scale-110 ${a.node}`}
                            >
                              <Icon className="h-[15px] w-[15px]" />
                            </div>
                            <div className="flex-1 pt-1">
                              <div className="flex items-baseline justify-between gap-3">
                                <p
                                  className={`text-[14px] ${
                                    highlighted ? "font-semibold text-gray-900" : "font-medium text-gray-700"
                                  }`}
                                >
                                  {item.title}
                                </p>
                                <span className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-gray-400 [font-variant-numeric:tabular-nums]">
                                  {item.when}
                                </span>
                              </div>
                              {item.desc && (
                                <p className="mt-1.5 text-[13px] leading-relaxed text-gray-500">{item.desc}</p>
                              )}
                              <p className="mt-1.5 text-[12px] text-gray-300">{item.by}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Secondary rail — collapsible support sections */}
              <aside
                style={{ animation: "lead-enter 450ms cubic-bezier(0.16,1,0.3,1) both", animationDelay: "420ms" }}
                className="space-y-4"
              >
                <Collapsible icon={Phone} label="Contato" defaultOpen>
                  <div className="divide-y divide-gray-50">
                    <MetaRow label="Telefone" value="(51) 99999-0000" />
                    <MetaRow label="E-mail" value="tais.dequi@email.com" />
                    <MetaRow label="CPF" value="008.452.460-03" mono />
                    <MetaRow label="Fonte" value="Indicação" />
                    <MetaRow label="Interesse" value="Plano Familiar" />
                    <MetaRow
                      label="Cadastro"
                      value={
                        <span className="inline-flex items-center gap-1.5">
                          <Calendar className="h-3 w-3 text-gray-300" /> 16/06/2026
                        </span>
                      }
                    />
                    <MetaRow
                      label="Local"
                      value={
                        <span className="inline-flex items-center gap-1.5">
                          <MapPin className="h-3 w-3 text-gray-300" /> Canoas/RS
                        </span>
                      }
                    />
                  </div>
                </Collapsible>

                <Collapsible icon={Wallet} label="Valores" defaultOpen>
                  <div className="divide-y divide-gray-50">
                    <MetaRow label="Mensal" value="R$ 89,90" />
                    <MetaRow label="Adesão" value="R$ 50,00" />
                    <MetaRow label="Dependentes" value="2" />
                    <div className="flex items-baseline justify-between gap-4 py-3">
                      <span className="text-[13px] font-medium text-gray-900">Total estimado</span>
                      <span className="bg-gradient-to-r from-violet-600 to-fuchsia-600 bg-clip-text text-[18px] font-semibold tracking-tight text-transparent [font-variant-numeric:tabular-nums]">
                        R$ 139,90
                      </span>
                    </div>
                  </div>
                </Collapsible>

                <Collapsible icon={FileText} label="ERP">
                  <div className="divide-y divide-gray-50">
                    <MetaRow label="Contrato" value="#307977" mono />
                    <MetaRow label="Plano" value="BOM PASTOR FAMILIAR" />
                    <MetaRow label="Titular" value="TAIS DEQUI" />
                    <MetaRow label="Nascimento" value="21/06/1984" />
                  </div>
                  <div className="pt-3.5">
                    <p className="mb-2 text-[12px] text-gray-400">Dependentes</p>
                    <div className="flex flex-col gap-2">
                      <span className="text-[13px] text-gray-700">MARIA DEQUI</span>
                      <span className="text-[13px] text-gray-700">JOÃO DEQUI</span>
                    </div>
                  </div>
                </Collapsible>
              </aside>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
