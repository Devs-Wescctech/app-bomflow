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
  Gift,
  Loader2,
  CheckCircle2,
  AlertCircle,
  TestTube2,
  Mail,
  Send,
  Settings,
  Eye,
  EyeOff,
  Save,
  ChevronDown,
  ChevronUp
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
import WhatsAppTemplateSelector from "@/components/whatsapp/WhatsAppTemplateSelector";
import AutomationTestDialog from "@/components/whatsapp/AutomationTestDialog";
import AutomationLogsPanel from "@/components/whatsapp/AutomationLogsPanel";

const STAGES = [
  { value: "novo", label: "Novo" },
  { value: "em_contato", label: "Em Contato" },
  { value: "qualificado", label: "Fechado" },
  { value: "proposta_enviada", label: "Proposta Enviada" },
  { value: "fechado_ganho", label: "Fechado - Ganho" },
  { value: "fechado_perdido", label: "Fechado - Perdido" },
];

const TRIGGER_TYPES = [
  { value: "lead_created", label: "Indicação Nova (Boas-Vindas)" },
  { value: "stage_change", label: "Mudança de Etapa" },
  { value: "stage_duration", label: "Tempo na Etapa" },
  { value: "inactivity", label: "Inatividade" },
  { value: "no_activity", label: "Sem Atividade" },
  { value: "no_contact", label: "Sem Contato" },
];

const ACTION_TYPES = [
  { value: "send_whatsapp", label: "Enviar WhatsApp" },
  { value: "internal_alert", label: "Alerta Interno (Coordenador)" },
  { value: "change_stage", label: "Mudar Etapa" },
  { value: "create_task", label: "Criar Tarefa" },
  { value: "send_notification", label: "Enviar Notificação" },
  { value: "notify_supervisor", label: "Alertar Coordenador" },
];

const parseConfig = (config) => {
  if (!config) return {};
  if (typeof config === 'string') {
    try {
      return JSON.parse(config);
    } catch (e) {
      return {};
    }
  }
  return config;
};

