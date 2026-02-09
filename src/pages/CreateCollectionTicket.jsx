
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { Search, AlertCircle, CheckCircle, User, DollarSign, Loader2, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { createPageUrl } from "@/utils";
import { toast } from "sonner";

export default function CreateCollectionTicket() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
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
        toast.error("CPF não encontrado");
        setIsSearching(false);
        return;
      }

      setContact(foundContact);
      toast.success(`Cliente encontrado: ${foundContact.name}`);

      if (foundContact.account_id) {
        const contracts = await base44.entities.Contract.list();
        const activeContract = contracts.find(c => 
          c.account_id === foundContact.account_id && 
          c.status === 'active'
        );
        
        if (activeContract) {
          setContract(activeContract);
        }
      }

    } catch (err) {
      console.error('Erro ao buscar:', err);
      setError("Erro ao buscar dados do cliente: " + err.message);
      toast.error("Erro ao buscar dados do cliente");
    }

    setIsSearching(false);
  };

  const handleCreateTicket = async () => {
    console.log('🎫 Iniciando criação de ticket...');
    console.log('Contact:', contact);
    console.log('Contract:', contract);
    console.log('Queues:', queues);

    if (!contact) {
      toast.error("Nenhum cliente selecionado");
      return;
    }

    if (!contract) {
      toast.error("Cliente não possui contrato ativo");
      return;
    }

    if (contract.payment_status === 'up_to_date') {
      toast.error("Cliente está com pagamento em dia. Não é necessário ticket de cobrança.");
      return;
    }

    try {
      // Buscar a fila de "Cobrança - Contato"
      let collectionQueue = queues.find(q => 
        q.name.toLowerCase().includes('cobrança') && 
        q.name.toLowerCase().includes('contato')
      );
      
      console.log('Fila encontrada (Cobrança - Contato):', collectionQueue);
      
      if (!collectionQueue) {
        // Tentar buscar qualquer fila de cobrança
        collectionQueue = queues.find(q => 
          q.name.toLowerCase().includes('cobrança') || 
          q.name.toLowerCase().includes('cobranca')
        );
        console.log('Fila encontrada (geral de cobrança):', collectionQueue);
      }
      
      if (!collectionQueue) {
        toast.error("Fila de Cobrança - Contato não encontrada. Criando fila automaticamente...");
        
        // Criar fila automaticamente
        const newQueue = await base44.entities.Queue.create({
          name: "Cobrança - Contato",
          team_id: "TEAM_COLLECTION_CONTACT",
          default_priority: "P2",
          auto_assign: true,
          active: true
        });
        
        console.log('Nova fila criada:', newQueue);
        collectionQueue = newQueue;
      }

      const ticketData = {
        ticket_type: "collection",
        contact_id: contact.id,
        account_id: contact.account_id,
        contract_id: contract.id,
        queue_id: collectionQueue.id,
        priority: contract.days_overdue > 30 ? 'P1' : contract.days_overdue > 15 ? 'P2' : 'P3',
        status: 'new',
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
        channel: 'phone',
        tags: ['Cobrança', `${contract.days_overdue} dias`, contract.plan],
      };

      console.log('Dados do ticket:', ticketData);

      const newTicket = await createTicketMutation.mutateAsync(ticketData);
      console.log('Ticket criado:', newTicket);
      
      await queryClient.invalidateQueries({ queryKey: ['tickets'] });
      await queryClient.invalidateQueries({ queryKey: ['queues'] });
      
      toast.success('Ticket de Cobrança criado com sucesso!');
      navigate(`${createPageUrl("CollectionTicketView")}?id=${newTicket.id}`);
      
    } catch (error) {
      console.error('❌ Erro ao criar ticket:', error);
      toast.error('Erro ao criar ticket: ' + (error.message || 'Erro desconhecido'));
      setError('Erro ao criar ticket: ' + (error.message || 'Erro desconhecido'));
    }
  };

  const debtValue = contract ? contract.monthly_value * Math.ceil(contract.days_overdue / 30) : 0;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Criar Ticket de Cobrança</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Busque o cliente por CPF para iniciar cobrança</p>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm">
              <CardHeader className="border-b border-gray-200 dark:border-gray-800">
                <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
                  <Search className="w-5 h-5" />
                  Buscar Cliente
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-6">
                <div>
                  <Label className="text-gray-900 dark:text-gray-100">CPF do Cliente</Label>
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

                {contact && (
                  <Alert className="bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
                    <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                    <AlertDescription className="text-green-800 dark:text-green-300">
                      Cliente encontrado: <strong>{contact.name}</strong>
                    </AlertDescription>
                  </Alert>
                )}

                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="w-4 h-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            {contract && (
              <>
                <Card className={`border-2 ${
                  contract.days_overdue > 30 ? 'border-red-500 bg-red-50 dark:bg-red-950' :
                  contract.days_overdue > 15 ? 'border-orange-500 bg-orange-50 dark:bg-orange-950' :
                  'border-yellow-500 bg-yellow-50 dark:bg-yellow-950'
                } shadow-lg`}>
                  <CardHeader className="border-b border-gray-200 dark:border-gray-800">
                    <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
                      <DollarSign className="w-5 h-5" />
                      Situação Financeira
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-6">
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Status de Pagamento</p>
                        <Badge className={
                          contract.payment_status === 'overdue' ? 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300' :
                          'bg-orange-100 dark:bg-orange-950 text-orange-700 dark:text-orange-300'
                        }>
                          {contract.payment_status === 'overdue' ? 'EM ATRASO' : 'PENDENTE'}
                        </Badge>
                      </div>

                      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-red-300 dark:border-red-700">
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Dias em Atraso</p>
                        <p className="font-bold text-red-600 dark:text-red-400 text-2xl flex items-center gap-2">
                          <Clock className="w-5 h-5" />
                          {contract.days_overdue} dias
                        </p>
                      </div>

                      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Valor Mensal</p>
                        <p className="font-bold text-gray-900 dark:text-gray-100 text-lg">
                          R$ {contract.monthly_value?.toFixed(2).replace('.', ',')}
                        </p>
                      </div>

                      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-red-300 dark:border-red-700">
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Valor em Débito (estimado)</p>
                        <p className="font-bold text-red-600 dark:text-red-400 text-2xl">
                          R$ {debtValue.toFixed(2).replace('.', ',')}
                        </p>
                      </div>

                      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Plano</p>
                        <p className="font-semibold text-gray-900 dark:text-gray-100">{contract.plan}</p>
                      </div>

                      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Tier SLA</p>
                        <Badge variant="outline">{contract.sla_tier}</Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
                  <CardHeader className="border-b border-gray-200 dark:border-gray-800">
                    <CardTitle className="text-gray-900 dark:text-gray-100">Observações Iniciais</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-6">
                    <Textarea
                      placeholder="Registre aqui qualquer informação relevante antes de criar o ticket de cobrança..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={4}
                      className="bg-white dark:bg-gray-800"
                    />
                  </CardContent>
                </Card>
              </>
            )}

            {contact && contract && (
              <div className="flex justify-end gap-3">
                <Button 
                  variant="outline" 
                  onClick={() => navigate(createPageUrl("CollectionDashboard"))}
                  disabled={createTicketMutation.isPending}
                >
                  Cancelar
                </Button>
                <Button 
                  onClick={handleCreateTicket}
                  disabled={createTicketMutation.isPending || contract.payment_status === 'up_to_date'}
                  className="bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600"
                >
                  {createTicketMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Criando...
                    </>
                  ) : (
                    <>
                      <DollarSign className="w-4 h-4 mr-2" />
                      Criar Ticket de Cobrança
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-6">
            {contact && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="w-5 h-5" />
                    Dados do Cliente
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
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
