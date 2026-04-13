import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Phone, Mail, MapPin, TrendingUp, Activity, Upload, Camera, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export default function SalesAgents() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    user_email: "",
    region: "",
    team: "",
    active: true,
    photo_url: "",
  });

  const { data: agents = [] } = useQuery({
    queryKey: ['salesAgents'],
    queryFn: () => base44.entities.SalesAgent.list(),
    initialData: [],
  });

  const { data: leads = [] } = useQuery({
    queryKey: ['leads'],
    queryFn: () => base44.entities.Lead.list(),
    initialData: [],
  });

  const createAgentMutation = useMutation({
    mutationFn: (data) => base44.entities.SalesAgent.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['salesAgents'] });
      setIsDialogOpen(false);
      resetForm();
      toast.success('Agente criado com sucesso!');
    },
  });

  const updateAgentMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.SalesAgent.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['salesAgents'] });
      setIsDialogOpen(false);
      resetForm();
      toast.success('Agente atualizado com sucesso!');
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      phone: "",
      email: "",
      user_email: "",
      region: "",
      team: "",
      active: true,
      photo_url: "",
    });
    setEditingAgent(null);
  };

  const handleEdit = (agent) => {
    setEditingAgent(agent);
    setFormData({
      name: agent.name || "",
      phone: agent.phone || "",
      email: agent.email || "",
      user_email: agent.user_email || "",
      region: agent.region || "",
      team: agent.team || "",
      active: agent.active !== undefined ? agent.active : true,
      photo_url: agent.photo_url || "",
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (editingAgent) {
      updateAgentMutation.mutate({
        id: editingAgent.id,
        data: formData
      });
    } else {
      createAgentMutation.mutate(formData);
    }
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Por favor, selecione uma imagem válida');
      return;
    }

    setUploadingPhoto(true);
    try {
      const result = await base44.integrations.Core.UploadFile({ file });
      setFormData({ ...formData, photo_url: result.file_url });
      toast.success('Foto enviada com sucesso!');
    } catch (error) {
      console.error("Erro ao fazer upload:", error);
      toast.error('Erro ao fazer upload da foto');
    }
    setUploadingPhoto(false);
  };

  const getAgentStats = (agentId) => {
    const agentLeads = leads.filter(l => String(l.agentId) === String(agentId));
    const vendas = agentLeads.filter(l => l.stage === 'fechado_ganho').length;
    const total = agentLeads.length;
    const taxaConversao = total > 0 ? ((vendas / total) * 100).toFixed(0) : 0;
    
    // Calcular receita total
    const receitaTotal = agentLeads
      .filter(l => l.stage === 'fechado_ganho')
      .reduce((sum, l) => sum + (parseFloat(l.dealValue) || parseFloat(l.value) || 0), 0);
    
    return { total, vendas, taxaConversao, receitaTotal };
  };

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-950 min-h-screen">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Agentes de Vendas</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Gerencie o time comercial
          </p>
        </div>
        <Button 
          onClick={() => setIsDialogOpen(true)}
          className="bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-600 shadow-lg"
        >
          <Plus className="w-4 h-4 mr-2" />
          Novo Agente
        </Button>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {agents.map(agent => {
          const stats = getAgentStats(agent.id);
          
          return (
            <Card key={agent.id} className={`border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:shadow-lg transition-all ${!agent.active ? 'opacity-60' : ''}`}>
              <CardHeader className="border-b border-gray-200 dark:border-gray-800">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {agent.photo_url ? (
                      <img 
                        src={agent.photo_url} 
                        alt={agent.name}
                        className="w-12 h-12 rounded-full object-cover ring-2 ring-green-100 dark:ring-green-900"
                      />
                    ) : (
                      <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center ring-2 ring-green-100 dark:ring-green-900">
                        <span className="text-white font-semibold text-lg">
                          {agent.name?.charAt(0)?.toUpperCase() || 'A'}
                        </span>
                      </div>
                    )}
                    <div className="flex-1">
                      <CardTitle className="text-lg text-gray-900 dark:text-gray-100">{agent.name}</CardTitle>
                      {agent.team && (
                        <p className="text-sm text-gray-500 dark:text-gray-400">{agent.team}</p>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleEdit(agent)}
                    className="hover:bg-gray-100 dark:hover:bg-gray-800"
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="space-y-3">
                  <div className="space-y-2 text-sm">
                    {agent.phone && (
                      <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                        <Phone className="w-4 h-4" />
                        <span>{agent.phone}</span>
                      </div>
                    )}
                    {agent.email && (
                      <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                        <Mail className="w-4 h-4" />
                        <span className="truncate">{agent.email}</span>
                      </div>
                    )}
                    {agent.region && (
                      <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                        <MapPin className="w-4 h-4" />
                        <span>{agent.region}</span>
                      </div>
                    )}
                  </div>

                  <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Performance</span>
                      <Badge className="bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300">
                        {stats.taxaConversao}% conversão
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-center">
                      <div className="bg-blue-50 dark:bg-blue-950 p-2 rounded">
                        <p className="text-xs text-gray-600 dark:text-gray-400">Leads</p>
                        <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{stats.total}</p>
                      </div>
                      <div className="bg-green-50 dark:bg-green-950 p-2 rounded">
                        <p className="text-xs text-gray-600 dark:text-gray-400">Vendas</p>
                        <p className="text-lg font-bold text-green-600 dark:text-green-400">{stats.vendas}</p>
                      </div>
                    </div>
                    
                    {stats.receitaTotal > 0 && (
                      <div className="mt-2 bg-green-50 dark:bg-green-950 p-2 rounded text-center">
                        <p className="text-xs text-gray-600 dark:text-gray-400">Receita Total</p>
                        <p className="text-lg font-bold text-green-700 dark:text-green-300">
                          R$ {stats.receitaTotal.toFixed(2)}
                        </p>
                      </div>
                    )}
                  </div>

                  {!agent.active && (
                    <Badge variant="outline" className="w-full justify-center bg-gray-100 dark:bg-gray-800">
                      Inativo
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl bg-white dark:bg-gray-900 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-gray-900 dark:text-gray-100">
              {editingAgent ? 'Editar Agente' : 'Novo Agente de Vendas'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Foto do Agente */}
            <div className="flex flex-col items-center gap-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              {formData.photo_url ? (
                <div className="relative">
                  <img 
                    src={formData.photo_url} 
                    alt="Foto do agente"
                    className="w-32 h-32 rounded-full object-cover border-4 border-green-200 dark:border-green-800"
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="destructive"
                    className="absolute -top-2 -right-2 rounded-full w-8 h-8"
                    onClick={() => setFormData({ ...formData, photo_url: "" })}
                  >
                    ×
                  </Button>
                </div>
              ) : (
                <div className="w-32 h-32 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center border-4 border-dashed border-gray-300 dark:border-gray-600">
                  <Camera className="w-12 h-12 text-gray-400" />
                </div>
              )}
              
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  disabled={uploadingPhoto}
                  className="hidden"
                />
                <Button type="button" variant="outline" disabled={uploadingPhoto} asChild>
                  <span>
                    {uploadingPhoto ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Enviando...
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4 mr-2" />
                        Enviar Foto
                      </>
                    )}
                  </span>
                </Button>
              </label>
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                Foto para identificação da supervisão
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label className="text-gray-900 dark:text-gray-100">Nome Completo *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  placeholder="Nome do agente"
                  className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                />
              </div>

              <div>
                <Label className="text-gray-900 dark:text-gray-100">Telefone/WhatsApp *</Label>
                <Input
                  value={formData.phone}
                  onChange={(e) => setFormData({...formData, phone: e.target.value})}
                  placeholder="(00) 00000-0000"
                  className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                />
              </div>

              <div>
                <Label className="text-gray-900 dark:text-gray-100">Email</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  placeholder="email@exemplo.com"
                  className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                />
              </div>

              <div>
                <Label className="text-gray-900 dark:text-gray-100">Email do Usuário</Label>
                <Input
                  type="email"
                  value={formData.user_email}
                  onChange={(e) => setFormData({...formData, user_email: e.target.value})}
                  placeholder="usuario@exemplo.com"
                  className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                />
              </div>

              <div>
                <Label className="text-gray-900 dark:text-gray-100">Região</Label>
                <Input
                  value={formData.region}
                  onChange={(e) => setFormData({...formData, region: e.target.value})}
                  placeholder="Ex: Zona Norte"
                  className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                />
              </div>

              <div className="col-span-2">
                <Label className="text-gray-900 dark:text-gray-100">Equipe</Label>
                <Input
                  value={formData.team}
                  onChange={(e) => setFormData({...formData, team: e.target.value})}
                  placeholder="Nome da equipe"
                  className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <Label className="text-gray-900 dark:text-gray-100">Agente Ativo</Label>
              <Switch
                checked={formData.active}
                onCheckedChange={(val) => setFormData({...formData, active: val})}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={!formData.name || !formData.phone}
              className="bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-600"
            >
              {editingAgent ? 'Salvar' : 'Criar Agente'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}