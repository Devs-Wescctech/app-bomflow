import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeftRight, User } from "lucide-react";
import { toast } from "sonner";

export default function ReassignLeadModal({
  open,
  onClose,
  module,
  leadId,
  leadName,
  currentAgent,
  eligibleAgents = [],
  onSuccess,
}) {
  const [toAgentId, setToAgentId] = useState("");
  const [notes, setNotes] = useState("");
  const queryClient = useQueryClient();

  const reassignMutation = useMutation({
    mutationFn: async () => {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/${module}/${leadId}/reassign`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ toAgentId, notes }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Erro ao redistribuir lead.");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Lead redistribuído com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["lead", leadId] });
      queryClient.invalidateQueries({ queryKey: ["leadPJ", leadId] });
      queryClient.invalidateQueries({ queryKey: ["leadUpsell", leadId] });
      queryClient.invalidateQueries({ queryKey: ["referral", leadId] });
      queryClient.invalidateQueries({ queryKey: ["reassignmentLog", leadId] });
      setToAgentId("");
      setNotes("");
      onSuccess?.();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  function handleClose() {
    setToAgentId("");
    setNotes("");
    onClose();
  }

  const availableAgents = eligibleAgents.filter(
    (a) => String(a.id) !== String(currentAgent?.id)
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900">
              <ArrowLeftRight className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            Redistribuir Lead
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 p-3 space-y-2">
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Lead
              </p>
              <p className="font-semibold text-gray-900 dark:text-gray-100 mt-0.5">
                {leadName || "—"}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Agente atual
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <User className="h-3.5 w-3.5 text-gray-400" />
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {currentAgent?.name || "Não atribuído"}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Redistribuir para</Label>
            <Select value={toAgentId} onValueChange={setToAgentId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecione o agente..." />
              </SelectTrigger>
              <SelectContent>
                {availableAgents.length === 0 ? (
                  <div className="py-3 px-2 text-sm text-gray-500 text-center">
                    Nenhum agente disponível
                  </div>
                ) : (
                  availableAgents.map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>
                      {a.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              Observação{" "}
              <span className="font-normal text-gray-400">(opcional)</span>
            </Label>
            <Textarea
              placeholder="Ex: Lead fora da região do agente atual, férias, sobrecarga..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="resize-none"
            />
          </div>

          <div className="flex gap-2 justify-end pt-1">
            <Button variant="outline" onClick={handleClose} size="sm">
              Cancelar
            </Button>
            <Button
              onClick={() => reassignMutation.mutate()}
              disabled={!toAgentId || reassignMutation.isPending}
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {reassignMutation.isPending
                ? "Redistribuindo..."
                : "Confirmar Redistribuição"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
