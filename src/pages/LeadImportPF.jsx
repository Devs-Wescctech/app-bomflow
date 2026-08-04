import React, { useState, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Upload, Download, FileSpreadsheet, ArrowLeft, Users, CheckCircle2,
  XCircle, CopyX, Loader2, History, AlertTriangle, AlertCircle
} from 'lucide-react';
import { LEAD_PF_STAGES } from '@/constants/stages';
import { extractApiError } from "@/utils/apiError";

const EXPECTED_HEADERS = ['CPF', 'NOME', 'CIDADE', 'UF', 'TELEFONE'];
const REQUIRED_HEADERS = ['NOME', 'CIDADE', 'UF', 'TELEFONE'];

function authHeaders() {
  const token = localStorage.getItem('accessToken');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

async function apiPost(path, body) {
  const res = await fetch(path, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(await extractApiError(res, 'Erro na requisição'));
  return res.json().catch(() => ({}));
}

async function apiGet(path) {
  const res = await fetch(path, { headers: authHeaders() });
  if (!res.ok) throw new Error(await extractApiError(res, 'Erro na requisição'));
  return res.json().catch(() => ({}));
}

function normalizeHeader(h) {
  return String(h ?? '').trim().toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

const STATUS_CONFIG = {
  valid: { label: 'Válida', badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', Icon: CheckCircle2 },
  error: { label: 'Erro', badge: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300', Icon: XCircle },
  duplicate: { label: 'Duplicada', badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300', Icon: CopyX },
};

export default function LeadImportPF() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);

  const [fileName, setFileName] = useState('');
  const [parsedRows, setParsedRows] = useState(null); // linhas cruas da planilha
  const [preview, setPreview] = useState(null); // resposta do /preview
  const [headerError, setHeaderError] = useState(null);
  const [selectedAgentIds, setSelectedAgentIds] = useState([]);
  const [stage, setStage] = useState('novo');
  const [agentSearch, setAgentSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [report, setReport] = useState(null);

  const { data: user } = useQuery({ queryKey: ['currentUser'], queryFn: () => base44.auth.me() });
  const { data: allAgents = [] } = useQuery({ queryKey: ['agents'], queryFn: () => base44.entities.Agent.list(), staleTime: 30000 });
  const currentAgent = user?.agent || allAgents.find(a => a.userEmail === user?.email || a.email === user?.email);
  const agentType = currentAgent?.agentType || currentAgent?.agent_type;
  const isAllowed = user?.role === 'admin' || agentType === 'admin' ||
    agentType === 'supervisor' || agentType === 'sales_supervisor' || (agentType || '').endsWith('_supervisor');

  const { data: history = [], refetch: refetchHistory } = useQuery({
    queryKey: ['leadImportsHistory'],
    queryFn: () => apiGet('/api/lead-imports'),
    enabled: !!user && isAllowed,
  });

  const activeAgents = useMemo(() => {
    // Somente vendedores do módulo Vendas PF: tipos 'sales' e 'sales_supervisor'.
    const list = allAgents.filter(a => {
      if (a.active === false) return false;
      const type = a.agentType || a.agent_type;
      return type === 'sales' || type === 'sales_supervisor';
    });
    const q = agentSearch.trim().toLowerCase();
    return q ? list.filter(a => (a.name || '').toLowerCase().includes(q)) : list;
  }, [allAgents, agentSearch]);

  const previewMutation = useMutation({
    mutationFn: (rows) => apiPost('/api/lead-imports/preview', { rows }),
    onSuccess: (data) => setPreview(data),
    onError: (err) => toast.error(err.message),
  });

  const confirmMutation = useMutation({
    mutationFn: () => apiPost('/api/lead-imports/confirm', {
      rows: parsedRows,
      agentIds: selectedAgentIds,
      stage,
      fileName,
    }),
    onSuccess: (data) => {
      setReport(data);
      toast.success(`${data.imported} leads importados com sucesso`);
      if (Array.isArray(data.droppedAgents) && data.droppedAgents.length > 0) {
        toast.warning(`${data.droppedAgents.length} vendedor(es) selecionado(s) ficaram fora da distribuição. Veja o relatório.`);
      }
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      refetchHistory();
    },
    onError: (err) => toast.error(`Erro na importação: ${err.message}`),
  });

  const resetAll = () => {
    setFileName('');
    setParsedRows(null);
    setPreview(null);
    setHeaderError(null);
    setReport(null);
    setStatusFilter('all');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      EXPECTED_HEADERS,
      ['123.456.789-09', 'Maria da Silva', 'Belo Horizonte', 'MG', '(31) 99999-8888'],
      ['', 'João Souza (CPF é opcional)', 'Contagem', 'MG', '(31) 98888-7777'],
    ]);
    ws['!cols'] = [{ wch: 18 }, { wch: 32 }, { wch: 22 }, { wch: 6 }, { wch: 18 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Leads');
    XLSX.writeFile(wb, 'modelo-importacao-leads-pf.xlsx');
  };

  const handleFile = async (file) => {
    if (!file) return;
    resetAll();
    setFileName(file.name);
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext)) {
      setHeaderError('Formato de arquivo inválido. Envie uma planilha .xlsx ou .csv.');
      return;
    }
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array', codepage: 65001 });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
      if (!raw.length) {
        setHeaderError('A planilha está vazia.');
        return;
      }
      const headers = raw[0].map(normalizeHeader);
      const missing = REQUIRED_HEADERS.filter(h => !headers.includes(h));
      if (missing.length > 0) {
        setHeaderError(`As colunas da planilha não conferem com o layout padrão (${REQUIRED_HEADERS.join(', ')} — CPF é opcional). Faltando: ${missing.join(', ')}. Baixe o modelo e use esse layout.`);
        return;
      }
      const idx = Object.fromEntries(EXPECTED_HEADERS.map(h => [h, headers.indexOf(h)]));
      const hasCpf = idx.CPF !== -1;
      const rows = raw.slice(1)
        .filter(r => r.some(cell => String(cell ?? '').trim() !== ''))
        .map(r => ({
          cpf: hasCpf ? (r[idx.CPF] ?? '') : '',
          nome: r[idx.NOME] ?? '',
          cidade: r[idx.CIDADE] ?? '',
          uf: r[idx.UF] ?? '',
          telefone: r[idx.TELEFONE] ?? '',
        }));
      if (rows.length === 0) {
        setHeaderError('A planilha não possui nenhuma linha de dados.');
        return;
      }
      setParsedRows(rows);
      previewMutation.mutate(rows);
    } catch (e) {
      console.error(e);
      setHeaderError('Não foi possível ler o arquivo. Verifique se é uma planilha válida (.xlsx ou .csv).');
    }
  };

  const toggleAgent = (id) => {
    setSelectedAgentIds(prev => prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]);
  };

  const filteredPreviewRows = useMemo(() => {
    if (!preview) return [];
    if (statusFilter === 'all') return preview.rows;
    return preview.rows.filter(r => r.status === statusFilter);
  }, [preview, statusFilter]);

  if (user && !isAllowed) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center text-center gap-3">
        <AlertTriangle className="w-10 h-10 text-amber-500" />
        <p className="text-gray-600 dark:text-gray-300">Acesso restrito a administradores e supervisores.</p>
        <Link to={createPageUrl('LeadsKanban')}>
          <Button variant="outline" size="sm"><ArrowLeft className="w-4 h-4 mr-2" />Voltar ao Pipeline</Button>
        </Link>
      </div>
    );
  }

  return (
    <motion.div className="min-h-screen" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="space-y-4 md:space-y-6">
        <div className="page-header-title-section">
          <div>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold font-display bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
              Importar Leads — Vendas PF
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
              Importação em massa por planilha com distribuição igualitária entre vendedores
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <Download className="w-4 h-4 mr-2" />
              Baixar Modelo
            </Button>
            <Link to={createPageUrl('LeadsKanban')}>
              <Button variant="glass" size="sm">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Voltar
              </Button>
            </Link>
          </div>
        </div>

        {report ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                Relatório da Importação
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 p-4 text-center">
                  <p className="text-2xl font-bold text-emerald-600">{report.imported}</p>
                  <p className="text-xs text-gray-500">Importados</p>
                </div>
                <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 p-4 text-center">
                  <p className="text-2xl font-bold text-amber-600">{report.skipped.length}</p>
                  <p className="text-xs text-gray-500">Pulados</p>
                </div>
                <div className="rounded-xl bg-blue-50 dark:bg-blue-900/20 p-4 text-center">
                  <p className="text-2xl font-bold text-blue-600">{report.perAgent.length}</p>
                  <p className="text-xs text-gray-500">Vendedores</p>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5"><Users className="w-4 h-4" />Leads por vendedor</h3>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {report.perAgent.map(pa => (
                    <div key={pa.agentId} className="flex items-center justify-between rounded-lg border border-gray-100 dark:border-gray-800 px-3 py-2 text-sm">
                      <span className="truncate">{pa.agentName}</span>
                      <Badge variant="success">{pa.count}</Badge>
                    </div>
                  ))}
                </div>
              </div>

              {Array.isArray(report.droppedAgents) && report.droppedAgents.length > 0 && (
                <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3">
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                    <AlertCircle className="w-4 h-4" />Vendedores fora da distribuição
                  </h3>
                  <div className="space-y-1">
                    {report.droppedAgents.map(da => (
                      <p key={da.agentId} className="text-xs text-amber-700 dark:text-amber-300">
                        {da.agentName} — {da.reason}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {report.skipped.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">Linhas puladas</h3>
                  <div className="max-h-64 overflow-auto rounded-lg border border-gray-100 dark:border-gray-800">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 dark:bg-gray-800/50 sticky top-0">
                        <tr>
                          <th className="text-left p-2">Linha</th>
                          <th className="text-left p-2">Nome</th>
                          <th className="text-left p-2">Telefone</th>
                          <th className="text-left p-2">Motivo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.skipped.map((s, i) => (
                          <tr key={i} className="border-t border-gray-100 dark:border-gray-800">
                            <td className="p-2">{s.linha}</td>
                            <td className="p-2">{s.nome}</td>
                            <td className="p-2">{s.telefone}</td>
                            <td className="p-2">{s.motivo}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <Button variant="gradient" size="sm" onClick={resetAll}>
                <Upload className="w-4 h-4 mr-2" />
                Nova Importação
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <FileSpreadsheet className="w-5 h-5 text-emerald-500" />
                  1. Planilha
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-gray-500">
                  Layout padrão: <span className="font-mono font-semibold">NOME, CIDADE, UF, TELEFONE</span> (obrigatórias) e <span className="font-mono font-semibold">CPF</span> (opcional).
                  Baixe o modelo para garantir o formato correto.
                </p>
                <div
                  className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-8 text-center cursor-pointer hover:border-emerald-400 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files?.[0]); }}
                >
                  <Upload className="w-8 h-8 mx-auto text-gray-400 mb-2" />
                  <p className="text-sm font-medium">{fileName || 'Clique ou arraste a planilha aqui'}</p>
                  <p className="text-xs text-gray-400 mt-1">Arquivos .xlsx ou .csv</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={(e) => handleFile(e.target.files?.[0])}
                  />
                </div>
                {headerError && (
                  <div className="flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-300">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{headerError}</span>
                  </div>
                )}
                {previewMutation.isPending && (
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Validando linhas e verificando duplicados...
                  </div>
                )}
              </CardContent>
            </Card>

            {preview && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between text-lg">
                    <span>2. Prévia da Validação</span>
                    <div className="flex gap-2 text-xs font-normal">
                      <button onClick={() => setStatusFilter('all')} className={`px-2 py-1 rounded-full border ${statusFilter === 'all' ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'border-gray-200 dark:border-gray-700'}`}>
                        Todas {preview.summary.total}
                      </button>
                      <button onClick={() => setStatusFilter('valid')} className={`px-2 py-1 rounded-full border ${statusFilter === 'valid' ? 'bg-emerald-600 text-white border-emerald-600' : 'border-gray-200 dark:border-gray-700 text-emerald-600'}`}>
                        Válidas {preview.summary.valid}
                      </button>
                      <button onClick={() => setStatusFilter('error')} className={`px-2 py-1 rounded-full border ${statusFilter === 'error' ? 'bg-red-600 text-white border-red-600' : 'border-gray-200 dark:border-gray-700 text-red-600'}`}>
                        Erros {preview.summary.errors}
                      </button>
                      <button onClick={() => setStatusFilter('duplicate')} className={`px-2 py-1 rounded-full border ${statusFilter === 'duplicate' ? 'bg-amber-500 text-white border-amber-500' : 'border-gray-200 dark:border-gray-700 text-amber-600'}`}>
                        Duplicadas {preview.summary.duplicates}
                      </button>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="max-h-96 overflow-auto rounded-lg border border-gray-100 dark:border-gray-800">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 dark:bg-gray-800/50 sticky top-0 z-10">
                        <tr>
                          <th className="text-left p-2">#</th>
                          <th className="text-left p-2">Status</th>
                          <th className="text-left p-2">Nome</th>
                          <th className="text-left p-2">CPF</th>
                          <th className="text-left p-2">Telefone</th>
                          <th className="text-left p-2">Cidade</th>
                          <th className="text-left p-2">UF</th>
                          <th className="text-left p-2">Motivo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredPreviewRows.map((r) => {
                          const cfg = STATUS_CONFIG[r.status];
                          return (
                            <tr key={r.index} className="border-t border-gray-100 dark:border-gray-800">
                              <td className="p-2 text-gray-400">{r.index + 2}</td>
                              <td className="p-2">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${cfg.badge}`}>
                                  <cfg.Icon className="w-3 h-3" />
                                  {cfg.label}
                                </span>
                              </td>
                              <td className="p-2">{r.data.nome}</td>
                              <td className="p-2 font-mono">{r.data.cpf}</td>
                              <td className="p-2 font-mono">{r.data.telefone}</td>
                              <td className="p-2">{r.data.cidade}</td>
                              <td className="p-2">{r.data.uf}</td>
                              <td className="p-2 text-gray-500">{r.reason || '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {preview && preview.summary.valid > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Users className="w-5 h-5 text-emerald-500" />
                    3. Distribuição
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">Etapa inicial do funil</label>
                      <Select value={stage} onValueChange={setStage}>
                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {LEAD_PF_STAGES.filter(s => !['fechado_ganho', 'fechado_perdido'].includes(s.id)).map(s => (
                            <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">Buscar vendedor</label>
                      <Input placeholder="Filtrar por nome..." value={agentSearch} onChange={(e) => setAgentSearch(e.target.value)} />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium">
                        Vendedores participantes ({selectedAgentIds.length} selecionados)
                      </label>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelectedAgentIds(activeAgents.map(a => a.id))}>Selecionar todos</Button>
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelectedAgentIds([])}>Limpar</Button>
                      </div>
                    </div>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-64 overflow-auto p-1">
                      {activeAgents.map(a => (
                        <label
                          key={a.id}
                          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer transition-colors ${selectedAgentIds.includes(a.id) ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20' : 'border-gray-200 dark:border-gray-700'}`}
                        >
                          <Checkbox
                            checked={selectedAgentIds.includes(a.id)}
                            onCheckedChange={() => toggleAgent(a.id)}
                          />
                          <span className="truncate">{a.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {selectedAgentIds.length > 0 && (
                    <p className="text-xs text-gray-500">
                      {preview.summary.valid} leads válidos serão divididos em rodízio entre {selectedAgentIds.length} vendedor(es):
                      aproximadamente {Math.floor(preview.summary.valid / selectedAgentIds.length)} a {Math.ceil(preview.summary.valid / selectedAgentIds.length)} leads cada.
                      A importação é silenciosa (sem automações de boas-vindas ou notificações).
                    </p>
                  )}

                  <Button
                    variant="gradient"
                    disabled={selectedAgentIds.length === 0 || confirmMutation.isPending}
                    onClick={() => confirmMutation.mutate()}
                  >
                    {confirmMutation.isPending ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Importando...</>
                    ) : (
                      <><CheckCircle2 className="w-4 h-4 mr-2" />Confirmar Importação ({preview.summary.valid} leads)</>
                    )}
                  </Button>
                </CardContent>
              </Card>
            )}
          </>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <History className="w-5 h-5 text-gray-400" />
              Histórico de Importações
            </CardTitle>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <p className="text-sm text-gray-400">Nenhuma importação realizada ainda.</p>
            ) : (
              <div className="max-h-72 overflow-auto rounded-lg border border-gray-100 dark:border-gray-800">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 dark:bg-gray-800/50 sticky top-0">
                    <tr>
                      <th className="text-left p-2">Data</th>
                      <th className="text-left p-2">Autor</th>
                      <th className="text-left p-2">Arquivo</th>
                      <th className="text-right p-2">Total</th>
                      <th className="text-right p-2">Importados</th>
                      <th className="text-right p-2">Pulados</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map(h => (
                      <tr key={h.id} className="border-t border-gray-100 dark:border-gray-800">
                        <td className="p-2 whitespace-nowrap">{new Date(h.createdAt).toLocaleString('pt-BR')}</td>
                        <td className="p-2">{h.importedByName}</td>
                        <td className="p-2 truncate max-w-[200px]">{h.fileName || '—'}</td>
                        <td className="p-2 text-right">{h.totalRows}</td>
                        <td className="p-2 text-right text-emerald-600 font-semibold">{h.importedCount}</td>
                        <td className="p-2 text-right text-amber-600">{h.skippedCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}
