import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Save, Loader2, Headphones, Search, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";

export default function WhatsAppQuickTicket() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  
  const phoneFromWhatsApp = searchParams.get('phone') || '';

  const [cpf, setCpf] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [contact, setContact] = useState(null);
  const [error, setError] = useState("");
  const [selectedTicketType, setSelectedTicketType] = useState(null);
  const [description, setDescription] = useState("");

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
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
    onSuccess: (newTicket) => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      toast.success('Ticket criado com sucesso!');
      
      if (window.confirm('✅ Ticket criado!\n\nDeseja criar outro ticket?')) {
        setContact(null);
        setCpf("");
        setSelectedTicketType(null);
        setDescription("");
        setError("");
      } else {
        navigate(-1);
      }
    },
    onError: (error) => {
      toast.error('Erro ao criar ticket: ' + error.message);
    }
  });

  const formatCPF = (value) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 11) {
      return numbers.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    }
    return value;
  };

  const handleCpfChange = (e) => {
    setCpf(formatCPF(e.target.value));
  };

  const searchCustomerByCpf = async () => {
    setIsSearching(true);
    setError("");
    setContact(null);

    try {
      const response = await base44.functions.invoke('getCustomerFromERP', { cpf });

      if (!response.data.success) {
        if (response.data.noContract) {
          setError("CPF sem contrato ativo no ERP");
        } else if (response.data.notFound) {
          setError("CPF não encontrado no ERP");
        } else {
          setError(response.data.error || "Erro ao buscar dados");
        }
        setIsSearching(false);
        return;
      }

      const data = response.data.data;
      setContact(data.contact);
      toast.success(`Cliente encontrado: ${data.contact.name}`);

    } catch (err) {
      console.error('Erro ao buscar:', err);
      setError("Erro ao buscar dados do cliente");
    }

    setIsSearching(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!contact) {
      toast.error("Busque um cliente pelo CPF primeiro");
      return;
    }

    if (!selectedTicketType) {
      toast.error("Selecione o tipo de ticket");
      return;
    }

    if (!description) {
      toast.error("Descreva o motivo do atendimento");
      return;
    }

    const ticketData = {
      contact_id: contact.id,
      account_id: contact.account_id,
      queue_id: selectedTicketType.default_queue_id || queues[0]?.id,
      priority: selectedTicketType.default_priority || 'P3',
      status: 'novo',
      subject: `${selectedTicketType.name} - ${contact.name}`,
      description: description,
      category: selectedTicketType.category,
      channel: 'whatsapp',
      tags: [selectedTicketType.name, 'WhatsApp'],
    };

    createTicketMutation.mutate(ticketData);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-4">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="flex-shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Novo Atendimento</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">Via WhatsApp</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Busca Cliente */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Search className="w-4 h-4" />
                Identificar Cliente
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {phoneFromWhatsApp && (
                <div className="p-2 bg-green-50 dark:bg-green-950 rounded border border-green-200 dark:border-green-800">
                  <p className="text-xs text-green-700 dark:text-green-300">
                    📱 WhatsApp: {phoneFromWhatsApp}
                  </p>
                </div>
              )}

              <div>
                <Label className="text-sm">CPF do Cliente *</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    placeholder="000.000.000-00"
                    value={cpf}
                    onChange={handleCpfChange}
                    maxLength={14}
                    disabled={isSearching}
                    className="h-9"
                  />
                  <Button 
                    type="button"
                    onClick={searchCustomerByCpf}
                    disabled={isSearching || cpf.length < 14}
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600"
                  >
                    {isSearching ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Search className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>

              {contact && (
                <Alert className="bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
                  <AlertDescription className="text-green-800 dark:text-green-300 text-sm">
                    ✅ <strong>{contact.name}</strong>
                    <br />
                    <span className="text-xs">CPF: {contact.document}</span>
                  </AlertDescription>
                </Alert>
              )}

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="w-4 h-4" />
                  <AlertDescription className="text-sm">{error}</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Tipo de Atendimento */}
          {contact && (
            <>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Headphones className="w-4 h-4" />
                    Tipo de Atendimento
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <Label className="text-sm">Tipo *</Label>
                    <Select 
                      value={selectedTicketType?.id} 
                      onValueChange={(val) => {
                        const type = ticketTypes.find(t => t.id === val);
                        setSelectedTicketType(type);
                      }}
                    >
                      <SelectTrigger className="mt-1 h-9">
                        <SelectValue placeholder="Selecione o tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        {ticketTypes.map(type => (
                          <SelectItem key={type.id} value={type.id}>
                            {type.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-sm">Descrição do Atendimento *</Label>
                    <Textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Descreva o motivo do atendimento..."
                      rows={4}
                      className="mt-1 text-sm"
                    />
                  </div>
                </CardContent>
              </Card>

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate(-1)}
                  className="flex-1"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={!contact || !selectedTicketType || !description || createTicketMutation.isPending}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600"
                >
                  {createTicketMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Criando...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Criar Ticket
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
}