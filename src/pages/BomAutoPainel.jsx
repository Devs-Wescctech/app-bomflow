import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import {
  Clock, CheckCircle, XCircle, BarChart3, Search, Filter,
  Loader2, User, Wrench, Car, Hash, Calendar, ImagePlus, X,
  ChevronDown, ChevronUp, Eye, ArrowRight, FileText, Shield,
  AlertTriangle, RefreshCw, Zap
} from "lucide-react";

const API_BASE = '/api';
const AUTO_REFRESH_INTERVAL = 60000;
const ALERT_HOURS_OLD = 24;
const ALERT_HOURS_NEW = 2;

function getAuthHeaders() {
  const token = localStorage.getItem('accessToken');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function getHoursAgo(dateStr) {
  if (!dateStr) return Infinity;
  return (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60);
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
  let className = "";
  if (s === "pendente") {
    className = "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/50 dark:text-amber-300 dark:border-amber-700";
  } else if (s === "em tratamento") {
    className = "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/50 dark:text-blue-300 dark:border-blue-700";
  } else if (s === "solucionado" || s === "concluído" || s === "concluido" || s === "finalizado") {
    className = "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/50 dark:text-emerald-300 dark:border-emerald-700";
  } else if (s === "cancelado") {
    className = "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/50 dark:text-red-300 dark:border-red-700";
  } else {
    className = "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/50 dark:text-blue-300 dark:border-blue-700";
  }
  return <Badge variant="outline" className={className}>{status}</Badge>;
}

function getAlertInfo(at) {
  const status = (at.status_atendimento || '').toLowerCase();
  if (status !== 'pendente') return null;
  const hoursAgo = getHoursAgo(at.data_hora || at.created_at);
  if (hoursAgo >= ALERT_HOURS_OLD) {
    return { type: 'old', label: `Sem atualização há ${Math.floor(hoursAgo)}h`, color: 'red' };
  }
  if (hoursAgo <= ALERT_HOURS_NEW) {
    return { type: 'new', label: 'Recém-criado', color: 'blue' };
  }
  return null;
}

export default function BomAutoPainel() {
  const { toast } = useToast();

  const [currentUser, setCurrentUser] = useState(null);
  const [allAtendimentos, setAllAtendimentos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [counts, setCounts] = useState({ pendentes: 0, solucionados: 0, cancelados: 0, total: 0 });

  const [filterStatus, setFilterStatus] = useState("Pendente");
  const [filterDataInicio, setFilterDataInicio] = useState("");
  const [filterDataFim, setFilterDataFim] = useState("");
  const [filterCliente, setFilterCliente] = useState("");
  const [filterPlaca, setFilterPlaca] = useState("");
  const [filterTipoServico, setFilterTipoServico] = useState("todos");

  const [universalSearch, setUniversalSearch] = useState("");

  const [selectedAtendimento, setSelectedAtendimento] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [historico, setHistorico] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);

  const [treatmentStatus, setTreatmentStatus] = useState("");
  const [treatmentObs, setTreatmentObs] = useState("");
  const [selectedImages, setSelectedImages] = useState([]);
  const [imagePreviews, setImagePreviews] = useState([]);
  const [saving, setSaving] = useState(false);

  const [lightboxImage, setLightboxImage] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);

  const refreshTimerRef = useRef(null);

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

  useEffect(() => {
    fetchAtendimentos();
  }, []);

  useEffect(() => {
    refreshTimerRef.current = setInterval(() => {
      fetchAtendimentos(true);
    }, AUTO_REFRESH_INTERVAL);
    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, [filterStatus, filterDataInicio, filterDataFim, filterCliente, filterPlaca, filterTipoServico]);

  useEffect(() => {
    return () => {
      imagePreviews.forEach(url => URL.revokeObjectURL(url));
    };
  }, [imagePreviews]);

  async function fetchContadores() {
    try {
      const res = await fetch(`${API_BASE}/bom-auto/atendimentos/contadores`, {
        headers: { ...getAuthHeaders() },
      });
      if (res.ok) {
        const data = await res.json();
        setCounts(data);
      }
    } catch (e) {}
  }

  async function fetchAtendimentos(silent = false, statusOverride) {
    if (!silent) setLoading(true);
    fetchContadores();
    try {
      const params = new URLSearchParams();
      const effectiveStatus = statusOverride !== undefined ? statusOverride : filterStatus;
      if (effectiveStatus && effectiveStatus !== "todos") params.set('status', effectiveStatus);
      if (filterDataInicio) params.set('data_inicio', filterDataInicio);
      if (filterDataFim) params.set('data_fim', filterDataFim);
      if (filterCliente) {
        const isDigits = /^\d+$/.test(filterCliente.replace(/\D/g, ''));
        if (filterCliente.replace(/\D/g, '').length >= 3 && isDigits && filterCliente.replace(/\D/g, '').length <= 14) {
          params.set('documento', filterCliente.replace(/\D/g, ''));
        }
        params.set('nome', filterCliente);
      }
      if (filterPlaca) params.set('placa', filterPlaca.replace(/[^a-zA-Z0-9]/g, '').toUpperCase());
      if (filterTipoServico && filterTipoServico !== "todos") params.set('tipo_servico', filterTipoServico);

      const res = await fetch(`${API_BASE}/bom-auto/atendimentos?${params.toString()}`, {
        headers: { ...getAuthHeaders() },
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || errData.message || 'Erro ao buscar atendimentos.');
      }

      const data = await res.json();
      setAllAtendimentos(Array.isArray(data) ? data : data.atendimentos || []);
      setLastRefresh(new Date());
    } catch (err) {
      if (!silent) {
        toast({ title: "Erro", description: err.message, variant: "destructive" });
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }

  const atendimentos = allAtendimentos.filter(at => {
    if (!universalSearch.trim()) return true;
    const q = universalSearch.trim().toLowerCase();
    const nome = (at.nome_cliente || '').toLowerCase();
    const doc = (at.documento_cliente || '').replace(/\D/g, '');
    const docQ = q.replace(/\D/g, '');
    const placa = (at.placa || '').toLowerCase();
    const protocolo = (at.protocolo || '').toLowerCase();
    return nome.includes(q) || (docQ && doc.includes(docQ)) || placa.includes(q) || protocolo.includes(q);
  });

  function handleFilter(e) {
    e.preventDefault();
    fetchAtendimentos();
  }

  function handleClearFilters() {
    setFilterStatus("todos");
    setFilterDataInicio("");
    setFilterDataFim("");
    setFilterCliente("");
    setFilterPlaca("");
    setFilterTipoServico("todos");
    setUniversalSearch("");
  }

  const alertCounts = {
    old: allAtendimentos.filter(a => {
      const alert = getAlertInfo(a);
      return alert && alert.type === 'old';
    }).length,
    recent: allAtendimentos.filter(a => {
      const alert = getAlertInfo(a);
      return alert && alert.type === 'new';
    }).length,
  };

  function handleCounterClick(status) {
    const newStatus = status === filterStatus ? "todos" : status;
    setFilterStatus(newStatus);
    fetchAtendimentos(false, newStatus);
  }

  async function openDetail(atendimento) {
    setModalOpen(true);
    setDetailLoading(true);
    setSelectedAtendimento(null);
    setHistorico([]);
    setTreatmentStatus("");
    setTreatmentObs("");
    setSelectedImages([]);
    imagePreviews.forEach(url => URL.revokeObjectURL(url));
    setImagePreviews([]);

    try {
      const [detailRes, histRes] = await Promise.all([
        fetch(`${API_BASE}/bom-auto/atendimentos/${atendimento.id}`, {
          headers: { ...getAuthHeaders() },
        }),
        fetch(`${API_BASE}/bom-auto/atendimentos/${atendimento.id}/historico`, {
          headers: { ...getAuthHeaders() },
        }),
      ]);

      if (!detailRes.ok) throw new Error('Erro ao buscar detalhes do atendimento.');

      const detail = await detailRes.json();
      setSelectedAtendimento(detail);

      const currentStatus = (detail.status_atendimento || 'Pendente');
      if (currentStatus.toLowerCase() === 'pendente') {
        setTreatmentStatus("Manter Pendente");
      } else {
        setTreatmentStatus(currentStatus);
      }

      if (histRes.ok) {
        const histData = await histRes.json();
        setHistorico(Array.isArray(histData) ? histData : histData.historico || []);
      }
    } catch (err) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
      setModalOpen(false);
    } finally {
      setDetailLoading(false);
    }
  }

  function handleCloseModal() {
    setModalOpen(false);
    setSelectedAtendimento(null);
    setHistorico([]);
    setTreatmentStatus("");
    setTreatmentObs("");
    selectedImages.forEach(() => {});
    imagePreviews.forEach(url => URL.revokeObjectURL(url));
    setSelectedImages([]);
    setImagePreviews([]);
    setLightboxImage(null);
  }

  function handleImageSelect(e) {
    const files = Array.from(e.target.files || []);
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const maxSize = 5 * 1024 * 1024;

    const validFiles = [];
    const errors = [];

    for (const file of files) {
      if (!validTypes.includes(file.type)) {
        errors.push(`${file.name}: tipo não suportado. Use JPEG, PNG, GIF ou WebP.`);
        continue;
      }
      if (file.size > maxSize) {
        errors.push(`${file.name}: excede o limite de 5MB.`);
        continue;
      }
      validFiles.push(file);
    }

    if (errors.length > 0) {
      toast({
        title: "Arquivos inválidos",
        description: errors.join('\n'),
        variant: "destructive",
      });
    }

    const totalAllowed = 10 - selectedImages.length;
    const filesToAdd = validFiles.slice(0, totalAllowed);

    if (validFiles.length > totalAllowed) {
      toast({
        title: "Limite de imagens",
        description: `Máximo de 10 imagens. Apenas ${totalAllowed} foram adicionadas.`,
        variant: "destructive",
      });
    }

    const newPreviews = filesToAdd.map(f => URL.createObjectURL(f));
    setSelectedImages(prev => [...prev, ...filesToAdd]);
    setImagePreviews(prev => [...prev, ...newPreviews]);

    e.target.value = '';
  }

  function handleRemoveImage(index) {
    URL.revokeObjectURL(imagePreviews[index]);
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
    setImagePreviews(prev => prev.filter((_, i) => i !== index));
  }

  async function handleSaveTreatment() {
    if (!selectedAtendimento) return;

    const finalStatus = treatmentStatus === "Manter Pendente" ? "Pendente" : treatmentStatus;

    if (finalStatus.toLowerCase() === "solucionado" && selectedImages.length === 0) {
      toast({
        title: "Imagem obrigatória",
        description: "Para marcar como Solucionado, é necessário anexar pelo menos 1 imagem.",
        variant: "destructive",
      });
      return;
    }

    const usuario = currentUser?.email || currentUser?.name || currentUser?.username || '';

    setSaving(true);
    try {
      if (selectedImages.length > 0) {
        const formData = new FormData();
        selectedImages.forEach(file => {
          formData.append('imagens', file);
        });
        const imgRes = await fetch(`${API_BASE}/bom-auto/atendimentos/${selectedAtendimento.id}/imagens`, {
          method: 'POST',
          headers: { ...getAuthHeaders() },
          body: formData,
        });
        if (!imgRes.ok) {
          throw new Error('Erro ao enviar as imagens.');
        }
      }

      const res = await fetch(`${API_BASE}/bom-auto/atendimentos/${selectedAtendimento.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          status_atendimento: finalStatus,
          observacoes_tratamento: treatmentObs,
          usuario: usuario,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || errData.message || 'Erro ao salvar tratamento.');
      }

      toast({ title: "Sucesso", description: "Tratamento salvo com sucesso!" });
      handleCloseModal();
      fetchAtendimentos();
    } catch (err) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  function handleUniversalSearchKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
    }
  }

  const sortedAtendimentos = [...atendimentos].sort((a, b) => {
    const statusOrder = (s) => {
      const sl = (s || '').toLowerCase();
      if (sl === 'pendente') return 0;
      if (sl === 'solucionado') return 2;
      if (sl === 'cancelado') return 3;
      return 1;
    };
    const diff = statusOrder(a.status_atendimento) - statusOrder(b.status_atendimento);
    if (diff !== 0) return diff;
    return new Date(b.data_hora || b.created_at) - new Date(a.data_hora || a.created_at);
  });

  return (
    <div className="p-4 md:p-6 space-y-5 bg-gray-50 dark:bg-gray-950 min-h-screen">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 shadow-lg">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Painel Operacional</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">Bom Auto - Centro de Comando</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {lastRefresh && (
            <span className="text-[11px] text-gray-400 dark:text-gray-500 hidden sm:block">
              Atualizado {lastRefresh.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchAtendimentos()}
            disabled={loading}
            className="gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Atualizar</span>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card
          className={`cursor-pointer transition-all hover:shadow-md ${filterStatus === 'Pendente' ? 'ring-2 ring-amber-400 shadow-md' : ''}`}
          onClick={() => handleCounterClick('Pendente')}
        >
          <CardContent className="p-3 md:p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10 ring-1 ring-amber-500/20">
                <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="min-w-0">
                <p className="text-2xl md:text-3xl font-extrabold text-amber-600 dark:text-amber-400">{counts.pendentes}</p>
                <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Pendentes</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card
          className={`cursor-pointer transition-all hover:shadow-md ${filterStatus === 'Solucionado' ? 'ring-2 ring-emerald-400 shadow-md' : ''}`}
          onClick={() => handleCounterClick('Solucionado')}
        >
          <CardContent className="p-3 md:p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10 ring-1 ring-emerald-500/20">
                <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="min-w-0">
                <p className="text-2xl md:text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">{counts.solucionados}</p>
                <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Solucionados</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card
          className={`cursor-pointer transition-all hover:shadow-md ${filterStatus === 'Cancelado' ? 'ring-2 ring-red-400 shadow-md' : ''}`}
          onClick={() => handleCounterClick('Cancelado')}
        >
          <CardContent className="p-3 md:p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-500/10 ring-1 ring-red-500/20">
                <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <div className="min-w-0">
                <p className="text-2xl md:text-3xl font-extrabold text-red-600 dark:text-red-400">{counts.cancelados}</p>
                <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Cancelados</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card
          className={`cursor-pointer transition-all hover:shadow-md ${filterStatus === 'todos' ? 'ring-2 ring-gray-400 shadow-md' : ''}`}
          onClick={() => handleCounterClick('todos')}
        >
          <CardContent className="p-3 md:p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gray-500/10 ring-1 ring-gray-500/20">
                <BarChart3 className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </div>
              <div className="min-w-0">
                <p className="text-2xl md:text-3xl font-extrabold text-gray-700 dark:text-gray-300">{counts.total}</p>
                <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Total</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {(alertCounts.old > 0 || alertCounts.recent > 0) && (
        <div className="flex flex-wrap gap-2">
          {alertCounts.old > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-sm">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              <span className="text-red-700 dark:text-red-300 font-medium">
                {alertCounts.old} atendimento{alertCounts.old > 1 ? 's' : ''} sem atualização há mais de {ALERT_HOURS_OLD}h
              </span>
            </div>
          )}
          {alertCounts.recent > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-sm">
              <Zap className="w-4 h-4 text-blue-500" />
              <span className="text-blue-700 dark:text-blue-300 font-medium">
                {alertCounts.recent} atendimento{alertCounts.recent > 1 ? 's' : ''} recém-criado{alertCounts.recent > 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          placeholder="Buscar por nome, CPF, placa ou protocolo..."
          value={universalSearch}
          onChange={(e) => setUniversalSearch(e.target.value)}
          onKeyDown={handleUniversalSearchKeyDown}
          className="pl-10 h-11 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 shadow-sm"
        />
        {universalSearch && (
          <button
            onClick={() => setUniversalSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X className="w-3.5 h-3.5 text-gray-400" />
          </button>
        )}
      </div>

      <Card className="border-gray-200 dark:border-gray-800">
        <CardHeader
          className="cursor-pointer py-3 px-4"
          onClick={() => setFiltersOpen(!filtersOpen)}
        >
          <CardTitle className="flex items-center justify-between text-sm font-medium">
            <span className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
              <Filter className="w-3.5 h-3.5" />
              Filtros Avançados
              {(filterDataInicio || filterDataFim || filterCliente || filterPlaca || (filterTipoServico && filterTipoServico !== 'todos')) && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Ativos</Badge>
              )}
            </span>
            {filtersOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </CardTitle>
        </CardHeader>
        {filtersOpen && (
          <CardContent className="pt-0 pb-4">
            <form onSubmit={handleFilter} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger>
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos</SelectItem>
                      <SelectItem value="Pendente">Pendente</SelectItem>
                      <SelectItem value="Solucionado">Solucionado</SelectItem>
                      <SelectItem value="Cancelado">Cancelado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Data Início</Label>
                  <Input
                    type="date"
                    value={filterDataInicio}
                    onChange={(e) => setFilterDataInicio(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Data Fim</Label>
                  <Input
                    type="date"
                    value={filterDataFim}
                    onChange={(e) => setFilterDataFim(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Cliente (Nome ou CPF)</Label>
                  <Input
                    placeholder="Buscar por nome ou CPF..."
                    value={filterCliente}
                    onChange={(e) => setFilterCliente(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Placa</Label>
                  <Input
                    placeholder="ABC-1234"
                    value={filterPlaca}
                    onChange={(e) => setFilterPlaca(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tipo de Serviço</Label>
                  <Select value={filterTipoServico} onValueChange={setFilterTipoServico}>
                    <SelectTrigger>
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos</SelectItem>
                      {TIPOS_SERVICO.map(tipo => (
                        <SelectItem key={tipo} value={tipo}>{tipo}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button type="submit" disabled={loading} size="sm">
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Buscando...
                    </>
                  ) : (
                    <>
                      <Search className="w-4 h-4" />
                      Filtrar
                    </>
                  )}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => { handleClearFilters(); fetchAtendimentos(false, 'todos'); }}>
                  Limpar Filtros
                </Button>
              </div>
            </form>
          </CardContent>
        )}
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {loading ? 'Carregando...' : `${sortedAtendimentos.length} atendimento${sortedAtendimentos.length !== 1 ? 's' : ''}`}
          {universalSearch && ` para "${universalSearch}"`}
        </p>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      )}

      {!loading && sortedAtendimentos.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <FileText className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400">Nenhum atendimento encontrado.</p>
            {filterStatus !== "todos" && (
              <Button variant="link" className="mt-2 text-sm" onClick={() => { handleClearFilters(); fetchAtendimentos(false, 'todos'); }}>
                Limpar filtros e buscar todos
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {!loading && sortedAtendimentos.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {sortedAtendimentos.map((at) => {
            const status = (at.status_atendimento || '').toLowerCase();
            const alert = getAlertInfo(at);
            const isPendente = status === 'pendente';
            const isSolucionado = status === 'solucionado' || status === 'concluído' || status === 'concluido' || status === 'finalizado';
            const isCancelado = status === 'cancelado';

            let cardBorder = 'border-gray-200 dark:border-gray-800';
            let cardBg = '';
            let borderLeftColor = '#3b82f6';

            if (isPendente && alert?.type === 'old') {
              cardBorder = 'border-red-300 dark:border-red-800';
              cardBg = 'bg-red-50/50 dark:bg-red-950/20';
              borderLeftColor = '#ef4444';
            } else if (isPendente) {
              cardBorder = 'border-amber-200 dark:border-amber-900';
              cardBg = 'bg-amber-50/50 dark:bg-amber-950/20';
              borderLeftColor = '#f59e0b';
            } else if (isSolucionado) {
              borderLeftColor = '#10b981';
            } else if (isCancelado) {
              cardBg = 'bg-gray-50/50 dark:bg-gray-900/50';
              borderLeftColor = '#9ca3af';
            }

            return (
              <Card
                key={at.id}
                className={`cursor-pointer hover:shadow-lg transition-all border-l-4 ${cardBorder} ${cardBg}`}
                style={{ borderLeftColor }}
                onClick={() => openDetail(at)}
              >
                <CardContent className="p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
                      {formatDateTime(at.data_hora || at.created_at)}
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {alert && (
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-1.5 py-0 ${
                            alert.color === 'red'
                              ? 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/50 dark:text-red-300 dark:border-red-700 animate-pulse'
                              : 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/50 dark:text-blue-300 dark:border-blue-700'
                          }`}
                        >
                          {alert.type === 'old' ? <AlertTriangle className="w-2.5 h-2.5 mr-0.5 inline" /> : <Zap className="w-2.5 h-2.5 mr-0.5 inline" />}
                          {alert.label}
                        </Badge>
                      )}
                      <StatusBadge status={at.status_atendimento} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-1.5 truncate">
                      <User className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      {at.nome_cliente || '-'}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1.5">
                      <Wrench className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      {at.tipo_servico || '-'}
                    </p>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-gray-100 dark:border-gray-800">
                    <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                      <Hash className="w-3 h-3" />
                      {at.protocolo || '-'}
                    </div>
                    {at.placa && (
                      <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                        <Car className="w-3 h-3" />
                        {at.placa}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={(open) => { if (!open) handleCloseModal(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-500" />
              Detalhes do Atendimento
            </DialogTitle>
          </DialogHeader>

          {detailLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
            </div>
          )}

          {!detailLoading && selectedAtendimento && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Cliente</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{selectedAtendimento.nome_cliente || '-'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Documento</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{selectedAtendimento.documento_cliente || '-'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Placa</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{selectedAtendimento.placa || '-'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Veículo</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{selectedAtendimento.descricao_veiculo || '-'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Tipo de Serviço</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{selectedAtendimento.tipo_servico || '-'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Status</p>
                  <StatusBadge status={selectedAtendimento.status_atendimento} />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Protocolo</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{selectedAtendimento.protocolo || '-'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Data/Hora</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{formatDateTime(selectedAtendimento.data_hora || selectedAtendimento.created_at)}</p>
                </div>
              </div>

              {selectedAtendimento.observacoes && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Observações Originais</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800/60 p-3 rounded-lg border border-gray-200 dark:border-gray-700 whitespace-pre-wrap">
                    {selectedAtendimento.observacoes}
                  </p>
                </div>
              )}

              {(selectedAtendimento.imagens && selectedAtendimento.imagens.length > 0) && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Imagens</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedAtendimento.imagens.map((img, i) => (
                      <div
                        key={img.id || i}
                        className="w-20 h-20 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => setLightboxImage(img.url || img.caminho)}
                      >
                        <img
                          src={img.url || img.caminho}
                          alt={`Imagem ${i + 1}`}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.target.onerror = null;
                            e.target.style.display = 'none';
                            e.target.parentElement.classList.add('flex', 'items-center', 'justify-center', 'bg-gray-100', 'dark:bg-gray-800');
                            const span = document.createElement('span');
                            span.className = 'text-[10px] text-gray-400 text-center px-1';
                            span.textContent = 'Imagem indisponível';
                            e.target.parentElement.appendChild(span);
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(selectedAtendimento.data_hora_inicio_tratamento || selectedAtendimento.usuario_responsavel_tratamento) && (
                <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800">
                  <p className="text-xs font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wide mb-2">Informações do Tratamento</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {selectedAtendimento.data_hora_inicio_tratamento && (
                      <div className="space-y-0.5">
                        <p className="text-xs text-blue-500 dark:text-blue-400">Início do Tratamento</p>
                        <p className="text-sm font-semibold text-blue-800 dark:text-blue-200">{formatDateTime(selectedAtendimento.data_hora_inicio_tratamento)}</p>
                      </div>
                    )}
                    {selectedAtendimento.usuario_responsavel_tratamento && (
                      <div className="space-y-0.5">
                        <p className="text-xs text-blue-500 dark:text-blue-400">Responsável</p>
                        <p className="text-sm font-semibold text-blue-800 dark:text-blue-200">{selectedAtendimento.usuario_responsavel_tratamento}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="border-t border-gray-200 dark:border-gray-700 pt-5">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-blue-500" />
                  Tratamento
                </p>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Alterar Status</Label>
                    <Select value={treatmentStatus} onValueChange={setTreatmentStatus}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Cancelado">Cancelado</SelectItem>
                        <SelectItem value="Manter Pendente">Manter Pendente</SelectItem>
                        <SelectItem value="Solucionado">Solucionado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <ImagePlus className="w-4 h-4" />
                      Imagens
                      {treatmentStatus === "Solucionado" && (
                        <span className="text-xs text-red-500 font-normal">(obrigatório para Solucionado)</span>
                      )}
                    </Label>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {imagePreviews.map((preview, i) => (
                        <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                          <img src={preview} alt={`Preview ${i + 1}`} className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => handleRemoveImage(i)}
                            className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <label className="flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors text-sm text-gray-500 dark:text-gray-400">
                      <ImagePlus className="w-4 h-4" />
                      Selecionar imagens (JPEG, PNG, GIF, WebP - máx. 5MB)
                      <input
                        type="file"
                        multiple
                        accept="image/jpeg,image/png,image/gif,image/webp"
                        onChange={handleImageSelect}
                        className="hidden"
                      />
                    </label>
                  </div>

                  <div className="space-y-2">
                    <Label>Observação</Label>
                    <Textarea
                      placeholder="Descreva o tratamento realizado..."
                      value={treatmentObs}
                      onChange={(e) => setTreatmentObs(e.target.value)}
                      rows={3}
                    />
                  </div>
                </div>
              </div>

              {historico.length > 0 && (
                <div className="border-t border-gray-200 dark:border-gray-700 pt-5">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-blue-500" />
                    Histórico de Alterações
                  </p>
                  <div className="space-y-3">
                    {historico.map((entry, i) => (
                      <div key={entry.id || i} className="relative pl-6 pb-3 border-l-2 border-gray-200 dark:border-gray-700 last:border-l-0">
                        <div className="absolute left-[-5px] top-1 w-2.5 h-2.5 rounded-full bg-blue-500" />
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <StatusBadge status={entry.status_anterior} />
                            <ArrowRight className="w-3.5 h-3.5 text-gray-400" />
                            <StatusBadge status={entry.status_novo} />
                          </div>
                          <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                            <span className="flex items-center gap-1">
                              <User className="w-3 h-3" />
                              {entry.usuario || '-'}
                            </span>
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {formatDateTime(entry.data_hora || entry.created_at)}
                            </span>
                          </div>
                          {entry.observacao && (
                            <p className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/60 p-2 rounded mt-1">
                              {entry.observacao}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {!detailLoading && selectedAtendimento && (
            <DialogFooter>
              <Button variant="outline" onClick={handleCloseModal}>
                Cancelar
              </Button>
              <Button onClick={handleSaveTreatment} disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Salvar Tratamento
                  </>
                )}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {lightboxImage && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightboxImage(null)}
        >
          <button
            className="absolute top-4 right-4 p-2 rounded-full bg-white/20 text-white hover:bg-white/30 transition-colors"
            onClick={() => setLightboxImage(null)}
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={lightboxImage}
            alt="Imagem ampliada"
            className="max-w-full max-h-[90vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
            onError={(e) => {
              e.target.onerror = null;
              e.target.src = '';
              e.target.style.display = 'none';
              const div = document.createElement('div');
              div.className = 'text-white text-center p-8';
              div.innerHTML = '<p class="text-lg font-semibold">Imagem indisponível</p><p class="text-sm text-gray-300 mt-2">O arquivo não foi encontrado no servidor.</p>';
              e.target.parentElement.appendChild(div);
            }}
          />
        </div>
      )}
    </div>
  );
}