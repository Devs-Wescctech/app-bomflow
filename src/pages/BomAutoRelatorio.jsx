import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import {
  FileBarChart, Search, Filter, Loader2, Download,
  Calendar, ChevronDown, ChevronUp, FileSpreadsheet, FileText, ShieldAlert
} from "lucide-react";

const API_BASE = '/api';

const TIPOS_SERVICO = [
  "Chaveiro",
  "Guincho",
  "Pane elétrica",
  "Pane seca",
  "Serviços de táxi",
  "Troca de pneu",
];

const STATUS_OPTIONS = [
  "Pendente",
  "Em Tratamento",
  "Solucionado",
  "Cancelado",
];

function getAuthHeaders() {
  const token = localStorage.getItem('accessToken');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function formatDateOnly(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  });
}

function formatDateForFile() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

function StatusBadge({ status }) {
  if (!status) return null;
  const s = status.toLowerCase();
  let className = "";
  if (s === "pendente") {
    className = "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/50 dark:text-amber-300 dark:border-amber-700";
  } else if (s === "em tratamento") {
    className = "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/50 dark:text-blue-300 dark:border-blue-700";
  } else if (s === "solucionado" || s === "concluído" || s === "finalizado") {
    className = "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/50 dark:text-emerald-300 dark:border-emerald-700";
  } else if (s === "cancelado") {
    className = "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/50 dark:text-red-300 dark:border-red-700";
  } else {
    className = "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/50 dark:text-blue-300 dark:border-blue-700";
  }
  return <Badge variant="outline" className={className}>{status}</Badge>;
}

