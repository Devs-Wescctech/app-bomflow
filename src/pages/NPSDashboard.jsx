import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  TrendingUp, 
  TrendingDown, 
  Smile, 
  Meh, 
  Frown,
  Star,
  MessageSquare,
  BarChart3,
  Calendar,
  Award,
  Target,
  Users,
  Activity
} from "lucide-react";
import { format, startOfMonth, endOfMonth, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function NPSDashboard() {
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));

  const { data: allTickets = [] } = useQuery({
    queryKey: ['tickets'],
    queryFn: () => base44.entities.Ticket.list('-createdDate', 1000),
    initialData: [],
  });

  const { data: agents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: () => base44.entities.Agent.list(),
    initialData: [],
  });

  const { data: queues = [] } = useQuery({
    queryKey: ['queues'],
    queryFn: () => base44.entities.Queue.list(),
    initialData: [],
  });

  // Filtrar tickets por período
  const filteredTickets = allTickets.filter(ticket => {
    const ticketDate = new Date(ticket.created_date);
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    
    return ticketDate >= start && ticketDate <= end;
  });

  // Tickets com NPS respondido
  const answeredTickets = filteredTickets.filter(t => t.nps_answered && t.nps_score !== undefined);
  
  // Categorias NPS
  const promotores = answeredTickets.filter(t => t.nps_score >= 9).length;
  const neutros = answeredTickets.filter(t => t.nps_score >= 7 && t.nps_score <= 8).length;
  const detratores = answeredTickets.filter(t => t.nps_score <= 6).length;

  // Cálculo do NPS
  const totalRespondentes = answeredTickets.length;
  const npsScore = totalRespondentes > 0 
    ? Math.round(((promotores - detratores) / totalRespondentes) * 100)
    : 0;

  // Taxa de resposta
  const ticketsResolvidos = filteredTickets.filter(t => t.status === 'resolvido' || t.status === 'fechado').length;
  const taxaResposta = ticketsResolvidos > 0 
    ? ((totalRespondentes / ticketsResolvidos) * 100).toFixed(1)
    : 0;

  // Nota média
  const notaMedia = totalRespondentes > 0
    ? (answeredTickets.reduce((sum, t) => sum + t.nps_score, 0) / totalRespondentes).toFixed(1)
    : 0;

  // Performance por agente
  const agentPerformance = agents.map(agent => {
    const agentAnswered = answeredTickets.filter(t => t.completed_by_agent_id === agent.id);
    const agentPromoters = agentAnswered.filter(t => t.nps_score >= 9).length;
    const agentDetractors = agentAnswered.filter(t => t.nps_score <= 6).length;
    const agentNPS = agentAnswered.length > 0
      ? Math.round(((agentPromoters - agentDetractors) / agentAnswered.length) * 100)
      : 0;
    const avgScore = agentAnswered.length > 0
      ? (agentAnswered.reduce((sum, t) => sum + t.nps_score, 0) / agentAnswered.length).toFixed(1)
      : 0;

    return {
      agent,
      totalAnswered: agentAnswered.length,
      nps: agentNPS,
      avgScore: parseFloat(avgScore),
      promoters: agentPromoters,
      neutrals: agentAnswered.filter(t => t.nps_score >= 7 && t.nps_score <= 8).length,
      detractors: agentDetractors,
    };
  }).filter(a => a.totalAnswered > 0).sort((a, b) => b.nps - a.nps);

  // Performance por fila
  const queuePerformance = queues.map(queue => {
    const queueAnswered = answeredTickets.filter(t => t.queue_id === queue.id);
    const queuePromoters = queueAnswered.filter(t => t.nps_score >= 9).length;
    const queueDetractors = queueAnswered.filter(t => t.nps_score <= 6).length;
    const queueNPS = queueAnswered.length > 0
      ? Math.round(((queuePromoters - queueDetractors) / queueAnswered.length) * 100)
      : 0;

    return {
      queue,
      totalAnswered: queueAnswered.length,
      nps: queueNPS,
    };
  }).filter(q => q.totalAnswered > 0).sort((a, b) => b.nps - a.nps);

  // Comentários recentes
  const recentComments = answeredTickets
    .filter(t => t.nps_comment && t.nps_comment.trim())
    .sort((a, b) => new Date(b.nps_answered_at) - new Date(a.nps_answered_at))
    .slice(0, 10);

  const setQuickPeriod = (type) => {
    const today = new Date();
    switch(type) {
      case 'today':
        setStartDate(format(today, 'yyyy-MM-dd'));
        setEndDate(format(today, 'yyyy-MM-dd'));
        break;
      case 'last7':
        setStartDate(format(subDays(today, 7), 'yyyy-MM-dd'));
        setEndDate(format(today, 'yyyy-MM-dd'));
        break;
      case 'month':
        setStartDate(format(startOfMonth(today), 'yyyy-MM-dd'));
        setEndDate(format(endOfMonth(today), 'yyyy-MM-dd'));
        break;
      case 'last30':
        setStartDate(format(subDays(today, 30), 'yyyy-MM-dd'));
        setEndDate(format(today, 'yyyy-MM-dd'));
        break;
    }
  };

  const getNPSColor = (score) => {
    if (score >= 75) return 'from-green-500 to-green-600';
    if (score >= 50) return 'from-yellow-500 to-yellow-600';
    if (score >= 0) return 'from-orange-500 to-orange-600';
    return 'from-red-500 to-red-600';
  };

  const getNPSLabel = (score) => {
    if (score >= 75) return 'Excelente';
    if (score >= 50) return 'Bom';
    if (score >= 0) return 'Razoável';
    return 'Crítico';
  };

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-950 min-h-screen">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Dashboard NPS</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-2">
          <Activity className="w-4 h-4" />
          Pesquisa de Satisfação do Cliente
        </p>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-2 mb-4">
            <Button variant="outline" size="sm" onClick={() => setQuickPeriod('today')}>
              Hoje
            </Button>
            <Button variant="outline" size="sm" onClick={() => setQuickPeriod('last7')}>
              Últimos 7 dias
            </Button>
            <Button variant="outline" size="sm" onClick={() => setQuickPeriod('month')}>
              Este Mês
            </Button>
            <Button variant="outline" size="sm" onClick={() => setQuickPeriod('last30')}>
              Últimos 30 dias
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Data Início</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Data Fim</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Métricas Principais */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* NPS Score */}
        <Card className={`border-2 bg-gradient-to-br ${getNPSColor(npsScore)}`}>
          <CardContent className="p-6">
            <div className="text-center">
              <Star className="w-10 h-10 text-white mx-auto mb-2" />
              <p className="text-white/90 text-sm font-medium mb-1">NPS Score</p>
              <p className="text-5xl font-bold text-white mb-1">{npsScore}</p>
              <p className="text-white/90 text-xs">{getNPSLabel(npsScore)}</p>
            </div>
          </CardContent>
        </Card>

        {/* Promotores */}
        <Card className="border-green-200 dark:border-green-800 bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-green-600 dark:text-green-400 font-medium">Promotores</p>
                <p className="text-3xl font-bold text-green-700 dark:text-green-300">{promotores}</p>
                <p className="text-xs text-green-600 dark:text-green-400">
                  {totalRespondentes > 0 ? ((promotores/totalRespondentes)*100).toFixed(1) : 0}%
                </p>
              </div>
              <Smile className="w-10 h-10 text-green-500 dark:text-green-400 opacity-50" />
            </div>
          </CardContent>
        </Card>

        {/* Neutros */}
        <Card className="border-yellow-200 dark:border-yellow-800 bg-gradient-to-br from-yellow-50 to-yellow-100 dark:from-yellow-950 dark:to-yellow-900">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-yellow-600 dark:text-yellow-400 font-medium">Neutros</p>
                <p className="text-3xl font-bold text-yellow-700 dark:text-yellow-300">{neutros}</p>
                <p className="text-xs text-yellow-600 dark:text-yellow-400">
                  {totalRespondentes > 0 ? ((neutros/totalRespondentes)*100).toFixed(1) : 0}%
                </p>
              </div>
              <Meh className="w-10 h-10 text-yellow-500 dark:text-yellow-400 opacity-50" />
            </div>
          </CardContent>
        </Card>

        {/* Detratores */}
        <Card className="border-red-200 dark:border-red-800 bg-gradient-to-br from-red-50 to-red-100 dark:from-red-950 dark:to-red-900">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-red-600 dark:text-red-400 font-medium">Detratores</p>
                <p className="text-3xl font-bold text-red-700 dark:text-red-300">{detratores}</p>
                <p className="text-xs text-red-600 dark:text-red-400">
                  {totalRespondentes > 0 ? ((detratores/totalRespondentes)*100).toFixed(1) : 0}%
                </p>
              </div>
              <Frown className="w-10 h-10 text-red-500 dark:text-red-400 opacity-50" />
            </div>
          </CardContent>
        </Card>

        {/* Taxa de Resposta */}
        <Card className="border-blue-200 dark:border-blue-800 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-600 dark:text-blue-400 font-medium">Taxa Resposta</p>
                <p className="text-3xl font-bold text-blue-700 dark:text-blue-300">{taxaResposta}%</p>
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  {totalRespondentes}/{ticketsResolvidos}
                </p>
              </div>
              <Target className="w-10 h-10 text-blue-500 dark:text-blue-400 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Gráficos e Análises */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Performance por Agente */}
        <Card>
          <CardHeader className="border-b border-gray-200 dark:border-gray-800">
            <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
              <Award className="w-5 h-5 text-yellow-500" />
              Performance por Agente
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {agentPerformance.slice(0, 5).map((item, index) => (
                <div key={item.agent.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {index === 0 && (
                        <Award className="w-4 h-4 text-yellow-500" />
                      )}
                      <div className="flex items-center gap-2">
                        {item.agent.photo_url ? (
                          <img 
                            src={item.agent.photo_url} 
                            alt={item.agent.name}
                            className="w-8 h-8 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                            <span className="text-white text-xs font-semibold">
                              {item.agent.name[0].toUpperCase()}
                            </span>
                          </div>
                        )}
                        <div>
                          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                            {item.agent.name}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {item.totalAnswered} avaliações
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge className={`text-base font-bold ${
                        item.nps >= 75 ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300' :
                        item.nps >= 50 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300' :
                        item.nps >= 0 ? 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300' :
                        'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
                      }`}>
                        {item.nps}
                      </Badge>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        ⭐ {item.avgScore}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 text-xs">
                    <Badge className="bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300">
                      {item.promoters} 😍
                    </Badge>
                    <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300">
                      {item.neutrals} 😐
                    </Badge>
                    <Badge className="bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300">
                      {item.detractors} 😞
                    </Badge>
                  </div>
                </div>
              ))}
              {agentPerformance.length === 0 && (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400 text-sm">
                  <Users className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                  <p>Nenhuma avaliação ainda</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Performance por Fila */}
        <Card>
          <CardHeader className="border-b border-gray-200 dark:border-gray-800">
            <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
              <BarChart3 className="w-5 h-5 text-blue-500" />
              Performance por Fila
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {queuePerformance.map(item => (
                <div key={item.queue.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-gray-100">{item.queue.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {item.totalAnswered} avaliações
                    </p>
                  </div>
                  <Badge className={`text-base font-bold ${
                    item.nps >= 75 ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300' :
                    item.nps >= 50 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300' :
                    item.nps >= 0 ? 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300' :
                    'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
                  }`}>
                    {item.nps}
                  </Badge>
                </div>
              ))}
              {queuePerformance.length === 0 && (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400 text-sm">
                  <BarChart3 className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                  <p>Nenhuma avaliação ainda</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Comentários Recentes */}
      <Card>
        <CardHeader className="border-b border-gray-200 dark:border-gray-800">
          <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
            <MessageSquare className="w-5 h-5 text-purple-500" />
            Comentários Recentes ({recentComments.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="space-y-4">
            {recentComments.map(ticket => {
              const ticketAgent = agents.find(a => a.id === ticket.completed_by_agent_id);
              return (
                <div key={ticket.id} className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge className={
                        ticket.nps_score >= 9 ? 'bg-green-500 text-white' :
                        ticket.nps_score >= 7 ? 'bg-yellow-500 text-white' :
                        'bg-red-500 text-white'
                      }>
                        {ticket.nps_score}/10
                      </Badge>
                      <Badge className={
                        ticket.nps_category === 'promotor' ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300' :
                        ticket.nps_category === 'neutro' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300' :
                        'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
                      }>
                        {ticket.nps_category === 'promotor' ? '😍 Promotor' :
                         ticket.nps_category === 'neutro' ? '😐 Neutro' :
                         '😞 Detrator'}
                      </Badge>
                    </div>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {format(new Date(ticket.nps_answered_at), "dd/MM/yyyy", { locale: ptBR })}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300 italic mb-2">
                    "{ticket.nps_comment}"
                  </p>
                  <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                    <span>Protocolo: #{ticket.id.slice(0, 8).toUpperCase()}</span>
                    {ticketAgent && <span>Agente: {ticketAgent.name}</span>}
                  </div>
                </div>
              );
            })}
            {recentComments.length === 0 && (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400 text-sm">
                <MessageSquare className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                <p>Nenhum comentário ainda</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}