import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import WhatsAppTemplateSelector from "@/components/whatsapp/WhatsAppTemplateSelector";
import NewConversationDialog from "@/components/whatsapp/NewConversationDialog";
import ConversationFilters from "@/components/whatsapp/ConversationFilters";
import ConversationCard from "@/components/whatsapp/ConversationCard";
import ChatConversationHeader from "@/components/whatsapp/ChatConversationHeader";
import MessageBubble from "@/components/whatsapp/MessageBubble";
import LeadInsightsPanel from "@/components/whatsapp/LeadInsightsPanel";
import { dayLabel } from "@/components/whatsapp/chatHelpers";
import { base44 } from "@/api/base44Client";
import { isAdminUser } from "@/components/utils/permissions";
import {
  MessageSquare,
  Send,
  Loader2,
  MessagesSquare,
  FileText,
  X,
  Paperclip,
  ShieldX,
  Plus,
  Smile,
  Image as ImageIcon,
  Mic,
  Sparkles,
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

const FILTERS = [
  { key: "all", label: "Todas" },
  { key: "unread", label: "Não lidas" },
  { key: "pending", label: "Pendentes" },
  { key: "answered", label: "Respondidas" },
  { key: "today", label: "Hoje" },
  { key: "yesterday", label: "Ontem" },
];

const QUICK_EMOJIS = [
  "😊", "👍", "🙏", "🎉", "✅", "❤️", "😉", "😀",
  "🤝", "👏", "🔥", "💡", "📌", "⏰", "💰", "📞",
];

function isSameDay(iso, ref) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return false;
  return d.toDateString() === ref.toDateString();
}

