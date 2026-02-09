
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
  Filter
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { createPageUrl } from "@/utils";
import { canViewAll, canViewTeam } from "@/components/utils/permissions.jsx";

export default function LeadSearch() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchType, setSearchType] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

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
  const isAdmin = user?.role === 'admin' || currentAgentType === 'admin';

  const needsTeamFilter = !isAdmin && currentAgent && !canViewAll(currentAgent, 'leads') && canViewTeam(currentAgent, 'leads');
  const agentsReady = allAgents.length > 0;

  const { data: allLeads = [], isLoading } = useQuery({
    queryKey: ['leads', isAdmin ? 'admin' : currentAgent?.id, needsTeamFilter ? allAgents.length : 0],
    queryFn: async () => {
      const leads = await base44.entities.Lead.list('-createdDate');
      
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

  const agents = allAgents;

  const normalizeString = (str) => {
    if (!str) return '';
    return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  };

  // Aplicar filtro de status primeiro
  const getLeadsByStatus = () => {
    if (statusFilter === 'all') return allLeads;
    if (statusFilter === 'active') return allLeads.filter(l => l.stage && !['fechado_ganho', 'fechado_perdido'].includes(l.stage));
    if (statusFilter === 'won') return allLeads.filter(l => l.stage === 'fechado_ganho');
    if (statusFilter === 'lost') return allLeads.filter(l => l.stage === 'fechado_perdido');
    return allLeads;
  };

  const leadsAfterStatusFilter = getLeadsByStatus();

  const getFilteredLeads = () => {
    if (!searchQuery.trim()) {
      return leadsAfterStatusFilter.slice(0, 50);
    }

    const query = normalizeString(searchQuery);
    const queryNumbers = searchQuery.replace(/\D/g, '');

    return leadsAfterStatusFilter.filter(lead => {
      // Busca por telefone
      if (searchType === 'all' || searchType === 'phone') {
        const leadPhone = lead.phone?.replace(/\D/g, '') || '';
        if (leadPhone.includes(queryNumbers)) return true;
      }

      // Busca por CPF
      if (searchType === 'all' || searchType === 'cpf') {
        const leadCPF = lead.cpf?.replace(/\D/g, '') || '';
        if (leadCPF.includes(queryNumbers)) return true;
      }

      // Busca por nome
      if (searchType === 'all' || searchType === 'name') {
        const leadName = normalizeString(lead.name || '');
        if (leadName.includes(query)) return true;
      }

      // Busca por email
      if (searchType === 'all') {
        const leadEmail = normalizeString(lead.email || '');
        if (leadEmail.includes(query)) return true;
      }

      return false;
    });
  };

  const filteredLeads = getFilteredLeads();

  // Função de exportação CSV
  const exportToCSV = () => {
    const dataToExport = filteredLeads.length > 0 ? filteredLeads : leadsAfterStatusFilter;
    
    if (dataToExport.length === 0) {
      alert('Nenhum lead para exportar');
      return;
    }

    const headers = ['Nome', 'Telefone', 'CPF', 'Email', 'Estágio', 'Valor Mensal', 'Valor Adesão', 'Valor Total', 'Interesse', 'Endereço', 'Cidade', 'UF', 'Data Criação'];
    
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
      lead.createdDate ? format(new Date(lead.createdDate), 'dd/MM/yyyy', { locale: ptBR }) : ''
    ]);

    const csvContent = [
      headers.join(';'),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    const statusLabel = statusFilter === 'all' ? 'todos' : statusFilter === 'won' ? 'ganhos' : statusFilter === 'lost' ? 'perdidos' : 'ativos';
    link.setAttribute('href', url);
    link.setAttribute('download', `leads_${statusLabel}_${format(new Date(), 'yyyy-MM-dd')}.csv`);
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
    return labels[stage] || stage;
  };

  // KPIs baseados no stage (fonte de verdade) - allLeads já está filtrado por permissões
  const stats = {
    total: allLeads.length,
    active: allLeads.filter(l => l.stage && !['fechado_ganho', 'fechado_perdido'].includes(l.stage)).length,
    won: allLeads.filter(l => l.stage === 'fechado_ganho').length,
    lost: allLeads.filter(l => l.stage === 'fechado_perdido').length,
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Search className="w-8 h-8 text-blue-600 dark:text-blue-400" />
            Busca de Leads - Pipeline Comercial
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Busca inteligente de leads do pipeline de vendas por telefone, CPF, nome ou e-mail
          </p>
        </div>

        {/* Alerta Informativo */}
        <Alert className="mb-6 border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950">
          <Info className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <AlertDescription className="text-blue-800 dark:text-blue-200">
            <strong>Pipeline Comercial:</strong> Esta busca é exclusiva para leads do processo comercial de vendas. 
            Para buscar tickets de <strong>Pré-Venda</strong> ou <strong>Pós-Venda</strong>, 
            acesse o menu "Pré e Pós Vendas" → "Tickets de Vendas".
          </AlertDescription>
        </Alert>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-100 rounded-lg">
                  <FileText className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Total de Leads</p>
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.total}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{isAdmin ? 'Todos os leads' : 'Seus leads'}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-green-100 rounded-lg">
                  <TrendingUp className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Leads Ativos</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.active}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">No pipeline</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-green-100 rounded-lg">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Vendas Fechadas</p>
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.won}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Ganhos</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-red-100 rounded-lg">
                  <XCircle className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Leads Perdidos</p>
                  <p className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.lost}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Sem conversão</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Busca e Filtros */}
        <Card className="mb-6">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Buscar Lead no Pipeline Comercial</CardTitle>
            <Button onClick={exportToCSV} variant="outline" className="gap-2">
              <Download className="w-4 h-4" />
              Exportar CSV
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-6 gap-4">
              <div className="md:col-span-3">
                <Label>Buscar por</Label>
                <div className="relative mt-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Digite telefone, CPF, nome ou e-mail do lead..."
                    className="pl-10"
                  />
                </div>
              </div>

              <div>
                <Label>Campo</Label>
                <select
                  value={searchType}
                  onChange={(e) => setSearchType(e.target.value)}
                  className="w-full mt-1 h-10 px-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">Todos os campos</option>
                  <option value="phone">Apenas Telefone</option>
                  <option value="cpf">Apenas CPF</option>
                  <option value="name">Apenas Nome</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <Label>Status do Lead</Label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full mt-1 h-10 px-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">Todos os status</option>
                  <option value="active">Ativos (no pipeline)</option>
                  <option value="won">Fechados - Ganhos</option>
                  <option value="lost">Fechados - Perdidos</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4" />
                <span>
                  {leadsAfterStatusFilter.length} lead(s) com filtro de status
                </span>
              </div>
              {searchQuery && (
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  <span>
                    {filteredLeads.length} lead(s) encontrado(s) na busca
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Resultados */}
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : (
          <div className="space-y-4">
            {filteredLeads.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <Search className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                    {searchQuery ? 'Nenhum lead encontrado' : 'Digite algo para buscar'}
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">
                    {searchQuery 
                      ? 'Nenhum lead no pipeline comercial corresponde à sua busca'
                      : 'Use a busca acima para encontrar leads do pipeline de vendas'
                    }
                  </p>
                  <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-950 rounded-lg inline-block">
                    <p className="text-sm text-blue-800 dark:text-blue-200">
                      <strong>Dica:</strong> Se está procurando tickets de Pré-Venda ou Pós-Venda, 
                      acesse "Pré e Pós Vendas" → "Tickets de Vendas"
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              filteredLeads.map(lead => (
                <Card 
                  key={lead.id} 
                  className="hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => navigate(`${createPageUrl("LeadDetail")}?id=${lead.id}`)}
                >
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-start gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                                {lead.name || 'Sem nome'}
                              </h3>
                              <Badge className={getStageColor(lead.stage)}>
                                {getStageLabel(lead.stage)}
                              </Badge>
                              {lead.concluded && (
                                <Badge className="bg-green-100 text-green-700">
                                  ✅ Venda Fechada
                                </Badge>
                              )}
                              {lead.lost && (
                                <Badge className="bg-red-100 text-red-700">
                                  ❌ Lead Perdido
                                </Badge>
                              )}
                            </div>

                            <div className="grid md:grid-cols-2 gap-4 text-sm">
                              {lead.phone && (
                                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                                  <Phone className="w-4 h-4" />
                                  <span>{lead.phone}</span>
                                </div>
                              )}

                              {lead.cpf && (
                                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                                  <User className="w-4 h-4" />
                                  <span>{lead.cpf}</span>
                                </div>
                              )}

                              {lead.email && (
                                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                                  <Mail className="w-4 h-4" />
                                  <span>{lead.email}</span>
                                </div>
                              )}

                              {lead.interest && (
                                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                                  <FileText className="w-4 h-4" />
                                  <span>{lead.interest}</span>
                                </div>
                              )}

                              {lead.address && (
                                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400 md:col-span-2">
                                  <MapPin className="w-4 h-4" />
                                  <span className="truncate">{lead.address}</span>
                                </div>
                              )}

                              <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                                <Calendar className="w-4 h-4" />
                                <span>
                                  Criado em {(lead.createdDate || lead.createdAt) && !isNaN(new Date(lead.createdDate || lead.createdAt))
                                    ? format(new Date(lead.createdDate || lead.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                                    : 'data não disponível'}
                                </span>
                              </div>
                            </div>

                            {lead.notes && (
                              <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                                <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">{lead.notes}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`${createPageUrl("LeadDetail")}?id=${lead.id}`);
                        }}
                      >
                        <ExternalLink className="w-5 h-5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}

        {!searchQuery && filteredLeads.length === 20 && (
          <div className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">
            Mostrando os 20 leads mais recentes do pipeline comercial. Use a busca para encontrar outros.
          </div>
        )}
      </div>
    </div>
  );
}
