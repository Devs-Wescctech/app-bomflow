import { useState, useEffect, useCallback } from "react";
import {
  Search, Copy, Check, Lock, Globe, Terminal, Code2, ExternalLink,
  ChevronRight, Sun, Moon, Hash, Sparkles, BookOpen, Link2,
  CornerDownRight, Activity, Key, ShieldCheck, ListFilter, Database,
  BarChart3, Users, Radio, TrendingUp, Info, Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarFooter,
  SidebarGroup, SidebarGroupContent, SidebarMenu, SidebarMenuItem,
  SidebarMenuButton, SidebarMenuSub, SidebarMenuSubItem, SidebarMenuSubButton,
  SidebarTrigger, SidebarInset, SidebarRail, useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty,
  CommandGroup, CommandItem,
} from "@/components/ui/command";
import { useTheme } from "@/components/ui/theme-provider";

const BASE_URL = "https://app.bomflow.com.br/api/external";

/* ─────────────────────────── Data ─────────────────────────── */

const SCOPES_TABLE = [
  { scope: "vendas_pf",  access: "Leads de Vendas PF" },
  { scope: "upsell",     access: "Leads do Upsell" },
  { scope: "indicacoes", access: "Indicações (referrals)" },
  { scope: "agentes",    access: "Lista de agentes (segmentação)" },
  { scope: "canais",     access: "Canais de venda" },
];

const HTTP_STATUS = [
  { code: "200", meaning: "Sucesso" },
  { code: "401", meaning: "API key ausente, inválida, expirada ou revogada" },
  { code: "403", meaning: "API key sem permissão (escopo) para o recurso" },
  { code: "500", meaning: "Erro interno do servidor" },
];

const COMMON_PARAMS = [
  { name: "page",       type: "inteiro", description: "Página (padrão: 1)" },
  { name: "limit",      type: "inteiro", description: "Itens por página (padrão: 1000, máx.: 10000)" },
  { name: "start_date", type: "data",    description: "Filtra por data de criação a partir de (YYYY-MM-DD)" },
  { name: "end_date",   type: "data",    description: "Filtra por data de criação até (YYYY-MM-DD, inclusivo)" },
];

