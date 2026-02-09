import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Search, AlertCircle, CheckCircle, User, ShoppingCart, Loader2, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { createPageUrl } from "@/utils";
import { toast } from "sonner";

export default function CreateSalesTicket() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  const [searchType, setSearchType] = useState("cpf"); // "cpf" ou "sale_number"
  const [searchValue, setSearchValue] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [sale, setSale] = useState(null);
  const [contact, setContact] = useState(null);
  const [error, setError] = useState("");

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

  const handleSearchValueChange = (e) => {
    if (searchType === "cpf") {
      setSearchValue(formatCPF(e.target.value));
    } else {
      setSearchValue(e.target.value);
    }
  };

  const searchSale = async () => {
    setIsSearching(true);
    setError("");
    setSale(null);
    setContact(null);

    try {
      let foundSale = null;

      if (searchType === "cpf") {
        // Buscar por CPF do titular
        const contacts = await base44.entities.Contact.list();
        const foundContact = contacts.find(c => c.document === searchValue);
        
        if (!foundContact) {
          setError("CPF não encontrado na base de dados");
          toast.error("CPF não encontrado");
          setIsSearching(false);
          return;
        }

        setContact(foundContact);

        // Buscar vendas desse contato
        const sales = await base44.entities.Sale.filter({ contact_id: foundContact.id });
        
        if (sales.length === 0) {
          setError("Nenhuma venda encontrada para este CPF");
          toast.error("Nenhuma venda encontrada");
          setIsSearching(false);
          return;
        }

        // Pegar a venda mais recente ou em processo
        foundSale = sales.find(s => ['pending', 'pre_sales', 'post_sales'].includes(s.status)) || sales[0];
        
      } else {
        // Buscar por número do pedido
        const sales = await base44.entities.Sale.filter({ sale_number: searchValue });
        
        if (sales.length === 0) {
          setError("Pedido não encontrado");
          toast.error("Pedido não encontrado");
          setIsSearching(false);
          return;
        }

        foundSale = sales[0];

        // Buscar contato
        const contacts = await base44.entities.Contact.list();
        const foundContact = contacts.find(c => c.id === foundSale.contact_id);
        setContact(foundContact);
      }

      setSale(foundSale);
      toast.success(`Venda encontrada: ${foundSale.sale_number}`);

    } catch (err) {
      console.error('Erro ao buscar:', err);
      setError("Erro ao buscar dados: " + err.message);
      toast.error("Erro ao buscar dados");
    }

    setIsSearching(false);
  };

  const handleCreateTicket = async () => {
    if (!sale) {
      toast.error("Nenhuma venda selecionada");
      return;
    }

    try {
      // Determinar a fila de pré-vendas
      const preSalesQueue = queues.find(q => q.name.toLowerCase().includes('pré-venda') || q.name.toLowerCase().includes('pre-venda'));
      
      if (!preSalesQueue) {
        toast.error("Fila de Pré-Vendas não encontrada. Por favor, crie uma fila chamada 'Pré-Vendas'");
        return;
      }

      const ticketData = {
        ticket_type: "sales",
        sale_id: sale.id,
        contact_id: sale.contact_id,
        account_id: sale.account_id,
        contract_id: sale.contract_id,
        queue_id: preSalesQueue.id,
        priority: 'P2',
        status: 'new',
        subject: `Pré-Venda - ${contact?.name || 'Cliente'} - Pedido ${sale.sale_number}`,
        description: JSON.stringify({
          sale_number: sale.sale_number,
          product: sale.product_name,
          plan: sale.plan,
          monthly_value: sale.monthly_value,
          adhesion_value: sale.adhesion_value,
          total_value: sale.total_value,
          payment_method: sale.payment_method,
          sale_date: sale.sale_date,
          channel: sale.channel
        }, null, 2),
        category: 'pre_sales',
        channel: sale.channel || 'webchat',
        tags: ['Pré-Venda', sale.product_name, sale.sale_number],
      };

      const newTicket = await createTicketMutation.mutateAsync(ticketData);
      
      // Atualizar status da venda
      await base44.entities.Sale.update(sale.id, { status: 'pre_sales' });
      
      await queryClient.invalidateQueries({ queryKey: ['tickets'] });
      toast.success('Ticket de Pré-Venda criado com sucesso!');
      navigate(`${createPageUrl("SalesTicketView")}?id=${newTicket.id}`);
      
    } catch (error) {
      console.error('Erro ao criar ticket:', error);
      toast.error('Erro ao criar ticket: ' + (error.message || 'Erro desconhecido'));
      setError('Erro ao criar ticket: ' + (error.message || 'Erro desconhecido'));
    }
  };

  const planLabels = {
    essencial: "Essencial",
    total_mais: "Total +",
    bom_med: "Bom Med",
    bom_auto: "Bom Auto",
    bom_pet: "Bom Pet",
    bom_pet_saude: "Bom Pet Saúde",
    perola: "Pérola",
    rubi: "Rubi",
    topazio: "Topázio",
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Criar Ticket de Pré-Venda</h1>
          <p className="text-gray-500 mt-1">Busque a venda por CPF do titular ou número do pedido</p>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card className="border-gray-200 bg-white shadow-sm">
              <CardHeader className="border-b border-gray-200">
                <CardTitle className="flex items-center gap-2 text-gray-900">
                  <Search className="w-5 h-5" />
                  Buscar Venda
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-6">
                <div className="flex gap-2 mb-4">
                  <Button
                    variant={searchType === "cpf" ? "default" : "outline"}
                    onClick={() => {
                      setSearchType("cpf");
                      setSearchValue("");
                      setSale(null);
                      setContact(null);
                    }}
                    className="flex-1"
                  >
                    <User className="w-4 h-4 mr-2" />
                    Buscar por CPF
                  </Button>
                  <Button
                    variant={searchType === "sale_number" ? "default" : "outline"}
                    onClick={() => {
                      setSearchType("sale_number");
                      setSearchValue("");
                      setSale(null);
                      setContact(null);
                    }}
                    className="flex-1"
                  >
                    <ShoppingCart className="w-4 h-4 mr-2" />
                    Buscar por Pedido
                  </Button>
                </div>

                <div>
                  <Label className="text-gray-900">
                    {searchType === "cpf" ? "CPF do Titular" : "Número do Pedido"}
                  </Label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      placeholder={searchType === "cpf" ? "000.000.000-00" : "VENDA-00001"}
                      value={searchValue}
                      onChange={handleSearchValueChange}
                      maxLength={searchType === "cpf" ? 14 : 50}
                      disabled={isSearching}
                      className="bg-white"
                      onKeyPress={(e) => {
                        if (e.key === 'Enter' && searchValue.length > 0) {
                          searchSale();
                        }
                      }}
                    />
                    <Button 
                      onClick={searchSale}
                      disabled={isSearching || searchValue.length === 0}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      {isSearching ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Search className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>

                {sale && (
                  <Alert className="bg-green-50 border-green-200">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <AlertDescription className="text-green-800">
                      Venda encontrada: <strong>{sale.sale_number}</strong>
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
                      <p className="text-sm text-gray-600 mb-1">Produto</p>
                      <p className="font-semibold text-gray-900">{sale.product_name}</p>
                    </div>

                    <div className="bg-white rounded-lg p-4 border border-blue-100">
                      <p className="text-sm text-gray-600 mb-1">Plano</p>
                      <p className="font-semibold text-gray-900">{planLabels[sale.plan] || sale.plan}</p>
                    </div>

                    <div className="bg-white rounded-lg p-4 border border-green-100">
                      <p className="text-sm text-gray-600 mb-1">Valor Mensal</p>
                      <p className="font-bold text-green-600 text-lg">
                        R$ {sale.monthly_value?.toFixed(2).replace('.', ',')}
                      </p>
                    </div>

                    {sale.adhesion_value > 0 && (
                      <div className="bg-white rounded-lg p-4 border border-orange-100">
                        <p className="text-sm text-gray-600 mb-1">Valor da Adesão</p>
                        <p className="font-bold text-orange-600 text-lg">
                          R$ {sale.adhesion_value?.toFixed(2).replace('.', ',')}
                        </p>
                      </div>
                    )}

                    {sale.payment_method && (
                      <div className="bg-white rounded-lg p-4 border border-blue-100">
                        <p className="text-sm text-gray-600 mb-1">Forma de Pagamento</p>
                        <p className="font-semibold text-gray-900">{sale.payment_method}</p>
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
                      <div className="space-y-2">
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

            {sale && (
              <div className="flex justify-end gap-3">
                <Button 
                  variant="outline" 
                  onClick={() => navigate(createPageUrl("Dashboard"))}
                  disabled={createTicketMutation.isPending}
                >
                  Cancelar
                </Button>
                <Button 
                  onClick={handleCreateTicket}
                  disabled={createTicketMutation.isPending}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {createTicketMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Criando...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Criar Ticket de Pré-Venda
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
          </div>
        </div>
      </div>
    </div>
  );
}