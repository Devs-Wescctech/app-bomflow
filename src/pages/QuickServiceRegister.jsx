
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Search, CheckCircle, User, Zap, Loader2, AlertCircle, Copy, AlertTriangle } from "lucide-react";
import { createPageUrl } from "@/utils";
import { toast } from "sonner";
import AttachmentsUpload from "../components/ticket/AttachmentsUpload";

const SERVICE_TYPES = [
  "Retirada de Guia Médica",
  "Pagamento Realizado",
  "Dúvida Respondida",
  "Atualização Cadastral",
  "Solicitação de Documentos",
  "Informações sobre Plano",
  "Cancelamento Atendido",
  "Reclamação Registrada",
  "Elogio Registrado",
  "Outro"
];

const CATEGORIES = [
  "Médico",
  "Financeiro",
  "Cadastro",
  "Comercial",
  "Administrativo",
  "Sinistro"
];

const CHANNELS = [
  "Presencial",
  "Telefone",
  "WhatsApp",
  "Email",
  "Chat Online"
];

export default function QuickServiceRegister() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [cpf, setCpf] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [contact, setContact] = useState(null);
  const [erpData, setErpData] = useState(null);
  const [error, setError] = useState("");
  
  const [formData, setFormData] = useState({
    service_type: "",
    category: "",
    channel: "",
    description: "",
    notes: "",
  });
  
  const [attachments, setAttachments] = useState([]);
  const [protocolNumber, setProtocolNumber] = useState("");

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: agents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: () => base44.entities.Agent.list(),
    initialData: [],
  });

  const createServiceMutation = useMutation({
    mutationFn: (data) => base44.entities.QuickService.create(data),
    onSuccess: (newService) => {
      queryClient.invalidateQueries({ queryKey: ['quickServices'] });
      
      // Gerar número de protocolo
      const protocol = `QS-${newService.id.slice(0, 8).toUpperCase()}`;
      setProtocolNumber(protocol);
      
      toast.success('Atendimento registrado com sucesso!', {
        description: `Protocolo: ${protocol}`
      });
    },
  });

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
    if (!cpf || cpf.length < 14) {
      toast.error("Digite um CPF válido");
      return;
    }

    setIsSearching(true);
    setError("");
    setContact(null);
    setErpData(null);

    try {
      const response = await base44.functions.invoke('getCustomerFromERP', { cpf });

      if (!response.data.success) {
        if (response.data.noContract) {
          setError("⚠️ CPF SEM CONTRATO ATIVO NO ERP - Este CPF não possui contrato ativo no sistema");
          toast.error("CPF sem contrato ativo no ERP", {
            description: "Este cliente não possui contrato ativo"
          });
        } else {
          setError(response.data.error || "Erro ao buscar dados no ERP");
          toast.error(response.data.error || "Erro ao buscar dados no ERP");
        }
        setIsSearching(false);
        return;
      }

      const data = response.data.data;
      setErpData(data);

      const contacts = await base44.entities.Contact.filter({ document: cpf });
      const foundContact = contacts[0];

      if (!foundContact) {
        setError("Erro na sincronização dos dados");
        toast.error("Erro na sincronização dos dados");
        setIsSearching(false);
        return;
      }

      setContact(foundContact);
      setError("");
      toast.success(`Cliente encontrado: ${data.contact.name}`);

    } catch (err) {
      console.error('Erro ao buscar:', err);
      setError("Erro ao buscar dados do cliente no ERP");
      toast.error("Erro ao buscar dados do cliente");
    }

    setIsSearching(false);
  };

  const handleSubmit = async () => {
    // Validações obrigatórias
    if (!contact) {
      toast.error("Busque o cliente pelo CPF antes de continuar");
      return;
    }

    if (!currentAgent) {
      toast.error("Agente não identificado. Faça login novamente.");
      return;
    }

    if (!formData.service_type) {
      toast.error("Selecione o tipo de atendimento");
      return;
    }

    if (!formData.category) {
      toast.error("Selecione a categoria");
      return;
    }

    if (!formData.channel) {
      toast.error("Selecione o canal de atendimento");
      return;
    }

    if (!formData.description.trim()) {
      toast.error("Preencha a descrição do atendimento");
      return;
    }

    const serviceData = {
      contact_id: contact.id,
      contact_cpf: contact.document,
      contact_name: contact.name,
      service_type: formData.service_type,
      category: formData.category,
      channel: formData.channel,
      description: formData.description,
      notes: formData.notes,
      handled_by: user.email,
      handled_by_name: currentAgent.name || user.full_name || user.email,
      agent_id: currentAgent.id,
      attachments: attachments,
    };

    try {
      await createServiceMutation.mutateAsync(serviceData);
    } catch (error) {
      console.error('Erro ao registrar:', error);
      toast.error('Erro ao registrar atendimento');
    }
  };

  const handleNewService = () => {
    setContact(null);
    setErpData(null);
    setCpf("");
    setFormData({
      service_type: "",
      category: "",
      channel: "",
      description: "",
      notes: "",
    });
    setAttachments([]);
    setProtocolNumber("");
    setError("");
  };

  const handleCopyProtocol = () => {
    navigator.clipboard.writeText(protocolNumber);
    toast.success('Protocolo copiado!');
  };

  // Se não houver agente logado, mostrar erro
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-6">
        <Card className="max-w-md">
          <CardContent className="pt-6">
            <Alert variant="destructive">
              <AlertCircle className="w-5 h-5" />
              <AlertDescription>
                Você precisa estar logado para registrar atendimentos rápidos.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!currentAgent) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-6">
        <Card className="max-w-md">
          <CardContent className="pt-6">
            <Alert variant="destructive">
              <AlertCircle className="w-5 h-5" />
              <AlertDescription>
                Seu usuário não está cadastrado como agente. Entre em contato com o administrador.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Se já foi registrado, mostra confirmação
  if (protocolNumber) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 dark:from-gray-950 dark:to-gray-900 flex items-center justify-center p-6">
        <Card className="max-w-2xl w-full border-2 border-green-300 dark:border-green-700 bg-white dark:bg-gray-900 shadow-2xl">
          <CardHeader className="bg-gradient-to-r from-green-50 to-blue-50 dark:from-green-950 dark:to-blue-950 border-b border-green-200 dark:border-green-800">
            <div className="flex items-center justify-center mb-4">
              <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center">
                <CheckCircle className="w-12 h-12 text-white" />
              </div>
            </div>
            <CardTitle className="text-center text-2xl text-gray-900 dark:text-gray-100">
              Atendimento Registrado com Sucesso!
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-8 space-y-6">
            <div className="text-center">
              <p className="text-gray-60:0 dark:text-gray-400 mb-4">
                Número do Protocolo:
              </p>
              <div className="flex items-center justify-center gap-3">
                <div className="px-6 py-4 bg-gray-100 dark:bg-gray-800 rounded-lg border-2 border-gray-300 dark:border-gray-700">
                  <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 font-mono">
                    {protocolNumber}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopyProtocol}
                  className="h-12 w-12"
                >
                  <Copy className="w-5 h-5" />
                </Button>
              </div>
            </div>

            <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-blue-800 dark:text-blue-200 text-center">
                📋 O protocolo foi gerado para consulta futura. Guarde este número.
              </p>
            </div>

            <div className="space-y-3 pt-4 border-t border-gray-200 dark:border-gray-800">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Cliente</p>
                  <p className="font-semibold text-gray-900 dark:text-gray-100">
                    {contact?.name || 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 dark:text-gray-400">CPF</p>
                  <p className="font-semibold text-gray-900 dark:text-gray-100">
                    {contact?.document || 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Tipo</p>
                  <p className="font-semibold text-gray-900 dark:text-gray-100">
                    {formData.service_type}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Categoria</p>
                  <p className="font-semibold text-gray-900 dark:text-gray-100">
                    {formData.category}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Canal</p>
                  <p className="font-semibold text-gray-900 dark:text-gray-100">
                    {formData.channel}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Atendido por</p>
                  <p className="font-semibold text-gray-900 dark:text-gray-100">
                    {currentAgent.name}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                onClick={handleNewService}
                className="flex-1 bg-blue-600 hover:bg-blue-700"
              >
                <Zap className="w-4 h-4 mr-2" />
                Novo Atendimento Rápido
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate(createPageUrl("QuickServiceList"))}
                className="flex-1"
              >
                Ver Histórico
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Zap className="w-8 h-8 text-yellow-500" />
            Atendimento Rápido
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Registre atendimentos simples que são finalizados imediatamente
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
              Agente: {currentAgent.name}
            </Badge>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Busca de Cliente - OBRIGATÓRIO */}
            <Card className="border-2 border-blue-300 dark:border-blue-700 bg-white dark:bg-gray-900 shadow-sm">
              <CardHeader className="bg-blue-50 dark:bg-blue-950 border-b border-blue-200 dark:border-blue-800">
                <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
                  <User className="w-5 h-5" />
                  Identificação do Cliente *
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-6">
                <div>
                  <Label className="text-gray-900 dark:text-gray-100 font-semibold">CPF do Cliente *</Label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      placeholder="000.000.000-00"
                      value={cpf}
                      onChange={handleCpfChange}
                      maxLength={14}
                      disabled={isSearching || !!contact}
                      className="bg-white dark:bg-gray-800"
                      onKeyPress={(e) => {
                        if (e.key === 'Enter' && cpf.length >= 14) {
                          searchCustomerByCpf();
                        }
                      }}
                    />
                    <Button 
                      onClick={searchCustomerByCpf}
                      disabled={isSearching || cpf.length < 14 || !!contact}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      {isSearching ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Search className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-medium">
                    ⚠️ Campo obrigatório - Digite o CPF e clique em buscar
                  </p>
                </div>

                {isSearching && (
                  <Alert className="bg-blue-50 dark:bg-blue-950 border-blue-200">
                    <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                    <AlertDescription className="text-blue-800 dark:text-blue-300">
                      Buscando dados no ERP Bom Pastor...
                    </AlertDescription>
                  </Alert>
                )}

                {error && (
                  <Alert variant="destructive">
                    <AlertTriangle className="w-4 h-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {contact && erpData && (
                  <Alert className="bg-green-50 dark:bg-green-950 border-green-200">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <AlertDescription className="text-green-800 dark:text-green-300">
                      <strong>✅ Cliente encontrado:</strong> {contact.name}
                      <span className="block text-xs mt-1">
                        CPF: {contact.document} • Sincronizado do ERP
                      </span>
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            {/* Formulário de Atendimento - Só aparece após buscar cliente */}
            {contact && (
              <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm">
                <CardHeader className="border-b border-gray-200 dark:border-gray-800">
                  <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
                    <Zap className="w-5 h-5 text-yellow-500" />
                    Dados do Atendimento
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 pt-6">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-gray-900 dark:text-gray-100">Tipo de Atendimento *</Label>
                      <Select 
                        value={formData.service_type} 
                        onValueChange={(val) => setFormData({...formData, service_type: val})}
                      >
                        <SelectTrigger className="mt-1 bg-white dark:bg-gray-800">
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          {SERVICE_TYPES.map(type => (
                            <SelectItem key={type} value={type}>{type}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-gray-900 dark:text-gray-100">Categoria *</Label>
                      <Select 
                        value={formData.category} 
                        onValueChange={(val) => setFormData({...formData, category: val})}
                      >
                        <SelectTrigger className="mt-1 bg-white dark:bg-gray-800">
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          {CATEGORIES.map(cat => (
                            <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <Label className="text-gray-900 dark:text-gray-100">Canal de Atendimento *</Label>
                    <Select 
                      value={formData.channel} 
                      onValueChange={(val) => setFormData({...formData, channel: val})}
                    >
                      <SelectTrigger className="mt-1 bg-white dark:bg-gray-800">
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {CHANNELS.map(channel => (
                          <SelectItem key={channel} value={channel}>{channel}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-gray-900 dark:text-gray-100">Descrição do Atendimento *</Label>
                    <Textarea
                      value={formData.description}
                      onChange={(e) => setFormData({...formData, description: e.target.value})}
                      placeholder="Descreva o que foi realizado no atendimento..."
                      rows={4}
                      className="mt-1 bg-white dark:bg-gray-800"
                    />
                  </div>

                  <div>
                    <Label className="text-gray-900 dark:text-gray-100">Observações (opcional)</Label>
                    <Textarea
                      value={formData.notes}
                      onChange={(e) => setFormData({...formData, notes: e.target.value})}
                      placeholder="Informações adicionais..."
                      rows={2}
                      className="mt-1 bg-white dark:bg-gray-800"
                    />
                  </div>

                  <div className="pt-4 border-t">
                    <AttachmentsUpload 
                      attachments={attachments}
                      onAttachmentsChange={setAttachments}
                      allowUpload={true}
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Botões - Só aparecem após buscar cliente */}
            {contact && (
              <div className="flex justify-end gap-3">
                <Button 
                  variant="outline" 
                  onClick={() => navigate(createPageUrl("Dashboard"))}
                >
                  Cancelar
                </Button>
                <Button 
                  onClick={handleSubmit}
                  disabled={createServiceMutation.isPending}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {createServiceMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Registrando...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Registrar Atendimento
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>

          {/* Sidebar - Informações */}
          <div className="space-y-6">
            <Card className="border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950">
              <CardHeader>
                <CardTitle className="text-yellow-800 dark:text-yellow-200 flex items-center gap-2">
                  <Zap className="w-5 h-5" />
                  Atendimento Rápido
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-yellow-800 dark:text-yellow-200">
                <p>✅ <strong>Registro imediato:</strong> Finaliza no mesmo momento</p>
                <p>⚡ <strong>Sem fila:</strong> Não passa por workflow de aprovação</p>
                <p>📋 <strong>Protocolo:</strong> Gera número para consulta</p>
                <p>👤 <strong>Agente:</strong> Registrado automaticamente</p>
                <p>🔍 <strong>Cliente:</strong> Busca obrigatória no ERP</p>
              </CardContent>
            </Card>

            {contact && erpData && (
              <>
                {/* Card de Dados do Cliente */}
                <Card className="border-gray-200 dark:border-gray-800">
                  <CardHeader className="border-b border-gray-200 dark:border-gray-800">
                    <CardTitle className="text-gray-900 dark:text-gray-100">
                      Dados do Cliente
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-4">
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Nome</p>
                      <p className="font-semibold text-gray-900 dark:text-gray-100">{contact.name}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">CPF</p>
                      <p className="font-semibold text-gray-900 dark:text-gray-100">{contact.document}</p>
                    </div>
                    {erpData.contact.phones && erpData.contact.phones.length > 0 && (
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Telefone</p>
                        <p className="font-semibold text-gray-900 dark:text-gray-100">{erpData.contact.phones[0]}</p>
                      </div>
                    )}
                    {erpData.contact.emails && erpData.contact.emails.length > 0 && (
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Email</p>
                        <p className="font-semibold text-gray-900 dark:text-gray-100">{erpData.contact.emails[0]}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Card de Contrato */}
                {erpData.contracts && erpData.contracts.length > 0 && (
                  <Card className="border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950">
                    <CardHeader className="border-b border-blue-200 dark:border-blue-800">
                      <CardTitle className="text-blue-900 dark:text-blue-100 flex items-center gap-2">
                        📋 Contrato
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 pt-4">
                      {erpData.contracts.map((contract, idx) => (
                        <div key={idx} className="space-y-3">
                          <div>
                            <p className="text-xs text-blue-700 dark:text-blue-300">Plano</p>
                            <Badge className="bg-blue-200 text-blue-900 dark:bg-blue-900 dark:text-blue-100 mt-1">
                              {contract.plano}
                            </Badge>
                          </div>
                          {contract.valor_mensal && (
                            <div>
                              <p className="text-xs text-blue-700 dark:text-blue-300">Valor Mensal</p>
                              <p className="font-bold text-lg text-blue-900 dark:text-blue-100">
                                R$ {parseFloat(contract.valor_mensal).toFixed(2)}
                              </p>
                            </div>
                          )}
                          {contract.data_inicio && (
                            <div>
                              <p className="text-xs text-blue-700 dark:text-blue-300">Data de Início</p>
                              <p className="font-semibold text-blue-900 dark:text-blue-100">
                                {new Date(contract.data_inicio).toLocaleDateString('pt-BR')}
                              </p>
                            </div>
                          )}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {/* Card de Situação Financeira */}
                {erpData.financial && (
                  <Card className={`border-2 ${
                    erpData.financial.status_geral === 'EM DIA' 
                      ? 'border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950' 
                      : 'border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-950'
                  }`}>
                    <CardHeader className={`border-b ${
                      erpData.financial.status_geral === 'EM DIA'
                        ? 'border-green-200 dark:border-green-800'
                        : 'border-orange-200 dark:border-orange-800'
                    }`}>
                      <CardTitle className={`flex items-center gap-2 ${
                        erpData.financial.status_geral === 'EM DIA'
                          ? 'text-green-900 dark:text-green-100'
                          : 'text-orange-900 dark:text-orange-100'
                      }`}>
                        💰 Situação Financeira
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 pt-4">
                      <div>
                        <p className={`text-xs ${
                          erpData.financial.status_geral === 'EM DIA'
                            ? 'text-green-700 dark:text-green-300'
                            : 'text-orange-700 dark:text-orange-300'
                        }`}>Status</p>
                        <Badge className={
                          erpData.financial.status_geral === 'EM DIA'
                            ? 'bg-green-200 text-green-900 dark:bg-green-900 dark:text-green-100'
                            : 'bg-orange-200 text-orange-900 dark:bg-orange-900 dark:text-orange-100'
                        }>
                          {erpData.financial.status_geral}
                        </Badge>
                      </div>
                      
                      {erpData.financial.ultimos_pagamentos && erpData.financial.ultimos_pagamentos.length > 0 && (
                        <div>
                          <p className={`text-xs ${
                            erpData.financial.status_geral === 'EM DIA'
                              ? 'text-green-700 dark:text-green-300'
                              : 'text-orange-700 dark:text-orange-300'
                          }`}>Último Pagamento</p>
                          <p className={`font-semibold ${
                            erpData.financial.status_geral === 'EM DIA'
                              ? 'text-green-900 dark:text-green-100'
                              : 'text-orange-900 dark:text-orange-100'
                          }`}>
                            {new Date(erpData.financial.ultimos_pagamentos[0].data_pagamento).toLocaleDateString('pt-BR')}
                          </p>
                          <p className="text-sm text-green-600 dark:text-green-400">
                            R$ {erpData.financial.ultimos_pagamentos[0].valor.toFixed(2)}
                          </p>
                        </div>
                      )}
                      
                      {erpData.financial.total_inadimplencias_12meses !== undefined && (
                        <div>
                          <p className={`text-xs ${
                            erpData.financial.status_geral === 'EM DIA'
                              ? 'text-green-700 dark:text-green-300'
                              : 'text-orange-700 dark:text-orange-300'
                          }`}>Inadimplências (12 meses)</p>
                          <p className={`font-bold text-lg ${
                            erpData.financial.total_inadimplencias_12meses === 0 
                              ? 'text-green-600 dark:text-green-400' 
                              : 'text-red-600 dark:text-red-400'
                          }`}>
                            {erpData.financial.total_inadimplencias_12meses}
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Card de Dependentes */}
                {erpData.dependents && erpData.dependents.length > 0 && (
                  <Card className="border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950">
                    <CardHeader className="border-b border-purple-200 dark:border-purple-800">
                      <CardTitle className="text-purple-900 dark:text-purple-100 flex items-center gap-2">
                        👥 Dependentes ({erpData.dependents.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4">
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {erpData.dependents.map((dep, idx) => (
                          <div key={idx} className="p-2 bg-white dark:bg-gray-800 rounded-lg border border-purple-200 dark:border-purple-800">
                            <p className="font-semibold text-sm text-gray-900 dark:text-gray-100">{dep.nome_completo}</p>
                            <p className="text-xs text-gray-600 dark:text-gray-400">
                              {dep.grau_parentesco} • {dep.idade} anos
                            </p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}

            <Card className="border-gray-200 dark:border-gray-800">
              <CardHeader className="border-b border-gray-200 dark:border-gray-800">
                <CardTitle className="text-gray-900 dark:text-gray-100">
                  Exemplos de Uso
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                  <li>• Cliente veio retirar guia médica</li>
                  <li>• Pagamento realizado na recepção</li>
                  <li>• Ligou para tirar dúvida sobre cobertura</li>
                  <li>• Atualizou dados cadastrais</li>
                  <li>• Solicitou 2ª via de documentos</li>
                  <li>• Registrou elogio/reclamação</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
