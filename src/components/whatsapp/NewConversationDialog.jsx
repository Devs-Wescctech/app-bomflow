import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import WhatsAppTemplateSelector from "@/components/whatsapp/WhatsAppTemplateSelector";
import {
  MessageSquare,
  Send,
  Loader2,
  FileText,
  X,
  Phone,
  Users,
  Search,
} from "lucide-react";
import { toast } from "sonner";

const API_BASE = "/api";

const LEAD_TYPE_LABELS = {
  pf: "Vendas PF",
  pj: "Vendas PJ",
  upsell: "Upsell",
  indicacao: "Indicação",
};

function authHeaders() {
  const token = localStorage.getItem("accessToken");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// Modal para iniciar uma NOVA conversa dentro do Chat WhatsApp. Reaproveita o fluxo
// "send-and-tag" (envia via WHU, etiqueta o vendedor e grava no inbox local). Ao concluir,
// devolve via onCreated o id da conversa criada para o Chat abri-la.
export default function NewConversationDialog({ open, onOpenChange, onCreated }) {
  const [phone, setPhone] = useState("");
  const [selectedLead, setSelectedLead] = useState(null);
  const [leadSelectorOpen, setLeadSelectorOpen] = useState(false);
  const [leadSearch, setLeadSearch] = useState("");
  const [debouncedLeadSearch, setDebouncedLeadSearch] = useState("");
  const [message, setMessage] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [templateVars, setTemplateVars] = useState({});
  const [templateSelectorOpen, setTemplateSelectorOpen] = useState(false);
  const [sending, setSending] = useState(false);

  const { data: user } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => base44.auth.me(),
  });

  const { data: agents = [] } = useQuery({
    queryKey: ["agents"],
    queryFn: () => base44.entities.Agent.list(),
    initialData: [],
  });

  const currentAgent = agents.find((a) => a.user_email === user?.email);
  const vendedorNome = currentAgent?.name || user?.full_name || user?.name || null;

  // Reseta o formulário quando o modal fecha.
  useEffect(() => {
    if (!open) {
      setPhone("");
      setSelectedLead(null);
      setMessage("");
      setSelectedTemplate(null);
      setTemplateVars({});
    }
  }, [open]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedLeadSearch(leadSearch.trim()), 300);
    return () => clearTimeout(t);
  }, [leadSearch]);

  useEffect(() => {
    if (!leadSelectorOpen) {
      setLeadSearch("");
      setDebouncedLeadSearch("");
    }
  }, [leadSelectorOpen]);

  const { data: leadOptions = [], isFetching: leadsLoading } = useQuery({
    queryKey: ["newConversationLeads", debouncedLeadSearch],
    queryFn: async () => {
      const res = await fetch(
        `${API_BASE}/whatsapp/search-leads?term=${encodeURIComponent(debouncedLeadSearch)}`,
        { headers: authHeaders() }
      );
      if (!res.ok) throw new Error("Falha ao buscar leads.");
      return res.json();
    },
    enabled: leadSelectorOpen && debouncedLeadSearch.length >= 2,
    staleTime: 60_000,
  });

  const templateBody = useMemo(() => {
    if (!selectedTemplate) return null;
    const t = selectedTemplate;
    if (t.dynamicComponents) {
      const body = t.dynamicComponents.find((c) => c.type === "BODY");
      if (body?.text) return body.text;
    }
    if (t.staticComponents) {
      const body = t.staticComponents.find((c) => c.type === "BODY");
      if (body?.text) return body.text;
    }
    return t.description || t.name || null;
  }, [selectedTemplate]);

  const templateVarIndexes = useMemo(() => {
    if (!templateBody) return [];
    const found = [...templateBody.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) =>
      parseInt(m[1], 10)
    );
    return [...new Set(found)].sort((a, b) => a - b);
  }, [templateBody]);

  useEffect(() => {
    if (!selectedTemplate) {
      setTemplateVars({});
      return;
    }
    setTemplateVars((prev) => {
      const next = {};
      templateVarIndexes.forEach((i) => {
        if (prev[i] !== undefined && prev[i] !== "") next[i] = prev[i];
        else if (i === 1) next[i] = selectedLead?.name || "";
        else if (i === 2) next[i] = vendedorNome || "";
        else next[i] = "";
      });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTemplate?.id, selectedLead?.name, vendedorNome]);

  const canSend =
    phone.replace(/\D/g, "").length >= 10 &&
    (message.trim().length > 0 || !!selectedTemplate) &&
    !sending;

  const handleSend = async () => {
    const cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.length < 10) {
      toast.error("Informe um número de WhatsApp válido (com DDD).");
      return;
    }
    if (!message.trim() && !selectedTemplate) {
      toast.error("Escreva uma mensagem ou selecione um template.");
      return;
    }
    if (
      selectedTemplate &&
      templateVarIndexes.some((i) => !String(templateVars[i] || "").trim())
    ) {
      toast.error("Preencha todas as variáveis do template.");
      return;
    }

    const templateComponents =
      selectedTemplate && templateVarIndexes.length > 0
        ? [
            {
              type: "BODY",
              parameters: templateVarIndexes.map((i) => ({
                type: "text",
                text: String(templateVars[i] || "").trim(),
              })),
            },
          ]
        : undefined;

    setSending(true);
    try {
      const res = await fetch(`${API_BASE}/whatsapp/send-and-tag`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          phone: cleanPhone,
          message: message.trim() || undefined,
          templateId: selectedTemplate?.id || undefined,
          templateComponents,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Falha ao enviar a mensagem.");
      }
      toast.success("Conversa iniciada!");
      onCreated?.({ conversationId: data.conversationId || null, phone: cleanPhone });
      onOpenChange(false);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !sending && onOpenChange(o)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-teal-500" />
              Nova conversa
            </DialogTitle>
            <DialogDescription>
              Inicie uma conversa com o cliente. A conversa será vinculada a você.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {/* Lead + número */}
            <div className="space-y-2">
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start"
                onClick={() => setLeadSelectorOpen(true)}
              >
                <Users className="w-4 h-4 mr-2" />
                {selectedLead?.name
                  ? `Lead: ${selectedLead.name}`
                  : "Selecionar um lead (opcional)"}
              </Button>
              {selectedLead && (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-950/30 px-3 py-2">
                  <div className="min-w-0 flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                      {selectedLead.name}
                    </span>
                    {selectedLead.type && LEAD_TYPE_LABELS[selectedLead.type] && (
                      <Badge variant="secondary" className="text-[10px] flex-shrink-0">
                        {LEAD_TYPE_LABELS[selectedLead.type]}
                      </Badge>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 flex-shrink-0"
                    onClick={() => setSelectedLead(null)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              )}
              <div>
                <Label className="text-sm flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5" />
                  Número do WhatsApp *
                </Label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(11) 99999-9999"
                  className="mt-1"
                  inputMode="tel"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  DDD + número. O código do país (55) é adicionado automaticamente.
                </p>
              </div>
            </div>

            {/* Template */}
            {selectedTemplate ? (
              <div className="flex items-start justify-between gap-2 p-3 rounded-lg border border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-950/30">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-teal-600 dark:text-teal-400 flex-shrink-0" />
                    <span className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
                      {selectedTemplate.description || selectedTemplate.name || selectedTemplate.id}
                    </span>
                    <Badge variant="secondary" className="text-[10px]">Template</Badge>
                  </div>
                  {templateBody && (
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 line-clamp-3 whitespace-pre-wrap">
                      {templateBody}
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 flex-shrink-0"
                  onClick={() => setSelectedTemplate(null)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => setTemplateSelectorOpen(true)}
              >
                <FileText className="w-4 h-4 mr-2" />
                Escolher template (opcional)
              </Button>
            )}

            {selectedTemplate && templateVarIndexes.length > 0 && (
              <div className="space-y-2 p-3 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
                <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
                  Variáveis do template
                </p>
                {templateVarIndexes.map((i) => (
                  <div key={i}>
                    <Label className="text-xs">
                      {i === 1 ? "Variável 1 — Cliente" : i === 2 ? "Variável 2 — Consultor" : `Variável ${i}`}
                    </Label>
                    <Input
                      value={templateVars[i] || ""}
                      onChange={(e) =>
                        setTemplateVars((prev) => ({ ...prev, [i]: e.target.value }))
                      }
                      placeholder={`Valor para {{${i}}}`}
                      className="mt-1"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Mensagem */}
            <div>
              <Label className="text-sm">Mensagem de texto</Label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={
                  selectedTemplate
                    ? "Texto adicional após o template (opcional)"
                    : "Escreva a mensagem para o cliente..."
                }
                rows={4}
                className="mt-1"
              />
            </div>

            <Button
              className="w-full bg-teal-500 hover:bg-teal-600 text-white"
              disabled={!canSend}
              onClick={handleSend}
            >
              {sending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Iniciar conversa
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <WhatsAppTemplateSelector
        open={templateSelectorOpen}
        onOpenChange={setTemplateSelectorOpen}
        selectedTemplateId={selectedTemplate?.id}
        onSelect={(t) => setSelectedTemplate(t)}
        accentColor="green"
      />

      <Dialog open={leadSelectorOpen} onOpenChange={setLeadSelectorOpen}>
        <DialogContent className="max-w-md p-0 overflow-hidden">
          <DialogHeader className="px-4 pt-4">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Users className="w-4 h-4" />
              Selecionar lead
            </DialogTitle>
          </DialogHeader>
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Buscar por nome ou telefone..."
              value={leadSearch}
              onValueChange={setLeadSearch}
            />
            <CommandList className="max-h-72">
              {leadsLoading ? (
                <div className="flex items-center justify-center py-8 text-sm text-gray-500">
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Buscando leads...
                </div>
              ) : debouncedLeadSearch.length < 2 ? (
                <div className="flex flex-col items-center py-6 text-sm text-gray-500">
                  <Search className="w-5 h-5 mb-2 opacity-50" />
                  Digite ao menos 2 caracteres para buscar.
                </div>
              ) : (
                <>
                  <CommandEmpty>
                    <div className="flex flex-col items-center py-6 text-sm text-gray-500">
                      <Search className="w-5 h-5 mb-2 opacity-50" />
                      Nenhum lead encontrado.
                    </div>
                  </CommandEmpty>
                  <CommandGroup>
                    {leadOptions.map((lead) => (
                      <CommandItem
                        key={lead.id}
                        value={`${lead.name} ${lead.phone}`}
                        onSelect={() => {
                          setPhone(lead.phone);
                          setSelectedLead({ name: lead.name, type: lead.type });
                          setLeadSelectorOpen(false);
                        }}
                        className="flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {lead.name || "Sem nome"}
                          </p>
                          <p className="text-xs text-gray-500 truncate">{lead.phone}</p>
                        </div>
                        <Badge variant="secondary" className="text-[10px] flex-shrink-0">
                          {LEAD_TYPE_LABELS[lead.type]}
                        </Badge>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