const ENDPOINTS = [
  {
    id: "vendas-pf",
    title: "Vendas PF",
    method: "GET",
    path: "/v1/vendas-pf",
    scope: "vendas_pf",
    icon: TrendingUp,
    description: "Retorna os leads do módulo de Vendas PF com paginação e filtros opcionais.",
    filters: [
      { name: "agent_id", type: "UUID",   description: "Filtra pelo ID do agente responsável" },
      { name: "source",   type: "texto",  description: "Canal de origem do lead", values: [
        { v: "manual",        m: "Cadastro manual no sistema" },
        { v: "porta_a_porta", m: "Abordagem presencial" },
        { v: "whatsapp",      m: "Originado via WhatsApp" },
        { v: "indicacao",     m: "Indicação de cliente" },
        { v: "portal",        m: "Portal do cliente" },
        { v: "campanha",      m: "Campanha de marketing" },
      ], note: "Valores configuráveis. Os listados são os padrões do sistema." },
      { name: "stage",    type: "texto",  description: "Etapa do funil", values: [
        { v: "novo",             m: "Lead recém-criado, ainda não abordado" },
        { v: "abordado",         m: "Primeiro contato realizado" },
        { v: "qualificado",      m: "Lead qualificado pelo vendedor" },
        { v: "proposta_enviada", m: "Proposta comercial enviada ao cliente" },
        { v: "fechado_ganho",    m: "Venda concluída com sucesso" },
        { v: "fechado_perdido",  m: "Lead perdido / não convertido" },
      ]},
      { name: "status",   type: "texto",  description: "Situação do lead", values: [
        { v: "ativo",   m: "Lead ativo no pipeline" },
        { v: "inativo", m: "Lead marcado como inativo" },
      ]},
      { name: "city",     type: "texto",  description: "Cidade do cliente (texto livre)" },
      { name: "state",    type: "texto",  description: "Estado do cliente (ex.: SP, MG)" },
    ],
    fields: [
      { name: "id",                                                    d: "Identificador do lead" },
      { name: "name, cpf, email, phone, whatsapp",                     d: "Dados do cliente" },
      { name: "address, city, state",                                   d: "Endereço" },
      { name: "value",                                                   d: "Valor da venda" },
      { name: "source",                                                  d: "Canal de origem" },
      { name: "stage",                                                   d: "Etapa do funil" },
      { name: "status",                                                  d: "Situação do lead" },
      { name: "agentId",                                                 d: "UUID do agente responsável" },
      { name: "createdAt, convertedAt, lostAt, lastContactAt",          d: "Datas relevantes" },
    ],
    response: { data: [{ id: "uuid", name: "João Silva", stage: "qualificado", status: "ativo", value: 299.90, agentId: "uuid-agente", createdAt: "2026-01-15T10:30:00.000Z" }], pagination: { page: 1, limit: 1000, total: 1, totalPages: 1 } },
    curl: `curl -H "x-api-key: bfk_SUA_CHAVE" \\\n  "${BASE_URL}/v1/vendas-pf?stage=fechado_ganho&start_date=2026-01-01&end_date=2026-06-30"`,
  },
  {
    id: "upsell",
    title: "Upsell",
    method: "GET",
    path: "/v1/upsell",
    scope: "upsell",
    icon: BarChart3,
    description: "Retorna os leads do módulo Upsell com paginação e filtros opcionais.",
    filters: [
      { name: "agent_id",          type: "UUID",  description: "ID do agente criador do lead" },
      { name: "assigned_agent_id", type: "UUID",  description: "ID do agente atribuído ao lead" },
      { name: "source",            type: "texto", description: "Canal de origem (mesmos valores de Vendas PF)" },
      { name: "stage",             type: "texto", description: "Etapa do funil (idêntico ao Vendas PF)", values: [
        { v: "novo",             m: "Lead recém-criado" },
        { v: "abordado",         m: "Primeiro contato realizado" },
        { v: "qualificado",      m: "Lead qualificado" },
        { v: "proposta_enviada", m: "Proposta enviada" },
        { v: "fechado_ganho",    m: "Venda concluída" },
        { v: "fechado_perdido",  m: "Lead perdido" },
      ]},
      { name: "status",            type: "texto", description: "Situação do lead", values: [
        { v: "ativo",   m: "Lead ativo no pipeline" },
        { v: "inativo", m: "Lead marcado como inativo" },
      ]},
      { name: "city",              type: "texto", description: "Cidade do cliente (texto livre)" },
      { name: "state",             type: "texto", description: "Estado do cliente (ex.: SP, MG)" },
    ],
    fields: [
      { name: "id, name, cpf, email, phone, whatsapp", d: "Dados do cliente" },
      { name: "address, city, state",                   d: "Endereço" },
      { name: "value",                                   d: "Valor do lead" },
      { name: "source, stage, status",                   d: "Funil e situação" },
      { name: "agentId",                                 d: "Agente criador" },
      { name: "assignedAgentId",                         d: "Agente atribuído" },
      { name: "territoryId",                             d: "Território do lead" },
      { name: "createdAt, convertedAt, lostAt",          d: "Datas" },
    ],
    response: { data: [{ id: "uuid", name: "Empresa XYZ", stage: "proposta_enviada", status: "ativo", value: 1200.00, agentId: "uuid-agente", assignedAgentId: "uuid-agente2", createdAt: "2026-02-10T08:00:00.000Z" }], pagination: { page: 1, limit: 1000, total: 1, totalPages: 1 } },
    curl: `curl -H "x-api-key: bfk_SUA_CHAVE" \\\n  "${BASE_URL}/v1/upsell?agent_id=UUID_DO_AGENTE"`,
  },
  {
    id: "indicacoes",
    title: "Indicações",
    method: "GET",
    path: "/v1/indicacoes",
    scope: "indicacoes",
    icon: Radio,
    description: "Retorna as indicações (referrals) com paginação e filtros opcionais.",
    filters: [
      { name: "agent_id",          type: "UUID",  description: "ID do agente responsável" },
      { name: "stage",             type: "texto", description: "Etapa do funil", values: [
        { v: "novo",              m: "Indicação recém-criada" },
        { v: "contato_iniciado",  m: "Contato realizado com o indicado" },
        { v: "proposta_enviada",  m: "Proposta enviada ao indicado" },
        { v: "fechado_ganho",     m: "Indicação convertida em cliente" },
        { v: "fechado_perdido",   m: "Indicação perdida / não convertida" },
      ]},
      { name: "status",            type: "texto", description: "Situação da indicação", values: [
        { v: "ativo",      m: "Indicação ativa no pipeline" },
        { v: "inativo",    m: "Indicação marcada como inativa" },
        { v: "convertido", m: "Indicação concluída com conversão" },
      ]},
      { name: "commission_status", type: "texto", description: "Situação da comissão", values: [
        { v: "pending",   m: "Aguardando aprovação" },
        { v: "aprovada",  m: "Comissão aprovada para pagamento" },
        { v: "paga",      m: "Comissão efetivamente paga" },
        { v: "cancelada", m: "Comissão cancelada" },
      ]},
    ],
    fields: [
      { name: "id",                                                             d: "Identificador da indicação" },
      { name: "referredName, referredCpf, referredEmail, referredPhone",        d: "Cliente indicado" },
      { name: "referrerName, referrerCpf, referrerPhone",                       d: "Quem indicou" },
      { name: "value, monthlyValue, adhesionValue",                             d: "Valores" },
      { name: "commission, commissionValue, commissionStatus, commissionPaidAt", d: "Comissão" },
      { name: "stage, status",                                                   d: "Situação" },
      { name: "agentId",                                                         d: "UUID do agente responsável" },
      { name: "createdAt, convertedAt, contractSignedAt",                        d: "Datas" },
    ],
    response: { data: [{ id: "uuid", referredName: "Maria Souza", stage: "fechado_ganho", commissionStatus: "aprovada", commissionValue: 150.00, agentId: "uuid-agente", createdAt: "2026-03-01T09:00:00.000Z" }], pagination: { page: 1, limit: 1000, total: 1, totalPages: 1 } },
    curl: `curl -H "x-api-key: bfk_SUA_CHAVE" \\\n  "${BASE_URL}/v1/indicacoes?commission_status=aprovada"`,
  },
  {
    id: "agentes",
    title: "Agentes",
    method: "GET",
    path: "/v1/agentes",
    scope: "agentes",
    icon: Users,
    description: "Lista os agentes cadastrados. Use o id retornado para cruzar com o campo agentId dos leads.",
    filters: [
      { name: "role",       type: "texto",   description: "Papel do agente no sistema", values: [
        { v: "admin",      m: "Administrador — acesso total" },
        { v: "supervisor", m: "Supervisor — acesso de gestão à equipe" },
        { v: "agent",      m: "Agente operacional" },
      ]},
      { name: "agent_type", type: "texto",   description: "Tipo de agente (configurável pelo admin — consulte sem filtro para descobrir os valores do seu ambiente)" },
      { name: "team_id",    type: "UUID",    description: "ID da equipe à qual o agente pertence" },
      { name: "active",     type: "boolean", description: "true = apenas ativos · false = apenas inativos" },
      { name: "work_unit",  type: "texto",   description: "Unidade de trabalho (texto livre)" },
    ],
    fields: [
      { name: "id",         d: "Identificador do agente" },
      { name: "name, email", d: "Nome e e-mail" },
      { name: "role",        d: "Papel: admin · supervisor · agent" },
      { name: "agentType",   d: "Tipo configurável pelo administrador" },
      { name: "teamId",      d: "ID da equipe" },
      { name: "active",      d: "Status: true (ativo) · false (inativo)" },
      { name: "workUnit",    d: "Unidade de trabalho" },
      { name: "createdAt, updatedAt", d: "Datas de criação e atualização" },
    ],
    response: { data: [{ id: "uuid-agente", name: "Carlos Lima", email: "carlos@empresa.com", role: "agent", agentType: "sales", active: true, createdAt: "2025-01-10T00:00:00.000Z" }], pagination: { page: 1, limit: 1000, total: 1, totalPages: 1 } },
    curl: `curl -H "x-api-key: bfk_SUA_CHAVE" \\\n  "${BASE_URL}/v1/agentes?active=true&role=agent"`,
  },
  {
    id: "canais",
    title: "Canais de Venda",
    method: "GET",
    path: "/v1/canais",
    scope: "canais",
    icon: Database,
    description: "Retorna os canais de Indicações e Upsell cadastrados no sistema. Sem filtros adicionais.",
    filters: [],
    fields: [
      { name: "indicacoes[].id",           d: "ID do canal de Indicações" },
      { name: "indicacoes[].channelToken", d: "Token de identificação do canal" },
      { name: "indicacoes[].channelLabel", d: "Nome do canal" },
      { name: "upsell[].id",              d: "ID do canal de Upsell" },
      { name: "upsell[].channelToken",    d: "Token de identificação" },
      { name: "upsell[].channelLabel",    d: "Nome do canal" },
    ],
    response: { indicacoes: [{ id: "uuid", channelToken: "abc123", channelLabel: "Indicações Padrão", createdAt: "2025-06-01T00:00:00.000Z" }], upsell: [{ id: "uuid2", channelToken: "xyz789", channelLabel: "Canal Upsell A", createdAt: "2025-06-01T00:00:00.000Z" }] },
    curl: `curl -H "x-api-key: bfk_SUA_CHAVE" \\\n  "${BASE_URL}/v1/canais"`,
  },
  {
    id: "metricas",
    title: "Métricas",
    method: "GET",
    path: "/v1/metrics",
    scope: "vendas_pf · upsell · indicacoes",
    icon: BarChart3,
    description: "Totais agregados de leads e valores por módulo, com quebra por agente e canal. Retorna apenas os módulos liberados pela API key.",
    filters: [
      { name: "start_date", type: "data", description: "Início do período (YYYY-MM-DD)" },
      { name: "end_date",   type: "data", description: "Fim do período (YYYY-MM-DD, inclusivo)" },
    ],
    fields: [
      { name: "period.startDate / endDate",             d: "Período consultado" },
      { name: "modules.vendas_pf.totalLeads",           d: "Total de leads Vendas PF" },
      { name: "modules.vendas_pf.totalValue",           d: "Soma dos valores Vendas PF" },
      { name: "modules.vendas_pf.byAgent[]",            d: "Quebra por agente (leads + value)" },
      { name: "modules.vendas_pf.bySource[]",           d: "Quebra por canal de origem" },
      { name: "modules.upsell.*",                       d: "Idêntico ao vendas_pf" },
      { name: "modules.indicacoes.totalLeads / byAgent", d: "Indicações não possuem bySource" },
    ],
    response: { period: { startDate: "2026-01-01", endDate: "2026-06-30" }, modules: { vendas_pf: { totalLeads: 8, totalValue: 119.93, byAgent: [{ agentId: "uuid", leads: 2, value: 59.94 }], bySource: [{ source: "manual", leads: 8, value: 119.93 }] }, upsell: { totalLeads: 16, totalValue: 0, byAgent: [], bySource: [] }, indicacoes: { totalLeads: 3, totalValue: 0, byAgent: [] } } },
    curl: `curl -H "x-api-key: bfk_SUA_CHAVE" \\\n  "${BASE_URL}/v1/metrics?start_date=2026-01-01&end_date=2026-06-30"`,
  },
];

