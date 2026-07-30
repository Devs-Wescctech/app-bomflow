import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  TrendingUp,
  DollarSign,
  ShoppingCart,
  Receipt,
  Gift,
  AlertTriangle,
  Loader2
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import DashboardFilters from "@/components/dashboard/DashboardFilters";
import { format, startOfMonth, endOfMonth, startOfDay, endOfDay, parseISO, isWithinInterval } from "date-fns";
import { ptBR } from "date-fns/locale";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";
import { extractApiError } from "@/utils/apiError";

const API_BASE = '/api';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 }
};

const PERIOD_LABELS = {
  today: 'Hoje',
  yesterday: 'Ontem',
  last7days: 'Últimos 7 dias',
  last30days: 'Últimos 30 dias',
  thisMonth: 'Este mês',
  lastMonth: 'Mês passado',
  thisYear: 'Este ano',
  all: 'Todo período'
};

export default function IndicacoesMeuPainel() {
  const [selectedPeriod, setSelectedPeriod] = useState("thisMonth");
  const [dateRange, setDateRange] = useState({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) });

  const { data: user, isLoading: loadingUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const currentAgent = user?.agent;

  const { data: dashboardData, isLoading: loadingDashboard, error } = useQuery({
    queryKey: ['indicacoes-agent-dashboard'],
    queryFn: async () => {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`${API_BASE}/functions/indicacoes-agent-dashboard`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error(await extractApiError(res, 'Falha ao carregar dados'));
      return res.json();
    },
    enabled: !!currentAgent,
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const filteredData = useMemo(() => {
    if (!dashboardData?.success) return null;

    const { totais, series, ultimas_vendas } = dashboardData;

    if (selectedPeriod === 'all' || !dateRange.from || !dateRange.to) {
      return { totais, series, ultimas_vendas };
    }

    const from = startOfDay(dateRange.from);
    const to = endOfDay(dateRange.to);

    const filteredVendasPorDia = (series.vendas_por_dia || []).filter(item => {
      try {
        const d = parseISO(item.dia);
        return isWithinInterval(d, { start: from, end: to });
      } catch { return false; }
    });

    const filteredValorPorDia = (series.valor_por_dia || []).filter(item => {
      try {
        const d = parseISO(item.dia);
        return isWithinInterval(d, { start: from, end: to });
      } catch { return false; }
    });

    const filteredUltimasVendas = (ultimas_vendas || []).filter(v => {
      if (!v.data_contrato) return false;
      try {
        const d = parseISO(v.data_contrato);
        return isWithinInterval(d, { start: from, end: to });
      } catch { return false; }
    });

    const vendasCount = filteredVendasPorDia.reduce((sum, d) => sum + (d.vendas || 0), 0);
    const valorTotal = filteredValorPorDia.reduce((sum, d) => sum + (d.valor || 0), 0);
    const ticketMedio = vendasCount > 0 ? Number((valorTotal / vendasCount).toFixed(2)) : 0;

    return {
      totais: { vendas: vendasCount, valor_total: valorTotal, ticket_medio: ticketMedio },
      series: { vendas_por_dia: filteredVendasPorDia, valor_por_dia: filteredValorPorDia },
      ultimas_vendas: filteredUltimasVendas
    };
  }, [dashboardData, selectedPeriod, dateRange]);

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2
    }).format(value || 0);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    try {
      return format(parseISO(dateStr), 'dd/MM/yyyy', { locale: ptBR });
    } catch { return dateStr; }
  };

  const isLoading = loadingUser || loadingDashboard;
  const periodLabel = PERIOD_LABELS[selectedPeriod] || selectedPeriod;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-10 h-10 animate-spin text-amber-600" />
          <p className="text-gray-500">Carregando painel...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-3" />
            <p className="text-gray-700 font-medium">Erro ao carregar dados</p>
            <p className="text-gray-500 text-sm mt-1">{error.message}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (dashboardData?.erp_agent_id_missing) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
            <p className="text-gray-700 font-medium">ID ERP não configurado</p>
            <p className="text-gray-500 text-sm mt-1">
              Seu perfil ainda não possui um ID de agente ERP vinculado.
              Solicite ao supervisor a configuração do seu ID ERP.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totais = filteredData?.totais || { vendas: 0, valor_total: 0, ticket_medio: 0 };
  const series = filteredData?.series || { vendas_por_dia: [], valor_por_dia: [] };
  const ultimasVendas = filteredData?.ultimas_vendas || [];

  const chartVendas = (series.vendas_por_dia || []).map(d => ({
    dia: d.dia ? format(parseISO(d.dia), 'dd/MM', { locale: ptBR }) : d.dia,
    vendas: d.vendas
  }));

  const chartValor = (series.valor_por_dia || []).map(d => ({
    dia: d.dia ? format(parseISO(d.dia), 'dd/MM', { locale: ptBR }) : d.dia,
    valor: d.valor
  }));

  return (
    <motion.div
      className="min-h-screen p-3 md:p-6"
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      <div className="max-w-7xl mx-auto space-y-4 md:space-y-6">
        <motion.div variants={itemVariants} className="page-header-title-section">
          <div>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold bg-gradient-to-r from-amber-500 to-orange-500 bg-clip-text text-transparent">
              Meu Painel — Indicações
            </h1>
            <p className="text-gray-500 mt-1 text-sm md:text-base">
              Bem-vindo(a), {currentAgent?.name || 'Agente'}! Acompanhe suas vendas por indicação.
            </p>
          </div>
        </motion.div>

        <motion.div variants={itemVariants}>
          <DashboardFilters
            selectedPeriod={selectedPeriod}
            dateRange={dateRange}
            onPeriodChange={setSelectedPeriod}
            onDateRangeChange={setDateRange}
            onClearFilters={() => {
              setSelectedPeriod("thisMonth");
              setDateRange({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) });
            }}
            showAgentFilter={false}
            showStageFilter={false}
            showTeamFilter={false}
            showPeriodFilter={true}
          />
        </motion.div>

        <motion.div variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
          <Card className="bg-gradient-to-br from-amber-500 to-orange-600 text-white border-0">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-amber-100 text-sm">Vendas Realizadas <span className="opacity-75">({periodLabel})</span></p>
                  <p className="text-3xl font-bold">{totais.vendas}</p>
                  <p className="text-amber-100 text-xs mt-1">contratos efetivados</p>
                </div>
                <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
                  <ShoppingCart className="w-6 h-6" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-500 to-emerald-600 text-white border-0">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-green-100 text-sm">Valor Total <span className="opacity-75">({periodLabel})</span></p>
                  <p className="text-3xl font-bold">{formatCurrency(totais.valor_total)}</p>
                  <p className="text-green-100 text-xs mt-1">faturamento em indicações</p>
                </div>
                <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
                  <DollarSign className="w-6 h-6" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white border-0">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-100 text-sm">Ticket Médio <span className="opacity-75">({periodLabel})</span></p>
                  <p className="text-3xl font-bold">{formatCurrency(totais.ticket_medio)}</p>
                  <p className="text-blue-100 text-xs mt-1">média por contrato</p>
                </div>
                <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
                  <Receipt className="w-6 h-6" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          <motion.div variants={itemVariants}>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-amber-500" />
                  Evolução de Vendas
                </CardTitle>
              </CardHeader>
              <CardContent>
                {chartVendas.length > 0 ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={chartVendas}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="dia" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="vendas" name="Vendas" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[260px] flex items-center justify-center text-gray-400 text-sm">
                    Sem dados para o período selecionado
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={itemVariants}>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-green-500" />
                  Evolução de Faturamento
                </CardTitle>
              </CardHeader>
              <CardContent>
                {chartValor.length > 0 ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={chartValor}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="dia" tick={{ fontSize: 11 }} />
                      <YAxis
                        tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`}
                        tick={{ fontSize: 11 }}
                      />
                      <Tooltip formatter={(v) => formatCurrency(v)} />
                      <Line type="monotone" dataKey="valor" name="Valor" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[260px] flex items-center justify-center text-gray-400 text-sm">
                    Sem dados para o período selecionado
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>

        <motion.div variants={itemVariants}>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Gift className="w-5 h-5 text-amber-500" />
                Últimas Vendas por Indicação
                <Badge variant="secondary" className="ml-2 text-xs">{ultimasVendas.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {ultimasVendas.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="pb-2 font-medium text-gray-500">Nome do Indicado</th>
                        <th className="pb-2 font-medium text-gray-500">Data do Contrato</th>
                        <th className="pb-2 font-medium text-gray-500">Valor</th>
                        <th className="pb-2 font-medium text-gray-500">Canal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ultimasVendas.map((v, i) => (
                        <tr key={i} className="border-b last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                          <td className="py-2.5 text-gray-900 dark:text-gray-100">{v.nome_indicado || '-'}</td>
                          <td className="py-2.5 text-gray-600 dark:text-gray-400">{formatDate(v.data_contrato)}</td>
                          <td className="py-2.5 font-medium text-green-600">{formatCurrency(v.valor_contrato)}</td>
                          <td className="py-2.5">
                            <Badge variant="outline" className="text-xs">{v.canal || '-'}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-400 text-sm">
                  Nenhuma venda registrada no período selecionado
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  );
}
