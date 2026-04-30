
import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { upsell } from "@/api/upsellClient";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { MapPin, Loader2, X, ArrowLeft, Save, Navigation, AlertTriangle, CheckCircle, ExternalLink, CheckCircle2, XCircle, User, Phone, Mail } from "lucide-react";
import { createPageUrl } from "@/utils";
import { toast } from "sonner";
import { debounce } from "lodash";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const INTERESTS = [
  "Essencial",
  "Total +",
  "Bom Med",
  "Bom Auto",
  "Bom Pet",
  "Bom Pet Saude",
  "Perola",
  "Rubi",
  "Topazio",
  "Outro"
];

export default function NewLeadUpsell() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    name: "",
    cpf: "",
    birth_date: "",
    phone: "",
    email: "",
    interest: "",
    value: "",
    monthly_value: "",
    adhesion_value: "",
    total_dependents: "",
    street: "",
    number: "",
    complement: "",
    neighborhood: "",
    cep: "",
    city: "",
    state: "",
    notes: "",
    agent_id: "",
    lgpd_consent: false,
  });

  const [location, setLocation] = useState(null);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [reverseGeocoding, setReverseGeocoding] = useState(false);
  const [searchingCep, setSearchingCep] = useState(false);
  const [whatsappValidation, setWhatsappValidation] = useState(null);
  const [duplicateError, setDuplicateError] = useState(null);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: agents = [], isLoading: agentsLoading } = useQuery({
    queryKey: ['salesAgentsForNewLead'],
    queryFn: () => base44.entities.SalesAgent.list(),
    staleTime: 0,
  });

  const activeAgents = agents.filter(a => a.active !== false);

  const currentAgentType = user?.agent?.agentType || user?.agent?.agent_type;
  const canSelectAgent =
    user?.role === 'admin' ||
    user?.role === 'supervisor' ||
    currentAgentType === 'admin' ||
    currentAgentType === 'supervisor' ||
    currentAgentType === 'upsell_admin' ||
    currentAgentType === 'upsell_supervisor' ||
    currentAgentType === 'sales_supervisor' ||
    currentAgentType?.endsWith('_supervisor');

  useEffect(() => {
    if (user && !canSelectAgent && !formData.agent_id) {
      // Primeiro tenta usar o ID do sales_agent correspondente
      const userSalesAgent = activeAgents.find(a => a.email === user.email);
      if (userSalesAgent) {
        setFormData(prev => ({ ...prev, agent_id: userSalesAgent.id }));
      }
    }
  }, [user, activeAgents, formData.agent_id, canSelectAgent]);

  // Cálculo automático do valor total (mensal + adesão)
  useEffect(() => {
    const hasMonthly = formData.monthly_value !== "" && formData.monthly_value !== null;
    const hasAdhesion = formData.adhesion_value !== "" && formData.adhesion_value !== null;
    
    if (hasMonthly || hasAdhesion) {
      const monthly = parseFloat(formData.monthly_value) || 0;
      const adhesion = parseFloat(formData.adhesion_value) || 0;
      const total = monthly + adhesion;
      setFormData(prev => ({ ...prev, value: total.toFixed(2) }));
    } else {
      setFormData(prev => ({ ...prev, value: "" }));
    }
  }, [formData.monthly_value, formData.adhesion_value]);

  const createLeadMutation = useMutation({
    mutationFn: (data) => upsell.entities.LeadUpsell.create(data),
    onSuccess: (newLead) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['allLeads'] });
      toast.success('Lead criado com sucesso!');
      navigate(`${createPageUrl("LeadUpsellDetail")}?id=${newLead.id}`);
    },
    onError: (error) => {
      const msg = error.message || 'Erro ao criar lead';
      if (msg.includes('cadastrado') || msg.includes('duplicat')) {
        setDuplicateError(msg);
        toast.error(msg, { duration: 8000, style: { background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B' } });
      } else {
        toast.error('Erro ao criar lead: ' + msg);
      }
    }
  });

  // Agente selecionado
  const selectedAgent = activeAgents.find(a => a.id === formData.agent_id);

  const validatePhoneDuplicate = async (phone) => {
    if (!phone || phone.replace(/\D/g, '').length < 10) {
      setWhatsappValidation(null);
      return;
    }

    setWhatsappValidation({ checking: true, valid: null });

    try {
      const response = await base44.functions.invoke('validateWhatsApp', { phone });
      setWhatsappValidation({ 
        checking: false, 
        valid: response.data.valid,
        message: response.data.message,
        existingLead: response.data.existingLead
      });
    } catch (error) {
      console.error('Erro ao verificar telefone:', error);
      setWhatsappValidation({ checking: false, valid: null, error: true });
    }
  };

  const debouncedValidatePhone = debounce(validatePhoneDuplicate, 1000);

  const getLocation = () => {
    setGettingLocation(true);
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const lat = position.coords.latitude;
          const lon = position.coords.longitude;
          
          setLocation({
            latitude: lat,
            longitude: lon,
          });

          setReverseGeocoding(true);
          try {
            const response = await fetch(
              `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&accept-language=pt-BR`
            );
            const data = await response.json();
            
            if (data && data.address) {
              const addr = data.address;
              
              setFormData(prev => ({
                ...prev,
                street: addr.road || addr.street || "",
                number: addr.house_number || "",
                neighborhood: addr.neighbourhood || addr.suburb || addr.quarter || "",
                city: addr.city || addr.town || addr.village || "",
                state: addr.state || "",
                cep: addr.postcode || "",
                address: data.display_name || "",
              }));
              
              toast.success('Localização e endereço capturados!');
            }
          } catch (error) {
            console.error("Erro ao buscar endereço:", error);
            toast.error('Localização capturada, mas não foi possível obter o endereço automaticamente');
          }
          
          setReverseGeocoding(false);
          setGettingLocation(false);
        },
        (error) => {
          console.error("Erro ao obter localização:", error);
          toast.error("Não foi possível obter a localização. Por favor, informe o endereço manualmente.");
          setGettingLocation(false);
        }
      );
    } else {
      toast.error("Geolocalização não disponível neste dispositivo.");
      setGettingLocation(false);
    }
  };


  const formatPhone = (value) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 11) {
      return numbers.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
    }
    return value;
  };

  const formatCPF = (value) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 11) {
      return numbers.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    }
    return value;
  };

  const formatCEP = (value) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 8) {
      return numbers.replace(/(\d{5})(\d{3})/, '$1-$2');
    }
    return value;
  };

  const handlePhoneChange = (e) => {
    const formatted = formatPhone(e.target.value);
    setFormData({ ...formData, phone: formatted });
    setDuplicateError(null);
    
    debouncedValidatePhone(formatted);
  };

  const handleCPFChange = (e) => {
    const formatted = formatCPF(e.target.value);
    setFormData({ ...formData, cpf: formatted });
  };

  const handleCEPChange = (e) => {
    const formatted = formatCEP(e.target.value);
    setFormData({ ...formData, cep: formatted });
    
    const cepNumbers = formatted.replace(/\D/g, '');
    if (cepNumbers.length === 8) {
      searchAddressByCep(cepNumbers);
    }
  };

  const searchAddressByCep = async (cep) => {
    const cepNumbers = cep.replace(/\D/g, '');
    if (cepNumbers.length !== 8) {
      toast.error('CEP inválido. Digite 8 números.');
      return;
    }

    setSearchingCep(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cepNumbers}/json/`);
      const data = await response.json();

      if (data.erro) {
        toast.error('CEP não encontrado');
        setSearchingCep(false);
        return;
      }

      setFormData(prev => ({
        ...prev,
        street: data.logradouro || prev.street,
        neighborhood: data.bairro || prev.neighborhood,
        city: data.localidade || prev.city,
        state: data.uf || prev.state,
        cep: formatCEP(data.cep) || prev.cep,
      }));

      const searchQueries = [
        `${data.logradouro || ''}, ${data.bairro || ''}, ${data.localidade || ''}, ${data.uf || ''}, Brazil`,
        `${data.bairro || ''}, ${data.localidade || ''}, ${data.uf || ''}, Brazil`,
        `${data.localidade || ''}, ${data.uf || ''}, Brazil`,
      ];

      let coordsFound = false;
      setLocation(null);
      
      for (const query of searchQueries) {
        if (coordsFound) break;
        try {
          await new Promise(r => setTimeout(r, 1100));
          const geoResponse = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&accept-language=pt-BR`,
            { headers: { 'User-Agent': 'WescctechCRM/1.0 (contato@wescctech.com.br)' } }
          );
          const geoData = await geoResponse.json();
          
          if (geoData && geoData.length > 0) {
            const lat = parseFloat(geoData[0].lat);
            const lon = parseFloat(geoData[0].lon);
            setLocation({ latitude: lat, longitude: lon });
            coordsFound = true;
            toast.success('Endereço e localização encontrados!');
          }
        } catch (geoError) {
          console.error('Erro ao obter coordenadas:', geoError);
        }
      }
      
      if (!coordsFound) {
        toast.success('Endereço encontrado! Clique no botão GPS para precisão no mapa.');
      }
    } catch (error) {
      console.error('Erro ao buscar CEP:', error);
      toast.error('Erro ao buscar CEP. Tente novamente.');
    }
    setSearchingCep(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.name || !formData.name.trim()) {
      toast.error('Nome é obrigatório!');
      return;
    }

    if (!formData.phone) {
      toast.error('Telefone é obrigatório!');
      return;
    }

    if (!formData.agent_id) {
      toast.error('Agente responsável é obrigatório!');
      return;
    }

    if (!formData.lgpd_consent) {
      toast.error('É necessário o consentimento LGPD!');
      return;
    }

    const now = new Date().toISOString();
    
    let fullAddress = '';
    if (formData.street) {
      fullAddress = formData.street;
      if (formData.number) fullAddress += `, ${formData.number}`;
      if (formData.complement) fullAddress += ` - ${formData.complement}`;
      if (formData.neighborhood) fullAddress += ` - ${formData.neighborhood}`;
      if (formData.city) fullAddress += ` - ${formData.city}`;
      if (formData.state) fullAddress += `/${formData.state}`;
      if (formData.cep) fullAddress += ` - CEP: ${formData.cep}`;
    }
    
    const leadData = {
      ...formData,
      value: formData.value ? parseFloat(formData.value) : null,
      monthly_value: formData.monthly_value ? parseFloat(formData.monthly_value) : null,
      adhesion_value: formData.adhesion_value ? parseFloat(formData.adhesion_value) : null,
      total_dependents: formData.total_dependents ? parseInt(formData.total_dependents) : null,
      address: fullAddress || formData.address,
      latitude: location?.latitude,
      longitude: location?.longitude,
      stage: "novo",
      source: "manual",
      lgpd_consent_date: now,
      stage_history: [
        {
          stage: "novo",
          previous_stage: null,
          changed_at: now,
          changed_by: user?.email || "Sistema",
        }
      ],
    };

    createLeadMutation.mutate(leadData);
  };

  const getAgentName = (agentId) => {
    const agent = activeAgents.find(a => a.id === agentId);
    return agent?.name || 'Desconhecido';
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(createPageUrl("LeadsUpsellKanban"))}
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Novo Lead</h1>
              <p className="text-gray-500 mt-1">Cadastre um novo lead no sistema</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="space-y-6">
            {/* Dados Pessoais */}
            <Card>
              <CardHeader>
                <CardTitle>Dados Pessoais</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <Label>Nome Completo <span className="text-red-500">*</span></Label>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Nome do lead"
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label>CPF</Label>
                    <Input
                      value={formData.cpf}
                      onChange={handleCPFChange}
                      placeholder="000.000.000-00"
                      maxLength={14}
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label>Data de Nascimento</Label>
                    <Input
                      type="date"
                      value={formData.birth_date}
                      onChange={(e) => setFormData({ ...formData, birth_date: e.target.value })}
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label>Telefone/WhatsApp *</Label>
                    <div className="relative">
                      <Input
                        value={formData.phone}
                        onChange={handlePhoneChange}
                        placeholder="(11) 99999-9999"
                        maxLength={15}
                        className={`mt-1 pr-10 ${
                          whatsappValidation?.valid === true ? 'border-green-400 focus:ring-green-400' :
                          whatsappValidation?.valid === false ? 'border-red-400 focus:ring-red-400' : ''
                        }`}
                        required
                      />
                      {whatsappValidation?.checking && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                        </div>
                      )}
                      {!whatsappValidation?.checking && whatsappValidation?.valid === true && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <CheckCircle2 className="w-4 h-4 text-green-600" />
                        </div>
                      )}
                      {!whatsappValidation?.checking && whatsappValidation?.valid === false && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <XCircle className="w-4 h-4 text-red-600" />
                        </div>
                      )}
                    </div>
                    {whatsappValidation?.checking && (
                      <p className="text-xs text-blue-600 mt-1">Verificando duplicidade...</p>
                    )}
                    {!whatsappValidation?.checking && whatsappValidation?.valid === true && whatsappValidation?.message && (
                      <p className="text-xs text-green-600 mt-1">{whatsappValidation.message}</p>
                    )}
                    {!whatsappValidation?.checking && whatsappValidation?.valid === false && (
                      <p className="text-xs text-red-600 mt-1">{whatsappValidation.message || 'Telefone já cadastrado'}</p>
                    )}
                    {duplicateError && (
                      <div className="mt-2 p-3 bg-red-50 border border-red-300 rounded-lg">
                        <div className="flex items-center gap-2">
                          <XCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                          <p className="text-sm font-semibold text-red-700">WhatsApp Duplicado!</p>
                        </div>
                        <p className="text-xs text-red-600 mt-1">{duplicateError}</p>
                      </div>
                    )}
                  </div>

                  <div>
                    <Label>E-mail</Label>
                    <Input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="email@exemplo.com"
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label>Interesse</Label>
                    <Select value={formData.interest} onValueChange={(val) => setFormData({ ...formData, interest: val })}>
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Selecione o produto" />
                      </SelectTrigger>
                      <SelectContent>
                        {INTERESTS.map(interest => (
                          <SelectItem key={interest} value={interest}>{interest}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 🆕 VALORES FINANCEIROS */}
            <Card className="border-green-200 bg-green-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-green-800">
                  💰 Valores Financeiros
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <Label>Valor Mensal Estimado</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.monthly_value}
                      onChange={(e) => setFormData({ ...formData, monthly_value: e.target.value })}
                      placeholder="R$ 0,00"
                      className="mt-1 bg-white"
                    />
                    <p className="text-xs text-gray-600 mt-1">Valor que o cliente pagará mensalmente</p>
                  </div>

                  <div>
                    <Label>Valor da Adesão</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.adhesion_value}
                      onChange={(e) => setFormData({ ...formData, adhesion_value: e.target.value })}
                      placeholder="R$ 60,00"
                      className="mt-1 bg-white"
                    />
                    <p className="text-xs text-gray-600 mt-1">Taxa de adesão (se aplicável)</p>
                  </div>

                  <div>
                    <Label>Número de Dependentes</Label>
                    <Input
                      type="number"
                      value={formData.total_dependents}
                      onChange={(e) => setFormData({ ...formData, total_dependents: e.target.value })}
                      placeholder="0"
                      className="mt-1 bg-white"
                    />
                    <p className="text-xs text-gray-600 mt-1">Quantidade de dependentes (se aplicável)</p>
                  </div>

                  <div>
                    <Label className="flex items-center gap-2">
                      Valor Total
                      <span className="text-xs text-green-600 font-normal">(calculado automaticamente)</span>
                    </Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.value}
                      readOnly
                      placeholder="R$ 0,00"
                      className="mt-1 bg-green-100 font-semibold text-green-800 cursor-not-allowed"
                    />
                    <p className="text-xs text-gray-600 mt-1">Mensal + Adesão = Valor Total</p>
                  </div>
                </div>

                {(formData.monthly_value || formData.adhesion_value) && (
                  <div className="pt-4 border-t border-green-200">
                    <div className="flex items-center justify-center gap-2 text-lg">
                      {formData.monthly_value && (
                        <span className="bg-white px-3 py-2 rounded-lg">
                          <span className="text-gray-500 text-sm">Mensal:</span>{' '}
                          <span className="font-bold text-green-700">R$ {parseFloat(formData.monthly_value).toFixed(2)}</span>
                        </span>
                      )}
                      {formData.monthly_value && formData.adhesion_value && (
                        <span className="text-gray-400 text-xl">+</span>
                      )}
                      {formData.adhesion_value && (
                        <span className="bg-white px-3 py-2 rounded-lg">
                          <span className="text-gray-500 text-sm">Adesão:</span>{' '}
                          <span className="font-bold text-green-700">R$ {parseFloat(formData.adhesion_value).toFixed(2)}</span>
                        </span>
                      )}
                      <span className="text-gray-400 text-xl">=</span>
                      <span className="bg-green-600 text-white px-4 py-2 rounded-lg">
                        <span className="text-sm opacity-80">Total:</span>{' '}
                        <span className="font-bold text-xl">R$ {formData.value || '0.00'}</span>
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Localização */}
            <Card className="border-blue-200 bg-blue-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-blue-600" />
                  Localização
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={getLocation}
                  disabled={gettingLocation || reverseGeocoding || location}
                  className="w-full bg-white"
                >
                  {gettingLocation ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Obtendo localização...
                    </>
                  ) : reverseGeocoding ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Buscando endereço...
                    </>
                  ) : location ? (
                    <>
                      <MapPin className="w-4 h-4 mr-2 text-green-600" />
                      Localização capturada ✓
                    </>
                  ) : (
                    <>
                      <Navigation className="w-4 h-4 mr-2" />
                      Capturar Localização GPS
                    </>
                  )}
                </Button>

                {location && (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm">
                    <p className="text-green-700">
                      ✅ Localização capturada: {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Endereço */}
            <Card>
              <CardHeader>
                <CardTitle>Endereço</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="md:col-span-2">
                    <Label>Rua/Logradouro</Label>
                    <Input
                      value={formData.street}
                      onChange={(e) => setFormData({ ...formData, street: e.target.value })}
                      placeholder="Nome da rua"
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label>Número</Label>
                    <Input
                      value={formData.number}
                      onChange={(e) => setFormData({ ...formData, number: e.target.value })}
                      placeholder="123"
                      className="mt-1"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <Label>Complemento</Label>
                    <Input
                      value={formData.complement}
                      onChange={(e) => setFormData({ ...formData, complement: e.target.value })}
                      placeholder="Apto, bloco, etc"
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label>CEP</Label>
                    <div className="relative">
                      <Input
                        value={formData.cep}
                        onChange={handleCEPChange}
                        placeholder="00000-000"
                        maxLength={9}
                        className={`mt-1 pr-10 ${searchingCep ? 'bg-blue-50' : ''}`}
                      />
                      {searchingCep && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                        </div>
                      )}
                      {!searchingCep && location && formData.cep && formData.cep.replace(/\D/g, '').length === 8 && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <CheckCircle2 className="w-4 h-4 text-green-600" />
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Digite o CEP para preencher automaticamente
                    </p>
                  </div>

                  <div>
                    <Label>Bairro</Label>
                    <Input
                      value={formData.neighborhood}
                      onChange={(e) => setFormData({ ...formData, neighborhood: e.target.value })}
                      placeholder="Nome do bairro"
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label>Cidade</Label>
                    <Input
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      placeholder="Nome da cidade"
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label>Estado</Label>
                    <Input
                      value={formData.state}
                      onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                      placeholder="SP"
                      maxLength={2}
                      className="mt-1"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Observações e Agente - ATUALIZADO */}
            <Card>
              <CardHeader>
                <CardTitle>Informações Adicionais</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Observações</Label>
                  <Textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Notas sobre o lead..."
                    rows={3}
                    className="mt-1"
                  />
                </div>

                {canSelectAgent && (
                  <div>
                    <Label className="flex items-center gap-1">
                      Agente Responsável <span className="text-red-600">*</span>
                    </Label>
                    <Select 
                      value={formData.agent_id} 
                      onValueChange={(val) => setFormData({ ...formData, agent_id: val })}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Selecione um agente" />
                      </SelectTrigger>
                      <SelectContent>
                        {agentsLoading ? (
                          <div className="p-2 text-center text-gray-500">Carregando agentes...</div>
                        ) : activeAgents.length === 0 ? (
                          <div className="p-2 text-center text-gray-500">Nenhum agente disponível</div>
                        ) : (
                          activeAgents.map(agent => (
                            <SelectItem key={agent.id} value={agent.id}>
                              <div className="flex items-center gap-2">
                                {agent.photo_url && (
                                  <img src={agent.photo_url} alt={agent.name} className="w-6 h-6 rounded-full object-cover" />
                                )}
                                <span>{agent.name}</span>
                              </div>
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {selectedAgent && (
                  <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-2 mb-3">
                      <User className="w-4 h-4 text-gray-500" />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Agente Responsável</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {selectedAgent.photo_url ? (
                        <img 
                          src={selectedAgent.photo_url} 
                          alt={selectedAgent.name}
                          className="w-10 h-10 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                          <span className="text-lg font-semibold text-gray-600 dark:text-gray-300">
                            {selectedAgent.name?.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 dark:text-gray-100 truncate">{selectedAgent.name}</p>
                        <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                          {selectedAgent.phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="w-3 h-3" />
                              {selectedAgent.phone}
                            </span>
                          )}
                          {selectedAgent.email && (
                            <span className="flex items-center gap-1 truncate">
                              <Mail className="w-3 h-3" />
                              {selectedAgent.email}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* LGPD */}
            <Card className="border-blue-200 bg-blue-50">
              <CardContent className="p-4">
                <div className="flex items-start space-x-3">
                  <Checkbox
                    id="lgpd"
                    checked={formData.lgpd_consent}
                    onCheckedChange={(checked) => setFormData({ ...formData, lgpd_consent: checked })}
                    className="mt-1"
                  />
                  <label htmlFor="lgpd" className="text-sm leading-tight cursor-pointer">
                    <strong className="text-blue-900">Cliente autorizou o uso de seus dados pessoais *</strong>
                    <p className="text-blue-700 mt-1">
                      Conforme Lei Geral de Proteção de Dados (LGPD - Lei 13.709/2018)
                    </p>
                  </label>
                </div>
              </CardContent>
            </Card>

            {/* Botões */}
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate(createPageUrl("LeadsUpsellKanban"))}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={!formData.phone || !formData.agent_id || !formData.lgpd_consent || createLeadMutation.isPending}
                className="flex-1 bg-green-600 hover:bg-green-700"
              >
                {createLeadMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Salvar Lead
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>
      </div>

    </div>
  );
}
