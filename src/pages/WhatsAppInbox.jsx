import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import WhatsAppTemplateSelector from "@/components/whatsapp/WhatsAppTemplateSelector";
import {
  MessageSquare,
  Send,
  Loader2,
  ArrowLeft,
  Search,
  Inbox,
  User,
  Check,
  CheckCheck,
  FileText,
  X,
  RefreshCw,
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

function initials(name, number) {
  const base = (name || "").trim();
  if (base) {
    const parts = base.split(/\s+/);
    return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase();
  }
  const digits = (number || "").replace(/\D/g, "");
  return digits.slice(-2) || "?";
}

function formatNumber(number) {
  const d = (number || "").replace(/\D/g, "");
  const local = d.startsWith("55") ? d.slice(2) : d;
  if (local.length >= 10) {
    const ddd = local.slice(0, 2);
    const rest = local.slice(2);
    const mid = rest.length > 8 ? rest.slice(0, 5) : rest.slice(0, 4);
    const end = rest.length > 8 ? rest.slice(5) : rest.slice(4);
    return `(${ddd}) ${mid}-${end}`;
  }
  return number || "";
}

export default function WhatsAppInbox() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const backfilledRef = useRef(new Set());

  // Template (usado principalmente quando a janela de 24h está fechada)
  const [templateSelectorOpen, setTemplateSelectorOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [templateVars, setTemplateVars] = useState({});

  const messagesEndRef = useRef(null);
  const threadRef = useRef(null);

  useQuery({ queryKey: ["currentUser"], queryFn: () => base44.auth.me() });

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data: conversations = [], isLoading: convsLoading } = useQuery({
    queryKey: ["waInboxConversations", debouncedSearch],
    queryFn: async () => {
      const res = await fetch(
        `${API_BASE}/whatsapp-inbox/conversations?search=${encodeURIComponent(debouncedSearch)}`,
        { headers: authHeaders() }
      );
      if (!res.ok) throw new Error("Falha ao carregar conversas.");
      return res.json();
    },
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
  });

  const selectedConv = useMemo(
    () => conversations.find((c) => c.id === selectedId) || null,
    [conversations, selectedId]
  );

  const { data: threadData, isFetching: threadFetching } = useQuery({
    queryKey: ["waInboxThread", selectedId],
    queryFn: async () => {
      const doBackfill = selectedId && !backfilledRef.current.has(selectedId);
      const url = `${API_BASE}/whatsapp-inbox/conversations/${selectedId}/messages${
        doBackfill ? "?backfill=1" : ""
      }`;
      const res = await fetch(url, { headers: authHeaders() });
      if (!res.ok) throw new Error("Falha ao carregar mensagens.");
      if (doBackfill) backfilledRef.current.add(selectedId);
      return res.json();
    },
    enabled: !!selectedId,
    refetchInterval: 4000,
    refetchIntervalInBackground: true,
  });

  const messages = threadData?.messages || [];

  // Marca como lida ao abrir e sempre que chegar algo novo
  const markRead = async (id) => {
    try {
      await fetch(`${API_BASE}/whatsapp-inbox/conversations/${id}/read`, {
        method: "POST",
        headers: authHeaders(),
      });
      queryClient.invalidateQueries({ queryKey: ["waInboxConversations"] });
    } catch {
      /* silencioso */
    }
  };

  const handleSelect = (conv) => {
    setSelectedId(conv.id);
    setMessage("");
    setSelectedTemplate(null);
    if (conv.unread_count > 0) markRead(conv.id);
  };

  useEffect(() => {
    if (selectedConv && selectedConv.unread_count > 0) {
      markRead(selectedConv.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConv?.unread_count]);

  // Auto-scroll para o fim quando as mensagens mudam
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "auto" });
    }
  }, [messages.length, selectedId]);

  // Agrupa por dia
  const groupedMessages = useMemo(() => {
    const groups = [];
    let currentDay = null;
    for (const m of messages) {
      const label = dayLabel(m.sent_at);
      if (label !== currentDay) {
        currentDay = label;
        groups.push({ type: "day", label, key: `day-${label}-${m.id}` });
      }
      groups.push({ type: "msg", msg: m, key: m.id });
    }
    return groups;
  }, [messages]);

  const templateBody = useMemo(() => {
    if (!selectedTemplate) return null;
    const t = selectedTemplate;
    const body =
      t.dynamicComponents?.find((c) => c.type === "BODY") ||
      t.staticComponents?.find((c) => c.type === "BODY");
    return body?.text || t.description || t.name || null;
  }, [selectedTemplate]);

  const templateVarIndexes = useMemo(() => {
    if (!templateBody) return [];
    const found = [...templateBody.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => parseInt(m[1], 10));
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
        else if (i === 1) next[i] = selectedConv?.name || "";
        else next[i] = "";
      });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTemplate?.id, selectedConv?.name]);

  const handleSend = async () => {
    if (!selectedConv) return;
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
        `${API_BASE}/whatsapp-inbox/conversations/${selectedConv.id}/reply`,
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
      queryClient.invalidateQueries({ queryKey: ["waInboxThread", selectedConv.id] });
      queryClient.invalidateQueries({ queryKey: ["waInboxConversations"] });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="h-[calc(100vh-0px)] bg-gray-50 dark:bg-gray-950 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex-shrink-0">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="flex-shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center shadow-md">
          <Inbox className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Caixa de Entrada WhatsApp</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">Conversas em tempo real</p>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex">
        {/* Lista de conversas */}
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
                    As conversas aparecem aqui conforme mensagens são enviadas ou recebidas.
                  </p>
                </div>
              </div>
            ) : (
              conversations.map((conv) => {
                const active = conv.id === selectedId;
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
                      {conv.avatar_url ? (
                        <img
                          src={conv.avatar_url}
                          alt={conv.name || conv.wa_number}
                          className="w-11 h-11 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-11 h-11 rounded-full bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center">
                          <span className="text-white text-sm font-semibold">
                            {initials(conv.name, conv.wa_number)}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
                          {conv.name || formatNumber(conv.wa_number)}
                        </span>
                        <span className="text-[11px] text-gray-400 flex-shrink-0">
                          {formatListTime(conv.last_message_at)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {conv.last_direction === "out" && (
                            <span className="text-gray-400 mr-1">Você:</span>
                          )}
                          {conv.last_message_text || "—"}
                        </span>
                        {conv.unread_count > 0 && (
                          <span className="flex-shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-teal-500 text-white text-[11px] font-semibold flex items-center justify-center">
                            {conv.unread_count}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Thread */}
        <div className={`flex-1 min-w-0 flex flex-col bg-gray-100 dark:bg-gray-950 ${selectedId ? "flex" : "hidden md:flex"}`}>
          {!selectedConv ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
              <div className="w-20 h-20 rounded-3xl bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
                <MessageSquare className="w-10 h-10 text-teal-400" />
              </div>
              <div>
                <p className="text-base font-semibold text-gray-700 dark:text-gray-300">
                  Selecione uma conversa
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Escolha um contato à esquerda para ver as mensagens.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Cabeçalho da conversa */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex-shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden flex-shrink-0"
                  onClick={() => setSelectedId(null)}
                >
                  <ArrowLeft className="w-5 h-5" />
                </Button>
                {selectedConv.avatar_url ? (
                  <img
                    src={selectedConv.avatar_url}
                    alt={selectedConv.name || selectedConv.wa_number}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center">
                    <span className="text-white text-sm font-semibold">
                      {initials(selectedConv.name, selectedConv.wa_number)}
                    </span>
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">
                    {selectedConv.name || formatNumber(selectedConv.wa_number)}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {formatNumber(selectedConv.wa_number)}
                    {selectedConv.vendedor_nome && (
                      <>
                        {" · "}
                        <span className="inline-flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {selectedConv.vendedor_nome}
                        </span>
                      </>
                    )}
                  </p>
                </div>
                {threadFetching && (
                  <RefreshCw className="w-4 h-4 text-gray-300 animate-spin flex-shrink-0" />
                )}
              </div>

              {/* Mensagens */}
              <div
                ref={threadRef}
                className="flex-1 overflow-y-auto px-4 py-4 space-y-1"
                style={{
                  backgroundImage:
                    "radial-gradient(circle at 1px 1px, rgba(0,0,0,0.03) 1px, transparent 0)",
                  backgroundSize: "20px 20px",
                }}
              >
                {groupedMessages.map((item) =>
                  item.type === "day" ? (
                    <div key={item.key} className="flex justify-center my-3">
                      <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 bg-white/80 dark:bg-gray-800/80 px-3 py-1 rounded-full shadow-sm">
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
                          className={`flex items-center justify-end gap-1 mt-1 ${
                            item.msg.direction === "out"
                              ? "text-teal-100"
                              : "text-gray-400"
                          }`}
                        >
                          <span className="text-[10px]">{formatTime(item.msg.sent_at)}</span>
                          {item.msg.direction === "out" &&
                            (item.msg.status === "read" ? (
                              <CheckCheck className="w-3.5 h-3.5" />
                            ) : (
                              <Check className="w-3.5 h-3.5" />
                            ))}
                        </div>
                      </div>
                    </div>
                  )
                )}
                {messages.length === 0 && !threadFetching && (
                  <div className="flex items-center justify-center py-12 text-sm text-gray-400">
                    Nenhuma mensagem nesta conversa ainda.
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Composer */}
              <div className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 flex-shrink-0 space-y-2">
                {selectedTemplate && (
                  <div className="flex items-start justify-between gap-2 p-2.5 rounded-lg border border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-950/40">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-teal-600 dark:text-teal-400 flex-shrink-0" />
                        <span className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
                          {selectedTemplate.description || selectedTemplate.name || selectedTemplate.id}
                        </span>
                        <Badge variant="secondary" className="text-[10px]">Template</Badge>
                      </div>
                      {templateBody && (
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 line-clamp-2 whitespace-pre-wrap">
                          {templateBody}
                        </p>
                      )}
                      {templateVarIndexes.length > 0 && (
                        <div className="mt-2 space-y-1.5">
                          {templateVarIndexes.map((i) => (
                            <div key={i}>
                              <Label className="text-[11px]">
                                {i === 1 ? "Variável 1 — Cliente" : `Variável ${i}`}
                              </Label>
                              <Input
                                value={templateVars[i] || ""}
                                onChange={(e) =>
                                  setTemplateVars((prev) => ({ ...prev, [i]: e.target.value }))
                                }
                                placeholder={`Valor para {{${i}}}`}
                                className="mt-0.5 h-8 text-sm"
                              />
                            </div>
                          ))}
                        </div>
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
                )}
                <div className="flex items-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="flex-shrink-0"
                    title="Enviar template (janela de 24h fechada)"
                    onClick={() => setTemplateSelectorOpen(true)}
                  >
                    <FileText className="w-5 h-5 text-gray-500" />
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
                    rows={1}
                    className="resize-none min-h-[42px] max-h-32 flex-1"
                  />
                  <Button
                    className="flex-shrink-0 bg-teal-600 hover:bg-teal-700 dark:bg-teal-700 dark:hover:bg-teal-600 h-[42px] w-[42px] p-0"
                    disabled={sending || (!message.trim() && !selectedTemplate)}
                    onClick={handleSend}
                  >
                    {sending ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Send className="w-5 h-5" />
                    )}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <WhatsAppTemplateSelector
        open={templateSelectorOpen}
        onOpenChange={setTemplateSelectorOpen}
        selectedTemplateId={selectedTemplate?.id}
        onSelect={(t) => setSelectedTemplate(t)}
        accentColor="green"
      />
    </div>
  );
}