export default function WhatsAppChat() {
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
  // Estado puramente visual (não afeta API/negócio):
  const [activeFilter, setActiveFilter] = useState("all");
  const [panelOpen, setPanelOpen] = useState(false);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

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

  // Filtro client-side sobre dados JÁ carregados (UI apenas — não altera API).
  const filteredConversations = useMemo(() => {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    switch (activeFilter) {
      case "unread":
        return conversations.filter((c) => (c.unread_count || 0) > 0);
      case "pending":
        return conversations.filter((c) => c.last_direction === "in");
      case "answered":
        return conversations.filter((c) => c.last_direction === "out");
      case "today":
        return conversations.filter((c) => isSameDay(c.last_message_at, now));
      case "yesterday":
        return conversations.filter((c) => isSameDay(c.last_message_at, yesterday));
      default:
        return conversations;
    }
  }, [conversations, activeFilter]);

  const filterCounts = useMemo(
    () => ({
      all: conversations.length,
      unread: conversations.filter((c) => (c.unread_count || 0) > 0).length,
      pending: conversations.filter((c) => c.last_direction === "in").length,
      answered: conversations.filter((c) => c.last_direction === "out").length,
    }),
    [conversations]
  );

  const groupedMessages = useMemo(() => {
    const out = [];
    let currentDay = null;
    const gap = (a, b) => {
      if (!a?.sent_at || !b?.sent_at) return Infinity;
      return Math.abs(new Date(b.sent_at) - new Date(a.sent_at)) / 60000;
    };
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      const iso = m.sent_at || null;
      const label = dayLabel(iso);
      const prev = messages[i - 1];
      const next = messages[i + 1];
      const dayChanged = label !== currentDay;
      if (dayChanged) {
        currentDay = label;
        out.push({ type: "day", label, key: `day-${label}-${m.id}` });
      }
      const sameAsPrev =
        !dayChanged && prev && prev.direction === m.direction && gap(prev, m) <= 5;
      const nextSameDay = next ? dayLabel(next.sent_at) === label : false;
      const sameAsNext =
        next && nextSameDay && next.direction === m.direction && gap(m, next) <= 5;
      out.push({
        type: "msg",
        msg: m,
        iso,
        key: m.id,
        isFirstInGroup: !sameAsPrev,
        isLastInGroup: !sameAsNext,
      });
    }
    return out;
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

  // Ações rápidas do header — seguras (sem novas APIs / sem quebrar fluxo).
  const handleQuickAction = (type) => {
    if (type === "lead") {
      toast.info("Vínculo direto com o Lead disponível em breve.");
    } else if (type === "files") {
      toast.info("Arquivos da conversa em configuração — disponível em breve.");
    }
  };

  const insertEmoji = (emoji) => {
    setMessage((prev) => prev + emoji);
    if (textareaRef.current) textareaRef.current.focus();
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

  const canSend = !sending && (message.trim() || selectedTemplate);

  return (
    <div className="h-[calc(100vh-0px)] bg-gradient-to-b from-gray-50 to-gray-100/60 dark:from-gray-950 dark:to-gray-950 flex flex-col">
      {/* Header do app */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200/70 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl flex-shrink-0">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 via-indigo-500 to-blue-500 flex items-center justify-center shadow-[0_4px_14px_-4px_rgba(99,102,241,0.6)]">
          <MessagesSquare className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 tracking-tight">
            Central de Conversas
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Atendimento inteligente via WhatsApp
          </p>
        </div>
        <Button
          onClick={() => setNewOpen(true)}
          className="ml-auto gap-1.5 bg-gradient-to-r from-violet-500 to-indigo-500 hover:from-violet-600 hover:to-indigo-600 text-white shadow-sm"
          size="sm"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Nova conversa</span>
        </Button>
      </div>

      <div className="flex-1 min-h-0 flex">
        {/* Coluna esquerda: lista */}
        <div
          className={`w-full md:w-80 lg:w-96 flex-shrink-0 border-r border-gray-200/70 dark:border-gray-800 bg-white/60 dark:bg-gray-900/50 backdrop-blur-sm flex flex-col ${
            selectedId ? "hidden md:flex" : "flex"
          }`}
        >
          <div className="border-b border-gray-200/70 dark:border-gray-800 flex-shrink-0">
            <ConversationFilters
              search={search}
              onSearch={setSearch}
              activeFilter={activeFilter}
              onFilter={setActiveFilter}
              filters={FILTERS}
              counts={filterCounts}
            />
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {convsLoading ? (
              <div className="flex items-center justify-center py-12 text-sm text-gray-500">
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Carregando...
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-6 text-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-100 to-indigo-100 dark:from-violet-900/30 dark:to-indigo-900/20 flex items-center justify-center">
                  <MessageSquare className="w-7 h-7 text-violet-500" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                    {activeFilter === "all" ? "Nenhuma conversa ainda" : "Nada por aqui"}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {activeFilter === "all"
                      ? 'Clique em "Nova conversa" para começar.'
                      : "Nenhuma conversa neste filtro."}
                  </p>
                </div>
              </div>
            ) : (
              filteredConversations.map((conv, index) => (
                <ConversationCard
                  key={conv.id}
                  conv={conv}
                  index={index}
                  active={conv.id === selectedId}
                  isAdmin={isAdmin}
                  onSelect={handleSelect}
                />
              ))
            )}
          </div>
        </div>

        {/* Coluna central: thread */}
        <div
          className={`flex-1 min-w-0 flex flex-col ${selectedId ? "flex" : "hidden md:flex"}`}
        >
          {!selected ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 px-6">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-100 to-indigo-100 dark:from-violet-900/30 dark:to-indigo-900/20 flex items-center justify-center animate-float">
                <MessagesSquare className="w-8 h-8 text-violet-500" />
              </div>
              <p className="text-sm font-semibold text-gray-600 dark:text-gray-300">
                Selecione uma conversa
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 max-w-xs">
                Escolha um contato à esquerda ou inicie uma nova conversa para começar o atendimento.
              </p>
            </div>
          ) : (
            <motion.div
              key={selectedId}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.25 }}
              className="flex-1 min-h-0 flex flex-col"
            >
              <ChatConversationHeader
                conv={selected}
                isAdmin={isAdmin}
                onBack={() => setSelectedId(null)}
                onTogglePanel={() => setPanelOpen((v) => !v)}
                panelOpen={panelOpen}
                onFacilito={() => setPanelOpen(true)}
                onAction={handleQuickAction}
              />

              {/* Mensagens */}
              <div
                className="flex-1 overflow-y-auto px-4 py-4"
                style={{
                  backgroundColor: "#FAFAFC",
                  backgroundImage:
                    "radial-gradient(rgba(99,102,241,0.05) 1px, transparent 1px)",
                  backgroundSize: "22px 22px",
                }}
              >
                <div className="dark:hidden" />
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
                      <div key={item.key} className="flex justify-center my-4">
                        <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 bg-white/80 dark:bg-gray-800/80 backdrop-blur px-3 py-1 rounded-full shadow-soft border border-gray-100 dark:border-gray-700/60">
                          {item.label}
                        </span>
                      </div>
                    ) : (
                      <MessageBubble
                        key={item.key}
                        msg={item.msg}
                        iso={item.iso}
                        isFirstInGroup={item.isFirstInGroup}
                        isLastInGroup={item.isLastInGroup}
                      />
                    )
                  )
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Composer */}
              <div className="border-t border-gray-200/70 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl p-3 flex-shrink-0">
                {selectedTemplate && (
                  <div className="mb-2 rounded-xl border border-violet-200 dark:border-violet-900 bg-violet-50 dark:bg-violet-950/30 p-3">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 text-sm font-medium text-violet-700 dark:text-violet-300">
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

                <div className="flex items-end gap-2 rounded-2xl border border-gray-200 dark:border-gray-700/70 bg-gray-50/80 dark:bg-gray-800/50 p-1.5 focus-within:border-violet-300 dark:focus-within:border-violet-700 focus-within:ring-2 focus-within:ring-violet-200/50 dark:focus-within:ring-violet-900/30 transition-all">
                  {/* Ações do composer */}
                  <div className="flex items-center">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 text-gray-500 hover:text-violet-600 flex-shrink-0"
                          title="Emoji"
                        >
                          <Smile className="w-5 h-5" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-56 p-2">
                        <div className="grid grid-cols-8 gap-0.5">
                          {QUICK_EMOJIS.map((e) => (
                            <button
                              key={e}
                              onClick={() => insertEmoji(e)}
                              className="text-lg rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 p-1 transition-colors"
                            >
                              {e}
                            </button>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-gray-500 hover:text-violet-600 flex-shrink-0"
                      onClick={handleMediaStandby}
                      disabled={sending}
                      title="Anexar arquivo (em breve)"
                    >
                      <Paperclip className="w-5 h-5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-gray-500 hover:text-violet-600 flex-shrink-0 hidden sm:inline-flex"
                      onClick={handleMediaStandby}
                      disabled={sending}
                      title="Enviar imagem (em breve)"
                    >
                      <ImageIcon className="w-5 h-5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-gray-500 hover:text-violet-600 flex-shrink-0 hidden sm:inline-flex"
                      onClick={handleMediaStandby}
                      disabled={sending}
                      title="Gravar áudio (em breve)"
                    >
                      <Mic className="w-5 h-5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-gray-500 hover:text-violet-600 flex-shrink-0"
                      onClick={() => setTemplateOpen(true)}
                      title="Enviar template"
                    >
                      <FileText className="w-5 h-5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-violet-500 hover:text-violet-600 flex-shrink-0"
                      onClick={() => setPanelOpen(true)}
                      title="Facilito IA"
                    >
                      <Sparkles className="w-5 h-5" />
                    </Button>
                  </div>

                  <Textarea
                    ref={textareaRef}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder="Digite uma mensagem..."
                    className="resize-none min-h-[40px] max-h-32 border-0 bg-transparent focus-visible:ring-0 shadow-none px-2"
                    rows={1}
                  />

                  <Button
                    onClick={handleSend}
                    disabled={!canSend}
                    className="flex-shrink-0 h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-500 hover:from-violet-600 hover:to-indigo-600 disabled:opacity-40 shadow-sm"
                    size="icon"
                  >
                    {sending ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Send className="w-5 h-5" />
                    )}
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </div>

        {/* Coluna direita: painel do lead (recolhível, lg+) */}
        <AnimatePresence>
          {panelOpen && selected && (
            <div className="hidden lg:flex">
              <LeadInsightsPanel
                conv={selected}
                isAdmin={isAdmin}
                onClose={() => setPanelOpen(false)}
                onUseSuggestion={(text) => {
                  setMessage(text);
                  if (textareaRef.current) textareaRef.current.focus();
                }}
              />
            </div>
          )}
        </AnimatePresence>
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
