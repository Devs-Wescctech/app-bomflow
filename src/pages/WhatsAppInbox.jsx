import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { base44 } from "@/api/base44Client";
import { attendanceApi } from "@/api/attendanceApi";
import { useAttendanceSSE } from "@/hooks/useAttendanceSSE";
import {
  MessageSquare,
  Send,
  Loader2,
  MessagesSquare,
  FileText,
  X,
  Search,
  Check,
  CheckCheck,
  AlertCircle,
  UserPlus,
  UserCheck,
  Archive,
  RotateCcw,
  Clock,
} from "lucide-react";
import { toast } from "sonner";

// ---------- helpers ----------

const STATUS_FILTERS = [
  { key: "", label: "Todas" },
  { key: "pendente", label: "Pendentes" },
  { key: "aberta", label: "Abertas" },
  { key: "fechada", label: "Fechadas" },
];

const STATUS_BADGE = {
  pendente: { label: "Pendente", className: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400" },
  aberta: { label: "Aberta", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400" },
  fechada: { label: "Fechada", className: "bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300" },
};

function formatPhone(phone) {
  const d = String(phone || "").replace(/\D/g, "");
  if (d.length === 13) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.length === 12) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return phone || "";
}

function timeLabel(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function listTimeLabel(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return timeLabel(iso);
  const yest = new Date(now);
  yest.setDate(now.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function dayLabel(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Hoje";
  const yest = new Date(now);
  yest.setDate(now.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

function initialsOf(name, phone) {
  const src = (name || "").trim();
  if (src) {
    const parts = src.split(/\s+/);
    return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
  }
  const d = String(phone || "").replace(/\D/g, "");
  return d.slice(-2) || "?";
}

// Ícone de status de entrega estilo WhatsApp.
function DeliveryStatus({ status }) {
  if (status === "failed") return <AlertCircle className="w-3.5 h-3.5 text-red-500" />;
  if (status === "read") return <CheckCheck className="w-3.5 h-3.5 text-sky-400" />;
  if (status === "delivered") return <CheckCheck className="w-3.5 h-3.5 opacity-70" />;
  if (status === "sent") return <Check className="w-3.5 h-3.5 opacity-70" />;
  return <Clock className="w-3 h-3 opacity-50" />;
}

function extractTemplateBody(t) {
  if (!t) return null;
  const fromComponents = (list) => {
    const body = Array.isArray(list) ? list.find((c) => c.type === "BODY" || c.type === "body") : null;
    return body?.text || null;
  };
  return (
    fromComponents(t.dynamicComponents) ||
    fromComponents(t.staticComponents) ||
    fromComponents(t.components) ||
    t.body || t.text || t.message || t.content ||
    t.template?.body || t.template?.text ||
    t.quickAnswerBody || t.quickAnswer?.body ||
    t.description || t.name || null
  );
}

function templateTitle(t) {
  return t?.description || t?.name || t?.title || t?.id || "Template";
}

// ---------- página ----------

export default function WhatsAppInbox() {
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => base44.auth.me(),
  });

  // Mesma regra do backend (resolveAttendancePermissions): admin ou supervisor
  // (qualquer tipo *_supervisor) respondem/atribuem qualquer conversa.
  const agentType = user?.agent?.agentType;
  const replyAny =
    user?.role === "admin" ||
    agentType === "admin" ||
    agentType === "supervisor" ||
    (typeof agentType === "string" && agentType.endsWith("_supervisor"));
  const myId = user?.agent?.id || user?.id;

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateSearch, setTemplateSearch] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [templateVars, setTemplateVars] = useState({});
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  // ----- conversas -----
  const { data: conversations = [], isLoading: loadingList } = useQuery({
    queryKey: ["attConversations", debouncedSearch, statusFilter],
    queryFn: () =>
      attendanceApi.listConversations({ search: debouncedSearch, status: statusFilter, limit: 300 }),
  });

  const selected = useMemo(
    () => conversations.find((c) => c.id === selectedId) || null,
    [conversations, selectedId]
  );

  // ----- thread -----
  const { data: thread, isLoading: loadingThread } = useQuery({
    queryKey: ["attMessages", selectedId],
    queryFn: () => attendanceApi.getMessages(selectedId),
    enabled: !!selectedId,
  });
  const messages = thread?.messages || [];
  const conversation = thread?.conversation || selected;

  // ----- templates da conexão da conversa -----
  const { data: templates = [], isLoading: loadingTemplates } = useQuery({
    queryKey: ["attTemplates", selectedId],
    queryFn: () => attendanceApi.getTemplates(selectedId),
    enabled: !!selectedId && templateOpen,
    staleTime: 5 * 60_000,
  });

  // ----- agentes (para atribuir e exibir nomes) -----
  const { data: agents = [] } = useQuery({
    queryKey: ["attAgents"],
    queryFn: () => base44.entities.Agent.list(),
    staleTime: 5 * 60_000,
  });
  const activeAgents = useMemo(
    () => agents.filter((a) => a.active !== false).sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    [agents]
  );
  const agentNameById = useMemo(() => {
    const map = {};
    for (const a of agents) map[a.id] = a.name;
    return map;
  }, [agents]);

  // ----- SSE tempo real -----
  useAttendanceSSE({
    enabled: !!user,
    onMessage: (data) => {
      queryClient.invalidateQueries({ queryKey: ["attConversations"] });
      if (data?.conversationId && data.conversationId === selectedId) {
        queryClient.invalidateQueries({ queryKey: ["attMessages", data.conversationId] });
      }
    },
    onConversation: () => {
      queryClient.invalidateQueries({ queryKey: ["attConversations"] });
      if (selectedId) queryClient.invalidateQueries({ queryKey: ["attMessages", selectedId] });
    },
  });

  // Marca como lida ao abrir.
  useEffect(() => {
    if (!selectedId) return;
    attendanceApi
      .markRead(selectedId)
      .then(() => queryClient.invalidateQueries({ queryKey: ["attConversations"] }))
      .catch(() => {});
    setSelectedTemplate(null);
    setTemplateVars({});
    setMessage("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, selectedId]);

  // ----- template: corpo, variáveis e preview -----
  const templateBody = extractTemplateBody(selectedTemplate);
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
        else if (i === 1) next[i] = conversation?.contact_name || "";
        else if (i === 2) next[i] = user?.full_name || "";
        else next[i] = "";
      });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTemplate?.id]);

  const templatePreview = useMemo(() => {
    if (!templateBody) return "";
    return templateBody.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, idx) => {
      const v = String(templateVars[parseInt(idx, 10)] || "").trim();
      return v || `{{${idx}}}`;
    });
  }, [templateBody, templateVars]);

  const filteredTemplates = useMemo(() => {
    const term = templateSearch.trim().toLowerCase();
    if (!term) return templates;
    return templates.filter((t) =>
      `${templateTitle(t)} ${extractTemplateBody(t) || ""}`.toLowerCase().includes(term)
    );
  }, [templates, templateSearch]);

  // ----- permissões de resposta -----
  const isMine = !!(conversation?.assigned_user_id && conversation.assigned_user_id === myId);
  const isUnassigned = !!conversation && !conversation.assigned_user_id;
  const canReply = !!conversation && (replyAny || isMine);

  // ----- ações -----
  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ["attConversations"] });
    if (selectedId) queryClient.invalidateQueries({ queryKey: ["attMessages", selectedId] });
  };

  const handleClaim = async () => {
    try {
      await attendanceApi.claim(selectedId);
      toast.success("Conversa assumida");
      refreshAll();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const handleAssign = async (userId) => {
    try {
      await attendanceApi.assign(selectedId, userId);
      toast.success(userId ? "Conversa atribuída" : "Atribuição removida");
      refreshAll();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const handleSetStatus = async (status) => {
    try {
      await attendanceApi.setStatus(selectedId, status);
      toast.success(status === "fechada" ? "Conversa fechada" : "Conversa reaberta");
      refreshAll();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const canSend =
    canReply &&
    !sending &&
    (selectedTemplate
      ? templateVarIndexes.every((i) => String(templateVars[i] || "").trim())
      : message.trim().length > 0);

  const handleSend = async () => {
    if (!selectedId || sending || !canReply) return;

    if (selectedTemplate) {
      if (templateVarIndexes.some((i) => !String(templateVars[i] || "").trim())) {
        toast.error("Preencha todas as variáveis do template.");
        return;
      }
      setSending(true);
      try {
        const templateComponents =
          templateVarIndexes.length > 0
            ? [
                {
                  type: "BODY",
                  parameters: templateVarIndexes.map((i) => ({
                    type: "text",
                    text: String(templateVars[i] || "").trim(),
                  })),
                },
              ]
            : [];
        await attendanceApi.sendTemplate(selectedId, {
          templateId: selectedTemplate.id,
          templateComponents,
          contentPreview: templatePreview,
        });
        setSelectedTemplate(null);
        setTemplateVars({});
        refreshAll();
      } catch (e) {
        toast.error(e.message);
      } finally {
        setSending(false);
      }
      return;
    }

    const text = message.trim();
    if (!text) return;
    setSending(true);
    try {
      await attendanceApi.sendText(selectedId, text);
      setMessage("");
      refreshAll();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ----- agrupamento por dia -----
  const groupedMessages = useMemo(() => {
    const groups = [];
    let currentDay = null;
    for (const m of messages) {
      const day = new Date(m.sent_at).toDateString();
      if (day !== currentDay) {
        currentDay = day;
        groups.push({ day: m.sent_at, items: [] });
      }
      groups[groups.length - 1].items.push(m);
    }
    return groups;
  }, [messages]);

  return (
    <div className="h-[calc(100vh-4rem)] flex bg-gray-50 dark:bg-gray-950 overflow-hidden">
      {/* ===== Lista de conversas ===== */}
      <aside
        className={`w-full sm:w-[360px] flex-shrink-0 border-r border-gray-200 dark:border-gray-800 flex-col bg-white dark:bg-gray-900 min-h-0 ${
          selectedId ? "hidden sm:flex" : "flex"
        }`}
      >
        <div className="p-4 border-b border-gray-200 dark:border-gray-800 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center shadow">
              <MessagesSquare className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-gray-900 dark:text-white leading-tight">Chat WhatsApp</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">Atendimento em tempo real</p>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome ou telefone…"
              className="pl-9 rounded-xl"
            />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setStatusFilter(f.key)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  statusFilter === f.key
                    ? "bg-teal-600 text-white"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {loadingList ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-teal-500" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <MessageSquare className="w-10 h-10 text-gray-300 dark:text-gray-700 mb-3" />
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Nenhuma conversa encontrada. As conversas aparecem aqui quando um cliente envia mensagem para uma
                conexão ativa.
              </p>
            </div>
          ) : (
            conversations.map((c) => {
              const badge = STATUS_BADGE[c.status] || STATUS_BADGE.pendente;
              const active = c.id === selectedId;
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={`w-full flex items-start gap-3 px-4 py-3 text-left border-b border-gray-100 dark:border-gray-800/60 transition-colors ${
                    active ? "bg-teal-50 dark:bg-teal-900/20" : "hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  }`}
                >
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
                    {initialsOf(c.contact_name, c.phone)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-sm text-gray-900 dark:text-white truncate">
                        {c.contact_name || formatPhone(c.phone)}
                      </p>
                      <span className="text-[11px] text-gray-400 flex-shrink-0">
                        {listTimeLabel(c.last_message_at)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {c.last_message_text || formatPhone(c.phone)}
                      </p>
                      {Number(c.unread_count) > 0 && (
                        <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-teal-600 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                          {c.unread_count}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${badge.className}`}>
                        {badge.label}
                      </span>
                      {c.connection_name && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                          {c.connection_name}
                        </span>
                      )}
                      {c.assigned_user_id && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 truncate max-w-[120px]">
                          {c.assigned_user_id === myId ? "Você" : agentNameById[c.assigned_user_id] || "Atribuída"}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* ===== Painel da conversa ===== */}
      <main className={`flex-1 flex-col min-w-0 min-h-0 ${selectedId ? "flex" : "hidden sm:flex"}`}>
        {!selectedId ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-teal-500/10 to-emerald-500/10 flex items-center justify-center mb-4">
              <MessagesSquare className="w-8 h-8 text-teal-500" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Selecione uma conversa</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-sm">
              Escolha uma conversa na lista ao lado para visualizar e responder as mensagens em tempo real.
            </p>
          </div>
        ) : (
          <>
            {/* Cabeçalho */}
            <header className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex-wrap">
              <button className="sm:hidden text-gray-500" onClick={() => setSelectedId(null)}>
                <X className="w-5 h-5" />
              </button>
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
                {initialsOf(conversation?.contact_name, conversation?.phone)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-gray-900 dark:text-white truncate">
                  {conversation?.contact_name || formatPhone(conversation?.phone)}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {formatPhone(conversation?.phone)}
                  {conversation?.connection_name || selected?.connection_name
                    ? ` · ${conversation?.connection_name || selected?.connection_name}`
                    : ""}
                  {conversation?.assigned_user_id
                    ? ` · ${
                        conversation.assigned_user_id === myId
                          ? "Atribuída a você"
                          : agentNameById[conversation.assigned_user_id] || "Atribuída"
                      }`
                    : " · Não atribuída"}
                </p>
              </div>
              {conversation?.status && (
                <Badge className={`${(STATUS_BADGE[conversation.status] || STATUS_BADGE.pendente).className} border-0`}>
                  {(STATUS_BADGE[conversation.status] || STATUS_BADGE.pendente).label}
                </Badge>
              )}

              {isUnassigned && (
                <Button size="sm" onClick={handleClaim} className="bg-teal-600 hover:bg-teal-700 text-white rounded-lg">
                  <UserPlus className="w-4 h-4 mr-1.5" />
                  Assumir
                </Button>
              )}
              {replyAny && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline" className="rounded-lg">
                      <UserCheck className="w-4 h-4 mr-1.5" />
                      Atribuir
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64 max-h-80 overflow-y-auto">
                    <DropdownMenuLabel>Atribuir a…</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {conversation?.assigned_user_id && (
                      <DropdownMenuItem onClick={() => handleAssign(null)} className="text-red-600">
                        Remover atribuição
                      </DropdownMenuItem>
                    )}
                    {activeAgents.map((a) => (
                      <DropdownMenuItem key={a.id} onClick={() => handleAssign(a.id)}>
                        {a.name}
                        {a.id === conversation?.assigned_user_id && (
                          <Check className="w-4 h-4 ml-auto text-teal-600" />
                        )}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              {(replyAny || isMine) &&
                (conversation?.status !== "fechada" ? (
                  <Button size="sm" variant="outline" className="rounded-lg" onClick={() => handleSetStatus("fechada")}>
                    <Archive className="w-4 h-4 mr-1.5" />
                    Fechar
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" className="rounded-lg" onClick={() => handleSetStatus("aberta")}>
                    <RotateCcw className="w-4 h-4 mr-1.5" />
                    Reabrir
                  </Button>
                ))}
            </header>

            {/* Mensagens */}
            <div className="flex-1 overflow-y-auto min-h-0 px-4 py-4 space-y-4 bg-[#efeae2] dark:bg-gray-950">
              {loadingThread ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-teal-500" />
                </div>
              ) : messages.length === 0 ? (
                <p className="text-center text-sm text-gray-500 py-12">Nenhuma mensagem nesta conversa ainda.</p>
              ) : (
                groupedMessages.map((group) => (
                  <div key={group.day} className="space-y-1.5">
                    <div className="flex justify-center">
                      <span className="px-3 py-1 rounded-full bg-white/80 dark:bg-gray-800 text-[11px] text-gray-500 dark:text-gray-400 shadow-sm">
                        {dayLabel(group.day)}
                      </span>
                    </div>
                    {group.items.map((m) => {
                      const out = m.direction === "out";
                      return (
                        <div key={m.id} className={`flex ${out ? "justify-end" : "justify-start"}`}>
                          <div
                            className={`max-w-[75%] rounded-2xl px-3.5 py-2 shadow-sm text-sm whitespace-pre-wrap break-words ${
                              out
                                ? "bg-[#d9fdd3] dark:bg-teal-900/60 text-gray-900 dark:text-gray-100 rounded-br-md"
                                : "bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-bl-md"
                            }`}
                          >
                            {m.type === "template" && (
                              <span className="flex items-center gap-1 text-[10px] font-medium text-teal-700 dark:text-teal-400 mb-0.5">
                                <FileText className="w-3 h-3" /> Template
                              </span>
                            )}
                            {m.content}
                            <span className="flex items-center gap-1 justify-end mt-1 text-[10px] text-gray-500 dark:text-gray-400">
                              {out && m.user_id && agentNameById[m.user_id] && (
                                <span className="mr-1">
                                  {m.user_id === myId ? "Você" : agentNameById[m.user_id]}
                                </span>
                              )}
                              {timeLabel(m.sent_at)}
                              {out && <DeliveryStatus status={m.status} />}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Composer */}
            <div className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
              {!canReply ? (
                <div className="flex items-center justify-center gap-2 py-2 text-sm text-gray-500 dark:text-gray-400 flex-wrap">
                  <UserPlus className="w-4 h-4" />
                  Assuma a conversa para responder.
                  {isUnassigned && (
                    <Button
                      size="sm"
                      onClick={handleClaim}
                      className="ml-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg"
                    >
                      Assumir conversa
                    </Button>
                  )}
                </div>
              ) : (
                <>
                  {selectedTemplate && (
                    <div className="mb-2 rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50/60 dark:bg-teal-900/20 p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-xs font-semibold text-teal-700 dark:text-teal-400">
                          <FileText className="w-3.5 h-3.5" />
                          {templateTitle(selectedTemplate)}
                        </span>
                        <button
                          onClick={() => {
                            setSelectedTemplate(null);
                            setTemplateVars({});
                          }}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      {templateVarIndexes.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {templateVarIndexes.map((i) => (
                            <Input
                              key={i}
                              value={templateVars[i] || ""}
                              onChange={(e) => setTemplateVars((p) => ({ ...p, [i]: e.target.value }))}
                              placeholder={`Variável {{${i}}}`}
                              className="h-8 text-sm rounded-lg bg-white dark:bg-gray-800"
                            />
                          ))}
                        </div>
                      )}
                      <p className="text-xs text-gray-600 dark:text-gray-300 whitespace-pre-wrap border-t border-teal-100 dark:border-teal-800 pt-2">
                        {templatePreview}
                      </p>
                    </div>
                  )}
                  <div className="flex items-end gap-2">
                    <Popover open={templateOpen} onOpenChange={setTemplateOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="icon" className="rounded-xl flex-shrink-0" title="Enviar template">
                          <FileText className="w-4 h-4" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="start" side="top" className="w-80 p-0">
                        <div className="p-2 border-b border-gray-100 dark:border-gray-800">
                          <Input
                            value={templateSearch}
                            onChange={(e) => setTemplateSearch(e.target.value)}
                            placeholder="Buscar template…"
                            className="h-8 text-sm rounded-lg"
                          />
                        </div>
                        <div className="max-h-72 overflow-y-auto">
                          {loadingTemplates ? (
                            <div className="flex items-center justify-center py-8">
                              <Loader2 className="w-5 h-5 animate-spin text-teal-500" />
                            </div>
                          ) : filteredTemplates.length === 0 ? (
                            <p className="text-xs text-gray-500 text-center py-6 px-4">
                              Nenhum template disponível nesta conexão.
                            </p>
                          ) : (
                            filteredTemplates.map((t) => (
                              <button
                                key={t.id}
                                onClick={() => {
                                  setSelectedTemplate(t);
                                  setTemplateOpen(false);
                                }}
                                className="w-full text-left px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800 border-b border-gray-50 dark:border-gray-800/60"
                              >
                                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                  {templateTitle(t)}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mt-0.5">
                                  {extractTemplateBody(t)}
                                </p>
                              </button>
                            ))
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>
                    <Textarea
                      ref={textareaRef}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={selectedTemplate ? "O template acima será enviado" : "Digite uma mensagem…"}
                      disabled={!!selectedTemplate}
                      rows={1}
                      className="flex-1 resize-none rounded-xl min-h-[40px] max-h-32"
                    />
                    <Button
                      onClick={handleSend}
                      disabled={!canSend}
                      className="rounded-xl bg-teal-600 hover:bg-teal-700 text-white flex-shrink-0"
                      size="icon"
                    >
                      {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