const SECTIONS = [
  { id: "visao-geral",  title: "Visão Geral",        icon: Sparkles },
  { id: "autenticacao", title: "Autenticação",        icon: Key },
  { id: "parametros",   title: "Parâmetros Comuns",   icon: ListFilter },
  ...ENDPOINTS.map((e) => ({ id: e.id, title: e.title, icon: e.icon, isEndpoint: true })),
  { id: "paginacao",    title: "Paginação Completa",  icon: Code2 },
  { id: "praticas",     title: "Boas Práticas",       icon: Star },
];

const PAGINATION_EXAMPLE = `async function extrairTudo(modulo, apiKey) {
  const baseUrl = "${BASE_URL}/v1";
  let page = 1;
  let todos = [];

  while (true) {
    const res = await fetch(\`\${baseUrl}/\${modulo}?page=\${page}&limit=10000\`, {
      headers: { "x-api-key": apiKey },
    });
    const json = await res.json();
    todos = todos.concat(json.data);
    if (page >= json.pagination.totalPages) break;
    page++;
  }
  return todos;
}

// Uso:
// const leads     = await extrairTudo("vendas-pf",  "bfk_...");
// const upsell    = await extrairTudo("upsell",     "bfk_...");
// const indicacoes = await extrairTudo("indicacoes", "bfk_...");`;

