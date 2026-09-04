import { useState, useEffect, useRef } from "react";
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
  Loader2, User, Hash, Calendar, ImagePlus, X,
  ChevronDown, ChevronUp, ArrowRight, FileText, Shield,
  AlertTriangle, RefreshCw, Zap, PawPrint, MapPin
} from "lucide-react";
import { extractApiError } from "@/utils/apiError";
import {
  formatBomPetDateTime as formatDateTime,
  formatBomPetTime,
} from "@/utils/bomPetDate";

const API_BASE = '/api';
const AUTO_REFRESH_INTERVAL = 60000;
const ALERT_HOURS_OLD = 24;
const ALERT_HOURS_NEW = 2;

function getAuthHeaders() {
  const token = localStorage.getItem('accessToken');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

function formatMoney(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 'Não informado';
  return amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function getHoursAgo(dateStr) {
  if (!dateStr) return Infinity;
  return (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60);
}

function todayInSaoPaulo() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function formatDateOnly(value) {
  if (!value) return '-';
  const [year, month, day] = String(value).slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function erpSyncLabel(status) {
  const labels = {
    not_requested: 'Não solicitada',
    pending: 'Pendente',
    processing: 'Processando',
    confirmed: 'Confirmada',
    retryable_error: 'Aguardando reenvio',
    manual_review: 'Revisão manual',
    pending_homologation: 'Aguardando homologação',
  };
  return labels[status] || status || '-';
}

function StatusBadge({ status }) {
  if (!status) return null;
  const s = status.toLowerCase();
  let className = "";
  if (s === "pendente") {
    className = "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/50 dark:text-amber-300 dark:border-amber-700";
  } else if (s === "solucionado") {
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

export default function BomPetPainel() {
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
  const [filterPet, setFilterPet] = useState("");
  const [filterAtendente, setFilterAtendente] = useState("");

  const [universalSearch, setUniversalSearch] = useState("");

  const [selectedAtendimento, setSelectedAtendimento] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [historico, setHistorico] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);

  const [treatmentStatus, setTreatmentStatus] = useState("");
  const [treatmentObs, setTreatmentObs] = useState("");
  const [marcarFalecido, setMarcarFalecido] = useState(false);
  const [dataFalecimento, setDataFalecimento] = useState("");
  const [selectedImages, setSelectedImages] = useState([]);
  const [imagePreviews, setImagePreviews] = useState([]);
  const [saving, setSaving] = useState(false);
  const [syncingFalecimento, setSyncingFalecimento] = useState(false);

  const [lightboxImage, setLightboxImage] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);

  const refreshTimerRef = useRef(null);
  const detailBlobUrlsRef = useRef([]);

  function revokeDetailBlobs() {
    detailBlobUrlsRef.current.forEach(u => URL.revokeObjectURL(u));
    detailBlobUrlsRef.current = [];
  }

  // Imagens são servidas por endpoint autenticado; <img src> não envia o token,
  // então baixamos via fetch com Authorization e usamos blob URLs.
  async function loadImageBlobs(imagens) {
    return Promise.all((imagens || []).map(async (img) => {
      try {
        const res = await fetch(img.url, { headers: { ...getAuthHeaders() } });
        if (!res.ok) return { ...img, blobUrl: null };
        const blobUrl = URL.createObjectURL(await res.blob());
        detailBlobUrlsRef.current.push(blobUrl);
        return { ...img, blobUrl };
      } catch {
        return { ...img, blobUrl: null };
      }
    }));
  }

  useEffect(() => {
    async function fetchUser() {
      try {
        const res = await fetch(`${API_BASE}/auth/me`, { headers: { ...getAuthHeaders() } });
        if (res.ok) setCurrentUser(await res.json());
      } catch (e) { /* silencioso */ }
    }
    fetchUser();
  }, []);

  useEffect(() => { fetchAtendimentos(); }, []);

  useEffect(() => {
    refreshTimerRef.current = setInterval(() => fetchAtendimentos(true), AUTO_REFRESH_INTERVAL);
    return () => { if (refreshTimerRef.current) clearInterval(refreshTimerRef.current); };
  }, [filterStatus, filterDataInicio, filterDataFim, filterCliente, filterPet, filterAtendente]);

  useEffect(() => {
    return () => { imagePreviews.forEach(url => URL.revokeObjectURL(url)); };
  }, [imagePreviews]);

  async function fetchContadores() {
    try {
      const res = await fetch(`${API_BASE}/bom-pet/atendimentos/contadores`, { headers: { ...getAuthHeaders() } });
      if (res.ok) setCounts(await res.json());
    } catch (e) { /* silencioso */ }
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
        const digitsOnly = filterCliente.replace(/\D/g, '');
        if (digitsOnly.length >= 3 && /^\d+$/.test(digitsOnly) && digitsOnly.length <= 14 && digitsOnly === filterCliente.replace(/[.\-\s]/g, '')) {
          params.set('documento', digitsOnly);
        } else {
          params.set('nome', filterCliente);
        }
      }
      if (filterPet) params.set('pet', filterPet);
      if (filterAtendente) params.set('atendente', filterAtendente);

      const res = await fetch(`${API_BASE}/bom-pet/atendimentos?${params.toString()}`, { headers: { ...getAuthHeaders() } });
      if (!res.ok) {
        throw new Error(await extractApiError(res, 'Erro ao buscar atendimentos.'));
      }
      const data = await res.json();
      setAllAtendimentos(Array.isArray(data) ? data : []);
      setLastRefresh(new Date());
    } catch (err) {
      if (!silent) toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      if (!silent) setLoading(false);
    }
  }

  const userAgentType = currentUser?.agent?.agentType || currentUser?.agentType || '';
  const isRestrictedAgent = userAgentType === 'bom_pet_atendente';
  const currentUserIdentifier = currentUser?.agent?.email || currentUser?.email || '';

  const userAtendimentos = isRestrictedAgent && currentUserIdentifier
    ? allAtendimentos.filter(at => (at.usuario || '').toLowerCase() === currentUserIdentifier.toLowerCase())
    : allAtendimentos;

  const displayCounts = isRestrictedAgent ? {
    pendentes: userAtendimentos.filter(at => at.status_atendimento === 'Pendente').length,
    solucionados: userAtendimentos.filter(at => at.status_atendimento === 'Solucionado').length,
    cancelados: userAtendimentos.filter(at => at.status_atendimento === 'Cancelado').length,
    total: userAtendimentos.length,
  } : counts;

  const atendimentos = userAtendimentos.filter(at => {
    if (!universalSearch.trim()) return true;
    const q = universalSearch.trim().toLowerCase();
    const docQ = q.replace(/\D/g, '');
    return (at.nome_cliente || '').toLowerCase().includes(q)
      || (docQ && (at.documento_cliente || '').replace(/\D/g, '').includes(docQ))
      || (at.pet_nome || '').toLowerCase().includes(q)
      || (at.protocolo || '').toLowerCase().includes(q);
  });

  function handleClearFilters() {
    setFilterStatus("todos");
    setFilterDataInicio(""); setFilterDataFim("");
    setFilterCliente(""); setFilterPet(""); setFilterAtendente("");
    setUniversalSearch("");
  }

  const alertCounts = {
    old: userAtendimentos.filter(a => getAlertInfo(a)?.type === 'old').length,
    recent: userAtendimentos.filter(a => getAlertInfo(a)?.type === 'new').length,
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
    setMarcarFalecido(false);
    setDataFalecimento("");
    setSelectedImages([]);
    imagePreviews.forEach(url => URL.revokeObjectURL(url));
    setImagePreviews([]);

    try {
      const [detailRes, histRes] = await Promise.all([
        fetch(`${API_BASE}/bom-pet/atendimentos/${atendimento.id}`, { headers: { ...getAuthHeaders() } }),
        fetch(`${API_BASE}/bom-pet/atendimentos/${atendimento.id}/historico`, { headers: { ...getAuthHeaders() } }),
      ]);
      if (!detailRes.ok) throw new Error(await extractApiError(detailRes, 'Erro ao buscar detalhes do atendimento.'));
      const detail = await detailRes.json();
      revokeDetailBlobs();
      detail.imagens = await loadImageBlobs(detail.imagens);
      detail.comprovantes_pagamento = await loadImageBlobs(detail.comprovantes_pagamento);
      setSelectedAtendimento(detail);
      const currentStatus = detail.status_atendimento || 'Pendente';
      setTreatmentStatus(currentStatus.toLowerCase() === 'pendente' ? 'Manter Pendente' : currentStatus);
      if (histRes.ok) {
        const histData = await histRes.json();
        setHistorico(Array.isArray(histData) ? histData : []);
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
    setMarcarFalecido(false);
    setDataFalecimento("");
    imagePreviews.forEach(url => URL.revokeObjectURL(url));
    setSelectedImages([]);
    setImagePreviews([]);
    setLightboxImage(null);
    revokeDetailBlobs();
  }

  function handleImageSelect(e) {
    const files = Array.from(e.target.files || []);
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const maxSize = 5 * 1024 * 1024;
    const validFiles = [];
    const errors = [];
    for (const file of files) {
      if (!validTypes.includes(file.type)) { errors.push(`${file.name}: tipo não suportado.`); continue; }
      if (file.size > maxSize) { errors.push(`${file.name}: excede 5MB.`); continue; }
      validFiles.push(file);
    }
    if (errors.length > 0) {
      toast({ title: "Arquivos inválidos", description: errors.join('\n'), variant: "destructive" });
    }
    const totalAllowed = 10 - selectedImages.length;
    const filesToAdd = validFiles.slice(0, totalAllowed);
    if (validFiles.length > totalAllowed) {
      toast({ title: "Limite de imagens", description: `Máximo de 10 imagens.`, variant: "destructive" });
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

    const existingImages = selectedAtendimento.imagens?.length || 0;
    if (finalStatus.toLowerCase() === "solucionado" && selectedImages.length === 0 && existingImages === 0) {
      toast({
        title: "Comprovante obrigatório",
        description: "Para marcar como Solucionado, anexe o comprovante de remoção (imagem).",
        variant: "destructive",
      });
      return;
    }
    if (marcarFalecido && finalStatus.toLowerCase() !== "solucionado") {
      toast({ title: "Erro", description: "O pet só pode ser marcado como Falecido ao solucionar o atendimento.", variant: "destructive" });
      return;
    }
    if (marcarFalecido && !dataFalecimento) {
      toast({ title: "Data obrigatória", description: "Informe a Data de Falecimento do pet.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      if (selectedImages.length > 0) {
        const formData = new FormData();
        selectedImages.forEach(file => formData.append('imagens', file));
        const imgRes = await fetch(`${API_BASE}/bom-pet/atendimentos/${selectedAtendimento.id}/imagens`, {
          method: 'POST',
          headers: { ...getAuthHeaders() },
          body: formData,
        });
        if (!imgRes.ok) throw new Error(await extractApiError(imgRes, 'Erro ao enviar as imagens.'));
      }

      const res = await fetch(`${API_BASE}/bom-pet/atendimentos/${selectedAtendimento.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          status_atendimento: finalStatus,
          observacoes_tratamento: treatmentObs,
          marcar_pet_falecido: marcarFalecido,
          data_falecimento: marcarFalecido ? dataFalecimento : null,
        }),
      });
      if (!res.ok) {
        throw new Error(await extractApiError(res, 'Erro ao salvar tratamento.'));
      }
      const updated = await res.json();

      let successMessage = "Tratamento salvo com sucesso!";
      if (marcarFalecido) {
        const syncStatus = updated.erp_falecimento_sync?.status || updated.erp_falecimento_sync_status;
        if (syncStatus === "confirmed") {
          successMessage = "Tratamento salvo e Data de Falecimento confirmada no ERP.";
        } else if (syncStatus === "pending_homologation") {
          successMessage = "Falecimento registrado no Bom Flow; sincronização com o ERP aguardando homologação.";
        } else {
          successMessage = "Falecimento registrado no Bom Flow; sincronização com o ERP ficou pendente para revisão.";
        }
      }
      toast({ title: "Sucesso", description: successMessage });
      handleCloseModal();
      fetchAtendimentos();
    } catch (err) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleRetryPetDeathSync() {
    if (!selectedAtendimento?.id) return;
    setSyncingFalecimento(true);
    try {
      const res = await fetch(
        `${API_BASE}/bom-pet/atendimentos/${selectedAtendimento.id}/sincronizar-falecimento`,
        {
          method: 'POST',
          headers: { ...getAuthHeaders() },
        }
      );
      if (!res.ok) {
        throw new Error(await extractApiError(res, 'Erro ao sincronizar a Data de Falecimento.'));
      }
      const updated = await res.json();
      const syncStatus = updated.erp_falecimento_sync?.status || updated.erp_falecimento_sync_status;
      setSelectedAtendimento((current) => current ? { ...current, ...updated } : updated);

      const histRes = await fetch(
        `${API_BASE}/bom-pet/atendimentos/${selectedAtendimento.id}/historico`,
        { headers: { ...getAuthHeaders() } }
      );
      if (histRes.ok) {
        const histData = await histRes.json();
        setHistorico(Array.isArray(histData) ? histData : []);
      }
      await fetchAtendimentos(true);

      toast({
        title: syncStatus === 'confirmed' ? 'Sincronização confirmada' : 'Sincronização pendente',
        description: syncStatus === 'confirmed'
          ? 'A Data de Falecimento foi preenchida e confirmada no ERP.'
          : (updated.erp_falecimento_sync_error || 'O ERP não confirmou a alteração; consulte o detalhe para revisar.'),
        variant: syncStatus === 'confirmed' ? undefined : 'destructive',
      });
    } catch (err) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setSyncingFalecimento(false);
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
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-teal-600 to-emerald-500 shadow-lg">
            <PawPrint className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Painel Operacional</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">Bom Pet - Centro de Comando</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {lastRefresh && (
            <span className="text-[11px] text-gray-400 hidden sm:block">
              Atualizado {formatBomPetTime(lastRefresh)}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={() => fetchAtendimentos()} disabled={loading} className="gap-1.5">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Atualizar</span>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          ['Pendente', displayCounts.pendentes, Clock, 'amber', 'Pendentes'],
          ['Solucionado', displayCounts.solucionados, CheckCircle, 'emerald', 'Solucionados'],
          ['Cancelado', displayCounts.cancelados, XCircle, 'red', 'Cancelados'],
          ['todos', displayCounts.total, BarChart3, 'gray', 'Total'],
        ].map(([status, count, Icon, color, label]) => (
          <Card
            key={status}
            className={`cursor-pointer transition-all hover:shadow-md ${filterStatus === status ? `ring-2 ring-${color}-400 shadow-md` : ''}`}
            onClick={() => handleCounterClick(status)}
          >
            <CardContent className="p-3 md:p-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg bg-${color}-500/10 ring-1 ring-${color}-500/20`}>
                  <Icon className={`w-5 h-5 text-${color}-600 dark:text-${color}-400`} />
                </div>
                <div className="min-w-0">
                  <p className={`text-2xl md:text-3xl font-extrabold text-${color}-600 dark:text-${color}-400`}>{count}</p>
                  <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">{label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
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
          placeholder="Buscar por nome, CPF, pet ou protocolo..."
          value={universalSearch}
          onChange={(e) => setUniversalSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
          className="pl-10 h-11 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 shadow-sm"
        />
        {universalSearch && (
          <button onClick={() => setUniversalSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="w-3.5 h-3.5 text-gray-400" />
          </button>
        )}
      </div>

      <Card className="border-gray-200 dark:border-gray-800">
        <CardHeader className="cursor-pointer py-3 px-4" onClick={() => setFiltersOpen(!filtersOpen)}>
          <CardTitle className="flex items-center justify-between text-sm font-medium">
            <span className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
              <Filter className="w-3.5 h-3.5" />
              Filtros Avançados
              {(filterDataInicio || filterDataFim || filterCliente || filterPet || filterAtendente) && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Ativos</Badge>
              )}
            </span>
            {filtersOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </CardTitle>
        </CardHeader>
        {filtersOpen && (
          <CardContent className="pt-0 pb-4">
            <form onSubmit={(e) => { e.preventDefault(); fetchAtendimentos(); }} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
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
                  <Input type="date" value={filterDataInicio} onChange={(e) => setFilterDataInicio(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Data Fim</Label>
                  <Input type="date" value={filterDataFim} onChange={(e) => setFilterDataFim(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Cliente (Nome ou CPF)</Label>
                  <Input placeholder="Buscar por nome ou CPF..." value={filterCliente} onChange={(e) => setFilterCliente(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Pet</Label>
                  <Input placeholder="Nome do pet..." value={filterPet} onChange={(e) => setFilterPet(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Atendente</Label>
                  <Input placeholder="E-mail do atendente..." value={filterAtendente} onChange={(e) => setFilterAtendente(e.target.value)} />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button type="submit" disabled={loading} size="sm">
                  {loading ? (<><Loader2 className="w-4 h-4 animate-spin" />Buscando...</>) : (<><Search className="w-4 h-4" />Filtrar</>)}
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
          <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
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
            const isSolucionado = status === 'solucionado';
            const isCancelado = status === 'cancelado';

            let cardBorder = 'border-gray-200 dark:border-gray-800';
            let cardBg = '';
            let borderLeftColor = '#14b8a6';

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
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${
                          alert.color === 'red'
                            ? 'bg-red-100 text-red-700 border-red-300 animate-pulse'
                            : 'bg-blue-100 text-blue-700 border-blue-300'
                        }`}>
                          {alert.type === 'old' ? <AlertTriangle className="w-2.5 h-2.5 mr-0.5 inline" /> : <Zap className="w-2.5 h-2.5 mr-0.5 inline" />}
                          {alert.label}
                        </Badge>
                      )}
                      <StatusBadge status={at.status_atendimento} />
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {at.origem || 'Plano'}
                      </Badge>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-1.5 truncate">
                      <User className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      {at.nome_cliente || '-'}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1.5">
                      <PawPrint className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      {at.pet_nome || '-'}
                      {at.pet_falecido_marcado && (
                        <Badge variant="outline" className="bg-gray-200 text-gray-600 border-gray-400 text-[10px] px-1.5 py-0">Falecido</Badge>
                      )}
                    </p>
                    {at.usuario && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                        <Shield className="w-3 h-3 text-gray-400 flex-shrink-0" />
                        Atendente: {at.usuario}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-gray-100 dark:border-gray-800">
                    <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                      <Hash className="w-3 h-3" />
                      {at.protocolo || '-'}
                    </div>
                    {at.remocao_local && (
                      <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 truncate max-w-[45%]">
                        <MapPin className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{at.remocao_local}</span>
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
              <PawPrint className="w-5 h-5 text-teal-500" />
              Detalhes do Atendimento
            </DialogTitle>
          </DialogHeader>

          {detailLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-teal-500" />
            </div>
          )}

          {!detailLoading && selectedAtendimento && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  ['Origem', selectedAtendimento.origem || 'Plano'],
                  ['Cliente', selectedAtendimento.nome_cliente],
                  ['Documento', selectedAtendimento.documento_cliente],
                  ['Pet', selectedAtendimento.pet_descricao || selectedAtendimento.pet_nome],
                  ['Local da Remoção', selectedAtendimento.remocao_local],
                  ['Endereço da Remoção', selectedAtendimento.remocao_endereco],
                  ['Clínica Veterinária', selectedAtendimento.clinica_nome],
                  ['Parceiro Operacional', selectedAtendimento.parceiro_nome],
                  ['Telefone de Contato', selectedAtendimento.telefone_contato ? selectedAtendimento.telefone_contato.replace(/(\d{2})(\d{4,5})(\d{4})/, '($1) $2-$3') : '-'],
                  ['Contrato do Plano', selectedAtendimento.origem === 'Particular' ? 'Não se aplica' : (selectedAtendimento.contratos_servicos || 'Não informado')],
                  ['Situação Financeira', selectedAtendimento.origem === 'Particular' ? 'Não se aplica' : (selectedAtendimento.situacao_financeira || 'Não informado')],
                  ...(selectedAtendimento.origem === 'Particular'
                    ? [['Valor pago pelo cliente', selectedAtendimento.valor_pago_particular == null ? 'Não informado' : formatMoney(selectedAtendimento.valor_pago_particular)]]
                    : []),
                  ['Protocolo', selectedAtendimento.protocolo],
                  ['Data/Hora', formatDateTime(selectedAtendimento.data_hora || selectedAtendimento.created_at)],
                  ...(selectedAtendimento.pet_falecido_marcado ? [
                    ['Data de Falecimento', formatDateOnly(selectedAtendimento.pet_data_falecimento)],
                    ['Pessoa do Pet no ERP', selectedAtendimento.erp_pet_pessoa_codigo || '-'],
                    ['Sincronização ERP', erpSyncLabel(selectedAtendimento.erp_falecimento_sync_status)],
                  ] : []),
                ].map(([label, value]) => (
                  <div key={label} className="space-y-1">
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{value || '-'}</p>
                  </div>
                ))}
                <div className="space-y-1">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Status</p>
                  <StatusBadge status={selectedAtendimento.status_atendimento} />
                </div>
              </div>

              {selectedAtendimento.comprovante_pagamento_recebido && (
                <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800">
                  <p className="text-xs font-medium text-amber-700 dark:text-amber-300 uppercase tracking-wide mb-1">Comprovante de Pagamento Recebido</p>
                  <p className="text-sm text-amber-800 dark:text-amber-200">
                    {selectedAtendimento.comprovante_pagamento_obs || 'Comprovante anexado ao atendimento.'}
                  </p>
                  {selectedAtendimento.comprovantes_pagamento?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {selectedAtendimento.comprovantes_pagamento.map((arquivo, index) => (
                        <a
                          key={arquivo.id || index}
                          href={arquivo.blobUrl || '#'}
                          target="_blank"
                          rel="noreferrer"
                          download={arquivo.original_name}
                          className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                        >
                          {arquivo.original_name || `Comprovante ${index + 1}`}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}

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
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Comprovantes de Remoção</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedAtendimento.imagens.map((img, i) => (
                      <div
                        key={img.id || i}
                        className="w-20 h-20 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 cursor-pointer hover:opacity-80"
                        onClick={() => img.blobUrl && setLightboxImage(img.blobUrl)}
                      >
                        {img.blobUrl ? (
                          <img src={img.blobUrl} alt={`Imagem ${i + 1}`} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-800">
                            <span className="text-[10px] text-gray-400 text-center px-1">Imagem indisponível</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(selectedAtendimento.data_hora_inicio_tratamento || selectedAtendimento.usuario_responsavel_tratamento) && (
                <div className="p-3 rounded-lg bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800">
                  <p className="text-xs font-medium text-teal-600 dark:text-teal-400 uppercase tracking-wide mb-2">Informações do Tratamento</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {selectedAtendimento.data_hora_inicio_tratamento && (
                      <div className="space-y-0.5">
                        <p className="text-xs text-teal-500">Início do Tratamento</p>
                        <p className="text-sm font-semibold text-teal-800 dark:text-teal-200">{formatDateTime(selectedAtendimento.data_hora_inicio_tratamento)}</p>
                      </div>
                    )}
                    {selectedAtendimento.usuario_responsavel_tratamento && (
                      <div className="space-y-0.5">
                        <p className="text-xs text-teal-500">Responsável</p>
                        <p className="text-sm font-semibold text-teal-800 dark:text-teal-200">{selectedAtendimento.usuario_responsavel_tratamento}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="border-t border-gray-200 dark:border-gray-700 pt-5">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-teal-500" />
                  Tratamento
                </p>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Alterar Status</Label>
                    <Select value={treatmentStatus} onValueChange={setTreatmentStatus}>
                      <SelectTrigger><SelectValue placeholder="Selecione o status" /></SelectTrigger>
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
                      Comprovante de Remoção (imagens)
                      {treatmentStatus === "Solucionado" && (
                        <span className="text-xs text-red-500 font-normal">(obrigatório para Solucionado)</span>
                      )}
                    </Label>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {imagePreviews.map((preview, i) => (
                        <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                          <img src={preview} alt={`Preview ${i + 1}`} className="w-full h-full object-cover" />
                          <button type="button" onClick={() => handleRemoveImage(i)} className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-red-500 text-white hover:bg-red-600">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <label className="flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 cursor-pointer hover:border-teal-400 transition-colors text-sm text-gray-500">
                      <ImagePlus className="w-4 h-4" />
                      Selecionar imagens (JPEG, PNG, GIF, WebP - máx. 5MB)
                      <input type="file" multiple accept="image/jpeg,image/png,image/gif,image/webp" onChange={handleImageSelect} className="hidden" />
                    </label>
                  </div>

                  {treatmentStatus === "Solucionado" && selectedAtendimento.origem !== 'Particular' && !selectedAtendimento.pet_falecido_marcado && (
                    <div className="space-y-3 rounded-xl border border-border bg-background/70 p-3">
                      <label className="flex items-start gap-2 text-sm font-medium text-foreground cursor-pointer">
                        <input
                          type="checkbox"
                          checked={marcarFalecido}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setMarcarFalecido(checked);
                            if (checked && !dataFalecimento) setDataFalecimento(todayInSaoPaulo());
                          }}
                          className="mt-0.5 w-4 h-4 accent-teal-600"
                        />
                        <span>
                          Marcar pet como Falecido
                          <span className="block mt-0.5 text-xs font-normal text-muted-foreground">
                            Registra no Bom Flow e sincroniza a Data de Falecimento da Pessoa do pet no ERP.
                          </span>
                        </span>
                      </label>
                      {marcarFalecido && (
                        <div className="space-y-1.5 pl-6">
                          <Label htmlFor="bom-pet-data-falecimento" className="flex items-center gap-2 text-xs">
                            <Calendar className="h-3.5 w-3.5 text-primary" />
                            Data de Falecimento
                          </Label>
                          <Input
                            id="bom-pet-data-falecimento"
                            type="date"
                            value={dataFalecimento}
                            max={todayInSaoPaulo()}
                            onChange={(e) => setDataFalecimento(e.target.value)}
                            className="eloom-field w-full"
                            required
                          />
                        </div>
                      )}
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>Observação</Label>
                    <Textarea placeholder="Descreva o tratamento realizado..." value={treatmentObs} onChange={(e) => setTreatmentObs(e.target.value)} rows={3} />
                  </div>
                </div>
              </div>

              {selectedAtendimento.origem !== 'Particular'
                && selectedAtendimento.pet_falecido_marcado
                && selectedAtendimento.erp_falecimento_sync_status !== 'confirmed' && (
                <div className="flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50/70 p-4 dark:border-amber-800 dark:bg-amber-950/30 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                      Sincronização ERP pendente
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Estado atual: {erpSyncLabel(selectedAtendimento.erp_falecimento_sync_status)}.
                      {selectedAtendimento.erp_falecimento_sync_error
                        ? ` ${selectedAtendimento.erp_falecimento_sync_error}`
                        : ' Reenvie para validar e confirmar a Data de Falecimento.'}
                    </p>
                  </div>
                  <Button
                    type="button"
                    className="action-pill-primary h-10 shrink-0 px-4 text-sm"
                    onClick={handleRetryPetDeathSync}
                    disabled={saving || syncingFalecimento}
                  >
                    {syncingFalecimento
                      ? <><Loader2 className="h-4 w-4 animate-spin" />Sincronizando...</>
                      : <><RefreshCw className="action-pill-icon h-4 w-4" />Sincronizar com o ERP</>}
                  </Button>
                </div>
              )}

              {historico.length > 0 && (
                <div className="border-t border-gray-200 dark:border-gray-700 pt-5">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-teal-500" />
                    Histórico de Alterações
                  </p>
                  <div className="space-y-3">
                    {historico.map((entry, i) => (
                      <div key={entry.id || i} className="relative pl-6 pb-3 border-l-2 border-gray-200 dark:border-gray-700 last:border-l-0">
                        <div className="absolute left-[-5px] top-1 w-2.5 h-2.5 rounded-full bg-teal-500" />
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <StatusBadge status={entry.status_anterior} />
                            <ArrowRight className="w-3.5 h-3.5 text-gray-400" />
                            <StatusBadge status={entry.status_novo} />
                          </div>
                          <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                            <span className="flex items-center gap-1"><User className="w-3 h-3" />{entry.usuario || '-'}</span>
                            <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{formatDateTime(entry.data_hora || entry.created_at)}</span>
                          </div>
                          {entry.observacao && (
                            <p className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/60 p-2 rounded mt-1">{entry.observacao}</p>
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
              <Button variant="outline" onClick={handleCloseModal}>Cancelar</Button>
              <Button onClick={handleSaveTreatment} disabled={saving}>
                {saving ? (<><Loader2 className="w-4 h-4 animate-spin" />Salvando...</>) : (<><CheckCircle className="w-4 h-4" />Salvar Tratamento</>)}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {lightboxImage && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4" onClick={() => setLightboxImage(null)}>
          <button className="absolute top-4 right-4 p-2 rounded-full bg-white/20 text-white hover:bg-white/30" onClick={() => setLightboxImage(null)}>
            <X className="w-6 h-6" />
          </button>
          <img src={lightboxImage} alt="Imagem ampliada" className="max-w-full max-h-[90vh] object-contain rounded-lg" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
