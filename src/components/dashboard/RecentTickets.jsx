import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, AlertCircle, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const statusColors = {
  novo: "bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300",
  atribuido: "bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300",
  em_atendimento: "bg-yellow-100 dark:bg-yellow-950 text-yellow-700 dark:text-yellow-300",
  aguardando_cliente: "bg-orange-100 dark:bg-orange-950 text-orange-700 dark:text-orange-300",
  resolvido: "bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300",
  fechado: "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300",
};

const statusLabels = {
  novo: 'Novo',
  atribuido: 'Atribuído',
  em_atendimento: 'Em Atendimento',
  aguardando_cliente: 'Aguardando Cliente',
  aguardando_terceiro: 'Aguardando Terceiro',
  resolvido: 'Resolvido',
  fechado: 'Fechado',
};

const priorityColors = {
  P1: "bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 border-red-300 dark:border-red-700",
  P2: "bg-orange-100 dark:bg-orange-950 text-orange-700 dark:text-orange-300 border-orange-300 dark:border-orange-700",
  P3: "bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700",
  P4: "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-700",
};

export default function RecentTickets({ tickets }) {
  return (
    <Card className="shadow-sm border-gray-200 dark:border-gray-800">
      <CardHeader className="border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between">
          <CardTitle className="text-gray-900 dark:text-gray-100">Tickets Recentes</CardTitle>
          <Link 
            to={createPageUrl("QueueBoard")}
            className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 flex items-center gap-1"
          >
            Ver todos
            <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-gray-200 dark:divide-gray-800">
          {tickets.map((ticket) => {
            const isAtRisk = ticket.sla_resolution_deadline && 
              new Date(ticket.sla_resolution_deadline) < new Date(Date.now() + 4 * 60 * 60 * 1000);
            
            const getDisplayTitle = () => {
              if (ticket.subject.includes(' - ')) {
                return ticket.subject;
              }
              return ticket.subject;
            };
            
            return (
              <Link 
                key={ticket.id} 
                to={`${createPageUrl("TicketView")}?id=${ticket.id}`}
                className="block hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
              >
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <Badge variant="outline" className={`${priorityColors[ticket.priority]} border font-semibold text-xs`}>
                          {ticket.priority}
                        </Badge>
                        <Badge className={`${statusColors[ticket.status]} text-xs`}>
                          {statusLabels[ticket.status] || ticket.status}
                        </Badge>
                        {isAtRisk && (
                          <Badge className="bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 text-xs">
                            <AlertCircle className="w-3 h-3 mr-1" />
                            Em risco
                          </Badge>
                        )}
                      </div>
                      <h4 className="font-semibold text-gray-900 dark:text-gray-100 truncate mb-1">
                        {getDisplayTitle()}
                      </h4>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {ticket.category || 'Sem categoria'} • {ticket.channel}
                      </p>
                    </div>
                    <div className="text-right text-xs text-gray-500 dark:text-gray-400 flex flex-col items-end gap-1">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {ticket.createdAt ? format(new Date(ticket.createdAt), "HH:mm", { locale: ptBR }) : '--:--'}
                      </div>
                      <div>
                        {ticket.createdAt ? format(new Date(ticket.createdAt), "dd/MM", { locale: ptBR }) : '--/--'}
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
          {tickets.length === 0 && (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              Nenhum ticket encontrado
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}