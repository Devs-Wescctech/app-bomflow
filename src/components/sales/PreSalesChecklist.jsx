import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckCircle2, AlertCircle, ArrowRight, Loader2, Save } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

const TABULATION_OPTIONS = [
  "Dados Validados",
  "Documentação Pendente",
  "Aguardando Pagamento",
  "Dados Incompletos",
  "Cliente Solicitou Revisão",
  "Outros"
];

const CATEGORY_OPTIONS = [
  "Validação Completa",
  "Validação Parcial",
  "Pendências Identificadas",
  "Necessita Ajustes"
];

export default function PreSalesChecklist({ sale, onComplete, isSubmitting }) {
  const [checklist, setChecklist] = useState({
    address_verified: sale?.address_verified || false,
    holder_data_verified: sale?.holder_data_verified || false,
    dependents_data_verified: sale?.dependents_data_verified || false,
    adhesion_paid: sale?.adhesion_paid || false,
  });

  const [tabulation, setTabulation] = useState(sale?.pre_sales_tabulation || "");
  const [category, setCategory] = useState(sale?.pre_sales_category || "");
  const [notes, setNotes] = useState(sale?.pre_sales_notes || "");
  const [isSaving, setIsSaving] = useState(false);

  // Atualizar quando sale mudar
  useEffect(() => {
    if (sale) {
      setChecklist({
        address_verified: sale.address_verified || false,
        holder_data_verified: sale.holder_data_verified || false,
        dependents_data_verified: sale.dependents_data_verified || false,
        adhesion_paid: sale.adhesion_paid || false,
      });
      setTabulation(sale.pre_sales_tabulation || "");
      setCategory(sale.pre_sales_category || "");
      setNotes(sale.pre_sales_notes || "");
    }
  }, [sale]);

  const allChecked = Object.values(checklist).every(v => v === true);

  const handleCheckChange = (field) => {
    setChecklist(prev => ({
      ...prev,
      [field]: !prev[field]
    }));
  };

  const handleSaveProgress = async () => {
    setIsSaving(true);
    try {
      await base44.entities.Sale.update(sale.id, {
        ...checklist,
        pre_sales_tabulation: tabulation,
        pre_sales_category: category,
        pre_sales_notes: notes,
      });
      toast.success("Progresso salvo com sucesso!");
    } catch (error) {
      console.error("Erro ao salvar progresso:", error);
      toast.error("Erro ao salvar progresso");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmit = () => {
    if (!tabulation || !category) {
      toast.error("Preencha a tabulação e categoria para enviar para Pós-Vendas");
      return;
    }

    onComplete({
      ...checklist,
      pre_sales_tabulation: tabulation,
      pre_sales_category: category,
      pre_sales_notes: notes,
    });
  };

  return (
    <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-white shadow-lg">
      <CardHeader className="border-b border-blue-200 bg-gradient-to-r from-blue-100/50 to-transparent">
        <CardTitle className="flex items-center gap-2 text-blue-900">
          <CheckCircle2 className="w-5 h-5" />
          Checklist de Pré-Venda
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-6 space-y-6">
        {/* Checklist Items */}
        <div className="space-y-4">
          <h4 className="font-semibold text-gray-900 mb-3">Validação de Dados</h4>
          
          <div className="flex items-center space-x-3 bg-white p-4 rounded-lg border border-blue-100">
            <Checkbox
              id="address"
              checked={checklist.address_verified}
              onCheckedChange={() => handleCheckChange('address_verified')}
              className="h-5 w-5"
            />
            <label
              htmlFor="address"
              className="flex-1 text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
            >
              <span className="block text-gray-900">Dados de Endereço</span>
              <span className="block text-xs text-gray-500 mt-1">
                Endereço completo, CEP, complemento verificados e corretos
              </span>
            </label>
            {checklist.address_verified && (
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            )}
          </div>

          <div className="flex items-center space-x-3 bg-white p-4 rounded-lg border border-blue-100">
            <Checkbox
              id="holder"
              checked={checklist.holder_data_verified}
              onCheckedChange={() => handleCheckChange('holder_data_verified')}
              className="h-5 w-5"
            />
            <label
              htmlFor="holder"
              className="flex-1 text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
            >
              <span className="block text-gray-900">Dados do Titular</span>
              <span className="block text-xs text-gray-500 mt-1">
                Nome completo, CPF, RG, data de nascimento, telefone e email verificados
              </span>
            </label>
            {checklist.holder_data_verified && (
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            )}
          </div>

          <div className="flex items-center space-x-3 bg-white p-4 rounded-lg border border-blue-100">
            <Checkbox
              id="dependents"
              checked={checklist.dependents_data_verified}
              onCheckedChange={() => handleCheckChange('dependents_data_verified')}
              className="h-5 w-5"
            />
            <label
              htmlFor="dependents"
              className="flex-1 text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
            >
              <span className="block text-gray-900">Dados dos Dependentes</span>
              <span className="block text-xs text-gray-500 mt-1">
                Todos os dependentes com dados completos e documentação correta
              </span>
            </label>
            {checklist.dependents_data_verified && (
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            )}
          </div>

          <div className="flex items-center space-x-3 bg-white p-4 rounded-lg border border-green-100">
            <Checkbox
              id="adhesion"
              checked={checklist.adhesion_paid}
              onCheckedChange={() => handleCheckChange('adhesion_paid')}
              className="h-5 w-5"
            />
            <label
              htmlFor="adhesion"
              className="flex-1 text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
            >
              <span className="block text-gray-900">Adesão Paga (R$ 60,00)</span>
              <span className="block text-xs text-gray-500 mt-1">
                Pagamento da adesão confirmado e comprovante anexado
              </span>
            </label>
            {checklist.adhesion_paid && (
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            )}
          </div>
        </div>

        {/* Status Summary */}
        <div className="pt-4 border-t border-blue-200">
          {allChecked ? (
            <Alert className="bg-green-50 border-green-200">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              <AlertDescription className="text-green-800">
                <strong>Todos os itens validados!</strong> Preencha a tabulação para enviar para Pós-Vendas.
              </AlertDescription>
            </Alert>
          ) : (
            <Alert className="bg-orange-50 border-orange-200">
              <AlertCircle className="w-4 h-4 text-orange-600" />
              <AlertDescription className="text-orange-800">
                <strong>Itens pendentes:</strong> {Object.values(checklist).filter(v => !v).length} item(ns) ainda não validado(s)
              </AlertDescription>
            </Alert>
          )}
        </div>

        {/* Tabulação */}
        <div className="space-y-4 pt-4 border-t border-blue-200">
          <h4 className="font-semibold text-gray-900">Tabulação</h4>
          
          <div>
            <Label className="text-gray-900">Motivo</Label>
            <Select value={tabulation} onValueChange={setTabulation}>
              <SelectTrigger className="mt-1 bg-white">
                <SelectValue placeholder="Selecione o motivo" />
              </SelectTrigger>
              <SelectContent>
                {TABULATION_OPTIONS.map(option => (
                  <SelectItem key={option} value={option}>{option}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-gray-900">Categoria</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="mt-1 bg-white">
                <SelectValue placeholder="Selecione a categoria" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map(option => (
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
              placeholder="Observações adicionais sobre a validação..."
              className="mt-1 bg-white"
              rows={4}
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-between pt-4 border-t border-blue-200">
          <Button
            onClick={handleSaveProgress}
            disabled={isSaving}
            variant="outline"
            className="gap-2"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Salvar Progresso
              </>
            )}
          </Button>

          <Button
            onClick={handleSubmit}
            disabled={!tabulation || !category || isSubmitting}
            className="bg-blue-600 hover:bg-blue-700 gap-2"
            size="lg"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                Enviar para Pós-Vendas
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}