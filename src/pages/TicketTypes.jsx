import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2, AlertCircle, Settings, Activity } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

export default function TicketTypes() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingType, setEditingType] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    category: "atendimento",
    default_priority: "P3",
    requires_immediate_attention: false,
    active: true,
  });

  const { data: ticketTypes = [] } = useQuery({
    queryKey: ['ticketTypes'],
    queryFn: () => base44.entities.TicketType.list(),
    initialData: [],
  });

  const { data: queues = [] } = useQuery({
    queryKey: ['queues'],
    queryFn: () => base44.entities.Queue.list(),
    initialData: [],
  });

  const createTypeMutation = useMutation({
    mutationFn: (data) => base44.entities.TicketType.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticketTypes'] });
      setIsDialogOpen(false);
      resetForm();
    },
  });

  const updateTypeMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.TicketType.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticketTypes'] });
      setIsDialogOpen(false);
      resetForm();
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      category: "atendimento",
      default_priority: "P3",
      requires_immediate_attention: false,
      active: true,
    });
    setEditingType(null);
  };

  const handleEdit = (type) => {
    setEditingType(type);
    setFormData(type);
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (editingType) {
      updateTypeMutation.mutate({
        id: editingType.id,
        data: formData
      });
    } else {
      createTypeMutation.mutate(formData);
    }
  };

  const categoryColors = {
    atendimento: "bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300",
    sinistro: "bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300",
    comercial: "bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300",
    financeiro: "bg-yellow-100 dark:bg-yellow-950 text-yellow-700 dark:text-yellow-300",
    suporte: "bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300",
  };

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-950 min-h-screen">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Tipos de Ticket</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-2">
            <Settings className="w-4 h-4" />
            Configure os tipos de atendimento e campos dinâmicos
          </p>
        </div>
        <Button 
          onClick={() => setIsDialogOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600 shadow-lg"
        >
          <Plus className="w-4 h-4 mr-2" />
          Novo Tipo
        </Button>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {ticketTypes.map(type => (
          <Card key={type.id} className={`border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:shadow-lg transition-all ${!type.active ? 'opacity-60' : ''}`}>
            <CardHeader className="border-b border-gray-200 dark:border-gray-800">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle className="text-lg text-gray-900 dark:text-gray-100">{type.name}</CardTitle>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{type.description}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleEdit(type)}
                  className="hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  <Edit className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  <Badge className={categoryColors[type.category]}>
                    {type.category}
                  </Badge>
                  <Badge variant="outline" className="bg-gray-50 dark:bg-gray-800">
                    {type.default_priority}
                  </Badge>
                  {type.requires_immediate_attention && (
                    <Badge className="bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300">
                      <AlertCircle className="w-3 h-3 mr-1" />
                      Urgente
                    </Badge>
                  )}
                  {!type.active && (
                    <Badge variant="outline" className="bg-gray-100 dark:bg-gray-800">
                      Inativo
                    </Badge>
                  )}
                </div>
                {type.fields_schema && (
                  <div className="text-xs text-gray-500 dark:text-gray-400 pt-2 border-t border-gray-200 dark:border-gray-700">
                    {Object.keys(type.fields_schema).length} campos configurados
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Dialog para Criar/Editar */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl bg-white dark:bg-gray-900">
          <DialogHeader>
            <DialogTitle className="text-gray-900 dark:text-gray-100">
              {editingType ? 'Editar Tipo de Ticket' : 'Novo Tipo de Ticket'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div>
              <Label className="text-gray-900 dark:text-gray-100">Nome</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                placeholder="Ex: Registro de Óbito"
                className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
              />
            </div>

            <div>
              <Label className="text-gray-900 dark:text-gray-100">Descrição</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                placeholder="Descreva quando usar este tipo de ticket"
                rows={2}
                className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-900 dark:text-gray-100">Categoria</Label>
                <Select 
                  value={formData.category} 
                  onValueChange={(val) => setFormData({...formData, category: val})}
                >
                  <SelectTrigger className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="atendimento">Atendimento</SelectItem>
                    <SelectItem value="sinistro">Sinistro</SelectItem>
                    <SelectItem value="comercial">Comercial</SelectItem>
                    <SelectItem value="financeiro">Financeiro</SelectItem>
                    <SelectItem value="suporte">Suporte</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-gray-900 dark:text-gray-100">Prioridade Padrão</Label>
                <Select 
                  value={formData.default_priority} 
                  onValueChange={(val) => setFormData({...formData, default_priority: val})}
                >
                  <SelectTrigger className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="P1">P1 - Crítica</SelectItem>
                    <SelectItem value="P2">P2 - Alta</SelectItem>
                    <SelectItem value="P3">P3 - Média</SelectItem>
                    <SelectItem value="P4">P4 - Baixa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <Label className="text-gray-900 dark:text-gray-100">Requer Atenção Imediata</Label>
              <Switch
                checked={formData.requires_immediate_attention}
                onCheckedChange={(val) => setFormData({...formData, requires_immediate_attention: val})}
              />
            </div>

            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <Label className="text-gray-900 dark:text-gray-100">Ativo</Label>
              <Switch
                checked={formData.active}
                onCheckedChange={(val) => setFormData({...formData, active: val})}
              />
            </div>

            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                💡 Dica: Para configurar campos dinâmicos, edite o tipo após criar e use o Dashboard → Dados
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={!formData.name}
              className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600"
            >
              {editingType ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}