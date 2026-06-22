import {
  ArrowLeft,
  ChevronRight,
  Phone,
  Mail,
  MessageSquare,
  Calendar,
  User,
  MapPin,
  DollarSign,
  FileText,
  FileSignature,
  Calculator,
  Activity,
  ListTodo,
  TrendingUp,
  Bell,
  Plus,
  MoreHorizontal,
  CheckCircle2,
  Clock,
  Star,
  Building2,
  Sparkles,
  XCircle,
  ChevronDown,
  Copy,
  ExternalLink,
} from "lucide-react";

const STAGES = [
  { value: "novo", label: "Novo" },
  { value: "abordado", label: "Abordado" },
  { value: "qualificado", label: "Qualificado" },
  { value: "proposta_enviada", label: "Proposta Enviada" },
  { value: "fechado_ganho", label: "Fechado · Ganho" },
];

const CURRENT_STAGE_INDEX = 2;

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
    color: "bg-violet-100 text-violet-600",
    title: "Etapa alterada para Qualificado",
    by: "TESTE3",
    when: "Hoje, 17:42",
  },
  {
    icon: MessageSquare,
    color: "bg-blue-100 text-blue-600",
    title: "Nota adicionada",
    desc: "Cliente demonstrou interesse no Plano Familiar. Tem 2 dependentes e quer incluir telemedicina.",
    by: "TESTE3",
    when: "Hoje, 17:38",
  },
  {
    icon: Phone,
    color: "bg-green-100 text-green-600",
    title: "Contato via WhatsApp",
    desc: "Primeiro contato realizado. Cliente respondeu e agendou retorno.",
    by: "TESTE3",
    when: "Hoje, 17:30",
  },
  {
    icon: Sparkles,
    color: "bg-amber-100 text-amber-600",
    title: "Lead criado",
    desc: "Origem: Indicação",
    by: "Sistema",
    when: "Hoje, 17:28",
  },
];

