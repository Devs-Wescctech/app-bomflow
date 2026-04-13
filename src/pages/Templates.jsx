import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, FileText, Edit, Trash2, Copy, Zap, Search, ShieldX } from "lucide-react";
import { toast } from "sonner";
import { canManageSettings } from "@/components/utils/permissions.jsx";

const categories = [
  { value: "sinistro", label: "Sinistro" },
  { value: "documentos", label: "Documentos" },
  { value: "financeiro", label: "Financeiro" },
  { value: "comercial", label: "Comercial" },
  { value: "suporte", label: "Suporte Técnico" },
  { value: "geral", label: "Geral" },
];

const channels = [
  { value: "all", label: "Todos os Canais" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "Email" },
  { value: "webchat", label: "Webchat" },
];

const variables = [
  { var: "{{nome_cliente}}", desc: "Nome do cliente" },
  { var: "{{cpf_cliente}}", desc: "CPF do cliente" },
  { var: "{{email_cliente}}", desc: "Email do cliente" },
  { var: "{{telefone_cliente}}", desc: "Telefone do cliente" },
  { var: "{{plano}}", desc: "Plano do contrato" },
  { var: "{{valor_mensal}}", desc: "Valor mensal do contrato" },
  { var: "{{status_contrato}}", desc: "Status do contrato" },
  { var: "{{numero_ticket}}", desc: "Número do ticket" },
  { var: "{{prioridade}}", desc: "Prioridade do ticket" },
  { var: "{{data_hoje}}", desc: "Data de hoje" },
  { var: "{{hora_agora}}", desc: "Hora atual" },
];

