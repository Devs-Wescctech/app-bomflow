import { useState, useMemo, useEffect, useCallback } from "react";
import {
  Search,
  Copy,
  Check,
  Lock,
  Globe,
  Terminal,
  Code2,
  ExternalLink,
  ChevronRight,
  Sun,
  Moon,
  Hash,
  Zap,
  Layers,
  Sparkles,
  BookOpen,
  Link2,
  CornerDownRight,
  ShieldAlert,
  CircleCheck,
  CircleSlash,
  Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarTrigger,
  SidebarInset,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { useTheme } from "@/components/ui/theme-provider";
import {
  API_META,
  API_SECTIONS,
  HTTP_METHOD_COLORS,
  buildCurlExample,
  buildJsExample,
} from "@/data/apiDocsSpec";

const SCROLL_OFFSET = 96;

function detectIsMac() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || navigator.platform || "";
  return /Mac|iPod|iPhone|iPad/.test(ua);
}

export default function ApiDocumentation() {
  return (
    <div className="fixed inset-0 z-40 bg-background text-foreground antialiased overflow-hidden">
      <SidebarProvider
        defaultOpen
        style={{
          "--sidebar-width": "20rem",
          "--sidebar-width-icon": "3.25rem",
        }}
      >
        <DocsBody />
      </SidebarProvider>
    </div>
  );
}

