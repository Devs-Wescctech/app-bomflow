
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Send, Loader2, MessageSquare, Calendar, User } from "lucide-react";
import { createPageUrl } from "@/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

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

export default function PortalTicketView() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const ticketId = urlParams.get('id');
  
  const [contact, setContact] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    const isAuth = localStorage.getItem('portal_authenticated');
    if (!isAuth) {
      navigate(createPageUrl("PortalLogin"));
      return;
    }

    const contactData = localStorage.getItem('portal_contact');
    if (contactData) setContact(JSON.parse(contactData));
  }, [navigate]);

  const { data: ticket, isLoading, refetch: refetchTicket } = useQuery({
    queryKey: ['portalTicket', ticketId],
    queryFn: async () => {
      const tickets = await base44.entities.Ticket.list();
      return tickets.find(t => t.id === ticketId);
    },
    enabled: !!ticketId,
  });

  const { data: messages = [], refetch: refetchMessages } = useQuery({
    queryKey: ['portalTicketMessages', ticketId],
    queryFn: () => base44.entities.TicketMessage.filter({ ticket_id: ticketId }, '-createdDate'),
    enabled: !!ticketId,
    initialData: [],
  });

  const handleSendReply = async () => {
    if (!replyText.trim()) {
      toast.error('Digite uma mensagem antes de enviar');
      return;
    }

    setIsSending(true);

    try {
      await base44.entities.TicketMessage.create({
        ticket_id: ticketId,
        message_type: 'customer_message',
        body: replyText,
        channel: 'webchat',
      });

      await refetchMessages();
      setReplyText('');
      toast.success('Mensagem enviada com sucesso!');
    } catch (error) {
      console.error('Erro ao enviar:', error);
      toast.error('Erro ao enviar mensagem');
    } finally {
      setIsSending(false);
    }
  };

  if (isLoading || !ticket || !contact) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const isResolved = ticket.status === 'resolved' || ticket.status === 'closed';

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Header */}
      <div className="bg-white border-b shadow-sm">
        <div className="w-full px-6 py-4"> {/* Changed max-w-5xl mx-auto to w-full */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate(createPageUrl("PortalTickets"))}
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-xl font-bold text-gray-900">{ticket.subject}</h1>
                <p className="text-sm text-gray-600">Atendimento #{ticket.id.slice(0, 8)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={`${priorityColors[ticket.priority]} border font-semibold`}>
                {ticket.priority}
              </Badge>
              <Badge className={statusColors[ticket.status]}>
                {statusLabels[ticket.status]}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="w-full p-6"> {/* Changed max-w-5xl mx-auto to w-full */}
        <div className="grid lg:grid-cols-3 gap-6 max-w-5xl mx-auto"> {/* Added max-w-5xl mx-auto here to maintain content width */}
          <div className="lg:col-span-2 space-y-6">
            {/* Descrição Inicial */}
            <Card className="shadow-lg">
              <CardHeader className="bg-gradient-to-r from-blue-50 to-purple-50 border-b">
                <CardTitle className="text-base">Descrição do Atendimento</CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <p className="text-gray-700 whitespace-pre-wrap">{ticket.description}</p>
              </CardContent>
            </Card>

            {/* Timeline de Mensagens */}
            <Card className="shadow-lg">
              <CardHeader className="border-b">
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="w-5 h-5" />
                  Histórico de Mensagens
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  {messages.length === 0 ? (
                    <p className="text-center text-gray-500 py-8">
                      Nenhuma mensagem ainda
                    </p>
                  ) : (
                    messages.map((msg) => {
                      const isCustomer = msg.message_type === 'customer_message';
                      
                      return (
                        <div 
                          key={msg.id}
                          className={`flex ${isCustomer ? 'justify-end' : 'justify-start'}`}
                        >
                          <div className={`max-w-[80%] ${
                            isCustomer 
                              ? 'bg-blue-100 text-blue-900' 
                              : 'bg-gray-100 text-gray-900'
                          } rounded-lg p-4`}>
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-xs font-semibold">
                                {isCustomer ? 'Você' : msg.author_email?.split('@')[0] || 'Atendente'}
                              </span>
                              <span className="text-xs text-gray-600">
                                {format(new Date(msg.created_date), "dd/MM HH:mm", { locale: ptBR })}
                              </span>
                            </div>
                            <p className="text-sm whitespace-pre-wrap">{msg.body}</p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Responder */}
            {!isResolved && (
              <Card className="shadow-lg">
                <CardHeader className="border-b">
                  <CardTitle className="text-base">Enviar Mensagem</CardTitle>
                </CardHeader>
                <CardContent className="pt-6 space-y-4">
                  <Textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Digite sua mensagem..."
                    rows={4}
                    disabled={isSending}
                  />
                  <div className="flex justify-end">
                    <Button
                      onClick={handleSendReply}
                      disabled={!replyText.trim() || isSending}
                      className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                    >
                      {isSending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Enviando...
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4 mr-2" />
                          Enviar
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {isResolved && (
              <Card className="shadow-lg bg-green-50 border-green-200">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center">
                      <MessageSquare className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-green-900">Atendimento Finalizado</h3>
                      <p className="text-sm text-green-700">
                        Este atendimento foi resolvido em {format(new Date(ticket.resolved_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Informações */}
            <Card className="shadow-lg">
              <CardHeader className="bg-gradient-to-r from-blue-50 to-purple-50 border-b">
                <CardTitle className="text-base flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Informações
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6 space-y-4">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Criado em</p>
                  <p className="font-medium text-gray-900">
                    {format(new Date(ticket.created_date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </p>
                </div>

                {ticket.category && (
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Categoria</p>
                    <p className="font-medium text-gray-900">{ticket.category}</p>
                  </div>
                )}

                <div>
                  <p className="text-sm text-gray-600 mb-1">Canal</p>
                  <p className="font-medium text-gray-900">{ticket.channel}</p>
                </div>

                {ticket.resolved_at && (
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Resolvido em</p>
                    <p className="font-medium text-gray-900">
                      {format(new Date(ticket.resolved_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Cliente */}
            <Card className="shadow-lg">
              <CardHeader className="bg-gradient-to-r from-blue-50 to-purple-50 border-b">
                <CardTitle className="text-base flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Seus Dados
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6 space-y-3">
                <div>
                  <p className="text-sm text-gray-600">Nome</p>
                  <p className="font-medium text-gray-900">{contact.name}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">CPF</p>
                  <p className="font-medium text-gray-900">{contact.document}</p>
                </div>
                {contact.phone && (
                  <div>
                    <p className="text-sm text-gray-600">Telefone</p>
                    <p className="font-medium text-gray-900">{contact.phone}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
