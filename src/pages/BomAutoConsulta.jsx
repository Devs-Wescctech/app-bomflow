import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import {
  Car, Search, CheckCircle, XCircle, AlertTriangle,
  Loader2, User, Wrench, FileText, Phone, Hash,
  ClipboardCheck, Calendar, Shield
} from "lucide-react";

const API_BASE = '/api';

function getAuthHeaders() {
  const token = localStorage.getItem('accessToken');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

function formatCPF(value) {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function formatPlaca(value) {
  const clean = value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 7);
  if (clean.length <= 3) return clean;
  return `${clean.slice(0, 3)}-${clean.slice(3)}`;
}

function validateCPF(cpf) {
  const digits = cpf.replace(/\D/g, '');
  return digits.length === 11;
}

function validatePlaca(placa) {
  const clean = placa.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (clean.length !== 7) return false;
  const oldFormat = /^[A-Z]{3}[0-9]{4}$/.test(clean);
  const mercosulFormat = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/.test(clean);
  return oldFormat || mercosulFormat;
}

function stripHTML(str) {
  return str.replace(/<[^>]*>/g, '');
}

function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

const TIPOS_SERVICO = [
  "Chaveiro",
  "Guincho",
  "Pane elétrica",
  "Pane seca",
  "Serviços de táxi",
  "Troca de pneu",
];

export default function BomAutoConsulta() {
  const { toast } = useToast();

  const [currentUser, setCurrentUser] = useState(null);
  const [searchCPF, setSearchCPF] = useState('');
  const [searchPlaca, setSearchPlaca] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [clientData, setClientData] = useState(null);
  const [utilizacoes, setUtilizacoes] = useState(null);
  const [eligibility, setEligibility] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState('');
  const [tipoServico, setTipoServico] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [atendimentoFinalizado, setAtendimentoFinalizado] = useState(null);

  useEffect(() => {
    async function fetchUser() {
      try {
        const res = await fetch(`${API_BASE}/auth/me`, {
          headers: { ...getAuthHeaders() },
        });
        if (res.ok) {
          const data = await res.json();
          setCurrentUser(data);
        }
      } catch (e) {}
    }
    fetchUser();
  }, []);

  function getVehicles() {
    if (!clientData) return [];
    if (Array.isArray(clientData.veiculos)) return clientData.veiculos;
    if (clientData.data && Array.isArray(clientData.data.veiculos)) return clientData.data.veiculos;
    return [];
  }

  function checkEligibility(data, utilizacoesCount) {
    const reasons = [];
    const contrato = (data.situacao_contrato || data.data?.situacao_contrato || '').toLowerCase();
    const financeira = (data.situacao_financeira || data.data?.situacao_financeira || '').toLowerCase();
    const veiculos = Array.isArray(data.veiculos) ? data.veiculos : (data.data?.veiculos || []);

    if (!contrato.includes('ativo')) {
      reasons.push('Contrato não está ativo');
    }
    if (!financeira.includes('adimplente') && !financeira.includes('em dia')) {
      reasons.push('Situação financeira não está adimplente');
    }
    if (veiculos.length > 3) {
      reasons.push(`Número de veículos (${veiculos.length}) excede o limite de 3`);
    }
    if (utilizacoesCount > 3) {
      reasons.push(`Utilizações no mês (${utilizacoesCount}) excede o limite de 3`);
    }

    return { eligible: reasons.length === 0, reasons };
  }

  async function handleSearch(e) {
    e.preventDefault();
    setError('');
    setClientData(null);
    setUtilizacoes(null);
    setEligibility(null);
    setShowForm(false);
    setSelectedVehicle('');
    setTipoServico('');
    setObservacoes('');
    setAtendimentoFinalizado(null);

    const cpfDigits = searchCPF.replace(/\D/g, '');
    const placaClean = searchPlaca.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

    if (!cpfDigits && !placaClean) {
      setError('Informe pelo menos o CPF ou a Placa para consultar.');
      return;
    }
    if (cpfDigits && !validateCPF(searchCPF)) {
      setError('CPF inválido. Informe 11 dígitos.');
      return;
    }
    if (placaClean && !validatePlaca(searchPlaca)) {
      setError('Placa inválida. Formatos aceitos: ABC-1234 ou ABC1D23.');
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (cpfDigits) params.set('documento', cpfDigits);
      if (placaClean) params.set('placa', placaClean);

      const res = await fetch(`${API_BASE}/bom-auto/consulta?${params.toString()}`, {
        headers: { ...getAuthHeaders() },
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || errData.message || 'Erro ao consultar cliente.');
      }

      const data = await res.json();
      setClientData(data);

      const doc = data.documento || data.data?.documento || cpfDigits;
      let utilizacoesCount = 0;
      if (doc) {
        try {
          const utilRes = await fetch(`${API_BASE}/bom-auto/utilizacoes/${doc}`, {
            headers: { ...getAuthHeaders() },
          });
          if (utilRes.ok) {
            const utilData = await utilRes.json();
            utilizacoesCount = utilData.count ?? utilData.utilizacoes ?? utilData.total ?? 0;
          }
        } catch (e) {}
      }
      setUtilizacoes(utilizacoesCount);

      const elig = checkEligibility(data, utilizacoesCount);
      setEligibility(elig);
    } catch (err) {
      setError(err.message || 'Erro ao consultar cliente.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmitAtendimento(e) {
    e.preventDefault();

    const vehicles = getVehicles();
    if (!selectedVehicle) {
      toast({ title: "Erro", description: "Selecione um veículo.", variant: "destructive" });
      return;
    }
    if (!tipoServico) {
      toast({ title: "Erro", description: "Selecione o tipo de serviço.", variant: "destructive" });
      return;
    }

    const vehicle = vehicles.find(v => v.placa === selectedVehicle);
    if (!vehicle) {
      toast({ title: "Erro", description: "Veículo não encontrado.", variant: "destructive" });
      return;
    }

    const sanitizedObs = stripHTML(observacoes);
    const documento = clientData?.documento || clientData?.data?.documento || '';
    const nome = clientData?.contratante || clientData?.data?.contratante || '';
    const usuario = currentUser?.email || currentUser?.name || currentUser?.username || '';

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/bom-auto/atendimentos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          documento_cliente: documento,
          nome_cliente: nome,
          placa: vehicle.placa,
          descricao_veiculo: vehicle.descricao_veiculo_limpa || vehicle.descricao_veiculo || '',
          tipo_servico: tipoServico,
          observacoes: sanitizedObs,
          usuario: usuario,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || errData.message || 'Erro ao registrar atendimento.');
      }

      const atendimento = await res.json();
      setAtendimentoFinalizado(atendimento);
      setShowForm(false);
      toast({ title: "Sucesso", description: `Atendimento registrado! Protocolo: ${atendimento.protocolo}` });
    } catch (err) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  function handleCancelForm() {
    setShowForm(false);
    setSelectedVehicle('');
    setTipoServico('');
    setObservacoes('');
  }

  function handleNovaConsulta() {
    setSearchCPF('');
    setSearchPlaca('');
    setClientData(null);
    setUtilizacoes(null);
    setEligibility(null);
    setShowForm(false);
    setSelectedVehicle('');
    setTipoServico('');
    setObservacoes('');
    setAtendimentoFinalizado(null);
    setError('');
  }

  const vehicles = getVehicles();
  const clientNome = clientData?.contratante || clientData?.data?.contratante || '-';
  const clientDoc = clientData?.documento || clientData?.data?.documento || '-';
  const clientContrato = clientData?.situacao_contrato || clientData?.data?.situacao_contrato || '-';
  const clientFinanceira = clientData?.situacao_financeira || clientData?.data?.situacao_financeira || '-';
  const clientCelular = clientData?.celular || clientData?.data?.celular || '';

  return (
    <div className="p-4 md:p-6 space-y-6 bg-gray-50 dark:bg-gray-950 min-h-screen">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 shadow-lg">
              <Car className="w-5 h-5 text-white" />
            </div>
            Bom Auto - Consulta de Cliente
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearch} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cpf">CPF</Label>
                <Input
                  id="cpf"
                  placeholder="000.000.000-00"
                  value={searchCPF}
                  onChange={(e) => setSearchCPF(formatCPF(e.target.value))}
                  maxLength={14}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="placa">Placa</Label>
                <Input
                  id="placa"
                  placeholder="ABC-1234 ou ABC1D23"
                  value={searchPlaca}
                  onChange={(e) => setSearchPlaca(formatPlaca(e.target.value))}
                  maxLength={8}
                />
              </div>
            </div>

            <p className="text-xs text-gray-500 dark:text-gray-400">
              Preencha pelo menos um dos campos acima para consultar.
            </p>

            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <Button type="submit" disabled={loading} className="w-full md:w-auto">
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Consultando...
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  Consultar
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {clientData && !atendimentoFinalizado && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 shadow-lg">
                <User className="w-5 h-5 text-white" />
              </div>
              Dados do Cliente
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Nome</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{clientNome}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">CPF</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{clientDoc}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Status do Plano</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{clientContrato}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Situação Financeira</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{clientFinanceira}</p>
              </div>
              {clientCelular && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Celular</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-gray-400" />
                    {clientCelular}
                  </p>
                </div>
              )}
            </div>

            {vehicles.length > 0 && (
              <div className="mt-5 pt-4 border-t border-gray-200 dark:border-gray-700">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                  <Car className="w-3.5 h-3.5" />
                  Veículos ({vehicles.length})
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {vehicles.map((v, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800">
                      <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900">
                        <Car className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-blue-700 dark:text-blue-300 tracking-wide">{v.placa}</p>
                        <p className="text-xs text-blue-600/70 dark:text-blue-400/70 truncate">
                          {v.descricao_veiculo_limpa || v.descricao_veiculo || 'Sem descrição'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {utilizacoes !== null && (
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                  Utilizações no mês
                </p>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{utilizacoes} / 3</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {eligibility && !atendimentoFinalizado && (
        <Card className={eligibility.eligible
          ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/30"
          : "border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/30"
        }>
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              {eligibility.eligible ? (
                <>
                  <div className="p-3 rounded-xl bg-gradient-to-br from-emerald-500 to-green-500 shadow-lg flex-shrink-0">
                    <CheckCircle className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-emerald-700 dark:text-emerald-300">
                      Cliente Elegível
                    </h3>
                    <p className="text-sm text-emerald-600 dark:text-emerald-400 mt-1">
                      Todas as condições foram atendidas. O cliente pode ser atendido.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="p-3 rounded-xl bg-gradient-to-br from-red-500 to-rose-500 shadow-lg flex-shrink-0">
                    <XCircle className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-red-700 dark:text-red-300">
                      Cliente Não Elegível
                    </h3>
                    <ul className="mt-2 space-y-1">
                      {eligibility.reasons.map((reason, i) => (
                        <li key={i} className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                          <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                          {reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}
            </div>

            {eligibility.eligible && !showForm && (
              <div className="mt-6">
                <Button
                  onClick={() => setShowForm(true)}
                  variant="success"
                  size="lg"
                >
                  <Wrench className="w-4 h-4" />
                  Iniciar Atendimento
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {showForm && !atendimentoFinalizado && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg">
                <FileText className="w-5 h-5 text-white" />
              </div>
              Registrar Atendimento
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmitAtendimento} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="veiculo" className="flex items-center gap-1.5">
                  <Car className="w-4 h-4 text-blue-500" />
                  Veículo *
                </Label>
                {vehicles.length > 0 ? (
                  <Select value={selectedVehicle} onValueChange={setSelectedVehicle}>
                    <SelectTrigger id="veiculo" className="border-blue-200 dark:border-blue-800 focus:ring-blue-500">
                      <SelectValue placeholder="Selecione o veículo" />
                    </SelectTrigger>
                    <SelectContent>
                      {vehicles.map((v, i) => (
                        <SelectItem key={i} value={v.placa}>
                          <div className="flex items-center gap-2">
                            <Car className="w-4 h-4 text-blue-500" />
                            <span className="font-bold text-blue-700 dark:text-blue-300">{v.placa}</span>
                            <span className="text-gray-500 dark:text-gray-400">
                              {v.descricao_veiculo_limpa || v.descricao_veiculo || ''}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 text-sm">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    Nenhum veículo cadastrado para este cliente
                  </div>
                )}

                {selectedVehicle && (
                  <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900">
                        <Car className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-blue-700 dark:text-blue-300">
                          {selectedVehicle}
                        </p>
                        <p className="text-xs text-blue-600/70 dark:text-blue-400/70">
                          {vehicles.find(v => v.placa === selectedVehicle)?.descricao_veiculo_limpa ||
                           vehicles.find(v => v.placa === selectedVehicle)?.descricao_veiculo || 'Sem descrição'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="tipoServico" className="flex items-center gap-1.5">
                  <Wrench className="w-4 h-4 text-blue-500" />
                  Tipo de Serviço *
                </Label>
                <Select value={tipoServico} onValueChange={setTipoServico}>
                  <SelectTrigger id="tipoServico" className="border-blue-200 dark:border-blue-800 focus:ring-blue-500">
                    <SelectValue placeholder="Selecione o tipo de serviço" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS_SERVICO.map((tipo) => (
                      <SelectItem key={tipo} value={tipo}>
                        {tipo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="observacoes">Observações</Label>
                <Textarea
                  id="observacoes"
                  placeholder="Detalhes adicionais (opcional)"
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  rows={4}
                />
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCancelForm}
                  disabled={submitting}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  variant="success"
                  disabled={submitting || vehicles.length === 0}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Registrando...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      Finalizar Atendimento
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {atendimentoFinalizado && (
        <Card className="border-emerald-200 dark:border-emerald-800 bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-950/40 dark:to-green-950/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-br from-emerald-500 to-green-500 shadow-lg">
                <ClipboardCheck className="w-5 h-5 text-white" />
              </div>
              Atendimento Registrado com Sucesso
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center gap-3 p-4 rounded-xl bg-white dark:bg-gray-900 border border-emerald-200 dark:border-emerald-800 shadow-sm">
              <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 shadow">
                <Hash className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Número do Protocolo</p>
                <p className="text-xl font-bold text-blue-700 dark:text-blue-300 tracking-wider">
                  {atendimentoFinalizado.protocolo}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
              <div className="space-y-1">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide flex items-center gap-1">
                  <User className="w-3 h-3" /> Cliente
                </p>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {atendimentoFinalizado.nome_cliente}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide flex items-center gap-1">
                  <Shield className="w-3 h-3" /> CPF
                </p>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {atendimentoFinalizado.documento_cliente}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide flex items-center gap-1">
                  <Car className="w-3 h-3" /> Veículo
                </p>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {atendimentoFinalizado.placa}
                  {atendimentoFinalizado.descricao_veiculo && (
                    <span className="text-gray-500 dark:text-gray-400 font-normal"> - {atendimentoFinalizado.descricao_veiculo}</span>
                  )}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide flex items-center gap-1">
                  <Wrench className="w-3 h-3" /> Tipo de Serviço
                </p>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {atendimentoFinalizado.tipo_servico}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> Data/Hora
                </p>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {formatDateTime(atendimentoFinalizado.data_hora)}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide flex items-center gap-1">
                  <User className="w-3 h-3" /> Atendente
                </p>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {atendimentoFinalizado.usuario}
                </p>
              </div>
              {atendimentoFinalizado.observacoes && (
                <div className="space-y-1 md:col-span-2">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide flex items-center gap-1">
                    <FileText className="w-3 h-3" /> Observações
                  </p>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    {atendimentoFinalizado.observacoes}
                  </p>
                </div>
              )}
            </div>

            <div className="pt-2">
              <Button onClick={handleNovaConsulta} className="w-full md:w-auto">
                <Search className="w-4 h-4" />
                Nova Consulta
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
