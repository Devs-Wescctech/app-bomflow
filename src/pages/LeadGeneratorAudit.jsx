import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Shield, ShieldCheck, ShieldAlert, ShieldX,
  Send, CheckCircle2, TrendingUp, DollarSign,
  Loader2, RefreshCw, AlertTriangle, Phone,
  ChevronDown, ChevronUp, FileBarChart, Users,
  ArrowRightLeft, Target, Clock, Copy
} from "lucide-react";
import { format, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { extractApiError } from "@/utils/apiError";

const API_BASE = '/api';

function getAuthHeaders() {
  const token = localStorage.getItem('accessToken');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function CollapsibleSection({ title, icon: Icon, iconColor = "text-indigo-500", children, defaultOpen = true, badge }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card>
      <CardHeader className="pb-2 cursor-pointer select-none" onClick={() => setOpen(!open)}>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
            <Icon className={`w-4 h-4 ${iconColor}`} /> {title}
            {badge}
          </CardTitle>
          {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </CardHeader>
      {open && <CardContent>{children}</CardContent>}
    </Card>
  );
}

function AuditStatusBanner({ data }) {
  if (!data) return null;

  const { inconsistencias } = data;
  const totalInconsistencias =
    (inconsistencias?.vendas_sem_disparo?.length || 0) +
    (inconsistencias?.disparos_sem_venda?.length || 0) +
    (inconsistencias?.possiveis_duplicidades?.length || 0);

  let status, StatusIcon, bgClass, textClass, borderClass, message;

  if (totalInconsistencias === 0) {
    status = 'healthy';
    StatusIcon = ShieldCheck;
    bgClass = 'bg-emerald-50 dark:bg-emerald-950/30';
    textClass = 'text-emerald-700 dark:text-emerald-400';
    borderClass = 'border-emerald-200 dark:border-emerald-800';
    message = 'Métricas consistentes — nenhuma inconsistência encontrada.';
  } else if (totalInconsistencias <= 10) {
    status = 'warning';
    StatusIcon = ShieldAlert;
    bgClass = 'bg-amber-50 dark:bg-amber-950/30';
    textClass = 'text-amber-700 dark:text-amber-400';
    borderClass = 'border-amber-200 dark:border-amber-800';
    message = `Pequenas divergências encontradas (${totalInconsistencias} item${totalInconsistencias > 1 ? 's' : ''}).`;
  } else {
    status = 'critical';
    StatusIcon = ShieldX;
    bgClass = 'bg-red-50 dark:bg-red-950/30';
    textClass = 'text-red-700 dark:text-red-400';
    borderClass = 'border-red-200 dark:border-red-800';
    message = `Divergências críticas encontradas (${totalInconsistencias} itens). Revisão necessária.`;
  }

  return (
    <div className={`rounded-xl border ${borderClass} ${bgClass} p-4 flex items-center gap-3`}>
      <StatusIcon className={`w-6 h-6 ${textClass}`} />
      <div>
        <p className={`font-semibold ${textClass}`}>Status da Auditoria</p>
        <p className={`text-sm ${textClass} opacity-80`}>{message}</p>
      </div>
    </div>
  );
}

export default function LeadGeneratorAudit() {
  const [from, setFrom] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [to, setTo] = useState(format(new Date(), 'yyyy-MM-dd'));

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (from) params.set('from', `${from}T00:00:00`);
    if (to) params.set('to', `${to}T23:59:59`);
    return params.toString();
  }, [from, to]);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['lead-generator-metrics-audit', queryParams],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/functions/lead-generator-metrics-audit?${queryParams}`, {
        headers: getAuthHeaders()
      });
      if (!res.ok) throw new Error(await extractApiError(res, 'Falha ao carregar auditoria'));
      return res.json();
    },
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
  });

  const totais = data?.totais || {};
  const inconsistencias = data?.inconsistencias || {};
  const validacao = data?.validacao_metricas || {};

  const summaryCards = [
    { label: "Leads Disparados", value: totais.leads_disparados || 0, icon: Send, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/30" },
    { label: "Disparos com Sucesso", value: totais.leads_sucesso || 0, icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
    { label: "Leads Únicos", value: totais.leads_unicos_disparados || 0, icon: Users, color: "text-violet-600", bg: "bg-violet-50 dark:bg-violet-950/30" },
    { label: "Vendas no ERP", value: totais.vendas_erp || 0, icon: FileBarChart, color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/30" },
    { label: "Vendas Vinculadas", value: totais.vendas_vinculadas || 0, icon: ArrowRightLeft, color: "text-indigo-600", bg: "bg-indigo-50 dark:bg-indigo-950/30" },
    { label: "Valor Total ERP", value: formatCurrency(totais.valor_total_erp), icon: DollarSign, color: "text-green-600", bg: "bg-green-50 dark:bg-green-950/30", isText: true },
    { label: "Valor Dashboard", value: formatCurrency(totais.valor_total_dashboard), icon: Target, color: "text-pink-600", bg: "bg-pink-50 dark:bg-pink-950/30", isText: true },
  ];

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Shield className="w-6 h-6 text-indigo-600" />
            Auditoria de Métricas
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Validação de consistência entre métricas do dashboard e dados do ERP
          </p>
        </div>
        <Button
          onClick={() => refetch()}
          disabled={isFetching}
          className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2"
        >
          {isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Executar Auditoria
        </Button>
      </div>

      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Período Inicial</Label>
              <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-44" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Período Final</Label>
              <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-44" />
            </div>
            <div className="flex gap-2">
              {[
                { label: "Hoje", days: 0 },
                { label: "7d", days: 7 },
                { label: "30d", days: 30 },
                { label: "90d", days: 90 },
              ].map(p => (
                <Button
                  key={p.label}
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setFrom(format(subDays(new Date(), p.days), 'yyyy-MM-dd'));
                    setTo(format(new Date(), 'yyyy-MM-dd'));
                  }}
                  className="text-xs"
                >
                  {p.label}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
          <span className="ml-3 text-gray-500">Carregando auditoria...</span>
        </div>
      ) : data?.success === false ? (
        <Card>
          <CardContent className="py-10 text-center">
            <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-3" />
            <p className="text-red-600 font-medium">Erro ao carregar auditoria</p>
            <p className="text-sm text-gray-500 mt-1">{data?.error || 'Erro desconhecido'}</p>
          </CardContent>
        </Card>
      ) : data ? (
        <div className="space-y-6">
          <AuditStatusBanner data={data} />

          <CollapsibleSection title="Resumo da Auditoria" icon={FileBarChart} iconColor="text-blue-500">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
              {summaryCards.map((c, i) => (
                <div key={i} className={`rounded-xl ${c.bg} p-3 text-center`}>
                  <c.icon className={`w-5 h-5 mx-auto mb-1 ${c.color}`} />
                  <p className="text-xs text-gray-500 dark:text-gray-400">{c.label}</p>
                  <p className={`text-lg font-bold ${c.color}`}>
                    {c.isText ? c.value : Number(c.value).toLocaleString('pt-BR')}
                  </p>
                </div>
              ))}
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="Validação das Métricas" icon={TrendingUp} iconColor="text-emerald-500">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3 font-medium text-gray-600 dark:text-gray-400">Métrica</th>
                    <th className="text-right py-2 px-3 font-medium text-gray-600 dark:text-gray-400">Recalculado</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="py-2.5 px-3 text-gray-700 dark:text-gray-300">Taxa de Conversão</td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold text-gray-900 dark:text-gray-100">
                      {validacao.taxa_conversao_recalculada || 0}%
                    </td>
                  </tr>
                  <tr className="border-b hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="py-2.5 px-3 text-gray-700 dark:text-gray-300">ROI por Disparo</td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold text-gray-900 dark:text-gray-100">
                      {formatCurrency(validacao.roi_recalculado || 0)}
                    </td>
                  </tr>
                  <tr className="border-b hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="py-2.5 px-3 text-gray-700 dark:text-gray-300">Conversões Identificadas</td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold text-gray-900 dark:text-gray-100">
                      {validacao.conversoes_identificadas || 0}
                    </td>
                  </tr>
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="py-2.5 px-3 text-gray-700 dark:text-gray-300">Leads Convertidos</td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold text-gray-900 dark:text-gray-100">
                      {validacao.leads_convertidos || 0}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title="Vendas do ERP sem Disparo"
            icon={AlertTriangle}
            iconColor="text-amber-500"
            defaultOpen={false}
            badge={
              inconsistencias.vendas_sem_disparo?.length > 0 && (
                <Badge variant="outline" className="ml-2 text-amber-600 border-amber-300 bg-amber-50">
                  {inconsistencias.vendas_sem_disparo.length}
                </Badge>
              )
            }
          >
            {inconsistencias.vendas_sem_disparo?.length > 0 ? (
              <div className="overflow-x-auto max-h-96">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white dark:bg-gray-900">
                    <tr className="border-b">
                      <th className="text-left py-2 px-3 font-medium text-gray-600 dark:text-gray-400">Telefone</th>
                      <th className="text-left py-2 px-3 font-medium text-gray-600 dark:text-gray-400">Nome</th>
                      <th className="text-left py-2 px-3 font-medium text-gray-600 dark:text-gray-400">Contrato</th>
                      <th className="text-right py-2 px-3 font-medium text-gray-600 dark:text-gray-400">Valor</th>
                      <th className="text-left py-2 px-3 font-medium text-gray-600 dark:text-gray-400">Data</th>
                      <th className="text-left py-2 px-3 font-medium text-gray-600 dark:text-gray-400">Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inconsistencias.vendas_sem_disparo.map((v, i) => (
                      <tr key={i} className="border-b hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="py-2 px-3 font-mono text-xs">{v.cel_indicador}</td>
                        <td className="py-2 px-3 text-gray-700 dark:text-gray-300">{v.nome_indicador || '—'}</td>
                        <td className="py-2 px-3 text-gray-600 dark:text-gray-400 text-xs">{v.contrato_servicos || '—'}</td>
                        <td className="py-2 px-3 text-right font-mono">{formatCurrency(v.valor_contrato)}</td>
                        <td className="py-2 px-3 text-gray-600 dark:text-gray-400 text-xs">
                          {v.data_contrato ? format(new Date(v.data_contrato), 'dd/MM/yyyy', { locale: ptBR }) : '—'}
                        </td>
                        <td className="py-2 px-3">
                          {v.motivo && (
                            <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                              {v.motivo}
                            </Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-gray-500 py-4 text-center">Nenhuma venda sem disparo correspondente.</p>
            )}
          </CollapsibleSection>

          <CollapsibleSection
            title="Leads Disparados sem Venda"
            icon={Phone}
            iconColor="text-blue-500"
            defaultOpen={false}
            badge={
              inconsistencias.disparos_sem_venda?.length > 0 && (
                <Badge variant="outline" className="ml-2 text-blue-600 border-blue-300 bg-blue-50">
                  {inconsistencias.disparos_sem_venda.length}
                </Badge>
              )
            }
          >
            {inconsistencias.disparos_sem_venda?.length > 0 ? (
              <div className="overflow-x-auto max-h-96">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white dark:bg-gray-900">
                    <tr className="border-b">
                      <th className="text-left py-2 px-3 font-medium text-gray-600 dark:text-gray-400">Telefone Original</th>
                      <th className="text-left py-2 px-3 font-medium text-gray-600 dark:text-gray-400">Normalizado</th>
                      <th className="text-left py-2 px-3 font-medium text-gray-600 dark:text-gray-400">Data Disparo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inconsistencias.disparos_sem_venda.map((d, i) => (
                      <tr key={i} className="border-b hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="py-2 px-3 font-mono text-xs">{d.lead_number}</td>
                        <td className="py-2 px-3 font-mono text-xs text-gray-500">{d.telefone_normalizado}</td>
                        <td className="py-2 px-3 text-gray-600 dark:text-gray-400 text-xs">
                          {d.data_disparo ? format(new Date(d.data_disparo), 'dd/MM/yyyy HH:mm', { locale: ptBR }) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-gray-500 py-4 text-center">Todos os leads disparados possuem vendas correspondentes.</p>
            )}
          </CollapsibleSection>

          <CollapsibleSection
            title="Possíveis Duplicidades"
            icon={Copy}
            iconColor="text-red-500"
            defaultOpen={false}
            badge={
              inconsistencias.possiveis_duplicidades?.length > 0 && (
                <Badge variant="outline" className="ml-2 text-red-600 border-red-300 bg-red-50">
                  {inconsistencias.possiveis_duplicidades.length}
                </Badge>
              )
            }
          >
            {inconsistencias.possiveis_duplicidades?.length > 0 ? (
              <div className="space-y-3">
                {inconsistencias.possiveis_duplicidades.map((dup, i) => (
                  <div key={i} className="rounded-lg border border-red-100 dark:border-red-900 bg-red-50/50 dark:bg-red-950/20 p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Phone className="w-4 h-4 text-red-500" />
                      <span className="font-mono text-sm font-medium">{dup.telefone}</span>
                      <Badge variant="outline" className="text-xs text-red-600 border-red-300">
                        {dup.total_contratos} contratos
                      </Badge>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-red-200 dark:border-red-800">
                            <th className="text-left py-1 px-2 text-gray-500">Contrato</th>
                            <th className="text-right py-1 px-2 text-gray-500">Valor</th>
                            <th className="text-left py-1 px-2 text-gray-500">Data</th>
                            <th className="text-left py-1 px-2 text-gray-500">Situação</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dup.contratos?.map((c, j) => (
                            <tr key={j} className="border-b border-red-100 dark:border-red-900/50">
                              <td className="py-1 px-2 font-mono">{c.contrato || '—'}</td>
                              <td className="py-1 px-2 text-right font-mono">{formatCurrency(c.valor)}</td>
                              <td className="py-1 px-2">{c.data ? format(new Date(c.data), 'dd/MM/yyyy', { locale: ptBR }) : '—'}</td>
                              <td className="py-1 px-2">{c.situacao || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 py-4 text-center">Nenhuma duplicidade detectada.</p>
            )}
          </CollapsibleSection>
        </div>
      ) : null}
    </div>
  );
}
