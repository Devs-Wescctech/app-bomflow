
import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle, AlertCircle, FileText } from "lucide-react";
import TemplateSelector from "./TemplateSelector";
import { toast } from "sonner";

const COMPLETION_REASONS = [
  "Resolvido",
  "Orientação",
  "Sem Contato",
  "Transferido",
  "Cancelado",
  "Duplicado"
];

const COMPLETION_CATEGORIES = {
  "Financeiro": ["2ª via de boleto", "Alteração de vencimento", "Cancelamento", "Dúvida de valor"],
  "Cadastro": ["Inclusão de dependente", "Exclusão de dependente", "Atualização de dados", "Troca de titular"],
  "Sinistro": ["Registro de óbito", "Agendamento de cerimônia", "Documentação", "Cancelamento de acionamento"],
  "Suporte": ["Dúvida geral", "Problema técnico", "Reclamação", "Elogio"],
  "Comercial": ["Upgrade de plano", "Downgrade de plano", "Proposta", "Renovação"]
};

const ORIGIN_OPTIONS = [
  "Telefone",
  "WhatsApp",
  "Presencial",
  "E-mail",
  "Chat Online"
];

const RESOLUTION_OPTIONS = [
  "Solução aplicada",
  "Encaminhado",
  "Não procedente",
  "Aguardando retorno"
];

