import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Clock, CheckCircle, AlertCircle, Loader2, FileText, Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

export default function CustomerTimeline({ contactId, accountId, contactDocument }) {
  console.log('🔍 CustomerTimeline - Props:', { contactId, accountId, contactDocument });
  
  // Buscar todos os tickets
  const { data: allTickets = [], isLoading } = useQuery({
    queryKey: ['allTickets'],
    queryFn: async () => {
      console.log('📡 Buscando todos os tickets...');
      const tickets = await base44.entities.Ticket.list();
      console.log('✅ Total de tickets no sistema:', tickets.length);
      return tickets;
    },
    initialData: [],
  });

  // Buscar o contato para pegar o CPF
  const { data: contact } = useQuery({
    queryKey: ['contact', contactId],
    queryFn: async () => {
      if (!contactId) return null;
      console.log('📡 Buscando contato:', contactId);
      const contacts = await base44.entities.Contact.list();
      const found = contacts.find(c => c.id === contactId);
      console.log('✅ Contato encontrado:', found);
      return found;
    },
    enabled: !!contactId,
  });

  // Buscar todos os contatos com mesmo CPF
  const { data: relatedContacts = [] } = useQuery({
    queryKey: ['relatedContacts', contact?.document],
    queryFn: async () => {
      if (!contact?.document) return [];
      console.log('📡 Buscando contatos com CPF:', contact.document);
      const contacts = await base44.entities.Contact.list();
      const related = contacts.filter(c => c.document === contact.document);
      console.log('✅ Contatos relacionados encontrados:', related.length);
      return related;
    },
    enabled: !!contact?.document,
    initialData: [],
  });

  console.log('📊 Dados carregados:', {
    totalTickets: allTickets.length,
    contactId,
    contactDocument: contact?.document,
    relatedContactsCount: relatedContacts.length,
    relatedContactIds: relatedContacts.map(c => c.id)
  });

  // Filtrar tickets do cliente (por todos os contact_ids relacionados)
  const customerTickets = allTickets.filter(ticket => {
    const relatedIds = relatedContacts.map(c => c.id);
    const isRelated = relatedIds.includes(ticket.contact_id);
    
    if (isRelated) {
      console.log('✅ Ticket relacionado encontrado:', {
        ticketId: ticket.id,
        contactId: ticket.contact_id,
        subject: ticket.subject,
        status: ticket.status
      });
    }
    
    return isRelated;
  }).sort((a, b) => new Date(b.created_date) - new Date(a.created_date));

  console.log('📋 Tickets do cliente filtrados:', customerTickets.length);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-600">Carregando histórico...</span>
      </div>
    );
  }

  if (customerTickets.length === 0) {
    return (
      <div className="text-center py-8">
        <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500 text-sm">Nenhum histórico de atendimento encontrado</p>
        {contact?.document && (
          <p className="text-xs text-gray-400 mt-1">CPF: {contact.document}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h4 className="font-semibold text-gray-900 dark:text-gray-100">
            Histórico de Atendimentos
          </h4>
          {contact?.document && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              CPF: {contact.document} - {customerTickets.length} ticket{customerTickets.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
        {customerTickets.map((ticket) => (
          <Link 
            key={ticket.id} 
            to={`${createPageUrl("TicketView")}?id=${ticket.id}`}
            className="block hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
                    {ticket.subject}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    #{ticket.id.slice(0, 8)}
                  </p>
                </div>
                <Badge className={
                  ticket.status === 'novo' ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300' :
                  ticket.status === 'em_atendimento' ? 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300' :
                  ticket.status === 'resolvido' ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300' :
                  ticket.status === 'fechado' ? 'bg-gray-100 text-gray-700 dark:bg-gray-900 dark:text-gray-300' :
                  'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300'
                }>
                  {ticket.status === 'novo' ? 'Novo' :
                   ticket.status === 'em_atendimento' ? 'Em Atendimento' :
                   ticket.status === 'resolvido' ? 'Resolvido' :
                   ticket.status === 'fechado' ? 'Fechado' :
                   ticket.status}
                </Badge>
              </div>

              <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                <div className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {format(new Date(ticket.created_date), "dd/MM/yyyy", { locale: ptBR })}
                </div>
                {ticket.priority && (
                  <Badge variant="outline" className="text-xs">
                    {ticket.priority}
                  </Badge>
                )}
                {ticket.category && (
                  <span className="truncate">{ticket.category}</span>
                )}
              </div>

              {ticket.completion_description && (
                <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                  <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
                    {ticket.completion_description}
                  </p>
                </div>
              )}

              {ticket.resolved_at && (
                <div className="flex items-center gap-1 mt-2 text-xs text-green-600 dark:text-green-400">
                  <CheckCircle className="w-3 h-3" />
                  Resolvido em {format(new Date(ticket.resolved_at), "dd/MM/yyyy", { locale: ptBR })}
                </div>
              )}
            </div>
          </Link>
        ))}
      </div>

      {customerTickets.length > 5 && (
        <div className="text-center pt-2">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Mostrando {customerTickets.length} atendimento{customerTickets.length !== 1 ? 's' : ''} anteriores
          </p>
        </div>
      )}
    </div>
  );
}