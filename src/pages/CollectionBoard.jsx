
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Search, RefreshCw, Users, CheckSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const contactStatuses = [
  { id: 'novo', label: 'Novo', color: 'red' },
  { id: 'em_atendimento', label: 'Em Contato', color: 'orange' },
  { id: 'aguardando_cliente', label: 'Aguardando Retorno', color: 'yellow' },
];

const agreementStatuses = [
  { id: 'atribuido', label: 'Acordo Registrado', color: 'blue' },
  { id: 'resolvido', label: 'Acordo Efetivado', color: 'green' },
];

export default function CollectionBoard() {
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('all');

  const { data: tickets = [], isLoading, refetch } = useQuery({
    queryKey: ['collectionTickets'],
    queryFn: async () => {
      const allTickets = await base44.entities.Ticket.list('-createdDate', 500);
      return allTickets.filter(t => t.ticket_type === 'collection');
    },
    initialData: [],
  });

  const { data: queues = [] } = useQuery({
    queryKey: ['queues'],
    queryFn: () => base44.entities.Queue.list(),
    initialData: [],
  });

  const contactQueue = queues.find(q => q.name.includes('Contato'));
  const agreementQueue = queues.find(q => q.name.includes('Efetivação'));

  const filteredTickets = tickets.filter(ticket => {
    if (priorityFilter !== 'all' && ticket.priority !== priorityFilter) return false;
    if (searchQuery && !ticket.subject.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const contactTickets = filteredTickets.filter(t => t.queue_id === contactQueue?.id);
  const agreementTickets = filteredTickets.filter(t => t.queue_id === agreementQueue?.id);

  const getTicketsByStatus = (tickets, status) => {
    return tickets.filter(t => t.status === status);
  };

  const totalDebt = filteredTickets.reduce((sum, ticket) => {
    try {
      const desc = JSON.parse(ticket.description || '{}');
      return sum + (desc.debt_value || 0);
    } catch {
      return sum;
    }
  }, 0);

  const totalAgreements = agreementTickets.length;
  const totalAgreementValue = agreementTickets.reduce((sum, ticket) => {
    return sum + (ticket.collection_agreement_value || 0);
  }, 0);

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 border-b dark:border-gray-800 px-6 py-4 flex-shrink-0">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Board de Cobrança</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">Gestão de inadimplência - 2 Equipes</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isLoading}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
            <Badge className="bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 text-base px-3 py-1">
              Total Débito: R$ {totalDebt.toFixed(2).replace('.', ',')}
            </Badge>
            <Badge className="bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300 text-base px-3 py-1">
              Acordos: R$ {totalAgreementValue.toFixed(2).replace('.', ',')}
            </Badge>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white dark:bg-gray-900 border-b dark:border-gray-800 px-6 py-3 flex-shrink-0">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
            <Input
              placeholder="Buscar tickets de cobrança..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
            />
          </div>
          <div className="flex gap-3">
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-[150px] bg-gray-50 dark:bg-gray-800">
                <SelectValue placeholder="Prioridade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="P1">P1 - Crítica</SelectItem>
                <SelectItem value="P2">P2 - Alta</SelectItem>
                <SelectItem value="P3">P3 - Média</SelectItem>
                <SelectItem value="P4">P4 - Baixa</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Board - CORRIGIDO: permite scroll vertical */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="space-y-6">
          {/* EQUIPE X - CONTATO */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <Users className="w-6 h-6 text-orange-600 dark:text-orange-400" />
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                Equipe de Contato
              </h2>
              <Badge className="bg-orange-100 dark:bg-orange-950 text-orange-700 dark:text-orange-300">
                {contactTickets.length} tickets
              </Badge>
            </div>
            
            {/* Scroll horizontal para os cards */}
            <div className="flex gap-4 overflow-x-auto pb-4">
              {contactStatuses.map(status => {
                const tickets = getTicketsByStatus(contactTickets, status.id);
                return (
                  <div key={status.id} className="w-80 flex-shrink-0">
                    <Card className="flex flex-col shadow-sm border-gray-200 dark:border-gray-800">
                      <CardHeader className={`pb-3 bg-gradient-to-r ${
                        status.color === 'red' ? 'from-red-500 to-red-600' :
                        status.color === 'orange' ? 'from-orange-500 to-orange-600' :
                        'from-yellow-500 to-yellow-600'
                      } text-white rounded-t-lg`}>
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base font-semibold">{status.label}</CardTitle>
                          <Badge variant="secondary" className="bg-white/20 text-white font-semibold backdrop-blur-sm">
                            {tickets.length}
                          </Badge>
                        </div>
                      </CardHeader>
                      <div className="flex-1 overflow-y-auto space-y-3 p-3 bg-gray-50 dark:bg-gray-900 max-h-[500px] min-h-[300px]">
                        {tickets.map(ticket => {
                          let desc = {};
                          try {
                            desc = JSON.parse(ticket.description || '{}');
                          } catch {}
                          return (
                            <Link key={ticket.id} to={`${createPageUrl("CollectionTicketView")}?id=${ticket.id}`}>
                              <div className="p-3 border rounded-lg hover:shadow-md transition-all cursor-pointer bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:ring-2 hover:ring-orange-500/50 dark:hover:ring-orange-600/50">
                                <div className="flex items-start justify-between gap-2 mb-2">
                                  <Badge variant="outline" className="bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 border-red-300 dark:border-red-700 font-semibold text-xs">
                                    {ticket.priority}
                                  </Badge>
                                  <Badge className="bg-red-600 dark:bg-red-700 text-white text-xs">
                                    {desc.days_overdue || 0} dias
                                  </Badge>
                                </div>
                                
                                <h4 className="font-semibold text-gray-900 dark:text-gray-100 text-sm mb-1 line-clamp-2">
                                  {ticket.subject}
                                </h4>
                                
                                <p className="text-sm font-bold text-red-600 dark:text-red-400 mb-2">
                                  R$ {(desc.debt_value || 0).toFixed(2).replace('.', ',')}
                                </p>

                                <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                                  <span>
                                    {format(new Date(ticket.created_date), "dd/MM HH:mm", { locale: ptBR })}
                                  </span>
                                  {desc.contact_attempts && (
                                    <Badge variant="outline" className="text-xs">
                                      {desc.contact_attempts.length} tentativa{desc.contact_attempts.length !== 1 ? 's' : ''}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </Link>
                          );
                        })}
                        {tickets.length === 0 && (
                          <div className="text-center py-12 text-gray-400 dark:text-gray-500 text-sm">
                            <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-gray-200 dark:bg-gray-800 flex items-center justify-center">
                              <Users className="w-8 h-8" />
                            </div>
                            <p>Nenhum ticket</p>
                          </div>
                        )}
                      </div>
                    </Card>
                  </div>
                );
              })}
            </div>
          </div>

          {/* EQUIPE Y - EFETIVAÇÃO */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <CheckSquare className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                Equipe de Efetivação
              </h2>
              <Badge className="bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                {agreementTickets.length} tickets
              </Badge>
            </div>
            
            {/* Scroll horizontal para os cards */}
            <div className="flex gap-4 overflow-x-auto pb-4">
              {agreementStatuses.map(status => {
                const tickets = getTicketsByStatus(agreementTickets, status.id);
                return (
                  <div key={status.id} className="w-80 flex-shrink-0">
                    <Card className="flex flex-col shadow-sm border-gray-200 dark:border-gray-800">
                      <CardHeader className={`pb-3 bg-gradient-to-r ${
                        status.color === 'blue' ? 'from-blue-500 to-blue-600' :
                        'from-green-500 to-green-600'
                      } text-white rounded-t-lg`}>
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base font-semibold">{status.label}</CardTitle>
                          <Badge variant="secondary" className="bg-white/20 text-white font-semibold backdrop-blur-sm">
                            {tickets.length}
                          </Badge>
                        </div>
                      </CardHeader>
                      <div className="flex-1 overflow-y-auto space-y-3 p-3 bg-gray-50 dark:bg-gray-900 max-h-[500px] min-h-[300px]">
                        {tickets.map(ticket => {
                          let desc = {};
                          try {
                            desc = JSON.parse(ticket.description || '{}');
                          } catch {}
                          return (
                            <Link key={ticket.id} to={`${createPageUrl("CollectionTicketView")}?id=${ticket.id}`}>
                              <div className="p-3 border rounded-lg hover:shadow-md transition-all cursor-pointer bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:ring-2 hover:ring-blue-500/50 dark:hover:ring-blue-600/50">
                                <div className="flex items-start justify-between gap-2 mb-2">
                                  <Badge variant="outline" className="bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700 font-semibold text-xs">
                                    {ticket.priority}
                                  </Badge>
                                  {ticket.collection_agreement_value && (
                                    <Badge className="bg-green-600 dark:bg-green-700 text-white text-xs">
                                      Acordo: R$ {ticket.collection_agreement_value.toFixed(2).replace('.', ',')}
                                    </Badge>
                                  )}
                                </div>
                                
                                <h4 className="font-semibold text-gray-900 dark:text-gray-100 text-sm mb-1 line-clamp-2">
                                  {ticket.subject}
                                </h4>
                                
                                <p className="text-sm font-bold text-blue-600 dark:text-blue-400 mb-2">
                                  Débito: R$ {(desc.debt_value || 0).toFixed(2).replace('.', ',')}
                                </p>

                                {ticket.collection_agreement_terms && (
                                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-2 line-clamp-1">
                                    {ticket.collection_agreement_terms}
                                  </p>
                                )}

                                <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                                  <span>
                                    {format(new Date(ticket.created_date), "dd/MM HH:mm", { locale: ptBR })}
                                  </span>
                                  {ticket.collection_installments && (
                                    <Badge variant="outline" className="text-xs">
                                      {ticket.collection_installments}x
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </Link>
                          );
                        })}
                        {tickets.length === 0 && (
                          <div className="text-center py-12 text-gray-400 dark:text-gray-500 text-sm">
                            <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-gray-200 dark:bg-gray-800 flex items-center justify-center">
                              <CheckSquare className="w-8 h-8" />
                            </div>
                            <p>Nenhum ticket</p>
                          </div>
                        )}
                      </div>
                    </Card>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
