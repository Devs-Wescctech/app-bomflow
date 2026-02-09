
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Download, Shield, Users, CreditCard, Calendar, CheckCircle, AlertCircle, Clock } from "lucide-react";
import { createPageUrl } from "@/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

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

export default function PortalContract() {
  const navigate = useNavigate();
  const [contact, setContact] = useState(null);
  const [contract, setContract] = useState(null);

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

  const { data: dependents = [] } = useQuery({
    queryKey: ['portalDependents', contract?.id],
    queryFn: async () => {
      if (!contract?.id) return [];
      return await base44.entities.Dependent.filter({ contract_id: contract.id });
    },
    enabled: !!contract?.id,
    initialData: [],
  });

  if (!contact || !contract) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const handleDownloadContract = () => {
    // Aqui você pode implementar a geração/download do contrato em PDF
    alert("Funcionalidade de download em desenvolvimento");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Header */}
      <div className="bg-white border-b shadow-sm">
        <div className="w-full px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate(createPageUrl("PortalHome"))}
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Meu Contrato</h1>
                <p className="text-sm text-gray-600">Plano Funeral - Detalhes do Contrato</p>
              </div>
            </div>
            <Button
              onClick={handleDownloadContract}
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
            >
              <Download className="w-4 h-4 mr-2" />
              Baixar Contrato
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="w-full p-6 space-y-6">
        {/* Resumo do Plano */}
        <Card className="shadow-lg border-blue-200">
          <CardHeader className="bg-gradient-to-r from-blue-50 to-purple-50 border-b border-blue-200">
            <CardTitle className="flex items-center gap-2 text-blue-900">
              <Shield className="w-6 h-6" />
              Plano Contratado
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="grid md:grid-cols-3 gap-6">
              <div>
                <p className="text-sm text-gray-600 mb-2">Plano</p>
                <p className="text-2xl font-bold text-gray-900">
                  {planLabels[contract.plan] || contract.plan.toUpperCase()}
                </p>
              </div>

              <div>
                <p className="text-sm text-gray-600 mb-2">Valor Mensal</p>
                <p className="text-2xl font-bold text-green-600">
                  R$ {contract.monthly_value?.toFixed(2).replace('.', ',')}
                </p>
              </div>

              <div>
                <p className="text-sm text-gray-600 mb-2">Status</p>
                <Badge className={
                  contract.status === 'active' ? 'bg-green-100 text-green-700 text-base px-3 py-1' :
                  contract.status === 'suspended' ? 'bg-yellow-100 text-yellow-700 text-base px-3 py-1' :
                  'bg-red-100 text-red-700 text-base px-3 py-1'
                }>
                  {contract.status === 'active' ? 'Ativo' : 
                   contract.status === 'suspended' ? 'Suspenso' : 'Cancelado'}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Status de Pagamento */}
        <Card className={`shadow-lg ${
          contract.payment_status === 'overdue' ? 'border-red-300 bg-red-50' : 
          contract.payment_status === 'up_to_date' ? 'border-green-300 bg-green-50' : 
          'border-yellow-300 bg-yellow-50'
        }`}>
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5" />
              Status de Pagamento
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              {contract.payment_status === 'up_to_date' ? (
                <>
                  <CheckCircle className="w-12 h-12 text-green-600" />
                  <div>
                    <h3 className="text-xl font-bold text-green-900">Pagamento em Dia</h3>
                    <p className="text-green-700">Seu plano está ativo e regularizado.</p>
                  </div>
                </>
              ) : contract.payment_status === 'overdue' ? (
                <>
                  <AlertCircle className="w-12 h-12 text-red-600" />
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-red-900">Pagamento em Atraso</h3>
                    <p className="text-red-700 mb-3">
                      Seu plano está com {contract.days_overdue} dias de atraso.
                    </p>
                    <Button 
                      onClick={() => navigate(createPageUrl("PortalBoletos"))}
                      className="bg-red-600 hover:bg-red-700"
                    >
                      Acessar 2ª Via de Boleto
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <Clock className="w-12 h-12 text-yellow-600" />
                  <div>
                    <h3 className="text-xl font-bold text-yellow-900">Pagamento Pendente</h3>
                    <p className="text-yellow-700">Aguardando confirmação de pagamento.</p>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Vigência */}
          <Card className="shadow-lg">
            <CardHeader className="border-b">
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Vigência do Contrato
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div>
                <p className="text-sm text-gray-600 mb-1">Data de Início</p>
                <p className="font-semibold text-gray-900">
                  {contract.start_date 
                    ? format(new Date(contract.start_date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
                    : 'Não informado'}
                </p>
              </div>

              <div>
                <p className="text-sm text-gray-600 mb-1">Término da Vigência</p>
                <p className="font-semibold text-gray-900">
                  {contract.end_date 
                    ? format(new Date(contract.end_date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
                    : 'Indeterminado'}
                </p>
              </div>

              {contract.support_hours && (
                <div>
                  <p className="text-sm text-gray-600 mb-1">Horário de Suporte</p>
                  <Badge variant="outline" className="text-sm">
                    <Clock className="w-3 h-3 mr-1" />
                    {contract.support_hours}
                  </Badge>
                </div>
              )}

              <div>
                <p className="text-sm text-gray-600 mb-1">SLA Contratado</p>
                <Badge className={
                  contract.sla_tier === 'vip' ? 'bg-purple-100 text-purple-700' :
                  contract.sla_tier === 'premium' ? 'bg-blue-100 text-blue-700' :
                  'bg-gray-100 text-gray-700'
                }>
                  {contract.sla_tier?.toUpperCase()}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Dados do Titular */}
          <Card className="shadow-lg">
            <CardHeader className="border-b">
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5" />
                Titular do Contrato
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div>
                <p className="text-sm text-gray-600 mb-1">Nome Completo</p>
                <p className="font-semibold text-gray-900">{contact.name}</p>
              </div>

              <div>
                <p className="text-sm text-gray-600 mb-1">CPF</p>
                <p className="font-semibold text-gray-900">{contact.document}</p>
              </div>

              {contact.email && (
                <div>
                  <p className="text-sm text-gray-600 mb-1">E-mail</p>
                  <p className="font-semibold text-gray-900">{contact.email}</p>
                </div>
              )}

              {contact.phone && (
                <div>
                  <p className="text-sm text-gray-600 mb-1">Telefone</p>
                  <p className="font-semibold text-gray-900">{contact.phone}</p>
                </div>
              )}

              {contact.vip && (
                <Badge className="bg-purple-100 text-purple-700">
                  <Shield className="w-3 h-3 mr-1" />
                  Cliente VIP
                </Badge>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Dependentes */}
        <Card className="shadow-lg">
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Dependentes Cobertos ({dependents.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            {dependents.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p>Nenhum dependente cadastrado neste plano</p>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                {dependents.map(dep => (
                  <div key={dep.id} className="flex items-center gap-4 p-4 border rounded-lg bg-gray-50">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-white font-semibold text-lg">
                        {dep.full_name?.charAt(0)?.toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{dep.full_name}</p>
                      <p className="text-sm text-gray-600">{dep.relationship}</p>
                      {dep.birth_date && (
                        <p className="text-xs text-gray-500">
                          Nascimento: {format(new Date(dep.birth_date), "dd/MM/yyyy", { locale: ptBR })}
                        </p>
                      )}
                      <Badge className={
                        dep.life_status === 'VIVO' 
                          ? 'bg-green-100 text-green-700 text-xs mt-1' 
                          : 'bg-gray-100 text-gray-700 text-xs mt-1'
                      }>
                        {dep.life_status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Informações Importantes */}
        <Card className="shadow-lg bg-blue-50 border-blue-200">
          <CardContent className="pt-6">
            <h3 className="font-semibold text-blue-900 mb-3">📋 Informações Importantes</h3>
            <ul className="space-y-2 text-sm text-blue-800">
              <li>• O pagamento deve ser realizado até o dia {contract.payment_due_day || 10} de cada mês</li>
              <li>• Em caso de atraso, o plano pode ser suspenso temporariamente</li>
              <li>• Para incluir ou excluir dependentes, abra um atendimento no portal</li>
              <li>• Mantenha seus dados cadastrais sempre atualizados</li>
              <li>• Em caso de sinistro, entre em contato imediatamente: 0800 777 1234</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
