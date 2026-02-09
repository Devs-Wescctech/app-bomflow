import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp, CheckCircle2, XCircle, Clock } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function PreSalesHistory({ sale, preSalesAgent }) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!sale) return null;

  const hasPreSalesData = sale.pre_sales_tabulation || sale.pre_sales_category || sale.pre_sales_notes;

  if (!hasPreSalesData) return null;

  return (
    <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-white">
      <CardHeader 
        className="cursor-pointer hover:bg-blue-100/50 transition-colors border-b border-blue-200"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-blue-900 text-base">
            <Clock className="w-5 h-5" />
            Dados da Pré-Venda
          </CardTitle>
          <Button variant="ghost" size="sm">
            {isExpanded ? (
              <ChevronUp className="w-5 h-5 text-blue-700" />
            ) : (
              <ChevronDown className="w-5 h-5 text-blue-700" />
            )}
          </Button>
        </div>
      </CardHeader>
      
      {isExpanded && (
        <CardContent className="pt-6 space-y-4">
          {/* Checklist Status */}
          <div>
            <h4 className="font-semibold text-gray-900 mb-3">Status da Validação</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2 bg-white p-3 rounded-lg border border-blue-100">
                {sale.address_verified ? (
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-600" />
                )}
                <span className="text-sm text-gray-700">Endereço</span>
              </div>

              <div className="flex items-center gap-2 bg-white p-3 rounded-lg border border-blue-100">
                {sale.holder_data_verified ? (
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-600" />
                )}
                <span className="text-sm text-gray-700">Titular</span>
              </div>

              <div className="flex items-center gap-2 bg-white p-3 rounded-lg border border-blue-100">
                {sale.dependents_data_verified ? (
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-600" />
                )}
                <span className="text-sm text-gray-700">Dependentes</span>
              </div>

              <div className="flex items-center gap-2 bg-white p-3 rounded-lg border border-green-100">
                {sale.adhesion_paid ? (
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-600" />
                )}
                <span className="text-sm text-gray-700">Adesão Paga</span>
              </div>
            </div>
          </div>

          {/* Tabulação */}
          {(sale.pre_sales_tabulation || sale.pre_sales_category) && (
            <div className="pt-4 border-t border-blue-200">
              <h4 className="font-semibold text-gray-900 mb-3">Tabulação Pré-Venda</h4>
              <div className="space-y-3 bg-white p-4 rounded-lg border border-blue-100">
                {sale.pre_sales_tabulation && (
                  <div>
                    <p className="text-sm text-gray-600">Motivo:</p>
                    <Badge className="bg-blue-100 text-blue-700 mt-1">
                      {sale.pre_sales_tabulation}
                    </Badge>
                  </div>
                )}
                
                {sale.pre_sales_category && (
                  <div>
                    <p className="text-sm text-gray-600">Categoria:</p>
                    <Badge className="bg-blue-100 text-blue-700 mt-1">
                      {sale.pre_sales_category}
                    </Badge>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Observações */}
          {sale.pre_sales_notes && (
            <div className="pt-4 border-t border-blue-200">
              <h4 className="font-semibold text-gray-900 mb-2">Observações do Pré-Venda</h4>
              <div className="bg-white p-4 rounded-lg border border-blue-100">
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{sale.pre_sales_notes}</p>
              </div>
            </div>
          )}

          {/* Agente Responsável */}
          {preSalesAgent && (
            <div className="pt-4 border-t border-blue-200">
              <h4 className="font-semibold text-gray-900 mb-2">Validado por</h4>
              <div className="bg-white p-3 rounded-lg border border-blue-100 flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center">
                  <span className="text-white font-semibold">
                    {preSalesAgent.name?.charAt(0)?.toUpperCase() || 'A'}
                  </span>
                </div>
                <div>
                  <p className="font-medium text-gray-900">{preSalesAgent.name}</p>
                  <p className="text-xs text-gray-500">{preSalesAgent.user_email}</p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}