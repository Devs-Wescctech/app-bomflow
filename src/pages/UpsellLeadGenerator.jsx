import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import {
  Users, Search, Loader2, CheckCircle2, XCircle, AlertTriangle,
  ArrowLeft, Filter, Database, FileDown, Phone, MapPin, ChevronDown, X, ShieldX,
} from "lucide-react";
import { toast } from "sonner";
import { isUpsellPrivileged } from "@/components/utils/permissions";

const API_BASE = "/api";

function getAuthHeaders() {
  const token = localStorage.getItem("accessToken");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function recordKey(r) {
  return r.cpf || r.telefone || r.nome_titular || JSON.stringify(r);
}

function buildCSV(imported, skipped, errors) {
  const rows = [
    ["status", "lead_id", "nome", "cpf", "telefone", "telefone_2", "duplicata_em", "lead_id_existente", "erro"],
  ];
  for (const r of imported) {
    rows.push(["importado", r.lead_id, r.name, r.cpf, r.phone, r.phone_2 || "", "", "", ""]);
  }
  for (const r of skipped) {
    rows.push([
      "duplicata", "", r.name, r.cpf, r.phone, r.phone_2 || "",
      r.duplicate_source || "", r.existing_lead_id || "", "",
    ]);
  }
  for (const r of errors) {
    rows.push(["erro", "", r.name, "", "", "", "", "", r.error]);
  }
  return rows.map(row => row.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
}

function MultiSelect({ options = [], selected = [], onChange, placeholder, loading, disabled }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filtered = search.trim()
    ? options.filter(o => o.toLowerCase().includes(search.toLowerCase()))
    : options;

  function toggle(val) {
    if (selected.includes(val)) onChange(selected.filter(s => s !== val));
    else onChange([...selected, val]);
  }

  function removeTag(val, e) {
    e.stopPropagation();
    onChange(selected.filter(s => s !== val));
  }

  const label = selected.length === 0
    ? placeholder
    : selected.length <= 3
      ? selected.join(", ")
      : `${selected.length} selecionados`;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled || loading}
        onClick={() => setOpen(v => !v)}
        className={`w-full flex items-center justify-between gap-2 min-h-[40px] px-3 py-2 rounded-md border text-sm text-left transition-colors
          bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700
          hover:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30
          ${disabled || loading ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
      >
        <span className={`flex-1 truncate ${selected.length === 0 ? "text-gray-400" : "text-gray-900 dark:text-gray-100"}`}>
          {loading ? "Carregando..." : label}
        </span>
        {loading
          ? <Loader2 className="w-4 h-4 text-gray-400 animate-spin flex-shrink-0" />
          : <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
        }
      </button>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {selected.map(v => (
            <span key={v} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 text-xs font-medium">
              {v}
              <button type="button" onClick={(e) => removeTag(v, e)} className="hover:text-violet-900 dark:hover:text-white">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[200px] rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg">
          <div className="p-2 border-b border-gray-100 dark:border-gray-800">
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar..."
              className="w-full text-sm px-2 py-1 rounded border border-gray-200 dark:border-gray-700 bg-transparent outline-none focus:ring-1 focus:ring-violet-400 dark:text-gray-100 placeholder-gray-400"
            />
          </div>
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">
                {options.length === 0 ? "Nenhuma opção disponível" : "Nenhum resultado"}
              </p>
            ) : (
              filtered.map(opt => (
                <div
                  key={opt}
                  className="flex items-center gap-2.5 px-3 py-2 hover:bg-violet-50 dark:hover:bg-violet-900/20 cursor-pointer"
                  onClick={() => toggle(opt)}
                >
                  <Checkbox
                    checked={selected.includes(opt)}
                    onCheckedChange={() => toggle(opt)}
                    className="pointer-events-none"
                  />
                  <span className="text-sm text-gray-800 dark:text-gray-200">{opt}</span>
                </div>
              ))
            )}
          </div>
          {selected.length > 0 && (
            <div className="p-2 border-t border-gray-100 dark:border-gray-800">
              <button
                type="button"
                onClick={() => { onChange([]); setSearch(""); }}
                className="w-full text-xs text-gray-500 hover:text-red-500 py-1 transition-colors"
              >
                Limpar seleção ({selected.length})
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AutocompleteTagInput({ values = [], onChange, placeholder, searchField, selectedUfs = [] }) {
  const [inputVal, setInputVal] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [loadingSugg, setLoadingSugg] = useState(false);
  const [open, setOpen] = useState(false);
  const inputRef = useRef(null);
  const containerRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    const q = inputVal.trim();
    if (q.length < 2) { setSuggestions([]); setOpen(false); return; }
    debounceRef.current = setTimeout(async () => {
      setLoadingSugg(true);
      try {
        const params = new URLSearchParams({ quantidade: "500" });
        if (selectedUfs.length > 0) params.set("uf", selectedUfs.join(","));
        if (searchField === "cidade") params.set("cidade", q);
        else params.set("descricao", q);
        const token = localStorage.getItem("accessToken");
        const res = await fetch(`/api/functions/erp-cadastro-pessoas-batch?${params}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        const records = data.records || [];
        const field = searchField === "cidade" ? "cidade" : "descricao";
        const opts = [...new Set(records.map(r => r[field]).filter(Boolean))].sort();
        setSuggestions(opts.filter(o => !values.includes(o)));
        setOpen(opts.length > 0);
      } catch { setSuggestions([]); }
      finally { setLoadingSugg(false); }
    }, 350);
    return () => clearTimeout(debounceRef.current);
  }, [inputVal, selectedUfs, searchField, values]);

  function addValue(v) {
    if (v && !values.includes(v)) onChange([...values, v]);
    setInputVal("");
    setSuggestions([]);
    setOpen(false);
    inputRef.current?.focus();
  }

  function removeValue(v) {
    onChange(values.filter(t => t !== v));
  }

  function handleKeyDown(e) {
    if ((e.key === "Enter" || e.key === ",") && inputVal.trim()) {
      e.preventDefault();
      addValue(inputVal.trim());
    }
    if (e.key === "Escape") { setOpen(false); setInputVal(""); }
    if (e.key === "Backspace" && inputVal === "" && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <div
        className="min-h-[40px] w-full flex flex-wrap gap-1.5 items-center px-3 py-2 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 cursor-text hover:border-violet-400 focus-within:ring-2 focus-within:ring-violet-500/30 transition-colors"
        onClick={() => inputRef.current?.focus()}
      >
        {values.map(v => (
          <span key={v} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 text-xs font-medium flex-shrink-0">
            {v}
            <button type="button" onClick={() => removeValue(v)} className="hover:text-red-500 transition-colors">
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <div className="flex items-center flex-1 min-w-[120px] gap-1">
          <input
            ref={inputRef}
            value={inputVal}
            onChange={e => setInputVal(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => suggestions.length > 0 && setOpen(true)}
            placeholder={values.length === 0 ? placeholder : "Adicionar mais..."}
            className="flex-1 text-sm bg-transparent outline-none text-gray-900 dark:text-gray-100 placeholder-gray-400"
          />
          {loadingSugg && <Loader2 className="w-3.5 h-3.5 text-violet-400 animate-spin flex-shrink-0" />}
        </div>
      </div>

      {open && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg max-h-52 overflow-y-auto">
          {suggestions.map(opt => (
            <div
              key={opt}
              onMouseDown={(e) => { e.preventDefault(); addValue(opt); }}
              className="px-3 py-2 text-sm text-gray-800 dark:text-gray-200 hover:bg-violet-50 dark:hover:bg-violet-900/20 cursor-pointer"
            >
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function UpsellLeadGenerator() {
  const [step, setStep] = useState("filters");
  const [filters, setFilters] = useState({ cidades: [], ufs: [], descricaos: [], quantidade: "200", excluirJaImportados: true });
  const [records, setRecords] = useState([]);
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  const [searching, setSearching] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  const { data: user } = useQuery({ queryKey: ["currentUser"], queryFn: () => base44.auth.me() });

  const { data: allAgents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: () => base44.entities.Agent.list(),
    staleTime: 1000 * 60 * 5,
  });

  const { data: ufData } = useQuery({
    queryKey: ["erpUFOptions"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/functions/erp-cadastro-pessoas-options`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    staleTime: 60 * 60 * 1000,
    retry: 1,
  });

  const ufOptions = ufData?.uf || [];

  const { data: cidadeData, isFetching: loadingCidades } = useQuery({
    queryKey: ["brazilCities", filters.ufs],
    queryFn: async () => {
      if (filters.ufs.length === 0) return { cities: [] };
      const params = new URLSearchParams({ uf: filters.ufs.join(",") });
      const res = await fetch(`${API_BASE}/functions/brazil-cities?${params}`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    enabled: filters.ufs.length > 0,
    staleTime: 24 * 60 * 60 * 1000,
    retry: 1,
    keepPreviousData: true,
  });

  const cidadeOptions = cidadeData?.cities || [];

  const { data: produtoData, isFetching: loadingProdutos } = useQuery({
    queryKey: ["erpPlanos"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/functions/erp-planos`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    staleTime: 24 * 60 * 60 * 1000,
    retry: 1,
  });

  const produtoOptions = produtoData?.planos || [];

  const currentAgent = user?.agent || allAgents.find(a => a.userEmail === user?.email || a.user_email === user?.email || a.email === user?.email);
  const isPrivileged = isUpsellPrivileged(user, currentAgent);
  const allowedSubmenus = currentAgent?.allowedSubmenus || [];
  const hasAccess = isPrivileged || allowedSubmenus.includes('UpsellLeadGenerator');

  if (user && !hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <ShieldX className="w-16 h-16 text-gray-400 mb-4" />
        <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">Acesso Negado</h2>
        <p className="text-gray-500 dark:text-gray-400">Você não tem permissão para acessar o Gerador de Leads.</p>
      </div>
    );
  }

  async function handleSearch() {
    setSearching(true);
    try {
      const params = new URLSearchParams();
      if (filters.cidades.length > 0) params.set("cidade", filters.cidades.join(","));
      if (filters.ufs.length > 0) params.set("uf", filters.ufs.join(","));
      if (filters.descricaos.length > 0) params.set("descricao", filters.descricaos.join(","));
      if (filters.quantidade) params.set("quantidade", filters.quantidade);
      params.set("excludeImported", filters.excluirJaImportados ? "true" : "false");
      const res = await fetch(`${API_BASE}/functions/erp-cadastro-pessoas-batch?${params.toString()}`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const recs = data.records || [];
      setRecords(recs);
      setSelectedKeys(new Set(recs.map(recordKey)));
      setStep("preview");
      toast.success(`${recs.length} pessoa(s) encontrada(s).`);
    } catch (err) {
      toast.error("Erro ao buscar dados do ERP: " + err.message);
    } finally {
      setSearching(false);
    }
  }

  function toggleSelect(key) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectAll() { setSelectedKeys(new Set(records.map(recordKey))); }
  function deselectAll() { setSelectedKeys(new Set()); }

  const selectedRecords = records.filter((r) => selectedKeys.has(recordKey(r)));

  async function handleImport() {
    if (selectedRecords.length === 0) { toast.error("Selecione ao menos um lead para importar."); return; }
    setShowConfirmDialog(false);
    setImporting(true);
    setStep("importing");
    try {
      const res = await fetch(`${API_BASE}/functions/upsell-lead-generator-import`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ leads: selectedRecords }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const result = await res.json();
      setImportResult(result);
      setStep("done");
      toast.success(
        `Importação concluída: ${result.summary.imported} importados, ${result.summary.skipped} duplicatas.`
      );
    } catch (err) {
      toast.error("Erro na importação: " + err.message);
      setStep("preview");
    } finally {
      setImporting(false);
    }
  }

  function downloadCSV() {
    if (!importResult) return;
    const csv = buildCSV(importResult.imported, importResult.skipped, importResult.errors);
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gerador_leads_upsell_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function resetAll() {
    setStep("filters");
    setRecords([]);
    setSelectedKeys(new Set());
    setImportResult(null);
    setFilters({ cidades: [], ufs: [], descricaos: [], quantidade: "200", excluirJaImportados: true });
  }

  const hasFilters = filters.cidades.length > 0 || filters.ufs.length > 0 || filters.descricaos.length > 0;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-4 md:p-6">
      <div className="max-w-6xl mx-auto space-y-6">

        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow">
                <Users className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Gerador de Leads</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">Importe leads do ERP para o pipeline Upsell</p>
              </div>
            </div>
          </div>
          {step !== "filters" && (
            <Button variant="outline" size="sm" onClick={resetAll} className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Nova busca
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2 text-sm">
          {["filters", "preview", "importing", "done"].map((s, i) => {
            const labels = ["Filtros", "Preview", "Importando", "Resultado"];
            const active = s === step;
            const done =
              (s === "filters" && ["preview", "importing", "done"].includes(step)) ||
              (s === "preview" && ["importing", "done"].includes(step)) ||
              (s === "importing" && step === "done");
            return (
              <div key={s} className="flex items-center gap-2">
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  active ? "bg-violet-600 text-white" :
                  done ? "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300" :
                  "bg-gray-100 text-gray-400 dark:bg-gray-800"
                }`}>
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center text-xs ${
                    active ? "bg-white/20" : done ? "bg-violet-200 dark:bg-violet-800" : "bg-gray-200 dark:bg-gray-700"
                  }`}>{i + 1}</span>
                  {labels[i]}
                </div>
                {i < 3 && <div className="w-6 h-px bg-gray-200 dark:bg-gray-700" />}
              </div>
            );
          })}
        </div>

        {step === "filters" && (
          <Card className="border-violet-200 dark:border-violet-900">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-violet-700 dark:text-violet-300">
                <Filter className="w-5 h-5" />
                Filtros de Busca
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">

                <div className="space-y-2">
                  <Label className="font-medium text-gray-700 dark:text-gray-300">
                    UF
                    {filters.ufs.length > 0 && (
                      <span className="ml-2 text-xs text-violet-600 font-normal">{filters.ufs.length} selecionado(s)</span>
                    )}
                  </Label>
                  <MultiSelect
                    options={ufOptions}
                    selected={filters.ufs}
                    onChange={(v) => setFilters(f => ({ ...f, ufs: v }))}
                    placeholder="Selecione o(s) estado(s)"
                    loading={false}
                  />
                  <p className="text-xs text-gray-400">Ex: SP, MG, RJ</p>
                </div>

                <div className="space-y-2">
                  <Label className="font-medium text-gray-700 dark:text-gray-300">
                    Cidade
                    {filters.cidades.length > 0 && (
                      <span className="ml-2 text-xs text-violet-600 font-normal">{filters.cidades.length} cidade(s)</span>
                    )}
                  </Label>
                  <MultiSelect
                    options={cidadeOptions}
                    selected={filters.cidades}
                    onChange={(v) => setFilters(f => ({ ...f, cidades: v }))}
                    placeholder={
                      filters.ufs.length === 0
                        ? "Selecione a UF primeiro"
                        : loadingCidades
                          ? "Carregando cidades..."
                          : cidadeOptions.length === 0
                            ? "Nenhuma cidade encontrada"
                            : "Selecione a(s) cidade(s)"
                    }
                    loading={loadingCidades}
                    disabled={filters.ufs.length === 0}
                  />
                  <p className="text-xs text-gray-400">
                    {filters.ufs.length === 0
                      ? "Selecione ao menos uma UF para ver as cidades"
                      : `${cidadeOptions.length} cidade(s) disponível(is)`}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="font-medium text-gray-700 dark:text-gray-300">
                    Produto / Plano
                    {filters.descricaos.length > 0 && (
                      <span className="ml-2 text-xs text-violet-600 font-normal">{filters.descricaos.length} plano(s)</span>
                    )}
                  </Label>
                  <MultiSelect
                    options={produtoOptions}
                    selected={filters.descricaos}
                    onChange={(v) => setFilters(f => ({ ...f, descricaos: v }))}
                    placeholder={
                      loadingProdutos
                        ? "Carregando planos..."
                        : produtoOptions.length === 0
                          ? "Nenhum plano disponível"
                          : "Selecione o(s) plano(s)"
                    }
                    loading={loadingProdutos}
                  />
                  <p className="text-xs text-gray-400">
                    {loadingProdutos ? "Buscando planos..." : `${produtoOptions.length} plano(s) disponível(is)`}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="font-medium text-gray-700 dark:text-gray-300">Quantidade máxima</Label>
                  <Input
                    type="number"
                    min={1}
                    max={2000}
                    value={filters.quantidade}
                    onChange={(e) => setFilters((f) => ({ ...f, quantidade: e.target.value }))}
                    placeholder="200"
                    className="bg-white dark:bg-gray-900"
                  />
                  <p className="text-xs text-gray-400">Máx. 2000 registros</p>
                </div>
              </div>

              <div className="flex items-center justify-between px-1 py-2 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="excluirJaImportados"
                    checked={filters.excluirJaImportados}
                    onCheckedChange={(v) => setFilters(f => ({ ...f, excluirJaImportados: !!v }))}
                  />
                  <Label htmlFor="excluirJaImportados" className="cursor-pointer text-sm text-gray-700 dark:text-gray-300 font-normal">
                    Ocultar leads já importados anteriormente
                  </Label>
                </div>
                {!filters.excluirJaImportados && (
                  <span className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded-full">
                    Mostrando todos — importados aparecerão marcados
                  </span>
                )}
              </div>

              {!hasFilters && (
                <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  Selecione ao menos um filtro (UF, Cidade ou Produto) para evitar timeout na busca.
                </div>
              )}

              <div className="flex items-center gap-3 pt-2">
                <Button
                  onClick={handleSearch}
                  disabled={searching || !hasFilters}
                  className="bg-violet-600 hover:bg-violet-700 text-white gap-2 disabled:opacity-50"
                >
                  {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  {searching ? "Buscando..." : "Buscar Leads"}
                </Button>
                {hasFilters && (
                  <Button variant="ghost" size="sm" onClick={() => setFilters(f => ({ ...f, cidades: [], ufs: [], descricaos: [] }))}>
                    Limpar filtros
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {step === "preview" && (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Badge variant="secondary" className="bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 text-sm px-3 py-1">
                  {records.length} encontrados
                </Badge>
                <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 text-sm px-3 py-1">
                  {selectedKeys.size} selecionados
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={selectAll}>Selecionar todos</Button>
                <Button variant="ghost" size="sm" onClick={deselectAll}>Desmarcar todos</Button>
                <Button
                  onClick={() => setShowConfirmDialog(true)}
                  disabled={selectedKeys.size === 0}
                  className="bg-violet-600 hover:bg-violet-700 text-white gap-2"
                >
                  <Database className="w-4 h-4" />
                  Importar {selectedKeys.size} leads
                </Button>
              </div>
            </div>

            <Card>
              <div className="overflow-auto max-h-[60vh]">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 z-10">
                    <tr>
                      <th className="w-10 px-3 py-3">
                        <Checkbox
                          checked={selectedKeys.size === records.length && records.length > 0}
                          onCheckedChange={(v) => v ? selectAll() : deselectAll()}
                        />
                      </th>
                      <th className="text-left px-3 py-3 font-semibold text-gray-700 dark:text-gray-300">Nome</th>
                      <th className="text-left px-3 py-3 font-semibold text-gray-700 dark:text-gray-300">CPF</th>
                      <th className="text-left px-3 py-3 font-semibold text-gray-700 dark:text-gray-300">Telefone</th>
                      <th className="text-left px-3 py-3 font-semibold text-gray-700 dark:text-gray-300">Telefone 2</th>
                      <th className="text-left px-3 py-3 font-semibold text-gray-700 dark:text-gray-300">Cidade / UF</th>
                      <th className="text-left px-3 py-3 font-semibold text-gray-700 dark:text-gray-300">Plano</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {records.map((r, idx) => {
                      const key = recordKey(r);
                      const checked = selectedKeys.has(key);
                      return (
                        <tr
                          key={key + idx}
                          className={`hover:bg-violet-50/50 dark:hover:bg-violet-900/10 cursor-pointer transition-colors ${
                            checked ? "bg-violet-50/30 dark:bg-violet-900/5" : ""
                          }`}
                          onClick={() => toggleSelect(key)}
                        >
                          <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                            <Checkbox checked={checked} onCheckedChange={() => toggleSelect(key)} />
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center flex-shrink-0">
                                <span className="text-xs font-semibold text-violet-700 dark:text-violet-300">
                                  {(r.nome_titular || "?").charAt(0).toUpperCase()}
                                </span>
                              </div>
                              <span className="font-medium text-gray-900 dark:text-gray-100 truncate max-w-[180px]">
                                {r.nome_titular || "-"}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-gray-600 dark:text-gray-400 font-mono text-xs">
                            {r.cpf || "-"}
                          </td>
                          <td className="px-3 py-2.5 text-gray-700 dark:text-gray-300">
                            <div className="flex items-center gap-1">
                              <Phone className="w-3 h-3 text-gray-400 flex-shrink-0" />
                              {r.telefone || "-"}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-gray-500 dark:text-gray-400">
                            {r.telefone_2 || "-"}
                          </td>
                          <td className="px-3 py-2.5 text-gray-600 dark:text-gray-400">
                            <div className="flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-gray-400 flex-shrink-0" />
                              {[r.cidade, r.uf].filter(Boolean).join(" / ") || "-"}
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex flex-col gap-1">
                              {r.descricao === "SEM CONTRATO" ? (
                                <Badge variant="outline" className="text-xs border-orange-300 text-orange-600 dark:border-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20">
                                  SEM CONTRATO
                                </Badge>
                              ) : r.descricao ? (
                                <Badge variant="outline" className="text-xs border-violet-300 text-violet-700 dark:text-violet-300">
                                  {r.descricao}
                                </Badge>
                              ) : "-"}
                              {r.already_imported && (
                                <Badge variant="outline" className="text-xs border-sky-300 text-sky-600 dark:border-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-900/20">
                                  Importado {new Date(r.imported_at).toLocaleDateString("pt-BR")}
                                </Badge>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {records.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                    <Users className="w-12 h-12 mb-3 opacity-30" />
                    <p>Nenhum resultado encontrado.</p>
                  </div>
                )}
              </div>
            </Card>
          </>
        )}

        {step === "importing" && (
          <Card className="border-violet-200 dark:border-violet-900">
            <CardContent className="py-16 flex flex-col items-center gap-6">
              <div className="w-16 h-16 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-violet-600 animate-spin" />
              </div>
              <div className="text-center">
                <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">Importando leads...</p>
                <p className="text-sm text-gray-500 mt-1">
                  Processando {selectedRecords.length} registro(s). Por favor aguarde.
                </p>
              </div>
              <div className="w-full max-w-sm">
                <Progress value={null} className="h-2 bg-violet-100 dark:bg-violet-900/30" />
              </div>
            </CardContent>
          </Card>
        )}

        {step === "done" && importResult && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="border-violet-200">
                <CardContent className="pt-6 text-center">
                  <p className="text-3xl font-bold text-violet-700">{importResult.summary.total}</p>
                  <p className="text-sm text-gray-500 mt-1">Total processado</p>
                </CardContent>
              </Card>
              <Card className="border-green-200">
                <CardContent className="pt-6 text-center">
                  <p className="text-3xl font-bold text-green-600">{importResult.summary.imported}</p>
                  <p className="text-sm text-gray-500 mt-1">Importados</p>
                </CardContent>
              </Card>
              <Card className="border-yellow-200">
                <CardContent className="pt-6 text-center">
                  <p className="text-3xl font-bold text-yellow-600">{importResult.summary.skipped}</p>
                  <p className="text-sm text-gray-500 mt-1">Duplicatas (puladas)</p>
                </CardContent>
              </Card>
              <Card className="border-red-200">
                <CardContent className="pt-6 text-center">
                  <p className="text-3xl font-bold text-red-500">{importResult.summary.errors}</p>
                  <p className="text-sm text-gray-500 mt-1">Erros</p>
                </CardContent>
              </Card>
            </div>

            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Resultado da importação</h2>
              <Button onClick={downloadCSV} className="gap-2 bg-violet-600 hover:bg-violet-700 text-white">
                <FileDown className="w-4 h-4" />
                Exportar CSV
              </Button>
            </div>

            <Card>
              <div className="overflow-auto max-h-[55vh]">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                    <tr>
                      <th className="text-left px-3 py-3 font-semibold text-gray-700 dark:text-gray-300">Status</th>
                      <th className="text-left px-3 py-3 font-semibold text-gray-700 dark:text-gray-300">Nome</th>
                      <th className="text-left px-3 py-3 font-semibold text-gray-700 dark:text-gray-300">CPF</th>
                      <th className="text-left px-3 py-3 font-semibold text-gray-700 dark:text-gray-300">Telefone</th>
                      <th className="text-left px-3 py-3 font-semibold text-gray-700 dark:text-gray-300">Telefone 2</th>
                      <th className="text-left px-3 py-3 font-semibold text-gray-700 dark:text-gray-300">Lead ID</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {importResult.imported.map((r) => (
                      <tr key={r.lead_id} className="bg-green-50/30 dark:bg-green-900/5">
                        <td className="px-3 py-2.5">
                          <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 gap-1 text-xs">
                            <CheckCircle2 className="w-3 h-3" /> Importado
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5 font-medium text-gray-900 dark:text-gray-100">{r.name}</td>
                        <td className="px-3 py-2.5 font-mono text-xs text-gray-600 dark:text-gray-400">{r.cpf || "-"}</td>
                        <td className="px-3 py-2.5 text-gray-700 dark:text-gray-300">{r.phone || "-"}</td>
                        <td className="px-3 py-2.5 text-gray-500 dark:text-gray-400">{r.phone_2 || "-"}</td>
                        <td className="px-3 py-2.5 font-mono text-xs text-violet-600 dark:text-violet-400">{r.lead_id}</td>
                      </tr>
                    ))}
                    {importResult.skipped.map((r, i) => (
                      <tr key={"skip" + i} className="bg-yellow-50/30 dark:bg-yellow-900/5">
                        <td className="px-3 py-2.5">
                          <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300 gap-1 text-xs">
                            <AlertTriangle className="w-3 h-3" /> Duplicata
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5 font-medium text-gray-900 dark:text-gray-100">{r.name}</td>
                        <td className="px-3 py-2.5 font-mono text-xs text-gray-600 dark:text-gray-400">{r.cpf || "-"}</td>
                        <td className="px-3 py-2.5 text-gray-700 dark:text-gray-300">{r.phone || "-"}</td>
                        <td className="px-3 py-2.5 text-gray-500 dark:text-gray-400">{r.phone_2 || "-"}</td>
                        <td className="px-3 py-2.5 font-mono text-xs text-gray-400">{r.existing_lead_id || "-"}</td>
                      </tr>
                    ))}
                    {importResult.errors.map((r, i) => (
                      <tr key={"err" + i} className="bg-red-50/30 dark:bg-red-900/5">
                        <td className="px-3 py-2.5">
                          <Badge className="bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300 gap-1 text-xs">
                            <XCircle className="w-3 h-3" /> Erro
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5 font-medium text-gray-900 dark:text-gray-100" colSpan={4}>{r.name}</td>
                        <td className="px-3 py-2.5 text-xs text-red-500">{r.error}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <div className="flex justify-center">
              <Button variant="outline" onClick={resetAll} className="gap-2">
                <ArrowLeft className="w-4 h-4" />
                Nova busca
              </Button>
            </div>
          </>
        )}

        <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirmar importação</DialogTitle>
              <DialogDescription>
                Você está prestes a importar <strong>{selectedKeys.size} leads</strong> para o pipeline Upsell.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <p className="text-xs text-gray-500">Leads já existentes no sistema serão ignorados automaticamente (deduplicação por CPF/telefone).</p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>Cancelar</Button>
              <Button
                onClick={handleImport}
                className="bg-violet-600 hover:bg-violet-700 text-white"
              >
                Confirmar importação
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </div>
  );
}