/* ─────────────────────────── Root ─────────────────────────── */

export default function ApiDocumentation() {
  return (
    <div className="fixed inset-0 z-40 bg-background text-foreground antialiased overflow-hidden">
      <SidebarProvider defaultOpen style={{ "--sidebar-width": "20rem", "--sidebar-width-icon": "3.25rem" }}>
        <DocsBody />
      </SidebarProvider>
    </div>
  );
}

/* ─────────────────────────── Body ─────────────────────────── */

function DocsBody() {
  const [activeId, setActiveId] = useState(SECTIONS[0].id);
  const [cmdOpen, setCmdOpen] = useState(false);
  const { isMobile, setOpenMobile } = useSidebar();
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent || "");

  const handleNavigate = useCallback((id) => {
    if (isMobile) setOpenMobile(false);
    setTimeout(() => {
      const el = document.getElementById(`sec-${id}`);
      const scroller = document.getElementById("docs-scroller");
      if (el && scroller) {
        scroller.scrollTo({ top: el.offsetTop - 12, behavior: "smooth" });
      }
    }, 60);
  }, [isMobile, setOpenMobile]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "k" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); setCmdOpen((o) => !o); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const scroller = document.getElementById("docs-scroller");
    if (!scroller) return;
    let raf = 0;
    const compute = () => {
      const scrollerTop = scroller.getBoundingClientRect().top;
      let best = SECTIONS[0].id;
      let bestDelta = -Infinity;
      SECTIONS.forEach((s) => {
        const el = document.getElementById(`sec-${s.id}`);
        if (!el) return;
        const delta = el.getBoundingClientRect().top - scrollerTop - 100;
        if (delta <= 0 && delta > bestDelta) { bestDelta = delta; best = s.id; }
      });
      setActiveId(best);
    };
    const onScroll = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(compute); };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    compute();
    return () => { cancelAnimationFrame(raf); scroller.removeEventListener("scroll", onScroll); };
  }, []);

  return (
    <>
      <DocsSidebar activeId={activeId} onNavigate={handleNavigate} />
      <SidebarInset className="min-h-0 h-svh overflow-hidden flex flex-col bg-background">
        <DocsTopBar activeId={activeId} onOpenCommand={() => setCmdOpen(true)} isMac={isMac} />
        <main id="docs-scroller" className="flex-1 overflow-y-auto scroll-smooth">
          <div className="max-w-[860px] mx-auto px-6 sm:px-10 py-10 space-y-16">
            <HeroSection />
            <AuthSection />
            <ParamsSection />
            {ENDPOINTS.map((ep) => <EndpointSection key={ep.id} ep={ep} />)}
            <PaginationSection />
            <PracticesSection />
            <footer className="pt-8 pb-16 border-t border-border flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <img src="/logo-bomflow-icon.png" alt="" className="h-5 w-5 opacity-70" />
                <span>Bomflow External API · v1 · {ENDPOINTS.length} endpoints</span>
              </div>
              <span className="font-mono">{BASE_URL}</span>
            </footer>
          </div>
        </main>
      </SidebarInset>
      <DocsCommandPalette open={cmdOpen} onOpenChange={setCmdOpen} onNavigate={handleNavigate} />
    </>
  );
}

