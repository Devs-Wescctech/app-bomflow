import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Search,
  Building2,
  Phone,
  Mail,
  MapPin,
  DollarSign,
  Users,
  Calendar,
  Filter,
  X,
  ExternalLink,
  TrendingUp,
  Bell,
  FileText,
  CheckCircle,
  XCircle,
  Info,
  Download
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { canViewAll, canViewTeam } from "@/components/utils/permissions";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const STAGES_PJ = [
  { value: 'novo', label: 'Novo', color: 'bg-blue-500 text-white' },
  { value: 'qualificacao', label: 'Qualificação', color: 'bg-purple-500 text-white' },
  { value: 'apresentacao', label: 'Apresentação', color: 'bg-indigo-500 text-white' },
  { value: 'proposta_enviada', label: 'Proposta', color: 'bg-yellow-500 text-white' },
  { value: 'negociacao', label: 'Negociação', color: 'bg-orange-500 text-white' },
  { value: 'fechado_ganho', label: 'Fechado', color: 'bg-green-500 text-white' },
  { value: 'fechado_perdido', label: 'Perdido', color: 'bg-red-500 text-white' },
];

export default function LeadPJSearch() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    stage: "all",
    porte: "all",
    agent: "all",
    city: "all",
    minValue: "",
    maxValue: "",
    dateFrom: "",
    dateTo: "",
  });

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: allAgents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: () => base44.entities.Agent.list(),
    initialData: [],
  });

  const currentAgent = user?.agent;
  const currentAgentType = currentAgent?.agentType || currentAgent?.agent_type;
  const isAdmin = user?.role === 'admin' || currentAgentType === 'admin';
  const isSupervisor = user?.role === 'supervisor' || currentAgentType?.includes('supervisor');

  const { data: leadsPJ = [], isLoading } = useQuery({
    queryKey: ['leadsPJ', isAdmin ? 'admin' : isSupervisor ? 'supervisor' : currentAgent?.id],
    queryFn: async () => {
      const allLeads = await base44.entities.LeadPJ.list('-createdDate');
      
      if (isAdmin || isSupervisor) {
        return allLeads;
      }

      if (!currentAgent) return allLeads;

      const canSeeAll = canViewAll(currentAgent, 'leads');
      if (canSeeAll) {
        return allLeads;
      }

      const canSeeTeam = canViewTeam(currentAgent, 'leads');
      if (canSeeTeam) {
        const teamAgents = allAgents.filter(a => (a.teamId || a.team_id) === (currentAgent.teamId || currentAgent.team_id));
        const teamAgentIds = teamAgents.map(a => a.id);
        
        return allLeads.filter(l => teamAgentIds.includes(l.agentId || l.agent_id));
      }

      return allLeads.filter(l => (l.agentId || l.agent_id) === currentAgent.id);
    },
    enabled: !!user && !!currentAgent,
  });

  const salesAgents = allAgents;

  const { data: allActivitiesPJ = [] } = useQuery({
    queryKey: ['allActivitiesPJ'],
    queryFn: () => base44.entities.ActivityPJ.list(),
    initialData: [],
  });

  const getPendingTasksCount = (leadId) => {
    return allActivitiesPJ.filter(a => 
      a.leadPjId === leadId && 
      a.type === 'task' && 
      !a.completed
    ).length;
  };

  const filteredLeads = leadsPJ.filter(lead => {
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      if (
        !lead.razaoSocial?.toLowerCase().includes(searchLower) &&
        !lead.nomeFantasia?.toLowerCase().includes(searchLower) &&
        !lead.cnpj?.toLowerCase().includes(searchLower) &&
        !lead.phone?.toLowerCase().includes(searchLower) &&
        !lead.email?.toLowerCase().includes(searchLower) &&
        !lead.city?.toLowerCase().includes(searchLower) &&
        !lead.contactName?.toLowerCase().includes(searchLower)
      ) {
        return false;
      }
    }

    // Filters
    if (filters.stage !== "all" && lead.stage !== filters.stage) return false;
    if (filters.porte !== "all" && lead.porte !== filters.porte) return false;
    if (filters.agent !== "all" && lead.agentId !== filters.agent) return false;
    if (filters.city !== "all" && lead.city !== filters.city) return false;
    
    if (filters.minValue && lead.value) {
      if (parseFloat(lead.value) < parseFloat(filters.minValue)) return false;
    }
    
    if (filters.maxValue && lead.value) {
      if (parseFloat(lead.value) > parseFloat(filters.maxValue)) return false;
    }

    if (filters.dateFrom && lead.createdAt) {
      const leadDate = new Date(lead.createdAt);
      const fromDate = new Date(filters.dateFrom);
      if (leadDate < fromDate) return false;
    }

    if (filters.dateTo && lead.createdAt) {
      const leadDate = new Date(lead.createdAt);
      const toDate = new Date(filters.dateTo);
      toDate.setHours(23, 59, 59);
      if (leadDate > toDate) return false;
    }

    return true;
  });

  const getAgentData = (agentId) => {
    return salesAgents.find(a => a.id === agentId);
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value || 0);
  };

  const formatCNPJ = (cnpj) => {
    if (!cnpj) return '-';
    return cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  const clearFilters = () => {
    setFilters({
      stage: "all",
      porte: "all",
      agent: "all",
      city: "all",
      minValue: "",
      maxValue: "",
      dateFrom: "",
      dateTo: "",
    });
  };

  const hasActiveFilters = filters.stage !== "all" || filters.porte !== "all" || filters.agent !== "all" || filters.city !== "all" || filters.minValue || filters.maxValue || filters.dateFrom || filters.dateTo;

  const uniqueCities = [...new Set(leadsPJ.map(l => l.city).filter(Boolean))].sort();

  const stats = {
    total: leadsPJ.length,
    active: leadsPJ.filter(l => l.stage && !['fechado_ganho', 'fechado_perdido'].includes(l.stage)).length,
    won: leadsPJ.filter(l => l.stage === 'fechado_ganho').length,
    lost: leadsPJ.filter(l => l.stage === 'fechado_perdido').length,
  };

  const getStageLabel = (stage) => {
    const stageObj = STAGES_PJ.find(s => s.value === stage);
    return stageObj?.label || stage;
  };

  const exportToCSV = () => {
    const dataToExport = filteredLeads.length > 0 ? filteredLeads : leadsPJ;
    
    if (dataToExport.length === 0) {
      alert('Nenhum lead para exportar');
      return;
    }

    const headers = ['Razão Social', 'Nome Fantasia', 'CNPJ', 'Telefone', 'Email', 'Contato', 'Cidade', 'UF', 'Porte', 'Etapa', 'Valor', 'Data Criação'];
    
    const rows = dataToExport.map(lead => [
      lead.razaoSocial || '',
      lead.nomeFantasia || '',
      lead.cnpj || '',
      lead.phone || '',
      lead.email || '',
      lead.contactName || '',
      lead.city || '',
      lead.state || '',
      lead.porte || '',
      getStageLabel(lead.stage),
      lead.value || 0,
      lead.createdAt ? format(new Date(lead.createdAt), 'dd/MM/yyyy', { locale: ptBR }) : ''
    ]);

    const csvContent = [
      headers.join(';'),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `leads_pj_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-3">
              <Building2 className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
              Busca de Leads PJ
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              Encontre empresas no seu pipeline de vendas B2B
            </p>
          </div>
          <Button onClick={exportToCSV} variant="outline">
            <Download className="w-4 h-4 mr-2" />
            Exportar CSV
          </Button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-4 gap-4">
          <Card className="bg-white dark:bg-gray-900">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-100 dark:bg-blue-900 rounded-lg">
                  <FileText className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Total de Leads</p>
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.total}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-gray-900">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-purple-100 dark:bg-purple-900 rounded-lg">
                  <TrendingUp className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Leads Ativos</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.active}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-gray-900">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-green-100 dark:bg-green-900 rounded-lg">
                  <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Fechados - Ganho</p>
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.won}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-gray-900">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-red-100 dark:bg-red-900 rounded-lg">
                  <XCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Perdidos</p>
                  <p className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.lost}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search Bar */}
        <Card className="bg-white dark:bg-gray-900">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <Input
                  placeholder="Buscar por razão social, nome fantasia, CNPJ, telefone, email, cidade..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 h-12 text-base"
                />
              </div>
              <Button
                variant="outline"
                onClick={() => setShowFilters(!showFilters)}
                className={`h-12 ${hasActiveFilters ? 'bg-indigo-50 dark:bg-indigo-950 border-indigo-300 dark:border-indigo-700' : ''}`}
              >
                <Filter className="w-5 h-5 mr-2" />
                Filtros
                {hasActiveFilters && (
                  <Badge className="ml-2 bg-indigo-600 text-white">
                    {Object.values(filters).filter(v => v && v !== "all").length}
                  </Badge>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Filters */}
        {showFilters && (
          <Card className="border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950">
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <Label className="text-gray-900 dark:text-gray-100">Etapa</Label>
                  <Select value={filters.stage} onValueChange={(val) => setFilters({...filters, stage: val})}>
                    <SelectTrigger className="mt-1 bg-white dark:bg-gray-800">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas as etapas</SelectItem>
                      {STAGES_PJ.map(stage => (
                        <SelectItem key={stage.value} value={stage.value}>{stage.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-gray-900 dark:text-gray-100">Porte</Label>
                  <Select value={filters.porte} onValueChange={(val) => setFilters({...filters, porte: val})}>
                    <SelectTrigger className="mt-1 bg-white dark:bg-gray-800">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os portes</SelectItem>
                      <SelectItem value="MEI">MEI</SelectItem>
                      <SelectItem value="ME">ME</SelectItem>
                      <SelectItem value="EPP">EPP</SelectItem>
                      <SelectItem value="Médio">Médio Porte</SelectItem>
                      <SelectItem value="Grande">Grande Porte</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-gray-900 dark:text-gray-100">Agente</Label>
                  <Select value={filters.agent} onValueChange={(val) => setFilters({...filters, agent: val})}>
                    <SelectTrigger className="mt-1 bg-white dark:bg-gray-800">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os agentes</SelectItem>
                      {salesAgents.map(agent => (
                        <SelectItem key={agent.id} value={agent.id}>{agent.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-gray-900 dark:text-gray-100">Cidade</Label>
                  <Select value={filters.city} onValueChange={(val) => setFilters({...filters, city: val})}>
                    <SelectTrigger className="mt-1 bg-white dark:bg-gray-800">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas as cidades</SelectItem>
                      {uniqueCities.map(city => (
                        <SelectItem key={city} value={city}>{city}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-gray-900 dark:text-gray-100">Valor Mínimo (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={filters.minValue}
                    onChange={(e) => setFilters({...filters, minValue: e.target.value})}
                    placeholder="0.00"
                    className="mt-1 bg-white dark:bg-gray-800"
                  />
                </div>

                <div>
                  <Label className="text-gray-900 dark:text-gray-100">Valor Máximo (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={filters.maxValue}
                    onChange={(e) => setFilters({...filters, maxValue: e.target.value})}
                    placeholder="0.00"
                    className="mt-1 bg-white dark:bg-gray-800"
                  />
                </div>

                <div>
                  <Label className="text-gray-900 dark:text-gray-100">Data Inicial</Label>
                  <Input
                    type="date"
                    value={filters.dateFrom}
                    onChange={(e) => setFilters({...filters, dateFrom: e.target.value})}
                    className="mt-1 bg-white dark:bg-gray-800"
                  />
                </div>

                <div>
                  <Label className="text-gray-900 dark:text-gray-100">Data Final</Label>
                  <Input
                    type="date"
                    value={filters.dateTo}
                    onChange={(e) => setFilters({...filters, dateTo: e.target.value})}
                    className="mt-1 bg-white dark:bg-gray-800"
                  />
                </div>
              </div>

              {hasActiveFilters && (
                <div className="mt-4 flex justify-end">
                  <Button variant="outline" size="sm" onClick={clearFilters}>
                    <X className="w-4 h-4 mr-2" />
                    Limpar Filtros
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Results Summary */}
        <div className="flex items-center justify-between">
          <p className="text-gray-600 dark:text-gray-400">
            <strong>{filteredLeads.length}</strong> {filteredLeads.length === 1 ? 'empresa encontrada' : 'empresas encontradas'}
          </p>
        </div>

        {/* Results Grid */}
        <div className="grid gap-4">
          {isLoading ? (
            <Card className="bg-white dark:bg-gray-900">
              <CardContent className="p-12 text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
                <p className="text-gray-600 dark:text-gray-400">Carregando empresas...</p>
              </CardContent>
            </Card>
          ) : filteredLeads.length === 0 ? (
            <Card className="bg-white dark:bg-gray-900">
              <CardContent className="p-12 text-center">
                <Building2 className="w-16 h-16 text-gray-300 dark:text-gray-700 mx-auto mb-4" />
                <p className="text-gray-600 dark:text-gray-400 font-medium mb-2">
                  Nenhuma empresa encontrada
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-500">
                  {searchTerm || hasActiveFilters 
                    ? 'Tente ajustar os filtros ou a busca'
                    : 'Comece cadastrando seu primeiro lead PJ'
                  }
                </p>
              </CardContent>
            </Card>
          ) : (
            filteredLeads.map(lead => {
              const stage = STAGES_PJ.find(s => s.value === lead.stage);
              const agentData = getAgentData(lead.agentId);
              const pendingTasksCount = getPendingTasksCount(lead.id);

              return (
                <Card 
                  key={lead.id} 
                  className="bg-white dark:bg-gray-900 hover:shadow-lg transition-all cursor-pointer border-l-4"
                  style={{ borderLeftColor: stage?.color.replace('bg-', '#').replace(' text-white', '') || '#6b7280' }}
                  onClick={() => navigate(`${createPageUrl("LeadPJDetail")}?id=${lead.id}`)}
                >
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-3">
                        {/* Header */}
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                              {lead.nomeFantasia || lead.razaoSocial || 'Sem nome'}
                              {pendingTasksCount > 0 && (
                                <div className="relative">
                                  <Bell className="w-5 h-5 text-orange-600 dark:text-orange-400 fill-orange-600 dark:fill-orange-400 animate-pulse" />
                                  <Badge className="absolute -top-1 -right-1 bg-red-600 text-white text-[9px] px-1 py-0 rounded-full">
                                    {pendingTasksCount}
                                  </Badge>
                                </div>
                              )}
                            </h3>
                            {lead.razaoSocial && lead.nomeFantasia && lead.razaoSocial !== lead.nomeFantasia && (
                              <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
                                {lead.razaoSocial}
                              </p>
                            )}
                          </div>
                          <Badge className={stage?.color}>
                            {stage?.label}
                          </Badge>
                        </div>

                        {/* Info Grid */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                            <Building2 className="w-4 h-4 flex-shrink-0" />
                            <span className="truncate">{formatCNPJ(lead.cnpj)}</span>
                          </div>

                          {lead.phone && (
                            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                              <Phone className="w-4 h-4 flex-shrink-0" />
                              <span className="truncate">{lead.phone}</span>
                            </div>
                          )}

                          {lead.email && (
                            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                              <Mail className="w-4 h-4 flex-shrink-0" />
                              <span className="truncate">{lead.email}</span>
                            </div>
                          )}

                          {lead.city && (
                            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                              <MapPin className="w-4 h-4 flex-shrink-0" />
                              <span className="truncate">{lead.city}/{lead.state}</span>
                            </div>
                          )}
                        </div>

                        {/* Bottom Row */}
                        <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-800">
                          <div className="flex items-center gap-4">
                            {lead.porte && (
                              <Badge variant="outline" className="bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                                {lead.porte}
                              </Badge>
                            )}

                            {lead.num_employees && (
                              <div className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400">
                                <Users className="w-4 h-4" />
                                <span>{lead.num_employees} funcionários</span>
                              </div>
                            )}

                            {lead.value && (
                              <div className="flex items-center gap-1 text-sm font-semibold text-green-600 dark:text-green-400">
                                <DollarSign className="w-4 h-4" />
                                <span>{formatCurrency(lead.value)}</span>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-3">
                            {agentData && (
                              <div className="flex items-center gap-2">
                                {agentData.photo_url ? (
                                  <img 
                                    src={agentData.photo_url} 
                                    alt={agentData.name}
                                    className="w-6 h-6 rounded-full object-cover border border-gray-200 dark:border-gray-700"
                                  />
                                ) : (
                                  <div className="w-6 h-6 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs font-bold">
                                    {agentData.name.charAt(0).toUpperCase()}
                                  </div>
                                )}
                                <span className="text-sm text-gray-600 dark:text-gray-400">{agentData.name}</span>
                              </div>
                            )}

                            <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-500">
                              <Calendar className="w-3 h-3" />
                              {formatDate(lead.created_date)}
                            </div>

                            <ExternalLink className="w-5 h-5 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}