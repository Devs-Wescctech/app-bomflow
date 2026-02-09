import { Badge } from "@/components/ui/badge";
import { Clock, AlertCircle, User } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const priorityColors = {
  P1: "bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 border-red-300 dark:border-red-700",
  P2: "bg-orange-100 dark:bg-orange-950 text-orange-700 dark:text-orange-300 border-orange-300 dark:border-orange-700",
  P3: "bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700",
  P4: "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-700",
};

export default function TicketCard({ ticket }) {
  const isAtRisk = ticket.sla_resolution_deadline && 
    new Date(ticket.sla_resolution_deadline) < new Date(Date.now() + 4 * 60 * 60 * 1000) &&
    ticket.status !== 'resolved' && ticket.status !== 'closed';

  const isBreached = ticket.sla_breached;

  // Extrair nome do cliente do subject (formato: "Tipo de Ticket - Nome do Cliente")
  const getTicketTitle = () => {
    if (ticket.subject.includes(' - ')) {
      return ticket.subject;
    }
    return ticket.subject;
  };

  return (
    <Link to={`${createPageUrl("TicketView")}?id=${ticket.id}`}>
      <div className={`p-3 border rounded-lg hover:shadow-md transition-all cursor-pointer bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 ${
        isBreached ? 'ring-2 ring-red-500 dark:ring-red-600' : 
        isAtRisk ? 'ring-2 ring-orange-500 dark:ring-orange-600' : 
        'hover:ring-2 hover:ring-blue-500/50 dark:hover:ring-blue-600/50'
      }`}>
        <div className="flex items-start justify-between gap-2 mb-2">
          <Badge variant="outline" className={`${priorityColors[ticket.priority]} border font-semibold text-xs`}>
            {ticket.priority}
          </Badge>
          {isBreached && (
            <Badge className="bg-red-600 dark:bg-red-700 text-white text-xs">
              <AlertCircle className="w-3 h-3 mr-1" />
              SLA Violado
            </Badge>
          )}
          {isAtRisk && !isBreached && (
            <Badge className="bg-orange-600 dark:bg-orange-700 text-white text-xs">
              <AlertCircle className="w-3 h-3 mr-1" />
              Risco
            </Badge>
          )}
        </div>
        
        <h4 className="font-semibold text-gray-900 dark:text-gray-100 text-sm mb-1 line-clamp-2">
          {getTicketTitle()}
        </h4>
        
        {ticket.category && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{ticket.category}</p>
        )}

        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {ticket.createdDate || ticket.createdAt ? format(new Date(ticket.createdDate || ticket.createdAt), "dd/MM HH:mm", { locale: ptBR }) : '-'}
          </div>
          {ticket.agent_id && (
            <div className="flex items-center gap-1">
              <User className="w-3 h-3" />
              <span>Atribuído</span>
            </div>
          )}
        </div>

        {ticket.tags && ticket.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {ticket.tags.slice(0, 2).map((tag, idx) => (
              <Badge key={idx} variant="outline" className="text-xs bg-gray-50 dark:bg-gray-800">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}