/* ─────────────────────────── Sidebar ─────────────────────────── */

function DocsSidebar({ activeId, onNavigate }) {
  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border h-14 px-2 py-0 flex-row items-center gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1 px-1">
          <img src="/logo-bomflow-icon.png" alt="Bomflow" className="h-8 w-8 object-contain flex-shrink-0" />
          <div className="leading-tight min-w-0 group-data-[collapsible=icon]:hidden">
            <div className="text-sm font-semibold text-sidebar-foreground truncate">API Externa</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground -mt-0.5">Bom Flow · v1</div>
          </div>
        </div>
        <SidebarTrigger className="group-data-[collapsible=icon]:hidden -mr-1" />
      </SidebarHeader>

      <SidebarContent className="py-2">
        <SidebarGroup className="py-1">
          <SidebarGroupContent>
            <SidebarMenu>
              {SECTIONS.map((s) => {
                const Icon = s.icon || Hash;
                const isActive = activeId === s.id;
                return (
                  <SidebarMenuItem key={s.id}>
                    <SidebarMenuButton
                      tooltip={s.title}
                      isActive={isActive}
                      onClick={() => onNavigate(s.id)}
                      className={s.isEndpoint ? "pl-5" : "font-medium"}
                    >
                      <Icon />
                      <span className="truncate">{s.title}</span>
                      {s.isEndpoint && (
                        <span className="ml-auto text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 group-data-[collapsible=icon]:hidden">
                          GET
                        </span>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <div className="px-2 py-1.5 text-[10px] font-mono text-muted-foreground truncate group-data-[collapsible=icon]:hidden">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            app.bomflow.com.br
          </span>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

/* ─────────────────────────── Topbar ─────────────────────────── */

function DocsTopBar({ activeId, onOpenCommand, isMac }) {
  const { theme, setTheme } = useTheme();
  const current = SECTIONS.find((s) => s.id === activeId);
  return (
    <header className="flex-shrink-0 h-14 border-b border-border bg-background/80 backdrop-blur-md flex items-center gap-3 px-3 sm:px-5">
      <SidebarTrigger className="-ml-1" />
      <nav className="flex items-center gap-1.5 text-sm min-w-0">
        <span className="text-muted-foreground hidden sm:inline">API Externa</span>
        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/60 hidden sm:inline" />
        <span className="font-medium text-foreground truncate">{current?.title || "Visão Geral"}</span>
      </nav>
      <div className="ml-auto flex items-center gap-1.5">
        <button
          type="button"
          onClick={onOpenCommand}
          className="hidden sm:inline-flex items-center gap-2 h-9 pl-3 pr-1.5 rounded-md border border-border bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors text-xs w-[240px] max-w-[38vw]"
        >
          <Search className="w-3.5 h-3.5" />
          <span className="flex-1 text-left">Buscar na documentação...</span>
          <kbd className="ml-auto inline-flex items-center h-6 px-1.5 rounded border border-border bg-background font-mono text-[10px] text-muted-foreground">
            {isMac ? "⌘K" : "Ctrl+K"}
          </kbd>
        </button>
        <Button variant="ghost" size="icon" className="sm:hidden h-9 w-9" onClick={onOpenCommand}><Search className="w-4 h-4" /></Button>
        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setTheme(theme === "light" ? "dark" : "light")} title="Alternar tema">
          {theme === "light" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
        </Button>
        <a href="/AppsHub" className="hidden md:inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2.5 py-1.5 rounded-md hover:bg-muted transition-colors">
          <ExternalLink className="w-3.5 h-3.5" />Sistema
        </a>
      </div>
    </header>
  );
}

/* ─────────────────────────── Cmd+K ─────────────────────────── */

function DocsCommandPalette({ open, onOpenChange, onNavigate }) {
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Buscar seções e endpoints..." />
      <CommandList>
        <CommandEmpty>Nenhum resultado.</CommandEmpty>
        <CommandGroup heading="Seções">
          {SECTIONS.filter((s) => !s.isEndpoint).map((s) => {
            const Icon = s.icon || Hash;
            return (
              <CommandItem key={s.id} value={s.title} onSelect={() => { onNavigate(s.id); onOpenChange(false); }}>
                <Icon className="w-4 h-4 text-muted-foreground" /><span>{s.title}</span>
              </CommandItem>
            );
          })}
        </CommandGroup>
        <CommandGroup heading="Endpoints">
          {ENDPOINTS.map((ep) => (
            <CommandItem key={ep.id} value={`${ep.method} ${ep.path} ${ep.title}`} onSelect={() => { onNavigate(ep.id); onOpenChange(false); }}>
              <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">GET</span>
              <span>{ep.title}</span>
              <code className="ml-auto text-[11px] font-mono text-muted-foreground">{ep.path}</code>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

/* ─────────────────────────── Sections ─────────────────────────── */

function HeroSection() {
  return (
    <section id="sec-visao-geral" className="scroll-mt-6">
      <div className="relative mb-10">
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-primary/5 via-transparent to-emerald-500/5 blur-2xl rounded-3xl" />
        <div className="flex flex-wrap items-center gap-2 mb-5">
          <Badge variant="outline" className="text-[11px] uppercase tracking-wider border-primary/30 text-primary bg-primary/5 gap-1">
            <Sparkles className="w-3 h-3" />API Externa · v1
          </Badge>
          <Badge variant="outline" className="text-[11px] gap-1 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />Somente leitura
          </Badge>
          <Badge variant="outline" className="text-[11px] gap-1 border-sky-500/30 text-sky-600 dark:text-sky-400 bg-sky-500/5">
            REST / JSON / HTTPS
          </Badge>
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground">
          API Externa — Bom Flow
        </h1>
        <p className="mt-4 text-base sm:text-[17px] text-muted-foreground leading-relaxed max-w-3xl">
          Integre sistemas externos, dashboards de BI e planilhas automatizadas com os dados do Bom Flow
          usando uma <strong className="text-foreground font-semibold">API Key dedicada</strong> — sem login de usuário, sem gravações.
        </p>

        <div className="mt-8 grid grid-cols-2 lg:grid-cols-4 gap-3">
          <InfoTile label="Base URL" value="/api/external" mono icon={Link2} accent="primary" />
          <InfoTile label="Autenticação" value="x-api-key" mono icon={Key} accent="amber" />
          <InfoTile label="Endpoints" value={`${ENDPOINTS.length} disponíveis`} icon={Database} accent="emerald" />
          <InfoTile label="Formato" value="JSON" mono icon={Code2} accent="violet" />
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
        <div className="px-5 py-3 border-b border-border bg-muted/40 flex items-center gap-2">
          <Info className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">O que é uma API Key?</span>
        </div>
        <div className="p-5 space-y-2 text-[14px] text-muted-foreground leading-relaxed">
          <p>Cada API Key criada no sistema:</p>
          <ul className="mt-2 space-y-1.5 ml-4">
            {["é somente leitura", "possui escopos (define quais módulos pode acessar)", "pode ter data de expiração", "pode ser revogada a qualquer momento", "registra data do último uso"].map((item) => (
              <li key={item} className="flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function AuthSection() {
  return (
    <section id="sec-autenticacao" className="scroll-mt-6">
      <SectionTitle icon={Key} title="Autenticação" />
      <p className="text-[14px] text-muted-foreground leading-relaxed mb-6">
        Todas as requisições devem enviar o header <code className="font-mono text-foreground/80 bg-muted px-1.5 py-0.5 rounded text-[12px]">x-api-key</code> com a chave gerada em <strong className="text-foreground">APPs → API Keys</strong>. A chave completa é exibida <strong className="text-foreground">apenas uma vez</strong> — guarde com segurança.
      </p>

      <CodeBlock code={`curl -H "x-api-key: bfk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \\\n  "${BASE_URL}/v1/agentes"`} language="bash" />

      <div className="mt-6 grid md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border bg-muted/30 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <ShieldCheck className="w-3.5 h-3.5" />Códigos HTTP
          </div>
          <table className="w-full text-[13px]">
            <tbody className="divide-y divide-border">
              {HTTP_STATUS.map((r) => (
                <tr key={r.code} className="hover:bg-muted/30">
                  <td className="px-4 py-2.5 w-16">
                    <code className={`font-mono font-bold text-[12px] ${r.code === "200" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>{r.code}</code>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{r.meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border bg-muted/30 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Key className="w-3.5 h-3.5" />Escopos disponíveis
          </div>
          <table className="w-full text-[13px]">
            <tbody className="divide-y divide-border">
              {SCOPES_TABLE.map((r) => (
                <tr key={r.scope} className="hover:bg-muted/30">
                  <td className="px-4 py-2.5 w-36">
                    <code className="font-mono text-[11.5px] text-primary font-medium">{r.scope}</code>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{r.access}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function ParamsSection() {
  return (
    <section id="sec-parametros" className="scroll-mt-6">
      <SectionTitle icon={ListFilter} title="Parâmetros Comuns" />
      <p className="text-[14px] text-muted-foreground leading-relaxed mb-5">
        Todos os endpoints de listagem aceitam os parâmetros abaixo via query string. Filtros adicionais específicos de cada endpoint estão documentados em suas seções.
      </p>
      <FilterTable rows={COMMON_PARAMS} />
      <div className="mt-5 rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border bg-muted/30 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <Code2 className="w-3.5 h-3.5" />Formato padrão de resposta (listagem)
        </div>
        <CodeBlock code={`{\n  "data": [ { "...": "..." } ],\n  "pagination": {\n    "page": 1,\n    "limit": 1000,\n    "total": 8,\n    "totalPages": 1\n  }\n}`} language="json" noFrame />
      </div>
    </section>
  );
}

function EndpointSection({ ep }) {
  const Icon = ep.icon || Globe;
  return (
    <section id={`sec-${ep.id}`} className="scroll-mt-6">
      <article className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow">
        <header className="px-6 py-5 border-b border-border bg-gradient-to-br from-muted/40 via-muted/20 to-transparent">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-[11px] font-mono font-bold px-2.5 py-1 rounded-md ring-1 ring-inset ring-current/10 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
              GET
            </span>
            <code className="text-[15px] font-mono text-foreground font-semibold">{ep.path}</code>
            <div className="ml-auto flex items-center gap-2">
              <Badge variant="outline" className="gap-1 text-[10px] border-amber-200 text-amber-700 dark:border-amber-800/60 dark:text-amber-300 bg-amber-50/50 dark:bg-amber-950/20">
                <Key className="w-3 h-3" />x-api-key
              </Badge>
              <Badge variant="outline" className="gap-1 text-[10px] font-mono border-primary/20 text-primary bg-primary/5">
                {ep.scope}
              </Badge>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Icon className="w-4 h-4 text-primary" />
            </div>
            <h2 className="text-xl font-bold text-foreground">{ep.title}</h2>
          </div>
          <p className="mt-2 text-[14px] text-muted-foreground leading-relaxed max-w-3xl">{ep.description}</p>

          <UrlCopyBar url={`${BASE_URL}${ep.path}`} />
        </header>

        <div className="p-6 space-y-6">
          {ep.filters.length > 0 && (
            <div>
              <SectionLabel icon={ListFilter} label="Filtros adicionais" />
              <FilterTable rows={ep.filters} />
            </div>
          )}

          <div>
            <SectionLabel icon={Database} label="Campos retornados" />
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-[13px]">
                <tbody className="divide-y divide-border">
                  {ep.fields.map((f, i) => (
                    <tr key={i} className="hover:bg-muted/30">
                      <td className="px-3 py-2.5 w-2/5 align-top">
                        <code className="font-mono text-[12px] text-primary font-medium break-all">{f.name}</code>
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground text-[12.5px]">{f.d}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 lg:divide-x divide-border border-t border-border">
          <div className="p-6 space-y-4">
            <SectionLabel icon={Terminal} label="Exemplo cURL" />
            <CodeBlock code={ep.curl} language="bash" />
          </div>
          <div className="p-6 space-y-4 bg-muted/20">
            <div className="flex items-center justify-between">
              <SectionLabel icon={Code2} label="Resposta" />
              <div className="flex items-center gap-1.5">
                <Badge variant="outline" className="text-[10px] gap-1 font-mono border-emerald-300/60 text-emerald-700 dark:border-emerald-800/60 dark:text-emerald-300 bg-emerald-50/60 dark:bg-emerald-950/30">
                  <Check className="w-3 h-3" />200 OK
                </Badge>
                <Badge variant="outline" className="text-[10px] font-mono">JSON</Badge>
              </div>
            </div>
            <CodeBlock code={JSON.stringify(ep.response, null, 2)} language="json" />
          </div>
        </div>
      </article>
    </section>
  );
}

function PaginationSection() {
  return (
    <section id="sec-paginacao" className="scroll-mt-6">
      <SectionTitle icon={Code2} title="Paginação Completa" />
      <p className="text-[14px] text-muted-foreground leading-relaxed mb-5">
        Para extrair volumes grandes, use <code className="font-mono text-foreground/80 bg-muted px-1.5 py-0.5 rounded text-[12px]">limit=10000</code> e itere via <code className="font-mono text-foreground/80 bg-muted px-1.5 py-0.5 rounded text-[12px]">page</code> até <code className="font-mono text-foreground/80 bg-muted px-1.5 py-0.5 rounded text-[12px]">totalPages</code>.
      </p>
      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
        <div className="px-5 py-3 border-b border-border bg-muted/30 flex items-center gap-2">
          <Code2 className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">Extração completa com paginação automática</span>
        </div>
        <CodeBlock code={PAGINATION_EXAMPLE} language="javascript" noFrame />
      </div>
    </section>
  );
}

function PracticesSection() {
  const items = [
    { icon: Lock,         text: "Nunca exponha a API Key em código de frontend público ou repositórios." },
    { icon: Key,          text: "Crie uma chave por sistema/parceiro — facilita rastrear o uso e revogar individualmente." },
    { icon: ShieldCheck,  text: "Conceda apenas os escopos necessários a cada integração." },
    { icon: Activity,     text: "Defina expiração para chaves temporárias." },
    { icon: Database,     text: "Para grandes volumes, use limit=10000 e pagine via page." },
    { icon: ListFilter,   text: "Use start_date/end_date para extrações incrementais (apenas o período desejado)." },
  ];
  return (
    <section id="sec-praticas" className="scroll-mt-6">
      <SectionTitle icon={Star} title="Boas Práticas e Segurança" />
      <div className="grid sm:grid-cols-2 gap-3">
        {items.map((item, i) => {
          const Icon = item.icon;
          return (
            <div key={i} className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 hover:bg-muted/30 transition-colors">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Icon className="w-4 h-4 text-primary" />
              </div>
              <p className="text-[13.5px] text-muted-foreground leading-relaxed">{item.text}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ─────────────────────────── Shared UI ─────────────────────────── */

function SectionTitle({ icon: Icon, title }) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <div className="relative flex-shrink-0">
        <div className="absolute inset-0 bg-primary/20 blur-md rounded-xl" />
        <div className="relative w-10 h-10 rounded-xl bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center">
          <Icon className="w-5 h-5 text-primary" />
        </div>
      </div>
      <h2 className="text-2xl font-bold text-foreground">{title}</h2>
    </div>
  );
}

function SectionLabel({ icon: Icon, label }) {
  return (
    <div className="flex items-center gap-1.5 mb-2.5">
      {Icon && <Icon className="w-3.5 h-3.5 text-muted-foreground" />}
      <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground">{label}</span>
    </div>
  );
}

function UrlCopyBar({ url }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-background/80 px-3 py-2">
      <Link2 className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
      <code className="flex-1 text-[12px] font-mono text-muted-foreground truncate">{url}</code>
      <button
        type="button"
        onClick={async () => { try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {} }}
        className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      >
        {copied ? <><Check className="w-3 h-3 text-emerald-500" />Copiado</> : <><Copy className="w-3 h-3" />Copiar</>}
      </button>
    </div>
  );
}

function FilterTable({ rows }) {
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <table className="w-full text-[13px]">
        <tbody className="divide-y divide-border">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-muted/30 transition-colors align-top">
              <td className="px-3 py-3 w-[200px]">
                <code className="font-mono font-semibold text-[12.5px] text-primary">{row.name}</code>
                <div className="mt-1">
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono bg-muted/60 text-muted-foreground border border-border/60">{row.type}</span>
                </div>
              </td>
              <td className="px-3 py-3">
                <p className="text-muted-foreground text-[12.5px] leading-relaxed">{row.description}</p>
                {row.values && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {row.values.map((val) => (
                      <span key={val.v} title={val.m} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-muted border border-border text-[11px] font-mono text-foreground/80 cursor-default">
                        <span className="font-semibold text-primary">{val.v}</span>
                        <span className="text-muted-foreground">— {val.m}</span>
                      </span>
                    ))}
                  </div>
                )}
                {row.note && (
                  <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400 flex items-start gap-1">
                    <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />{row.note}
                  </p>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CodeBlock({ code, language, noFrame }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={`relative bg-slate-950 text-slate-100 overflow-hidden ${noFrame ? "" : "rounded-lg ring-1 ring-slate-800"}`}>
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800/80 bg-slate-900/40">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-rose-500/70" />
            <span className="w-2 h-2 rounded-full bg-amber-500/70" />
            <span className="w-2 h-2 rounded-full bg-emerald-500/70" />
          </div>
          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 ml-1">{language}</span>
        </div>
        <button
          onClick={async () => { try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch {} }}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium text-slate-300 bg-slate-800/80 hover:bg-slate-700 transition-colors"
          type="button"
        >
          {copied ? <><Check className="w-3 h-3 text-emerald-400" />Copiado</> : <><Copy className="w-3 h-3" />Copiar</>}
        </button>
      </div>
      <pre className="px-4 py-3.5 text-[12.5px] font-mono leading-relaxed overflow-x-auto whitespace-pre"><code>{code}</code></pre>
    </div>
  );
}

const ACCENT_STYLES = {
  primary: { border: "border-primary/20",       bg: "bg-primary/5",       icon: "text-primary",                             iconBg: "bg-primary/10" },
  emerald: { border: "border-emerald-500/20",   bg: "bg-emerald-500/5",   icon: "text-emerald-600 dark:text-emerald-400",   iconBg: "bg-emerald-500/10" },
  amber:   { border: "border-amber-500/20",     bg: "bg-amber-500/5",     icon: "text-amber-600 dark:text-amber-400",       iconBg: "bg-amber-500/10" },
  violet:  { border: "border-violet-500/20",    bg: "bg-violet-500/5",    icon: "text-violet-600 dark:text-violet-400",     iconBg: "bg-violet-500/10" },
};

function InfoTile({ label, value, icon: Icon, mono, accent }) {
  const s = ACCENT_STYLES[accent] || { border: "border-border", bg: "bg-muted/30", icon: "text-muted-foreground", iconBg: "bg-muted" };
  return (
    <div className={`rounded-xl border ${s.border} ${s.bg} px-4 py-3.5 hover:shadow-sm transition-all`}>
      <div className="flex items-center gap-2">
        {Icon && <div className={`w-7 h-7 rounded-lg ${s.iconBg} flex items-center justify-center flex-shrink-0`}><Icon className={`w-3.5 h-3.5 ${s.icon}`} /></div>}
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
          <div className={`mt-0.5 text-[13px] text-foreground font-medium truncate ${mono ? "font-mono" : ""}`} title={value}>{value}</div>
        </div>
      </div>
    </div>
  );
}
