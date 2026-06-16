import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import { toast } from "sonner";
import { KeyRound, Plus, Copy, Check, Trash2, Ban, ShieldAlert, Loader2, FileDown } from "lucide-react";

const API_BASE = "/api";

function authHeaders() {
  const token = localStorage.getItem("accessToken");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function apiKeysRequest(path, options = {}) {
  const res = await fetch(`${API_BASE}/api-keys${path}`, {
    ...options,
    headers: { ...authHeaders(), ...options.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || "Erro na requisição");
  }
  if (res.status === 204) return null;
  return res.json();
}

const SCOPES = [
  { value: "vendas_pf", label: "Vendas PF", description: "Leads de vendas pessoa física" },
  { value: "upsell", label: "Upsell", description: "Leads do módulo Upsell" },
  { value: "indicacoes", label: "Indicações", description: "Indicações / referrals" },
  { value: "agentes", label: "Agentes", description: "Lista de agentes (segmentação)" },
  { value: "canais", label: "Canais de venda", description: "Configuração de canais" },
];

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export default function AdminApiKeys() {
  const { data: user, isLoading: loadingUser } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => base44.auth.me(),
  });

  const currentAgent = user?.agent;
  const currentAgentType = currentAgent?.agentType || currentAgent?.agent_type;
  const isAdmin = user?.role === "admin" || currentAgentType === "admin";

  const {
    data: keys = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["api-keys"],
    queryFn: () => apiKeysRequest(""),
    enabled: isAdmin,
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [selectedScopes, setSelectedScopes] = useState([]);
  const [expiresAt, setExpiresAt] = useState("");
  const [creating, setCreating] = useState(false);

  const [createdKey, setCreatedKey] = useState(null);
  const [copied, setCopied] = useState(false);

  const [revokeTarget, setRevokeTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const toggleScope = (scope) => {
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  };

  const resetForm = () => {
    setName("");
    setSelectedScopes([]);
    setExpiresAt("");
  };

  const handleDownloadDocs = async () => {
    try {
      const token = localStorage.getItem("accessToken");
      const res = await fetch(`${API_BASE}/api-keys/docs`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Erro ao baixar documentação.");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "BomFlow-API-Externa.md";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err.message || "Erro ao baixar documentação.");
    }
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error("Informe um nome para a chave.");
      return;
    }
    if (selectedScopes.length === 0) {
      toast.error("Selecione ao menos um escopo.");
      return;
    }
    setCreating(true);
    try {
      const result = await apiKeysRequest("", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          scopes: selectedScopes,
          expiresAt: expiresAt || null,
        }),
      });
      setCreateOpen(false);
      resetForm();
      setCreatedKey(result);
      refetch();
      toast.success("API key criada com sucesso!");
    } catch (err) {
      toast.error(err.message || "Erro ao criar API key.");
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async () => {
    if (!createdKey?.plainKey) return;
    await navigator.clipboard.writeText(createdKey.plainKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    try {
      await apiKeysRequest(`/${revokeTarget.id}/revoke`, { method: "POST" });
      toast.success("API key revogada.");
      setRevokeTarget(null);
      refetch();
    } catch (err) {
      toast.error(err.message || "Erro ao revogar.");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiKeysRequest(`/${deleteTarget.id}`, { method: "DELETE" });
      toast.success("API key excluída.");
      setDeleteTarget(null);
      refetch();
    } catch (err) {
      toast.error(err.message || "Erro ao excluir.");
    }
  };

  if (loadingUser) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center px-4">
        <div className="w-14 h-14 bg-rose-100 dark:bg-rose-900/30 rounded-2xl flex items-center justify-center">
          <ShieldAlert className="w-7 h-7 text-rose-500" />
        </div>
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Acesso restrito</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm">
          Somente administradores podem gerenciar as API keys de integração.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 via-cyan-600 to-teal-600 p-6 shadow-2xl shadow-blue-500/20">
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent" />
          <div className="relative z-10 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
                <KeyRound className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">API Keys</h1>
                <p className="text-blue-100 text-sm mt-0.5">
                  Chaves de leitura para integração com sistemas externos
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                onClick={handleDownloadDocs}
                className="text-white hover:bg-white/20 font-medium"
              >
                <FileDown className="w-4 h-4 mr-2" /> Baixar Documentação
              </Button>
              <Button
                onClick={() => setCreateOpen(true)}
                className="bg-white text-blue-700 hover:bg-blue-50 font-semibold"
              >
                <Plus className="w-4 h-4 mr-2" /> Nova API Key
              </Button>
            </div>
          </div>
        </div>

        <Card className="overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : keys.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-14 h-14 bg-blue-100 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center">
                <KeyRound className="w-7 h-7 text-blue-400" />
              </div>
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                Nenhuma API key criada ainda
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Crie uma chave para permitir que sistemas externos consultem dados.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {keys.map((key) => (
                <div key={key.id} className="p-4 sm:p-5 flex items-start justify-between gap-4 flex-wrap">
                  <div className="space-y-2 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900 dark:text-gray-100">{key.name}</span>
                      {key.active && !key.revokedAt ? (
                        <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 hover:bg-emerald-100">
                          Ativa
                        </Badge>
                      ) : (
                        <Badge className="bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300 hover:bg-rose-100">
                          Revogada
                        </Badge>
                      )}
                    </div>
                    <div className="font-mono text-xs text-gray-500 dark:text-gray-400">
                      {key.keyPrefix}••••••••
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {key.scopes.map((scope) => (
                        <Badge key={scope} variant="secondary" className="text-[11px] font-normal">
                          {SCOPES.find((s) => s.value === scope)?.label || scope}
                        </Badge>
                      ))}
                    </div>
                    <div className="text-xs text-gray-400 dark:text-gray-500">
                      Criada em {formatDate(key.createdAt)} · Último uso: {formatDate(key.lastUsedAt)}
                      {key.expiresAt ? ` · Expira em ${formatDate(key.expiresAt)}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {key.active && !key.revokedAt && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setRevokeTarget(key)}
                        className="text-amber-600 border-amber-200 hover:bg-amber-50"
                      >
                        <Ban className="w-4 h-4 mr-1.5" /> Revogar
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDeleteTarget(key)}
                      className="text-rose-600 border-rose-200 hover:bg-rose-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) resetForm(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova API Key</DialogTitle>
            <DialogDescription>
              Gere uma chave de leitura para um sistema externo. A chave completa será exibida apenas uma vez.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="key-name">Nome / sistema</Label>
              <Input
                id="key-name"
                placeholder="Ex.: BI Financeiro, Power BI, Sistema X"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Escopos de acesso (somente leitura)</Label>
              <div className="space-y-2 rounded-lg border border-gray-200 dark:border-gray-800 p-3">
                {SCOPES.map((scope) => (
                  <label key={scope.value} className="flex items-start gap-3 cursor-pointer">
                    <Checkbox
                      checked={selectedScopes.includes(scope.value)}
                      onCheckedChange={() => toggleScope(scope.value)}
                      className="mt-0.5"
                    />
                    <div>
                      <div className="text-sm font-medium text-gray-800 dark:text-gray-200">{scope.label}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{scope.description}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="key-expires">Expiração (opcional)</Label>
              <Input
                id="key-expires"
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreateOpen(false); resetForm(); }}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Criar chave
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Show created key once */}
      <Dialog open={!!createdKey} onOpenChange={(o) => { if (!o) setCreatedKey(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>API Key criada</DialogTitle>
            <DialogDescription>
              Copie e guarde esta chave agora. Por segurança, ela <strong>não poderá ser exibida novamente</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <div className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 p-3">
              <code className="text-sm font-mono break-all flex-1 text-gray-800 dark:text-gray-200">
                {createdKey?.plainKey}
              </code>
              <Button size="sm" variant="outline" onClick={handleCopy}>
                {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Use no header <code className="font-mono">x-api-key</code> ao consultar os endpoints em <code className="font-mono">/api/external/v1/...</code>
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => setCreatedKey(null)}>Concluído</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke confirm */}
      <AlertDialog open={!!revokeTarget} onOpenChange={(o) => { if (!o) setRevokeTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revogar API key?</AlertDialogTitle>
            <AlertDialogDescription>
              A chave <strong>{revokeTarget?.name}</strong> deixará de funcionar imediatamente. O registro é mantido para auditoria.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleRevoke} className="bg-amber-600 hover:bg-amber-700">
              Revogar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir API key?</AlertDialogTitle>
            <AlertDialogDescription>
              A chave <strong>{deleteTarget?.name}</strong> será removida permanentemente. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-rose-600 hover:bg-rose-700">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
