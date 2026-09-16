import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { ArrowLeftRight, ChevronLeft, ChevronRight, Loader2, Search, Users } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { extractApiError } from "@/utils/apiError";

const MODULES = {
  sales: "Vendas PF",
  sales_pj: "Vendas PJ",
  sales_upsell: "Upsell",
  referral: "Indicações",
};

async function api(path, options) {
  const response = await fetch(`/api/lead-redistribution${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
      ...(options?.headers || {}),
    },
  });
  if (!response.ok) throw new Error(await extractApiError(response, "Erro na redistribuição de leads."));
  return response.json();
}

export default function LeadRedistribution() {
  const location = useLocation();
  const initial = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const [module, setModule] = useState(initial.get("module") || "sales");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [ownerId, setOwnerId] = useState(initial.get("sourceId") || "all");
  const [teamId, setTeamId] = useState("all");
  const [status, setStatus] = useState("all");
  const [data, setData] = useState({ rows: [], total: 0, limit: 25 });
  const [authorizedModules, setAuthorizedModules] = useState([]);
  const [options, setOptions] = useState({ origins: [], destinations: [], teams: [] });
  const [history, setHistory] = useState([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [allFiltered, setAllFiltered] = useState(false);
  const [mode, setMode] = useState("person");
  const [destinationAgentId, setDestinationAgentId] = useState("");
  const [destinationTeamId, setDestinationTeamId] = useState("");
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api("/modules").then(({ modules }) => {
      setAuthorizedModules(modules);
      setModule(current => modules.length && !modules.some(item => item.key === current) ? modules[0].key : current);
    }).catch(error => toast.error(error.message));
  }, []);

  const filters = useMemo(() => ({
    ownerId: ownerId === "all" ? null : ownerId,
    teamId: teamId === "all" ? null : teamId,
    status: status === "all" ? null : status,
    search: search.trim() || null,
  }), [ownerId, teamId, status, search]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ module, page: String(page), limit: "25" });
    Object.entries(filters).forEach(([key, value]) => value && params.set(key, value));
    Promise.all([
      api(`/portfolio?${params}`),
      api(`/options?module=${module}${filters.ownerId ? `&sourceId=${filters.ownerId}` : ""}`),
    ]).then(([portfolio, opts]) => {
      if (!cancelled) {
        setData(portfolio);
        setOptions(opts);
        setDestinationAgentId(current =>
          current && !opts.destinations.some(agent => agent.id === current) ? "" : current
        );
        setDestinationTeamId(current =>
          current && !opts.teams.some(team => team.id === current) ? "" : current
        );
        setLoading(false);
      }
    }).catch(error => {
      if (!cancelled) {
        setLoading(false);
        toast.error(error.message);
      }
    });
    return () => { cancelled = true; };
  }, [module, page, filters]);

  useEffect(() => {
    api(`/history?module=${module}&page=${historyPage}&limit=10`)
      .then(response => {
        setHistory(response.rows || []);
        setHistoryHasMore(response.hasMore);
      })
      .catch(() => setHistory([]));
  }, [module, historyPage, result]);

  useEffect(() => {
    setSelected(new Set());
    setAllFiltered(false);
    setPreview(null);
    setResult(null);
    setHistoryPage(1);
  }, [module, filters]);

  const requestBody = {
    module,
    sourceId: filters.ownerId,
    selection: allFiltered
      ? { type: "allFiltered", filters }
      : { type: "ids", ids: [...selected], filters },
    mode,
    destinationAgentId: mode === "person" ? destinationAgentId : null,
    destinationTeamId: mode === "team" ? destinationTeamId : null,
    reason,
    context: initial.get("context") === "deactivation" ? "deactivation" : "management",
  };

  async function generatePreview() {
    setSubmitting(true);
    try {
      setPreview(await api("/preview", { method: "POST", body: JSON.stringify(requestBody) }));
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function execute() {
    setSubmitting(true);
    try {
      const response = await api("/execute", {
        method: "POST",
        body: JSON.stringify({ previewId: preview.previewId }),
      });
      setResult(response);
      setPreview(null);
      setSelected(new Set());
      setAllFiltered(false);
      toast.success(`${response.count} leads redistribuídos sem falhas.`);
      setPage(1);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  const selectionCount = allFiltered ? data.total : selected.size;
  const totalPages = Math.max(1, Math.ceil(data.total / data.limit));
  const highlighted = initial.get("modules")?.split(",") || [];

  useEffect(() => {
    const requestedModule = initial.get("module");
    if (requestedModule && MODULES[requestedModule]) setModule(requestedModule);
  }, [initial]);

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="h-6 w-6 text-blue-600" />
            <h1 className="text-2xl font-bold">Redistribuição de leads</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Módulo atual: <strong>{MODULES[module]}</strong></p>
        </div>
        <Select value={module} onValueChange={value => { setModule(value); setPage(1); }}>
          <SelectTrigger className="w-full md:w-56"><SelectValue /></SelectTrigger>
          <SelectContent>{authorizedModules.map(({ key, label }) => (
            <SelectItem key={key} value={key}>{label}{highlighted.includes(key) ? " • com carteira" : ""}</SelectItem>
          ))}</SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Filtrar carteira</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Nome ou telefone" /></div>
          <Select value={ownerId} onValueChange={value => { setOwnerId(value); setPage(1); }}><SelectTrigger><SelectValue placeholder="Responsável" /></SelectTrigger><SelectContent><SelectItem value="all">Todos os responsáveis</SelectItem>{options.origins.map(a => <SelectItem key={a.id} value={a.id}>{a.name}{!a.active ? " (inativo)" : ""}</SelectItem>)}</SelectContent></Select>
          <Select value={teamId} onValueChange={value => { setTeamId(value); setPage(1); }}><SelectTrigger><SelectValue placeholder="Equipe" /></SelectTrigger><SelectContent><SelectItem value="all">Todas as equipes permitidas</SelectItem>{options.teams.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select>
          <Select value={status} onValueChange={value => { setStatus(value); setPage(1); }}><SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="all">Todos os status</SelectItem><SelectItem value="active">Ativo</SelectItem><SelectItem value="ativo">Ativo (Indicações)</SelectItem></SelectContent></Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Histórico recente</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {history.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma redistribuição registrada neste módulo.</p> : history.map(item => (
            <div key={item.id} className="grid gap-1 rounded-lg border p-3 text-sm md:grid-cols-5">
              <span>{item.from_agent_name || "Não atribuído"} → <strong>{item.to_agent_name}</strong></span>
              <span>{item.executor_name || item.executor_email || "Sistema"}</span>
              <span>{item.context === "deactivation" ? "Desativação" : "Gestão"}</span>
              <span className="truncate">{item.notes || "Sem motivo informado"}</span>
              <span>{new Date(item.created_at).toLocaleString("pt-BR")}</span>
            </div>
          ))}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" disabled={historyPage === 1} onClick={() => setHistoryPage(page => page - 1)}>Anterior</Button>
            <Button variant="outline" size="sm" disabled={!historyHasMore} onClick={() => setHistoryPage(page => page + 1)}>Próxima</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
            <div className="flex items-center gap-3">
              <Checkbox checked={allFiltered || (data.rows.length > 0 && data.rows.every(row => selected.has(row.id)))} onCheckedChange={checked => {
                setAllFiltered(false);
                setSelected(prev => {
                  const next = new Set(prev);
                  data.rows.forEach(row => checked ? next.add(row.id) : next.delete(row.id));
                  return next;
                });
              }} />
              <span className="text-sm">{selectionCount} selecionados de {data.total}</span>
              {data.total > data.rows.length && <Button variant="link" className="h-auto p-0" onClick={() => { setAllFiltered(true); setSelected(new Set()); }}>Selecionar toda a carteira filtrada</Button>}
            </div>
            {allFiltered && <Badge>Toda a carteira filtrada</Badge>}
          </div>
          {loading ? <div className="flex h-48 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div> : data.rows.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">Nenhum lead encontrado neste filtro.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm"><thead className="bg-muted/50 text-left"><tr><th className="p-3"></th><th className="p-3">Lead</th><th className="p-3">Origem</th><th className="p-3">Responsável</th><th className="p-3">Equipe</th><th className="p-3">Etapa</th></tr></thead>
                <tbody>{data.rows.map(row => <tr key={row.id} className="border-t"><td className="p-3"><Checkbox checked={allFiltered || selected.has(row.id)} disabled={allFiltered} onCheckedChange={checked => setSelected(prev => { const next = new Set(prev); checked ? next.add(row.id) : next.delete(row.id); return next; })} /></td><td className="p-3"><div className="font-medium">{row.name}</div><div className="text-xs text-muted-foreground">{row.phone || "Sem telefone"}</div></td><td className="p-3">{row.source || "Não informada"}</td><td className="p-3">{row.ownerName || "Não atribuído"}</td><td className="p-3">{row.teamName || "Sem equipe"}</td><td className="p-3">{row.stage || row.status}</td></tr>)}</tbody>
              </table>
            </div>
          )}
          <div className="flex items-center justify-end gap-2 border-t p-3"><Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-4 w-4" /></Button><span className="text-sm">Página {page} de {totalPages}</span><Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight className="h-4 w-4" /></Button></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Users className="h-5 w-5" /> Destino e simulação</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <RadioGroup value={mode} onValueChange={setMode} className="flex gap-6"><div className="flex items-center gap-2"><RadioGroupItem value="person" id="person" /><Label htmlFor="person">Uma pessoa</Label></div><div className="flex items-center gap-2"><RadioGroupItem value="team" id="team" /><Label htmlFor="team">Distribuir entre uma equipe</Label></div></RadioGroup>
          {mode === "person" ? <Select value={destinationAgentId} onValueChange={setDestinationAgentId}><SelectTrigger><SelectValue placeholder="Selecione a pessoa ativa" /></SelectTrigger><SelectContent>{options.destinations.map(a => <SelectItem key={a.id} value={a.id}>{a.name} — {a.teamName || "Sem equipe"}</SelectItem>)}</SelectContent></Select> : <Select value={destinationTeamId} onValueChange={setDestinationTeamId}><SelectTrigger><SelectValue placeholder="Selecione a equipe elegível" /></SelectTrigger><SelectContent>{options.teams.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select>}
          <Textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Motivo da redistribuição (opcional)" />
          <Button disabled={!selectionCount || submitting || (mode === "person" ? !destinationAgentId : !destinationTeamId)} onClick={generatePreview}>{submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Simular redistribuição</Button>
          {result && <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-900"><strong>Redistribuição concluída:</strong> {result.summary.map(item => `${item.destinationName}: ${item.count}`).join(" • ")}</div>}
        </CardContent>
      </Card>

      <Dialog open={!!preview} onOpenChange={open => !open && setPreview(null)}><DialogContent><DialogHeader><DialogTitle>Confirmar redistribuição</DialogTitle><DialogDescription>A operação é atômica: se qualquer validação falhar, nenhum lead será alterado.</DialogDescription></DialogHeader>{preview && <div className="space-y-3 text-sm"><p><strong>{preview.count}</strong> leads em <strong>{preview.moduleLabel}</strong>.</p>{preview.summary.map(item => <div key={item.destinationId} className="flex justify-between rounded bg-muted p-3"><span>{item.destinationName}</span><strong>{item.count}</strong></div>)}</div>}<DialogFooter><Button variant="outline" onClick={() => setPreview(null)}>Cancelar</Button><Button disabled={submitting} onClick={execute}>{submitting ? "Redistribuindo..." : "Confirmar"}</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}