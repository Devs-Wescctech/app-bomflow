import { useState, useEffect } from "react";
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
  ArrowLeft, Filter, Database, FileDown, Phone, User, MapPin,
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

export default function UpsellLeadGenerator() {
  const [step, setStep] = useState("filters");
  const [filters, setFilters] = useState({ cidade: "", uf: "", descricao: "", quantidade: "200" });
  const [records, setRecords] = useState([]);
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  const [searching, setSearching] = useState(false);
  const [agentId, setAgentId] = useState("");
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  const { data: user } = useQuery({ queryKey: ["currentUser"], queryFn: () => base44.auth.me() });
  const { data: agents = [] } = useQuery({
    queryKey: ["salesAgentsForUpsellGen"],
    queryFn: () => base44.entities.SalesAgent.list(),
  });
  const activeAgents = agents.filter((a) => a.active !== false);

  const currentAgent = user?.agent;
  const isPrivileged = isUpsellPrivileged(user, currentAgent);
  const canSelectAgent = isPrivileged;

  useEffect(() => {
    if (user && !canSelectAgent && !agentId) {
      const mine = activeAgents.find((a) => a.email === user.email);
      if (mine) setAgentId(mine.id);
    }
  }, [user, activeAgents, canSelectAgent, agentId]);

  async function handleSearch() {
    setSearching(true);
    try {
      const params = new URLSearchParams();
      if (filters.cidade.trim()) params.set("cidade", filters.cidade.trim());
      if (filters.uf.trim()) params.set("uf", filters.uf.trim());
      if (filters.descricao.trim()) params.set("descricao", filters.descricao.trim());
      if (filters.quantidade) params.set("quantidade", filters.quantidade);
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

  function selectAll() {
    setSelectedKeys(new Set(records.map(recordKey)));
  }

  function deselectAll() {
    setSelectedKeys(new Set());
  }

  const selectedRecords = records.filter((r) => selectedKeys.has(recordKey(r)));

  async function handleImport() {
    if (!agentId) {
      toast.error("Selecione um agente responsável.");
      return;
    }
    if (selectedRecords.length === 0) {
      toast.error("Selecione ao menos um lead para importar.");
      return;
    }
    setShowConfirmDialog(false);
    setImporting(true);
    setStep("importing");
    try {
      const res = await fetch(`${API_BASE}/functions/upsell-lead-generator-import`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ leads: selectedRecords, agent_id: agentId }),
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
    setFilters({ cidade: "", uf: "", descricao: "", quantidade: "200" });
  }

  const selectedAgentName = activeAgents.find((a) => a.id === agentId)?.name;

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
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label>Cidade</Label>
                  <Input
                    value={filters.cidade}
                    onChange={(e) => setFilters((f) => ({ ...f, cidade: e.target.value }))}
                    placeholder="Ex: São Paulo"
                    className="bg-white dark:bg-gray-900"
                  />
                  <p className="text-xs text-gray-400">Deixe em branco para todas</p>
                </div>

                <div className="space-y-2">
                  <Label>UF</Label>
                  <Input
                    value={filters.uf}
                    onChange={(e) => setFilters((f) => ({ ...f, uf: e.target.value.toUpperCase().slice(0, 2) }))}
                    placeholder="Ex: SP"
                    maxLength={2}
                    className="bg-white dark:bg-gray-900"
                  />
                  <p className="text-xs text-gray-400">Sigla do estado</p>
                </div>

                <div className="space-y-2">
                  <Label>Produto / Plano</Label>
                  <Input
                    value={filters.descricao}
                    onChange={(e) => setFilters((f) => ({ ...f, descricao: e.target.value }))}
                    placeholder="Ex: Internet 100MB"
                    className="bg-white dark:bg-gray-900"
                  />
                  <p className="text-xs text-gray-400">Deixe em branco para todos</p>
                </div>

                <div className="space-y-2">
                  <Label>Quantidade máxima</Label>
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

              <div className="flex items-center gap-3 pt-2">
                <Button
                  onClick={handleSearch}
                  disabled={searching}
                  className="bg-violet-600 hover:bg-violet-700 text-white gap-2"
                >
                  {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  {searching ? "Buscando..." : "Buscar Leads"}
                </Button>
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
                            {r.descricao ? (
                              <Badge variant="outline" className="text-xs border-violet-300 text-violet-700 dark:text-violet-300">
                                {r.descricao}
                              </Badge>
                            ) : "-"}
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
                        <td className="px-3 py-2.5 text-gray-700 dark:text-gray-300">{r.name}</td>
                        <td className="px-3 py-2.5 font-mono text-xs text-gray-600 dark:text-gray-400">{r.cpf || "-"}</td>
                        <td className="px-3 py-2.5 text-gray-500">{r.phone || "-"}</td>
                        <td className="px-3 py-2.5 text-gray-500">{r.phone_2 || "-"}</td>
                        <td className="px-3 py-2.5 font-mono text-xs text-gray-400">
                          {r.existing_lead_id ? (
                            <span title={`Já existe em: ${r.duplicate_source}`}>{r.existing_lead_id}</span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {importResult.errors.map((r, i) => (
                      <tr key={"err" + i} className="bg-red-50/30 dark:bg-red-900/5">
                        <td className="px-3 py-2.5">
                          <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 gap-1 text-xs">
                            <XCircle className="w-3 h-3" /> Erro
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5 text-gray-700 dark:text-gray-300">{r.name}</td>
                        <td className="px-3 py-2.5 text-xs text-red-500 dark:text-red-400" colSpan={4}>{r.error}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </div>

      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Database className="w-5 h-5 text-violet-600" />
              Confirmar importação
            </DialogTitle>
            <DialogDescription>
              Os leads serão criados no pipeline Upsell com as mesmas regras do Novo Lead.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="bg-violet-50 dark:bg-violet-900/20 rounded-lg p-4 border border-violet-200 dark:border-violet-800 space-y-1 text-sm">
              <p className="font-semibold text-violet-800 dark:text-violet-300">Resumo</p>
              <p className="text-gray-600 dark:text-gray-400">
                <span className="font-medium text-gray-800 dark:text-gray-200">{selectedKeys.size}</span> lead(s) selecionados para importação
              </p>
              <p className="text-xs text-gray-500">Duplicatas serão puladas automaticamente e incluídas na exportação.</p>
            </div>

            {canSelectAgent && (
              <div className="space-y-2">
                <Label>
                  Agente responsável <span className="text-red-500">*</span>
                </Label>
                <Select value={agentId} onValueChange={setAgentId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um agente" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeAgents.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        <div className="flex items-center gap-2">
                          {a.photo_url && <img src={a.photo_url} alt={a.name} className="w-5 h-5 rounded-full object-cover" />}
                          <span>{a.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {agentId && (
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
                <User className="w-4 h-4 text-violet-500" />
                <span>Agente: <span className="font-medium text-gray-900 dark:text-gray-100">{selectedAgentName}</span></span>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>Cancelar</Button>
            <Button
              onClick={handleImport}
              disabled={!agentId}
              className="bg-violet-600 hover:bg-violet-700 text-white gap-2"
            >
              <Database className="w-4 h-4" />
              Importar {selectedKeys.size} leads
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
