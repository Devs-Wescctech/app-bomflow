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
  Loader2, User, Wrench, FileText
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

const TIPOS_SERVICO = [
  "Alinhamento e Balanceamento",
  "Funilaria e Pintura",
  "Reparo Mecanico",
  "Revisao Completa",
  "Troca de Oleo",
  "Troca de Pneus",
  "Outros",
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
      reasons.push('Contrato nao esta ativo');
    }
    if (!financeira.includes('adimplente') && !financeira.includes('em dia')) {
      reasons.push('Situacao financeira nao esta adimplente');
    }
    if (veiculos.length > 3) {
      reasons.push(`Numero de veiculos (${veiculos.length}) excede o limite de 3`);
    }
    if (utilizacoesCount > 3) {
      reasons.push(`Utilizacoes no mes (${utilizacoesCount}) excede o limite de 3`);
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

    const cpfDigits = searchCPF.replace(/\D/g, '');
    const placaClean = searchPlaca.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

    if (!cpfDigits && !placaClean) {
      setError('Informe pelo menos o CPF ou a Placa para consultar.');
      return;
    }
    if (cpfDigits && !validateCPF(searchCPF)) {
      setError('CPF invalido. Informe 11 digitos.');
      return;
    }
    if (placaClean && !validatePlaca(searchPlaca)) {
      setError('Placa invalida. Formatos aceitos: ABC-1234 ou ABC1D23.');
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
      toast({ title: "Erro", description: "Selecione um veiculo.", variant: "destructive" });
      return;
    }
    if (!tipoServico) {
      toast({ title: "Erro", description: "Selecione o tipo de servico.", variant: "destructive" });
      return;
    }

    const vehicle = vehicles.find(v => v.placa === selectedVehicle);
    if (!vehicle) {
      toast({ title: "Erro", description: "Veiculo nao encontrado.", variant: "destructive" });
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

      toast({ title: "Sucesso", description: "Atendimento registrado com sucesso!" });
      setShowForm(false);
      setSelectedVehicle('');
      setTipoServico('');
      setObservacoes('');
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

  const vehicles = getVehicles();
  const clientNome = clientData?.contratante || clientData?.data?.contratante || '-';
  const clientDoc = clientData?.documento || clientData?.data?.documento || '-';
  const clientContrato = clientData?.situacao_contrato || clientData?.data?.situacao_contrato || '-';
  const clientFinanceira = clientData?.situacao_financeira || clientData?.data?.situacao_financeira || '-';

  return (
    <div className="p-4 md:p-6 space-y-6 bg-gray-50 dark:bg-gray-950 min-h-screen">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 shadow-lg">
              <Car className="w-5 h-5 text-white" />
            </div>
            Bom Auto - Consulta Cliente
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

      {clientData && (
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
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Situacao Financeira</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{clientFinanceira}</p>
              </div>
            </div>

            {vehicles.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                  Veiculos ({vehicles.length})
                </p>
                <div className="flex flex-wrap gap-2">
                  {vehicles.map((v, i) => (
                    <Badge key={i} variant="secondary">
                      {v.placa} - {v.descricao_veiculo_limpa || v.descricao_veiculo || 'Sem descricao'}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {utilizacoes !== null && (
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                  Utilizacoes no mes
                </p>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{utilizacoes} / 3</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {eligibility && (
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
                      Cliente Elegivel
                    </h3>
                    <p className="text-sm text-emerald-600 dark:text-emerald-400 mt-1">
                      Todas as condicoes foram atendidas. O cliente pode ser atendido.
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
                      Cliente Nao Elegivel
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

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 shadow-lg">
                <FileText className="w-5 h-5 text-white" />
              </div>
              Registrar Atendimento
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmitAtendimento} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="veiculo">Veiculo *</Label>
                {vehicles.length > 0 ? (
                  <Select value={selectedVehicle} onValueChange={setSelectedVehicle}>
                    <SelectTrigger id="veiculo">
                      <SelectValue placeholder="Selecione o veiculo" />
                    </SelectTrigger>
                    <SelectContent>
                      {vehicles.map((v, i) => (
                        <SelectItem key={i} value={v.placa}>
                          <span className="font-bold">{v.placa}</span>
                          <span className="ml-2 text-gray-500">
                            {v.descricao_veiculo_limpa || v.descricao_veiculo || ''}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 text-sm">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    Nenhum veiculo cadastrado para este cliente
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="tipoServico">Tipo de Servico *</Label>
                <Select value={tipoServico} onValueChange={setTipoServico}>
                  <SelectTrigger id="tipoServico">
                    <SelectValue placeholder="Selecione o tipo de servico" />
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
                <Label htmlFor="observacoes">Observacoes</Label>
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
    </div>
  );
}