export default function CompletionForm({ onComplete, onCancel, isSubmitting, ticket, contact, contract }) {
  const [formData, setFormData] = useState({
    completion_description: "",
    completion_reason: "",
    completion_category: "",
    completion_subcategory: "",
    completion_origin: "",
    completion_resolution: ""
  });

  const [errors, setErrors] = useState({});

  const handleCategoryChange = (category) => {
    setFormData({
      ...formData,
      completion_category: category,
      completion_subcategory: "" // Reset subcategory
    });
  };

  const validate = () => {
    const newErrors = {};
    
    if (!formData.completion_description.trim()) {
      newErrors.completion_description = "Descrição de finalização é obrigatória";
    }
    
    if (!formData.completion_reason) {
      newErrors.completion_reason = "Motivo é obrigatório";
    }
    
    if (!formData.completion_category) {
      newErrors.completion_category = "Categoria é obrigatória";
    }
    
    if (!formData.completion_subcategory) {
      newErrors.completion_subcategory = "Subcategoria é obrigatória";
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) {
      return;
    }

    const completionData = {
      completion_description: formData.completion_description,
      completion_reason: formData.completion_reason,
      completion_category: formData.completion_category,
      completion_subcategory: formData.completion_subcategory,
      completion_origin: formData.completion_origin,
      completion_resolution: formData.completion_resolution,
    };

    // Chamar função de conclusão do ticket
    await onComplete(completionData);

    // 🆕 ENVIAR PESQUISA NPS VIA WHATSAPP
    console.log('📱 Tentando enviar pesquisa NPS...');
    console.log('📞 Contato:', contact);
    console.log('🎫 Ticket ID:', ticket?.id);

    if (contact?.phones && contact.phones.length > 0) {
      try {
        console.log('📤 Invocando função sendNpsSurvey...');
        const response = await base44.functions.invoke('sendNpsSurvey', {
          ticket_id: ticket.id
        });
        
        console.log('✅ Resposta completa:', response);
        console.log('📊 Response.data:', response.data);
        
        if (response.data.success) {
          toast.success('Pesquisa NPS enviada para o cliente!', {
            description: `WhatsApp: ${response.data.phone}`
          });
        } else {
          console.error('❌ Erro retornado pela função:', response.data.error);
          toast.warning('Ticket finalizado, mas erro ao enviar NPS', {
            description: response.data.error || 'Erro desconhecido'
          });
        }
      } catch (error) {
        console.error('⚠️ Erro completo ao enviar pesquisa NPS:', error);
        console.error('📊 Error.response:', error.response);
        console.error('📊 Error.response.data:', error.response?.data);
        toast.error('Ticket finalizado, mas erro ao enviar NPS', {
          description: error.response?.data?.error || error.message || 'Erro ao comunicar com o servidor'
        });
      }
    } else {
      console.log('⚠️ Cliente sem telefone cadastrado, NPS não enviado');
      toast.warning('Ticket finalizado, mas NPS não enviado', {
        description: 'Cliente sem telefone cadastrado'
      });
    }
  };

  const isFormValid = formData.completion_description.trim() && 
                      formData.completion_reason && 
                      formData.completion_category && 
                      formData.completion_subcategory;

  return (
    <Card className="border-2 border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-green-800 dark:text-green-200">
          <CheckCircle className="w-5 h-5" />
          Finalizar Ticket
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Descrição de Finalização com Template */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label className="text-gray-900 dark:text-gray-100">
              Descrição de Finalização *
            </Label>
            <TemplateSelector 
              onSelect={(text) => setFormData({...formData, completion_description: text})}
              ticket={ticket}
              contact={contact}
              contract={contract}
              buttonLabel="📝 Usar Template"
              buttonVariant="outline"
              buttonSize="sm"
            />
          </div>
          <Textarea
            value={formData.completion_description}
            onChange={(e) => setFormData({...formData, completion_description: e.target.value})}
            placeholder="Descreva como o ticket foi resolvido e as ações tomadas..."
            rows={6}
            className={`mt-1 bg-white dark:bg-gray-800 ${errors.completion_description ? 'border-red-500' : ''}`}
          />
          {errors.completion_description && (
            <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {errors.completion_description}
            </p>
          )}
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-1">
            <FileText className="w-3 h-3" />
            Use templates para respostas padronizadas ou escreva manualmente
          </p>
        </div>

        {/* Tabulação */}
        <div className="pt-4 border-t border-green-200 dark:border-green-700">
          <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Tabulação</h4>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Motivo */}
            <div>
              <Label>Motivo *</Label>
              <Select 
                value={formData.completion_reason} 
                onValueChange={(val) => setFormData({...formData, completion_reason: val})}
              >
                <SelectTrigger className={`mt-1 ${errors.completion_reason ? 'border-red-500' : ''}`}>
                  <SelectValue placeholder="Selecione o motivo" />
                </SelectTrigger>
                <SelectContent>
                  {COMPLETION_REASONS.map(reason => (
                    <SelectItem key={reason} value={reason}>{reason}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.completion_reason && (
                <p className="text-xs text-red-600 mt-1">{errors.completion_reason}</p>
              )}
            </div>

            {/* Origem */}
            <div>
              <Label>Origem do Atendimento</Label>
              <Select 
                value={formData.completion_origin} 
                onValueChange={(val) => setFormData({...formData, completion_origin: val})}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Selecione (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  {ORIGIN_OPTIONS.map(origin => (
                    <SelectItem key={origin} value={origin}>{origin}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Categoria */}
            <div>
              <Label>Categoria *</Label>
              <Select 
                value={formData.completion_category} 
                onValueChange={handleCategoryChange}
              >
                <SelectTrigger className={`mt-1 ${errors.completion_category ? 'border-red-500' : ''}`}>
                  <SelectValue placeholder="Selecione a categoria" />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(COMPLETION_CATEGORIES).map(cat => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.completion_category && (
                <p className="text-xs text-red-600 mt-1">{errors.completion_category}</p>
              )}
            </div>

            {/* Subcategoria */}
            <div>
              <Label>Subcategoria *</Label>
              <Select 
                value={formData.completion_subcategory} 
                onValueChange={(val) => setFormData({...formData, completion_subcategory: val})}
                disabled={!formData.completion_category}
              >
                <SelectTrigger className={`mt-1 ${errors.completion_subcategory ? 'border-red-500' : ''}`}>
                  <SelectValue placeholder="Selecione a subcategoria" />
                </SelectTrigger>
                <SelectContent>
                  {formData.completion_category && COMPLETION_CATEGORIES[formData.completion_category]?.map(subcat => (
                    <SelectItem key={subcat} value={subcat}>{subcat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.completion_subcategory && (
                <p className="text-xs text-red-600 mt-1">{errors.completion_subcategory}</p>
              )}
            </div>
          </div>

          {/* Resolução */}
          <div className="mt-4">
            <Label>Tipo de Resolução</Label>
            <Select 
              value={formData.completion_resolution} 
              onValueChange={(val) => setFormData({...formData, completion_resolution: val})}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Selecione (opcional)" />
              </SelectTrigger>
              <SelectContent>
                {RESOLUTION_OPTIONS.map(res => (
                  <SelectItem key={res} value={res}>{res}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Botão Finalizar */}
        <div className="pt-4 border-t border-green-200 dark:border-green-700">
          <Button
            onClick={handleSubmit}
            disabled={!isFormValid || isSubmitting}
            className="w-full bg-green-600 hover:bg-green-700 text-white"
          >
            <CheckCircle className="w-4 h-4 mr-2" />
            {isSubmitting ? 'Finalizando...' : 'Finalizar Ticket'}
          </Button>
          {!isFormValid && (
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-2 text-center">
              Preencha todos os campos obrigatórios para finalizar
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
