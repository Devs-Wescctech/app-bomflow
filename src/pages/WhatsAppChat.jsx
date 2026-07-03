import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import WhatsAppTemplateSelector from "@/components/whatsapp/WhatsAppTemplateSelector";
import NewConversationDialog from "@/components/whatsapp/NewConversationDialog";
import { base44 } from "@/api/base44Client";
import { isAdminUser } from "@/components/utils/permissions";
import {
  MessageSquare,
  Send,
  Loader2,
  ArrowLeft,
  Search,
  MessagesSquare,
  User,
  Check,
  CheckCheck,
  FileText,
  X,
  Paperclip,
  ShieldX,
  Plus,
} from "lucide-react";
import { toast } from "sonner";

const API_BASE = "/api";

function authHeaders() {
  const token = localStorage.getItem("accessToken");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function formatTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function formatListTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function dayLabel(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Hoje";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

function convName(c) {
  return c?.name || c?.wa_number || "Contato";
}

function convNumber(c) {
  return c?.wa_number || "";
}

// Ícone de status de entrega para mensagens enviadas por nós.
function DeliveryStatus({ status }) {
  const s = String(status || "").toLowerCase();
  if (s === "read" || s === "3") return <CheckCheck className="w-3.5 h-3.5 text-sky-100" />;
  if (s === "delivered" || s === "2") return <CheckCheck className="w-3.5 h-3.5 text-teal-100" />;
  return <Check className="w-3.5 h-3.5 text-teal-100" />;
}

export default function WhatsAppChat() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => base44.auth.me(),
  });

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [message, setMessage] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [templateVars, setTemplateVars] = useState({});
  const [templateOpen, setTemplateOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Lista de conversas do vendedor (admin/supervisor veem todas). Polling 12s.
  const { data: conversations = [], isLoading: convsLoading } = useQuery({
    queryKey: ["waInboxConversations", debouncedSearch],
    queryFn: async () => {
      const res = await fetch(
        `${API_BASE}/whatsapp-inbox/conversations?search=${encodeURIComponent(debouncedSearch)}`,
        { headers: authHeaders() }
      );
      if (!res.ok) throw new Error("Falha ao carregar conversas");
      return res.json();
    },
    refetchInterval: 12000,
    staleTime: 5000,
  });

  // Thread da conversa aberta (com backfill do WHU). Polling 6s para fluidez.
  const { data: threadData, isLoading: threadLoading } = useQuery({
    queryKey: ["waInboxThread", selectedId],
    queryFn: async () => {
      const res = await fetch(
        `${API_BASE}/whatsapp-inbox/conversations/${selectedId}/messages?backfill=1`,
        { headers: authHeaders() }
      );
      if (!res.ok) throw new Error("Falha ao carregar mensagens");
      return res.json();
    },
    enabled: !!selectedId,
    refetchInterval: selectedId ? 6000 : false,
  });

  const messages = useMemo(() => {
    const list = Array.isArray(threadData?.messages) ? threadData.messages : [];
    return list.filter((m) => (m.text || "").length > 0);
  }, [threadData]);

  const selected = useMemo(() => {
    if (!selectedId) return null;
    const fromList = conversations.find((c) => c.id === selectedId);
    return fromList || threadData?.conversation || null;
  }, [selectedId, conversations, threadData]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "auto" });
    }
  }, [messages.length, selectedId]);

  const groupedMessages = useMemo(() => {
    const groups = [];
    let currentDay = null;
    for (const m of messages) {
      const iso = m.sent_at || null;
      const label = dayLabel(iso);
      if (label !== currentDay) {
        currentDay = label;
        groups.push({ type: "day", label, key: `day-${label}-${m.id}` });
      }
      groups.push({ type: "msg", msg: m, iso, key: m.id });
    }
    return groups;
  }, [messages]);

  // Marca como lida ao abrir e limpa o compositor.
  const handleSelect = async (conv) => {
    setSelectedId(conv.id);
    setMessage("");
    setSelectedTemplate(null);
    setTemplateVars({});
    if (conv.unread_count > 0) {
      try {
        await fetch(`${API_BASE}/whatsapp-inbox/conversations/${conv.id}/read`, {
          method: "POST",
          headers: authHeaders(),
        });
        queryClient.invalidateQueries({ queryKey: ["waInboxConversations"] });
      } catch {
        /* best-effort */
      }
    }
  };

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

  const handleSend = async () => {
    if (!selectedId) return;
    const hasText = message.trim().length > 0;
    if (!selectedTemplate && !hasText) return;
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
      const res = await fetch(
        `${API_BASE}/whatsapp-inbox/conversations/${selectedId}/reply`,
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            message: hasText ? message.trim() : undefined,
            templateId: selectedTemplate?.id || undefined,
            templateComponents,
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Falha ao enviar a mensagem.");
      }
      setMessage("");
      setSelectedTemplate(null);
      setTemplateVars({});
      queryClient.invalidateQueries({ queryKey: ["waInboxThread", selectedId] });
      queryClient.invalidateQueries({ queryKey: ["waInboxConversations"] });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSending(false);
    }
  };

  // Mídia em standby: definido com o usuário que a persistência será feita no ambiente de
  // produção. Aqui apenas sinalizamos, sem salvar nada no Replit/Storage.
  const handleMediaStandby = () => {
    toast.info("Envio de mídia em configuração — disponível em breve.");
  };

  // Após iniciar uma nova conversa, atualiza a lista e abre a conversa criada.
  const handleCreated = async ({ conversationId }) => {
    await queryClient.invalidateQueries({ queryKey: ["waInboxConversations"] });
    if (conversationId) {
      setSelectedId(conversationId);
      setMessage("");
      setSelectedTemplate(null);
      setTemplateVars({});
    }
  };

  const currentAgent = user?.agent;
  const isAdmin = isAdminUser(user, currentAgent);
  const allowedSubmenus = currentAgent?.allowedSubmenus || [];
  const hasChatAccess =
    isAdmin || allowedSubmenus.length === 0 || allowedSubmenus.includes("WhatsAppChat");

  if (user && !hasChatAccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <ShieldX className="w-16 h-16 text-gray-400 mb-4" />
        <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">Acesso Negado</h2>
        <p className="text-gray-500 dark:text-gray-400">Você não tem permissão para acessar o Chat WhatsApp.</p>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-0px)] bg-gray-50 dark:bg-gray-950 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex-shrink-0">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="flex-shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center shadow-md">
          <MessagesSquare className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Chat WhatsApp</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">Suas conversas com clientes</p>
        </div>
        <Button
          onClick={() => setNewOpen(true)}
          className="ml-auto gap-1.5 bg-teal-500 hover:bg-teal-600 text-white"
          size="sm"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Nova conversa</span>
        </Button>
      </div>

      <div className="flex-1 min-h-0 flex">
        {/* Coluna esquerda: lista */}
        <div
          className={`w-full md:w-80 lg:w-96 flex-shrink-0 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex flex-col ${
            selectedId ? "hidden md:flex" : "flex"
          }`}
        >
          <div className="p-3 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar conversa..."
                className="pl-9"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {convsLoading ? (
              <div className="flex items-center justify-center py-12 text-sm text-gray-500">
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Carregando...
              </div>
            ) : conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-6 text-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
                  <MessageSquare className="w-7 h-7 text-teal-500" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Nenhuma conversa ainda
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Clique em "Nova conversa" para começar.
                  </p>
                </div>
              </div>
            ) : (
              conversations.map((conv) => {
                const active = conv.id === selectedId;
                const name = convName(conv);
                const preview = conv.last_message_text || "";
                const unread = conv.unread_count || 0;
                const isOutLast = conv.last_direction === "out";
                return (
                  <button
                    key={conv.id}
                    onClick={() => handleSelect(conv)}
                    className={`w-full flex items-center gap-3 px-3 py-3 text-left border-b border-gray-100 dark:border-gray-800/60 transition-colors ${
                      active
                        ? "bg-teal-50 dark:bg-teal-950/40"
                        : "hover:bg-gray-50 dark:hover:bg-gray-800/40"
                    }`}
                  >
                    <div className="relative flex-shrink-0">
                      {conv.avatar_url && !conv.avatar_url.includes("avatar-default") ? (
                        <img src={conv.avatar_url} alt={name} className="w-11 h-11 rounded-full object-cover" />
                      ) : (
                        <div className="w-11 h-11 rounded-full bg-gradient-to-br from-gray-300 to-gray-400 dark:from-gray-600 dark:to-gray-700 flex items-center justify-center">
                          <User className="w-5 h-5 text-white" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                          {name}
                        </p>
                        <span className="text-[11px] text-gray-400 flex-shrink-0">
                          {formatListTime(conv.last_message_at)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {isOutLast && <span className="text-gray-400">Você: </span>}
                          {preview || convNumber(conv)}
                        </p>
                        {unread > 0 && (
                          <span className="flex-shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-teal-500 text-white text-[10px] font-bold flex items-center justify-center">
                            {unread > 99 ? "99+" : unread}
                          </span>
                        )}
                      </div>
                      {isAdmin && conv.vendedor_nome && (
                        <p className="text-[10px] text-gray-400 truncate mt-0.5">
                          Vendedor: {conv.vendedor_nome}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Coluna direita: thread */}
        <div className={`flex-1 min-w-0 flex flex-col bg-gray-50 dark:bg-gray-950 ${selectedId ? "flex" : "hidden md:flex"}`}>
          {!selected ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 px-6">
              <div className="w-16 h-16 rounded-2xl bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
                <MessagesSquare className="w-8 h-8 text-teal-500" />
              </div>
              <p className="text-sm font-semibold text-gray-600 dark:text-gray-300">
                Selecione uma conversa
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                ou inicie uma nova pelo botão "Nova conversa".
              </p>
            </div>
          ) : (
            <>
              {/* Header da conversa */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex-shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden flex-shrink-0"
                  onClick={() => setSelectedId(null)}
                >
                  <ArrowLeft className="w-5 h-5" />
                </Button>
                {selected.avatar_url && !selected.avatar_url.includes("avatar-default") ? (
                  <img src={selected.avatar_url} alt={convName(selected)} className="w-10 h-10 rounded-full object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-300 to-gray-400 dark:from-gray-600 dark:to-gray-700 flex items-center justify-center">
                    <User className="w-5 h-5 text-white" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">
                    {convName(selected)}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {convNumber(selected)}
                  </p>
                </div>
              </div>

              {/* Mensagens */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
                {threadLoading && messages.length === 0 ? (
                  <div className="flex items-center justify-center py-12 text-sm text-gray-500">
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Carregando mensagens...
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex items-center justify-center py-12 text-sm text-gray-400">
                    Nenhuma mensagem nesta conversa.
                  </div>
                ) : (
                  groupedMessages.map((item) =>
                    item.type === "day" ? (
                      <div key={item.key} className="flex justify-center my-3">
                        <span className="text-[11px] font-medium text-gray-500 bg-gray-200/70 dark:bg-gray-800 px-3 py-1 rounded-full">
                          {item.label}
                        </span>
                      </div>
                    ) : (
                      <div
                        key={item.key}
                        className={`flex ${item.msg.direction === "out" ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[75%] rounded-2xl px-3 py-2 shadow-sm ${
                            item.msg.direction === "out"
                              ? "bg-teal-500 text-white rounded-br-sm"
                              : "bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-bl-sm"
                          }`}
                        >
                          <p className="text-sm whitespace-pre-wrap break-words">{item.msg.text}</p>
                          <div
                            className={`flex items-center gap-1 justify-end mt-1 ${
                              item.msg.direction === "out" ? "text-teal-100" : "text-gray-400"
                            }`}
                          >
                            <span className="text-[10px]">{formatTime(item.iso)}</span>
                            {item.msg.direction === "out" && <DeliveryStatus status={item.msg.status} />}
                          </div>
                        </div>
                      </div>
                    )
                  )
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Composer */}
              <div className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 flex-shrink-0">
                {selectedTemplate && (
                  <div className="mb-2 rounded-lg border border-teal-200 dark:border-teal-900 bg-teal-50 dark:bg-teal-950/30 p-3">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 text-sm font-medium text-teal-700 dark:text-teal-300">
                        <FileText className="w-4 h-4" />
                        {selectedTemplate.description || selectedTemplate.name || selectedTemplate.id}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => setSelectedTemplate(null)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                    {templateBody && (
                      <p className="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap mb-2">
                        {templateBody}
                      </p>
                    )}
                    {templateVarIndexes.map((i) => (
                      <Input
                        key={i}
                        value={templateVars[i] || ""}
                        onChange={(e) => setTemplateVars((p) => ({ ...p, [i]: e.target.value }))}
                        placeholder={`Variável {{${i}}}`}
                        className="mb-1.5 h-8 text-sm"
                      />
                    ))}
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    className="flex-shrink-0"
                    onClick={handleMediaStandby}
                    disabled={sending}
                    title="Enviar arquivo (em breve)"
                  >
                    <Paperclip className="w-5 h-5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="flex-shrink-0"
                    onClick={() => setTemplateOpen(true)}
                    title="Enviar template"
                  >
                    <FileText className="w-5 h-5" />
                  </Button>
                  <Textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder="Digite uma mensagem..."
                    className="resize-none min-h-[42px] max-h-32"
                    rows={1}
                  />
                  <Button
                    onClick={handleSend}
                    disabled={sending || (!message.trim() && !selectedTemplate)}
                    className="flex-shrink-0 bg-teal-500 hover:bg-teal-600"
                    size="icon"
                  >
                    {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <WhatsAppTemplateSelector
        open={templateOpen}
        onOpenChange={setTemplateOpen}
        selectedTemplateId={selectedTemplate?.id}
        onSelect={(t) => {
          setSelectedTemplate(t);
          setTemplateOpen(false);
        }}
        accentColor="green"
      />

      <NewConversationDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreated={handleCreated}
      />
    </div>
  );
}
