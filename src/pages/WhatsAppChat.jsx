import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import WhatsAppTemplateSelector from "@/components/whatsapp/WhatsAppTemplateSelector";
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
  Bot,
  Clock,
  Headphones,
  CheckCircle2,
  ArrowRightLeft,
  Paperclip,
} from "lucide-react";
import { toast } from "sonner";

const API_BASE = "/api";

// Abas por status da conversa na WesccTech.
const STATUS_TABS = [
  { value: 0, label: "IA", icon: Bot, color: "violet" },
  { value: 1, label: "Fila", icon: Clock, color: "amber" },
  { value: 2, label: "Atendimento", icon: Headphones, color: "teal" },
  { value: 3, label: "Resolvido", icon: CheckCircle2, color: "gray" },
];

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

// Data de referência de uma conversa para ordenação/prévia.
function convDate(c) {
  return c.lastMessage?.utcDhMessage || c.lastSentMessageDate || c.lastReceivedMessageDate || c.utcDhStartChat;
}

function convName(c) {
  return c.contact?.name || c.contact?.secondaryName || c.description || c.contact?.number || "Contato";
}

function convNumber(c) {
  return c.contact?.number || c.secondaryDescription || "";
}

// Ícone de status de entrega para mensagens enviadas por nós.
function DeliveryStatus({ status }) {
  if (status === 3) return <CheckCheck className="w-3.5 h-3.5 text-sky-400" />;
  if (status === 2) return <CheckCheck className="w-3.5 h-3.5 text-gray-400" />;
  return <Check className="w-3.5 h-3.5 text-gray-400" />;
}

