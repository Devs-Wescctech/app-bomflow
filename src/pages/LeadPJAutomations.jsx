import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Zap, Edit, Trash2, Play, Pause, Building2, MessageSquare, Loader2, CheckCircle2, AlertCircle, TestTube2, Users } from "lucide-react";
import { toast } from "sonner";
import WhatsAppTemplateSelector from "@/components/whatsapp/WhatsAppTemplateSelector";
import AutomationTestDialog from "@/components/whatsapp/AutomationTestDialog";
import AutomationLogsPanel from "@/components/whatsapp/AutomationLogsPanel";

const STAGES_PJ = [
  { value: 'novo', label: 'Novo' },
  { value: 'qualificacao', label: 'Qualificação' },
  { value: 'apresentacao', label: 'Apresentação' },
  { value: 'proposta_enviada', label: 'Proposta Enviada' },
  { value: 'negociacao', label: 'Negociação' },
  { value: 'fechado_ganho', label: 'Fechado - Ganho' },
  { value: 'fechado_perdido', label: 'Fechado - Perdido' },
];

const TRIGGER_TYPES = [
  { value: 'lead_created', label: 'Lead Novo (Boas-Vindas)' },
  { value: 'stage_change', label: 'Mudança de Etapa' },
  { value: 'stage_duration', label: 'Tempo na Etapa' },
  { value: 'inactivity', label: 'Inatividade' },
  { value: 'no_activity', label: 'Sem Atividade' },
  { value: 'no_proposal_response', label: 'Proposta Sem Resposta' },
  { value: 'no_contact', label: 'Sem Contato' },
];

const ACTION_TYPES = [
  { value: 'send_whatsapp', label: 'Enviar WhatsApp' },
  { value: 'internal_alert', label: 'Alerta Interno (Coordenador)' },
  { value: 'change_stage', label: 'Mudar Etapa' },
  { value: 'create_task', label: 'Criar Tarefa' },
  { value: 'send_notification', label: 'Enviar Notificação' },
  { value: 'assign_agent', label: 'Atribuir Agente' },
  { value: 'send_email', label: 'Enviar E-mail' },
];

