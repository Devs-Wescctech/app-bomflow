import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Edit, Trash2, UserCheck, UserX, Activity, Upload, Loader2, MessageSquare, Copy, Check, ExternalLink, MoreVertical, Clock, Users, Building2, Layers, Settings, ShieldX, KeyRound, Eye, EyeOff, Search, X, UserPlus, Server } from "lucide-react";
import { canManageAgents, isSupervisorType } from "@/components/utils/permissions.jsx";
/* NOVO — integração ERP */
import { createPessoaErp, createUsuarioErp, getPessoaByErp } from "@/api/erpClient";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const MENU_MODULES = [
  {
    id: "support",
    title: "Atendimento",
    items: [
      { id: "Dashboard", title: "Dashboard" },
      { id: "CreateTicket", title: "Criar Ticket" },
      { id: "QuickServiceRegister", title: "Atendimento Rápido" },
      { id: "QueueBoard", title: "Board de Filas" },
      { id: "TicketControl", title: "Controle de Tickets" },
      { id: "QuickServiceList", title: "Atendimentos Rápidos" },
      { id: "QualityMonitor", title: "Monitoria de Qualidade" },
      { id: "TicketReports", title: "Relatórios" },
      { id: "NPSDashboard", title: "Dashboard NPS" },
      { id: "MyTickets", title: "Meus Tickets" },
      { id: "KnowledgeBase", title: "Base de Conhecimento" },
    ]
  },
  {
    id: "presales",
    title: "Pré e Pós Vendas",
    items: [
      { id: "SalesQueueBoard", title: "Board de Vendas" },
      { id: "CreateSalesTicket", title: "Criar Ticket" },
      { id: "SalesTickets", title: "Tickets de Vendas" },
    ]
  },
  {
    id: "sales",
    title: "Vendas PF",
    items: [
      { id: "SalesDashboard", title: "Dashboard" },
      { id: "SalesAgentsDashboard", title: "Dashboard Vendedores" },
      { id: "NewLead", title: "Novo Lead" },
      { id: "LeadsKanban", title: "Pipeline" },
      { id: "SalesAgenda", title: "Agenda" },
      { id: "LeadSearch", title: "Busca de Leads" },
      { id: "LeadsMap", title: "Mapa de Leads" },
      { id: "SalesRoutes", title: "Rota Inteligente" },
      { id: "SalesReports", title: "Relatórios" },
      { id: "LeadAutomations", title: "Automações" },
      { id: "AutomationLogs", title: "Logs de Automações" },
      { id: "SalesTasks", title: "Tarefas" },
      { id: "ProposalTemplates", title: "Templates" },
    ]
  },
  {
    id: "sales_pj",
    title: "Vendas PJ",
    items: [
      { id: "SalesPJDashboard", title: "Dashboard" },
      { id: "SalesPJAgentsDashboard", title: "Dashboard Vendedores" },
      { id: "NewLeadPJ", title: "Novo Lead PJ" },
      { id: "LeadsPJKanban", title: "Pipeline B2B" },
      { id: "SalesAgenda", title: "Agenda" },
      { id: "LeadPJSearch", title: "Busca de Leads" },
      { id: "SalesPJReports", title: "Relatórios" },
      { id: "LeadPJAutomations", title: "Automações" },
      { id: "SalesTasks", title: "Tarefas" },
      { id: "ProposalTemplates", title: "Templates" },
    ]
  },
  {
    id: "referral",
    title: "Indicações",
    items: [
      { id: "IndicacoesMeuPainel", title: "Meu Painel" },
      { id: "ReferralDashboard", title: "Dashboard" },
      { id: "ReferralAgentsDashboard", title: "Dashboard Vendedores" },
      { id: "ReferralCreate", title: "Nova Indicação" },
      { id: "ReferralReactivation", title: "Nova Reativação" },
      { id: "ReferralReactivationReport", title: "Rel. de Reativações" },
      { id: "ReferralPipeline", title: "Pipeline" },
      { id: "ReferralReports", title: "Relatórios" },
      { id: "ReferralCommissions", title: "Comissões" },
      { id: "ReferralWonReport", title: "Rel. de Convertidos" },
      { id: "CommissionPaymentControl", title: "Ctrl. Pagamento" },
      { id: "CommissionPerspectivaControl", title: "Comissões ERP" },
      { id: "CommissionReconciliation", title: "Reconciliação" },
      { id: "ReferralRelacao", title: "Relação Indicações" },
      { id: "ReferralChannelAutomations", title: "Automações por Canal" },
      { id: "ReferralAutomations", title: "Automações" },
      { id: "AutomationLogs", title: "Logs de Automações" },
      { id: "LeadGenerator", title: "Gerador de Leads" },
      { id: "LeadGeneratorLogEstruturado", title: "Log Estruturado" },
    ]
  },
  {
    id: "sales_upsell",
    title: "Upsell",
    items: [
      { id: "SalesUpsellDashboard", title: "Dashboard" },
      { id: "SalesUpsellAgentsDashboard", title: "Dashboard Vendedores" },
      { id: "NewLeadUpsell", title: "Novo Lead Upsell" },
      { id: "LeadsUpsellKanban", title: "Pipeline Upsell" },
      { id: "SalesAgenda", title: "Agenda" },
      { id: "LeadUpsellSearch", title: "Busca de Leads" },
      { id: "SalesUpsellReports", title: "Relatórios" },
      { id: "SalesUpsellWonReport", title: "Rel. de Ganhos" },
      { id: "LeadUpsellAutomations", title: "Automações" },
      { id: "SalesTasks", title: "Tarefas" },
      { id: "ProposalTemplates", title: "Templates" },
      { id: "UpsellLeadGenerator", title: "Gerador de Leads" },
    ]
  },
  {
    id: "collection",
    title: "Cobrança",
    items: [
      { id: "CollectionDashboard", title: "Dashboard" },
      { id: "CollectionBoard", title: "Board" },
      { id: "CollectionAgenda", title: "Agenda" },
      { id: "CreateCollectionTicket", title: "Criar Cobrança" },
      { id: "CollectionReports", title: "Relatórios" },
    ]
  },
  {
    id: "bom_auto",
    title: "Bom Auto",
    items: [
      { id: "BomAutoConsulta", title: "Consulta Cliente" },
      { id: "BomAutoPainel", title: "Painel Operacional" },
      { id: "BomAutoRelatorio", title: "Relatório de Utilizações" },
    ]
  },
  {
    id: "apps",
    title: "APPs",
    items: [
      { id: "AppsHub", title: "Hub de APPs" },
    ]
  },
  {
    id: "config",
    title: "Configurações",
    items: [
      { id: "Agents", title: "Agentes" },
      { id: "TicketTypes", title: "Tipos de Ticket" },
      { id: "Templates", title: "Templates" },
      { id: "DistributionRules", title: "Distribuição de Tickets" },
      { id: "AIAgents", title: "Agentes de IA" },
    ]
  }
];

