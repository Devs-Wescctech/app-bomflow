import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { getTemplatesByToken } from "@/api/channelApi";
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
  Play,
  Pause,
  MessageSquare,
  Gift,
  Loader2,
  CheckCircle2,
  AlertCircle,
  TestTube2,
  Eye,
  EyeOff,
  Save,
  Radio,
  Search,
  RefreshCw,
  Key
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import WhatsAppTemplateSelectorByToken from "@/components/whatsapp/WhatsAppTemplateSelectorByToken";
import AutomationLogsPanel from "@/components/whatsapp/AutomationLogsPanel";

const STAGES = [
  { value: "novo", label: "Novo" },
  { value: "em_contato", label: "Em Contato" },
  { value: "proposta_enviada", label: "Proposta Enviada" },
  { value: "fechado_ganho", label: "Fechado - Ganho" },
  { value: "fechado_perdido", label: "Fechado - Perdido" },
];

const TRIGGER_TYPES = [
  { value: "inactivity", label: "Inatividade" },
  { value: "stage_duration", label: "Tempo na Etapa" },
];

const ACTION_TYPES = [
  { value: "send_whatsapp", label: "Enviar WhatsApp" },
  { value: "internal_alert", label: "Alerta Interno (Coordenador)" },
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

const fetchWithAuth = async (url, options = {}) => {
  const token = localStorage.getItem('accessToken');
  const resp = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, ...options.headers }
  });
  if (!resp.ok) {
    const errBody = await resp.json().catch(() => ({}));
    throw new Error(errBody.error || errBody.message || `HTTP ${resp.status}`);
  }
  return resp.json();
};

