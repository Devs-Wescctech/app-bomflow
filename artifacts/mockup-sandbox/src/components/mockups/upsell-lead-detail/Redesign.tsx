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
  { icon: TrendingUp, title: "Etapa alterada para Qualificado", by: "TESTE3", when: "17:42" },
  {
    icon: MessageSquare,
    title: "Nota adicionada",
    desc: "Cliente demonstrou interesse no Plano Familiar. Tem 2 dependentes e quer incluir telemedicina.",
    by: "TESTE3",
    when: "17:38",
  },
  {
    icon: Phone,
    title: "Contato via WhatsApp",
    desc: "Primeiro contato realizado. Cliente respondeu e agendou retorno.",
    by: "TESTE3",
    when: "17:30",
  },
  { icon: Sparkles, title: "Lead criado", desc: "Origem: Indicação", by: "Sistema", when: "17:28" },
];

function MetaRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <span className="shrink-0 text-[13px] text-gray-400">{label}</span>
      <span className={`text-right text-[13px] text-gray-700 ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">{children}</p>
  );
}

function ScoreRing({ score }: { score: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;
  return (
    <div className="relative h-[64px] w-[64px]">
      <svg className="h-full w-full -rotate-90" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r={r} fill="none" stroke="rgb(243 244 246)" strokeWidth="6" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke="rgb(16 185 129)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[17px] font-semibold tracking-tight text-gray-900">{score}</span>
      </div>
    </div>
  );
}

export function Redesign() {
  return (
    <div className="min-h-screen bg-white font-['Inter'] text-gray-900 antialiased">
      {/* Top bar */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md">
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
        <div className="h-px w-full bg-gray-100" />
      </header>

      <main className="mx-auto max-w-[1180px] px-8">
        {/* Hero — name is the focus */}
        <div className="pb-7 pt-9">
          <div className="flex items-start justify-between gap-6">
            <div className="flex items-center gap-5">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-2xl font-medium text-white shadow-sm">
                T
              </div>
              <div>
                <h1 className="text-[38px] font-semibold leading-none tracking-[-0.025em] text-gray-900">
                  TAIS DEQUI
                </h1>
                <div className="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-gray-400">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-violet-500" />
                    <span className="font-medium text-gray-700">Qualificado</span>
                  </span>
                  <span className="text-gray-200">·</span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-amber-400" /> Morno
                  </span>
                  <span className="text-gray-200">·</span>
                  <span>
                    Agente <span className="font-medium text-gray-700">TESTE3</span>
                  </span>
                  <span className="text-gray-200">·</span>
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-gray-300" />
                    Última interação <span className="font-medium text-gray-700">hoje, 17:42</span>
                  </span>
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] font-medium text-gray-500 transition-all duration-200 hover:bg-gray-100 hover:text-gray-800">
                <Phone className="h-4 w-4" /> WhatsApp
              </button>
              <button className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] font-medium text-gray-500 transition-all duration-200 hover:bg-gray-100 hover:text-gray-800">
                <Mail className="h-4 w-4" /> E-mail
              </button>
              <button className="flex items-center gap-2 rounded-lg bg-gray-900 px-3.5 py-1.5 text-[13px] font-medium text-white transition-all duration-200 hover:bg-gray-700 active:scale-[0.98]">
                Avançar etapa <ArrowUpRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Pipeline — quiet, inline */}
          <div className="mt-9 flex items-center">
            {STAGES.map((s, i) => {
              const done = i < CURRENT;
              const current = i === CURRENT;
              return (
                <div key={s.value} className="flex flex-1 items-center last:flex-none">
                  <div className="group flex cursor-pointer items-center gap-2">
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold transition-all duration-200 ${
                        done
                          ? "bg-violet-100 text-violet-600 group-hover:bg-violet-200"
                          : current
                            ? "bg-violet-600 text-white ring-4 ring-violet-100"
                            : "bg-gray-100 text-gray-400 group-hover:bg-gray-200"
                      }`}
                    >
                      {done ? <Check className="h-3 w-3" /> : i + 1}
                    </span>
                    <span
                      className={`whitespace-nowrap text-[13px] transition-colors duration-200 ${
                        current ? "font-semibold text-gray-900" : done ? "text-gray-500" : "text-gray-300"
                      }`}
                    >
                      {s.label}
                    </span>
                  </div>
                  {i !== STAGES.length - 1 && (
                    <div className="mx-3 h-0.5 flex-1 rounded-full bg-gray-100">
                      <div className={`h-full rounded-full ${done ? "bg-violet-300" : "bg-transparent"}`} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Executive band: Próxima Ação + Lead Score */}
          <div className="mt-7 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_270px]">
            {/* Próxima Ação */}
            <div className="group flex items-center justify-between gap-4 rounded-2xl bg-gradient-to-r from-violet-50 to-fuchsia-50/50 px-5 py-4 ring-1 ring-violet-100/70 transition-all duration-200 hover:ring-violet-200">
              <div className="flex items-center gap-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-violet-600 shadow-sm ring-1 ring-violet-100">
                  <Target className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-violet-500">
                    Próxima ação
                  </p>
                  <p className="mt-0.5 text-[15px] font-semibold text-gray-900">
                    Enviar mensagem via WhatsApp
                  </p>
                  <p className="text-[12px] text-gray-500">Cliente aguarda retorno desde hoje, 17:42</p>
                </div>
              </div>
              <button className="flex shrink-0 items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 py-2 text-[13px] font-semibold text-white transition-all duration-200 hover:bg-violet-700 active:scale-[0.98]">
                Executar <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* Lead Score */}
            <div className="flex items-center gap-4 rounded-2xl bg-gray-50/70 px-5 py-4 ring-1 ring-gray-100 transition-all duration-200 hover:ring-gray-200">
              <ScoreRing score={82} />
              <div>
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

        <div className="h-px w-full bg-gray-100" />

        {/* Body */}
        <div className="grid grid-cols-1 gap-14 py-8 lg:grid-cols-[1fr_300px]">
          {/* Main column */}
          <section>
            {/* Tabs — underline */}
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
                      <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-violet-600" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Composer */}
            <div className="mt-7 flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[13px] font-medium text-gray-500">
                T
              </div>
              <div className="flex-1">
                <textarea
                  rows={1}
                  placeholder="Escreva uma nota sobre este lead…"
                  className="w-full resize-none border-b border-gray-200 bg-transparent pb-2 text-[14px] leading-relaxed text-gray-800 outline-none transition-colors duration-200 placeholder:text-gray-400 focus:border-gray-900"
                />
                <div className="mt-2.5 flex justify-end">
                  <button className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-[12px] font-semibold text-white transition-all duration-200 hover:bg-violet-700 active:scale-[0.98]">
                    <Plus className="h-3.5 w-3.5" /> Adicionar nota
                  </button>
                </div>
              </div>
            </div>

            {/* Timeline */}
            <div className="mt-10">
              <p className="mb-5 text-[13px] font-semibold text-gray-900">Atividade recente</p>
              <div className="relative">
                <span className="absolute left-[15px] top-1 h-[calc(100%-2rem)] w-px bg-gray-100" />
                <div className="space-y-1">
                  {TIMELINE.map((item, i) => {
                    const Icon = item.icon;
                    return (
                      <div
                        key={i}
                        className="relative -mx-3 flex gap-4 rounded-xl px-3 py-3 transition-colors duration-200 hover:bg-gray-50"
                      >
                        <div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-gray-400 ring-1 ring-gray-100 transition-colors duration-200 group-hover:text-gray-600">
                          <Icon className="h-[15px] w-[15px]" />
                        </div>
                        <div className="flex-1 pt-1">
                          <div className="flex items-baseline justify-between gap-3">
                            <p className="text-[14px] font-medium text-gray-800">{item.title}</p>
                            <span className="shrink-0 text-[12px] text-gray-300">{item.when}</span>
                          </div>
                          {item.desc && (
                            <p className="mt-1 text-[13px] leading-relaxed text-gray-500">{item.desc}</p>
                          )}
                          <p className="mt-1 text-[12px] text-gray-300">{item.by}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          {/* Right rail */}
          <aside className="space-y-9">
            {/* Negócio — primary highlight */}
            <div className="overflow-hidden rounded-2xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(16,185,129,0.25)] ring-1 ring-emerald-100">
              <div className="h-1 w-full bg-gradient-to-r from-emerald-400 to-green-500" />
              <div className="p-5">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-emerald-600">
                    Negócio
                  </p>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Contrato ativo
                  </span>
                </div>
                <p className="mt-2 text-[11px] text-gray-400">Valor estimado</p>
                <p className="text-[30px] font-semibold leading-tight tracking-tight text-gray-900">
                  R$ 139,90
                </p>
                <div className="mt-3 flex items-center gap-2 text-[13px] text-gray-600">
                  <span className="rounded-md bg-gray-100 px-2 py-0.5 font-medium">Plano Familiar</span>
                  <span className="rounded-md bg-gray-100 px-2 py-0.5 font-medium">2 dependentes</span>
                </div>
              </div>
            </div>

            <div>
              <SectionLabel>Detalhes</SectionLabel>
              <div className="divide-y divide-gray-100">
                <MetaRow label="Telefone" value="(51) 99999-0000" />
                <MetaRow label="E-mail" value="tais.dequi@email.com" />
                <MetaRow label="CPF" value="008.452.460-03" mono />
                <MetaRow label="Fonte" value="Indicação" />
                <MetaRow label="Interesse" value="Plano Familiar" />
                <MetaRow
                  label="Cadastro"
                  value={
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar className="h-3 w-3 text-gray-300" /> 22/06/2026
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

            <div>
              <SectionLabel>Valores</SectionLabel>
              <div className="divide-y divide-gray-100">
                <MetaRow label="Mensal" value="R$ 89,90" />
                <MetaRow label="Adesão" value="R$ 50,00" />
                <MetaRow label="Dependentes" value="2" />
                <div className="flex items-baseline justify-between gap-4 py-2.5">
                  <span className="text-[13px] font-medium text-gray-900">Total estimado</span>
                  <span className="text-[18px] font-semibold tracking-tight text-gray-900">R$ 139,90</span>
                </div>
              </div>
            </div>

            <div>
              <SectionLabel>ERP</SectionLabel>
              <div className="divide-y divide-gray-100">
                <MetaRow label="Contrato" value="#307977" mono />
                <MetaRow label="Plano" value="BOM PASTOR FAMILIAR" />
                <MetaRow label="Titular" value="TAIS DEQUI" />
                <MetaRow label="Nascimento" value="21/06/1984" />
              </div>
              <div className="pt-3">
                <p className="mb-1.5 text-[12px] text-gray-400">Dependentes</p>
                <div className="flex flex-col gap-1.5">
                  <span className="text-[13px] text-gray-700">MARIA DEQUI</span>
                  <span className="text-[13px] text-gray-700">JOÃO DEQUI</span>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
