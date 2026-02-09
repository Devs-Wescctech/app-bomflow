import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, Search, Zap, Star } from "lucide-react";

export default function TemplateSelector({ 
  onSelect, 
  ticket, 
  contact, 
  contract, 
  buttonLabel = "Templates",
  buttonVariant = "outline",
  buttonSize = "sm"
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [showShortcuts, setShowShortcuts] = useState(false);
  
  const { data: templates = [] } = useQuery({
    queryKey: ['templates'],
    queryFn: () => base44.entities.Template.filter({ active: true }),
    initialData: [],
  });

  // Filtrar templates
  const filteredTemplates = templates.filter(template => {
    const searchLower = search.toLowerCase();
    return (
      template.name.toLowerCase().includes(searchLower) ||
      template.body.toLowerCase().includes(searchLower) ||
      template.category?.toLowerCase().includes(searchLower)
    );
  });

  // Agrupar por categoria
  const groupedTemplates = filteredTemplates.reduce((acc, template) => {
    const category = template.category || 'Geral';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(template);
    return acc;
  }, {});

  // Substituir variáveis no template
  const replaceVariables = (text) => {
    let result = text;
    
    // Variáveis do contato
    if (contact) {
      result = result.replace(/\{\{nome_cliente\}\}/g, contact.name);
      result = result.replace(/\{\{cpf_cliente\}\}/g, contact.document || '');
      result = result.replace(/\{\{email_cliente\}\}/g, contact.emails?.[0] || '');
      result = result.replace(/\{\{telefone_cliente\}\}/g, contact.phones?.[0] || '');
    }
    
    // Variáveis do contrato
    if (contract) {
      result = result.replace(/\{\{plano\}\}/g, contract.plan);
      result = result.replace(/\{\{valor_mensal\}\}/g, `R$ ${contract.monthly_value?.toFixed(2) || '0.00'}`);
      result = result.replace(/\{\{status_contrato\}\}/g, contract.status);
    }
    
    // Variáveis do ticket
    if (ticket) {
      result = result.replace(/\{\{numero_ticket\}\}/g, ticket.id?.slice(0, 8) || '');
      result = result.replace(/\{\{prioridade\}\}/g, ticket.priority);
    }
    
    // Variáveis gerais
    const today = new Date();
    result = result.replace(/\{\{data_hoje\}\}/g, today.toLocaleDateString('pt-BR'));
    result = result.replace(/\{\{hora_agora\}\}/g, today.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
    
    return result;
  };

  const handleSelectTemplate = (template) => {
    const processedBody = replaceVariables(template.body);
    onSelect(processedBody);
    setOpen(false);
    setSearch("");
  };

  // Detectar atalhos (slash commands)
  useEffect(() => {
    const handleSlashCommand = (e) => {
      if (e.key === '/' && !open) {
        const activeElement = document.activeElement;
        if (activeElement?.tagName === 'TEXTAREA' || activeElement?.tagName === 'INPUT') {
          setShowShortcuts(true);
          setTimeout(() => setShowShortcuts(false), 3000);
        }
      }
    };

    document.addEventListener('keydown', handleSlashCommand);
    return () => document.removeEventListener('keydown', handleSlashCommand);
  }, [open]);

  // Atalhos mais comuns
  const shortcuts = [
    { command: '/sinistro', template: templates.find(t => t.category === 'sinistro' || t.name.toLowerCase().includes('sinistro')) },
    { command: '/docs', template: templates.find(t => t.category === 'documentos' || t.name.toLowerCase().includes('documento')) },
    { command: '/pagamento', template: templates.find(t => t.category === 'financeiro' || t.name.toLowerCase().includes('pagamento')) },
    { command: '/planos', template: templates.find(t => t.category === 'comercial' || t.name.toLowerCase().includes('plano')) },
  ].filter(s => s.template);

  return (
    <div className="relative">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant={buttonVariant} size={buttonSize} className="gap-2">
            <FileText className="w-4 h-4" />
            {buttonLabel}
            {templates.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs">
                {templates.length}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[500px] p-0" align="start">
          <div className="p-3 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2 mb-2">
              <Search className="w-4 h-4 text-gray-400" />
              <Input
                placeholder="Buscar templates..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="border-0 focus-visible:ring-0 h-8 px-0"
                autoFocus
              />
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <Zap className="w-3 h-3" />
              <span>Atalhos rápidos: /sinistro, /docs, /pagamento</span>
            </div>
          </div>

          <ScrollArea className="h-[400px]">
            <div className="p-2">
              {Object.keys(groupedTemplates).length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400 text-sm">
                  Nenhum template encontrado
                </div>
              ) : (
                Object.entries(groupedTemplates).map(([category, categoryTemplates]) => (
                  <div key={category} className="mb-4">
                    <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-2 mb-2">
                      {category}
                    </h4>
                    <div className="space-y-1">
                      {categoryTemplates.map((template) => {
                        const shortcut = shortcuts.find(s => s.template?.id === template.id);
                        
                        return (
                          <button
                            key={template.id}
                            onClick={() => handleSelectTemplate(template)}
                            className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                                    {template.name}
                                  </span>
                                  {shortcut && (
                                    <Badge variant="secondary" className="text-xs">
                                      {shortcut.command}
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
                                  {template.body.substring(0, 100)}...
                                </p>
                              </div>
                              <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>

          <div className="p-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
            <div className="text-xs text-gray-500 dark:text-gray-400">
              <p className="font-semibold mb-1">Variáveis disponíveis:</p>
              <div className="grid grid-cols-2 gap-1">
                <code>{'{{nome_cliente}}'}</code>
                <code>{'{{plano}}'}</code>
                <code>{'{{numero_ticket}}'}</code>
                <code>{'{{data_hoje}}'}</code>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* Tooltip de atalhos */}
      {showShortcuts && (
        <div className="absolute top-full left-0 mt-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg p-3 z-50 animate-in fade-in slide-in-from-top-2">
          <div className="font-semibold mb-2">💡 Atalhos rápidos:</div>
          <div className="space-y-1">
            {shortcuts.map(s => (
              <div key={s.command} className="flex items-center gap-2">
                <code className="bg-gray-800 px-2 py-0.5 rounded">{s.command}</code>
                <span className="text-gray-300">{s.template.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}