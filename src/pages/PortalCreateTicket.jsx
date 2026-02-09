
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Send, Loader2, Ticket } from "lucide-react";
import { createPageUrl } from "@/utils";
import { toast } from "sonner";
import AttachmentsUpload from "../components/ticket/AttachmentsUpload";

export default function PortalCreateTicket() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [contact, setContact] = useState(null);
  const [contract, setContract] = useState(null);
  const [selectedType, setSelectedType] = useState("");
  const [description, setDescription] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const isAuth = localStorage.getItem('portal_authenticated');
    if (!isAuth) {
      navigate(createPageUrl("PortalLogin"));
      return;
    }

    const contactData = localStorage.getItem('portal_contact');
    const contractData = localStorage.getItem('portal_contract');

    if (contactData) setContact(JSON.parse(contactData));
    if (contractData) setContract(JSON.parse(contractData));
  }, [navigate]);

  const { data: ticketTypes = [] } = useQuery({
    queryKey: ['portalTicketTypes'],
    queryFn: async () => {
      const types = await base44.entities.TicketType.filter({ active: true });
      // Filtrar apenas tipos de atendimento (não sinistros)
      return types.filter(t => t.category !== 'sinistro');
    },
    initialData: [],
  });

  const { data: queues = [] } = useQuery({
    queryKey: ['queues'],
    queryFn: () => base44.entities.Queue.list(),
    initialData: [],
  });

  const { data: dependents = [] } = useQuery({
    queryKey: ['portalDependents', contract?.id],
    queryFn: async () => {
      if (!contract?.id) return [];
      return await base44.entities.Dependent.filter({ contract_id: contract.id });
    },
    enabled: !!contract?.id,
    initialData: [],
  });

  const [selectedDependent, setSelectedDependent] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!selectedType) {
      toast.error("Selecione o tipo de atendimento");
      return;
    }

    if (!description.trim()) {
      toast.error("Descreva o motivo do atendimento");
      return;
    }

    setIsSubmitting(true);

    try {
      const ticketType = ticketTypes.find(t => t.id === selectedType);

      const ticketData = {
        ticket_type: 'support',
        contact_id: contact.id,
        account_id: contact.account_id,
        contract_id: contract?.id,
        dependent_id: selectedDependent?.id,
        queue_id: ticketType?.default_queue_id || queues[0]?.id,
        priority: ticketType?.default_priority || 'P3',
        status: 'new',
        subject: `${ticketType?.name} - ${contact.name}`,
        description: description,
        category: ticketType?.category,
        channel: 'webchat',
        tags: ['portal_cliente'],
        attachments: attachments,
      };

      const newTicket = await base44.entities.Ticket.create(ticketData);

      await queryClient.invalidateQueries({ queryKey: ['portalTickets'] });
      
      toast.success('Atendimento criado com sucesso!');
      navigate(createPageUrl("PortalTickets"));
      
    } catch (error) {
      console.error('Erro ao criar ticket:', error);
      toast.error('Erro ao criar atendimento: ' + (error.message || 'Erro desconhecido'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!contact) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <div className="w-full px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Novo Atendimento</h1>
          <p className="text-gray-600">Descreva sua solicitação e entraremos em contato</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card className="shadow-lg">
            <CardHeader className="bg-gradient-to-r from-blue-50 to-purple-50 border-b">
              <CardTitle className="flex items-center gap-2">
                <Ticket className="w-5 h-5" />
                Informações do Atendimento
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              {/* Tipo de Atendimento */}
              <div>
                <Label className="text-gray-900">Tipo de Atendimento *</Label>
                <Select value={selectedType} onValueChange={setSelectedType}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Selecione o tipo de atendimento" />
                  </SelectTrigger>
                  <SelectContent>
                    {ticketTypes.map(type => (
                      <SelectItem key={type.id} value={type.id}>
                        {type.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedType && ticketTypes.find(t => t.id === selectedType)?.description && (
                  <p className="text-sm text-gray-500 mt-2">
                    {ticketTypes.find(t => t.id === selectedType).description}
                  </p>
                )}
              </div>

              {/* Dependente (opcional) */}
              {dependents.length > 0 && (
                <div>
                  <Label className="text-gray-900">Este atendimento é para qual pessoa?</Label>
                  <Select 
                    value={selectedDependent?.id || "titular"} 
                    onValueChange={(val) => {
                      if (val === "titular") {
                        setSelectedDependent(null);
                      } else {
                        setSelectedDependent(dependents.find(d => d.id === val));
                      }
                    }}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="titular">Titular - {contact.name}</SelectItem>
                      {dependents.map(dep => (
                        <SelectItem key={dep.id} value={dep.id}>
                          {dep.full_name} ({dep.relationship})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Descrição */}
              <div>
                <Label className="text-gray-900">Descreva o motivo do atendimento *</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Explique detalhadamente o motivo do seu contato..."
                  className="mt-1"
                  rows={6}
                  disabled={isSubmitting}
                />
                <p className="text-xs text-gray-500 mt-2">
                  Quanto mais detalhes você fornecer, mais rápido poderemos atendê-lo.
                </p>
              </div>

              {/* Anexos */}
              <div>
                <Label className="text-gray-900">Anexos (opcional)</Label>
                <AttachmentsUpload
                  attachments={attachments}
                  onAttachmentsChange={setAttachments}
                  allowUpload={true}
                />
              </div>
            </CardContent>
          </Card>

          {/* Dados do Cliente (Resumo) */}
          <Card className="shadow-lg bg-gray-50">
            <CardContent className="pt-6">
              <h3 className="font-semibold text-gray-900 mb-4">Seus Dados</h3>
              <div className="grid md:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-600">Nome</p>
                  <p className="font-medium text-gray-900">{contact.name}</p>
                </div>
                <div>
                  <p className="text-gray-600">CPF</p>
                  <p className="font-medium text-gray-900">{contact.document}</p>
                </div>
                {contact.phone && (
                  <div>
                    <p className="text-gray-600">Telefone</p>
                    <p className="font-medium text-gray-900">{contact.phone}</p>
                  </div>
                )}
                {contract && (
                  <div>
                    <p className="text-gray-600">Plano</p>
                    <p className="font-medium text-gray-900">{contract.plan?.toUpperCase()}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Botões */}
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate(createPageUrl("PortalHome"))}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !selectedType || !description.trim()}
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Criando...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Enviar Atendimento
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
