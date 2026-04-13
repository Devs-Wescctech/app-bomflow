import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowLeft, 
  Gift, 
  DollarSign, 
  TrendingUp, 
  Clock, 
  CheckCircle,
  XCircle,
  Phone,
  User,
  Calendar,
  Target
} from "lucide-react";
import { createPageUrl } from "@/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function PortalReferralList() {
  const navigate = useNavigate();
  const [contactData, setContactData] = useState(null);

  useEffect(() => {
    const isAuth = localStorage.getItem('portal_authenticated');
    if (!isAuth) {
      navigate(createPageUrl("PortalLogin"));
      return;
    }

    const contact = localStorage.getItem('portal_contact');
    if (contact) {
      setContactData(JSON.parse(contact));
    }
  }, [navigate]);

  const { data: referrals = [], isLoading } = useQuery({
    queryKey: ['portal-referrals', contactData?.document],
    queryFn: () => base44.entities.Referral.filter({
      referrer_cpf: contactData?.document.replace(/\D/g, '')
    }, '-createdDate'),
    enabled: !!contactData?.document,
    initialData: [],
  });

  if (!contactData) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Métricas
  const totalReferrals = referrals.length;
  const convertedReferrals = referrals.filter(r => r.status === 'convertido');
  const pendingReferrals = referrals.filter(r => r.status === 'ativo');
  const totalCommissions = convertedReferrals.reduce((sum, r) => sum + (r.commission_value || 0), 0);
  const paidCommissions = referrals.filter(r => r.commission_status === 'paga');
  const totalPaid = paidCommissions.reduce((sum, r) => sum + (r.commission_value || 0), 0);
  const pendingCommissions = convertedReferrals.filter(r => r.commission_status !== 'paga');
  const totalPending = pendingCommissions.reduce((sum, r) => sum + (r.commission_value || 0), 0);

  const referrerLevel = convertedReferrals.length >= 2 ? 2 : 1;

  const getStatusBadge = (status) => {
    switch (status) {
      case 'ativo':
        return <Badge className="bg-blue-100 text-blue-800">Em Andamento</Badge>;
      case 'convertido':
        return <Badge className="bg-green-100 text-green-800">✅ Fechado</Badge>;
      case 'perdido':
        return <Badge className="bg-red-100 text-red-800">Perdido</Badge>;
      case 'cancelado':
        return <Badge className="bg-gray-100 text-gray-800">Cancelado</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const getCommissionBadge = (commission_status, status) => {
    if (status !== 'convertido') return null;
    
    switch (commission_status) {
      case 'paga':
        return <Badge className="bg-green-100 text-green-800">💰 Paga</Badge>;
      case 'aprovada':
        return <Badge className="bg-blue-100 text-blue-800">👍 Aprovada</Badge>;
      case 'cancelada':
        return <Badge className="bg-red-100 text-red-800">Cancelada</Badge>;
      default:
        return <Badge className="bg-yellow-100 text-yellow-800">⏳ Pendente</Badge>;
    }
  };

  const getStageName = (stage) => {
    const stages = {
      'novo': 'Novo',
      'contato_iniciado': 'Contato Iniciado',
      'proposta_enviada': 'Proposta Enviada',
      'fechado_ganho': 'Convertido',
      'fechado_perdido': 'Não Fechado',
    };
    return stages[stage] || stage;
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 to-white">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <Button
            variant="ghost"
            onClick={() => navigate(createPageUrl("PortalHome"))}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar
          </Button>
          <Button
            onClick={() => navigate(createPageUrl("PortalReferralCreate"))}
            className="bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-600 hover:to-yellow-700 text-white"
          >
            <Gift className="w-4 h-4 mr-2" />
            Nova Indicação
          </Button>
        </div>

        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Minhas Indicações</h1>
          <p className="text-gray-600">Acompanhe suas indicações e comissões</p>
        </div>

        {/* Dashboard */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card className="border-gray-200 bg-gradient-to-br from-gray-50 to-gray-100">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-600 font-medium">Total de Indicações</p>
                  <p className="text-2xl font-bold text-gray-700">{totalReferrals}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {convertedReferrals.length} fechada(s)
                  </p>
                </div>
                <Target className="w-8 h-8 text-gray-500 opacity-50" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-amber-200 bg-gradient-to-br from-amber-50 to-amber-100">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-amber-700 font-medium">Seu Nível</p>
                  <p className="text-2xl font-bold text-amber-800">
                    Nível {referrerLevel}
                  </p>
                  <p className="text-xs text-amber-600 mt-1">
                    R$ {referrerLevel === 2 ? '150' : '100'} por venda
                  </p>
                </div>
                <TrendingUp className="w-8 h-8 text-amber-500 opacity-50" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-green-200 bg-gradient-to-br from-green-50 to-green-100">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-green-600 font-medium">Comissões Pagas</p>
                  <p className="text-2xl font-bold text-green-700">R$ {totalPaid.toFixed(2)}</p>
                  <p className="text-xs text-green-600 mt-1">
                    {paidCommissions.length} pagamento(s)
                  </p>
                </div>
                <CheckCircle className="w-8 h-8 text-green-500 opacity-50" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-blue-600 font-medium">A Receber</p>
                  <p className="text-2xl font-bold text-blue-700">R$ {totalPending.toFixed(2)}</p>
                  <p className="text-xs text-blue-600 mt-1">
                    {pendingCommissions.length} pendente(s)
                  </p>
                </div>
                <Clock className="w-8 h-8 text-blue-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Lista de Indicações */}
        <Card>
          <CardHeader>
            <CardTitle>Histórico de Indicações</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                <p className="text-gray-500 mt-4">Carregando...</p>
              </div>
            ) : referrals.length === 0 ? (
              <div className="text-center py-12">
                <Gift className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                <p className="text-gray-500 mb-4">Você ainda não fez nenhuma indicação</p>
                <Button
                  onClick={() => navigate(createPageUrl("PortalReferralCreate"))}
                  className="bg-amber-500 hover:bg-amber-600"
                >
                  <Gift className="w-4 h-4 mr-2" />
                  Fazer Primeira Indicação
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {referrals.map((referral) => (
                  <div
                    key={referral.id}
                    className="p-4 border rounded-lg hover:shadow-md transition-all bg-white"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-3">
                          <h4 className="font-semibold text-gray-900">
                            {referral.referred_name}
                          </h4>
                          {getStatusBadge(referral.status)}
                          {getCommissionBadge(referral.commission_status, referral.status)}
                        </div>

                        <div className="grid md:grid-cols-3 gap-4 text-sm">
                          <div>
                            <p className="text-xs text-gray-500 flex items-center gap-1">
                              <Phone className="w-3 h-3" />
                              Telefone
                            </p>
                            <p className="font-medium">{referral.referred_phone}</p>
                          </div>

                          <div>
                            <p className="text-xs text-gray-500 flex items-center gap-1">
                              <Target className="w-3 h-3" />
                              Situação
                            </p>
                            <p className="font-medium">{getStageName(referral.stage)}</p>
                          </div>

                          <div>
                            <p className="text-xs text-gray-500 flex items-center gap-1">
                              <DollarSign className="w-3 h-3" />
                              Comissão
                            </p>
                            <p className="font-semibold text-green-600">
                              R$ {referral.commission_value?.toFixed(2) || '0.00'}
                            </p>
                          </div>
                        </div>

                        {referral.interest && (
                          <div className="mt-2">
                            <Badge variant="outline" className="text-xs">
                              {referral.interest}
                            </Badge>
                          </div>
                        )}

                        <div className="mt-3 pt-3 border-t text-xs text-gray-500">
                          <div className="flex items-center gap-4">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              Indicado em {format(new Date(referral.created_date), "dd/MM/yyyy", { locale: ptBR })}
                            </span>
                            {referral.converted_at && (
                              <span className="text-green-600 font-medium">
                                Fechado em {format(new Date(referral.converted_at), "dd/MM/yyyy", { locale: ptBR })}
                              </span>
                            )}
                            {referral.commission_paid_at && (
                              <span className="text-green-600 font-medium">
                                Pago em {format(new Date(referral.commission_paid_at), "dd/MM/yyyy", { locale: ptBR })}
                              </span>
                            )}
                          </div>
                        </div>

                        {referral.notes && (
                          <p className="text-xs text-gray-600 mt-2 italic">
                            Obs: {referral.notes}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}