const createChannelAutomationClient = () => {
  const base = '/api/referral-channel-automations';
  return {
    list: (sort) => fetchWithAuth(`${base}?sort=${sort || '-created_at'}&limit=10000`),
    create: (data) => fetchWithAuth(base, { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => fetchWithAuth(`${base}/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => fetchWithAuth(`${base}/${id}`, { method: 'DELETE' }),
  };
};

const createChannelConfigClient = () => {
  const base = '/api/referral-channel-config';
  return {
    list: () => fetchWithAuth(`${base}?limit=100`),
    create: (data) => fetchWithAuth(base, { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => fetchWithAuth(`${base}/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => fetchWithAuth(`${base}/${id}`, { method: 'DELETE' }),
  };
};

const channelAutomationApi = createChannelAutomationClient();
const channelConfigApi = createChannelConfigClient();

export default function ReferralChannelAutomations() {
  const queryClient = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);

  const [channelToken, setChannelToken] = useState("");
  const [channelLabel, setChannelLabel] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [tokenVerified, setTokenVerified] = useState(false);
  const [tokenTemplateCount, setTokenTemplateCount] = useState(null);
  const [verifyingToken, setVerifyingToken] = useState(false);
  const [activeConfigId, setActiveConfigId] = useState(null);

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    active: true,
    trigger_type: "inactivity",
    trigger_config: {
      stage: "novo",
      duration_days: 0,
      duration_hours: 0,
    },
    action_type: "send_whatsapp",
    action_config: {
      alertMessage: "",
      templateMessage: "",
    },
    whatsapp_template_id: "",
    whatsapp_template_name: "",
    priority: 0,
    stop_on_trigger: false,
  });

  const { data: configs = [] } = useQuery({
    queryKey: ['referralChannelConfig'],
    queryFn: () => channelConfigApi.list(),
    staleTime: 2 * 60 * 1000,
  });

  const configLoaded = useState(false);
  if (configs.length > 0 && !configLoaded[0]) {
    const cfg = configs[0];
    const t = cfg.channelToken || cfg.channel_token || '';
    const l = cfg.channelLabel || cfg.channel_label || '';
    if (t) {
      setChannelToken(t);
      setChannelLabel(l);
      setActiveConfigId(cfg.id);
      configLoaded[1](true);
    }
  }

  const { data: rules = [], isLoading: rulesLoading } = useQuery({
    queryKey: ['referralChannelAutomations'],
    queryFn: () => channelAutomationApi.list('-created_at'),
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const createRuleMutation = useMutation({
    mutationFn: (data) => channelAutomationApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['referralChannelAutomations'] });
      toast.success('Automacao criada com sucesso!');
      setShowDialog(false);
      resetForm();
    },
    onError: (error) => {
      toast.error(`Erro ao criar automacao: ${error.message}`);
    },
  });

  const updateRuleMutation = useMutation({
    mutationFn: ({ id, data }) => channelAutomationApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['referralChannelAutomations'] });
      toast.success('Automacao atualizada!');
      setShowDialog(false);
      resetForm();
    },
    onError: (error) => {
      toast.error(`Erro ao atualizar: ${error.message}`);
    },
  });

  const deleteRuleMutation = useMutation({
    mutationFn: (id) => channelAutomationApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['referralChannelAutomations'] });
      toast.success('Automacao excluida!');
    },
  });

  const handleVerifyToken = async () => {
    if (!channelToken.trim()) {
      toast.error('Informe o token do canal');
      return;
    }
    setVerifyingToken(true);
    try {
      const templates = await getTemplatesByToken(channelToken.trim());
      const count = Array.isArray(templates) ? templates.length : 0;
      setTokenTemplateCount(count);
      setTokenVerified(true);
      toast.success(`${count} template${count !== 1 ? 's' : ''} encontrado${count !== 1 ? 's' : ''} neste canal`);
    } catch (err) {
      setTokenVerified(false);
      setTokenTemplateCount(null);
      toast.error(`Token invalido ou erro de conexao: ${err.message}`);
    } finally {
      setVerifyingToken(false);
    }
  };

  const handleSaveConfig = async () => {
    if (!channelToken.trim()) {
      toast.error('Informe o token do canal');
      return;
    }
    try {
      if (activeConfigId) {
        await channelConfigApi.update(activeConfigId, {
          channel_token: channelToken.trim(),
          channel_label: channelLabel.trim(),
        });
      } else {
        const result = await channelConfigApi.create({
          channel_token: channelToken.trim(),
          channel_label: channelLabel.trim(),
        });
        setActiveConfigId(result.id);
      }
      queryClient.invalidateQueries({ queryKey: ['referralChannelConfig'] });
      toast.success('Configuracao do canal salva!');
    } catch (err) {
      toast.error(`Erro ao salvar: ${err.message}`);
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      active: true,
      trigger_type: "inactivity",
      trigger_config: {
        stage: "novo",
        duration_days: 0,
        duration_hours: 0,
      },
      action_type: "send_whatsapp",
      action_config: {
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
    const triggerConfig = parseConfig(rule.triggerConfig || rule.trigger_config) || {};
    const actionConfig = parseConfig(rule.actionConfig || rule.action_config) || {};
    
    setFormData({
      name: rule.name || "",
      description: rule.description || "",
      active: rule.active !== false,
      trigger_type: rule.triggerType || rule.trigger_type || "inactivity",
      trigger_config: {
        stage: triggerConfig.stage || "novo",
        duration_days: triggerConfig.duration_days || triggerConfig.durationDays || triggerConfig.days || 0,
        duration_hours: triggerConfig.duration_hours || triggerConfig.durationHours || triggerConfig.hours || 0,
      },
      action_type: rule.actionType || rule.action_type || "send_whatsapp",
      action_config: {
        alertMessage: actionConfig.alertMessage || "",
        templateMessage: actionConfig.templateMessage || "",
      },
      whatsapp_template_id: rule.whatsappTemplateId || rule.whatsapp_template_id || actionConfig.whatsapp_template_id || actionConfig.whatsappTemplateId || "",
      whatsapp_template_name: rule.whatsappTemplateName || rule.whatsapp_template_name || actionConfig.whatsapp_template_name || actionConfig.whatsappTemplateName || "",
      priority: rule.priority || 0,
      stop_on_trigger: rule.stopOnTrigger || rule.stop_on_trigger || false,
    });
    setShowDialog(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!formData.name) {
      toast.error('Nome da automacao e obrigatorio!');
      return;
    }

    if (!channelToken.trim()) {
      toast.error('Configure o token do canal antes de criar automacoes!');
      return;
    }

    if (formData.action_type === 'send_whatsapp' && !formData.whatsapp_template_id) {
      toast.error('Selecione um template de WhatsApp!');
      return;
    }

    const submitData = {
      ...formData,
      channel_token: channelToken.trim(),
      channel_token_label: channelLabel.trim(),
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
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-3">
              <Radio className="w-8 h-8 text-orange-600 dark:text-orange-400" />
              Automacoes por Canal
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              Configure automacoes usando tokens de canais especificos do WhatsApp
            </p>
          </div>
          <div className="flex items-center gap-2">
            <AutomationLogsPanel automationType="referral_channel" colorScheme="orange" />
            <Button
              onClick={() => {
                if (!channelToken.trim()) {
                  toast.error('Configure o token do canal antes de criar automacoes');
                  return;
                }
                resetForm();
                setShowDialog(true);
              }}
              className="bg-orange-600 hover:bg-orange-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Nova Automacao
            </Button>
          </div>
        </div>

        <Card className="bg-white dark:bg-gray-900 border-orange-200 dark:border-orange-800">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Key className="w-5 h-5 text-orange-600" />
              Configuracao do Canal
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nome do Canal (opcional)</Label>
                <Input
                  value={channelLabel}
                  onChange={(e) => setChannelLabel(e.target.value)}
                  placeholder="Ex: Canal Parceiros SP"
                />
              </div>
              <div className="space-y-2">
                <Label>Token do Canal *</Label>
                <div className="relative">
                  <Input
                    type={showToken ? 'text' : 'password'}
                    value={channelToken}
                    onChange={(e) => {
                      setChannelToken(e.target.value);
                      setTokenVerified(false);
                      setTokenTemplateCount(null);
                    }}
                    placeholder="Cole o token do canal aqui..."
                    className="pr-10"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    onClick={() => setShowToken(!showToken)}
                  >
                    {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <Button
                onClick={handleVerifyToken}
                disabled={verifyingToken || !channelToken.trim()}
                variant="outline"
                className="border-orange-300 text-orange-700 hover:bg-orange-50"
              >
                {verifyingToken ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
                Buscar Templates
              </Button>
              <Button
                onClick={handleSaveConfig}
                disabled={!channelToken.trim()}
                className="bg-orange-600 hover:bg-orange-700"
              >
                <Save className="w-4 h-4 mr-2" />
                Salvar Configuracao
              </Button>
            </div>

            {tokenVerified && tokenTemplateCount !== null && (
              <Alert className="bg-green-50 dark:bg-green-950 border-green-300">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <AlertDescription className="text-sm text-green-800 dark:text-green-200">
                  <strong>{tokenTemplateCount} template{tokenTemplateCount !== 1 ? 's' : ''}</strong> encontrado{tokenTemplateCount !== 1 ? 's' : ''} para este canal.
                  {channelLabel && <span> Canal: <strong>{channelLabel}</strong></span>}
                </AlertDescription>
              </Alert>
            )}

            {!channelToken.trim() && (
              <Alert className="bg-amber-50 dark:bg-amber-950 border-amber-300">
                <AlertCircle className="w-4 h-4 text-amber-600" />
                <AlertDescription className="text-sm text-amber-800 dark:text-amber-200">
                  Informe o token do canal para comecar a criar automacoes. O token pode ser obtido na plataforma WHU/Rudo.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-3 gap-4">
          <Card className="bg-white dark:bg-gray-900">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-green-100 dark:bg-green-950 rounded-lg">
                  <Play className="w-6 h-6 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Automacoes Ativas</p>
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
                  <p className="text-sm text-gray-600 dark:text-gray-400">Automacoes Inativas</p>
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
                <div className="p-3 bg-orange-100 dark:bg-orange-950 rounded-lg">
                  <MessageSquare className="w-6 h-6 text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Templates do Canal</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {tokenTemplateCount !== null ? tokenTemplateCount : '—'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4">
          {rulesLoading ? (
            <Card className="bg-white dark:bg-gray-900">
              <CardContent className="p-12 text-center">
                <Loader2 className="w-8 h-8 mx-auto animate-spin text-orange-600" />
                <p className="mt-2 text-gray-600 dark:text-gray-400">Carregando automacoes...</p>
              </CardContent>
            </Card>
          ) : rules.length === 0 ? (
            <Card className="bg-white dark:bg-gray-900">
              <CardContent className="p-12 text-center">
                <Radio className="w-16 h-16 text-gray-300 dark:text-gray-700 mx-auto mb-4" />
                <p className="text-gray-600 dark:text-gray-400 font-medium mb-2">
                  Nenhuma automacao por canal criada
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-500 mb-4">
                  Configure o token do canal acima e crie automacoes especificas
                </p>
                {channelToken.trim() && (
                  <Button onClick={() => setShowDialog(true)} variant="outline">
                    <Plus className="w-4 h-4 mr-2" />
                    Criar primeira automacao
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            rules.map(rule => {
              const triggerConfig = parseConfig(rule.triggerConfig || rule.trigger_config);
              const actionConfig = parseConfig(rule.actionConfig || rule.action_config);
              const ruleLabel = rule.channelTokenLabel || rule.channel_token_label;
              
              return (
                <Card key={rule.id} className={`bg-white dark:bg-gray-900 ${rule.active ? 'border-orange-200 dark:border-orange-800' : 'opacity-60'}`}>
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{rule.name}</h3>
                          <Badge className={rule.active ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300" : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"}>
                            {rule.active ? 'Ativa' : 'Inativa'}
                          </Badge>
                          {ruleLabel && (
                            <Badge variant="outline" className="text-orange-600 border-orange-300">
                              <Radio className="w-3 h-3 mr-1" />
                              {ruleLabel}
                            </Badge>
                          )}
                        </div>
                        
                        {rule.description && (
                          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{rule.description}</p>
                        )}

                        <div className="grid grid-cols-2 gap-4 mt-4">
                          <div className="bg-blue-50 dark:bg-blue-950 p-3 rounded-lg">
                            <p className="text-xs text-blue-600 dark:text-blue-400 font-semibold mb-1">GATILHO</p>
                            <p className="text-sm text-gray-900 dark:text-gray-100">
                              {getTriggerLabel(rule.triggerType || rule.trigger_type)}
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

                          <div className="bg-orange-50 dark:bg-orange-950 p-3 rounded-lg">
                            <p className="text-xs text-orange-600 dark:text-orange-400 font-semibold mb-1">ACAO</p>
                            <p className="text-sm text-gray-900 dark:text-gray-100">
                              {getActionLabel(rule.actionType || rule.action_type)}
                            </p>
                            {(rule.actionType === 'send_whatsapp' || rule.action_type === 'send_whatsapp') && (rule.whatsappTemplateName || rule.whatsapp_template_name) && (
                              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 truncate">
                                Template: {rule.whatsappTemplateName || rule.whatsapp_template_name}
                              </p>
                            )}
                            {(rule.actionType === 'send_whatsapp' || rule.action_type === 'send_whatsapp') && actionConfig?.templateMessage && (
                              <div className="mt-2 p-2 bg-gray-100 dark:bg-gray-800 rounded-md">
                                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 font-medium">Texto da mensagem:</p>
                                <p className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap line-clamp-4">
                                  {actionConfig.templateMessage}
                                </p>
                              </div>
                            )}
                            {(rule.actionType === 'internal_alert' || rule.action_type === 'internal_alert') && actionConfig?.alertMessage && (
                              <div className="mt-2 p-2 bg-yellow-50 dark:bg-yellow-950 rounded-md">
                                <p className="text-xs text-yellow-600 dark:text-yellow-400 mb-1 font-medium">Alerta interno:</p>
                                <p className="text-xs text-yellow-700 dark:text-yellow-300 whitespace-pre-wrap line-clamp-4">
                                  {actionConfig.alertMessage}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Switch
                          checked={rule.active}
                          onCheckedChange={() => handleToggleActive(rule)}
                        />
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
                            if (confirm('Deseja excluir esta automacao?')) {
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
              {editingRule ? 'Editar Automacao por Canal' : 'Nova Automacao por Canal'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              <div>
                <Label>Nome da Automacao *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: Boas-vindas canal parceiros"
                  className="mt-1"
                />
              </div>

              <div>
                <Label>Descricao</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Descreva o objetivo desta automacao..."
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

                {(formData.trigger_type === 'inactivity' || formData.trigger_type === 'stage_duration') && (
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

            <Card className="border-orange-200 bg-orange-50">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Zap className="w-5 h-5" />
                  Entao (Acao)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Tipo de Acao</Label>
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
                    <Label>Template de WhatsApp (Canal) *</Label>
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
                        onClick={() => {
                          if (!channelToken.trim()) {
                            toast.error('Configure o token do canal primeiro');
                            return;
                          }
                          setShowTemplateSelector(true);
                        }}
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

                {formData.action_type === 'internal_alert' && (
                  <div>
                    <Label>Mensagem do Alerta</Label>
                    <Textarea
                      value={formData.action_config.alertMessage}
                      onChange={(e) => setFormData({ 
                        ...formData, 
                        action_config: { ...formData.action_config, alertMessage: e.target.value }
                      })}
                      placeholder="Ex: Indicacao sem contato apos 48h."
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
                <Label>Ativar automacao</Label>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>
                Cancelar
              </Button>
              <Button 
                type="submit" 
                className="bg-orange-600 hover:bg-orange-700"
                disabled={createRuleMutation.isPending || updateRuleMutation.isPending}
              >
                {(createRuleMutation.isPending || updateRuleMutation.isPending) ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  editingRule ? 'Atualizar' : 'Criar Automacao'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <WhatsAppTemplateSelectorByToken
        open={showTemplateSelector}
        onOpenChange={setShowTemplateSelector}
        selectedTemplateId={formData.whatsapp_template_id}
        onSelect={selectTemplate}
        channelToken={channelToken}
        accentColor="orange"
      />
      </div>
    </div>
  );
}
