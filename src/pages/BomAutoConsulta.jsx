import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import {
  Car, Search, CheckCircle, XCircle, AlertTriangle,
  Loader2, User, Wrench, FileText, Phone, Hash,
  ClipboardCheck, Calendar, Shield,
  Copy, RefreshCw, Clock, Download, Save
} from "lucide-react";

const API_BASE = '/api';

function getAuthHeaders() {
  const token = localStorage.getItem('accessToken');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

function formatCPF(value) {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function formatPlaca(value) {
  const clean = value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 7);
  if (clean.length <= 3) return clean;
  return `${clean.slice(0, 3)}-${clean.slice(3)}`;
}

function validateCPF(cpf) {
  const digits = cpf.replace(/\D/g, '');
  return digits.length === 11;
}

function validatePlaca(placa) {
  const clean = placa.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (clean.length !== 7) return false;
  const oldFormat = /^[A-Z]{3}[0-9]{4}$/.test(clean);
  const mercosulFormat = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/.test(clean);
  return oldFormat || mercosulFormat;
}

function stripHTML(str) {
  return str.replace(/<[^>]*>/g, '');
}

function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const TIPOS_SERVICO = [
  "Chaveiro",
  "Guincho",
  "Pane elétrica",
  "Pane seca",
  "Serviços de táxi",
  "Troca de pneu",
];

function StatusBadge({ status }) {
  if (!status) return null;
  const s = status.toLowerCase();
  let variant = "default";
  let className = "";
  if (s === "pendente") {
    className = "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/50 dark:text-amber-300 dark:border-amber-700";
  } else if (s === "concluído" || s === "concluido" || s === "finalizado") {
    className = "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/50 dark:text-emerald-300 dark:border-emerald-700";
  } else if (s === "cancelado") {
    className = "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/50 dark:text-red-300 dark:border-red-700";
  } else {
    className = "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/50 dark:text-blue-300 dark:border-blue-700";
  }
  return <Badge variant="outline" className={className}>{status}</Badge>;
}

export default function BomAutoConsulta() {
  const { toast } = useToast();

  const [currentUser, setCurrentUser] = useState(null);
  const [searchCPF, setSearchCPF] = useState('');
  const [searchPlaca, setSearchPlaca] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [clientData, setClientData] = useState(null);
  const [utilizacoes, setUtilizacoes] = useState(null);
  const [eligibility, setEligibility] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState('');
  const [tipoServico, setTipoServico] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [telefoneContato, setTelefoneContato] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [atendimentoFinalizado, setAtendimentoFinalizado] = useState(null);

  const [termoLocal, setTermoLocal] = useState('');
  const [termoRua, setTermoRua] = useState('');
  const [termoValoresCombinados, setTermoValoresCombinados] = useState('');
  const [termoDescricaoProduto, setTermoDescricaoProduto] = useState('');
  const [termoSalvo, setTermoSalvo] = useState(false);
  const [termoModalAt, setTermoModalAt] = useState(null);

  useEffect(() => {
    async function fetchUser() {
      try {
        const res = await fetch(`${API_BASE}/auth/me`, {
          headers: { ...getAuthHeaders() },
        });
        if (res.ok) {
          const data = await res.json();
          setCurrentUser(data);
        }
      } catch (e) {}
    }
    fetchUser();
  }, []);

  function getVehicles() {
    if (!clientData) return [];
    if (Array.isArray(clientData.veiculos)) return clientData.veiculos;
    if (clientData.data && Array.isArray(clientData.data.veiculos)) return clientData.data.veiculos;
    return [];
  }

  function checkEligibility(data, utilizacoesCount) {
    const reasons = [];
    const isFuncionario = data.is_funcionario === true;
    const contrato = (data.situacao_contrato || data.data?.situacao_contrato || '').toLowerCase();
    const financeira = (data.situacao_financeira || data.data?.situacao_financeira || '').toLowerCase();
    const veiculos = Array.isArray(data.veiculos) ? data.veiculos : (data.data?.veiculos || []);

    if (!isFuncionario) {
      const isAtivo = contrato.includes('ativo') && !contrato.includes('inativo');
      if (!isAtivo) {
        reasons.push(`Contrato não está ativo (${(data.situacao_contrato || data.data?.situacao_contrato || 'N/A').toUpperCase()})`);
      }
      const isAdimplente = (financeira.includes('adimplente') && !financeira.includes('inadimplente')) || financeira.includes('em dia');
      if (!isAdimplente) {
        reasons.push(`Situação financeira não está adimplente (${(data.situacao_financeira || data.data?.situacao_financeira || 'N/A').toUpperCase()})`);
      }
    }

    if (veiculos.length > 3) {
      reasons.push(`Número de veículos (${veiculos.length}) excede o limite de 3`);
    }
    if (utilizacoesCount >= 3) {
      reasons.push(`Utilizações no ano (${utilizacoesCount}) excede o limite de 3`);
    }

    return { eligible: reasons.length === 0, reasons, isFuncionario };
  }

  async function handleSearch(e) {
    e.preventDefault();
    setError('');
    setClientData(null);
    setUtilizacoes(null);
    setEligibility(null);
    setShowForm(false);
    setSelectedVehicle('');
    setTipoServico('');
    setObservacoes('');
    setTelefoneContato('');
    setAtendimentoFinalizado(null);

    const cpfDigits = searchCPF.replace(/\D/g, '');
    const placaClean = searchPlaca.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

    if (!cpfDigits && !placaClean) {
      setError('Informe pelo menos o CPF ou a Placa para consultar.');
      return;
    }
    if (cpfDigits && !validateCPF(searchCPF)) {
      setError('CPF inválido. Informe 11 dígitos.');
      return;
    }
    if (placaClean && !validatePlaca(searchPlaca)) {
      setError('Placa inválida. Formatos aceitos: ABC-1234 ou ABC1D23.');
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (cpfDigits) params.set('documento', cpfDigits);
      if (placaClean) params.set('placa', placaClean);

      const res = await fetch(`${API_BASE}/bom-auto/consulta?${params.toString()}`, {
        headers: { ...getAuthHeaders() },
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || errData.message || 'Erro ao consultar cliente.');
      }

      const data = await res.json();
      setClientData(data);

      const doc = data.documento || data.data?.documento || cpfDigits;
      let utilizacoesData = { count: 0, atendimentos: [] };
      if (doc) {
        try {
          const utilRes = await fetch(`${API_BASE}/bom-auto/utilizacoes/${doc}`, {
            headers: { ...getAuthHeaders() },
          });
          if (utilRes.ok) {
            const utilData = await utilRes.json();
            utilizacoesData = {
              count: utilData.count ?? utilData.utilizacoes ?? utilData.total ?? 0,
              atendimentos: utilData.atendimentos || [],
            };
          }
        } catch (e) {}
      }
      setUtilizacoes(utilizacoesData);

      const elig = checkEligibility(data, utilizacoesData.count);
      setEligibility(elig);
    } catch (err) {
      setError(err.message || 'Erro ao consultar cliente.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmitAtendimento(e) {
    e.preventDefault();

    const vehicles = getVehicles();
    if (!selectedVehicle) {
      toast({ title: "Erro", description: "Selecione um veículo.", variant: "destructive" });
      return;
    }
    if (!tipoServico) {
      toast({ title: "Erro", description: "Selecione o tipo de serviço.", variant: "destructive" });
      return;
    }
    const telefoneDigits = telefoneContato.replace(/\D/g, '');
    if (!telefoneDigits || telefoneDigits.length < 10) {
      toast({ title: "Erro", description: "Informe um telefone de contato válido (mínimo 10 dígitos).", variant: "destructive" });
      return;
    }

    const vehicle = vehicles.find(v => v.placa === selectedVehicle);
    if (!vehicle) {
      toast({ title: "Erro", description: "Veículo não encontrado.", variant: "destructive" });
      return;
    }

    const sanitizedObs = stripHTML(observacoes);
    const documento = clientData?.documento || clientData?.data?.documento || '';
    const nome = clientData?.contratante || clientData?.data?.contratante || '';
    const usuario = currentUser?.email || currentUser?.name || currentUser?.username || '';

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/bom-auto/atendimentos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          documento_cliente: documento,
          nome_cliente: nome,
          placa: vehicle.placa,
          descricao_veiculo: vehicle.descricao_veiculo_limpa || vehicle.descricao_veiculo || '',
          tipo_servico: tipoServico,
          observacoes: sanitizedObs,
          usuario: usuario,
          telefone_contato: telefoneDigits,
          contratos_servicos: clientData?.contratos_servicos || clientData?.data?.contratos_servicos || '',
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || errData.message || 'Erro ao registrar atendimento.');
      }

      const atendimento = await res.json();

      setAtendimentoFinalizado(atendimento);
      setShowForm(false);
      toast({ title: "Sucesso", description: `Atendimento registrado! Protocolo: ${atendimento.protocolo}` });
    } catch (err) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  function handleCancelForm() {
    setShowForm(false);
    setSelectedVehicle('');
    setTipoServico('');
    setObservacoes('');
    setTelefoneContato('');
  }

  function handleNovaConsulta() {
    setSearchCPF('');
    setSearchPlaca('');
    setClientData(null);
    setUtilizacoes(null);
    setEligibility(null);
    setShowForm(false);
    setSelectedVehicle('');
    setTipoServico('');
    setObservacoes('');
    setTelefoneContato('');
    setAtendimentoFinalizado(null);
    setError('');
    setTermoLocal('');
    setTermoRua('');
    setTermoValoresCombinados('');
    setTermoDescricaoProduto('');
    setTermoSalvo(false);
  }

  async function handleSalvarTermo() {
    if (!atendimentoFinalizado?.id) return;
    try {
      const resp = await fetch(`${API_BASE}/bom-auto/atendimentos/${atendimentoFinalizado.id}/termo`, {
        method: 'PATCH',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          termo_local: termoLocal,
          termo_rua: termoRua,
          termo_valores_combinados: termoValoresCombinados,
          termo_descricao_produto: termoDescricaoProduto,
        }),
      });
      if (!resp.ok) throw new Error('Falha ao salvar');
      setTermoSalvo(true);
      toast({ title: "Autorização salva com sucesso!", description: "O botão para exportar o PDF foi habilitado." });
    } catch {
      toast({ title: "Erro ao salvar", description: "Tente novamente.", variant: "destructive" });
    }
  }

  async function exportTermoPDF(atData, clienteData, termoData) {
    const at = atData || atendimentoFinalizado;
    const cli = clienteData || clientData;
    const td = termoData || { local: termoLocal, rua: termoRua, valores: termoValoresCombinados, descricao: termoDescricaoProduto };
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    const pageW = 210;
    const margin = 14;
    const contentW = pageW - margin * 2;
    let y = margin;

    // ── Paleta ────────────────────────────────────────
    const C = {
      black:    [30, 30, 30],
      darkGray: [60, 60, 60],
      midGray:  [110, 110, 110],
      lightGray:[180, 180, 180],
      hairline: [210, 210, 210],
      white:    [255, 255, 255],
      brand:    [30, 30, 30],
    };

    // ── Helpers ───────────────────────────────────────
    const setF = (style, size) => { doc.setFontSize(size); doc.setFont('helvetica', style); };
    const setTC = (rgb) => doc.setTextColor(...rgb);
    const setDC = (rgb) => doc.setDrawColor(...rgb);
    const setFC = (rgb) => doc.setFillColor(...rgb);
    const hRule = (yPos, color = C.hairline, lw = 0.25) => {
      doc.setLineWidth(lw);
      setDC(color);
      doc.line(margin, yPos, pageW - margin, yPos);
    };

    // helper: label cinza pequeno + valor escuro na linha seguinte
    const labelValue = (label, value, lx, yPos, maxW) => {
      setF('normal', 6.5);
      setTC(C.midGray);
      doc.text(label, lx, yPos);
      setF('bold', 8.5);
      setTC(C.black);
      const lines = doc.splitTextToSize(value || '—', maxW || contentW);
      doc.text(lines, lx, yPos + 4);
      return lines.length;
    };

    doc.setLineWidth(0.25);

    // ── CABEÇALHO (imagem oficial) ────────────────────
    try {
      const resp = await fetch('/bom-auto-header.png');
      const blob = await resp.blob();
      const b64 = await new Promise(res => {
        const reader = new FileReader();
        reader.onload = () => res(reader.result);
        reader.readAsDataURL(blob);
      });
      const imgProps = doc.getImageProperties(b64);
      const headerH = (contentW * imgProps.height) / imgProps.width;
      doc.addImage(b64, 'PNG', margin, y, contentW, headerH);
      y += headerH + 3;
    } catch {
      setFC(C.brand);
      doc.rect(margin, y, contentW, 12, 'F');
      setTC(C.white);
      setF('bold', 10);
      doc.text('BOM AUTO — AUTORIZAÇÃO DE SERVIÇOS', pageW / 2, y + 8, { align: 'center' });
      setTC(C.black);
      y += 16;
    }

    // ── N° DO PROCESSO (canto superior direito) ───────
    const procBoxW = 58;
    const procBoxH = 10;
    const procBoxX = pageW - margin - procBoxW;
    setDC(C.lightGray);
    doc.setLineWidth(0.3);
    doc.rect(procBoxX, y - 1, procBoxW, procBoxH);
    setF('normal', 6);
    setTC(C.midGray);
    doc.text('N° do Processo:', procBoxX + 2, y + 3.5);
    setF('bold', 8);
    setTC(C.black);
    doc.text(at?.protocolo || '', procBoxX + procBoxW - 2, y + 3.5, { align: 'right' });

    y += procBoxH + 3;
    hRule(y);
    y += 5;

    // ── BLOCO DE CABEÇALHO — campos duplos ───────────
    const halfW = (contentW - 6) / 2;

    // Empresa Contratada
    labelValue('Empresa Contratada', 'Bom Auto', margin, y, halfW);
    y += 10;
    hRule(y, C.hairline);
    y += 4;

    // Atendente | Data e Hora
    labelValue('Atendente Responsável', at?.usuario || '', margin, y, halfW);
    const dh = at ? formatDateTime(at.data_hora || at.created_at) : '';
    labelValue('Data e Hora do Atendimento', dh, margin + halfW + 6, y, halfW);
    y += 10;
    hRule(y, C.hairline);
    y += 4;

    // Fone | Contrato
    const tel = at?.telefone_contato
      ? at.telefone_contato.replace(/(\d{2})(\d{4,5})(\d{4})/, '($1) $2-$3')
      : '';
    labelValue('Fone para Contato do Condutor', tel, margin, y, halfW);
    labelValue('Número do Contrato', at?.contratos_servicos || '', margin + halfW + 6, y, halfW);
    y += 10;
    hRule(y, C.hairline);
    y += 4;

    // Nome Titular
    const nomeCliente = cli?.contratante || cli?.data?.contratante || at?.nome_cliente || '';
    labelValue('Nome do Titular', nomeCliente, margin, y, contentW);
    y += 10;
    hRule(y, C.hairline);
    y += 4;

    // Veículo
    labelValue('Veículo Modelo', at?.descricao_veiculo || '', margin, y, contentW);
    y += 10;
    hRule(y, C.hairline);
    y += 4;

    // Local / Cidade
    const localW = contentW * 0.60;
    labelValue('Local / Cidade onde se encontra o Veículo', td.local || '', margin, y, localW);
    setF('normal', 7);
    setTC(C.midGray);
    doc.text('Residência [ ]    Oficina [ ]', margin + localW + 4, y + 4);
    y += 10;
    hRule(y, C.hairline);
    y += 4;

    // Rua
    labelValue('Rua / Av. / Rod. / Ponto de Referência', td.rua || '', margin, y, contentW);
    y += 10;

    // ── SEPARADOR SEÇÃO ───────────────────────────────
    hRule(y, C.darkGray, 0.5);
    y += 4;

    // ── DADOS ADICIONAIS ──────────────────────────────
    setF('bold', 7);
    setTC(C.midGray);
    doc.text('DADOS ADICIONAIS', margin, y);
    y += 5;

    const docCliente = cli?.documento || cli?.data?.documento || at?.documento_cliente || '';
    const addRow = (label, value, lx, valX, yPos) => {
      setF('normal', 6.5);
      setTC(C.midGray);
      doc.text(label + ':', lx, yPos);
      setF('bold', 8);
      setTC(C.black);
      doc.text(value || '—', valX, yPos);
    };

    // 2 colunas por linha
    addRow('Documento', docCliente, margin, margin + 22, y);
    addRow('Placa', at?.placa || '', margin + halfW + 6, margin + halfW + 22, y);
    y += 6;
    hRule(y, C.hairline);
    y += 4;

    addRow('Tipo de Serviço', at?.tipo_servico || '', margin, margin + 28, y);
    addRow('Protocolo', at?.protocolo || '', margin + halfW + 6, margin + halfW + 22, y);
    y += 6;

    if (at?.observacoes) {
      hRule(y, C.hairline);
      y += 4;
      setF('normal', 6.5);
      setTC(C.midGray);
      doc.text('Observações:', margin, y);
      setF('normal', 8);
      setTC(C.black);
      const obsLines = doc.splitTextToSize(at.observacoes, contentW - 24);
      doc.text(obsLines, margin + 22, y);
      y += obsLines.length * 5;
    }

    y += 3;
    hRule(y, C.darkGray, 0.5);
    y += 6;

    // ── SEÇÃO INFERIOR: esquerda + assinaturas ────────
    const leftColW = contentW * 0.52;
    const rightColX = margin + leftColW + 8;
    const rightColW = contentW - leftColW - 8;
    const bottomStartY = y;

    // Coluna esquerda — Valores Combinados
    setF('normal', 6.5);
    setTC(C.midGray);
    doc.text('Valores Combinados', margin, y);
    y += 4;
    setF('bold', 9);
    setTC(C.black);
    doc.text(td.valores || '—', margin, y);
    hRule(y + 2, C.hairline);
    y += 8;

    // Descrição
    setF('normal', 6.5);
    setTC(C.midGray);
    doc.text('Descrição do Produto Contratado', margin, y);
    y += 4;
    if (td.descricao) {
      const descLines = doc.splitTextToSize(td.descricao, leftColW);
      setF('bold', 8.5);
      setTC(C.black);
      doc.text(descLines, margin, y);
      y += descLines.length * 5 + 2;
    } else {
      hRule(y + 1, C.hairline); y += 6;
      hRule(y + 1, C.hairline); y += 6;
    }

    y += 4;
    setF('normal', 7);
    setTC(C.midGray);
    const dataRegistro = at
      ? new Date(at.data_hora || at.created_at)
          .toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : '';
    doc.text(`Data: `, margin, y);
    setTC(C.black);
    setF('bold', 8);
    doc.text(dataRegistro, margin + 10, y);

    // Coluna direita (assinaturas)
    let sigY = bottomStartY;
    setF('bold', 7);
    setTC(C.midGray);
    doc.text('ASSINATURAS', rightColX, sigY);
    sigY += 7;

    const sigLine = (label) => {
      setF('normal', 6.5);
      setTC(C.midGray);
      doc.text(label, rightColX, sigY);
      sigY += 8;
      setDC(C.darkGray);
      doc.setLineWidth(0.4);
      doc.line(rightColX, sigY, rightColX + rightColW, sigY);
      sigY += 12;
    };
    sigLine('Contratante');
    sigLine('Atendente');

    // Borda externa suave
    setDC(C.lightGray);
    doc.setLineWidth(0.4);
    const totalH = Math.max(y, sigY) - (margin - 2) + 6;
    doc.rect(margin - 2, margin - 2, contentW + 4, totalH);

    doc.save(`autorizacao-${at?.protocolo || 'servico'}.pdf`);
  }

  function buildCommunicationMessage() {
    if (!atendimentoFinalizado || !clientData) return '';
    const cliente = clientData.contratante || clientData.data?.contratante || '';
    const documento = clientData.documento || clientData.data?.documento || '';
    const placa = atendimentoFinalizado.placa || '';
    const descricaoVeiculo = atendimentoFinalizado.descricao_veiculo || '';
    const tipoServ = atendimentoFinalizado.tipo_servico || '';
    const dataHora = formatDateTime(atendimentoFinalizado.data_hora || atendimentoFinalizado.created_at);
    const protocolo = atendimentoFinalizado.protocolo || '';

    const telefone = atendimentoFinalizado.telefone_contato
      ? atendimentoFinalizado.telefone_contato.replace(/(\d{2})(\d{4,5})(\d{4})/, '($1) $2-$3')
      : '';

    return `Solicitação de Serviço\nProtocolo: ${protocolo}\n\nNome Completo: ${cliente}\nCPF: ${documento}\nTelefone de Contato: ${telefone}\nPlaca: ${placa}\nDescrição Veículo: ${descricaoVeiculo}\nTipo Serviço: ${tipoServ}\nData solicitação: ${dataHora}`;
  }

  async function handleCopyMessage() {
    const msg = buildCommunicationMessage();
    try {
      await navigator.clipboard.writeText(msg);
      toast({ title: "Mensagem copiada!", description: "Texto copiado para a área de transferência." });
    } catch {
      toast({ title: "Erro", description: "Não foi possível copiar a mensagem.", variant: "destructive" });
    }
  }

  const vehicles = getVehicles();
  const clientNome = clientData?.contratante || clientData?.data?.contratante || '-';
  const clientDoc = clientData?.documento || clientData?.data?.documento || '-';
  const clientContrato = clientData?.situacao_contrato || clientData?.data?.situacao_contrato || '-';
  const clientFinanceira = clientData?.situacao_financeira || clientData?.data?.situacao_financeira || '-';
  const clientCelular = clientData?.celular || clientData?.data?.celular || '';

  return (
    <div className="p-4 md:p-6 space-y-6 bg-gray-50 dark:bg-gray-950 min-h-screen">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 shadow-lg">
              <Car className="w-5 h-5 text-white" />
            </div>
            Bom Auto - Consulta de Cliente
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearch} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cpf">CPF</Label>
                <Input
                  id="cpf"
                  placeholder="000.000.000-00"
                  value={searchCPF}
                  onChange={(e) => setSearchCPF(formatCPF(e.target.value))}
                  maxLength={14}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="placa">Placa</Label>
                <Input
                  id="placa"
                  placeholder="ABC-1234 ou ABC1D23"
                  value={searchPlaca}
                  onChange={(e) => setSearchPlaca(formatPlaca(e.target.value))}
                  maxLength={8}
                />
              </div>
            </div>

            <p className="text-xs text-gray-500 dark:text-gray-400">
              Preencha pelo menos um dos campos acima para consultar.
            </p>

            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <Button type="submit" disabled={loading} className="w-full md:w-auto">
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Consultando...
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  Consultar
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {clientData && !atendimentoFinalizado && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 shadow-lg">
                <User className="w-5 h-5 text-white" />
              </div>
              Dados do Cliente
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Nome</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  {clientNome}
                  {clientData?.is_funcionario && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-blue-100 text-blue-700 border border-blue-300 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-700">
                      <Shield className="w-3 h-3" />
                      Funcionário BP
                    </span>
                  )}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">CPF</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{clientDoc}</p>
              </div>
              {clientCelular && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Celular</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-gray-400" />
                    {clientCelular}
                  </p>
                </div>
              )}
            </div>

            {clientData?.is_funcionario && (
              <div className="mt-3 flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 dark:bg-blue-950/30 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-xs">
                <Shield className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span><strong>Funcionário Bom Pastor:</strong> as regras de situação de contrato e financeira não se aplicam. Apenas o limite de veículos e utilizações anuais são verificados.</span>
              </div>
            )}

            {(() => {
              const isFuncionario = clientData?.is_funcionario === true;
              const isContratoAtivo = clientContrato.toLowerCase().includes('ativo') && !clientContrato.toLowerCase().includes('cancelado') && !clientContrato.toLowerCase().includes('inativo');
              const isAdimplente = clientFinanceira.toLowerCase().includes('adimplente') && !clientFinanceira.toLowerCase().includes('inadimplente');
              const utilizacoesCount = utilizacoes?.count ?? 0;
              const utilizacoesColor = utilizacoesCount >= 3 ? 'red' : utilizacoesCount >= 2 ? 'amber' : 'emerald';

              return (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
                  <div className={`relative overflow-hidden rounded-xl border p-4 shadow-sm ${
                    isFuncionario
                      ? 'bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800'
                      : isContratoAtivo
                        ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800'
                        : 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800'
                  }`}>
                    <div className={`absolute top-0 right-0 w-16 h-16 rounded-bl-full opacity-10 ${
                      isFuncionario ? 'bg-blue-500' : isContratoAtivo ? 'bg-emerald-500' : 'bg-red-500'
                    }`} />
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-2">Status do Plano</p>
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${isFuncionario ? 'bg-blue-500' : isContratoAtivo ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                      <span className={`text-sm font-bold ${isFuncionario ? 'text-blue-700 dark:text-blue-300' : isContratoAtivo ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}>
                        {clientContrato.toUpperCase()}
                      </span>
                    </div>
                    {isFuncionario && (
                      <p className="text-[10px] text-blue-600 dark:text-blue-400 mt-1.5 font-medium">Dispensado (funcionário)</p>
                    )}
                  </div>

                  <div className={`relative overflow-hidden rounded-xl border p-4 shadow-sm ${
                    isFuncionario || isAdimplente
                      ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800'
                      : 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800'
                  }`}>
                    <div className={`absolute top-0 right-0 w-16 h-16 rounded-bl-full opacity-10 ${
                      isFuncionario || isAdimplente ? 'bg-emerald-500' : 'bg-red-500'
                    }`} />
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-2">Situação Financeira</p>
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${isFuncionario || isAdimplente ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                      <span className={`text-sm font-bold ${isFuncionario || isAdimplente ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}>
                        {isFuncionario ? 'ADIMPLENTE' : clientFinanceira.toUpperCase()}
                      </span>
                    </div>
                    {isFuncionario && (
                      <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1.5 font-medium">Dispensado (funcionário)</p>
                    )}
                  </div>

                  {utilizacoes !== null && (
                    <div className={`relative overflow-hidden rounded-xl border p-4 shadow-sm ${
                      utilizacoesColor === 'red'
                        ? 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800'
                        : utilizacoesColor === 'amber'
                          ? 'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800'
                          : 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800'
                    }`}>
                      <div className={`absolute top-0 right-0 w-16 h-16 rounded-bl-full opacity-10 ${
                        utilizacoesColor === 'red' ? 'bg-red-500' : utilizacoesColor === 'amber' ? 'bg-amber-500' : 'bg-emerald-500'
                      }`} />
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-2">Utilizações no Ano</p>
                      <div className="flex items-baseline gap-1">
                        <span className={`text-2xl font-extrabold ${
                          utilizacoesColor === 'red' ? 'text-red-700 dark:text-red-300'
                            : utilizacoesColor === 'amber' ? 'text-amber-700 dark:text-amber-300'
                              : 'text-emerald-700 dark:text-emerald-300'
                        }`}>{utilizacoesCount}</span>
                        <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">/ 3 utilizações</span>
                      </div>
                      <div className="flex gap-1 mt-2">
                        {[0, 1, 2].map(i => (
                          <div key={i} className={`h-1.5 flex-1 rounded-full ${
                            i < utilizacoesCount
                              ? (utilizacoesColor === 'red' ? 'bg-red-400 dark:bg-red-500'
                                : utilizacoesColor === 'amber' ? 'bg-amber-400 dark:bg-amber-500'
                                  : 'bg-emerald-400 dark:bg-emerald-500')
                              : 'bg-gray-200 dark:bg-gray-700'
                          }`} />
                        ))}
                      </div>
                      {utilizacoesCount >= 3 && (
                        <p className="text-[11px] font-bold text-red-600 dark:text-red-400 mt-2 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          Limite anual atingido
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {vehicles.length > 0 && (
              <div className="mt-5 pt-4 border-t border-gray-200 dark:border-gray-700">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                  <Car className="w-3.5 h-3.5" />
                  Veículos ({vehicles.length})
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {vehicles.map((v, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800">
                      <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900">
                        <Car className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-blue-700 dark:text-blue-300 tracking-wide">{v.placa}</p>
                        <p className="text-xs text-blue-600/70 dark:text-blue-400/70 truncate">
                          {v.descricao_veiculo_limpa || v.descricao_veiculo || 'Sem descrição'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}



          </CardContent>
        </Card>
      )}

      {clientData && !atendimentoFinalizado && utilizacoes !== null && utilizacoes.atendimentos && utilizacoes.atendimentos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-br from-violet-500 to-purple-500 shadow-lg">
                <Clock className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <span>Histórico de Utilizações</span>
                <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
                  ({utilizacoes.atendimentos.length} {utilizacoes.atendimentos.length === 1 ? 'registro' : 'registros'})
                </span>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative">
              <div className="absolute left-[15px] top-2 bottom-2 w-0.5 bg-gradient-to-b from-violet-300 via-purple-200 to-gray-200 dark:from-violet-700 dark:via-purple-800 dark:to-gray-700" />

              <div className="space-y-4">
                {utilizacoes.atendimentos.map((at, i) => {
                  const s = (at.status_atendimento || 'Pendente').toLowerCase();
                  const isPendente = s === 'pendente';
                  const isSolucionado = s === 'solucionado' || s === 'concluído' || s === 'concluido' || s === 'finalizado';
                  const isCancelado = s === 'cancelado';

                  const dotColor = isPendente
                    ? 'bg-amber-500 ring-amber-200 dark:ring-amber-900'
                    : isSolucionado
                      ? 'bg-emerald-500 ring-emerald-200 dark:ring-emerald-900'
                      : isCancelado
                        ? 'bg-gray-400 ring-gray-200 dark:ring-gray-700'
                        : 'bg-blue-500 ring-blue-200 dark:ring-blue-900';

                  const cardBorder = isPendente
                    ? 'border-amber-200 dark:border-amber-800/50'
                    : isSolucionado
                      ? 'border-emerald-200 dark:border-emerald-800/50'
                      : isCancelado
                        ? 'border-gray-200 dark:border-gray-700'
                        : 'border-blue-200 dark:border-blue-800/50';

                  const cardBg = isPendente
                    ? 'bg-amber-50/50 dark:bg-amber-950/20'
                    : isSolucionado
                      ? 'bg-emerald-50/50 dark:bg-emerald-950/20'
                      : isCancelado
                        ? 'bg-gray-50/50 dark:bg-gray-800/20'
                        : 'bg-blue-50/50 dark:bg-blue-950/20';

                  return (
                    <div key={at.id || i} className="relative pl-10">
                      <div className={`absolute left-[9px] top-4 w-3 h-3 rounded-full ring-4 ${dotColor} z-10`} />

                      <div className={`rounded-xl border ${cardBorder} ${cardBg} shadow-sm overflow-hidden`}>
                        <div className="p-4">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                              <Calendar className="w-3.5 h-3.5" />
                              <span className="font-medium">{formatDateTime(at.data_hora)}</span>
                              {i === 0 && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300">
                                  Mais recente
                                </span>
                              )}
                            </div>
                            <StatusBadge status={at.status_atendimento || 'Pendente'} />
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="flex items-center gap-2">
                              <User className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                              <div className="min-w-0">
                                <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold">Atendente</p>
                                <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{at.usuario || '-'}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Wrench className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                              <div className="min-w-0">
                                <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold">Serviço</p>
                                <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{at.tipo_servico || '-'}</p>
                              </div>
                            </div>
                            {at.protocolo && (
                              <div className="flex items-center gap-2">
                                <Hash className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                <div className="min-w-0">
                                  <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold">Protocolo</p>
                                  <p className="text-sm font-mono font-medium text-gray-800 dark:text-gray-200">{at.protocolo}</p>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Autorização de Serviços — somente quando há dados */}
                          {(at.termo_local || at.termo_rua || at.termo_valores_combinados || at.termo_descricao_produto) && (
                            <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2">
                                <FileText className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                                <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">Autorização de Serviços preenchida</span>
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 uppercase tracking-wider">
                                  Disponível
                                </span>
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1.5 text-xs h-7 border-gray-300 dark:border-gray-600"
                                onClick={() => setTermoModalAt(at)}
                              >
                                <FileText className="w-3 h-3" />
                                Visualizar
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {eligibility && !atendimentoFinalizado && (
        <Card className={eligibility.eligible
          ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/30"
          : "border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/30"
        }>
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              {eligibility.eligible ? (
                <>
                  <div className="p-3 rounded-xl bg-gradient-to-br from-emerald-500 to-green-500 shadow-lg flex-shrink-0">
                    <CheckCircle className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-emerald-700 dark:text-emerald-300">
                      Cliente Elegível
                    </h3>
                    <p className="text-sm text-emerald-600 dark:text-emerald-400 mt-1">
                      Todas as condições foram atendidas. O cliente pode ser atendido.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="p-3 rounded-xl bg-gradient-to-br from-red-500 to-rose-500 shadow-lg flex-shrink-0">
                    <XCircle className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-red-700 dark:text-red-300">
                      Cliente Não Elegível
                    </h3>
                    <ul className="mt-2 space-y-1">
                      {eligibility.reasons.map((reason, i) => (
                        <li key={i} className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                          <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                          {reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}
            </div>

            {eligibility.eligible && !showForm && (
              <div className="mt-6">
                <Button
                  onClick={() => setShowForm(true)}
                  variant="success"
                  size="lg"
                >
                  <Wrench className="w-4 h-4" />
                  Iniciar Atendimento
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {showForm && !atendimentoFinalizado && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg">
                <FileText className="w-5 h-5 text-white" />
              </div>
              Registrar Atendimento
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmitAtendimento} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="veiculo" className="flex items-center gap-1.5">
                  <Car className="w-4 h-4 text-blue-500" />
                  Veículo *
                </Label>
                {vehicles.length > 0 ? (
                  <Select value={selectedVehicle} onValueChange={setSelectedVehicle}>
                    <SelectTrigger id="veiculo" className="border-blue-200 dark:border-blue-800 focus:ring-blue-500">
                      <SelectValue placeholder="Selecione o veículo" />
                    </SelectTrigger>
                    <SelectContent>
                      {vehicles.map((v, i) => (
                        <SelectItem key={i} value={v.placa}>
                          <div className="flex items-center gap-2">
                            <Car className="w-4 h-4 text-blue-500" />
                            <span className="font-bold">{v.placa}</span>
                            <span>
                              {v.descricao_veiculo_limpa || v.descricao_veiculo || ''}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 text-sm">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    Nenhum veículo cadastrado para este cliente
                  </div>
                )}

                {selectedVehicle && (
                  <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900">
                        <Car className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-blue-700 dark:text-blue-300">
                          {selectedVehicle}
                        </p>
                        <p className="text-xs text-blue-700 dark:text-blue-300">
                          {vehicles.find(v => v.placa === selectedVehicle)?.descricao_veiculo_limpa ||
                           vehicles.find(v => v.placa === selectedVehicle)?.descricao_veiculo || 'Sem descrição'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="tipoServico" className="flex items-center gap-1.5">
                  <Wrench className="w-4 h-4 text-blue-500" />
                  Tipo de Serviço *
                </Label>
                <Select value={tipoServico} onValueChange={setTipoServico}>
                  <SelectTrigger id="tipoServico" className="border-blue-200 dark:border-blue-800 focus:ring-blue-500">
                    <SelectValue placeholder="Selecione o tipo de serviço" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS_SERVICO.map((tipo) => (
                      <SelectItem key={tipo} value={tipo}>
                        {tipo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="telefoneContato" className="flex items-center gap-1.5">
                  <Phone className="w-4 h-4 text-blue-500" />
                  Telefone de Contato *
                </Label>
                <Input
                  id="telefoneContato"
                  placeholder="(DDD) Telefone"
                  value={telefoneContato}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, '').slice(0, 11);
                    let formatted = digits;
                    if (digits.length > 2) {
                      formatted = `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
                    } else if (digits.length > 0) {
                      formatted = `(${digits}`;
                    }
                    setTelefoneContato(formatted);
                  }}
                  maxLength={15}
                  className="border-blue-200 dark:border-blue-800 focus:ring-blue-500"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="observacoes">Observações</Label>
                <Textarea
                  id="observacoes"
                  placeholder="Detalhes adicionais (opcional)"
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  rows={3}
                  className="border-blue-200 dark:border-blue-800 focus:ring-blue-500"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <Button type="submit" disabled={submitting} className="bg-blue-600 hover:bg-blue-700 text-white">
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Registrando...
                    </>
                  ) : (
                    <>
                      <ClipboardCheck className="w-4 h-4" />
                      Registrar Atendimento
                    </>
                  )}
                </Button>
                <Button type="button" variant="outline" onClick={handleCancelForm}>
                  Cancelar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {atendimentoFinalizado && (
        <div className="space-y-6">
          <Card className="border-emerald-300 dark:border-emerald-700 shadow-lg overflow-hidden">
            <div className="bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500 px-6 py-5 text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <CheckCircle className="w-6 h-6 text-white" />
                <h2 className="text-lg font-bold text-white tracking-wide">Atendimento Registrado com Sucesso</h2>
              </div>
              <p className="text-emerald-100 text-sm">Comprovante gerado automaticamente pelo sistema</p>
            </div>

            <CardContent className="p-0">
              <div className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700 px-6 py-6 text-center">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400 dark:text-gray-500 mb-2">Protocolo de Atendimento</p>
                <p className="text-4xl sm:text-5xl font-extrabold text-gray-900 dark:text-white tracking-widest font-mono">
                  {atendimentoFinalizado.protocolo || '-'}
                </p>
                <div className="mt-4">
                  {(() => {
                    const st = (atendimentoFinalizado.status_atendimento || 'Pendente').toLowerCase();
                    const isPend = st === 'pendente';
                    const isSoluc = st === 'solucionado' || st === 'concluído' || st === 'concluido' || st === 'finalizado';
                    const statusClass = isPend
                      ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/60 dark:text-amber-200 dark:border-amber-700'
                      : isSoluc
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/60 dark:text-emerald-200 dark:border-emerald-700'
                        : 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/60 dark:text-red-200 dark:border-red-700';
                    return (
                      <span className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-bold border ${statusClass}`}>
                        {isPend && <Clock className="w-4 h-4" />}
                        {isSoluc && <CheckCircle className="w-4 h-4" />}
                        {!isPend && !isSoluc && <XCircle className="w-4 h-4" />}
                        {atendimentoFinalizado.status_atendimento || 'Pendente'}
                      </span>
                    );
                  })()}
                </div>
              </div>

              <div className="px-6 py-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-400 dark:text-gray-500">Cliente</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{clientNome}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-400 dark:text-gray-500">CPF</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 font-mono">{clientDoc}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-400 dark:text-gray-500">Veículo</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                      <Car className="w-4 h-4 text-blue-500 flex-shrink-0" />
                      {atendimentoFinalizado.placa || '-'} — {atendimentoFinalizado.descricao_veiculo || '-'}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-400 dark:text-gray-500">Tipo de Serviço</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{atendimentoFinalizado.tipo_servico || '-'}</p>
                  </div>
                  {atendimentoFinalizado.telefone_contato && (
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-400 dark:text-gray-500">Telefone de Contato</p>
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                        <Phone className="w-4 h-4 text-blue-500 flex-shrink-0" />
                        {atendimentoFinalizado.telefone_contato.replace(/(\d{2})(\d{4,5})(\d{4})/, '($1) $2-$3')}
                      </p>
                    </div>
                  )}
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-400 dark:text-gray-500">Registrado por</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{atendimentoFinalizado.usuario || '-'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-400 dark:text-gray-500">Data / Hora</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {formatDateTime(atendimentoFinalizado.data_hora || atendimentoFinalizado.created_at)}
                    </p>
                  </div>
                  {atendimentoFinalizado.observacoes && (
                    <div className="space-y-1 sm:col-span-2">
                      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-400 dark:text-gray-500">Observações</p>
                      <p className="text-sm text-gray-900 dark:text-gray-100">{atendimentoFinalizado.observacoes}</p>
                    </div>
                  )}
                </div>

              </div>
            </CardContent>
          </Card>

          {/* ── TERMO DE AUTORIZAÇÃO ─────────────────────── */}
          <Card className="border-gray-300 dark:border-gray-600 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-gradient-to-br from-gray-700 to-gray-900 shadow-lg">
                  <FileText className="w-5 h-5 text-white" />
                </div>
                Autorização de Serviços de Assessoria Veicular
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">

              {/* Cabeçalho do documento */}
              <img
                src="/bom-auto-header.png"
                alt="Bom Auto — Autorização de Serviços de Assessoria Veicular"
                className="w-full rounded-xl border border-gray-200 dark:border-gray-700"
              />

              {/* N° do Processo */}
              <div className="flex justify-end">
                <div className="border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 min-w-[200px]">
                  <p className="text-[10px] uppercase tracking-widest text-gray-500 dark:text-gray-400">N° do Processo</p>
                  <p className="font-mono font-bold text-gray-900 dark:text-gray-100 text-base">{atendimentoFinalizado?.protocolo || '-'}</p>
                </div>
              </div>

              {/* Campos preenchidos automaticamente */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 border-t border-gray-200 dark:border-gray-700 pt-4">
                {[
                  { label: 'Empresa Contratada', value: 'Bom Auto' },
                  { label: 'Atendente Resp.', value: atendimentoFinalizado?.usuario || '-' },
                  { label: 'Data e Hora', value: formatDateTime(atendimentoFinalizado?.data_hora || atendimentoFinalizado?.created_at) },
                  { label: 'Fone para Contato do Condutor', value: atendimentoFinalizado?.telefone_contato ? atendimentoFinalizado.telefone_contato.replace(/(\d{2})(\d{4,5})(\d{4})/, '($1) $2-$3') : '-' },
                  { label: 'Número do Contrato', value: atendimentoFinalizado?.contratos_servicos || '-' },
                  { label: 'Nome do Titular', value: clientData?.contratante || clientData?.data?.contratante || '-' },
                  { label: 'Veículo Modelo', value: atendimentoFinalizado?.descricao_veiculo || '-' },
                  { label: 'Documento', value: clientData?.documento || clientData?.data?.documento || '-' },
                  { label: 'Placa', value: atendimentoFinalizado?.placa || '-' },
                  { label: 'Tipo de Serviço', value: atendimentoFinalizado?.tipo_servico || '-' },
                  { label: 'Protocolo', value: atendimentoFinalizado?.protocolo || '-' },
                ].map(({ label, value }) => (
                  <div key={label} className="space-y-0.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700 pb-1">{value}</p>
                  </div>
                ))}
                {atendimentoFinalizado?.observacoes && (
                  <div className="sm:col-span-2 space-y-0.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Observações</p>
                    <p className="text-sm text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700 pb-1">{atendimentoFinalizado.observacoes}</p>
                  </div>
                )}
              </div>

              {/* Campos editáveis pelo atendente */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-4">
                <p className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">Campos a preencher</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-600 dark:text-gray-400">Local / Cidade onde se encontra o Veículo</Label>
                    <Input
                      value={termoLocal}
                      onChange={e => setTermoLocal(e.target.value)}
                      placeholder="Ex: Residência / Oficina — cidade"
                      disabled={termoSalvo}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-600 dark:text-gray-400">Rua / Av. / Rod. / Ponto de Referência</Label>
                    <Input
                      value={termoRua}
                      onChange={e => setTermoRua(e.target.value)}
                      placeholder="Ex: Rodovia Engenheiro João Tosello, próximo ao nível"
                      disabled={termoSalvo}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-600 dark:text-gray-400">Valores Combinados</Label>
                    <Input
                      value={termoValoresCombinados}
                      onChange={e => setTermoValoresCombinados(e.target.value)}
                      placeholder="Ex: R$ 0,00 — incluso no plano"
                      disabled={termoSalvo}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-600 dark:text-gray-400">Descrição do Produto Contratado</Label>
                    <Textarea
                      value={termoDescricaoProduto}
                      onChange={e => setTermoDescricaoProduto(e.target.value)}
                      placeholder="Descreva o produto/serviço contratado..."
                      rows={3}
                      disabled={termoSalvo}
                    />
                  </div>
                </div>
              </div>

              {/* Seção de assinaturas (visual) */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <p className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-3">Assinaturas</p>
                <div className="grid grid-cols-2 gap-4">
                  {['Contratante', 'Atendente'].map(sig => (
                    <div key={sig} className="space-y-1">
                      <div className="h-12 border-b-2 border-gray-300 dark:border-gray-600" />
                      <p className="text-[10px] text-center text-gray-500 dark:text-gray-400 uppercase tracking-wider">{sig}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Data e botões */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-gray-500 dark:text-gray-400">Data do Registro</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {formatDate(atendimentoFinalizado?.data_hora || atendimentoFinalizado?.created_at)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {termoSalvo && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 rounded-lg border border-emerald-300 dark:border-emerald-700 text-xs font-semibold">
                      <CheckCircle className="w-3.5 h-3.5" />
                      Dados salvos com sucesso
                    </div>
                  )}
                  {!termoSalvo && (
                    <Button onClick={handleSalvarTermo} className="bg-gray-800 hover:bg-gray-900 text-white gap-2">
                      <Save className="w-4 h-4" />
                      Salvar
                    </Button>
                  )}
                  <Button
                    onClick={() => exportTermoPDF()}
                    disabled={!termoSalvo}
                    className="bg-red-600 hover:bg-red-700 text-white gap-2 disabled:opacity-40"
                  >
                    <Download className="w-4 h-4" />
                    Exportar PDF
                  </Button>
                </div>
              </div>

            </CardContent>
          </Card>
          {/* ── /TERMO DE AUTORIZAÇÃO ─────────────────────── */}

          <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 shadow-lg">
                  <Copy className="w-5 h-5 text-white" />
                </div>
                Mensagem de Comunicação
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <pre className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap font-sans leading-relaxed">
                  {buildCommunicationMessage()}
                </pre>
              </div>
              <div className="mt-4">
                <Button onClick={handleCopyMessage} className="bg-blue-600 hover:bg-blue-700 text-white">
                  <Copy className="w-4 h-4" />
                  Copiar Mensagem
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-center">
            <Button onClick={handleNovaConsulta} variant="outline" size="lg">
              <RefreshCw className="w-4 h-4" />
              Nova Consulta
            </Button>
          </div>
        </div>
      )}

      {/* ── MODAL: Visualizar Autorização Histórica ───── */}
      <Dialog open={!!termoModalAt} onOpenChange={open => { if (!open) setTermoModalAt(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Autorização de Serviços — {termoModalAt?.protocolo}
            </DialogTitle>
          </DialogHeader>

          {termoModalAt && (
            <div className="space-y-4 pt-1">

              {/* Cabeçalho */}
              <img
                src="/bom-auto-header.png"
                alt="Bom Auto"
                className="w-full rounded-xl border border-gray-200 dark:border-gray-700"
              />

              {/* N° do Processo */}
              <div className="flex justify-end">
                <div className="border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 min-w-[180px]">
                  <p className="text-[10px] uppercase tracking-widest text-gray-500 dark:text-gray-400">N° do Processo</p>
                  <p className="font-mono font-bold text-gray-900 dark:text-gray-100">{termoModalAt.protocolo || '-'}</p>
                </div>
              </div>

              {/* Campos automáticos */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 border-t border-gray-200 dark:border-gray-700 pt-3">
                {[
                  { label: 'Empresa Contratada', value: 'Bom Auto' },
                  { label: 'Atendente Resp.', value: termoModalAt.usuario },
                  { label: 'Data e Hora', value: formatDateTime(termoModalAt.data_hora || termoModalAt.created_at) },
                  { label: 'Fone para Contato', value: termoModalAt.telefone_contato ? termoModalAt.telefone_contato.replace(/(\d{2})(\d{4,5})(\d{4})/, '($1) $2-$3') : '-' },
                  { label: 'Número do Contrato', value: termoModalAt.contratos_servicos },
                  { label: 'Nome do Titular', value: termoModalAt.nome_cliente },
                  { label: 'Veículo Modelo', value: termoModalAt.descricao_veiculo },
                  { label: 'Documento', value: termoModalAt.documento_cliente },
                  { label: 'Placa', value: termoModalAt.placa },
                  { label: 'Tipo de Serviço', value: termoModalAt.tipo_servico },
                  { label: 'Protocolo', value: termoModalAt.protocolo },
                ].map(({ label, value }) => (
                  <div key={label} className="space-y-0.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700 pb-1">{value || '-'}</p>
                  </div>
                ))}
                {termoModalAt.observacoes && (
                  <div className="sm:col-span-2 space-y-0.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Observações</p>
                    <p className="text-sm text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700 pb-1">{termoModalAt.observacoes}</p>
                  </div>
                )}
              </div>

              {/* Campos do Termo — somente leitura */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                {[
                  { label: 'Local / Cidade', value: termoModalAt.termo_local },
                  { label: 'Rua / Av. / Rod. / Ponto de Referência', value: termoModalAt.termo_rua },
                  { label: 'Valores Combinados', value: termoModalAt.termo_valores_combinados },
                  { label: 'Descrição do Produto Contratado', value: termoModalAt.termo_descricao_produto },
                ].map(({ label, value }) => (
                  <div key={label} className="space-y-0.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700 pb-1">{value || '-'}</p>
                  </div>
                ))}
              </div>

              {/* Assinaturas */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
                <p className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-3">Assinaturas</p>
                <div className="grid grid-cols-2 gap-4">
                  {['Contratante', 'Atendente'].map(sig => (
                    <div key={sig} className="space-y-1">
                      <div className="h-10 border-b-2 border-gray-300 dark:border-gray-600" />
                      <p className="text-[10px] text-center text-gray-500 dark:text-gray-400 uppercase tracking-wider">{sig}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Data + Exportar PDF */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-3 flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-gray-500 dark:text-gray-400">Data do Registro</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {formatDate(termoModalAt.data_hora || termoModalAt.created_at)}
                  </p>
                </div>
                <Button
                  onClick={() => exportTermoPDF(termoModalAt, null, {
                    local: termoModalAt.termo_local,
                    rua: termoModalAt.termo_rua,
                    valores: termoModalAt.termo_valores_combinados,
                    descricao: termoModalAt.termo_descricao_produto,
                  })}
                  className="bg-red-600 hover:bg-red-700 text-white gap-2"
                >
                  <Download className="w-4 h-4" />
                  Exportar PDF
                </Button>
              </div>

            </div>
          )}
        </DialogContent>
      </Dialog>
      {/* ── /MODAL ────────────────────────────────────── */}

    </div>
  );
}