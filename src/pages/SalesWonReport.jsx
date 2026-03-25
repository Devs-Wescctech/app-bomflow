import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Trophy,
  Download,
  Users,
  DollarSign,
  TrendingUp,
  Eye,
  Search,
  ShieldX,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { canViewAll, canViewTeam } from "@/components/utils/permissions.jsx";
import DashboardFilters from "@/components/dashboard/DashboardFilters";

const createPageUrl = (pageName) => `/${pageName}`;

const ITEMS_PER_PAGE = 20;

export default function SalesWonReport() {
  const navigate = useNavigate();
  const [selectedPeriod, setSelectedPeriod] = useState("all");
  const [dateRange, setDateRange] = useState({ from: null, to: null });
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [searchText, setSearchText] = useState("");
  const [selectedSource, setSelectedSource] = useState(null);
  const [selectedTerritory, setSelectedTerritory] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const currentAgent = user?.agent;
  const currentAgentType = currentAgent?.agentType || currentAgent?.agent_type;
  const isAdmin = currentAgentType === 'admin' || currentAgentType === 'supervisor' || currentAgentType === 'sales_supervisor';
  const hasPermission = !!user;

  const { data: teams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: () => base44.entities.Team.list(),
  });

  const { data: allAgents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: () => base44.entities.Agent.list(),
    enabled: !!user && hasPermission,
  });

  const { data: territories = [] } = useQuery({
    queryKey: ['territories'],
    queryFn: () => base44.entities.Territory.list(),
    enabled: !!user && hasPermission,
  });

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ['leads-won-report', isAdmin ? 'admin' : currentAgent?.id, allAgents.length],
    queryFn: async () => {
      const allLeads = await base44.entities.Lead.list('-createdDate', 10000);
      const wonLeads = allLeads.filter(l => l.concluded || l.stage === 'fechado_ganho');

      if (isAdmin) return wonLeads;
      if (!currentAgent) return [];
      if (canViewAll(currentAgent, 'leads')) return wonLeads;

      if (canViewTeam(currentAgent, 'leads')) {
        const teamAgents = allAgents.filter(a => (a.teamId || a.team_id) === (currentAgent?.teamId || currentAgent?.team_id));
        const teamAgentIds = teamAgents.map(a => a.id);
        return wonLeads.filter(l =>
          teamAgentIds.includes(l.agentId || l.agent_id) || teamAgentIds.includes(l.promoterId || l.promoter_id)
        );
      }

      return wonLeads.filter(l =>
        (l.agentId || l.agent_id) === currentAgent?.id || (l.promoterId || l.promoter_id) === currentAgent?.id
      );
    },
    enabled: !!user && hasPermission && allAgents.length > 0,
  });

  const agentMap = useMemo(() => {
    const map = {};
    allAgents.forEach(a => { map[a.id] = a; });
    return map;
  }, [allAgents]);

  const teamMap = useMemo(() => {
    const map = {};
    teams.forEach(t => { map[t.id] = t; });
    return map;
  }, [teams]);

  const territoryMap = useMemo(() => {
    const map = {};
    territories.forEach(t => { map[t.id] = t; });
    return map;
  }, [territories]);

  const sources = useMemo(() => {
    const s = new Set();
    leads.forEach(l => { if (l.source) s.add(l.source); });
    return [...s].sort();
  }, [leads]);

  const displayAgents = useMemo(() => {
    if (!selectedTeam) return allAgents;
    return allAgents.filter(a => String(a.teamId || a.team_id) === String(selectedTeam));
  }, [allAgents, selectedTeam]);

  const filteredLeads = useMemo(() => {
    return leads.filter(lead => {
      if (searchText) {
        const s = searchText.toLowerCase();
        if (
          !lead.name?.toLowerCase().includes(s) &&
          !lead.phone?.toLowerCase().includes(s) &&
          !lead.email?.toLowerCase().includes(s)
        ) return false;
      }

      if (dateRange?.from) {
        const d = new Date(lead.convertedAt || lead.converted_at || lead.updatedAt || lead.updated_at);
        const start = new Date(dateRange.from);
        start.setHours(0, 0, 0, 0);
        if (d < start) return false;
      }
      if (dateRange?.to) {
        const d = new Date(lead.convertedAt || lead.converted_at || lead.updatedAt || lead.updated_at);
        const end = new Date(dateRange.to);
        end.setHours(23, 59, 59, 999);
        if (d > end) return false;
      }

      if (selectedAgent) {
        const agentId = lead.agentId || lead.agent_id;
        if (agentId !== selectedAgent) return false;
      }

      if (selectedTeam) {
        const teamAgentIds = displayAgents.map(a => String(a.id));
        const leadAgentId = String(lead.agentId || lead.agent_id);
        if (!teamAgentIds.includes(leadAgentId)) return false;
      }

      if (selectedSource && lead.source !== selectedSource) return false;

      if (selectedTerritory) {
        const tid = lead.territoryId || lead.territory_id;
        if (String(tid) !== String(selectedTerritory)) return false;
      }

      return true;
    });
  }, [leads, searchText, dateRange, selectedAgent, selectedTeam, selectedSource, selectedTerritory, displayAgents]);

  const totalRegistros = filteredLeads.length;
  const valorTotal = filteredLeads.reduce((sum, l) => sum + (parseFloat(l.value) || 0), 0);
  const ticketMedio = totalRegistros > 0 ? valorTotal / totalRegistros : 0;

  const totalPages = Math.ceil(totalRegistros / ITEMS_PER_PAGE);
  const paginatedLeads = filteredLeads.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const handleClearFilters = () => {
    setSelectedPeriod("all");
    setDateRange({ from: null, to: null });
    setSelectedAgent(null);
    setSelectedTeam(null);
    setSearchText("");
    setSelectedSource(null);
    setSelectedTerritory(null);
    setCurrentPage(1);
  };

  const exportToExcel = () => {
    const periodLabel = dateRange?.from && dateRange?.to
      ? `${format(dateRange.from, 'dd/MM/yyyy', { locale: ptBR })} a ${format(dateRange.to, 'dd/MM/yyyy', { locale: ptBR })}`
      : 'Todo o período';

    const csvContent = [
      ['RELATÓRIO DE GANHOS - VENDAS PF'],
      [`Período: ${periodLabel}`],
      [`Total: ${totalRegistros} | Valor Total: R$ ${valorTotal.toFixed(2)} | Ticket Médio: R$ ${ticketMedio.toFixed(2)}`],
      [''],
      ['Nome', 'Telefone', 'Origem', 'Valor', 'Agente', 'Equipe', 'Território', 'Dt. Criação', 'Dt. Conversão'],
      ...filteredLeads.map(lead => {
        const agent = agentMap[lead.agentId || lead.agent_id];
        const team = teamMap[agent?.teamId || agent?.team_id];
        const territory = territoryMap[lead.territoryId || lead.territory_id];
        return [
          lead.name || '',
          lead.phone || '',
          lead.source || '',
          `R$ ${(parseFloat(lead.value) || 0).toFixed(2)}`,
          agent?.name || '',
          team?.name || '',
          territory?.name || '',
          lead.createdAt ? format(new Date(lead.createdAt), 'dd/MM/yyyy', { locale: ptBR }) : '',
          (lead.convertedAt || lead.converted_at) ? format(new Date(lead.convertedAt || lead.converted_at), 'dd/MM/yyyy', { locale: ptBR }) : '',
        ];
      }),
    ].map(row => row.join(';')).join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `relatorio-ganhos-pf-${format(new Date(), 'yyyy-MM-dd-HHmm')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!hasPermission) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-gray-950">
        <Card className="max-w-md bg-white dark:bg-gray-900">
          <CardContent className="p-8 text-center">
            <ShieldX className="w-16 h-16 mx-auto mb-4 text-red-500" />
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Acesso Restrito</h2>
            <p className="text-gray-600 dark:text-gray-400">
              Você não tem permissão para acessar este relatório.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-950 min-h-screen">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Relatório de Ganhos</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-2">
            <Trophy className="w-4 h-4" />
            Vendas PF — Leads ganhos/convertidos
          </p>
        </div>
        <Button
          onClick={exportToExcel}
          className="bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-600"
        >
          <Download className="w-4 h-4 mr-2" />
          Exportar Excel
        </Button>
      </div>

      <DashboardFilters
        agents={displayAgents}
        stages={[]}
        teams={teams}
        selectedAgent={selectedAgent}
        selectedStage={null}
        selectedTeam={selectedTeam}
        selectedPeriod={selectedPeriod}
        dateRange={dateRange}
        onAgentChange={(v) => { setSelectedAgent(v); setCurrentPage(1); }}
        onStageChange={() => {}}
        onTeamChange={(v) => { setSelectedTeam(v); setCurrentPage(1); }}
        onPeriodChange={setSelectedPeriod}
        onDateRangeChange={(v) => { setDateRange(v); setCurrentPage(1); }}
        onClearFilters={handleClearFilters}
        showAgentFilter={true}
        showStageFilter={false}
        showTeamFilter={true}
        showPeriodFilter={true}
      />

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Buscar por nome, telefone..."
            value={searchText}
            onChange={(e) => { setSearchText(e.target.value); setCurrentPage(1); }}
            className="pl-10"
          />
        </div>
        {sources.length > 0 && (
          <Select value={selectedSource || "all"} onValueChange={(v) => { setSelectedSource(v === "all" ? null : v); setCurrentPage(1); }}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Origem" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as origens</SelectItem>
              {sources.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {territories.length > 0 && (
          <Select value={selectedTerritory || "all"} onValueChange={(v) => { setSelectedTerritory(v === "all" ? null : v); setCurrentPage(1); }}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Território" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os territórios</SelectItem>
              {territories.map(t => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:shadow-lg transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Total de Ganhos</p>
                <p className="text-3xl font-bold text-green-600 dark:text-green-400">{totalRegistros}</p>
              </div>
              <div className="p-3 bg-green-100 dark:bg-green-950 rounded-xl">
                <Users className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-2 border-emerald-200 dark:border-emerald-800 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/50 dark:to-teal-950/50 hover:shadow-lg transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Valor Total</p>
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                  R$ {valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
                </p>
              </div>
              <div className="p-3 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl">
                <DollarSign className="w-8 h-8 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:shadow-lg transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Ticket Médio</p>
                <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                  R$ {ticketMedio.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
                </p>
              </div>
              <div className="p-3 bg-orange-100 dark:bg-orange-950 rounded-xl">
                <TrendingUp className="w-8 h-8 text-orange-600 dark:text-orange-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <CardHeader className="border-b border-gray-200 dark:border-gray-800">
          <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
            <Trophy className="w-5 h-5 text-green-600" />
            Leads Ganhos ({totalRegistros})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Nome</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Telefone</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Origem</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Valor</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Agente</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Equipe</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Território</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Dt. Criação</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Dt. Conversão</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {isLoading ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                      Carregando...
                    </td>
                  </tr>
                ) : paginatedLeads.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                      Nenhum lead ganho encontrado para os filtros selecionados
                    </td>
                  </tr>
                ) : (
                  paginatedLeads.map(lead => {
                    const agent = agentMap[lead.agentId || lead.agent_id];
                    const team = teamMap[agent?.teamId || agent?.team_id];
                    const territory = territoryMap[lead.territoryId || lead.territory_id];
                    const convertedDate = lead.convertedAt || lead.converted_at;
                    return (
                      <tr key={lead.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <p className="font-medium text-gray-900 dark:text-gray-100">{lead.name || '-'}</p>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-600 dark:text-gray-400">{lead.phone || '-'}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {lead.source ? <Badge variant="outline">{lead.source}</Badge> : '-'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right font-semibold text-emerald-600 dark:text-emerald-400">
                          R$ {(parseFloat(lead.value) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-700 dark:text-gray-300">{agent?.name || '-'}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-600 dark:text-gray-400">{team?.name || '-'}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-600 dark:text-gray-400">{territory?.name || '-'}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-center text-gray-600 dark:text-gray-400">
                          {lead.createdAt ? format(new Date(lead.createdAt), 'dd/MM/yy', { locale: ptBR }) : '-'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-center text-gray-600 dark:text-gray-400">
                          {convertedDate ? format(new Date(convertedDate), 'dd/MM/yy', { locale: ptBR }) : '-'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(`${createPageUrl("LeadDetail")}?id=${lead.id}`)}
                            className="text-blue-600 hover:text-blue-800 dark:text-blue-400"
                          >
                            <Eye className="w-4 h-4 mr-1" />
                            Ver
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Mostrando {((currentPage - 1) * ITEMS_PER_PAGE) + 1} a {Math.min(currentPage * ITEMS_PER_PAGE, totalRegistros)} de {totalRegistros}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {currentPage} / {totalPages}
                </span>
                <Button variant="outline" size="sm" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
