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
      <SidebarProvider defaultOpen>
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
            <div className="max-w-3xl mx-auto px-4 sm:px-8 py-10 space-y-16">
              {API_SECTIONS.map((section, idx) => (
                <SectionBlock
                  key={section.id}
                  section={section}
                  isFirst={idx === 0 && section.id === "intro"}
                  totalEndpoints={totalEndpoints}
                />
              ))}
              <footer className="pt-8 pb-12 border-t border-border text-xs text-muted-foreground">
                Bomflow API Reference · {totalEndpoints} endpoints documentados
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
  if (!section || !(section.endpoints && section.endpoints.length > 0)) {
    return null;
  }
  return (
    <aside className="hidden lg:block w-[240px] flex-shrink-0 border-l border-border overflow-y-auto">
      <div className="p-5 sticky top-0">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Nesta página
        </div>
        <ul className="space-y-1 text-[12.5px]">
          {section.endpoints.map((ep) => {
            const isActive = activeEndpoint === ep.id;
            return (
              <li key={ep.id}>
                <button
                  type="button"
                  onClick={() => onNavigate(section.id, ep.id)}
                  className={`w-full text-left px-2 py-1.5 rounded-md border-l-2 -ml-px transition-colors flex items-center gap-2 ${
                    isActive
                      ? "border-primary text-foreground bg-muted/60 font-medium"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40"
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
  return (
    <section id={`section-${section.id}`} className="scroll-mt-6">
      {isFirst && (
        <div className="mb-10">
          <Badge
            variant="outline"
            className="mb-4 text-[11px] uppercase tracking-wider border-primary/30 text-primary"
          >
            API Reference · v1
          </Badge>
          <h1 className="text-4xl font-bold tracking-tight text-foreground">
            Documentação da API Bomflow
          </h1>
          <p className="mt-3 text-base text-muted-foreground leading-relaxed max-w-2xl">
            Referência completa da API REST do Bomflow. {totalEndpoints} endpoints documentados,
            organizados por área funcional. Use estes endpoints para integrar sistemas externos,
            automatizar fluxos ou construir novas ferramentas sobre a base.
          </p>
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <InfoTile label="Base URL" value={API_META.baseUrl} mono />
            <InfoTile label="Autenticação" value={API_META.authScheme} icon={Lock} />
            <InfoTile label="Formato" value={API_META.contentType} mono />
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 mb-2">
        {Icon && (
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon className="w-5 h-5 text-primary" />
          </div>
        )}
        <h2 className="text-2xl font-bold text-foreground">{section.title}</h2>
      </div>
      {section.overview && (
        <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
          {renderInline(section.overview)}
        </p>
      )}

      <div className="mt-8 space-y-10">
        {(section.endpoints || []).map((ep) => (
          <EndpointCard key={ep.id} endpoint={ep} />
        ))}
      </div>
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
  const baseUrl = API_META.productionBaseUrl;

  const codeExamples = {
    curl: buildCurlExample(endpoint, baseUrl),
    js: buildJsExample(endpoint, baseUrl),
  };

  return (
    <article id={`ep-${endpoint.id}`} className="scroll-mt-6">
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <header className="px-5 py-4 border-b border-border bg-muted/30">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`text-[11px] font-mono font-bold px-2 py-1 rounded ${HTTP_METHOD_COLORS[endpoint.method]}`}
            >
              {endpoint.method}
            </span>
            <code className="text-sm font-mono text-foreground font-medium break-all">
              {endpoint.path}
            </code>
            {endpoint.auth ? (
              <Badge
                variant="outline"
                className="ml-auto gap-1 text-[10px] border-amber-200 text-amber-700 dark:border-amber-800/60 dark:text-amber-300"
              >
                <Lock className="w-3 h-3" /> Auth
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="ml-auto gap-1 text-[10px] border-emerald-200 text-emerald-700 dark:border-emerald-800/60 dark:text-emerald-300"
              >
                <Globe className="w-3 h-3" /> Público
              </Badge>
            )}
          </div>
          <h3 className="mt-2 text-base font-semibold text-foreground">
            {endpoint.title}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {endpoint.description}
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 lg:divide-x divide-border">
          <div className="p-5 space-y-5">
            {endpoint.params && endpoint.params.length > 0 && (
              <ParamTable title="Path Params" rows={endpoint.params} />
            )}
            {endpoint.query && endpoint.query.length > 0 && (
              <ParamTable title="Query Params" rows={endpoint.query} />
            )}
            {endpoint.body && endpoint.body.length > 0 && (
              <ParamTable title="Body" rows={endpoint.body} />
            )}
            {(!endpoint.params || endpoint.params.length === 0) &&
              (!endpoint.query || endpoint.query.length === 0) &&
              (!endpoint.body || endpoint.body.length === 0) && (
                <div className="text-xs text-muted-foreground italic">
                  Este endpoint não recebe parâmetros.
                </div>
              )}
          </div>

          <div className="p-5 space-y-4 bg-muted/20">
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1 text-xs font-medium text-foreground">
                  <Terminal className="w-3.5 h-3.5" /> Requisição
                </div>
                <div className="inline-flex bg-muted rounded-md p-0.5 text-[11px]">
                  <button
                    onClick={() => setTab("curl")}
                    className={`px-2 py-0.5 rounded transition-colors ${
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
                    className={`px-2 py-0.5 rounded transition-colors ${
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
                <div className="flex items-center gap-2 mb-2">
                  <Code2 className="w-3.5 h-3.5 text-foreground" />
                  <span className="text-xs font-medium text-foreground">
                    Resposta
                  </span>
                  <Badge
                    variant="outline"
                    className="text-[10px] gap-1 border-emerald-200 text-emerald-700 dark:border-emerald-800/60 dark:text-emerald-300"
                  >
                    {endpoint.response.status}
                  </Badge>
                </div>
                <CodeBlock
                  code={JSON.stringify(endpoint.response.example, null, 2)}
                  language="json"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function ParamTable({ title, rows }) {
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        {title}
      </h4>
      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <tbody className="divide-y divide-border">
            {rows.map((row, i) => (
              <tr key={i} className="hover:bg-muted/40">
                <td className="px-3 py-2.5 align-top w-2/5">
                  <code className="font-mono font-medium text-[12px] text-primary break-all">
                    {row.name}
                  </code>
                  {row.required && (
                    <span className="ml-1.5 text-[10px] text-destructive font-semibold">
                      required
                    </span>
                  )}
                  <div className="mt-0.5 text-[10.5px] text-muted-foreground font-mono">
                    {row.type}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-muted-foreground leading-relaxed">
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

function CodeBlock({ code, language }) {
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
    <div className="relative group rounded-lg bg-slate-900 dark:bg-slate-950 text-slate-100 overflow-hidden ring-1 ring-slate-800">
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800">
        <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
          {language}
        </span>
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
      <pre className="px-4 py-3 text-[12px] font-mono leading-relaxed overflow-x-auto whitespace-pre">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function InfoTile({ label, value, icon: Icon, mono }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
        {Icon && <Icon className="w-3 h-3" />}
        {label}
      </div>
      <div className={`mt-1 text-sm text-foreground ${mono ? "font-mono" : ""}`}>
        {value}
      </div>
    </div>
  );
}
