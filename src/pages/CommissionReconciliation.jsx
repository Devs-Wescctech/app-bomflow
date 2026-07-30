import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Shield, RefreshCw, CheckCircle, AlertTriangle,
  XCircle, FileText, Calendar, ArrowLeft, ShieldX
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { base44 } from "@/api/base44Client";
import { extractApiError } from "@/utils/apiError";

const TIPO_LABELS = {
  venda_sem_comissao: 'Venda sem Comissão',
  comissao_sem_venda: 'Comissão sem Venda',
  venda_cancelada: 'Venda Cancelada',
  contrato_duplicado: 'Contrato Duplicado'
};

const TIPO_COLORS = {
  venda_sem_comissao: 'bg-yellow-100 text-yellow-800',
  comissao_sem_venda: 'bg-red-100 text-red-800',
  venda_cancelada: 'bg-orange-100 text-orange-800',
  contrato_duplicado: 'bg-purple-100 text-purple-800'
};

const TIPO_ICONS = {
  venda_sem_comissao: AlertTriangle,
  comissao_sem_venda: XCircle,
  venda_cancelada: AlertTriangle,
  contrato_duplicado: FileText
};

export default function CommissionReconciliation() {
  const queryClient = useQueryClient();
  const [filterTipo, setFilterTipo] = useState('all');
  const [filterResolved, setFilterResolved] = useState('false');

  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const isAdmin = currentUser?.role === 'admin' || currentUser?.agent?.agentType === 'admin';
  const allowedSubmenus = currentUser?.agent?.allowedSubmenus || [];
  const agentType = currentUser?.agent?.agentType || '';
  const isSupervisorType = agentType === 'supervisor' || agentType === 'sales_supervisor' || agentType.endsWith('_supervisor');
  const hasAccess = isAdmin
    || allowedSubmenus.includes('CommissionReconciliation')
    || (allowedSubmenus.length === 0 && isSupervisorType);

  if (currentUser && !hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <ShieldX className="w-16 h-16 text-gray-400 mb-4" />
        <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">Acesso Negado</h2>
        <p className="text-gray-500 dark:text-gray-400 mb-4">Você não tem permissão para acessar a Reconciliação de Comissões.</p>
        <Link to="/ReferralPipeline">
          <Button variant="outline"><ArrowLeft className="w-4 h-4 mr-2" />Voltar ao Pipeline</Button>
        </Link>
      </div>
    );
  }

  const fetchWithAuth = async (url, options = {}) => {
    const token = localStorage.getItem('accessToken');
    const resp = await fetch(url, {
      ...options,
      headers: { 'Authorization': `Bearer ${token}`, ...options.headers }
    });
    if (!resp.ok) throw new Error(await extractApiError(resp));
    return resp.json();
  };

  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: ['commission-reconciliation-summary'],
    queryFn: () => fetchWithAuth('/api/functions/commission-reconciliation/summary'),
    staleTime: 60000,
  });

  const { data: logsData, isLoading: loadingLogs } = useQuery({
    queryKey: ['commission-reconciliation-logs', filterTipo, filterResolved],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filterTipo !== 'all') params.set('tipo', filterTipo);
      if (filterResolved !== 'all') params.set('resolved', filterResolved);
      return fetchWithAuth(`/api/functions/commission-reconciliation/logs?${params}`);
    },
    staleTime: 30000,
  });

  const runMutation = useMutation({
    mutationFn: () => fetchWithAuth('/api/functions/commission-reconciliation/run', { method: 'POST' }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['commission-reconciliation-summary'] });
      queryClient.invalidateQueries({ queryKey: ['commission-reconciliation-logs'] });
      toast.success(`Reconciliação concluída. ${data.issuesFound || 0} inconsistências encontradas.`);
    },
    onError: () => toast.error('Erro ao executar reconciliação'),
  });

  const resolveMutation = useMutation({
    mutationFn: (id) => fetchWithAuth(`/api/functions/commission-reconciliation/resolve/${id}`, { method: 'PUT' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commission-reconciliation-summary'] });
      queryClient.invalidateQueries({ queryKey: ['commission-reconciliation-logs'] });
      toast.success('Inconsistência marcada como resolvida');
    },
    onError: () => toast.error('Erro ao resolver inconsistência'),
  });

  const logs = logsData?.logs || [];
  const byType = summary?.byType || [];

  const totalPending = byType.reduce((sum, t) => sum + (parseInt(t.pending) || 0), 0);
  const totalResolved = byType.reduce((sum, t) => sum + (parseInt(t.resolved) || 0), 0);
  const lastRun = summary?.lastRun?.last_run;

  const safeFormat = (dateStr) => {
    if (!dateStr) return '-';
    try { return format(new Date(dateStr), 'dd/MM/yyyy HH:mm'); } catch { return dateStr; }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/ReferralCommissions">
            <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-1" /> Voltar</Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Shield className="w-6 h-6 text-blue-600" />
              Reconciliação de Comissões
            </h1>
            <p className="text-sm text-gray-500">
              Auditoria automática de inconsistências entre ERP e comissões
            </p>
          </div>
        </div>
        <Button
          onClick={() => runMutation.mutate()}
          disabled={runMutation.isPending}
          className="bg-blue-600 hover:bg-blue-700"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${runMutation.isPending ? 'animate-spin' : ''}`} />
          {runMutation.isPending ? 'Executando...' : 'Executar Reconciliação'}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Pendentes</p>
                <p className="text-3xl font-bold text-yellow-600">{totalPending}</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Resolvidas</p>
                <p className="text-3xl font-bold text-green-600">{totalResolved}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Tipos</p>
                <p className="text-3xl font-bold">{byType.length}</p>
              </div>
              <FileText className="w-8 h-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Última Execução</p>
                <p className="text-sm font-medium">
                  {lastRun ? safeFormat(lastRun) : 'Nunca'}
                </p>
              </div>
              <Calendar className="w-8 h-8 text-gray-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {byType.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Resumo por Tipo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {byType.map((item) => {
                const Icon = TIPO_ICONS[item.tipo_problema] || AlertTriangle;
                return (
                  <div
                    key={item.tipo_problema}
                    className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-gray-50"
                    onClick={() => setFilterTipo(item.tipo_problema)}
                  >
                    <Icon className="w-5 h-5 text-gray-500" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {TIPO_LABELS[item.tipo_problema] || item.tipo_problema}
                      </p>
                      <p className="text-xs text-gray-500">
                        {item.pending} pendentes · {item.resolved} resolvidas
                      </p>
                    </div>
                    <span className="text-lg font-bold">{item.total}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Registros de Inconsistências</CardTitle>
            <div className="flex gap-2">
              <select
                value={filterTipo}
                onChange={(e) => setFilterTipo(e.target.value)}
                className="text-sm border rounded-md px-2 py-1"
              >
                <option value="all">Todos os tipos</option>
                {Object.entries(TIPO_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
              <select
                value={filterResolved}
                onChange={(e) => setFilterResolved(e.target.value)}
                className="text-sm border rounded-md px-2 py-1"
              >
                <option value="all">Todos</option>
                <option value="false">Pendentes</option>
                <option value="true">Resolvidas</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loadingLogs ? (
            <div className="text-center py-8 text-gray-500">Carregando...</div>
          ) : logs.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Shield className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>Nenhuma inconsistência encontrada</p>
              <p className="text-sm mt-1">Execute a reconciliação para verificar</p>
            </div>
          ) : (
            <div className="space-y-3">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className={`p-4 rounded-lg border ${log.resolved ? 'bg-gray-50 opacity-70' : 'bg-white'}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className={TIPO_COLORS[log.tipo_problema] || 'bg-gray-100'}>
                          {TIPO_LABELS[log.tipo_problema] || log.tipo_problema}
                        </Badge>
                        {log.resolved && (
                          <Badge className="bg-green-100 text-green-800">Resolvida</Badge>
                        )}
                      </div>
                      <p className="text-sm text-gray-700">{log.descricao}</p>
                      <div className="flex gap-4 mt-2 text-xs text-gray-500">
                        {log.contrato_servicos && (
                          <span>Contrato: <strong>{log.contrato_servicos}</strong></span>
                        )}
                        {log.cpf_indicado && (
                          <span>CPF: <strong>{log.cpf_indicado}</strong></span>
                        )}
                        <span>Data: {safeFormat(log.created_at)}</span>
                        {log.resolved_by && (
                          <span>Resolvida por: {log.resolved_by}</span>
                        )}
                      </div>
                    </div>
                    {!log.resolved && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => resolveMutation.mutate(log.id)}
                        disabled={resolveMutation.isPending}
                      >
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Resolver
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
