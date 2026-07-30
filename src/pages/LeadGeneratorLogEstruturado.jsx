import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Search, Loader2, CheckCircle2, XCircle,
  Clock, Send, RefreshCw, ChevronLeft, ChevronRight,
  Timer, Shield, Download, FilterX
} from "lucide-react";
import { toast } from "sonner";
import { extractApiError } from "@/utils/apiError";

const API_BASE = '/api';

function getAuthHeaders() {
  const token = localStorage.getItem('accessToken');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

const STATUS_CONFIG = {
  enviado: { label: 'Enviado', color: 'bg-green-100 text-green-800', icon: CheckCircle2 },
  falha: { label: 'Falha', color: 'bg-red-100 text-red-800', icon: XCircle },
  reenvio_agendado: { label: 'Reenvio', color: 'bg-yellow-100 text-yellow-800', icon: Clock },
  bloqueado: { label: 'Bloqueado', color: 'bg-orange-100 text-orange-800', icon: Shield },
  bloqueado_30_dias: { label: 'Bloq. 30d', color: 'bg-orange-100 text-orange-800', icon: Shield },
  bloqueado_duplicidade: { label: 'Duplicidade', color: 'bg-orange-100 text-orange-800', icon: Shield },
  bloqueado_limite_diario: { label: 'Limite Diário', color: 'bg-orange-100 text-orange-800', icon: Shield },
};

export default function LeadGeneratorLogEstruturado() {
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState("todos");
  const [searchNumber, setSearchNumber] = useState("");
  const [exporting, setExporting] = useState(false);
  const pageSize = 50;

  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const [startDate, setStartDate] = useState(thirtyDaysAgo.toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(today.toISOString().slice(0, 10));

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', `${startDate}T00:00:00`);
    if (endDate) params.append('endDate', `${endDate}T23:59:59`);
    if (statusFilter && statusFilter !== 'todos') params.append('status', statusFilter);
    params.append('limit', String(pageSize));
    params.append('offset', String(page * pageSize));
    return params.toString();
  }, [startDate, endDate, statusFilter, page]);

  const { data: logData, isLoading, refetch } = useQuery({
    queryKey: ['lead-generator-log-estruturado', queryParams],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/functions/lead-generator-log-estruturado?${queryParams}`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error(await extractApiError(res, 'Erro ao carregar log'));
      return res.json();
    },
    refetchInterval: 30000,
  });

  const statsParams = useMemo(() => {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', `${startDate}T00:00:00`);
    if (endDate) params.append('endDate', `${endDate}T23:59:59`);
    return params.toString();
  }, [startDate, endDate]);

  const { data: statsData } = useQuery({
    queryKey: ['lead-generator-log-estruturado-stats', statsParams],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/functions/lead-generator-log-estruturado/stats?${statsParams}`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error(await extractApiError(res, 'Erro ao carregar stats'));
      return res.json();
    },
    refetchInterval: 60000,
  });

  const stats = statsData?.stats || {};
  const logs = logData?.data || [];
  const total = logData?.total || 0;
  const totalPages = Math.ceil(total / pageSize);

  const filteredLogs = useMemo(() => {
    if (!searchNumber.trim()) return logs;
    return logs.filter(l =>
      l.lead_number?.includes(searchNumber.trim()) ||
      l.lead_name?.toLowerCase().includes(searchNumber.trim().toLowerCase())
    );
  }, [logs, searchNumber]);

  const handleClearFilters = useCallback(() => {
    const now = new Date();
    const ago = new Date(now);
    ago.setDate(ago.getDate() - 30);
    setStartDate(ago.toISOString().slice(0, 10));
    setEndDate(now.toISOString().slice(0, 10));
    setStatusFilter("todos");
    setSearchNumber("");
    setPage(0);
  }, []);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', `${startDate}T00:00:00`);
      if (endDate) params.append('endDate', `${endDate}T23:59:59`);
      if (statusFilter && statusFilter !== 'todos') params.append('status', statusFilter);

      const res = await fetch(`${API_BASE}/functions/lead-generator-log-estruturado/export?${params.toString()}`, {
        headers: getAuthHeaders(),
      });

      if (!res.ok) {
        throw new Error(await extractApiError(res, 'Erro ao exportar'));
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `log_disparos_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Excel exportado com sucesso!');
    } catch (err) {
      toast.error(err.message || 'Erro ao exportar Excel');
    } finally {
      setExporting(false);
    }
  }, [startDate, endDate, statusFilter]);

  const formatDate = (d) => {
    if (!d) return '-';
    return new Date(d).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  };

  const formatDuration = (ms) => {
    if (!ms && ms !== 0) return '-';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Send className="w-4 h-4" /> Total Disparos
            </div>
            <p className="text-2xl font-bold">{stats.total?.toLocaleString('pt-BR') || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <CheckCircle2 className="w-4 h-4 text-green-500" /> Enviados
            </div>
            <p className="text-2xl font-bold text-green-600">{stats.enviados?.toLocaleString('pt-BR') || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Timer className="w-4 h-4 text-blue-500" /> Tempo Médio
            </div>
            <p className="text-2xl font-bold text-blue-600">{formatDuration(stats.avg_duracao_ms)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Shield className="w-4 h-4 text-orange-500" /> Bloqueados
            </div>
            <p className="text-2xl font-bold text-orange-600">{stats.bloqueados?.toLocaleString('pt-BR') || 0}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <CardTitle className="text-lg">Log de Disparos Detalhado</CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleClearFilters} className="gap-2">
                <FilterX className="w-4 h-4" /> Limpar
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
                disabled={exporting}
                className="gap-2"
              >
                {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Exportar Excel
              </Button>
              <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
                <RefreshCw className="w-4 h-4" /> Atualizar
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 mt-3">
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={startDate}
                onChange={e => { setStartDate(e.target.value); setPage(0); }}
                className="w-40"
              />
              <span className="text-muted-foreground">até</span>
              <Input
                type="date"
                value={endDate}
                onChange={e => { setEndDate(e.target.value); setPage(0); }}
                className="w-40"
              />
            </div>

            <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(0); }}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                <SelectItem value="enviado">Enviado</SelectItem>
                <SelectItem value="falha">Falha</SelectItem>
                <SelectItem value="reenvio_agendado">Reenvio</SelectItem>
                <SelectItem value="bloqueado">Bloqueado</SelectItem>
                <SelectItem value="bloqueado_30_dias">Bloq. 30 dias</SelectItem>
                <SelectItem value="bloqueado_duplicidade">Duplicidade</SelectItem>
                <SelectItem value="bloqueado_limite_diario">Limite Diário</SelectItem>
              </SelectContent>
            </Select>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar número ou nome..."
                value={searchNumber}
                onChange={e => setSearchNumber(e.target.value)}
                className="pl-9 w-56"
              />
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Nenhum registro encontrado para os filtros selecionados.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 pr-3 font-medium">Data/Hora</th>
                    <th className="pb-2 pr-3 font-medium">Número</th>
                    <th className="pb-2 pr-3 font-medium">Nome</th>
                    <th className="pb-2 pr-3 font-medium">UF</th>
                    <th className="pb-2 pr-3 font-medium">Cidade</th>
                    <th className="pb-2 pr-3 font-medium">Produto</th>
                    <th className="pb-2 pr-3 font-medium">Situação</th>
                    <th className="pb-2 pr-3 font-medium">Agente</th>
                    <th className="pb-2 pr-3 font-medium">Status</th>
                    <th className="pb-2 pr-3 font-medium">Duração</th>
                    <th className="pb-2 pr-3 font-medium">HTTP</th>
                    <th className="pb-2 pr-3 font-medium">Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map((log) => {
                    const cfg = STATUS_CONFIG[log.status_envio] || { label: log.status_envio, color: 'bg-gray-100 text-gray-800' };
                    const Icon = cfg.icon;
                    return (
                      <tr key={log.id} className="border-b hover:bg-gray-50 dark:hover:bg-gray-900">
                        <td className="py-2 pr-3 whitespace-nowrap text-xs">{formatDate(log.disparado_em)}</td>
                        <td className="py-2 pr-3 whitespace-nowrap font-mono text-xs">{log.lead_number}</td>
                        <td className="py-2 pr-3 truncate max-w-[150px]" title={log.lead_name}>{log.lead_name || '-'}</td>
                        <td className="py-2 pr-3 text-center">{log.lead_uf || '-'}</td>
                        <td className="py-2 pr-3 truncate max-w-[120px]" title={log.lead_cidade}>{log.lead_cidade || '-'}</td>
                        <td className="py-2 pr-3 truncate max-w-[120px]" title={log.lead_produto}>{log.lead_produto || '-'}</td>
                        <td className="py-2 pr-3 truncate max-w-[100px]" title={log.lead_situacao}>{log.lead_situacao || '-'}</td>
                        <td className="py-2 pr-3 truncate max-w-[120px]" title={log.agent_name}>{log.agent_name || '-'}</td>
                        <td className="py-2 pr-3">
                          <Badge className={`${cfg.color} gap-1 text-xs`} variant="outline">
                            {Icon && <Icon className="w-3 h-3" />}
                            {cfg.label}
                          </Badge>
                        </td>
                        <td className="py-2 pr-3 text-xs">{formatDuration(log.duracao_ms)}</td>
                        <td className="py-2 pr-3 text-xs font-mono">{log.http_status || '-'}</td>
                        <td className="py-2 pr-3 truncate max-w-[200px] text-xs" title={log.motivo_bloqueio}>{log.motivo_bloqueio || '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <span className="text-sm text-muted-foreground">
                {total.toLocaleString('pt-BR')} registros — Página {page + 1} de {totalPages}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
