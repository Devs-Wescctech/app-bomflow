import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { buscarClienteERP, buscarHistoricoIndicacoes } from "@/api/erpService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Search, UserPlus, Loader2, CheckCircle, Gift } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { useToast } from "@/components/ui/use-toast";
import { Badge } from "@/components/ui/badge";
import { getCommissionFromConversions, calculateCommissionValue, getLevelDescription, getNextLevelInfo, COMMISSION_RULES } from "@/utils/commissionRules";

const INTERESTS = [
  "Essencial",
  "Total Mais",
  "Bom Med",
  "Bom Auto",
  "Bom Pet",
  "Bom Pet Saúde",
  "Pérola",
  "Rubi",
  "Topázio",
  "Outros"
];

// Função para formatar CPF
const formatCPF = (value) => {
  const cleanValue = value.replace(/\D/g, '');
  if (cleanValue.length <= 11) {
    return cleanValue
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }
  return value;
};

export default function ReferralCreate() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  // Estado da busca do indicador
  const [referrerCPF, setReferrerCPF] = useState("");
  const [searchingReferrer, setSearchingReferrer] = useState(false);
  const [referrerData, setReferrerData] = useState(null);
  const [referrerLevel, setReferrerLevel] = useState(1);
  const [referrerConversions, setReferrerConversions] = useState(0);
  
  // Dados do indicado
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

  // Agente selecionado (para admin poder escolher)
  const [selectedAgentId, setSelectedAgentId] = useState("");

  const { data: agents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: () => base44.entities.Agent.list(),
  });

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const currentAgentType = user?.agent?.agentType || user?.agent?.agent_type;
  const isAdmin = currentAgentType === 'admin' || currentAgentType === 'supervisor' || currentAgentType === 'sales_supervisor';

  const salesAgentsList = agents.filter(a => 
    a.active !== false && 
    (a.agentType === 'sales' || a.agent_type === 'sales')
  ).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR'));

  const createReferralMutation = useMutation({
    mutationFn: (data) => base44.entities.Referral.create(data),
  });

  const handleSearchReferrer = async () => {
    if (!referrerCPF || referrerCPF.replace(/\D/g, '').length < 11) {
      toast({ title: "Erro", description: "Digite um CPF válido", variant: "destructive" });
      return;
    }

    setSearchingReferrer(true);
    setReferrerData(null);
    
    try {
      console.log('Buscando cliente indicador no ERP...');
      
      const cpfClean = referrerCPF.replace(/\D/g, '');
      
      const response = await buscarClienteERP(cpfClean);

      console.log('Resposta do ERP:', response);

      if (!response.success) {
        if (response.noContract) {
          toast({ title: "CPF sem contrato ativo", description: "Este cliente não possui contrato ativo no ERP", variant: "destructive" });
          setSearchingReferrer(false);
          return;
        }
        
        if (response.notFound) {
          toast({ title: "Erro", description: "CPF não encontrado no ERP", variant: "destructive" });
        } else {
          toast({ title: "Erro", description: response.error || "Erro ao buscar dados no ERP", variant: "destructive" });
        }
        setSearchingReferrer(false);
        return;
      }

      const erpData = response.data;
      console.log('Dados recebidos:', erpData);

      // Pegar dados do primeiro registro raw do ERP
      const rawRecord = erpData.raw_erp_data?.[0] || {};
      
      const indicadorData = {
        nome: rawRecord.titular || rawRecord.nome_dependente || erpData.contact?.name || '',
        cpf: erpData.contact?.document || rawRecord.cpf || '',
        telefone: rawRecord.cel || erpData.contact?.phones?.[0] || '',
        email: rawRecord.e_mail || erpData.contact?.emails?.[0] || '',
        endereco: erpData.contact?.address ? 
          `${erpData.contact.address.logradouro}, ${erpData.contact.address.numero}${erpData.contact.address.complemento ? ' - ' + erpData.contact.address.complemento : ''} - ${erpData.contact.address.bairro} - ${erpData.contact.address.cidade}` : '',
        contrato: rawRecord.id || erpData.contracts?.[0]?.numero_contrato_erp || '',
        dataNascimento: erpData.contact?.birth_date || rawRecord.data_nascimento || '',
        statusPagamento: rawRecord.status_pagamento || erpData.financial?.status_geral || '',
        totalContratos: erpData.financial?.total_contratos || 0,
        erp_raw: erpData
      };

      const previousReferrals = await buscarHistoricoIndicacoes(cpfClean);

      const totalConversions = previousReferrals.length;
      const { level, value: commissionValueForToast } = getCommissionFromConversions(totalConversions);

      setReferrerConversions(totalConversions);
      setReferrerLevel(level);
      setReferrerData(indicadorData);
      
      toast({ title: "Sucesso", description: `Cliente encontrado: ${indicadorData.nome} — Nível ${level} - Comissão: R$ ${commissionValueForToast},00 (${totalConversions} ${totalConversions !== 1 ? 'indicações convertidas' : 'indicação convertida'})` });

    } catch (error) {
      console.error('Erro ao buscar cliente:', error);
      
      if (error.status === 404 || error.data?.notFound) {
        if (error.data?.noContract) {
          toast({ title: "CPF sem contrato ativo", description: "Este cliente não possui contrato ativo no ERP", variant: "destructive" });
        } else {
          toast({ title: "Erro", description: "CPF não encontrado no ERP", variant: "destructive" });
        }
      } else if (error.status === 401) {
        toast({ title: "Token do ERP inválido ou expirado", description: "Entre em contato com o administrador para atualizar o token", variant: "destructive" });
      } else {
        toast({ title: "Erro", description: "Erro ao buscar cliente: " + (error.message || 'Erro desconhecido'), variant: "destructive" });
      }
    }
    
    setSearchingReferrer(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      if (!referrerData) {
        toast({ title: "Erro", description: "Busque o cliente indicador primeiro!", variant: "destructive" });
        return;
      }

      if (!formData.referred_name || !formData.referred_phone) {
        toast({ title: "Erro", description: "Preencha nome e telefone do indicado!", variant: "destructive" });
        return;
      }

      const monthlyValue = parseFloat(formData.monthly_value || 0);
      const adhesionValue = parseFloat(formData.adhesion_value || 0);
      const estimatedValue = monthlyValue + adhesionValue;

      const commissionVal = calculateCommissionValue(referrerLevel);

      const referralCode = `REF-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

      let assignedAgentId = null;
      
      if (isAdmin && selectedAgentId) {
        assignedAgentId = selectedAgentId;
      } else if (user?.agent?.id) {
        assignedAgentId = user.agent.id;
      } else {
        const userAgent = agents.find(a => 
          a.userEmail === user?.email || a.user_email === user?.email || a.email === user?.email
        );
        if (userAgent) {
          assignedAgentId = userAgent.id;
        }
      }

      const referralData = {
        referralCode: referralCode,
        referrerCpf: referrerCPF.replace(/\D/g, ''),
        referrerName: referrerData.nome,
        referrerPhone: referrerData.telefone,
        referrerEmail: referrerData.email || null,
        referrerContractId: referrerData.contrato || null,
        referrerErpData: referrerData.erp_raw || null,
        referrerLevel: referrerLevel,
        referrerTotalConversions: referrerConversions,
        referredName: formData.referred_name,
        referredCpf: formData.referred_cpf ? formData.referred_cpf.replace(/\D/g, '') : null,
        referredPhone: formData.referred_phone.replace(/\D/g, ''),
        referredEmail: formData.referred_email || null,
        referredAddress: formData.referred_address || null,
        referredBirthDate: formData.referred_birth_date || null,
        relationship: formData.relationship || null,
        interest: formData.interest || null,
        notes: formData.notes || null,
        totalDependents: formData.total_dependents ? parseInt(formData.total_dependents) : null,
        monthlyValue: monthlyValue > 0 ? monthlyValue : null,
        adhesionValue: adhesionValue > 0 ? adhesionValue : null,
        value: estimatedValue > 0 ? estimatedValue : null,
        commissionValue: commissionVal,
        agentId: assignedAgentId,
        stage: "novo",
        status: "ativo",
        stageHistory: [
          {
            stage: "novo",
            previousStage: null,
            changedAt: new Date().toISOString(),
            changedBy: user?.email || "Sistema",
          }
        ],
      };

      console.log('[ReferralCreate] Enviando referralData:', JSON.stringify(referralData, null, 2));

      const newReferral = await createReferralMutation.mutateAsync(referralData);

      console.log('[ReferralCreate] Cadastro de indicação SUCESSO:', newReferral);

      queryClient.invalidateQueries({ queryKey: ['referrals'] });
      queryClient.invalidateQueries({ queryKey: ['referrals-pipeline'] });
      toast({ title: "Sucesso", description: "Cadastro realizado com Sucesso" });

      const referralId = newReferral?.id;
      if (referralId) {
        console.log('[ReferralCreate] Fluxo de sucesso concluído, redirecionando para detalhes id:', referralId);
        navigate(`${createPageUrl("ReferralDetail")}?id=${referralId}`);
      } else {
        console.log('[ReferralCreate] Fluxo de sucesso concluído, redirecionando para pipeline (sem ID)');
        navigate(createPageUrl("ReferralPipeline"));
      }
    } catch (err) {
      console.error('[ReferralCreate] ERRO no cadastro de indicação:', err);
      const errorMsg = err?.message || 'Não foi possível cadastrar a indicação. Verifique os dados e tente novamente.';
      toast({ title: "Erro ao cadastrar indicação", description: errorMsg, variant: "destructive" });
      console.log('[ReferralCreate] Toast de erro exibido para o usuário');
    }
  };

  // Calcular comissão para exibição
  const commissionValue = calculateCommissionValue(referrerLevel);

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50 to-white p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(createPageUrl("ReferralPipeline"))}
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
                <Gift className="w-8 h-8 text-purple-600" />
                Nova Indicação
              </h1>
              <p className="text-gray-500 mt-1">Cadastre uma nova indicação de cliente</p>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Coluna Principal */}
          <div className="lg:col-span-2 space-y-6">
            {/* 1. BUSCAR CLIENTE INDICADOR */}
            <Card className="border-purple-200 bg-purple-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-purple-800">
                  <Search className="w-5 h-5" />
                  1. Buscar Cliente Indicador
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-purple-900">CPF do Cliente (Quem está indicando)</Label>
                  <div className="flex gap-2 mt-2">
                    <Input
                      value={referrerCPF}
                      onChange={(e) => setReferrerCPF(formatCPF(e.target.value))}
                      placeholder="000.000.000-00"
                      className="bg-white"
                      maxLength={14}
                    />
                    <Button
                      onClick={handleSearchReferrer}
                      disabled={searchingReferrer || referrerCPF.replace(/\D/g, '').length < 11}
                      className="bg-purple-600 hover:bg-purple-700"
                    >
                      {searchingReferrer ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Search className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-purple-700 mt-1">
                    Digite o CPF do cliente para buscar no ERP Bom Pastor
                  </p>
                </div>

                {searchingReferrer && (
                  <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                      <p className="text-sm text-blue-800">Buscando dados no ERP...</p>
                    </div>
                  </div>
                )}

                {referrerData && (
                  <div className="p-4 bg-white rounded-lg border-2 border-purple-300">
                    <div className="flex items-center gap-2 mb-3">
                      <CheckCircle className="w-5 h-5 text-green-600" />
                      <span className="font-semibold text-green-900">Cliente Encontrado!</span>
                      {referrerData.statusPagamento && (
                        <Badge className={referrerData.statusPagamento === 'EM DIA' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                          {referrerData.statusPagamento}
                        </Badge>
                      )}
                    </div>
                    <div className="space-y-2 text-sm">
                      <p><strong>Nome:</strong> {referrerData.nome}</p>
                      <p><strong>CPF:</strong> {referrerData.cpf}</p>
                      {referrerData.telefone && <p><strong>Telefone:</strong> {referrerData.telefone}</p>}
                      {referrerData.email && <p><strong>Email:</strong> {referrerData.email}</p>}
                      {referrerData.endereco && <p><strong>Endereço:</strong> {referrerData.endereco}</p>}
                      {referrerData.dataNascimento && <p><strong>Nascimento:</strong> {new Date(referrerData.dataNascimento).toLocaleDateString('pt-BR')}</p>}
                      {referrerData.totalContratos > 0 && (
                        <p><strong>Contratos Ativos:</strong> {referrerData.totalContratos}</p>
                      )}
                      <div className="mt-3 pt-3 border-t border-purple-200">
                        <p className="text-xs text-purple-700 mb-2">Status de Indicador:</p>
                        <div className="flex items-center gap-2">
                          <Badge className={getLevelDescription(referrerLevel).color}>
                            {getLevelDescription(referrerLevel).badge}
                          </Badge>
                          <span className="text-sm text-gray-600">
                            {referrerConversions} {referrerConversions !== 1 ? 'indicações convertidas' : 'indicação convertida'}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          Comissão atual: R$ {calculateCommissionValue(referrerLevel)},00. {getNextLevelInfo(referrerConversions, referrerLevel)}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 2. DADOS DO INDICADO */}
            {referrerData && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <UserPlus className="w-5 h-5" />
                    2. Dados do Indicado
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <Label>Nome Completo *</Label>
                        <Input
                          value={formData.referred_name}
                          onChange={(e) => setFormData({...formData, referred_name: e.target.value})}
                          required
                          className="mt-1"
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

                      <div className="col-span-2">
                        <Label>Endereço Completo</Label>
                        <Input
                          value={formData.referred_address}
                          onChange={(e) => setFormData({...formData, referred_address: e.target.value})}
                          placeholder="Rua, número, bairro, cidade"
                          className="mt-1"
                        />
                      </div>

                      <div>
                        <Label>Relação com Indicador</Label>
                        <Input
                          value={formData.relationship}
                          onChange={(e) => setFormData({...formData, relationship: e.target.value})}
                          placeholder="Ex: Amigo, Familiar, Vizinho"
                          className="mt-1"
                        />
                      </div>

                      <div>
                        <Label>Interesse</Label>
                        <Select value={formData.interest} onValueChange={(value) => setFormData({...formData, interest: value})}>
                          <SelectTrigger className="mt-1">
                            <SelectValue placeholder="Selecione o plano" />
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

                      {isAdmin && (
                        <div className="col-span-2">
                          <Label className="text-purple-700 font-semibold">Atribuir a Agente</Label>
                          {salesAgentsList.length > 0 ? (
                            <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
                              <SelectTrigger className="mt-1 border-purple-300">
                                <SelectValue placeholder="Selecione o agente responsável" />
                              </SelectTrigger>
                              <SelectContent>
                                {salesAgentsList.map(agent => (
                                  <SelectItem key={agent.id} value={String(agent.id)}>
                                    {agent.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <div className="mt-1 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                              <p className="text-sm text-amber-700">Nenhum agente de vendas disponível</p>
                            </div>
                          )}
                          <p className="text-xs text-gray-500 mt-1">
                            Se não selecionar, será atribuído a você automaticamente.
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Valores */}
                    <div className="grid grid-cols-3 gap-4 p-4 bg-green-50 rounded-lg border border-green-200 mt-4">
                      <div>
                        <Label className="text-green-800">Valor Mensal</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={formData.monthly_value}
                          onChange={(e) => setFormData({...formData, monthly_value: e.target.value})}
                          placeholder="0.00"
                          className="mt-1 bg-white"
                        />
                      </div>

                      <div>
                        <Label className="text-green-800">Adesão</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={formData.adhesion_value}
                          onChange={(e) => setFormData({...formData, adhesion_value: e.target.value})}
                          placeholder="0.00"
                          className="mt-1 bg-white"
                        />
                      </div>

                      <div>
                        <Label className="text-green-800">Dependentes</Label>
                        <Input
                          type="number"
                          value={formData.total_dependents}
                          onChange={(e) => setFormData({...formData, total_dependents: e.target.value})}
                          placeholder="0"
                          className="mt-1 bg-white"
                        />
                      </div>
                    </div>

                    <div>
                      <Label>Observações</Label>
                      <Textarea
                        value={formData.notes}
                        onChange={(e) => setFormData({...formData, notes: e.target.value})}
                        rows={3}
                        placeholder="Informações adicionais sobre a indicação..."
                        className="mt-1"
                      />
                    </div>

                    <Button
                      type="submit"
                      disabled={createReferralMutation.isPending}
                      className="w-full bg-purple-600 hover:bg-purple-700 text-white text-lg py-6"
                    >
                      {createReferralMutation.isPending ? (
                        <>
                          <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                          Cadastrando...
                        </>
                      ) : (
                        <>
                          <Gift className="w-5 h-5 mr-2" />
                          Cadastrar Indicação
                        </>
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* AGENTE RESPONSÁVEL */}
            <Card className="border-indigo-200 bg-indigo-50">
              <CardHeader>
                <CardTitle className="text-indigo-800 text-lg">👤 Agente Responsável</CardTitle>
              </CardHeader>
              <CardContent>
                {agents.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-sm text-indigo-900">
                      <strong>
                        {agents.find(a => a.userEmail === user?.email || a.user_email === user?.email || a.email === user?.email)?.name || user?.agent?.name || "Você"}
                      </strong>
                    </p>
                    <p className="text-xs text-gray-600">
                      Você será o responsável por esta indicação
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-indigo-900">
                    Você será o responsável
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="border-blue-200 bg-blue-50">
              <CardHeader>
                <CardTitle className="text-blue-800 text-lg">💰 Comissão</CardTitle>
              </CardHeader>
              <CardContent>
                {referrerData ? (
                  <>
                    <div className="p-4 bg-white rounded-lg border-2 border-blue-300 mb-3">
                      <p className="text-xs text-gray-600 mb-1">Comissão para esta Indicação:</p>
                      <p className="text-3xl font-bold text-blue-700">
                        R$ {commissionValue.toFixed(2)}
                      </p>
                      <Badge className={getLevelDescription(referrerLevel).color + " mt-2"}>
                        {getLevelDescription(referrerLevel).badge}
                      </Badge>
                    </div>
                    <p className="text-xs text-blue-900">
                      {getNextLevelInfo(referrerConversions, referrerLevel)}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-blue-900">
                    Busque o cliente indicador para ver o valor da comissão baseado no nível dele.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="border-purple-200 bg-purple-50">
              <CardHeader>
                <CardTitle className="text-purple-800 text-lg">ℹ️ Como Funciona</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-purple-900 space-y-2">
                <p>✅ <strong>1.</strong> Busque o cliente indicador pelo CPF</p>
                <p>✅ <strong>2.</strong> Preencha os dados do indicado</p>
                <p>✅ <strong>3.</strong> A indicação entra no pipeline</p>
                <p>✅ <strong>4.</strong> Quando fechar, comissão é gerada</p>
                <div className="mt-3 pt-3 border-t border-purple-300">
                  <p className="font-semibold mb-2">💎 Sistema de Níveis:</p>
                  <p className="text-xs">• <strong>Nível 1:</strong> R$ 100,00 por venda (1-3 vendas convertidas)</p>
                  <p className="text-xs">• <strong>Nível 2:</strong> R$ 150,00 por venda (4-12 vendas convertidas)</p>
                  <p className="text-xs">• <strong>Nível 3:</strong> R$ 200,00 por venda (13+ vendas convertidas)</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