export default function ReferralAutomations() {
  const queryClient = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [showTestDialog, setShowTestDialog] = useState(false);
  const [testingAutomation, setTestingAutomation] = useState(null);
  const [emailSectionOpen, setEmailSectionOpen] = useState(false);
  const [showSmtpPassword, setShowSmtpPassword] = useState(false);
  const [emailConfig, setEmailConfig] = useState({
    smtp_server: 'email-ssl.com.br',
    smtp_port: '465',
    smtp_user: 'noreplybompastor@wescctech.com.br',
    smtp_password: '',
    email_from: 'noreplybompastor@wescctech.com.br',
    email_to: 'tais.dequi@wescctech.com.br'
  });
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
      whatsapp_template_id: "",
      whatsapp_template_name: "",
      alertMessage: "",
      templateMessage: "",
    },
    whatsapp_template_id: "",
    whatsapp_template_name: "",
    priority: 0,
    stop_on_trigger: false,
  });

  const { data: rules = [], isLoading: rulesLoading } = useQuery({
    queryKey: ['referralAutomations'],
    queryFn: () => base44.entities.ReferralAutomation.list('-created_at'),
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: templates = [], isLoading: templatesLoading } = useQuery({
    queryKey: ['whatsappTemplates'],
    queryFn: () => base44.whatsapp.getTemplates(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: connectionTest } = useQuery({
    queryKey: ['whatsappConnection'],
    queryFn: () => base44.whatsapp.testConnection(),
    staleTime: 60 * 1000,
    retry: false,
  });

  const fetchWithAuth = async (url, options = {}) => {
    const token = localStorage.getItem('accessToken');
    const resp = await fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, ...options.headers }
    });
    if (!resp.ok) {
      const errBody = await resp.json().catch(() => ({}));
      throw new Error(errBody.error || `HTTP ${resp.status}`);
    }
    return resp.json();
  };

  const { data: emailSettingsData } = useQuery({
    queryKey: ['email-commission-settings'],
    queryFn: () => fetchWithAuth('/api/functions/email-commission-settings'),
    staleTime: 60000,
  });

  const [emailConfigLoaded, setEmailConfigLoaded] = useState(false);
  if (emailSettingsData?.settings && !emailConfigLoaded) {
    const s = emailSettingsData.settings;
    setEmailConfig({
      smtp_server: s.smtp_server || 'email-ssl.com.br',
      smtp_port: String(s.smtp_port || 465),
      smtp_user: s.smtp_user || '',
      smtp_password: s.smtp_password || '',
      email_from: s.email_from || '',
      email_to: s.email_to || ''
    });
    setEmailConfigLoaded(true);
  }

  const saveEmailConfigMutation = useMutation({
    mutationFn: (data) => fetchWithAuth('/api/functions/email-commission-settings', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-commission-settings'] });
      toast.success('Configurações de email salvas!');
    },
    onError: (err) => toast.error(`Erro ao salvar: ${err.message}`),
  });

  const testEmailMutation = useMutation({
    mutationFn: () => fetchWithAuth('/api/functions/commission-report/test', { method: 'POST' }),
    onSuccess: (data) => toast.success(data.message || 'Email de teste enviado!'),
    onError: (err) => toast.error(`Erro no teste: ${err.message}`),
  });

  const sendReportMutation = useMutation({
    mutationFn: () => fetchWithAuth('/api/functions/commission-report/send', { method: 'POST' }),
    onSuccess: (data) => {
      if (data.skipped) {
        toast.info(data.message);
      } else {
        toast.success(`Relatório enviado! ${data.totalIndicadores} indicadores, R$ ${data.valorTotal?.toFixed(2)}`);
      }
    },
    onError: (err) => toast.error(`Erro no envio: ${err.message}`),
  });

  const createRuleMutation = useMutation({
    mutationFn: (data) => base44.entities.ReferralAutomation.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['referralAutomations'] });
      toast.success('Automação criada com sucesso!');
      setShowDialog(false);
      resetForm();
    },
    onError: (error) => {
      toast.error(`Erro ao criar automação: ${error.message}`);
    },
  });

  const updateRuleMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ReferralAutomation.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['referralAutomations'] });
      toast.success('Automação atualizada!');
      setShowDialog(false);
      resetForm();
    },
    onError: (error) => {
      toast.error(`Erro ao atualizar: ${error.message}`);
    },
  });

  const deleteRuleMutation = useMutation({
    mutationFn: (id) => base44.entities.ReferralAutomation.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['referralAutomations'] });
      toast.success('Automação excluída!');
    },
  });

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
        whatsapp_template_id: "",
        whatsapp_template_name: "",
        alertMessage: "",
        templateMessage: "",
      },
      whatsapp_template_id: "",
      whatsapp_template_name: "",
      priority: 0,
      stop_on_trigger: false,
    });
    setEditingRule(null);
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
      whatsapp_template_id: "",
      whatsapp_template_name: "",
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
      priority: rule.priority || 0,
      stop_on_trigger: rule.stopOnTrigger || false,
    });
    setShowDialog(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!formData.name) {
      toast.error('Nome da automação é obrigatório!');
      return;
    }

    if (formData.action_type === 'send_whatsapp' && !formData.whatsapp_template_id) {
      toast.error('Selecione um template de WhatsApp!');
      return;
    }

    const submitData = {
      ...formData,
      trigger_config: JSON.stringify(formData.trigger_config),
      action_config: JSON.stringify({
        ...formData.action_config,
        whatsapp_template_id: formData.whatsapp_template_id,
        whatsapp_template_name: formData.whatsapp_template_name,
      }),
    };

    if (editingRule) {
      updateRuleMutation.mutate({ id: editingRule.id, data: submitData });
    } else {
      createRuleMutation.mutate(submitData);
    }
  };

  const handleToggleActive = (rule) => {
    updateRuleMutation.mutate({
      id: rule.id,
      data: { active: !rule.active }
    });
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
              <Gift className="w-8 h-8 text-amber-600 dark:text-amber-400" />
              Automações de Indicações
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              Configure ações automáticas para o pipeline de indicações
            </p>
          </div>
          <div className="flex items-center gap-2">
            <AutomationLogsPanel automationType="referral" colorScheme="amber" />
            <Button
              onClick={() => {
                resetForm();
                setShowDialog(true);
              }}
              className="bg-amber-600 hover:bg-amber-700"
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

        <Card className="bg-white dark:bg-gray-900">
          <CardHeader className="cursor-pointer" onClick={() => setEmailSectionOpen(!emailSectionOpen)}>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Mail className="w-5 h-5 text-amber-600" />
                Configuração de Email de Comissões
              </CardTitle>
              <div className="flex items-center gap-2">
                {emailSettingsData?.settings?.smtp_password && emailSettingsData.settings.smtp_password !== '' && (
                  <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Configurado</Badge>
                )}
                {emailSectionOpen ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
              </div>
            </div>
          </CardHeader>
          {emailSectionOpen && (
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Servidor SMTP</Label>
                  <Input
                    value={emailConfig.smtp_server}
                    onChange={(e) => setEmailConfig({ ...emailConfig, smtp_server: e.target.value })}
                    placeholder="email-ssl.com.br"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Porta SMTP</Label>
                  <Input
                    value={emailConfig.smtp_port}
                    onChange={(e) => setEmailConfig({ ...emailConfig, smtp_port: e.target.value })}
                    placeholder="465"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Usuário SMTP</Label>
                  <Input
                    value={emailConfig.smtp_user}
                    onChange={(e) => setEmailConfig({ ...emailConfig, smtp_user: e.target.value })}
                    placeholder="noreplybompastor@wescctech.com.br"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Senha SMTP</Label>
                  <div className="relative">
                    <Input
                      type={showSmtpPassword ? 'text' : 'password'}
                      value={emailConfig.smtp_password}
                      onChange={(e) => setEmailConfig({ ...emailConfig, smtp_password: e.target.value })}
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      onClick={() => setShowSmtpPassword(!showSmtpPassword)}
                    >
                      {showSmtpPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Email Remetente</Label>
                  <Input
                    value={emailConfig.email_from}
                    onChange={(e) => setEmailConfig({ ...emailConfig, email_from: e.target.value })}
                    placeholder="noreplybompastor@wescctech.com.br"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email Destinatário</Label>
                  <Input
                    value={emailConfig.email_to}
                    onChange={(e) => setEmailConfig({ ...emailConfig, email_to: e.target.value })}
                    placeholder="tais.dequi@wescctech.com.br"
                  />
                  <p className="text-xs text-gray-500">Separe múltiplos emails com vírgula</p>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-4 border-t">
                <Button
                  onClick={() => saveEmailConfigMutation.mutate(emailConfig)}
                  disabled={saveEmailConfigMutation.isPending}
                  className="bg-amber-600 hover:bg-amber-700"
                >
                  {saveEmailConfigMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                  Salvar Configurações
                </Button>
                <Button
                  variant="outline"
                  onClick={() => testEmailMutation.mutate()}
                  disabled={testEmailMutation.isPending}
                >
                  {testEmailMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <TestTube2 className="w-4 h-4 mr-2" />}
                  Testar Envio de Email
                </Button>
                <Button
                  variant="outline"
                  onClick={() => sendReportMutation.mutate()}
                  disabled={sendReportMutation.isPending}
                  className="border-green-300 text-green-700 hover:bg-green-50"
                >
                  {sendReportMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                  Enviar Relatório de Comissões
                </Button>
              </div>

              {(!emailSettingsData?.settings?.smtp_password || emailSettingsData.settings.smtp_password === '') && (
                <Alert className="bg-amber-50 dark:bg-amber-950 border-amber-300">
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                  <AlertDescription className="text-sm text-amber-800 dark:text-amber-200">
                    <strong>Atenção:</strong> A senha SMTP ainda não foi salva. Preencha o campo "Senha SMTP" e clique em "Salvar Configurações" antes de testar ou enviar relatórios.
                  </AlertDescription>
                </Alert>
              )}

              <Alert className="bg-blue-50 dark:bg-blue-950 border-blue-200">
                <AlertDescription className="text-sm">
                  O relatório semanal é enviado automaticamente toda quarta-feira às 08:00, cobrindo o período de quarta a terça.
                  Use os botões acima para testar ou reenviar manualmente.
                </AlertDescription>
              </Alert>
            </CardContent>
          )}
        </Card>

        {/* Automations List */}
        <div className="grid gap-4">
          {rulesLoading ? (
            <Card className="bg-white dark:bg-gray-900">
              <CardContent className="p-12 text-center">
                <Loader2 className="w-8 h-8 mx-auto animate-spin text-amber-600" />
                <p className="mt-2 text-gray-600 dark:text-gray-400">Carregando automações...</p>
              </CardContent>
            </Card>
          ) : rules.length === 0 ? (
            <Card className="bg-white dark:bg-gray-900">
              <CardContent className="p-12 text-center">
                <Zap className="w-16 h-16 text-gray-300 dark:text-gray-700 mx-auto mb-4" />
                <p className="text-gray-600 dark:text-gray-400 font-medium mb-2">
                  Nenhuma automação criada
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-500 mb-4">
                  Crie automações para otimizar seu processo de indicações
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
                <Card key={rule.id} className={`bg-white dark:bg-gray-900 ${rule.active ? 'border-amber-200 dark:border-amber-800' : 'opacity-60'}`}>
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{rule.name}</h3>
                          <Badge className={rule.active ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300" : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"}>
                            {rule.active ? 'Ativa' : 'Inativa'}
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
                            {triggerConfig.stage && (
                              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                Etapa: {getStageLabel(triggerConfig.stage)}
                              </p>
                            )}
                            {(triggerConfig.duration_days || triggerConfig.durationDays) > 0 && (
                              <p className="text-xs text-gray-600 dark:text-gray-400">
                                {triggerConfig.duration_days || triggerConfig.durationDays} dias
                              </p>
                            )}
                            {(triggerConfig.duration_hours || triggerConfig.durationHours || triggerConfig.hours) > 0 && (
                              <p className="text-xs text-gray-600 dark:text-gray-400">
                                {triggerConfig.duration_hours || triggerConfig.durationHours || triggerConfig.hours}h
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

                      {rule.execution_count > 0 && (
                        <div className="mt-4 text-xs text-gray-500 dark:text-gray-500">
                          Executada {rule.execution_count} {rule.execution_count === 1 ? 'vez' : 'vezes'}
                          {rule.last_execution && (
                            <span> • Última execução: {new Date(rule.last_execution).toLocaleString('pt-BR')}</span>
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
                          if (confirm('Deseja excluir esta automação?')) {
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
            );
          })
        )}
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingRule ? 'Editar Automação' : 'Nova Automação de Indicações'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              <div>
                <Label>Nome da Automação *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: Boas-vindas ao novo indicado"
                  className="mt-1"
                />
              </div>

              <div>
                <Label>Descrição</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Descreva o objetivo desta automação..."
                  rows={2}
                  className="mt-1"
                />
              </div>
            </div>

            <Card className="border-blue-200 bg-blue-50">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  Quando (Gatilho)
                </CardTitle>
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
                    <Label>Etapa</Label>
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

                {(formData.trigger_type === 'stage_duration' || formData.trigger_type === 'no_activity' || formData.trigger_type === 'no_contact') && (
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
                        value={formData.trigger_config.duration_hours}
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

            <Card className="border-green-200 bg-green-50">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Zap className="w-5 h-5" />
                  Então (Ação)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Tipo de Ação</Label>
                  <Select 
                    value={formData.action_type} 
                    onValueChange={(val) => setFormData({ ...formData, action_type: val })}
                  >
                    <SelectTrigger className="mt-1 bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ACTION_TYPES.map(type => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {formData.action_type === 'send_whatsapp' && (
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
                )}

                {formData.action_type === 'change_stage' && (
                  <div>
                    <Label>Nova Etapa</Label>
                    <Select 
                      value={formData.action_config.new_stage} 
                      onValueChange={(val) => setFormData({ 
                        ...formData, 
                        action_config: { ...formData.action_config, new_stage: val }
                      })}
                    >
                      <SelectTrigger className="mt-1 bg-white">
                        <SelectValue placeholder="Selecione..." />
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
                        placeholder="Ex: Ligar para o indicado"
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

                {(formData.action_type === 'send_notification' || formData.action_type === 'notify_supervisor') && (
                  <div>
                    <Label>Mensagem da Notificação</Label>
                    <Textarea
                      value={formData.action_config.notification_message}
                      onChange={(e) => setFormData({ 
                        ...formData, 
                        action_config: { ...formData.action_config, notification_message: e.target.value }
                      })}
                      placeholder="Ex: Indicação sem contato após 48h. Verificar com vendedor."
                      rows={2}
                      className="mt-1 bg-white"
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.active}
                  onCheckedChange={(checked) => setFormData({ ...formData, active: checked })}
                />
                <Label>Ativar automação</Label>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>
                Cancelar
              </Button>
              <Button 
                type="submit" 
                className="bg-amber-600 hover:bg-amber-700"
                disabled={createRuleMutation.isPending || updateRuleMutation.isPending}
              >
                {(createRuleMutation.isPending || updateRuleMutation.isPending) ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  editingRule ? 'Atualizar' : 'Criar Automação'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <WhatsAppTemplateSelector
        open={showTemplateSelector}
        onOpenChange={setShowTemplateSelector}
        selectedTemplateId={formData.whatsapp_template_id}
        onSelect={selectTemplate}
        accentColor="green"
      />

      <AutomationTestDialog
        open={showTestDialog}
        onOpenChange={setShowTestDialog}
        automationType="referral"
        automationId={testingAutomation?.id}
        templateId={testingAutomation?.whatsappTemplateId}
        templateName={testingAutomation?.whatsappTemplateName}
        accentColor="green"
      />
      </div>
    </div>
  );
}
