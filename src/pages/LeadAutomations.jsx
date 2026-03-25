
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Plus, 
  Zap, 
  Trash2, 
  Edit, 
  Clock, 
  ArrowRight,
  Play,
  Pause,
  RefreshCw,
  MessageSquare,
  Loader2,
  CheckCircle2,
  AlertCircle,
  TestTube2
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Checkbox } from "@/components/ui/checkbox";
import WhatsAppTemplateSelector from "@/components/whatsapp/WhatsAppTemplateSelector";
import AutomationTestDialog from "@/components/whatsapp/AutomationTestDialog";
import AutomationLogsPanel from "@/components/whatsapp/AutomationLogsPanel";

const STAGES = [
  { value: "novo", label: "Novo" },
  { value: "abordado", label: "Abordado" },
  { value: "qualificado", label: "Qualificado" },
  { value: "proposta_enviada", label: "Proposta Enviada" },
  { value: "reengajar", label: "Reengajar" },
];

const TRIGGER_TYPES = [
  { value: "lead_created", label: "Lead Novo (Boas-Vindas)" },
  { value: "stage_change", label: "Mudança de Etapa" },
  { value: "stage_duration", label: "Tempo na Etapa" },
  { value: "inactivity", label: "Inatividade" },
  { value: "no_activity", label: "Sem Atividade" },
  { value: "no_proposal_response", label: "Proposta Sem Resposta" },
  { value: "no_contact", label: "Sem Contato" },
];

const ACTION_TYPES = [
  { value: "send_whatsapp", label: "Enviar WhatsApp" },
  { value: "internal_alert", label: "Alerta Interno (Coordenador)" },
  { value: "change_stage", label: "Mudar Etapa" },
  { value: "create_task", label: "Criar Tarefa" },
  { value: "send_notification", label: "Enviar Notificação" },
];