function Avatar({ name, size = "lg" }: { name: string; size?: "lg" | "sm" }) {
  const dim = size === "lg" ? "h-16 w-16 text-2xl" : "h-10 w-10 text-sm";
  return (
    <div
      className={`flex ${dim} items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 font-bold text-white shadow-lg shadow-violet-500/30`}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function PipelineStepper() {
  return (
    <div className="flex items-stretch overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      {STAGES.map((s, i) => {
        const done = i < CURRENT_STAGE_INDEX;
        const current = i === CURRENT_STAGE_INDEX;
        return (
          <button
            key={s.value}
            className={`group relative flex-1 px-4 py-3 text-center text-sm font-semibold transition-colors ${
              current
                ? "bg-gradient-to-r from-violet-600 to-purple-600 text-white"
                : done
                  ? "bg-violet-50 text-violet-700"
                  : "bg-white text-gray-400 hover:bg-gray-50"
            } ${i !== 0 ? "pl-7" : ""}`}
          >
            <span className="inline-flex items-center gap-1.5">
              {done && <CheckCircle2 className="h-4 w-4" />}
              {s.label}
            </span>
            {i !== STAGES.length - 1 && (
              <span
                className={`absolute -right-3 top-0 z-10 h-full w-6 ${
                  current
                    ? "text-purple-600"
                    : done
                      ? "text-violet-50"
                      : "text-white"
                }`}
                style={{ filter: "drop-shadow(1px 0 0 rgb(229 231 235))" }}
              >
                <svg viewBox="0 0 24 48" className="h-full w-full" preserveAspectRatio="none">
                  <path d="M0 0 L24 24 L0 48 Z" fill="currentColor" />
                </svg>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function SectionCard({
  title,
  icon: Icon,
  accent = "gray",
  children,
  action,
}: {
  title: string;
  icon: any;
  accent?: "gray" | "violet" | "emerald";
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  const head =
    accent === "violet"
      ? "bg-violet-50 border-violet-100 text-violet-700"
      : accent === "emerald"
        ? "bg-emerald-50 border-emerald-100 text-emerald-700"
        : "bg-gray-50/70 border-gray-100 text-gray-700";
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className={`flex items-center justify-between border-b px-4 py-3 ${head}`}>
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4" />
          <h3 className="text-sm font-semibold">{title}</h3>
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function Field({ label, value, copy }: { label: string; value: string; copy?: boolean }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <div className="mt-0.5 flex items-center gap-1.5">
        <p className="text-sm text-gray-800">{value}</p>
        {copy && <Copy className="h-3 w-3 cursor-pointer text-gray-300 hover:text-violet-500" />}
      </div>
    </div>
  );
}

export function Redesign() {
  return (
    <div className="min-h-screen bg-gray-50 font-['Inter'] text-gray-900">
      {/* Top App Bar */}
      <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-3">
            <button className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-1.5 text-sm text-gray-400">
              <span className="font-medium text-violet-600">Upsell</span>
              <ChevronRight className="h-3.5 w-3.5" />
              <span>Leads</span>
              <ChevronRight className="h-3.5 w-3.5" />
              <span className="font-semibold text-gray-700">TAIS DEQUI</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-2 rounded-lg bg-green-500 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-600">
              <Phone className="h-4 w-4" /> WhatsApp
            </button>
            <button className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
              <Mail className="h-4 w-4" /> E-mail
            </button>
            <button className="flex items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50">
              <XCircle className="h-4 w-4" /> Marcar como Perdido
            </button>
            <button className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-6 py-5">
        {/* Pipeline */}
        <div className="mb-5 flex items-center gap-4">
          <PipelineStepper />
        </div>

        {/* 3-column body */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[300px_1fr_330px]">
          {/* LEFT: Sobre o lead */}
          <aside className="space-y-5">
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
              <div className="flex flex-col items-center gap-3 bg-gradient-to-b from-violet-50 to-white px-5 py-6 text-center">
                <Avatar name="TAIS DEQUI" />
                <div>
                  <h2 className="text-lg font-bold text-gray-900">TAIS DEQUI</h2>
                  <div className="mt-1.5 flex items-center justify-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2.5 py-1 text-xs font-semibold text-purple-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-purple-500" /> Qualificado
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
                      <Star className="h-3 w-3 fill-amber-500 text-amber-500" /> Morno
                    </span>
                  </div>
                </div>
              </div>
              <div className="space-y-3.5 border-t border-gray-100 p-4">
                <Field label="Telefone" value="(51) 99999-0000" copy />
                <Field label="E-mail" value="tais.dequi@email.com" copy />
                <Field label="CPF" value="008.452.460-03" copy />
                <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2">
                  <Avatar name="TESTE3" size="sm" />
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-gray-400">Agente</p>
                    <p className="text-sm font-semibold text-gray-700">TESTE3</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <Field label="Fonte" value="Indicação" />
                  <Field label="Interesse" value="Plano Familiar" />
                </div>
                <div className="flex items-center gap-1.5 border-t border-gray-100 pt-3 text-xs text-gray-400">
                  <Calendar className="h-3.5 w-3.5" />
                  Cadastro: <span className="font-medium text-gray-600">22/06/2026 17:28</span>
                </div>
              </div>
            </div>

            <SectionCard
              title="Dados do Lead"
              icon={User}
              action={<ChevronDown className="h-4 w-4 text-gray-400" />}
            >
              <div className="space-y-3">
                <Field label="Nome" value="TAIS DEQUI" />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Última interação" value="Hoje, 17:42" />
                  <Field label="Dependentes" value="2" />
                </div>
                <div className="flex items-start gap-1.5 rounded-lg bg-gray-50 p-2.5">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
                  <p className="text-xs text-gray-600">RUA BRASIL, 123 — CENTRO, CANOAS/RS</p>
                </div>
              </div>
            </SectionCard>
          </aside>

          {/* CENTER: Tabs + timeline */}
          <section className="space-y-5">
            {/* Tab bar */}
            <div className="flex items-center gap-1 rounded-xl border border-gray-200 bg-white p-1.5 shadow-sm">
              {TABS.map((t) => {
                const active = t.value === "activities";
                const Icon = t.icon;
                return (
                  <button
                    key={t.value}
                    className={`relative flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-all ${
                      active
                        ? "bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-md shadow-violet-500/20"
                        : "text-gray-500 hover:bg-gray-50"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {t.label}
                    {t.badge && (
                      <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                        {t.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Quick note */}
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <Avatar name="TESTE3" size="sm" />
                <div className="flex-1">
                  <textarea
                    rows={2}
                    placeholder="Escreva uma nota sobre este lead..."
                    className="w-full resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none placeholder:text-gray-400 focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-100"
                  />
                  <div className="mt-2 flex justify-end">
                    <button className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-violet-700">
                      <Plus className="h-4 w-4" /> Adicionar Nota
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Timeline */}
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-700">
                <Activity className="h-4 w-4 text-violet-600" /> Timeline de Atividades
              </h3>
              <div className="relative space-y-5 pl-2">
                <span className="absolute left-[19px] top-2 h-[calc(100%-1rem)] w-px bg-gray-200" />
                {TIMELINE.map((item, i) => {
                  const Icon = item.icon;
                  return (
                    <div key={i} className="relative flex gap-3.5">
                      <div
                        className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-4 ring-white ${item.color}`}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 pt-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-gray-800">{item.title}</p>
                          <span className="shrink-0 text-xs text-gray-400">{item.when}</span>
                        </div>
                        {item.desc && (
                          <p className="mt-1 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">
                            {item.desc}
                          </p>
                        )}
                        <p className="mt-1 text-xs text-gray-400">por {item.by}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* RIGHT: Negócio */}
          <aside className="space-y-5">
            {/* Deal value */}
            <div className="overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-500 to-green-600 p-5 text-white shadow-lg shadow-emerald-500/20">
              <p className="text-xs font-medium uppercase tracking-wide text-emerald-50">
                Valor Estimado do Negócio
              </p>
              <p className="mt-1 text-3xl font-bold">R$ 139,90</p>
              <div className="mt-3 flex items-center gap-2 text-xs text-emerald-50">
                <TrendingUp className="h-3.5 w-3.5" /> Plano Familiar · 2 dependentes
              </div>
            </div>

            {/* Valores */}
            <SectionCard title="Valores" icon={DollarSign} accent="emerald">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Valor Mensal</span>
                  <span className="text-sm font-semibold text-gray-800">R$ 89,90</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Valor da Adesão</span>
                  <span className="text-sm font-semibold text-gray-800">R$ 50,00</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Dependentes</span>
                  <span className="text-sm font-semibold text-gray-800">2</span>
                </div>
                <div className="flex items-center justify-between border-t border-gray-100 pt-3">
                  <span className="text-sm font-semibold text-emerald-700">Total Estimado</span>
                  <span className="text-lg font-bold text-emerald-700">R$ 139,90</span>
                </div>
              </div>
            </SectionCard>

            {/* Dados ERP */}
            <SectionCard
              title="Dados ERP"
              icon={Building2}
              accent="violet"
              action={
                <span className="rounded-full bg-violet-200 px-2 py-0.5 text-[11px] font-semibold text-violet-700">
                  1 contrato
                </span>
              }
            >
              <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-semibold text-violet-700">
                    Contrato #307977
                  </span>
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-700">
                    ATIVO
                  </span>
                </div>
                <div className="mt-3 space-y-2.5">
                  <Field label="Plano" value="BOM PASTOR FAMILIAR" />
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Titular" value="TAIS DEQUI" />
                    <Field label="Nascimento" value="21/06/1984" />
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                      Dependentes (2)
                    </p>
                    <ul className="mt-1 space-y-1">
                      <li className="flex items-center gap-1.5 text-sm text-gray-700">
                        <User className="h-3 w-3 text-violet-400" /> MARIA DEQUI
                      </li>
                      <li className="flex items-center gap-1.5 text-sm text-gray-700">
                        <User className="h-3 w-3 text-violet-400" /> JOÃO DEQUI
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </SectionCard>

            {/* Quick actions */}
            <div className="grid grid-cols-2 gap-2">
              <button className="flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50">
                <Calculator className="h-4 w-4 text-violet-600" /> Orçamento
              </button>
              <button className="flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50">
                <FileSignature className="h-4 w-4 text-emerald-600" /> Contrato
              </button>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
