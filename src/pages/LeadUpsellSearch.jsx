
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { upsell } from "@/api/upsellClient";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Search, 
  Phone, 
  User, 
  Calendar,
  MapPin,
  Mail,
  FileText,
  Loader2,
  ExternalLink,
  TrendingUp,
  CheckCircle,
  XCircle,
  AlertCircle,
  Info,
  Download,
  Filter,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { createPageUrl } from "@/utils";
import { canViewAll, canViewTeam, isUpsellPrivileged } from "@/components/utils/permissions.jsx";

export default function LeadUpsellSearch() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchType, setSearchType] = useState("all");
  const [stageFilter, setStageFilter] = useState("all");
  const [agentFilter, setAgentFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: allAgents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: () => base44.entities.Agent.list(),
    staleTime: 0,
  });

  const currentAgent = user?.agent || allAgents.find(a => a.userEmail === user?.email || a.user_email === user?.email);
  const currentAgentType = currentAgent?.agentType || currentAgent?.agent_type;
  const isAdmin = isUpsellPrivileged(user, currentAgent);

  const needsTeamFilter = !isAdmin && currentAgent && !canViewAll(currentAgent, 'leads') && canViewTeam(currentAgent, 'leads');
  const agentsReady = allAgents.length > 0;

  const { data: allLeads = [], isLoading } = useQuery({
    queryKey: ['leads', isAdmin ? 'admin' : currentAgent?.id, needsTeamFilter ? allAgents.length : 0],
    queryFn: async () => {
      const leads = await upsell.entities.LeadUpsell.list('-createdDate');
      
      if (isAdmin) {
        return leads;
      }
      
      if (!currentAgent) return [];
      
      if (canViewAll(currentAgent, 'leads')) {
        return leads;
      }
      
      if (canViewTeam(currentAgent, 'leads')) {
        const teamAgents = allAgents.filter(a => (a.teamId || a.team_id) === (currentAgent.teamId || currentAgent.team_id));
        const teamAgentIds = teamAgents.map(a => a.id);
        return leads.filter(l => 
          teamAgentIds.includes(l.agentId || l.agent_id) || teamAgentIds.includes(l.promoterId || l.promoter_id)
        );
      }
      
      return leads.filter(l => 
        (l.agentId || l.agent_id) === currentAgent.id || (l.promoterId || l.promoter_id) === currentAgent.id
      );
    },
    enabled: !!user && (!needsTeamFilter || agentsReady),
  });

  const normalizeString = (str) => {
    if (!str) return '';
    return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  };

  const getFilteredLeads = () => {
    let leads = [...allLeads];

    if (stageFilter !== 'all') {
      leads = leads.filter(l => l.stage === stageFilter);
    }

    if (agentFilter !== 'all') {
      leads = leads.filter(l => (l.agentId || l.agent_id) === agentFilter);
    }

    if (dateFrom) {
      const from = new Date(dateFrom);
      from.setHours(0, 0, 0, 0);
      leads = leads.filter(l => {
        const d = new Date(l.createdDate || l.createdAt);
        return !isNaN(d) && d >= from;
      });
    }

    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      leads = leads.filter(l => {
        const d = new Date(l.createdDate || l.createdAt);
        return !isNaN(d) && d <= to;
      });
    }

    if (searchQuery.trim()) {
      const query = normalizeString(searchQuery);
      const queryNumbers = searchQuery.replace(/\D/g, '');

      leads = leads.filter(lead => {
        if (searchType === 'all' || searchType === 'phone') {
          const leadPhone = lead.phone?.replace(/\D/g, '') || '';
          if (leadPhone.includes(queryNumbers) && queryNumbers) return true;
        }
        if (searchType === 'all' || searchType === 'cpf') {
          const leadCPF = lead.cpf?.replace(/\D/g, '') || '';
          if (leadCPF.includes(queryNumbers) && queryNumbers) return true;
        }
        if (searchType === 'all' || searchType === 'name') {
          const leadName = normalizeString(lead.name || '');
          if (leadName.includes(query)) return true;
        }
        if (searchType === 'all') {
          const leadEmail = normalizeString(lead.email || '');
          if (leadEmail.includes(query)) return true;
        }
        return false;
      });
    }

    return leads;
  };

  const filteredLeads = getFilteredLeads();
  const totalResults = filteredLeads.length;
  const totalPages = Math.max(1, Math.ceil(totalResults / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedLeads = filteredLeads.slice((safePage - 1) * pageSize, safePage * pageSize);

  const handleFilterChange = (setter) => (value) => {
    setter(value);
    setCurrentPage(1);
  };

  const getAgentName = (agentId) => {
    const agent = allAgents.find(a => a.id === agentId);
    return agent?.name || agent?.fullName || agent?.full_name || '-';
  };

  const exportToCSV = () => {
    const dataToExport = filteredLeads;
    
    if (dataToExport.length === 0) {
      alert('Nenhum lead para exportar');
      return;
    }

    const headers = ['Nome', 'Telefone', 'CPF', 'Email', 'Estágio', 'Valor Mensal', 'Valor Adesão', 'Valor Total', 'Interesse', 'Endereço', 'Cidade', 'UF', 'Agente', 'Data Criação'];
    
    const rows = dataToExport.map(lead => [
      lead.name || '',
      lead.phone || '',
      lead.cpf || '',
      lead.email || '',
      getStageLabel(lead.stage),
      lead.monthlyValue || lead.monthly_value || 0,
      lead.adhesionValue || lead.adhesion_value || 0,
      lead.value || 0,
      lead.interest || '',
      lead.address || '',
      lead.city || '',
      lead.state || '',
      getAgentName(lead.agentId || lead.agent_id),
      lead.createdDate ? format(new Date(lead.createdDate), 'dd/MM/yyyy', { locale: ptBR }) : ''
    ]);

    const csvContent = [
      headers.join(';'),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `leads_export_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getStageColor = (stage) => {
    const colors = {
      novo: 'bg-gray-100 text-gray-800',
      abordado: 'bg-blue-100 text-blue-800',
      qualificado: 'bg-purple-100 text-purple-800',
      proposta_enviada: 'bg-yellow-100 text-yellow-800',
      fechado_ganho: 'bg-green-100 text-green-800',
      fechado_perdido: 'bg-red-100 text-red-800',
      reengajar: 'bg-orange-100 text-orange-800',
    };
    return colors[stage] || 'bg-gray-100 text-gray-800';
  };

  const getStageLabel = (stage) => {
    const labels = {
      novo: 'Novo',
      abordado: 'Abordado',
      qualificado: 'Qualificado',
      proposta_enviada: 'Proposta Enviada',
      fechado_ganho: 'Fechado - Ganho',
      fechado_perdido: 'Fechado - Perdido',
      reengajar: 'Reengajar',
    };
    return labels[stage] || stage || '-';
  };

  const stats = {
    total: allLeads.length,
    active: allLeads.filter(l => l.stage && !['fechado_ganho', 'fechado_perdido'].includes(l.stage)).length,
    won: allLeads.filter(l => l.stage === 'fechado_ganho').length,
    lost: allLeads.filter(l => l.stage === 'fechado_perdido').length,
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Search className="w-8 h-8 text-blue-600 dark:text-blue-400" />
            Busca de Leads - Pipeline Comercial
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Busca inteligente de leads do pipeline de vendas por telefone, CPF, nome ou e-mail
          </p>
        </div>

        <Alert className="mb-6 border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950">
          <Info className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <AlertDescription className="text-blue-800 dark:text-blue-200">
            <strong>Pipeline Comercial:</strong> Esta busca é exclusiva para leads do processo comercial de vendas. 
            Para buscar tickets de <strong>Pré-Venda</strong> ou <strong>Pós-Venda</strong>, 
            acesse o menu "Pré e Pós Vendas" → "Tickets de Vendas".
          </AlertDescription>
        </Alert>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <FileText className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-600 dark:text-gray-400">Total</p>
                  <p className="text-xl font-bold text-blue-600 dark:text-blue-400">{stats.total}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <TrendingUp className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-600 dark:text-gray-400">Ativos</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{stats.active}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-600 dark:text-gray-400">Ganhos</p>
                  <p className="text-xl font-bold text-green-600 dark:text-green-400">{stats.won}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 rounded-lg">
                  <XCircle className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-600 dark:text-gray-400">Perdidos</p>
                  <p className="text-xl font-bold text-red-600 dark:text-red-400">{stats.lost}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="w-5 h-5" />
              Filtros e Busca
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
              <div className="md:col-span-3">
                <Label>Buscar por</Label>
                <div className="relative mt-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                    placeholder="Digite telefone, CPF, nome ou e-mail..."
                    className="pl-10"
                  />
                </div>
              </div>
              <div>
                <Label>Campo</Label>
                <Select value={searchType} onValueChange={handleFilterChange(setSearchType)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="phone">Telefone</SelectItem>
                    <SelectItem value="cpf">CPF</SelectItem>
                    <SelectItem value="name">Nome</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2">
                <Label>Estágio</Label>
                <Select value={stageFilter} onValueChange={handleFilterChange(setStageFilter)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os estágios</SelectItem>
                    <SelectItem value="novo">Novo</SelectItem>
                    <SelectItem value="abordado">Abordado</SelectItem>
                    <SelectItem value="qualificado">Qualificado</SelectItem>
                    <SelectItem value="proposta_enviada">Proposta Enviada</SelectItem>
                    <SelectItem value="fechado_ganho">Fechado - Ganho</SelectItem>
                    <SelectItem value="fechado_perdido">Fechado - Perdido</SelectItem>
                    <SelectItem value="reengajar">Reengajar</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
              <div className="md:col-span-2">
                <Label>Agente</Label>
                <Select value={agentFilter} onValueChange={handleFilterChange(setAgentFilter)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os agentes</SelectItem>
                    {allAgents.map(agent => (
                      <SelectItem key={agent.id} value={agent.id}>
                        {agent.name || agent.fullName || agent.full_name || agent.userEmail || agent.user_email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Data de</Label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => { setDateFrom(e.target.value); setCurrentPage(1); }}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Data até</Label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => { setDateTo(e.target.value); setCurrentPage(1); }}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Por página</Label>
                <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setCurrentPage(1); }}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Button onClick={exportToCSV} variant="outline" className="w-full gap-2 mt-1">
                  <Download className="w-4 h-4" />
                  Exportar CSV
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4" />
                <span>{totalResults} lead(s) encontrado(s)</span>
              </div>
              {(stageFilter !== 'all' || agentFilter !== 'all' || dateFrom || dateTo || searchQuery) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setStageFilter('all');
                    setAgentFilter('all');
                    setDateFrom('');
                    setDateTo('');
                    setSearchQuery('');
                    setSearchType('all');
                    setCurrentPage(1);
                  }}
                  className="text-xs"
                >
                  Limpar filtros
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : paginatedLeads.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Search className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                Nenhum lead encontrado
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Ajuste os filtros ou a busca para encontrar leads no pipeline comercial.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-100 dark:bg-gray-800">
                      <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Nome</th>
                      <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Telefone</th>
                      <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300 hidden lg:table-cell">Email</th>
                      <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Estágio</th>
                      <th className="text-right p-3 font-semibold text-gray-700 dark:text-gray-300 hidden md:table-cell">Valor</th>
                      <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300 hidden lg:table-cell">Agente</th>
                      <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300 hidden md:table-cell">Data Criação</th>
                      <th className="text-center p-3 font-semibold text-gray-700 dark:text-gray-300">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedLeads.map((lead, idx) => (
                      <tr
                        key={lead.id}
                        className={`border-b cursor-pointer hover:bg-blue-50 dark:hover:bg-gray-800 transition-colors ${idx % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50 dark:bg-gray-950'}`}
                        onClick={() => navigate(`${createPageUrl("LeadUpsellDetail")}?id=${lead.id}`)}
                      >
                        <td className="p-3 font-medium text-gray-900 dark:text-gray-100">
                          {lead.name || 'Sem nome'}
                        </td>
                        <td className="p-3 text-gray-600 dark:text-gray-400">
                          {lead.phone || '-'}
                        </td>
                        <td className="p-3 text-gray-600 dark:text-gray-400 hidden lg:table-cell">
                          <span className="truncate max-w-[180px] inline-block">{lead.email || '-'}</span>
                        </td>
                        <td className="p-3">
                          <Badge className={`${getStageColor(lead.stage)} text-xs`}>
                            {getStageLabel(lead.stage)}
                          </Badge>
                        </td>
                        <td className="p-3 text-right text-gray-700 dark:text-gray-300 hidden md:table-cell">
                          {lead.value ? `R$ ${Number(lead.value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '-'}
                        </td>
                        <td className="p-3 text-gray-600 dark:text-gray-400 hidden lg:table-cell">
                          {getAgentName(lead.agentId || lead.agent_id)}
                        </td>
                        <td className="p-3 text-gray-600 dark:text-gray-400 hidden md:table-cell">
                          {(lead.createdDate || lead.createdAt) && !isNaN(new Date(lead.createdDate || lead.createdAt))
                            ? format(new Date(lead.createdDate || lead.createdAt), "dd/MM/yyyy", { locale: ptBR })
                            : '-'}
                        </td>
                        <td className="p-3 text-center">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`${createPageUrl("LeadUpsellDetail")}?id=${lead.id}`);
                            }}
                          >
                            <ExternalLink className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Mostrando {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, totalResults)} de {totalResults} lead(s)
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={safePage <= 1}
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  className="gap-1"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Anterior
                </Button>
                <span className="text-sm text-gray-700 dark:text-gray-300 px-2">
                  Página {safePage} de {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={safePage >= totalPages}
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  className="gap-1"
                >
                  Próxima
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
