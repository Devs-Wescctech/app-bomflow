
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Send, Clock, AlertCircle, Loader2, CheckCircle, DollarSign, FileText, ArrowRight, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createPageUrl } from "@/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import AgreementForm from "../components/collection/AgreementForm";
import CollectionActionForm from "../components/collection/CollectionActionForm";

const priorityColors = {
  P1: "bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 border-red-300",
  P2: "bg-orange-100 dark:bg-orange-950 text-orange-700 dark:text-orange-300 border-orange-300",
  P3: "bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-300",
  P4: "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300",
};

const statusColors = {
  novo: "bg-red-100 text-red-700",
  atribuido: "bg-blue-100 text-blue-700",
  em_atendimento: "bg-orange-100 text-orange-700",
  aguardando_cliente: "bg-yellow-100 text-yellow-700",
  resolvido: "bg-green-100 text-green-700",
  fechado: "bg-gray-100 text-gray-700",
};

const statusLabels = {
  novo: 'Novo',
  atribuido: 'Acordo Registrado',
  em_atendimento: 'Em Contato',
  aguardando_cliente: 'Aguardando Retorno',
  resolvido: 'Acordo Efetivado',
  fechado: 'Fechado',
};

export default function CollectionTicketView() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const ticketId = urlParams.get('id');
  
  const [replyText, setReplyText] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [showAgreementForm, setShowAgreementForm] = useState(false);
  const [isRegisteringAgreement, setIsRegisteringAgreement] = useState(false);
  const [isEffectivatingAgreement, setIsEffectivatingAgreement] = useState(false);
  const [showActionForm, setShowActionForm] = useState(false);
  const [isRegisteringAction, setIsRegisteringAction] = useState(false);

  const { data: ticket, isLoading, refetch: refetchTicket } = useQuery({
    queryKey: ['ticket', ticketId],
    queryFn: async () => {
      const tickets = await base44.entities.Ticket.list();
      return tickets.find(t => t.id === ticketId);
    },
    enabled: !!ticketId,
  });

  const { data: contact } = useQuery({
    queryKey: ['contact', ticket?.contact_id],
    queryFn: async () => {
      if (!ticket?.contact_id) return null;
      const contacts = await base44.entities.Contact.list();
      return contacts.find(c => c.id === ticket.contact_id);
    },
    enabled: !!ticket?.contact_id,
  });

  const { data: contract } = useQuery({
    queryKey: ['contract', ticket?.contract_id],
    queryFn: async () => {
      if (!ticket?.contract_id) return null;
      const contracts = await base44.entities.Contract.list();
      return contracts.find(c => c.id === ticket.contract_id);
    },
    enabled: !!ticket?.contract_id,
  });

  const { data: queues = [] } = useQuery({
    queryKey: ['queues'],
    queryFn: () => base44.entities.Queue.list(),
    initialData: [],
  });

  const { data: messages = [], refetch: refetchMessages } = useQuery({
    queryKey: ['ticketMessages', ticketId],
    queryFn: () => base44.entities.TicketMessage.filter({ ticket_id: ticketId }, '-createdDate'),
    enabled: !!ticketId,
    initialData: [],
  });

  const updateTicketMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Ticket.update(id, data),
    onSuccess: () => {
      refetchTicket();
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      queryClient.invalidateQueries({ queryKey: ['collectionTickets'] });
    },
  });

  const handleSendReply = async () => {
    if (!replyText.trim()) {
      toast.error('Digite uma mensagem antes de enviar');
      return;
    }
    
    setIsSendingReply(true);
    
    try {
      await base44.entities.TicketMessage.create({
        ticket_id: ticketId,
        message_type: 'agent_reply',
        body: replyText,
        channel: ticket.channel,
      });
      
      if (ticket.status === 'novo') {
        await base44.entities.Ticket.update(ticketId, { 
          status: 'em_atendimento',
          first_response_at: new Date().toISOString(),
        });
      }
      
      await refetchMessages();
      await refetchTicket();
      setReplyText('');
      toast.success('Mensagem enviada com sucesso!');
    } catch (error) {
      console.error('Erro:', error);
      toast.error('Erro ao enviar resposta');
    } finally {
      setIsSendingReply(false);
    }
  };

  const handleRegisterAction = async (actionData) => {
    setIsRegisteringAction(true);
    
    try {
      const user = await base44.auth.me();
      
      // Parsear descrição atual do ticket
      let desc = {};
      try {
        desc = JSON.parse(ticket.description || '{}');
      } catch {}
      
      // Adicionar nova ação ao histórico
      const actions = desc.collection_actions || [];
      actions.push({
        ...actionData,
        timestamp: new Date().toISOString(), // Use current timestamp for consistency
        registered_by: user.email,
      });
      
      // Atualizar descrição com novo histórico
      desc.collection_actions = actions;
      
      // Criar mensagem no timeline
      const actionTypeLabels = {
        contact_attempt: "📞 Tentativa de Contato",
        information: "ℹ️ Informação sobre Débito",
        payment_promise: "🤝 Promessa de Pagamento",
        schedule_callback: "📅 Agendar Retorno",
        refusal: "❌ Recusa de Pagamento",
      };
      
      let messageBody = `${actionTypeLabels[actionData.action_type]}\n\n`;
      messageBody += `Resultado: ${actionData.result}\n`;
      if (actionData.notes) messageBody += `Observações: ${actionData.notes}\n`;
      if (actionData.promised_date) messageBody += `Data Prometida: ${format(new Date(actionData.promised_date), 'dd/MM/yyyy', { locale: ptBR })}\n`;
      if (actionData.promised_amount !== undefined && actionData.promised_amount !== null) messageBody += `Valor Prometido: R$ ${actionData.promised_amount.toFixed(2).replace('.', ',')}\n`;
      messageBody += `\nRegistrado por: ${user.email}`;
      
      await base44.entities.TicketMessage.create({
        ticket_id: ticketId,
        message_type: 'system_event',
        body: messageBody,
        channel: ticket.channel,
      });

      // Atualizar ticket
      let newStatus = ticket.status;
      if (ticket.status === 'novo') {
        newStatus = 'em_atendimento';
      } else if (actionData.action_type === 'schedule_callback' || actionData.action_type === 'payment_promise') {
        newStatus = 'aguardando_cliente';
      }

      await base44.entities.Ticket.update(ticketId, {
        description: JSON.stringify(desc),
        status: newStatus,
      });
      
      await refetchMessages();
      await refetchTicket();
      setShowActionForm(false);
      
      toast.success('✅ Ação registrada com sucesso!');
    } catch (error) {
      console.error('Erro:', error);
      toast.error('Erro ao registrar ação');
    } finally {
      setIsRegisteringAction(false);
    }
  };

  const handleRegisterAgreement = async (agreementData) => {
    setIsRegisteringAgreement(true);
    
    try {
      const user = await base44.auth.me();
      
      // Buscar fila de efetivação
      const effectivationQueue = queues.find(q => 
        q.name.toLowerCase().includes('efetivação') || 
        q.name.toLowerCase().includes('efetivacao')
      );
      
      if (!effectivationQueue) {
        toast.error('Fila de Efetivação não encontrada');
        return;
      }

      // Criar mensagem
      await base44.entities.TicketMessage.create({
        ticket_id: ticketId,
        message_type: 'system_event',
        body: `💰 Acordo Registrado pela Equipe de Contato\n\n` +
              `Valor do Acordo: R$ ${agreementData.collection_agreement_value.toFixed(2).replace('.', ',')}\n` +
              `Parcelas: ${agreementData.collection_installments}x\n` +
              `Forma de Pagamento: ${agreementData.collection_payment_method}\n` +
              `Termos: ${agreementData.collection_agreement_terms || 'Não especificado'}\n\n` +
              `Ticket movido para fila de Efetivação`,
        channel: ticket.channel,
      });

      // Atualizar ticket e mover para fila de efetivação
      await base44.entities.Ticket.update(ticketId, {
        ...agreementData,
        collection_agreement_registered_by: user.email,
        queue_id: effectivationQueue.id,
        status: 'atribuido', // Status "Acordo Registrado"
      });
      
      await refetchMessages();
      await refetchTicket();
      setShowAgreementForm(false);
      
      toast.success('✅ Acordo registrado! Ticket movido para Equipe de Efetivação');
    } catch (error) {
      console.error('Erro:', error);
      toast.error('Erro ao registrar acordo');
    } finally {
      setIsRegisteringAgreement(false);
    }
  };

  const handleEffectivateAgreement = async () => {
    setIsEffectivatingAgreement(true);
    
    try {
      await base44.entities.TicketMessage.create({
        ticket_id: ticketId,
        message_type: 'system_event',
        body: `✅ Acordo EFETIVADO no Sistema\n\nO acordo foi registrado no sistema financeiro e o processo de cobrança foi concluído com sucesso.`,
        channel: ticket.channel,
      });

      await base44.entities.Ticket.update(ticketId, {
        status: 'resolvido',
        resolved_at: new Date().toISOString(),
        closed_at: new Date().toISOString(),
      });
      
      await refetchMessages();
      await refetchTicket();
      
      toast.success('✅ Acordo efetivado com sucesso!');
    } catch (error) {
      console.error('Erro:', error);
      toast.error('Erro ao efetivar acordo');
    } finally {
      setIsEffectivatingAgreement(false);
    }
  };

  if (isLoading || !ticket) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
      </div>
    );
  }

  let desc = {};
  try {
    desc = JSON.parse(ticket.description || '{}');
  } catch {}

  const debtValue = desc.debt_value || 0;
  const collectionActions = desc.collection_actions || [];
  const isInContactQueue = queues.find(q => q.id === ticket.queue_id)?.name?.includes('Contato');
  const isInEffectivationQueue = queues.find(q => q.id === ticket.queue_id)?.name?.includes('Efetivação');
  const hasAgreement = !!ticket.collection_agreement_value;
  const isResolved = ticket.status === 'resolvido' || ticket.status === 'fechado';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="bg-white dark:bg-gray-900 border-b dark:border-gray-800 sticky top-0 z-10 print:hidden">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate(createPageUrl("CollectionBoard"))}
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  {ticket.subject}
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Ticket #{ticket.id.slice(0, 8)} • 
                  {isInContactQueue ? ' Equipe de Contato' : isInEffectivationQueue ? ' Equipe de Efetivação' : ' Cobrança'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={`${priorityColors[ticket.priority]} border font-semibold`}>
                {ticket.priority}
              </Badge>
              <Badge className={statusColors[ticket.status]}>
                {statusLabels[ticket.status] || ticket.status}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6">
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Informações da Dívida */}
            <Card className="border-2 border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/20">
              <CardHeader>
                <CardTitle className="text-red-800 dark:text-red-300 flex items-center gap-2">
                  <AlertCircle className="w-5 h-5" />
                  Situação da Dívida
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-red-300 dark:border-red-700">
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Valor da Dívida</p>
                    <p className="font-bold text-red-600 dark:text-red-400 text-2xl">
                      R$ {debtValue.toFixed(2).replace('.', ',')}
                    </p>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-red-300 dark:border-red-700">
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Dias em Atraso</p>
                    <p className="font-bold text-red-600 dark:text-red-400 text-2xl flex items-center gap-2">
                      <Clock className="w-5 h-5" />
                      {desc.days_overdue || 0}
                    </p>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-300 dark:border-gray-700">
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Plano</p>
                    <p className="font-semibold text-gray-900 dark:text-gray-100">{desc.plan || '-'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Histórico de Ações de Cobrança */}
            {collectionActions.length > 0 && (
              <Card className="border-orange-200 dark:border-orange-800">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-orange-800 dark:text-orange-300">
                    📋 Histórico de Ações de Cobrança
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {collectionActions.map((action, index) => {
                      const actionTypeLabels = {
                        contact_attempt: "📞 Tentativa de Contato",
                        information: "ℹ️ Informação sobre Débito",
                        payment_promise: "🤝 Promessa de Pagamento",
                        schedule_callback: "📅 Agendar Retorno",
                        refusal: "❌ Recusa de Pagamento",
                      };
                      
                      return (
                        <div key={index} className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                              {actionTypeLabels[action.action_type]}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {format(new Date(action.timestamp), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                            </span>
                          </div>
                          <div className="text-sm text-gray-700 dark:text-gray-300">
                            <p><strong>Resultado:</strong> {action.result}</p>
                            {action.notes && <p className="mt-1"><strong>Obs:</strong> {action.notes}</p>}
                            {action.promised_date && (
                              <p className="mt-1 text-green-600 dark:text-green-400">
                                <strong>Data Prometida:</strong> {format(new Date(action.promised_date), 'dd/MM/yyyy', { locale: ptBR })}
                              </p>
                            )}
                            {action.promised_amount !== undefined && (
                              <p className="mt-1 text-green-600 dark:text-green-400">
                                <strong>Valor Prometido:</strong> R$ {action.promised_amount.toFixed(2).replace('.', ',')}
                              </p>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                            Por: {action.registered_by}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Acordo (se existir) */}
            {hasAgreement && (
              <Card className="border-2 border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950/20">
                <CardHeader className="bg-gradient-to-r from-green-500 to-green-600 text-white rounded-t-lg">
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5" />
                    Acordo Registrado
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Valor do Acordo</p>
                      <p className="font-bold text-green-700 dark:text-green-400 text-2xl">
                        R$ {ticket.collection_agreement_value.toFixed(2).replace('.', ',')}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Parcelas</p>
                      <p className="font-semibold text-gray-900 dark:text-gray-100 text-lg">
                        {ticket.collection_installments}x de R$ {
                          (ticket.collection_agreement_value / ticket.collection_installments)
                            .toFixed(2)
                            .replace('.', ',')
                        }
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Forma de Pagamento</p>
                      <p className="font-medium text-gray-900 dark:text-gray-100">
                        {ticket.collection_payment_method}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Data do Acordo</p>
                      <p className="font-medium text-gray-900 dark:text-gray-100">
                        {format(new Date(ticket.collection_agreement_date), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </p>
                    </div>
                  </div>
                  {ticket.collection_agreement_terms && (
                    <div className="mt-4 p-3 bg-white dark:bg-gray-800 rounded-lg">
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Termos</p>
                      <p className="text-gray-900 dark:text-gray-100">{ticket.collection_agreement_terms}</p>
                    </div>
                  )}
                  {ticket.collection_agreement_notes && (
                    <div className="mt-3 p-3 bg-white dark:bg-gray-800 rounded-lg">
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Observações</p>
                      <p className="text-gray-900 dark:text-gray-100">{ticket.collection_agreement_notes}</p>
                    </div>
                  )}
                  {ticket.collection_agreement_registered_by && (
                    <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                      Registrado por: {ticket.collection_agreement_registered_by}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Timeline */}
            <Card>
              <CardHeader>
                <CardTitle>Timeline de Cobrança</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {[
                    {
                      id: `created-${ticket.id}`,
                      type: 'system',
                      timestamp: ticket.created_date,
                      content: 'Ticket de cobrança criado',
                    },
                    ...messages.map(msg => ({
                      id: msg.id,
                      type: msg.message_type,
                      timestamp: msg.created_date,
                      author: msg.author_email,
                      content: msg.body,
                    }))
                  ].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)).map((event, index, arr) => (
                    <div key={event.id} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          event.type === 'system_event' ? 'bg-blue-100 dark:bg-blue-950' :
                          event.type === 'agent_reply' ? 'bg-purple-100 dark:bg-purple-950' :
                          'bg-gray-100 dark:bg-gray-800'
                        }`}>
                          {event.type === 'system_event' && <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400" />}
                          {event.type === 'agent_reply' && <Send className="w-5 h-5 text-purple-600 dark:text-purple-400" />}
                          {event.type === 'system' && <Clock className="w-5 h-5 text-gray-600 dark:text-gray-400" />}
                        </div>
                        {index < arr.length - 1 && (
                          <div className="w-0.5 h-full bg-gray-200 dark:bg-gray-700 my-2"></div>
                        )}
                      </div>
                      
                      <div className="flex-1 pb-6">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-gray-900 dark:text-gray-100">
                            {event.type === 'agent_reply' ? event.author?.split('@')[0] || 'Agente' : 'Sistema'}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {format(new Date(event.timestamp), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                          </span>
                        </div>
                        <div className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{event.content}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Formulário de Ação (Equipe de Contato) */}
            {!isResolved && isInContactQueue && !hasAgreement && showActionForm && (
              <CollectionActionForm
                ticket={ticket}
                onSubmit={handleRegisterAction}
                onCancel={() => setShowActionForm(false)}
                isSubmitting={isRegisteringAction}
              />
            )}

            {/* Formulário de Acordo (Equipe de Contato) */}
            {!isResolved && isInContactQueue && !hasAgreement && showAgreementForm && (
              <AgreementForm
                ticket={ticket}
                onSubmit={handleRegisterAgreement}
                onCancel={() => setShowAgreementForm(false)}
                isSubmitting={isRegisteringAgreement}
              />
            )}

            {/* Ações */}
            {!isResolved && (
              <Card className="print:hidden">
                <CardHeader>
                  <CardTitle>Ações</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Equipe de Contato - Botões de Ação */}
                  {isInContactQueue && !hasAgreement && (
                    <>
                      {!showActionForm && !showAgreementForm && (
                        <div className="flex gap-3">
                          <Button
                            onClick={() => {
                                setShowActionForm(true);
                                setReplyText(''); // Clear reply text when opening action form
                            }}
                            className="flex-1 bg-orange-600 hover:bg-orange-700"
                          >
                            <Phone className="w-4 h-4 mr-2" />
                            Registrar Ação de Cobrança
                          </Button>
                          <Button
                            onClick={() => {
                                setShowAgreementForm(true);
                                setReplyText(''); // Clear reply text when opening agreement form
                            }}
                            className="flex-1 bg-blue-600 hover:bg-blue-700"
                          >
                            <FileText className="w-4 h-4 mr-2" />
                            Registrar Acordo
                          </Button>
                        </div>
                      )}
                      
                      {(showActionForm || showAgreementForm) && (
                        <Button
                          variant="outline"
                          onClick={() => {
                            setShowActionForm(false);
                            setShowAgreementForm(false);
                          }}
                          className="w-full"
                        >
                          Cancelar
                        </Button>
                      )}
                    </>
                  )}

                  {/* Equipe de Efetivação - Efetivar Acordo */}
                  {isInEffectivationQueue && hasAgreement && ticket.status === 'atribuido' && (
                    <div>
                      <Alert className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800 mb-4">
                        <AlertDescription className="text-blue-800 dark:text-blue-300">
                          ℹ️ Este acordo foi registrado pela Equipe de Contato e está aguardando efetivação no sistema.
                        </AlertDescription>
                      </Alert>
                      <Button
                        onClick={handleEffectivateAgreement}
                        disabled={isEffectivatingAgreement}
                        className="w-full bg-green-600 hover:bg-green-700"
                      >
                        {isEffectivatingAgreement ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Efetivando...
                          </>
                        ) : (
                          <>
                            <CheckCircle className="w-4 h-4 mr-2" />
                            Efetivar Acordo no Sistema
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Dados do Cliente */}
            {contact && (
              <Card>
                <CardHeader>
                  <CardTitle>Dados do Cliente</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Nome</p>
                    <p className="font-semibold text-gray-900 dark:text-gray-100">{contact.name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">CPF</p>
                    <p className="font-semibold text-gray-900 dark:text-gray-100">{contact.document}</p>
                  </div>
                  {contact.phones && contact.phones.length > 0 && (
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Telefone</p>
                      <p className="font-semibold text-gray-900 dark:text-gray-100">{contact.phones[0]}</p>
                    </div>
                  )}
                  {contact.emails && contact.emails.length > 0 && (
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Email</p>
                      <p className="font-semibold text-gray-900 dark:text-gray-100">{contact.emails[0]}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Informações do Contrato */}
            {contract && (
              <Card>
                <CardHeader>
                  <CardTitle>Contrato</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Plano</p>
                    <p className="font-semibold text-gray-900 dark:text-gray-100">{contract.plan}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Valor Mensal</p>
                    <p className="font-semibold text-gray-900 dark:text-gray-100">
                      R$ {contract.monthly_value?.toFixed(2).replace('.', ',')}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Status</p>
                    <Badge className={
                      contract.payment_status === 'overdue' ? 'bg-red-100 text-red-700' :
                      'bg-orange-100 text-orange-700'
                    }>
                      {contract.payment_status}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
