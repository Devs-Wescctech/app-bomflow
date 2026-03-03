import { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import {
  Search, Filter, Loader2, Users, ChevronDown, ChevronUp,
  AlertTriangle, Phone, MapPin, Package, FileText,
  MessageSquare, CheckCircle2, XCircle, Send, X, RefreshCw
} from "lucide-react";
import { toast } from "sonner";

const API_BASE = '/api';
const MAX_LEADS = 1000;

function getAuthHeaders() {
  const token = localStorage.getItem('accessToken');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

export default function LeadGenerator() {
  const [leads, setLeads] = useState([]);
  const [totalFound, setTotalFound] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [hasSearched, setHasSearched] = useState(false);

  const [filterOptions, setFilterOptions] = useState({
    canal: [],
    cidade: [],
    uf: [],
    produto: [],
    situacao_contrato: [],
  });

  const [filters, setFilters] = useState({
    canal: "todos",
    cidade: "todos",
    uf: "todos",
    produto: "todos",
    situacao_contrato: "todos",
  });

  const [selectedLeads, setSelectedLeads] = useState(new Set());
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showResultDialog, setShowResultDialog] = useState(false);
  const [sendProgress, setSendProgress] = useState({ current: 0, total: 0 });
  const [sendResults, setSendResults] = useState(null);
  const [leadStatuses, setLeadStatuses] = useState({});

  useEffect(() => {
    loadFilterOptions();
  }, []);

  async function loadFilterOptions(forceRefresh = false) {
    setLoadingOptions(true);
    try {
      const url = forceRefresh
        ? `${API_BASE}/functions/lead-generator-options?refresh=true`
        : `${API_BASE}/functions/lead-generator-options`;
      const res = await fetch(url, {
        headers: { ...getAuthHeaders() },
      });
      if (!res.ok) throw new Error(`Erro ao carregar opções (${res.status})`);
      const data = await res.json();

      if (data.success === false) {
        throw new Error(data.error || 'Erro desconhecido');
      }

      const opts = {
        canal: Array.isArray(data.canal) ? data.canal : [],
        cidade: Array.isArray(data.cidade) ? data.cidade : [],
        uf: Array.isArray(data.uf) ? data.uf : [],
        produto: Array.isArray(data.produto) ? data.produto : [],
        situacao_contrato: Array.isArray(data.situacao_contrato) ? data.situacao_contrato : [],
      };

      setFilterOptions(opts);

      const totalOpts = opts.canal.length + opts.cidade.length + opts.uf.length + opts.produto.length + opts.situacao_contrato.length;
      if (totalOpts < 5 && !forceRefresh) {
        toast.info('Poucas opções carregadas. Clique em "Recarregar Filtros" para atualizar.');
      }
      if (forceRefresh) {
        toast.success(`Filtros recarregados: ${opts.canal.length} canais, ${opts.cidade.length} cidades, ${opts.uf.length} UFs, ${opts.produto.length} produtos`);
      }
    } catch (e) {
      console.error('Erro ao carregar opções de filtro:', e);
      toast.error('Erro ao carregar opções de filtro. Tente recarregar a página.');
    } finally {
      setLoadingOptions(false);
    }
  }

  async function handleSearch(e) {
    e?.preventDefault();
    setLoading(true);
    setHasSearched(true);
    setSelectedLeads(new Set());
    setLeadStatuses({});
    setSendResults(null);
    try {
      const params = new URLSearchParams();
      if (filters.canal !== 'todos') params.set('canal', filters.canal);
      if (filters.cidade !== 'todos') params.set('cidade', filters.cidade);
      if (filters.uf !== 'todos') params.set('uf', filters.uf);
      if (filters.produto !== 'todos') params.set('produto', filters.produto);
      if (filters.situacao_contrato !== 'todos') params.set('situacao_contrato', filters.situacao_contrato);

      const res = await fetch(`${API_BASE}/functions/lead-generator-base?${params.toString()}`, {
        headers: { ...getAuthHeaders() },
      });
      if (!res.ok) throw new Error('Erro ao buscar leads');
      const data = await res.json();
      const allData = Array.isArray(data) ? data : [];

      setTotalFound(allData.length);
      setLeads(allData.slice(0, MAX_LEADS));
    } catch (err) {
      console.error('Erro ao buscar leads:', err);
      toast.error('Erro ao buscar leads: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleClearFilters() {
    setFilters({
      canal: "todos",
      cidade: "todos",
      uf: "todos",
      produto: "todos",
      situacao_contrato: "todos",
    });
    setLeads([]);
    setTotalFound(0);
    setHasSearched(false);
    setSelectedLeads(new Set());
    setLeadStatuses({});
    setSendResults(null);
  }

  const hasActiveFilters = Object.values(filters).some(v => v !== "todos");

  const toggleSelectAll = useCallback(() => {
    if (selectedLeads.size === leads.length) {
      setSelectedLeads(new Set());
    } else {
      setSelectedLeads(new Set(leads.map((_, i) => i)));
    }
  }, [leads, selectedLeads.size]);

  const toggleSelectLead = useCallback((index) => {
    setSelectedLeads(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  const selectedLeadsList = useMemo(() => {
    return Array.from(selectedLeads).map(i => leads[i]).filter(Boolean);
  }, [selectedLeads, leads]);

  const leadsWithNumber = useMemo(() => {
    return selectedLeadsList.filter(l => l.number);
  }, [selectedLeadsList]);

  function handleWhatsAppClick() {
    if (leadsWithNumber.length === 0) {
      toast.error('Nenhum lead selecionado com número de telefone válido.');
      return;
    }
    setShowConfirmDialog(true);
  }

  async function handleConfirmSend() {
    setShowConfirmDialog(false);
    setSendingWhatsApp(true);
    setSendProgress({ current: 0, total: leadsWithNumber.length });

    try {
      const res = await fetch(`${API_BASE}/functions/lead-generator-whatsapp-send`, {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          leads: leadsWithNumber.map(l => ({ number: l.number, name: l.name })),
          filtersUsed: filters,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Erro HTTP ${res.status}`);
      }

      const data = await res.json();

      if (data.results) {
        const statusMap = {};
        data.results.forEach(r => {
          statusMap[String(r.number)] = {
            success: r.success,
            error: r.error,
            messageSentId: r.messageSentId,
          };
        });
        setLeadStatuses(prev => ({ ...prev, ...statusMap }));
      }

      setSendResults(data.summary);
      setSendProgress({ current: data.summary?.total || 0, total: data.summary?.total || 0 });
      setShowResultDialog(true);

      if (data.summary?.sent > 0) {
        toast.success(`${data.summary.sent} mensagen${data.summary.sent !== 1 ? 's' : ''} enviada${data.summary.sent !== 1 ? 's' : ''} com sucesso!`);
      }
      if (data.summary?.failed > 0) {
        toast.error(`${data.summary.failed} mensagen${data.summary.failed !== 1 ? 's' : ''} falharam.`);
      }
    } catch (err) {
      console.error('Erro ao enviar WhatsApp:', err);
      toast.error('Erro ao disparar mensagens: ' + err.message);
    } finally {
      setSendingWhatsApp(false);
    }
  }

  const situacaoLabel = (s) => {
    if (!s) return '-';
    switch (s.toUpperCase()) {
      case 'A': return 'Ativo';
      case 'C': return 'Cancelado';
      case 'S': return 'Suspenso';
      default: return s;
    }
  };

  const situacaoColor = (s) => {
    if (!s) return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
    switch (s.toUpperCase()) {
      case 'A': return 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/50 dark:text-emerald-300';
      case 'C': return 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/50 dark:text-red-300';
      case 'S': return 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/50 dark:text-amber-300';
      default: return 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/50 dark:text-blue-300';
    }
  };

  const getLeadStatus = (lead) => {
    if (!lead.number) return null;
    return leadStatuses[String(lead.number)] || null;
  };

  return (
    <div className="p-4 md:p-6 space-y-6 bg-gray-50 dark:bg-gray-950 min-h-screen">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 shadow-lg">
              <Users className="w-5 h-5 text-white" />
            </div>
            Gerador de Leads
          </CardTitle>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Consulte a base do ERP e gere leads filtrados por canal, cidade, UF, produto e situação.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <button
              type="button"
              onClick={() => setFiltersOpen(!filtersOpen)}
              className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
            >
              <Filter className="w-4 h-4" />
              Filtros
              {filtersOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              {hasActiveFilters && (
                <Badge variant="secondary" className="ml-1 text-xs">
                  {Object.values(filters).filter(v => v !== "todos").length}
                </Badge>
              )}
            </button>
          </div>

          {filtersOpen && (
            <form onSubmit={handleSearch} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Canal</Label>
                  <Select value={filters.canal} onValueChange={(val) => setFilters({ ...filters, canal: val })}>
                    <SelectTrigger className="border-gray-200 dark:border-gray-700">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos</SelectItem>
                      {filterOptions.canal.map(c => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Cidade</Label>
                  <Select value={filters.cidade} onValueChange={(val) => setFilters({ ...filters, cidade: val })}>
                    <SelectTrigger className="border-gray-200 dark:border-gray-700">
                      <SelectValue placeholder="Todas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todas</SelectItem>
                      {filterOptions.cidade.map(c => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">UF</Label>
                  <Select value={filters.uf} onValueChange={(val) => setFilters({ ...filters, uf: val })}>
                    <SelectTrigger className="border-gray-200 dark:border-gray-700">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos</SelectItem>
                      {filterOptions.uf.map(u => (
                        <SelectItem key={u} value={u}>{u}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Produto</Label>
                  <Select value={filters.produto} onValueChange={(val) => setFilters({ ...filters, produto: val })}>
                    <SelectTrigger className="border-gray-200 dark:border-gray-700">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos</SelectItem>
                      {filterOptions.produto.map(p => (
                        <SelectItem key={p} value={p}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Situação Contrato</Label>
                  <Select value={filters.situacao_contrato} onValueChange={(val) => setFilters({ ...filters, situacao_contrato: val })}>
                    <SelectTrigger className="border-gray-200 dark:border-gray-700">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos</SelectItem>
                      {filterOptions.situacao_contrato.map(s => (
                        <SelectItem key={s} value={s}>{situacaoLabel(s)} ({s})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex flex-wrap gap-3 pt-2">
                <Button type="submit" disabled={loading} className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white gap-2">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  Buscar Leads
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={loadingOptions}
                  onClick={() => loadFilterOptions(true)}
                  className="gap-2"
                >
                  {loadingOptions ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Recarregar Filtros
                </Button>
                {hasActiveFilters && (
                  <Button type="button" variant="outline" onClick={handleClearFilters} className="gap-2">
                    Limpar Filtros
                  </Button>
                )}
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      {loading && (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
            <p className="text-gray-500 dark:text-gray-400">Consultando base de leads...</p>
          </CardContent>
        </Card>
      )}

      {!loading && hasSearched && leads.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Search className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
            <p className="text-gray-500 dark:text-gray-400 font-medium">Nenhum lead encontrado</p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Tente ajustar os filtros para encontrar resultados.</p>
          </CardContent>
        </Card>
      )}

      {!loading && leads.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="w-4 h-4 text-amber-500" />
                Resultado da Consulta
              </CardTitle>
              <div className="flex items-center gap-3 flex-wrap">
                {totalFound > MAX_LEADS && (
                  <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="w-4 h-4" />
                    <span className="text-xs font-medium">
                      Exibindo {MAX_LEADS.toLocaleString('pt-BR')} de {totalFound.toLocaleString('pt-BR')} encontrados
                    </span>
                  </div>
                )}
                <Badge variant="secondary" className="text-xs">
                  {totalFound <= MAX_LEADS
                    ? `${totalFound.toLocaleString('pt-BR')} lead${totalFound !== 1 ? 's' : ''}`
                    : `${leads.length.toLocaleString('pt-BR')} de ${totalFound.toLocaleString('pt-BR')}`
                  }
                </Badge>
                {selectedLeads.size > 0 && (
                  <Badge className="text-xs bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300">
                    {selectedLeads.size} selecionado{selectedLeads.size !== 1 ? 's' : ''}
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {totalFound > MAX_LEADS && (
              <div className="mb-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <p className="text-sm text-amber-800 dark:text-amber-300">
                  A consulta retornou <strong>{totalFound.toLocaleString('pt-BR')}</strong> leads. 
                  O limite máximo por consulta é de <strong>{MAX_LEADS.toLocaleString('pt-BR')}</strong>. 
                  Refine os filtros para obter resultados mais específicos.
                </p>
              </div>
            )}

            <div className="mb-4 flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={toggleSelectAll}
                className="gap-2 text-xs"
              >
                {selectedLeads.size === leads.length ? (
                  <><X className="w-3.5 h-3.5" /> Desmarcar Todos</>
                ) : (
                  <><CheckCircle2 className="w-3.5 h-3.5" /> Selecionar Todos</>
                )}
              </Button>

              <Button
                size="sm"
                disabled={selectedLeads.size === 0 || sendingWhatsApp}
                onClick={handleWhatsAppClick}
                className="gap-2 text-xs bg-green-600 hover:bg-green-700 text-white"
              >
                {sendingWhatsApp ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <MessageSquare className="w-3.5 h-3.5" />
                )}
                Disparar WhatsApp
                {selectedLeads.size > 0 && (
                  <Badge variant="secondary" className="ml-1 text-xs bg-green-100 text-green-800">
                    {leadsWithNumber.length}
                  </Badge>
                )}
              </Button>

              {sendResults && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowResultDialog(true)}
                  className="gap-2 text-xs text-blue-600 hover:text-blue-700"
                >
                  <FileText className="w-3.5 h-3.5" />
                  Ver Resumo do Último Disparo
                </Button>
              )}
            </div>

            {sendingWhatsApp && (
              <div className="mb-4 p-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                <div className="flex items-center gap-3 mb-2">
                  <Loader2 className="w-5 h-5 animate-spin text-green-600" />
                  <span className="text-sm font-medium text-green-800 dark:text-green-300">
                    Enviando mensagens via WhatsApp...
                  </span>
                </div>
                <Progress value={sendProgress.total > 0 ? (sendProgress.current / sendProgress.total) * 100 : 0} className="h-2" />
                <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                  Processando {sendProgress.total} lead{sendProgress.total !== 1 ? 's' : ''}. Aguarde...
                </p>
              </div>
            )}

            <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                    <th className="py-3 px-3 w-10">
                      <Checkbox
                        checked={leads.length > 0 && selectedLeads.size === leads.length}
                        onCheckedChange={toggleSelectAll}
                      />
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600 dark:text-gray-300">#</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600 dark:text-gray-300">Nome</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600 dark:text-gray-300">Telefone</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600 dark:text-gray-300">UF</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600 dark:text-gray-300">Cidade</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600 dark:text-gray-300">Produto</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600 dark:text-gray-300">Canal</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600 dark:text-gray-300">Situação</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600 dark:text-gray-300">WhatsApp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {leads.map((lead, idx) => {
                    const status = getLeadStatus(lead);
                    return (
                      <tr
                        key={idx}
                        className={`hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors ${
                          selectedLeads.has(idx) ? 'bg-green-50/50 dark:bg-green-900/10' : ''
                        }`}
                      >
                        <td className="py-2.5 px-3">
                          <Checkbox
                            checked={selectedLeads.has(idx)}
                            onCheckedChange={() => toggleSelectLead(idx)}
                          />
                        </td>
                        <td className="py-2.5 px-4 text-gray-400 text-xs">{idx + 1}</td>
                        <td className="py-2.5 px-4 font-medium text-gray-900 dark:text-gray-100">{lead.name || '-'}</td>
                        <td className="py-2.5 px-4 text-gray-600 dark:text-gray-400">
                          <div className="flex items-center gap-1.5">
                            <Phone className="w-3 h-3" />
                            {lead.number || '-'}
                          </div>
                        </td>
                        <td className="py-2.5 px-4 text-gray-600 dark:text-gray-400">{lead.uf || '-'}</td>
                        <td className="py-2.5 px-4 text-gray-600 dark:text-gray-400">
                          <div className="flex items-center gap-1.5">
                            <MapPin className="w-3 h-3" />
                            {lead.cidade || '-'}
                          </div>
                        </td>
                        <td className="py-2.5 px-4 text-gray-600 dark:text-gray-400">
                          <div className="flex items-center gap-1.5">
                            <Package className="w-3 h-3" />
                            {lead.produto || '-'}
                          </div>
                        </td>
                        <td className="py-2.5 px-4 text-gray-600 dark:text-gray-400 text-xs">{lead.canal || '-'}</td>
                        <td className="py-2.5 px-4">
                          <Badge variant="outline" className={situacaoColor(lead.situacao_contrato)}>
                            {situacaoLabel(lead.situacao_contrato)}
                          </Badge>
                        </td>
                        <td className="py-2.5 px-4">
                          {status === null ? (
                            <span className="text-gray-300 dark:text-gray-600">—</span>
                          ) : status.success ? (
                            <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400" title={status.messageSentId ? `ID: ${status.messageSentId}` : 'Enviado'}>
                              <CheckCircle2 className="w-4 h-4" />
                              <span className="text-xs">Enviado</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 text-red-500 dark:text-red-400" title={status.error || 'Falha'}>
                              <XCircle className="w-4 h-4" />
                              <span className="text-xs">Falha</span>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-green-600" />
              Confirmar Disparo WhatsApp
            </DialogTitle>
            <DialogDescription>
              Você está prestes a enviar mensagens via WhatsApp para os leads selecionados.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Leads selecionados:</span>
                <span className="font-semibold">{selectedLeads.size}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Com número válido:</span>
                <span className="font-semibold text-green-600">{leadsWithNumber.length}</span>
              </div>
              {selectedLeads.size - leadsWithNumber.length > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Sem número (ignorados):</span>
                  <span className="font-semibold text-amber-600">{selectedLeads.size - leadsWithNumber.length}</span>
                </div>
              )}
            </div>
            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-800 dark:text-amber-300">
                Esta ação não pode ser desfeita. Serão enviadas <strong>{leadsWithNumber.length}</strong> mensagen{leadsWithNumber.length !== 1 ? 's' : ''} via WhatsApp.
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmSend}
              className="bg-green-600 hover:bg-green-700 text-white gap-2"
            >
              <Send className="w-4 h-4" />
              Confirmar Envio
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showResultDialog} onOpenChange={setShowResultDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />
              Resumo do Disparo
            </DialogTitle>
          </DialogHeader>
          {sendResults && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800 text-center">
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{sendResults.total}</p>
                  <p className="text-xs text-gray-500">Total</p>
                </div>
                <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 text-center">
                  <p className="text-2xl font-bold text-green-600">{sendResults.sent}</p>
                  <p className="text-xs text-green-600">Sucesso</p>
                </div>
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-center">
                  <p className="text-2xl font-bold text-red-500">{sendResults.failed}</p>
                  <p className="text-xs text-red-500">Falha</p>
                </div>
              </div>

              {sendResults.sent > 0 && sendResults.failed === 0 && (
                <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <p className="text-sm text-green-800 dark:text-green-300">
                    Todas as mensagens foram enviadas com sucesso!
                  </p>
                </div>
              )}

              {sendResults.failed > 0 && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 flex items-start gap-2">
                  <XCircle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
                  <p className="text-sm text-red-800 dark:text-red-300">
                    {sendResults.failed} mensagen{sendResults.failed !== 1 ? 's' : ''} falharam. Verifique o status individual na tabela.
                  </p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setShowResultDialog(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
