import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Search, Edit2, Loader2, ChevronLeft, ChevronRight, List, X, Save,
  StickyNote, Plus, Trash2, MessageCircle, User, QrCode
} from "lucide-react";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { REFERRAL_STAGES } from "@/constants/stages";
import { base44 } from "@/api/base44Client";

const PRIVILEGED_AGENT_TYPES = new Set(['admin', 'indicacoes_supervisor', 'indicacoes_admin']);

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
  const [filters, setFilters] = useState({ cpfIndicador: '', telefoneIndicador: '', telefoneIndicado: '', nomeIndicado: '', vendedorId: '' });
  const [appliedFilters, setAppliedFilters] = useState({ cpfIndicador: '', telefoneIndicador: '', telefoneIndicado: '', nomeIndicado: '', vendedorId: '' });
  const [page, setPage] = useState(1);
  const [editItem, setEditItem] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editingNoteContent, setEditingNoteContent] = useState('');
  const limit = 50;

  const [pixModalOpen, setPixModalOpen] = useState(false);
  const [pixCpf, setPixCpf] = useState('');
  const [pixChave, setPixChave] = useState('');
  const [pixLookupLoading, setPixLookupLoading] = useState(false);
  const [pixSaving, setPixSaving] = useState(false);

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    params.set('page', page);
    params.set('limit', limit);
    if (appliedFilters.cpfIndicador) params.set('cpfIndicador', appliedFilters.cpfIndicador);
    if (appliedFilters.telefoneIndicador) params.set('telefoneIndicador', appliedFilters.telefoneIndicador);
    if (appliedFilters.telefoneIndicado) params.set('telefoneIndicado', appliedFilters.telefoneIndicado);
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

  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
    staleTime: 5 * 60 * 1000,
  });

  const currentAgentType = useMemo(() => {
    const a = currentUser?.agent || (agentsData || []).find(x => x.userEmail === currentUser?.email || x.user_email === currentUser?.email);
    return a?.agentType || a?.agent_type || null;
  }, [currentUser, agentsData]);

  const isPrivileged = currentUser?.role === 'admin' || PRIVILEGED_AGENT_TYPES.has(currentAgentType);
  const referrals = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / limit);

  function handleSearch() {
    setAppliedFilters({ ...filters });
    setPage(1);
  }

  function handleClear() {
    setFilters({ cpfIndicador: '', telefoneIndicador: '', nomeIndicado: '', vendedorId: '' });
    setAppliedFilters({ cpfIndicador: '', telefoneIndicador: '', nomeIndicado: '', vendedorId: '' });
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
    setNewNote('');
    setEditingNoteId(null);
    setEditingNoteContent('');
  }

  function formatCPFInput(value) {
    const clean = value.replace(/\D/g, '').slice(0, 11);
    if (clean.length <= 3) return clean;
    if (clean.length <= 6) return `${clean.slice(0, 3)}.${clean.slice(3)}`;
    if (clean.length <= 9) return `${clean.slice(0, 3)}.${clean.slice(3, 6)}.${clean.slice(6)}`;
    return `${clean.slice(0, 3)}.${clean.slice(3, 6)}.${clean.slice(6, 9)}-${clean.slice(9)}`;
  }

  function handlePixCpfChange(raw) {
    setPixCpf(formatCPFInput(raw));
  }

  useEffect(() => {
    const clean = pixCpf.replace(/\D/g, '');
    if (clean.length !== 11) return;

    let cancelled = false;
    setPixLookupLoading(true);

    fetch(`${API_BASE}/functions/indicadores-pix/${clean}`, {
      headers: { ...getAuthHeaders() },
    })
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (!cancelled && data?.chave_pix) setPixChave(data.chave_pix);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setPixLookupLoading(false); });

    return () => { cancelled = true; };
  }, [pixCpf]);

  async function handleSavePix() {
    const clean = pixCpf.replace(/\D/g, '');
    if (clean.length !== 11) { toast.error('CPF inválido — informe os 11 dígitos'); return; }
    if (!pixChave.trim()) { toast.error('Chave PIX obrigatória'); return; }
    setPixSaving(true);
    try {
      const res = await fetch(`${API_BASE}/functions/indicadores-pix/${clean}`, {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ chave_pix: pixChave.trim() }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Erro ao salvar');
      }
      toast.success('PIX do indicador salvo com sucesso!');
      setPixModalOpen(false);
      setPixCpf('');
      setPixChave('');
    } catch (err) {
      toast.error('Erro ao salvar PIX: ' + err.message);
    } finally {
      setPixSaving(false);
    }
  }

  function openPixModal() {
    setPixCpf('');
    setPixChave('');
    setPixModalOpen(true);
  }

  const { data: notesData, refetch: refetchNotes } = useQuery({
    queryKey: ['referral-notes', editItem?.id],
    queryFn: async () => {
      if (!editItem?.id) return [];
      const res = await fetch(`${API_BASE}/referrals/${editItem.id}/notes`, {
        headers: { ...getAuthHeaders() },
      });
      if (!res.ok) throw new Error('Erro ao carregar notas');
      return res.json();
    },
    enabled: !!editItem?.id,
  });
  const notes = Array.isArray(notesData) ? notesData : [];

  async function handleAddNote() {
    if (!editItem?.id || !newNote.trim()) return;
    setSavingNote(true);
    try {
      const res = await fetch(`${API_BASE}/referrals/${editItem.id}/notes`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newNote.trim() }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Erro ao adicionar nota');
      }
      setNewNote('');
      await refetchNotes();
      toast.success('Nota adicionada');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSavingNote(false);
    }
  }

  function startEditNote(note) {
    setEditingNoteId(note.id);
    setEditingNoteContent(note.content || '');
  }

  function cancelEditNote() {
    setEditingNoteId(null);
    setEditingNoteContent('');
  }

  async function handleUpdateNote(noteId) {
    if (!editingNoteContent.trim()) return;
    try {
      const res = await fetch(`${API_BASE}/referral-notes/${noteId}`, {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editingNoteContent.trim() }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Erro ao atualizar nota');
      }
      cancelEditNote();
      await refetchNotes();
      toast.success('Nota atualizada');
    } catch (e) {
      toast.error(e.message);
    }
  }

  async function handleDeleteNote(noteId) {
    if (!confirm('Excluir esta nota?')) return;
    try {
      const res = await fetch(`${API_BASE}/referral-notes/${noteId}`, {
        method: 'DELETE',
        headers: { ...getAuthHeaders() },
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Erro ao excluir nota');
      }
      await refetchNotes();
      toast.success('Nota excluída');
    } catch (e) {
      toast.error(e.message);
    }
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
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 text-white">
            <List className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Relação Indicações</h1>
            <p className="text-sm text-gray-500">Listagem e gestão de todas as indicações cadastradas</p>
          </div>
        </div>
        {isPrivileged && (
          <Button
            onClick={openPixModal}
            size="sm"
            className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-sm"
          >
            <QrCode className="w-4 h-4 mr-2" />
            Cadastrar PIX do Indicador
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className={`grid grid-cols-1 md:grid-cols-2 ${isPrivileged ? 'lg:grid-cols-[1fr_1fr_1fr_1fr_1fr_auto]' : 'lg:grid-cols-[1fr_1fr_1fr_1fr_auto]'} gap-3 items-end`}>
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
              <Label className="text-xs text-gray-600">Telefone Indicador</Label>
              <Input
                placeholder="(00) 00000-0000"
                inputMode="tel"
                value={filters.telefoneIndicador}
                onChange={e => setFilters({ ...filters, telefoneIndicador: e.target.value })}
                className="mt-1"
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
              />
            </div>
            <div>
              <Label className="text-xs text-gray-600">Telefone Indicado</Label>
              <Input
                placeholder="(00) 00000-0000"
                inputMode="tel"
                value={filters.telefoneIndicado}
                onChange={e => setFilters({ ...filters, telefoneIndicado: e.target.value })}
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
            {isPrivileged && (
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
            )}
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
                            <span
                              className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold text-white shadow-sm"
                              style={{ backgroundColor: stageObj.color }}
                            >
                              {stageObj.label}
                            </span>
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
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

            {/* ===== Notas (timeline) ===== */}
            <div className="pt-4 mt-2 border-t">
              <div className="flex items-center gap-2 mb-3">
                <StickyNote className="w-4 h-4 text-amber-600" />
                <h3 className="text-sm font-semibold text-gray-800">Notas</h3>
                <Badge variant="outline" className="text-[10px] ml-1">{notes.length}</Badge>
              </div>

              <div className="bg-amber-50/50 border border-amber-100 rounded-lg p-3 mb-4">
                <Label className="text-xs text-gray-700">Adicionar nota</Label>
                <Textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Escreva uma observação sobre esta indicação..."
                  rows={2}
                  className="mt-1 bg-white"
                />
                <div className="flex justify-end mt-2">
                  <Button
                    size="sm"
                    onClick={handleAddNote}
                    disabled={savingNote || !newNote.trim()}
                    className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-white"
                  >
                    {savingNote ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    Adicionar
                  </Button>
                </div>
              </div>

              {notes.length === 0 ? (
                <div className="text-center py-6 text-xs text-gray-400">
                  <MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  Nenhuma nota registrada ainda.
                </div>
              ) : (
                <div className="relative pl-6">
                  {/* Linha vertical da timeline */}
                  <div className="absolute left-[11px] top-1 bottom-1 w-0.5 bg-gradient-to-b from-amber-300 via-amber-200 to-transparent" />
                  <ul className="space-y-3">
                    {notes.map((note) => {
                      const isEditing = editingNoteId === note.id;
                      const author = note.agentFullName || note.agentName || 'Sistema';
                      const createdAt = note.createdAt ? new Date(note.createdAt) : null;
                      const updatedAt = note.updatedAt ? new Date(note.updatedAt) : null;
                      const wasEdited = createdAt && updatedAt && (updatedAt.getTime() - createdAt.getTime() > 1000);
                      return (
                        <li key={note.id} className="relative">
                          {/* Bolinha da timeline */}
                          <span className="absolute -left-[19px] top-2 w-3 h-3 rounded-full bg-amber-500 ring-4 ring-amber-100" />
                          <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-3 hover:border-amber-200 transition-colors">
                            <div className="flex items-start justify-between gap-2 mb-1.5">
                              <div className="flex items-center gap-1.5 text-xs text-gray-600">
                                <User className="w-3 h-3 text-amber-600" />
                                <span className="font-semibold text-gray-800">{author}</span>
                                {createdAt && (
                                  <>
                                    <span className="text-gray-300">•</span>
                                    <span title={format(createdAt, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}>
                                      {formatDistanceToNow(createdAt, { addSuffix: true, locale: ptBR })}
                                    </span>
                                  </>
                                )}
                                {wasEdited && (
                                  <span className="text-[10px] text-gray-400 italic">(editada)</span>
                                )}
                              </div>
                              {!isEditing && (
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-gray-500 hover:text-amber-700"
                                    onClick={() => startEditNote(note)}
                                    title="Editar"
                                  >
                                    <Edit2 className="w-3 h-3" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-gray-500 hover:text-red-600"
                                    onClick={() => handleDeleteNote(note.id)}
                                    title="Excluir"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                </div>
                              )}
                            </div>
                            {isEditing ? (
                              <div className="space-y-2">
                                <Textarea
                                  value={editingNoteContent}
                                  onChange={(e) => setEditingNoteContent(e.target.value)}
                                  rows={2}
                                  className="text-sm"
                                />
                                <div className="flex justify-end gap-2">
                                  <Button variant="outline" size="sm" onClick={cancelEditNote} className="gap-1">
                                    <X className="w-3 h-3" /> Cancelar
                                  </Button>
                                  <Button
                                    size="sm"
                                    onClick={() => handleUpdateNote(note.id)}
                                    disabled={!editingNoteContent.trim()}
                                    className="gap-1 bg-amber-600 hover:bg-amber-700 text-white"
                                  >
                                    <Save className="w-3 h-3" /> Salvar
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">
                                {note.content}
                              </p>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
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

      <Dialog open={pixModalOpen} onOpenChange={(open) => { if (!open) { setPixCpf(''); setPixChave(''); } setPixModalOpen(open); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 text-white">
                <QrCode className="w-4 h-4" />
              </div>
              Cadastrar PIX do Indicador
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                CPF do Indicador <span className="text-red-500">*</span>
              </Label>
              <div className="relative mt-1">
                <Input
                  placeholder="000.000.000-00"
                  value={pixCpf}
                  onChange={e => handlePixCpfChange(e.target.value)}
                  maxLength={14}
                  className="pr-9"
                />
                {pixLookupLoading && (
                  <Loader2 className="absolute right-3 top-2.5 w-4 h-4 animate-spin text-amber-500" />
                )}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Ao completar o CPF, a chave PIX existente será carregada automaticamente.
              </p>
            </div>

            <div>
              <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Chave PIX <span className="text-red-500">*</span>
              </Label>
              <Input
                placeholder="CPF, e-mail, telefone ou chave aleatória"
                value={pixChave}
                onChange={e => setPixChave(e.target.value.slice(0, 150))}
                maxLength={150}
                className="mt-1"
                disabled={pixLookupLoading}
              />
              <p className="text-xs text-gray-400 mt-1 text-right">{pixChave.length}/150</p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setPixModalOpen(false); setPixCpf(''); setPixChave(''); }}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSavePix}
              disabled={pixSaving || pixLookupLoading || pixCpf.replace(/\D/g, '').length !== 11 || !pixChave.trim()}
              className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white gap-2"
            >
              {pixSaving
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Save className="w-4 h-4" />
              }
              Salvar PIX
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
