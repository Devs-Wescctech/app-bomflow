import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  Gift,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { canViewAll, canViewTeam } from "@/components/utils/permissions.jsx";
import DashboardFilters from "@/components/dashboard/DashboardFilters";

const createPageUrl = (pageName) => `/${pageName}`;

const ITEMS_PER_PAGE = 20;

export default function ReferralWonReport() {
  const navigate = useNavigate();
  const [selectedPeriod, setSelectedPeriod] = useState("all");
  const [dateRange, setDateRange] = useState({ from: null, to: null });
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [searchText, setSearchText] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const currentAgent = user?.agent;
  const currentAgentType = currentAgent?.agentType || currentAgent?.agent_type;
  const isAdmin = currentAgentType === 'admin' || currentAgentType === 'supervisor' || currentAgentType === 'sales_supervisor' || currentAgentType === 'indicacoes_supervisor' || currentAgentType === 'indicacoes_admin' || user?.role === 'admin';
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

  const { data: referrals = [], isLoading } = useQuery({
    queryKey: ['referrals-won-report', isAdmin ? 'admin' : currentAgent?.id, allAgents.length],
    queryFn: async () => {
      const allReferrals = await base44.entities.Referral.list('-createdDate', 10000);
      const wonReferrals = allReferrals.filter(r => r.concluded || r.stage === 'convertido');

      if (isAdmin) return wonReferrals;
      if (!currentAgent) return [];
      if (canViewAll(currentAgent, 'referrals')) return wonReferrals;

      if (canViewTeam(currentAgent, 'referrals')) {
        const teamAgents = allAgents.filter(a => (a.teamId || a.team_id) === (currentAgent?.teamId || currentAgent?.team_id));
        const teamAgentIds = teamAgents.map(a => a.id);
        return wonReferrals.filter(r => teamAgentIds.includes(r.agentId || r.agent_id));
      }

      return wonReferrals.filter(r => (r.agentId || r.agent_id) === currentAgent?.id);
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

  const displayAgents = useMemo(() => {
    if (!selectedTeam) return allAgents;
    return allAgents.filter(a => String(a.teamId || a.team_id) === String(selectedTeam));
  }, [allAgents, selectedTeam]);

  const filteredReferrals = useMemo(() => {
    return referrals.filter(ref => {
      if (searchText) {
        const s = searchText.toLowerCase();
        if (
          !ref.referredName?.toLowerCase().includes(s) &&
          !ref.referred_name?.toLowerCase().includes(s) &&
          !ref.referredPhone?.toLowerCase().includes(s) &&
          !ref.referred_phone?.toLowerCase().includes(s) &&
          !ref.referrerName?.toLowerCase().includes(s) &&
          !ref.referrer_name?.toLowerCase().includes(s) &&
          !ref.referrerCpf?.toLowerCase().includes(s) &&
          !ref.referrer_cpf?.toLowerCase().includes(s)
        ) return false;
      }

      if (dateRange?.from) {
        const d = new Date(ref.convertedAt || ref.converted_at || ref.updatedAt || ref.updated_at);
        const start = new Date(dateRange.from);
        start.setHours(0, 0, 0, 0);
        if (d < start) return false;
      }
      if (dateRange?.to) {
        const d = new Date(ref.convertedAt || ref.converted_at || ref.updatedAt || ref.updated_at);
        const end = new Date(dateRange.to);
        end.setHours(23, 59, 59, 999);
        if (d > end) return false;
      }

      if (selectedAgent) {
        const agentId = ref.agentId || ref.agent_id;
        if (agentId !== selectedAgent) return false;
      }

      if (selectedTeam) {
        const teamAgentIds = displayAgents.map(a => String(a.id));
        const refAgentId = String(ref.agentId || ref.agent_id);
        if (!teamAgentIds.includes(refAgentId)) return false;
      }

      return true;
    });
  }, [referrals, searchText, dateRange, selectedAgent, selectedTeam, displayAgents]);

  const totalRegistros = filteredReferrals.length;
  const valorTotal = filteredReferrals.reduce((sum, r) => sum + (parseFloat(r.value) || 0), 0);
  const comissaoTotal = filteredReferrals.reduce((sum, r) => sum + (parseFloat(r.commissionValue || r.commission_value) || 0), 0);
  const ticketMedio = totalRegistros > 0 ? valorTotal / totalRegistros : 0;

  const totalPages = Math.ceil(totalRegistros / ITEMS_PER_PAGE);
  const paginatedReferrals = filteredReferrals.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const handleClearFilters = () => {
    setSelectedPeriod("all");
    setDateRange({ from: null, to: null });
    setSelectedAgent(null);
    setSelectedTeam(null);
    setSearchText("");
    setCurrentPage(1);
  };

  const exportToExcel = () => {
    const periodLabel = dateRange?.from && dateRange?.to
      ? `${format(dateRange.from, 'dd/MM/yyyy', { locale: ptBR })} a ${format(dateRange.to, 'dd/MM/yyyy', { locale: ptBR })}`
      : 'Todo o período';

    const csvContent = [
      ['RELATÓRIO DE CONVERTIDOS - INDICAÇÕES'],
      [`Período: ${periodLabel}`],
      [`Total: ${totalRegistros} | Valor Total: R$ ${valorTotal.toFixed(2)} | Comissão Total: R$ ${comissaoTotal.toFixed(2)}`],
      [''],
      ['Indicado', 'Tel. Indicado', 'Indicador', 'CPF Indicador', 'Interesse', 'Valor', 'Comissão', 'Atendente', 'Dt. Criação', 'Dt. Conversão'],
      ...filteredReferrals.map(ref => {
        const agent = agentMap[ref.agentId || ref.agent_id];
        const convertedDate = ref.convertedAt || ref.converted_at;
        return [
          ref.referredName || ref.referred_name || '',
          ref.referredPhone || ref.referred_phone || '',
          ref.referrerName || ref.referrer_name || '',
          ref.referrerCpf || ref.referrer_cpf || '',
          ref.interest || '',
          `R$ ${(parseFloat(ref.value) || 0).toFixed(2)}`,
          `R$ ${(parseFloat(ref.commissionValue || ref.commission_value) || 0).toFixed(2)}`,
          agent?.name || '',
          ref.createdAt ? format(new Date(ref.createdAt), 'dd/MM/yyyy', { locale: ptBR }) : '',
          convertedDate ? format(new Date(convertedDate), 'dd/MM/yyyy', { locale: ptBR }) : '',
        ];
      }),
    ].map(row => row.join(';')).join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `relatorio-convertidos-indicacoes-${format(new Date(), 'yyyy-MM-dd-HHmm')}.csv`;
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
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Relatório de Convertidos</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-2">
            <Gift className="w-4 h-4" />
            Indicações convertidas com sucesso
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
            placeholder="Buscar por nome, telefone, CPF..."
            value={searchText}
            onChange={(e) => { setSearchText(e.target.value); setCurrentPage(1); }}
            className="pl-10"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:shadow-lg transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Total Convertidos</p>
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
                <p className="text-sm text-gray-500 dark:text-gray-400">Comissão Total</p>
                <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                  R$ {comissaoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
                </p>
              </div>
              <div className="p-3 bg-amber-100 dark:bg-amber-950 rounded-xl">
                <Trophy className="w-8 h-8 text-amber-600 dark:text-amber-400" />
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
            <Gift className="w-5 h-5 text-amber-600" />
            Indicações Convertidas ({totalRegistros})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Indicado</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Tel. Indicado</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Indicador</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">CPF Indicador</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Interesse</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Valor</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Comissão</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Atendente</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Dt. Criação</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Dt. Conversão</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {isLoading ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                      Carregando...
                    </td>
                  </tr>
                ) : paginatedReferrals.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                      Nenhuma indicação convertida encontrada para os filtros selecionados
                    </td>
                  </tr>
                ) : (
                  paginatedReferrals.map(ref => {
                    const agent = agentMap[ref.agentId || ref.agent_id];
                    const convertedDate = ref.convertedAt || ref.converted_at;
                    const commVal = parseFloat(ref.commissionValue || ref.commission_value) || 0;
                    return (
                      <tr key={ref.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <p className="font-medium text-gray-900 dark:text-gray-100">{ref.referredName || ref.referred_name || '-'}</p>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-600 dark:text-gray-400">{ref.referredPhone || ref.referred_phone || '-'}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-700 dark:text-gray-300">{ref.referrerName || ref.referrer_name || '-'}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-600 dark:text-gray-400">{ref.referrerCpf || ref.referrer_cpf || '-'}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {ref.interest ? <Badge variant="outline">{ref.interest}</Badge> : '-'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right font-semibold text-emerald-600 dark:text-emerald-400">
                          R$ {(parseFloat(ref.value) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right font-semibold text-amber-600 dark:text-amber-400">
                          R$ {commVal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-700 dark:text-gray-300">{agent?.name || '-'}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-center text-gray-600 dark:text-gray-400">
                          {ref.createdAt ? format(new Date(ref.createdAt), 'dd/MM/yy', { locale: ptBR }) : '-'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-center text-gray-600 dark:text-gray-400">
                          {convertedDate ? format(new Date(convertedDate), 'dd/MM/yy', { locale: ptBR }) : '-'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(`${createPageUrl("ReferralDetail")}?id=${ref.id}`)}
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
