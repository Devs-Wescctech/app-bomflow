import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Clock,
  AlertCircle,
  CheckCircle,
  User,
  MapPin,
  FileText,
  Calendar,
  Tag,
  ArrowLeft,
  MessageSquare,
  Send,
  Paperclip,
  Timer,
  AlertTriangle,
  UserCog,
  RotateCcw,
  Users,
  Edit,
  FileSignature,
  Link as LinkIcon,
  Mail,
  ExternalLink,
  Loader2,
  CheckCircle2,
  Inbox
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { toast } from "sonner";

import SmartReplyBox from "@/components/ai/SmartReplyBox";
import SLATimers from "../components/ticket/SLATimers";
import TicketTimeline from "../components/ticket/TicketTimeline";
import CustomerInfo from "../components/ticket/CustomerInfo";
import DependentsList from "../components/ticket/DependentsList";
import AttachmentsUpload from "../components/ticket/AttachmentsUpload";
import CompletionForm from "../components/ticket/CompletionForm";
import SignaturePad from "../components/ticket/SignaturePad";
import TicketDetailsCard from "../components/ticket/TicketDetailsCard";

export default function TicketView() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const ticketId = urlParams.get('id');

  const [newMessage, setNewMessage] = useState("");
  const [showCompletionForm, setShowCompletionForm] = useState(false);
  const [showAgentChange, setShowAgentChange] = useState(false);
  const [newAgentId, setNewAgentId] = useState("");
  const [showQueueChange, setShowQueueChange] = useState(false);
  const [newQueueId, setNewQueueId] = useState("");
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [isCompletingTicket, setIsCompletingTicket] = useState(false);

  const [signatureMethod, setSignatureMethod] = useState("presencial");
  const [signatureEmail, setSignatureEmail] = useState("");
  const [signatureWhatsapp, setSignatureWhatsapp] = useState("");
  const [isSendingSignature, setIsSendingSignature] = useState(false);
  const [signatureDocumentId, setSignatureDocumentId] = useState("");
  const [signatureStatus, setSignatureStatus] = useState("");
  const [isCheckingSignature, setIsCheckingSignature] = useState(false);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

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

  const { data: dependent } = useQuery({
    queryKey: ['dependent', ticket?.dependent_id],
    queryFn: async () => {
      if (!ticket?.dependent_id) return null;
      const dependents = await base44.entities.Dependent.list();
      return dependents.find(d => d.id === ticket.dependent_id);
    },
    enabled: !!ticket?.dependent_id,
  });

  const { data: dependents = [] } = useQuery({
    queryKey: ['dependents', ticket?.contract_id],
    queryFn: async () => {
      if (!ticket?.contract_id) return [];
      return await base44.entities.Dependent.filter({ contract_id: ticket.contract_id });
    },
    enabled: !!ticket?.contract_id,
    initialData: [],
  });

  const { data: createdByAgent } = useQuery({
    queryKey: ['createdByAgent', ticket?.created_by_agent_id],
    queryFn: async () => {
      if (!ticket?.created_by_agent_id) return null;
      const agents = await base44.entities.Agent.list();
      return agents.find(a => a.id === ticket.created_by_agent_id);
    },
    enabled: !!ticket?.created_by_agent_id,
  });

  const { data: currentAgent } = useQuery({
    queryKey: ['agent', ticket?.agent_id],
    queryFn: async () => {
      if (!ticket?.agent_id) return null;
      const agents = await base44.entities.Agent.list();
      return agents.find(a => a.id === ticket.agent_id);
    },
    enabled: !!ticket?.agent_id,
  });

  const { data: completedByAgent } = useQuery({
    queryKey: ['completedAgent', ticket?.completed_by_agent_id],
    queryFn: async () => {
      if (!ticket?.completed_by_agent_id) return null;
      const agents = await base44.entities.Agent.list();
      return agents.find(a => a.id === ticket.completed_by_agent_id);
    },
    enabled: !!ticket?.completed_by_agent_id,
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

  const { data: messages = [] } = useQuery({
    queryKey: ['ticketMessages', ticketId],
    queryFn: async () => {
      const allMessages = await base44.entities.TicketMessage.list();
      return allMessages.filter(m => m.ticket_id === ticketId);
    },
    enabled: !!ticketId,
    initialData: [],
  });

  const updateTicketMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Ticket.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticket', ticketId] });
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
    },
  });

  const addMessageMutation = useMutation({
    mutationFn: (data) => base44.entities.TicketMessage.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticketMessages', ticketId] });
      setNewMessage("");
      toast.success('Mensagem enviada com sucesso!');
    },
  });

  const handleSendMessage = async () => {
    if (!newMessage.trim()) {
      toast.error('Digite uma mensagem antes de enviar');
      return;
    }

    try {
      await addMessageMutation.mutateAsync({
        ticket_id: ticketId,
        message_type: 'agent_reply',
        author_email: user?.email,
        body: newMessage,
        channel: ticket.channel,
      });

      if (ticket.status === 'novo') {
        await updateTicketMutation.mutateAsync({
          id: ticketId,
          data: {
            status: 'em_atendimento',
            first_response_at: new Date().toISOString(),
          }
        });
      }
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
      toast.error('Erro ao enviar mensagem');
    }
  };

  const handleAgentChange = async () => {
    if (!newAgentId) return;

    const agentHistory = ticket.agent_history || [];
    agentHistory.push({
      previous_agent_id: ticket.agent_id,
      new_agent_id: newAgentId,
      changed_at: new Date().toISOString(),
      changed_by: user?.email,
    });

    await updateTicketMutation.mutateAsync({
      id: ticketId,
      data: {
        agent_id: newAgentId,
        agent_history: agentHistory,
        status: ticket.status === 'novo' ? 'atribuido' : ticket.status,
      }
    });

    setShowAgentChange(false);
    setNewAgentId("");
    toast.success('Agente alterado com sucesso');
  };

  const handleQueueChange = async () => {
    if (!newQueueId) return;

    const queueHistory = ticket.queue_history || [];
    queueHistory.push({
      previous_queue_id: ticket.queue_id,
      new_queue_id: newQueueId,
      changed_at: new Date().toISOString(),
      changed_by: user?.email,
    });

    await updateTicketMutation.mutateAsync({
      id: ticketId,
      data: {
        queue_id: newQueueId,
        queue_history: queueHistory,
      }
    });

    setShowQueueChange(false);
    setNewQueueId("");
    toast.success('Fila alterada com sucesso');
  };

  const handleComplete = async (completionData) => {
    setIsCompletingTicket(true);
    try {
      const currentAgentRecord = agents.find(a => a.user_email === user?.email);
      
      await updateTicketMutation.mutateAsync({
        id: ticketId,
        data: {
          ...completionData,
          status: 'resolvido',
          resolved_at: new Date().toISOString(),
          completed_by_agent_id: currentAgentRecord?.id,
        }
      });

      setShowCompletionForm(false);
      toast.success('Ticket finalizado com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['ticket', ticketId] });
    } catch (error) {
      console.error('Erro ao finalizar ticket:', error);
      toast.error('Erro ao finalizar ticket: ' + error.message);
    } finally {
      setIsCompletingTicket(false);
    }
  };

  const handleReopen = async () => {
    const reopenHistory = ticket.reopen_history || [];
    reopenHistory.push({
      reopened_at: new Date().toISOString(),
      reopened_by: user?.email,
      previous_status: ticket.status,
    });

    await updateTicketMutation.mutateAsync({
      id: ticketId,
      data: {
        status: 'em_atendimento',
        reopened_count: (ticket.reopened_count || 0) + 1,
        reopen_history: reopenHistory,
      }
    });

    toast.success('Ticket reaberto');
  };

  const handleSignatureSave = async (signatureDataUrl) => {
    try {
      const blob = await fetch(signatureDataUrl).then(r => r.blob());
      const file = new File([blob], `signature-${ticketId}.png`, { type: 'image/png' });
      
      const { data } = await base44.functions.invoke('Core.UploadFile', { file });
      
      await updateTicketMutation.mutateAsync({
        id: ticketId,
        data: {
          signature_url: data.file_url,
          signature_date: new Date().toISOString(),
          signature_method: 'presencial',
          signature_agent_id: user?.email,
          signature_status: 'signed',
        }
      });

      setShowSignaturePad(false);
      toast.success('Assinatura salva com sucesso!');
    } catch (error) {
      console.error('Erro ao salvar assinatura:', error);
      toast.error('Erro ao salvar assinatura');
    }
  };

  const handleSendSignatureRequest = async () => {
    setIsSendingSignature(true);
    try {
      if (signatureMethod === 'link_whatsapp') {
        const token = Math.random().toString(36).substring(2, 15);
        
        await updateTicketMutation.mutateAsync({
          id: ticketId,
          data: {
            signature_link_token: token,
            signature_method: 'link_whatsapp',
            signature_status: 'pending',
          }
        });

        const signatureUrl = `${window.location.origin}${createPageUrl('PublicSignature')}?token=${token}`;
        
        const message = `Olá! Para finalizar seu atendimento, precisamos da sua assinatura digital. Clique no link: ${signatureUrl}`;
        const whatsappUrl = `https://wa.me/${signatureWhatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
        
        window.open(whatsappUrl, '_blank');
        toast.success('Link de assinatura gerado! Envie via WhatsApp.');
        
      } else if (signatureMethod === 'autentique') {
        const response = await base44.functions.invoke('autentiqueCreateDocument', {
          ticket_id: ticketId,
          signer_email: signatureEmail,
          signer_name: contact?.name || 'Cliente',
        });

        if (response.data.success) {
          setSignatureDocumentId(response.data.document_id);
          setSignatureStatus('pending');
          
          await updateTicketMutation.mutateAsync({
            id: ticketId,
            data: {
              signature_autentique_id: response.data.document_id,
              signature_link: response.data.sign_url,
              signature_method: 'autentique',
              signature_status: 'pending',
            }
          });

          toast.success('Documento criado no Autentique! Link enviado por email.');
        } else {
          toast.error('Erro ao criar documento: ' + response.data.error);
        }
      }
    } catch (error) {
      console.error('Erro ao enviar solicitação:', error);
      toast.error('Erro ao enviar solicitação de assinatura');
    } finally {
      setIsSendingSignature(false);
    }
  };

  const handleCheckSignatureStatus = async () => {
    setIsCheckingSignature(true);
    try {
      const response = await base44.functions.invoke('autentiqueCheckStatus', {
        document_id: ticket.signature_autentique_id,
      });

      if (response.data.success) {
        setSignatureStatus(response.data.status);
        
        if (response.data.status === 'signed') {
          await updateTicketMutation.mutateAsync({
            id: ticketId,
            data: {
              signature_status: 'signed',
              signature_date: new Date().toISOString(),
            }
          });
          toast.success('Documento assinado!');
        } else {
          toast.info('Status: ' + response.data.status);
        }
      }
    } catch (error) {
      console.error('Erro ao verificar status:', error);
      toast.error('Erro ao verificar status da assinatura');
    } finally {
      setIsCheckingSignature(false);
    }
  };

  useEffect(() => {
    if (ticket?.signature_autentique_id && ticket?.signature_status === 'pending') {
      const interval = setInterval(() => {
        handleCheckSignatureStatus();
      }, 30000);
      
      return () => clearInterval(interval);
    }
  }, [ticket?.signature_autentique_id, ticket?.signature_status]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Carregando ticket...</p>
        </div>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Ticket não encontrado</h2>
            <p className="text-gray-600 mb-4">O ticket que você está procurando não existe.</p>
            <Link to={createPageUrl("MyTickets")}>
              <Button>Voltar para Meus Tickets</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isResolved = ticket.status === 'resolvido' || ticket.status === 'fechado';
  const canComplete = !isResolved && ticket.status !== 'novo';
  const currentQueue = queues.find(q => q.id === ticket.queue_id);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to={createPageUrl("MyTickets")}>
              <Button variant="ghost" size="icon">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">#{ticket.id.slice(0, 8)}</h1>
              <p className="text-sm text-gray-600">{ticket.subject}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
          <Badge className={
            ticket.priority === 'P1' ? 'bg-red-100 text-red-700' :
            ticket.priority === 'P2' ? 'bg-orange-100 text-orange-700' :
            ticket.priority === 'P3' ? 'bg-yellow-100 text-yellow-700' :
            'bg-blue-100 text-blue-700'
          }>
            {ticket.priority}
          </Badge>
            <Badge className={
              ticket.status === 'novo' ? 'bg-blue-100 text-blue-700' :
              ticket.status === 'em_atendimento' ? 'bg-purple-100 text-purple-700' :
              ticket.status === 'resolvido' ? 'bg-green-100 text-green-700' :
              'bg-gray-100 text-gray-700'
            }>
              {ticket.status.replace(/_/g, ' ').toUpperCase()}
            </Badge>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6">
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {ticket.sla_breached && (
              <Alert variant="destructive">
                <AlertTriangle className="w-4 h-4" />
                <AlertDescription>
                  <strong>SLA Violado!</strong> Este ticket ultrapassou o prazo estabelecido.
                </AlertDescription>
              </Alert>
            )}

            {ticket.reopened_count > 0 && (
              <Alert>
                <RotateCcw className="w-4 h-4" />
                <AlertDescription>
                  Este ticket foi reaberto {ticket.reopened_count} vez(es).
                </AlertDescription>
              </Alert>
            )}

            <TicketDetailsCard ticket={ticket} contact={contact} contract={contract} dependent={dependent} />

            {/* Card de Fila */}
            <Card className="print:hidden">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Inbox className="w-5 h-5" />
                    Fila de Atendimento
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {currentQueue ? 'Fila Atual:' : 'Sem Fila'}
                    </p>
                    {currentQueue && (
                      <div className="flex items-center gap-3 mt-2">
                        <div className="w-10 h-10 bg-blue-100 dark:bg-blue-950 rounded-full flex items-center justify-center">
                          <Inbox className="w-5 h-5 text-blue-700 dark:text-blue-300" />
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900 dark:text-gray-100">
                            {currentQueue.name}
                          </p>
                          {currentQueue.team_id && (
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              Time: {queues.find(q => q.id === currentQueue.team_id)?.name || 'N/A'}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  {!isResolved && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowQueueChange(!showQueueChange)}
                    >
                      Transferir
                    </Button>
                  )}
                </div>

                {showQueueChange && (
                  <div className="pt-4 border-t space-y-3">
                    <Label>Transferir Para Fila:</Label>
                    <Select value={newQueueId} onValueChange={setNewQueueId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione a fila" />
                      </SelectTrigger>
                      <SelectContent>
                        {queues.map(queue => (
                          <SelectItem key={queue.id} value={queue.id}>
                            {queue.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      onClick={handleQueueChange}
                      disabled={!newQueueId || newQueueId === ticket.queue_id || updateTicketMutation.isPending}
                      className="w-full bg-blue-600 hover:bg-blue-700"
                    >
                      {updateTicketMutation.isPending ? 'Transferindo...' : 'Confirmar Transferência'}
                    </Button>
                  </div>
                )}

                {ticket.queue_history && ticket.queue_history.length > 0 && (
                  <div className="pt-4 border-t">
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Histórico de Transferências:</p>
                    <div className="space-y-2">
                      {ticket.queue_history.map((change, idx) => {
                        const prevQueue = queues.find(q => q.id === change.previous_queue_id);
                        const newQueue = queues.find(q => q.id === change.new_queue_id);
                        return (
                          <div key={idx} className="text-xs text-gray-600 bg-gray-50 dark:bg-gray-800 p-2 rounded">
                            De: <strong>{prevQueue?.name || 'N/A'}</strong> → Para: <strong>{newQueue?.name || 'N/A'}</strong>
                            <br />
                            {change.changed_by || 'Sistema'} em {format(new Date(change.changed_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="print:hidden">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <UserCog className="w-5 h-5" />
                    Agentes do Ticket
                  </span>
                  {isResolved && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleReopen}
                      disabled={updateTicketMutation.isPending}
                    >
                      <RotateCcw className="w-4 h-4 mr-2" />
                      Reabrir
                    </Button>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {createdByAgent && (
                  <div className="pb-4 border-b border-gray-200 dark:border-gray-700">
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Ticket Aberto Por:</p>
                    <div className="flex items-center gap-3">
                      {createdByAgent.photo_url ? (
                        <img 
                          src={createdByAgent.photo_url} 
                          alt={createdByAgent.name}
                          className="w-12 h-12 rounded-full object-cover ring-2 ring-blue-100 dark:ring-blue-900"
                        />
                      ) : (
                        <div className="w-12 h-12 bg-blue-100 dark:bg-blue-950 rounded-full flex items-center justify-center">
                          <span className="text-blue-700 dark:text-blue-300 font-semibold text-lg">
                            {createdByAgent.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-gray-100">
                          {createdByAgent.name}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {createdByAgent.user_email}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                          {format(new Date(ticket.created_date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {currentAgent ? 'Responsável Atual:' : 'Não Atribuído'}
                    </p>
                    {currentAgent && (
                      <div className="flex items-center gap-3 mt-2">
                        {currentAgent.photo_url ? (
                          <img 
                            src={currentAgent.photo_url} 
                            alt={currentAgent.name}
                            className="w-12 h-12 rounded-full object-cover ring-2 ring-green-100 dark:ring-green-900"
                          />
                        ) : (
                          <div className="w-12 h-12 bg-green-100 dark:bg-green-950 rounded-full flex items-center justify-center">
                            <span className="text-green-700 dark:text-green-300 font-semibold text-lg">
                              {currentAgent.name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                        )}
                        <div>
                          <p className="font-semibold text-gray-900 dark:text-gray-100">
                            {currentAgent.name}
                          </p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            {currentAgent.user_email}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                  {!isResolved && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAgentChange(!showAgentChange)}
                    >
                      {currentAgent ? 'Transferir' : 'Atribuir'}
                    </Button>
                  )}
                </div>

                {showAgentChange && (
                  <div className="pt-4 border-t space-y-3">
                    <Label>
                      {currentAgent ? 'Transferir Para:' : 'Atribuir Para:'}
                    </Label>
                    <Select value={newAgentId} onValueChange={setNewAgentId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o agente" />
                      </SelectTrigger>
                      <SelectContent>
                        {agents.map(agent => (
                          <SelectItem key={agent.id} value={agent.id}>
                            {agent.name} ({agent.user_email})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      onClick={handleAgentChange}
                      disabled={!newAgentId || newAgentId === ticket.agent_id || updateTicketMutation.isPending}
                      className="w-full bg-blue-600 hover:bg-blue-700"
                    >
                      {updateTicketMutation.isPending ? 'Salvando...' : currentAgent ? 'Confirmar Transferência' : 'Confirmar Atribuição'}
                    </Button>
                  </div>
                )}

                {isResolved && completedByAgent && (
                  <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Concluído Por:</p>
                    <div className="flex items-center gap-3">
                      {completedByAgent.photo_url ? (
                        <img 
                          src={completedByAgent.photo_url} 
                          alt={completedByAgent.name}
                          className="w-12 h-12 rounded-full object-cover ring-2 ring-green-100 dark:ring-green-900"
                        />
                      ) : (
                        <div className="w-12 h-12 bg-green-100 dark:bg-green-950 rounded-full flex items-center justify-center">
                          <CheckCircle className="w-6 h-6 text-green-700 dark:text-green-300" />
                        </div>
                      )}
                      <div>
                        <p className="font-semibold text-green-700 dark:text-green-300">
                          {completedByAgent.name}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {completedByAgent.user_email}
                        </p>
                        {ticket.resolved_at && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {format(new Date(ticket.resolved_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {ticket.agent_history && ticket.agent_history.length > 0 && (
                  <div className="pt-4 border-t">
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Histórico de Transferências:</p>
                    <div className="space-y-2">
                      {ticket.agent_history.map((change, idx) => (
                        <div key={idx} className="text-xs text-gray-600 bg-gray-50 dark:bg-gray-800 p-2 rounded">
                          Alterado por {change.changed_by || 'Sistema'} em {format(new Date(change.changed_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {ticket.requires_signature && (
              <Card className="border-purple-200 bg-purple-50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-purple-900">
                    <FileSignature className="w-5 h-5" />
                    Assinatura Requerida
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {ticket.signature_status === 'signed' ? (
                    <div className="space-y-3">
                      <Alert className="bg-green-50 border-green-200">
                        <CheckCircle className="w-4 h-4 text-green-600" />
                        <AlertDescription className="text-green-800">
                          <strong>Assinatura Coletada!</strong>
                        </AlertDescription>
                      </Alert>
                      
                      {ticket.signature_url && (
                        <div>
                          <Label>Assinatura:</Label>
                          <img 
                            src={ticket.signature_url} 
                            alt="Assinatura" 
                            className="border rounded mt-2 max-w-xs bg-white p-4"
                          />
                        </div>
                      )}
                      
                      {ticket.signature_date && (
                        <div className="text-sm text-gray-600 space-y-1 bg-gray-50 p-3 rounded-lg">
                          <p><strong>Data:</strong> {format(new Date(ticket.signature_date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
                          <p><strong>Método:</strong> {
                            ticket.signature_method === 'presencial' ? 'Presencial (Tablet)' : 
                            ticket.signature_method === 'autentique' ? 'Assinatura Digital (Autentique)' : 
                            'Link WhatsApp'
                          }</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <Label>Método de Assinatura</Label>
                        <Select value={signatureMethod} onValueChange={setSignatureMethod}>
                          <SelectTrigger className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="presencial">📱 Presencial (Tablet/Celular)</SelectItem>
                            <SelectItem value="link_whatsapp">💬 Enviar Link via WhatsApp</SelectItem>
                            <SelectItem value="autentique">✍️ Assinatura Digital (Autentique)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {signatureMethod === 'presencial' && (
                        <div>
                          <Button 
                            onClick={() => setShowSignaturePad(true)} 
                            className="w-full bg-purple-600 hover:bg-purple-700"
                          >
                            <FileSignature className="w-4 h-4 mr-2" />
                            Coletar Assinatura Agora
                          </Button>
                        </div>
                      )}

                      {signatureMethod === 'link_whatsapp' && (
                        <div className="space-y-3">
                          <div>
                            <Label>WhatsApp do Cliente</Label>
                            <Input
                              value={signatureWhatsapp}
                              onChange={(e) => setSignatureWhatsapp(e.target.value)}
                              placeholder="(00) 00000-0000"
                              className="mt-1"
                            />
                          </div>
                          <Button 
                            onClick={handleSendSignatureRequest}
                            disabled={!signatureWhatsapp || isSendingSignature}
                            className="w-full bg-green-600 hover:bg-green-700"
                          >
                            {isSendingSignature ? 'Enviando...' : 'Gerar e Enviar Link'}
                          </Button>
                        </div>
                      )}

                      {signatureMethod === 'autentique' && (
                        <div className="space-y-3">
                          <div>
                            <Label>E-mail do Cliente</Label>
                            <Input
                              value={signatureEmail}
                              onChange={(e) => setSignatureEmail(e.target.value)}
                              placeholder="cliente@email.com"
                              className="mt-1"
                            />
                          </div>
                          <Button 
                            onClick={handleSendSignatureRequest}
                            disabled={!signatureEmail || isSendingSignature}
                            className="w-full bg-blue-600 hover:bg-blue-700"
                          >
                            {isSendingSignature ? 'Criando...' : 'Criar Documento no Autentique'}
                          </Button>
                          
                          {ticket.signature_autentique_id && (
                            <div className="space-y-2">
                              <Alert>
                                <AlertDescription>
                                  Documento criado! Link enviado para o cliente.
                                </AlertDescription>
                              </Alert>
                              <div className="flex gap-2">
                                <Button 
                                  variant="outline"
                                  onClick={handleCheckSignatureStatus}
                                  disabled={isCheckingSignature}
                                  className="flex-1"
                                >
                                  {isCheckingSignature ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Verificar Status'}
                                </Button>
                                {ticket.signature_link && (
                                  <Button
                                    variant="outline"
                                    onClick={() => window.open(ticket.signature_link, '_blank')}
                                  >
                                    <ExternalLink className="w-4 h-4" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {showSignaturePad && (
              <SignaturePad
                onSave={handleSignatureSave}
                onCancel={() => setShowSignaturePad(false)}
              />
            )}

            {/* Anexos do Ticket */}
            <AttachmentsUpload 
              attachments={ticket.attachments || []}
              onAttachmentsChange={(newAttachments) => {
                updateTicketMutation.mutate({
                  id: ticketId,
                  data: { attachments: newAttachments }
                });
              }}
              allowUpload={!isResolved}
            />

            {canComplete && !showCompletionForm && (
              <div className="flex justify-end">
                <Button
                  onClick={() => setShowCompletionForm(true)}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Finalizar Ticket
                </Button>
              </div>
            )}

            {!isResolved && showCompletionForm && (
              <CompletionForm 
                onComplete={handleComplete}
                onCancel={() => setShowCompletionForm(false)}
                isSubmitting={isCompletingTicket}
                ticket={ticket}
                contact={contact}
                contract={contract}
              />
            )}

            {isResolved && (
              <Card className="border-green-200 bg-green-50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-green-800">
                    <CheckCircle className="w-5 h-5" />
                    Ticket Finalizado
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {ticket.completion_description && (
                    <div>
                      <Label className="text-green-800">Descrição da Finalização:</Label>
                      <div className="mt-1 p-3 bg-white rounded border border-green-200">
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">
                          {ticket.completion_description}
                        </p>
                      </div>
                    </div>
                  )}
                  
                  <div className="grid grid-cols-2 gap-3">
                    {ticket.completion_reason && (
                      <div>
                        <Label className="text-xs text-gray-600">Motivo</Label>
                        <p className="text-sm font-semibold">{ticket.completion_reason}</p>
                      </div>
                    )}
                    {ticket.completion_category && (
                      <div>
                        <Label className="text-xs text-gray-600">Categoria</Label>
                        <p className="text-sm font-semibold">{ticket.completion_category}</p>
                      </div>
                    )}
                    {ticket.completion_subcategory && (
                      <div>
                        <Label className="text-xs text-gray-600">Subcategoria</Label>
                        <p className="text-sm font-semibold">{ticket.completion_subcategory}</p>
                      </div>
                    )}
                    {ticket.completion_resolution && (
                      <div>
                        <Label className="text-xs text-gray-600">Resolução</Label>
                        <p className="text-sm font-semibold">{ticket.completion_resolution}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="w-5 h-5" />
                  Comunicação
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 mb-4 max-h-96 overflow-y-auto">
                  {messages.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      <MessageSquare className="w-12 h-12 mx-auto mb-2 opacity-30" />
                      <p>Nenhuma mensagem ainda</p>
                      <p className="text-sm mt-1">Seja o primeiro a responder</p>
                    </div>
                  )}
                  
                  {messages.map(msg => (
                    <div key={msg.id} className={`flex ${msg.message_type === 'agent_reply' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[70%] rounded-lg p-3 ${
                        msg.message_type === 'agent_reply' 
                          ? 'bg-blue-600 text-white' 
                          : msg.message_type === 'internal_note'
                          ? 'bg-yellow-100 text-yellow-900 border border-yellow-300'
                          : 'bg-gray-100 text-gray-900'
                      }`}>
                        {msg.message_type === 'internal_note' && (
                          <div className="flex items-center gap-1 mb-1 text-xs font-semibold">
                            <AlertCircle className="w-3 h-3" />
                            Nota Interna
                          </div>
                        )}
                        <p className="text-sm whitespace-pre-wrap">{msg.body}</p>
                        <div className={`flex items-center justify-between gap-3 mt-2 pt-2 border-t ${
                            msg.message_type === 'agent_reply' ? 'border-white/20' : 'border-gray-300'
                          }`}>
                          <p className={`text-xs ${
                            msg.message_type === 'agent_reply' ? 'text-blue-100' : 
                            msg.message_type === 'internal_note' ? 'text-yellow-700' : 
                            'text-gray-500'
                          }`}>
                            {msg.author_email?.split('@')[0] || 'Sistema'}
                          </p>
                          <p className={`text-xs ${
                            msg.message_type === 'agent_reply' ? 'text-blue-100' : 
                            msg.message_type === 'internal_note' ? 'text-yellow-700' : 
                            'text-gray-500'
                          }`}>
                            {format(new Date(msg.created_date), "dd/MM HH:mm")}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {!isResolved && (
                  <div className="space-y-3 pt-4 border-t">
                    <SmartReplyBox 
                      ticketId={ticketId} 
                      onSelectReply={(reply) => setNewMessage(reply)} 
                    />
                    <Textarea
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      placeholder="Digite sua mensagem..."
                      onKeyPress={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                      rows={3}
                      className="resize-none"
                    />
                    <div className="flex justify-end">
                      <Button 
                        onClick={handleSendMessage} 
                        disabled={!newMessage.trim() || addMessageMutation.isPending}
                        className="bg-blue-600 hover:bg-blue-700"
                      >
                        {addMessageMutation.isPending ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Enviando...
                          </>
                        ) : (
                          <>
                            <Send className="w-4 h-4 mr-2" />
                            Enviar Mensagem
                          </>
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-gray-500">
                      💡 Dica: Pressione Enter para enviar, Shift+Enter para nova linha
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            <TicketTimeline ticketId={ticketId} />
          </div>

          <div className="space-y-6">
            <SLATimers ticket={ticket} />
            <CustomerInfo contact={contact} contract={contract} />
            {dependents.length > 0 && <DependentsList dependents={dependents} />}
          </div>
        </div>
      </div>
    </div>
  );
}