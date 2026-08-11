import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import {
  PawPrint, Search, CheckCircle, XCircle, AlertTriangle,
  Loader2, User, FileText, Phone, Hash,
  ClipboardCheck, Calendar, Copy, RefreshCw, Clock, Download, Save,
  Receipt, MapPin, Stethoscope, Handshake
} from "lucide-react";
import { extractApiError } from "@/utils/apiError";
import termoTemplateImg from "@/assets/bompet-autorizacao-template.png";

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
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
}

function formatMoney(v) {
  const n = parseFloat(v);
  if (isNaN(n)) return '-';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function StatusBadge({ status }) {
  if (!status) return null;
  const s = status.toLowerCase();
  let className = "";
  if (s === "pendente") {
    className = "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/50 dark:text-amber-300 dark:border-amber-700";
  } else if (s === "solucionado") {
    className = "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/50 dark:text-emerald-300 dark:border-emerald-700";
  } else if (s === "cancelado") {
    className = "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/50 dark:text-red-300 dark:border-red-700";
  } else {
    className = "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/50 dark:text-blue-300 dark:border-blue-700";
  }
  return <Badge variant="outline" className={className}>{status}</Badge>;
}

export default function BomPetConsulta() {
  const { toast } = useToast();

  const [currentUser, setCurrentUser] = useState(null);
  const [searchCPF, setSearchCPF] = useState('');
  const [searchNome, setSearchNome] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [clientData, setClientData] = useState(null);
  const [utilizacoes, setUtilizacoes] = useState(null);
  const [parcelas, setParcelas] = useState(null);
  const [loadingParcelas, setLoadingParcelas] = useState(false);
  const [comprovanteRecebido, setComprovanteRecebido] = useState(false);
  const [comprovanteObs, setComprovanteObs] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [selectedPet, setSelectedPet] = useState('');
  const [remocaoLocal, setRemocaoLocal] = useState('');
  const [remocaoEndereco, setRemocaoEndereco] = useState('');
  const [clinicaNome, setClinicaNome] = useState('');
  const [parceiroNome, setParceiroNome] = useState('');
  const [telefoneContato, setTelefoneContato] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [atendimentoFinalizado, setAtendimentoFinalizado] = useState(null);

  const [termoLocal, setTermoLocal] = useState('');
  const [termoRua, setTermoRua] = useState('');
  const [termoValoresCombinados, setTermoValoresCombinados] = useState('');
  const [termoDescricaoProduto, setTermoDescricaoProduto] = useState('');
  const [termoSalvo, setTermoSalvo] = useState(false);

  useEffect(() => {
    async function fetchUser() {
      try {
        const res = await fetch(`${API_BASE}/auth/me`, { headers: { ...getAuthHeaders() } });
        if (res.ok) setCurrentUser(await res.json());
      } catch (e) { /* silencioso */ }
    }
    fetchUser();
  }, []);

  const pets = clientData?.pets || [];
  const petsAtivos = pets.filter(p => p.status !== 'Falecido');
  const isInadimplente = (clientData?.situacao_financeira || '').toUpperCase().includes('INADIMPLENTE');
  const bloqueadoPorInadimplencia = isInadimplente && !comprovanteRecebido;

  function resetAll() {
    setClientData(null); setUtilizacoes(null); setParcelas(null);
    setComprovanteRecebido(false); setComprovanteObs('');
    setShowForm(false); setSelectedPet('');
    setRemocaoLocal(''); setRemocaoEndereco(''); setClinicaNome(''); setParceiroNome('');
    setTelefoneContato(''); setObservacoes('');
    setAtendimentoFinalizado(null);
    setTermoLocal(''); setTermoRua(''); setTermoValoresCombinados(''); setTermoDescricaoProduto('');
    setTermoSalvo(false);
  }

  async function handleSearch(e) {
    e.preventDefault();
    setError('');
    resetAll();

    const cpfDigits = searchCPF.replace(/\D/g, '');
    const nomeTrim = searchNome.trim();

    if (!cpfDigits && !nomeTrim) {
      setError('Informe o CPF (11 dígitos) ou o nome completo do titular.');
      return;
    }
    if (cpfDigits && cpfDigits.length !== 11) {
      setError('CPF inválido. Informe 11 dígitos.');
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (cpfDigits) params.set('documento', cpfDigits);
      // Nome é SEMPRE convertido para maiúsculas antes de enviar ao ERP.
      else params.set('nome', nomeTrim.toUpperCase());

      const res = await fetch(`${API_BASE}/bom-pet/consulta?${params.toString()}`, {
        headers: { ...getAuthHeaders() },
      });
      if (!res.ok) {
        throw new Error(await extractApiError(res, 'Erro ao consultar cliente.'));
      }
      const data = await res.json();
      setClientData(data);

      const doc = (data.documento || '').replace(/\D/g, '');
      if (doc) {
        try {
          const utilRes = await fetch(`${API_BASE}/bom-pet/utilizacoes/${doc}`, { headers: { ...getAuthHeaders() } });
          if (utilRes.ok) setUtilizacoes(await utilRes.json());
        } catch (e) { /* silencioso */ }

        if ((data.situacao_financeira || '').toUpperCase().includes('INADIMPLENTE')) {
          setLoadingParcelas(true);
          try {
            const pRes = await fetch(`${API_BASE}/bom-pet/parcelas/${doc}`, { headers: { ...getAuthHeaders() } });
            if (pRes.ok) {
              const pData = await pRes.json();
              setParcelas(pData.parcelas || []);
            } else {
              setParcelas([]);
            }
          } catch { setParcelas([]); }
          finally { setLoadingParcelas(false); }
        }
      }
    } catch (err) {
      setError(err.message || 'Erro ao consultar cliente.');
    } finally {
      setLoading(false);
    }
  }

  function buildParcelasMessage() {
    if (!clientData || !parcelas) return '';
    const lines = parcelas.map(p =>
      `• Parcela ${p.sequencia || '-'} — vencimento ${formatDate(p.data_vencimento)} — ${formatMoney(p.saldo || p.valor)}${p.link_pagamento ? `\n  Link de pagamento: ${p.link_pagamento}` : ''}`
    );
    return `Olá, ${clientData.contratante}!\nIdentificamos parcelas pendentes no seu plano Bom Pet:\n\n${lines.join('\n')}\n\nPor favor, regularize o pagamento para prosseguirmos com o atendimento.`;
  }

  async function copyText(text, okMsg) {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copiado!", description: okMsg });
    } catch {
      toast({ title: "Erro", description: "Não foi possível copiar.", variant: "destructive" });
    }
  }

  async function handleSubmitAtendimento(e) {
    e.preventDefault();

    if (!selectedPet) {
      toast({ title: "Erro", description: "Selecione o pet.", variant: "destructive" });
      return;
    }
    const pet = pets.find(p => String(p.contrato_id) === selectedPet);
    if (!pet) {
      toast({ title: "Atendimento negado", description: "Pet não incluído no plano do cliente.", variant: "destructive" });
      return;
    }
    if (pet.status === 'Falecido') {
      toast({ title: "Erro", description: "Este pet já está marcado como Falecido.", variant: "destructive" });
      return;
    }
    const telefoneDigits = telefoneContato.replace(/\D/g, '');
    if (!telefoneDigits || telefoneDigits.length < 10) {
      toast({ title: "Erro", description: "Informe um telefone de contato válido (mínimo 10 dígitos).", variant: "destructive" });
      return;
    }
    if (!remocaoLocal.trim() || !remocaoEndereco.trim()) {
      toast({ title: "Erro", description: "Informe o local e o endereço da remoção.", variant: "destructive" });
      return;
    }
    if (isInadimplente && (!comprovanteRecebido || !comprovanteObs.trim())) {
      toast({ title: "Bloqueado", description: "Cliente inadimplente: marque o comprovante recebido e preencha a observação obrigatória.", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/bom-pet/atendimentos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          documento_cliente: clientData.documento,
          nome_cliente: clientData.contratante,
          pet_nome: pet.nome,
          pet_descricao: pet.descricao,
          pet_contrato_id: pet.contrato_id,
          contratos_servicos: clientData.contratos_servicos || '',
          situacao_financeira: clientData.situacao_financeira || '',
          comprovante_pagamento_recebido: isInadimplente ? comprovanteRecebido : false,
          comprovante_pagamento_obs: isInadimplente ? stripHTML(comprovanteObs) : null,
          remocao_local: stripHTML(remocaoLocal),
          remocao_endereco: stripHTML(remocaoEndereco),
          clinica_nome: stripHTML(clinicaNome),
          parceiro_nome: stripHTML(parceiroNome),
          telefone_contato: telefoneDigits,
          observacoes: stripHTML(observacoes),
        }),
      });
      if (!res.ok) {
        throw new Error(await extractApiError(res, 'Erro ao registrar atendimento.'));
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

  async function handleSalvarTermo() {
    if (!atendimentoFinalizado?.id) return;
    try {
      const resp = await fetch(`${API_BASE}/bom-pet/atendimentos/${atendimentoFinalizado.id}/termo`, {
        method: 'PATCH',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          termo_local: termoLocal,
          termo_rua: termoRua,
          termo_valores_combinados: termoValoresCombinados,
          termo_descricao_produto: termoDescricaoProduto,
        }),
      });
      if (!resp.ok) throw new Error(await extractApiError(resp, 'Falha ao salvar'));
      setTermoSalvo(true);
      toast({ title: "Autorização salva com sucesso!", description: "O botão para exportar o PDF foi habilitado." });
    } catch {
      toast({ title: "Erro ao salvar", description: "Tente novamente.", variant: "destructive" });
    }
  }

  async function exportTermoPDF() {
    const at = atendimentoFinalizado;
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    // Template oficial BOMPET-AUTORIZACAO como fundo da pagina A4
    const img = new Image();
    img.src = termoTemplateImg;
    await img.decode();
    doc.addImage(img, 'PNG', 0, 0, 210, 297);

    const INK = [25, 25, 90]; // azul-caneta para os valores preenchidos
    doc.setTextColor(...INK);
    doc.setFont('helvetica', 'bold');

    // Escreve um valor sobre a linha; reduz a fonte ate caber em maxW
    const fill = (text, x, y, maxW, size = 9) => {
      const v = (text ?? '').toString().trim();
      if (!v) return;
      let s = size;
      doc.setFontSize(s);
      while (doc.getTextWidth(v) > maxW && s > 5.5) {
        s -= 0.5;
        doc.setFontSize(s);
      }
      let out = v;
      while (doc.getTextWidth(out) > maxW && out.length > 1) out = out.slice(0, -2) + '\u2026';
      doc.text(out, x, y);
    };

    const tel = at?.telefone_contato
      ? at.telefone_contato.replace(/(\d{2})(\d{4,5})(\d{4})/, '($1) $2-$3') : '';

    // ── Campos sobre as linhas do formulario ─────────────────────────────────
    fill(at?.protocolo, 155, 78.5, 42, 9);                                   // Nº de Processo
    fill('Bom Pet', 42, 103.5, 155);                                          // Empresa Contratada
    fill(termoLocal || at?.termo_local, 24, 117.5, 100);                      // Cidade
    fill(tel, 148, 117.5, 50);                                                // Fone
    fill(at?.usuario, 37, 131.5, 90);                                         // Atendente Resp.

    // Data e Hora: partes centralizadas entre os traços pré-impressos (__/__/__  __:__)
    const dt = new Date(at?.data_hora || at?.created_at || Date.now());
    const dd = String(dt.getDate()).padStart(2, '0');
    const mo = String(dt.getMonth() + 1).padStart(2, '0');
    const yyyy = String(dt.getFullYear());
    const hh = String(dt.getHours()).padStart(2, '0');
    const mi = String(dt.getMinutes()).padStart(2, '0');
    const seg = (text, cx, y) => {
      doc.setFontSize(10);
      doc.text(text, cx, y, { align: 'center' });
    };
    seg(dd, 137.4, 131.8);
    seg(mo, 151.6, 131.8);
    seg(yyyy, 165.0, 131.8);
    seg(hh, 179.8, 131.8);
    seg(mi, 193.5, 131.8);
    fill(tel, 61, 145.5, 135);                                                // Fone p/ contato familiares
    fill(at?.contratos_servicos, 42, 159.5, 155);                             // Numero do Contrato
    const titular = [at?.nome_cliente, at?.documento_cliente ? `CPF ${at.documento_cliente}` : '']
      .filter(Boolean).join(' \u2014 ');
    fill(titular, 36, 173.5, 160);                                            // Nome do Titular
    fill(at?.pet_descricao || at?.pet_nome, 31, 187.5, 165);                  // Nome do PET

    // Local onde se encontra o PET: marca Residencia ou Clinica + descricao na linha
    const emClinica = !!at?.clinica_nome;
    doc.setFillColor(...INK);
    doc.circle(emClinica ? 106.0 : 85.2, 201.5, 1.9, 'F');
    const rua = (termoRua || at?.termo_rua || '').trim();
    const localPet = (emClinica
      ? [at?.clinica_nome, at?.remocao_local]
      : [at?.remocao_local, at?.remocao_endereco]
    ).concat(rua).filter(Boolean).join(' \u2014 ');
    fill(localPet, 118, 201.5, 78);

    // Caixa esquerda: valores + descricao do produto
    fill(termoValoresCombinados || at?.termo_valores_combinados, 48, 226.5, 52);
    const descricao = (termoDescricaoProduto || at?.termo_descricao_produto || '').trim();
    if (descricao) {
      doc.setFontSize(8.5);
      const firstLineW = 37;  // espaco apos o rotulo "Descricao do Produto Contratado:"
      const fullLineW  = 85;  // linhas pautadas abaixo
      if (doc.getTextWidth(descricao) <= firstLineW) {
        fill(descricao, 63, 235.5, firstLineW, 8.5);
      } else {
        const ruledYs = [245.5, 254.5, 263.3, 272, 280.5];
        let lines = doc.splitTextToSize(descricao, fullLineW);
        if (lines.length > ruledYs.length) {
          doc.setFontSize(7);
          lines = doc.splitTextToSize(descricao, fullLineW);
        }
        lines.slice(0, ruledYs.length).forEach((ln, i) => {
          fill(ln, 15, ruledYs[i], fullLineW, doc.getFontSize());
        });
      }
    }

    // Data (canto direito): partes centralizadas entre os traços (__/__/__)
    seg(dd, 127.1, 226.4);
    seg(mo, 141.2, 226.4);
    seg(yyyy, 156.2, 226.4);

    // Assinaturas ficam em branco para assinatura manual

    doc.save(`autorizacao-bompet-${at?.protocolo || 'cremacao'}.pdf`);
  }

  function buildParceiroMessage() {
    const at = atendimentoFinalizado;
    if (!at) return '';
    const tel = at.telefone_contato
      ? at.telefone_contato.replace(/(\d{2})(\d{4,5})(\d{4})/, '($1) $2-$3') : '';
    return `Autorização de Cremação — Bom Pet\nProtocolo: ${at.protocolo}\n\nTitular: ${at.nome_cliente}\nCPF: ${at.documento_cliente}\nTelefone de Contato: ${tel}\nPet: ${at.pet_descricao || at.pet_nome}\nLocal da Remoção: ${at.remocao_local || '-'}\nEndereço da Remoção: ${at.remocao_endereco || '-'}\nClínica Veterinária: ${at.clinica_nome || '-'}\nParceiro: ${at.parceiro_nome || '-'}\nData da solicitação: ${formatDateTime(at.data_hora || at.created_at)}${at.observacoes ? `\nObservações: ${at.observacoes}` : ''}`;
  }

  return (
    <div className="p-4 md:p-6 space-y-6 bg-gray-50 dark:bg-gray-950 min-h-screen">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-500 shadow-lg">
              <PawPrint className="w-5 h-5 text-white" />
            </div>
            Bom Pet - Consulta de Cliente
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
                <Label htmlFor="nome">Nome Completo</Label>
                <Input
                  id="nome"
                  placeholder="NOME COMPLETO DO TITULAR"
                  value={searchNome}
                  onChange={(e) => setSearchNome(e.target.value.toUpperCase())}
                />
              </div>
            </div>

            <p className="text-xs text-gray-500 dark:text-gray-400">
              Pesquise pelo CPF (11 dígitos) ou pelo nome completo do titular. O nome é enviado sempre em maiúsculas.
            </p>

            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <Button type="submit" disabled={loading} className="w-full md:w-auto">
              {loading ? (<><Loader2 className="w-4 h-4 animate-spin" />Consultando...</>) : (<><Search className="w-4 h-4" />Consultar</>)}
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
              Dados do Titular
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Nome</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{clientData.contratante}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">CPF</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{clientData.documento}</p>
              </div>
              {clientData.celular && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Celular</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-gray-400" />
                    {clientData.celular}
                  </p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
              <div className={`relative overflow-hidden rounded-xl border p-4 shadow-sm ${
                !isInadimplente
                  ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800'
                  : 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800'
              }`}>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-2">Situação Financeira do Plano</p>
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${!isInadimplente ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                  <span className={`text-sm font-bold ${!isInadimplente ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}>
                    {(clientData.situacao_financeira || 'N/A').toUpperCase()}
                  </span>
                </div>
              </div>
              <div className="relative overflow-hidden rounded-xl border p-4 shadow-sm bg-gray-50 border-gray-200 dark:bg-gray-900/40 dark:border-gray-700">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-2">Contrato(s) de Serviço</p>
                <p className="text-sm font-bold text-gray-800 dark:text-gray-200">{clientData.contratos_servicos || '-'}</p>
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-gray-200 dark:border-gray-700">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <PawPrint className="w-3.5 h-3.5" />
                Pets do Plano ({pets.length})
              </p>
              {pets.length === 0 ? (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm font-semibold">
                  <XCircle className="w-4 h-4 flex-shrink-0" />
                  Atendimento negado: nenhum pet incluído no plano deste cliente.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {pets.map((p, i) => (
                    <div key={i} className={`flex items-center gap-3 p-3 rounded-xl border ${
                      p.status === 'Falecido'
                        ? 'bg-gray-100 dark:bg-gray-800/60 border-gray-300 dark:border-gray-600 opacity-70'
                        : 'bg-teal-50 dark:bg-teal-950/40 border-teal-200 dark:border-teal-800'
                    }`}>
                      <div className={`p-2 rounded-lg ${p.status === 'Falecido' ? 'bg-gray-200 dark:bg-gray-700' : 'bg-teal-100 dark:bg-teal-900'}`}>
                        <PawPrint className={`w-4 h-4 ${p.status === 'Falecido' ? 'text-gray-500' : 'text-teal-600 dark:text-teal-400'}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-bold tracking-wide ${p.status === 'Falecido' ? 'text-gray-500 dark:text-gray-400' : 'text-teal-700 dark:text-teal-300'}`}>{p.nome}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{p.descricao}</p>
                      </div>
                      <Badge variant="outline" className={p.status === 'Falecido'
                        ? 'bg-gray-200 text-gray-600 border-gray-400 dark:bg-gray-700 dark:text-gray-300'
                        : 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/50 dark:text-emerald-300'}>
                        {p.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── PARCELAS PENDENTES (cliente inadimplente) ── */}
      {clientData && !atendimentoFinalizado && isInadimplente && (
        <Card className="border-red-200 dark:border-red-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-br from-red-500 to-rose-500 shadow-lg">
                <Receipt className="w-5 h-5 text-white" />
              </div>
              Parcelas Pendentes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadingParcelas ? (
              <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" />Consultando parcelas no ERP...</div>
            ) : parcelas && parcelas.length > 0 ? (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                        <th className="py-2 pr-4">Parcela</th>
                        <th className="py-2 pr-4">Vencimento</th>
                        <th className="py-2 pr-4">Valor em Aberto</th>
                        <th className="py-2 pr-4">Situação</th>
                        <th className="py-2">Link de Pagamento</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parcelas.map((p) => (
                        <tr key={p.id} className="border-b border-gray-100 dark:border-gray-800">
                          <td className="py-2 pr-4 font-mono">{p.sequencia ?? '-'}</td>
                          <td className="py-2 pr-4">{formatDate(p.data_vencimento)}</td>
                          <td className="py-2 pr-4 font-semibold">{formatMoney(p.saldo || p.valor)}</td>
                          <td className="py-2 pr-4">
                            {p.vencida
                              ? <Badge variant="outline" className="bg-red-100 text-red-800 border-red-300">Vencida</Badge>
                              : <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300">Em aberto</Badge>}
                          </td>
                          <td className="py-2">
                            {p.link_pagamento
                              ? <a href={p.link_pagamento} target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 underline">Abrir link</a>
                              : <span className="text-xs text-gray-400">Sem link disponível</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Button variant="outline" onClick={() => copyText(buildParcelasMessage(), 'Mensagem das parcelas copiada para enviar ao tutor.')}>
                  <Copy className="w-4 h-4" />
                  Copiar mensagem para o cliente
                </Button>
              </>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">Nenhuma parcela em aberto foi localizada na fonte de dados do ERP, embora o plano conste como inadimplente. Confirme diretamente no ERP.</p>
            )}

            <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 space-y-3">
              <p className="text-sm text-amber-800 dark:text-amber-300 font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                O registro do atendimento está bloqueado enquanto o cliente estiver inadimplente.
              </p>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-800 dark:text-gray-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={comprovanteRecebido}
                  onChange={(e) => setComprovanteRecebido(e.target.checked)}
                  className="w-4 h-4 accent-emerald-600"
                />
                Comprovante de pagamento recebido
              </label>
              {comprovanteRecebido && (
                <div className="space-y-1">
                  <Label className="text-xs">Observação obrigatória (registrada no histórico)</Label>
                  <Textarea
                    value={comprovanteObs}
                    onChange={(e) => setComprovanteObs(e.target.value)}
                    placeholder="Descreva o comprovante recebido (data, valor, forma de envio)..."
                    rows={2}
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── HISTÓRICO DE UTILIZAÇÕES ── */}
      {clientData && !atendimentoFinalizado && utilizacoes?.atendimentos?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-br from-violet-500 to-purple-500 shadow-lg">
                <Clock className="w-5 h-5 text-white" />
              </div>
              Histórico de Atendimentos ({utilizacoes.atendimentos.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {utilizacoes.atendimentos.map((at, i) => (
                <div key={at.id || i} className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <Calendar className="w-3.5 h-3.5" />
                      <span className="font-medium">{formatDateTime(at.data_hora)}</span>
                    </div>
                    <StatusBadge status={at.status_atendimento || 'Pendente'} />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="flex items-center gap-2">
                      <PawPrint className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Pet</p>
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{at.pet_nome || '-'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <User className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Atendente</p>
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{at.usuario || '-'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Hash className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Protocolo</p>
                        <p className="text-sm font-mono font-medium text-gray-800 dark:text-gray-200">{at.protocolo || '-'}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── ELEGIBILIDADE + INICIAR ATENDIMENTO ── */}
      {clientData && !atendimentoFinalizado && (
        <Card className={(!bloqueadoPorInadimplencia && petsAtivos.length > 0)
          ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/30"
          : "border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/30"}>
          <CardContent className="p-6">
            {petsAtivos.length === 0 ? (
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-xl bg-gradient-to-br from-red-500 to-rose-500 shadow-lg flex-shrink-0">
                  <XCircle className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-red-700 dark:text-red-300">Atendimento Negado</h3>
                  <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                    {pets.length === 0
                      ? 'O pet não está incluído no plano deste cliente. Não é possível prosseguir com o atendimento.'
                      : 'Todos os pets deste plano já estão marcados como Falecido.'}
                  </p>
                </div>
              </div>
            ) : bloqueadoPorInadimplencia ? (
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-xl bg-gradient-to-br from-red-500 to-rose-500 shadow-lg flex-shrink-0">
                  <XCircle className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-red-700 dark:text-red-300">Registro Bloqueado — Cliente Inadimplente</h3>
                  <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                    Envie as parcelas pendentes ao tutor. O registro será liberado quando o cliente estiver adimplente ou ao marcar "Comprovante de pagamento recebido" (com observação obrigatória).
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-xl bg-gradient-to-br from-emerald-500 to-green-500 shadow-lg flex-shrink-0">
                  <CheckCircle className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-emerald-700 dark:text-emerald-300">Cliente Elegível</h3>
                  <p className="text-sm text-emerald-600 dark:text-emerald-400 mt-1">
                    {isInadimplente
                      ? 'Comprovante de pagamento recebido — o registro do atendimento foi liberado.'
                      : 'Cliente adimplente. O atendimento pode ser registrado.'}
                  </p>
                </div>
              </div>
            )}

            {!bloqueadoPorInadimplencia && petsAtivos.length > 0 && !showForm && (
              <div className="mt-6">
                <Button onClick={() => setShowForm(true)} variant="success" size="lg" disabled={isInadimplente && !comprovanteObs.trim() && comprovanteRecebido && false}>
                  <ClipboardCheck className="w-4 h-4" />
                  Registrar Atendimento de Cremação
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── FORMULÁRIO DE REGISTRO ── */}
      {showForm && !atendimentoFinalizado && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-br from-teal-500 to-teal-600 shadow-lg">
                <FileText className="w-5 h-5 text-white" />
              </div>
              Registrar Atendimento de Cremação
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmitAtendimento} className="space-y-5">
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5"><PawPrint className="w-4 h-4 text-teal-500" />Pet *</Label>
                <Select value={selectedPet} onValueChange={setSelectedPet}>
                  <SelectTrigger className="border-teal-200 dark:border-teal-800">
                    <SelectValue placeholder="Selecione o pet do plano" />
                  </SelectTrigger>
                  <SelectContent>
                    {petsAtivos.map((p) => (
                      <SelectItem key={p.contrato_id} value={String(p.contrato_id)}>
                        <div className="flex items-center gap-2">
                          <PawPrint className="w-4 h-4 text-teal-500" />
                          <span className="font-bold">{p.nome}</span>
                          <span className="text-gray-500">{p.descricao.replace(p.nome, '').replace(/^ - /, '')}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5"><MapPin className="w-4 h-4 text-teal-500" />Local da Remoção *</Label>
                  <Input value={remocaoLocal} onChange={(e) => setRemocaoLocal(e.target.value)} placeholder="Ex: Residência / Clínica — cidade" />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5"><MapPin className="w-4 h-4 text-teal-500" />Endereço da Remoção *</Label>
                  <Input value={remocaoEndereco} onChange={(e) => setRemocaoEndereco(e.target.value)} placeholder="Rua, número, bairro, cidade" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5"><Stethoscope className="w-4 h-4 text-teal-500" />Clínica Veterinária</Label>
                  <Input value={clinicaNome} onChange={(e) => setClinicaNome(e.target.value)} placeholder="Nome da clínica (se aplicável)" />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5"><Handshake className="w-4 h-4 text-teal-500" />Parceiro Operacional / Direcionamento</Label>
                  <Input value={parceiroNome} onChange={(e) => setParceiroNome(e.target.value)} placeholder="Parceiro responsável pela cremação" />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-1.5"><Phone className="w-4 h-4 text-teal-500" />Telefone de Contato *</Label>
                <Input
                  placeholder="(DDD) Telefone"
                  value={telefoneContato}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, '').slice(0, 11);
                    let formatted = digits;
                    if (digits.length > 2) formatted = `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
                    else if (digits.length > 0) formatted = `(${digits}`;
                    setTelefoneContato(formatted);
                  }}
                  maxLength={15}
                />
              </div>

              <div className="space-y-2">
                <Label>Observações</Label>
                <Textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={3} placeholder="Detalhes adicionais (opcional)" />
              </div>

              <div className="flex gap-3 pt-2">
                <Button type="submit" disabled={submitting} className="bg-teal-600 hover:bg-teal-700 text-white">
                  {submitting ? (<><Loader2 className="w-4 h-4 animate-spin" />Registrando...</>) : (<><ClipboardCheck className="w-4 h-4" />Registrar Atendimento</>)}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* ── RESUMO FINAL + AUTORIZAÇÃO ── */}
      {atendimentoFinalizado && (
        <div className="space-y-6">
          <Card className="border-emerald-300 dark:border-emerald-700 shadow-lg overflow-hidden">
            <div className="bg-gradient-to-r from-teal-600 via-emerald-500 to-emerald-500 px-6 py-5 text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <CheckCircle className="w-6 h-6 text-white" />
                <h2 className="text-lg font-bold text-white tracking-wide">Atendimento Registrado com Sucesso</h2>
              </div>
              <p className="text-emerald-100 text-sm">Resumo do atendimento de cremação</p>
            </div>
            <CardContent className="p-0">
              <div className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700 px-6 py-6 text-center">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400 mb-2">Protocolo de Atendimento</p>
                <p className="text-4xl sm:text-5xl font-extrabold text-gray-900 dark:text-white tracking-widest font-mono">
                  {atendimentoFinalizado.protocolo || '-'}
                </p>
                <div className="mt-4"><StatusBadge status={atendimentoFinalizado.status_atendimento || 'Pendente'} /></div>
              </div>
              <div className="px-6 py-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                  {[
                    ['Titular / Solicitante', atendimentoFinalizado.nome_cliente],
                    ['CPF', atendimentoFinalizado.documento_cliente],
                    ['Pet', atendimentoFinalizado.pet_descricao || atendimentoFinalizado.pet_nome],
                    ['Local da Remoção', atendimentoFinalizado.remocao_local],
                    ['Endereço da Remoção', atendimentoFinalizado.remocao_endereco],
                    ['Clínica Veterinária', atendimentoFinalizado.clinica_nome],
                    ['Parceiro Operacional', atendimentoFinalizado.parceiro_nome],
                    ['Telefone de Contato', atendimentoFinalizado.telefone_contato ? atendimentoFinalizado.telefone_contato.replace(/(\d{2})(\d{4,5})(\d{4})/, '($1) $2-$3') : '-'],
                    ['Contrato(s) do Plano', atendimentoFinalizado.contratos_servicos],
                    ['Situação Financeira', atendimentoFinalizado.situacao_financeira],
                    ['Registrado por', atendimentoFinalizado.usuario],
                    ['Data / Hora', formatDateTime(atendimentoFinalizado.data_hora || atendimentoFinalizado.created_at)],
                  ].map(([label, value]) => (
                    <div key={label} className="space-y-1">
                      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-400">{label}</p>
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{value || '-'}</p>
                    </div>
                  ))}
                  {atendimentoFinalizado.comprovante_pagamento_recebido && (
                    <div className="space-y-1 sm:col-span-2">
                      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-400">Comprovante de Pagamento</p>
                      <p className="text-sm text-gray-900 dark:text-gray-100">Recebido — {atendimentoFinalizado.comprovante_pagamento_obs || '-'}</p>
                    </div>
                  )}
                  {atendimentoFinalizado.observacoes && (
                    <div className="space-y-1 sm:col-span-2">
                      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-400">Observações</p>
                      <p className="text-sm text-gray-900 dark:text-gray-100">{atendimentoFinalizado.observacoes}</p>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ── AUTORIZAÇÃO DE CREMAÇÃO ── */}
          {/* Outer card: just provides the section label and action buttons */}
          <Card className="border-gray-300 dark:border-gray-600 shadow-lg overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-gradient-to-br from-teal-700 to-emerald-900 shadow-lg">
                  <FileText className="w-5 h-5 text-white" />
                </div>
                Autorização de Serviço de Cremação
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">

              {/* ── Preview do formulário oficial (espelha o PDF BOMPET-AUTORIZACAO) ── */}
              <div className="bg-white border border-gray-300 rounded-2xl p-6 space-y-4 text-gray-900">

                {/* Faixa de título escura como no modelo */}
                <div className="rounded-full bg-[#2d2d2d] py-2.5 px-6 text-center">
                  <p className="text-xs sm:text-sm font-extrabold tracking-wide uppercase text-white">
                    AUTORIZAÇÃO DE SERVIÇOS DE ASSESSORIA PET
                  </p>
                </div>

                {/* Pill Nº de Processo à direita */}
                <div className="flex justify-end">
                  <div className="bg-gray-200 border border-gray-300 rounded-lg px-4 py-1.5 flex items-baseline gap-2">
                    <span className="text-[10px] text-gray-600">Nº de Processo:</span>
                    <span className="font-mono font-bold text-gray-900 text-sm">{atendimentoFinalizado.protocolo || ''}</span>
                  </div>
                </div>

                {/* Campos em estilo formulário: rótulo + valor sublinhado */}
                <div className="space-y-3 pt-2">
                  {[
                    ['Empresa Contratada:', 'Bom Pet'],
                    ['Cidade:', termoLocal || atendimentoFinalizado.termo_local],
                    ['Fone:', atendimentoFinalizado.telefone_contato ? atendimentoFinalizado.telefone_contato.replace(/(\d{2})(\d{4,5})(\d{4})/, '($1) $2-$3') : ''],
                    ['Atendente Resp.:', atendimentoFinalizado.usuario],
                    ['Data e Hora:', formatDateTime(atendimentoFinalizado.data_hora || atendimentoFinalizado.created_at)],
                    ['Fone para Contato com Familiares:', atendimentoFinalizado.telefone_contato ? atendimentoFinalizado.telefone_contato.replace(/(\d{2})(\d{4,5})(\d{4})/, '($1) $2-$3') : ''],
                    ['Número do Contrato:', atendimentoFinalizado.contratos_servicos],
                    ['Nome do Titular:', [atendimentoFinalizado.nome_cliente, atendimentoFinalizado.documento_cliente ? `CPF ${atendimentoFinalizado.documento_cliente}` : ''].filter(Boolean).join(' — ')],
                    ['Nome do PET:', atendimentoFinalizado.pet_descricao || atendimentoFinalizado.pet_nome],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-baseline gap-2 text-sm">
                      <span className="text-gray-600 whitespace-nowrap text-xs">{label}</span>
                      <span className="flex-1 border-b border-gray-400 font-semibold text-blue-900 px-1 min-h-[1.25rem]">{value || ''}</span>
                    </div>
                  ))}

                  {/* Local / Cidade onde se encontra o PET */}
                  <div className="flex flex-wrap items-baseline gap-2 text-sm">
                    <span className="text-gray-600 text-xs">Local / Cidade onde se encontra o PET:</span>
                    <span className="flex items-center gap-1 text-xs text-gray-600">
                      Residência
                      <span className={`inline-block w-4 h-4 rounded-full border-2 border-gray-500 ${!atendimentoFinalizado.clinica_nome ? 'bg-blue-900' : ''}`} />
                    </span>
                    <span className="flex items-center gap-1 text-xs text-gray-600">
                      Clínica
                      <span className={`inline-block w-4 h-4 rounded-full border-2 border-gray-500 ${atendimentoFinalizado.clinica_nome ? 'bg-blue-900' : ''}`} />
                    </span>
                    <span className="flex-1 border-b border-gray-400 font-semibold text-blue-900 px-1 min-h-[1.25rem]">
                      {(atendimentoFinalizado.clinica_nome
                        ? [atendimentoFinalizado.clinica_nome, atendimentoFinalizado.remocao_local]
                        : [atendimentoFinalizado.remocao_local, atendimentoFinalizado.remocao_endereco]
                      ).concat((termoRua || atendimentoFinalizado.termo_rua || '').trim()).filter(Boolean).join(' — ')}
                    </span>
                  </div>
                </div>

                {/* Rodapé do formulário: caixa esquerda + data/assinaturas à direita */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div className="border border-gray-400 rounded-md p-4 space-y-2">
                    <div className="flex items-baseline gap-2 text-sm">
                      <span className="text-gray-600 text-xs whitespace-nowrap">Valores Combinados:</span>
                      <span className="flex-1 border-b border-gray-400 font-semibold text-blue-900 px-1 min-h-[1.25rem]">{termoValoresCombinados || atendimentoFinalizado.termo_valores_combinados || ''}</span>
                    </div>
                    <p className="text-xs text-gray-600">Descrição do Produto Contratado:</p>
                    <p className="text-sm font-semibold text-blue-900 border-b border-gray-400 min-h-[1.25rem] whitespace-pre-wrap">{termoDescricaoProduto || atendimentoFinalizado.termo_descricao_produto || ''}</p>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-baseline gap-2 text-sm">
                      <span className="text-gray-600 text-xs">Data:</span>
                      <span className="border-b border-gray-400 font-semibold text-blue-900 px-2">{formatDate(atendimentoFinalizado.data_hora || atendimentoFinalizado.created_at)}</span>
                    </div>
                    <div className="bg-gray-200 rounded-md p-4 space-y-5">
                      <p className="text-xs font-semibold text-gray-700">Assinaturas:</p>
                      {['Contratante:', 'Atendente:'].map(sig => (
                        <div key={sig} className="flex items-baseline gap-2 text-xs text-gray-600">
                          {sig}
                          <span className="flex-1 border-b border-gray-500" />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Campos editáveis (preencher antes de salvar) */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-4">
                <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Campos a preencher</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs">Local / Cidade</Label>
                    <Input value={termoLocal} onChange={e => setTermoLocal(e.target.value)} disabled={termoSalvo} placeholder="Ex: Porto Alegre" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Rua / Ponto de Referência</Label>
                    <Input value={termoRua} onChange={e => setTermoRua(e.target.value)} disabled={termoSalvo} placeholder="Complemento de localização" />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs">Valores Combinados</Label>
                    <Input value={termoValoresCombinados} onChange={e => setTermoValoresCombinados(e.target.value)} disabled={termoSalvo} placeholder="Ex: R$ 0,00 — incluso no plano" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Descrição do Produto Contratado</Label>
                    <Textarea value={termoDescricaoProduto} onChange={e => setTermoDescricaoProduto(e.target.value)} disabled={termoSalvo} rows={3} placeholder="Descreva o serviço de cremação contratado..." />
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-3">
                {termoSalvo ? (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 rounded-lg border border-emerald-300 dark:border-emerald-700 text-xs font-semibold">
                    <CheckCircle className="w-3.5 h-3.5" />
                    Dados salvos com sucesso
                  </div>
                ) : (
                  <Button onClick={handleSalvarTermo} className="bg-gray-800 hover:bg-gray-900 text-white gap-2">
                    <Save className="w-4 h-4" />
                    Salvar
                  </Button>
                )}
                <Button onClick={() => exportTermoPDF()} disabled={!termoSalvo} className="bg-red-600 hover:bg-red-700 text-white gap-2 disabled:opacity-40">
                  <Download className="w-4 h-4" />
                  Exportar PDF
                </Button>
              </div>

            </CardContent>
          </Card>

          {/* ── COPIAR TEXTO PARA O PARCEIRO ── */}
          <Card className="border-teal-200 dark:border-teal-800 bg-teal-50/50 dark:bg-teal-950/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-500 shadow-lg">
                  <Copy className="w-5 h-5 text-white" />
                </div>
                Mensagem para o Parceiro (WhatsApp manual)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <pre className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap font-sans leading-relaxed">{buildParceiroMessage()}</pre>
              </div>
              <div className="mt-4">
                <Button onClick={() => copyText(buildParceiroMessage(), 'Texto da autorização copiado para enviar ao parceiro.')} className="bg-teal-600 hover:bg-teal-700 text-white">
                  <Copy className="w-4 h-4" />
                  Copiar Texto da Autorização
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-center">
            <Button onClick={() => { resetAll(); setSearchCPF(''); setSearchNome(''); setError(''); }} variant="outline" size="lg">
              <RefreshCw className="w-4 h-4" />
              Nova Consulta
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
