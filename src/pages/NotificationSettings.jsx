import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Bell, Mail, MessageSquare, AlertCircle, Clock, TrendingUp, DollarSign, FileText, Save, Loader2 } from "lucide-react";
import { toast } from "sonner";

const notificationTypes = [
  {
    type: "sla_warning",
    icon: AlertCircle,
    color: "text-orange-600",
    label: "SLA Próximo de Vencer",
    description: "Alertas 15 minutos antes do SLA vencer",
    defaultPriority: "urgent"
  },
  {
    type: "ticket_assigned",
    icon: FileText,
    color: "text-blue-600",
    label: "Ticket Atribuído",
    description: "Quando um ticket é atribuído a você",
    defaultPriority: "high"
  },
  {
    type: "customer_replied",
    icon: MessageSquare,
    color: "text-green-600",
    label: "Cliente Respondeu",
    description: "Quando um cliente responde seu ticket",
    defaultPriority: "high"
  },
  {
    type: "proposal_accepted",
    icon: TrendingUp,
    color: "text-green-600",
    label: "Proposta Aceita",
    description: "Quando um cliente aceita uma proposta",
    defaultPriority: "urgent"
  },
  {
    type: "proposal_rejected",
    icon: AlertCircle,
    color: "text-red-600",
    label: "Proposta Rejeitada",
    description: "Quando um cliente rejeita uma proposta",
    defaultPriority: "medium"
  },
  {
    type: "payment_overdue",
    icon: DollarSign,
    color: "text-red-600",
    label: "Pagamento Vencido",
    description: "Clientes com pagamentos atrasados",
    defaultPriority: "high"
  },
  {
    type: "lead_cold",
    icon: Clock,
    color: "text-yellow-600",
    label: "Lead Frio",
    description: "Leads sem contato há 7+ dias",
    defaultPriority: "medium"
  },
  {
    type: "ticket_reopened",
    icon: AlertCircle,
    color: "text-orange-600",
    label: "Ticket Reaberto",
    description: "Quando um ticket é reaberto",
    defaultPriority: "high"
  },
];

export default function NotificationSettings() {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: preferences = [] } = useQuery({
    queryKey: ['notificationPreferences', user?.email],
    queryFn: () => base44.entities.NotificationPreference.filter({ user_email: user.email }),
    enabled: !!user?.email,
    initialData: [],
  });

  const createPreferenceMutation = useMutation({
    mutationFn: (data) => base44.entities.NotificationPreference.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notificationPreferences'] });
    },
  });

  const updatePreferenceMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.NotificationPreference.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notificationPreferences'] });
    },
  });

  const getPreference = (type) => {
    return preferences.find(p => p.notification_type === type) || {
      notification_type: type,
      enabled: true,
      send_email: true,
      send_whatsapp: false,
      priority_threshold: notificationTypes.find(nt => nt.type === type)?.defaultPriority || 'medium'
    };
  };

  const handleToggle = async (type, field, value) => {
    const existingPref = preferences.find(p => p.notification_type === type);
    
    const data = {
      user_email: user.email,
      notification_type: type,
      [field]: value,
      ...getPreference(type)
    };

    if (existingPref) {
      await updatePreferenceMutation.mutateAsync({ id: existingPref.id, data });
    } else {
      await createPreferenceMutation.mutateAsync(data);
    }
  };

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      // Salvar todas as preferências de uma vez
      for (const notifType of notificationTypes) {
        const pref = getPreference(notifType.type);
        const existingPref = preferences.find(p => p.notification_type === notifType.type);
        
        const data = {
          user_email: user.email,
          notification_type: notifType.type,
          ...pref
        };

        if (existingPref) {
          await updatePreferenceMutation.mutateAsync({ id: existingPref.id, data });
        } else {
          await createPreferenceMutation.mutateAsync(data);
        }
      }
      
      toast.success('Preferências salvas com sucesso!');
    } catch (error) {
      toast.error('Erro ao salvar preferências');
    }
    setSaving(false);
  };

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-950 min-h-screen">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            Preferências de Notificações
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-2">
            <Bell className="w-4 h-4" />
            Configure como você deseja receber notificações
          </p>
        </div>
        <Button
          onClick={handleSaveAll}
          disabled={saving}
          className="bg-blue-600 hover:bg-blue-700"
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Salvando...
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" />
              Salvar Tudo
            </>
          )}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Notificações do Sistema</CardTitle>
          <CardDescription>
            Gerencie como você recebe alertas sobre eventos importantes
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {notificationTypes.map((notifType) => {
            const Icon = notifType.icon;
            const pref = getPreference(notifType.type);

            return (
              <div key={notifType.type} className="border-b border-gray-200 dark:border-gray-800 pb-6 last:border-0 last:pb-0">
                <div className="flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center shrink-0`}>
                    <Icon className={`w-5 h-5 ${notifType.color}`} />
                  </div>
                  
                  <div className="flex-1 space-y-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                          {notifType.label}
                        </h3>
                        <Badge className="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs">
                          {notifType.defaultPriority === 'urgent' ? '🔴 Urgente' :
                           notifType.defaultPriority === 'high' ? '🟠 Alta' :
                           notifType.defaultPriority === 'medium' ? '🟡 Média' : '🟢 Baixa'}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {notifType.description}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="flex items-center justify-between">
                        <Label htmlFor={`${notifType.type}-enabled`} className="text-sm cursor-pointer">
                          Ativar Notificação
                        </Label>
                        <Switch
                          id={`${notifType.type}-enabled`}
                          checked={pref.enabled}
                          onCheckedChange={(checked) => handleToggle(notifType.type, 'enabled', checked)}
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <Label htmlFor={`${notifType.type}-email`} className="text-sm flex items-center gap-2 cursor-pointer">
                          <Mail className="w-4 h-4" />
                          Email
                        </Label>
                        <Switch
                          id={`${notifType.type}-email`}
                          checked={pref.send_email}
                          onCheckedChange={(checked) => handleToggle(notifType.type, 'send_email', checked)}
                          disabled={!pref.enabled}
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <Label htmlFor={`${notifType.type}-whatsapp`} className="text-sm flex items-center gap-2 cursor-pointer">
                          <MessageSquare className="w-4 h-4" />
                          WhatsApp
                        </Label>
                        <Switch
                          id={`${notifType.type}-whatsapp`}
                          checked={pref.send_whatsapp}
                          onCheckedChange={(checked) => handleToggle(notifType.type, 'send_whatsapp', checked)}
                          disabled={!pref.enabled}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Canais de Notificação</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            <div className="p-4 border border-gray-200 dark:border-gray-800 rounded-lg">
              <Bell className="w-8 h-8 text-blue-600 mb-2" />
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">Sistema</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Badge de notificação no topo da tela. Sempre ativado.
              </p>
            </div>

            <div className="p-4 border border-gray-200 dark:border-gray-800 rounded-lg">
              <Mail className="w-8 h-8 text-purple-600 mb-2" />
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">Email</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Enviado para: {user?.email}
              </p>
            </div>

            <div className="p-4 border border-gray-200 dark:border-gray-800 rounded-lg">
              <MessageSquare className="w-8 h-8 text-green-600 mb-2" />
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">WhatsApp</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Apenas notificações urgentes
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}