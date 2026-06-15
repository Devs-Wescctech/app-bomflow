import { useQuery } from "@tanstack/react-query";
import { ArrowLeftRight, Clock } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function ReassignmentLog({ leadId, module }) {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["reassignmentLog", leadId],
    queryFn: async () => {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/${module}/${leadId}/reassignment-log`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!leadId,
    staleTime: 0,
    refetchOnMount: "always",
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div
            key={i}
            className="h-16 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 mb-3">
          <ArrowLeftRight className="h-5 w-5 text-gray-400" />
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Nenhuma redistribuição registrada
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {logs.map((log) => (
        <div
          key={log.id}
          className="flex items-start gap-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50"
        >
          <div className="flex-shrink-0 flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/60 mt-0.5">
            <ArrowLeftRight className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
              Redistribuído por{" "}
              <span className="text-blue-700 dark:text-blue-400">
                {log.reassignedByName || "Sistema"}
              </span>
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
              <span className="text-gray-500 dark:text-gray-500">
                {log.fromAgentName || "Não atribuído"}
              </span>
              <span className="mx-1.5 text-gray-400">→</span>
              <span className="font-medium text-gray-800 dark:text-gray-200">
                {log.toAgentName}
              </span>
            </p>
            {log.notes && (
              <p className="text-xs text-gray-500 dark:text-gray-500 mt-1 italic">
                &ldquo;{log.notes}&rdquo;
              </p>
            )}
            <p className="text-xs text-gray-400 dark:text-gray-600 mt-1.5 flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {format(
                new Date(log.createdAt),
                "dd/MM/yyyy 'às' HH:mm",
                { locale: ptBR }
              )}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
