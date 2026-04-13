import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Search, Edit2, Loader2, ChevronLeft, ChevronRight, List, X, Save
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { REFERRAL_STAGES } from "@/constants/stages";

const API_BASE = '/api';

function getAuthHeaders() {
  const token = localStorage.getItem('accessToken');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

function formatCPF(cpf) {
  if (!cpf) return '-';
  const clean = cpf.replace(/\D/g, '');
  if (clean.length === 11) return clean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  return cpf;
}

export default function ReferralRelacao() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({ cpfIndicador: '', nomeIndicado: '', vendedorId: '' });
  const [appliedFilters, setAppliedFilters] = useState({ cpfIndicador: '', nomeIndicado: '', vendedorId: '' });
  const [page, setPage] = useState(1);
  const [editItem, setEditItem] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const limit = 50;

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    params.set('page', page);
    params.set('limit', limit);
    if (appliedFilters.cpfIndicador) params.set('cpfIndicador', appliedFilters.cpfIndicador);
    if (appliedFilters.nomeIndicado) params.set('nomeIndicado', appliedFilters.nomeIndicado);
    if (appliedFilters.vendedorId) params.set('vendedorId', appliedFilters.vendedorId);
    return params.toString();
  }, [page, appliedFilters]);

  const { data, isLoading } = useQuery({
    queryKey: ['referrals-relacao', queryParams],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/functions/referrals-relacao?${queryParams}`, {
        headers: { ...getAuthHeaders() },
      });
      if (!res.ok) throw new Error('Erro ao carregar indicações');
      return res.json();
    },
  });

  const { data: agentTypesData } = useQuery({
    queryKey: ['agent-types-relacao'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/agent-types`, { headers: { ...getAuthHeaders() } });
      if (!res.ok) return [];
      const result = await res.json();
      return Array.isArray(result) ? result : [];
    },
  });

  const { data: agentsData } = useQuery({
    queryKey: ['agents-list-relacao'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/agents`, { headers: { ...getAuthHeaders() } });
      if (!res.ok) return [];
      const result = await res.json();
      return Array.isArray(result) ? result : [];
    },
  });

  const referralAgentTypeKeys = useMemo(() => {
    if (!agentTypesData) return new Set();
    return new Set(
      agentTypesData
        .filter(t => t.modules && (t.modules.includes('referral') || t.modules.includes('all')))
        .map(t => t.key)
    );
  }, [agentTypesData]);

  const agents = useMemo(() => {
    if (!agentsData) return [];
    return agentsData.filter(a => a.agentType === 'indicacoes_atendente');
  }, [agentsData]);
  const referrals = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / limit);

  function handleSearch() {
    setAppliedFilters({ ...filters });
    setPage(1);
  }

  function handleClear() {
    setFilters({ cpfIndicador: '', nomeIndicado: '', vendedorId: '' });
    setAppliedFilters({ cpfIndicador: '', nomeIndicado: '', vendedorId: '' });
    setPage(1);
  }

  function openEdit(item) {
    setEditItem(item);
    setEditForm({
      referrerCpf: item.referrerCpf || '',
      referrerName: item.referrerName || '',
      chavePix: item.chavePix || '',
      referredName: item.referredName || '',
      referredCpf: item.referredCpf || '',
      agentId: item.agentId || '',
      stage: item.stage || '',
    });
  }

  async function handleSave() {
    if (!editItem) return;
    setSaving(true);
    try {
      const payload = {
        referrerCpf: editForm.referrerCpf,
        referrerName: editForm.referrerName,
        referredName: editForm.referredName,
        referredCpf: editForm.referredCpf,
        agentId: editForm.agentId || null,
        stage: editForm.stage || undefined,
      };

      const res = await fetch(`${API_BASE}/referrals/${editItem.id}`, {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Erro ao salvar');
      }

      if (editForm.chavePix) {
        const cleanCpf = (editForm.referrerCpf || '').replace(/\D/g, '');
        if (cleanCpf) {
          await fetch(`${API_BASE}/functions/indicadores-pix/${cleanCpf}`, {
            method: 'PUT',
            headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ chavePix: editForm.chavePix }),
          });
        }
      }

      toast.success('Indicação atualizada com sucesso!');
      setEditItem(null);
      queryClient.invalidateQueries({ queryKey: ['referrals-relacao'] });
    } catch (err) {
      toast.error('Erro ao salvar: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 text-white">
          <List className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Relação Indicações</h1>
          <p className="text-sm text-gray-500">Listagem e gestão de todas as indicações cadastradas</p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div>
              <Label className="text-xs text-gray-600">CPF Indicador</Label>
              <Input
                placeholder="000.000.000-00"
                value={filters.cpfIndicador}
                onChange={e => setFilters({ ...filters, cpfIndicador: e.target.value })}
                className="mt-1"
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
              />
            </div>
            <div>
              <Label className="text-xs text-gray-600">Nome Indicado</Label>
              <Input
                placeholder="Buscar por nome..."
                value={filters.nomeIndicado}
                onChange={e => setFilters({ ...filters, nomeIndicado: e.target.value })}
                className="mt-1"
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
              />
            </div>
            <div>
              <Label className="text-xs text-gray-600">Vendedor</Label>
              <Select value={filters.vendedorId} onValueChange={val => setFilters({ ...filters, vendedorId: val === '_all' ? '' : val })}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Todos os vendedores" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">Todos</SelectItem>
                  {agents.filter(a => a.active !== false).map(a => (
                    <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSearch} className="gap-2 bg-amber-600 hover:bg-amber-700 text-white">
                <Search className="w-4 h-4" /> Buscar
              </Button>
              <Button variant="outline" onClick={handleClear} className="gap-2">
                <X className="w-4 h-4" /> Limpar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {total.toLocaleString('pt-BR')} indicação(ões) encontrada(s)
            </CardTitle>
            {totalPages > 1 && (
              <span className="text-xs text-gray-500">
                Página {page} de {totalPages}
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
              <span className="ml-2 text-gray-500">Carregando...</span>
            </div>
          ) : referrals.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              Nenhuma indicação encontrada para os filtros aplicados.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-gray-600 dark:text-gray-400">
                    <th className="pb-2 pr-3 text-left font-medium">CPF Indicador</th>
                    <th className="pb-2 pr-3 text-left font-medium">Nome Indicador</th>
                    <th className="pb-2 pr-3 text-left font-medium">Chave Pix</th>
                    <th className="pb-2 pr-3 text-left font-medium">Nome Indicado</th>
                    <th className="pb-2 pr-3 text-left font-medium">CPF Indicado</th>
                    <th className="pb-2 pr-3 text-left font-medium">Vendedor</th>
                    <th className="pb-2 pr-3 text-left font-medium">Etapa</th>
                    <th className="pb-2 pr-3 text-left font-medium">Data</th>
                    <th className="pb-2 pr-3 text-center font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {referrals.map((item) => (
                    <tr key={item.id} className="border-b hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors">
                      <td className="py-2.5 pr-3 font-mono text-xs">{formatCPF(item.referrerCpf)}</td>
                      <td className="py-2.5 pr-3 truncate max-w-[150px]" title={item.referrerName}>{item.referrerName || '-'}</td>
                      <td className="py-2.5 pr-3 text-xs truncate max-w-[130px]" title={item.chavePix}>{item.chavePix || '-'}</td>
                      <td className="py-2.5 pr-3 truncate max-w-[150px]" title={item.referredName}>{item.referredName || '-'}</td>
                      <td className="py-2.5 pr-3 font-mono text-xs">{formatCPF(item.referredCpf)}</td>
                      <td className="py-2.5 pr-3 truncate max-w-[130px]" title={item.agentName}>{item.agentName || '-'}</td>
                      <td className="py-2.5 pr-3">
                        {(() => {
                          const stageObj = REFERRAL_STAGES.find(s => s.id === item.stage);
                          return stageObj ? (
                            <Badge className="text-xs text-white" style={{ backgroundColor: stageObj.color }}>{stageObj.label}</Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs">{item.stage || '-'}</Badge>
                          );
                        })()}
                      </td>
                      <td className="py-2.5 pr-3 text-xs text-gray-500">
                        {item.createdAt ? format(new Date(item.createdAt), 'dd/MM/yyyy', { locale: ptBR }) : '-'}
                      </td>
                      <td className="py-2.5 pr-3 text-center">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(item)} className="gap-1 text-xs text-amber-600 hover:text-amber-700">
                          <Edit2 className="w-3.5 h-3.5" /> Editar
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <span className="text-sm text-gray-500">
                {total.toLocaleString('pt-BR')} registros — Página {page} de {totalPages}
              </span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editItem} onOpenChange={(open) => !open && setEditItem(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Indicação</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">CPF Indicador</Label>
                <Input
                  value={editForm.referrerCpf || ''}
                  onChange={e => setEditForm({ ...editForm, referrerCpf: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Nome Indicador</Label>
                <Input
                  value={editForm.referrerName || ''}
                  onChange={e => setEditForm({ ...editForm, referrerName: e.target.value })}
                  className="mt-1"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Chave Pix</Label>
              <Input
                value={editForm.chavePix || ''}
                onChange={e => setEditForm({ ...editForm, chavePix: e.target.value })}
                className="mt-1"
                placeholder="CPF, e-mail, telefone ou chave aleatória"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Nome Indicado</Label>
                <Input
                  value={editForm.referredName || ''}
                  onChange={e => setEditForm({ ...editForm, referredName: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">CPF Indicado</Label>
                <Input
                  value={editForm.referredCpf || ''}
                  onChange={e => setEditForm({ ...editForm, referredCpf: e.target.value })}
                  className="mt-1"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Vendedor</Label>
                <Select value={editForm.agentId ? String(editForm.agentId) : ''} onValueChange={val => setEditForm({ ...editForm, agentId: val })}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Selecionar vendedor" />
                  </SelectTrigger>
                  <SelectContent>
                    {agents.filter(a => a.active !== false).map(a => (
                      <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Etapa</Label>
                <Select value={editForm.stage || ''} onValueChange={val => setEditForm({ ...editForm, stage: val })}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Selecionar etapa" />
                  </SelectTrigger>
                  <SelectContent>
                    {REFERRAL_STAGES.map(s => (
                      <SelectItem key={s.id} value={s.id}>
                        <span className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: s.color }} />
                          {s.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditItem(null)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2 bg-amber-600 hover:bg-amber-700 text-white">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
