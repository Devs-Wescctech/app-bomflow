import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, Calendar, Clock, User, MapPin, Phone, Mail, AlertCircle, ChevronDown, ChevronUp, Eye, EyeOff } from "lucide-react";

export default function TicketDetailsCard({ ticket }) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Parse description JSON
  let parsedData = {};
  try {
    if (ticket.description && typeof ticket.description === 'string') {
      parsedData = JSON.parse(ticket.description);
    }
  } catch (error) {
    console.log('Descrição não é JSON válido');
  }

  // Se não houver dados estruturados, não mostrar o card
  if (!parsedData || Object.keys(parsedData).length === 0) {
    return null;
  }

  // Remove campos vazios e campos técnicos
  const cleanData = Object.entries(parsedData).filter(([key, value]) => {
    if (!value || value === '') return false;
    if (key === 'dependent_name' && !value) return false;
    return true;
  });

  if (cleanData.length === 0) return null;

  // Mapeamento de ícones para tipos de campos comuns
  const getIconForField = (key) => {
    const lowerKey = key.toLowerCase();
    if (lowerKey.includes('data') || lowerKey.includes('date')) return Calendar;
    if (lowerKey.includes('hora') || lowerKey.includes('time')) return Clock;
    if (lowerKey.includes('nome') || lowerKey.includes('name')) return User;
    if (lowerKey.includes('endereco') || lowerKey.includes('local') || lowerKey.includes('address')) return MapPin;
    if (lowerKey.includes('telefone') || lowerKey.includes('phone') || lowerKey.includes('celular')) return Phone;
    if (lowerKey.includes('email')) return Mail;
    return FileText;
  };

  // Formatação de labels
  const formatLabel = (key) => {
    return key
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  // Formatação de valores
  const formatValue = (value) => {
    if (typeof value === 'boolean') {
      return value ? 'Sim' : 'Não';
    }
    if (Array.isArray(value)) {
      return value.join(', ');
    }
    if (typeof value === 'object' && value !== null) {
      return JSON.stringify(value, null, 2);
    }
    return String(value);
  };

  // Preview: primeiros 3 campos
  const previewData = cleanData.slice(0, 3);
  const hasMoreData = cleanData.length > 3;

  return (
    <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-white shadow-lg">
      <CardHeader className="border-b border-blue-200 bg-gradient-to-r from-blue-100/50 to-transparent">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-blue-900">
            <FileText className="w-5 h-5" />
            Detalhes do Atendimento
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="gap-2"
          >
            {isExpanded ? (
              <>
                <EyeOff className="w-4 h-4" />
                Ocultar Detalhes
              </>
            ) : (
              <>
                <Eye className="w-4 h-4" />
                Ver Detalhes Completos
              </>
            )}
            {isExpanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        {!isExpanded ? (
          // PREVIEW: Apenas primeiros 3 campos com texto limitado
          <div className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              {previewData.map(([key, value]) => {
                const Icon = getIconForField(key);
                const formattedValue = formatValue(value);
                
                return (
                  <div 
                    key={key} 
                    className="bg-white rounded-lg p-4 border border-blue-100"
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-blue-100 rounded-lg flex-shrink-0">
                        <Icon className="w-4 h-4 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-600 mb-1">
                          {formatLabel(key)}
                        </p>
                        <p className="text-gray-900 font-semibold line-clamp-2">
                          {formattedValue}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            
            {hasMoreData && (
              <div className="text-center pt-2">
                <p className="text-sm text-blue-600 font-medium">
                  +{cleanData.length - 3} campo{cleanData.length - 3 > 1 ? 's' : ''} adicional{cleanData.length - 3 > 1 ? 'ais' : ''} disponível{cleanData.length - 3 > 1 ? 'eis' : ''}
                </p>
              </div>
            )}
          </div>
        ) : (
          // EXPANDIDO: Todos os campos com texto completo
          <div className="space-y-6">
            <div className="grid md:grid-cols-2 gap-4">
              {cleanData.map(([key, value]) => {
                const Icon = getIconForField(key);
                const formattedValue = formatValue(value);
                const isLongText = formattedValue.length > 100;
                
                return (
                  <div 
                    key={key} 
                    className={`${isLongText ? 'md:col-span-2' : ''} bg-white rounded-lg p-5 border border-blue-100 hover:border-blue-300 transition-all hover:shadow-md`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-2.5 bg-blue-100 rounded-lg flex-shrink-0">
                        <Icon className="w-5 h-5 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wide">
                          {formatLabel(key)}
                        </p>
                        <div className={`text-gray-900 font-medium ${isLongText ? 'whitespace-pre-wrap text-base leading-relaxed' : 'text-lg'}`}>
                          {formattedValue}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Informações do Dependente */}
            {parsedData.new_dependent && (
              <div className="pt-6 border-t border-blue-200">
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-2.5 bg-green-100 rounded-lg">
                    <User className="w-5 h-5 text-green-600" />
                  </div>
                  <h4 className="font-bold text-gray-900 text-lg">Novo Dependente</h4>
                </div>
                <div className="grid md:grid-cols-3 gap-4">
                  {parsedData.new_dependent.full_name && (
                    <div className="bg-white rounded-lg p-4 border border-green-100">
                      <p className="text-xs text-gray-600 mb-1 uppercase tracking-wide">Nome Completo</p>
                      <p className="font-semibold text-gray-900 text-base">{parsedData.new_dependent.full_name}</p>
                    </div>
                  )}
                  {parsedData.new_dependent.birth_date && (
                    <div className="bg-white rounded-lg p-4 border border-green-100">
                      <p className="text-xs text-gray-600 mb-1 uppercase tracking-wide">Data de Nascimento</p>
                      <p className="font-semibold text-gray-900 text-base">{parsedData.new_dependent.birth_date}</p>
                    </div>
                  )}
                  {parsedData.new_dependent.relationship && (
                    <div className="bg-white rounded-lg p-4 border border-green-100">
                      <p className="text-xs text-gray-600 mb-1 uppercase tracking-wide">Parentesco</p>
                      <p className="font-semibold text-gray-900 text-base">{parsedData.new_dependent.relationship}</p>
                    </div>
                  )}
                  {parsedData.new_dependent.life_status && (
                    <div className="bg-white rounded-lg p-4 border border-green-100">
                      <p className="text-xs text-gray-600 mb-1 uppercase tracking-wide">Status</p>
                      <Badge className={parsedData.new_dependent.life_status === 'VIVO' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}>
                        {parsedData.new_dependent.life_status}
                      </Badge>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Informações de Cancelamento */}
            {ticket.cancellation_reason && (
              <div className="pt-6 border-t border-orange-200">
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-2.5 bg-orange-100 rounded-lg">
                    <AlertCircle className="w-5 h-5 text-orange-600" />
                  </div>
                  <h4 className="font-bold text-gray-900 text-lg">Informações de Cancelamento</h4>
                </div>
                <div className="bg-orange-50 rounded-lg p-5 border border-orange-200">
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs text-gray-600 mb-2 uppercase tracking-wide">Motivo do Cancelamento</p>
                      <p className="font-semibold text-gray-900 text-base">{ticket.cancellation_reason}</p>
                    </div>
                    {ticket.cancellation_notes && (
                      <div>
                        <p className="text-xs text-gray-600 mb-2 uppercase tracking-wide">Observações</p>
                        <p className="text-gray-900 whitespace-pre-wrap leading-relaxed">{ticket.cancellation_notes}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}