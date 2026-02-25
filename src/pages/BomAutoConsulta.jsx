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
  ClipboardCheck, Calendar, Shield,
  Copy, RefreshCw, Clock
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

function StatusBadge({ status }) {
  if (!status) return null;
  const s = status.toLowerCase();
  let variant = "default";
  let className = "";
  if (s === "pendente") {
    className = "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/50 dark:text-amber-300 dark:border-amber-700";
  } else if (s === "concluído" || s === "concluido" || s === "finalizado") {
    className = "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/50 dark:text-emerald-300 dark:border-emerald-700";
  } else if (s === "cancelado") {
    className = "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/50 dark:text-red-300 dark:border-red-700";
  } else {
    className = "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/50 dark:text-blue-300 dark:border-blue-700";
  }
  return <Badge variant="outline" className={className}>{status}</Badge>;
}

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
  const [telefoneContato, setTelefoneContato] = useState('');
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

    const isAtivo = contrato.includes('ativo') && !contrato.includes('inativo');
    if (!isAtivo) {
      reasons.push(`Contrato não está ativo (${(data.situacao_contrato || data.data?.situacao_contrato || 'N/A').toUpperCase()})`);
    }
    const isAdimplente = (financeira.includes('adimplente') && !financeira.includes('inadimplente')) || financeira.includes('em dia');
    if (!isAdimplente) {
      reasons.push(`Situação financeira não está adimplente (${(data.situacao_financeira || data.data?.situacao_financeira || 'N/A').toUpperCase()})`);
    }
    if (veiculos.length > 3) {
      reasons.push(`Número de veículos (${veiculos.length}) excede o limite de 3`);
    }
    if (utilizacoesCount >= 3) {
      reasons.push(`Utilizações no ano (${utilizacoesCount}) excede o limite de 3`);
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
    setTelefoneContato('');
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
      let utilizacoesData = { count: 0, atendimentos: [] };
      if (doc) {
        try {
          const utilRes = await fetch(`${API_BASE}/bom-auto/utilizacoes/${doc}`, {
            headers: { ...getAuthHeaders() },
          });
          if (utilRes.ok) {
            const utilData = await utilRes.json();
            utilizacoesData = {
              count: utilData.count ?? utilData.utilizacoes ?? utilData.total ?? 0,
              atendimentos: utilData.atendimentos || [],
            };
          }
        } catch (e) {}
      }
      setUtilizacoes(utilizacoesData);

      const elig = checkEligibility(data, utilizacoesData.count);
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
    const telefoneDigits = telefoneContato.replace(/\D/g, '');
    if (!telefoneDigits || telefoneDigits.length < 10) {
      toast({ title: "Erro", description: "Informe um telefone de contato válido (mínimo 10 dígitos).", variant: "destructive" });
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
          telefone_contato: telefoneDigits,
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
    setTelefoneContato('');
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
    setTelefoneContato('');
    setAtendimentoFinalizado(null);
    setError('');
  }

  function buildCommunicationMessage() {
    if (!atendimentoFinalizado || !clientData) return '';
    const cliente = clientData.contratante || clientData.data?.contratante || '';
    const documento = clientData.documento || clientData.data?.documento || '';
    const placa = atendimentoFinalizado.placa || '';
    const descricaoVeiculo = atendimentoFinalizado.descricao_veiculo || '';
    const tipoServ = atendimentoFinalizado.tipo_servico || '';
    const dataHora = formatDateTime(atendimentoFinalizado.data_hora || atendimentoFinalizado.created_at);
    const protocolo = atendimentoFinalizado.protocolo || '';

    const telefone = atendimentoFinalizado.telefone_contato
      ? atendimentoFinalizado.telefone_contato.replace(/(\d{2})(\d{4,5})(\d{4})/, '($1) $2-$3')
      : '';

    return `Solicitação de Serviço\nProtocolo: ${protocolo}\n\nNome Completo: ${cliente}\nCPF: ${documento}\nTelefone de Contato: ${telefone}\nPlaca: ${placa}\nDescrição Veículo: ${descricaoVeiculo}\nTipo Serviço: ${tipoServ}\nData solicitação: ${dataHora}`;
  }

  async function handleCopyMessage() {
    const msg = buildCommunicationMessage();
    try {
      await navigator.clipboard.writeText(msg);
      toast({ title: "Mensagem copiada!", description: "Texto copiado para a área de transferência." });
    } catch {
      toast({ title: "Erro", description: "Não foi possível copiar a mensagem.", variant: "destructive" });
    }
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

            {(() => {
              const isContratoAtivo = clientContrato.toLowerCase().includes('ativo') && !clientContrato.toLowerCase().includes('cancelado') && !clientContrato.toLowerCase().includes('inativo');
              const isAdimplente = clientFinanceira.toLowerCase().includes('adimplente') && !clientFinanceira.toLowerCase().includes('inadimplente');
              const utilizacoesCount = utilizacoes?.count ?? 0;
              const utilizacoesColor = utilizacoesCount >= 3 ? 'red' : utilizacoesCount >= 2 ? 'amber' : 'emerald';

              return (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
                  <div className={`relative overflow-hidden rounded-xl border p-4 shadow-sm ${
                    isContratoAtivo
                      ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800'
                      : 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800'
                  }`}>
                    <div className={`absolute top-0 right-0 w-16 h-16 rounded-bl-full opacity-10 ${
                      isContratoAtivo ? 'bg-emerald-500' : 'bg-red-500'
                    }`} />
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-2">Status do Plano</p>
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${isContratoAtivo ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                      <span className={`text-sm font-bold ${isContratoAtivo ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}>
                        {clientContrato.toUpperCase()}
                      </span>
                    </div>
                  </div>

                  <div className={`relative overflow-hidden rounded-xl border p-4 shadow-sm ${
                    isAdimplente
                      ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800'
                      : 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800'
                  }`}>
                    <div className={`absolute top-0 right-0 w-16 h-16 rounded-bl-full opacity-10 ${
                      isAdimplente ? 'bg-emerald-500' : 'bg-red-500'
                    }`} />
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-2">Situação Financeira</p>
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${isAdimplente ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                      <span className={`text-sm font-bold ${isAdimplente ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}>
                        {clientFinanceira.toUpperCase()}
                      </span>
                    </div>
                  </div>

                  {utilizacoes !== null && (
                    <div className={`relative overflow-hidden rounded-xl border p-4 shadow-sm ${
                      utilizacoesColor === 'red'
                        ? 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800'
                        : utilizacoesColor === 'amber'
                          ? 'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800'
                          : 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800'
                    }`}>
                      <div className={`absolute top-0 right-0 w-16 h-16 rounded-bl-full opacity-10 ${
                        utilizacoesColor === 'red' ? 'bg-red-500' : utilizacoesColor === 'amber' ? 'bg-amber-500' : 'bg-emerald-500'
                      }`} />
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-2">Utilizações no Ano</p>
                      <div className="flex items-baseline gap-1">
                        <span className={`text-2xl font-extrabold ${
                          utilizacoesColor === 'red' ? 'text-red-700 dark:text-red-300'
                            : utilizacoesColor === 'amber' ? 'text-amber-700 dark:text-amber-300'
                              : 'text-emerald-700 dark:text-emerald-300'
                        }`}>{utilizacoesCount}</span>
                        <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">/ 3 utilizações</span>
                      </div>
                      <div className="flex gap-1 mt-2">
                        {[0, 1, 2].map(i => (
                          <div key={i} className={`h-1.5 flex-1 rounded-full ${
                            i < utilizacoesCount
                              ? (utilizacoesColor === 'red' ? 'bg-red-400 dark:bg-red-500'
                                : utilizacoesColor === 'amber' ? 'bg-amber-400 dark:bg-amber-500'
                                  : 'bg-emerald-400 dark:bg-emerald-500')
                              : 'bg-gray-200 dark:bg-gray-700'
                          }`} />
                        ))}
                      </div>
                      {utilizacoesCount >= 3 && (
                        <p className="text-[11px] font-bold text-red-600 dark:text-red-400 mt-2 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          Limite anual atingido
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

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



          </CardContent>
        </Card>
      )}

      {clientData && !atendimentoFinalizado && utilizacoes !== null && utilizacoes.atendimentos && utilizacoes.atendimentos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-br from-violet-500 to-purple-500 shadow-lg">
                <Clock className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <span>Histórico de Utilizações</span>
                <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
                  ({utilizacoes.atendimentos.length} {utilizacoes.atendimentos.length === 1 ? 'registro' : 'registros'})
                </span>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative">
              <div className="absolute left-[15px] top-2 bottom-2 w-0.5 bg-gradient-to-b from-violet-300 via-purple-200 to-gray-200 dark:from-violet-700 dark:via-purple-800 dark:to-gray-700" />

              <div className="space-y-4">
                {utilizacoes.atendimentos.map((at, i) => {
                  const s = (at.status_atendimento || 'Pendente').toLowerCase();
                  const isPendente = s === 'pendente';
                  const isSolucionado = s === 'solucionado' || s === 'concluído' || s === 'concluido' || s === 'finalizado';
                  const isCancelado = s === 'cancelado';

                  const dotColor = isPendente
                    ? 'bg-amber-500 ring-amber-200 dark:ring-amber-900'
                    : isSolucionado
                      ? 'bg-emerald-500 ring-emerald-200 dark:ring-emerald-900'
                      : isCancelado
                        ? 'bg-gray-400 ring-gray-200 dark:ring-gray-700'
                        : 'bg-blue-500 ring-blue-200 dark:ring-blue-900';

                  const cardBorder = isPendente
                    ? 'border-amber-200 dark:border-amber-800/50'
                    : isSolucionado
                      ? 'border-emerald-200 dark:border-emerald-800/50'
                      : isCancelado
                        ? 'border-gray-200 dark:border-gray-700'
                        : 'border-blue-200 dark:border-blue-800/50';

                  const cardBg = isPendente
                    ? 'bg-amber-50/50 dark:bg-amber-950/20'
                    : isSolucionado
                      ? 'bg-emerald-50/50 dark:bg-emerald-950/20'
                      : isCancelado
                        ? 'bg-gray-50/50 dark:bg-gray-800/20'
                        : 'bg-blue-50/50 dark:bg-blue-950/20';

                  return (
                    <div key={at.id || i} className="relative pl-10">
                      <div className={`absolute left-[9px] top-4 w-3 h-3 rounded-full ring-4 ${dotColor} z-10`} />

                      <div className={`rounded-xl border ${cardBorder} ${cardBg} shadow-sm overflow-hidden`}>
                        <div className="p-4">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                              <Calendar className="w-3.5 h-3.5" />
                              <span className="font-medium">{formatDateTime(at.data_hora)}</span>
                              {i === 0 && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300">
                                  Mais recente
                                </span>
                              )}
                            </div>
                            <StatusBadge status={at.status_atendimento || 'Pendente'} />
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="flex items-center gap-2">
                              <User className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                              <div className="min-w-0">
                                <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold">Atendente</p>
                                <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{at.usuario || '-'}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Wrench className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                              <div className="min-w-0">
                                <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold">Serviço</p>
                                <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{at.tipo_servico || '-'}</p>
                              </div>
                            </div>
                            {at.protocolo && (
                              <div className="flex items-center gap-2">
                                <Hash className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                <div className="min-w-0">
                                  <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold">Protocolo</p>
                                  <p className="text-sm font-mono font-medium text-gray-800 dark:text-gray-200">{at.protocolo}</p>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
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
                            <span className="font-bold">{v.placa}</span>
                            <span>
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
                        <p className="text-xs text-blue-700 dark:text-blue-300">
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
                <Label htmlFor="telefoneContato" className="flex items-center gap-1.5">
                  <Phone className="w-4 h-4 text-blue-500" />
                  Telefone de Contato *
                </Label>
                <Input
                  id="telefoneContato"
                  placeholder="(DDD) Telefone"
                  value={telefoneContato}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, '').slice(0, 11);
                    let formatted = digits;
                    if (digits.length > 2) {
                      formatted = `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
                    } else if (digits.length > 0) {
                      formatted = `(${digits}`;
                    }
                    setTelefoneContato(formatted);
                  }}
                  maxLength={15}
                  className="border-blue-200 dark:border-blue-800 focus:ring-blue-500"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="observacoes">Observações</Label>
                <Textarea
                  id="observacoes"
                  placeholder="Detalhes adicionais (opcional)"
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  rows={3}
                  className="border-blue-200 dark:border-blue-800 focus:ring-blue-500"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <Button type="submit" disabled={submitting} className="bg-blue-600 hover:bg-blue-700 text-white">
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Registrando...
                    </>
                  ) : (
                    <>
                      <ClipboardCheck className="w-4 h-4" />
                      Registrar Atendimento
                    </>
                  )}
                </Button>
                <Button type="button" variant="outline" onClick={handleCancelForm}>
                  Cancelar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {atendimentoFinalizado && (
        <div className="space-y-6">
          <Card className="border-emerald-300 dark:border-emerald-700 shadow-lg overflow-hidden">
            <div className="bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500 px-6 py-5 text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <CheckCircle className="w-6 h-6 text-white" />
                <h2 className="text-lg font-bold text-white tracking-wide">Atendimento Registrado com Sucesso</h2>
              </div>
              <p className="text-emerald-100 text-sm">Comprovante gerado automaticamente pelo sistema</p>
            </div>

            <CardContent className="p-0">
              <div className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700 px-6 py-6 text-center">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400 dark:text-gray-500 mb-2">Protocolo de Atendimento</p>
                <p className="text-4xl sm:text-5xl font-extrabold text-gray-900 dark:text-white tracking-widest font-mono">
                  {atendimentoFinalizado.protocolo || '-'}
                </p>
                <div className="mt-4">
                  {(() => {
                    const st = (atendimentoFinalizado.status_atendimento || 'Pendente').toLowerCase();
                    const isPend = st === 'pendente';
                    const isSoluc = st === 'solucionado' || st === 'concluído' || st === 'concluido' || st === 'finalizado';
                    const statusClass = isPend
                      ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/60 dark:text-amber-200 dark:border-amber-700'
                      : isSoluc
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/60 dark:text-emerald-200 dark:border-emerald-700'
                        : 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/60 dark:text-red-200 dark:border-red-700';
                    return (
                      <span className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-bold border ${statusClass}`}>
                        {isPend && <Clock className="w-4 h-4" />}
                        {isSoluc && <CheckCircle className="w-4 h-4" />}
                        {!isPend && !isSoluc && <XCircle className="w-4 h-4" />}
                        {atendimentoFinalizado.status_atendimento || 'Pendente'}
                      </span>
                    );
                  })()}
                </div>
              </div>

              <div className="px-6 py-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-400 dark:text-gray-500">Cliente</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{clientNome}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-400 dark:text-gray-500">CPF</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 font-mono">{clientDoc}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-400 dark:text-gray-500">Veículo</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                      <Car className="w-4 h-4 text-blue-500 flex-shrink-0" />
                      {atendimentoFinalizado.placa || '-'} — {atendimentoFinalizado.descricao_veiculo || '-'}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-400 dark:text-gray-500">Tipo de Serviço</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{atendimentoFinalizado.tipo_servico || '-'}</p>
                  </div>
                  {atendimentoFinalizado.telefone_contato && (
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-400 dark:text-gray-500">Telefone de Contato</p>
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                        <Phone className="w-4 h-4 text-blue-500 flex-shrink-0" />
                        {atendimentoFinalizado.telefone_contato.replace(/(\d{2})(\d{4,5})(\d{4})/, '($1) $2-$3')}
                      </p>
                    </div>
                  )}
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-400 dark:text-gray-500">Registrado por</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{atendimentoFinalizado.usuario || '-'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-400 dark:text-gray-500">Data / Hora</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {formatDateTime(atendimentoFinalizado.data_hora || atendimentoFinalizado.created_at)}
                    </p>
                  </div>
                  {atendimentoFinalizado.observacoes && (
                    <div className="space-y-1 sm:col-span-2">
                      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-400 dark:text-gray-500">Observações</p>
                      <p className="text-sm text-gray-900 dark:text-gray-100">{atendimentoFinalizado.observacoes}</p>
                    </div>
                  )}
                </div>

              </div>
            </CardContent>
          </Card>

          <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 shadow-lg">
                  <Copy className="w-5 h-5 text-white" />
                </div>
                Mensagem de Comunicação
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <pre className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap font-sans leading-relaxed">
                  {buildCommunicationMessage()}
                </pre>
              </div>
              <div className="mt-4">
                <Button onClick={handleCopyMessage} className="bg-blue-600 hover:bg-blue-700 text-white">
                  <Copy className="w-4 h-4" />
                  Copiar Mensagem
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-center">
            <Button onClick={handleNovaConsulta} variant="outline" size="lg">
              <RefreshCw className="w-4 h-4" />
              Nova Consulta
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}