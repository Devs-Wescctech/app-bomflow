import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Search, Filter, Loader2, Users, ChevronDown, ChevronUp,
  AlertTriangle, Phone, MapPin, Package, FileText
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

  useEffect(() => {
    loadFilterOptions();
  }, []);

  async function loadFilterOptions() {
    setLoadingOptions(true);
    try {
      const res = await fetch(`${API_BASE}/functions/lead-generator-options`, {
        headers: { ...getAuthHeaders() },
      });
      if (!res.ok) throw new Error(`Erro ao carregar opções (${res.status})`);
      const data = await res.json();

      if (data.success === false) {
        throw new Error(data.error || 'Erro desconhecido');
      }

      setFilterOptions({
        canal: Array.isArray(data.canal) ? data.canal : [],
        cidade: Array.isArray(data.cidade) ? data.cidade : [],
        uf: Array.isArray(data.uf) ? data.uf : [],
        produto: Array.isArray(data.produto) ? data.produto : [],
        situacao_contrato: Array.isArray(data.situacao_contrato) ? data.situacao_contrato : [],
      });
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
  }

  const hasActiveFilters = Object.values(filters).some(v => v !== "todos");

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
              <div className="flex items-center gap-3">
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

            <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-3 px-4 font-medium text-gray-600 dark:text-gray-300">#</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600 dark:text-gray-300">Nome</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600 dark:text-gray-300">Telefone</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600 dark:text-gray-300">UF</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600 dark:text-gray-300">Cidade</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600 dark:text-gray-300">Produto</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600 dark:text-gray-300">Canal</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600 dark:text-gray-300">Situação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {leads.map((lead, idx) => (
                    <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
