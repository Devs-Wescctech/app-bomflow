import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Activity, ShieldAlert, Loader2, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";

const API_BASE = "/api/erp-audit";

function authHeaders() {
  const token = localStorage.getItem("accessToken");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function auditRequest(path, params = {}) {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== "" && v !== undefined && v !== null && v !== "all")
  ).toString();
  const res = await fetch(`${API_BASE}${path}${qs ? `?${qs}` : ""}`, { headers: authHeaders() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || "Erro na requisição");
  }
  return res.json();
}

function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" });
}

function defaultStart() {
  const d = new Date(Date.now() - 24 * 60 * 60 * 1000);
  d.setSeconds(0, 0);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ErpAuditLogs() {
  const { data: user, isLoading: loadingUser } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => base44.auth.me(),
  });

  const currentAgent = user?.agent;
  const currentAgentType = currentAgent?.agentType || currentAgent?.agent_type;
  const isAdmin = user?.role === "admin" || currentAgentType === "admin";

  const [startDate, setStartDate] = useState(defaultStart());
  const [endDate, setEndDate] = useState("");
  const [origin, setOrigin] = useState("all");
  const [kind, setKind] = useState("all");
  const [success, setSuccess] = useState("all");
  const [bucket, setBucket] = useState("hour");
  const [page, setPage] = useState(1);
  const limit = 50;

  const filterParams = {
    start_date: startDate ? new Date(startDate).toISOString() : "",
    end_date: endDate ? new Date(endDate).toISOString() : "",
    origin,
    kind,
    success,
  };

  const { data: origins = [] } = useQuery({
    queryKey: ["erp-audit-origins", filterParams.start_date, filterParams.end_date],
    queryFn: () =>
      auditRequest("/origins", {
        start_date: filterParams.start_date,
        end_date: filterParams.end_date,
      }),
    enabled: isAdmin,
  });

  const { data: summary = [], isFetching: loadingSummary, refetch: refetchSummary } = useQuery({
    queryKey: ["erp-audit-summary", filterParams],
    queryFn: () => auditRequest("/summary", filterParams),
    enabled: isAdmin,
  });

  const { data: aggregates = [], isFetching: loadingAgg, refetch: refetchAgg } = useQuery({
    queryKey: ["erp-audit-aggregates", filterParams, bucket],
    queryFn: () => auditRequest("/aggregates", { ...filterParams, bucket }),
    enabled: isAdmin,
  });

  const {
    data: logsData,
    isFetching: loadingLogs,
    refetch: refetchLogs,
  } = useQuery({
    queryKey: ["erp-audit-logs", filterParams, page],
    queryFn: () => auditRequest("/logs", { ...filterParams, page, limit }),
    enabled: isAdmin,
  });

  const logs = logsData?.logs || [];
  const total = logsData?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const refreshAll = () => {
    refetchSummary();
    refetchAgg();
    refetchLogs();
  };

  if (loadingUser) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-center px-4">
        <ShieldAlert className="w-10 h-10 text-amber-500" />
        <p className="text-lg font-semibold text-gray-800 dark:text-gray-200">Acesso restrito</p>
        <p className="text-sm text-gray-500">Esta página é exclusiva para administradores.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-orange-600 via-amber-600 to-yellow-600 p-6 shadow-2xl shadow-orange-500/20">
          <div className="relative z-10 flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
                <Activity className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Auditoria ERP</h1>
                <p className="text-orange-100 text-sm mt-0.5">
                  Registro de todas as chamadas de saída ao ERP (REST e banco), com origem e frequência.
                </p>
              </div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={refreshAll}
              className="bg-white/20 hover:bg-white/30 text-white border-0"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loadingLogs || loadingAgg || loadingSummary ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          </div>
        </div>

        <Card className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Início</Label>
              <Input
                type="datetime-local"
                value={startDate}
                onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Fim</Label>
              <Input
                type="datetime-local"
                value={endDate}
                onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Origem</Label>
              <Select value={origin} onValueChange={(v) => { setOrigin(v); setPage(1); }}>
                <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as origens</SelectItem>
                  {origins.map((o) => (
                    <SelectItem key={o.origin} value={o.origin}>
                      {o.origin} ({o.total})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Tipo</Label>
              <Select value={kind} onValueChange={(v) => { setKind(v); setPage(1); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">REST + Banco</SelectItem>
                  <SelectItem value="rest">REST (API)</SelectItem>
                  <SelectItem value="db">Banco ERP</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Status</Label>
              <Select value={success} onValueChange={(v) => { setSuccess(v); setPage(1); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="true">Sucesso</SelectItem>
                  <SelectItem value="false">Erro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>

        <Card className="p-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Frequência por origem {loadingSummary && <Loader2 className="inline w-3.5 h-3.5 animate-spin ml-1" />}
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-200 dark:border-gray-800">
                  <th className="py-2 pr-4">Origem</th>
                  <th className="py-2 pr-4 text-right">Total</th>
                  <th className="py-2 pr-4 text-right">Pico/minuto</th>
                  <th className="py-2 pr-4 text-right">Média/minuto ativo</th>
                  <th className="py-2 pr-4">Primeira</th>
                  <th className="py-2">Última</th>
                </tr>
              </thead>
              <tbody>
                {summary.length === 0 && (
                  <tr><td colSpan={6} className="py-4 text-center text-gray-400">Nenhum registro no período.</td></tr>
                )}
                {summary.map((s) => (
                  <tr key={s.origin} className="border-b border-gray-100 dark:border-gray-900">
                    <td className="py-2 pr-4 font-mono text-xs">{s.origin}</td>
                    <td className="py-2 pr-4 text-right font-semibold">{s.total}</td>
                    <td className="py-2 pr-4 text-right">{s.peak_per_minute}</td>
                    <td className="py-2 pr-4 text-right">{s.avg_per_active_minute}</td>
                    <td className="py-2 pr-4 text-xs text-gray-500">{formatDateTime(s.first_seen)}</td>
                    <td className="py-2 text-xs text-gray-500">{formatDateTime(s.last_seen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Chamadas por {bucket === "minute" ? "minuto" : "hora"} {loadingAgg && <Loader2 className="inline w-3.5 h-3.5 animate-spin ml-1" />}
            </h2>
            <Select value={bucket} onValueChange={setBucket}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="hour">Por hora</SelectItem>
                <SelectItem value="minute">Por minuto</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white dark:bg-gray-900">
                <tr className="text-left text-xs text-gray-500 border-b border-gray-200 dark:border-gray-800">
                  <th className="py-2 pr-4">Período</th>
                  <th className="py-2 pr-4">Origem</th>
                  <th className="py-2 pr-4 text-right">Chamadas</th>
                  <th className="py-2 pr-4 text-right">Erros</th>
                  <th className="py-2 text-right">Duração média (ms)</th>
                </tr>
              </thead>
              <tbody>
                {aggregates.length === 0 && (
                  <tr><td colSpan={5} className="py-4 text-center text-gray-400">Nenhum registro no período.</td></tr>
                )}
                {aggregates.map((a, i) => (
                  <tr key={i} className="border-b border-gray-100 dark:border-gray-900">
                    <td className="py-2 pr-4 text-xs">{formatDateTime(a.bucket)}</td>
                    <td className="py-2 pr-4 font-mono text-xs">{a.origin}</td>
                    <td className="py-2 pr-4 text-right font-semibold">{a.total}</td>
                    <td className="py-2 pr-4 text-right">
                      {Number(a.errors) > 0 ? <span className="text-red-600 font-semibold">{a.errors}</span> : "0"}
                    </td>
                    <td className="py-2 text-right">{a.avg_duration_ms ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Registros ({total}) {loadingLogs && <Loader2 className="inline w-3.5 h-3.5 animate-spin ml-1" />}
            </h2>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-xs text-gray-500">
                Página {page} de {totalPages}
              </span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-200 dark:border-gray-800">
                  <th className="py-2 pr-4">Data/Hora</th>
                  <th className="py-2 pr-4">Tipo</th>
                  <th className="py-2 pr-4">Endpoint / Operação</th>
                  <th className="py-2 pr-4">Origem</th>
                  <th className="py-2 pr-4">Usuário</th>
                  <th className="py-2 pr-4 text-center">Status</th>
                  <th className="py-2 text-right">Duração (ms)</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 && (
                  <tr><td colSpan={7} className="py-4 text-center text-gray-400">Nenhum registro encontrado.</td></tr>
                )}
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-gray-100 dark:border-gray-900 align-top">
                    <td className="py-2 pr-4 text-xs whitespace-nowrap">{formatDateTime(log.created_at)}</td>
                    <td className="py-2 pr-4">
                      <Badge variant="outline" className={log.kind === "rest" ? "text-blue-700 border-blue-300" : "text-purple-700 border-purple-300"}>
                        {log.kind === "rest" ? `${log.method || "REST"}` : "DB"}
                      </Badge>
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs break-all max-w-md">{log.endpoint}</td>
                    <td className="py-2 pr-4 font-mono text-xs">{log.origin || "—"}</td>
                    <td className="py-2 pr-4 text-xs">{log.origin_user || "—"}</td>
                    <td className="py-2 pr-4 text-center">
                      {log.success ? (
                        <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                          {log.status_code ?? "OK"}
                        </Badge>
                      ) : (
                        <Badge className="bg-red-100 text-red-800 hover:bg-red-100" title={log.error || ""}>
                          {log.status_code ?? "Erro"}
                        </Badge>
                      )}
                    </td>
                    <td className="py-2 text-right text-xs">{log.duration_ms ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
