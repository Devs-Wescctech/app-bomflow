import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { UserCircle, AlertCircle, Clock, CheckCircle, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function TicketTimeline({ ticketId }) {
  const { data: ticket } = useQuery({
    queryKey: ['ticket', ticketId],
    queryFn: async () => {
      const tickets = await base44.entities.Ticket.list();
      return tickets.find(t => t.id === ticketId);
    },
    enabled: !!ticketId,
  });

  if (!ticket) {
    return null;
  }

  const allEvents = [];

  // Evento de criação
  allEvents.push({
    id: `created-${ticket.id}`,
    type: 'system',
    timestamp: ticket.created_date,
    content: 'Ticket criado',
    icon: AlertCircle,
    color: 'bg-gray-100',
    textColor: 'text-gray-600',
  });

  // Primeira resposta
  if (ticket.first_response_at) {
    allEvents.push({
      id: `first-response-${ticket.id}`,
      type: 'system',
      timestamp: ticket.first_response_at,
      content: 'Primeira resposta enviada',
      icon: CheckCircle,
      color: 'bg-green-100',
      textColor: 'text-green-600',
    });
  }

  // Transferências de agente
  if (ticket.agent_history && ticket.agent_history.length > 0) {
    ticket.agent_history.forEach((change, idx) => {
      allEvents.push({
        id: `agent-change-${idx}`,
        type: 'system',
        timestamp: change.changed_at,
        content: `Ticket transferido por ${change.changed_by || 'Sistema'}`,
        icon: UserCircle,
        color: 'bg-blue-100',
        textColor: 'text-blue-600',
      });
    });
  }

  // Reaberturas
  if (ticket.reopen_history && ticket.reopen_history.length > 0) {
    ticket.reopen_history.forEach((reopen, idx) => {
      allEvents.push({
        id: `reopen-${idx}`,
        type: 'system',
        timestamp: reopen.reopened_at,
        content: `Ticket reaberto por ${reopen.reopened_by || 'Sistema'}`,
        icon: RotateCcw,
        color: 'bg-orange-100',
        textColor: 'text-orange-600',
      });
    });
  }

  // Resolução
  if (ticket.resolved_at) {
    allEvents.push({
      id: `resolved-${ticket.id}`,
      type: 'system',
      timestamp: ticket.resolved_at,
      content: 'Ticket finalizado',
      icon: CheckCircle,
      color: 'bg-green-100',
      textColor: 'text-green-600',
    });
  }

  // Ordenar por timestamp
  const sortedEvents = allEvents.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  // Se não há eventos relevantes além da criação, não mostrar a timeline
  if (sortedEvents.length <= 1) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="w-5 h-5" />
          Linha do Tempo - Eventos do Sistema
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {sortedEvents.map((event, index) => {
            const Icon = event.icon;
            
            return (
              <div key={event.id} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${event.color}`}>
                    <Icon className={`w-5 h-5 ${event.textColor}`} />
                  </div>
                  {index < sortedEvents.length - 1 && (
                    <div className="w-0.5 h-full bg-gray-200 my-2"></div>
                  )}
                </div>
                
                <div className="flex-1 pb-6">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-gray-900 dark:text-gray-100">
                      Sistema
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {format(new Date(event.timestamp), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </span>
                    <Badge variant="outline" className="text-xs bg-gray-50 dark:bg-gray-950">
                      Evento
                    </Badge>
                  </div>
                  <div className="text-gray-700 dark:text-gray-300 text-sm">
                    {event.content}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}