export default function LeadPJAutomations() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAutomation, setEditingAutomation] = useState(null);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [showTestDialog, setShowTestDialog] = useState(false);
  const [testingAutomation, setTestingAutomation] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    active: true,
    trigger_type: "lead_created",
    trigger_config: {
      stage: "",
      duration_days: 0,
      duration_hours: 0,
    },
    action_type: "send_whatsapp",
    action_config: {
      new_stage: "",
      task_title: "",
      task_description: "",
      notification_message: "",
      agent_id: "",
      email_subject: "",
      email_body: "",
      alertMessage: "",
      templateMessage: "",
    },
    whatsapp_template_id: "",
    whatsapp_template_name: "",
    team_ids: [],
  });

  const { data: teams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: () => base44.entities.Team.list(),
    initialData: [],
  });

  const { data: automations = [], isLoading: automationsLoading } = useQuery({
    queryKey: ['leadPJAutomations'],
    queryFn: () => base44.entities.LeadPJAutomation.list(),
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: salesAgents = [] } = useQuery({
    queryKey: ['salesAgents'],
    queryFn: () => base44.entities.SalesAgent.list(),
    initialData: [],
  });

  const { data: templates = [], isLoading: templatesLoading } = useQuery({
    queryKey: ['whatsappTemplates'],
    queryFn: () => base44.whatsapp.getTemplates(),
    staleTime: 5 * 60 * 1000,
  });

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

  const createAutomationMutation = useMutation({
    mutationFn: (data) => base44.entities.LeadPJAutomation.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leadPJAutomations'] });
      setIsDialogOpen(false);
      resetForm();
      toast.success('Automação criada com sucesso!');
    },
  });

  const updateAutomationMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.LeadPJAutomation.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leadPJAutomations'] });
      setIsDialogOpen(false);
      resetForm();
      toast.success('Automação atualizada com sucesso!');
    },
  });

  const deleteAutomationMutation = useMutation({
    mutationFn: (id) => base44.entities.LeadPJAutomation.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leadPJAutomations'] });
      toast.success('Automação excluída!');
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, active }) => base44.entities.LeadPJAutomation.update(id, { active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leadPJAutomations'] });
      toast.success('Status atualizado!');
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
        stage: "",
        duration_days: 0,
        duration_hours: 0,
      },
      action_type: "send_whatsapp",
      action_config: {
        new_stage: "",
        task_title: "",
        task_description: "",
        notification_message: "",
        agent_id: "",
        email_subject: "",
        email_body: "",
        alertMessage: "",
        templateMessage: "",
      },
      whatsapp_template_id: "",
      whatsapp_template_name: "",
      team_ids: [],
    });
    setEditingAutomation(null);
  };

  const handleEdit = (automation) => {
    setEditingAutomation(automation);
    const triggerConfig = parseConfig(automation.triggerConfig) || {};
    const actionConfig = parseConfig(automation.actionConfig) || {};

    const defaultActionConfig = {
      new_stage: "",
      task_title: "",
      task_description: "",
      notification_message: "",
      agent_id: "",
      email_subject: "",
      email_body: "",
      alertMessage: "",
      templateMessage: "",
    };

    const defaultTriggerConfig = {
      stage: "",
      duration_days: 0,
      duration_hours: 0,
    };

    setFormData({
      name: automation.name || "",
      description: automation.description || "",
      active: automation.active !== false,
      trigger_type: automation.triggerType || "lead_created",
      trigger_config: {
        ...defaultTriggerConfig,
        stage: triggerConfig.stage || "",
        duration_days: triggerConfig.duration_days || triggerConfig.durationDays || triggerConfig.days || 0,
        duration_hours: triggerConfig.duration_hours || triggerConfig.durationHours || triggerConfig.hours || 0,
      },
      action_type: automation.actionType || "send_whatsapp",
      action_config: {
        ...defaultActionConfig,
        ...actionConfig,
      },
      whatsapp_template_id: automation.whatsappTemplateId || actionConfig.whatsapp_template_id || actionConfig.whatsappTemplateId || "",
      whatsapp_template_name: automation.whatsappTemplateName || actionConfig.whatsapp_template_name || actionConfig.whatsappTemplateName || "",
      team_ids: automation.teamIds || [],
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.name || !formData.trigger_type) {
      toast.error('Preencha os campos obrigatórios');
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
      team_ids: formData.team_ids,
    };

    if (editingAutomation) {
      updateAutomationMutation.mutate({
        id: editingAutomation.id,
        data: dataToSave
      });
    } else {
      createAutomationMutation.mutate(dataToSave);
    }
  };

  const getTriggerLabel = (type) => {
    return TRIGGER_TYPES.find(t => t.value === type)?.label || type;
  };

  const getActionLabel = (type) => {
    return ACTION_TYPES.find(a => a.value === type)?.label || type;
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-3">
              <Zap className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
              Automações de Vendas PJ
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              Configure ações automáticas para o pipeline B2B
            </p>
          </div>
          <div className="flex items-center gap-2">
            <AutomationLogsPanel automationType="lead_pj" colorScheme="indigo" />
            <Button onClick={() => setIsDialogOpen(true)} className="bg-indigo-600 hover:bg-indigo-700">
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
                    {automations.filter(a => a.active).length}
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
                    {automations.filter(a => !a.active).length}
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
          {automations.length === 0 ? (
            <Card className="bg-white dark:bg-gray-900">
              <CardContent className="p-12 text-center">
                <Zap className="w-16 h-16 text-gray-300 dark:text-gray-700 mx-auto mb-4" />
                <p className="text-gray-600 dark:text-gray-400 font-medium mb-2">
                  Nenhuma automação criada
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-500 mb-4">
                  Crie automações para otimizar seu processo de vendas B2B
                </p>
                <Button onClick={() => setIsDialogOpen(true)} variant="outline">
                  <Plus className="w-4 h-4 mr-2" />
                  Criar primeira automação
                </Button>
              </CardContent>
            </Card>
          ) : (
            automations.map(automation => {
              const triggerConfig = parseConfig(automation.triggerConfig);
              const actionConfig = parseConfig(automation.actionConfig);
              return (
              <Card key={automation.id} className={`bg-white dark:bg-gray-900 ${automation.active ? 'border-indigo-200 dark:border-indigo-800' : 'opacity-60'}`}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                          {automation.name}
                        </h3>
                        <Badge className={automation.active ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300" : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"}>
                          {automation.active ? 'Ativa' : 'Inativa'}
                        </Badge>
                        <Badge variant="outline" className="text-indigo-600 border-indigo-300 dark:text-indigo-400 dark:border-indigo-700">
                          <Users className="w-3 h-3 mr-1" />
                          {(() => {
                            const tIds = automation.teamIds || [];
                            if (tIds.length === 0) return 'Todos os times';
                            const tNames = tIds.map(tid => teams.find(t => t.id === tid)?.name).filter(Boolean);
                            if (tNames.length <= 2) return tNames.join(', ');
                            return `${tNames.length} times`;
                          })()}
                        </Badge>
                      </div>
                      
                      {automation.description && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                          {automation.description}
                        </p>
                      )}

                      <div className="grid grid-cols-2 gap-4 mt-4">
                        <div className="bg-blue-50 dark:bg-blue-950 p-3 rounded-lg">
                          <p className="text-xs text-blue-600 dark:text-blue-400 font-semibold mb-1">GATILHO</p>
                          <p className="text-sm text-gray-900 dark:text-gray-100">
                            {getTriggerLabel(automation.triggerType)}
                          </p>
                          {triggerConfig?.stage && (
                            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                              Etapa: {STAGES_PJ.find(s => s.value === triggerConfig.stage)?.label}
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
                            {getActionLabel(automation.actionType)}
                          </p>
                          {(actionConfig?.task_title || actionConfig?.taskTitle) && (
                            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 truncate">
                              {actionConfig.task_title || actionConfig.taskTitle}
                            </p>
                          )}
                          {(actionConfig?.new_stage || actionConfig?.newStage) && (
                            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                              Para: {STAGES_PJ.find(s => s.value === (actionConfig.new_stage || actionConfig.newStage))?.label}
                            </p>
                          )}
                          {automation.actionType === 'send_whatsapp' && automation.whatsappTemplateName && (
                            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 truncate">
                              Template: {automation.whatsappTemplateName}
                            </p>
                          )}
                          {automation.actionType === 'send_whatsapp' && actionConfig?.templateMessage && (
                            <div className="mt-2 p-2 bg-gray-100 dark:bg-gray-800 rounded-md">
                              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 font-medium">Texto da mensagem:</p>
                              <p className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap line-clamp-4">
                                {actionConfig.templateMessage}
                              </p>
                            </div>
                          )}
                          {automation.actionType === 'internal_alert' && actionConfig?.alertMessage && (
                            <div className="mt-2 p-2 bg-yellow-50 dark:bg-yellow-950 rounded-md">
                              <p className="text-xs text-yellow-600 dark:text-yellow-400 mb-1 font-medium">Alerta interno:</p>
                              <p className="text-xs text-yellow-700 dark:text-yellow-300 whitespace-pre-wrap line-clamp-4">
                                {actionConfig.alertMessage}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>

                      {automation.executionCount > 0 && (
                        <div className="mt-4 text-xs text-gray-500 dark:text-gray-500">
                          Executada {automation.executionCount} {automation.executionCount === 1 ? 'vez' : 'vezes'}
                          {automation.lastExecution && (
                            <span> • Última execução: {new Date(automation.lastExecution).toLocaleString('pt-BR')}</span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <Switch
                        checked={automation.active}
                        onCheckedChange={(checked) => toggleActiveMutation.mutate({ id: automation.id, active: checked })}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setTestingAutomation(automation);
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
                        onClick={() => handleEdit(automation)}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (confirm('Deseja excluir esta automação?')) {
                            deleteAutomationMutation.mutate(automation.id);
                          }
                        }}
                      >
                        <Trash2 className="w-4 h-4 text-red-600 dark:text-red-400" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );})
          )}
        </div>
      </div>

      {/* Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-900">
          <DialogHeader>
            <DialogTitle className="text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-indigo-600" />
              {editingAutomation ? 'Editar Automação' : 'Nova Automação'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label>Nome da Automação *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                placeholder="Ex: Alertar leads sem contato há 7 dias"
                className="mt-1"
              />
            </div>

            <div>
              <Label>Descrição</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                placeholder="Descreva o que esta automação faz..."
                rows={2}
                className="mt-1"
              />
            </div>

            <div>
              <Label>Times <span className="text-red-500">*</span></Label>
              <div className="mt-2 space-y-2">
                {teams.map(team => (
                  <div key={team.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`team-pj-${team.id}`}
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
                    <label htmlFor={`team-pj-${team.id}`} className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                      {team.name}
                    </label>
                  </div>
                ))}
              </div>
              {formData.team_ids.length > 0 && (
                <p className="text-sm text-muted-foreground mt-1">
                  {formData.team_ids.length} time(s) selecionado(s)
                </p>
              )}
            </div>

            {/* Trigger */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Gatilho</h3>
              <div className="space-y-3">
                <div>
                  <Label>Tipo de Gatilho *</Label>
                  <Select 
                    value={formData.trigger_type} 
                    onValueChange={(val) => setFormData({...formData, trigger_type: val})}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TRIGGER_TYPES.map(trigger => (
                        <SelectItem key={trigger.value} value={trigger.value}>{trigger.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {formData.trigger_type !== 'lead_created' && (
                  <div>
                    <Label>Etapa</Label>
                    <Select 
                      value={formData.trigger_config.stage} 
                      onValueChange={(val) => setFormData({...formData, trigger_config: {...formData.trigger_config, stage: val}})}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Selecione uma etapa" />
                      </SelectTrigger>
                      <SelectContent>
                        {STAGES_PJ.map(stage => (
                          <SelectItem key={stage.value} value={stage.value}>{stage.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {formData.trigger_type !== 'lead_created' && formData.trigger_type !== 'stage_change' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Duração (dias)</Label>
                      <Input
                        type="number"
                        value={formData.trigger_config.duration_days}
                        onChange={(e) => setFormData({...formData, trigger_config: {...formData.trigger_config, duration_days: parseInt(e.target.value) || 0}})}
                        placeholder="0"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label>Duração (horas)</Label>
                      <Input
                        type="number"
                        value={formData.trigger_config.duration_hours}
                        onChange={(e) => setFormData({...formData, trigger_config: {...formData.trigger_config, duration_hours: parseInt(e.target.value) || 0}})}
                        placeholder="0"
                        className="mt-1"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Action */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Ação</h3>
              <div className="space-y-3">
                <div>
                  <Label>Tipo de Ação *</Label>
                  <Select 
                    value={formData.action_type} 
                    onValueChange={(val) => setFormData({...formData, action_type: val})}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ACTION_TYPES.map(action => (
                        <SelectItem key={action.value} value={action.value}>{action.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {formData.action_type === 'change_stage' && (
                  <div>
                    <Label>Nova Etapa</Label>
                    <Select 
                      value={formData.action_config.new_stage} 
                      onValueChange={(val) => setFormData({...formData, action_config: {...formData.action_config, new_stage: val}})}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {STAGES_PJ.map(stage => (
                          <SelectItem key={stage.value} value={stage.value}>{stage.label}</SelectItem>
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
                        onChange={(e) => setFormData({...formData, action_config: {...formData.action_config, task_title: e.target.value}})}
                        placeholder="Ex: Entrar em contato com a empresa"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label>Descrição da Tarefa</Label>
                      <Textarea
                        value={formData.action_config.task_description}
                        onChange={(e) => setFormData({...formData, action_config: {...formData.action_config, task_description: e.target.value}})}
                        placeholder="Detalhes da tarefa..."
                        rows={2}
                        className="mt-1"
                      />
                    </div>
                  </>
                )}

                {formData.action_type === 'send_notification' && (
                  <div>
                    <Label>Mensagem da Notificação</Label>
                    <Textarea
                      value={formData.action_config.notification_message}
                      onChange={(e) => setFormData({...formData, action_config: {...formData.action_config, notification_message: e.target.value}})}
                      placeholder="Mensagem a ser enviada..."
                      rows={2}
                      className="mt-1"
                    />
                  </div>
                )}

                {formData.action_type === 'send_email' && (
                  <>
                    <div>
                      <Label>Assunto do E-mail</Label>
                      <Input
                        value={formData.action_config.email_subject}
                        onChange={(e) => setFormData({...formData, action_config: {...formData.action_config, email_subject: e.target.value}})}
                        placeholder="Assunto..."
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label>Corpo do E-mail</Label>
                      <Textarea
                        value={formData.action_config.email_body}
                        onChange={(e) => setFormData({...formData, action_config: {...formData.action_config, email_body: e.target.value}})}
                        placeholder="Conteúdo do e-mail..."
                        rows={3}
                        className="mt-1"
                      />
                    </div>
                  </>
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
                          className="flex-1"
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
                        <strong>Variáveis do template:</strong> O nome do lead PJ, contato e vendedor serão inseridos automaticamente nos campos do template.
                      </AlertDescription>
                    </Alert>
                  </>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={!formData.name || !formData.trigger_type}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              {editingAutomation ? 'Salvar' : 'Criar Automação'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <WhatsAppTemplateSelector
        open={showTemplateSelector}
        onOpenChange={setShowTemplateSelector}
        selectedTemplateId={formData.whatsapp_template_id}
        onSelect={selectTemplate}
        accentColor="indigo"
      />

      <AutomationTestDialog
        open={showTestDialog}
        onOpenChange={setShowTestDialog}
        automationType="lead_pj"
        automationId={testingAutomation?.id}
        templateId={testingAutomation?.whatsappTemplateId}
        templateName={testingAutomation?.whatsappTemplateName}
        accentColor="indigo"
      />
    </div>
  );
}