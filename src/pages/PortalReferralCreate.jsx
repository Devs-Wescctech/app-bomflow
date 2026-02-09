import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, Gift, Loader2, CheckCircle, Users, DollarSign, Star } from "lucide-react";
import { createPageUrl } from "@/utils";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { calculateCommissionValue, getCommissionFromConversions, getLevelDescription, getNextLevelInfo } from "@/utils/commissionRules";

const INTERESTS = [
  "Essencial",
  "Total Mais",
  "Bom Med",
  "Bom Auto",
  "Bom Pet",
  "Bom Pet Saúde",
  "Pérola",
  "Rubi",
  "Topázio"
];

export default function PortalReferralCreate() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [contactData, setContactData] = useState(null);
  const [contractData, setContractData] = useState(null);
  const [referrerLevel, setReferrerLevel] = useState(1);
  const [totalConversions, setTotalConversions] = useState(0);
  
  const [formData, setFormData] = useState({
    referred_name: "",
    referred_cpf: "",
    referred_phone: "",
    referred_email: "",
    referred_address: "",
    referred_birth_date: "",
    relationship: "",
    interest: "",
    monthly_value: "",
    adhesion_value: "",
    total_dependents: "",
    notes: "",
  });

  useEffect(() => {
    const isAuth = localStorage.getItem('portal_authenticated');
    if (!isAuth) {
      navigate(createPageUrl("PortalLogin"));
      return;
    }

    const contact = localStorage.getItem('portal_contact');
    const contract = localStorage.getItem('portal_contract');
    
    if (contact) {
      const parsedContact = JSON.parse(contact);
      setContactData(parsedContact);
      
      // Buscar indicações anteriores para calcular nível
      fetchReferrerLevel(parsedContact.document);
    }
    
    if (contract && contract !== 'null') {
      setContractData(JSON.parse(contract));
    }
  }, [navigate]);

  const fetchReferrerLevel = async (cpf) => {
    try {
      const previousReferrals = await base44.entities.Referral.filter({
        referrer_cpf: cpf.replace(/\D/g, ''),
        status: 'convertido'
      });

      const conversions = previousReferrals.length;
      const { level } = getCommissionFromConversions(conversions);

      setTotalConversions(conversions);
      setReferrerLevel(level);
    } catch (error) {
      console.error('Erro ao buscar histórico:', error);
    }
  };

  const createReferralMutation = useMutation({
    mutationFn: (data) => base44.entities.Referral.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portal-referrals'] });
      toast.success('✅ Indicação cadastrada com sucesso!');
      navigate(createPageUrl("PortalReferralList"));
    },
    onError: (error) => {
      toast.error('Erro ao criar indicação: ' + error.message);
    }
  });

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.referred_name || !formData.referred_phone) {
      toast.error('Preencha nome e telefone do indicado!');
      return;
    }

    const monthlyValue = parseFloat(formData.monthly_value || 0);
    const adhesionValue = parseFloat(formData.adhesion_value || 0);
    const estimatedValue = monthlyValue + adhesionValue;

    const commissionValue = calculateCommissionValue(referrerLevel);
    const referralCode = `REF-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    const referralData = {
      referral_code: referralCode,
      referrer_cpf: contactData.document.replace(/\D/g, ''),
      referrer_name: contactData.name,
      referrer_phone: contactData.phone,
      referrer_email: contactData.email || '',
      referrer_contract_id: contractData?.numero_contrato_erp || '',
      referrer_level: referrerLevel,
      referrer_total_conversions: totalConversions,
      ...formData,
      referred_cpf: formData.referred_cpf ? formData.referred_cpf.replace(/\D/g, '') : '',
      referred_phone: formData.referred_phone.replace(/\D/g, ''),
      total_dependents: formData.total_dependents ? parseInt(formData.total_dependents) : null,
      monthly_value: monthlyValue > 0 ? monthlyValue : null,
      adhesion_value: adhesionValue > 0 ? adhesionValue : null,
      value: estimatedValue > 0 ? estimatedValue : null,
      commission_value: commissionValue,
      stage: "novo",
      status: "ativo",
      stage_history: [
        {
          stage: "novo",
          previous_stage: null,
          changed_at: new Date().toISOString(),
          changed_by: contactData.email || contactData.name,
        }
      ],
    };

    createReferralMutation.mutate(referralData);
  };

  if (!contactData) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const commissionValue = calculateCommissionValue(referrerLevel);

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 to-white">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <Button
          variant="ghost"
          onClick={() => navigate(createPageUrl("PortalHome"))}
          className="mb-6"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Voltar
        </Button>

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-amber-500 to-yellow-600 rounded-full mb-4">
            <Gift className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Programa Indique e Ganhe</h1>
          <p className="text-gray-600">Indique amigos e familiares e ganhe até R$ 150 por indicação fechada!</p>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Coluna Principal */}
          <div className="lg:col-span-2 space-y-6">
            {/* Seus Dados */}
            <Card className="border-amber-200 bg-amber-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-amber-900">
                  <Users className="w-5 h-5" />
                  Você (Indicador)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-sm">
                  <div>
                    <p className="text-gray-600">Nome:</p>
                    <p className="font-semibold text-gray-900">{contactData.name}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">CPF:</p>
                    <p className="font-semibold text-gray-900">{contactData.document}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Telefone:</p>
                    <p className="font-semibold text-gray-900">{contactData.phone}</p>
                  </div>
                  <div className="pt-3 border-t border-amber-300">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className={getLevelDescription(referrerLevel).color}>
                        {getLevelDescription(referrerLevel).badge}
                      </Badge>
                    </div>
                    <p className="text-xs text-gray-600">
                      {totalConversions} indicação(ões) fechada(s) até agora
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {getNextLevelInfo(totalConversions, referrerLevel)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Formulário do Indicado */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Dados de Quem Você Está Indicando
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <Label>Nome Completo *</Label>
                      <Input
                        value={formData.referred_name}
                        onChange={(e) => setFormData({...formData, referred_name: e.target.value})}
                        required
                        className="mt-1"
                        placeholder="Nome da pessoa que você está indicando"
                      />
                    </div>

                    <div>
                      <Label>CPF</Label>
                      <Input
                        value={formData.referred_cpf}
                        onChange={(e) => setFormData({...formData, referred_cpf: e.target.value})}
                        placeholder="000.000.000-00"
                        className="mt-1"
                      />
                    </div>

                    <div>
                      <Label>Telefone/WhatsApp *</Label>
                      <Input
                        value={formData.referred_phone}
                        onChange={(e) => setFormData({...formData, referred_phone: e.target.value})}
                        placeholder="(00) 00000-0000"
                        required
                        className="mt-1"
                      />
                    </div>

                    <div>
                      <Label>Email</Label>
                      <Input
                        type="email"
                        value={formData.referred_email}
                        onChange={(e) => setFormData({...formData, referred_email: e.target.value})}
                        className="mt-1"
                        placeholder="email@exemplo.com"
                      />
                    </div>

                    <div>
                      <Label>Data de Nascimento</Label>
                      <Input
                        type="date"
                        value={formData.referred_birth_date}
                        onChange={(e) => setFormData({...formData, referred_birth_date: e.target.value})}
                        className="mt-1"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <Label>Endereço Completo</Label>
                      <Input
                        value={formData.referred_address}
                        onChange={(e) => setFormData({...formData, referred_address: e.target.value})}
                        placeholder="Rua, número, bairro, cidade"
                        className="mt-1"
                      />
                    </div>

                    <div>
                      <Label>Relação com Você</Label>
                      <Input
                        value={formData.relationship}
                        onChange={(e) => setFormData({...formData, relationship: e.target.value})}
                        placeholder="Ex: Amigo, Familiar, Vizinho"
                        className="mt-1"
                      />
                    </div>

                    <div>
                      <Label>Plano de Interesse</Label>
                      <Select value={formData.interest} onValueChange={(value) => setFormData({...formData, interest: value})}>
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          {INTERESTS.map(interest => (
                            <SelectItem key={interest} value={interest}>
                              {interest}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <Label>Observações</Label>
                    <Textarea
                      value={formData.notes}
                      onChange={(e) => setFormData({...formData, notes: e.target.value})}
                      rows={3}
                      placeholder="Informações adicionais que possam ajudar..."
                      className="mt-1"
                    />
                  </div>

                  <Alert className="bg-blue-50 border-blue-200">
                    <CheckCircle className="w-4 h-4 text-blue-600" />
                    <AlertDescription className="text-blue-800 text-sm">
                      Nossa equipe entrará em contato com a pessoa indicada para apresentar nossos serviços.
                      Você será notificado sobre o andamento da indicação.
                    </AlertDescription>
                  </Alert>

                  <div className="flex gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => navigate(createPageUrl("PortalReferralList"))}
                      className="flex-1"
                    >
                      Ver Minhas Indicações
                    </Button>
                    <Button
                      type="submit"
                      disabled={createReferralMutation.isPending}
                      className="flex-1 bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-600 hover:to-yellow-700 text-white"
                    >
                      {createReferralMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Enviando...
                        </>
                      ) : (
                        <>
                          <Gift className="w-4 h-4 mr-2" />
                          Enviar Indicação
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Sua Comissão */}
            <Card className="border-green-200 bg-green-50">
              <CardHeader>
                <CardTitle className="text-green-800 text-lg flex items-center gap-2">
                  <DollarSign className="w-5 h-5" />
                  Sua Comissão
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center mb-4">
                  <p className="text-sm text-gray-600 mb-1">Por cada indicação fechada:</p>
                  <p className="text-4xl font-bold text-green-700">
                    R$ {commissionValue}
                  </p>
                  <Badge className={getLevelDescription(referrerLevel).color + " mt-2"}>
                    {getLevelDescription(referrerLevel).badge}
                  </Badge>
                </div>
                {referrerLevel < 3 && (
                  <Alert className="bg-amber-50 border-amber-300">
                    <Star className="w-4 h-4 text-amber-600" />
                    <AlertDescription className="text-amber-800 text-xs">
                      {getNextLevelInfo(totalConversions, referrerLevel)}
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            {/* Como Funciona */}
            <Card className="border-blue-200 bg-blue-50">
              <CardHeader>
                <CardTitle className="text-blue-800 text-lg">ℹ️ Como Funciona</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-blue-900 space-y-2">
                <p>✅ <strong>1.</strong> Preencha os dados da pessoa</p>
                <p>✅ <strong>2.</strong> Nossa equipe entra em contato</p>
                <p>✅ <strong>3.</strong> Se fechar o contrato, você ganha!</p>
                <p>✅ <strong>4.</strong> Comissão paga após confirmação</p>
                
                <div className="mt-4 pt-4 border-t border-blue-300">
                  <p className="font-semibold mb-2">💎 Sistema de Níveis:</p>
                  <p className="text-xs">• <strong>Nível 1:</strong> R$ 100/indicação (1-3 vendas)</p>
                  <p className="text-xs">• <strong>Nível 2:</strong> R$ 150/indicação (4-12 vendas)</p>
                  <p className="text-xs">• <strong>Nível 3:</strong> R$ 200/indicação (13+ vendas)</p>
                </div>
              </CardContent>
            </Card>

            {/* Dicas */}
            <Card className="border-purple-200 bg-purple-50">
              <CardHeader>
                <CardTitle className="text-purple-800 text-lg">💡 Dicas de Sucesso</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-purple-900 space-y-2">
                <p>• Explique os benefícios do plano</p>
                <p>• Indique pessoas que realmente precisam</p>
                <p>• Mantenha os dados completos e corretos</p>
                <p>• Acompanhe suas indicações regularmente</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}