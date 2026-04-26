import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { buscarClienteERP } from "@/api/erpService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Search, RefreshCw, Loader2, CheckCircle, User } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { toast } from "sonner";

const formatCPF = (value) => {
  const clean = value.replace(/\D/g, '').slice(0, 11);
  return clean
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
};

const INITIAL_FORM = {
  cpf: "",
  nomeCompletoCliente: "",
  observacoes: "",
  atendenteId: "",
};

export default function ReferralReactivation() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [form, setForm] = useState(INITIAL_FORM);
  const [searchingERP, setSearchingERP] = useState(false);
  const [erpFound, setErpFound] = useState(null);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: agents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: () => base44.entities.Agent.list(),
  });

  const currentAgentType = user?.agent?.agentType || user?.agent?.agent_type;
  const currentAgent = user?.agent;
  const isAtendente = currentAgentType === 'indicacoes_atendente';
  const isSupervisorOrAdmin =
    currentAgentType === 'indicacoes_supervisor' ||
    currentAgentType === 'admin' ||
    user?.role === 'admin';

  const atendentesList = agents
    .filter((a) => (a.agentType || a.agent_type) === 'indicacoes_atendente' && a.active !== false)
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR'));

  const saveMutation = useMutation({
    mutationFn: async (payload) => {
      const token = localStorage.getItem('accessToken');
      const res = await fetch('/api/referrals/reactivations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Erro ao salvar.');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['referral_reactivations'] });
      toast.success('Reativação registrada com sucesso!');
      setForm(INITIAL_FORM);
      setErpFound(null);
    },
    onError: (err) => {
      toast.error(err?.message || 'Não foi possível registrar a reativação. Tente novamente.');
    },
  });

  const handleCPFChange = (e) => {
    const formatted = formatCPF(e.target.value);
    setForm((f) => ({ ...f, cpf: formatted }));
    setErpFound(null);
  };

  const handleSearchERP = async () => {
    const cleanCpf = form.cpf.replace(/\D/g, '');
    if (cleanCpf.length !== 11) {
      toast.error('Digite um CPF válido com 11 dígitos.');
      return;
    }
    setSearchingERP(true);
    setErpFound(null);
    try {
      const response = await buscarClienteERP(cleanCpf);
      if (response?.success && response?.data?.contact?.name) {
        const nome = response.data.contact.name;
        setForm((f) => ({ ...f, nomeCompletoCliente: nome }));
        setErpFound(true);
        toast.success(`Cliente encontrado: ${nome}`);
      } else {
        setErpFound(false);
        toast.error('CPF não encontrado no ERP. Preencha o nome manualmente.');
      }
    } catch (err) {
      setErpFound(false);
      toast.error(err?.message || 'Erro ao consultar o ERP. Preencha o nome manualmente.');
    } finally {
      setSearchingERP(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    const cleanCpf = form.cpf.replace(/\D/g, '');
    if (cleanCpf.length !== 11) {
      toast.error('CPF inválido.');
      return;
    }
    if (!form.nomeCompletoCliente.trim()) {
      toast.error('Nome completo do cliente é obrigatório.');
      return;
    }
    if (!isAtendente && !form.atendenteId) {
      toast.error('Selecione o atendente responsável.');
      return;
    }

    const payload = {
      cpf: cleanCpf,
      nome_completo_cliente: form.nomeCompletoCliente.trim(),
      observacoes: form.observacoes.trim() || null,
      atendente_id: isAtendente ? currentAgent?.id : form.atendenteId,
    };

    saveMutation.mutate(payload);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="sticky top-0 z-50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(createPageUrl("ReferralPipeline"))}
            className="gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Voltar</span>
          </Button>
          <div className="h-6 w-px bg-gray-200 dark:bg-gray-700" />
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-100 dark:bg-amber-900/50 rounded-lg">
              <RefreshCw className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">Indicações</span>
            </div>
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Nova Reativação</span>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500 p-6 sm:p-8 mb-8 shadow-2xl shadow-amber-500/20">
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent" />
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                <RefreshCw className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">Nova Reativação</h1>
                <p className="text-amber-100 text-sm">Registre o cliente que está reativando um contrato</p>
              </div>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <Card className="shadow-sm border-0 bg-white dark:bg-gray-900 ring-1 ring-gray-200 dark:ring-gray-800">
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-semibold text-gray-900 dark:text-gray-100">
                Dados do Cliente
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="cpf">CPF *</Label>
                <div className="flex gap-2">
                  <Input
                    id="cpf"
                    placeholder="000.000.000-00"
                    value={form.cpf}
                    onChange={handleCPFChange}
                    className="flex-1 font-mono"
                    maxLength={14}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleSearchERP}
                    disabled={searchingERP || form.cpf.replace(/\D/g, '').length !== 11}
                    className="shrink-0 gap-2"
                  >
                    {searchingERP ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Search className="w-4 h-4" />
                    )}
                    <span className="hidden sm:inline">Consultar ERP</span>
                  </Button>
                </div>
                {erpFound === true && (
                  <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" /> Cliente localizado no ERP
                  </p>
                )}
                {erpFound === false && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Cliente não encontrado. Preencha o nome manualmente.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="nome">Nome Completo do Cliente *</Label>
                <Input
                  id="nome"
                  placeholder="Nome completo"
                  value={form.nomeCompletoCliente}
                  onChange={(e) => setForm((f) => ({ ...f, nomeCompletoCliente: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="observacoes">Observações</Label>
                <Textarea
                  id="observacoes"
                  placeholder="Informações adicionais sobre a reativação..."
                  value={form.observacoes}
                  onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))}
                  rows={3}
                  className="resize-none"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="atendente">Atendente Responsável *</Label>
                {isAtendente ? (
                  <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700">
                    <User className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      {currentAgent?.name || 'Você'}
                    </span>
                    <span className="text-xs text-gray-400 ml-auto">(atribuído automaticamente)</span>
                  </div>
                ) : (
                  <Select
                    value={form.atendenteId}
                    onValueChange={(v) => setForm((f) => ({ ...f, atendenteId: v }))}
                  >
                    <SelectTrigger id="atendente">
                      <SelectValue placeholder="Selecione o atendente..." />
                    </SelectTrigger>
                    <SelectContent>
                      {atendentesList.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                      {atendentesList.length === 0 && (
                        <SelectItem value="_none" disabled>
                          Nenhum atendente ativo disponível
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="mt-6 flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate(createPageUrl("ReferralPipeline"))}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={saveMutation.isPending}
              className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white shadow-lg shadow-amber-500/25 gap-2"
            >
              {saveMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  Salvar Reativação
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
