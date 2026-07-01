import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { upsell } from "@/api/upsellClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import WhatsAppTemplateSelector from "@/components/whatsapp/WhatsAppTemplateSelector";
import {
  MessageSquare,
  Send,
  Loader2,
  ArrowLeft,
  FileText,
  X,
  CheckCircle2,
  AlertCircle,
  Shield,
  Phone,
  Users,
  Search,
} from "lucide-react";
import { toast } from "sonner";

const LEAD_TYPE_LABELS = {
  pf: "Vendas PF",
  pj: "Vendas PJ",
  upsell: "Upsell",
  indicacao: "Indicação",
};

const API_BASE = "/api";

function authHeaders() {
  const token = localStorage.getItem("accessToken");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export default function WhatsAppConversa() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [phone, setPhone] = useState(searchParams.get("phone") || "");
  const [selectedLead, setSelectedLead] = useState(() => {
    const name = searchParams.get("name");
    return name ? { name, type: searchParams.get("leadType") || null } : null;
  });
  const [leadSelectorOpen, setLeadSelectorOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [templateSelectorOpen, setTemplateSelectorOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  const { data: user } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => base44.auth.me(),
  });

  const { data: agents = [] } = useQuery({
    queryKey: ["agents"],
    queryFn: () => base44.entities.Agent.list(),
    initialData: [],
  });

  const { data: leadOptions = [], isFetching: leadsLoading } = useQuery({
    queryKey: ["whatsappConversaLeads"],
    queryFn: async () => {
      const [pf, pj, ups, ind] = await Promise.all([
        base44.entities.Lead.list().catch(() => []),
        base44.entities.LeadPJ.list().catch(() => []),
        upsell.entities.LeadUpsell.list().catch(() => []),
        base44.entities.Referral.list().catch(() => []),
      ]);
      const norm = (items, type, getPhone, getName) =>
        (items || [])
          .map((l) => ({
            id: `${type}-${l.id}`,
            type,
            name: (getName(l) || "").toString().trim(),
            phone: (getPhone(l) || "").toString().trim(),
          }))
          .filter((l) => l.phone && l.phone.replace(/\D/g, "").length >= 10);
      return [
        ...norm(pf, "pf", (l) => l.phone, (l) => l.name),
        ...norm(pj, "pj", (l) => l.contact_phone || l.phone, (l) => l.company_name || l.name),
        ...norm(ups, "upsell", (l) => l.phone, (l) => l.name),
        ...norm(ind, "indicacao", (l) => l.referredPhone || l.referred_phone, (l) => l.referredName || l.referred_name),
      ];
    },
    enabled: leadSelectorOpen,
    staleTime: 60_000,
  });

  const currentAgent = agents.find((a) => a.user_email === user?.email);
  const vendedorNome = currentAgent?.name || user?.full_name || user?.name || null;
  const hasVendedor = !!(vendedorNome && (currentAgent?.id || user?.id));

  const templateBody = (() => {
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
  })();

  const canSend =
    phone.replace(/\D/g, "").length >= 10 &&
    (message.trim().length > 0 || !!selectedTemplate) &&
    !sending;

  const handleSend = async () => {
    setResult(null);

    const cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.length < 10) {
      toast.error("Informe um número de WhatsApp válido (com DDD).");
      return;
    }
    if (!message.trim() && !selectedTemplate) {
      toast.error("Escreva uma mensagem ou selecione um template.");
      return;
    }

    setSending(true);
    try {
      const res = await fetch(`${API_BASE}/whatsapp/send-and-tag`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          phone: cleanPhone,
          message: message.trim() || undefined,
          templateId: selectedTemplate?.id || undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        throw new Error(data.message || "Falha ao enviar a mensagem.");
      }

      setResult({
        success: true,
        tagged: data.tagged,
        vendedor: data.vendedor,
      });
      toast.success(
        data.tagged
          ? "Mensagem enviada e conversa vinculada ao vendedor!"
          : "Mensagem enviada com sucesso!"
      );
      setMessage("");
      setSelectedTemplate(null);
    } catch (err) {
      setResult({ success: false, error: err.message });
      toast.error(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-4">
      <div className="max-w-xl mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="flex-shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center shadow-md">
              <MessageSquare className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                Conversa WhatsApp
              </h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Inicie uma conversa com o cliente
              </p>
            </div>
          </div>
        </div>

        {/* Vendedor info */}
        {hasVendedor ? (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-50 dark:bg-green-950 rounded-full border border-green-200 dark:border-green-800">
            {currentAgent?.photo_url ? (
              <img
                src={currentAgent.photo_url}
                alt={vendedorNome}
                className="w-6 h-6 rounded-full object-cover"
              />
            ) : (
              <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                <span className="text-white text-xs font-semibold">
                  {vendedorNome?.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            <span className="text-sm text-green-700 dark:text-green-300 font-medium">
              {vendedorNome}
            </span>
            <Shield className="w-4 h-4 text-green-600 dark:text-green-400" />
          </div>
        ) : (
          <Alert>
            <AlertCircle className="w-4 h-4" />
            <AlertDescription className="text-sm">
              Seu usuário não está vinculado a um cadastro de vendedor. A mensagem
              será enviada, mas a conversa não será etiquetada com um vendedor.
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Phone className="w-4 h-4" />
              Destinatário
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
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
                <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950 px-3 py-2">
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
            </div>
            <div>
              <Label className="text-sm">Número do WhatsApp *</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(11) 99999-9999"
                className="mt-1"
                inputMode="tel"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Informe DDD + número. O código do país (55) é adicionado
                automaticamente.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              Mensagem
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {selectedTemplate ? (
              <div className="flex items-start justify-between gap-2 p-3 rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                    <span className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
                      {selectedTemplate.description ||
                        selectedTemplate.name ||
                        selectedTemplate.id}
                    </span>
                    <Badge variant="secondary" className="text-[10px]">
                      Template
                    </Badge>
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
                rows={5}
                className="mt-1"
              />
            </div>

            {result && (
              <Alert variant={result.success ? "default" : "destructive"}>
                {result.success ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  <AlertCircle className="w-4 h-4" />
                )}
                <AlertDescription className="text-sm">
                  {result.success
                    ? result.tagged
                      ? `Mensagem enviada e conversa vinculada a ${result.vendedor?.name}.`
                      : "Mensagem enviada com sucesso."
                    : result.error}
                </AlertDescription>
              </Alert>
            )}

            <Button
              className="w-full bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-600"
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
                  Enviar mensagem
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

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
          <Command
            filter={(value, search) =>
              value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
            }
          >
            <CommandInput placeholder="Buscar por nome ou telefone..." />
            <CommandList className="max-h-72">
              {leadsLoading ? (
                <div className="flex items-center justify-center py-8 text-sm text-gray-500">
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Carregando leads...
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
                          <p className="text-xs text-gray-500 truncate">
                            {lead.phone}
                          </p>
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
    </div>
  );
}