function DocsBody() {
  const [activeSection, setActiveSection] = useState(API_SECTIONS[0]?.id || "intro");
  const [activeEndpoint, setActiveEndpoint] = useState(null);
  const [commandOpen, setCommandOpen] = useState(false);
  const [isMac] = useState(() => detectIsMac());
  const { isMobile, setOpenMobile } = useSidebar();

  const totalEndpoints = useMemo(
    () => API_SECTIONS.reduce((acc, s) => acc + (s.endpoints?.length || 0), 0),
    []
  );

  const currentSection = useMemo(
    () => API_SECTIONS.find((s) => s.id === activeSection),
    [activeSection]
  );

  const currentEndpoint = useMemo(() => {
    if (!activeEndpoint || !currentSection) return null;
    return (currentSection.endpoints || []).find((e) => e.id === activeEndpoint) || null;
  }, [activeEndpoint, currentSection]);

  const handleNavigate = useCallback(
    (sectionId, endpointId) => {
      // Auto-close the mobile drawer for smoother UX after a selection.
      if (isMobile) setOpenMobile(false);
      const anchor = endpointId ? `ep-${endpointId}` : `section-${sectionId}`;
      setTimeout(() => {
        const el = document.getElementById(anchor);
        const scroller = document.getElementById("api-docs-scroller");
        if (el && scroller) {
          const elTop = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
          scroller.scrollTo({ top: scroller.scrollTop + elTop - 12, behavior: "smooth" });
        } else if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 60);
    },
    [isMobile, setOpenMobile]
  );

  // Cmd+K / Ctrl+K shortcut
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCommandOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Scroll spy: track active section + endpoint based on scroll position
  useEffect(() => {
    const scroller = document.getElementById("api-docs-scroller");
    if (!scroller) return;
    let raf = 0;
    const compute = () => {
      const scrollerTop = scroller.getBoundingClientRect().top;
      let bestSection = API_SECTIONS[0]?.id || "intro";
      let bestSectionDelta = -Infinity;
      let bestEndpoint = null;
      let bestEndpointDelta = -Infinity;
      let bestEndpointSection = null;

      API_SECTIONS.forEach((section) => {
        const secEl = document.getElementById(`section-${section.id}`);
        if (secEl) {
          const delta = secEl.getBoundingClientRect().top - scrollerTop - SCROLL_OFFSET;
          if (delta <= 0 && delta > bestSectionDelta) {
            bestSectionDelta = delta;
            bestSection = section.id;
          }
        }
        (section.endpoints || []).forEach((ep) => {
          const el = document.getElementById(`ep-${ep.id}`);
          if (!el) return;
          const delta = el.getBoundingClientRect().top - scrollerTop - SCROLL_OFFSET;
          if (delta <= 0 && delta > bestEndpointDelta) {
            bestEndpointDelta = delta;
            bestEndpoint = ep.id;
            bestEndpointSection = section.id;
          }
        });
      });

      setActiveSection(bestSection);
      // Only show active endpoint if it belongs to the active section
      setActiveEndpoint(bestEndpointSection === bestSection ? bestEndpoint : null);
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(compute);
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    compute();
    return () => {
      cancelAnimationFrame(raf);
      scroller.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <>
      <DocsSidebar
        activeSection={activeSection}
        activeEndpoint={activeEndpoint}
        onNavigate={handleNavigate}
      />
      <SidebarInset className="min-h-0 h-svh overflow-hidden flex flex-col bg-background">
        <DocsTopBar
          currentSection={currentSection}
          currentEndpoint={currentEndpoint}
          onOpenCommand={() => setCommandOpen(true)}
          isMac={isMac}
        />
        <div className="flex-1 min-h-0 flex overflow-hidden">
          <main
            id="api-docs-scroller"
            className="flex-1 overflow-y-auto scroll-smooth"
          >
            <div className="max-w-[1180px] mx-auto px-6 sm:px-10 lg:px-12 py-10 space-y-20">
              {API_SECTIONS.map((section, idx) => (
                <SectionBlock
                  key={section.id}
                  section={section}
                  isFirst={idx === 0 && section.id === "intro"}
                  totalEndpoints={totalEndpoints}
                />
              ))}
              <footer className="pt-8 pb-16 border-t border-border flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <img
                    src="/logo-bomflow-icon.png"
                    alt=""
                    className="h-5 w-5 opacity-70"
                  />
                  <span>
                    Bomflow API Reference · {totalEndpoints} endpoints
                    documentados
                  </span>
                </div>
                <span className="font-mono">
                  {API_META.baseUrl} · {API_META.authScheme}
                </span>
              </footer>
            </div>
          </main>
          <OnThisPage
            section={currentSection}
            activeEndpoint={activeEndpoint}
            onNavigate={handleNavigate}
          />
        </div>
      </SidebarInset>

      <DocsCommandPalette
        open={commandOpen}
        onOpenChange={setCommandOpen}
        onNavigate={handleNavigate}
      />
    </>
  );
}

/* --------------------------------- Sidebar -------------------------------- */

function DocsSidebar({ activeSection, activeEndpoint, onNavigate }) {
  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border h-14 px-2 py-0 flex-row items-center gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1 px-1">
          <img
            src="/logo-bomflow-icon.png"
            alt="Bomflow"
            className="h-8 w-8 object-contain flex-shrink-0"
          />
          <div className="leading-tight min-w-0 group-data-[collapsible=icon]:hidden">
            <div className="text-sm font-semibold text-sidebar-foreground truncate">
              Bomflow API
            </div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground -mt-0.5">
              v1 · Reference
            </div>
          </div>
        </div>
        <SidebarTrigger className="group-data-[collapsible=icon]:hidden -mr-1" />
      </SidebarHeader>

      <SidebarContent className="py-2">
        <SidebarGroup className="py-1">
          <SidebarGroupContent>
            <SidebarMenu>
              {API_SECTIONS.map((section) => {
                const Icon = section.icon || Hash;
                const isActive =
                  activeSection === section.id && !activeEndpoint;
                const sectionContainsActive = activeSection === section.id;
                const hasEndpoints = (section.endpoints || []).length > 0;

                if (!hasEndpoints) {
                  return (
                    <SidebarMenuItem key={section.id}>
                      <SidebarMenuButton
                        tooltip={section.title}
                        isActive={isActive}
                        onClick={() => onNavigate(section.id)}
                      >
                        <Icon />
                        <span>{section.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                }

                return (
                  <Collapsible
                    key={section.id}
                    defaultOpen={sectionContainsActive}
                    className="group/collapsible"
                    asChild
                  >
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton
                          tooltip={section.title}
                          isActive={sectionContainsActive}
                          className="font-medium"
                          onClick={() => onNavigate(section.id)}
                        >
                          <Icon />
                          <span className="truncate">{section.title}</span>
                          <span className="ml-auto text-[10px] font-mono text-muted-foreground/70 group-data-[collapsible=icon]:hidden">
                            {section.endpoints.length}
                          </span>
                          <ChevronRight className="ml-1 h-3.5 w-3.5 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90 group-data-[collapsible=icon]:hidden" />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          {section.endpoints.map((ep) => {
                            const epActive = activeEndpoint === ep.id;
                            return (
                              <SidebarMenuSubItem key={ep.id}>
                                <SidebarMenuSubButton
                                  asChild
                                  isActive={epActive}
                                  className="cursor-pointer h-auto py-1.5"
                                >
                                  <button
                                    type="button"
                                    onClick={() => onNavigate(section.id, ep.id)}
                                    className="w-full flex items-center gap-2 text-left"
                                  >
                                    <span
                                      className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${HTTP_METHOD_COLORS[ep.method] || ""}`}
                                    >
                                      {ep.method}
                                    </span>
                                    <span className="truncate text-[12.5px]">
                                      {ep.title}
                                    </span>
                                  </button>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            );
                          })}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <div className="flex items-center gap-2 px-1 text-[11px] text-muted-foreground group-data-[collapsible=icon]:hidden">
          <span className="inline-flex items-center gap-1.5 font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            {API_META.baseUrl}
          </span>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

/* --------------------------------- Topbar --------------------------------- */

function DocsTopBar({ currentSection, currentEndpoint, onOpenCommand, isMac }) {
  const { theme, setTheme } = useTheme();
  const shortcutHint = isMac ? "⌘K" : "Ctrl+K";
  return (
    <header className="flex-shrink-0 h-14 border-b border-border bg-background/80 backdrop-blur-md flex items-center gap-3 px-3 sm:px-5">
      <SidebarTrigger className="-ml-1" />

      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1.5 text-sm min-w-0"
      >
        <span className="text-muted-foreground hidden sm:inline">Docs</span>
        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/60 hidden sm:inline" />
        <span className="font-medium text-foreground truncate">
          {currentSection?.title || "Introdução"}
        </span>
        {currentEndpoint && (
          <>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/60 flex-shrink-0" />
            <span className="text-muted-foreground truncate hidden md:inline">
              {currentEndpoint.title}
            </span>
          </>
        )}
      </nav>

      <div className="ml-auto flex items-center gap-1.5">
        <button
          type="button"
          onClick={onOpenCommand}
          className="hidden sm:inline-flex items-center gap-2 h-9 pl-3 pr-1.5 rounded-md border border-border bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors text-xs w-[260px] max-w-[40vw]"
          aria-label="Abrir busca"
        >
          <Search className="w-3.5 h-3.5" />
          <span className="flex-1 text-left">Buscar na documentação...</span>
          <kbd className="ml-auto inline-flex items-center gap-0.5 h-6 px-1.5 rounded border border-border bg-background font-mono text-[10px] text-muted-foreground">
            {shortcutHint}
          </kbd>
        </button>
        <Button
          variant="ghost"
          size="icon"
          className="sm:hidden h-9 w-9"
          onClick={onOpenCommand}
          aria-label="Buscar"
        >
          <Search className="w-4 h-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          onClick={() => setTheme(theme === "light" ? "dark" : "light")}
          aria-label="Alternar tema"
          title="Alternar tema"
        >
          {theme === "light" ? (
            <Moon className="w-4 h-4" />
          ) : (
            <Sun className="w-4 h-4" />
          )}
        </Button>

        <a
          href="/AppsHub"
          className="hidden md:inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2.5 py-1.5 rounded-md hover:bg-muted transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Sistema
        </a>
      </div>
    </header>
  );
}

/* ----------------------------- On This Page ------------------------------- */

function OnThisPage({ section, activeEndpoint, onNavigate }) {
  const firstSectionId = API_SECTIONS[0]?.id || "intro";
  if (!section || !(section.endpoints && section.endpoints.length > 0)) {
    return null;
  }
  const authCount = section.endpoints.filter((e) => e.auth).length;
  const publicCount = section.endpoints.length - authCount;
  return (
    <aside className="hidden xl:block w-[280px] flex-shrink-0 border-l border-border overflow-y-auto bg-muted/10">
      <div className="p-5 sticky top-0">
        <div className="flex items-center gap-2 mb-1">
          <BookOpen className="w-3.5 h-3.5 text-muted-foreground" />
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Nesta página
          </div>
        </div>
        <div className="text-[11px] text-muted-foreground/80 mb-4 flex items-center gap-2">
          <span>{section.endpoints.length} endpoints</span>
          {authCount > 0 && (
            <span className="inline-flex items-center gap-1">
              · <Lock className="w-2.5 h-2.5" /> {authCount}
            </span>
          )}
          {publicCount > 0 && (
            <span className="inline-flex items-center gap-1">
              · <Globe className="w-2.5 h-2.5" /> {publicCount}
            </span>
          )}
        </div>
        <ul className="space-y-0.5 text-[13px] border-l border-border/60">
          {section.endpoints.map((ep) => {
            const isActive = activeEndpoint === ep.id;
            return (
              <li key={ep.id}>
                <button
                  type="button"
                  onClick={() => onNavigate(section.id, ep.id)}
                  className={`w-full text-left pl-3 pr-2 py-1.5 -ml-px border-l-2 transition-all flex items-center gap-2 ${
                    isActive
                      ? "border-primary text-foreground bg-primary/5 font-medium"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/40"
                  }`}
                >
                  <span
                    className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${HTTP_METHOD_COLORS[ep.method] || ""}`}
                  >
                    {ep.method}
                  </span>
                  <span className="truncate">{ep.title}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="mt-6 pt-4 border-t border-border">
          <button
            type="button"
            onClick={() => onNavigate(firstSectionId)}
            className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
          >
            <CornerDownRight className="w-3 h-3 rotate-180" />
            Voltar ao topo
          </button>
        </div>
      </div>
    </aside>
  );
}

/* --------------------------- Command (Cmd+K) Palette ---------------------- */

function DocsCommandPalette({ open, onOpenChange, onNavigate }) {
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Buscar seções e endpoints..." />
      <CommandList>
        <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>
        <CommandGroup heading="Seções">
          {API_SECTIONS.map((section) => {
            const Icon = section.icon || Hash;
            return (
              <CommandItem
                key={`section-${section.id}`}
                value={`section ${section.title} ${section.overview || ""}`}
                onSelect={() => {
                  onNavigate(section.id);
                  onOpenChange(false);
                }}
              >
                <Icon className="w-4 h-4 text-muted-foreground" />
                <span>{section.title}</span>
                <span className="ml-auto text-[10px] font-mono text-muted-foreground">
                  {section.endpoints?.length || 0}
                </span>
              </CommandItem>
            );
          })}
        </CommandGroup>
        {API_SECTIONS.map((section) =>
          section.endpoints && section.endpoints.length > 0 ? (
            <CommandGroup key={`g-${section.id}`} heading={section.title}>
              {section.endpoints.map((ep) => (
                <CommandItem
                  key={`ep-${ep.id}`}
                  value={`${ep.method} ${ep.path} ${ep.title} ${ep.description}`}
                  onSelect={() => {
                    onNavigate(section.id, ep.id);
                    onOpenChange(false);
                  }}
                >
                  <span
                    className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${HTTP_METHOD_COLORS[ep.method] || ""}`}
                  >
                    {ep.method}
                  </span>
                  <span className="truncate">{ep.title}</span>
                  <code className="ml-auto truncate text-[11px] font-mono text-muted-foreground max-w-[220px]">
                    {ep.path}
                  </code>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null
        )}
      </CommandList>
    </CommandDialog>
  );
}

/* ------------------------------- Section ---------------------------------- */

function SectionBlock({ section, isFirst, totalEndpoints }) {
  const Icon = section.icon;
  const epCount = section.endpoints?.length || 0;
  const authCount = (section.endpoints || []).filter((e) => e.auth).length;
  const publicCount = epCount - authCount;
  const sectionsCount = API_SECTIONS.length;

  return (
    <section id={`section-${section.id}`} className="scroll-mt-6">
      {isFirst && (
        <div className="mb-14 relative">
          <div className="absolute inset-0 -z-10 bg-gradient-to-br from-primary/5 via-transparent to-purple-500/5 blur-2xl rounded-3xl" />
          <div className="flex flex-wrap items-center gap-2 mb-5">
            <Badge
              variant="outline"
              className="text-[11px] uppercase tracking-wider border-primary/30 text-primary bg-primary/5 gap-1"
            >
              <Sparkles className="w-3 h-3" />
              API Reference · v1
            </Badge>
            <Badge
              variant="outline"
              className="text-[11px] gap-1 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Operacional
            </Badge>
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground bg-clip-text bg-gradient-to-br from-foreground to-foreground/70">
            Documentação da API Bomflow
          </h1>
          <p className="mt-4 text-base sm:text-[17px] text-muted-foreground leading-relaxed max-w-3xl">
            Referência completa da API REST do Bomflow.{" "}
            <strong className="text-foreground font-semibold">
              {totalEndpoints} endpoints
            </strong>{" "}
            documentados em{" "}
            <strong className="text-foreground font-semibold">
              {sectionsCount} áreas funcionais
            </strong>
            . Integre sistemas externos, automatize fluxos ou construa novas
            ferramentas sobre a base.
          </p>

          <div className="mt-8 grid grid-cols-2 lg:grid-cols-4 gap-3">
            <InfoTile
              label="Base URL"
              value={API_META.baseUrl}
              mono
              icon={Link2}
              accent="primary"
            />
            <InfoTile
              label="Autenticação"
              value={API_META.authScheme}
              icon={Lock}
              accent="amber"
            />
            <InfoTile
              label="Formato"
              value={API_META.contentType}
              mono
              icon={Code2}
              accent="violet"
            />
            <InfoTile
              label="Endpoints"
              value={`${totalEndpoints} disponíveis`}
              icon={Layers}
              accent="emerald"
            />
          </div>

          <div className="mt-8 rounded-xl border border-border bg-card overflow-hidden shadow-sm">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/40">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold text-foreground">
                  Início rápido
                </span>
                <Badge
                  variant="outline"
                  className="text-[10px] font-mono ml-1"
                >
                  curl
                </Badge>
              </div>
              <span className="text-[11px] text-muted-foreground">
                Faça login e obtenha um access token
              </span>
            </div>
            <div className="p-0">
              <CodeBlock
                code={`curl -X POST ${API_META.productionBaseUrl}/auth/login \\\n  -H "Content-Type: application/json" \\\n  -d '{"email":"voce@empresa.com","password":"sua-senha"}'`}
                language="bash"
                noFrame
              />
            </div>
          </div>
        </div>
      )}

      {!isFirst && (
        <div className="mb-8 rounded-2xl border border-border bg-gradient-to-br from-muted/30 via-card to-card p-6 sm:p-7">
          <div className="flex items-start gap-4">
            {Icon && (
              <div className="relative flex-shrink-0">
                <div className="absolute inset-0 bg-primary/20 blur-md rounded-xl" />
                <div className="relative w-12 h-12 rounded-xl bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center">
                  <Icon className="w-6 h-6 text-primary" />
                </div>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h2 className="text-2xl sm:text-[26px] font-bold text-foreground">
                  {section.title}
                </h2>
                {epCount > 0 && (
                  <Badge
                    variant="secondary"
                    className="text-[11px] font-mono"
                  >
                    {epCount} {epCount === 1 ? "endpoint" : "endpoints"}
                  </Badge>
                )}
              </div>
              {(authCount > 0 || publicCount > 0) && (
                <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground mb-3">
                  {authCount > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <Lock className="w-3 h-3 text-amber-500" />
                      {authCount} com autenticação
                    </span>
                  )}
                  {publicCount > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <Globe className="w-3 h-3 text-emerald-500" />
                      {publicCount} {publicCount === 1 ? "público" : "públicos"}
                    </span>
                  )}
                </div>
              )}
              {section.overview && (
                <div className="text-[14px] text-muted-foreground leading-relaxed whitespace-pre-line max-w-4xl">
                  {renderInline(section.overview)}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {isFirst && section.overview && (
        <div className="mt-10 mb-4 flex items-start gap-3">
          {Icon && (
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Icon className="w-5 h-5 text-primary" />
            </div>
          )}
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-foreground mb-2">
              {section.title}
            </h2>
            <div className="text-[14px] text-muted-foreground leading-relaxed whitespace-pre-line">
              {renderInline(section.overview)}
            </div>
          </div>
        </div>
      )}

      {epCount > 0 && (
        <div className="mt-8 space-y-12">
          {section.endpoints.map((ep) => (
            <EndpointCard key={ep.id} endpoint={ep} />
          ))}
        </div>
      )}
    </section>
  );
}

function renderInline(text) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? (
      <strong key={i} className="font-semibold text-foreground">
        {p.slice(2, -2)}
      </strong>
    ) : (
      <span key={i}>{p}</span>
    )
  );
}

/* ------------------------------ Endpoint Card ---------------------------- */

function EndpointCard({ endpoint }) {
  const [tab, setTab] = useState("curl");
  const [copiedUrl, setCopiedUrl] = useState(false);
  const baseUrl = API_META.productionBaseUrl;
  const fullUrl = `${baseUrl}${endpoint.path}`;

  const codeExamples = {
    curl: buildCurlExample(endpoint, baseUrl),
    js: buildJsExample(endpoint, baseUrl),
  };

  const hasNoInputs =
    (!endpoint.params || endpoint.params.length === 0) &&
    (!endpoint.query || endpoint.query.length === 0) &&
    (!endpoint.body || endpoint.body.length === 0);

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 1500);
    } catch {
      /* ignore */
    }
  };

  const respStatus = endpoint.response?.status;
  const respIsSuccess = respStatus && respStatus >= 200 && respStatus < 300;

  return (
    <article id={`ep-${endpoint.id}`} className="scroll-mt-6 group/card">
      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow">
        <header className="px-6 py-5 border-b border-border bg-gradient-to-br from-muted/40 via-muted/20 to-transparent">
          <div className="flex flex-wrap items-center gap-2.5">
            <span
              className={`text-[11px] font-mono font-bold px-2.5 py-1 rounded-md ring-1 ring-inset ring-current/10 ${HTTP_METHOD_COLORS[endpoint.method]}`}
            >
              {endpoint.method}
            </span>
            <code className="text-[15px] font-mono text-foreground font-semibold break-all">
              {endpoint.path}
            </code>
            <a
              href={`#ep-${endpoint.id}`}
              aria-label="Link para este endpoint"
              className="opacity-0 group-hover/card:opacity-100 focus-visible:opacity-100 transition-opacity p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Hash className="w-3.5 h-3.5" />
            </a>
            <div className="ml-auto flex items-center gap-1.5">
              {endpoint.auth ? (
                <Badge
                  variant="outline"
                  className="gap-1 text-[10px] border-amber-200 text-amber-700 dark:border-amber-800/60 dark:text-amber-300 bg-amber-50/50 dark:bg-amber-950/20"
                >
                  <Lock className="w-3 h-3" /> Bearer
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="gap-1 text-[10px] border-emerald-200 text-emerald-700 dark:border-emerald-800/60 dark:text-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20"
                >
                  <Globe className="w-3 h-3" /> Público
                </Badge>
              )}
            </div>
          </div>
          <h3 className="mt-3 text-lg font-semibold text-foreground">
            {endpoint.title}
          </h3>
          <p className="mt-1.5 text-[14px] text-muted-foreground leading-relaxed max-w-3xl">
            {endpoint.description}
          </p>

          <div className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-background/80 px-3 py-2">
            <Link2 className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <code className="flex-1 text-[12px] font-mono text-muted-foreground truncate">
              {fullUrl}
            </code>
            <button
              type="button"
              onClick={copyUrl}
              title="Copiar URL"
              className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              {copiedUrl ? (
                <>
                  <Check className="w-3 h-3 text-emerald-500" /> Copiado
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" /> Copiar
                </>
              )}
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] gap-0 lg:divide-x divide-border">
          <div className="p-6 space-y-6">
            <div>
              <SectionLabel icon={ShieldAlert} label="Headers" />
              <div className="border border-border rounded-lg overflow-hidden">
                <table className="w-full text-[13px]">
                  <tbody className="divide-y divide-border">
                    <tr className="hover:bg-muted/40">
                      <td className="px-3 py-2.5 align-top w-2/5">
                        <code className="font-mono font-medium text-[12.5px] text-primary">
                          Content-Type
                        </code>
                        <div className="mt-0.5 text-[11px] text-muted-foreground font-mono">
                          string
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground leading-relaxed text-[12.5px]">
                        <code className="font-mono text-foreground/80">
                          application/json
                        </code>
                      </td>
                    </tr>
                    {endpoint.auth && (
                      <tr className="hover:bg-muted/40">
                        <td className="px-3 py-2.5 align-top">
                          <code className="font-mono font-medium text-[12.5px] text-primary">
                            Authorization
                          </code>
                          <RequiredPill />
                          <div className="mt-0.5 text-[11px] text-muted-foreground font-mono">
                            string
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground leading-relaxed text-[12.5px]">
                          <code className="font-mono text-foreground/80">
                            Bearer &lt;accessToken&gt;
                          </code>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {endpoint.params && endpoint.params.length > 0 && (
              <ParamTable
                title="Path Params"
                icon={CornerDownRight}
                rows={endpoint.params}
              />
            )}
            {endpoint.query && endpoint.query.length > 0 && (
              <ParamTable
                title="Query Params"
                icon={Search}
                rows={endpoint.query}
              />
            )}
            {endpoint.body && endpoint.body.length > 0 && (
              <ParamTable
                title="Request Body"
                icon={Code2}
                rows={endpoint.body}
              />
            )}
            {hasNoInputs && (
              <div className="text-[12px] text-muted-foreground italic px-3 py-3 rounded-md bg-muted/30 border border-dashed border-border">
                Este endpoint não recebe parâmetros adicionais.
              </div>
            )}
          </div>

          <div className="p-6 space-y-5 bg-muted/20">
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <SectionLabel icon={Terminal} label="Requisição" inline />
                <div className="inline-flex bg-muted/70 rounded-md p-0.5 text-[11px]">
                  <button
                    onClick={() => setTab("curl")}
                    className={`px-2.5 py-1 rounded transition-colors font-medium ${
                      tab === "curl"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    type="button"
                  >
                    cURL
                  </button>
                  <button
                    onClick={() => setTab("js")}
                    className={`px-2.5 py-1 rounded transition-colors font-medium ${
                      tab === "js"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    type="button"
                  >
                    JavaScript
                  </button>
                </div>
              </div>
              <CodeBlock
                code={codeExamples[tab]}
                language={tab === "curl" ? "bash" : "javascript"}
              />
            </div>

            {endpoint.response && (
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <SectionLabel icon={Code2} label="Resposta" inline />
                  <div className="flex items-center gap-1.5">
                    <Badge
                      variant="outline"
                      className={`text-[10px] gap-1 font-mono ${
                        respIsSuccess
                          ? "border-emerald-300/60 text-emerald-700 dark:border-emerald-800/60 dark:text-emerald-300 bg-emerald-50/60 dark:bg-emerald-950/30"
                          : "border-rose-300/60 text-rose-700 dark:border-rose-800/60 dark:text-rose-300 bg-rose-50/60 dark:bg-rose-950/30"
                      }`}
                    >
                      {respIsSuccess ? (
                        <CircleCheck className="w-3 h-3" />
                      ) : (
                        <CircleSlash className="w-3 h-3" />
                      )}
                      {respStatus} {respIsSuccess ? "OK" : "Error"}
                    </Badge>
                    <Badge
                      variant="outline"
                      className="text-[10px] font-mono"
                    >
                      JSON
                    </Badge>
                  </div>
                </div>
                <CodeBlock
                  code={JSON.stringify(endpoint.response.example, null, 2)}
                  language="json"
                />
              </div>
            )}

            <div className="text-[11px] text-muted-foreground/80 flex items-center gap-1.5">
              <Activity className="w-3 h-3" />
              Em caso de erro, a resposta segue o formato{" "}
              <code className="font-mono text-foreground/80">
                {`{ error: string }`}
              </code>{" "}
              com o status HTTP apropriado.
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function SectionLabel({ icon: Icon, label, inline }) {
  return (
    <div
      className={`flex items-center gap-1.5 text-foreground ${
        inline ? "" : "mb-2.5"
      }`}
    >
      {Icon && <Icon className="w-3.5 h-3.5 text-muted-foreground" />}
      <span className="text-[11px] font-semibold uppercase tracking-wider">
        {label}
      </span>
    </div>
  );
}

function RequiredPill() {
  return (
    <span className="ml-1.5 text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
      required
    </span>
  );
}

function TypePill({ type }) {
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono bg-muted/60 text-muted-foreground border border-border/60">
      {type}
    </span>
  );
}

function ParamTable({ title, icon, rows }) {
  return (
    <div>
      <SectionLabel icon={icon} label={title} />
      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full text-[13px]">
          <tbody className="divide-y divide-border">
            {rows.map((row, i) => (
              <tr key={i} className="hover:bg-muted/40 transition-colors">
                <td className="px-3 py-3 align-top w-[42%]">
                  <div className="flex flex-wrap items-center gap-1">
                    <code className="font-mono font-semibold text-[12.5px] text-primary break-all">
                      {row.name}
                    </code>
                    {row.required && <RequiredPill />}
                  </div>
                  <div className="mt-1">
                    <TypePill type={row.type} />
                  </div>
                </td>
                <td className="px-3 py-3 text-muted-foreground leading-relaxed text-[12.5px]">
                  {row.description}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CodeBlock({ code, language, noFrame }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore
    }
  };
  return (
    <div
      className={`relative group bg-slate-950 text-slate-100 overflow-hidden ${
        noFrame ? "" : "rounded-lg ring-1 ring-slate-800"
      }`}
    >
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800/80 bg-slate-900/40">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-rose-500/70" />
            <span className="w-2 h-2 rounded-full bg-amber-500/70" />
            <span className="w-2 h-2 rounded-full bg-emerald-500/70" />
          </div>
          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 ml-1">
            {language}
          </span>
        </div>
        <button
          onClick={onCopy}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium text-slate-300 bg-slate-800/80 hover:bg-slate-700 transition-colors"
          title="Copiar"
          type="button"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-emerald-400" /> Copiado
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" /> Copiar
            </>
          )}
        </button>
      </div>
      <pre className="px-4 py-3.5 text-[12.5px] font-mono leading-relaxed overflow-x-auto whitespace-pre">
        <code>{code}</code>
      </pre>
    </div>
  );
}

const ACCENT_STYLES = {
  primary: {
    border: "border-primary/20",
    bg: "bg-primary/5",
    icon: "text-primary",
    iconBg: "bg-primary/10",
  },
  emerald: {
    border: "border-emerald-500/20",
    bg: "bg-emerald-500/5",
    icon: "text-emerald-600 dark:text-emerald-400",
    iconBg: "bg-emerald-500/10",
  },
  amber: {
    border: "border-amber-500/20",
    bg: "bg-amber-500/5",
    icon: "text-amber-600 dark:text-amber-400",
    iconBg: "bg-amber-500/10",
  },
  violet: {
    border: "border-violet-500/20",
    bg: "bg-violet-500/5",
    icon: "text-violet-600 dark:text-violet-400",
    iconBg: "bg-violet-500/10",
  },
};

function InfoTile({ label, value, icon: Icon, mono, accent }) {
  const styles = ACCENT_STYLES[accent] || {
    border: "border-border",
    bg: "bg-muted/30",
    icon: "text-muted-foreground",
    iconBg: "bg-muted",
  };
  return (
    <div
      className={`rounded-xl border ${styles.border} ${styles.bg} px-4 py-3.5 transition-all hover:shadow-sm`}
    >
      <div className="flex items-center gap-2">
        {Icon && (
          <div
            className={`w-7 h-7 rounded-lg ${styles.iconBg} flex items-center justify-center flex-shrink-0`}
          >
            <Icon className={`w-3.5 h-3.5 ${styles.icon}`} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            {label}
          </div>
          <div
            className={`mt-0.5 text-[13px] text-foreground font-medium truncate ${mono ? "font-mono" : ""}`}
            title={value}
          >
            {value}
          </div>
        </div>
      </div>
    </div>
  );
}
