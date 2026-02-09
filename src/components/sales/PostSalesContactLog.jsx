import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Phone, Save, Loader2, Clock, MessageSquare, Mail, PhoneCall } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const CONTACT_RESULT_OPTIONS = [
  "Cliente não atendeu",
  "Cliente solicitou ligar depois",
  "Número errado/não existe",
  "Caixa postal",
  "Cliente pediu contato via WhatsApp",
  "Ligação caiu",
  "Dados confirmados - aguardando pagamento",
  "Outros"
];

const CONTACT_CHANNEL_OPTIONS = [
  { value: "phone", label: "Telefone", icon: PhoneCall },
  { value: "whatsapp", label: "WhatsApp", icon: MessageSquare },
  { value: "email", label: "E-mail", icon: Mail },
];

const getChannelIcon = (channel) => {
  const option = CONTACT_CHANNEL_OPTIONS.find(opt => opt.value === channel);
  return option ? option.icon : PhoneCall;
};

const getChannelLabel = (channel) => {
  const option = CONTACT_CHANNEL_OPTIONS.find(opt => opt.value === channel);
  return option ? option.label : channel;
};

const getChannelColor = (channel) => {
  const colors = {
    phone: "text-blue-600 bg-blue-100",
    whatsapp: "text-green-600 bg-green-100",
    email: "text-purple-600 bg-purple-100",
  };
  return colors[channel] || "text-gray-600 bg-gray-100";
};

export default function PostSalesContactLog({ sale, onSave }) {
  const [channel, setChannel] = useState("");
  const [result, setResult] = useState("");
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const handleSaveContact = async () => {
    if (!channel) {
      toast.error("Selecione o canal de contato");
      return;
    }

    if (!result) {
      toast.error("Selecione o resultado do contato");
      return;
    }

    setIsSaving(true);
    try {
      const user = await base44.auth.me();
      const attempts = sale.post_sales_contact_attempts || [];
      
      attempts.push({
        date: new Date().toISOString(),
        agent_email: user.email,
        agent_name: user.full_name,
        channel: channel,
        result: result,
        notes: notes,
      });

      await base44.entities.Sale.update(sale.id, {
        post_sales_contact_attempts: attempts,
      });

      toast.success("Tentativa de contato registrada!");
      setChannel("");
      setResult("");
      setNotes("");
      
      if (onSave) onSave();
    } catch (error) {
      console.error("Erro ao salvar:", error);
      toast.error("Erro ao salvar tentativa de contato");
    } finally {
      setIsSaving(false);
    }
  };

  const attempts = sale?.post_sales_contact_attempts || [];

  return (
    <Card className="border-purple-200 bg-gradient-to-br from-purple-50 to-white shadow-lg">
      <CardHeader className="border-b border-purple-200">
        <CardTitle className="flex items-center gap-2 text-purple-900">
          <Phone className="w-5 h-5" />
          Registro de Contatos
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-6 space-y-6">
        {/* Histórico de Tentativas */}
        {attempts.length > 0 && (
          <div className="space-y-3">
            <h4 className="font-semibold text-gray-900">Histórico de Tentativas ({attempts.length})</h4>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {attempts.map((attempt, idx) => {
                const ChannelIcon = getChannelIcon(attempt.channel);
                const channelColor = getChannelColor(attempt.channel);
                
                return (
                  <div key={idx} className="bg-white rounded-lg p-3 border border-purple-100">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-purple-600" />
                        <span className="text-sm font-medium text-gray-900">
                          {format(new Date(attempt.date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </span>
                      </div>
                      <span className="text-xs text-gray-500">{attempt.agent_name}</span>
                    </div>
                    
                    {/* Canal de Contato */}
                    {attempt.channel && (
                      <div className="flex items-center gap-2 mb-2">
                        <div className={`flex items-center gap-1 px-2 py-1 rounded-md ${channelColor}`}>
                          <ChannelIcon className="w-3 h-3" />
                          <span className="text-xs font-medium">{getChannelLabel(attempt.channel)}</span>
                        </div>
                      </div>
                    )}
                    
                    <p className="text-sm text-gray-700 font-medium mb-1">{attempt.result}</p>
                    {attempt.notes && (
                      <p className="text-sm text-gray-600">{attempt.notes}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Nova Tentativa */}
        <div className="pt-4 border-t border-purple-200 space-y-4">
          <h4 className="font-semibold text-gray-900">Registrar Nova Tentativa</h4>
          
          <div>
            <Label className="text-gray-900">Canal de Contato *</Label>
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger className="mt-1 bg-white">
                <SelectValue placeholder="Selecione o canal" />
              </SelectTrigger>
              <SelectContent>
                {CONTACT_CHANNEL_OPTIONS.map(option => {
                  const Icon = option.icon;
                  return (
                    <SelectItem key={option.value} value={option.value}>
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4" />
                        {option.label}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-gray-900">Resultado do Contato *</Label>
            <Select value={result} onValueChange={setResult}>
              <SelectTrigger className="mt-1 bg-white">
                <SelectValue placeholder="Selecione o resultado" />
              </SelectTrigger>
              <SelectContent>
                {CONTACT_RESULT_OPTIONS.map(option => (
                  <SelectItem key={option} value={option}>{option}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-gray-900">Observações</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Detalhes da tentativa de contato..."
              className="mt-1 bg-white"
              rows={3}
            />
          </div>

          <Button
            onClick={handleSaveContact}
            disabled={!channel || !result || isSaving}
            className="w-full bg-purple-600 hover:bg-purple-700 gap-2"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Salvar Tentativa de Contato
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}