export default function Agents() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("agents");
  
  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const currentAgent = user?.agent;
  const isAdmin = user?.role === 'admin';
  const hasPermission = isAdmin || canManageAgents(currentAgent);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [showTokenField, setShowTokenField] = useState(false);
  const [channelTokenInput, setChannelTokenInput] = useState("");
  const [channelTokenChanged, setChannelTokenChanged] = useState(false);
  const [editingAgent, setEditingAgent] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  
  const [teamDialogOpen, setTeamDialogOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState(null);
  const [teamFormData, setTeamFormData] = useState({ name: "", description: "", supervisorEmails: [], active: true });
  
  const [queueDialogOpen, setQueueDialogOpen] = useState(false);
  const [editingQueue, setEditingQueue] = useState(null);
  const [queueFormData, setQueueFormData] = useState({ name: "", teamId: "", defaultPriority: "P3", active: true });

  const [typeDialogOpen, setTypeDialogOpen] = useState(false);
  const [editingType, setEditingType] = useState(null);
  const [typeFormData, setTypeFormData] = useState({ key: "", label: "", description: "", color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300", modules: [], allowedSubmenus: [], active: true });
  const [expandedModulesInForm, setExpandedModulesInForm] = useState([]);

  const [resetPasswordDialogOpen, setResetPasswordDialogOpen] = useState(false);
  const [selectedAgentForReset, setSelectedAgentForReset] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [resettingPassword, setResettingPassword] = useState(false);

  /* NOVO — estados de integração ERP */
  const [erpPessoaCode, setErpPessoaCode] = useState("");
  const [loadingErpPessoa, setLoadingErpPessoa] = useState(false);

  const [agentSearchName, setAgentSearchName] = useState("");
  const [agentFilterType, setAgentFilterType] = useState("all");
  const [agentFilterActive, setAgentFilterActive] = useState("all");
  const [agentFilterTeam, setAgentFilterTeam] = useState("all");

  const [formData, setFormData] = useState({
    name: "",
    cpf: "",
    photoUrl: "",
    email: "",
    password: "",
    agentType: "support",
    teamId: "",
    supervisorId: "",
    workUnit: "",
    erpAgentId: "",
    queueIds: [],
    level: "pleno",
    online: false,
    active: true,
    capacity: { P1: 2, P2: 5, P3: 10, P4: 20 },
    workingHours: { start: "08:00", end: "18:00", days: [1, 2, 3, 4, 5] },
    permissions: {
      can_view_all_leads: false,
      can_view_team_leads: false,
      can_view_all_tickets: false,
      can_view_team_tickets: false,
      can_access_reports: false,
      can_manage_agents: false,
      can_manage_settings: false,
    }
  });

  const { data: agents = [], isLoading: agentsLoading } = useQuery({
    queryKey: ['agents'],
    queryFn: () => base44.entities.Agent.list(),
    staleTime: 0,
    refetchOnMount: true,
    enabled: hasPermission,
  });

  const { data: teams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: () => base44.entities.Team.list(),
    staleTime: 0,
    refetchOnMount: true,
    enabled: hasPermission,
  });

  const { data: queues = [] } = useQuery({
    queryKey: ['queues'],
    queryFn: () => base44.entities.Queue.list(),
    staleTime: 0,
    refetchOnMount: true,
    enabled: hasPermission,
  });

  const { data: agentTypes = [] } = useQuery({
    queryKey: ['agent-types'],
    queryFn: () => base44.entities.AgentType.list(),
    staleTime: 0,
    refetchOnMount: true,
    enabled: hasPermission,
  });

  const createAgentMutation = useMutation({
    mutationFn: (data) => base44.entities.Agent.create(data),
    /* MODIFICADO — chama ERP após criar agente no BomFlow */
    onSuccess: async (novoAgente) => {
      if (erpPessoaCode && !formData.erpAgentId) {
        try {
          const result = await createUsuarioErp({
            login: formData.email.toLowerCase(),
            pessoa: erpPessoaCode,
            estabelecimento_padrao: 104,
            senha_prot: "bp@2026",
            copiar_direitos_de: "base.upsell",
            ativo: "S",
            super_usuario: "N",
            observacoes: "Criado via BomFlow"
          });
          await base44.entities.Agent.update(novoAgente.id, { erpAgentId: result.id });
          toast.success('Agente criado e usuário ERP vinculado com sucesso!');
        } catch (erpError) {
          toast.error('Agente criado no BomFlow, mas erro ao criar usuário no ERP: ' + erpError.message);
        }
      } else {
        toast.success('Agente criado com sucesso!');
      }
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast.error('Erro ao criar agente: ' + error.message);
    },
  });

  const updateAgentMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Agent.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      setIsDialogOpen(false);
      resetForm();
      toast.success('Agente atualizado com sucesso!');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar agente: ' + error.message);
    },
  });

  const deleteAgentMutation = useMutation({
    mutationFn: (id) => base44.entities.Agent.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      toast.success('Agente excluído com sucesso!');
    },
    onError: (error) => {
      toast.error('Erro ao excluir agente: ' + error.message);
    },
  });

  const createTeamMutation = useMutation({
    mutationFn: (data) => base44.entities.Team.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      setTeamDialogOpen(false);
      resetTeamForm();
      toast.success('Time criado com sucesso!');
    },
    onError: (error) => {
      toast.error('Erro ao criar time: ' + error.message);
    },
  });

  const updateTeamMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Team.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      setTeamDialogOpen(false);
      resetTeamForm();
      toast.success('Time atualizado com sucesso!');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar time: ' + error.message);
    },
  });

  const deleteTeamMutation = useMutation({
    mutationFn: (id) => base44.entities.Team.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      toast.success('Time excluído com sucesso!');
    },
    onError: (error) => {
      toast.error('Erro ao excluir time: ' + error.message);
    },
  });

  const createQueueMutation = useMutation({
    mutationFn: (data) => base44.entities.Queue.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queues'] });
      setQueueDialogOpen(false);
      resetQueueForm();
      toast.success('Fila criada com sucesso!');
    },
    onError: (error) => {
      toast.error('Erro ao criar fila: ' + error.message);
    },
  });

  const updateQueueMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Queue.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queues'] });
      setQueueDialogOpen(false);
      resetQueueForm();
      toast.success('Fila atualizada com sucesso!');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar fila: ' + error.message);
    },
  });

  const deleteQueueMutation = useMutation({
    mutationFn: (id) => base44.entities.Queue.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queues'] });
      toast.success('Fila excluída com sucesso!');
    },
    onError: (error) => {
      toast.error('Erro ao excluir fila: ' + error.message);
    },
  });

  const createTypeMutation = useMutation({
    mutationFn: (data) => base44.entities.AgentType.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-types'] });
      setTypeDialogOpen(false);
      resetTypeForm();
      toast.success('Tipo de agente criado com sucesso!');
    },
    onError: (error) => {
      toast.error('Erro ao criar tipo: ' + error.message);
    },
  });

  const updateTypeMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.AgentType.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-types'] });
      setTypeDialogOpen(false);
      resetTypeForm();
      toast.success('Tipo de agente atualizado com sucesso!');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar tipo: ' + error.message);
    },
  });

  const deleteTypeMutation = useMutation({
    mutationFn: (id) => base44.entities.AgentType.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-types'] });
      toast.success('Tipo de agente excluído com sucesso!');
    },
    onError: (error) => {
      toast.error('Erro ao excluir tipo: ' + error.message);
    },
  });

  const handleDelete = (agent) => {
    if (window.confirm(`Tem certeza que deseja excluir o agente "${agent.name}"? Esta ação não pode ser desfeita.`)) {
      deleteAgentMutation.mutate(agent.id);
    }
  };

  const handleDeleteTeam = (team) => {
    if (window.confirm(`Tem certeza que deseja excluir o time "${team.name}"? Esta ação não pode ser desfeita.`)) {
      deleteTeamMutation.mutate(team.id);
    }
  };

  const handleDeleteQueue = (queue) => {
    if (window.confirm(`Tem certeza que deseja excluir a fila "${queue.name}"? Esta ação não pode ser desfeita.`)) {
      deleteQueueMutation.mutate(queue.id);
    }
  };


  const handleResetPassword = async () => {
    if (!selectedAgentForReset || !newPassword) return;
    
    if (newPassword.length < 6) {
      toast.error('A senha deve ter pelo menos 6 caracteres');
      return;
    }
    
    setResettingPassword(true);
    try {
      const response = await fetch(`/api/agents/${selectedAgentForReset.id}/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({ newPassword })
      });
      
      const result = await response.json();
      
      if (response.ok && result.success) {
        toast.success(`Senha do agente ${selectedAgentForReset.name} redefinida com sucesso!`);
        setResetPasswordDialogOpen(false);
        setSelectedAgentForReset(null);
        setNewPassword("");
        queryClient.invalidateQueries({ queryKey: ['agents'] });
      } else {
        toast.error(result.message || 'Erro ao redefinir senha');
      }
    } catch (error) {
      console.error('Erro ao redefinir senha:', error);
      toast.error('Erro ao redefinir senha: ' + error.message);
    }
    setResettingPassword(false);
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const resetForm = () => {
    setFormData({
      name: "",
      cpf: "",
      photoUrl: "",
      email: "",
      password: "",
      agentType: "support",
      teamId: "",
      supervisorId: "",
      workUnit: "",
      erpAgentId: "",
      queueIds: [],
      level: "pleno",
      online: false,
      active: true,
      capacity: { P1: 2, P2: 5, P3: 10, P4: 20 },
      workingHours: { start: "08:00", end: "18:00", days: [1, 2, 3, 4, 5] },
      permissions: {
        can_view_all_leads: false,
        can_view_team_leads: false,
        can_view_all_tickets: false,
        can_view_team_tickets: false,
        can_access_reports: false,
        can_manage_agents: false,
        can_manage_settings: false,
      }
    });
    setEditingAgent(null);
    setChannelTokenInput("");
    setChannelTokenChanged(false);
    setShowTokenField(false);
    /* NOVO — reset estados ERP */
    setErpPessoaCode("");
    setLoadingErpPessoa(false);
  };

  const resetTeamForm = () => {
    setTeamFormData({ name: "", description: "", supervisorEmails: [], active: true });
    setEditingTeam(null);
  };

  const resetQueueForm = () => {
    setQueueFormData({ name: "", teamId: "", defaultPriority: "P3", active: true });
    setEditingQueue(null);
  };

  const resetTypeForm = () => {
    setTypeFormData({ key: "", label: "", description: "", color: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300", modules: [], allowedSubmenus: [], active: true });
    setEditingType(null);
    setExpandedModulesInForm([]);
  };

  const handleEditType = (type) => {
    setEditingType(type);
    setTypeFormData({
      key: type.key || "",
      label: type.label || "",
      description: type.description || "",
      color: type.color || "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
      modules: type.modules || [],
      allowedSubmenus: type.allowedSubmenus || [],
      active: type.active !== false,
    });
    setExpandedModulesInForm(type.modules || []);
    setTypeDialogOpen(true);
  };

  const handleDeleteType = (type) => {
    const agentCount = agents.filter(a => a.agentType === type.key).length;
    if (agentCount > 0) {
      toast.error(`Não é possível excluir: ${agentCount} agente(s) usam este tipo.`);
      return;
    }
    if (window.confirm(`Tem certeza que deseja excluir o tipo "${type.label}"?`)) {
      deleteTypeMutation.mutate(type.id);
    }
  };

  const handleTypeSubmit = () => {
    if (editingType) {
      updateTypeMutation.mutate({
        id: editingType.id,
        data: typeFormData
      });
    } else {
      createTypeMutation.mutate(typeFormData);
    }
  };

  const normalizePermissions = (perms) => {
    const defaults = {
      can_view_all_leads: false,
      can_view_team_leads: false,
      can_view_all_tickets: false,
      can_view_team_tickets: false,
      can_access_reports: false,
      can_manage_agents: false,
      can_manage_settings: false,
    };
    
    if (!perms) return defaults;
    
    let parsed = perms;
    if (typeof perms === 'string') {
      try {
        parsed = JSON.parse(perms);
      } catch {
        return defaults;
      }
    }
    
    return { ...defaults, ...parsed };
  };

  const handleEdit = async (agent) => {
    setEditingAgent(agent);
    setFormData({
      name: agent.name || "",
      cpf: agent.cpf || "",
      photoUrl: agent.photoUrl || "",
      email: agent.email || "",
      password: "",
      agentType: agent.agentType || "support",
      teamId: agent.teamId || "",
      supervisorId: agent.supervisorId || "",
      workUnit: agent.workUnit || "",
      erpAgentId: agent.erpAgentId != null ? String(agent.erpAgentId) : "",
      queueIds: agent.queueIds || [],
      level: agent.level || "pleno",
      online: agent.online || false,
      active: agent.active !== undefined ? agent.active : true,
      capacity: agent.capacity || { P1: 2, P2: 5, P3: 10, P4: 20 },
      workingHours: agent.workingHours || { start: "08:00", end: "18:00", days: [1, 2, 3, 4, 5] },
      permissions: normalizePermissions(agent.permissions)
    });
    setShowTokenField(false);
    setChannelTokenChanged(false);
    /* NOVO — preenche código da pessoa ERP ao editar */
    setErpPessoaCode(agent.erpPessoaCode || "");
    if (agent.agentType === 'indicacoes_atendente') {
      try {
        const token = localStorage.getItem('accessToken');
        const resp = await fetch(`/api/agents/${agent.id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (resp.ok) {
          const data = await resp.json();
          setChannelTokenInput(data.whatsappChannelToken || "");
        } else {
          setChannelTokenInput("");
        }
      } catch {
        setChannelTokenInput("");
      }
    } else {
      setChannelTokenInput("");
    }
    setIsDialogOpen(true);
  };

  const handleEditTeam = (team) => {
    setEditingTeam(team);
    setTeamFormData({
      name: team.name || "",
      description: team.description || "",
      supervisorEmails: team.supervisorEmails && team.supervisorEmails.length > 0
        ? team.supervisorEmails
        : (team.supervisorEmail ? [team.supervisorEmail] : []),
      active: team.active !== undefined ? team.active : true,
    });
    setTeamDialogOpen(true);
  };

  const handleEditQueue = (queue) => {
    setEditingQueue(queue);
    setQueueFormData({
      name: queue.name || "",
      teamId: queue.teamId || "",
      defaultPriority: queue.defaultPriority || "P3",
      active: queue.active !== undefined ? queue.active : true,
    });
    setQueueDialogOpen(true);
  };

  const formatCPF = (value) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 11) {
      return numbers.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    }
    return value;
  };

  const handleCpfChange = (e) => {
    const formatted = formatCPF(e.target.value);
    setFormData({...formData, cpf: formatted});
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Arquivo muito grande. Máximo 5MB.');
      return;
    }
    
    setUploadingPhoto(true);
    try {
      const formDataUpload = new FormData();
      formDataUpload.append('file', file);
      
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: formDataUpload
      });
      
      const result = await response.json();
      if (result.url) {
        setFormData({...formData, photoUrl: result.url});
        toast.success('Foto enviada com sucesso!');
      }
    } catch (error) {
      toast.error('Erro ao enviar foto: ' + error.message);
    }
    setUploadingPhoto(false);
  };

  /* NOVO — busca ou cria Pessoa ERP pelo CPF do agente */
  const handleBuscarOuCriarPessoaErp = async () => {
    if (!formData.cpf) {
      toast.error("Preencha o CPF antes de buscar/criar a pessoa no ERP.");
      return;
    }
    setLoadingErpPessoa(true);
    try {
      const pessoa = await getPessoaByErp(formData.cpf);
      if (pessoa) {
        setErpPessoaCode(pessoa.pessoa);
        toast.success("Pessoa encontrada no ERP: " + pessoa.nome_completo);
      } else {
        const result = await createPessoaErp({
          tipo_pessoa: "Física",
          nome_completo: formData.name.toUpperCase(),
          cpf: formData.cpf,
          situacao: "A"
        });
        setErpPessoaCode(result.pessoa);
        toast.success("Pessoa criada no ERP com sucesso!");
      }
    } catch (error) {
      toast.error("Erro ao buscar/criar pessoa no ERP: " + error.message);
    }
    setLoadingErpPessoa(false);
  };

  const handleSubmit = () => {
    if (formData.erpAgentId && isNaN(Number(formData.erpAgentId))) {
      toast.error("ID do Agente no ERP deve ser numérico.");
      return;
    }

    const dataToSend = { 
      ...formData,
      erpAgentId: formData.erpAgentId ? Number(formData.erpAgentId) : null,
      supervisorId: formData.supervisorId && formData.supervisorId !== "none" ? formData.supervisorId : null,
      permissions: normalizePermissions(formData.permissions)
    };
    
    if (editingAgent) {
      if (!dataToSend.password) {
        delete dataToSend.password;
      }
      if (channelTokenChanged) {
        dataToSend.whatsappChannelToken = channelTokenInput || null;
      }
      updateAgentMutation.mutate({
        id: editingAgent.id,
        data: dataToSend
      });
    } else {
      createAgentMutation.mutate(dataToSend);
    }
  };

  const handleTeamSubmit = () => {
    if (editingTeam) {
      updateTeamMutation.mutate({
        id: editingTeam.id,
        data: teamFormData
      });
    } else {
      createTeamMutation.mutate(teamFormData);
    }
  };

  const handleQueueSubmit = () => {
    if (editingQueue) {
      updateQueueMutation.mutate({
        id: editingQueue.id,
        data: queueFormData
      });
    } else {
      createQueueMutation.mutate(queueFormData);
    }
  };

  const getTeamName = (teamId) => {
    const team = teams.find(t => t.id === teamId);
    return team?.name || '-';
  };

  const getSupervisorName = (supervisorId) => {
    const supervisor = agents.find(a => a.id === supervisorId);
    return supervisor?.name || null;
  };

  const isSupervisorAgent = (a) => isSupervisorType(a.agentType) || a.agentType === 'admin';

  const getSupervisorsForTeam = (_teamId) => {
    return [...agents]
      .filter(a => isSupervisorAgent(a))
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR'));
  };

  const getQueueNames = (queueIds) => {
    if (!queueIds || queueIds.length === 0) return '-';
    return queueIds.map(qid => {
      const queue = queues.find(q => q.id === qid);
      return queue?.name || qid;
    }).join(', ');
  };

  const getAgentCountByTeam = (teamId) => {
    return agents.filter(a => a.teamId === teamId).length;
  };

  const getQueueCountByTeam = (teamId) => {
    return queues.filter(q => q.teamId === teamId).length;
  };

  const AGENT_TYPE_CONFIG = {
    admin: { label: "Admin", color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300", description: "Acesso irrestrito a todas as configurações e dados" },
    supervisor: { label: "Supervisor", color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300", description: "Gestão de equipes, vê tickets/leads do time" },
    sales_supervisor: { label: "Supervisor de Vendas", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300", description: "Gestão de equipe de vendas PF/PJ e indicações" },
    support: { label: "Suporte", color: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300", description: "Agente de atendimento N1/N2" },
    sales: { label: "Vendas", color: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300", description: "Fechamento de vendas e carteira de clientes" },
    pre_sales: { label: "Pré-Vendas", color: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300", description: "SDR/BDR - Qualificação de leads (Pre-Sales)" },
    post_sales: { label: "Pós-Vendas", color: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300", description: "Customer Success e retenção" },
    collection: { label: "Cobrança", color: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300", description: "Recuperação de crédito e acordos" },
  };

  const PRIORITY_CONFIG = {
    P1: { label: "P1 - Crítica", color: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" },
    P2: { label: "P2 - Alta", color: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300" },
    P3: { label: "P3 - Média", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300" },
    P4: { label: "P4 - Baixa", color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
  };

  const getAgentTypeBadge = (type) => {
    const dbType = agentTypes.find(t => t.key === type);
    if (dbType) {
      return { label: dbType.label, color: dbType.color, description: dbType.description };
    }
    return AGENT_TYPE_CONFIG[type] || AGENT_TYPE_CONFIG.support;
  };

  const filteredAgents = agents.filter(agent => {
    const matchesName = !agentSearchName || agent.name?.toLowerCase().includes(agentSearchName.toLowerCase());
    const matchesType = agentFilterType === "all" || agent.agentType === agentFilterType;
    const matchesActive = agentFilterActive === "all"
      ? true
      : agentFilterActive === "active"
      ? agent.active !== false
      : agent.active === false;
    const matchesTeam = agentFilterTeam === "all" || agent.teamId === agentFilterTeam;
    return matchesName && matchesType && matchesActive && matchesTeam;
  });

  const hasAgentFilters = agentSearchName || agentFilterType !== "all" || agentFilterActive !== "all" || agentFilterTeam !== "all";

  const clearAgentFilters = () => {
    setAgentSearchName("");
    setAgentFilterType("all");
    setAgentFilterActive("all");
    setAgentFilterTeam("all");
  };

  if (!hasPermission) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-gray-950">
        <Card className="max-w-md bg-white dark:bg-gray-900">
          <CardContent className="p-8 text-center">
            <ShieldX className="w-16 h-16 mx-auto mb-4 text-red-500" />
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Acesso Restrito</h2>
            <p className="text-gray-600 dark:text-gray-400">
              Você não tem permissão para acessar a gestão de agentes.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-950 min-h-screen">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Gestão de Equipe</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Gerencie agentes, times e filas de atendimento
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-1">
          <TabsTrigger value="agents" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
            <Users className="w-4 h-4 mr-2" />
            Agentes
          </TabsTrigger>
          <TabsTrigger value="teams" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
            <Building2 className="w-4 h-4 mr-2" />
            Times
          </TabsTrigger>
          <TabsTrigger value="queues" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
            <Layers className="w-4 h-4 mr-2" />
            Filas
          </TabsTrigger>
          <TabsTrigger value="types" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
            <Settings className="w-4 h-4 mr-2" />
            Tipos de Agente
          </TabsTrigger>
        </TabsList>

        <TabsContent value="agents" className="mt-6">
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-gray-500">
              {filteredAgents.length !== agents.length
                ? `${filteredAgents.length} de ${agents.length} agente(s)`
                : `${agents.length} agente(s) cadastrado(s)`}
            </p>
            <Button 
              onClick={() => {
                resetForm();
                setIsDialogOpen(true);
              }}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Novo Agente
            </Button>
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <Input
                placeholder="Buscar por nome..."
                value={agentSearchName}
                onChange={e => setAgentSearchName(e.target.value)}
                className="pl-8 h-9 text-sm"
              />
            </div>
            <Select value={agentFilterType} onValueChange={setAgentFilterType}>
              <SelectTrigger className="w-[170px] h-9 text-sm">
                <SelectValue placeholder="Tipo de agente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                {agentTypes.map(t => (
                  <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={agentFilterActive} onValueChange={setAgentFilterActive}>
              <SelectTrigger className="w-[140px] h-9 text-sm">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="active">Ativos</SelectItem>
                <SelectItem value="inactive">Inativos</SelectItem>
              </SelectContent>
            </Select>
            <Select value={agentFilterTeam} onValueChange={setAgentFilterTeam}>
              <SelectTrigger className="w-[160px] h-9 text-sm">
                <SelectValue placeholder="Time" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os times</SelectItem>
                {teams.map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {hasAgentFilters && (
              <Button variant="ghost" size="sm" onClick={clearAgentFilters} className="h-9 px-2 text-gray-500 hover:text-gray-900">
                <X className="w-4 h-4 mr-1" />
                Limpar
              </Button>
            )}
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredAgents.map(agent => {
              const typeBadge = getAgentTypeBadge(agent.agentType);
              
              return (
                <Card key={agent.id} className={`border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:shadow-md transition-shadow ${!agent.active ? 'opacity-60' : ''}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="relative shrink-0">
                          {agent.photoUrl ? (
                            <img 
                              src={agent.photoUrl} 
                              alt={agent.name}
                              className="w-12 h-12 rounded-full object-cover ring-2 ring-blue-100 dark:ring-blue-900"
                            />
                          ) : (
                            <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center ring-2 ring-blue-100 dark:ring-blue-900">
                              <span className="text-white font-semibold text-lg">
                                {agent.name?.charAt(0)?.toUpperCase() || 'A'}
                              </span>
                            </div>
                          )}
                          {agent.online && (
                            <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 rounded-full ring-2 ring-white dark:ring-gray-900"></div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-base text-gray-900 dark:text-gray-100 truncate">{agent.name}</CardTitle>
                          <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{agent.email}</p>
                        </div>
                      </div>
                      
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-gray-100 dark:hover:bg-gray-800">
                            <MoreVertical className="w-4 h-4 text-gray-500" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem onClick={() => handleEdit(agent)} className="cursor-pointer">
                            <Edit className="w-4 h-4 mr-2" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => {
                              setSelectedAgentForReset(agent);
                              setNewPassword("");
                              setResetPasswordDialogOpen(true);
                            }} 
                            className="cursor-pointer"
                          >
                            <KeyRound className="w-4 h-4 mr-2 text-orange-600" />
                            Redefinir Senha
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleDelete(agent)} className="cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-950">
                            <Trash2 className="w-4 h-4 mr-2" />
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardHeader>
                  
                  <CardContent className="pt-0">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Badge className={typeBadge.color}>{typeBadge.label}</Badge>
                        <Badge variant="outline" className="bg-gray-50 dark:bg-gray-800">{agent.level || 'Pleno'}</Badge>
                      </div>
                      
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4 text-gray-400" />
                          <span className="text-gray-600 dark:text-gray-400">{getTeamName(agent.teamId)}</span>
                        </div>
                        {agent.supervisorId && getSupervisorName(agent.supervisorId) && (
                          <div className="flex items-center gap-2">
                            <UserCheck className="w-4 h-4 text-gray-400" />
                            <span className="text-gray-600 dark:text-gray-400 text-xs">{getSupervisorName(agent.supervisorId)}</span>
                          </div>
                        )}
                        {agent.workUnit && (
                          <div className="flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-gray-400" />
                            <span className="text-gray-600 dark:text-gray-400">{agent.workUnit}</span>
                          </div>
                        )}
                        {agent.workingHours && (
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-gray-400" />
                            <span className="text-gray-600 dark:text-gray-400">
                              {agent.workingHours.start || '08:00'} - {agent.workingHours.end || '18:00'}
                            </span>
                          </div>
                        )}
                      </div>
                      
                      {(agent.queueIds && agent.queueIds.length > 0) && (
                        <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Filas:</p>
                          <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2">{getQueueNames(agent.queueIds)}</p>
                        </div>
                      )}
                      
                      
                      <div className="flex items-center gap-2 pt-2">
                        {agent.online ? (
                          <Badge className="bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300">
                            <UserCheck className="w-3 h-3 mr-1" />
                            Online
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800">
                            <UserX className="w-3 h-3 mr-1" />
                            Offline
                          </Badge>
                        )}
                        {!agent.active && (
                          <Badge variant="outline" className="bg-gray-100 dark:bg-gray-800">
                            Inativo
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="teams" className="mt-6">
          <div className="bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-950/20 dark:to-cyan-950/20 rounded-xl p-4 mb-6 border border-blue-100 dark:border-blue-900">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                  <Users className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Times</h3>
                  <p className="text-sm text-gray-500">{teams.length} time(s) • {teams.filter(t => t.active).length} ativo(s)</p>
                </div>
              </div>
              <Button 
                onClick={() => {
                  resetTeamForm();
                  setTeamDialogOpen(true);
                }}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                Novo Time
              </Button>
            </div>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {teams.map(team => {
              const agentCount = getAgentCountByTeam(team.id);
              const queueCount = getQueueCountByTeam(team.id);
              
              return (
                <Card key={team.id} className={`border-2 border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-lg transition-all ${!team.active ? 'opacity-60' : ''}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center shadow-lg">
                          <Building2 className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          <CardTitle className="text-base font-semibold text-gray-900 dark:text-gray-100">{team.name}</CardTitle>
                          {(() => {
                            const emails = team.supervisorEmails && team.supervisorEmails.length > 0
                              ? team.supervisorEmails
                              : (team.supervisorEmail ? [team.supervisorEmail] : []);
                            if (emails.length === 0) return null;
                            const names = emails.map(email => {
                              const ag = agents?.find(a => a.email === email);
                              return ag ? ag.name : email;
                            }).join(', ');
                            return <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[180px]">{names}</p>;
                          })()}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-1">
                        {team.active ? (
                          <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
                        ) : (
                          <div className="w-2.5 h-2.5 rounded-full bg-gray-400" />
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-gray-100 dark:hover:bg-gray-800">
                              <MoreVertical className="w-4 h-4 text-gray-500" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuItem onClick={() => handleEditTeam(team)} className="cursor-pointer">
                              <Edit className="w-4 h-4 mr-2" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleDeleteTeam(team)} className="cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-950">
                              <Trash2 className="w-4 h-4 mr-2" />
                              Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </CardHeader>
                  
                  <CardContent className="pt-0 space-y-3">
                    {team.description && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">{team.description}</p>
                    )}
                    
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex items-center gap-2 p-2 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
                        <Users className="w-4 h-4 text-blue-500" />
                        <div>
                          <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{agentCount}</p>
                          <p className="text-xs text-gray-500">Agentes</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 p-2 bg-purple-50 dark:bg-purple-950/30 rounded-lg">
                        <Layers className="w-4 h-4 text-purple-500" />
                        <div>
                          <p className="text-lg font-bold text-purple-600 dark:text-purple-400">{queueCount}</p>
                          <p className="text-xs text-gray-500">Filas</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="queues" className="mt-6">
          <div className="bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/20 dark:to-teal-950/20 rounded-xl p-4 mb-6 border border-emerald-100 dark:border-emerald-900">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center">
                  <Layers className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Filas</h3>
                  <p className="text-sm text-gray-500">{queues.length} fila(s) • {queues.filter(q => q.active).length} ativa(s)</p>
                </div>
              </div>
              <Button 
                onClick={() => {
                  resetQueueForm();
                  setQueueDialogOpen(true);
                }}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                Nova Fila
              </Button>
            </div>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {queues.map(queue => {
              const priorityConfig = PRIORITY_CONFIG[queue.defaultPriority] || PRIORITY_CONFIG.P3;
              const agentCount = agents?.filter(a => a.queue_ids?.includes(queue.id)).length || 0;
              
              return (
                <Card key={queue.id} className={`border-2 border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-emerald-300 dark:hover:border-emerald-700 hover:shadow-lg transition-all ${!queue.active ? 'opacity-60' : ''}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl flex items-center justify-center shadow-lg">
                          <Layers className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          <CardTitle className="text-base font-semibold text-gray-900 dark:text-gray-100">{queue.name}</CardTitle>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{getTeamName(queue.teamId)}</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-1">
                        {queue.active ? (
                          <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
                        ) : (
                          <div className="w-2.5 h-2.5 rounded-full bg-gray-400" />
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-gray-100 dark:hover:bg-gray-800">
                              <MoreVertical className="w-4 h-4 text-gray-500" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuItem onClick={() => handleEditQueue(queue)} className="cursor-pointer">
                              <Edit className="w-4 h-4 mr-2" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleDeleteQueue(queue)} className="cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-950">
                              <Trash2 className="w-4 h-4 mr-2" />
                              Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </CardHeader>
                  
                  <CardContent className="pt-0 space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex items-center gap-2 p-2 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg">
                        <Users className="w-4 h-4 text-emerald-500" />
                        <div>
                          <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{agentCount}</p>
                          <p className="text-xs text-gray-500">Agentes</p>
                        </div>
                      </div>
                      <div className={`flex items-center gap-2 p-2 rounded-lg ${
                        queue.defaultPriority === 'P1' ? 'bg-red-50 dark:bg-red-950/30' :
                        queue.defaultPriority === 'P2' ? 'bg-orange-50 dark:bg-orange-950/30' :
                        queue.defaultPriority === 'P3' ? 'bg-yellow-50 dark:bg-yellow-950/30' :
                        'bg-green-50 dark:bg-green-950/30'
                      }`}>
                        <Clock className={`w-4 h-4 ${
                          queue.defaultPriority === 'P1' ? 'text-red-500' :
                          queue.defaultPriority === 'P2' ? 'text-orange-500' :
                          queue.defaultPriority === 'P3' ? 'text-yellow-500' :
                          'text-green-500'
                        }`} />
                        <div>
                          <p className={`text-lg font-bold ${
                            queue.defaultPriority === 'P1' ? 'text-red-600 dark:text-red-400' :
                            queue.defaultPriority === 'P2' ? 'text-orange-600 dark:text-orange-400' :
                            queue.defaultPriority === 'P3' ? 'text-yellow-600 dark:text-yellow-400' :
                            'text-green-600 dark:text-green-400'
                          }`}>{queue.defaultPriority}</p>
                          <p className="text-xs text-gray-500">Prioridade</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="types" className="mt-6">
          <div className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/20 dark:to-purple-950/20 rounded-xl p-4 mb-6 border border-indigo-100 dark:border-indigo-900">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center">
                  <Settings className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Tipos de Agente</h3>
                  <p className="text-sm text-gray-500">{agentTypes.length} tipo(s) • Controle de permissões e acessos</p>
                </div>
              </div>
              <Button 
                onClick={() => {
                  resetTypeForm();
                  setTypeDialogOpen(true);
                }}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                Novo Tipo
              </Button>
            </div>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {agentTypes.map((type) => {
              const agentCount = agents.filter(a => a.agentType === type.key).length;
              
              return (
                <Card key={type.id} className={`border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:shadow-md transition-shadow ${!type.active ? 'opacity-60' : ''}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <Badge className={`${type.color || 'bg-gray-100 text-gray-700'} px-3 py-1`}>{type.label}</Badge>
                      </div>
                      
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-gray-100 dark:hover:bg-gray-800">
                            <MoreVertical className="w-4 h-4 text-gray-500" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem onClick={() => handleEditType(type)} className="cursor-pointer">
                            <Edit className="w-4 h-4 mr-2" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleDeleteType(type)} className="cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-950">
                            <Trash2 className="w-4 h-4 mr-2" />
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardHeader>
                  
                  <CardContent className="pt-0 space-y-3">
                    <p className="text-sm text-gray-600 dark:text-gray-400">{type.description}</p>
                    
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm">
                        <Users className="w-4 h-4 text-gray-400" />
                        <span className="text-gray-600 dark:text-gray-400">{agentCount} agente(s)</span>
                      </div>
                      {type.active ? (
                        <Badge className="bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300">Ativo</Badge>
                      ) : (
                        <Badge variant="outline" className="text-gray-500 dark:text-gray-400">Inativo</Badge>
                      )}
                    </div>
                    
                    <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Módulos de acesso:</p>
                      <div className="flex flex-wrap gap-1">
                        {type.modules && type.modules.length > 0 ? (
                          type.modules.map((mod, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">{mod}</Badge>
                          ))
                        ) : (
                          <span className="text-xs text-gray-400">Nenhum módulo</span>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>

      {/* Dialog Reset Password */}
      <Dialog open={resetPasswordDialogOpen} onOpenChange={setResetPasswordDialogOpen}>
        <DialogContent className="max-w-md bg-white dark:bg-gray-900">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
              <KeyRound className="w-5 h-5 text-orange-600 dark:text-orange-400" />
              Redefinir Senha
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <Alert className="bg-orange-50 dark:bg-orange-950 border-orange-200 dark:border-orange-800">
              <KeyRound className="w-4 h-4 text-orange-600 dark:text-orange-400" />
              <AlertDescription className="text-orange-800 dark:text-orange-300">
                <p className="text-sm">
                  Você está redefinindo a senha de <strong>{selectedAgentForReset?.name}</strong>.
                </p>
                <p className="text-sm mt-1">
                  O agente será solicitado a alterar a senha no próximo login.
                </p>
              </AlertDescription>
            </Alert>

            <div>
              <Label className="text-gray-900 dark:text-gray-100 mb-2 block">Nova Senha</Label>
              <Input 
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Digite a nova senha (mín. 6 caracteres)"
                className="bg-white dark:bg-gray-800"
              />
              <p className="text-xs text-gray-500 mt-1">A senha deve ter pelo menos 6 caracteres</p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button 
              variant="outline"
              onClick={() => {
                setResetPasswordDialogOpen(false);
                setSelectedAgentForReset(null);
                setNewPassword("");
              }}
            >
              Cancelar
            </Button>
            <Button 
              onClick={handleResetPassword}
              disabled={resettingPassword || !newPassword || newPassword.length < 6}
              className="bg-orange-600 hover:bg-orange-700"
            >
              {resettingPassword ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Redefinindo...
                </>
              ) : (
                'Redefinir Senha'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sheet para Criar/Editar Agente */}
      <Sheet open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <SheetContent side="right" className="w-full sm:max-w-xl md:max-w-2xl bg-white dark:bg-gray-900 p-0 flex flex-col">
          <SheetHeader className="px-6 py-5 border-b border-gray-200 dark:border-gray-800 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                <Users className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <SheetTitle className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                  {editingAgent ? 'Editar Agente' : 'Novo Agente'}
                </SheetTitle>
                <SheetDescription className="text-gray-500 dark:text-gray-400">
                  Gerencie informações, acessos e permissões do agente
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>
          
          <div className="flex-1 overflow-y-auto px-6">
            <div className="space-y-4 py-4">
              {/* NOVO — Seção Integração ERP */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Server className="w-4 h-4 text-violet-500" />
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Integração ERP</span>
                </div>
                <div className="p-4 bg-violet-50 dark:bg-violet-950/20 rounded-xl border border-violet-100 dark:border-violet-900 space-y-4">

                  {/* A — Login ERP (read-only, derivado do e-mail) */}
                  <div>
                    <Label className="text-gray-900 dark:text-gray-100">Login ERP</Label>
                    <Input
                      value={formData.email ? formData.email.toLowerCase() : ""}
                      readOnly
                      disabled
                      placeholder="Preenchido automaticamente com o e-mail"
                      className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 opacity-70 cursor-not-allowed"
                    />
                    <p className="text-xs text-gray-500 mt-1">Será usado o e-mail do agente como login no ERP.</p>
                  </div>

                  {/* B — Código da Pessoa no ERP */}
                  <div>
                    <Label className="text-gray-900 dark:text-gray-100">Código da Pessoa no ERP</Label>
                    <div className="flex gap-2 mt-1">
                      <Input
                        value={erpPessoaCode}
                        onChange={(e) => setErpPessoaCode(e.target.value)}
                        placeholder="Ex: PESSOA123"
                        className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleBuscarOuCriarPessoaErp}
                        disabled={loadingErpPessoa}
                        className="bg-violet-600 hover:bg-violet-700 text-white shrink-0"
                      >
                        {loadingErpPessoa ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <UserPlus className="w-4 h-4" />
                        )}
                        <span className="ml-1.5 hidden sm:inline">
                          {loadingErpPessoa ? "Buscando..." : "Buscar/Criar"}
                        </span>
                      </Button>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Código da pessoa vinculada a este usuário no ERP. Clique no botão para buscar pelo CPF ou criar automaticamente.
                    </p>
                  </div>

                  {/* C — Indicador de status da vinculação ERP */}
                  <div>
                    {formData.erpAgentId ? (
                      <Badge className="bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300">
                        Usuário ERP vinculado (ID: {formData.erpAgentId})
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800">
                        Sem usuário ERP vinculado
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* Upload de Foto */}
              <div className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                {formData.photoUrl ? (
                  <img 
                    src={formData.photoUrl} 
                    alt="Foto do agente"
                    className="w-16 h-16 rounded-full object-cover border-2 border-blue-200 dark:border-blue-800"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center border-2 border-blue-200 dark:border-blue-800">
                    <span className="text-2xl font-bold text-white">
                      {formData.name?.charAt(0)?.toUpperCase() || '?'}
                    </span>
                  </div>
                )}
                <div className="flex-1">
                  <Label className="text-gray-900 dark:text-gray-100">Foto do Agente</Label>
                  <div className="flex items-center gap-2 mt-2">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoUpload}
                      disabled={uploadingPhoto}
                      id="photo-upload"
                      className="hidden"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => document.getElementById('photo-upload').click()}
                      disabled={uploadingPhoto}
                    >
                      {uploadingPhoto ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Carregando...
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4 mr-2" />
                          Upload
                        </>
                      )}
                    </Button>
                    {formData.photoUrl && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setFormData({...formData, photoUrl: ""})}
                      >
                        Remover
                      </Button>
                    )}
                  </div>
                </div>
              </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label className="text-gray-900 dark:text-gray-100">Nome Completo *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  placeholder="Nome completo do agente"
                  className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                />
              </div>

              <div>
                <Label className="text-gray-900 dark:text-gray-100">CPF *</Label>
                <Input
                  value={formData.cpf}
                  onChange={handleCpfChange}
                  placeholder="000.000.000-00"
                  maxLength={14}
                  className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                />
              </div>

              <div>
                <Label className="text-gray-900 dark:text-gray-100">Email (Login) *</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  placeholder="email@exemplo.com"
                  className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                />
              </div>

              <div>
                <Label className="text-gray-900 dark:text-gray-100">
                  {editingAgent ? 'Nova Senha (deixe vazio para manter)' : 'Senha *'}
                </Label>
                <Input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({...formData, password: e.target.value})}
                  placeholder={editingAgent ? "••••••••" : "Defina uma senha"}
                  className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                />
                {!editingAgent && (
                  <p className="text-xs text-gray-500 mt-1">Mínimo 6 caracteres</p>
                )}
              </div>

              <div>
                <Label className="text-gray-900 dark:text-gray-100">Tipo de Agente *</Label>
                <Select value={formData.agentType} onValueChange={(val) => setFormData({...formData, agentType: val})}>
                  <SelectTrigger className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {agentTypes.filter(t => t.active).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR')).map((type) => (
                      <SelectItem key={type.key} value={type.key}>{type.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-gray-900 dark:text-gray-100">Nível</Label>
                <Select value={formData.level} onValueChange={(val) => setFormData({...formData, level: val})}>
                  <SelectTrigger className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                    <SelectValue placeholder="Selecione o nível" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="specialist">Especialista</SelectItem>
                    <SelectItem value="junior">Junior</SelectItem>
                    <SelectItem value="pleno">Pleno</SelectItem>
                    <SelectItem value="senior">Senior</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-gray-900 dark:text-gray-100">Time *</Label>
                <Select value={formData.teamId} onValueChange={(val) => setFormData({...formData, teamId: val, supervisorId: ""})}>
                  <SelectTrigger className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                    <SelectValue placeholder="Selecione o time" />
                  </SelectTrigger>
                  <SelectContent>
                    {[...teams].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR')).map(team => (
                      <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-gray-900 dark:text-gray-100">Supervisor</Label>
                <Select
                  value={formData.supervisorId}
                  onValueChange={(val) => setFormData({...formData, supervisorId: val})}
                  disabled={!formData.teamId}
                >
                  <SelectTrigger className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                    <SelectValue placeholder={formData.teamId ? "Selecione o supervisor" : "Selecione um time primeiro"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem supervisor</SelectItem>
                    {getSupervisorsForTeam(formData.teamId).map(sup => (
                      <SelectItem key={sup.id} value={sup.id}>{sup.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {formData.teamId && getSupervisorsForTeam(formData.teamId).length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">Nenhum supervisor encontrado para este time.</p>
                )}
                {formData.teamId && agents.filter(a => isSupervisorAgent(a) && a.teamId === formData.teamId).length === 0 && agents.filter(a => isSupervisorAgent(a)).length > 0 && (
                  <p className="text-xs text-blue-500 mt-1">Exibindo todos os supervisores (nenhum vinculado a este time).</p>
                )}
              </div>

              <div>
                <Label className="text-gray-900 dark:text-gray-100">Unidade de Trabalho</Label>
                <Input
                  value={formData.workUnit}
                  onChange={(e) => setFormData({...formData, workUnit: e.target.value})}
                  placeholder="Ex: Matriz, Filial SP"
                  className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                />
              </div>

              <div>
                <Label className="text-gray-900 dark:text-gray-100">ID do Agente no ERP</Label>
                <Input
                  type="number"
                  value={formData.erpAgentId}
                  onChange={(e) => setFormData({...formData, erpAgentId: e.target.value})}
                  placeholder="Ex: 12345"
                  className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                />
                <p className="text-xs text-gray-400 mt-1">Identificador do agente no sistema ERP (opcional)</p>
              </div>
            </div>

            {editingAgent && formData.agentType === 'indicacoes_atendente' && (
              <div>
                <Label className="text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-green-600" />
                  Token do Canal WhatsApp (Rudo/WHU)
                </Label>
                <div className="flex gap-2 mt-1">
                  <div className="relative flex-1">
                    <Input
                      type={showTokenField ? "text" : "password"}
                      value={channelTokenInput}
                      onChange={(e) => { setChannelTokenInput(e.target.value); setChannelTokenChanged(true); }}
                      placeholder="Cole o token do canal aqui"
                      className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                      onClick={() => setShowTokenField(!showTokenField)}
                    >
                      {showTokenField ? <EyeOff className="w-4 h-4 text-gray-400" /> : <Eye className="w-4 h-4 text-gray-400" />}
                    </Button>
                  </div>
                  {channelTokenInput && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-red-600 border-red-200 hover:bg-red-50"
                      onClick={() => { setChannelTokenInput(""); setChannelTokenChanged(true); }}
                    >
                      Limpar
                    </Button>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-1">Token usado para enviar mensagens WhatsApp pela API Rudo. Salve o agente para aplicar.</p>
              </div>
            )}

            <div>
              <Label className="text-gray-900 dark:text-gray-100 mb-2 block">Filas de Atendimento *</Label>
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 max-h-40 overflow-y-auto bg-white dark:bg-gray-800">
                {queues.map(queue => (
                  <div key={queue.id} className="flex items-center gap-2 py-1">
                    <Checkbox
                      id={`queue-${queue.id}`}
                      checked={(formData.queueIds || []).includes(queue.id)}
                      onCheckedChange={(checked) => {
                        const current = formData.queueIds || [];
                        if (checked) {
                          setFormData({...formData, queueIds: [...current, queue.id]});
                        } else {
                          setFormData({...formData, queueIds: current.filter(id => id !== queue.id)});
                        }
                      }}
                    />
                    <Label htmlFor={`queue-${queue.id}`} className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                      {queue.name}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-900 dark:text-gray-100">Horário Início</Label>
                <Input
                  type="time"
                  value={formData.workingHours?.start || "08:00"}
                  onChange={(e) => setFormData({
                    ...formData, 
                    workingHours: {...formData.workingHours, start: e.target.value}
                  })}
                  className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                />
              </div>
              <div>
                <Label className="text-gray-900 dark:text-gray-100">Horário Fim</Label>
                <Input
                  type="time"
                  value={formData.workingHours?.end || "18:00"}
                  onChange={(e) => setFormData({
                    ...formData, 
                    workingHours: {...formData.workingHours, end: e.target.value}
                  })}
                  className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                />
              </div>
            </div>

            <div>
              <Label className="text-gray-900 dark:text-gray-100 mb-2 block">Dias de Trabalho</Label>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: 0, label: 'Dom' },
                  { value: 1, label: 'Seg' },
                  { value: 2, label: 'Ter' },
                  { value: 3, label: 'Qua' },
                  { value: 4, label: 'Qui' },
                  { value: 5, label: 'Sex' },
                  { value: 6, label: 'Sáb' },
                ].map(day => (
                  <Button
                    key={day.value}
                    type="button"
                    variant={(formData.workingHours?.days || []).includes(day.value) ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      const days = formData.workingHours?.days || [];
                      if (days.includes(day.value)) {
                        setFormData({
                          ...formData,
                          workingHours: {...formData.workingHours, days: days.filter(d => d !== day.value)}
                        });
                      } else {
                        setFormData({
                          ...formData,
                          workingHours: {...formData.workingHours, days: [...days, day.value].sort()}
                        });
                      }
                    }}
                    className={(formData.workingHours?.days || []).includes(day.value) ? "bg-blue-600" : ""}
                  >
                    {day.label}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-gray-900 dark:text-gray-100 mb-2 block">Capacidade por Prioridade</Label>
              <div className="grid grid-cols-4 gap-2">
                {['P1', 'P2', 'P3', 'P4'].map(priority => (
                  <div key={priority}>
                    <Label className="text-xs text-gray-500">{priority}</Label>
                    <Input
                      type="number"
                      min="0"
                      value={formData.capacity?.[priority] || 0}
                      onChange={(e) => setFormData({
                        ...formData,
                        capacity: {...formData.capacity, [priority]: parseInt(e.target.value) || 0}
                      })}
                      className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                    />
                  </div>
                ))}
              </div>
            </div>

              {/* Permissões de Visualização */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-blue-500" />
                  <Label className="text-gray-900 dark:text-gray-100 font-medium">Permissões de Visualização</Label>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-4 bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-950/30 dark:to-cyan-950/30 rounded-xl border border-blue-100 dark:border-blue-900">
                  <label className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                    formData.permissions?.can_view_all_leads ? 'bg-white dark:bg-gray-800 shadow-sm' : 'hover:bg-white/50 dark:hover:bg-gray-800/50'
                  }`}>
                    <div>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Todos os leads</span>
                      <p className="text-xs text-gray-500">Ver leads de todos</p>
                    </div>
                    <Switch
                      checked={formData.permissions?.can_view_all_leads || false}
                      onCheckedChange={(val) => setFormData({
                        ...formData, 
                        permissions: {...formData.permissions, can_view_all_leads: val}
                      })}
                      aria-label="Ver todos os leads"
                    />
                  </label>
                  <label className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                    formData.permissions?.can_view_team_leads ? 'bg-white dark:bg-gray-800 shadow-sm' : 'hover:bg-white/50 dark:hover:bg-gray-800/50'
                  }`}>
                    <div>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Leads da equipe</span>
                      <p className="text-xs text-gray-500">Ver leads do time</p>
                    </div>
                    <Switch
                      checked={formData.permissions?.can_view_team_leads || false}
                      onCheckedChange={(val) => setFormData({
                        ...formData, 
                        permissions: {...formData.permissions, can_view_team_leads: val}
                      })}
                      aria-label="Ver leads da equipe"
                    />
                  </label>
                  <label className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                    formData.permissions?.can_view_all_tickets ? 'bg-white dark:bg-gray-800 shadow-sm' : 'hover:bg-white/50 dark:hover:bg-gray-800/50'
                  }`}>
                    <div>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Todos os tickets</span>
                      <p className="text-xs text-gray-500">Ver tickets de todos</p>
                    </div>
                    <Switch
                      checked={formData.permissions?.can_view_all_tickets || false}
                      onCheckedChange={(val) => setFormData({
                        ...formData, 
                        permissions: {...formData.permissions, can_view_all_tickets: val}
                      })}
                      aria-label="Ver todos os tickets"
                    />
                  </label>
                  <label className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                    formData.permissions?.can_view_team_tickets ? 'bg-white dark:bg-gray-800 shadow-sm' : 'hover:bg-white/50 dark:hover:bg-gray-800/50'
                  }`}>
                    <div>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Tickets da equipe</span>
                      <p className="text-xs text-gray-500">Ver tickets do time</p>
                    </div>
                    <Switch
                      checked={formData.permissions?.can_view_team_tickets || false}
                      onCheckedChange={(val) => setFormData({
                        ...formData, 
                        permissions: {...formData.permissions, can_view_team_tickets: val}
                      })}
                      aria-label="Ver tickets da equipe"
                    />
                  </label>
                </div>
              </div>

              {/* Permissões Administrativas */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Settings className="w-4 h-4 text-purple-500" />
                  <Label className="text-gray-900 dark:text-gray-100 font-medium">Permissões Administrativas</Label>
                </div>
                <div className="grid gap-2 p-4 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30 rounded-xl border border-purple-100 dark:border-purple-900">
                  <label className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                    formData.permissions?.can_access_reports ? 'bg-white dark:bg-gray-800 shadow-sm' : 'hover:bg-white/50 dark:hover:bg-gray-800/50'
                  }`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        formData.permissions?.can_access_reports ? 'bg-purple-100 dark:bg-purple-900' : 'bg-gray-100 dark:bg-gray-700'
                      }`}>
                        <Activity className={`w-4 h-4 ${formData.permissions?.can_access_reports ? 'text-purple-600' : 'text-gray-400'}`} />
                      </div>
                      <div>
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Acessar relatórios</span>
                        <p className="text-xs text-gray-500">Dashboards e relatórios</p>
                      </div>
                    </div>
                    <Switch
                      checked={formData.permissions?.can_access_reports || false}
                      onCheckedChange={(val) => setFormData({
                        ...formData, 
                        permissions: {...formData.permissions, can_access_reports: val}
                      })}
                      aria-label="Acessar relatórios"
                    />
                  </label>
                  <label className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                    formData.permissions?.can_manage_agents ? 'bg-white dark:bg-gray-800 shadow-sm' : 'hover:bg-white/50 dark:hover:bg-gray-800/50'
                  }`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        formData.permissions?.can_manage_agents ? 'bg-purple-100 dark:bg-purple-900' : 'bg-gray-100 dark:bg-gray-700'
                      }`}>
                        <Users className={`w-4 h-4 ${formData.permissions?.can_manage_agents ? 'text-purple-600' : 'text-gray-400'}`} />
                      </div>
                      <div>
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Gerenciar agentes</span>
                        <p className="text-xs text-gray-500">Criar, editar e excluir</p>
                      </div>
                    </div>
                    <Switch
                      checked={formData.permissions?.can_manage_agents || false}
                      onCheckedChange={(val) => setFormData({
                        ...formData, 
                        permissions: {...formData.permissions, can_manage_agents: val}
                      })}
                      aria-label="Gerenciar agentes"
                    />
                  </label>
                  <label className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                    formData.permissions?.can_manage_settings ? 'bg-white dark:bg-gray-800 shadow-sm' : 'hover:bg-white/50 dark:hover:bg-gray-800/50'
                  }`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        formData.permissions?.can_manage_settings ? 'bg-purple-100 dark:bg-purple-900' : 'bg-gray-100 dark:bg-gray-700'
                      }`}>
                        <Settings className={`w-4 h-4 ${formData.permissions?.can_manage_settings ? 'text-purple-600' : 'text-gray-400'}`} />
                      </div>
                      <div>
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Gerenciar configurações</span>
                        <p className="text-xs text-gray-500">Alterar configurações do sistema</p>
                      </div>
                    </div>
                    <Switch
                      checked={formData.permissions?.can_manage_settings || false}
                      onCheckedChange={(val) => setFormData({
                        ...formData, 
                        permissions: {...formData.permissions, can_manage_settings: val}
                      })}
                      aria-label="Gerenciar configurações"
                    />
                  </label>
                </div>
              </div>

              {/* Status Toggles */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all cursor-pointer ${
                  formData.online 
                    ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800' 
                    : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                }`}>
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${formData.online ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} aria-hidden="true" />
                    <div>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Online</span>
                      <span className="text-xs text-gray-500 ml-2">({formData.online ? 'Sim' : 'Nao'})</span>
                    </div>
                  </div>
                  <Switch
                    checked={formData.online}
                    onCheckedChange={(val) => setFormData({...formData, online: val})}
                    aria-label="Status online do agente"
                  />
                </label>

                <label className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all cursor-pointer ${
                  formData.active 
                    ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800' 
                    : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                }`}>
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${formData.active ? 'bg-blue-500' : 'bg-gray-400'}`} aria-hidden="true" />
                    <div>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Ativo</span>
                      <span className="text-xs text-gray-500 ml-2">({formData.active ? 'Sim' : 'Nao'})</span>
                    </div>
                  </div>
                  <Switch
                    checked={formData.active}
                    onCheckedChange={(val) => setFormData({...formData, active: val})}
                    aria-label="Status ativo do agente"
                  />
                </label>
              </div>
            </div>
          </div>

          <SheetFooter className="px-6 py-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
            <div className="flex w-full gap-3">
              <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="flex-1">
                Cancelar
              </Button>
              <Button 
                onClick={handleSubmit}
                disabled={!formData.name || !formData.email || !formData.agentType || (!editingAgent && (!formData.password || formData.password.length < 6))}
                className="flex-1 bg-blue-600 hover:bg-blue-700"
              >
                {editingAgent ? 'Salvar Alterações' : 'Criar Agente'}
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Sheet para Criar/Editar Time */}
      <Sheet open={teamDialogOpen} onOpenChange={setTeamDialogOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg bg-white dark:bg-gray-900 p-0 flex flex-col">
          <SheetHeader className="px-6 py-5 border-b border-gray-200 dark:border-gray-800 bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-950/30 dark:to-cyan-950/30">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                <Users className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <SheetTitle className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                  {editingTeam ? 'Editar Time' : 'Novo Time'}
                </SheetTitle>
                <SheetDescription className="text-gray-500 dark:text-gray-400">
                  Agrupe agentes para gestão e relatórios
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>
          
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
            <div className="space-y-2">
              <Label className="text-gray-900 dark:text-gray-100 font-medium">Nome do Time *</Label>
              <Input
                value={teamFormData.name}
                onChange={(e) => setTeamFormData({...teamFormData, name: e.target.value})}
                placeholder="Ex: Equipe Vendas SP"
                className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 h-11"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-gray-900 dark:text-gray-100 font-medium">Descrição</Label>
              <Textarea
                value={teamFormData.description}
                onChange={(e) => setTeamFormData({...teamFormData, description: e.target.value})}
                placeholder="Descreva as responsabilidades e área de atuação do time..."
                className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-gray-900 dark:text-gray-100 font-medium">Supervisores</Label>
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 max-h-48 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700">
                {agents?.filter(a => isSupervisorType(a.agentType) || a.agentType === 'admin')
                  .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR'))
                  .map(agent => {
                    const checked = (teamFormData.supervisorEmails || []).includes(agent.email);
                    return (
                      <label
                        key={agent.id}
                        className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 select-none"
                      >
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          checked={checked}
                          onChange={() => {
                            const current = teamFormData.supervisorEmails || [];
                            const next = checked
                              ? current.filter(e => e !== agent.email)
                              : [...current, agent.email];
                            setTeamFormData({ ...teamFormData, supervisorEmails: next });
                          }}
                        />
                        <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-xs font-medium text-blue-600 dark:text-blue-400 shrink-0">
                          {agent.name?.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-sm text-gray-800 dark:text-gray-200">{agent.name}</span>
                      </label>
                    );
                  })
                }
                {agents?.filter(a => isSupervisorType(a.agentType) || a.agentType === 'admin').length === 0 && (
                  <p className="text-sm text-gray-400 px-3 py-3">Nenhum supervisor disponível</p>
                )}
              </div>
              {(teamFormData.supervisorEmails || []).length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {(teamFormData.supervisorEmails || []).map(email => {
                    const ag = agents?.find(a => a.email === email);
                    return (
                      <span key={email} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900 text-xs text-blue-700 dark:text-blue-300">
                        {ag ? ag.name : email}
                      </span>
                    );
                  })}
                </div>
              )}
              <p className="text-xs text-gray-500">Supervisores têm acesso aos relatórios e métricas do time</p>
            </div>

            {editingTeam && (
              <div className="bg-blue-50 dark:bg-blue-950/30 rounded-xl p-4 border border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span className="text-sm font-medium text-blue-800 dark:text-blue-300">Membros do Time</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {agents?.filter(a => a.team_id === editingTeam.id).length > 0 ? (
                    agents?.filter(a => a.team_id === editingTeam.id).map(agent => (
                      <Badge key={agent.id} variant="outline" className="bg-white dark:bg-gray-800">
                        {agent.name}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-xs text-blue-600 dark:text-blue-400">Nenhum agente neste time ainda</span>
                  )}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between p-4 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${teamFormData.active ? 'bg-green-500' : 'bg-gray-400'}`} />
                <div>
                  <Label className="text-gray-900 dark:text-gray-100 font-medium">Status do Time</Label>
                  <p className="text-xs text-gray-500">{teamFormData.active ? 'Time ativo e operacional' : 'Time inativo'}</p>
                </div>
              </div>
              <Switch
                checked={teamFormData.active}
                onCheckedChange={(val) => setTeamFormData({...teamFormData, active: val})}
              />
            </div>
          </div>

          <SheetFooter className="px-6 py-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
            <div className="flex w-full gap-3">
              <Button variant="outline" onClick={() => setTeamDialogOpen(false)} className="flex-1">
                Cancelar
              </Button>
              <Button 
                onClick={handleTeamSubmit}
                disabled={!teamFormData.name}
                className="flex-1 bg-blue-600 hover:bg-blue-700"
              >
                {editingTeam ? 'Salvar Alterações' : 'Criar Time'}
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Sheet para Criar/Editar Fila */}
      <Sheet open={queueDialogOpen} onOpenChange={setQueueDialogOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg bg-white dark:bg-gray-900 p-0 flex flex-col">
          <SheetHeader className="px-6 py-5 border-b border-gray-200 dark:border-gray-800 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center">
                <Layers className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <SheetTitle className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                  {editingQueue ? 'Editar Fila' : 'Nova Fila'}
                </SheetTitle>
                <SheetDescription className="text-gray-500 dark:text-gray-400">
                  Configure o canal de distribuição de trabalho
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>
          
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
            <div className="space-y-2">
              <Label className="text-gray-900 dark:text-gray-100 font-medium">Nome da Fila *</Label>
              <Input
                value={queueFormData.name}
                onChange={(e) => setQueueFormData({...queueFormData, name: e.target.value})}
                placeholder="Ex: Suporte N1, Vendas WhatsApp"
                className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 h-11"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-gray-900 dark:text-gray-100 font-medium">Time Responsável</Label>
              <Select value={queueFormData.teamId} onValueChange={(val) => setQueueFormData({...queueFormData, teamId: val})}>
                <SelectTrigger className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 h-11">
                  <SelectValue placeholder="Selecione o time que atenderá esta fila" />
                </SelectTrigger>
                <SelectContent>
                  {teams.map(team => (
                    <SelectItem key={team.id} value={team.id}>
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-blue-500" />
                        {team.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500">O time selecionado será responsável por atender os tickets desta fila</p>
            </div>

            <div className="space-y-3">
              <Label className="text-gray-900 dark:text-gray-100 font-medium">Prioridade Padrão</Label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { value: "P1", label: "P1", desc: "Crítica", color: "bg-red-500" },
                  { value: "P2", label: "P2", desc: "Alta", color: "bg-orange-500" },
                  { value: "P3", label: "P3", desc: "Média", color: "bg-yellow-500" },
                  { value: "P4", label: "P4", desc: "Baixa", color: "bg-green-500" },
                ].map((priority) => (
                  <button
                    key={priority.value}
                    type="button"
                    onClick={() => setQueueFormData({...queueFormData, defaultPriority: priority.value})}
                    className={`flex flex-col items-center p-3 rounded-xl border-2 transition-all ${
                      queueFormData.defaultPriority === priority.value 
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30' 
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full ${priority.color} mb-1`} />
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{priority.label}</span>
                    <span className="text-xs text-gray-500">{priority.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {editingQueue && (
              <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-xl p-4 border border-emerald-200 dark:border-emerald-800">
                <div className="flex items-center gap-2 mb-2">
                  <Activity className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-sm font-medium text-emerald-800 dark:text-emerald-300">Agentes Atribuídos</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {agents?.filter(a => a.queue_ids?.includes(editingQueue.id)).length > 0 ? (
                    agents?.filter(a => a.queue_ids?.includes(editingQueue.id)).map(agent => (
                      <Badge key={agent.id} variant="outline" className="bg-white dark:bg-gray-800">
                        {agent.name}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-xs text-emerald-600 dark:text-emerald-400">Nenhum agente atribuído a esta fila</span>
                  )}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between p-4 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${queueFormData.active ? 'bg-green-500' : 'bg-gray-400'}`} />
                <div>
                  <Label className="text-gray-900 dark:text-gray-100 font-medium">Status da Fila</Label>
                  <p className="text-xs text-gray-500">{queueFormData.active ? 'Fila ativa e recebendo tickets' : 'Fila inativa, não recebe novos tickets'}</p>
                </div>
              </div>
              <Switch
                checked={queueFormData.active}
                onCheckedChange={(val) => setQueueFormData({...queueFormData, active: val})}
              />
            </div>
          </div>

          <SheetFooter className="px-6 py-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
            <div className="flex w-full gap-3">
              <Button variant="outline" onClick={() => setQueueDialogOpen(false)} className="flex-1">
                Cancelar
              </Button>
              <Button 
                onClick={handleQueueSubmit}
                disabled={!queueFormData.name}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700"
              >
                {editingQueue ? 'Salvar Alterações' : 'Criar Fila'}
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Sheet open={typeDialogOpen} onOpenChange={setTypeDialogOpen}>
        <SheetContent side="right" className="w-full sm:max-w-2xl bg-white dark:bg-gray-900 p-0 flex flex-col">
          <SheetHeader className="px-6 py-5 border-b border-gray-200 dark:border-gray-800 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center">
                <Layers className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <SheetTitle className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                  {editingType ? 'Editar Tipo de Agente' : 'Novo Tipo de Agente'}
                </SheetTitle>
                <SheetDescription className="text-gray-500 dark:text-gray-400">
                  Configure as permissões e acessos do tipo de agente
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>
          
          <Tabs defaultValue="info" className="flex-1 flex flex-col overflow-hidden">
            <div className="px-6 pt-4 border-b border-gray-200 dark:border-gray-800">
              <TabsList className="w-full grid grid-cols-3 h-10">
                <TabsTrigger value="info" className="text-sm">Informações</TabsTrigger>
                <TabsTrigger value="access" className="text-sm">Acessos</TabsTrigger>
                <TabsTrigger value="preview" className="text-sm">Preview</TabsTrigger>
              </TabsList>
            </div>
            
            <div className="flex-1 overflow-y-auto">
              <TabsContent value="info" className="p-6 space-y-6 mt-0">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-gray-900 dark:text-gray-100 font-medium">Chave (identificador) *</Label>
                    <Input
                      value={typeFormData.key}
                      onChange={(e) => setTypeFormData({...typeFormData, key: e.target.value.toLowerCase().replace(/\s/g, '_')})}
                      placeholder="Ex: technical_support"
                      className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                      disabled={!!editingType}
                    />
                    <p className="text-xs text-gray-500">Identificador único, sem espaços</p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-gray-900 dark:text-gray-100 font-medium">Nome de Exibição *</Label>
                    <Input
                      value={typeFormData.label}
                      onChange={(e) => setTypeFormData({...typeFormData, label: e.target.value})}
                      placeholder="Ex: Suporte Técnico"
                      className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-gray-900 dark:text-gray-100 font-medium">Descrição</Label>
                  <Textarea
                    value={typeFormData.description}
                    onChange={(e) => setTypeFormData({...typeFormData, description: e.target.value})}
                    placeholder="Descreva as responsabilidades deste tipo de agente..."
                    className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                    rows={3}
                  />
                </div>

                <div className="space-y-3">
                  <Label className="text-gray-900 dark:text-gray-100 font-medium">Cor do Badge</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { value: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300", label: "Cinza", color: "bg-gray-400" },
                      { value: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300", label: "Azul", color: "bg-blue-500" },
                      { value: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300", label: "Verde", color: "bg-green-500" },
                      { value: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300", label: "Roxo", color: "bg-purple-500" },
                      { value: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300", label: "Laranja", color: "bg-orange-500" },
                      { value: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300", label: "Vermelho", color: "bg-red-500" },
                      { value: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300", label: "Indigo", color: "bg-indigo-500" },
                      { value: "bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-300", label: "Rosa", color: "bg-pink-500" },
                      { value: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300", label: "Amarelo", color: "bg-yellow-500" },
                    ].map((colorOption) => (
                      <button
                        key={colorOption.value}
                        type="button"
                        onClick={() => setTypeFormData({...typeFormData, color: colorOption.value})}
                        className={`flex items-center gap-2 p-3 rounded-lg border-2 transition-all ${
                          typeFormData.color === colorOption.value 
                            ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30' 
                            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded-full ${colorOption.color}`} />
                        <span className="text-sm text-gray-700 dark:text-gray-300">{colorOption.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${typeFormData.active ? 'bg-green-500' : 'bg-gray-400'}`} />
                    <div>
                      <Label className="text-gray-900 dark:text-gray-100 font-medium">Status do Tipo</Label>
                      <p className="text-xs text-gray-500">{typeFormData.active ? 'Agentes deste tipo podem acessar o sistema' : 'Tipo inativo, agentes não podem acessar'}</p>
                    </div>
                  </div>
                  <Switch
                    checked={typeFormData.active}
                    onCheckedChange={(val) => setTypeFormData({...typeFormData, active: val})}
                  />
                </div>
              </TabsContent>

              <TabsContent value="access" className="p-6 space-y-4 mt-0">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Módulos e Telas</h3>
                    <p className="text-xs text-gray-500">Selecione os módulos e telas que este tipo pode acessar</p>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {typeFormData.allowedSubmenus?.length || 0} telas selecionadas
                  </Badge>
                </div>

                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (typeFormData.modules?.includes('all')) {
                        setTypeFormData({...typeFormData, modules: [], allowedSubmenus: []});
                        setExpandedModulesInForm([]);
                      } else {
                        const allModuleIds = MENU_MODULES.map(m => m.id);
                        const allSubmenus = MENU_MODULES.flatMap(m => m.items.map(i => i.id));
                        setTypeFormData({
                          ...typeFormData, 
                          modules: ['all', ...allModuleIds],
                          allowedSubmenus: allSubmenus
                        });
                        setExpandedModulesInForm(allModuleIds);
                      }
                    }}
                    className={`w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all ${
                      typeFormData.modules?.includes('all')
                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30'
                        : 'border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        typeFormData.modules?.includes('all') 
                          ? 'bg-indigo-100 dark:bg-indigo-900' 
                          : 'bg-gray-100 dark:bg-gray-800'
                      }`}>
                        <Settings className={`w-5 h-5 ${
                          typeFormData.modules?.includes('all') 
                            ? 'text-indigo-600 dark:text-indigo-400' 
                            : 'text-gray-500'
                        }`} />
                      </div>
                      <div className="text-left">
                        <span className="font-medium text-gray-900 dark:text-gray-100">Acesso Total</span>
                        <p className="text-xs text-gray-500">Acesso a todos os módulos e telas do sistema</p>
                      </div>
                    </div>
                    {typeFormData.modules?.includes('all') && (
                      <Check className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    )}
                  </button>

                  <div className="grid gap-2">
                    {MENU_MODULES.map((menuModule) => {
                      const isModuleSelected = typeFormData.modules?.includes(menuModule.id);
                      const isExpanded = expandedModulesInForm.includes(menuModule.id);
                      const selectedSubmenusCount = menuModule.items.filter(item => 
                        typeFormData.allowedSubmenus?.includes(item.id)
                      ).length;
                      const allSelected = selectedSubmenusCount === menuModule.items.length;

                      return (
                        <div key={menuModule.id} className={`rounded-xl border-2 overflow-hidden transition-all ${
                          isModuleSelected 
                            ? 'border-indigo-200 dark:border-indigo-800' 
                            : 'border-gray-200 dark:border-gray-700'
                        }`}>
                          <div 
                            className={`flex items-center justify-between p-3 cursor-pointer transition-colors ${
                              isModuleSelected 
                                ? 'bg-indigo-50 dark:bg-indigo-950/20' 
                                : 'bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800'
                            }`}
                            onClick={() => {
                              if (isExpanded) {
                                setExpandedModulesInForm(prev => prev.filter(m => m !== menuModule.id));
                              } else {
                                setExpandedModulesInForm(prev => [...prev, menuModule.id]);
                              }
                            }}
                          >
                            <div className="flex items-center gap-3">
                              <Checkbox
                                checked={isModuleSelected}
                                onClick={(e) => e.stopPropagation()}
                                onCheckedChange={(checked) => {
                                  const modules = typeFormData.modules || [];
                                  const submenus = typeFormData.allowedSubmenus || [];
                                  const moduleSubmenus = menuModule.items.map(i => i.id);
                                  
                                  if (checked) {
                                    setTypeFormData({
                                      ...typeFormData, 
                                      modules: [...modules, menuModule.id],
                                      allowedSubmenus: [...submenus, ...moduleSubmenus]
                                    });
                                    setExpandedModulesInForm(prev => [...prev, menuModule.id]);
                                  } else {
                                    setTypeFormData({
                                      ...typeFormData, 
                                      modules: modules.filter(m => m !== menuModule.id && m !== 'all'),
                                      allowedSubmenus: submenus.filter(s => !moduleSubmenus.includes(s))
                                    });
                                  }
                                }}
                                className="data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
                              />
                              <span className="font-medium text-gray-900 dark:text-gray-100">{menuModule.title}</span>
                              {isModuleSelected && (
                                <Badge className={`text-xs ${
                                  allSelected 
                                    ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300' 
                                    : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300'
                                }`}>
                                  {selectedSubmenusCount}/{menuModule.items.length}
                                </Badge>
                              )}
                            </div>
                            <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                          </div>
                          
                          {isExpanded && (
                            <div className="p-3 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
                              <div className="grid grid-cols-2 gap-2">
                                {menuModule.items.map((item) => {
                                  const isSelected = typeFormData.allowedSubmenus?.includes(item.id);
                                  return (
                                    <label
                                      key={item.id}
                                      className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${
                                        isSelected 
                                          ? 'bg-indigo-50 dark:bg-indigo-950/30' 
                                          : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                                      }`}
                                    >
                                      <Checkbox
                                        checked={isSelected}
                                        onCheckedChange={(checked) => {
                                          const submenus = typeFormData.allowedSubmenus || [];
                                          const modules = typeFormData.modules || [];
                                          
                                          if (checked) {
                                            const newSubmenus = [...submenus, item.id];
                                            const newModules = modules.includes(menuModule.id) ? modules : [...modules, menuModule.id];
                                            setTypeFormData({
                                              ...typeFormData, 
                                              allowedSubmenus: newSubmenus,
                                              modules: newModules
                                            });
                                          } else {
                                            const newSubmenus = submenus.filter(s => s !== item.id);
                                            const remainingModuleSubmenus = menuModule.items.filter(i => newSubmenus.includes(i.id));
                                            const newModules = remainingModuleSubmenus.length === 0 
                                              ? modules.filter(m => m !== menuModule.id && m !== 'all')
                                              : modules.filter(m => m !== 'all');
                                            setTypeFormData({
                                              ...typeFormData, 
                                              allowedSubmenus: newSubmenus,
                                              modules: newModules
                                            });
                                          }
                                        }}
                                        className="data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
                                      />
                                      <span className={`text-sm ${
                                        isSelected 
                                          ? 'text-gray-900 dark:text-gray-100 font-medium' 
                                          : 'text-gray-600 dark:text-gray-400'
                                      }`}>
                                        {item.title}
                                      </span>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="preview" className="p-6 space-y-4 mt-0">
                <div className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30 rounded-xl p-4 border border-indigo-200 dark:border-indigo-800">
                  <div className="flex items-center gap-3 mb-3">
                    <Badge className={typeFormData.color || "bg-gray-100 text-gray-700"}>
                      {typeFormData.label || "Nome do Tipo"}
                    </Badge>
                    <span className="text-xs text-gray-500">({typeFormData.key || "chave"})</span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {typeFormData.description || "Sem descrição"}
                  </p>
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Menu que será exibido:</h4>
                  <div className="bg-gray-900 rounded-xl p-4 space-y-2 max-h-[400px] overflow-y-auto">
                    {MENU_MODULES.filter(mod => typeFormData.modules?.includes(mod.id) || typeFormData.modules?.includes('all')).map((mod) => {
                      const visibleItems = mod.items.filter(item => typeFormData.allowedSubmenus?.includes(item.id));
                      if (visibleItems.length === 0) return null;
                      
                      return (
                        <div key={mod.id} className="space-y-1">
                          <div className="text-xs text-gray-400 uppercase tracking-wider px-2">{mod.title}</div>
                          {visibleItems.map((item) => (
                            <div key={item.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800 text-gray-200 text-sm">
                              <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                              {item.title}
                            </div>
                          ))}
                        </div>
                      );
                    })}
                    {(!typeFormData.modules || typeFormData.modules.length === 0) && (
                      <div className="text-center py-8 text-gray-500">
                        <ShieldX className="w-12 h-12 mx-auto mb-2 opacity-50" />
                        <p>Nenhum módulo selecionado</p>
                        <p className="text-xs">Vá para a aba "Acessos" para configurar</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-yellow-50 dark:bg-yellow-950/30 rounded-xl p-4 border border-yellow-200 dark:border-yellow-800">
                  <div className="flex items-start gap-3">
                    <Activity className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-medium text-yellow-800 dark:text-yellow-300">Importante</h4>
                      <p className="text-xs text-yellow-700 dark:text-yellow-400 mt-1">
                        Alterações nas permissões só terão efeito após o agente fazer login novamente no sistema.
                      </p>
                    </div>
                  </div>
                </div>
              </TabsContent>
            </div>
          </Tabs>

          <SheetFooter className="px-6 py-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
            <div className="flex w-full gap-3">
              <Button variant="outline" onClick={() => setTypeDialogOpen(false)} className="flex-1">
                Cancelar
              </Button>
              <Button 
                onClick={handleTypeSubmit}
                disabled={!typeFormData.key || !typeFormData.label}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700"
              >
                {editingType ? 'Salvar Alterações' : 'Criar Tipo de Agente'}
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
