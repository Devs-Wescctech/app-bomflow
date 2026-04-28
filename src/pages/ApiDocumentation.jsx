import { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  Search,
  Copy,
  Check,
  ArrowLeft,
  BookOpen,
  Lock,
  Globe,
  Terminal,
  Code2,
  Menu,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  API_META,
  API_SECTIONS,
  HTTP_METHOD_COLORS,
  buildCurlExample,
  buildJsExample,
} from "@/data/apiDocsSpec";

export default function ApiDocumentation() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeId, setActiveId] = useState("intro");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const filteredSections = useMemo(() => {
    if (!searchQuery.trim()) return API_SECTIONS;
    const q = searchQuery.toLowerCase();
    return API_SECTIONS.map((section) => {
      const matchSection =
        section.title.toLowerCase().includes(q) ||
        (section.overview || "").toLowerCase().includes(q);
      const matchedEndpoints = (section.endpoints || []).filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.path.toLowerCase().includes(q) ||
          e.description.toLowerCase().includes(q) ||
          e.method.toLowerCase().includes(q)
      );
      if (matchSection || matchedEndpoints.length > 0) {
        return { ...section, endpoints: matchSection ? section.endpoints : matchedEndpoints };
      }
      return null;
    }).filter(Boolean);
  }, [searchQuery]);

  // Scroll spy on window
  useEffect(() => {
    const handler = () => {
      const offsets = [];
      API_SECTIONS.forEach((s) => {
        const sec = document.getElementById(`section-${s.id}`);
        if (sec) offsets.push({ id: s.id, top: sec.getBoundingClientRect().top });
        (s.endpoints || []).forEach((e) => {
          const el = document.getElementById(`ep-${e.id}`);
          if (el) offsets.push({ id: `${s.id}::${e.id}`, top: el.getBoundingClientRect().top });
        });
      });
      const candidates = offsets.filter((o) => o.top <= 140);
      if (candidates.length) setActiveId(candidates[candidates.length - 1].id);
    };
    window.addEventListener("scroll", handler, { passive: true });
    handler();
    return () => window.removeEventListener("scroll", handler);
  }, []);

  const handleNavClick = (anchor) => {
    setMobileNavOpen(false);
    setTimeout(() => {
      const el = document.getElementById(anchor);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  const totalEndpoints = API_SECTIONS.reduce((acc, s) => acc + (s.endpoints?.length || 0), 0);

  return (
    <div className="-m-3 md:-m-6">
      {/* Hero header banner */}
      <div className="relative overflow-hidden bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700 px-4 sm:px-8 pt-6 pb-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.15),transparent_50%)]" />
        <div className="relative max-w-6xl mx-auto">
          <div className="flex items-center justify-between gap-4 mb-6">
            <Link
              to={createPageUrl("AppsHub")}
              className="inline-flex items-center gap-1.5 text-sm text-violet-100 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Voltar para APPs
            </Link>
            <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
              <SheetTrigger asChild>
                <Button variant="secondary" size="sm" className="lg:hidden gap-1.5">
                  <Menu className="w-4 h-4" />
                  Sumário
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[300px] p-0 overflow-y-auto">
                <SidebarNav
                  sections={filteredSections}
                  activeId={activeId}
                  onNavigate={handleNavClick}
                  searchQuery={searchQuery}
                  setSearchQuery={setSearchQuery}
                />
              </SheetContent>
            </Sheet>
          </div>

          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center flex-shrink-0">
              <BookOpen className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <Badge variant="outline" className="mb-2 text-[10px] uppercase tracking-wider bg-white/10 text-white border-white/20 backdrop-blur-sm">
                API Reference · v1
              </Badge>
              <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                Documentação da API Wescctech
              </h1>
              <p className="text-sm sm:text-base text-violet-100 mt-1 max-w-2xl">
                Referência completa da API REST do CRM. {totalEndpoints} endpoints documentados,
                organizados por área funcional.
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <HeroChip label="Base URL" value={API_META.baseUrl} mono />
            <HeroChip label="Auth" value={API_META.authScheme} icon={Lock} />
            <HeroChip label="Formato" value="JSON" mono />
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-6xl mx-auto px-4 sm:px-8 py-8">
        <div className="lg:grid lg:grid-cols-[260px_1fr] lg:gap-10">
          {/* Sidebar (desktop, sticky) */}
          <aside className="hidden lg:block">
            <div className="sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto pr-2 -mr-2">
              <SidebarNav
                sections={filteredSections}
                activeId={activeId}
                onNavigate={handleNavClick}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
              />
            </div>
          </aside>

          {/* Main */}
          <main className="min-w-0 space-y-16 pt-2">
            {filteredSections.length === 0 ? (
              <EmptyResults query={searchQuery} onClear={() => setSearchQuery("")} />
            ) : (
              filteredSections.map((section) => (
                <SectionBlock key={section.id} section={section} />
              ))
            )}
            <footer className="pt-8 pb-4 border-t border-gray-200 dark:border-gray-800 text-xs text-gray-500 dark:text-gray-400">
              Wescctech API Reference · {totalEndpoints} endpoints documentados
            </footer>
          </main>
        </div>
      </div>
    </div>
  );
}

function HeroChip({ label, value, icon: Icon, mono }) {
  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/10 backdrop-blur-sm border border-white/15 text-white text-xs">
      {Icon && <Icon className="w-3.5 h-3.5 text-violet-200" />}
      <span className="text-violet-200 uppercase tracking-wider text-[10px] font-semibold">
        {label}
      </span>
      <span className={`text-white ${mono ? "font-mono" : "font-medium"}`}>{value}</span>
    </div>
  );
}

function SidebarNav({ sections, activeId, onNavigate, searchQuery, setSearchQuery }) {
  return (
    <nav className="p-4 lg:p-0 space-y-5 text-sm">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Buscar endpoint..."
          className="pl-9 h-9 bg-white dark:bg-gray-900"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
            type="button"
          >
            <X className="w-3.5 h-3.5 text-gray-400" />
          </button>
        )}
      </div>

      {sections.map((section) => {
        const Icon = section.icon;
        const isSectionActive = activeId === section.id || activeId.startsWith(`${section.id}::`);
        return (
          <div key={section.id}>
            <button
              onClick={() => onNavigate(`section-${section.id}`)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md font-semibold text-[13px] transition-colors text-left ${
                isSectionActive
                  ? "text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-900/20"
                  : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800/50"
              }`}
              type="button"
            >
              {Icon && <Icon className="w-4 h-4 flex-shrink-0" />}
              <span className="truncate">{section.title}</span>
              <span className="ml-auto text-[10px] font-mono text-gray-400">
                {section.endpoints?.length || 0}
              </span>
            </button>
            {section.endpoints && section.endpoints.length > 0 && (
              <ul className="mt-1 ml-3 border-l border-gray-200 dark:border-gray-800 space-y-0.5">
                {section.endpoints.map((ep) => {
                  const itemActive = activeId === `${section.id}::${ep.id}`;
                  return (
                    <li key={ep.id}>
                      <button
                        onClick={() => onNavigate(`ep-${ep.id}`)}
                        className={`w-full flex items-center gap-2 pl-3 pr-2 py-1.5 -ml-px border-l-2 text-[12.5px] transition-colors text-left ${
                          itemActive
                            ? "border-violet-500 text-violet-700 dark:text-violet-300 bg-violet-50/60 dark:bg-violet-900/10"
                            : "border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100/60 dark:hover:bg-gray-800/30"
                        }`}
                        type="button"
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
            )}
          </div>
        );
      })}
    </nav>
  );
}

function SectionBlock({ section }) {
  const Icon = section.icon;
  return (
    <section id={`section-${section.id}`} className="scroll-mt-6">
      <div className="flex items-center gap-3 mb-2">
        {Icon && (
          <div className="w-9 h-9 rounded-lg bg-violet-50 dark:bg-violet-900/30 flex items-center justify-center">
            <Icon className="w-5 h-5 text-violet-600 dark:text-violet-300" />
          </div>
        )}
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{section.title}</h2>
      </div>
      {section.overview && (
        <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed whitespace-pre-line">
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
      <strong key={i} className="font-semibold text-gray-900 dark:text-gray-100">
        {p.slice(2, -2)}
      </strong>
    ) : (
      <span key={i}>{p}</span>
    )
  );
}

function EndpointCard({ endpoint }) {
  const [tab, setTab] = useState("curl");
  const baseUrl = API_META.productionBaseUrl;

  const codeExamples = {
    curl: buildCurlExample(endpoint, baseUrl),
    js: buildJsExample(endpoint, baseUrl),
  };

  return (
    <article id={`ep-${endpoint.id}`} className="scroll-mt-6">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50 overflow-hidden">
        <header className="px-5 py-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-900/60">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`text-[11px] font-mono font-bold px-2 py-1 rounded ${HTTP_METHOD_COLORS[endpoint.method]}`}
            >
              {endpoint.method}
            </span>
            <code className="text-sm font-mono text-gray-900 dark:text-gray-100 font-medium break-all">
              {endpoint.path}
            </code>
            {endpoint.auth ? (
              <Badge variant="outline" className="ml-auto gap-1 text-[10px] border-amber-200 text-amber-700 dark:border-amber-800/60 dark:text-amber-300">
                <Lock className="w-3 h-3" /> Auth
              </Badge>
            ) : (
              <Badge variant="outline" className="ml-auto gap-1 text-[10px] border-emerald-200 text-emerald-700 dark:border-emerald-800/60 dark:text-emerald-300">
                <Globe className="w-3 h-3" /> Público
              </Badge>
            )}
          </div>
          <h3 className="mt-2 text-base font-semibold text-gray-900 dark:text-gray-100">
            {endpoint.title}
          </h3>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {endpoint.description}
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 lg:divide-x divide-gray-200 dark:divide-gray-800">
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
                <div className="text-xs text-gray-500 dark:text-gray-400 italic">
                  Este endpoint não recebe parâmetros.
                </div>
              )}
          </div>

          <div className="p-5 space-y-4 bg-gray-50/40 dark:bg-gray-900/20">
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1 text-xs font-medium text-gray-700 dark:text-gray-300">
                  <Terminal className="w-3.5 h-3.5" /> Requisição
                </div>
                <div className="inline-flex bg-gray-100 dark:bg-gray-800 rounded-md p-0.5 text-[11px]">
                  <button
                    onClick={() => setTab("curl")}
                    className={`px-2 py-0.5 rounded ${
                      tab === "curl"
                        ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm"
                        : "text-gray-500 dark:text-gray-400"
                    }`}
                    type="button"
                  >
                    cURL
                  </button>
                  <button
                    onClick={() => setTab("js")}
                    className={`px-2 py-0.5 rounded ${
                      tab === "js"
                        ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm"
                        : "text-gray-500 dark:text-gray-400"
                    }`}
                    type="button"
                  >
                    JavaScript
                  </button>
                </div>
              </div>
              <CodeBlock code={codeExamples[tab]} language={tab === "curl" ? "bash" : "javascript"} />
            </div>

            {endpoint.response && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Code2 className="w-3.5 h-3.5 text-gray-700 dark:text-gray-300" />
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
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
      <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
        {title}
      </h4>
      <div className="border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
            {rows.map((row, i) => (
              <tr key={i} className="hover:bg-gray-50/60 dark:hover:bg-gray-800/30">
                <td className="px-3 py-2.5 align-top w-2/5">
                  <code className="font-mono font-medium text-[12px] text-violet-700 dark:text-violet-300 break-all">
                    {row.name}
                  </code>
                  {row.required && (
                    <span className="ml-1.5 text-[10px] text-rose-600 dark:text-rose-400 font-semibold">
                      required
                    </span>
                  )}
                  <div className="mt-0.5 text-[10.5px] text-gray-500 dark:text-gray-400 font-mono">
                    {row.type}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-gray-600 dark:text-gray-400 leading-relaxed">
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
    } catch {}
  };
  return (
    <div className="relative group rounded-lg bg-slate-900 dark:bg-slate-950 text-slate-100 overflow-hidden ring-1 ring-slate-800">
      <div className="absolute top-2 right-2 z-10">
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
      <div className="px-4 py-2.5 text-[10px] font-mono uppercase tracking-wider text-slate-500 border-b border-slate-800">
        {language}
      </div>
      <pre className="px-4 py-3 text-[12px] font-mono leading-relaxed overflow-x-auto whitespace-pre">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function EmptyResults({ query, onClear }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <Search className="w-10 h-10 text-gray-300 mb-3" />
      <p className="text-base font-semibold text-gray-700 dark:text-gray-300">
        Nada encontrado para "{query}"
      </p>
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
        Tente outra palavra-chave ou método HTTP.
      </p>
      <Button variant="outline" size="sm" onClick={onClear} className="mt-4">
        Limpar busca
      </Button>
    </div>
  );
}
