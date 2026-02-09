
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { MapPin, Camera, Loader2, X, Navigation, CheckCircle2, XCircle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { debounce } from "lodash";

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

export default function QuickLeadForm({ onSuccess, onCancel }) {
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
  const [photo, setPhoto] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [whatsappValidation, setWhatsappValidation] = useState(null);
  const [duplicateError, setDuplicateError] = useState(null);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: agents = [] } = useQuery({
    queryKey: ['salesAgents'],
    queryFn: () => base44.entities.SalesAgent.filter({ active: true }),
    initialData: [],
  });

  // Agente selecionado
  const selectedAgent = agents.find(a => a.id === formData.agent_id);

  // Auto-select agente se for agente (não supervisor)
  useEffect(() => {
    if (user && user.role !== 'admin') {
      // Buscar o agente vinculado ao usuário
      const userAgent = agents.find(a => a.user_email === user.email);
      if (userAgent && !formData.agent_id) {
        setFormData(prev => ({ ...prev, agent_id: userAgent.id }));
      }
    }
  }, [user, agents, formData.agent_id]); // Added formData.agent_id to dependencies to avoid unnecessary re-runs

  // Validação de WhatsApp
  const validateWhatsApp = async (phone) => {
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
        message: response.data.message
      });
    } catch (error) {
      console.error('Erro ao validar WhatsApp:', error);
      setWhatsappValidation({ checking: false, valid: null, error: true });
    }
  };

  const debouncedValidateWhatsApp = debounce(validateWhatsApp, 1000);

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

          // Fazer reverse geocoding
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
                complement: addr.sub_building || addr.building || "", // Added complement field from common address components
                neighborhood: addr.neighbourhood || addr.suburb || addr.quarter || "",
                city: addr.city || addr.town || addr.village || "",
                state: addr.state || "",
                cep: addr.postcode ? formatCEP(addr.postcode) : "",
              }));

              toast.success('Localização e endereço capturados!');
            }
          } catch (error) {
            console.error("Erro ao buscar endereço:", error);
            toast.error('Localização capturada, mas não foi possível obter o endereço');
          }

          setReverseGeocoding(false);
          setGettingLocation(false);
        },
        (error) => {
          console.error("Erro ao obter localização:", error);
          toast.error("Não foi possível obter a localização");
          setGettingLocation(false);
        }
      );
    } else {
      toast.error("Geolocalização não disponível");
      setGettingLocation(false);
    }
  };

  const handlePhotoCapture = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    try {
      const result = await base44.integrations.Core.UploadFile({ file });
      setPhoto({
        name: file.name,
        url: result.file_url,
        size: file.size,
        type: file.type,
      });
      toast.success('Foto adicionada!');
    } catch (error) {
      console.error("Erro ao fazer upload:", error);
      toast.error('Erro ao fazer upload da foto');
    }
    setUploading(false);
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

    debouncedValidateWhatsApp(formatted);
  };

  const handleCPFChange = (e) => {
    const formatted = formatCPF(e.target.value);
    setFormData({ ...formData, cpf: formatted });
  };

  const handleCEPChange = (e) => {
    const formatted = formatCEP(e.target.value);
    setFormData({ ...formData, cep: formatted });
  };

  const handleSubmit = async () => {
    if (!formData.phone || !formData.lgpd_consent) {
      toast.error("Telefone e consentimento LGPD são obrigatórios!");
      return;
    }

    if (!formData.agent_id) {
      toast.error("Agente responsável é obrigatório!");
      return;
    }

    setSubmitting(true);

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

    const monthlyValue = formData.monthly_value ? parseFloat(formData.monthly_value) : 0;
    const adhesionValue = formData.adhesion_value ? parseFloat(formData.adhesion_value) : 0;
    const calculatedEstimatedValue = monthlyValue + adhesionValue;

    const finalEstimatedValue = formData.value && parseFloat(formData.value) > 0
      ? parseFloat(formData.value)
      : calculatedEstimatedValue;

    const leadData = {
      ...formData,
      value: finalEstimatedValue > 0 ? finalEstimatedValue : null,
      monthly_value: monthlyValue > 0 ? monthlyValue : null,
      adhesion_value: adhesionValue > 0 ? adhesionValue : null,
      total_dependents: formData.total_dependents ? parseInt(formData.total_dependents) : null,
      address: fullAddress,
      latitude: location?.latitude,
      longitude: location?.longitude,
      photos: photo ? [photo] : [],
      stage: "novo",
      source: "porta_a_porta",
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

    try {
      setDuplicateError(null);
      await base44.entities.Lead.create(leadData);
      toast.success('Lead criado com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['allLeads'] });
      if (onSuccess) onSuccess();
    } catch (error) {
      console.error('Erro ao criar lead:', error);
      const msg = error.message || 'Erro ao criar lead';
      if (msg.includes('cadastrado') || msg.includes('duplicat')) {
        setDuplicateError(msg);
        toast.error(msg, { duration: 8000, style: { background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B' } });
      } else {
        toast.error(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="shadow-lg">
      <CardHeader className="bg-gradient-to-r from-green-600 to-green-700 text-white">
        <div className="flex items-center justify-between">
          <CardTitle>Novo Lead - Cadastro Rápido</CardTitle>
          {onCancel && (
            <Button variant="ghost" size="icon" onClick={onCancel} className="text-white">
              <X className="w-5 h-5" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
        {/* Nome */}
        <div>
          <Label>Nome (opcional)</Label>
          <Input
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Nome do lead"
            className="mt-1"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* CPF */}
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

          {/* Data de Nascimento */}
          <div>
            <Label>Data Nasc.</Label>
            <Input
              type="date"
              value={formData.birth_date}
              onChange={(e) => setFormData({ ...formData, birth_date: e.target.value })}
              className="mt-1"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Telefone/WhatsApp */}
          <div>
            <Label>Telefone/WhatsApp *</Label>
            <div className="relative">
              <Input
                value={formData.phone}
                onChange={handlePhoneChange}
                placeholder="(11) 99999-9999"
                maxLength={15}
                className={`mt-1 ${
                  whatsappValidation?.valid === true ? 'border-green-400' :
                  whatsappValidation?.valid === false ? 'border-red-400' : ''
                }`}
              />
              {whatsappValidation?.checking && (
                <div className="absolute right-2 top-3">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                </div>
              )}
              {!whatsappValidation?.checking && whatsappValidation?.valid === true && (
                <div className="absolute right-2 top-3">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                </div>
              )}
              {!whatsappValidation?.checking && whatsappValidation?.valid === false && (
                <div className="absolute right-2 top-3">
                  <XCircle className="w-4 h-4 text-red-600" />
                </div>
              )}
            </div>
            {whatsappValidation?.checking && (
              <p className="text-xs text-blue-600 mt-1">🔍 Verificando...</p>
            )}
            {!whatsappValidation?.checking && whatsappValidation?.valid === true && (
              <p className="text-xs text-green-600 mt-1">✅ WhatsApp OK</p>
            )}
            {!whatsappValidation?.checking && whatsappValidation?.valid === false && (
              <p className="text-xs text-red-600 mt-1">❌ Sem WhatsApp</p>
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

          {/* E-mail */}
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
        </div>

        {/* Interesse */}
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

        {/* 🆕 VALORES */}
        <div className="grid grid-cols-2 gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
          <div className="col-span-2">
            <Label className="text-green-800 font-semibold">💰 Valores</Label>
            <p className="text-xs text-gray-600 mt-1">
              O valor total será calculado automaticamente (Mensal + Adesão)
            </p>
          </div>
          <div>
            <Label className="text-xs">Valor Mensal</Label>
            <Input
              type="number"
              step="0.01"
              value={formData.monthly_value}
              onChange={(e) => setFormData({ ...formData, monthly_value: e.target.value })}
              placeholder="0,00"
              className="mt-1 h-9 bg-white"
            />
          </div>
          <div>
            <Label className="text-xs">Adesão</Label>
            <Input
              type="number"
              step="0.01"
              value={formData.adhesion_value}
              onChange={(e) => setFormData({ ...formData, adhesion_value: e.target.value })}
              placeholder="0,00"
              className="mt-1 h-9 bg-white"
            />
          </div>
          <div>
            <Label className="text-xs">Dependentes</Label>
            <Input
              type="number"
              value={formData.total_dependents}
              onChange={(e) => setFormData({ ...formData, total_dependents: e.target.value })}
              placeholder="0"
              className="mt-1 h-9 bg-white"
            />
          </div>

          {/* Preview do cálculo */}
          {(formData.monthly_value || formData.adhesion_value) && (
            <div className="bg-green-100 p-2 rounded">
              <Label className="text-xs text-green-800">Valor Total (calculado)</Label>
              <p className="text-lg font-bold text-green-900">
                R$ {(parseFloat(formData.monthly_value || 0) + parseFloat(formData.adhesion_value || 0)).toFixed(2)}
              </p>
            </div>
          )}

          {/* Campo manual (opcional) */}
          <div className={(formData.monthly_value || formData.adhesion_value) ? "col-span-1" : "col-span-2"}>
            <Label className="text-xs">Ou informar total manualmente</Label>
            <Input
              type="number"
              step="0.01"
              value={formData.value}
              onChange={(e) => setFormData({ ...formData, value: e.target.value })}
              placeholder="0,00"
              className="mt-1 h-9 bg-white"
            />
          </div>
        </div>

        {/* Agente Responsável */}
        <div>
          <Label className="flex items-center gap-1">
            Agente Responsável <span className="text-red-600">*</span>
          </Label>
          <Select
            value={formData.agent_id}
            onValueChange={(val) => setFormData({ ...formData, agent_id: val })}
            disabled={user?.role !== 'admin' && !!formData.agent_id}
          >
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="Selecione um agente" />
            </SelectTrigger>
            <SelectContent>
              {user?.role === 'admin' ? (
                agents.map(agent => (
                  <SelectItem key={agent.id} value={agent.id}>
                    {agent.name}
                  </SelectItem>
                ))
              ) : (
                agents
                  .filter(a => a.user_email === user?.email)
                  .map(agent => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.name}
                    </SelectItem>
                  ))
              )}
            </SelectContent>
          </Select>
          {user?.role !== 'admin' && formData.agent_id && (
            <p className="text-xs text-gray-500 mt-1">
              Você está automaticamente atribuído
            </p>
          )}
        </div>

        {/* Card do Agente */}
        {selectedAgent && (
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-xs font-semibold text-blue-900 mb-2">👤 Agente:</p>
            <div className="flex items-center gap-3">
              {selectedAgent.photo_url ? (
                <img
                  src={selectedAgent.photo_url}
                  alt={selectedAgent.name}
                  className="w-12 h-12 rounded-full object-cover border-2 border-blue-300"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-blue-200 flex items-center justify-center border-2 border-blue-300">
                  <span className="text-lg font-bold text-blue-700">
                    {selectedAgent.name.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              <div className="text-xs">
                <p className="font-bold text-gray-900">{selectedAgent.name}</p>
                <p className="text-gray-600">📞 {selectedAgent.phone}</p>
                {selectedAgent.region && (
                  <p className="text-gray-500">📍 {selectedAgent.region}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Localização */}
        <div>
          <Button
            type="button"
            onClick={getLocation}
            disabled={gettingLocation || reverseGeocoding || location}
            className="w-full"
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
        </div>

        {/* Endereço */}
        {location && (
          <div className="space-y-3 p-4 bg-gray-50 rounded-lg border">
            <h4 className="font-semibold text-sm">Endereço</h4>

            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <Label className="text-xs">Rua</Label>
                <Input
                  value={formData.street}
                  onChange={(e) => setFormData({ ...formData, street: e.target.value })}
                  placeholder="Nome da rua"
                  className="mt-1 h-9"
                  size="sm"
                />
              </div>
              <div>
                <Label className="text-xs">Nº</Label>
                <Input
                  value={formData.number}
                  onChange={(e) => setFormData({ ...formData, number: e.target.value })}
                  placeholder="123"
                  className="mt-1 h-9"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Complemento</Label>
                <Input
                  value={formData.complement}
                  onChange={(e) => setFormData({ ...formData, complement: e.target.value })}
                  placeholder="Apto 101"
                  className="mt-1 h-9"
                />
              </div>
              <div>
                <Label className="text-xs">Bairro</Label>
                <Input
                  value={formData.neighborhood}
                  onChange={(e) => setFormData({ ...formData, neighborhood: e.target.value })}
                  placeholder="Bairro"
                  className="mt-1 h-9"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Cidade</Label>
                <Input
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  placeholder="Cidade"
                  className="mt-1 h-9"
                />
              </div>
              <div>
                <Label className="text-xs">UF</Label>
                <Input
                  value={formData.state}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  placeholder="SP"
                  maxLength={2}
                  className="mt-1 h-9"
                />
              </div>
            </div>

            <div className="grid grid-cols-1">
              <div>
                <Label className="text-xs">CEP</Label>
                <Input
                  value={formData.cep}
                  onChange={handleCEPChange}
                  placeholder="00000-000"
                  maxLength={9}
                  className="mt-1 h-9"
                />
              </div>
            </div>
          </div>
        )}

        {/* Foto */}
        <div>
          <Label>Foto (opcional)</Label>
          <div className="mt-1">
            {!photo ? (
              <label className="flex items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover:bg-gray-50">
                <div className="text-center">
                  <Camera className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                  <p className="text-sm text-gray-500">Tirar foto da fachada</p>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoCapture}
                  className="hidden"
                />
              </label>
            ) : (
              <div className="relative">
                <img src={photo.url} alt="Foto" className="w-full h-32 object-cover rounded-lg" />
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute top-2 right-2"
                  onClick={() => setPhoto(null)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            )}
            {uploading && <p className="text-sm text-gray-500 mt-2">Fazendo upload...</p>}
          </div>
        </div>

        {/* Observação */}
        <div>
          <Label>Observação</Label>
          <Textarea
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            placeholder="Notas sobre o lead..."
            rows={2}
            className="mt-1"
          />
        </div>

        {/* Consentimento LGPD */}
        <div className="flex items-start space-x-2 p-3 bg-blue-50 rounded-lg">
          <Checkbox
            id="lgpd"
            checked={formData.lgpd_consent}
            onCheckedChange={(checked) => setFormData({ ...formData, lgpd_consent: checked })}
          />
          <label htmlFor="lgpd" className="text-sm leading-tight cursor-pointer">
            Cliente autorizou o uso de seus dados pessoais conforme LGPD (Lei 13.709/2018) *
          </label>
        </div>

        {/* Botão Salvar */}
        <Button
          onClick={handleSubmit}
          disabled={!formData.phone || !formData.agent_id || !formData.lgpd_consent || submitting}
          className="w-full bg-green-600 hover:bg-green-700 text-white text-lg py-6"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Salvando...
            </>
          ) : (
            'Salvar Lead'
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
