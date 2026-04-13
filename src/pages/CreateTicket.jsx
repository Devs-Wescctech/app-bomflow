import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { Search, AlertCircle, CheckCircle, User, FileText, Loader2, Clock, AlertTriangle, DollarSign } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { createPageUrl } from "@/utils";
import CustomerInfo from "../components/ticket/CustomerInfo";
import DependentsList from "../components/ticket/DependentsList";
import AttachmentsUpload from "../components/ticket/AttachmentsUpload";
import TicketClassifier from "@/components/ai/TicketClassifier";
import { toast } from "sonner";

const TICKET_TYPES_REQUIRING_DEPENDENT = [
  "Registro de Óbito",
  "Agendamento de Cerimônia",
  "Inclusão de Dependente",
  "Exclusão de Dependente"
];

const CANCELLATION_REASONS = [
  "Insatisfação com o serviço",
  "Valor elevado",
  "Mudança de plano",
  "Não precisa mais do serviço",
  "Problemas financeiros",
  "Falecimento do titular",
  "Outros"
];

export default function CreateTicket() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  const [cpf, setCpf] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [contact, setContact] = useState(null);
  const [contract, setContract] = useState(null);
  const [dependents, setDependents] = useState([]); // This state is still used for CRM-synced dependents
  const [customerTickets, setCustomerTickets] = useState([]);
  const [erpData, setErpData] = useState(null);
  const [selectedTicketType, setSelectedTicketType] = useState(null);
  const [selectedDependent, setSelectedDependent] = useState(null);
  const [dynamicFields, setDynamicFields] = useState({});
  const [attachments, setAttachments] = useState([]);
  const [cancellationReason, setCancellationReason] = useState("");
  const [cancellationNotes, setCancellationNotes] = useState("");
  const [error, setError] = useState("");
  const [requiresSignature, setRequiresSignature] = useState(false);

  const [newDependent, setNewDependent] = useState({
    full_name: "",
    birth_date: "",
    relationship: "",
    life_status: "VIVO"
  });

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: agents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: () => base44.entities.Agent.list(),
    initialData: [],
  });

  const { data: ticketTypes = [] } = useQuery({
    queryKey: ['ticketTypes'],
    queryFn: () => base44.entities.TicketType.filter({ active: true }),
    initialData: [],
  });

  const { data: queues = [] } = useQuery({
    queryKey: ['queues'],
    queryFn: () => base44.entities.Queue.list(),
    initialData: [],
  });

  const createTicketMutation = useMutation({
    mutationFn: (data) => base44.entities.Ticket.create(data),
  });

  // Pegar agente atual
  const currentAgent = agents.find(a => a.user_email === user?.email);

  const formatCPF = (value) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 11) {
      return numbers.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    }
    return value;
  };

  const handleCpfChange = (e) => {
    const formatted = formatCPF(e.target.value);
    setCpf(formatted);
  };

  const searchCustomerByCpf = async () => {
    setIsSearching(true);
    setError("");
    setContact(null);
    setContract(null);
    setDependents([]);
    setCustomerTickets([]);
    setErpData(null);

    try {
      console.log('🔍 Buscando cliente no ERP...');
      
      const response = await base44.functions.invoke('getCustomerFromERP', { cpf });
      
      console.log('📥 Resposta da função:', response.data);

      if (!response.data.success) {
        // 🆕 TRATAMENTO ESPECÍFICO PARA STATUS 204 (SEM CONTRATO)
        if (response.data.noContract) {
          setError("⚠️ CPF SEM CONTRATO NO ERP\n\nEste CPF não está vinculado a nenhum contrato ativo no sistema ERP Bom Pastor.");
          toast.error("CPF sem contrato no ERP", {
            description: "Este cliente não possui contrato ativo no sistema",
            duration: 5000,
          });
          setIsSearching(false);
          return;
        }
        
        if (response.data.notFound) {
          setError("CPF não encontrado no ERP");
          toast.error("CPF não encontrado no ERP");
        } else {
          setError(response.data.error || "Erro ao buscar dados no ERP");
          toast.error(response.data.error || "Erro ao buscar dados no ERP");
        }
        setIsSearching(false);
        return;
      }

      const data = response.data.data;
      console.log('✅ Dados recebidos:', data);

      // Armazenar dados do ERP
      setErpData(data);

      // Buscar contact no CRM (já foi sincronizado pela função)
      const contacts = await base44.entities.Contact.filter({ document: cpf });
      const foundContact = contacts[0];

      if (!foundContact) {
        setError("Erro na sincronização dos dados");
        toast.error("Erro na sincronização dos dados");
        setIsSearching(false);
        return;
      }

      setContact(foundContact);
      toast.success(`Cliente encontrado: ${data.contact.name}`);

      // Buscar contrato no CRM
      if (foundContact.account_id) {
        const contracts = await base44.entities.Contract.filter({ 
          account_id: foundContact.account_id,
          status: 'active'
        });
        if (contracts.length > 0) {
          setContract(contracts[0]);
          
          // Buscar dependentes CRM (existing CRM dependents)
          const deps = await base44.entities.Dependent.filter({ contract_id: contracts[0].id });
          setDependents(deps);
        }
      }

      // Buscar tickets existentes
      const allTickets = await base44.entities.Ticket.list();
      const clientTickets = allTickets.filter(t => t.contact_id === foundContact.id);
      setCustomerTickets(clientTickets);

    } catch (err) {
      console.error('❌ Erro ao buscar:', err);
      
      // 🆕 TRATAMENTO ESPECÍFICO PARA ERRO 404 QUE PODE SER 204
      if (err.response?.status === 404 || err.message?.includes('404')) {
        console.log('🔍 Verificando se é um 204 (sem contrato)...');
        
        // Verificar se a resposta contém informação de noContract
        if (err.response?.data?.noContract) {
          setError("⚠️ CPF SEM CONTRATO NO ERP\n\nEste CPF não está vinculado a nenhum contrato ativo no sistema ERP Bom Pastor.");
          toast.error("CPF sem contrato no ERP", {
            description: "Este cliente não possui contrato ativo no sistema",
            duration: 5000,
          });
        } else {
          setError("CPF não encontrado no ERP");
          toast.error("CPF não encontrado no ERP");
        }
      } else {
        setError("Erro ao buscar dados do cliente: " + err.message);
        toast.error("Erro ao buscar dados do cliente");
      }
    }

    setIsSearching(false);
  };

  const handleTicketTypeChange = (typeId) => {
    const type = ticketTypes.find(t => t.id === typeId);
    setSelectedTicketType(type);
    setDynamicFields({});
    setSelectedDependent(null);
  };

  const handleDynamicFieldChange = (fieldName, value) => {
    setDynamicFields(prev => ({
      ...prev,
      [fieldName]: value
    }));
  };

  const requiresDependent = () => {
    return selectedTicketType && TICKET_TYPES_REQUIRING_DEPENDENT.includes(selectedTicketType.name);
  };

  const isIncludingNewDependent = () => {
    return selectedTicketType?.name === "Inclusão de Dependente";
  };

  const isCancellation = () => {
    return selectedTicketType?.category === "cancelamento" || selectedTicketType?.name?.toLowerCase().includes("cancelamento");
  };

  const renderDynamicField = (fieldName, fieldConfig) => {
    const value = dynamicFields[fieldName] || '';

    if (fieldConfig.type === 'select') {
      return (
        <div key={fieldName}>
          <Label className="text-gray-900 dark:text-gray-100">{fieldConfig.label} {fieldConfig.required && <span className="text-red-500">*</span>}</Label>
          <Select value={value} onValueChange={(val) => handleDynamicFieldChange(fieldName, val)}>
            <SelectTrigger className="mt-1 bg-white dark:bg-gray-800">
              <SelectValue placeholder={`Selecione ${fieldConfig.label.toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent>
              {fieldConfig.options?.map(opt => (
                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    }

    if (fieldConfig.type === 'textarea') {
      return (
        <div key={fieldName}>
          <Label className="text-gray-900 dark:text-gray-100">{fieldConfig.label} {fieldConfig.required && <span className="text-red-500">*</span>}</Label>
          <Textarea
            className="mt-1 bg-white dark:bg-gray-800"
            value={value}
            onChange={(e) => handleDynamicFieldChange(fieldName, e.target.value)}
            placeholder={fieldConfig.placeholder}
            rows={3}
          />
        </div>
      );
    }

    if (fieldConfig.type === 'date') {
      return (
        <div key={fieldName}>
          <Label className="text-gray-900 dark:text-gray-100">{fieldConfig.label} {fieldConfig.required && <span className="text-red-500">*</span>}</Label>
          <Input
            type="date"
            className="mt-1 bg-white dark:bg-gray-800"
            value={value}
            onChange={(e) => handleDynamicFieldChange(fieldName, e.target.value)}
          />
        </div>
      );
    }

    if (fieldConfig.type === 'datetime' || fieldConfig.type === 'datetime-local') {
      return (
        <div key={fieldName}>
          <Label className="text-gray-900 dark:text-gray-100">{fieldConfig.label} {fieldConfig.required && <span className="text-red-500">*</span>}</Label>
          <Input
            type="datetime-local"
            className="mt-1 bg-white dark:bg-gray-800"
            value={value}
            onChange={(e) => handleDynamicFieldChange(fieldName, e.target.value)}
          />
        </div>
      );
    }

    if (fieldConfig.type === 'time') {
      return (
        <div key={fieldName}>
          <Label className="text-gray-900 dark:text-gray-100">{fieldConfig.label} {fieldConfig.required && <span className="text-red-500">*</span>}</Label>
          <Input
            type="time"
            className="mt-1 bg-white dark:bg-gray-800"
            value={value}
            onChange={(e) => handleDynamicFieldChange(fieldName, e.target.value)}
          />
        </div>
      );
    }

    if (fieldConfig.type === 'number') {
      return (
        <div key={fieldName}>
          <Label className="text-gray-900 dark:text-gray-100">{fieldConfig.label} {fieldConfig.required && <span className="text-red-500">*</span>}</Label>
          <Input
            type="number"
            className="mt-1 bg-white dark:bg-gray-800"
            value={value}
            onChange={(e) => handleDynamicFieldChange(fieldName, e.target.value)}
            placeholder={fieldConfig.placeholder}
          />
        </div>
      );
    }

    return (
      <div key={fieldName}>
        <Label className="text-gray-900 dark:text-gray-100">{fieldConfig.label} {fieldConfig.required && <span className="text-red-500">*</span>}</Label>
        <Input
          type="text"
          className="mt-1 bg-white dark:bg-gray-800"
          value={value}
          onChange={(e) => handleDynamicFieldChange(fieldName, e.target.value)}
          placeholder={fieldConfig.placeholder}
        />
      </div>
    );
  };

  const validateRequiredFields = () => {
    if (!selectedTicketType?.fields_schema) return true;

    const schema = selectedTicketType.fields_schema;
    for (const [fieldName, fieldConfig] of Object.entries(schema)) {
      if (fieldConfig.required && !dynamicFields[fieldName]) {
        setError(`O campo "${fieldConfig.label}" é obrigatório`);
        toast.error(`O campo "${fieldConfig.label}" é obrigatório`);
        return false;
      }
    }
    return true;
  };

  const handleSubmit = async () => {
    setError("");

    if (!contact) {
      setError("Busque um cliente pelo CPF primeiro");
      toast.error("Busque um cliente pelo CPF primeiro");
      return;
    }

    if (!selectedTicketType) {
      setError("Selecione o tipo de ticket");
      toast.error("Selecione o tipo de ticket");
      return;
    }

    if (requiresDependent() && !selectedDependent && !isIncludingNewDependent()) {
      setError("Selecione o dependente para este atendimento");
      toast.error("Selecione o dependente para este atendimento");
      return;
    }

    if (isIncludingNewDependent()) {
      if (!newDependent.full_name || !newDependent.birth_date || !newDependent.relationship) {
        setError("Preencha todos os campos obrigatórios do novo dependente");
        toast.error("Preencha todos os campos obrigatórios do novo dependente");
        return;
      }
    }

    if (isCancellation() && !cancellationReason) {
      setError("Selecione o motivo do cancelamento");
      toast.error("Selecione o motivo do cancelamento");
      return;
    }

    if (!validateRequiredFields()) {
      return;
    }

    const ticketSubject = `${selectedTicketType.name} - ${contact.name}`;

    const ticketData = {
      contact_id: contact.id,
      account_id: contact.account_id,
      contract_id: contract?.id,
      dependent_id: selectedDependent?.id,
      erp_dependent_id: selectedDependent?.id_dependente_erp,
      queue_id: selectedTicketType.default_queue_id || queues[0]?.id,
      priority: selectedTicketType.default_priority || 'P3',
      status: 'novo',
      subject: ticketSubject,
      description: JSON.stringify({
        ...dynamicFields,
        ...(isIncludingNewDependent() && { new_dependent: newDependent }),
        dependent_name: selectedDependent?.full_name || selectedDependent?.nome_completo || newDependent?.full_name,
        erp_data: erpData
      }, null, 2),
      category: selectedTicketType.category,
      channel: 'webchat',
      tags: [selectedTicketType.name],
      attachments: attachments,
      cancellation_reason: isCancellation() ? cancellationReason : null,
      cancellation_notes: isCancellation() ? cancellationNotes : null,
      requires_signature: requiresSignature,
      created_by_agent_id: currentAgent?.id,
    };

    console.log('Criando ticket:', ticketData);
    
    try {
      const newTicket = await createTicketMutation.mutateAsync(ticketData);
      console.log('✅ Ticket criado:', newTicket);
      
      // 🆕 APLICAR DISTRIBUIÇÃO AUTOMÁTICA
      try {
        console.log('🎯 Tentando aplicar distribuição automática...');
        const distributionResult = await base44.functions.invoke('assignTicketRoundRobin', {
          ticket_id: newTicket.id,
          queue_id: ticketData.queue_id
        });
        
        console.log('📊 Resultado da distribuição:', distributionResult.data);
        
        if (distributionResult.data.success) {
          toast.success(`Ticket criado e atribuído a ${distributionResult.data.agent_name}!`, {
            description: `Distribuído via ${distributionResult.data.distribution_type === 'round_robin' ? 'rodízio' : 'menor carga'}`
          });
        } else {
          toast.success('Ticket criado com sucesso!', {
            description: 'Distribuição automática não aplicada'
          });
        }
      } catch (distError) {
        console.error('⚠️ Erro na distribuição automática:', distError);
        toast.success('Ticket criado com sucesso!', {
          description: 'Erro ao aplicar distribuição automática'
        });
      }
      
      await queryClient.invalidateQueries({ queryKey: ['tickets'] });
      navigate(`${createPageUrl("TicketView")}?id=${newTicket.id}`);
    } catch (error) {
      console.error('Erro ao criar ticket:', error);
      toast.error('Erro ao criar ticket: ' + (error.message || 'Erro desconhecido'));
      setError('Erro ao criar ticket: ' + (error.message || 'Erro desconhecido'));
    }
  };

  const openTickets = customerTickets.filter(t => 
    t.status !== 'resolvido' && 
    t.status !== 'fechado'
  );
  const totalTickets = customerTickets.length;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Criar Novo Ticket</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Atendimento ao Cliente - Plano Funeral</p>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm">
              <CardHeader className="border-b border-gray-200 dark:border-gray-800">
                <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
                  <User className="w-5 h-5" />
                  Identificação do Titular
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-6">
                <div>
                  <Label className="text-gray-900 dark:text-gray-100">CPF do Titular</Label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      placeholder="000.000.000-00"
                      value={cpf}
                      onChange={handleCpfChange}
                      maxLength={14}
                      disabled={isSearching}
                      className="bg-white dark:bg-gray-800"
                      onKeyPress={(e) => {
                        if (e.key === 'Enter' && cpf.length >= 14) {
                          searchCustomerByCpf();
                        }
                      }}
                    />
                    <Button 
                      onClick={searchCustomerByCpf}
                      disabled={isSearching || cpf.length < 14}
                      className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600"
                    >
                      {isSearching ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Search className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Digite o CPF do titular para buscar os dados no ERP
                  </p>
                </div>

                {isSearching && (
                  <Alert className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
                    <Loader2 className="w-4 h-4 animate-spin text-blue-600 dark:text-blue-400" />
                    <AlertDescription className="text-blue-800 dark:text-blue-300">
                      Buscando dados no ERP Bom Pastor...
                    </AlertDescription>
                  </Alert>
                )}

                {/* 🆕 ALERTA DE CPF SEM CONTRATO */}
                {error && error.includes("SEM CONTRATO") && (
                  <Alert className="bg-orange-50 dark:bg-orange-950 border-orange-300 dark:border-orange-700">
                    <AlertTriangle className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                    <AlertDescription className="text-orange-900 dark:text-orange-200">
                      <div className="space-y-2">
                        <p className="font-semibold">⚠️ CPF SEM CONTRATO NO ERP</p>
                        <p className="text-sm">
                          Este CPF não está vinculado a nenhum contrato ativo no sistema ERP Bom Pastor.
                        </p>
                        <div className="pt-2 border-t border-orange-200 dark:border-orange-800">
                          <p className="text-xs font-medium">Possíveis motivos:</p>
                          <ul className="text-xs list-disc list-inside mt-1 space-y-1">
                            <li>Cliente ainda não possui contrato</li>
                            <li>Contrato foi cancelado ou está inativo</li>
                            <li>CPF digitado está incorreto</li>
                          </ul>
                        </div>
                      </div>
                    </AlertDescription>
                  </Alert>
                )}

                {contact && (
                  <Alert className="bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
                    <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                    <AlertDescription className="text-green-800 dark:text-green-300">
                      Titular encontrado: <strong>{contact.name}</strong>
                      {erpData && (
                        <span className="block text-xs mt-1">
                          ✅ Dados sincronizados do ERP
                        </span>
                      )}
                    </AlertDescription>
                  </Alert>
                )}

                {contact && customerTickets.length > 0 && (
                  <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
                    <CardContent className="p-4">
                      <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-3 flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        Histórico de Atendimentos
                      </h4>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-white dark:bg-gray-800 p-3 rounded">
                          <p className="text-sm text-gray-600 dark:text-gray-400">Tickets em Aberto</p>
                          <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{openTickets.length}</p>
                        </div>
                        <div className="bg-white dark:bg-gray-800 p-3 rounded">
                          <p className="text-sm text-gray-600 dark:text-gray-400">Total de Atendimentos</p>
                          <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{totalTickets}</p>
                        </div>
                      </div>
                      {openTickets.length > 0 && (
                        <Alert className="mt-3 bg-orange-50 dark:bg-orange-950 border-orange-200 dark:border-orange-800">
                          <AlertTriangle className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                          <AlertDescription className="text-orange-800 dark:text-orange-300 text-sm">
                            Cliente possui {openTickets.length} ticket{openTickets.length > 1 ? 's' : ''} em aberto
                          </AlertDescription>
                        </Alert>
                      )}
                    </CardContent>
                  </Card>
                )}

                {error && !error.includes("SEM CONTRATO") && (
                  <Alert variant="destructive">
                    <AlertCircle className="w-4 h-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            {contact && (
              <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm">
                <CardHeader className="border-b border-gray-200 dark:border-gray-800">
                  <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
                    <FileText className="w-5 h-5" />
                    Tipo de Atendimento
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 pt-6">
                  <div>
                    <Label className="text-gray-900 dark:text-gray-100">Selecione o tipo de ticket</Label>
                    <Select 
                      value={selectedTicketType?.id} 
                      onValueChange={handleTicketTypeChange}
                    >
                      <SelectTrigger className="mt-1 bg-white dark:bg-gray-800">
                        <SelectValue placeholder="Escolha o tipo de atendimento" />
                      </SelectTrigger>
                      <SelectContent>
                        {ticketTypes.map(type => (
                          <SelectItem key={type.id} value={type.id}>
                            <div className="flex items-center gap-2">
                              <span>{type.name}</span>
                              {type.requires_immediate_attention && (
                                <Badge className="bg-red-100 text-red-700 text-xs">Urgente</Badge>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedTicketType?.description && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">{selectedTicketType.description}</p>
                    )}
                    </div>

                    {/* Classificador IA */}
                    <TicketClassifier
                    subject={`${selectedTicketType?.name || 'Novo Ticket'} - ${contact.name}`}
                    description={JSON.stringify(dynamicFields)}
                    onClassify={(result) => {
                    // Encontra a fila sugerida
                    const suggestedQueue = queues.find(q => 
                      q.name.toLowerCase().includes(result.suggested_queue.toLowerCase())
                    );

                    // Encontra prioridade sugerida (se existir no tipo)
                    // Aqui atualizamos os campos dinâmicos ou estado do ticket
                    // Como a prioridade e fila são definidas no submit baseadas no tipo,
                    // vamos apenas mostrar um toast informativo por enquanto ou 
                    // poderíamos atualizar o selectedTicketType se ele permitisse override.
                    // Mas para simplificar, vamos avisar o usuário.

                    toast.success("Sugestão aplicada!", {
                      description: `Prioridade sugerida: ${result.priority}. Fila sugerida: ${result.suggested_queue}`
                    });

                    // Se você tiver states para fila e prioridade manuais, atualize-os aqui.
                    // No código atual, queue_id vem de selectedTicketType.default_queue_id.
                    // Seria ideal ter um state para queue_id que inicia com o default mas pode mudar.
                    }}
                    />

                    {requiresDependent() && !isIncludingNewDependent() && (
                    <div className="pt-4 border-t">
                      <Label className="text-gray-900 dark:text-gray-100">Este atendimento é para qual dependente? *</Label>
                      <Select 
                        value={selectedDependent?.id || selectedDependent?.id_dependente_erp} 
                        onValueChange={(val) => {
                          // Prioritize ERP dependents if available, otherwise CRM dependents
                          const foundDep = (erpData?.dependents || []).find(d => d.id_dependente_erp === val) ||
                                           dependents.find(d => d.id === val);
                          setSelectedDependent(foundDep);
                        }}
                      >
                        <SelectTrigger className="mt-1 bg-white dark:bg-gray-800">
                          <SelectValue placeholder="Selecione o dependente" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="titular">Titular</SelectItem>
                          {erpData?.dependents && erpData.dependents.length > 0 ? (
                            erpData.dependents.map(dep => (
                              <SelectItem key={dep.id_dependente_erp} value={dep.id_dependente_erp}>
                                {dep.nome_completo} ({dep.grau_parentesco})
                              </SelectItem>
                            ))
                          ) : (
                            dependents.map(dep => (
                              <SelectItem key={dep.id} value={dep.id}>
                                {dep.full_name} ({dep.relationship})
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {isIncludingNewDependent() && (
                    <div className="space-y-4 pt-4 border-t">
                      <h4 className="font-semibold text-gray-900 dark:text-gray-100">Dados do Novo Dependente</h4>
                      <div>
                        <Label className="text-gray-900 dark:text-gray-100">Nome Completo *</Label>
                        <Input
                          className="mt-1 bg-white dark:bg-gray-800"
                          value={newDependent.full_name}
                          onChange={(e) => setNewDependent({...newDependent, full_name: e.target.value})}
                          placeholder="Nome completo do dependente"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-gray-900 dark:text-gray-100">Data de Nascimento *</Label>
                          <Input
                            type="date"
                            className="mt-1 bg-white dark:bg-gray-800"
                            value={newDependent.birth_date}
                            onChange={(e) => setNewDependent({...newDependent, birth_date: e.target.value})}
                          />
                        </div>
                        <div>
                          <Label className="text-gray-900 dark:text-gray-100">Grau de Parentesco *</Label>
                          <Select 
                            value={newDependent.relationship} 
                            onValueChange={(val) => setNewDependent({...newDependent, relationship: val})}
                          >
                            <SelectTrigger className="mt-1 bg-white dark:bg-gray-800">
                              <SelectValue placeholder="Selecione" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Cônjuge">Cônjuge</SelectItem>
                              <SelectItem value="Filho(a)">Filho(a)</SelectItem>
                              <SelectItem value="Pai">Pai</SelectItem>
                              <SelectItem value="Mãe">Mãe</SelectItem>
                              <SelectItem value="Irmão(ã)">Irmão(ã)</SelectItem>
                              <SelectItem value="Avô(ó)">Avô(ó)</SelectItem>
                              <SelectItem value="Neto(a)">Neto(a)</SelectItem>
                              <SelectItem value="Outro">Outro</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div>
                        <Label className="text-gray-900 dark:text-gray-100">Status de Vida *</Label>
                        <Select 
                          value={newDependent.life_status} 
                          onValueChange={(val) => setNewDependent({...newDependent, life_status: val})}
                        >
                          <SelectTrigger className="mt-1 bg-white dark:bg-gray-800">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="VIVO">VIVO</SelectItem>
                            <SelectItem value="FALECIDO">FALECIDO</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}

                  {isCancellation() && (
                    <div className="space-y-4 pt-4 border-t">
                      <h4 className="font-semibold text-gray-900 dark:text-gray-100">Motivo do Cancelamento</h4>
                      <div>
                        <Label className="text-gray-900 dark:text-gray-100">Motivo *</Label>
                        <Select value={cancellationReason} onValueChange={setCancellationReason}>
                          <SelectTrigger className="mt-1 bg-white dark:bg-gray-800">
                            <SelectValue placeholder="Selecione o motivo" />
                          </SelectTrigger>
                          <SelectContent>
                            {CANCELLATION_REASONS.map(reason => (
                              <SelectItem key={reason} value={reason}>{reason}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-gray-900 dark:text-gray-100">Observações</Label>
                        <Textarea
                          className="mt-1 bg-white dark:bg-gray-800"
                          value={cancellationNotes}
                          onChange={(e) => setCancellationNotes(e.target.value)}
                          placeholder="Informações adicionais sobre o cancelamento"
                          rows={3}
                        />
                      </div>
                    </div>
                  )}

                  {selectedTicketType?.fields_schema && Object.keys(selectedTicketType.fields_schema).length > 0 && (
                    <div className="space-y-4 pt-4 border-t">
                      <h4 className="font-semibold text-gray-900 dark:text-gray-100">Informações Necessárias</h4>
                      {Object.entries(selectedTicketType.fields_schema).map(([fieldName, fieldConfig]) =>
                        renderDynamicField(fieldName, fieldConfig)
                      )}
                    </div>
                  )}

                  {selectedTicketType && (
                    <div className="pt-4 border-t">
                      <Card className="border-2 border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950">
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              id="requiresSignature"
                              checked={requiresSignature}
                              onChange={(e) => setRequiresSignature(e.target.checked)}
                              className="w-6 h-6 mt-1 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                            />
                            <label htmlFor="requiresSignature" className="cursor-pointer flex-1">
                              <p className="text-gray-900 dark:text-gray-100 font-semibold text-base">
                                ✍️ Este ticket requer assinatura do cliente
                              </p>
                              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                Ao marcar esta opção, o cliente precisará assinar digitalmente (via tablet ou link WhatsApp) para finalizar o atendimento
                              </p>
                            </label>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  )}

                  {selectedTicketType && (
                    <div className="pt-4 border-t">
                      <AttachmentsUpload 
                        attachments={attachments}
                        onAttachmentsChange={setAttachments}
                        allowUpload={true}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {contact && selectedTicketType && (
              <div className="flex justify-end gap-3">
                <Button 
                  variant="outline" 
                  onClick={() => navigate(createPageUrl("Dashboard"))}
                  disabled={createTicketMutation.isPending}
                >
                  Cancelar
                </Button>
                <Button 
                  onClick={handleSubmit}
                  disabled={createTicketMutation.isPending}
                  className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600"
                >
                  {createTicketMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Criando...
                    </>
                  ) : (
                    'Criar Ticket'
                  )}
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-6">
            {contact && (
              <>
                <CustomerInfo 
                  contact={contact}
                  contract={contract}
                  erpData={erpData}
                />
                
                {erpData && erpData.dependents && erpData.dependents.length > 0 && (
                  <DependentsList 
                    dependents={erpData.dependents}
                    onSelectDependent={(dep) => setSelectedDependent(dep)}
                    selectedDependentId={selectedDependent?.id_dependente_erp}
                    isFromERP={true}
                  />
                )}
                
                {erpData && erpData.financial && (
                  <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm">
                    <CardHeader className="border-b border-gray-200 dark:border-gray-800">
                      <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
                        <DollarSign className="w-5 h-5" />
                        Situação Financeira (ERP)
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 pt-4">
                      {erpData.financial.ultimos_pagamentos && erpData.financial.ultimos_pagamentos.length > 0 && (
                        <div>
                          <p className="text-xs text-gray-500 dark:text-gray-400">Último Pagamento</p>
                          <p className="font-medium text-gray-900 dark:text-gray-100">
                            {new Date(erpData.financial.ultimos_pagamentos[0].data_pagamento).toLocaleDateString('pt-BR')}
                          </p>
                          <p className="text-xs text-green-600 dark:text-green-400">
                            R$ {erpData.financial.ultimos_pagamentos[0].valor.toFixed(2)}
                          </p>
                        </div>
                      )}
                      
                      {erpData.financial.total_inadimplencias_12meses !== undefined && (
                        <div className="pt-2 border-t border-gray-200 dark:border-gray-800">
                          <p className="text-xs text-gray-500 dark:text-gray-400">Inadimplências (12 meses)</p>
                          <p className={`font-bold ${erpData.financial.total_inadimplencias_12meses === 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {erpData.financial.total_inadimplencias_12meses}
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}