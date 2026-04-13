
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Plus, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { createPageUrl } from "@/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const statusColors = {
  new: "bg-blue-100 text-blue-700",
  assigned: "bg-purple-100 text-purple-700",
  in_progress: "bg-yellow-100 text-yellow-700",
  waiting_customer: "bg-orange-100 text-orange-700",
  resolved: "bg-green-100 text-green-700",
  closed: "bg-gray-100 text-gray-700",
};

const statusLabels = {
  new: "Novo",
  assigned: "Atribuído",
  in_progress: "Em Atendimento",
  waiting_customer: "Aguardando Você",
  resolved: "Resolvido",
  closed: "Fechado",
};

const priorityColors = {
  P1: "bg-red-100 text-red-700 border-red-300",
  P2: "bg-orange-100 text-orange-700 border-orange-300",
  P3: "bg-blue-100 text-blue-700 border-blue-300",
  P4: "bg-gray-100 text-gray-700 border-gray-300",
};

export default function PortalTickets() {
  const navigate = useNavigate();
  const [contact, setContact] = useState(null);

  useEffect(() => {
    const isAuth = localStorage.getItem('portal_authenticated');
    if (!isAuth) {
      navigate(createPageUrl("PortalLogin"));
      return;
    }

    const contactData = localStorage.getItem('portal_contact');
    if (contactData) setContact(JSON.parse(contactData));
  }, [navigate]);

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ['portalTickets', contact?.id],
    queryFn: async () => {
      if (!contact?.id) return [];
      const allTickets = await base44.entities.Ticket.list('-createdDate');
      return allTickets.filter(t => t.contact_id === contact.id && t.ticket_type === 'support');
    },
    enabled: !!contact?.id,
    initialData: [],
  });

  const openTickets = tickets.filter(t => !['resolved', 'closed'].includes(t.status));
  const closedTickets = tickets.filter(t => ['resolved', 'closed'].includes(t.status));

  const renderTicketCard = (ticket) => {
    const isAtRisk = ticket.sla_resolution_deadline && 
      new Date(ticket.sla_resolution_deadline) < new Date(Date.now() + 4 * 60 * 60 * 1000) &&
      ticket.status !== 'resolved' && ticket.status !== 'closed';

    return (
      <Card
        key={ticket.id}
        className="cursor-pointer hover:shadow-lg transition-all"
        onClick={() => navigate(`${createPageUrl("PortalTicketView")}?id=${ticket.id}`)}
      >
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <Badge variant="outline" className={`${priorityColors[ticket.priority]} border font-semibold text-xs`}>
                  {ticket.priority}
                </Badge>
                <Badge className={statusColors[ticket.status]}>
                  {statusLabels[ticket.status]}
                </Badge>
                {isAtRisk && (
                  <Badge className="bg-orange-100 text-orange-700">
                    <AlertCircle className="w-3 h-3 mr-1" />
                    Em risco
                  </Badge>
                )}
              </div>
              <h4 className="font-semibold text-gray-900 mb-1">{ticket.subject}</h4>
              <p className="text-sm text-gray-600">
                {ticket.category || 'Atendimento'} • #{ticket.id.slice(0, 8)}
              </p>
            </div>
          </div>
          
          <div className="flex items-center justify-between text-xs text-gray-500 mt-3 pt-3 border-t">
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {format(new Date(ticket.created_date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            </div>
            {ticket.resolved_at && (
              <div className="flex items-center gap-1 text-green-600">
                <CheckCircle2 className="w-3 h-3" />
                Resolvido
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  if (!contact) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <div className="w-full px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Meus Atendimentos</h1>
            <p className="text-gray-600">Acompanhe suas solicitações</p>
          </div>
          <Button
            onClick={() => navigate(createPageUrl("PortalCreateTicket"))}
            className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            Novo Atendimento
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        ) : tickets.length === 0 ? (
          <Card className="shadow-lg">
            <CardContent className="py-12 text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Nenhum Atendimento
              </h3>
              <p className="text-gray-600 mb-6">
                Você ainda não possui atendimentos registrados.
              </p>
              <Button
                onClick={() => navigate(createPageUrl("PortalCreateTicket"))}
                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                Criar Primeiro Atendimento
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue="open" className="space-y-6">
            <TabsList className="bg-white shadow-sm border">
              <TabsTrigger value="open" className="data-[state=active]:bg-blue-50">
                Em Aberto ({openTickets.length})
              </TabsTrigger>
              <TabsTrigger value="closed" className="data-[state=active]:bg-green-50">
                Resolvidos ({closedTickets.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="open">
              {openTickets.length === 0 ? (
                <Card className="shadow-lg">
                  <CardContent className="py-12 text-center">
                    <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-green-500" />
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      Tudo Resolvido! 🎉
                    </h3>
                    <p className="text-gray-600">
                      Você não possui atendimentos em aberto no momento.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid md:grid-cols-2 gap-4">
                  {openTickets.map(renderTicketCard)}
                </div>
              )}
            </TabsContent>

            <TabsContent value="closed">
              {closedTickets.length === 0 ? (
                <Card className="shadow-lg">
                  <CardContent className="py-12 text-center">
                    <Clock className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                    <p className="text-gray-600">
                      Nenhum atendimento resolvido ainda.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid md:grid-cols-2 gap-4">
                  {closedTickets.map(renderTicketCard)}
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}
