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
    when: "17:42",
  },
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
  {
    icon: Sparkles,
    title: "Lead criado",
    desc: "Origem: Indicação",
    by: "Sistema",
    when: "17:28",
  },
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
    <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">
      {children}
    </p>
  );
}

export function Redesign() {
  return (
    <div className="min-h-screen bg-white font-['Inter'] text-gray-900 antialiased">
      {/* Top bar */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between px-8 py-3.5">
          <div className="flex items-center gap-2.5 text-[13px] text-gray-400">
            <button className="-ml-1.5 flex h-7 w-7 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <span className="transition-colors hover:text-gray-600">Upsell</span>
            <span className="text-gray-300">/</span>
            <span className="transition-colors hover:text-gray-600">Leads</span>
            <span className="text-gray-300">/</span>
            <span className="font-medium text-gray-600">TAIS DEQUI</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700">
              <Bell className="h-[18px] w-[18px]" />
            </button>
            <button className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700">
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
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-xl font-medium text-white">
                T
              </div>
              <div>
                <h1 className="text-[34px] font-semibold leading-none tracking-[-0.02em] text-gray-900">
                  TAIS DEQUI
                </h1>
                <div className="mt-3 flex items-center gap-4 text-[13px] text-gray-400">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
                    <span className="font-medium text-gray-600">Qualificado</span>
                  </span>
                  <span className="text-gray-200">·</span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                    Morno
                  </span>
                  <span className="text-gray-200">·</span>
                  <span>
                    Agente <span className="text-gray-600">TESTE3</span>
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800">
                <Phone className="h-4 w-4" /> WhatsApp
              </button>
              <button className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800">
                <Mail className="h-4 w-4" /> E-mail
              </button>
              <button className="flex items-center gap-2 rounded-lg bg-gray-900 px-3.5 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-gray-700">
                Avançar etapa <ArrowUpRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Pipeline — quiet, inline */}
          <div className="mt-8 flex items-center">
            {STAGES.map((s, i) => {
              const done = i < CURRENT;
              const current = i === CURRENT;
              return (
                <div key={s.value} className="flex flex-1 items-center last:flex-none">
                  <div className="flex items-center gap-2">
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ${
                        done
                          ? "bg-violet-100 text-violet-600"
                          : current
                            ? "bg-violet-600 text-white"
                            : "bg-gray-100 text-gray-400"
                      }`}
                    >
                      {done ? <Check className="h-3 w-3" /> : i + 1}
                    </span>
                    <span
                      className={`whitespace-nowrap text-[13px] ${
                        current
                          ? "font-semibold text-gray-900"
                          : done
                            ? "text-gray-500"
                            : "text-gray-300"
                      }`}
                    >
                      {s.label}
                    </span>
                  </div>
                  {i !== STAGES.length - 1 && (
                    <div className="mx-3 h-px flex-1 bg-gray-100">
                      <div
                        className={`h-full ${done ? "bg-violet-200" : "bg-transparent"}`}
                      />
                    </div>
                  )}
                </div>
              );
            })}
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
                    className={`relative -mb-px flex items-center gap-2 pb-3 text-[13px] font-medium transition-colors ${
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
                  className="w-full resize-none border-b border-gray-200 bg-transparent pb-2 text-[14px] leading-relaxed text-gray-800 outline-none transition-colors placeholder:text-gray-400 focus:border-gray-900"
                />
                <div className="mt-2.5 flex justify-end">
                  <button className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-violet-700">
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
                <div className="space-y-7">
                  {TIMELINE.map((item, i) => {
                    const Icon = item.icon;
                    return (
                      <div key={i} className="relative flex gap-4">
                        <div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-gray-400 ring-1 ring-gray-100">
                          <Icon className="h-[15px] w-[15px]" />
                        </div>
                        <div className="flex-1 pt-1">
                          <div className="flex items-baseline justify-between gap-3">
                            <p className="text-[14px] font-medium text-gray-800">{item.title}</p>
                            <span className="shrink-0 text-[12px] text-gray-300">{item.when}</span>
                          </div>
                          {item.desc && (
                            <p className="mt-1 text-[13px] leading-relaxed text-gray-500">
                              {item.desc}
                            </p>
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

          {/* Right rail — properties, no boxes */}
          <aside className="space-y-9">
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
                  <span className="text-[18px] font-semibold tracking-tight text-gray-900">
                    R$ 139,90
                  </span>
                </div>
              </div>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <SectionLabel>ERP</SectionLabel>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Ativo
                </span>
              </div>
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
