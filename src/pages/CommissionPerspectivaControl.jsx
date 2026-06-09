import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DollarSign, RefreshCw, CheckCircle, Clock,
  Package, ArrowLeft, Users, Calendar, FileText, ShieldX, Send, AlertTriangle
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { getCommissionFromConversions } from '@/utils/commissionRules';
import { base44 } from "@/api/base44Client";

const STATUS_LABELS = {
  elegivel: 'Elegível',
  pago: 'Pago',
  pendente: 'Pendente',
  reativacao: 'Reativação',
  pendente_conciliacao: 'Pendente de Conciliação'
};

const STATUS_COLORS = {
  elegivel: 'bg-yellow-100 text-yellow-800',
  pago: 'bg-green-100 text-green-800',
  pendente: 'bg-gray-100 text-gray-800',
  reativacao: 'bg-purple-100 text-purple-800',
  pendente_conciliacao: 'bg-orange-100 text-orange-800'
};

const BATCH_STATUS_COLORS = {
  aberto: 'bg-blue-100 text-blue-800',
  pago: 'bg-green-100 text-green-800'
};

export default function CommissionPerspectivaControl() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('control');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterBatchId, setFilterBatchId] = useState('all');
  const [filterDataInicio, setFilterDataInicio] = useState('');
  const [filterDataFim, setFilterDataFim] = useState('');

  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const isAdmin = currentUser?.role === 'admin' || currentUser?.agent?.agentType === 'admin';
  const allowedSubmenus = currentUser?.agent?.allowedSubmenus || [];
  const agentType = currentUser?.agent?.agentType || '';
  const isSupervisorType = agentType === 'supervisor' || agentType === 'sales_supervisor' || agentType.endsWith('_supervisor');
  const hasAccess = isAdmin
    || allowedSubmenus.includes('CommissionPaymentControl')
    || (allowedSubmenus.length === 0 && isSupervisorType);

  if (currentUser && !hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <ShieldX className="w-16 h-16 text-gray-400 mb-4" />
        <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">Acesso Negado</h2>
        <p className="text-gray-500 dark:text-gray-400 mb-4">Você não tem permissão para acessar este módulo.</p>
        <Link to="/ReferralCommissions">
          <Button variant="outline"><ArrowLeft className="w-4 h-4 mr-2" />Voltar</Button>
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
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
  };

  const { data: summaryData } = useQuery({
    queryKey: ['commission-perspectiva-summary'],
    queryFn: () => fetchWithAuth('/api/functions/commission-perspectiva/summary'),
    staleTime: 60000,
  });

  const { data: controlData, isLoading: loadingControl } = useQuery({
    queryKey: ['commission-perspectiva-control', filterStatus, filterBatchId, filterDataInicio, filterDataFim],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filterStatus !== 'all') params.set('status', filterStatus);
      if (filterBatchId !== 'all') params.set('lote_id', filterBatchId);
      if (filterDataInicio) params.set('data_inicio', filterDataInicio);
      if (filterDataFim) params.set('data_fim', filterDataFim);
      return fetchWithAuth(`/api/functions/commission-perspectiva/control?${params}`);
    },
    staleTime: 30000,
  });

  const { data: batchesData, isLoading: loadingBatches } = useQuery({
    queryKey: ['commission-perspectiva-batches'],
    queryFn: () => fetchWithAuth('/api/functions/commission-perspectiva/batches'),
    staleTime: 60000,
  });

  const runBatchMutation = useMutation({
    mutationFn: () => fetchWithAuth('/api/functions/commission-perspectiva/run-batch', { method: 'POST' }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['commission-perspectiva-summary'] });
      queryClient.invalidateQueries({ queryKey: ['commission-perspectiva-control'] });
      queryClient.invalidateQueries({ queryKey: ['commission-perspectiva-batches'] });
      toast.success(`Lote gerado! ${data.newCommissions || 0} novas comissões${data.batchId ? `, Lote #${data.batchId}` : ''}`);
    },
    onError: () => toast.error('Erro ao gerar lote'),
  });

  const confirmMutation = useMutation({
    mutationFn: (id) => fetchWithAuth(`/api/functions/commission-perspectiva/confirm/${id}`, { method: 'PUT' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commission-perspectiva-summary'] });
      queryClient.invalidateQueries({ queryKey: ['commission-perspectiva-control'] });
      toast.success('Pagamento confirmado');
    },
    onError: () => toast.error('Erro ao confirmar pagamento'),
  });

  const reativacaoMutation = useMutation({
    mutationFn: (id) => fetchWithAuth(`/api/functions/commission-perspectiva/reativacao/${id}`, { method: 'PUT' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commission-perspectiva-summary'] });
      queryClient.invalidateQueries({ queryKey: ['commission-perspectiva-control'] });
      toast.success('Status alterado para Reativação');
    },
    onError: () => toast.error('Erro ao alterar status'),
  });

  const pendenteConciliacaoMutation = useMutation({
    mutationFn: (id) => fetchWithAuth(`/api/functions/commission-perspectiva/pendente-conciliacao/${id}`, { method: 'PUT' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commission-perspectiva-summary'] });
      queryClient.invalidateQueries({ queryKey: ['commission-perspectiva-control'] });
      toast.success('Marcado como Pendente de Conciliação');
    },
    onError: () => toast.error('Erro ao alterar status'),
  });

  const restoreElegivelMutation = useMutation({
    mutationFn: (id) => fetchWithAuth(`/api/functions/commission-perspectiva/restore-elegivel/${id}`, { method: 'PUT' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commission-perspectiva-summary'] });
      queryClient.invalidateQueries({ queryKey: ['commission-perspectiva-control'] });
      toast.success('Restaurado para Elegível');
    },
    onError: () => toast.error('Erro ao restaurar'),
  });

  const confirmBatchMutation = useMutation({
    mutationFn: (batchId) => fetchWithAuth(`/api/functions/commission-perspectiva/confirm-batch/${batchId}`, { method: 'PUT' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commission-perspectiva-summary'] });
      queryClient.invalidateQueries({ queryKey: ['commission-perspectiva-control'] });
      queryClient.invalidateQueries({ queryKey: ['commission-perspectiva-batches'] });
      toast.success('Lote confirmado como pago');
    },
    onError: () => toast.error('Erro ao confirmar lote'),
  });

  const sendReportMutation = useMutation({
    mutationFn: () => fetchWithAuth('/api/functions/commission-perspectiva/report/send', { method: 'POST' }),
    onSuccess: (data) => {
      if (data.skipped) {
        toast.info(`Envio ignorado: ${data.message}`);
      } else {
        toast.success(`Relatório enviado ao financeiro`);
      }
    },
    onError: () => toast.error('Erro ao enviar relatório'),
  });

  const records = controlData?.records || [];
  const batches = batchesData?.batches || [];
  const byStatus = summaryData?.byStatus || [];
  const batchSummary = summaryData?.batches || {};

  const totalEligible = byStatus.find(s => s.status_pagamento === 'elegivel');
  const totalPaid = byStatus.find(s => s.status_pagamento === 'pago');

  const safeFormat = (dateStr) => {
    if (!dateStr) return '-';
    try { return format(new Date(dateStr), 'dd/MM/yyyy HH:mm'); } catch { return String(dateStr); }
  };

  const safeFormatDate = (dateStr) => {
    if (!dateStr) return '-';
    try { return format(new Date(dateStr), 'dd/MM/yyyy'); } catch { return String(dateStr); }
  };

  const allCpfs = [...new Set(records.map(r => r.cpf_indicador).filter(Boolean))];

  const { data: pixData } = useQuery({
    queryKey: ['commission-perspectiva-pix-keys', allCpfs.join(',')],
    queryFn: async () => {
      const pixMap = {};
      await Promise.all(allCpfs.map(async (cpf) => {
        try {
          const res = await fetchWithAuth(`/api/functions/indicadores-pix/${cpf}`);
          if (res?.chave_pix) pixMap[cpf] = res.chave_pix;
        } catch {}
      }));
      return pixMap;
    },
    enabled: allCpfs.length > 0,
    staleTime: 60000,
  });
  const pixMap = pixData || {};

  const { data: corretorData } = useQuery({
    queryKey: ['commission-perspectiva-corretor-cpfs'],
    queryFn: () => fetchWithAuth('/api/functions/commission-perspectiva/corretor-cpfs'),
    staleTime: 300000,
  });
  const corretorCpfs = new Set((corretorData?.cpfs || []).map(c => String(c).replace(/\D/g, '')));

  const { data: semRegistroData, isLoading: loadingSemRegistro } = useQuery({
    queryKey: ['commission-perspectiva-sem-registro-erp'],
    queryFn: () => fetchWithAuth('/api/functions/commission-perspectiva/sem-registro-erp'),
    staleTime: 60000,
  });
  const semRegistroRecords = semRegistroData?.records || [];

  const groupedByIndicator = {};
  for (const r of records.filter(r => r.status_pagamento === 'elegivel')) {
    const key = r.cpf_indicador || r.nome_indicador || 'unknown';
    if (!groupedByIndicator[key]) {
      groupedByIndicator[key] = { nome: r.nome_indicador, cpf: r.cpf_indicador, items: [] };
    }
    groupedByIndicator[key].items.push(r);
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link to="/ReferralCommissions">
            <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-1" /> Voltar</Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <DollarSign className="w-6 h-6 text-emerald-600" />
              Comissões ERP (Perspectivas Liquidadas)
            </h1>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            onClick={() => {
              if (confirm('Enviar relatório de comissões ERP para o financeiro?')) {
                sendReportMutation.mutate();
              }
            }}
            disabled={sendReportMutation.isPending}
            variant="outline"
            className="text-emerald-700 border-emerald-300 hover:bg-emerald-50"
          >
            <Send className={`w-4 h-4 mr-2 ${sendReportMutation.isPending ? 'animate-pulse' : ''}`} />
            {sendReportMutation.isPending ? 'Enviando...' : 'Enviar para Financeiro'}
          </Button>
          <Button
            onClick={() => runBatchMutation.mutate()}
            disabled={runBatchMutation.isPending}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${runBatchMutation.isPending ? 'animate-spin' : ''}`} />
            {runBatchMutation.isPending ? 'Gerando...' : 'Gerar Lote Semanal'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Elegíveis</p>
                <p className="text-3xl font-bold text-yellow-600">{totalEligible?.total || 0}</p>
              </div>
              <Clock className="w-8 h-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Pagas</p>
                <p className="text-3xl font-bold text-green-600">{totalPaid?.total || 0}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Lotes Abertos</p>
                <p className="text-3xl font-bold text-blue-600">{batchSummary.abertos || 0}</p>
              </div>
              <Package className="w-8 h-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Lotes Pagos</p>
                <p className="text-3xl font-bold text-green-600">{batchSummary.pagos || 0}</p>
              </div>
              <DollarSign className="w-8 h-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-2 border-b pb-2">
        <Button
          variant={activeTab === 'control' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('control')}
        >
          <FileText className="w-4 h-4 mr-1" /> Comissões
        </Button>
        <Button
          variant={activeTab === 'batches' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('batches')}
        >
          <Package className="w-4 h-4 mr-1" /> Lotes
        </Button>
        <Button
          variant={activeTab === 'grouped' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('grouped')}
        >
          <Users className="w-4 h-4 mr-1" /> Por Indicador
        </Button>
        <Button
          variant={activeTab === 'alertas' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('alertas')}
          className={semRegistroRecords.length > 0 ? 'text-amber-700' : ''}
        >
          <AlertTriangle className="w-4 h-4 mr-1" />
          Alertas
          {semRegistroRecords.length > 0 && (
            <span className="ml-1 bg-amber-500 text-white text-xs rounded-full px-1.5 py-0.5 leading-none">
              {semRegistroRecords.length}
            </span>
          )}
        </Button>
      </div>

      {activeTab === 'control' && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Registros de Comissão (ERP)</CardTitle>
              <div className="flex gap-2 flex-wrap items-center">
                <div className="flex items-center gap-1">
                  <label className="text-xs text-gray-500">Data Pagamento:</label>
                  <input
                    type="date"
                    value={filterDataInicio}
                    onChange={(e) => setFilterDataInicio(e.target.value)}
                    className="text-sm border rounded-md px-2 py-1"
                    title="Data Pagamento (De)"
                  />
                  <span className="text-xs text-gray-400">até</span>
                  <input
                    type="date"
                    value={filterDataFim}
                    onChange={(e) => setFilterDataFim(e.target.value)}
                    className="text-sm border rounded-md px-2 py-1"
                    title="Data Pagamento (Até)"
                  />
                </div>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="text-sm border rounded-md px-2 py-1"
                >
                  <option value="all">Todos</option>
                  <option value="elegivel">Elegíveis</option>
                  <option value="pago">Pagos</option>
                  <option value="reativacao">Reativação</option>
                  <option value="pendente_conciliacao">Pendente de Conciliação</option>
                </select>
                <select
                  value={filterBatchId}
                  onChange={(e) => setFilterBatchId(e.target.value)}
                  className="text-sm border rounded-md px-2 py-1"
                >
                  <option value="all">Todos os lotes</option>
                  {batches.map(b => (
                    <option key={b.id} value={b.id}>Lote #{b.id}</option>
                  ))}
                </select>
                {(filterDataInicio || filterDataFim || filterStatus !== 'all' || filterBatchId !== 'all') && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-xs"
                    onClick={() => {
                      setFilterDataInicio('');
                      setFilterDataFim('');
                      setFilterStatus('all');
                      setFilterBatchId('all');
                    }}
                  >
                    Limpar
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loadingControl ? (
              <div className="text-center py-8 text-gray-500">Carregando...</div>
            ) : records.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <DollarSign className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p>Nenhum registro encontrado</p>
                <p className="text-sm mt-1">Execute o lote semanal para importar perspectivas liquidadas do ERP</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="py-2 px-3">Indicador</th>
                      <th className="py-2 px-3">Indicado</th>
                      <th className="py-2 px-3">Produto</th>
                      <th className="py-2 px-3">Data Pagamento</th>
                      <th className="py-2 px-3">Status</th>
                      <th className="py-2 px-3">Lote</th>
                      <th className="py-2 px-3">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((r) => (
                      <tr key={r.id} className="border-b hover:bg-gray-50">
                        <td className="py-2 px-3">
                          <div className="font-medium">{r.nome_indicador || '-'}</div>
                          <div className="text-xs text-gray-500">{r.cpf_indicador || '-'}</div>
                        </td>
                        <td className="py-2 px-3">
                          <div>{r.nome_indicado || '-'}</div>
                          <div className="text-xs text-gray-500">{r.cpf_indicado || '-'}</div>
                        </td>
                        <td className="py-2 px-3">
                          {r.produto ? (
                            <div className="flex flex-col gap-1">
                              <Badge className="bg-violet-100 text-violet-800 text-xs w-fit">{r.produto}</Badge>
                              {['BOM AUTO', 'BOM MED', 'BOM PET', 'BOMPET'].some(kw => String(r.produto || '').trim().toUpperCase().includes(kw)) && (
                                <Badge className="bg-amber-100 text-amber-800 text-xs w-fit">val. contrato</Badge>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-xs">{safeFormatDate(r.data_pagamento)}</td>
                        <td className="py-2 px-3">
                          <Badge className={STATUS_COLORS[r.status_pagamento || 'elegivel'] || 'bg-gray-100'}>
                            {STATUS_LABELS[r.status_pagamento || 'elegivel'] || r.status_pagamento}
                          </Badge>
                        </td>
                        <td className="py-2 px-3">
                          {r.lote_pagamento_id ? `#${r.lote_pagamento_id}` : '-'}
                        </td>
                        <td className="py-2 px-3">
                          {(!r.status_pagamento || r.status_pagamento === 'elegivel') && (
                            <div className="flex gap-1 flex-wrap">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => confirmMutation.mutate(r.id)}
                                disabled={confirmMutation.isPending}
                              >
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Confirmar
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-purple-600 border-purple-200 hover:bg-purple-50"
                                onClick={() => reativacaoMutation.mutate(r.id)}
                                disabled={reativacaoMutation.isPending}
                              >
                                Reativação
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-orange-600 border-orange-200 hover:bg-orange-50"
                                onClick={() => pendenteConciliacaoMutation.mutate(r.id)}
                                disabled={pendenteConciliacaoMutation.isPending}
                              >
                                Pend. Conciliação
                              </Button>
                            </div>
                          )}
                          {r.status_pagamento === 'pendente_conciliacao' && (
                            <div className="flex gap-1 flex-wrap">
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-yellow-700 border-yellow-200 hover:bg-yellow-50"
                                onClick={() => restoreElegivelMutation.mutate(r.id)}
                                disabled={restoreElegivelMutation.isPending}
                              >
                                Voltar p/ Elegível
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => confirmMutation.mutate(r.id)}
                                disabled={confirmMutation.isPending}
                              >
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Confirmar
                              </Button>
                            </div>
                          )}
                          {r.status_pagamento === 'pago' && (
                            <span className="text-xs text-gray-500">
                              {safeFormat(r.data_confirmacao_pagamento)}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === 'batches' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Lotes de Pagamento (ERP)</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingBatches ? (
              <div className="text-center py-8 text-gray-500">Carregando...</div>
            ) : batches.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Package className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p>Nenhum lote gerado</p>
              </div>
            ) : (
              <div className="space-y-3">
                {batches.map((batch) => (
                  <div key={batch.id} className="p-4 rounded-lg border bg-white">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                          <Package className="w-5 h-5 text-emerald-600" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold">Lote #{batch.id}</span>
                            <Badge className={BATCH_STATUS_COLORS[batch.status] || 'bg-gray-100'}>
                              {batch.status === 'aberto' ? 'Aberto' : 'Pago'}
                            </Badge>
                          </div>
                          <p className="text-sm text-gray-500">
                            {safeFormatDate(batch.periodo_inicio)} → {safeFormatDate(batch.periodo_fim)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="flex items-center gap-1 text-sm">
                            <Users className="w-4 h-4" />
                            {batch.total_indicadores} indicadores
                          </div>
                          <div className="font-bold text-green-600">
                            R$ {parseFloat(batch.valor_total || 0).toFixed(2)}
                          </div>
                        </div>
                        {batch.status === 'aberto' && (
                          <Button
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700"
                            onClick={() => {
                              if (confirm(`Confirmar pagamento do Lote #${batch.id}?`)) {
                                confirmBatchMutation.mutate(batch.id);
                              }
                            }}
                            disabled={confirmBatchMutation.isPending}
                          >
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Confirmar Lote
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === 'alertas' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Indicações fechado_ganho sem registro ERP
            </CardTitle>
            <p className="text-sm text-gray-500 mt-1">
              Estas indicações estão em <strong>fechado_ganho</strong> no CRM mas o CPF do indicado ainda não consta em <code className="text-xs bg-gray-100 px-1 rounded">erp_perspectivas_negocios</code>. Elas estão fora do fluxo de validação de pagamento automático.
            </p>
          </CardHeader>
          <CardContent>
            {loadingSemRegistro ? (
              <div className="text-center py-8 text-gray-500">Carregando...</div>
            ) : semRegistroRecords.length === 0 ? (
              <div className="text-center py-8 text-green-600">
                <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-400" />
                <p className="font-medium">Tudo sincronizado</p>
                <p className="text-sm text-gray-500 mt-1">Nenhuma indicação fechado_ganho fora do fluxo ERP.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <div className="mb-3 p-3 rounded-lg bg-amber-50 border border-amber-200 flex items-center gap-2 text-sm text-amber-800">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{semRegistroRecords.length} indicação(ões) fora do fluxo. Execute "Gerar Lote Semanal" ou aguarde o cron de sincronização para inserir automaticamente.</span>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="py-2 px-3">Indicado</th>
                      <th className="py-2 px-3">CPF Indicado</th>
                      <th className="py-2 px-3">Indicador</th>
                      <th className="py-2 px-3">Vendedor</th>
                      <th className="py-2 px-3">Última atualização</th>
                      <th className="py-2 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {semRegistroRecords.map((r) => (
                      <tr key={r.id} className="border-b hover:bg-amber-50">
                        <td className="py-2 px-3 font-medium">{r.referred_name || '-'}</td>
                        <td className="py-2 px-3 font-mono text-xs">{r.referred_cpf || '-'}</td>
                        <td className="py-2 px-3">
                          <div>{r.referrer_name || '-'}</div>
                          <div className="text-xs text-gray-400">{r.referrer_cpf || ''}</div>
                        </td>
                        <td className="py-2 px-3 text-xs text-gray-600">{r.vendedor_name || '-'}</td>
                        <td className="py-2 px-3 text-xs">{safeFormatDate(r.updated_at)}</td>
                        <td className="py-2 px-3">
                          <Badge className="bg-amber-100 text-amber-800 text-xs">Sem registro ERP</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === 'grouped' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Agrupado por Indicador — Elegíveis (ERP)</CardTitle>
          </CardHeader>
          <CardContent>
            {Object.keys(groupedByIndicator).length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p>Nenhuma comissão elegível para agrupar</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="py-2 px-3">Indicador</th>
                      <th className="py-2 px-3">CPF</th>
                      <th className="py-2 px-3">PIX</th>
                      <th className="py-2 px-3">Conversões</th>
                      <th className="py-2 px-3">Nível</th>
                      <th className="py-2 px-3">Comissão</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(groupedByIndicator).map(([key, data]) => {
                      const historicoPago = parseInt(data.items[0]?.historico_pago_count || 0);
                      const totalCumulative = data.items.length + historicoPago;
                      const level = totalCumulative >= 13 ? 3 : totalCumulative >= 4 ? 2 : 1;
                      const cpfNorm = data.cpf ? String(data.cpf).replace(/\D/g, '') : '';
                      const isCorretor = cpfNorm ? corretorCpfs.has(cpfNorm) : false;
                      const unitValue = isCorretor
                        ? (level === 3 ? 400 : level === 2 ? 300 : 200)
                        : (level === 3 ? 200 : level === 2 ? 150 : 100);
                      const FE_SPECIAL_KEYWORDS = ['BOM AUTO', 'BOM MED', 'BOM PET', 'BOMPET'];
                      const isFESpecial = (p) => p ? FE_SPECIAL_KEYWORDS.some(kw => String(p).trim().toUpperCase().includes(kw)) : false;
                      let totalSpecial = 0;
                      let countRegular = 0;
                      for (const item of data.items) {
                        const prod = item.produto ? String(item.produto).trim().toUpperCase() : '';
                        if (!isCorretor && isFESpecial(prod)) {
                          totalSpecial += parseFloat(item.valor_contrato || item.valor_titulo || 0);
                        } else {
                          countRegular += 1;
                        }
                      }
                      const value = totalSpecial + (unitValue * countRegular);
                      const hasSpecial = totalSpecial > 0;
                      const nivelLabel = level === 3 ? '3 (13+)' : level === 2 ? '2 (4-12)' : '1 (1-3)';
                      return (
                        <tr key={key} className="border-b hover:bg-gray-50">
                          <td className="py-2 px-3 font-medium">{data.nome || '-'}</td>
                          <td className="py-2 px-3">{data.cpf || '-'}</td>
                          <td className="py-2 px-3">
                            {pixMap[data.cpf] ? (
                              <span className="text-sm">{pixMap[data.cpf]}</span>
                            ) : (
                              <span className="text-xs text-gray-400 italic">PIX não cadastrado</span>
                            )}
                          </td>
                          <td className="py-2 px-3">
                            <Badge className="bg-emerald-100 text-emerald-800">{data.items.length}</Badge>
                          </td>
                          <td className="py-2 px-3 text-sm">{nivelLabel}</td>
                          <td className="py-2 px-3 font-bold text-green-600">
                            R$ {value.toFixed(2)}
                            {hasSpecial && (
                              <div className="text-xs font-normal text-amber-600 mt-0.5">
                                R$ {totalSpecial.toFixed(2)} vc + R$ {(unitValue * countRegular).toFixed(2)} tier
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
