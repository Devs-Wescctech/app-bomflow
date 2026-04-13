import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Save, Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";

const INTERESTS = [
  "Essencial",
  "Total +",
  "Bom Med",
  "Bom Auto",
  "Bom Pet",
  "Bom Pet Saude",
  "Perola",
  "Rubi",
  "Topazio",
  "Outro"
];

export default function WhatsAppQuickLead() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  
  const phoneFromWhatsApp = searchParams.get('phone') || '';
  const nameFromWhatsApp = searchParams.get('name') || '';

  const [formData, setFormData] = useState({
    name: nameFromWhatsApp,
    phone: phoneFromWhatsApp,
    email: "",
    interest: "",
    value: "",
    monthly_value: "",
    notes: "",
    agent_id: "",
    lgpd_consent: false,
  });

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: agents = [] } = useQuery({
    queryKey: ['salesAgents'],
    queryFn: () => base44.entities.SalesAgent.filter({ active: true }),
    initialData: [],
  });

  // Auto-select agente
  useEffect(() => {
    if (user && user.role !== 'admin') {
      const userAgent = agents.find(a => a.user_email === user.email);
      if (userAgent && !formData.agent_id) {
        setFormData(prev => ({ ...prev, agent_id: userAgent.id }));
      }
    }
  }, [user, agents, formData.agent_id]);

  const createLeadMutation = useMutation({
    mutationFn: (data) => base44.entities.Lead.create(data),
    onSuccess: (newLead) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast.success('Lead criado com sucesso!');
      
      // Mostrar mensagem de sucesso e opção de criar outro
      if (window.confirm('✅ Lead criado!\n\nDeseja criar outro lead?')) {
        setFormData({
          name: "",
          phone: "",
          email: "",
          interest: "",
          value: "",
          monthly_value: "",
          notes: "",
          agent_id: formData.agent_id,
          lgpd_consent: false,
        });
      } else {
        navigate(-1);
      }
    },
    onError: (error) => {
      toast.error('Erro ao criar lead: ' + error.message);
    }
  });

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.phone) {
      toast.error('Telefone é obrigatório!');
      return;
    }

    if (!formData.agent_id) {
      toast.error('Agente responsável é obrigatório!');
      return;
    }

    if (!formData.lgpd_consent) {
      toast.error('É necessário o consentimento LGPD!');
      return;
    }

    const now = new Date().toISOString();
    
    const leadData = {
      ...formData,
      value: formData.value ? parseFloat(formData.value) : null,
      monthly_value: formData.monthly_value ? parseFloat(formData.monthly_value) : null,
      stage: "novo",
      source: "whatsapp",
      lgpd_consent_date: now,
      stage_history: [
        {
          stage: "novo",
          previous_stage: null,
          changed_at: now,
          changed_by: user?.email || "WhatsApp",
        }
      ],
    };

    createLeadMutation.mutate(leadData);
  };

  const selectedAgent = agents.find(a => a.id === formData.agent_id);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-4">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="flex-shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Novo Lead</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">Via WhatsApp</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <UserPlus className="w-4 h-4" />
                Dados do Lead
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-sm">Nome *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Nome completo"
                  className="mt-1 h-9"
                  required
                />
              </div>

              <div>
                <Label className="text-sm">Telefone/WhatsApp *</Label>
                <Input
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="(11) 99999-9999"
                  className="mt-1 h-9"
                  required
                />
              </div>

              <div>
                <Label className="text-sm">Email</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="email@exemplo.com"
                  className="mt-1 h-9"
                />
              </div>

              <div>
                <Label className="text-sm">Interesse</Label>
                <Select value={formData.interest} onValueChange={(val) => setFormData({ ...formData, interest: val })}>
                  <SelectTrigger className="mt-1 h-9">
                    <SelectValue placeholder="Selecione o produto" />
                  </SelectTrigger>
                  <SelectContent>
                    {INTERESTS.map(interest => (
                      <SelectItem key={interest} value={interest}>{interest}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card className="border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-green-800 dark:text-green-200">💰 Valores</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Valor Mensal</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.monthly_value}
                    onChange={(e) => setFormData({ ...formData, monthly_value: e.target.value })}
                    placeholder="R$ 0,00"
                    className="mt-1 h-9 bg-white dark:bg-gray-800"
                  />
                </div>
                <div>
                  <Label className="text-xs">Receita Total</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.value}
                    onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                    placeholder="R$ 0,00"
                    className="mt-1 h-9 bg-white dark:bg-gray-800"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Observações</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Anotações sobre o lead..."
                rows={3}
                className="text-sm"
              />

              <div>
                <Label className="text-sm">Agente Responsável *</Label>
                <Select 
                  value={formData.agent_id} 
                  onValueChange={(val) => setFormData({ ...formData, agent_id: val })}
                  disabled={user?.role !== 'admin' && !!formData.agent_id}
                >
                  <SelectTrigger className="mt-1 h-9">
                    <SelectValue placeholder="Selecione um agente" />
                  </SelectTrigger>
                  <SelectContent>
                    {user?.role === 'admin' ? (
                      agents.map(agent => (
                        <SelectItem key={agent.id} value={agent.id}>
                          {agent.name}
                        </SelectItem>
                      ))
                    ) : (
                      agents
                        .filter(a => a.user_email === user?.email)
                        .map(agent => (
                          <SelectItem key={agent.id} value={agent.id}>
                            {agent.name}
                          </SelectItem>
                        ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {selectedAgent && (
                <div className="p-2 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
                  <div className="flex items-center gap-2">
                    {selectedAgent.photo_url ? (
                      <img 
                        src={selectedAgent.photo_url} 
                        alt={selectedAgent.name}
                        className="w-8 h-8 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-blue-200 dark:bg-blue-800 flex items-center justify-center">
                        <span className="text-sm font-bold text-blue-700 dark:text-blue-300">
                          {selectedAgent.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                    <div className="text-xs">
                      <p className="font-bold text-gray-900 dark:text-gray-100">{selectedAgent.name}</p>
                      <p className="text-gray-600 dark:text-gray-400">{selectedAgent.phone}</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-start space-x-2 pt-2">
                <Checkbox
                  id="lgpd"
                  checked={formData.lgpd_consent}
                  onCheckedChange={(checked) => setFormData({ ...formData, lgpd_consent: checked })}
                />
                <label htmlFor="lgpd" className="text-xs leading-tight cursor-pointer text-gray-700 dark:text-gray-300">
                  <strong>Cliente autorizou o uso de seus dados *</strong>
                  <br />
                  <span className="text-gray-500 dark:text-gray-400">Conforme LGPD (Lei 13.709/2018)</span>
                </label>
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate(-1)}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={!formData.phone || !formData.agent_id || !formData.lgpd_consent || createLeadMutation.isPending}
              className="flex-1 bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-600"
            >
              {createLeadMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Criar Lead
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}