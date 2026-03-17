import { useState } from "react";
import { motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  DollarSign, 
  Gift, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Filter,
  Download,
  Eye,
  Activity,
  TrendingUp,
  ShieldAlert,
  Trophy
} from "lucide-react";
import { format, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import StatsCard from "@/components/dashboard/StatsCard";

export default function ReferralCommissions() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedCommission, setSelectedCommission] = useState(null);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [paymentData, setPaymentData] = useState({
    paymentMethod: 'pix',
    notes: '',
  });

  // Verificar permissão de acesso
  const { data: user, isLoading: isLoadingUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const currentAgent = user?.agent;
  const agentType = currentAgent?.agentType || currentAgent?.agent_type;
  const isAdmin = agentType === 'admin' || agentType === 'supervisor' || agentType === 'sales_supervisor';
  const isSalesAgent = agentType === 'sales' || agentType === 'pre_sales' || agentType === 'post_sales';
  const hasSubmenuAccess = (currentAgent?.allowedSubmenus || []).includes('ReferralCommissions');
  const hasAccess = isAdmin || isSalesAgent || hasSubmenuAccess;

  const { data: referrals = [], isLoading } = useQuery({
    queryKey: ['referrals-commissions'],
    queryFn: () => base44.entities.Referral.list('-createdAt'),
    staleTime: 0,
    refetchOnMount: 'always',
    enabled: hasAccess,
  });

  const { data: erpPaidData, isLoading: isLoadingErp } = useQuery({
    queryKey: ['referral-paid-sales'],
    queryFn: async () => {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/functions/referral-paid-sales', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Erro ao buscar vendas pagas do ERP');
      return response.json();
    },
    staleTime: 60000,
    enabled: hasAccess,
  });

  const updateCommissionMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Referral.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['referrals-commissions'] });
      toast.success('Comissão atualizada com sucesso!');
      setShowPaymentDialog(false);
      setSelectedCommission(null);
      setPaymentData({ paymentMethod: 'pix', notes: '' });
    },
    onError: (error) => {
      console.error('Erro ao atualizar comissão:', error);
      toast.error('Erro ao atualizar comissão');
    },
  });

  const erpPaidMap = erpPaidData?.paidByCpfIndicado || {};
  const usedContracts = erpPaidData?.usedContracts || {};
  const erpLoaded = !!erpPaidData && !isLoadingErp;

  const commissionsData = (() => {
    const eligible = referrals
      .filter(r => r.stage === 'fechado_ganho')
      .filter(r => r.commissionValue && parseFloat(r.commissionValue) > 0)
      .filter(r => {
        if (isAdmin) return true;
        return r.agentId === currentAgent?.id;
      });

    const allConverted = referrals
      .filter(r => r.stage === 'fechado_ganho')
      .filter(r => r.commissionValue && parseFloat(r.commissionValue) > 0);

    const winnerByReferredCpf = {};
    const sortedAll = [...allConverted].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    for (const r of sortedAll) {
      const cpf = r.referredCpf ? String(r.referredCpf).replace(/\D/g, '') : '';
      if (cpf && cpf.length >= 11 && !winnerByReferredCpf[cpf]) {
        winnerByReferredCpf[cpf] = r.id;
      }
    }

    const sorted = [...eligible].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    const contractsClaimedThisRun = new Set();
    const statusById = {};

    for (const r of sorted) {
      let effectiveStatus = r.commissionStatus || 'pending';

      if (erpLoaded && effectiveStatus !== 'paga' && effectiveStatus !== 'cancelada') {
        const referredCpf = r.referredCpf ? String(r.referredCpf).replace(/\D/g, '') : '';

        if (!referredCpf || referredCpf.length < 11) {
          effectiveStatus = 'pending';
        } else {
          const isWinner = winnerByReferredCpf[referredCpf] === r.id;
          const sales = erpPaidMap[referredCpf] || [];

          if (!isWinner || sales.length === 0) {
            effectiveStatus = 'pending';
          } else {
            const availableContract = sales.find(s => {
              const cid = s.contrato_servicos ? String(s.contrato_servicos).trim() : '';
              if (!cid) return false;
              const alreadyUsedInDb = usedContracts[cid] && usedContracts[cid].referralId !== r.id;
              const alreadyClaimedNow = contractsClaimedThisRun.has(cid);
              return !alreadyUsedInDb && !alreadyClaimedNow;
            });

            if (availableContract) {
              const cid = String(availableContract.contrato_servicos).trim();
              contractsClaimedThisRun.add(cid);
              effectiveStatus = 'aprovada';
            } else {
              effectiveStatus = 'pending';
            }
          }
        }
      }

      statusById[r.id] = effectiveStatus;
    }

    return eligible.map(r => ({
      ...r,
      effectiveCommissionStatus: statusById[r.id] || r.commissionStatus || 'pending',
      referrer_display: r.referrerName || 'Sem nome',
    }));
  })();

  const filteredCommissions = statusFilter === 'all' 
    ? commissionsData
    : commissionsData.filter(c => c.effectiveCommissionStatus === statusFilter);

  const totalCommissions = commissionsData.reduce((sum, c) => sum + (parseFloat(c.commissionValue) || 0), 0);
  const pendingCommissions = commissionsData.filter(c => c.effectiveCommissionStatus === 'pending');
  const approvedCommissions = commissionsData.filter(c => c.effectiveCommissionStatus === 'aprovada');
  const paidCommissions = commissionsData.filter(c => c.effectiveCommissionStatus === 'paga');

  const totalPending = pendingCommissions.reduce((sum, c) => sum + (parseFloat(c.commissionValue) || 0), 0);
  const totalApproved = approvedCommissions.reduce((sum, c) => sum + (parseFloat(c.commissionValue) || 0), 0);
  const totalPaid = paidCommissions.reduce((sum, c) => sum + (parseFloat(c.commissionValue) || 0), 0);

  const handleApproveCommission = async (commission) => {
    const referredCpf = commission.referredCpf ? String(commission.referredCpf).replace(/\D/g, '') : '';
    const sales = erpPaidMap[referredCpf] || [];
    const availableContract = sales.find(s => {
      const cid = s.contrato_servicos ? String(s.contrato_servicos).trim() : '';
      return cid && (!usedContracts[cid] || usedContracts[cid].referralId === commission.id);
    });

    if (!availableContract) {
      toast.error('Nenhum contrato disponível para aprovar esta comissão');
      return;
    }

    try {
      const token = localStorage.getItem('accessToken');
      const resp = await fetch('/api/functions/referral-use-contract', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contratoServicos: String(availableContract.contrato_servicos).trim(),
          referralId: commission.id,
          cpfIndicado: referredCpf
        })
      });
      const result = await resp.json();

      if (!resp.ok || (result.alreadyUsed)) {
        toast.error('Contrato já utilizado para outra comissão');
        queryClient.invalidateQueries({ queryKey: ['referral-paid-sales'] });
        return;
      }
    } catch (err) {
      console.error('Error recording contract:', err);
      toast.error('Erro ao registrar contrato');
      return;
    }

    updateCommissionMutation.mutate({
      id: commission.id,
      data: {
        commissionStatus: 'aprovada',
      }
    });
  };

  const handleOpenPaymentDialog = (commission) => {
    setSelectedCommission(commission);
    setShowPaymentDialog(true);
  };

  const handlePayCommission = () => {
    if (!paymentData.paymentMethod) {
      toast.error('Selecione a forma de pagamento');
      return;
    }

    updateCommissionMutation.mutate({
      id: selectedCommission.id,
      data: {
        commissionStatus: 'paga',
        commissionPaidAt: new Date().toISOString(),
        commissionPaymentMethod: paymentData.paymentMethod,
        commissionNotes: paymentData.notes,
      }
    });
  };

  const handleCancelCommission = (commission) => {
    if (confirm('Tem certeza que deseja cancelar esta comissão?')) {
      updateCommissionMutation.mutate({
        id: commission.id,
        data: {
          commissionStatus: 'cancelada',
        }
      });
    }
  };

  const exportToCSV = () => {
    const safeFormatDate = (dateStr) => {
      if (!dateStr) return '-';
      const date = new Date(dateStr);
      return isValid(date) ? format(date, 'dd/MM/yyyy') : '-';
    };

    const csv = [
      ['Código', 'Indicador', 'Indicado', 'Valor Venda', 'Comissão', 'Status', 'Data Conversão'],
      ...filteredCommissions.map(c => [
        c.referralCode,
        c.referrerName,
        c.referredName,
        `R$ ${parseFloat(c.value || 0).toFixed(2)}`,
        `R$ ${parseFloat(c.commissionValue || 0).toFixed(2)}`,
        c.effectiveCommissionStatus,
        safeFormatDate(c.convertedAt)
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `comissoes_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();

    toast.success('📥 Relatório exportado!');
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'paga':
        return <Badge className="bg-green-100 text-green-800">✅ Paga</Badge>;
      case 'aprovada':
        return <Badge className="bg-blue-100 text-blue-800">👍 Aprovada</Badge>;
      case 'cancelada':
        return <Badge className="bg-red-100 text-red-800">❌ Cancelada</Badge>;
      default:
        return <Badge className="bg-yellow-100 text-yellow-800">⏳ Pendente</Badge>;
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value || 0);
  };

  const formatDate = (dateStr, formatStr = "dd/MM/yyyy HH:mm") => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    if (!isValid(date)) return '-';
    return format(date, formatStr, { locale: ptBR });
  };

  // Tela de loading
  if (isLoadingUser) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <Activity className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  // Tela de acesso restrito
  if (!hasAccess) {
    return (
      <motion.div 
        className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-10 pb-8 px-8">
            <div className="w-16 h-16 mx-auto mb-4 rounded-xl bg-gradient-to-br from-red-500 to-orange-600 flex items-center justify-center shadow-lg shadow-red-500/25">
              <ShieldAlert className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Acesso Restrito</h2>
            <p className="text-gray-500 dark:text-gray-400 mb-6">
              Você não tem permissão para acessar esta página.
            </p>
            <Link to="/">
              <Button className="bg-gradient-to-r from-blue-600 to-indigo-600">
                Voltar ao Início
              </Button>
            </Link>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="min-h-screen bg-gray-50 dark:bg-gray-950 p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div className="max-w-7xl mx-auto space-y-6">
        <motion.div
          className="flex justify-between items-start"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-green-500/25">
              <DollarSign className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Gestão de Comissões</h1>
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                Gerencie pagamentos de comissões de indicações
              </p>
            </div>
          </div>
          {isAdmin && (
            <Button
              onClick={exportToCSV}
              variant="glass"
              className="gap-2"
            >
              <Download className="w-4 h-4" />
              Exportar CSV
            </Button>
          )}
        </motion.div>

        <motion.div
          className="grid grid-cols-1 md:grid-cols-5 gap-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <StatsCard
            title="Total em Comissões"
            value={formatCurrency(totalCommissions)}
            icon={Gift}
            color="purple"
            delay={0}
          />
          <StatsCard
            title="Pendentes"
            value={formatCurrency(totalPending)}
            subtitle={`${pendingCommissions.length} indicações`}
            icon={Clock}
            color="orange"
            delay={0.1}
          />
          <StatsCard
            title="Aprovadas"
            value={formatCurrency(totalApproved)}
            subtitle={`${approvedCommissions.length} indicações`}
            icon={CheckCircle}
            color="blue"
            delay={0.2}
          />
          <StatsCard
            title="Pagas"
            value={formatCurrency(totalPaid)}
            subtitle={`${paidCommissions.length} indicações`}
            icon={TrendingUp}
            color="green"
            delay={0.3}
          />
          <StatsCard
            title="Indicadores Nível 2"
            value={new Set(commissionsData.filter(c => c.referrerLevel === 2).map(c => c.referrerCpf)).size}
            subtitle="Clientes premium"
            icon={Activity}
            color="yellow"
            delay={0.4}
          />
          <StatsCard
            title="Indicadores Nível 3"
            value={new Set(commissionsData.filter(c => c.referrerLevel >= 3).map(c => c.referrerCpf)).size}
            subtitle="Clientes elite"
            icon={Trophy}
            color="purple"
            delay={0.5}
          />
        </motion.div>

        {/* Card de Regras de Níveis */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="border-purple-200 dark:border-purple-800/50 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center shadow-lg">
                  <TrendingUp className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-purple-900 dark:text-purple-200 mb-2">Sistema de Níveis de Indicadores</h3>
                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="p-4 bg-white/80 dark:bg-gray-800/50 rounded-lg border border-blue-200 dark:border-blue-800">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge className="bg-blue-100 text-blue-800">Nível 1</Badge>
                        <span className="text-sm text-gray-600 dark:text-gray-400">Iniciante</span>
                      </div>
                      <p className="text-2xl font-bold text-blue-600 mb-1">R$ 100,00</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Por indicação convertida</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">1-3 indicações convertidas</p>
                    </div>
                    <div className="p-4 bg-white/80 dark:bg-gray-800/50 rounded-lg border border-amber-200 dark:border-amber-800">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge className="bg-amber-100 text-amber-800">⭐ Nível 2</Badge>
                        <span className="text-sm text-gray-600 dark:text-gray-400">Premium</span>
                      </div>
                      <p className="text-2xl font-bold text-amber-600 mb-1">R$ 150,00</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Por indicação convertida</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">4-12 indicações convertidas</p>
                    </div>
                    <div className="p-4 bg-white/80 dark:bg-gray-800/50 rounded-lg border border-purple-200 dark:border-purple-800">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge className="bg-purple-100 text-purple-800">🏆 Nível 3</Badge>
                        <span className="text-sm text-gray-600 dark:text-gray-400">Elite</span>
                      </div>
                      <p className="text-2xl font-bold text-purple-600 mb-1">R$ 200,00</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Por indicação convertida</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">13+ indicações convertidas</p>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
                    O nível do indicador é calculado automaticamente quando o CPF é buscado no ERP. A comissão é fixada no momento da criação da indicação.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <Card className="glass-card border-0 dark:border dark:border-gray-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
              <Filter className="w-5 h-5" />
              Filtros
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <div className="flex-1">
                <Label className="dark:text-gray-300">Status da Comissão</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    <SelectItem value="pending">Pendentes</SelectItem>
                    <SelectItem value="aprovada">Aprovadas</SelectItem>
                    <SelectItem value="paga">Pagas</SelectItem>
                    <SelectItem value="cancelada">Canceladas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card border-0 dark:border dark:border-gray-800">
          <CardHeader>
            <CardTitle className="text-gray-900 dark:text-white">
              Comissões ({filteredCommissions.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(isLoading || isLoadingErp) ? (
              <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                <Activity className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600 animate-pulse" />
                <p>{isLoadingErp ? 'Validando vendas pagas no ERP...' : 'Carregando...'}</p>
              </div>
            ) : filteredCommissions.length === 0 ? (
              <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                <Gift className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                <p>Nenhuma comissão encontrada</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredCommissions.map(commission => (
                  <div
                    key={commission.id}
                    className="p-4 border rounded-lg hover:shadow-md transition-all bg-white dark:bg-gray-800 dark:border-gray-700"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="font-semibold text-gray-900 dark:text-white">
                            {commission.referrer_display}
                          </h4>
                          {commission.referrerLevel >= 3 ? (
                            <Badge className="bg-purple-100 text-purple-800 text-xs">🏆 Nível 3</Badge>
                          ) : commission.referrerLevel === 2 ? (
                            <Badge className="bg-amber-100 text-amber-800 text-xs">⭐ Nível 2</Badge>
                          ) : (
                            <Badge className="bg-blue-100 text-blue-800 text-xs">Nível 1</Badge>
                          )}
                          {getStatusBadge(commission.effectiveCommissionStatus)}
                        </div>
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Código</p>
                            <p className="font-medium dark:text-gray-200">{commission.referralCode}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Indicado</p>
                            <p className="font-medium dark:text-gray-200">{commission.referredName}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Valor da Venda</p>
                            <p className="font-medium text-green-600">
                              R$ {parseFloat(commission.value || 0).toFixed(2)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              Comissão {commission.referrerLevel >= 3 ? '(Nível 3)' : commission.referrerLevel === 2 ? '(Nível 2)' : '(Nível 1)'}
                            </p>
                            <p className="text-lg font-bold text-purple-600">
                              R$ {parseFloat(commission.commissionValue || 0).toFixed(2)}
                            </p>
                          </div>
                        </div>

                        {commission.convertedAt && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                            Convertido em: {formatDate(commission.convertedAt)}
                          </p>
                        )}

                        {commission.commissionPaidAt && (
                          <p className="text-xs text-green-600 mt-2">
                            Pago em: {formatDate(commission.commissionPaidAt, "dd/MM/yyyy")}
                            {commission.commissionPaymentMethod && ` • ${commission.commissionPaymentMethod}`}
                          </p>
                        )}

                        {commission.commissionNotes && (
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-2 italic">
                            {commission.commissionNotes}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-col gap-2">
                        <Link to={`${createPageUrl("ReferralDetail")}?id=${commission.id}`}>
                          <Button variant="outline" size="sm">
                            <Eye className="w-3 h-3 mr-1" />
                            Ver
                          </Button>
                        </Link>

                        {isAdmin && commission.effectiveCommissionStatus === 'pending' && (
                          <Button
                            size="sm"
                            onClick={() => handleApproveCommission(commission)}
                            disabled={updateCommissionMutation.isPending}
                            className="bg-blue-600 hover:bg-blue-700"
                          >
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Aprovar
                          </Button>
                        )}

                        {isAdmin && commission.effectiveCommissionStatus === 'aprovada' && (
                          <Button
                            size="sm"
                            onClick={() => handleOpenPaymentDialog(commission)}
                            disabled={updateCommissionMutation.isPending}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            <DollarSign className="w-3 h-3 mr-1" />
                            Pagar
                          </Button>
                        )}

                        {isAdmin && (commission.effectiveCommissionStatus === 'pending' || commission.effectiveCommissionStatus === 'aprovada') && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleCancelCommission(commission)}
                            disabled={updateCommissionMutation.isPending}
                          >
                            <XCircle className="w-3 h-3 mr-1" />
                            Cancelar
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
      </div>

      {/* Dialog Registrar Pagamento */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Pagamento de Comissão</DialogTitle>
          </DialogHeader>
          {selectedCommission && (
            <div className="space-y-4 py-4">
              <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
                <p className="text-sm text-gray-600">Indicador</p>
                <p className="font-semibold text-gray-900">{selectedCommission.referrerName}</p>
                <p className="text-2xl font-bold text-purple-600 mt-2">
                  R$ {parseFloat(selectedCommission.commissionValue || 0).toFixed(2)}
                </p>
              </div>

              <div>
                <Label>Forma de Pagamento *</Label>
                <Select
                  value={paymentData.paymentMethod}
                  onValueChange={(value) => setPaymentData({ ...paymentData, paymentMethod: value })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pix">PIX</SelectItem>
                    <SelectItem value="transferencia">Transferência Bancária</SelectItem>
                    <SelectItem value="desconto_mensalidade">Desconto na Mensalidade</SelectItem>
                    <SelectItem value="credito_conta">Crédito na Conta</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Observações</Label>
                <Textarea
                  value={paymentData.notes}
                  onChange={(e) => setPaymentData({ ...paymentData, notes: e.target.value })}
                  placeholder="Informações adicionais sobre o pagamento..."
                  rows={3}
                  className="mt-1"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPaymentDialog(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handlePayCommission}
              disabled={!paymentData.paymentMethod || updateCommissionMutation.isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Confirmar Pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}