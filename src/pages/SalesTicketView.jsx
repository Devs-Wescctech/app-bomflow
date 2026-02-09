
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Package, User, CheckCircle, Phone, Printer, Clock, UserCheck, Calendar, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createPageUrl } from "@/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import PreSalesChecklist from "../components/sales/PreSalesChecklist";
import PreSalesHistory from "../components/sales/PreSalesHistory";
import PostSalesContactLog from "../components/sales/PostSalesContactLog";
import CompletionForm from "../components/ticket/CompletionForm";
import SLATimers from "../components/ticket/SLATimers";

const priorityColors = {
  P1: "bg-red-100 text-red-700 border-red-300",
  P2: "bg-orange-100 text-orange-700 border-orange-300",
  P3: "bg-blue-100 text-blue-700 border-blue-300",
  P4: "bg-gray-100 text-gray-700 border-gray-300",
};

export default function SalesTicketView() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const ticketId = urlParams.get('id');
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [showCompletionForm, setShowCompletionForm] = useState(false);
  const [whatsappValidation, setWhatsappValidation] = useState(null); // { valid: boolean, checking: false }
  const [validatingWhatsApp, setValidatingWhatsApp] = useState(false);

  const { data: ticket, isLoading, refetch: refetchTicket } = useQuery({
    queryKey: ['salesTicket', ticketId],
    queryFn: async () => {
      const tickets = await base44.entities.Ticket.list();
      return tickets.find(t => t.id === ticketId);
    },
    enabled: !!ticketId,
  });

  const { data: sale, refetch: refetchSale } = useQuery({
    queryKey: ['sale', ticket?.sale_id],
    queryFn: async () => {
      if (!ticket?.sale_id) return null;
      const sales = await base44.entities.Sale.list();
      return sales.find(s => s.id === ticket.sale_id);
    },
    enabled: !!ticket?.sale_id,
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

  const { data: currentAgent } = useQuery({
    queryKey: ['agent', ticket?.agent_id],
    queryFn: async () => {
      if (!ticket?.agent_id) return null;
      const agents = await base44.entities.Agent.list();
      return agents.find(a => a.id === ticket.agent_id);
    },
    enabled: !!ticket?.agent_id,
  });

  const { data: preSalesAgent } = useQuery({
    queryKey: ['preSalesAgent', sale?.pre_sales_agent_id],
    queryFn: async () => {
      if (!sale?.pre_sales_agent_id) return null;
      const agents = await base44.entities.Agent.list();
      return agents.find(a => a.id === sale.pre_sales_agent_id);
    },
    enabled: !!sale?.pre_sales_agent_id,
  });

  const { data: queues = [] } = useQuery({
    queryKey: ['queues'],
    queryFn: () => base44.entities.Queue.list(),
    initialData: [],
  });

  const handleValidateWhatsApp = async () => {
    if (!contact || !contact.phones || contact.phones.length === 0) {
      toast.error('Contato não possui telefone cadastrado');
      return;
    }

    setValidatingWhatsApp(true);

    try {
      const response = await base44.functions.invoke('validateWhatsApp', { 
        phone: contact.phones[0] 
      });

      setWhatsappValidation({
        valid: response.data.valid,
        message: response.data.message,
        phone: response.data.phone
      });

      if (response.data.valid) {
        toast.success('✅ WhatsApp válido! Envios disponíveis.');
      } else {
        toast.warning('❌ Este número não possui WhatsApp ativo');
      }
    } catch (error) {
      console.error('Erro ao validar WhatsApp:', error);
      toast.error('Erro ao validar WhatsApp');
    } finally {
      setValidatingWhatsApp(false);
    }
  };

  const handlePreSalesComplete = async (checklistData) => {
    setIsProcessing(true);
    
    try {
      // Atualizar venda com dados do checklist
      await base44.entities.Sale.update(sale.id, {
        ...checklistData,
        status: 'post_sales',
        pre_sales_agent_id: ticket.agent_id,
      });

      // Encontrar fila de pós-vendas
      const postSalesQueue = queues.find(q => 
        q.name.toLowerCase().includes('pós-venda') || 
        q.name.toLowerCase().includes('pos-venda') ||
        q.name.toLowerCase().includes('posvenda')
      );

      if (!postSalesQueue) {
        toast.error("Fila de Pós-Vendas não encontrada");
        setIsProcessing(false);
        return;
      }

      // Atualizar ticket para pós-vendas
      await base44.entities.Ticket.update(ticketId, {
        queue_id: postSalesQueue.id,
        category: 'post_sales',
        subject: ticket.subject.replace('Pré-Venda', 'Pós-Venda'),
        agent_id: null, // Resetar para redistribuição
      });

      await refetchTicket();
      await refetchSale();
      
      toast.success('Ticket enviado para Pós-Vendas com sucesso!');
      
    } catch (error) {
      console.error('Erro ao enviar para pós-vendas:', error);
      toast.error('Erro ao enviar para pós-vendas: ' + (error.message || 'Erro desconhecido'));
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePostSalesComplete = async (completionData) => {
    setIsProcessing(true);
    
    try {
      // Atualizar venda
      await base44.entities.Sale.update(sale.id, {
        status: 'confirmed',
        confirmation_date: new Date().toISOString(),
        confirmation_method: completionData.completion_origin || 'phone',
        post_sales_agent_id: ticket.agent_id,
        post_sales_notes: completionData.completion_description,
      });

      // Finalizar ticket
      await base44.entities.Ticket.update(ticketId, {
        status: 'resolvido',
        ...completionData,
        resolved_at: new Date().toISOString(),
        closed_at: new Date().toISOString(),
        completed_by_agent_id: ticket.agent_id,
      });

      await refetchTicket();
      await refetchSale();
      
      setShowCompletionForm(false);
      toast.success('Venda confirmada e ticket finalizado com sucesso!');
      
    } catch (error) {
      console.error('Erro ao finalizar:', error);
      toast.error('Erro ao finalizar: ' + (error.message || 'Erro desconhecido'));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReturnToPreSales = async () => {
    if (!confirm('Tem certeza que deseja retornar este ticket para Pré-Vendas?')) {
      return;
    }

    setIsProcessing(true);
    try {
      // Encontrar fila de pré-vendas
      const preSalesQueue = queues.find(q => 
        q.name.toLowerCase().includes('pré-venda') || 
        q.name.toLowerCase().includes('pre-venda')
      );

      if (!preSalesQueue) {
        toast.error("Fila de Pré-Vendas não encontrada");
        setIsProcessing(false);
        return;
      }

      // Atualizar venda
      await base44.entities.Sale.update(sale.id, {
        status: 'pre_sales',
      });

      // Atualizar ticket
      await base44.entities.Ticket.update(ticketId, {
        queue_id: preSalesQueue.id,
        category: 'pre_sales',
        subject: ticket.subject.replace('Pós-Venda', 'Pré-Venda'),
        agent_id: null, // Resetar para redistribuição
      });

      await refetchTicket();
      await refetchSale();
      
      toast.success('Ticket retornado para Pré-Vendas com sucesso!');
      
    } catch (error) {
      console.error('Erro ao retornar para pré-vendas:', error);
      toast.error('Erro ao retornar para pré-vendas: ' + (error.message || 'Erro desconhecido'));
    } finally {
      setIsProcessing(false);
    }
  };

  const calculateTimeSince = (dateString) => {
    if (!dateString) return null;
    const now = new Date();
    const past = new Date(dateString);
    const diffMs = now - past;
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 60) return `${diffMins} min`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ${diffMins % 60}m`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ${diffHours % 24}h`;
  };

  if (isLoading || !ticket) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const isPreSales = ticket.category === 'pre_sales';
  const isPostSales = ticket.category === 'post_sales';
  const isResolved = ticket.status === 'resolvido' || ticket.status === 'fechado';

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate(createPageUrl("SalesQueueBoard"))}
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-xl font-bold text-gray-900">
                  {ticket.subject}
                </h1>
                <p className="text-sm text-gray-500">Ticket #{ticket.id.slice(0, 8)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.print()}
              >
                <Printer className="w-4 h-4 mr-2" />
                Imprimir
              </Button>
              <Badge variant="outline" className={`${priorityColors[ticket.priority]} border font-semibold`}>
                {ticket.priority}
              </Badge>
              <Badge className={
                isPreSales ? 'bg-blue-100 text-blue-700' :
                isPostSales ? 'bg-purple-100 text-purple-700' :
                'bg-green-100 text-green-700'
              }>
                {isPreSales ? 'Pré-Venda' : isPostSales ? 'Pós-Venda' : 'Confirmado'}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6">
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* SLA Timers */}
            {!isResolved && (
              <SLATimers ticket={ticket} />
            )}

            {/* Informações da Venda */}
            {sale && (
              <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-white shadow-lg">
                <CardHeader className="border-b border-blue-200 bg-gradient-to-r from-blue-100/50 to-transparent">
                  <CardTitle className="flex items-center gap-2 text-blue-900">
                    <Package className="w-5 h-5" />
                    Informações da Venda
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="bg-white rounded-lg p-4 border border-blue-100">
                      <p className="text-sm text-gray-600 mb-1">Número do Pedido</p>
                      <p className="font-bold text-gray-900 text-lg">{sale.sale_number}</p>
                    </div>

                    <div className="bg-white rounded-lg p-4 border border-blue-100">
                      <p className="text-sm text-gray-600 mb-1">Status</p>
                      <Badge className={
                        sale.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                        sale.status === 'pre_sales' ? 'bg-blue-100 text-blue-700' :
                        sale.status === 'post_sales' ? 'bg-purple-100 text-purple-700' :
                        sale.status === 'confirmed' ? 'bg-green-100 text-green-700' :
                        'bg-gray-100 text-gray-700'
                      }>
                        {sale.status}
                      </Badge>
                    </div>

                    <div className="bg-white rounded-lg p-4 border border-blue-100">
                      <p className="text-sm text-gray-600 mb-1">Produto/Plano</p>
                      <p className="font-semibold text-gray-900">{sale.product_name}</p>
                    </div>

                    <div className="bg-white rounded-lg p-4 border border-blue-100">
                      <p className="text-sm text-gray-600 mb-1">Total de Dependentes</p>
                      <p className="font-semibold text-gray-900">{sale.total_dependents || 0}</p>
                    </div>

                    <div className="bg-white rounded-lg p-4 border border-green-100">
                      <p className="text-sm text-gray-600 mb-1">Valor Mensal</p>
                      <p className="font-bold text-green-600 text-lg">
                        R$ {sale.monthly_value?.toFixed(2).replace('.', ',')}
                      </p>
                    </div>

                    <div className="bg-white rounded-lg p-4 border border-orange-100">
                      <p className="text-sm text-gray-600 mb-1">Valor da Adesão</p>
                      <p className="font-bold text-orange-600 text-lg">
                        R$ 60,00
                      </p>
                    </div>

                    {sale.payment_method && (
                      <div className="bg-white rounded-lg p-4 border border-blue-100">
                        <p className="text-sm text-gray-600 mb-1">Forma de Pagamento</p>
                        <p className="font-semibold text-gray-900">{sale.payment_method}</p>
                      </div>
                    )}

                    {sale.payment_due_day && (
                      <div className="bg-white rounded-lg p-4 border border-blue-100">
                        <p className="text-sm text-gray-600 mb-1">Dia de Vencimento</p>
                        <p className="font-semibold text-gray-900">Dia {sale.payment_due_day}</p>
                      </div>
                    )}

                    {sale.channel && (
                      <div className="bg-white rounded-lg p-4 border border-blue-100">
                        <p className="text-sm text-gray-600 mb-1">Canal de Venda</p>
                        <p className="font-semibold text-gray-900">{sale.channel}</p>
                      </div>
                    )}
                  </div>

                  {sale.dependents_data && sale.dependents_data.length > 0 && (
                    <div className="mt-6 pt-6 border-t border-blue-200">
                      <h4 className="font-semibold text-gray-900 mb-3">
                        Dependentes ({sale.dependents_data.length})
                      </h4>
                      <div className="grid md:grid-cols-2 gap-3">
                        {sale.dependents_data.map((dep, idx) => (
                          <div key={idx} className="bg-white rounded-lg p-3 border border-blue-100">
                            <p className="font-medium text-gray-900">{dep.name || dep.full_name}</p>
                            <p className="text-sm text-gray-600">{dep.relationship}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Histórico Pré-Vendas (mostrar no Pós-Vendas) */}
            {isPostSales && !isResolved && sale && (
              <PreSalesHistory sale={sale} preSalesAgent={preSalesAgent} />
            )}

            {/* Pré-Vendas Checklist */}
            {isPreSales && !isResolved && sale && (
              <PreSalesChecklist 
                sale={sale}
                onComplete={handlePreSalesComplete}
                isSubmitting={isProcessing}
              />
            )}

            {/* Pós-Vendas - Registro de Contatos */}
            {isPostSales && !isResolved && sale && (
              <PostSalesContactLog 
                sale={sale}
                onSave={refetchSale}
              />
            )}

            {/* Pós-Vendas - Ações */}
            {isPostSales && !isResolved && !showCompletionForm && (
              <div className="space-y-4">
                <Card className="border-green-200 bg-gradient-to-br from-green-50 to-white shadow-lg">
                  <CardHeader className="border-b border-green-200">
                    <CardTitle className="flex items-center gap-2 text-green-900">
                      <CheckCircle className="w-5 h-5" />
                      Finalizar Ticket
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-6">
                    <p className="text-gray-700 mb-4">
                      Após contato confirmado com o cliente e verificação de todos os dados, finalize o ticket.
                    </p>
                    <Button
                      onClick={() => setShowCompletionForm(true)}
                      className="bg-green-600 hover:bg-green-700 w-full"
                      size="lg"
                    >
                      <CheckCircle className="w-5 h-5 mr-2" />
                      Finalizar
                    </Button>
                  </CardContent>
                </Card>

                <Card className="border-orange-200 bg-gradient-to-br from-orange-50 to-white shadow-lg">
                  <CardHeader className="border-b border-orange-200">
                    <CardTitle className="flex items-center gap-2 text-orange-900">
                      <ArrowLeft className="w-5 h-5" />
                      Retornar para Pré-Vendas
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-6">
                    <p className="text-gray-700 mb-4">
                      Se identificar pendências que precisam ser resolvidas na etapa de Pré-Vendas, você pode retornar o ticket.
                    </p>
                    <Button
                      onClick={handleReturnToPreSales}
                      disabled={isProcessing}
                      variant="outline"
                      className="w-full border-orange-300 text-orange-700 hover:bg-orange-50"
                      size="lg"
                    >
                      {isProcessing ? (
                        <>
                          <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                          Retornando...
                        </>
                      ) : (
                        <>
                          <ArrowLeft className="w-5 h-5 mr-2" />
                          Retornar para Pré-Vendas
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Formulário de Finalização Pós-Vendas */}
            {isPostSales && !isResolved && showCompletionForm && (
              <CompletionForm 
                onComplete={handlePostSalesComplete}
                onCancel={() => setShowCompletionForm(false)}
                isSubmitting={isProcessing}
                ticket={ticket}
                contact={contact}
              />
            )}

            {/* Status Resolvido */}
            {isResolved && sale && (
              <Card className="bg-green-50 border-green-200">
                <CardContent className="p-6">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-8 h-8 text-green-600" />
                    <div>
                      <h3 className="font-bold text-green-900 text-lg">Venda Confirmada!</h3>
                      <p className="text-green-700 text-sm">
                        Ticket finalizado em {format(new Date(ticket.resolved_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-6">
            {/* Agente Responsável */}
            <Card className="border-blue-200">
              <CardHeader className="bg-gradient-to-r from-blue-50 to-transparent border-b border-blue-200">
                <CardTitle className="flex items-center gap-2 text-blue-900">
                  <UserCheck className="w-5 h-5" />
                  Agente Responsável
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                {currentAgent ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center ring-2 ring-blue-100">
                        <span className="text-white font-semibold text-lg">
                          {currentAgent.name?.charAt(0)?.toUpperCase() || 'A'}
                        </span>
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">{currentAgent.name}</p>
                        <p className="text-sm text-gray-500">{currentAgent.user_email}</p>
                      </div>
                    </div>

                    {ticket.agent_id && ticket.updated_date && (
                      <div className="pt-4 border-t border-gray-200">
                        <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                          <Clock className="w-4 h-4" />
                          <span>Assumido há {calculateTimeSince(ticket.updated_date)}</span>
                        </div>
                        <p className="text-xs text-gray-500">
                          {format(new Date(ticket.updated_date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                      <UserCheck className="w-8 h-8 text-gray-400" />
                    </div>
                    <p className="text-gray-500 font-medium">Não atribuído</p>
                    <p className="text-sm text-gray-400 mt-1">Aguardando atribuição</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 🆕 Validação de WhatsApp */}
            {!isResolved && contact && contact.phones && contact.phones.length > 0 && (
              <Card className="border-green-200 bg-green-50">
                <CardHeader className="bg-gradient-to-r from-green-100/50 to-transparent border-b border-green-200">
                  <CardTitle className="text-green-900 flex items-center gap-2 text-base">
                    <Phone className="w-4 h-4" />
                    Validação de WhatsApp
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="space-y-3">
                    <div className="bg-white p-3 rounded-lg border border-green-200">
                      <p className="text-xs text-gray-600 mb-1">Telefone do Cliente</p>
                      <p className="font-semibold text-gray-900">{contact.phones[0]}</p>
                    </div>

                    {whatsappValidation && (
                      <div className={`p-3 rounded-lg border ${
                        whatsappValidation.valid 
                          ? 'bg-green-100 border-green-300' 
                          : 'bg-red-100 border-red-300'
                      }`}>
                        <div className="flex items-center gap-2">
                          {whatsappValidation.valid ? (
                            <CheckCircle2 className="w-5 h-5 text-green-600" />
                          ) : (
                            <XCircle className="w-5 h-5 text-red-600" />
                          )}
                          <p className={`text-sm font-semibold ${
                            whatsappValidation.valid ? 'text-green-800' : 'text-red-800'
                          }`}>
                            {whatsappValidation.message}
                          </p>
                        </div>
                        {whatsappValidation.valid && (
                          <p className="text-xs text-green-700 mt-2">
                            ✅ Pode enviar boletos e propostas por WhatsApp
                          </p>
                        )}
                        {!whatsappValidation.valid && (
                          <p className="text-xs text-red-700 mt-2">
                            ⚠️ Use outros meios de comunicação (ligação, SMS, email)
                          </p>
                        )}
                      </div>
                    )}

                    <Button
                      onClick={handleValidateWhatsApp}
                      disabled={validatingWhatsApp}
                      className="w-full bg-green-600 hover:bg-green-700"
                      size="sm"
                    >
                      {validatingWhatsApp ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Verificando...
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4 mr-2" />
                          {whatsappValidation ? 'Verificar Novamente' : 'Verificar WhatsApp'}
                        </>
                      )}
                    </Button>

                    <p className="text-xs text-gray-600 text-center">
                      Valide antes de enviar boletos digitais
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Dados do Cliente */}
            {contact && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="w-5 h-5" />
                    Dados do Titular
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm text-gray-600">Nome</p>
                      <p className="font-semibold text-gray-900">{contact.name}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">CPF</p>
                      <p className="font-semibold text-gray-900">{contact.document}</p>
                    </div>
                    {contact.phones && contact.phones.length > 0 && (
                      <div>
                        <p className="text-sm text-gray-600">Telefone</p>
                        <p className="font-semibold text-gray-900">{contact.phones[0]}</p>
                      </div>
                    )}
                    {contact.emails && contact.emails.length > 0 && (
                      <div>
                        <p className="text-sm text-gray-600">Email</p>
                        <p className="font-semibold text-gray-900">{contact.emails[0]}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Timeline do Ticket */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="w-5 h-5" />
                  Timeline do Ticket
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="relative pl-6 pb-4 border-l-2 border-gray-200">
                  <div className="absolute -left-2 top-0 w-4 h-4 bg-blue-500 rounded-full ring-4 ring-white"></div>
                  <p className="text-sm font-medium text-gray-900">Ticket Criado</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {format(new Date(ticket.created_date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    há {calculateTimeSince(ticket.created_date)}
                  </p>
                </div>

                {ticket.agent_id && (
                  <div className="relative pl-6 pb-4 border-l-2 border-gray-200">
                    <div className="absolute -left-2 top-0 w-4 h-4 bg-purple-500 rounded-full ring-4 ring-white"></div>
                    <p className="text-sm font-medium text-gray-900">Ticket Assumido</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {format(new Date(ticket.updated_date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      há {calculateTimeSince(ticket.updated_date)}
                    </p>
                  </div>
                )}

                {isResolved && (
                  <div className="relative pl-6">
                    <div className="absolute -left-2 top-0 w-4 h-4 bg-green-500 rounded-full ring-4 ring-white"></div>
                    <p className="text-sm font-medium text-gray-900">Ticket Finalizado</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {format(new Date(ticket.resolved_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      há {calculateTimeSince(ticket.resolved_at)}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Detalhes Adicionais */}
            <Card>
              <CardHeader>
                <CardTitle>Informações Adicionais</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Canal:</span>
                  <span className="font-medium text-gray-900">{ticket.channel}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Prioridade:</span>
                  <Badge variant="outline" className={`${priorityColors[ticket.priority]} text-xs`}>
                    {ticket.priority}
                  </Badge>
                </div>
                {ticket.category && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Categoria:</span>
                    <Badge className="text-xs">
                      {ticket.category === 'pre_sales' ? 'Pré-Venda' : 
                       ticket.category === 'post_sales' ? 'Pós-Venda' : 
                       ticket.category}
                    </Badge>
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
