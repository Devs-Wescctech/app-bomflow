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
  Target,
  Clock,
  Gauge,
  ChevronRight,
  ShieldCheck,
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

const ACCENTS: Record<string, { node: string; bar: string }> = {
  violet: { node: "bg-violet-100 text-violet-600", bar: "bg-violet-400" },
  emerald: { node: "bg-emerald-100 text-emerald-600", bar: "bg-emerald-400" },
  gray: { node: "bg-gray-100 text-gray-400", bar: "bg-transparent" },
};

function MetaRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-gray-400">{children}</p>
  );
}

function ScoreRing({ score }: { score: number }) {
  const r = 24;
  const c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;
  return (
    <div className="relative h-[58px] w-[58px]">
      <svg className="h-full w-full -rotate-90" viewBox="0 0 58 58">
        <circle cx="29" cy="29" r={r} fill="none" stroke="rgb(237 233 254)" strokeWidth="5" />
        <circle
          cx="29"
          cy="29"
          r={r}
          fill="none"
          stroke="url(#scoreGrad)"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
        <defs>
          <linearGradient id="scoreGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgb(16 185 129)" />
            <stop offset="100%" stopColor="rgb(34 197 94)" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[16px] font-semibold tracking-tight text-gray-900">{score}</span>
      </div>
    </div>
  );
}

