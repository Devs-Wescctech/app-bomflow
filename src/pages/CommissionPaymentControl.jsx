import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DollarSign, RefreshCw, CheckCircle, Clock,
  Package, ArrowLeft, Users, Calendar, FileText
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { format } from 'date-fns';

const STATUS_LABELS = {
  elegivel: 'Elegível',
  pago: 'Pago',
  pendente: 'Pendente'
};

const STATUS_COLORS = {
  elegivel: 'bg-yellow-100 text-yellow-800',
  pago: 'bg-green-100 text-green-800',
  pendente: 'bg-gray-100 text-gray-800'
};

const BATCH_STATUS_COLORS = {
  aberto: 'bg-blue-100 text-blue-800',
  pago: 'bg-green-100 text-green-800'
};

export default function CommissionPaymentControl() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('control');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterBatchId, setFilterBatchId] = useState('all');

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
    queryKey: ['commission-payment-summary'],
    queryFn: () => fetchWithAuth('/api/functions/commission-payment/summary'),
    staleTime: 60000,
  });

  const { data: controlData, isLoading: loadingControl } = useQuery({
    queryKey: ['commission-payment-control', filterStatus, filterBatchId],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filterStatus !== 'all') params.set('status', filterStatus);
      if (filterBatchId !== 'all') params.set('lote_id', filterBatchId);
      return fetchWithAuth(`/api/functions/commission-payment/control?${params}`);
    },
    staleTime: 30000,
  });

  const { data: batchesData, isLoading: loadingBatches } = useQuery({
    queryKey: ['commission-payment-batches'],
    queryFn: () => fetchWithAuth('/api/functions/commission-payment/batches'),
    staleTime: 60000,
  });

  const runBatchMutation = useMutation({
    mutationFn: () => fetchWithAuth('/api/functions/commission-payment/run-batch', { method: 'POST' }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['commission-payment-summary'] });
      queryClient.invalidateQueries({ queryKey: ['commission-payment-control'] });
      queryClient.invalidateQueries({ queryKey: ['commission-payment-batches'] });
      toast.success(`Lote gerado! ${data.newCommissions || 0} novas comissões, Lote #${data.batchId || 'N/A'}`);
    },
    onError: () => toast.error('Erro ao gerar lote'),
  });

  const confirmMutation = useMutation({
    mutationFn: (id) => fetchWithAuth(`/api/functions/commission-payment/confirm/${id}`, { method: 'PUT' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commission-payment-summary'] });
      queryClient.invalidateQueries({ queryKey: ['commission-payment-control'] });
      toast.success('Pagamento confirmado');
    },
    onError: () => toast.error('Erro ao confirmar pagamento'),
  });

  const confirmBatchMutation = useMutation({
    mutationFn: (batchId) => fetchWithAuth(`/api/functions/commission-payment/confirm-batch/${batchId}`, { method: 'PUT' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commission-payment-summary'] });
      queryClient.invalidateQueries({ queryKey: ['commission-payment-control'] });
      queryClient.invalidateQueries({ queryKey: ['commission-payment-batches'] });
      toast.success('Lote confirmado como pago');
    },
    onError: () => toast.error('Erro ao confirmar lote'),
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

  const groupedByIndicator = {};
  for (const r of records.filter(r => r.status_pagamento === 'elegivel')) {
    const key = r.cpf_indicador || r.nome_indicador || 'unknown';
    if (!groupedByIndicator[key]) {
      groupedByIndicator[key] = { nome: r.nome_indicador, cpf: r.cpf_indicador, cel: r.cel_indicador, items: [] };
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
              <DollarSign className="w-6 h-6 text-green-600" />
              Controle de Pagamento de Comissões
            </h1>
            <p className="text-sm text-gray-500">Ciclo semanal: Quinta 00:00 → Terça 23:59 | Fechamento: Quarta</p>
          </div>
        </div>
        <Button
          onClick={() => runBatchMutation.mutate()}
          disabled={runBatchMutation.isPending}
          className="bg-green-600 hover:bg-green-700"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${runBatchMutation.isPending ? 'animate-spin' : ''}`} />
          {runBatchMutation.isPending ? 'Gerando...' : 'Gerar Lote Semanal'}
        </Button>
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
      </div>

      {activeTab === 'control' && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Registros de Comissão</CardTitle>
              <div className="flex gap-2">
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="text-sm border rounded-md px-2 py-1"
                >
                  <option value="all">Todos</option>
                  <option value="elegivel">Elegíveis</option>
                  <option value="pago">Pagos</option>
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
                <p className="text-sm mt-1">Execute o lote semanal para importar comissões do ERP</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="py-2 px-3">Indicador</th>
                      <th className="py-2 px-3">Indicado</th>
                      <th className="py-2 px-3">Contrato</th>
                      <th className="py-2 px-3">Valor</th>
                      <th className="py-2 px-3">Data Contrato</th>
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
                        <td className="py-2 px-3 font-mono text-xs">{r.contrato_servicos}</td>
                        <td className="py-2 px-3">{r.valor_contrato || '-'}</td>
                        <td className="py-2 px-3 text-xs">{r.data_contrato || '-'}</td>
                        <td className="py-2 px-3">
                          <Badge className={STATUS_COLORS[r.status_pagamento] || 'bg-gray-100'}>
                            {STATUS_LABELS[r.status_pagamento] || r.status_pagamento}
                          </Badge>
                        </td>
                        <td className="py-2 px-3">
                          {r.lote_pagamento_id ? `#${r.lote_pagamento_id}` : '-'}
                        </td>
                        <td className="py-2 px-3">
                          {r.status_pagamento === 'elegivel' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => confirmMutation.mutate(r.id)}
                              disabled={confirmMutation.isPending}
                            >
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Confirmar
                            </Button>
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
            <CardTitle className="text-lg">Lotes de Pagamento</CardTitle>
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
                        <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                          <Package className="w-5 h-5 text-blue-600" />
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
                            className="bg-green-600 hover:bg-green-700"
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

      {activeTab === 'grouped' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Agrupado por Indicador (Elegíveis)</CardTitle>
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
                      <th className="py-2 px-3">Telefone</th>
                      <th className="py-2 px-3">Indicações</th>
                      <th className="py-2 px-3">Contratos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(groupedByIndicator).map(([key, data]) => (
                      <tr key={key} className="border-b hover:bg-gray-50">
                        <td className="py-2 px-3 font-medium">{data.nome || '-'}</td>
                        <td className="py-2 px-3">{data.cpf || '-'}</td>
                        <td className="py-2 px-3">{data.cel || '-'}</td>
                        <td className="py-2 px-3">
                          <Badge className="bg-blue-100 text-blue-800">{data.items.length}</Badge>
                        </td>
                        <td className="py-2 px-3 text-xs">
                          {data.items.map(i => i.contrato_servicos).join(', ')}
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
    </div>
  );
}
