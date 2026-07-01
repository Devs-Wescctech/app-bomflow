import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft,
  Phone,
  Mail,
  User,
  Users,
  MapPin,
  Gift,
  DollarSign,
  Calendar,
  CheckCircle,
  XCircle,
  Clock,
  MessageSquare,
  Loader2,
  Save,
  TrendingUp,
  Plus,
  UserCheck,
  FileText,
  Activity,
  Star,
  Send,
  Eye,
  Bell,
  ListTodo,
  ChevronRight,
  ThumbsUp,
  ThumbsDown,
  FileSignature,
  Download,
  ExternalLink,
  Presentation,
  AlertCircle,
  Building2,
  Trash2,
  Calculator,
  ArrowLeftRight,
} from "lucide-react";
import UpsellNovoOrcamento from "./UpsellNovoOrcamento";
import OrcamentoDocumentos from "@/components/orcamento/OrcamentoDocumentos";
import { createPageUrl } from "@/utils";
import ReassignLeadModal from "@/components/sales/ReassignLeadModal";
import ReassignmentLog from "@/components/sales/ReassignmentLog";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import ReferralTimeline from "../components/referral/ReferralTimeline";
import ReferralPipelineHistory from "../components/sales/ReferralPipelineHistory";

const STAGES = [
  { value: "novo", label: "Novo", color: "bg-gray-500", badge: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100" },
  { value: "contato_iniciado", label: "Contato Iniciado", color: "bg-blue-500", badge: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100" },
  { value: "proposta_enviada", label: "Proposta Enviada", color: "bg-yellow-500", badge: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100" },
  { value: "fechado_ganho", label: "Fechado - Ganho", color: "bg-green-500", badge: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100" },
  { value: "fechado_perdido", label: "Perdido", color: "bg-red-500", badge: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100" },
];

export default function ReferralDetail() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const referralId = urlParams.get('id');
  const contractInputRef = useRef(null);

  const [editedData, setEditedData] = useState({});
  const [hasChanges, setHasChanges] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [newTask, setNewTask] = useState({ title: "", scheduledAt: "" });
  const [showLostDialog, setShowLostDialog] = useState(false);
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [lostReason, setLostReason] = useState("");
  const [generatingProposal, setGeneratingProposal] = useState(false);
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);
  const [proposalUrl, setProposalUrl] = useState("");
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [waMessage, setWaMessage] = useState("");
  const [sendingWaMessage, setSendingWaMessage] = useState(false);
  const [uploadingContract, setUploadingContract] = useState(false);
  const [sendingContractAutentique, setSendingContractAutentique] = useState(false);
  const [showHardDeleteDialog, setShowHardDeleteDialog] = useState(false);
  const [sendingContractLink, setSendingContractLink] = useState(false);
  const [checkingAutentique, setCheckingAutentique] = useState(false);
  const [pixInput, setPixInput] = useState("");
  const [editingPix, setEditingPix] = useState(false);

  const { data: referral, isLoading, error } = useQuery({
    queryKey: ['referral', referralId],
    queryFn: () => base44.entities.Referral.get(referralId),
    enabled: !!referralId,
  });

  const { data: agents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: () => base44.entities.Agent.list(),
    initialData: [],
  });

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: activities = [] } = useQuery({
    queryKey: ['referralActivities', referralId],
    queryFn: () => base44.entities.ReferralActivity.filter({ referralId: referralId }),
    enabled: !!referralId,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const { data: templates = [] } = useQuery({
    queryKey: ['proposalTemplates'],
    queryFn: () => base44.entities.ProposalTemplate.list(),
  });

  const cleanReferrerCpf = (referral?.referrerCpf || '').replace(/\D/g, '');

  const { data: pixData, isLoading: isLoadingPix } = useQuery({
    queryKey: ['indicador-pix', cleanReferrerCpf],
    queryFn: async () => {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`/api/functions/indicadores-pix/${cleanReferrerCpf}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return { chave_pix: null };
      return res.json();
    },
    enabled: !!cleanReferrerCpf,
    staleTime: 30 * 1000,
  });

  const savePixMutation = useMutation({
    mutationFn: async (chavePix) => {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`/api/functions/indicadores-pix/${cleanReferrerCpf}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ chavePix }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Erro ao salvar Chave PIX.');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['indicador-pix', cleanReferrerCpf] });
      toast.success('Chave PIX salva com sucesso!');
      setEditingPix(false);
      setPixInput("");
    },
    onError: (err) => {
      toast.error(err.message || 'Erro ao salvar Chave PIX.');
    },
  });

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

  const updateReferralMutation = useMutation({
    mutationFn: async (data) => {
      if (data.stage && referral.stage !== data.stage) {
        const stageHistory = referral.stageHistory || [];
        stageHistory.push({
          stage: data.stage,
          previousStage: referral.stage,
          changedAt: new Date().toISOString(),
          changedBy: user?.email || 'Sistema',
        });
        data.stageHistory = stageHistory;

        if (data.stage === 'fechado_ganho') {
          data.status = 'convertido';
          data.convertedAt = new Date().toISOString();
          data.commissionStatus = 'aprovada';
        }

        if (data.stage === 'fechado_perdido') {
          data.status = 'perdido';
        }
      }

      return base44.entities.Referral.update(referralId, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['referral', referralId] });
      queryClient.invalidateQueries({ queryKey: ['referrals'] });
      toast.success('Indicação atualizada com sucesso!');
      setHasChanges(false);
      setEditedData({});
    },
    onError: (error) => {
      toast.error('Erro ao salvar indicação: ' + (error?.message || 'Tente novamente'));
    },
  });

  const createActivityMutation = useMutation({
    mutationFn: (data) => base44.entities.ReferralActivity.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['referralActivities', referralId] });
      queryClient.invalidateQueries({ queryKey: ['referralActivities'] });
      setNewNote("");
      setNewTask({ title: "", scheduledAt: "" });
      toast.success('Atividade registrada com sucesso!');
    },
  });

  const completeTaskMutation = useMutation({
    mutationFn: (taskId) => base44.entities.ReferralActivity.update(taskId, { completed: true, completed_at: new Date().toISOString() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['referralActivities', referralId] });
      queryClient.invalidateQueries({ queryKey: ['referralActivities'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success('Tarefa concluída!');
    },
  });

  const concludeSaleMutation = useMutation({
    mutationFn: async () => {
      const currentUser = await base44.auth.me();
      return base44.entities.Referral.update(referralId, {
        status: 'convertido',
        convertedAt: new Date().toISOString(),
        convertedBy: currentUser.email,
        stage: 'fechado_ganho',
        commissionStatus: 'aprovada',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['referral', referralId] });
      queryClient.invalidateQueries({ queryKey: ['referrals'] });
      
      createActivityMutation.mutate({
        referralId: referralId,
        type: 'note',
        title: 'Venda Concluída',
        description: 'Indicação convertida com sucesso! Comissão aprovada.',
        assignedTo: referral.agentId || 'Sistema',
      });
      
      toast.success('Indicação convertida com sucesso!');
      
      setTimeout(() => {
        navigate(createPageUrl("ReferralPipeline"));
      }, 2000);
    },
  });

  const markAsLostMutation = useMutation({
    mutationFn: async ({ reason }) => {
      const currentUser = await base44.auth.me();
      return base44.entities.Referral.update(referralId, {
        status: 'perdido',
        lost: true,
        lostAt: new Date().toISOString(),
        lostBy: currentUser.email,
        lostReason: reason,
        stage: 'fechado_perdido',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['referral', referralId] });
      queryClient.invalidateQueries({ queryKey: ['referrals'] });
      
      createActivityMutation.mutate({
        referralId: referralId,
        type: 'note',
        title: 'Indicação Perdida',
        description: `Indicação marcada como PERDIDA\nMotivo: ${lostReason}`,
        assignedTo: referral.agentId || null,
      });
      
      toast.success('Indicação marcada como perdida');
      setShowLostDialog(false);
      setLostReason("");
      
      setTimeout(() => {
        navigate(createPageUrl("ReferralPipeline"));
      }, 2000);
    },
    onError: (error) => {
      const msg = error?.message || '';
      if (msg.includes('column') && msg.includes('lost')) {
        toast.error("Erro interno: colunas de 'perda' não configuradas no banco de dados. Contate o suporte.");
      } else {
        toast.error("Erro ao marcar como perdida: " + (msg || "Tente novamente."));
      }
      setShowLostDialog(false);
      setLostReason("");
    },
  });

  const hardDeleteMutation = useMutation({
    mutationFn: async () => {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`/api/referrals/${referralId}/hard`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Erro ao excluir.');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['referrals'] });
      queryClient.invalidateQueries({ queryKey: ['referral', referralId] });
      toast.success('Lead de Indicações excluído definitivamente com sucesso.');
      navigate(createPageUrl("ReferralPipeline"));
    },
    onError: (error) => {
      toast.error(error?.message || 'Não foi possível excluir o lead de Indicações. Tente novamente ou contate o suporte.');
      setShowHardDeleteDialog(false);
    },
  });

  const handleStageChange = async (newStage) => {
    const stageHistory = referral.stageHistory ? [...referral.stageHistory] : [];
    
    stageHistory.push({
      stage: newStage,
      previousStage: referral.stage,
      changedAt: new Date().toISOString(),
      changedBy: user?.email || 'Sistema',
    });

    const updateData = {
      stage: newStage,
      stageHistory: stageHistory,
    };

    if (newStage === 'fechado_ganho') {
      updateData.status = 'convertido';
      updateData.convertedAt = new Date().toISOString();
      updateData.commissionStatus = 'aprovada';
    }

    if (newStage === 'fechado_perdido') {
      updateData.status = 'perdido';
    }

    try {
      await updateReferralMutation.mutateAsync(updateData);

      await createActivityMutation.mutateAsync({
        referralId: referralId,
        type: 'stage_change',
        title: `Etapa alterada`,
        description: `Indicação movida de "${STAGES.find(s => s.value === referral.stage)?.label}" para "${STAGES.find(s => s.value === newStage)?.label}"`,
        assignedTo: referral.agentId,
        metadata: {
          from: referral.stage,
          to: newStage,
        }
      });

      toast.success(`Indicação movida para "${STAGES.find(s => s.value === newStage)?.label}"`);
    } catch (error) {
      toast.error('Erro ao alterar stage');
    }
  };

  const handleFieldChange = (field, value) => {
    let processedValue = value;
    if (typeof value === 'string' && (field === 'monthlyValue' || field === 'adhesionValue' || field === 'value')) {
      processedValue = value.trim() === '' ? null : parseFloat(value);
    }

    setEditedData(prev => ({ ...prev, [field]: processedValue }));
    setHasChanges(true);
  };

  const handleSave = () => {
    const dataToSave = { ...editedData };

    if (editedData.monthlyValue !== undefined || editedData.adhesionValue !== undefined) {
      const monthly = parseFloat(editedData.monthlyValue ?? referral.monthlyValue ?? 0);
      const adhesion = parseFloat(editedData.adhesionValue ?? referral.adhesionValue ?? 0);
      dataToSave.value = monthly + adhesion;
    }

    updateReferralMutation.mutate(dataToSave);
  };

  const handleAddNote = () => {
    if (!newNote.trim()) return;
    createActivityMutation.mutate({
      referralId: referralId,
      type: 'note',
      title: 'Nota adicionada',
      description: newNote,
      assignedTo: referral.agentId,
    });
  };

  const handleAddTask = () => {
    if (!newTask.title.trim()) return;
    createActivityMutation.mutate({
      referralId: referralId,
      type: newTask.type || 'task',
      title: newTask.title,
      description: newTask.description || "",
      scheduledAt: newTask.scheduledAt,
      assignedTo: referral.agentId,
      completed: false,
    });
  };

  const handleGenerateProposal = async (templateId) => {
    setGeneratingProposal(true);
    try {
      const response = await base44.functions.invoke('generateProposal', {
        lead_id: referralId,
        template_id: templateId,
        lead_type: 'referral',
      });

      if (response.data.success) {
        setProposalUrl(response.data.proposal_url);
        queryClient.invalidateQueries({ queryKey: ['referral', referralId] });
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
    if (!proposalUrl && !referral.proposal_url) {
      toast.error('Gere a proposta primeiro!');
      return;
    }

    setSendingWhatsApp(true);
    try {
      const response = await base44.functions.invoke('sendProposalWhatsApp', {
        leadId: referralId,
        proposalUrl: proposalUrl || referral.proposal_url,
        lead_type: 'referral',
      });

      if (response.data.success) {
        toast.success('Proposta enviada via WhatsApp!');
        createActivityMutation.mutate({
          referralId: referralId,
          type: 'whatsapp',
          title: 'Proposta enviada via WhatsApp',
          description: `Proposta enviada para ${referral.referredPhone}`,
          assignedTo: referral.agentId,
        });
      } else {
        toast.error(response.data.error || 'Erro ao enviar WhatsApp');
      }
    } catch (error) {
      toast.error('Erro ao enviar WhatsApp');
    }
    setSendingWhatsApp(false);
  };

  const currentAgent = user?.agent;
  const currentAgentType = currentAgent?.agentType || currentAgent?.agent_type;
  const isAdmin = user?.role === 'admin' || currentAgentType === 'admin';
  const isSupervisor = user?.role === 'supervisor' || currentAgentType?.includes('supervisor');
  const isIndicacoesAtendente = currentAgent?.agentType === 'indicacoes_atendente';
  const isHardDeleteAllowed = currentAgent?.agentType === 'indicacoes_supervisor' || currentAgent?.agentType === 'indicacoes_admin' || currentAgent?.agentType === 'admin' || user?.role === 'admin';

  const eligibleAgents = agents.filter(a => a.active !== false);
  const leadPhone = referral?.referredPhone || referral?.referred_phone;

  const handleSendWaMessage = async () => {
    if (!waMessage.trim()) return;
    setSendingWaMessage(true);
    try {
      const token = localStorage.getItem('accessToken');
      const resp = await fetch(`/api/whatsapp/indications/leads/${referralId}/whatsapp-send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ message: waMessage.trim() }),
      });
      const data = await resp.json();
      if (resp.ok && data.success) {
        toast.success('Mensagem enviada pelo seu canal WhatsApp.');
        setShowWhatsAppModal(false);
        setWaMessage('');
      } else {
        toast.error(data.error || 'Erro ao enviar mensagem.');
      }
    } catch (err) {
      toast.error('Erro ao enviar mensagem. Tente novamente.');
    } finally {
      setSendingWaMessage(false);
    }
  };

  const handleContractUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingContract(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const token = localStorage.getItem('accessToken');
      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!uploadRes.ok) {
        const err = await uploadRes.json().catch(() => ({}));
        throw new Error(err.message || 'Falha no upload');
      }
      const result = await uploadRes.json();
      const fileUrl = result.file?.url;

      if (!fileUrl) {
        throw new Error('URL do arquivo não retornada');
      }

      await base44.entities.Referral.update(referralId, {
        contract_url: fileUrl,
        contract_uploaded_at: new Date().toISOString(),
      });

      queryClient.invalidateQueries({ queryKey: ['referral', referralId] });
      toast.success('Contrato anexado com sucesso!');
    } catch (error) {
      toast.error('Erro ao fazer upload do contrato');
    }
    setUploadingContract(false);
  };

  const handleSendContractAutentique = async (method) => {
    if (!referral.contractUrl) {
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
        lead_id: referralId,
        contract_url: referral.contractUrl,
        send_method: method,
        lead_type: 'referral',
      });

      if (response.data.success) {
        queryClient.invalidateQueries({ queryKey: ['referral', referralId] });
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
    if (!referral.signatureAutentiqueId) {
      toast.error('Nenhum documento em assinatura!');
      return;
    }

    setCheckingAutentique(true);
    try {
      const response = await base44.functions.invoke('autentiqueCheckStatus', {
        lead_id: referralId,
        lead_type: 'referral',
      });

      if (response.data.success) {
        queryClient.invalidateQueries({ queryKey: ['referral', referralId] });
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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-amber-600 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Carregando indicação...</p>
        </div>
      </div>
    );
  }

  if (error || !referral) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <Gift className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Indicação não encontrada</p>
          <Button onClick={() => navigate(createPageUrl("ReferralPipeline"))} className="mt-4">
            Voltar ao Pipeline
          </Button>
        </div>
      </div>
    );
  }

  const referralAgentId = referral?.agentId;
  const currentStage = STAGES.find(s => s.value === (editedData.stage ?? referral.stage));
  const isConverted = referral.status === 'convertido' || referral.stage === 'fechado_ganho';
  const isLost = referral.status === 'perdido' || referral.stage === 'fechado_perdido';

  if (isLost) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-gray-950">
        <Card className="max-w-md bg-white dark:bg-gray-900">
          <CardContent className="p-8 text-center">
            <XCircle className="w-16 h-16 mx-auto mb-4 text-red-600 dark:text-red-400" />
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Indicação Perdida</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Esta indicação foi marcada como perdida em {referral.lostAt && !isNaN(new Date(referral.lostAt))
                ? format(new Date(referral.lostAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                : 'data não disponível'}
            </p>
            {referral.lostReason && (
              <div className="p-3 bg-red-50 dark:bg-red-950 rounded-lg mb-4">
                <p className="text-sm font-semibold text-red-900 dark:text-red-300">Motivo:</p>
                <p className="text-sm text-red-700 dark:text-red-400">{referral.lostReason}</p>
              </div>
            )}
            <Button onClick={() => navigate(createPageUrl("ReferralPipeline"))}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar ao Pipeline
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const getTemperature = () => {
    const lastContactAt = editedData.lastContactAt !== undefined ? editedData.lastContactAt : referral.lastContactAt;
    const referenceDate = lastContactAt 
      ? new Date(lastContactAt) 
      : new Date(referral.createdAt || referral.created_date);
    const daysSinceContact = Math.floor((new Date() - referenceDate) / (1000 * 60 * 60 * 24));
    
    if (daysSinceContact <= 2) return { label: 'Quente', color: 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-950', days: daysSinceContact };
    if (daysSinceContact <= 5) return { label: 'Morno', color: 'text-yellow-600 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-950', days: daysSinceContact };
    return { label: 'Frio', color: 'text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-950', days: daysSinceContact };
  };

  const temperature = getTemperature();
  const referralAgent = agents.find(a => String(a.id) === String(referral.agentId));

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {isConverted && (
        <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-4 mx-3 sm:mx-6 mt-3 flex items-center gap-2">
          <CheckCircle className="text-green-600 dark:text-green-400 w-5 h-5 flex-shrink-0" />
          <span className="text-green-800 dark:text-green-300 font-medium text-sm">
            Indicação Convertida — este registro pode ser visualizado e editado normalmente.
          </span>
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
                onClick={() => navigate(createPageUrl("ReferralPipeline"))}
                className="gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Pipeline</span>
              </Button>
              <div className="h-6 w-px bg-gray-200 dark:bg-gray-700" />
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-100 dark:bg-amber-900/50 rounded-lg">
                  <Users className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">Indicações</span>
                </div>
                {referral.referrerLevel === 2 && (
                  <div className="flex items-center gap-1 px-2 py-1 bg-purple-100 dark:bg-purple-900/50 rounded-lg">
                    <Star className="w-3 h-3 text-purple-600 dark:text-purple-400" />
                    <span className="text-xs font-semibold text-purple-700 dark:text-purple-300">Nível 2</span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {hasChanges && (
                <Button
                  onClick={handleSave}
                  disabled={updateReferralMutation.isPending}
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/25"
                >
                  <Save className="w-4 h-4 mr-2" />
                  Salvar
                </Button>
              )}
              {(referral.stage === 'fechado_ganho' || referral.stage === 'proposta_enviada') && (
                <Button
                  onClick={() => {
                    if (confirm('Confirma a conversão desta indicação?\n\nA comissão será aprovada automaticamente.')) {
                      concludeSaleMutation.mutate();
                    }
                  }}
                  disabled={concludeSaleMutation.isPending}
                  size="sm"
                  className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white shadow-lg shadow-amber-500/25"
                >
                  {concludeSaleMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Converter
                    </>
                  )}
                </Button>
              )}
              {isIndicacoesAtendente && (
                <Button
                  onClick={() => { setWaMessage(''); setShowWhatsAppModal(true); }}
                  size="sm"
                  disabled={!leadPhone}
                  title={!leadPhone ? 'Este lead não possui telefone.' : 'Conversar no WhatsApp'}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  <MessageSquare className="w-4 h-4 mr-2" />
                  <span className="hidden sm:inline">WhatsApp</span>
                </Button>
              )}
              {leadPhone && (
                <Button
                  onClick={() => navigate(createPageUrl("WhatsAppConversa", { phone: leadPhone, name: referral?.referredName || referral?.referred_name || "", leadType: "indicacao", stage: currentStage?.label || "", agent: referralAgent?.name || "" }))}
                  size="sm"
                  title="Iniciar conversa no WhatsApp"
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  <MessageSquare className="w-4 h-4 mr-2" />
                  <span className="hidden sm:inline">Enviar WhatsApp</span>
                </Button>
              )}
              {isHardDeleteAllowed && (
                <Button
                  onClick={() => setShowHardDeleteDialog(true)}
                  variant="outline"
                  size="sm"
                  className="text-red-700 border-red-300 hover:bg-red-50 hover:border-red-400 dark:border-red-700 dark:hover:bg-red-950 dark:text-red-400"
                  title="Excluir Definitivamente"
                >
                  <Trash2 className="w-4 h-4" />
                  <span className="hidden sm:inline ml-1.5">Excluir</span>
                </Button>
              )}
              {(isAdmin || isSupervisor) && (
                <Button
                  onClick={() => setShowReassignModal(true)}
                  variant="outline"
                  size="sm"
                  className="text-blue-600 border-blue-200 hover:bg-blue-50 dark:border-blue-800 dark:hover:bg-blue-950"
                  title="Redistribuir indicação"
                >
                  <ArrowLeftRight className="w-4 h-4" />
                  <span className="hidden sm:inline ml-1.5">Redistribuir</span>
                </Button>
              )}
              <Button
                onClick={() => setShowLostDialog(true)}
                variant="outline"
                size="sm"
                className="text-red-600 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950"
              >
                <XCircle className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-3 sm:px-6 py-4 sm:py-6">
        {/* Hero Profile Card */}
        <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500 p-4 sm:p-8 mb-6 sm:mb-8 shadow-2xl shadow-amber-500/20">
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent" />
          <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute -left-32 -bottom-32 h-96 w-96 rounded-full bg-orange-400/20 blur-3xl" />
          
          <div className="relative z-10 flex flex-col lg:flex-row lg:items-start gap-6">
            {/* Avatar */}
            <div className="relative shrink-0">
              <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-white/20 text-4xl font-bold text-white shadow-xl backdrop-blur-sm border border-white/20">
                {referral.referredName?.charAt(0)?.toUpperCase() || "?"}
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
                  {referral.referredName || "Indicado sem nome"}
                </h1>
                {hasPendingTasks && (
                  <div className="relative animate-bounce">
                    <Bell className="w-6 h-6 text-yellow-200 fill-yellow-200" />
                    <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                      {pendingTasks.length}
                    </span>
                  </div>
                )}
              </div>
              
              <p className="text-amber-100 text-sm mb-4">Código: {referral.referralCode}</p>
              
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
                {referral.referredEmail && (
                  <Button
                    size="sm"
                    onClick={() => window.open(`mailto:${referral.referredEmail}`, '_blank')}
                    className="bg-white/20 hover:bg-white/30 text-white border-0 backdrop-blur-sm"
                  >
                    <Mail className="w-4 h-4 mr-2" />
                    E-mail
                  </Button>
                )}
                {referralAgent && (
                  <span className="text-white/70 text-sm">
                    Agente: <strong className="text-white">{referralAgent.name}</strong>
                  </span>
                )}
                {(referral.created_at || referral.createdAt) && (() => {
                  const d = new Date(referral.created_at || referral.createdAt);
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
                  R$ {parseFloat(referral.value || referral.monthlyValue || 0).toFixed(2)}
                </p>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/10">
                <p className="text-white/70 text-xs uppercase tracking-wide">Indicador</p>
                <p className="text-lg font-semibold text-white truncate">
                  {referral.referrerName || "N/D"}
                </p>
              </div>
            </div>
          </div>
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
                onClick={() => document.querySelector('[data-value="tasks"]')?.click()}
              >
                Ver Tarefas
              </Button>
            </div>
          </div>
        )}

        {/* Pipeline Progress */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 mb-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-amber-600" />
              <h2 className="font-semibold text-gray-900 dark:text-white">Jornada da Indicação</h2>
            </div>
            <span className="text-sm text-gray-500">Clique em uma etapa para mover</span>
          </div>
          <ReferralPipelineHistory referral={referral} onStageChange={handleStageChange} />
        </div>

        {/* Layout em Grid: Esquerda (Tabs) | Direita (Info) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* COLUNA ESQUERDA: TABS (2/3) */}
          <div className="lg:col-span-2">
            <Tabs defaultValue="activities" className="w-full">
              <TabsList className="grid w-full grid-cols-5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-1">
                <TabsTrigger value="activities" className="data-[state=active]:bg-amber-600 data-[state=active]:text-white">
                  <Activity className="w-4 h-4 mr-2" />
                  Atividades
                </TabsTrigger>
                <TabsTrigger value="tasks" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white relative">
                  <ListTodo className="w-4 h-4 mr-2" />
                  Tarefas
                  {hasPendingTasks && (
                    <Badge className="ml-2 bg-red-600 text-white text-xs px-1.5 py-0.5 rounded-full animate-pulse">
                      {pendingTasks.length}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="proposal" className="data-[state=active]:bg-yellow-600 data-[state=active]:text-white">
                  <FileText className="w-4 h-4 mr-2" />
                  Proposta
                </TabsTrigger>
                <TabsTrigger value="orcamento" className="data-[state=active]:bg-violet-600 data-[state=active]:text-white">
                  <Calculator className="w-4 h-4 mr-2" />
                  Orçamento
                </TabsTrigger>
                <TabsTrigger value="contract" className="data-[state=active]:bg-amber-700 data-[state=active]:text-white">
                  <FileSignature className="w-4 h-4 mr-2" />
                  Contrato
                </TabsTrigger>
              </TabsList>

              <TabsContent value="orcamento" className="mt-6">
                <UpsellNovoOrcamento
                  embedded
                  modulo="referral"
                  leadId={referralId}
                  initialLead={{
                    nome: referral.referredName,
                    cpf: referral.referredCpf,
                    telefone: referral.referredPhone,
                    email: referral.referredEmail,
                  }}
                />
                <OrcamentoDocumentos
                  modulo="referral"
                  cpf={referral.referredCpf}
                  leadId={referralId}
                  canManage={isAdmin || isSupervisor || String(referralAgentId) === String(currentAgent?.id)}
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
                      placeholder="Escreva uma nota sobre esta indicação..."
                      rows={3}
                      className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                    />
                    <Button
                      onClick={handleAddNote}
                      disabled={!newNote.trim() || createActivityMutation.isPending}
                      className="w-full bg-amber-600 hover:bg-amber-700 dark:bg-amber-700 dark:hover:bg-amber-600"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Adicionar Nota
                    </Button>

                    <div className="pt-6 border-t border-gray-200 dark:border-gray-700">
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Timeline de Atividades</h3>
                      <div className="max-h-[500px] overflow-y-auto">
                        <ReferralTimeline activities={activities} />
                      </div>
                    </div>
                    {(isAdmin || isSupervisor) && (
                      <div className="pt-6 border-t border-gray-200 dark:border-gray-700">
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                          <ArrowLeftRight className="w-4 h-4 text-blue-600" />
                          Histórico de Redistribuições
                        </h3>
                        <ReassignmentLog leadId={referralId} module="referrals" />
                      </div>
                    )}
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
                        placeholder="Ex: Ligar para o indicado..."
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
                        value={newTask.scheduledAt}
                        onChange={(e) => setNewTask({ ...newTask, scheduledAt: e.target.value })}
                        className="mt-1 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                      />
                    </div>
                    <Button
                      onClick={handleAddTask}
                      disabled={!newTask.title.trim() || createActivityMutation.isPending}
                      className="w-full bg-amber-600 hover:bg-amber-700 dark:bg-amber-700 dark:hover:bg-amber-600"
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
                                {(task.scheduledAt || task.scheduled_at) && (
                                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                    <Clock className="w-3 h-3 inline mr-1" />
                                    {format(new Date(task.scheduledAt || task.scheduled_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
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
                    {!referral.proposal_url && !proposalUrl ? (
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
                          <p className="text-sm font-medium text-green-900 dark:text-green-300 flex items-center gap-2"><CheckCircle className="w-4 h-4" /> Proposta gerada com sucesso!</p>
                          <Button
                            variant="link"
                            size="sm"
                            onClick={() => window.open(proposalUrl || referral.proposal_url, '_blank')}
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
                        </div>

                        {referral.proposal_status && (
                          <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                            <div className="flex items-center gap-2 text-sm">
                              {referral.proposal_status === 'accepted' && (
                                <>
                                  <ThumbsUp className="w-4 h-4 text-green-600 dark:text-green-400" />
                                  <span className="text-green-600 dark:text-green-400 font-medium">Proposta aceita!</span>
                                </>
                              )}
                              {referral.proposal_status === 'rejected' && (
                                <>
                                  <ThumbsDown className="w-4 h-4 text-red-600 dark:text-red-400" />
                                  <span className="text-red-600 dark:text-red-400 font-medium">Proposta recusada</span>
                                </>
                              )}
                              {referral.proposal_status === 'viewed' && (
                                <>
                                  <Eye className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                                  <span className="text-blue-600 dark:text-blue-400">Proposta visualizada</span>
                                </>
                              )}
                              {referral.proposal_status === 'pending' && (
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
                    {!referral.contractUrl ? (
                      <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-8 text-center">
                        <FileSignature className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                        <p className="text-gray-600 dark:text-gray-400 mb-4">Nenhum contrato anexado</p>
                        <Button
                          onClick={() => contractInputRef.current?.click()}
                          disabled={uploadingContract}
                          className="bg-amber-600 hover:bg-amber-700 dark:bg-amber-700 dark:hover:bg-amber-600"
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
                                {referral.contractUploadedAt && (
                                  <p className="text-xs text-green-700 dark:text-green-400">
                                    Enviado em {format(new Date(referral.contractUploadedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => window.open(referral.contractUrl, '_blank')}
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
                                className="border-amber-600 text-amber-600 hover:bg-amber-50"
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
                          
                          {!referral.signatureAutentiqueId ? (
                            <div className="flex items-center gap-3">
                              <Button
                                onClick={() => handleSendContractAutentique('email')}
                                disabled={sendingContractAutentique}
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
                              {referral.signatureStatus === 'pending' ? (
                                <>
                                  <div className="p-4 bg-yellow-50 dark:bg-yellow-950 rounded-lg border border-yellow-200 dark:border-yellow-800">
                                    <div className="flex items-center gap-3">
                                      <Clock className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
                                      <div>
                                        <p className="font-semibold text-yellow-900 dark:text-yellow-100">Aguardando Assinatura</p>
                                        <p className="text-xs text-yellow-700 dark:text-yellow-400">O cliente ainda não assinou o contrato</p>
                                      </div>
                                    </div>
                                    {referral.signatureLink && (
                                      <div className="mt-3 p-3 bg-white dark:bg-gray-800 rounded-lg">
                                        <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">Link de assinatura:</p>
                                        <div className="flex items-center gap-2">
                                          <Input 
                                            value={referral.signatureLink} 
                                            readOnly 
                                            className="text-xs bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700"
                                          />
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                              navigator.clipboard.writeText(referral.signatureLink);
                                              toast.success('Link copiado!');
                                            }}
                                          >
                                            Copiar
                                          </Button>
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => window.open(referral.signatureLink, '_blank')}
                                          >
                                            <ExternalLink className="w-4 h-4" />
                                          </Button>
                                        </div>
                                      </div>
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
                                      <>
                                        <Eye className="w-4 h-4 mr-2" />
                                        Verificar Status
                                      </>
                                    )}
                                  </Button>
                                </>
                              ) : referral.signatureStatus === 'signed' ? (
                                <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
                                  <div className="flex items-center gap-3">
                                    <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
                                    <div>
                                      <p className="font-semibold text-green-900 dark:text-green-100">Contrato Assinado!</p>
                                      {referral.contractSignedAt && (
                                        <p className="text-xs text-green-700 dark:text-green-400">
                                          Assinado em {format(new Date(referral.contractSignedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
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
            {agents.find(a => String(a.id) === String(referralAgentId)) && (
              <Card className="border-amber-200 dark:border-amber-800 bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-950 dark:to-amber-900">
                <CardHeader className="border-b border-amber-200 dark:border-amber-700">
                  <CardTitle className="flex items-center gap-2 text-amber-900 dark:text-amber-100">
                    <User className="w-5 h-5" />
                    Agente Responsável
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  {(() => {
                    const agent = agents.find(a => String(a.id) === String(referralAgentId));
                    return agent ? (
                      <div className="flex items-center gap-4 min-w-0">
                        <div className="shrink-0">
                          {(agent.photoUrl || agent.photo_url) ? (
                            <img 
                              src={agent.photoUrl || agent.photo_url} 
                              alt={agent.name}
                              className="w-16 h-16 rounded-full object-cover border-4 border-white dark:border-amber-800 shadow-lg"
                            />
                          ) : (
                            <div className="w-16 h-16 rounded-full bg-amber-600 dark:bg-amber-700 flex items-center justify-center border-4 border-white dark:border-amber-800 shadow-lg">
                              <span className="text-2xl font-bold text-white">
                                {agent.name?.charAt(0)?.toUpperCase() || 'A'}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-lg text-amber-900 dark:text-amber-100 truncate">{agent.name}</p>
                          <div className="space-y-1 mt-2">
                            {agent.email && (
                              <p className="text-sm text-amber-800 dark:text-amber-200 flex items-center gap-1 min-w-0">
                                <Mail className="w-3 h-3 shrink-0" />
                                <span className="truncate">{agent.email}</span>
                              </p>
                            )}
                            {(agent.workUnit || agent.work_unit) && (
                              <p className="text-sm text-amber-800 dark:text-amber-200 flex items-center gap-1">
                                <Building2 className="w-3 h-3 shrink-0" />
                                <span className="truncate">{agent.workUnit || agent.work_unit}</span>
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : null;
                  })()}
                </CardContent>
              </Card>
            )}

            {/* Informações do Indicador */}
            <Card className="border-purple-200 dark:border-purple-800/50 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30">
              <CardHeader className="border-b border-purple-200 dark:border-purple-700">
                <CardTitle className="flex items-center gap-2 text-purple-800 dark:text-purple-300">
                  <UserCheck className="w-5 h-5" />
                  Cliente Indicador
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-purple-700 dark:text-purple-400">Nome</Label>
                    <p className="font-semibold text-purple-900 dark:text-purple-200 text-sm">{referral.referrerName}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-purple-700 dark:text-purple-400">CPF</Label>
                    <p className="font-semibold text-purple-900 dark:text-purple-200 text-sm">{referral.referrerCpf}</p>
                  </div>
                  {referral.referrerPhone && (
                    <div>
                      <Label className="text-xs text-purple-700 dark:text-purple-400">Telefone</Label>
                      <p className="font-semibold text-purple-900 dark:text-purple-200 text-sm">{referral.referrerPhone}</p>
                    </div>
                  )}
                  {referral.referrerContractId && (
                    <div>
                      <Label className="text-xs text-purple-700 dark:text-purple-400">Contrato</Label>
                      <p className="font-semibold text-purple-900 dark:text-purple-200 text-sm">{referral.referrerContractId}</p>
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-purple-300 dark:border-purple-700">
                  <Label className="text-xs text-purple-700 dark:text-purple-400">Chave PIX</Label>
                  {isLoadingPix ? (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Carregando...</p>
                  ) : !cleanReferrerCpf ? (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">CPF do indicador não informado.</p>
                  ) : pixData?.chave_pix && !editingPix ? (
                    <div className="mt-1 flex items-center gap-2">
                      <p className="font-semibold text-purple-900 dark:text-purple-200 text-sm break-all flex-1">
                        {pixData.chave_pix}
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => { setPixInput(pixData.chave_pix); setEditingPix(true); }}
                      >
                        Editar
                      </Button>
                    </div>
                  ) : (
                    <div className="mt-1 flex flex-col sm:flex-row gap-2">
                      <Input
                        value={pixInput}
                        onChange={(e) => setPixInput(e.target.value)}
                        placeholder="CPF, e-mail, telefone ou chave aleatória"
                        className="h-9 text-sm bg-white dark:bg-gray-900 flex-1"
                        maxLength={150}
                      />
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          className="h-9"
                          disabled={!pixInput.trim() || savePixMutation.isPending}
                          onClick={() => savePixMutation.mutate(pixInput.trim())}
                        >
                          {savePixMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar'}
                        </Button>
                        {editingPix && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-9"
                            onClick={() => { setEditingPix(false); setPixInput(""); }}
                          >
                            Cancelar
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-purple-300 dark:border-purple-700">
                  <div className="flex items-center gap-2">
                    {referral.referrerLevel === 2 ? (
                      <Badge className="bg-amber-100 text-amber-800 flex items-center gap-1"><Star className="w-3 h-3" /> Nível 2</Badge>
                    ) : (
                      <Badge className="bg-blue-100 text-blue-800">Nível 1</Badge>
                    )}
                    <span className="text-xs text-gray-600 dark:text-gray-400">
                      {referral.referrerTotalConversions || 0} {(referral.referrerTotalConversions || 0) !== 1 ? 'conversões' : 'conversão'}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Informações do Indicado */}
            <Card className="bg-white dark:bg-gray-900">
              <CardHeader className="border-b border-gray-200 dark:border-gray-700">
                <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
                  <User className="w-5 h-5" />
                  Dados do Indicado
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                <div>
                  <Label className="text-gray-900 dark:text-gray-100">Nome</Label>
                  <Input
                    value={editedData.referredName !== undefined ? editedData.referredName : (referral.referredName || "")}
                    onChange={(e) => handleFieldChange('referredName', e.target.value)}
                    className="mt-1 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                  />
                </div>

                <div>
                  <Label className="text-gray-900 dark:text-gray-100">CPF</Label>
                  <Input
                    value={editedData.referredCpf !== undefined ? editedData.referredCpf : (referral.referredCpf || "")}
                    onChange={(e) => handleFieldChange('referredCpf', e.target.value)}
                    className="mt-1 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                  />
                </div>

                <div>
                  <Label className="text-gray-900 dark:text-gray-100">Telefone</Label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      value={editedData.referredPhone !== undefined ? editedData.referredPhone : (referral.referredPhone || "")}
                      onChange={(e) => handleFieldChange('referredPhone', e.target.value)}
                      className="flex-1 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                    />
                    {referral.referredPhone && (
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => window.open(`https://wa.me/55${referral.referredPhone.replace(/\D/g, '')}`, '_blank')}
                      >
                        <Phone className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>

                <div>
                  <Label className="text-gray-900 dark:text-gray-100">E-mail</Label>
                  <Input
                    value={editedData.referredEmail !== undefined ? editedData.referredEmail : (referral.referredEmail || "")}
                    onChange={(e) => handleFieldChange('referredEmail', e.target.value)}
                    className="mt-1 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                  />
                </div>

                <div>
                  <Label className="text-gray-900 dark:text-gray-100">Última Data de Contato</Label>
                  <Input
                    type="datetime-local"
                    value={editedData.lastContactAt !== undefined 
                      ? (editedData.lastContactAt ? new Date(editedData.lastContactAt).toISOString().slice(0, 16) : "")
                      : (referral.lastContactAt ? new Date(referral.lastContactAt).toISOString().slice(0, 16) : "")}
                    onChange={(e) => {
                      const value = e.target.value ? new Date(e.target.value).toISOString() : null;
                      handleFieldChange('lastContactAt', value);
                    }}
                    className="mt-1 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                  />
                </div>

                {referral.referredAddress && (
                  <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                    <Label className="flex items-center gap-2 text-gray-900 dark:text-gray-100 font-semibold">
                      <MapPin className="w-4 h-4" />
                      Endereço
                    </Label>
                    <Input
                      value={editedData.referredAddress !== undefined ? editedData.referredAddress : (referral.referredAddress || "")}
                      onChange={(e) => handleFieldChange('referredAddress', e.target.value)}
                      className="mt-1 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Valores e Comissão */}
            {!isIndicacoesAtendente && (
            <Card className="border-green-200 dark:border-green-800 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950 dark:to-emerald-950">
              <CardHeader className="border-b border-green-200 dark:border-green-700">
                <CardTitle className="flex items-center gap-2 text-green-800 dark:text-green-200">
                  <DollarSign className="w-5 h-5" />
                  Valores e Comissão
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-3">
                <div>
                  <Label className="text-sm text-green-800 dark:text-green-300">Valor Mensal</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editedData.monthlyValue !== undefined && editedData.monthlyValue !== null ? editedData.monthlyValue : (referral.monthlyValue || "")}
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
                    value={editedData.adhesionValue !== undefined && editedData.adhesionValue !== null ? editedData.adhesionValue : (referral.adhesionValue || "")}
                    onChange={(e) => handleFieldChange('adhesionValue', e.target.value)}
                    placeholder="0.00"
                    className="mt-1 bg-white dark:bg-gray-800 border-green-300 dark:border-green-700"
                  />
                </div>

                <div className="pt-3 border-t border-green-300 dark:border-green-700">
                  <div className="bg-white dark:bg-gray-800 p-4 rounded-lg text-center shadow-sm">
                    <p className="text-xs text-green-700 dark:text-green-400 mb-1 flex items-center justify-center gap-1"><DollarSign className="w-3 h-3" /> Valor Estimado Total</p>
                    <p className="text-2xl font-bold text-green-800 dark:text-green-200">
                      R$ {(
                        parseFloat(editedData.monthlyValue !== undefined && editedData.monthlyValue !== null && editedData.monthlyValue !== "" ? editedData.monthlyValue : (referral.monthlyValue || 0)) +
                        parseFloat(editedData.adhesionValue !== undefined && editedData.adhesionValue !== null && editedData.adhesionValue !== "" ? editedData.adhesionValue : (referral.adhesionValue || 0))
                      ).toFixed(2)}
                    </p>
                  </div>
                </div>

                {referral.commissionValue && (
                  <div className="pt-3 border-t border-green-300 dark:border-green-700">
                    <div className="bg-purple-50 dark:bg-purple-950 p-4 rounded-lg text-center shadow-sm border border-purple-200 dark:border-purple-800">
                      <p className="text-xs text-purple-700 dark:text-purple-400 mb-1 flex items-center justify-center gap-1">
                        <Gift className="w-3 h-3" /> Comissão do Indicador ({referral.referrerLevel === 2 ? '10%' : '5%'})
                      </p>
                      <p className="text-xl font-bold text-purple-800 dark:text-purple-200">
                        R$ {parseFloat(referral.commissionValue || 0).toFixed(2)}
                      </p>
                      {referral.commissionStatus && (
                        <Badge className={`mt-2 ${
                          referral.commissionStatus === 'aprovada' ? 'bg-green-100 text-green-800' :
                          referral.commissionStatus === 'paga' ? 'bg-blue-100 text-blue-800' :
                          'bg-yellow-100 text-yellow-800'
                        }`}>
                          {referral.commissionStatus === 'aprovada' ? 'Aprovada' :
                           referral.commissionStatus === 'paga' ? 'Paga' :
                           'Pendente'}
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
            )}
          </div>
        </div>
      </div>

      {/* Dialog Marcar como Perdido */}
      <ReassignLeadModal
        open={showReassignModal}
        onClose={() => setShowReassignModal(false)}
        module="referrals"
        leadId={referralId}
        leadName={referral?.referredName || referral?.referred_name}
        currentAgent={agents.find(a => String(a.id) === String(referral?.agentId || referral?.agent_id))}
        eligibleAgents={eligibleAgents}
      />

      <Dialog open={showLostDialog} onOpenChange={setShowLostDialog}>
        <DialogContent className="bg-white dark:bg-gray-900">
          <CardHeader>
            <CardTitle className="text-red-600 dark:text-red-400">Marcar Indicação como Perdida</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-gray-600 dark:text-gray-400">
              Esta indicação sairá do pipeline. Por favor, informe o motivo da perda:
            </p>
            <Textarea
              value={lostReason}
              onChange={(e) => setLostReason(e.target.value)}
              placeholder="Ex: Indicado não teve interesse, telefone inválido, já é cliente..."
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

      {/* Modal Conversar no WhatsApp */}
      <Dialog open={showWhatsAppModal} onOpenChange={(open) => { setShowWhatsAppModal(open); if (!open) setWaMessage(''); }}>
        <DialogContent className="bg-white dark:bg-gray-900 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-700 dark:text-green-400">
              <MessageSquare className="w-5 h-5" />
              Conversar no WhatsApp
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div>
                <Label className="text-xs text-gray-500 dark:text-gray-400">Nome do lead</Label>
                <p className="text-sm font-medium text-gray-900 dark:text-white">{referral?.referredName || referral?.referred_name || '—'}</p>
              </div>
              <div>
                <Label className="text-xs text-gray-500 dark:text-gray-400">Telefone</Label>
                <p className="text-sm font-medium text-gray-900 dark:text-white">{leadPhone || '—'}</p>
              </div>
            </div>

            <div>
              <Label htmlFor="wa-msg" className="text-sm font-medium">Mensagem</Label>
              <Textarea
                id="wa-msg"
                value={waMessage}
                onChange={(e) => setWaMessage(e.target.value)}
                placeholder="Digite sua mensagem..."
                rows={4}
                className="mt-1.5 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
              />
            </div>

            <div className="flex items-center gap-3 pt-1">
              <Button
                variant="outline"
                onClick={() => { setShowWhatsAppModal(false); setWaMessage(''); }}
                className="flex-1"
                disabled={sendingWaMessage}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSendWaMessage}
                disabled={!waMessage.trim() || sendingWaMessage}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white"
              >
                {sendingWaMessage ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Enviar
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showHardDeleteDialog} onOpenChange={setShowHardDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-700 dark:text-red-400 flex items-center gap-2">
              <Trash2 className="w-5 h-5" />
              Confirmação de Exclusão Definitiva
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed">
              <strong>ATENÇÃO: Esta ação é irreversível.</strong> O lead de Indicações e todos os seus dados relacionados (atividades, histórico, visitas, etc.) serão{" "}
              <strong>PERMANENTEMENTE</strong> removidos do sistema. Deseja realmente continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={hardDeleteMutation.isPending}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => hardDeleteMutation.mutate()}
              disabled={hardDeleteMutation.isPending}
              className="bg-red-700 hover:bg-red-800 text-white focus:ring-red-700"
            >
              {hardDeleteMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Excluindo...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Excluir definitivamente
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