export default function WhatsAppChat() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [status, setStatus] = useState(2);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null); // conversa selecionada (item da lista)
  const [message, setMessage] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [templateVars, setTemplateVars] = useState({});
  const [templateOpen, setTemplateOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const fileInputRef = useRef(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferUserId, setTransferUserId] = useState("");
  const [transferSectorId, setTransferSectorId] = useState("");
  const [transferring, setTransferring] = useState(false);
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [finalizeMsg, setFinalizeMsg] = useState(true);
  const [finalizeResearch, setFinalizeResearch] = useState(true);
  const [finalizing, setFinalizing] = useState(false);
  const messagesEndRef = useRef(null);

  const selectedId = selected?.attendanceId || null;

  // Lista de conversas do status ativo. Polling: resolvidos 30s, demais 15s.
  const { data: listData, isLoading: convsLoading } = useQuery({
    queryKey: ["waChatConversations", status],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/whatsapp-chat/conversations?status=${status}&page=0`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error("Falha ao carregar conversas");
      return res.json();
    },
    refetchInterval: status === 3 ? 30000 : 15000,
    staleTime: 5000,
  });

  const conversations = useMemo(() => {
    const chats = Array.isArray(listData?.chats) ? [...listData.chats] : [];
    const term = search.trim().toLowerCase();
    const filtered = term
      ? chats.filter((c) => {
          const n = convName(c).toLowerCase();
          const num = convNumber(c).toLowerCase();
          return n.includes(term) || num.includes(term);
        })
      : chats;
    return filtered.sort((a, b) => new Date(convDate(b) || 0) - new Date(convDate(a) || 0));
  }, [listData, search]);

  // Thread da conversa aberta. Polling 10s.
  const { data: threadData, isLoading: threadLoading } = useQuery({
    queryKey: ["waChatThread", selectedId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/whatsapp-chat/conversations/${selectedId}/messages`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error("Falha ao carregar mensagens");
      return res.json();
    },
    enabled: !!selectedId,
    refetchInterval: selectedId ? 10000 : false,
  });

  const messages = useMemo(() => {
    const list = Array.isArray(threadData?.messages) ? threadData.messages : [];
    return list.filter((m) => !m.isSystemMessage && (m.text || "").length > 0);
  }, [threadData]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "auto" });
    }
  }, [messages.length, selectedId]);

  // Ao trocar de status, limpa a seleção que não pertence mais à lista.
  useEffect(() => {
    setSelected(null);
  }, [status]);

  const groupedMessages = useMemo(() => {
    const groups = [];
    let currentDay = null;
    for (const m of messages) {
      const iso = m.dhMessage || (m.unixTimeMessage ? new Date(m.unixTimeMessage * 1000).toISOString() : null);
      const label = dayLabel(iso);
      if (label !== currentDay) {
        currentDay = label;
        groups.push({ type: "day", label, key: `day-${label}-${m.IdMessage}` });
      }
      groups.push({ type: "msg", msg: m, iso, key: m.IdMessage });
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
        else if (i === 1) next[i] = selected ? convName(selected) : "";
        else next[i] = "";
      });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTemplate?.id, selectedId]);

  // Usuários (com seus setores) para a transferência. Carregado só quando o diálogo abre.
  const { data: waUsers = [], isLoading: usersLoading } = useQuery({
    queryKey: ["waChatUsers"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/whatsapp-chat/users`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Falha ao carregar atendentes");
      return res.json();
    },
    enabled: transferOpen,
    staleTime: 5 * 60 * 1000,
  });

  const transferUser = useMemo(
    () => (Array.isArray(waUsers) ? waUsers.find((u) => u.id === transferUserId) : null),
    [waUsers, transferUserId]
  );
  const transferSectors = transferUser?.sectors || [];

  const handleSelect = (conv) => {
    setSelected(conv);
    setMessage("");
    setSelectedTemplate(null);
  };

  const openTransfer = () => {
    setTransferUserId("");
    setTransferSectorId("");
    setTransferOpen(true);
  };

  const handleTransfer = async () => {
    if (!selectedId || !transferUserId || !transferSectorId) {
      toast.error("Selecione o atendente e o setor.");
      return;
    }
    setTransferring(true);
    try {
      const res = await fetch(`${API_BASE}/whatsapp-chat/conversations/${selectedId}/transfer`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ userId: transferUserId, sectorId: transferSectorId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.message || "Falha ao transferir.");
      toast.success("Conversa transferida.");
      setTransferOpen(false);
      setSelected(null);
      queryClient.invalidateQueries({ queryKey: ["waChatConversations"] });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setTransferring(false);
    }
  };

  const handleFinalize = async () => {
    if (!selectedId) return;
    setFinalizing(true);
    try {
      const res = await fetch(`${API_BASE}/whatsapp-chat/conversations/${selectedId}/finalize`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          sendMessageFinalized: finalizeMsg,
          sendResearchSatisfaction: finalizeResearch,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.message || "Falha ao finalizar.");
      toast.success("Conversa finalizada.");
      setFinalizeOpen(false);
      setSelected(null);
      queryClient.invalidateQueries({ queryKey: ["waChatConversations"] });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setFinalizing(false);
    }
  };

  const handleSend = async () => {
    if (!selected) return;
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
        `${API_BASE}/whatsapp-chat/conversations/${selectedId}/send`,
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            number: convNumber(selected),
            contactId: selected.contact?.id || undefined,
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
      toast.success("Mensagem enviada.");
      queryClient.invalidateQueries({ queryKey: ["waChatThread", selectedId] });
      queryClient.invalidateQueries({ queryKey: ["waChatConversations", status] });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSending(false);
    }
  };

  const MAX_MEDIA_BYTES = 16 * 1024 * 1024; // 16 MB (limite do WhatsApp)

  const handleFilePick = () => {
    if (uploadingMedia || sending) return;
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite reenviar o mesmo arquivo depois
    if (!file || !selected) return;

    if (file.size > MAX_MEDIA_BYTES) {
      toast.error("Arquivo muito grande. Máximo de 16 MB.");
      return;
    }

    setUploadingMedia(true);
    try {
      // Passo 1: pedir a URL de upload direto ao Object Storage.
      const urlRes = await fetch(
        `${API_BASE}/whatsapp-chat/conversations/${selectedId}/media/request-url`,
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            name: file.name,
            size: file.size,
            contentType: file.type,
          }),
        }
      );
      const urlData = await urlRes.json().catch(() => ({}));
      if (!urlRes.ok || !urlData.uploadURL) {
        throw new Error(urlData.message || "Falha ao preparar o upload.");
      }

      // Passo 2: PUT direto do arquivo na URL assinada (sem cabeçalho de auth).
      const putRes = await fetch(urlData.uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!putRes.ok) {
        throw new Error("Falha ao enviar o arquivo para o armazenamento.");
      }

      // Passo 3: disparar o envio da mídia na conversa.
      const sendRes = await fetch(
        `${API_BASE}/whatsapp-chat/conversations/${selectedId}/send-media`,
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            objectPath: urlData.objectPath,
            fileName: file.name,
            caption: message.trim() || undefined,
          }),
        }
      );
      const sendData = await sendRes.json().catch(() => ({}));
      if (!sendRes.ok || !sendData.success) {
        throw new Error(sendData.message || "Falha ao enviar a mídia.");
      }

      setMessage("");
      toast.success("Mídia enviada.");
      queryClient.invalidateQueries({ queryKey: ["waChatThread", selectedId] });
      queryClient.invalidateQueries({ queryKey: ["waChatConversations", status] });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setUploadingMedia(false);
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
          <MessagesSquare className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Chat WhatsApp</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">Conversas em tempo real</p>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex">
        {/* Coluna esquerda: abas + lista */}
        <div
          className={`w-full md:w-80 lg:w-96 flex-shrink-0 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex flex-col ${
            selectedId ? "hidden md:flex" : "flex"
          }`}
        >
          {/* Abas por status */}
          <div className="grid grid-cols-4 gap-1 p-2 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
            {STATUS_TABS.map((tab) => {
              const Icon = tab.icon;
              const active = tab.value === status;
              return (
                <button
                  key={tab.value}
                  onClick={() => setStatus(tab.value)}
                  className={`flex flex-col items-center gap-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                    active
                      ? "bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300"
                      : "text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800/40"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>

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
                    Nenhuma conversa aqui
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Não há conversas neste status no momento.
                  </p>
                </div>
              </div>
            ) : (
              conversations.map((conv) => {
                const active = conv.attendanceId === selectedId;
                const name = convName(conv);
                const preview = conv.textLastMessage || conv.lastMessage?.text || "";
                const unread = conv.countUnreadMessages || 0;
                return (
                  <button
                    key={conv.attendanceId}
                    onClick={() => handleSelect(conv)}
                    className={`w-full flex items-center gap-3 px-3 py-3 text-left border-b border-gray-100 dark:border-gray-800/60 transition-colors ${
                      active
                        ? "bg-teal-50 dark:bg-teal-950/40"
                        : "hover:bg-gray-50 dark:hover:bg-gray-800/40"
                    }`}
                  >
                    <div className="relative flex-shrink-0">
                      {conv.linkImage && !conv.linkImage.includes("avatar-default") ? (
                        <img src={conv.linkImage} alt={name} className="w-11 h-11 rounded-full object-cover" />
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
                          {formatListTime(convDate(conv))}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {preview || "—"}
                        </p>
                        {unread > 0 && (
                          <span className="flex-shrink-0 min-w-[18px] h-[18px] px-1.5 rounded-full bg-teal-500 text-white text-[10px] font-bold flex items-center justify-center">
                            {unread}
                          </span>
                        )}
                      </div>
                      {conv.currentUser?.name && (
                        <p className="text-[10px] text-gray-400 mt-0.5 truncate">
                          Responsável: {conv.currentUser.name}
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
            </div>
          ) : (
            <>
              {/* Header da conversa */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex-shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden flex-shrink-0"
                  onClick={() => setSelected(null)}
                >
                  <ArrowLeft className="w-5 h-5" />
                </Button>
                {selected.linkImage && !selected.linkImage.includes("avatar-default") ? (
                  <img src={selected.linkImage} alt={convName(selected)} className="w-10 h-10 rounded-full object-cover" />
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
                    {selected.currentSector?.description ? ` · ${selected.currentSector.description}` : ""}
                  </p>
                </div>
                {status !== 3 && (
                  <div className="ml-auto flex items-center gap-2 flex-shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={openTransfer}
                      className="gap-1.5"
                    >
                      <ArrowRightLeft className="w-4 h-4" />
                      <span className="hidden sm:inline">Transferir</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setFinalizeMsg(true);
                        setFinalizeResearch(true);
                        setFinalizeOpen(true);
                      }}
                      className="gap-1.5 text-green-700 border-green-200 hover:bg-green-50 dark:text-green-400 dark:border-green-900 dark:hover:bg-green-950"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span className="hidden sm:inline">Finalizar</span>
                    </Button>
                  </div>
                )}
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
                        className={`flex ${item.msg.isSentByMe ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[75%] rounded-2xl px-3 py-2 shadow-sm ${
                            item.msg.isSentByMe
                              ? "bg-teal-500 text-white rounded-br-sm"
                              : "bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-bl-sm"
                          }`}
                        >
                          <p className="text-sm whitespace-pre-wrap break-words">{item.msg.text}</p>
                          <div
                            className={`flex items-center gap-1 justify-end mt-1 ${
                              item.msg.isSentByMe ? "text-teal-100" : "text-gray-400"
                            }`}
                          >
                            <span className="text-[10px]">{formatTime(item.iso)}</span>
                            {item.msg.isSentByMe && <DeliveryStatus status={item.msg.statusMessage} />}
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
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,audio/*,video/*"
                    onChange={handleFileSelected}
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    className="flex-shrink-0"
                    onClick={handleFilePick}
                    disabled={uploadingMedia || sending}
                    title="Enviar arquivo"
                  >
                    {uploadingMedia ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Paperclip className="w-5 h-5" />
                    )}
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

      {/* Diálogo de transferência */}
      <Dialog open={transferOpen} onOpenChange={(o) => !transferring && setTransferOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transferir conversa</DialogTitle>
            <DialogDescription>
              Escolha o atendente e o setor de destino. A conversa sairá da sua lista.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Atendente
              </label>
              <Select
                value={transferUserId}
                onValueChange={(v) => {
                  setTransferUserId(v);
                  setTransferSectorId("");
                }}
                disabled={usersLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder={usersLoading ? "Carregando..." : "Selecione um atendente"} />
                </SelectTrigger>
                <SelectContent>
                  {waUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Setor
              </label>
              <Select
                value={transferSectorId}
                onValueChange={setTransferSectorId}
                disabled={!transferUserId || transferSectors.length === 0}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      !transferUserId
                        ? "Selecione um atendente primeiro"
                        : transferSectors.length === 0
                        ? "Atendente sem setores"
                        : "Selecione um setor"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {transferSectors.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferOpen(false)} disabled={transferring}>
              Cancelar
            </Button>
            <Button
              onClick={handleTransfer}
              disabled={transferring || !transferUserId || !transferSectorId}
              className="gap-1.5"
            >
              {transferring ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRightLeft className="w-4 h-4" />}
              Transferir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de finalização */}
      <Dialog open={finalizeOpen} onOpenChange={(o) => !finalizing && setFinalizeOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Finalizar conversa</DialogTitle>
            <DialogDescription>
              A conversa será encerrada e movida para Resolvidas.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={finalizeMsg}
                onChange={(e) => setFinalizeMsg(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300"
              />
              Enviar mensagem de encerramento
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={finalizeResearch}
                onChange={(e) => setFinalizeResearch(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300"
              />
              Enviar pesquisa de satisfação
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFinalizeOpen(false)} disabled={finalizing}>
              Cancelar
            </Button>
            <Button
              onClick={handleFinalize}
              disabled={finalizing}
              className="gap-1.5 bg-green-600 hover:bg-green-700 text-white"
            >
              {finalizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Finalizar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