export default function BomAutoRelatorio() {
  const { toast } = useToast();

  const [currentUser, setCurrentUser] = useState(null);
  const [authorized, setAuthorized] = useState(null);
  const [atendimentos, setAtendimentos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [atendentes, setAtendentes] = useState([]);
  const [exporting, setExporting] = useState(null);

  const [filterDataInicio, setFilterDataInicio] = useState("");
  const [filterDataFim, setFilterDataFim] = useState("");
  const [filterDocumento, setFilterDocumento] = useState("");
  const [filterTipoServico, setFilterTipoServico] = useState("todos");
  const [filterStatus, setFilterStatus] = useState("todos");
  const [filterAtendente, setFilterAtendente] = useState("todos");

  useEffect(() => {
    async function fetchUser() {
      try {
        const res = await fetch(`${API_BASE}/auth/me`, {
          headers: { ...getAuthHeaders() },
        });
        if (res.ok) {
          const data = await res.json();
          setCurrentUser(data);
          const tipo = (data.agent?.agentType || data.agentType || '').toLowerCase();
          const role = (data.role || '').toLowerCase();
          setAuthorized(tipo === 'admin' || tipo === 'sales_supervisor' || role === 'admin');
        } else {
          setAuthorized(false);
        }
      } catch (e) {
        setAuthorized(false);
      }
    }
    fetchUser();
  }, []);

  useEffect(() => {
    if (authorized) {
      fetchAtendentes();
    }
  }, [authorized]);

  async function fetchAtendentes() {
    try {
      const res = await fetch(`${API_BASE}/bom-auto/atendimentos/atendentes`, {
        headers: { ...getAuthHeaders() },
      });
      if (res.ok) {
        const data = await res.json();
        setAtendentes(data);
      }
    } catch (e) {}
  }

  async function fetchRelatorio() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterDataInicio) params.set('data_inicio', filterDataInicio);
      if (filterDataFim) params.set('data_fim', filterDataFim);
      if (filterDocumento.trim()) params.set('documento', filterDocumento.trim());
      if (filterTipoServico !== 'todos') params.set('tipo_servico', filterTipoServico);
      if (filterStatus !== 'todos') params.set('status', filterStatus);
      if (filterAtendente !== 'todos') params.set('atendente', filterAtendente);

      const res = await fetch(`${API_BASE}/bom-auto/atendimentos?${params.toString()}`, {
        headers: { ...getAuthHeaders() },
      });
      if (!res.ok) throw new Error('Erro ao buscar dados');
      const data = await res.json();
      data.sort((a, b) => new Date(b.data_hora || b.created_at) - new Date(a.data_hora || a.created_at));
      setAtendimentos(data);
    } catch (err) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  function handleFilter(e) {
    e.preventDefault();
    fetchRelatorio();
  }

  function handleClearFilters() {
    setFilterDataInicio("");
    setFilterDataFim("");
    setFilterDocumento("");
    setFilterTipoServico("todos");
    setFilterStatus("todos");
    setFilterAtendente("todos");
    setAtendimentos([]);
  }

  function getExportData() {
    return atendimentos.map(at => ({
      'Data Atendimento': formatDateTime(at.data_hora || at.created_at),
      'Contrato / Serviços': at.contratos_servicos || '-',
      'Documento': at.documento_cliente || '-',
      'Placa': at.placa || '-',
      'Tipo de Serviço': at.tipo_servico || '-',
      'Status': at.status_atendimento || '-',
      'Atendente': at.usuario || '-',
    }));
  }

  async function handleExportExcel() {
    if (atendimentos.length === 0) {
      toast({ title: "Aviso", description: "Nenhum dado para exportar. Aplique os filtros primeiro.", variant: "destructive" });
      return;
    }
    setExporting('excel');
    try {
      const XLSX = await import('xlsx');
      const data = getExportData();
      const ws = XLSX.utils.json_to_sheet(data);

      const colWidths = [
        { wch: 20 },
        { wch: 35 },
        { wch: 18 },
        { wch: 12 },
        { wch: 20 },
        { wch: 16 },
        { wch: 30 },
      ];
      ws['!cols'] = colWidths;

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Relatório');
      XLSX.writeFile(wb, `Relatorio_Utilizacoes_${formatDateForFile()}.xlsx`);
      toast({ title: "Sucesso", description: "Relatório exportado em Excel." });
    } catch (err) {
      toast({ title: "Erro", description: "Erro ao gerar Excel: " + err.message, variant: "destructive" });
    } finally {
      setExporting(null);
    }
  }

  async function handleExportPDF() {
    if (atendimentos.length === 0) {
      toast({ title: "Aviso", description: "Nenhum dado para exportar. Aplique os filtros primeiro.", variant: "destructive" });
      return;
    }
    setExporting('pdf');
    try {
      const jsPDFModule = await import('jspdf');
      const jsPDF = jsPDFModule.default || jsPDFModule.jsPDF;
      await import('jspdf-autotable');

      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('Relatório de Utilizações - Bom Auto', 14, 18);

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 25);
      doc.text(`Total de registros: ${atendimentos.length}`, 14, 30);

      const headers = [['Data', 'Contrato/Serviços', 'Documento', 'Placa', 'Tipo Serviço', 'Status', 'Atendente']];
      const data = atendimentos.map(at => [
        formatDateTime(at.data_hora || at.created_at),
        at.contratos_servicos || '-',
        at.documento_cliente || '-',
        at.placa || '-',
        at.tipo_servico || '-',
        at.status_atendimento || '-',
        at.usuario || '-',
      ]);

      doc.autoTable({
        head: headers,
        body: data,
        startY: 35,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [14, 165, 233], textColor: 255, fontStyle: 'bold', fontSize: 8 },
        alternateRowStyles: { fillColor: [245, 247, 250] },
        margin: { left: 14, right: 14 },
        didDrawPage: function (hookData) {
          const pageCount = doc.internal.getNumberOfPages();
          doc.setFontSize(8);
          doc.setFont('helvetica', 'normal');
          doc.text(
            `Página ${hookData.pageNumber} de ${pageCount}`,
            doc.internal.pageSize.getWidth() - 30,
            doc.internal.pageSize.getHeight() - 8
          );
        },
      });

      doc.save(`Relatorio_Utilizacoes_${formatDateForFile()}.pdf`);
      toast({ title: "Sucesso", description: "Relatório exportado em PDF." });
    } catch (err) {
      toast({ title: "Erro", description: "Erro ao gerar PDF: " + err.message, variant: "destructive" });
    } finally {
      setExporting(null);
    }
  }

  if (authorized === null) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="p-4 md:p-6 bg-gray-50 dark:bg-gray-950 min-h-screen flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <div className="mx-auto w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <ShieldAlert className="w-8 h-8 text-red-500" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Acesso Restrito</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Este relatório está disponível apenas para Supervisores de Vendas e Administradores.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 bg-gray-50 dark:bg-gray-950 min-h-screen">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-sky-500 to-cyan-500 shadow-lg">
              <FileBarChart className="w-5 h-5 text-white" />
            </div>
            Relatório de Utilizações
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <button
              type="button"
              onClick={() => setFiltersOpen(!filtersOpen)}
              className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:text-sky-600 dark:hover:text-sky-400 transition-colors"
            >
              <Filter className="w-4 h-4" />
              Filtros Avançados
              {filtersOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>

          {filtersOpen && (
            <form onSubmit={handleFilter} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" /> Data Início
                  </Label>
                  <Input
                    type="date"
                    value={filterDataInicio}
                    onChange={e => setFilterDataInicio(e.target.value)}
                    className="border-gray-200 dark:border-gray-700"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" /> Data Fim
                  </Label>
                  <Input
                    type="date"
                    value={filterDataFim}
                    onChange={e => setFilterDataFim(e.target.value)}
                    className="border-gray-200 dark:border-gray-700"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Documento (CPF)</Label>
                  <Input
                    placeholder="CPF do cliente"
                    value={filterDocumento}
                    onChange={e => setFilterDocumento(e.target.value)}
                    className="border-gray-200 dark:border-gray-700"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Tipo de Serviço</Label>
                  <Select value={filterTipoServico} onValueChange={setFilterTipoServico}>
                    <SelectTrigger className="border-gray-200 dark:border-gray-700">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos</SelectItem>
                      {TIPOS_SERVICO.map(t => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Status</Label>
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="border-gray-200 dark:border-gray-700">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos</SelectItem>
                      {STATUS_OPTIONS.map(s => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Atendente</Label>
                  <Select value={filterAtendente} onValueChange={setFilterAtendente}>
                    <SelectTrigger className="border-gray-200 dark:border-gray-700">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos</SelectItem>
                      {atendentes.map(a => (
                        <SelectItem key={a} value={a}>{a}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex gap-3">
                <Button type="submit" disabled={loading} className="bg-sky-600 hover:bg-sky-700 text-white">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  Buscar
                </Button>
                <Button type="button" variant="outline" onClick={handleClearFilters}>
                  Limpar Filtros
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      {atendimentos.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <CardTitle className="text-base flex items-center gap-2">
                Resultados
                <Badge variant="secondary" className="ml-1">{atendimentos.length} registros</Badge>
              </CardTitle>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportExcel}
                  disabled={!!exporting}
                  className="text-emerald-700 border-emerald-300 hover:bg-emerald-50 dark:text-emerald-400 dark:border-emerald-700 dark:hover:bg-emerald-900/30"
                >
                  {exporting === 'excel' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
                  Excel
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportPDF}
                  disabled={!!exporting}
                  className="text-red-700 border-red-300 hover:bg-red-50 dark:text-red-400 dark:border-red-700 dark:hover:bg-red-900/30"
                >
                  {exporting === 'pdf' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                  PDF
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800/50">
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300 whitespace-nowrap">Data Atendimento</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300 whitespace-nowrap">Contrato / Serviços</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300 whitespace-nowrap">Documento</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300 whitespace-nowrap">Placa</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300 whitespace-nowrap">Tipo de Serviço</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300 whitespace-nowrap">Status</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300 whitespace-nowrap">Atendente</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {atendimentos.map((at, idx) => (
                    <tr
                      key={at.id || idx}
                      className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors"
                    >
                      <td className="px-4 py-3 whitespace-nowrap text-gray-700 dark:text-gray-300">
                        {formatDateTime(at.data_hora || at.created_at)}
                      </td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300 max-w-[250px] truncate" title={at.contratos_servicos || '-'}>
                        {at.contratos_servicos || '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-700 dark:text-gray-300 font-mono text-xs">
                        {at.documento_cliente || '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-700 dark:text-gray-300 font-mono">
                        {at.placa || '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-700 dark:text-gray-300">
                        {at.tipo_servico || '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <StatusBadge status={at.status_atendimento} />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-700 dark:text-gray-300">
                        {at.usuario || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {!loading && atendimentos.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <FileBarChart className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              Utilize os filtros acima e clique em "Buscar" para gerar o relatório.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
