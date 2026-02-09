import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Save, Loader2, DollarSign, Search, AlertCircle, Clock } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export default function WhatsAppQuickCollection() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  
  const phoneFromWhatsApp = searchParams.get('phone') || '';

  const [cpf, setCpf] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [contact, setContact] = useState(null);
  const [contract, setContract] = useState(null);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState("");

  const { data: queues = [] } = useQuery({
    queryKey: ['queues'],
    queryFn: () => base44.entities.Queue.list(),
    initialData: [],
  });

  const createTicketMutation = useMutation({
    mutationFn: (data) => base44.entities.Ticket.create(data),
    onSuccess: (newTicket) => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      toast.success('Ticket de cobrança criado com sucesso!');
      
      if (window.confirm('✅ Ticket criado!\n\nDeseja criar outro?')) {
        setContact(null);
        setContract(null);
        setCpf("");
        setNotes("");
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
    setContract(null);

    try {
      const contacts = await base44.entities.Contact.list();
      const foundContact = contacts.find(c => c.document === cpf);

      if (!foundContact) {
        setError("CPF não encontrado na base de dados");
        setIsSearching(false);
        return;
      }

      setContact(foundContact);

      if (foundContact.account_id) {
        const contracts = await base44.entities.Contract.list();
        const activeContract = contracts.find(c => 
          c.account_id === foundContact.account_id && 
          c.status === 'active'
        );
        
        if (activeContract) {
          setContract(activeContract);
          toast.success(`Cliente encontrado: ${foundContact.name}`);
        } else {
          setError("Cliente não possui contrato ativo");
        }
      } else {
        setError("Cliente não possui contrato");
      }

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

    if (!contract) {
      toast.error("Cliente não possui contrato ativo");
      return;
    }

    if (contract.payment_status === 'up_to_date') {
      toast.error("Cliente está em dia");
      return;
    }

    let collectionQueue = queues.find(q => 
      q.name.toLowerCase().includes('cobrança') && 
      q.name.toLowerCase().includes('contato')
    );
    
    if (!collectionQueue) {
      collectionQueue = queues.find(q => 
        q.name.toLowerCase().includes('cobrança') || 
        q.name.toLowerCase().includes('cobranca')
      );
    }
    
    if (!collectionQueue) {
      const newQueue = await base44.entities.Queue.create({
        name: "Cobrança - Contato",
        team_id: "TEAM_COLLECTION_CONTACT",
        default_priority: "P2",
        auto_assign: true,
        active: true
      });
      collectionQueue = newQueue;
    }

    const ticketData = {
      ticket_type: "collection",
      contact_id: contact.id,
      account_id: contact.account_id,
      contract_id: contract.id,
      queue_id: collectionQueue.id,
      priority: contract.days_overdue > 30 ? 'P1' : contract.days_overdue > 15 ? 'P2' : 'P3',
      status: 'novo',
      subject: `Cobrança - ${contact.name} - ${contract.days_overdue} dias em atraso`,
      description: JSON.stringify({
        debt_value: contract.monthly_value * Math.ceil(contract.days_overdue / 30),
        days_overdue: contract.days_overdue,
        monthly_value: contract.monthly_value,
        plan: contract.plan,
        payment_status: contract.payment_status,
        initial_notes: notes,
        contact_attempts: []
      }, null, 2),
      category: 'cobranca',
      channel: 'whatsapp',
      tags: ['Cobrança', `${contract.days_overdue} dias`, contract.plan, 'WhatsApp'],
    };

    createTicketMutation.mutate(ticketData);
  };

  const debtValue = contract ? contract.monthly_value * Math.ceil(contract.days_overdue / 30) : 0;

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
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Nova Cobrança</h1>
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
                    className="bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600"
                  >
                    {isSearching ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Search className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>

              {contact && contract && (
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

          {/* Situação Financeira */}
          {contract && (
            <>
              <Card className="border-2 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2 text-red-800 dark:text-red-200">
                    <DollarSign className="w-4 h-4" />
                    Situação Financeira
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-white dark:bg-gray-800 p-2 rounded">
                      <p className="text-xs text-gray-500 dark:text-gray-400">Status</p>
                      <Badge className="bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 mt-1">
                        EM ATRASO
                      </Badge>
                    </div>

                    <div className="bg-white dark:bg-gray-800 p-2 rounded">
                      <p className="text-xs text-gray-500 dark:text-gray-400">Dias</p>
                      <p className="font-bold text-red-600 dark:text-red-400 flex items-center gap-1 mt-1">
                        <Clock className="w-3 h-3" />
                        {contract.days_overdue}
                      </p>
                    </div>

                    <div className="bg-white dark:bg-gray-800 p-2 rounded">
                      <p className="text-xs text-gray-500 dark:text-gray-400">Valor Mensal</p>
                      <p className="font-bold text-gray-900 dark:text-gray-100 text-sm mt-1">
                        R$ {contract.monthly_value?.toFixed(2).replace('.', ',')}
                      </p>
                    </div>

                    <div className="bg-white dark:bg-gray-800 p-2 rounded">
                      <p className="text-xs text-gray-500 dark:text-gray-400">Débito</p>
                      <p className="font-bold text-red-600 dark:text-red-400 text-sm mt-1">
                        R$ {debtValue.toFixed(2).replace('.', ',')}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Observações</CardTitle>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Registre informações sobre o contato..."
                    rows={4}
                    className="text-sm"
                  />
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
                  disabled={!contact || !contract || contract.payment_status === 'up_to_date' || createTicketMutation.isPending}
                  className="flex-1 bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600"
                >
                  {createTicketMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Criando...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Criar Cobrança
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