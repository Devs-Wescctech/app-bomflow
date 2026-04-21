import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Search, Filter, Loader2, Users, ChevronDown, ChevronUp,
  AlertTriangle, Phone, MapPin, Package, FileText,
  MessageSquare, CheckCircle2, XCircle, Send, X, RefreshCw,
  Lock, Clock, ShieldAlert, RotateCcw, BarChart3
} from "lucide-react";
import { toast } from "sonner";
import LeadGeneratorDashboard from "./LeadGeneratorDashboard";
import LeadGeneratorLogEstruturado from "./LeadGeneratorLogEstruturado";

const API_BASE = '/api';
const MAX_LEADS = 1200;

function getAuthHeaders() {
  const token = localStorage.getItem('accessToken');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

const DISPATCH_FORBIDDEN_TYPES = ['vendas', 'sales', 'bom_auto_atendente', 'support', 'collection', 'pre_sales', 'post_sales'];

export default function LeadGenerator() {
  const [activeTab, setActiveTab] = useState("gerador");
  const [leads, setLeads] = useState([]);
  const [totalFound, setTotalFound] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [hasSearched, setHasSearched] = useState(false);

  const [filterOptions, setFilterOptions] = useState({
    canal: [], cidade: [], uf: [], produto: [], situacao_contrato: [],
  });

  const [filters, setFilters] = useState({
    canal: "todos", cidade: "todos", uf: "todos", produto: "todos", situacao_contrato: "todos", tempoAtivo: "todos",
    dataContratoInicio: "", dataContratoFim: "",
  });

  const [selectedLeads, setSelectedLeads] = useState(new Set());
  const [validationProgress, setValidationProgress] = useState(null);
  const [validationJobId, setValidationJobId] = useState(null);
  const validationJobIdRef = useRef(null);
  const validationLeadsRef = useRef([]);
  const validationPollRef = useRef(null);
  const validationCancelRef = useRef(false);
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showResultDialog, setShowResultDialog] = useState(false);
  const [currentBatchId, setCurrentBatchId] = useState(null);
  const [queueStatus, setQueueStatus] = useState(null);
  const [enqueueSummary, setEnqueueSummary] = useState(null);
  const [leadStatuses, setLeadStatuses] = useState({});
  const [pollingTimeout, setPollingTimeout] = useState(false);
  const pollingRef = useRef(null);
  const pollingCountRef = useRef(0);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const currentAgentType = user?.agent?.agentType || user?.agent?.agent_type || '';
  const canDispatch = !DISPATCH_FORBIDDEN_TYPES.includes(currentAgentType);
  const canViewDashboard = canDispatch;

  const allowedSubmenus = user?.agent?.allowedSubmenus || [];
  const hasSubmenuRestrictions = allowedSubmenus.length > 0;
  const isAdmin = user?.role === 'admin' || currentAgentType === 'admin';
  const canViewLogEstruturado = isAdmin || (hasSubmenuRestrictions ? allowedSubmenus.includes('LeadGeneratorLogEstruturado') : canViewDashboard);

  useEffect(() => {
    loadFilterOptions();
  }, []);

  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (validationPollRef.current) clearInterval(validationPollRef.current);
    };
  }, []);

  // Restaura job de validação ativo após reload/reabertura da aba.
  useEffect(() => {
    try {
      const raw = localStorage.getItem('leadGenerator:validationJob');
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!saved?.jobId || !Array.isArray(saved?.leads)) return;
      validationLeadsRef.current = saved.leads;
      setHasSearched(true);
      setLoading(true);
      setValidationProgress({
        processed: 0,
        total: saved.leads.length,
        validFound: 0,
        target: MAX_LEADS,
      });
      pollValidationJob(saved.jobId);
    } catch (e) {
      console.warn('Falha ao restaurar job de validação:', e);
      try { localStorage.removeItem('leadGenerator:validationJob'); } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function clearValidationJobStorage() {
    try { localStorage.removeItem('leadGenerator:validationJob'); } catch {}
  }

  function finishValidation(jobView, { silent = false } = {}) {
    if (validationPollRef.current) {
      clearInterval(validationPollRef.current);
      validationPollRef.current = null;
    }
    const validPhones = Array.isArray(jobView?.validPhones) ? jobView.validPhones : [];
    const validSet = new Set(validPhones);
    const baseLeads = validationLeadsRef.current || [];

    const matched = [];
    const matchedKeys = new Set();
    for (const lead of baseLeads) {
      const clean = normalizeLeadPhone(lead.number);
      if (clean && validSet.has(clean) && !matchedKeys.has(clean)) {
        matched.push(lead);
        matchedKeys.add(clean);
        if (matched.length >= MAX_LEADS) break;
      }
    }

    setLeads(matched);
    setTotalFound(matched.length);
    setValidationProgress(null);
    setValidationJobId(null);
    validationJobIdRef.current = null;
    validationLeadsRef.current = [];
    validationCancelRef.current = false;
    setLoading(false);
    clearValidationJobStorage();

    if (silent) return;
    if (jobView?.status === 'cancelled') {
      toast.info(`Validação cancelada. ${matched.length} números válidos encontrados até o momento.`);
    } else if (jobView?.status === 'error') {
      toast.error(`Erro durante a validação: ${jobView?.error || 'desconhecido'}`);
    } else if (matched.length === 0) {
      toast.warning('Nenhum número com WhatsApp ativo foi encontrado nesta busca.');
    } else if (matched.length < MAX_LEADS) {
      toast.warning(`Encontrados ${matched.length} números com WhatsApp ativo (alvo: ${MAX_LEADS}). A base do ERP foi esgotada.`);
    } else {
      toast.success(`${matched.length} números com WhatsApp ativo prontos para disparo.`);
    }
  }

  function pollValidationJob(jobId) {
    setValidationJobId(jobId);
    validationJobIdRef.current = jobId;
    if (validationPollRef.current) clearInterval(validationPollRef.current);

    const tick = async () => {
      if (validationJobIdRef.current !== jobId) return;
      try {
        const res = await fetch(`${API_BASE}/functions/validate-whatsapp-job/${jobId}`, {
          headers: { ...getAuthHeaders() },
        });
        if (res.status === 404) {
          if (validationPollRef.current) clearInterval(validationPollRef.current);
          validationPollRef.current = null;
          clearValidationJobStorage();
          setValidationJobId(null);
          validationJobIdRef.current = null;
          setValidationProgress(null);
          setLoading(false);
          toast.error('A sessão de validação expirou ou foi removida.');
          return;
        }
        if (!res.ok) return;
        const data = await res.json();

        setValidationProgress({
          processed: data.processed || 0,
          total: data.total || 0,
          validFound: data.validFound || 0,
          target: data.target || MAX_LEADS,
        });

        if (data.finished) {
          finishValidation(data, { silent: validationCancelRef.current && data.status !== 'cancelled' });
        }
      } catch (e) {
        console.error('[LeadGenerator] poll validation job failed', e);
      }
    };

    tick();
    validationPollRef.current = setInterval(tick, 1500);
  }

  async function handleCancelValidation() {
    const jobId = validationJobIdRef.current;
    if (!jobId) return;
    validationCancelRef.current = true;
    try {
      await fetch(`${API_BASE}/functions/validate-whatsapp-job/${jobId}/cancel`, {
        method: 'POST',
        headers: { ...getAuthHeaders() },
      });
      toast.info('Cancelamento solicitado...');
    } catch (e) {
      console.error('[LeadGenerator] cancel failed', e);
      toast.error('Erro ao solicitar cancelamento.');
    }
  }

  function normalizeLeadPhone(phone) {
    if (!phone) return '';
    let cleaned = String(phone).replace(/\D/g, '');
    if (cleaned.length === 0) return '';
    if (!cleaned.startsWith('55') && (cleaned.length === 10 || cleaned.length === 11)) {
      cleaned = '55' + cleaned;
    }
    return cleaned;
  }

  async function loadFilterOptions(forceRefresh = false) {
    setLoadingOptions(true);
    try {
      const url = forceRefresh
        ? `${API_BASE}/functions/lead-generator-options?refresh=true`
        : `${API_BASE}/functions/lead-generator-options`;
      const res = await fetch(url, { headers: { ...getAuthHeaders() } });
      if (!res.ok) throw new Error(`Erro ao carregar opções (${res.status})`);
      const data = await res.json();
      if (data.success === false) throw new Error(data.error || 'Erro desconhecido');

      const opts = {
        canal: Array.isArray(data.canal) ? data.canal : [],
        cidade: Array.isArray(data.cidade) ? data.cidade : [],
        uf: Array.isArray(data.uf) ? data.uf : [],
        produto: Array.isArray(data.produto) ? data.produto : [],
        situacao_contrato: Array.isArray(data.situacao_contrato) ? data.situacao_contrato : [],
      };
      setFilterOptions(opts);

      const totalOpts = opts.canal.length + opts.cidade.length + opts.uf.length + opts.produto.length + opts.situacao_contrato.length;
      if (totalOpts < 5 && !forceRefresh) {
        toast.info('Poucas opções carregadas. Clique em "Recarregar Filtros" para atualizar.');
      }
      if (forceRefresh) {
        toast.success(`Filtros recarregados: ${opts.canal.length} canais, ${opts.cidade.length} cidades, ${opts.uf.length} UFs, ${opts.produto.length} produtos`);
      }
    } catch (e) {
      console.error('Erro ao carregar opções de filtro:', e);
      toast.error('Erro ao carregar opções de filtro. Tente recarregar a página.');
    } finally {
      setLoadingOptions(false);
    }
  }

  async function handleSearch(e) {
    e?.preventDefault();
    setLoading(true);
    setHasSearched(true);
    setSelectedLeads(new Set());
    setLeadStatuses({});
    setEnqueueSummary(null);
    setQueueStatus(null);
    setCurrentBatchId(null);
    try {
      const params = new URLSearchParams();
      if (filters.canal !== 'todos') params.set('canal', filters.canal);
      if (filters.cidade !== 'todos') params.set('cidade', filters.cidade);
      if (filters.uf !== 'todos') params.set('uf', filters.uf);
      if (filters.produto !== 'todos') params.set('produto', filters.produto);
      if (filters.situacao_contrato !== 'todos') params.set('situacao_contrato', filters.situacao_contrato);
      if (filters.dataContratoInicio) params.set('data_contrato_inicio', filters.dataContratoInicio);
      if (filters.dataContratoFim) params.set('data_contrato_fim', filters.dataContratoFim);
      if (filters.tempoAtivo !== 'todos') {
        const faixas = {
          '0-180': { min: 0, max: 180 },
          '181-365': { min: 181, max: 365 },
          '366-730': { min: 366, max: 730 },
          '731-1095': { min: 731, max: 1095 },
          '1096-1825': { min: 1096, max: 1825 },
          '1826+': { min: 1826 },
        };
        const faixa = faixas[filters.tempoAtivo];
        if (faixa) {
          if (faixa.min !== undefined) params.set('tempoAtivoMin', String(faixa.min));
          if (faixa.max !== undefined) params.set('tempoAtivoMax', String(faixa.max));
        }
      }

      const res = await fetch(`${API_BASE}/functions/lead-generator-base?${params.toString()}`, {
        headers: { ...getAuthHeaders() },
      });
      if (!res.ok) throw new Error('Erro ao buscar leads');
      const data = await res.json();
      const allData = Array.isArray(data) ? data : [];

      const seen = new Set();
      const dedupedData = [];
      for (const lead of allData) {
        const clean = normalizeLeadPhone(lead.number);
        if (!clean || seen.has(clean)) continue;
        seen.add(clean);
        dedupedData.push(lead);
      }

      setTotalFound(dedupedData.length);

      if (dedupedData.length === 0) {
        toast.warning('Nenhum lead encontrado para os filtros selecionados.');
        setLoading(false);
        return;
      }

      // Validação assíncrona: dispara um job no backend e faz polling do status.
      validationLeadsRef.current = dedupedData;
      validationCancelRef.current = false;
      const phones = dedupedData.map(l => normalizeLeadPhone(l.number)).filter(Boolean);

      setValidationProgress({
        processed: 0,
        total: dedupedData.length,
        validFound: 0,
        target: MAX_LEADS,
      });

      const startRes = await fetch(`${API_BASE}/functions/validate-whatsapp-job`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ phones, target: MAX_LEADS }),
      });
      if (!startRes.ok) {
        const err = await startRes.json().catch(() => ({}));
        throw new Error(err.error || `Erro ao iniciar validação (${startRes.status})`);
      }
      const startJson = await startRes.json();
      const jobId = startJson.jobId;
      if (!jobId) throw new Error('Resposta inválida ao iniciar validação');

      try {
        const slimLeads = dedupedData.map(l => ({ ...l }));
        localStorage.setItem('leadGenerator:validationJob', JSON.stringify({
          jobId,
          leads: slimLeads,
          startedAt: Date.now(),
        }));
      } catch (e) {
        console.warn('Não foi possível salvar progresso da validação localmente:', e);
      }

      pollValidationJob(jobId);
    } catch (err) {
      console.error('Erro ao buscar leads:', err);
      toast.error('Erro ao buscar leads: ' + err.message);
      setValidationProgress(null);
      setLoading(false);
    }
  }

  function handleClearFilters() {
    if (validationJobIdRef.current) {
      handleCancelValidation();
    }
    if (validationPollRef.current) {
      clearInterval(validationPollRef.current);
      validationPollRef.current = null;
    }
    setValidationJobId(null);
    validationJobIdRef.current = null;
    validationLeadsRef.current = [];
    validationCancelRef.current = false;
    setValidationProgress(null);
    setLoading(false);
    clearValidationJobStorage();
    setFilters({ canal: "todos", cidade: "todos", uf: "todos", produto: "todos", situacao_contrato: "todos", tempoAtivo: "todos", dataContratoInicio: "", dataContratoFim: "" });
    setLeads([]);
    setTotalFound(0);
    setHasSearched(false);
    setSelectedLeads(new Set());
    setLeadStatuses({});
    setEnqueueSummary(null);
    setQueueStatus(null);
    setCurrentBatchId(null);
  }

  const hasActiveFilters = Object.values(filters).some(v => v !== "todos");

  const toggleSelectAll = useCallback(() => {
    if (selectedLeads.size === leads.length) {
      setSelectedLeads(new Set());
    } else {
      setSelectedLeads(new Set(leads.map((_, i) => i)));
    }
  }, [leads, selectedLeads.size]);

  const selectFirstN = useCallback((n) => {
    const count = Math.min(n, leads.length);
    const indices = new Set();
    for (let i = 0; i < count; i++) indices.add(i);
    setSelectedLeads(indices);
  }, [leads]);

  const toggleSelectLead = useCallback((index) => {
    setSelectedLeads(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const selectedLeadsList = useMemo(() => {
    return Array.from(selectedLeads).map(i => leads[i]).filter(Boolean);
  }, [selectedLeads, leads]);

  const leadsWithNumber = useMemo(() => {
    return selectedLeadsList.filter(l => l.number);
  }, [selectedLeadsList]);

  function handleWhatsAppClick() {
    if (leadsWithNumber.length === 0) {
      toast.error('Nenhum lead selecionado com número de telefone válido.');
      return;
    }
    setShowConfirmDialog(true);
  }

  function startPolling(batchId) {
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingCountRef.current = 0;
    setPollingTimeout(false);

    pollingRef.current = setInterval(async () => {
      pollingCountRef.current += 1;

      if (pollingCountRef.current >= 300) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
        setSendingWhatsApp(false);
        setPollingTimeout(true);
        return;
      }

      try {
        const res = await fetch(`${API_BASE}/functions/lead-generator-queue-status/${batchId}`, {
          headers: { ...getAuthHeaders() },
        });
        if (!res.ok) return;
        const data = await res.json();

        setQueueStatus(data);

        const statusMap = {};
        if (data.enviado > 0 || data.falha > 0 || data.bloqueado_30_dias > 0 || data.bloqueado_duplicidade > 0) {
          const logsRes = await fetch(`${API_BASE}/functions/lead-generator-whatsapp-logs-list?limit=1000&page=1&batchId=${batchId}`, {
            headers: { ...getAuthHeaders() },
          });
          if (logsRes.ok) {
            const logsData = await logsRes.json();
            if (logsData.data) {
              logsData.data.forEach(log => {
                statusMap[String(log.lead_number)] = {
                  success: log.success,
                  statusEnvio: log.status_envio,
                  messageSentId: log.message_sent_id,
                  motivo: log.motivo_bloqueio,
                };
              });
            }
          }
        }
        setLeadStatuses(prev => ({ ...prev, ...statusMap }));

        if (data.isComplete) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
          setSendingWhatsApp(false);
          setShowResultDialog(true);

          if (data.enviado > 0) {
            toast.success(`${data.enviado} mensagen${data.enviado !== 1 ? 's' : ''} enviada${data.enviado !== 1 ? 's' : ''} com sucesso!`);
          }
          if (data.falha > 0) {
            toast.error(`${data.falha} mensagen${data.falha !== 1 ? 's' : ''} falharam.`);
          }
        }
      } catch (err) {
        console.error('[Polling] Error:', err);
      }
    }, 2000);
  }

  async function handleConfirmSend() {
    setShowConfirmDialog(false);
    setSendingWhatsApp(true);
    setQueueStatus(null);
    setEnqueueSummary(null);

    try {
      const res = await fetch(`${API_BASE}/functions/lead-generator-whatsapp-send`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leads: leadsWithNumber.map(l => ({ number: l.number, name: l.name, lead_id: l.lead_id || null })),
          filtersUsed: filters,
        }),
      });

      if (res.status === 403) {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData.error || 'Você não tem permissão para realizar disparos.');
        setSendingWhatsApp(false);
        return;
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Erro HTTP ${res.status}`);
      }

      const data = await res.json();
      setCurrentBatchId(data.batchId);
      setEnqueueSummary(data.summary);

      startPolling(data.batchId);
    } catch (err) {
      console.error('Erro ao disparar WhatsApp:', err);
      toast.error('Erro ao disparar mensagens: ' + err.message);
      setSendingWhatsApp(false);
    }
  }

  async function handleRetryFailed() {
    if (!currentBatchId) return;
    setSendingWhatsApp(true);

    try {
      const res = await fetch(`${API_BASE}/functions/lead-generator-whatsapp-retry`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId: currentBatchId }),
      });

      if (res.status === 403) {
        toast.error('Você não tem permissão para reenviar disparos.');
        setSendingWhatsApp(false);
        return;
      }

      if (!res.ok) throw new Error('Erro ao reenviar');

      const data = await res.json();
      toast.info(`Reenvio iniciado: ${data.retried} leads em fila, ${data.blocked} bloqueados.`);

      if (data.retried > 0) {
        startPolling(currentBatchId);
      } else {
        setSendingWhatsApp(false);
      }
    } catch (err) {
      console.error('Erro ao reenviar:', err);
      toast.error('Erro ao reenviar: ' + err.message);
      setSendingWhatsApp(false);
    }
  }

  const situacaoLabel = (s) => {
    if (!s) return '-';
    switch (s.toUpperCase()) {
      case 'A': return 'Ativo';
      case 'C': return 'Cancelado';
      case 'S': return 'Suspenso';
      default: return s;
    }
  };

  const situacaoColor = (s) => {
    if (!s) return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
    switch (s.toUpperCase()) {
      case 'A': return 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/50 dark:text-emerald-300';
      case 'C': return 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/50 dark:text-red-300';
      case 'S': return 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/50 dark:text-amber-300';
      default: return 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/50 dark:text-blue-300';
    }
  };

  const getLeadStatusDisplay = (lead) => {
    if (!lead.number) return null;
    const status = leadStatuses[String(lead.number).replace(/\D/g, '')] || leadStatuses[String(lead.number)];
    if (!status) return null;
    return status;
  };

  const renderStatusIcon = (status) => {
    if (!status) return <span className="text-gray-300 dark:text-gray-600">—</span>;

    switch (status.statusEnvio) {
      case 'enviado':
        return (
          <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400" title={status.messageSentId ? `ID: ${status.messageSentId}` : 'Enviado'}>
            <CheckCircle2 className="w-4 h-4" />
            <span className="text-xs">Enviado</span>
          </div>
        );
      case 'falha':
      case 'reenvio_agendado':
        return (
          <div className="flex items-center gap-1.5 text-red-500 dark:text-red-400" title="Falha no envio">
            <XCircle className="w-4 h-4" />
            <span className="text-xs">Falha</span>
          </div>
        );
      case 'bloqueado_30_dias':
        return (
          <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400" title={status.motivo || 'Bloqueado - 30 dias'}>
            <Lock className="w-4 h-4" />
            <span className="text-xs">Bloqueado</span>
          </div>
        );
      case 'bloqueado_duplicidade':
        return (
          <div className="flex items-center gap-1.5 text-orange-500 dark:text-orange-400" title={status.motivo || 'Duplicidade diária'}>
            <ShieldAlert className="w-4 h-4" />
            <span className="text-xs">Duplicado</span>
          </div>
        );
      case 'enviando':
        return (
          <div className="flex items-center gap-1.5 text-blue-500 dark:text-blue-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-xs">Enviando</span>
          </div>
        );
      case 'pendente':
        return (
          <div className="flex items-center gap-1.5 text-gray-400 dark:text-gray-500">
            <Clock className="w-4 h-4" />
            <span className="text-xs">Na fila</span>
          </div>
        );
      default:
        if (status.success) {
          return (
            <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
              <CheckCircle2 className="w-4 h-4" />
              <span className="text-xs">Enviado</span>
            </div>
          );
        }
        return (
          <div className="flex items-center gap-1.5 text-red-500 dark:text-red-400">
            <XCircle className="w-4 h-4" />
            <span className="text-xs">Falha</span>
          </div>
        );
    }
  };

  const progressPercent = useMemo(() => {
    if (!queueStatus || queueStatus.total === 0) return 0;
    return Math.round((queueStatus.processed / queueStatus.total) * 100);
  }, [queueStatus]);

  const hasFailures = queueStatus && (queueStatus.falha > 0 || queueStatus.reenvio_agendado > 0);

  const showTabs = canViewDashboard || canViewLogEstruturado;

  const availableTabs = [];
  availableTabs.push({ value: "gerador", label: "Gerador", icon: Users });
  if (canViewDashboard) availableTabs.push({ value: "painel", label: "Painel de Disparos", icon: BarChart3 });
  if (canViewLogEstruturado) availableTabs.push({ value: "log", label: "Log Estruturado", icon: FileText });

  return (
    <div className="p-4 md:p-6 space-y-6 bg-gray-50 dark:bg-gray-950 min-h-screen">
      {showTabs ? (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className={`grid w-full max-w-lg ${availableTabs.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
            {availableTabs.map(tab => (
              <TabsTrigger key={tab.value} value={tab.value} className="gap-2">
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="gerador">
            {renderGeneratorContent()}
          </TabsContent>

          {canViewDashboard && (
            <TabsContent value="painel">
              <LeadGeneratorDashboard />
            </TabsContent>
          )}

          {canViewLogEstruturado && (
            <TabsContent value="log">
              <LeadGeneratorLogEstruturado />
            </TabsContent>
          )}
        </Tabs>
      ) : (
        renderGeneratorContent()
      )}
    </div>
  );

  function renderGeneratorContent() {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 shadow-lg">
                <Users className="w-5 h-5 text-white" />
              </div>
              Gerador de Leads
            </CardTitle>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Consulte a base do ERP e gere leads filtrados por canal, cidade, UF, produto e situação.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <button
                type="button"
                onClick={() => setFiltersOpen(!filtersOpen)}
                className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
              >
                <Filter className="w-4 h-4" />
                Filtros
                {filtersOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                {hasActiveFilters && (
                  <Badge variant="secondary" className="ml-1 text-xs">
                    {Object.values(filters).filter(v => v !== "todos").length}
                  </Badge>
                )}
              </button>
            </div>

            {filtersOpen && (
              <form onSubmit={handleSearch} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Canal</Label>
                    <Select value={filters.canal} onValueChange={(val) => setFilters({ ...filters, canal: val })}>
                      <SelectTrigger className="border-gray-200 dark:border-gray-700"><SelectValue placeholder="Todos" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos</SelectItem>
                        {filterOptions.canal.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Cidade</Label>
                    <Select value={filters.cidade} onValueChange={(val) => setFilters({ ...filters, cidade: val })}>
                      <SelectTrigger className="border-gray-200 dark:border-gray-700"><SelectValue placeholder="Todas" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todas</SelectItem>
                        {filterOptions.cidade.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">UF</Label>
                    <Select value={filters.uf} onValueChange={(val) => setFilters({ ...filters, uf: val })}>
                      <SelectTrigger className="border-gray-200 dark:border-gray-700"><SelectValue placeholder="Todos" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos</SelectItem>
                        {filterOptions.uf.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Produto</Label>
                    <Select value={filters.produto} onValueChange={(val) => setFilters({ ...filters, produto: val })}>
                      <SelectTrigger className="border-gray-200 dark:border-gray-700"><SelectValue placeholder="Todos" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos</SelectItem>
                        {filterOptions.produto.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Situação Contrato</Label>
                    <Select value={filters.situacao_contrato} onValueChange={(val) => setFilters({ ...filters, situacao_contrato: val })}>
                      <SelectTrigger className="border-gray-200 dark:border-gray-700"><SelectValue placeholder="Todos" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos</SelectItem>
                        {filterOptions.situacao_contrato.map(s => <SelectItem key={s} value={s}>{situacaoLabel(s)} ({s})</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Data Contrato (De)</Label>
                    <Input
                      type="date"
                      value={filters.dataContratoInicio}
                      onChange={(e) => setFilters({ ...filters, dataContratoInicio: e.target.value })}
                      className="border-gray-200 dark:border-gray-700"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Data Contrato (Até)</Label>
                    <Input
                      type="date"
                      value={filters.dataContratoFim}
                      onChange={(e) => setFilters({ ...filters, dataContratoFim: e.target.value })}
                      className="border-gray-200 dark:border-gray-700"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Tempo Ativo (dias)</Label>
                    <Select value={filters.tempoAtivo} onValueChange={(val) => setFilters({ ...filters, tempoAtivo: val })}>
                      <SelectTrigger className="border-gray-200 dark:border-gray-700"><SelectValue placeholder="Todos" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos</SelectItem>
                        <SelectItem value="0-180">Até 180 dias</SelectItem>
                        <SelectItem value="181-365">181 a 365 dias</SelectItem>
                        <SelectItem value="366-730">366 a 730 dias</SelectItem>
                        <SelectItem value="731-1095">731 a 1095 dias</SelectItem>
                        <SelectItem value="1096-1825">1096 a 1825 dias</SelectItem>
                        <SelectItem value="1826+">Acima de 1825 dias</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3 pt-2">
                  <Button type="submit" disabled={loading} className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white gap-2">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    Buscar Leads
                  </Button>
                  <Button type="button" variant="outline" disabled={loadingOptions} onClick={() => loadFilterOptions(true)} className="gap-2">
                    {loadingOptions ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Recarregar Filtros
                  </Button>
                  {hasActiveFilters && (
                    <Button type="button" variant="outline" onClick={handleClearFilters} className="gap-2">Limpar Filtros</Button>
                  )}
                </div>
              </form>
            )}
          </CardContent>
        </Card>

        {loading && (
          <Card>
            <CardContent className="py-10 flex flex-col items-center gap-4">
              <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
              {!validationProgress ? (
                <p className="text-gray-500 dark:text-gray-400">Consultando base de leads...</p>
              ) : (
                <div className="w-full max-w-xl flex flex-col gap-2">
                  <p className="text-sm text-gray-700 dark:text-gray-300 text-center">
                    Validando WhatsApp dos números...
                  </p>
                  <Progress
                    value={validationProgress.total > 0
                      ? Math.min(100, Math.round((validationProgress.processed / validationProgress.total) * 100))
                      : 0}
                  />
                  <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                    <span>
                      {validationProgress.processed.toLocaleString('pt-BR')} / {validationProgress.total.toLocaleString('pt-BR')} verificados
                    </span>
                    <span className="font-medium text-green-600 dark:text-green-400">
                      {validationProgress.validFound.toLocaleString('pt-BR')} válidos (alvo: {validationProgress.target.toLocaleString('pt-BR')})
                    </span>
                  </div>
                  {validationJobId && (
                    <div className="flex justify-center pt-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleCancelValidation}
                        disabled={validationCancelRef.current}
                      >
                        <X className="w-4 h-4 mr-1" />
                        Cancelar validação
                      </Button>
                    </div>
                  )}
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 text-center">
                    A validação roda no servidor. Você pode fechar esta aba e voltar depois.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {!loading && hasSearched && leads.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <Search className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
              <p className="text-gray-500 dark:text-gray-400 font-medium">Nenhum lead encontrado</p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Tente ajustar os filtros para encontrar resultados.</p>
            </CardContent>
          </Card>
        )}

        {!loading && leads.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="w-4 h-4 text-amber-500" />
                  Resultado da Consulta
                </CardTitle>
                <div className="flex items-center gap-3 flex-wrap">
                  {totalFound > MAX_LEADS && (
                    <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                      <AlertTriangle className="w-4 h-4" />
                      <span className="text-xs font-medium">
                        Exibindo {MAX_LEADS.toLocaleString('pt-BR')} de {totalFound.toLocaleString('pt-BR')} encontrados
                      </span>
                    </div>
                  )}
                  <Badge variant="secondary" className="text-xs">
                    {totalFound <= MAX_LEADS
                      ? `${totalFound.toLocaleString('pt-BR')} lead${totalFound !== 1 ? 's' : ''}`
                      : `${leads.length.toLocaleString('pt-BR')} de ${totalFound.toLocaleString('pt-BR')}`
                    }
                  </Badge>
                  {selectedLeads.size > 0 && (
                    <Badge className="text-xs bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300">
                      {selectedLeads.size} selecionado{selectedLeads.size !== 1 ? 's' : ''}
                    </Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {totalFound > MAX_LEADS && (
                <div className="mb-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                  <p className="text-sm text-amber-800 dark:text-amber-300">
                    A consulta retornou <strong>{totalFound.toLocaleString('pt-BR')}</strong> leads.
                    O limite máximo por consulta é de <strong>{MAX_LEADS.toLocaleString('pt-BR')}</strong>.
                    Refine os filtros para obter resultados mais específicos.
                  </p>
                </div>
              )}

              <div className="mb-4 flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <Button variant="outline" size="sm" onClick={toggleSelectAll} className="gap-2 text-xs">
                    {selectedLeads.size === leads.length && leads.length > 0 ? (
                      <><X className="w-3.5 h-3.5" /> Desmarcar Todos</>
                    ) : (
                      <><CheckCircle2 className="w-3.5 h-3.5" /> Selecionar Todos</>
                    )}
                  </Button>
                  <Select
                    value=""
                    onValueChange={(val) => {
                      if (val === 'none') setSelectedLeads(new Set());
                      else if (val === 'all') setSelectedLeads(new Set(leads.map((_, i) => i)));
                      else selectFirstN(parseInt(val, 10));
                    }}
                  >
                    <SelectTrigger className="h-8 w-[130px] text-xs">
                      <SelectValue placeholder="Selecionar..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="100">Primeiros 100</SelectItem>
                      <SelectItem value="200">Primeiros 200</SelectItem>
                      <SelectItem value="500">Primeiros 500</SelectItem>
                      <SelectItem value="all">Todos ({leads.length})</SelectItem>
                      <SelectItem value="none">Limpar seleção</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {canDispatch && (
                  <Button
                    size="sm"
                    disabled={selectedLeads.size === 0 || sendingWhatsApp}
                    onClick={handleWhatsAppClick}
                    className="gap-2 text-xs bg-green-600 hover:bg-green-700 text-white"
                  >
                    {sendingWhatsApp ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageSquare className="w-3.5 h-3.5" />}
                    Disparar WhatsApp
                    {selectedLeads.size > 0 && (
                      <Badge variant="secondary" className="ml-1 text-xs bg-green-100 text-green-800">{leadsWithNumber.length}</Badge>
                    )}
                  </Button>
                )}

                {canDispatch && hasFailures && !sendingWhatsApp && currentBatchId && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleRetryFailed}
                    className="gap-2 text-xs text-orange-600 border-orange-300 hover:bg-orange-50"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reenviar Falhas ({(queueStatus?.falha || 0) + (queueStatus?.reenvio_agendado || 0)})
                  </Button>
                )}

                {queueStatus && !sendingWhatsApp && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowResultDialog(true)}
                    className="gap-2 text-xs text-blue-600 hover:text-blue-700"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Ver Resumo
                  </Button>
                )}
              </div>

              {sendingWhatsApp && queueStatus && (
                <div className="mb-4 p-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 space-y-3">
                  <div className="flex items-center gap-3">
                    <Loader2 className="w-5 h-5 animate-spin text-green-600" />
                    <span className="text-sm font-medium text-green-800 dark:text-green-300">
                      Processando fila de envio...
                    </span>
                  </div>
                  <Progress value={progressPercent} className="h-2" />
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                    <div className="p-2 rounded bg-white dark:bg-gray-800 shadow-sm">
                      <p className="text-lg font-bold text-green-600">{queueStatus.enviado || 0}</p>
                      <p className="text-xs text-gray-500">Enviados</p>
                    </div>
                    <div className="p-2 rounded bg-white dark:bg-gray-800 shadow-sm">
                      <p className="text-lg font-bold text-gray-500">{queueStatus.pendente || 0}</p>
                      <p className="text-xs text-gray-500">Na Fila</p>
                    </div>
                    <div className="p-2 rounded bg-white dark:bg-gray-800 shadow-sm">
                      <p className="text-lg font-bold text-red-500">{queueStatus.falha || 0}</p>
                      <p className="text-xs text-gray-500">Falhas</p>
                    </div>
                    <div className="p-2 rounded bg-white dark:bg-gray-800 shadow-sm">
                      <p className="text-lg font-bold text-amber-600">{(queueStatus.bloqueado_30_dias || 0) + (queueStatus.bloqueado_duplicidade || 0)}</p>
                      <p className="text-xs text-gray-500">Bloqueados</p>
                    </div>
                  </div>
                </div>
              )}

              {sendingWhatsApp && !queueStatus && (
                <div className="mb-4 p-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                  <div className="flex items-center gap-3 mb-2">
                    <Loader2 className="w-5 h-5 animate-spin text-green-600" />
                    <span className="text-sm font-medium text-green-800 dark:text-green-300">
                      Preparando fila de envio...
                    </span>
                  </div>
                  <Progress value={0} className="h-2" />
                </div>
              )}

              <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                      <th className="py-3 px-3 w-10">
                        <Checkbox checked={leads.length > 0 && selectedLeads.size === leads.length} onCheckedChange={toggleSelectAll} />
                      </th>
                      <th className="text-left py-3 px-4 font-medium text-gray-600 dark:text-gray-300">#</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-600 dark:text-gray-300">Nome</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-600 dark:text-gray-300">Telefone</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-600 dark:text-gray-300">UF</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-600 dark:text-gray-300">Cidade</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-600 dark:text-gray-300">Produto</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-600 dark:text-gray-300">Canal</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-600 dark:text-gray-300">Situação</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-600 dark:text-gray-300">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {leads.map((lead, idx) => {
                      const status = getLeadStatusDisplay(lead);
                      return (
                        <tr
                          key={idx}
                          className={`hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors ${
                            selectedLeads.has(idx) ? 'bg-green-50/50 dark:bg-green-900/10' : ''
                          }`}
                        >
                          <td className="py-2.5 px-3">
                            <Checkbox checked={selectedLeads.has(idx)} onCheckedChange={() => toggleSelectLead(idx)} />
                          </td>
                          <td className="py-2.5 px-4 text-gray-400 text-xs">{idx + 1}</td>
                          <td className="py-2.5 px-4 font-medium text-gray-900 dark:text-gray-100">{lead.name || '-'}</td>
                          <td className="py-2.5 px-4 text-gray-600 dark:text-gray-400">
                            <div className="flex items-center gap-1.5"><Phone className="w-3 h-3" />{lead.number || '-'}</div>
                          </td>
                          <td className="py-2.5 px-4 text-gray-600 dark:text-gray-400">{lead.uf || '-'}</td>
                          <td className="py-2.5 px-4 text-gray-600 dark:text-gray-400">
                            <div className="flex items-center gap-1.5"><MapPin className="w-3 h-3" />{lead.cidade || '-'}</div>
                          </td>
                          <td className="py-2.5 px-4 text-gray-600 dark:text-gray-400">
                            <div className="flex items-center gap-1.5"><Package className="w-3 h-3" />{lead.produto || '-'}</div>
                          </td>
                          <td className="py-2.5 px-4 text-gray-600 dark:text-gray-400 text-xs">{lead.canal || '-'}</td>
                          <td className="py-2.5 px-4">
                            <Badge variant="outline" className={situacaoColor(lead.situacao_contrato)}>
                              {situacaoLabel(lead.situacao_contrato)}
                            </Badge>
                          </td>
                          <td className="py-2.5 px-4">{renderStatusIcon(status)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-green-600" />
                Confirmar Disparo WhatsApp
              </DialogTitle>
              <DialogDescription>
                As mensagens serão inseridas em uma fila e enviadas de forma controlada com rate limit.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-4">
              <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Leads selecionados:</span>
                  <span className="font-semibold">{selectedLeads.size}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Com número válido:</span>
                  <span className="font-semibold text-green-600">{leadsWithNumber.length}</span>
                </div>
                {selectedLeads.size - leadsWithNumber.length > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Sem número (ignorados):</span>
                    <span className="font-semibold text-amber-600">{selectedLeads.size - leadsWithNumber.length}</span>
                  </div>
                )}
              </div>
              <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 flex items-start gap-2">
                <Lock className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                <p className="text-xs text-blue-800 dark:text-blue-300">
                  Números que já receberam mensagem nos últimos <strong>30 dias</strong> serão automaticamente bloqueados. Duplicidades no mesmo dia também serão impedidas.
                </p>
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>Cancelar</Button>
              <Button onClick={handleConfirmSend} className="bg-green-600 hover:bg-green-700 text-white gap-2">
                <Send className="w-4 h-4" />
                Confirmar Envio
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showResultDialog} onOpenChange={setShowResultDialog}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" />
                Resumo do Disparo
              </DialogTitle>
            </DialogHeader>
            {(queueStatus || enqueueSummary) && (
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800 text-center">
                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{queueStatus?.total || enqueueSummary?.total || 0}</p>
                    <p className="text-xs text-gray-500">Total</p>
                  </div>
                  <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 text-center">
                    <p className="text-2xl font-bold text-green-600">{queueStatus?.enviado || 0}</p>
                    <p className="text-xs text-green-600">Enviados</p>
                  </div>
                  <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-center">
                    <p className="text-2xl font-bold text-red-500">{queueStatus?.falha || 0}</p>
                    <p className="text-xs text-red-500">Falhas</p>
                  </div>
                  <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-center">
                    <p className="text-2xl font-bold text-amber-600">{queueStatus?.bloqueado_30_dias || enqueueSummary?.blocked30Days || 0}</p>
                    <p className="text-xs text-amber-600">Bloq. 30 dias</p>
                  </div>
                  <div className="p-3 rounded-lg bg-orange-50 dark:bg-orange-900/20 text-center">
                    <p className="text-2xl font-bold text-orange-500">{queueStatus?.bloqueado_duplicidade || enqueueSummary?.blockedDuplicate || 0}</p>
                    <p className="text-xs text-orange-500">Duplicidades</p>
                  </div>
                  <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-center">
                    <p className="text-2xl font-bold text-blue-500">{queueStatus?.reenvio_agendado || 0}</p>
                    <p className="text-xs text-blue-500">Reenvio</p>
                  </div>
                </div>

                {pollingTimeout && (
                  <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 flex items-start gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm text-amber-800 dark:text-amber-300">
                        O processamento demorou mais que o esperado. Alguns disparos podem ter sido interrompidos. Clique em "Reenviar Falhas" para retomar.
                      </p>
                    </div>
                    <button onClick={() => setPollingTimeout(false)} className="text-amber-600 hover:text-amber-800 shrink-0">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {queueStatus?.enviado > 0 && queueStatus?.falha === 0 && queueStatus?.isComplete && (
                  <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                    <p className="text-sm text-green-800 dark:text-green-300">Todas as mensagens foram enviadas com sucesso!</p>
                  </div>
                )}

                {hasFailures && queueStatus?.isComplete && (
                  <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 flex items-start gap-2">
                    <XCircle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm text-red-800 dark:text-red-300">
                        {(queueStatus?.falha || 0) + (queueStatus?.reenvio_agendado || 0)} mensagen(s) falharam. Use o botão "Reenviar Falhas" para tentar novamente.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button onClick={() => setShowResultDialog(false)}>Fechar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }
}
