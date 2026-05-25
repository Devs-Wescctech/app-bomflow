
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
import { Badge } from "@/components/ui/badge";
import { MapPin, Loader2, ArrowLeft, Save, Navigation, CheckCircle2, XCircle, User, Phone, Mail, Search, Database, FileText, AlertCircle } from "lucide-react";
import { createPageUrl } from "@/utils";
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

const CONTRACT_STATUS_MAP = {
  A: "Ativo",
  C: "Cancelado",
  S: "Suspenso",
  I: "Inativo",
  P: "Pendente",
};

function formatContractStatus(code) {
  return CONTRACT_STATUS_MAP[code] || code || "-";
}

export default function NewLeadUpsell() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [step, setStep] = useState("lookup");
  const [cpfInput, setCpfInput] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const [erpContracts, setErpContracts] = useState([]);
  const [selectedContractIdx, setSelectedContractIdx] = useState(0);
  const [fromErp, setFromErp] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    cpf: "",
    birth_date: "",
    phone: "",
    phone_2: "",
    email: "",
    interest: "",
    contract_number: "",
    contract_status: "",
    dependent_name: "",
    dependent_cpf: "",
    erp_id: "",
    erp_city_id: "",
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
    queryKey: ["currentUser"],
    queryFn: () => base44.auth.me(),
  });

  const { data: agents = [], isLoading: agentsLoading } = useQuery({
    queryKey: ["salesAgentsForNewLead"],
    queryFn: () => base44.entities.SalesAgent.list(),
    staleTime: 0,
  });

  const activeAgents = agents.filter((a) => a.active !== false);

  const currentAgentType = user?.agent?.agentType || user?.agent?.agent_type;
  const canSelectAgent =
    user?.role === "admin" ||
    user?.role === "supervisor" ||
    currentAgentType === "admin" ||
    currentAgentType === "supervisor" ||
    currentAgentType === "upsell_admin" ||
    currentAgentType === "upsell_supervisor" ||
    currentAgentType === "sales_supervisor" ||
    currentAgentType?.endsWith("_supervisor");

  useEffect(() => {
    if (user && !canSelectAgent && !formData.agent_id) {
      const userSalesAgent = activeAgents.find((a) => a.email === user.email);
      if (userSalesAgent) {
        setFormData((prev) => ({ ...prev, agent_id: userSalesAgent.id }));
      }
    }
  }, [user, activeAgents, formData.agent_id, canSelectAgent]);

  useEffect(() => {
    const hasMonthly = formData.monthly_value !== "" && formData.monthly_value !== null;
    const hasAdhesion = formData.adhesion_value !== "" && formData.adhesion_value !== null;
    if (hasMonthly || hasAdhesion) {
      const monthly = parseFloat(formData.monthly_value) || 0;
      const adhesion = parseFloat(formData.adhesion_value) || 0;
      setFormData((prev) => ({ ...prev, value: (monthly + adhesion).toFixed(2) }));
    } else {
      setFormData((prev) => ({ ...prev, value: "" }));
    }
  }, [formData.monthly_value, formData.adhesion_value]);

  const createLeadMutation = useMutation({
    mutationFn: (data) => upsell.entities.LeadUpsell.create(data),
    onSuccess: (newLead) => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["allLeads"] });
      toast.success("Lead criado com sucesso!");
      navigate(`${createPageUrl("LeadUpsellDetail")}?id=${newLead.id}`);
    },
    onError: (error) => {
      const msg = error.message || "Erro ao criar lead";
      if (msg.includes("cadastrado") || msg.includes("duplicat")) {
        setDuplicateError(msg);
        toast.error(msg, { duration: 8000, style: { background: "#FEF2F2", border: "1px solid #FCA5A5", color: "#991B1B" } });
      } else {
        toast.error("Erro ao criar lead: " + msg);
      }
    },
  });

  const selectedAgent = activeAgents.find((a) => a.id === formData.agent_id);

  const validatePhoneDuplicate = async (phone) => {
    if (!phone || phone.replace(/\D/g, "").length < 10) {
      setWhatsappValidation(null);
      return;
    }
    setWhatsappValidation({ checking: true, valid: null });
    try {
      const response = await base44.functions.invoke("validateWhatsApp", { phone });
      setWhatsappValidation({
        checking: false,
        valid: response.data.valid,
        message: response.data.message,
        existingLead: response.data.existingLead,
      });
    } catch {
      setWhatsappValidation({ checking: false, valid: null, error: true });
    }
  };

  const debouncedValidatePhone = debounce(validatePhoneDuplicate, 1000);

  const formatPhone = (value) => {
    const n = value.replace(/\D/g, "");
    if (n.length <= 11) return n.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
    return value;
  };

  const formatCPF = (value) => {
    const n = value.replace(/\D/g, "");
    if (n.length <= 11) return n.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
    return value;
  };

  const formatCEP = (value) => {
    const n = value.replace(/\D/g, "");
    if (n.length <= 8) return n.replace(/(\d{5})(\d{3})/, "$1-$2");
    return value;
  };

  const handlePhoneChange = (e) => {
    const formatted = formatPhone(e.target.value);
    setFormData({ ...formData, phone: formatted });
    setDuplicateError(null);
    debouncedValidatePhone(formatted);
  };

  const handleCPFChange = (e) => {
    setFormData({ ...formData, cpf: formatCPF(e.target.value) });
  };

  const handleCEPChange = (e) => {
    const formatted = formatCEP(e.target.value);
    setFormData({ ...formData, cep: formatted });
    const cepNumbers = formatted.replace(/\D/g, "");
    if (cepNumbers.length === 8) searchAddressByCep(cepNumbers);
  };

  const searchAddressByCep = async (cep) => {
    const cepNumbers = cep.replace(/\D/g, "");
    if (cepNumbers.length !== 8) { toast.error("CEP inválido. Digite 8 números."); return; }
    setSearchingCep(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cepNumbers}/json/`);
      const data = await response.json();
      if (data.erro) { toast.error("CEP não encontrado"); setSearchingCep(false); return; }
      setFormData((prev) => ({
        ...prev,
        street: data.logradouro || prev.street,
        neighborhood: data.bairro || prev.neighborhood,
        city: data.localidade || prev.city,
        state: data.uf || prev.state,
        cep: formatCEP(data.cep) || prev.cep,
      }));
      toast.success("Endereço preenchido pelo CEP!");
    } catch {
      toast.error("Erro ao buscar CEP. Tente novamente.");
    }
    setSearchingCep(false);
  };

  const getLocation = () => {
    setGettingLocation(true);
    if (!("geolocation" in navigator)) {
      toast.error("Geolocalização não disponível neste dispositivo.");
      setGettingLocation(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        setLocation({ latitude: lat, longitude: lon });
        setReverseGeocoding(true);
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&accept-language=pt-BR`
          );
          const data = await response.json();
          if (data?.address) {
            const addr = data.address;
            setFormData((prev) => ({
              ...prev,
              street: addr.road || addr.street || prev.street,
              number: addr.house_number || prev.number,
              neighborhood: addr.neighbourhood || addr.suburb || addr.quarter || prev.neighborhood,
              city: addr.city || addr.town || addr.village || prev.city,
              state: addr.state || prev.state,
              cep: addr.postcode || prev.cep,
            }));
            toast.success("Localização e endereço capturados!");
          }
        } catch {
          toast.error("Localização capturada, mas não foi possível obter o endereço automaticamente");
        }
        setReverseGeocoding(false);
        setGettingLocation(false);
      },
      () => {
        toast.error("Não foi possível obter a localização. Por favor, informe o endereço manualmente.");
        setGettingLocation(false);
      }
    );
  };

  const fillFromErpRecord = (record) => {
    setFormData((prev) => ({
      ...prev,
      cpf: record.cpf || prev.cpf,
      name: record.nome_titular || "",
      birth_date: record.data_titular ? record.data_titular.substring(0, 10) : "",
      phone: record.telefone || "",
      phone_2: record.telefone_2 || "",
      street: record.rua || "",
      number: record.numero || "",
      complement: record.complemento || "",
      neighborhood: record.bairro || "",
      cep: record.cep || "",
      contract_number: record.contrato ? String(record.contrato) : "",
      contract_status: record.situacao_contrato || "",
      interest: record.descricao || "",
      dependent_name: record.nome_dependente || "",
      dependent_cpf: record.cpf_dependente || "",
      erp_id: record.id ? String(record.id) : "",
      erp_city_id: record.cidade_id ? String(record.cidade_id) : "",
    }));
    if (record.cep) {
      const cepClean = record.cep.replace(/\D/g, "");
      if (cepClean.length === 8) searchAddressByCep(cepClean);
    }
  };

  const handleCpfLookup = async () => {
    const cpfFormatted = formatCPF(cpfInput);
    if (cpfFormatted.replace(/\D/g, "").length < 11) {
      toast.error("Digite um CPF válido (11 dígitos)");
      return;
    }
    setLookingUp(true);
    try {
      const token = localStorage.getItem("accessToken");
      const response = await fetch(`/api/erp-cadastro-pessoas?cpf=${encodeURIComponent(cpfFormatted)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Erro ao consultar ERP");
      const records = await response.json();
      setErpContracts(records);
      setSelectedContractIdx(0);

      if (records.length > 0) {
        setFromErp(true);
        fillFromErpRecord(records[0]);
        toast.success(`Cliente encontrado: ${records[0].nome_titular}`);
      } else {
        setFromErp(false);
        setFormData((prev) => ({ ...prev, cpf: cpfFormatted }));
        toast.info("CPF não encontrado no ERP. Preencha os dados manualmente.");
      }
      setStep("form");
    } catch {
      toast.error("Erro ao consultar ERP. Tente novamente.");
    } finally {
      setLookingUp(false);
    }
  };

  const handleContractSelect = (idx) => {
    setSelectedContractIdx(idx);
    fillFromErpRecord(erpContracts[idx]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name?.trim()) { toast.error("Nome é obrigatório!"); return; }
    if (!formData.phone) { toast.error("Telefone é obrigatório!"); return; }
    if (!formData.agent_id) { toast.error("Agente responsável é obrigatório!"); return; }
    if (!formData.lgpd_consent) { toast.error("É necessário o consentimento LGPD!"); return; }

    const now = new Date().toISOString();
    let fullAddress = "";
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
      erp_id: formData.erp_id ? parseInt(formData.erp_id) : null,
      erp_city_id: formData.erp_city_id ? parseInt(formData.erp_city_id) : null,
      address: fullAddress || formData.address,
      latitude: location?.latitude,
      longitude: location?.longitude,
      stage: "novo",
      source: "manual",
      lgpd_consent_date: now,
      stage_history: [{ stage: "novo", previous_stage: null, changed_at: now, changed_by: user?.email || "Sistema" }],
    };

    createLeadMutation.mutate(leadData);
  };

  if (step === "lookup") {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="flex items-center gap-3 mb-8">
            <Button variant="ghost" size="icon" onClick={() => navigate(createPageUrl("LeadsUpsellKanban"))}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Novo Lead Upsell</h1>
              <p className="text-gray-500 text-sm">Consulte o CPF para buscar dados no ERP</p>
            </div>
          </div>

          <Card className="border-0 shadow-xl">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-violet-700 dark:text-violet-400">
                <Database className="w-5 h-5" />
                Consultar CPF no ERP
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <Label className="text-gray-700 dark:text-gray-300 font-medium">CPF do Cliente</Label>
                <Input
                  value={cpfInput}
                  onChange={(e) => setCpfInput(formatCPF(e.target.value))}
                  onKeyDown={(e) => e.key === "Enter" && handleCpfLookup()}
                  placeholder="000.000.000-00"
                  maxLength={14}
                  className="mt-1.5 text-lg h-12 font-mono"
                  autoFocus
                />
                <p className="text-xs text-gray-500 mt-1.5">
                  Se encontrado, os dados do cliente serão preenchidos automaticamente.
                </p>
              </div>

              <Button
                onClick={handleCpfLookup}
                disabled={lookingUp || cpfInput.replace(/\D/g, "").length < 11}
                className="w-full h-11 bg-violet-600 hover:bg-violet-700"
              >
                {lookingUp ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Consultando ERP...
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4 mr-2" />
                    Consultar no ERP
                  </>
                )}
              </Button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setStep("form")}
                  className="text-sm text-violet-600 dark:text-violet-400 hover:underline"
                >
                  Preencher manualmente (sem CPF)
                </button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => setStep("lookup")}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Novo Lead Upsell</h1>
              <p className="text-gray-500 mt-1">Cadastre um novo lead no sistema</p>
            </div>
          </div>
          {fromErp ? (
            <Badge className="bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-900/30 dark:text-violet-300 gap-1 px-3 py-1.5">
              <Database className="w-3.5 h-3.5" />
              Dados importados do ERP
            </Badge>
          ) : (
            <Badge variant="outline" className="text-gray-500 gap-1 px-3 py-1.5">
              <FileText className="w-3.5 h-3.5" />
              Preenchimento manual
            </Badge>
          )}
        </div>

        <form onSubmit={handleSubmit}>
          <div className="space-y-6">

            {fromErp && erpContracts.length > 1 && (
              <Card className="border-violet-200 bg-violet-50 dark:bg-violet-950/20 dark:border-violet-800">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm text-violet-700 dark:text-violet-400 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    {erpContracts.length} contratos encontrados para este CPF — selecione um:
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="grid gap-2">
                    {erpContracts.map((c, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleContractSelect(idx)}
                        className={`text-left p-3 rounded-lg border transition-all ${
                          selectedContractIdx === idx
                            ? "border-violet-500 bg-violet-100 dark:bg-violet-900/40"
                            : "border-gray-200 bg-white dark:bg-gray-800 dark:border-gray-700 hover:border-violet-300"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                            Contrato #{c.contrato}
                          </span>
                          <Badge
                            className={`text-xs ${
                              c.situacao_contrato === "A"
                                ? "bg-green-100 text-green-700"
                                : "bg-red-100 text-red-700"
                            }`}
                          >
                            {formatContractStatus(c.situacao_contrato)}
                          </Badge>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">{c.descricao}</p>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="w-4 h-4 text-violet-600" />
                  Dados do Cliente
                  {fromErp && (
                    <span className="text-xs font-normal text-violet-500 ml-1">(pré-preenchido do ERP)</span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <Label>CPF {fromErp && <span className="text-violet-500 text-xs ml-1">• ERP</span>}</Label>
                    <Input
                      value={formData.cpf}
                      onChange={handleCPFChange}
                      placeholder="000.000.000-00"
                      maxLength={14}
                      className={`mt-1 ${fromErp ? "bg-violet-50 dark:bg-violet-950/20" : ""}`}
                    />
                  </div>

                  <div>
                    <Label>Nome Completo <span className="text-red-500">*</span> {fromErp && <span className="text-violet-500 text-xs ml-1">• ERP</span>}</Label>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Nome completo do cliente"
                      className={`mt-1 ${fromErp ? "bg-violet-50 dark:bg-violet-950/20" : ""}`}
                    />
                  </div>

                  <div>
                    <Label>Data de Nascimento {fromErp && <span className="text-violet-500 text-xs ml-1">• ERP</span>}</Label>
                    <Input
                      type="date"
                      value={formData.birth_date}
                      onChange={(e) => setFormData({ ...formData, birth_date: e.target.value })}
                      className={`mt-1 ${fromErp ? "bg-violet-50 dark:bg-violet-950/20" : ""}`}
                    />
                  </div>

                  <div>
                    <Label>Telefone Principal <span className="text-red-500">*</span> {fromErp && <span className="text-violet-500 text-xs ml-1">• ERP</span>}</Label>
                    <div className="relative">
                      <Input
                        value={formData.phone}
                        onChange={handlePhoneChange}
                        placeholder="(11) 99999-9999"
                        maxLength={15}
                        className={`mt-1 pr-10 ${
                          whatsappValidation?.valid === true
                            ? "border-green-400"
                            : whatsappValidation?.valid === false
                            ? "border-red-400"
                            : fromErp
                            ? "bg-violet-50 dark:bg-violet-950/20"
                            : ""
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
                    {!whatsappValidation?.checking && whatsappValidation?.valid === false && (
                      <p className="text-xs text-red-600 mt-1">{whatsappValidation.message || "Telefone já cadastrado"}</p>
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
                    <Label>Telefone 2 {fromErp && <span className="text-violet-500 text-xs ml-1">• ERP</span>}</Label>
                    <Input
                      value={formData.phone_2}
                      onChange={(e) => setFormData({ ...formData, phone_2: e.target.value })}
                      placeholder="(11) 99999-9999"
                      className={`mt-1 ${fromErp ? "bg-violet-50 dark:bg-violet-950/20" : ""}`}
                    />
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
                    <Label>Nº Contrato ERP {fromErp && <span className="text-violet-500 text-xs ml-1">• ERP</span>}</Label>
                    <Input
                      value={formData.contract_number}
                      onChange={(e) => setFormData({ ...formData, contract_number: e.target.value })}
                      placeholder="Ex: 69424"
                      className={`mt-1 ${fromErp ? "bg-violet-50 dark:bg-violet-950/20" : ""}`}
                    />
                  </div>

                  <div>
                    <Label>Situação do Contrato {fromErp && <span className="text-violet-500 text-xs ml-1">• ERP</span>}</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <Input
                        value={formData.contract_status}
                        onChange={(e) => setFormData({ ...formData, contract_status: e.target.value })}
                        placeholder="A / C / S"
                        maxLength={1}
                        className={`${fromErp ? "bg-violet-50 dark:bg-violet-950/20" : ""}`}
                      />
                      {formData.contract_status && (
                        <Badge
                          className={`shrink-0 ${
                            formData.contract_status === "A"
                              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                              : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                          }`}
                        >
                          {formatContractStatus(formData.contract_status)}
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="md:col-span-2">
                    <Label>Produto/Plano Atual {fromErp && <span className="text-violet-500 text-xs ml-1">• ERP</span>}</Label>
                    <Input
                      value={formData.interest}
                      onChange={(e) => setFormData({ ...formData, interest: e.target.value })}
                      placeholder="Ex: ESSENCIAL - 66 ATÉ 75 ANOS"
                      className={`mt-1 ${fromErp ? "bg-violet-50 dark:bg-violet-950/20" : ""}`}
                    />
                  </div>

                  <div>
                    <Label>Nome do Dependente {fromErp && <span className="text-violet-500 text-xs ml-1">• ERP</span>}</Label>
                    <Input
                      value={formData.dependent_name}
                      onChange={(e) => setFormData({ ...formData, dependent_name: e.target.value })}
                      placeholder="Nome do dependente (se houver)"
                      className={`mt-1 ${fromErp && formData.dependent_name ? "bg-violet-50 dark:bg-violet-950/20" : ""}`}
                    />
                  </div>

                  <div>
                    <Label>CPF do Dependente {fromErp && <span className="text-violet-500 text-xs ml-1">• ERP</span>}</Label>
                    <Input
                      value={formData.dependent_cpf}
                      onChange={(e) => setFormData({ ...formData, dependent_cpf: formatCPF(e.target.value) })}
                      placeholder="000.000.000-00"
                      maxLength={14}
                      className={`mt-1 ${fromErp && formData.dependent_cpf ? "bg-violet-50 dark:bg-violet-950/20" : ""}`}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-900">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-green-800 dark:text-green-400">
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
                      className="mt-1 bg-white dark:bg-gray-900"
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
                      className="mt-1 bg-white dark:bg-gray-900"
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
                      className="mt-1 bg-white dark:bg-gray-900"
                    />
                    <p className="text-xs text-gray-600 mt-1">Quantidade de dependentes</p>
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
                      className="mt-1 bg-green-100 dark:bg-green-900/30 font-semibold text-green-800 dark:text-green-300 cursor-not-allowed"
                    />
                    <p className="text-xs text-gray-600 mt-1">Mensal + Adesão = Valor Total</p>
                  </div>
                </div>
                {(formData.monthly_value || formData.adhesion_value) && (
                  <div className="pt-4 border-t border-green-200 dark:border-green-800">
                    <div className="flex items-center justify-center gap-2 text-lg flex-wrap">
                      {formData.monthly_value && (
                        <span className="bg-white dark:bg-gray-800 px-3 py-2 rounded-lg text-sm">
                          <span className="text-gray-500">Mensal:</span>{" "}
                          <span className="font-bold text-green-700 dark:text-green-400">R$ {parseFloat(formData.monthly_value).toFixed(2)}</span>
                        </span>
                      )}
                      {formData.monthly_value && formData.adhesion_value && <span className="text-gray-400 text-xl">+</span>}
                      {formData.adhesion_value && (
                        <span className="bg-white dark:bg-gray-800 px-3 py-2 rounded-lg text-sm">
                          <span className="text-gray-500">Adesão:</span>{" "}
                          <span className="font-bold text-green-700 dark:text-green-400">R$ {parseFloat(formData.adhesion_value).toFixed(2)}</span>
                        </span>
                      )}
                      <span className="text-gray-400 text-xl">=</span>
                      <span className="bg-green-600 text-white px-4 py-2 rounded-lg">
                        <span className="text-sm opacity-80">Total:</span>{" "}
                        <span className="font-bold text-xl">R$ {formData.value || "0.00"}</span>
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-900">
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
                  disabled={gettingLocation || reverseGeocoding || !!location}
                  className="w-full bg-white dark:bg-gray-900"
                >
                  {gettingLocation ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Obtendo localização...</>
                  ) : reverseGeocoding ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Buscando endereço...</>
                  ) : location ? (
                    <><MapPin className="w-4 h-4 mr-2 text-green-600" />Localização capturada ✓</>
                  ) : (
                    <><Navigation className="w-4 h-4 mr-2" />Capturar Localização GPS</>
                  )}
                </Button>
                {location && (
                  <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-sm">
                    <p className="text-green-700 dark:text-green-400">
                      ✅ Localização capturada: {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>
                  Endereço
                  {fromErp && <span className="text-xs font-normal text-violet-500 ml-2">(pré-preenchido do ERP)</span>}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="md:col-span-2">
                    <Label>Rua/Logradouro {fromErp && <span className="text-violet-500 text-xs ml-1">• ERP</span>}</Label>
                    <Input
                      value={formData.street}
                      onChange={(e) => setFormData({ ...formData, street: e.target.value })}
                      placeholder="Nome da rua"
                      className={`mt-1 ${fromErp && formData.street ? "bg-violet-50 dark:bg-violet-950/20" : ""}`}
                    />
                  </div>
                  <div>
                    <Label>Número {fromErp && <span className="text-violet-500 text-xs ml-1">• ERP</span>}</Label>
                    <Input
                      value={formData.number}
                      onChange={(e) => setFormData({ ...formData, number: e.target.value })}
                      placeholder="123"
                      className={`mt-1 ${fromErp && formData.number ? "bg-violet-50 dark:bg-violet-950/20" : ""}`}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label>Complemento {fromErp && <span className="text-violet-500 text-xs ml-1">• ERP</span>}</Label>
                    <Input
                      value={formData.complement}
                      onChange={(e) => setFormData({ ...formData, complement: e.target.value })}
                      placeholder="Apto, bloco, etc"
                      className={`mt-1 ${fromErp && formData.complement ? "bg-violet-50 dark:bg-violet-950/20" : ""}`}
                    />
                  </div>
                  <div>
                    <Label>CEP {fromErp && <span className="text-violet-500 text-xs ml-1">• ERP</span>}</Label>
                    <div className="relative">
                      <Input
                        value={formData.cep}
                        onChange={handleCEPChange}
                        placeholder="00000-000"
                        maxLength={9}
                        className={`mt-1 pr-10 ${searchingCep ? "bg-blue-50" : fromErp && formData.cep ? "bg-violet-50 dark:bg-violet-950/20" : ""}`}
                      />
                      {searchingCep && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Digite o CEP para preencher cidade/estado</p>
                  </div>
                  <div>
                    <Label>Bairro {fromErp && <span className="text-violet-500 text-xs ml-1">• ERP</span>}</Label>
                    <Input
                      value={formData.neighborhood}
                      onChange={(e) => setFormData({ ...formData, neighborhood: e.target.value })}
                      placeholder="Nome do bairro"
                      className={`mt-1 ${fromErp && formData.neighborhood ? "bg-violet-50 dark:bg-violet-950/20" : ""}`}
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
                          activeAgents.map((agent) => (
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
                        <img src={selectedAgent.photo_url} alt={selectedAgent.name} className="w-10 h-10 rounded-full object-cover" />
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

            <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-900">
              <CardContent className="p-4">
                <div className="flex items-start space-x-3">
                  <Checkbox
                    id="lgpd"
                    checked={formData.lgpd_consent}
                    onCheckedChange={(checked) => setFormData({ ...formData, lgpd_consent: checked })}
                    className="mt-1"
                  />
                  <label htmlFor="lgpd" className="text-sm leading-tight cursor-pointer">
                    <strong className="text-blue-900 dark:text-blue-300">Cliente autorizou o uso de seus dados pessoais *</strong>
                    <p className="text-blue-700 dark:text-blue-400 mt-1">
                      Conforme Lei Geral de Proteção de Dados (LGPD - Lei 13.709/2018)
                    </p>
                  </label>
                </div>
              </CardContent>
            </Card>

            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep("lookup")}
                className="flex-1"
              >
                Voltar
              </Button>
              <Button
                type="submit"
                disabled={!formData.phone || !formData.agent_id || !formData.lgpd_consent || createLeadMutation.isPending}
                className="flex-1 bg-violet-600 hover:bg-violet-700"
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
