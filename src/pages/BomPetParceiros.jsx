import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { extractApiError } from "@/utils/apiError";
import {
  AlertCircle,
  Building2,
  CalendarDays,
  Edit3,
  History,
  Loader2,
  Mail,
  Phone,
  Plus,
  Search,
  ShieldAlert,
  WalletCards,
} from "lucide-react";

const API_BASE = "/api/bom-pet";

function getAuthHeaders() {
  const token = localStorage.getItem("accessToken");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function todayLocal() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function emptyForm() {
  return {
    nome: "",
    valor_servico: "",
    data_cadastro: todayLocal(),
    email: "",
    telefone: "",
    status: "Ativo",
    data_exclusao: "",
  };
}

function formatMoney(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "Não informado";
  return parsed.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value) {
  if (!value) return "Vigente";
  const [year, month, day] = String(value).slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : String(value);
}

function formatPeriodDateTime(value) {
  if (!value) return "Vigente";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

function formatPhone(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export default function BomPetParceiros() {
  const { toast } = useToast();
  const [partners, setPartners] = useState([]);
  const [statusFilter, setStatusFilter] = useState("Ativo");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingPartner, setEditingPartner] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  async function request(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
        ...(options.headers || {}),
      },
    });
    if (!response.ok) {
      const errorMessage = await extractApiError(response, "Não foi possível concluir a operação.");
      const requestError = new Error(errorMessage);
      requestError.status = response.status;
      throw requestError;
    }
    return response.json();
  }

  async function loadPartners() {
    setLoading(true);
    setError("");
    setForbidden(false);
    try {
      const data = await request(`/parceiros?status=${encodeURIComponent(statusFilter)}`);
      setPartners(Array.isArray(data) ? data : []);
    } catch (requestError) {
      if (requestError.status === 403) setForbidden(true);
      else setError(requestError.message);
      setPartners([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPartners();
    // A troca do filtro é a única causa automática de recarga.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const filteredPartners = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    if (!query) return partners;
    const phoneQuery = query.replace(/\D/g, "");
    return partners.filter((partner) =>
      String(partner.nome || "").toLocaleLowerCase("pt-BR").includes(query)
      || String(partner.email || "").toLocaleLowerCase("pt-BR").includes(query)
      || (phoneQuery && String(partner.telefone || "").includes(phoneQuery))
    );
  }, [partners, search]);

  function openNewPartner() {
    setEditingPartner(null);
    setHistory([]);
    setForm(emptyForm());
    setEditorOpen(true);
  }

  async function openEditPartner(partner) {
    setEditingPartner(partner);
    setForm({
      nome: partner.nome || "",
      valor_servico: String(partner.valor_servico ?? ""),
      data_cadastro: String(partner.data_cadastro || "").slice(0, 10),
      email: partner.email || "",
      telefone: formatPhone(partner.telefone),
      status: partner.status || "Ativo",
      data_exclusao: String(partner.data_exclusao || "").slice(0, 10),
    });
    setHistory([]);
    setEditorOpen(true);
    setHistoryLoading(true);
    try {
      const detail = await request(`/parceiros/${partner.id}`);
      setHistory(Array.isArray(detail.historico) ? detail.historico : []);
    } catch (requestError) {
      toast({ title: "Erro", description: requestError.message, variant: "destructive" });
    } finally {
      setHistoryLoading(false);
    }
  }

  function validateForm() {
    if (!form.nome.trim()) return "Informe o nome do parceiro.";
    if (form.valor_servico === "" || !Number.isFinite(Number(String(form.valor_servico).replace(",", ".")))) {
      return "Informe um valor de serviço válido.";
    }
    if (!form.data_cadastro) return "Informe a data de cadastro.";
    if (form.status === "Inativo" && !form.data_exclusao) {
      return "Informe a data de exclusão para inativar o parceiro.";
    }
    return "";
  }

  async function savePartner(event) {
    event.preventDefault();
    const validationError = validateForm();
    if (validationError) {
      toast({ title: "Revise o cadastro", description: validationError, variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        nome: form.nome.trim(),
        valor_servico: String(form.valor_servico).replace(",", "."),
        data_cadastro: form.data_cadastro,
        email: form.email.trim() || null,
        telefone: form.telefone.replace(/\D/g, "") || null,
        ...(editingPartner
          ? {
              status: form.status,
              data_exclusao: form.status === "Inativo" ? form.data_exclusao : null,
            }
          : {}),
      };
      await request(
        editingPartner ? `/parceiros/${editingPartner.id}` : "/parceiros",
        {
          method: editingPartner ? "PUT" : "POST",
          body: JSON.stringify(payload),
        }
      );
      toast({
        title: "Cadastro salvo",
        description: editingPartner
          ? "Os dados do parceiro foram atualizados."
          : "O parceiro foi criado como Ativo.",
      });
      setEditorOpen(false);
      await loadPartners();
    } catch (requestError) {
      toast({ title: "Erro ao salvar", description: requestError.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (forbidden) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 dark:bg-gray-950">
        <Card className="mx-auto mt-16 max-w-xl border-red-200 dark:border-red-900">
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <ShieldAlert className="h-12 w-12 text-red-500" />
            <h1 className="text-xl font-semibold">Acesso restrito</h1>
            <p className="text-sm text-muted-foreground">
              O Cadastro Parceiros do Bom Pet está disponível somente para administradores.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen space-y-5 bg-gray-50 p-4 dark:bg-gray-950 sm:p-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="mb-1 flex items-center gap-2 text-sm font-medium text-teal-600 dark:text-teal-400">
            <Building2 className="h-4 w-4" />
            Bom Pet
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Cadastro Parceiros</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gerencie parceiros de cremação e a vigência auditável dos valores.
          </p>
        </div>
        <Button onClick={openNewPartner} className="bg-teal-600 hover:bg-teal-700">
          <Plus className="mr-2 h-4 w-4" />
          Novo parceiro
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
            <div>
              <CardTitle className="flex items-center gap-2">
                Parceiros
                <Badge variant="secondary">{filteredPartners.length}</Badge>
              </CardTitle>
              <CardDescription>O valor exibido é o valor vigente no cadastro.</CardDescription>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative sm:w-72">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar por nome, e-mail ou telefone"
                  className="pl-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="sm:w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Ativo">Ativos</SelectItem>
                  <SelectItem value="Inativo">Inativos</SelectItem>
                  <SelectItem value="todos">Todos</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex min-h-52 items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Carregando parceiros...
            </div>
          ) : error ? (
            <div className="flex min-h-52 flex-col items-center justify-center gap-3 text-center">
              <AlertCircle className="h-9 w-9 text-red-500" />
              <p className="text-sm text-muted-foreground">{error}</p>
              <Button variant="outline" onClick={loadPartners}>Tentar novamente</Button>
            </div>
          ) : filteredPartners.length === 0 ? (
            <div className="flex min-h-52 flex-col items-center justify-center gap-2 text-center">
              <Building2 className="h-10 w-10 text-gray-300" />
              <p className="font-medium">Nenhum parceiro encontrado</p>
              <p className="text-sm text-muted-foreground">
                {search ? "Ajuste sua busca." : "Cadastre o primeiro parceiro para começar."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-muted-foreground dark:bg-gray-900">
                  <tr>
                    <th className="px-4 py-3 font-medium">Parceiro</th>
                    <th className="px-4 py-3 font-medium">Contato</th>
                    <th className="px-4 py-3 font-medium">Data de cadastro</th>
                    <th className="px-4 py-3 font-medium">Valor atual</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 text-right font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredPartners.map((partner) => (
                    <tr key={partner.id} className="bg-white hover:bg-gray-50/70 dark:bg-gray-950 dark:hover:bg-gray-900/60">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-gray-900 dark:text-white">{partner.nome}</div>
                        {partner.status === "Inativo" && partner.data_exclusao && (
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            Inativado em {formatDate(partner.data_exclusao)}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <div className="space-y-1">
                          <span className="flex items-center gap-1.5">
                            <Mail className="h-3.5 w-3.5" />
                            {partner.email || "Não informado"}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <Phone className="h-3.5 w-3.5" />
                            {partner.telefone ? formatPhone(partner.telefone) : "Não informado"}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(partner.data_cadastro)}</td>
                      <td className="px-4 py-3 font-semibold text-teal-700 dark:text-teal-300">
                        {formatMoney(partner.valor_servico)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={partner.status === "Ativo"
                          ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300"}>
                          {partner.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="ghost" size="sm" onClick={() => openEditPartner(partner)}>
                          <Edit3 className="mr-1.5 h-4 w-4" />
                          Editar
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={editorOpen} onOpenChange={(open) => !saving && setEditorOpen(open)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPartner ? "Editar parceiro" : "Novo parceiro"}</DialogTitle>
            <DialogDescription>
              {editingPartner
                ? "Alterações de valor criam uma nova vigência sem apagar o histórico."
                : "O novo parceiro será cadastrado com status Ativo."}
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="dados">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="dados">
                <Building2 className="mr-2 h-4 w-4" />
                Dados
              </TabsTrigger>
              <TabsTrigger value="historico" disabled={!editingPartner}>
                <History className="mr-2 h-4 w-4" />
                Histórico
              </TabsTrigger>
            </TabsList>

            <TabsContent value="dados">
              <form onSubmit={savePartner} className="space-y-4 pt-3">
                <div className="space-y-2">
                  <Label htmlFor="partner-name">Nome *</Label>
                  <Input
                    id="partner-name"
                    value={form.nome}
                    onChange={(event) => setForm({ ...form, nome: event.target.value })}
                    placeholder="Nome do parceiro de cremação"
                    maxLength={255}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="partner-value">Valor do serviço *</Label>
                    <div className="relative">
                      <WalletCards className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="partner-value"
                        inputMode="decimal"
                        value={form.valor_servico}
                        onChange={(event) => setForm({ ...form, valor_servico: event.target.value })}
                        placeholder="0,00"
                        className="pl-9"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="partner-created">Data de cadastro *</Label>
                    <div className="relative">
                      <CalendarDays className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="partner-created"
                        type="date"
                        value={form.data_cadastro}
                        onChange={(event) => setForm({ ...form, data_cadastro: event.target.value })}
                        className="pl-9"
                        disabled={Boolean(editingPartner)}
                      />
                    </div>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="partner-email">E-mail</Label>
                    <Input
                      id="partner-email"
                      type="email"
                      value={form.email}
                      onChange={(event) => setForm({ ...form, email: event.target.value })}
                      placeholder="contato@parceiro.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="partner-phone">Telefone</Label>
                    <Input
                      id="partner-phone"
                      value={form.telefone}
                      onChange={(event) => setForm({ ...form, telefone: formatPhone(event.target.value) })}
                      placeholder="(00) 00000-0000"
                      maxLength={15}
                    />
                  </div>
                </div>

                {editingPartner && (
                  <div className="grid gap-4 rounded-xl border bg-gray-50 p-4 dark:bg-gray-900 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Status *</Label>
                      <Select
                        value={form.status}
                        onValueChange={(status) => setForm({
                          ...form,
                          status,
                          data_exclusao: status === "Ativo" ? "" : form.data_exclusao,
                        })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Ativo">Ativo</SelectItem>
                          <SelectItem value="Inativo">Inativo</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {form.status === "Inativo" && (
                      <div className="space-y-2">
                        <Label htmlFor="partner-deleted">Data de exclusão *</Label>
                        <Input
                          id="partner-deleted"
                          type="date"
                          value={form.data_exclusao}
                          onChange={(event) => setForm({ ...form, data_exclusao: event.target.value })}
                          min={form.data_cadastro}
                        />
                      </div>
                    )}
                  </div>
                )}

                <DialogFooter className="border-t pt-4">
                  <Button type="button" variant="outline" onClick={() => setEditorOpen(false)} disabled={saving}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={saving} className="bg-teal-600 hover:bg-teal-700">
                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Salvar parceiro
                  </Button>
                </DialogFooter>
              </form>
            </TabsContent>

            <TabsContent value="historico" className="pt-3">
              {historyLoading ? (
                <div className="flex min-h-40 items-center justify-center gap-2 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Carregando histórico...
                </div>
              ) : history.length === 0 ? (
                <div className="flex min-h-40 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                  <History className="h-9 w-9" />
                  <p>Nenhuma vigência registrada.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {history.map((entry, index) => (
                    <div key={entry.id} className="flex items-center justify-between rounded-xl border p-4">
                      <div>
                        <div className="font-semibold">{formatMoney(entry.valor_servico)}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          Início: {formatPeriodDateTime(entry.vigencia_inicio)}
                          {" • "}
                          Fim: {entry.vigencia_fim ? formatPeriodDateTime(entry.vigencia_fim) : "Vigente"}
                        </div>
                      </div>
                      {index === 0 && !entry.vigencia_fim && (
                        <Badge className="bg-teal-100 text-teal-700 hover:bg-teal-100 dark:bg-teal-950 dark:text-teal-300">
                          Valor atual
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}