export function Redesign() {
  return (
    <div className="relative min-h-screen bg-gradient-to-b from-[#f5f3ff] via-[#fbfaff] to-white font-['Inter'] text-gray-900 antialiased">
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
        {/* ===== Premium hero panel ===== */}
        <div className="mt-6 overflow-hidden rounded-[28px] bg-white/95 shadow-[0_1px_3px_rgba(16,24,40,0.04),0_28px_70px_-28px_rgba(91,33,182,0.3)] ring-1 ring-white/70 backdrop-blur">
          <div className="relative bg-gradient-to-b from-violet-50/70 via-white to-white px-9 pb-8 pt-9">
            <div className="pointer-events-none absolute -right-16 -top-24 h-60 w-60 rounded-full bg-gradient-to-br from-violet-300/30 to-fuchsia-300/20 blur-3xl" />

            <div className="relative flex items-start justify-between gap-6">
              <div className="flex items-center gap-5">
                <div className="relative">
                  <div className="absolute -inset-1.5 rounded-full bg-gradient-to-br from-violet-400 to-fuchsia-400 opacity-30 blur-md" />
                  <div className="relative flex h-[68px] w-[68px] items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-2xl font-semibold text-white shadow-lg shadow-violet-300/50 ring-[3px] ring-white">
                    T
                  </div>
                </div>
                <div>
                  <h1 className="text-[40px] font-semibold leading-none tracking-[-0.03em] text-gray-900">
                    TAIS DEQUI
                  </h1>
                  <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[13px]">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-100/80 px-2.5 py-1 font-medium text-violet-700 ring-1 ring-violet-200/60">
                      <span className="h-1.5 w-1.5 rounded-full bg-violet-500" /> Qualificado
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100/80 px-2.5 py-1 font-medium text-amber-700 ring-1 ring-amber-200/60">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> Morno
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 font-medium text-gray-600 ring-1 ring-gray-200/60">
                      Agente TESTE3
                    </span>
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] text-gray-400">
                    <span>Lead criado há 6 dias</span>
                    <span className="text-gray-300">•</span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3 text-gray-300" /> Última interação hoje às 17:42
                    </span>
                    <span className="text-gray-300">•</span>
                    <span>2 dependentes</span>
                    <span className="text-gray-300">•</span>
                    <span>Plano Familiar</span>
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button className="flex items-center gap-2 rounded-lg bg-white/70 px-3 py-1.5 text-[13px] font-medium text-gray-600 ring-1 ring-gray-200/70 transition-all duration-200 hover:bg-white hover:text-gray-900 hover:shadow-sm">
                  <Phone className="h-4 w-4" /> WhatsApp
                </button>
                <button className="flex items-center gap-2 rounded-lg bg-white/70 px-3 py-1.5 text-[13px] font-medium text-gray-600 ring-1 ring-gray-200/70 transition-all duration-200 hover:bg-white hover:text-gray-900 hover:shadow-sm">
                  <Mail className="h-4 w-4" /> E-mail
                </button>
                <button className="flex items-center gap-2 rounded-lg bg-gradient-to-b from-gray-800 to-gray-900 px-3.5 py-1.5 text-[13px] font-medium text-white shadow-sm shadow-gray-300 transition-all duration-200 hover:from-gray-700 hover:to-gray-800 active:scale-[0.98]">
                  Avançar etapa <ArrowUpRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Pipeline */}
            <div className="relative mt-9 flex items-center">
              {STAGES.map((s, i) => {
                const done = i < CURRENT;
                const current = i === CURRENT;
                return (
                  <div key={s.value} className="flex flex-1 items-center last:flex-none">
                    <div className="group flex cursor-pointer items-center gap-2">
                      <span
                        className={`relative flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold transition-all duration-200 ${
                          done
                            ? "bg-violet-100 text-violet-600 group-hover:bg-violet-200"
                            : current
                              ? "bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-md shadow-violet-300/60 ring-4 ring-violet-100"
                              : "bg-gray-100 text-gray-400 group-hover:bg-gray-200"
                        }`}
                      >
                        {current && (
                          <span className="absolute inset-0 animate-ping rounded-full bg-violet-400 opacity-30" />
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

          {/* Executive band — integrated footer of hero (subtle, not competing) */}
          <div className="grid grid-cols-1 border-t border-gray-100 lg:grid-cols-[1fr_300px]">
            <div className="group flex items-center justify-between gap-5 px-9 py-5">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-md shadow-violet-300/50 transition-transform duration-200 group-hover:scale-105">
                  <Target className="h-[22px] w-[22px]" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-violet-500">
                    Próxima ação recomendada
                  </p>
                  <p className="mt-1 text-[17px] font-semibold leading-snug tracking-tight text-gray-900">
                    Enviar mensagem via WhatsApp
                  </p>
                  <p className="mt-0.5 text-[12px] text-gray-500">
                    Cliente aguarda retorno desde hoje, 17:42
                  </p>
                </div>
              </div>
              <button className="flex shrink-0 items-center gap-1.5 rounded-xl bg-gradient-to-b from-violet-600 to-violet-700 px-4 py-2.5 text-[13px] font-semibold text-white shadow-md shadow-violet-300/60 transition-all duration-200 hover:from-violet-500 hover:to-violet-600 hover:shadow-lg hover:shadow-violet-300/70 active:scale-[0.97]">
                Executar <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="flex items-center gap-4 border-t border-gray-100 px-9 py-5 lg:border-l lg:border-t-0">
              <ScoreRing score={82} />
              <div className="flex-1">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">
                  <Gauge className="h-3.5 w-3.5" /> Lead Score
                </p>
                <p className="mt-0.5 text-[13px] text-gray-400">
                  <span className="text-[16px] font-semibold text-gray-900">82</span> / 100
                </p>
                <span className="mt-1 inline-flex items-center gap-1.5 text-[12px] font-medium text-emerald-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Alto potencial
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ===== Body ===== */}
        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
          {/* Main column — single elevated panel, no inner cards */}
          <div className="rounded-[24px] bg-white px-8 pb-8 pt-7 shadow-[0_1px_3px_rgba(16,24,40,0.04),0_18px_44px_-22px_rgba(76,29,149,0.18)] ring-1 ring-gray-100/80">
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

            {/* Composer — clean underline, no inner card */}
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

            {/* Timeline — integrated feed, no card-in-card */}
            <div className="mt-11">
              <p className="mb-5 text-[13px] font-semibold text-gray-900">Atividade recente</p>
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
                        className="group/item relative -mx-3 flex gap-4 rounded-xl py-3.5 pl-3 pr-3 transition-all duration-200 hover:bg-gray-50/80"
                      >
                        {highlighted && (
                          <span
                            className={`absolute left-0 top-1/2 h-7 w-[3px] -translate-y-1/2 rounded-full ${a.bar}`}
                          />
                        )}
                        <div
                          className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-4 ring-white transition-transform duration-200 group-hover/item:scale-110 ${a.node}`}
                        >
                          <Icon className="h-[15px] w-[15px]" />
                        </div>
                        <div className="flex-1 pt-1">
                          <div className="flex items-baseline justify-between gap-3">
                            <p className="text-[14px] font-medium text-gray-800">{item.title}</p>
                            <span className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-gray-400">
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

          {/* Right rail */}
          <aside className="space-y-6">
            {/* ===== Negócio — THE focal point (wow) ===== */}
            <div className="group relative overflow-hidden rounded-[24px] bg-gradient-to-br from-violet-600 via-violet-700 to-indigo-800 p-6 text-white shadow-[0_12px_50px_-12px_rgba(91,33,182,0.7)] ring-1 ring-white/10 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_20px_60px_-12px_rgba(91,33,182,0.8)]">
              {/* layered light: glossy sheen + glow + dotted texture */}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/15 to-transparent" />
              <div className="pointer-events-none absolute -right-14 -top-14 h-48 w-48 rounded-full bg-fuchsia-400/25 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-16 -left-10 h-44 w-44 rounded-full bg-indigo-400/20 blur-3xl" />
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.07]"
                style={{
                  backgroundImage: "radial-gradient(rgba(255,255,255,0.9) 1px, transparent 1px)",
                  backgroundSize: "16px 16px",
                }}
              />

              <div className="relative flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-200">
                  Negócio
                </p>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/20 px-2.5 py-0.5 text-[11px] font-medium text-emerald-200 ring-1 ring-emerald-300/30">
                  <ShieldCheck className="h-3 w-3" /> Contrato ativo
                </span>
              </div>

              <p className="relative mt-4 text-[11px] uppercase tracking-wide text-violet-200/80">
                Valor estimado
              </p>
              <p className="relative mt-0.5 text-[40px] font-semibold leading-none tracking-[-0.03em] text-white [font-variant-numeric:tabular-nums] drop-shadow-sm">
                R$ 139,90
              </p>
              <p className="relative mt-1.5 text-[12px] text-violet-200/80">mensal · adesão inclusa</p>

              <div className="relative mt-4 flex items-center gap-2 text-[12px]">
                <span className="rounded-md bg-white/10 px-2 py-0.5 font-medium text-white ring-1 ring-white/15 backdrop-blur-sm">
                  Plano Familiar
                </span>
                <span className="rounded-md bg-white/10 px-2 py-0.5 font-medium text-white ring-1 ring-white/15 backdrop-blur-sm">
                  2 dependentes
                </span>
              </div>

              <div className="relative mt-5 rounded-xl bg-white/5 p-3.5 ring-1 ring-white/10 backdrop-blur-sm">
                <div className="flex items-center justify-between text-[12px]">
                  <span className="font-medium text-violet-100">Chance de fechamento</span>
                  <span className="font-semibold text-emerald-300 [font-variant-numeric:tabular-nums]">82%</span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/15">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-300 to-green-400 shadow-[0_0_14px_rgba(52,211,153,0.7)] transition-all duration-500"
                    style={{ width: "82%" }}
                  />
                </div>
              </div>
            </div>

            {/* ===== Unified info panel (Detalhes + Valores + ERP) ===== */}
            <div className="rounded-[24px] bg-white shadow-[0_1px_3px_rgba(16,24,40,0.04),0_18px_44px_-22px_rgba(76,29,149,0.16)] ring-1 ring-gray-100/80">
              <div className="px-6 pb-5 pt-6">
                <SectionLabel>Detalhes</SectionLabel>
                <div className="mt-2 divide-y divide-gray-50">
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
              </div>

              <div className="mx-6 h-px bg-gradient-to-r from-transparent via-gray-100 to-transparent" />

              <div className="px-6 py-5">
                <SectionLabel>Valores</SectionLabel>
                <div className="mt-2 divide-y divide-gray-50">
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
              </div>

              <div className="mx-6 h-px bg-gradient-to-r from-transparent via-gray-100 to-transparent" />

              <div className="px-6 pb-6 pt-5">
                <SectionLabel>ERP</SectionLabel>
                <div className="mt-2 divide-y divide-gray-50">
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
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
