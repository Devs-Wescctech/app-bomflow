import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { upsell } from "@/api/upsellClient";
import { useNavigate, useLocation } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  Calendar,
  User,
  FileText,
  MessageSquare,
  Save,
  TrendingUp,
  Plus,
  CheckCircle,
  Clock,
  Send,
  Eye,
  ThumbsUp,
  ThumbsDown,
  Edit,
  Loader2,
  Image as ImageIcon,
  Download,
  CheckCircle2,
  XCircle,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  DollarSign,
  ListTodo,
  Activity,
  FileSignature,
  Bell,
  AlertCircle,
  Presentation,
  Users,
  UserPlus,
  HelpCircle,
  Calculator,
} from "lucide-react";
import UpsellNovoOrcamento from "./UpsellNovoOrcamento";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { createPageUrl } from "@/utils";
import { toast } from "sonner";

import LeadTimeline from "@/components/sales/LeadTimeline";
import LeadPipelineHistory from "@/components/sales/LeadPipelineHistory";

import { canViewAll, canViewTeam, isUpsellAdmin } from "@/components/utils/permissions.jsx";

const STAGES = [
  { value: "novo", label: "Novo", color: "bg-gray-500", badge: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100" },
  { value: "abordado", label: "Abordado", color: "bg-blue-500", badge: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100" },
  { value: "qualificado", label: "Qualificado", color: "bg-purple-500", badge: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100" },
  { value: "proposta_enviada", label: "Proposta Enviada", color: "bg-yellow-500", badge: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100" },
  { value: "fechado_ganho", label: "Fechado - Ganho", color: "bg-green-500", badge: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100" },
  { value: "fechado_perdido", label: "Fechado - Perdido", color: "bg-red-500", badge: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100" },
];

const INTEREST_OPTIONS = [
  "Plano Funeral Básico",
  "Plano Funeral Premium",
  "Plano Familiar",
  "Bom Med - Telemedicina",
  "Bom Auto",
  "Bom Pet",
  "Múltiplos Planos",
  "Outro",
];

const SOURCE_OPTIONS = [
  "Porta a Porta",
  "Indicação",
  "Facebook Ads",
  "Google Ads",
  "Instagram",
  "WhatsApp",
  "Evento",
  "Telemarketing",
  "Site",
  "Panfletagem",
  "Outro",
];

export default function LeadUpsellDetail() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const leadId = urlParams.get('id');
  const contractInputRef = useRef(null);
  
  const [editedLead, setEditedLead] = useState({});
  const [hasChanges, setHasChanges] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [newTask, setNewTask] = useState({ title: "", scheduled_at: "" });
  const [generatingProposal, setGeneratingProposal] = useState(false);
  const [activeTab, setActiveTab] = useState(location.state?.tab || "activities");

  useEffect(() => {
    if (location.state?.tab && location.state.tab !== activeTab) {
      setActiveTab(location.state.tab);
    }
  }, [location.state?.tab]);

  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [sendingAutentique, setSendingAutentique] = useState(false);
  const [checkingAutentique, setCheckingAutentique] = useState(false);
  const [proposalUrl, setProposalUrl] = useState("");
  const [uploadingContract, setUploadingContract] = useState(false);
  const [sendingContractAutentique, setSendingContractAutentique] = useState(false);
  const [sendingContractLink, setSendingContractLink] = useState(false);
  const [sendingAcceptLink, setSendingAcceptLink] = useState(false);
  const [showLostDialog, setShowLostDialog] = useState(false);
  const [erpCardOpen, setErpCardOpen] = useState(true);
  const [lostReason, setLostReason] = useState("");

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: lead, isLoading } = useQuery({
    queryKey: ['lead', leadId],
    queryFn: () => upsell.entities.LeadUpsell.filter({ id: leadId }).then(res => res[0]),
    enabled: !!leadId,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const { data: agents = [], isLoading: agentsLoading } = useQuery({
    queryKey: ['agents'],
    queryFn: () => base44.entities.Agent.list(),
    initialData: [],
  });

  const { data: salesAgents = [] } = useQuery({
    queryKey: ['salesAgents'],
    queryFn: () => base44.entities.SalesAgent.list(),
    initialData: [],
  });

  const { data: activities = [] } = useQuery({
    queryKey: ['activities', leadId],
    queryFn: () => upsell.entities.ActivityUpsell.filter({ lead_id: leadId }),
    enabled: !!leadId,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const { data: templates = [] } = useQuery({
    queryKey: ['proposalTemplates'],
    queryFn: () => base44.entities.ProposalTemplate.list(),
  });

  const activeCpf = editedLead.cpf !== undefined ? editedLead.cpf : (lead?.cpf || '');
  const erpQueryCpf = activeCpf.replace(/\D/g, '').length === 11 ? activeCpf : null;

  const { data: erpData = [], isLoading: erpLoading } = useQuery({
    queryKey: ['erpCadastroPessoas', erpQueryCpf],
    queryFn: async () => {
      const digits = (erpQueryCpf || '').replace(/\D/g, '');
      if (digits.length < 11) return [];
      const cpf = digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
      const res = await fetch(`/api/functions/erp-cadastro-pessoas?cpf=${encodeURIComponent(cpf)}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` },
      });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: !!erpQueryCpf,
    staleTime: 5 * 60 * 1000,
  });

  const erpContracts = (() => {
    const map = {};
    for (const r of erpData) {
      const key = r.contrato || '__sem_contrato__';
      if (!map[key]) {
        map[key] = {
          contrato: r.contrato || null,
          situacao_contrato: r.situacao_contrato || null,
          nome_titular: r.nome_titular || null,
          cpf: r.cpf || null,
          data_titular: r.data_titular || null,
          telefone: r.telefone || null,
          telefone_2: r.telefone_2 || null,
          rua: r.rua || null,
          numero: r.numero || null,
          complemento: r.complemento || null,
          bairro: r.bairro || null,
          cep: r.cep || null,
          cidade: r.cidade || null,
          uf: r.uf || null,
          descricao: r.descricao || null,
          dependentes: [],
        };
      }
      if (r.nome_dependente) {
        map[key].dependentes.push({ nome: r.nome_dependente, cpf: r.cpf_dependente });
      }
    }
    return Object.values(map);
  })();

  const actionableTypes = ['task', 'visit', 'call', 'meeting', 'email', 'presentation', 'proposal'];
  const pendingTasks = activities.filter(a => actionableTypes.includes(a.type) && !a.completed);
  const hasPendingTasks = pendingTasks.length > 0;

  const getTaskTypeConfig = (type) => {
    const configs = {
      task: { icon: AlertCircle, label: 'Tarefa', color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-100 dark:bg-purple-900/50' },
      visit: { icon: MapPin, label: 'Visita', color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-100 dark:bg-orange-900/50' },
      call: { icon: Phone, label: 'Ligacao', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-900/50' },
      meeting: { icon: Users, label: 'Reuniao', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-900/50' },
      email: { icon: Mail, label: 'E-mail', color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-100 dark:bg-purple-900/50' },
      presentation: { icon: Presentation, label: 'Apresentacao', color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-100 dark:bg-indigo-900/50' },
      proposal: { icon: DollarSign, label: 'Proposta', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-900/50' },
    };
    return configs[type] || configs.task;
  };

  const updateLeadMutation = useMutation({
    mutationFn: (data) => upsell.entities.LeadUpsell.update(leadId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead', leadId] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast.success('Lead atualizado com sucesso!');
      setHasChanges(false);
    },
  });

  const claimLeadMutation = useMutation({
    mutationFn: () => upsell.entities.LeadUpsell.update(leadId, { agent_id: user?.agent?.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead', leadId] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast.success('Lead atribuído a você com sucesso!');
    },
    onError: () => toast.error('Erro ao assumir o lead'),
  });

  const createActivityMutation = useMutation({
    mutationFn: (data) => upsell.entities.ActivityUpsell.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activities', leadId] });
      queryClient.invalidateQueries({ queryKey: ['activities'] });
      setNewNote("");
      setNewTask({ title: "", scheduled_at: "" });
      toast.success('Atividade criada!');
    },
  });

  const completeTaskMutation = useMutation({
    mutationFn: (taskId) => upsell.entities.ActivityUpsell.update(taskId, { completed: true, completed_at: new Date().toISOString() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activities', leadId] });
      queryClient.invalidateQueries({ queryKey: ['activities'] });
      toast.success('Tarefa concluída!');
    },
  });

  const concludeSaleMutation = useMutation({
    mutationFn: async () => {
      const currentUser = await base44.auth.me();
      const nowIso = new Date().toISOString();
      return upsell.entities.LeadUpsell.update(leadId, {
        concluded: true,
        concludedAt: nowIso,
        concludedBy: currentUser.email,
        convertedAt: nowIso,
        stage: 'fechado_ganho',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead', leadId] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      
      createActivityMutation.mutate({
        leadId: leadId,
        type: 'note',
        title: 'Venda Concluída',
        description: 'Lead marcado como CONCLUÍDO - Venda finalizada com sucesso!',
        assignedTo: leadAgentId || 'Sistema',
      });
      
      toast.success('Venda concluída com sucesso!');
      
      setTimeout(() => {
        navigate(createPageUrl("LeadsUpsellKanban"));
      }, 2000);
    },
  });

  const markAsLostMutation = useMutation({
    mutationFn: async ({ reason }) => {
      const currentUser = await base44.auth.me();
      return upsell.entities.LeadUpsell.update(leadId, {
        lost: true,
        lostAt: new Date().toISOString(),
        lostBy: currentUser.email,
        lostReason: reason,
        stage: 'fechado_perdido',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead', leadId] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      
      createActivityMutation.mutate({
        leadId: leadId,
        type: 'note',
        title: 'Lead Perdido',
        description: `Lead marcado como PERDIDO\nMotivo: ${lostReason}`,
        assignedTo: leadAgentId || null,
      });
      
      toast.success('Lead marcado como perdido');
      setShowLostDialog(false);
      setLostReason("");
      
      setTimeout(() => {
        navigate(createPageUrl("LeadsUpsellKanban"));
      }, 2000);
    },
    onError: (error) => {
      const msg = error?.message || '';
      if (msg.includes('column') && msg.includes('lost')) {
        toast.error("Erro interno: colunas de 'perda' não configuradas no banco de dados. Contate o suporte.");
      } else {
        toast.error("Erro ao marcar como perdido: " + (msg || "Tente novamente."));
      }
      setShowLostDialog(false);
      setLostReason("");
    },
  });

  const reopenLeadMutation = useMutation({
    mutationFn: async () => {
      const currentUser = await base44.auth.me();
      const history = Array.isArray(lead?.stageHistory) ? lead.stageHistory : [];
      const previousActiveStage = [...history]
        .reverse()
        .map(h => h.from)
        .find(s => s && s !== 'fechado_ganho' && s !== 'fechado_perdido');
      const targetStage = previousActiveStage || 'qualificado';
      return upsell.entities.LeadUpsell.update(leadId, {
        concluded: false,
        concludedAt: null,
        concludedBy: null,
        convertedAt: null,
        lost: false,
        lostAt: null,
        lostBy: null,
        lostReason: null,
        stage: targetStage,
        reopenedAt: new Date().toISOString(),
        reopenedBy: currentUser.email,
      });
    },
    onSuccess: (updatedLead) => {
      queryClient.invalidateQueries({ queryKey: ['lead', leadId] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      createActivityMutation.mutate({
        leadId: leadId,
        type: 'note',
        title: 'Lead Retomado',
        description: `Lead reaberto para o pipeline (etapa ${updatedLead?.stage || 'qualificado'}).`,
        assignedTo: leadAgentId || 'Sistema',
      });
      toast.success('Lead retomado com sucesso!');
    },
    onError: (error) => {
      toast.error('Erro ao retomar lead: ' + (error?.message || 'Tente novamente.'));
    },
  });

  // HANDLER PARA MUDANÇA DE STAGE VIA CLIQUE NO HISTÓRICO
  const handleStageChange = async (newStage) => {
    const currentLeadData = queryClient.getQueryData(['lead', leadId]); // Get latest lead data
    const stageHistory = currentLeadData.stageHistory ? [...currentLeadData.stageHistory] : [];
    
    stageHistory.push({
      from: currentLeadData.stage,
      to: newStage,
      changedAt: new Date().toISOString(),
      changedBy: user?.email || 'Sistema',
    });

    try {
      await updateLeadMutation.mutateAsync({
        stage: newStage,
        stageHistory: stageHistory,
      });

      // Criar atividade de mudança de stage
      await createActivityMutation.mutateAsync({
        leadId: leadId,
        type: 'stage_change',
        title: `Etapa alterada`,
        description: `Lead movido de "${STAGES.find(s => s.value === currentLeadData.stage)?.label}" para "${STAGES.find(s => s.value === newStage)?.label}"`,
        assignedTo: currentLeadData.agentId,
        metadata: {
          from: currentLeadData.stage,
          to: newStage,
        }
      });

      toast.success(`Lead movido para "${STAGES.find(s => s.value === newStage)?.label}"`);
    } catch (error) {
      toast.error('Erro ao alterar stage');
    }
  };

  const handleFieldChange = (field, value) => {
    let processedValue = value;
    if (typeof value === 'string' && (field === 'monthlyValue' || field === 'adhesionValue')) {
      processedValue = value.trim() === '' ? null : parseFloat(value);
    } else if (typeof value === 'string' && field === 'totalDependents') {
      processedValue = value.trim() === '' ? null : parseInt(value, 10);
    }

    setEditedLead({ ...editedLead, [field]: processedValue });
    setHasChanges(true);
  };

  const handleSaveChanges = () => {
    const dataToSave = { ...editedLead };
    
    // Auto-assign current agent if lead has no agent and user is a salesperson (not admin/supervisor)
    if (!leadAgentId && userAgent?.id && !isAdmin && !isSupervisor) {
      dataToSave.agent_id = userAgent.id;
    }

    const monthlyValue = editedLead.monthlyValue !== undefined && editedLead.monthlyValue !== null && editedLead.monthlyValue !== ""
      ? parseFloat(editedLead.monthlyValue)
      : (lead.monthlyValue ? parseFloat(lead.monthlyValue) : 0);
    
    const adhesionValue = editedLead.adhesionValue !== undefined && editedLead.adhesionValue !== null && editedLead.adhesionValue !== ""
      ? parseFloat(editedLead.adhesionValue)
      : (lead.adhesionValue ? parseFloat(lead.adhesionValue) : 0);
    
    if (monthlyValue > 0 || adhesionValue > 0 || editedLead.monthlyValue !== undefined || editedLead.adhesionValue !== undefined) {
      dataToSave.value = monthlyValue + adhesionValue;
    }
    
    updateLeadMutation.mutate(dataToSave);
  };

  const handleAddNote = () => {
    if (!newNote.trim()) return;
    createActivityMutation.mutate({
      lead_id: leadId,
      type: 'note',
      title: 'Nota adicionada',
      description: newNote,
      assigned_to: leadAgentId,
    });
  };

  const handleAddTask = () => {
    if (!newTask.title.trim()) return;
    createActivityMutation.mutate({
      lead_id: leadId,
      type: newTask.type || 'task',
      title: newTask.title,
      description: newTask.description || "",
      scheduled_at: newTask.scheduled_at,
      assigned_to: leadAgentId,
      completed: false,
    });
  };

  const handleGenerateProposal = async (templateId) => {
    setGeneratingProposal(true);
    try {
      const response = await base44.functions.invoke('generateProposal', {
        lead_id: leadId,
        template_id: templateId,
        lead_type: 'upsell',
      });

      if (response.data.success) {
        setProposalUrl(response.data.proposal_url);
        queryClient.invalidateQueries({ queryKey: ['lead', leadId] });
        toast.success('Proposta gerada com sucesso!');
      } else {
        toast.error(response.data.error || 'Erro ao gerar proposta');
      }
    } catch (error) {
      toast.error('Erro ao gerar proposta');
    }
    setGeneratingProposal(false);
  };

  const handleSendWhatsApp = async () => {
    if (!proposalUrl && !lead.proposal_url) {
      toast.error('Gere a proposta primeiro!');
      return;
    }

    setSendingWhatsApp(true);
    try {
      const response = await base44.functions.invoke('sendProposalWhatsApp', {
        leadId: leadId,
        proposalUrl: proposalUrl || lead.proposal_url,
        lead_type: 'upsell',
      });

      if (response.data.success) {
        toast.success('Proposta enviada via WhatsApp!');
        createActivityMutation.mutate({
          lead_id: leadId,
          type: 'note',
          title: 'Proposta enviada via WhatsApp',
          description: `Proposta enviada para ${lead.phone}`,
          assigned_to: leadAgentId,
        });
      } else {
        toast.error(response.data.error || 'Erro ao enviar WhatsApp');
      }
    } catch (error) {
      toast.error('Erro ao enviar WhatsApp');
    }
    setSendingWhatsApp(false);
  };

  const handleSendEmail = async () => {
    if (!proposalUrl && !lead.proposal_url) {
      toast.error('Gere a proposta primeiro!');
      return;
    }

    if (!lead.email) {
      toast.error('Lead não possui e-mail cadastrado!');
      return;
    }

    setSendingEmail(true);
    try {
      const response = await base44.functions.invoke('sendProposalEmail', {
        lead_id: leadId,
        proposal_url: proposalUrl || lead.proposal_url,
      });

      if (response.data.success) {
        toast.success('Proposta enviada via e-mail!');
        createActivityMutation.mutate({
          lead_id: leadId,
          type: 'note',
          title: 'Proposta enviada via E-mail',
          description: `Proposta enviada para ${lead.email}`,
          assigned_to: leadAgentId,
        });
      } else {
        toast.error(response.data.error || 'Erro ao enviar e-mail');
      }
    } catch (error) {
      toast.error('Erro ao enviar e-mail');
    }
    setSendingEmail(false);
  };


  const handleContractUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingContract(true);
    try {
      const result = await base44.integrations.Core.UploadFile({ file });
      const fileUrl = result.file?.url || result.file_url;
      
      if (!fileUrl) {
        throw new Error('URL do arquivo não retornada');
      }
      
      await upsell.entities.LeadUpsell.update(leadId, {
        contract_url: fileUrl,
        contract_uploaded_at: new Date().toISOString(),
      });

      queryClient.invalidateQueries({ queryKey: ['lead', leadId] });
      toast.success('Contrato anexado com sucesso!');
    } catch (error) {
      toast.error('Erro ao fazer upload do contrato');
    }
    setUploadingContract(false);
  };

  const handleSendContractAutentique = async (method) => {
    if (!lead.contractUrl) {
      toast.error('Anexe o contrato primeiro!');
      return;
    }

    if (method === 'email') {
      setSendingContractAutentique(true);
    } else {
      setSendingContractLink(true);
    }

    try {
      const response = await base44.functions.invoke('autentiqueCreateDocument', {
        lead_id: leadId,
        contract_url: lead.contractUrl,
        send_method: method,
        lead_type: 'upsell',
      });

      if (response.data.success) {
        queryClient.invalidateQueries({ queryKey: ['lead', leadId] });
        if (method === 'email') {
          toast.success('Contrato enviado para assinatura via e-mail!');
        } else {
          toast.success('Link de assinatura gerado!');
        }
      } else {
        toast.error(response.data.error || 'Erro ao enviar para Autentique');
      }
    } catch (error) {
      toast.error('Erro ao processar documento');
    }

    setSendingContractAutentique(false);
    setSendingContractLink(false);
  };

  const handleCheckAutentiqueStatus = async () => {
    if (!lead.signatureAutentiqueId) {
      toast.error('Nenhum documento em assinatura!');
      return;
    }

    setCheckingAutentique(true);
    try {
      const response = await base44.functions.invoke('autentiqueCheckStatus', {
        lead_id: leadId,
      });

      if (response.data.success) {
        queryClient.invalidateQueries({ queryKey: ['lead', leadId] });
        if (response.data.status === 'signed') {
          toast.success('Contrato assinado!');
        } else {
          toast.info('Aguardando assinatura...');
        }
      } else {
        toast.error('Erro ao verificar status');
      }
    } catch (error) {
      toast.error('Erro ao verificar status');
    }
    setCheckingAutentique(false);
  };

  if (isLoading || !lead || agentsLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    );
  }

  const currentAgentType = user?.agent?.agentType || user?.agent?.agent_type;
  const userAgent = user?.agent;
  
  const isAdmin = isUpsellAdmin(user, userAgent);
  const isSupervisor = user?.role === 'supervisor' || currentAgentType?.includes('supervisor');
  
  const leadAgentId = lead?.agentId || lead?.agent_id;
  
  if (user && !isAdmin && !isSupervisor) {
    // Verificar se o lead pertence ao agent do usuário
    const isOwnLead = userAgent && String(leadAgentId) === String(userAgent.id);
    
    let hasAccess = isOwnLead;
    
    if (!hasAccess && userAgent) {
      // Lead sem dono (importado pelo gerador): qualquer agente pode abrir para assumir
      if (!leadAgentId) {
        hasAccess = true;
      } else {
        const canSeeAll = canViewAll(userAgent, 'leads');
        if (canSeeAll) {
          hasAccess = true;
        } else {
          const canSeeTeam = canViewTeam(userAgent, 'leads');
          if (canSeeTeam) {
            const leadAgent = agents.find(a => a.id === leadAgentId);
            const leadPromoterId = lead?.promoterId || lead?.promoter_id;
            const leadPromoter = agents.find(a => a.id === leadPromoterId);
            hasAccess = leadAgent?.teamId === userAgent.teamId || leadAgent?.team_id === userAgent.team_id || 
                        leadPromoter?.teamId === userAgent.teamId || leadPromoter?.team_id === userAgent.team_id;
          }
        }
      }
    }
    
    if (!hasAccess) {
      const leadSalesAgent = agents.find(a => a.id === leadAgentId);
      
      return (
        <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-gray-950">
          <Card className="max-w-md bg-white dark:bg-gray-900">
            <CardContent className="p-8 text-center">
              <div className="w-16 h-16 bg-orange-100 dark:bg-orange-950 rounded-full flex items-center justify-center mx-auto mb-4">
                <XCircle className="w-8 h-8 text-orange-600 dark:text-orange-400" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Acesso Restrito</h2>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Este lead está sendo trabalhado por outro agente.
              </p>
              <div className="p-4 bg-orange-50 dark:bg-orange-950 rounded-lg mb-6">
                <p className="text-sm text-orange-900 dark:text-orange-300">
                  <strong>Agente responsável:</strong>
                  <br />
                  {leadSalesAgent?.name || 'Não atribuído'}
                </p>
                {lead.phone && (
                  <p className="text-sm text-orange-900 dark:text-orange-300 mt-2">
                    <strong>Telefone:</strong> {lead.phone}
                  </p>
                )}
              </div>
              <Button onClick={() => navigate(createPageUrl("LeadsUpsellKanban"))}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Voltar ao Pipeline
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }
  }

  if (lead.lost) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-gray-950">
        <Card className="max-w-md bg-white dark:bg-gray-900">
          <CardContent className="p-8 text-center">
            <XCircle className="w-16 h-16 mx-auto mb-4 text-red-600 dark:text-red-400" />
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Lead Perdido</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Este lead foi marcado como perdido em {lead.lostAt && !isNaN(new Date(lead.lostAt))
                ? format(new Date(lead.lostAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                : 'data não disponível'}
            </p>
            {lead.lostReason && (
              <div className="p-3 bg-red-50 dark:bg-red-950 rounded-lg mb-4">
                <p className="text-sm font-semibold text-red-900 dark:text-red-300">Motivo:</p>
                <p className="text-sm text-red-700 dark:text-red-400">{lead.lostReason}</p>
              </div>
            )}
            <p className="text-sm text-gray-500 dark:text-gray-500 mb-6">
              Por: {lead.lostBy}
            </p>
            <Button onClick={() => navigate(createPageUrl("LeadsUpsellKanban"))}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar ao Pipeline
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentStage = STAGES.find(s => s.value === (editedLead.stage !== undefined ? editedLead.stage : lead.stage));

  const getLeadTemperature = () => {
    const lastContactAt = (editedLead.lastContactAt !== undefined ? editedLead.lastContactAt : lead.lastContactAt);
    const referenceDate = lastContactAt 
      ? new Date(lastContactAt) 
      : new Date(lead.createdDate || lead.createdAt);
    const daysSinceContact = Math.floor((new Date() - referenceDate) / (1000 * 60 * 60 * 24));
    
    if (daysSinceContact <= 2) return { label: 'Quente', color: 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-950', days: daysSinceContact };
    if (daysSinceContact <= 5) return { label: 'Morno', color: 'text-yellow-600 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-950', days: daysSinceContact };
    return { label: 'Frio', color: 'text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-950', days: daysSinceContact };
  };

  const temperature = getLeadTemperature();
  const leadAgent = agents.find(a => String(a.id) === String(leadAgentId));

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {lead.concluded && (
        <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-4 mx-3 sm:mx-6 mt-3 flex items-center gap-2">
          <CheckCircle className="text-green-600 dark:text-green-400 w-5 h-5 flex-shrink-0" />
          <span className="text-green-800 dark:text-green-300 font-medium text-sm flex-1">
            Venda Concluída — este registro pode ser visualizado e editado normalmente.
          </span>
          <Button
            onClick={() => {
              if (confirm('Retomar este lead?\n\nA venda será desfeita e o lead voltará para o pipeline ativo.')) {
                reopenLeadMutation.mutate();
              }
            }}
            disabled={reopenLeadMutation.isPending}
            size="sm"
            variant="outline"
            className="border-green-300 text-green-700 hover:bg-green-100 dark:border-green-700 dark:text-green-300 dark:hover:bg-green-900/40"
          >
            {reopenLeadMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Retomar Lead'}
          </Button>
        </div>
      )}
      {lead.lost && !lead.concluded && (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-4 mx-3 sm:mx-6 mt-3 flex items-center gap-2">
          <XCircle className="text-red-600 dark:text-red-400 w-5 h-5 flex-shrink-0" />
          <div className="flex-1">
            <div className="text-red-800 dark:text-red-300 font-medium text-sm">
              Lead Perdido
            </div>
            {lead.lostReason && (
              <div className="text-red-700 dark:text-red-400 text-xs mt-0.5">
                Motivo: {lead.lostReason}
              </div>
            )}
          </div>
          <Button
            onClick={() => {
              if (confirm('Retomar este lead?\n\nA marcação de "perdido" será removida e o lead voltará para o pipeline ativo.')) {
                reopenLeadMutation.mutate();
              }
            }}
            disabled={reopenLeadMutation.isPending}
            size="sm"
            variant="outline"
            className="border-red-300 text-red-700 hover:bg-red-100 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900/40"
          >
            {reopenLeadMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Retomar Lead'}
          </Button>
        </div>
      )}
      {/* Banner: Assumir Lead (apenas para agentes sem dono atribuído) */}
      {!leadAgentId && !isAdmin && !isSupervisor && userAgent?.id && (
        <div className="bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 rounded-lg p-4 mx-3 sm:mx-6 mt-3 flex items-center gap-3">
          <UserPlus className="text-violet-600 dark:text-violet-400 w-5 h-5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-violet-900 dark:text-violet-200 font-medium text-sm">Lead sem responsável</p>
            <p className="text-violet-700 dark:text-violet-400 text-xs mt-0.5">Este lead ainda não foi atribuído a nenhum vendedor.</p>
          </div>
          <Button
            onClick={() => claimLeadMutation.mutate()}
            disabled={claimLeadMutation.isPending}
            size="sm"
            className="bg-violet-600 hover:bg-violet-700 text-white"
          >
            {claimLeadMutation.isPending
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <><UserPlus className="w-4 h-4 mr-1.5" />Assumir Lead</>}
          </Button>
        </div>
      )}

      {/* Top Navigation Bar */}
      <div className="sticky top-0 z-50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-[1600px] mx-auto px-3 sm:px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(createPageUrl("LeadsUpsellKanban"))}
                className="gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Pipeline</span>
              </Button>
              <div className="h-6 w-px bg-gray-200 dark:bg-gray-700" />
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
                  <User className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">Upsell</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {hasChanges && (
                <Button
                  onClick={handleSaveChanges}
                  disabled={updateLeadMutation.isPending}
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/25"
                >
                  <Save className="w-4 h-4 mr-2" />
                  Salvar
                </Button>
              )}
              {(lead.stage === 'fechado_ganho' || lead.stage === 'proposta_enviada') && !lead.concluded && (
                <Button
                  onClick={() => {
                    if (confirm('Confirma a conclusão desta venda?\n\nEste lead sairá do pipeline de vendas.')) {
                      concludeSaleMutation.mutate();
                    }
                  }}
                  disabled={concludeSaleMutation.isPending}
                  size="sm"
                  className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white shadow-lg shadow-green-500/25"
                >
                  {concludeSaleMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Concluir
                    </>
                  )}
                </Button>
              )}
              {!lead.lost && (
                <Button
                  onClick={() => setShowLostDialog(true)}
                  variant="outline"
                  size="sm"
                  className="text-red-600 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950"
                >
                  <XCircle className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-3 sm:px-6 py-4 sm:py-6">
        {/* Hero Profile Card */}
        <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 p-4 sm:p-8 mb-6 sm:mb-8 shadow-2xl shadow-blue-500/20">
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent" />
          <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute -left-32 -bottom-32 h-96 w-96 rounded-full bg-blue-400/20 blur-3xl" />
          
          <div className="relative z-10 flex flex-col lg:flex-row lg:items-start gap-6">
            {/* Avatar */}
            <div className="relative shrink-0">
              <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-white/20 text-4xl font-bold text-white shadow-xl backdrop-blur-sm border border-white/20">
                {lead.name?.charAt(0)?.toUpperCase() || "?"}
              </div>
              <div className={`absolute -bottom-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold shadow-lg ${
                temperature.label === 'Quente' ? 'bg-gradient-to-br from-red-500 to-orange-500' :
                temperature.label === 'Morno' ? 'bg-gradient-to-br from-yellow-400 to-amber-500' :
                'bg-gradient-to-br from-blue-400 to-cyan-500'
              } text-white`}>
                {temperature.days}d
              </div>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap mb-2">
                <h1 className="text-3xl font-bold text-white truncate">
                  {lead.name || "Lead sem nome"}
                </h1>
                {hasPendingTasks && (
                  <div className="relative animate-bounce">
                    <Bell className="w-6 h-6 text-yellow-300 fill-yellow-300" />
                    <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                      {pendingTasks.length}
                    </span>
                  </div>
                )}
              </div>
              
              <div className="flex items-center gap-3 flex-wrap mb-4">
                <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold ${currentStage?.badge}`}>
                  <span className={`h-2 w-2 rounded-full ${currentStage?.color}`} />
                  {currentStage?.label}
                </span>
                <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold ${
                  temperature.label === 'Quente' ? 'bg-red-500/20 text-red-100' :
                  temperature.label === 'Morno' ? 'bg-yellow-500/20 text-yellow-100' :
                  'bg-blue-400/20 text-blue-100'
                }`}>
                  {temperature.label}
                </span>

              </div>

              {/* Quick Contact Actions */}
              <div className="flex items-center gap-2 flex-wrap">
                {lead.phone && (
                  <Button
                    size="sm"
                    onClick={() => window.open(`https://wa.me/55${lead.phone.replace(/\D/g, '')}`, '_blank')}
                    className="bg-white/20 hover:bg-white/30 text-white border-0 backdrop-blur-sm"
                  >
                    <Phone className="w-4 h-4 mr-2" />
                    {lead.phone}
                  </Button>
                )}
                {lead.email && (
                  <Button
                    size="sm"
                    onClick={() => window.open(`mailto:${lead.email}`, '_blank')}
                    className="bg-white/20 hover:bg-white/30 text-white border-0 backdrop-blur-sm"
                  >
                    <Mail className="w-4 h-4 mr-2" />
                    E-mail
                  </Button>
                )}
                {leadAgent && (
                  <span className="text-white/70 text-sm">
                    Agente: <strong className="text-white">{leadAgent.name}</strong>
                  </span>
                )}
                {(lead.created_at || lead.createdAt) && (() => {
                  const d = new Date(lead.created_at || lead.createdAt);
                  return !isNaN(d.getTime()) ? (
                    <span className="inline-flex items-center gap-1.5 text-white/70 text-sm">
                      <Calendar className="w-3.5 h-3.5" />
                      Cadastro: <strong className="text-white">{d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</strong>
                    </span>
                  ) : null;
                })()}
              </div>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-2 lg:grid-cols-1 gap-3 shrink-0">
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/10">
                <p className="text-white/70 text-xs uppercase tracking-wide">Valor Estimado</p>
                <p className="text-2xl font-bold text-white">
                  R$ {(parseFloat(lead.monthlyValue || 0) + parseFloat(lead.adhesionValue || 0)).toFixed(2)}
                </p>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/10">
                <p className="text-white/70 text-xs uppercase tracking-wide">Interesse</p>
                <p className="text-lg font-semibold text-white truncate">
                  {lead.interest || "Não definido"}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Pipeline Progress */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 mb-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-600" />
              <h2 className="font-semibold text-gray-900 dark:text-white">Jornada do Lead</h2>
              <div className="relative group">
                <button type="button" className="flex items-center justify-center rounded-full text-gray-400 hover:text-violet-600 dark:hover:text-violet-400 transition-colors focus:outline-none">
                  <HelpCircle className="w-4 h-4" />
                </button>
                <div className="absolute left-0 top-6 z-50 hidden group-hover:block w-80 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-xl p-4">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Guia das Etapas</p>
                  <ul className="space-y-3">
                    {[
                      { label: "Novo", color: "bg-gray-400", desc: "Lead recém-cadastrado, sem contato realizado.", when: "Mova ao fazer o primeiro contato." },
                      { label: "Abordado", color: "bg-blue-500", desc: "Primeiro contato feito, mas sem qualificação ainda.", when: "Mova quando o lead demonstrar interesse e informar dados relevantes." },
                      { label: "Qualificado", color: "bg-purple-500", desc: "Lead avaliado com potencial real de compra.", when: "Mova ao preparar e enviar uma proposta formal." },
                      { label: "Proposta Enviada", color: "bg-yellow-500", desc: "Proposta encaminhada ao cliente, aguardando retorno.", when: "Mova conforme a decisão do cliente (ganho ou perdido)." },
                      { label: "Fechado — Ganho", color: "bg-green-500", desc: "Venda concluída com sucesso.", when: "Mova ao confirmar a adesão ou contrato assinado." },
                      { label: "Fechado — Perdido", color: "bg-red-500", desc: "Negociação encerrada sem conversão.", when: "Mova quando o cliente recusar definitivamente ou não responder após todas as tentativas." },
                    ].map((s) => (
                      <li key={s.label} className="flex gap-2.5">
                        <span className={`mt-1 flex-shrink-0 w-2.5 h-2.5 rounded-full ${s.color}`} />
                        <div>
                          <p className="text-xs font-semibold text-gray-800 dark:text-gray-100">{s.label}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{s.desc}</p>
                          <p className="text-xs text-violet-600 dark:text-violet-400 mt-0.5">{s.when}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
            <span className="text-sm text-gray-500">Clique em uma etapa para mover</span>
          </div>
          <LeadPipelineHistory lead={lead} onStageChange={handleStageChange} />
        </div>

        {/* Pending Tasks Alert */}
        {hasPendingTasks && (
          <div className="mb-6 rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/50 dark:to-orange-950/50 border border-amber-200 dark:border-amber-800 p-5">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900/50">
                <Bell className="w-6 h-6 text-amber-600 dark:text-amber-400 animate-pulse" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-amber-900 dark:text-amber-200">
                  {pendingTasks.length} {pendingTasks.length === 1 ? 'Tarefa Pendente' : 'Tarefas Pendentes'}
                </h3>
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  Acesse a aba "Tarefas" para visualizar
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300"
                onClick={() => setActiveTab("tasks")}
              >
                Ver Tarefas
              </Button>
            </div>
          </div>
        )}

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Tabs */}
          <div className="lg:col-span-2">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-5 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-1.5 shadow-sm">
                <TabsTrigger 
                  value="activities" 
                  data-value="activities"
                  className="rounded-lg data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-md transition-all"
                >
                  <Activity className="w-4 h-4 mr-2" />
                  <span className="hidden sm:inline">Atividades</span>
                </TabsTrigger>
                <TabsTrigger 
                  value="tasks" 
                  data-value="tasks"
                  className="rounded-lg data-[state=active]:bg-purple-600 data-[state=active]:text-white data-[state=active]:shadow-md transition-all relative"
                >
                  <ListTodo className="w-4 h-4 mr-2" />
                  <span className="hidden sm:inline">Tarefas</span>
                  {hasPendingTasks && (
                    <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white animate-pulse">
                      {pendingTasks.length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger 
                  value="proposal" 
                  data-value="proposal"
                  className="rounded-lg data-[state=active]:bg-amber-500 data-[state=active]:text-white data-[state=active]:shadow-md transition-all"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  <span className="hidden sm:inline">Proposta</span>
                </TabsTrigger>
                <TabsTrigger 
                  value="contract" 
                  data-value="contract"
                  className="rounded-lg data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-md transition-all"
                >
                  <FileSignature className="w-4 h-4 mr-2" />
                  <span className="hidden sm:inline">Contrato</span>
                </TabsTrigger>
                <TabsTrigger 
                  value="orcamento" 
                  data-value="orcamento"
                  className="rounded-lg data-[state=active]:bg-violet-600 data-[state=active]:text-white data-[state=active]:shadow-md transition-all"
                >
                  <Calculator className="w-4 h-4 mr-2" />
                  <span className="hidden sm:inline">Orçamento</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="orcamento" className="mt-6">
                <UpsellNovoOrcamento
                  embedded
                  initialLead={{
                    nome: lead.name,
                    cpf: lead.cpf,
                    telefone: lead.phone,
                    email: lead.email,
                  }}
                />
              </TabsContent>

              <TabsContent value="activities" className="mt-6">
                <Card className="bg-white dark:bg-gray-900">
                  <CardHeader className="border-b border-gray-200 dark:border-gray-700">
                    <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
                      <MessageSquare className="w-5 h-5" />
                      Adicionar Nota Rápida
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-6 space-y-4">
                    <Textarea
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      placeholder="Escreva uma nota sobre este lead..."
                      rows={3}
                      className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                    />
                    <Button
                      onClick={handleAddNote}
                      disabled={!newNote.trim() || createActivityMutation.isPending}
                      className="w-full bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Adicionar Nota
                    </Button>

                    <div className="pt-6 border-t border-gray-200 dark:border-gray-700">
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Timeline de Atividades</h3>
                      <div className="max-h-[500px] overflow-y-auto">
                        <LeadTimeline activities={activities} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="tasks" className="mt-6">
                <Card className="bg-white dark:bg-gray-900">
                  <CardHeader className="border-b border-gray-200 dark:border-gray-700">
                    <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
                      <ListTodo className="w-5 h-5" />
                      Nova Tarefa de Follow-up
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-6 space-y-4">
                    <div>
                      <Label className="text-gray-900 dark:text-gray-100">Tipo de Atividade</Label>
                      <select
                        value={newTask.type || 'task'}
                        onChange={(e) => setNewTask({ ...newTask, type: e.target.value })}
                        className="mt-1 w-full h-10 px-3 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                      >
                        <option value="task">Tarefa</option>
                        <option value="call">Ligação</option>
                        <option value="meeting">Reunião</option>
                        <option value="visit">Visita</option>
                        <option value="email">E-mail</option>
                        <option value="presentation">Apresentação</option>
                        <option value="proposal">Proposta</option>
                      </select>
                    </div>
                    <div>
                      <Label className="text-gray-900 dark:text-gray-100">Título da Tarefa</Label>
                      <Input
                        value={newTask.title}
                        onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                        placeholder="Ex: Ligar para o cliente..."
                        className="mt-1 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                      />
                    </div>
                    <div>
                      <Label className="text-gray-900 dark:text-gray-100">Descrição (opcional)</Label>
                      <Textarea
                        value={newTask.description || ''}
                        onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                        placeholder="Detalhes adicionais sobre a atividade..."
                        className="mt-1 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                        rows={2}
                      />
                    </div>
                    <div>
                      <Label className="text-gray-900 dark:text-gray-100">Data e Hora</Label>
                      <Input
                        type="datetime-local"
                        value={newTask.scheduled_at}
                        onChange={(e) => setNewTask({ ...newTask, scheduled_at: e.target.value })}
                        className="mt-1 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                      />
                    </div>
                    <Button
                      onClick={handleAddTask}
                      disabled={!newTask.title.trim() || createActivityMutation.isPending}
                      className="w-full bg-purple-600 hover:bg-purple-700 dark:bg-purple-700 dark:hover:bg-purple-600"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Adicionar Atividade
                    </Button>

                    <div className="pt-6 border-t border-gray-200 dark:border-gray-700">
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Tarefas Pendentes</h3>
                      <div className="space-y-2 max-h-[400px] overflow-y-auto">
                        {pendingTasks.map((task) => {
                          const typeConfig = getTaskTypeConfig(task.type);
                          const TypeIcon = typeConfig.icon;
                          return (
                          <div key={task.id} className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 hover:shadow-md transition-all">
                            <div className="flex items-start gap-3">
                              <div className={`mt-0.5 p-1.5 rounded-lg ${typeConfig.bg}`}>
                                <TypeIcon className={`w-4 h-4 ${typeConfig.color}`} />
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-0.5">
                                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${typeConfig.bg} ${typeConfig.color}`}>
                                    {typeConfig.label}
                                  </span>
                                </div>
                                <label htmlFor={`task-${task.id}`} className="font-medium text-gray-900 dark:text-gray-100 cursor-pointer">
                                  {task.title}
                                </label>
                                {task.description && (
                                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{task.description}</p>
                                )}
                                {(task.scheduled_at || task.scheduledAt) && (
                                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                    <Clock className="w-3 h-3 inline mr-1" />
                                    {format(new Date(task.scheduled_at || task.scheduledAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                                  </p>
                                )}
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => completeTaskMutation.mutate(task.id)}
                                disabled={completeTaskMutation.isPending}
                                className="text-green-600 hover:text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-900/30"
                              >
                                <CheckCircle className="w-4 h-4 mr-1" />
                                Concluir
                              </Button>
                            </div>
                          </div>
                          );
                        })}
                        {pendingTasks.length === 0 && (
                          <p className="text-center text-gray-500 dark:text-gray-400 py-8">
                            Nenhuma tarefa pendente
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="proposal" className="mt-6">
                <Card className="bg-white dark:bg-gray-900">
                  <CardHeader className="border-b border-gray-200 dark:border-gray-700">
                    <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
                      <FileText className="w-5 h-5" />
                      Proposta Comercial
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-6 space-y-4">
                    {!lead.proposal_url && !proposalUrl ? (
                      <>
                        <p className="text-sm text-gray-600 dark:text-gray-400">Selecione um template para gerar a proposta:</p>
                        <div className="grid gap-2">
                          {templates.map(template => (
                            <Button
                              key={template.id}
                              variant="outline"
                              onClick={() => handleGenerateProposal(template.id)}
                              disabled={generatingProposal}
                              className="justify-start"
                            >
                              {generatingProposal ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              ) : (
                                <FileText className="w-4 h-4 mr-2" />
                              )}
                              {template.name}
                            </Button>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div className="space-y-3">
                        <div className="p-3 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
                          <p className="text-sm font-medium text-green-900 dark:text-green-300 flex items-center gap-2">
                            <CheckCircle className="w-4 h-4" />
                            Proposta gerada com sucesso!
                          </p>
                          <Button
                            variant="link"
                            size="sm"
                            onClick={() => window.open(proposalUrl || lead.proposal_url, '_blank')}
                            className="p-0 h-auto text-green-700 dark:text-green-400"
                          >
                            <Eye className="w-4 h-4 mr-1" />
                            Visualizar proposta
                          </Button>
                        </div>

                        <div className="flex gap-2">
                          <Button
                            onClick={handleSendWhatsApp}
                            disabled={sendingWhatsApp}
                            className="flex-1 bg-green-600 hover:bg-green-700"
                          >
                            {sendingWhatsApp ? (
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                              <Send className="w-4 h-4 mr-2" />
                            )}
                            Enviar WhatsApp
                          </Button>
                          <Button
                            onClick={handleSendEmail}
                            disabled={sendingEmail || !lead.email}
                            variant="outline"
                            className="flex-1"
                          >
                            {sendingEmail ? (
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                              <Mail className="w-4 h-4 mr-2" />
                            )}
                            Enviar E-mail
                          </Button>
                        </div>

                        {lead.proposal_status && (
                          <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                            <div className="flex items-center gap-2 text-sm">
                              {lead.proposal_status === 'accepted' && (
                                <>
                                  <ThumbsUp className="w-4 h-4 text-green-600 dark:text-green-400" />
                                  <span className="text-green-600 dark:text-green-400 font-medium">Proposta aceita!</span>
                                </>
                              )}
                              {lead.proposal_status === 'rejected' && (
                                <>
                                  <ThumbsDown className="w-4 h-4 text-red-600 dark:text-red-400" />
                                  <span className="text-red-600 dark:text-red-400 font-medium">Proposta recusada</span>
                                </>
                              )}
                              {lead.proposal_status === 'viewed' && (
                                <>
                                  <Eye className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                                  <span className="text-blue-600 dark:text-blue-400">Proposta visualizada</span>
                                </>
                              )}
                              {lead.proposal_status === 'pending' && (
                                <>
                                  <Clock className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                                  <span className="text-gray-600 dark:text-gray-400">Aguardando visualização</span>
                                </>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="contract" className="mt-6">
                <Card className="bg-white dark:bg-gray-900">
                  <CardHeader className="border-b border-gray-200 dark:border-gray-700">
                    <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
                      <FileSignature className="w-5 h-5" />
                      Gestão de Contrato
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-6 space-y-6">
                    <input
                      ref={contractInputRef}
                      type="file"
                      accept=".pdf"
                      onChange={handleContractUpload}
                      className="hidden"
                    />
                    {!lead.contractUrl ? (
                      <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-8 text-center">
                        <FileSignature className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                        <p className="text-gray-600 dark:text-gray-400 mb-4">Nenhum contrato anexado</p>
                        <Button
                          onClick={() => contractInputRef.current?.click()}
                          disabled={uploadingContract}
                          className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600"
                        >
                          {uploadingContract ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Enviando...
                            </>
                          ) : (
                            <>
                              <Plus className="w-4 h-4 mr-2" />
                              Anexar Contrato PDF
                            </>
                          )}
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <FileText className="w-8 h-8 text-green-600 dark:text-green-400" />
                              <div>
                                <p className="font-semibold text-green-900 dark:text-green-100">Contrato Anexado</p>
                                {lead.contractUploadedAt && (
                                  <p className="text-xs text-green-700 dark:text-green-400">
                                    Enviado em {format(new Date(lead.contractUploadedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => window.open(lead.contractUrl, '_blank')}
                                className="border-green-600 text-green-600 hover:bg-green-50"
                              >
                                <Download className="w-4 h-4 mr-1" />
                                Baixar
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => contractInputRef.current?.click()}
                                disabled={uploadingContract}
                                className="border-blue-600 text-blue-600 hover:bg-blue-50"
                              >
                                {uploadingContract ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  'Substituir'
                                )}
                              </Button>
                            </div>
                          </div>
                        </div>

                        <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                          <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                            <Send className="w-4 h-4" />
                            Enviar para Assinatura (Autentique)
                          </h4>
                          
                          {!lead.signatureAutentiqueId ? (
                            <div className="flex items-center gap-3">
                              <Button
                                onClick={() => handleSendContractAutentique('email')}
                                disabled={sendingContractAutentique || !lead.email}
                                className="flex-1 bg-blue-600 hover:bg-blue-700"
                              >
                                {sendingContractAutentique ? (
                                  <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Enviando...
                                  </>
                                ) : (
                                  <>
                                    <Mail className="w-4 h-4 mr-2" />
                                    Enviar por E-mail
                                  </>
                                )}
                              </Button>
                              <Button
                                onClick={() => handleSendContractAutentique('link')}
                                disabled={sendingContractLink}
                                variant="outline"
                                className="flex-1 border-purple-600 text-purple-600 hover:bg-purple-50"
                              >
                                {sendingContractLink ? (
                                  <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Gerando...
                                  </>
                                ) : (
                                  <>
                                    <ExternalLink className="w-4 h-4 mr-2" />
                                    Gerar Link
                                  </>
                                )}
                              </Button>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              {lead.signatureStatus === 'pending' ? (
                                <>
                                  <div className="p-4 bg-yellow-50 dark:bg-yellow-950 rounded-lg border border-yellow-200 dark:border-yellow-800">
                                    <div className="flex items-center gap-3">
                                      <Clock className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
                                      <div>
                                        <p className="font-semibold text-yellow-900 dark:text-yellow-100">Aguardando Assinatura</p>
                                        <p className="text-xs text-yellow-700 dark:text-yellow-400">O cliente ainda não assinou o contrato</p>
                                      </div>
                                    </div>
                                    {lead.signatureLink && (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => window.open(lead.signatureLink, '_blank')}
                                        className="mt-3 border-yellow-600 text-yellow-600 hover:bg-yellow-100"
                                      >
                                        <ExternalLink className="w-4 h-4 mr-1" />
                                        Abrir Link de Assinatura
                                      </Button>
                                    )}
                                  </div>
                                  <Button
                                    onClick={handleCheckAutentiqueStatus}
                                    disabled={checkingAutentique}
                                    variant="outline"
                                    className="w-full"
                                  >
                                    {checkingAutentique ? (
                                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    ) : (
                                      <CheckCircle2 className="w-4 h-4 mr-2" />
                                    )}
                                    Verificar Status
                                  </Button>
                                </>
                              ) : lead.signatureStatus === 'signed' ? (
                                <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
                                  <div className="flex items-center gap-3">
                                    <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
                                    <div>
                                      <p className="font-semibold text-green-900 dark:text-green-100">Contrato Assinado!</p>
                                      {lead.contractSignedAt && (
                                        <p className="text-xs text-green-700 dark:text-green-400">
                                          Assinado em {format(new Date(lead.contractSignedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <div className="p-4 bg-red-50 dark:bg-red-950 rounded-lg border border-red-200 dark:border-red-800">
                                  <div className="flex items-center gap-3">
                                    <XCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
                                    <div>
                                      <p className="font-semibold text-red-900 dark:text-red-100">Assinatura Recusada</p>
                                      <p className="text-xs text-red-700 dark:text-red-400">O cliente recusou assinar o contrato</p>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          {/* COLUNA DIREITA: Agente + Info + Valores (1/3) */}
          <div className="lg:col-span-1 space-y-6">
            {/* Agente Responsável */}
            {agents.find(a => a.id === leadAgentId) && (
              <Card className="border-blue-200 dark:border-blue-800 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900">
                <CardHeader className="border-b border-blue-200 dark:border-blue-700">
                  <CardTitle className="flex items-center gap-2 text-blue-900 dark:text-blue-100">
                    <User className="w-5 h-5" />
                    Agente Responsável
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  {(() => {
                    const agent = agents.find(a => a.id === leadAgentId);
                    return agent ? (
                      <div className="flex items-center gap-4">
                        {agent.photo_url ? (
                          <img 
                            src={agent.photo_url} 
                            alt={agent.name}
                            className="w-16 h-16 rounded-full object-cover border-4 border-white dark:border-blue-800 shadow-lg"
                          />
                        ) : (
                          <div className="w-16 h-16 rounded-full bg-blue-600 dark:bg-blue-700 flex items-center justify-center border-4 border-white dark:border-blue-800 shadow-lg">
                            <span className="text-2xl font-bold text-white">
                              {agent.name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                        )}
                        <div className="flex-1">
                          <p className="font-bold text-lg text-blue-900 dark:text-blue-100">{agent.name}</p>
                          <div className="space-y-1 mt-2">
                            <p className="text-sm text-blue-800 dark:text-blue-200 flex items-center gap-1">
                              <Phone className="w-3 h-3" />
                              {agent.phone}
                            </p>
                            {agent.email && (
                              <p className="text-sm text-blue-800 dark:text-blue-200 flex items-center gap-1 truncate">
                                <Mail className="w-3 h-3 flex-shrink-0" />
                                <span className="truncate">{agent.email}</span>
                              </p>
                            )}
                            {agent.team && (
                              <Badge className="mt-2 bg-white dark:bg-blue-800 text-blue-800 dark:text-blue-200 border border-blue-300 dark:border-blue-600">
                                {agent.team}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : null;
                  })()}
                </CardContent>
              </Card>
            )}

            {/* Lead Information Card */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50">
                <div className="flex items-center gap-2">
                  <User className="w-5 h-5 text-blue-600" />
                  <h3 className="font-semibold text-gray-900 dark:text-white">Dados do Lead</h3>
                </div>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <Label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Nome</Label>
                  <Input
                    value={editedLead.name !== undefined ? editedLead.name : (lead.name || "")}
                    onChange={(e) => handleFieldChange('name', e.target.value)}
                    className="mt-1.5 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <Label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">CPF</Label>
                  <Input
                    value={editedLead.cpf !== undefined ? editedLead.cpf : (lead.cpf || "")}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, '').slice(0, 11);
                      let masked = digits;
                      if (digits.length > 9) masked = `${digits.slice(0,3)}.${digits.slice(3,6)}.${digits.slice(6,9)}-${digits.slice(9)}`;
                      else if (digits.length > 6) masked = `${digits.slice(0,3)}.${digits.slice(3,6)}.${digits.slice(6)}`;
                      else if (digits.length > 3) masked = `${digits.slice(0,3)}.${digits.slice(3)}`;
                      handleFieldChange('cpf', masked);
                    }}
                    placeholder="000.000.000-00"
                    maxLength={14}
                    className="mt-1.5 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <Label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Telefone</Label>
                  <div className="flex gap-2 mt-1.5">
                    <Input
                      value={editedLead.phone !== undefined ? editedLead.phone : (lead.phone || "")}
                      onChange={(e) => handleFieldChange('phone', e.target.value)}
                      className="flex-1 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                    {(editedLead.phone ?? lead.phone) && (
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => window.open(`https://wa.me/55${(editedLead.phone ?? lead.phone).replace(/\D/g, '')}`, '_blank')}
                        className="rounded-lg hover:bg-green-50 hover:border-green-300 hover:text-green-600"
                      >
                        <Phone className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>

                <div>
                  <Label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">E-mail</Label>
                  <Input
                    value={editedLead.email !== undefined ? editedLead.email : (lead.email || "")}
                    onChange={(e) => handleFieldChange('email', e.target.value)}
                    className="mt-1.5 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <Label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Interesse</Label>
                  <Select 
                    value={editedLead.interest !== undefined ? editedLead.interest : (lead.interest || "")} 
                    onValueChange={(val) => handleFieldChange('interest', val)}
                  >
                    <SelectTrigger className="mt-1.5 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 rounded-lg">
                      <SelectValue placeholder="Selecione o interesse" />
                    </SelectTrigger>
                    <SelectContent>
                      {INTEREST_OPTIONS.map(option => (
                        <SelectItem key={option} value={option}>{option}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Fonte do Lead</Label>
                  <Select 
                    value={editedLead.source !== undefined ? editedLead.source : (lead.source || "")} 
                    onValueChange={(val) => handleFieldChange('source', val)}
                  >
                    <SelectTrigger className="mt-1.5 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 rounded-lg">
                      <SelectValue placeholder="Selecione a fonte" />
                    </SelectTrigger>
                    <SelectContent>
                      {SOURCE_OPTIONS.map(option => (
                        <SelectItem key={option} value={option}>{option}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-gray-900 dark:text-gray-100">Última Data de Contato</Label>
                  <Input
                    type="datetime-local"
                    value={editedLead.lastContactAt !== undefined 
                      ? (editedLead.lastContactAt ? new Date(editedLead.lastContactAt).toISOString().slice(0, 16) : "")
                      : (lead.lastContactAt ? new Date(lead.lastContactAt).toISOString().slice(0, 16) : "")}
                    onChange={(e) => {
                      const value = e.target.value ? new Date(e.target.value).toISOString() : null;
                      handleFieldChange('lastContactAt', value);
                    }}
                    className="mt-1 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                  />
                </div>

                {lead.address && (
                  <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                    <Label className="flex items-center gap-2 text-gray-900 dark:text-gray-100 font-semibold">
                      <MapPin className="w-4 h-4" />
                      Endereço
                    </Label>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{lead.address}</p>
                    {lead.latitude && lead.longitude && (
                      <Button
                        variant="link"
                        size="sm"
                        onClick={() => window.open(`https://www.google.com/maps?q=${lead.latitude},${lead.longitude}`, '_blank')}
                        className="p-0 h-auto mt-1"
                      >
                        Ver no mapa
                      </Button>
                    )}
                  </div>
                )}

                {lead.notes && (
                  <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
                    <Label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Observações</Label>
                    <Textarea
                      value={editedLead.notes !== undefined ? editedLead.notes : lead.notes}
                      onChange={(e) => handleFieldChange('notes', e.target.value)}
                      rows={3}
                      className="mt-1.5 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 rounded-lg"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* ERP — Dados API_CADASTRO_PESSOAS */}
            {erpQueryCpf && (
              <div className="bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-950/50 dark:to-purple-950/50 rounded-2xl border border-violet-200 dark:border-violet-800 shadow-sm overflow-hidden">
                <button
                  type="button"
                  className="w-full px-5 py-4 border-b border-violet-200/50 dark:border-violet-800/50 bg-violet-100/50 dark:bg-violet-900/30 flex items-center justify-between hover:bg-violet-100 dark:hover:bg-violet-900/50 transition-colors"
                  onClick={() => setErpCardOpen(v => !v)}
                >
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                    <h3 className="font-semibold text-violet-800 dark:text-violet-200">Dados ERP</h3>
                    {erpLoading && <Loader2 className="w-4 h-4 animate-spin text-violet-500" />}
                    {!erpLoading && erpContracts.length > 0 && (
                      <Badge className="bg-violet-200 dark:bg-violet-800 text-violet-800 dark:text-violet-200 text-xs">
                        {erpContracts.length} contrato{erpContracts.length > 1 ? 's' : ''}
                      </Badge>
                    )}
                    {!erpLoading && erpContracts.length === 0 && (
                      <Badge className="bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-xs">
                        sem registros
                      </Badge>
                    )}
                  </div>
                  {erpCardOpen
                    ? <ChevronDown className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                    : <ChevronRight className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                  }
                </button>

                {erpCardOpen && (
                  <div className="p-5 space-y-4">
                    {erpLoading ? (
                      <div className="flex items-center justify-center py-6 text-violet-500">
                        <Loader2 className="w-5 h-5 animate-spin mr-2" />
                        <span className="text-sm">Consultando ERP...</span>
                      </div>
                    ) : erpContracts.length === 0 ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                        Nenhum registro encontrado no ERP para este CPF.
                      </p>
                    ) : (
                      erpContracts.map((c, i) => {
                        const statusColor = c.situacao_contrato === 'ATIVO'
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'
                          : c.situacao_contrato === 'CANCELADO' || c.situacao_contrato === 'SUSPENSO'
                            ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300'
                            : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300';

                        const address = [c.rua, c.numero, c.complemento, c.bairro, c.cidade, c.uf, c.cep]
                          .filter(Boolean).join(', ');

                        return (
                          <div
                            key={i}
                            className="bg-white/70 dark:bg-gray-900/60 rounded-xl border border-violet-200 dark:border-violet-800 p-4 space-y-3"
                          >
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              {c.contrato && (
                                <span className="text-xs font-mono font-semibold text-violet-700 dark:text-violet-300">
                                  Contrato #{c.contrato}
                                </span>
                              )}
                              {c.situacao_contrato && (
                                <Badge className={`text-xs ${statusColor}`}>{c.situacao_contrato}</Badge>
                              )}
                            </div>

                            {c.descricao && (
                              <div>
                                <p className="text-xs font-medium text-violet-600 dark:text-violet-400 uppercase tracking-wide">Plano</p>
                                <p className="text-sm text-gray-800 dark:text-gray-200 mt-0.5">{c.descricao}</p>
                              </div>
                            )}

                            <div className="grid grid-cols-2 gap-3 text-sm">
                              {c.nome_titular && (
                                <div className="col-span-2">
                                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Titular</p>
                                  <p className="text-gray-800 dark:text-gray-200 mt-0.5">{c.nome_titular}</p>
                                </div>
                              )}
                              {c.data_titular && (
                                <div>
                                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Nascimento</p>
                                  <p className="text-gray-800 dark:text-gray-200 mt-0.5">{c.data_titular}</p>
                                </div>
                              )}
                              {c.telefone && (
                                <div>
                                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Telefone</p>
                                  <p className="text-gray-800 dark:text-gray-200 mt-0.5">{c.telefone}</p>
                                </div>
                              )}
                              {c.telefone_2 && (
                                <div>
                                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Telefone 2</p>
                                  <p className="text-gray-800 dark:text-gray-200 mt-0.5">{c.telefone_2}</p>
                                </div>
                              )}
                            </div>

                            {address && (
                              <div>
                                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide flex items-center gap-1">
                                  <MapPin className="w-3 h-3" /> Endereço
                                </p>
                                <p className="text-sm text-gray-700 dark:text-gray-300 mt-0.5">{address}</p>
                              </div>
                            )}

                            {c.dependentes.length > 0 && (
                              <div>
                                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                                  Dependentes ({c.dependentes.length})
                                </p>
                                <ul className="mt-1 space-y-1">
                                  {c.dependentes.map((d, j) => (
                                    <li key={j} className="text-sm text-gray-700 dark:text-gray-300 flex items-center gap-1">
                                      <User className="w-3 h-3 text-violet-400 flex-shrink-0" />
                                      <span>{d.nome}</span>
                                      {d.cpf && <span className="text-xs text-gray-400 ml-1">({d.cpf})</span>}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Financial Values Card */}
            <div className="bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-950/50 dark:to-green-950/50 rounded-2xl border border-emerald-200 dark:border-emerald-800 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-emerald-200/50 dark:border-emerald-800/50 bg-emerald-100/50 dark:bg-emerald-900/30">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-emerald-600" />
                  <h3 className="font-semibold text-emerald-800 dark:text-emerald-200">Valores</h3>
                </div>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <Label className="text-sm text-green-800 dark:text-green-300">Valor Mensal</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editedLead.monthlyValue !== undefined && editedLead.monthlyValue !== null ? editedLead.monthlyValue : (lead.monthlyValue || "")}
                    onChange={(e) => handleFieldChange('monthlyValue', e.target.value)}
                    placeholder="0.00"
                    className="mt-1 bg-white dark:bg-gray-800 border-green-300 dark:border-green-700"
                  />
                </div>
                <div>
                  <Label className="text-sm text-green-800 dark:text-green-300">Valor da Adesão</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editedLead.adhesionValue !== undefined && editedLead.adhesionValue !== null ? editedLead.adhesionValue : (lead.adhesionValue || "")}
                    onChange={(e) => handleFieldChange('adhesionValue', e.target.value)}
                    placeholder="0.00"
                    className="mt-1 bg-white dark:bg-gray-800 border-green-300 dark:border-green-700"
                  />
                </div>
                <div>
                  <Label className="text-sm text-green-800 dark:text-green-300">Dependentes</Label>
                  <Input
                    type="number"
                    value={editedLead.totalDependents !== undefined && editedLead.totalDependents !== null ? editedLead.totalDependents : (lead.totalDependents || "")}
                    onChange={(e) => handleFieldChange('totalDependents', e.target.value)}
                    placeholder="0"
                    className="mt-1 bg-white dark:bg-gray-800 border-green-300 dark:border-green-700"
                  />
                </div>

                {((editedLead.monthlyValue !== undefined && editedLead.monthlyValue !== null && editedLead.monthlyValue !== "") || 
                  (lead.monthlyValue !== undefined && lead.monthlyValue !== null) || 
                  (editedLead.adhesionValue !== undefined && editedLead.adhesionValue !== null && editedLead.adhesionValue !== "") ||
                  (lead.adhesionValue !== undefined && lead.adhesionValue !== null)) && (
                  <div className="pt-4 border-t border-emerald-200 dark:border-emerald-700">
                    <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur p-4 rounded-xl text-center shadow-inner">
                      <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wide mb-1">Total Estimado</p>
                      <p className="text-3xl font-bold text-emerald-700 dark:text-emerald-300">
                        R$ {(
                          parseFloat(editedLead.monthlyValue !== undefined && editedLead.monthlyValue !== null && editedLead.monthlyValue !== "" ? editedLead.monthlyValue : (lead.monthlyValue || 0)) +
                          parseFloat(editedLead.adhesionValue !== undefined && editedLead.adhesionValue !== null && editedLead.adhesionValue !== "" ? editedLead.adhesionValue : (lead.adhesionValue || 0))
                        ).toFixed(2)}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Fotos */}
            {lead.photos && lead.photos.length > 0 && (
              <Card className="bg-white dark:bg-gray-900">
                <CardHeader className="border-b border-gray-200 dark:border-gray-700">
                  <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
                    <ImageIcon className="w-5 h-5" />
                    Fotos
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="grid grid-cols-2 gap-2">
                    {lead.photos.map((photo, idx) => (
                      <img
                        key={idx}
                        src={photo.url}
                        alt={`Foto ${idx + 1}`}
                        className="w-full h-32 object-cover rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => window.open(photo.url, '_blank')}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Dialog Marcar como Perdido */}
      <Dialog open={showLostDialog} onOpenChange={setShowLostDialog}>
        <DialogContent className="bg-white dark:bg-gray-900">
          <CardHeader>
            <CardTitle className="text-red-600 dark:text-red-400">Marcar Lead como Perdido</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-gray-600 dark:text-gray-400">
              Este lead sairá do pipeline de vendas. Por favor, informe o motivo da perda:
            </p>
            <Textarea
              value={lostReason}
              onChange={(e) => setLostReason(e.target.value)}
              placeholder="Ex: Cliente desistiu, preço muito alto, optou por concorrente..."
              rows={4}
              className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
            />
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setShowLostDialog(false);
                  setLostReason("");
                }}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button
                onClick={() => markAsLostMutation.mutate({ reason: lostReason })}
                disabled={!lostReason.trim() || markAsLostMutation.isPending}
                className="flex-1 bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600"
              >
                {markAsLostMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Marcando...
                  </>
                ) : (
                  'Confirmar Perda'
                )}
              </Button>
            </div>
          </CardContent>
        </DialogContent>
      </Dialog>
    </div>
  );
}