import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { attendanceApi } from "@/api/attendanceApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import {
  Plug,
  Plus,
  Copy,
  Check,
  Trash2,
  Loader2,
  ShieldAlert,
  MessagesSquare,
  Webhook,
} from "lucide-react";

function CopyButton({ value, label }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(value || "");
        setCopied(true);
        toast.success(`${label} copiado`);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 flex-shrink-0"
      title={`Copiar ${label}`}
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

export default function AdminWhatsAppConnections() {
  const queryClient = useQueryClient();

  const { data: user, isLoading: loadingUser } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => base44.auth.me(),
  });
  const isAdmin = user?.role === "admin";

  const { data: connections = [], isLoading } = useQuery({
    queryKey: ["attConnections"],
    queryFn: () => attendanceApi.listConnections(),
    enabled: isAdmin,
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [token, setToken] = useState("");
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const handleCreate = async () => {
    if (!name.trim() || !token.trim()) {
      toast.error("Informe o nome e o token da conexão.");
      return;
    }
    setCreating(true);
    try {
      const conn = await attendanceApi.createConnection({
        name: name.trim(),
        token: token.trim(),
        channel: "whatsapp",
      });
      setCreated(conn);
      setName("");
      setToken("");
      queryClient.invalidateQueries({ queryKey: ["attConnections"] });
      toast.success("Conexão criada e token validado no WHU");
    } catch (e) {
      toast.error(e.message);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await attendanceApi.deleteConnection(deleteTarget.id);
      toast.success("Conexão removida");
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["attConnections"] });
    } catch (e) {
      toast.error(e.message);
    } finally {
      setDeleting(false);
    }
  };

  if (!loadingUser && user && !isAdmin) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-6">
        <ShieldAlert className="w-10 h-10 text-red-400 mb-3" />
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Acesso restrito</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Apenas administradores podem gerenciar conexões de WhatsApp.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-teal-600 via-emerald-600 to-green-600 p-6 shadow-2xl shadow-emerald-500/20">
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent" />
          <div className="relative z-10 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
                <Plug className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Conexões WhatsApp</h1>
                <p className="text-emerald-100 text-sm mt-0.5">
                  Canais WHU conectados ao Chat de Atendimento
                </p>
              </div>
            </div>
            <Button
              onClick={() => {
                setCreated(null);
                setCreateOpen(true);
              }}
              className="bg-white/15 hover:bg-white/25 text-white border border-white/20 rounded-xl"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Nova Conexão
            </Button>
          </div>
        </div>

        {isLoading || loadingUser ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-teal-500" />
          </div>
        ) : connections.length === 0 ? (
          <Card className="rounded-2xl border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-14 text-center">
              <MessagesSquare className="w-10 h-10 text-gray-300 dark:text-gray-700 mb-3" />
              <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md">
                Nenhuma conexão configurada. Crie uma conexão com o token do canal WHU para que as
                mensagens dos clientes apareçam no Chat WhatsApp.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {connections.map((c) => (
              <Card key={c.id} className="rounded-2xl">
                <CardContent className="p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center">
                        <MessagesSquare className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-white">{c.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Canal: {c.channel} · criada em{" "}
                          {c.createdAt ? new Date(c.createdAt).toLocaleDateString("pt-BR") : "—"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        className={
                          c.status === "active"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 border-0"
                            : "bg-gray-200 text-gray-600 border-0"
                        }
                      >
                        {c.status === "active" ? "Ativa" : c.status}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                        onClick={() => setDeleteTarget(c)}
                        title="Remover conexão"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-2">
                    <div className="flex items-center gap-2 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 px-3 py-2">
                      <Webhook className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      <span className="text-[11px] text-gray-500 flex-shrink-0">Webhook:</span>
                      <code className="text-xs text-gray-700 dark:text-gray-300 truncate flex-1">
                        {c.webhookUrl}
                      </code>
                      <CopyButton value={c.webhookUrl} label="URL do webhook" />
                    </div>
                    <div className="flex items-center gap-2 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 px-3 py-2">
                      <ShieldAlert className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      <span className="text-[11px] text-gray-500 flex-shrink-0">Segredo (x-webhook-secret):</span>
                      <code className="text-xs text-gray-700 dark:text-gray-300 truncate flex-1">
                        {c.webhookSecret}
                      </code>
                      <CopyButton value={c.webhookSecret} label="Segredo do webhook" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Criar conexão */}
      <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) setCreated(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova Conexão WhatsApp</DialogTitle>
            <DialogDescription>
              Informe um nome e o token do canal no painel WHU/Rudo. O token é validado antes de salvar
              e fica criptografado no banco.
            </DialogDescription>
          </DialogHeader>
          {created ? (
            <div className="space-y-3">
              <p className="text-sm text-emerald-600 font-medium flex items-center gap-1.5">
                <Check className="w-4 h-4" /> Conexão "{created.name}" criada com sucesso.
              </p>
              <div className="rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-3 space-y-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 flex-shrink-0">Webhook:</span>
                  <code className="truncate flex-1">{created.webhookUrl}</code>
                  <CopyButton value={created.webhookUrl} label="URL do webhook" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 flex-shrink-0">Segredo:</span>
                  <code className="truncate flex-1">{created.webhookSecret}</code>
                  <CopyButton value={created.webhookSecret} label="Segredo" />
                </div>
              </div>
              <p className="text-xs text-gray-500">
                Configure esta URL como webhook no painel WHU e envie o segredo no header{" "}
                <code>x-webhook-secret</code> (ou como <code>?secret=</code> na URL).
              </p>
              <DialogFooter>
                <Button onClick={() => { setCreateOpen(false); setCreated(null); }}>Concluir</Button>
              </DialogFooter>
            </div>
          ) : (
            <>
              <div className="space-y-3 py-1">
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Nome</label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex.: Atendimento Comercial"
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Token do canal (WHU)</label>
                  <Input
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="Token do canal no painel WHU/Rudo"
                    className="mt-1"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
                <Button onClick={handleCreate} disabled={creating} className="bg-teal-600 hover:bg-teal-700 text-white">
                  {creating ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Plus className="w-4 h-4 mr-1.5" />}
                  Criar conexão
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Remover conexão */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover conexão "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              As conversas e mensagens vinculadas a esta conexão serão removidas permanentemente. Esta
              ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleting ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Trash2 className="w-4 h-4 mr-1.5" />}
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
