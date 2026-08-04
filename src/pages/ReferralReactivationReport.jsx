import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { buscarClienteERP } from "@/api/erpService";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  RefreshCw,
  Search,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Loader2,
  Filter,
  Pencil,
  Save,
  X,
  CheckCircle,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { format, parseISO, startOfDay, endOfDay, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { createPageUrl } from "@/utils";
import { extractApiError } from "@/utils/apiError";

const ITEMS_PER_PAGE = 25;

const formatCPF = (cpf) => {
  if (!cpf) return "-";
  const clean = String(cpf).replace(/\D/g, '').padStart(11, '0');
  return clean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
};

const formatCPFInput = (value) => {
  const clean = String(value || '').replace(/\D/g, '').slice(0, 11);
  if (clean.length <= 3) return clean;
  if (clean.length <= 6) return `${clean.slice(0, 3)}.${clean.slice(3)}`;
  if (clean.length <= 9) return `${clean.slice(0, 3)}.${clean.slice(3, 6)}.${clean.slice(6)}`;
  return `${clean.slice(0, 3)}.${clean.slice(3, 6)}.${clean.slice(6, 9)}-${clean.slice(9)}`;
};

const formatPhoneInput = (value) => {
  const clean = String(value || '').replace(/\D/g, '').slice(0, 11);
  if (clean.length <= 2) return clean;
  if (clean.length <= 6) return `(${clean.slice(0, 2)}) ${clean.slice(2)}`;
  if (clean.length <= 10) return `(${clean.slice(0, 2)}) ${clean.slice(2, 6)}-${clean.slice(6)}`;
  return `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7)}`;
};

const formatPhone = (phone) => {
  if (!phone) return "-";
  const clean = String(phone).replace(/\D/g, '');
  if (clean.length === 11) return clean.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  if (clean.length === 10) return clean.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  return phone;
};

const formatDateTime = (value) => {
  if (!value) return "-";
  try {
    const d = typeof value === 'string' ? parseISO(value) : new Date(value);
    return format(d, "dd/MM/yyyy HH:mm", { locale: ptBR });
  } catch {
    return "-";
  }
};

const PERIOD_SHORTCUTS = [
  { label: "Hoje", value: "today" },
  { label: "Últ. 7 dias", value: "7d" },
  { label: "Últ. 30 dias", value: "30d" },
  { label: "Personalizado", value: "custom" },
];

const getDateRange = (shortcut) => {
  const today = new Date();
  if (shortcut === "today") return { start: startOfDay(today), end: endOfDay(today) };
  if (shortcut === "7d") return { start: startOfDay(subDays(today, 6)), end: endOfDay(today) };
  if (shortcut === "30d") return { start: startOfDay(subDays(today, 29)), end: endOfDay(today) };
  return null;
};

export default function ReferralReactivationReport() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [shortcut, setShortcut] = useState("30d");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [selectedAgent, setSelectedAgent] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [appliedFilters, setAppliedFilters] = useState({
    shortcut: "30d",
    customStart: "",
    customEnd: "",
    agentId: "all",
  });

  const [editingRow, setEditingRow] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editError, setEditError] = useState("");
  const [searchingERP, setSearchingERP] = useState(false);
  const [erpFound, setErpFound] = useState(null);
  const [deletingRow, setDeletingRow] = useState(null);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const currentAgent = user?.agent;
  const currentAgentType = currentAgent?.agentType || currentAgent?.agent_type;
  const isSupervisorOrAdmin =
    currentAgentType === 'indicacoes_supervisor' ||
    currentAgentType === 'indicacoes_admin' ||
    currentAgentType === 'admin' ||
    user?.role === 'admin';
  const isAtendente = currentAgentType === 'indicacoes_atendente';

  const { data: agents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: () => base44.entities.Agent.list(),
    enabled: !!user && isSupervisorOrAdmin,
  });

  const atendentesList = useMemo(() =>
    agents
      .filter((a) => (a.agentType || a.agent_type) === 'indicacoes_atendente' && a.active !== false)
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR')),
    [agents]
  );

  const buildQueryParams = (filters) => {
    const params = new URLSearchParams();
    const range = filters.shortcut !== "custom" ? getDateRange(filters.shortcut) : null;
    const startDate = range
      ? format(range.start, "yyyy-MM-dd")
      : filters.customStart || null;
    const endDate = range
      ? format(range.end, "yyyy-MM-dd")
      : filters.customEnd || null;

    if (startDate) params.set('start_date', startDate);
    if (endDate) params.set('end_date', endDate);
    if (filters.agentId && filters.agentId !== 'all') params.set('atendente_id', filters.agentId);
    return params.toString();
  };

  const { data: reactivations = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['reactivations-report', appliedFilters],
    queryFn: async () => {
      const token = localStorage.getItem('accessToken');
      const qs = buildQueryParams(appliedFilters);
      const res = await fetch(`/api/referrals/reactivations/report${qs ? `?${qs}` : ''}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error(await extractApiError(res, 'Erro ao carregar relatório.'));
      }
      return res.json();
    },
    enabled: !!user,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, body }) => {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`/api/referrals/reactivations/${id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await extractApiError(res, 'Erro ao salvar.'));
      const data = await res.json();
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reactivations-report'] });
      setEditingRow(null);
      setEditForm({});
      setEditError("");
    },
    onError: (err) => {
      setEditError(err.message || 'Erro ao salvar alterações.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`/api/referrals/reactivations/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await extractApiError(res, 'Erro ao excluir.'));
      const data = await res.json();
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reactivations-report'] });
      toast.success('Reativação excluída com sucesso.');
      setDeletingRow(null);
    },
    onError: (err) => {
      toast.error(err.message || 'Erro ao excluir reativação.');
    },
  });

  const filteredRows = useMemo(() => {
    if (!searchText.trim()) return reactivations;
    const q = searchText.trim().toLowerCase();
    return reactivations.filter((r) =>
      (r.nomeCompletoCliente || '').toLowerCase().includes(q) ||
      (r.cpf || '').includes(q.replace(/\D/g, '')) ||
      (r.telefone || '').includes(q.replace(/\D/g, '')) ||
      (r.atendenteNome || '').toLowerCase().includes(q)
    );
  }, [reactivations, searchText]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / ITEMS_PER_PAGE));
  const paginated = filteredRows.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const handleApply = () => {
    setAppliedFilters({ shortcut, customStart, customEnd, agentId: selectedAgent });
    setCurrentPage(1);
  };

  const handleShortcutChange = (val) => {
    setShortcut(val);
    if (val !== "custom") {
      setCustomStart("");
      setCustomEnd("");
    }
  };

  const handleOpenEdit = (row) => {
    setEditingRow(row);
    setEditError("");
    setErpFound(null);
    setEditForm({
      cpf: row.cpf ? formatCPF(row.cpf) : "",
      nome_completo_cliente: row.nomeCompletoCliente || "",
      telefone: row.telefone ? formatPhoneInput(row.telefone) : "",
      atendente_id: row.atendenteId || "",
      observacoes: row.observacoes || "",
    });
  };

  const handleEditCPFSearch = async () => {
    const cleanCpf = (editForm.cpf || '').replace(/\D/g, '');
    if (cleanCpf.length !== 11) {
      toast.error('Digite um CPF válido com 11 dígitos.');
      return;
    }
    setSearchingERP(true);
    setErpFound(null);
    try {
      const response = await buscarClienteERP(cleanCpf);
      if (response?.success && response?.data?.contact?.name) {
        const nome = response.data.contact.name;
        const fone = response.data.contact?.phone || response.data.contact?.celular || response.data.contact?.telefone || '';
        setEditForm((f) => ({
          ...f,
          nome_completo_cliente: nome,
          telefone: fone ? formatPhoneInput(fone) : f.telefone,
        }));
        setErpFound(true);
        toast.success(`Cliente encontrado: ${nome}`);
      } else {
        setErpFound(false);
        toast.error('CPF não encontrado no ERP.');
      }
    } catch (err) {
      setErpFound(false);
      toast.error(err?.message || 'Erro ao consultar o ERP.');
    } finally {
      setSearchingERP(false);
    }
  };

  const handleSaveEdit = () => {
    if (!editForm.nome_completo_cliente?.trim()) {
      setEditError("Nome do cliente é obrigatório.");
      return;
    }
    const cleanCpf = (editForm.cpf || '').replace(/\D/g, '');
    if (cleanCpf.length > 0 && cleanCpf.length !== 11) {
      setEditError("CPF inválido. Informe 11 dígitos ou deixe em branco.");
      return;
    }
    const cleanPhone = (editForm.telefone || '').replace(/\D/g, '');
    const payload = {
      cpf: cleanCpf || null,
      nome_completo_cliente: editForm.nome_completo_cliente.trim(),
      telefone: cleanPhone || null,
      atendente_id: editForm.atendente_id,
      observacoes: (editForm.observacoes || '').trim() || null,
    };
    updateMutation.mutate({ id: editingRow.id, body: payload });
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="sticky top-0 z-50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(createPageUrl("ReferralPipeline"))}
            className="gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900"
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Voltar</span>
          </Button>
          <div className="h-6 w-px bg-gray-200 dark:bg-gray-700" />
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-100 dark:bg-amber-900/50 rounded-lg">
              <RefreshCw className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">Indicações</span>
            </div>
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Relatório de Reativações</span>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500 p-6 shadow-2xl shadow-amber-500/20">
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent" />
          <div className="relative z-10 flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <RefreshCw className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Relatório de Reativações</h1>
              <p className="text-amber-100 text-sm">
                {reactivations.length > 0 ? `${reactivations.length} reativação(ões) encontrada(s)` : "Consulte os registros de reativação de clientes"}
              </p>
            </div>
          </div>
        </div>

        <Card className="shadow-sm border-0 bg-white dark:bg-gray-900 ring-1 ring-gray-200 dark:ring-gray-800">
          <CardContent className="pt-5 pb-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-gray-500">Período</Label>
                <Select value={shortcut} onValueChange={handleShortcutChange}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PERIOD_SHORTCUTS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {shortcut === "custom" && (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-gray-500">Data início</Label>
                    <Input
                      type="date"
                      className="h-9"
                      value={customStart}
                      onChange={(e) => setCustomStart(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-gray-500">Data fim</Label>
                    <Input
                      type="date"
                      className="h-9"
                      value={customEnd}
                      onChange={(e) => setCustomEnd(e.target.value)}
                    />
                  </div>
                </>
              )}

              {isSupervisorOrAdmin && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-gray-500">Atendente</Label>
                  <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      {atendentesList.map((a) => (
                        <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className={shortcut === "custom" ? "lg:col-span-4" : ""}>
                <Button
                  onClick={handleApply}
                  className="w-full h-9 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white gap-2"
                >
                  <Filter className="w-4 h-4" />
                  Aplicar filtros
                </Button>
              </div>
            </div>

            <div className="mt-4 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Buscar por nome, CPF, telefone ou atendente..."
                value={searchText}
                onChange={(e) => { setSearchText(e.target.value); setCurrentPage(1); }}
                className="pl-9 h-9"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-0 bg-white dark:bg-gray-900 ring-1 ring-gray-200 dark:ring-gray-800 overflow-hidden">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
              <p className="text-sm text-gray-500">Carregando relatório...</p>
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <AlertCircle className="w-8 h-8 text-red-400" />
              <p className="text-sm text-gray-600 dark:text-gray-400 text-center max-w-sm">
                Não foi possível carregar o relatório de reativações. Tente novamente.
              </p>
              <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
                <RefreshCw className="w-4 h-4" />
                Tentar novamente
              </Button>
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <RefreshCw className="w-8 h-8 text-gray-300 dark:text-gray-600" />
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center max-w-sm">
                Nenhuma reativação encontrada para os filtros selecionados.
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400 whitespace-nowrap">CPF</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Nome do Cliente</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400 whitespace-nowrap">Telefone</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400 whitespace-nowrap">Data/Hora</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400 whitespace-nowrap">Atendente</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400 whitespace-nowrap">Obs.</th>
                      <th className="w-10 px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {paginated.map((row) => (
                      <tr
                        key={row.id}
                        className="hover:bg-amber-50/40 dark:hover:bg-amber-900/10 transition-colors"
                      >
                        <td className="px-4 py-3 font-mono text-gray-700 dark:text-gray-300 whitespace-nowrap">
                          {formatCPF(row.cpf)}
                        </td>
                        <td className="px-4 py-3 text-gray-800 dark:text-gray-200 font-medium">
                          {row.nomeCompletoCliente || "-"}
                        </td>
                        <td className="px-4 py-3 font-mono text-gray-600 dark:text-gray-400 whitespace-nowrap">
                          {formatPhone(row.telefone)}
                        </td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                          {formatDateTime(row.createdAt)}
                        </td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                          {row.atendenteNome || "-"}
                        </td>
                        <td className="px-4 py-3 text-gray-500 dark:text-gray-400 max-w-[180px] truncate" title={row.observacoes || ""}>
                          {row.observacoes || "-"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenEdit(row)}
                              className="h-7 w-7 p-0 text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                              title="Editar reativação"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            {isSupervisorOrAdmin && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDeletingRow(row)}
                                className="h-7 w-7 p-0 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                                title="Excluir reativação"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30">
                  <p className="text-xs text-gray-500">
                    {filteredRows.length} resultado(s) · Página {currentPage} de {totalPages}
                  </p>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="h-8 w-8 p-0"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="h-8 w-8 p-0"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
      </div>

      <Dialog open={!!editingRow} onOpenChange={(open) => { if (!open) { setEditingRow(null); setEditError(""); setErpFound(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <div className="w-7 h-7 bg-amber-100 dark:bg-amber-900/50 rounded-lg flex items-center justify-center">
                <Pencil className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              </div>
              Editar Reativação
            </DialogTitle>
          </DialogHeader>

          {editingRow && (
            <div className="space-y-4 py-1">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  CPF <span className="text-gray-400 font-normal">(opcional)</span>
                </Label>
                <div className="flex gap-2">
                  <Input
                    value={editForm.cpf || ""}
                    onChange={(e) => {
                      setEditForm((f) => ({ ...f, cpf: formatCPFInput(e.target.value) }));
                      setErpFound(null);
                    }}
                    placeholder="000.000.000-00"
                    className="h-9 flex-1 font-mono"
                    maxLength={14}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleEditCPFSearch}
                    disabled={searchingERP || (editForm.cpf || '').replace(/\D/g, '').length !== 11}
                    className="h-9 shrink-0 gap-1.5"
                  >
                    {searchingERP ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Search className="w-3.5 h-3.5" />
                    )}
                    <span className="hidden sm:inline">ERP</span>
                  </Button>
                </div>
                {erpFound === true && (
                  <p className="text-[11px] text-green-600 dark:text-green-400 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> Cliente localizado no ERP
                  </p>
                )}
                {erpFound === false && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400">
                    CPF não encontrado.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-gray-600 dark:text-gray-400">Nome do Cliente</Label>
                <Input
                  value={editForm.nome_completo_cliente || ""}
                  onChange={(e) => setEditForm((f) => ({ ...f, nome_completo_cliente: e.target.value }))}
                  placeholder="Nome completo"
                  className="h-9"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-gray-600 dark:text-gray-400">Telefone</Label>
                <Input
                  value={editForm.telefone || ""}
                  onChange={(e) => setEditForm((f) => ({ ...f, telefone: formatPhoneInput(e.target.value) }))}
                  placeholder="(00) 00000-0000"
                  className="h-9"
                />
              </div>

              {isSupervisorOrAdmin && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-gray-600 dark:text-gray-400">Atendente Responsável</Label>
                  <Select
                    value={editForm.atendente_id || ""}
                    onValueChange={(val) => setEditForm((f) => ({ ...f, atendente_id: val }))}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Selecionar atendente" />
                    </SelectTrigger>
                    <SelectContent>
                      {atendentesList.map((a) => (
                        <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-gray-600 dark:text-gray-400">Observações</Label>
                <Textarea
                  value={editForm.observacoes || ""}
                  onChange={(e) => setEditForm((f) => ({ ...f, observacoes: e.target.value }))}
                  placeholder="Observações sobre a reativação..."
                  rows={3}
                  className="resize-none text-sm"
                />
              </div>

              {editError && (
                <div className="flex items-center gap-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-xs">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  {editError}
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setEditingRow(null); setEditError(""); }}
              disabled={updateMutation.isPending}
              className="gap-1.5"
            >
              <X className="w-3.5 h-3.5" />
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleSaveEdit}
              disabled={updateMutation.isPending}
              className="gap-1.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white"
            >
              {updateMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingRow} onOpenChange={(open) => { if (!open && !deleteMutation.isPending) setDeletingRow(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <div className="w-7 h-7 bg-red-100 dark:bg-red-900/50 rounded-lg flex items-center justify-center">
                <Trash2 className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
              </div>
              Excluir reativação
            </AlertDialogTitle>
            <AlertDialogDescription className="pt-2">
              Tem certeza que deseja excluir a reativação de{" "}
              <span className="font-semibold text-gray-900 dark:text-gray-100">
                {deletingRow?.nomeCompletoCliente || "este cliente"}
              </span>
              {deletingRow?.cpf ? ` (CPF ${formatCPF(deletingRow.cpf)})` : ""}? Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); if (deletingRow) deleteMutation.mutate(deletingRow.id); }}
              disabled={deleteMutation.isPending}
              className="bg-red-600 hover:bg-red-700 text-white gap-1.5"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Trash2 className="w-3.5 h-3.5" />
              )}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
