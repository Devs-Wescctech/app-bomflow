import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Settings, 
  Users, 
  Zap, 
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ArrowRight
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export default function DistributionRules() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [formData, setFormData] = useState({
    queue_id: "",
    enabled: true,
    distribution_type: "round_robin",
    consider_capacity: true,
    consider_online_status: true,
    auto_assign: true,
    working_hours_only: false,
  });

  const { data: rules = [] } = useQuery({
    queryKey: ['distributionRules'],
    queryFn: () => base44.entities.DistributionRule.list(),
    initialData: [],
  });

  const { data: queues = [] } = useQuery({
    queryKey: ['queues'],
    queryFn: () => base44.entities.Queue.list(),
    initialData: [],
  });

  const { data: agents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: () => base44.entities.Agent.list(),
    initialData: [],
  });

  const createRuleMutation = useMutation({
    mutationFn: (data) => base44.entities.DistributionRule.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['distributionRules'] });
      setIsDialogOpen(false);
      resetForm();
      toast.success('Regra criada com sucesso!');
    },
  });

  const updateRuleMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.DistributionRule.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['distributionRules'] });
      setIsDialogOpen(false);
      resetForm();
      toast.success('Regra atualizada com sucesso!');
    },
  });

  const toggleRuleMutation = useMutation({
    mutationFn: ({ id, enabled }) => base44.entities.DistributionRule.update(id, { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['distributionRules'] });
      toast.success('Status atualizado!');
    },
  });

  const resetForm = () => {
    setFormData({
      queue_id: "",
      enabled: true,
      distribution_type: "round_robin",
      consider_capacity: true,
      consider_online_status: true,
      auto_assign: true,
      working_hours_only: false,
    });
    setEditingRule(null);
  };

  const handleEdit = (rule) => {
    setEditingRule(rule);
    setFormData({
      queue_id: rule.queue_id || "",
      enabled: rule.enabled !== undefined ? rule.enabled : true,
      distribution_type: rule.distribution_type || "round_robin",
      consider_capacity: rule.consider_capacity !== undefined ? rule.consider_capacity : true,
      consider_online_status: rule.consider_online_status !== undefined ? rule.consider_online_status : true,
      auto_assign: rule.auto_assign !== undefined ? rule.auto_assign : true,
      working_hours_only: rule.working_hours_only !== undefined ? rule.working_hours_only : false,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.queue_id) {
      toast.error('Selecione uma fila');
      return;
    }

    // Verificar se já existe regra para esta fila
    const existingRule = rules.find(r => r.queue_id === formData.queue_id && (!editingRule || r.id !== editingRule.id));
    if (existingRule) {
      toast.error('Já existe uma regra para esta fila');
      return;
    }

    // Criar sequência de agentes da fila
    const queueAgents = agents.filter(a => 
      a.active && 
      a.queue_ids && 
      a.queue_ids.includes(formData.queue_id)
    );

    const agentSequence = queueAgents.map(a => a.id);

    const data = {
      ...formData,
      agent_sequence: agentSequence,
      last_assigned_agent_id: null, // Resetar para começar do início
    };

    if (editingRule) {
      updateRuleMutation.mutate({ id: editingRule.id, data });
    } else {
      createRuleMutation.mutate(data);
    }
  };

  const getQueueName = (queueId) => {
    const queue = queues.find(q => q.id === queueId);
    return queue?.name || 'Fila desconhecida';
  };

  const getQueueAgents = (queueId) => {
    return agents.filter(a => 
      a.active && 
      a.queue_ids && 
      a.queue_ids.includes(queueId)
    );
  };

  const distributionTypeLabels = {
    round_robin: "Rodízio (Round-Robin)",
    least_active: "Menor Carga",
    manual: "Manual"
  };

  // Estatísticas
  const totalRules = rules.length;
  const activeRules = rules.filter(r => r.enabled).length;
  const queuesWithRules = new Set(rules.map(r => r.queue_id)).size;
  const queuesWithoutRules = queues.length - queuesWithRules;

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-950 min-h-screen">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Regras de Distribuição</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-2">
            <Zap className="w-4 h-4" />
            Configure a distribuição automática de tickets
          </p>
        </div>
        <Button 
          onClick={() => setIsDialogOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600"
        >
          <Settings className="w-4 h-4 mr-2" />
          Nova Regra
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-blue-200 dark:border-blue-800 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-600 dark:text-blue-400 font-medium">Total de Regras</p>
                <p className="text-3xl font-bold text-blue-700 dark:text-blue-300">{totalRules}</p>
              </div>
              <Settings className="w-10 h-10 text-blue-500 dark:text-blue-400 opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-green-200 dark:border-green-800 bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-green-600 dark:text-green-400 font-medium">Regras Ativas</p>
                <p className="text-3xl font-bold text-green-700 dark:text-green-300">{activeRules}</p>
              </div>
              <CheckCircle2 className="w-10 h-10 text-green-500 dark:text-green-400 opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-purple-200 dark:border-purple-800 bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950 dark:to-purple-900">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-purple-600 dark:text-purple-400 font-medium">Filas Configuradas</p>
                <p className="text-3xl font-bold text-purple-700 dark:text-purple-300">{queuesWithRules}</p>
              </div>
              <Users className="w-10 h-10 text-purple-500 dark:text-purple-400 opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-orange-200 dark:border-orange-800 bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-950 dark:to-orange-900">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-orange-600 dark:text-orange-400 font-medium">Sem Configuração</p>
                <p className="text-3xl font-bold text-orange-700 dark:text-orange-300">{queuesWithoutRules}</p>
              </div>
              <AlertCircle className="w-10 h-10 text-orange-500 dark:text-orange-400 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Regras */}
      <div className="space-y-4">
        {rules.map(rule => {
          const queueAgents = getQueueAgents(rule.queue_id);
          const onlineAgents = queueAgents.filter(a => a.online).length;
          
          return (
            <Card key={rule.id} className={`border-gray-200 dark:border-gray-800 ${!rule.enabled ? 'opacity-60' : ''}`}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`w-12 h-12 rounded-xl ${
                        rule.enabled ? 'bg-green-100 dark:bg-green-950' : 'bg-gray-100 dark:bg-gray-800'
                      } flex items-center justify-center`}>
                        <RefreshCw className={`w-6 h-6 ${
                          rule.enabled ? 'text-green-600 dark:text-green-400' : 'text-gray-400'
                        }`} />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                          {getQueueName(rule.queue_id)}
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {distributionTypeLabels[rule.distribution_type]}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                      <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                        <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Agentes Disponíveis</p>
                        <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{queueAgents.length}</p>
                      </div>
                      <div className="bg-green-50 dark:bg-green-950 p-3 rounded-lg">
                        <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Online Agora</p>
                        <p className="text-lg font-bold text-green-600 dark:text-green-400">{onlineAgents}</p>
                      </div>
                      <div className="bg-blue-50 dark:bg-blue-950 p-3 rounded-lg">
                        <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Auto-Atribuição</p>
                        <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
                          {rule.auto_assign ? 'Sim' : 'Não'}
                        </p>
                      </div>
                      <div className="bg-purple-50 dark:bg-purple-950 p-3 rounded-lg">
                        <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Considera Online</p>
                        <p className="text-lg font-bold text-purple-600 dark:text-purple-400">
                          {rule.consider_online_status ? 'Sim' : 'Não'}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {rule.enabled && (
                        <Badge className="bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Ativa
                        </Badge>
                      )}
                      {!rule.enabled && (
                        <Badge variant="outline" className="bg-gray-100 dark:bg-gray-800">
                          <XCircle className="w-3 h-3 mr-1" />
                          Inativa
                        </Badge>
                      )}
                      {rule.consider_capacity && (
                        <Badge variant="outline">Considera Capacidade</Badge>
                      )}
                      {rule.working_hours_only && (
                        <Badge variant="outline">Horário Comercial</Badge>
                      )}
                    </div>

                    {/* Sequência de Agentes */}
                    {rule.distribution_type === 'round_robin' && rule.agent_sequence && rule.agent_sequence.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                        <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">
                          Sequência de Rodízio:
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          {rule.agent_sequence.map((agentId, idx) => {
                            const agent = agents.find(a => a.id === agentId);
                            const isLast = agentId === rule.last_assigned_agent_id;
                            return (
                              <div key={agentId} className="flex items-center gap-2">
                                <Badge 
                                  className={`${
                                    isLast 
                                      ? 'bg-blue-600 text-white' 
                                      : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                                  }`}
                                >
                                  {agent?.name || 'Agente'}
                                  {agent?.online && <span className="ml-1">🟢</span>}
                                </Badge>
                                {idx < rule.agent_sequence.length - 1 && (
                                  <ArrowRight className="w-3 h-3 text-gray-400" />
                                )}
                              </div>
                            );
                          })}
                        </div>
                        {rule.last_assigned_agent_id && (
                          <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                            Próximo ticket vai para o próximo da sequência
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-2 ml-4">
                    <Switch
                      checked={rule.enabled}
                      onCheckedChange={(checked) => 
                        toggleRuleMutation.mutate({ id: rule.id, enabled: checked })
                      }
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(rule)}
                    >
                      Editar
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {rules.length === 0 && (
          <Card className="border-gray-200 dark:border-gray-800">
            <CardContent className="p-12 text-center">
              <RefreshCw className="w-16 h-16 text-gray-300 dark:text-gray-700 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                Nenhuma regra configurada
              </h3>
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                Configure regras de distribuição para automatizar a atribuição de tickets
              </p>
              <Button onClick={() => setIsDialogOpen(true)}>
                Criar Primeira Regra
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl bg-white dark:bg-gray-900">
          <DialogHeader>
            <DialogTitle className="text-gray-900 dark:text-gray-100">
              {editingRule ? 'Editar Regra' : 'Nova Regra de Distribuição'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label className="text-gray-900 dark:text-gray-100">Fila *</Label>
              <Select 
                value={formData.queue_id} 
                onValueChange={(val) => setFormData({...formData, queue_id: val})}
              >
                <SelectTrigger className="mt-1 bg-white dark:bg-gray-800">
                  <SelectValue placeholder="Selecione a fila" />
                </SelectTrigger>
                <SelectContent>
                  {queues.map(queue => {
                    const hasRule = rules.some(r => r.queue_id === queue.id && (!editingRule || r.id !== editingRule.id));
                    const queueAgents = getQueueAgents(queue.id);
                    return (
                      <SelectItem 
                        key={queue.id} 
                        value={queue.id}
                        disabled={hasRule}
                      >
                        {queue.name} ({queueAgents.length} agentes)
                        {hasRule && ' - Já configurada'}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-gray-900 dark:text-gray-100">Tipo de Distribuição</Label>
              <Select 
                value={formData.distribution_type} 
                onValueChange={(val) => setFormData({...formData, distribution_type: val})}
              >
                <SelectTrigger className="mt-1 bg-white dark:bg-gray-800">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="round_robin">Rodízio (Round-Robin)</SelectItem>
                  <SelectItem value="least_active">Menor Carga de Trabalho</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {formData.distribution_type === 'round_robin' && 'Distribui tickets sequencialmente entre os agentes'}
                {formData.distribution_type === 'least_active' && 'Distribui para o agente com menos tickets ativos'}
                {formData.distribution_type === 'manual' && 'Tickets não são atribuídos automaticamente'}
              </p>
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <Label className="text-gray-900 dark:text-gray-100">Auto-Atribuir ao Criar Ticket</Label>
                <Switch
                  checked={formData.auto_assign}
                  onCheckedChange={(val) => setFormData({...formData, auto_assign: val})}
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <Label className="text-gray-900 dark:text-gray-100">Considerar Status Online</Label>
                <Switch
                  checked={formData.consider_online_status}
                  onCheckedChange={(val) => setFormData({...formData, consider_online_status: val})}
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <Label className="text-gray-900 dark:text-gray-100">Considerar Capacidade do Agente</Label>
                <Switch
                  checked={formData.consider_capacity}
                  onCheckedChange={(val) => setFormData({...formData, consider_capacity: val})}
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <Label className="text-gray-900 dark:text-gray-100">Apenas Horário Comercial</Label>
                <Switch
                  checked={formData.working_hours_only}
                  onCheckedChange={(val) => setFormData({...formData, working_hours_only: val})}
                />
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
              <Label className="text-gray-900 dark:text-gray-100">Regra Ativa</Label>
              <Switch
                checked={formData.enabled}
                onCheckedChange={(val) => setFormData({...formData, enabled: val})}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={!formData.queue_id}
              className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600"
            >
              {editingRule ? 'Salvar' : 'Criar Regra'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}