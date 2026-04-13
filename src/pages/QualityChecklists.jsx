import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, Trash2, Save, CheckSquare, Edit, MoreVertical, Star, GripVertical, Calculator, Scale } from "lucide-react";
import { toast } from "sonner";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function QualityChecklists() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingChecklist, setEditingChecklist] = useState(null);
  
  // Form State
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [items, setItems] = useState([{ text: "", weight: 1 }]);
  const [isDefault, setIsDefault] = useState(false);

  const { data: checklists = [], isLoading } = useQuery({
    queryKey: ['qualityChecklists'],
    queryFn: () => base44.entities.QualityChecklist.list('-createdDate'),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.QualityChecklist.create(data),
    onSuccess: () => {
      toast.success("Checklist criado com sucesso!");
      queryClient.invalidateQueries({ queryKey: ['qualityChecklists'] });
      resetForm();
    },
    onError: () => toast.error("Erro ao criar checklist.")
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.QualityChecklist.update(id, data),
    onSuccess: () => {
      toast.success("Checklist atualizado com sucesso!");
      queryClient.invalidateQueries({ queryKey: ['qualityChecklists'] });
      resetForm();
    },
    onError: () => toast.error("Erro ao atualizar checklist.")
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.QualityChecklist.delete(id),
    onSuccess: () => {
      toast.success("Checklist excluído.");
      queryClient.invalidateQueries({ queryKey: ['qualityChecklists'] });
    }
  });

  const setDefaultMutation = useMutation({
    mutationFn: async (id) => {
      // Primeiro, remove o padrão de todos os outros (operação manual pois não temos updateMany simples exposto aqui as vezes)
      // Vamos assumir que o backend ou uma lógica futura lida com unicidade, ou fazemos aqui iterando.
      // Para simplificar: setamos este como true. O ideal seria setar os outros como false.
      // Vamos fazer um loop simples nos que são default atualmente.
      const currentDefaults = checklists.filter(c => c.is_default && c.id !== id);
      for (const c of currentDefaults) {
        await base44.entities.QualityChecklist.update(c.id, { is_default: false });
      }
      return base44.entities.QualityChecklist.update(id, { is_default: true });
    },
    onSuccess: () => {
      toast.success("Checklist padrão definido!");
      queryClient.invalidateQueries({ queryKey: ['qualityChecklists'] });
    }
  });

  const resetForm = () => {
    setName("");
    setDescription("");
    setItems([{ text: "", weight: 1 }]);
    setIsDefault(false);
    setEditingChecklist(null);
    setIsDialogOpen(false);
  };

  const handleEdit = (checklist) => {
    setEditingChecklist(checklist);
    setName(checklist.name);
    setDescription(checklist.description || "");
    
    // Handle legacy string items or new object items
    let formattedItems = [];
    if (checklist.items && checklist.items.length > 0) {
      formattedItems = checklist.items.map(item => {
        if (typeof item === 'string') return { text: item, weight: 1 };
        return item;
      });
    } else {
      formattedItems = [{ text: "", weight: 1 }];
    }
    
    setItems(formattedItems);
    setIsDefault(checklist.is_default);
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!name.trim()) {
      toast.error("O nome é obrigatório.");
      return;
    }
    
    const validItems = items.filter(i => i.text.trim() !== "");
    if (validItems.length === 0) {
      toast.error("Adicione pelo menos um item ao checklist.");
      return;
    }

    const data = {
      name,
      description,
      items: validItems,
      is_default: isDefault,
      active: true
    };

    if (editingChecklist) {
      updateMutation.mutate({ id: editingChecklist.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const addItem = () => setItems([...items, { text: "", weight: 1 }]);
  const removeItem = (index) => setItems(items.filter((_, i) => i !== index));
  const updateItemText = (index, value) => {
    const newItems = [...items];
    newItems[index].text = value;
    setItems(newItems);
  };
  const updateItemWeight = (index, value) => {
    const newItems = [...items];
    newItems[index].weight = parseInt(value) || 1;
    setItems(newItems);
  };

  const handleDragEnd = (result) => {
    if (!result.destination) return;
    const newItems = Array.from(items);
    const [reorderedItem] = newItems.splice(result.source.index, 1);
    newItems.splice(result.destination.index, 0, reorderedItem);
    setItems(newItems);
  };

  const calculateTotalWeight = (checkItems) => {
    return checkItems?.reduce((acc, item) => acc + (parseInt(typeof item === 'string' ? 1 : item.weight) || 0), 0) || 0;
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header - Styled to match QualityMonitor */}
        <div className="flex justify-between items-center pb-4 border-b border-gray-200 dark:border-gray-800 mb-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate(createPageUrl("QualityMonitor"))}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                  <CheckSquare className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                Modelos de Checklist
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 ml-14">
                Defina os critérios e pesos para a avaliação da IA
              </p>
            </div>
          </div>
          <Button onClick={() => { resetForm(); setIsDialogOpen(true); }} className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm">
            <Plus className="w-4 h-4 mr-2" />
            Novo Checklist
          </Button>
        </div>

        {/* Grid of Checklists */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {checklists.map((checklist) => {
            const totalWeight = calculateTotalWeight(checklist.items);
            const itemsCount = checklist.items?.length || 0;
            
            return (
              <Card key={checklist.id} className={`group hover:shadow-lg transition-all duration-300 border-l-4 ${
                checklist.is_default 
                  ? 'border-l-blue-500 border-y-gray-200 border-r-gray-200 dark:border-y-gray-800 dark:border-r-gray-800 bg-blue-50/10' 
                  : 'border-l-transparent hover:border-l-gray-300 dark:hover:border-l-gray-600'
              }`}>
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-lg font-bold text-gray-900 dark:text-gray-100">
                          {checklist.name}
                        </CardTitle>
                        {checklist.is_default && (
                          <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/50 dark:text-blue-300 border-0 text-[10px] px-2 py-0.5 h-5">
                            Padrão
                          </Badge>
                        )}
                      </div>
                      <CardDescription className="line-clamp-1 text-xs">
                        {checklist.description || "Sem descrição definida"}
                      </CardDescription>
                    </div>
                    
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 -mr-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem onClick={() => handleEdit(checklist)} className="cursor-pointer">
                          <Edit className="w-4 h-4 mr-2" /> Editar
                        </DropdownMenuItem>
                        {!checklist.is_default && (
                          <DropdownMenuItem onClick={() => setDefaultMutation.mutate(checklist.id)} className="cursor-pointer">
                            <Star className="w-4 h-4 mr-2" /> Definir como Padrão
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem 
                          className="text-red-600 focus:text-red-700 focus:bg-red-50 cursor-pointer"
                          onClick={() => {
                            if (confirm("Tem certeza que deseja excluir este modelo?")) deleteMutation.mutate(checklist.id);
                          }}
                        >
                          <Trash2 className="w-4 h-4 mr-2" /> Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* Stats Row */}
                  <div className="flex items-center gap-4 pt-2">
                    <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-md">
                      <CheckSquare className="w-3.5 h-3.5" />
                      <span className="font-medium">{itemsCount}</span> itens
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-md">
                      <Scale className="w-3.5 h-3.5" />
                      Peso total: <span className="font-medium">{totalWeight}</span>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="pt-0">
                  <div className="space-y-3 pt-2 border-t border-gray-100 dark:border-gray-800">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Prévia dos Itens</p>
                    <div className="space-y-2">
                      {checklist.items?.slice(0, 3).map((item, idx) => {
                        const itemText = typeof item === 'string' ? item : item.text;
                        const itemWeight = typeof item === 'string' ? 1 : item.weight;
                        return (
                          <div key={idx} className="flex items-center justify-between text-sm group/item">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-gray-700 group-hover/item:bg-blue-400 transition-colors" />
                              <span className="text-gray-600 dark:text-gray-400 truncate text-xs">{itemText}</span>
                            </div>
                            {itemWeight > 1 && (
                              <Badge variant="outline" className="ml-2 text-[10px] h-4 px-1 border-gray-200 text-gray-500">
                                {itemWeight}x
                              </Badge>
                            )}
                          </div>
                        );
                      })}
                      {(checklist.items?.length || 0) > 3 && (
                        <div className="text-[10px] text-center text-gray-400 pt-1 italic">
                          + {checklist.items.length - 3} outros critérios...
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {/* Empty State */}
          {checklists.length === 0 && !isLoading && (
            <div className="col-span-full flex flex-col items-center justify-center py-12 text-gray-400 border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-xl">
              <CheckSquare className="w-12 h-12 mb-4 opacity-20" />
              <p className="text-lg font-medium text-gray-900 dark:text-gray-100">Nenhum modelo criado</p>
              <p className="text-sm mb-6">Crie seu primeiro checklist para padronizar as avaliações da IA.</p>
              <Button onClick={() => setIsDialogOpen(true)}>
                Criar Checklist
              </Button>
            </div>
          )}
        </div>

        {/* Dialog Create/Edit */}
        <Dialog open={isDialogOpen} onOpenChange={(open) => { if(!open) resetForm(); setIsDialogOpen(open); }}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>{editingChecklist ? "Editar Checklist" : "Novo Checklist de Qualidade"}</DialogTitle>
            </DialogHeader>
            
            <div className="flex-1 overflow-y-auto pr-2 space-y-6 py-4">
              <div className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">Nome do Modelo</Label>
                  <Input 
                    id="name" 
                    placeholder="Ex: Auditoria de Vendas Básico" 
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                
                <div className="grid gap-2">
                  <Label htmlFor="description">Descrição (Opcional)</Label>
                  <Input 
                    id="description" 
                    placeholder="Para qual tipo de ligação este checklist serve?" 
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="default" 
                    checked={isDefault}
                    onCheckedChange={setIsDefault}
                  />
                  <Label htmlFor="default" className="text-sm font-normal cursor-pointer">
                    Definir como checklist padrão
                  </Label>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg border border-gray-100 dark:border-gray-800">
                  <div className="flex items-center gap-2">
                    <Label className="text-base font-semibold text-gray-700 dark:text-gray-200">Itens de Avaliação</Label>
                    <Badge variant="secondary" className="text-xs font-normal">
                      Total: {items.length}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3">
                     <div className="text-xs text-gray-500 flex items-center gap-1 bg-white dark:bg-gray-800 px-2 py-1 rounded border border-gray-200 dark:border-gray-700">
                        <Calculator className="w-3 h-3" />
                        Peso Total: <span className="font-bold text-blue-600">{calculateTotalWeight(items)}</span>
                     </div>
                    <Button variant="outline" size="sm" onClick={addItem} className="h-8 text-xs bg-white hover:bg-gray-50 text-blue-600 border-blue-200 hover:border-blue-300 shadow-sm">
                      <Plus className="w-3 h-3 mr-1" /> Adicionar Critério
                    </Button>
                  </div>
                </div>

                <div className="bg-gray-50/50 dark:bg-gray-900/30 rounded-xl border border-gray-200 dark:border-gray-800 min-h-[200px] max-h-[400px] overflow-y-auto p-1 custom-scrollbar">
                  <DragDropContext onDragEnd={handleDragEnd}>
                    <Droppable droppableId="checklist-items">
                      {(provided) => (
                        <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2 p-2">
                          {items.map((item, index) => (
                            <Draggable key={index} draggableId={`item-${index}`} index={index}>
                              {(provided, snapshot) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  className={`flex items-start gap-2 p-3 rounded-lg border transition-all ${
                                    snapshot.isDragging 
                                      ? 'bg-white dark:bg-gray-800 shadow-lg border-blue-500 scale-[1.02] z-50' 
                                      : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                                  }`}
                                >
                                  <div 
                                    {...provided.dragHandleProps}
                                    className="mt-2 text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing"
                                  >
                                    <GripVertical className="w-4 h-4" />
                                  </div>

                                  <div className="flex-1 grid grid-cols-12 gap-3">
                                    <div className="col-span-9">
                                      <Label className="text-[10px] text-gray-500 uppercase tracking-wide mb-1 block">Critério</Label>
                                      <Input 
                                        value={item.text}
                                        onChange={(e) => updateItemText(index, e.target.value)}
                                        placeholder="Ex: O agente confirmou os dados do cliente?"
                                        className="h-9 bg-transparent border-gray-200 focus:border-blue-500"
                                        autoFocus={items.length > 1 && index === items.length - 1}
                                      />
                                    </div>
                                    <div className="col-span-3">
                                      <Label className="text-[10px] text-gray-500 uppercase tracking-wide mb-1 block text-center">Peso</Label>
                                      <div className="relative">
                                        <Input 
                                          type="number"
                                          min="1"
                                          max="10"
                                          value={item.weight}
                                          onChange={(e) => updateItemWeight(index, e.target.value)}
                                          className={`h-9 text-center font-medium ${
                                            item.weight >= 5 ? 'text-blue-600 border-blue-200 bg-blue-50/50' : 
                                            item.weight >= 3 ? 'text-gray-900 border-gray-200' : 
                                            'text-gray-500 border-gray-200'
                                          }`}
                                        />
                                        <div className="absolute inset-y-0 right-1 flex flex-col justify-center opacity-20 pointer-events-none">
                                          <div className="h-2 w-2 border-l border-t border-gray-900 rotate-45 translate-y-[1px]" />
                                          <div className="h-2 w-2 border-r border-b border-gray-900 rotate-45 -translate-y-[1px]" />
                                        </div>
                                      </div>
                                    </div>
                                  </div>

                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    onClick={() => removeItem(index)}
                                    className="mt-5 h-8 w-8 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                                    disabled={items.length === 1}
                                    tabIndex={-1}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </DragDropContext>
                  
                  {items.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-40 text-gray-400">
                      <p>Nenhum item adicionado</p>
                      <Button variant="link" onClick={addItem}>Adicionar primeiro item</Button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <DialogFooter className="mt-4">
              <Button variant="outline" onClick={resetForm}>Cancelar</Button>
              <Button onClick={handleSubmit} className="bg-blue-600 hover:bg-blue-700">
                <Save className="w-4 h-4 mr-2" />
                {editingChecklist ? "Salvar Alterações" : "Criar Checklist"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}