export default function LeadAutomations() {
  const queryClient = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [showTestDialog, setShowTestDialog] = useState(false);
  const [testingAutomation, setTestingAutomation] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    active: true,
    trigger_type: "lead_created",
    trigger_config: {
      stage: "novo",
      duration_days: 0,
      duration_hours: 0,
    },
    action_type: "send_whatsapp",
    action_config: {
      new_stage: "",
      task_title: "",
      task_description: "",
      notification_message: "",
      whatsapp_message: "",
      alertMessage: "",
      templateMessage: "",
    },
    whatsapp_template_id: "",
    whatsapp_template_name: "",
    team_ids: [],
  });

  const { data: rules = [], isLoading: rulesLoading } = useQuery({
    queryKey: ['leadAutomations'],
    queryFn: () => base44.entities.LeadAutomation.list('-createdDate'),
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: templates = [], isLoading: templatesLoading } = useQuery({
    queryKey: ['whatsappTemplates'],
    queryFn: () => base44.whatsapp.getTemplates(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: teams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: () => base44.entities.Team.list(),
    staleTime: 60000,
  });

  const { data: connectionTest } = useQuery({
    queryKey: ['whatsappConnection'],
    queryFn: () => base44.whatsapp.testConnection(),
    staleTime: 60 * 1000,
    retry: false,
  });

  const createRuleMutation = useMutation({
    mutationFn: (data) => base44.entities.LeadAutomation.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leadAutomations'] });
      toast.success('Regra criada com sucesso!');
      setShowDialog(false);
      resetForm();
    },
  });

  const updateRuleMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.LeadAutomation.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leadAutomations'] });
      toast.success('Regra atualizada!');
      setShowDialog(false);
      resetForm();
    },
  });

  const deleteRuleMutation = useMutation({
    mutationFn: (id) => base44.entities.LeadAutomation.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leadAutomations'] });
      toast.success('Regra excluída!');
    },
  });

  const executeAutomationsMutation = useMutation({
    mutationFn: async () => {
      const result = await base44.functions.invoke('checkLeadAutomations', {});
      return result.data;
    },
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`Automações executadas! ${data.leads_affected} leads afetados`);
        queryClient.invalidateQueries({ queryKey: ['leads'] });
        queryClient.invalidateQueries({ queryKey: ['leadAutomations'] });
      } else {
        toast.error('Erro ao executar automações');
      }
    },
  });

  const parseConfig = (config) => {
    if (!config) return {};
    if (typeof config === 'string') {
      try { return JSON.parse(config); } catch { return {}; }
    }
    return config;
  };

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      active: true,
      trigger_type: "lead_created",
      trigger_config: {
        stage: "novo",
        duration_days: 0,
        duration_hours: 0,
      },
      action_type: "send_whatsapp",
      action_config: {
        new_stage: "",
        task_title: "",
        task_description: "",
        notification_message: "",
        whatsapp_message: "",
        alertMessage: "",
        templateMessage: "",
      },
      whatsapp_template_id: "",
      whatsapp_template_name: "",
      team_ids: [],
    });
    setEditingRule(null);
  };

  const selectTemplate = (template) => {
    const getTemplateBody = (t) => {
      if (t.dynamicComponents) {
        const bodyComponent = t.dynamicComponents.find(c => c.type === 'BODY');
        if (bodyComponent?.text) return bodyComponent.text;
      }
      if (t.staticComponents) {
        const bodyComponent = t.staticComponents.find(c => c.type === 'BODY');
        if (bodyComponent?.text) return bodyComponent.text;
      }
      if (t.components) {
        const bodyComponent = t.components.find(c => c.type === 'BODY' || c.type === 'body');
        if (bodyComponent?.text) return bodyComponent.text;
      }
      return t.body || t.text || t.message || t.content || '';
    };

    const templateBody = getTemplateBody(template);
    
    setFormData({
      ...formData,
      whatsapp_template_id: template.id,
      whatsapp_template_name: template.description || template.id,
      action_config: {
        ...formData.action_config,
        templateMessage: templateBody,
      },
    });
    setShowTemplateSelector(false);
  };

  const handleEdit = (rule) => {
    setEditingRule(rule);
    const triggerConfig = parseConfig(rule.triggerConfig) || {};
    const actionConfig = parseConfig(rule.actionConfig) || {};

    const defaultActionConfig = {
      new_stage: "",
      task_title: "",
      task_description: "",
      notification_message: "",
      whatsapp_message: "",
      alertMessage: "",
      templateMessage: "",
    };

    const defaultTriggerConfig = {
      stage: "novo",
      duration_days: 0,
      duration_hours: 0,
    };

    setFormData({
      name: rule.name || "",
      description: rule.description || "",
      active: rule.active !== false,
      trigger_type: rule.triggerType || "lead_created",
      trigger_config: {
        ...defaultTriggerConfig,
        stage: triggerConfig.stage || "novo",
        duration_days: triggerConfig.duration_days || triggerConfig.durationDays || triggerConfig.days || 0,
        duration_hours: triggerConfig.duration_hours || triggerConfig.durationHours || triggerConfig.hours || 0,
      },
      action_type: rule.actionType || "send_whatsapp",
      action_config: {
        ...defaultActionConfig,
        ...actionConfig,
      },
      whatsapp_template_id: rule.whatsappTemplateId || actionConfig.whatsapp_template_id || actionConfig.whatsappTemplateId || "",
      whatsapp_template_name: rule.whatsappTemplateName || actionConfig.whatsapp_template_name || actionConfig.whatsappTemplateName || "",
      team_ids: rule.teamIds || (rule.teamId ? [rule.teamId] : []),
    });
    setShowDialog(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!formData.name) {
      toast.error('Nome da regra é obrigatório!');
      return;
    }

    if (!formData.team_ids || formData.team_ids.length === 0) {
      toast.error('Selecione pelo menos um time para esta automação.');
      return;
    }

    if (formData.action_type === 'send_whatsapp' && !formData.whatsapp_template_id) {
      toast.error('Selecione um template de WhatsApp para esta ação!');
      return;
    }

    const dataToSave = {
      name: formData.name,
      description: formData.description,
      active: formData.active,
      trigger_type: formData.trigger_type,
      trigger_config: JSON.stringify(formData.trigger_config),
      action_type: formData.action_type,
      action_config: JSON.stringify(formData.action_config),
      whatsapp_template_id: formData.whatsapp_template_id || null,
      whatsapp_template_name: formData.whatsapp_template_name || null,
      team_ids: formData.team_ids || [],
    };

    if (editingRule) {
      updateRuleMutation.mutate({ id: editingRule.id, data: dataToSave });
    } else {
      createRuleMutation.mutate(dataToSave);
    }
  };

  const handleToggleActive = (rule) => {
    updateRuleMutation.mutate({
      id: rule.id,
      data: { ...rule, active: !rule.active }
    });
  };

  const getTriggerLabel = (type) => {
    return TRIGGER_TYPES.find(t => t.value === type)?.label || type;
  };

  const getActionLabel = (type) => {
    return ACTION_TYPES.find(a => a.value === type)?.label || type;
  };

  const getStageLabel = (stage) => {
    return STAGES.find(s => s.value === stage)?.label || stage;
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-3">
              <Zap className="w-8 h-8 text-yellow-600 dark:text-yellow-400" />
              Automações de Vendas PF
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              Configure ações automáticas para o pipeline de vendas
            </p>
          </div>
          <div className="flex items-center gap-2">
            <AutomationLogsPanel automationType="lead" colorScheme="yellow" />
            <Button
              onClick={() => {
                resetForm();
                setShowDialog(true);
              }}
              className="bg-yellow-600 hover:bg-yellow-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Nova Automação
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-3 gap-4">
          <Card className="bg-white dark:bg-gray-900">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-green-100 dark:bg-green-950 rounded-lg">
                  <Play className="w-6 h-6 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Automações Ativas</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {rules.filter(r => r.active).length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-gray-900">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-lg">
                  <Pause className="w-6 h-6 text-gray-600 dark:text-gray-400" />
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Automações Inativas</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {rules.filter(r => !r.active).length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-gray-900">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-100 dark:bg-blue-950 rounded-lg">
                  <MessageSquare className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Templates Disponíveis</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {templatesLoading ? '...' : (Array.isArray(templates) ? templates.length : 0)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Automations List */}
        <div className="grid gap-4">
          {rules.length === 0 ? (
            <Card className="bg-white dark:bg-gray-900">
              <CardContent className="p-12 text-center">
                <Zap className="w-16 h-16 text-gray-300 dark:text-gray-700 mx-auto mb-4" />
                <p className="text-gray-600 dark:text-gray-400 font-medium mb-2">
                  Nenhuma automação criada
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-500 mb-4">
                  Crie automações para otimizar seu processo de vendas
                </p>
                <Button onClick={() => setShowDialog(true)} variant="outline">
                  <Plus className="w-4 h-4 mr-2" />
                  Criar primeira automação
                </Button>
              </CardContent>
            </Card>
          ) : (
            rules.map(rule => {
              const triggerConfig = parseConfig(rule.triggerConfig);
              const actionConfig = parseConfig(rule.actionConfig);
              return (
              <Card key={rule.id} className={`bg-white dark:bg-gray-900 ${rule.active ? 'border-yellow-200 dark:border-yellow-800' : 'opacity-60'}`}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{rule.name}</h3>
                        <Badge className={rule.active ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300" : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"}>
                          {rule.active ? 'Ativa' : 'Inativa'}
                        </Badge>
                        <Badge variant="outline" className="text-xs" title={
                          (rule.teamIds && rule.teamIds.length > 0)
                            ? rule.teamIds.map(tid => teams.find(t => t.id === tid)?.name || 'Removido').join(', ')
                            : 'Todos os times'
                        }>
                          {(rule.teamIds && rule.teamIds.length > 0)
                            ? (rule.teamIds.length <= 2
                                ? rule.teamIds.map(tid => teams.find(t => t.id === tid)?.name || 'Removido').join(', ')
                                : `${rule.teamIds.length} times`)
                            : 'Todos os times'}
                        </Badge>
                      </div>
                      
                      {rule.description && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{rule.description}</p>
                      )}

                      <div className="grid grid-cols-2 gap-4 mt-4">
                        <div className="bg-blue-50 dark:bg-blue-950 p-3 rounded-lg">
                          <p className="text-xs text-blue-600 dark:text-blue-400 font-semibold mb-1">GATILHO</p>
                          <p className="text-sm text-gray-900 dark:text-gray-100">
                            {getTriggerLabel(rule.triggerType)}
                          </p>
                          {triggerConfig?.stage && (
                            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                              Etapa: {getStageLabel(triggerConfig.stage)}
                            </p>
                          )}
                          {(triggerConfig?.duration_days || triggerConfig?.durationDays || triggerConfig?.hours) > 0 && (
                            <p className="text-xs text-gray-600 dark:text-gray-400">
                              {triggerConfig.duration_days || triggerConfig.durationDays || triggerConfig.hours}h
                            </p>
                          )}
                        </div>

                        <div className="bg-green-50 dark:bg-green-950 p-3 rounded-lg">
                          <p className="text-xs text-green-600 dark:text-green-400 font-semibold mb-1">AÇÃO</p>
                          <p className="text-sm text-gray-900 dark:text-gray-100">
                            {getActionLabel(rule.actionType)}
                          </p>
                          {(actionConfig?.task_title || actionConfig?.taskTitle) && (
                            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 truncate">
                              {actionConfig.task_title || actionConfig.taskTitle}
                            </p>
                          )}
                          {(actionConfig?.new_stage || actionConfig?.newStage) && (
                            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                              Para: {getStageLabel(actionConfig.new_stage || actionConfig.newStage)}
                            </p>
                          )}
                          {rule.actionType === 'send_whatsapp' && rule.whatsappTemplateName && (
                            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 truncate">
                              Template: {rule.whatsappTemplateName}
                            </p>
                          )}
                          {rule.actionType === 'send_whatsapp' && actionConfig?.templateMessage && (
                            <div className="mt-2 p-2 bg-gray-100 dark:bg-gray-800 rounded-md">
                              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 font-medium">Texto da mensagem:</p>
                              <p className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap line-clamp-4">
                                {actionConfig.templateMessage}
                              </p>
                            </div>
                          )}
                          {rule.actionType === 'internal_alert' && actionConfig?.alertMessage && (
                            <div className="mt-2 p-2 bg-yellow-50 dark:bg-yellow-950 rounded-md">
                              <p className="text-xs text-yellow-600 dark:text-yellow-400 mb-1 font-medium">Alerta interno:</p>
                              <p className="text-xs text-yellow-700 dark:text-yellow-300 whitespace-pre-wrap line-clamp-4">
                                {actionConfig.alertMessage}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>

                      {rule.executionCount > 0 && (
                        <div className="mt-4 text-xs text-gray-500 dark:text-gray-500">
                          Executada {rule.executionCount} {rule.executionCount === 1 ? 'vez' : 'vezes'}
                          {rule.lastExecution && (
                            <span> • Última execução: {format(new Date(rule.lastExecution), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                  <Switch
                    checked={rule.active}
                    onCheckedChange={() => handleToggleActive(rule)}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setTestingAutomation(rule);
                      setShowTestDialog(true);
                    }}
                    title="Testar automação"
                    className="text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                  >
                    <TestTube2 className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleEdit(rule)}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      if (confirm('Deseja excluir esta regra?')) {
                        deleteRuleMutation.mutate(rule.id);
                      }
                    }}
                  >
                    <Trash2 className="w-4 h-4 text-red-600" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
            );})
          )}
        </div>

        {/* Dialog de Criação/Edição */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingRule ? 'Editar Regra' : 'Nova Regra de Automação'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Nome e Descrição */}
            <div className="space-y-4">
              <div>
                <Label>Nome da Regra *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: Mover leads novos sem contato para reengajar"
                  className="mt-1"
                />
              </div>

              <div>
                <Label>Descrição</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Descreva o objetivo desta regra..."
                  rows={2}
                  className="mt-1"
                />
              </div>

              <div>
                <Label>Times <span className="text-red-500">*</span></Label>
                <div className="mt-1 border rounded-md p-3 space-y-2 max-h-40 overflow-y-auto bg-white">
                  {teams.length === 0 ? (
                    <p className="text-sm text-gray-500">Nenhum time cadastrado</p>
                  ) : (
                    teams.map(team => (
                      <div key={team.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`team-${team.id}`}
                          checked={formData.team_ids.includes(team.id)}
                          onCheckedChange={(checked) => {
                            setFormData(prev => ({
                              ...prev,
                              team_ids: checked
                                ? [...prev.team_ids, team.id]
                                : prev.team_ids.filter(id => id !== team.id)
                            }));
                          }}
                        />
                        <label htmlFor={`team-${team.id}`} className="text-sm cursor-pointer">
                          {team.name}
                        </label>
                      </div>
                    ))
                  )}
                </div>
                {formData.team_ids.length > 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    {formData.team_ids.length} {formData.team_ids.length === 1 ? 'time selecionado' : 'times selecionados'}
                  </p>
                )}
              </div>
            </div>

            {/* Gatilho */}
            <Card className="border-blue-200 bg-blue-50">
              <CardHeader>
                <CardTitle className="text-lg">🎯 Quando (Gatilho)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Tipo de Gatilho</Label>
                  <Select 
                    value={formData.trigger_type} 
                    onValueChange={(val) => setFormData({ ...formData, trigger_type: val })}
                  >
                    <SelectTrigger className="mt-1 bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TRIGGER_TYPES.map(type => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {formData.trigger_type !== 'lead_created' && (
                  <div>
                    <Label>Stage Atual</Label>
                    <Select 
                      value={formData.trigger_config.stage} 
                      onValueChange={(val) => setFormData({ 
                        ...formData, 
                        trigger_config: { ...formData.trigger_config, stage: val }
                      })}
                    >
                      <SelectTrigger className="mt-1 bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STAGES.map(stage => (
                          <SelectItem key={stage.value} value={stage.value}>
                            {stage.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {formData.trigger_type !== 'lead_created' && formData.trigger_type !== 'stage_change' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Dias</Label>
                      <Input
                        type="number"
                        min="0"
                        value={formData.trigger_config.duration_days}
                        onChange={(e) => setFormData({ 
                          ...formData, 
                          trigger_config: { ...formData.trigger_config, duration_days: parseInt(e.target.value) || 0 }
                        })}
                        className="mt-1 bg-white"
                      />
                    </div>
                    <div>
                      <Label>Horas</Label>
                      <Input
                        type="number"
                        min="0"
                        max="23"
                        value={formData.trigger_config.duration_hours || 0}
                        onChange={(e) => setFormData({ 
                          ...formData, 
                          trigger_config: { ...formData.trigger_config, duration_hours: parseInt(e.target.value) || 0 }
                        })}
                        className="mt-1 bg-white"
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Ação */}
            <Card className="border-green-200 bg-green-50">
              <CardHeader>
                <CardTitle className="text-lg">⚡ Então (Ação)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Tipo de Ação</Label>
                  <Select 
                    value={formData.action_type} 
                    onValueChange={(val) => setFormData({ 
                      ...formData, 
                      action_type: val
                    })}
                  >
                    <SelectTrigger className="mt-1 bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ACTION_TYPES.map(action => (
                        <SelectItem key={action.value} value={action.value}>
                          {action.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {formData.action_type === 'change_stage' && (
                  <div>
                    <Label>Novo Stage</Label>
                    <Select 
                      value={formData.action_config.new_stage} 
                      onValueChange={(val) => setFormData({ 
                        ...formData, 
                        action_config: { ...formData.action_config, new_stage: val }
                      })}
                    >
                      <SelectTrigger className="mt-1 bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STAGES.map(stage => (
                          <SelectItem key={stage.value} value={stage.value}>
                            {stage.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {formData.action_type === 'create_task' && (
                  <>
                    <div>
                      <Label>Título da Tarefa</Label>
                      <Input
                        value={formData.action_config.task_title}
                        onChange={(e) => setFormData({ 
                          ...formData, 
                          action_config: { ...formData.action_config, task_title: e.target.value }
                        })}
                        placeholder="Ex: Ligar para o lead"
                        className="mt-1 bg-white"
                      />
                    </div>
                    <div>
                      <Label>Descrição da Tarefa</Label>
                      <Textarea
                        value={formData.action_config.task_description}
                        onChange={(e) => setFormData({ 
                          ...formData, 
                          action_config: { ...formData.action_config, task_description: e.target.value }
                        })}
                        placeholder="Detalhes da tarefa..."
                        rows={2}
                        className="mt-1 bg-white"
                      />
                    </div>
                  </>
                )}

                {formData.action_type === 'send_notification' && (
                  <div>
                    <Label>Mensagem da Notificação</Label>
                    <Textarea
                      value={formData.action_config.notification_message}
                      onChange={(e) => setFormData({ 
                        ...formData, 
                        action_config: { ...formData.action_config, notification_message: e.target.value }
                      })}
                      placeholder="Ex: Lead sem contato há 7 dias, faça um follow-up"
                      rows={2}
                      className="mt-1 bg-white"
                    />
                  </div>
                )}

                {formData.action_type === 'send_whatsapp' && (
                  <>
                    <div>
                      <Label>Template de WhatsApp *</Label>
                      <div className="mt-1 flex gap-2">
                        <Input
                          value={formData.whatsapp_template_name || formData.whatsapp_template_id}
                          placeholder="Selecione um template..."
                          readOnly
                          className="bg-white flex-1"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setShowTemplateSelector(true)}
                        >
                          <MessageSquare className="w-4 h-4 mr-2" />
                          Selecionar
                        </Button>
                      </div>
                      {formData.whatsapp_template_id && (
                        <p className="text-xs text-gray-500 mt-1">
                          ID: {formData.whatsapp_template_id}
                        </p>
                      )}
                    </div>

                    <Alert className="bg-blue-50 border-blue-200">
                      <MessageSquare className="w-4 h-4 text-blue-600" />
                      <AlertDescription className="text-blue-800 text-sm">
                        <strong>Variáveis do template:</strong> O nome do lead e do vendedor serão inseridos automaticamente nos campos do template selecionado.
                      </AlertDescription>
                    </Alert>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Botões */}
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowDialog(false)}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={createRuleMutation.isPending || updateRuleMutation.isPending}
                className="flex-1 bg-yellow-600 hover:bg-yellow-700"
              >
                {editingRule ? 'Salvar Alterações' : 'Criar Regra'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <WhatsAppTemplateSelector
        open={showTemplateSelector}
        onOpenChange={setShowTemplateSelector}
        selectedTemplateId={formData.whatsapp_template_id}
        onSelect={selectTemplate}
        accentColor="yellow"
      />

      <AutomationTestDialog
        open={showTestDialog}
        onOpenChange={setShowTestDialog}
        automationType="lead_pf"
        automationId={testingAutomation?.id}
        templateId={testingAutomation?.whatsappTemplateId}
        templateName={testingAutomation?.whatsappTemplateName}
        accentColor="yellow"
      />
      </div>
    </div>
  );
}