export default function Templates() {
  const queryClient = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [search, setSearch] = useState("");
  const [formData, setFormData] = useState({
    name: "",
    subject: "",
    body: "",
    category: "geral",
    channel: "all",
    active: true,
  });

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const currentAgent = user?.agent;
  const isAdmin = user?.role === 'admin';
  const hasPermission = isAdmin || canManageSettings(currentAgent);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['templates'],
    queryFn: () => base44.entities.Template.list(),
    enabled: hasPermission,
  });

  const createTemplateMutation = useMutation({
    mutationFn: (data) => base44.entities.Template.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      toast.success('Template criado com sucesso!');
      handleCloseDialog();
    },
  });

  const updateTemplateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Template.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      toast.success('Template atualizado com sucesso!');
      handleCloseDialog();
    },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: (id) => base44.entities.Template.update(id, { active: false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      toast.success('Template excluído com sucesso!');
    },
  });

  const handleOpenDialog = (template = null) => {
    if (template) {
      setEditingTemplate(template);
      setFormData({
        name: template.name,
        subject: template.subject || "",
        body: template.body,
        category: template.category || "geral",
        channel: template.channel || "all",
        active: template.active !== false,
      });
    } else {
      setEditingTemplate(null);
      setFormData({
        name: "",
        subject: "",
        body: "",
        category: "geral",
        channel: "all",
        active: true,
      });
    }
    setShowDialog(true);
  };

  const handleCloseDialog = () => {
    setShowDialog(false);
    setEditingTemplate(null);
  };

  const handleSubmit = () => {
    if (!formData.name.trim() || !formData.body.trim()) {
      toast.error('Preencha os campos obrigatórios');
      return;
    }

    if (editingTemplate) {
      updateTemplateMutation.mutate({
        id: editingTemplate.id,
        data: formData,
      });
    } else {
      createTemplateMutation.mutate(formData);
    }
  };

  const handleDuplicate = (template) => {
    setFormData({
      name: `${template.name} (Cópia)`,
      subject: template.subject || "",
      body: template.body,
      category: template.category || "geral",
      channel: template.channel || "all",
      active: true,
    });
    setEditingTemplate(null);
    setShowDialog(true);
  };

  const insertVariable = (variable) => {
    setFormData(prev => ({
      ...prev,
      body: prev.body + variable
    }));
  };

  // Filtrar templates
  const filteredTemplates = templates.filter(template => {
    if (!template.active) return false;
    const searchLower = search.toLowerCase();
    return (
      template.name.toLowerCase().includes(searchLower) ||
      template.body.toLowerCase().includes(searchLower) ||
      template.category?.toLowerCase().includes(searchLower)
    );
  });

  // Agrupar por categoria
  const groupedTemplates = filteredTemplates.reduce((acc, template) => {
    const category = template.category || 'geral';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(template);
    return acc;
  }, {});

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!hasPermission) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-gray-950">
        <Card className="max-w-md bg-white dark:bg-gray-900">
          <CardContent className="p-8 text-center">
            <ShieldX className="w-16 h-16 mx-auto mb-4 text-red-500" />
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Acesso Restrito</h2>
            <p className="text-gray-600 dark:text-gray-400">
              Você não tem permissão para acessar a gestão de templates.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-950 min-h-screen">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            Templates de Resposta
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-2">
            <Zap className="w-4 h-4" />
            Respostas rápidas com variáveis e atalhos
          </p>
        </div>
        <Button onClick={() => handleOpenDialog()} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="w-4 h-4 mr-2" />
          Novo Template
        </Button>
      </div>

      {/* Barra de busca */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-gray-400" />
            <Input
              placeholder="Buscar templates..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1"
            />
          </div>
        </CardContent>
      </Card>

      {/* Templates agrupados */}
      {Object.keys(groupedTemplates).length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center py-12">
            <FileText className="w-12 h-12 text-gray-300 dark:text-gray-700 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400">
              {search ? 'Nenhum template encontrado' : 'Nenhum template criado ainda'}
            </p>
            {!search && (
              <Button
                onClick={() => handleOpenDialog()}
                variant="outline"
                className="mt-4"
              >
                <Plus className="w-4 h-4 mr-2" />
                Criar Primeiro Template
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        Object.entries(groupedTemplates).map(([category, categoryTemplates]) => {
          const categoryLabel = categories.find(c => c.value === category)?.label || category;
          
          return (
            <div key={category}>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                <FileText className="w-5 h-5" />
                {categoryLabel}
                <Badge variant="secondary">{categoryTemplates.length}</Badge>
              </h2>

              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                {categoryTemplates.map((template) => (
                  <Card key={template.id} className="hover:shadow-md transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-base truncate">
                            {template.name}
                          </CardTitle>
                          <div className="flex items-center gap-2 mt-2">
                            <Badge variant="outline" className="text-xs">
                              {channels.find(c => c.value === template.channel)?.label || 'Todos'}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-3">
                        {template.body}
                      </p>

                      <div className="flex items-center gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenDialog(template)}
                        >
                          <Edit className="w-3 h-3 mr-1" />
                          Editar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDuplicate(template)}
                        >
                          <Copy className="w-3 h-3 mr-1" />
                          Duplicar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (confirm('Deseja realmente excluir este template?')) {
                              deleteTemplateMutation.mutate(template.id);
                            }
                          }}
                          className="ml-auto text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          );
        })
      )}

      {/* Dialog de criação/edição */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? 'Editar Template' : 'Novo Template'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Nome do Template *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Ex: Como acionar sinistro"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Categoria</Label>
                <Select
                  value={formData.category}
                  onValueChange={(value) => setFormData({ ...formData, category: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(cat => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Canal</Label>
                <Select
                  value={formData.channel}
                  onValueChange={(value) => setFormData({ ...formData, channel: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {channels.map(ch => (
                      <SelectItem key={ch.value} value={ch.value}>
                        {ch.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Assunto (opcional - para emails)</Label>
              <Input
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                placeholder="Assunto do email"
              />
            </div>

            <div>
              <Label>Mensagem *</Label>
              <Textarea
                value={formData.body}
                onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                placeholder="Digite a mensagem do template..."
                rows={8}
              />
            </div>

            {/* Variáveis disponíveis */}
            <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg">
              <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2 flex items-center gap-2">
                <Zap className="w-4 h-4" />
                Variáveis Disponíveis (clique para inserir)
              </h4>
              <div className="grid grid-cols-2 gap-2">
                {variables.map((v) => (
                  <button
                    key={v.var}
                    onClick={() => insertVariable(v.var)}
                    className="text-left px-3 py-2 bg-white dark:bg-gray-800 hover:bg-blue-100 dark:hover:bg-blue-900 rounded text-xs transition-colors"
                  >
                    <code className="text-blue-600 dark:text-blue-400 font-mono">
                      {v.var}
                    </code>
                    <p className="text-gray-600 dark:text-gray-400 mt-0.5">
                      {v.desc}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createTemplateMutation.isPending || updateTemplateMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {editingTemplate ? 'Salvar Alterações' : 'Criar Template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}