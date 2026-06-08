import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  User, MapPin, Package, CreditCard, Users, ClipboardCheck,
  Loader2, ArrowLeft, ArrowRight, Send, CheckCircle2, XCircle,
  AlertCircle, ChevronDown, ChevronUp, Plus, Trash2, Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const TITULO_CONTRATO_OPTIONS = [
  "BOM CORP", "BOM PASTOR", "BOM PASTOR - BOM AUTO",
  "BOM PASTOR - BOM DESCANSO FAMILIA", "BOM PASTOR - BOM MED",
  "BOM PASTOR - BOM PET", "BOM PASTOR - COB",
  "BOM PASTOR - COMBO MULTI ESPECIAL", "BOM PASTOR - COMBO MULTI SELEÇÃO",
  "BOM PASTOR - DIGITAL", "BOM PASTOR - ESSENCIAL", "BOM PASTOR - IDEAL",
  "BOM PASTOR - PEROLA", "BOM PASTOR - RUBI", "BOM PASTOR - SAFIRA",
  "BOM PASTOR - TOPAZIO", "BOM PASTOR - TOTAL +", "BOM SAMBA",
  "EXPLORER CALLCENTER",
];

const PLANO_PAGAMENTO_OPTIONS = [
  "BOLETO", "BOLETO - PARCELA UNICA", "BOLETO - DIGITAL GALAX", "CARNE",
  "CARTÃO DE CREDITO", "CARTÃO DE CRÉDITO - 12 - CIELO",
  "CARTÃO DE CREDITO - GALAX", "CARTÃO DE CREDITO - VINDI", "CPFL", "PIX",
];

const NUMERO_PARCELAS_OPTIONS = ["1", "3", "6", "12"];

const PARENTESCO_OPTIONS = [
  { value: "P", label: "Pai" },
  { value: "M", label: "Mãe" },
  { value: "F", label: "Filho/Filha" },
  { value: "S", label: "Sogro/Sogra" },
  { value: "C", label: "Cônjuge" },
  { value: "D", label: "Dependente" },
];

const SEXO_OPTIONS = [
  { value: "F", label: "Feminino" },
  { value: "M", label: "Masculino" },
];

const ESTADO_CIVIL_OPTIONS = [
  "SOLTEIRO", "CASADO", "DIVORCIADO", "VIUVO", "SEPARADO", "UNIAO ESTAVEL",
];

const PROFISSAO_OPTIONS = [
  "MEDICO", "ENFERMEIRO", "PROFESSOR", "ADVOGADO", "ENGENHEIRO",
  "COMERCIANTE", "AUTONOMO", "APOSENTADO", "DO LAR", "OUTRO",
];

const STEPS = [
  { id: 1, label: "Contratante", icon: User },
  { id: 2, label: "Endereço", icon: MapPin },
  { id: 3, label: "Plano", icon: Package },
  { id: 4, label: "Pagamento", icon: CreditCard },
  { id: 5, label: "Beneficiários", icon: Users },
  { id: 6, label: "Revisão", icon: ClipboardCheck },
];

const NOME_ESTABELECIMENTO_FIXO = "LIMEIRA - CNPA";

function erpLoginFromEmail(email) {
  if (!email) return undefined;
  const atIdx = email.indexOf("@");
  if (atIdx < 0) return undefined;
  const local = email.slice(0, atIdx).toLowerCase().trim();
  const domain = email.slice(atIdx + 1).replace(/\.[^.]+$/, "").toLowerCase().trim();
  if (!local || !domain) return undefined;
  return `user.${local}.${domain}`;
}

function formatCpf(v) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function formatCep(v) {
  const d = v.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

function isValidCpf(cpf) {
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(d[i]) * (10 - i);
  let r = (sum * 10) % 11;
  if (r === 10 || r === 11) r = 0;
  if (r !== parseInt(d[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(d[i]) * (11 - i);
  r = (sum * 10) % 11;
  if (r === 10 || r === 11) r = 0;
  return r === parseInt(d[10]);
}

const EMPTY_BENEFICIARIO = {
  usua_cpf: "",
  usua_nome_completo: "",
  usua_data_nascimento: "",
  usua_sexo: "",
  usua_parentesco: "",
  usua_telefone: "",
  usua_produtos: "",
};

function useCanAccessOrcamento(user) {
  if (!user) return null;
  return user.role === "admin" || user.email === "teste3@bomflow.com";
}

export default function UpsellNovoOrcamento() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [cpfLookup, setCpfLookup] = useState(null);
  const [cepLookup, setCepLookup] = useState(null);
  const [beneficiarios, setBeneficiarios] = useState([{ ...EMPTY_BENEFICIARIO }]);
  const [openBenef, setOpenBenef] = useState([true]);
  const [submitResult, setSubmitResult] = useState(null);

  const [form, setForm] = useState({
    contratante_pessoa: "",
    cpf: "",
    pessoa_contato: "",
    un_rg: "",
    telefone: "",
    celular: "",
    email_contato: "",
    whatsapp_do_cliente: "",
    sexo: "",
    estado_civil: "",
    profissao: "",
    un_codigo_postal: "",
    un_lougradouro: "",
    un_numero_lougradouro: "",
    un_complemento_lougradouro: "",
    un_bairro: "",
    un_cidade: "",
    titulo_contrato: "",
    produto_id: "",
    preco_informado: "",
    plano_pagamento: "",
    numero_parcelas: "",
    dia_vencimento: "10",
    observacoes: "",
  });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const { data: user, isLoading: loadingUser } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => base44.auth.me(),
  });

  const canAccess = useCanAccessOrcamento(user);

  const currentAgent = user?.agent;
  const erpAgenteVendaId = currentAgent?.erp_agente_venda_id ?? currentAgent?.erpAgenteVendaId ?? null;

  const { data: erpProdutos = [], isLoading: loadingProdutos } = useQuery({
    queryKey: ["erpProdutos"],
    queryFn: async () => {
      const res = await fetch("/api/erp/produtos", {
        headers: { Authorization: `Bearer ${localStorage.getItem("accessToken")}` },
      });
      if (!res.ok) throw new Error("Erro ao buscar produtos do ERP");
      return res.json();
    },
    staleTime: 1000 * 60 * 10,
    enabled: !!canAccess,
  });

  const produtosFiltrados = useMemo(() => {
    if (!form.titulo_contrato) return [];
    return erpProdutos.filter((p) => {
      const titulo = (p.titulo_contrato || p.descricao || "").toLowerCase();
      return titulo.includes(form.titulo_contrato.toLowerCase());
    });
  }, [erpProdutos, form.titulo_contrato]);

  const produtoSelecionado = useMemo(
    () => erpProdutos.find((p) => String(p.id) === String(form.produto_id) || String(p.produto_id) === String(form.produto_id)) || null,
    [erpProdutos, form.produto_id]
  );

  const lookupCpfMutation = useMutation({
    mutationFn: async (cpf) => {
      const r = await fetch(`/api/erp/lookup-cpf?cpf=${encodeURIComponent(cpf)}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("accessToken")}` },
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Erro ao buscar CPF");
      return data;
    },
    onSuccess: (data) => {
      setCpfLookup({ status: "found", ...data });
      set("contratante_pessoa", data.pessoa || "");
      if (data.nome) set("pessoa_contato", data.nome);
      if (data.cpf) set("cpf", formatCpf(data.cpf));
    },
    onError: (err) => {
      setCpfLookup({ status: "notfound", error: err.message });
    },
  });

  const lookupCepMutation = useMutation({
    mutationFn: async (cep) => {
      const raw = cep.replace(/\D/g, "");
      const r = await fetch(`https://viacep.com.br/ws/${raw}/json/`);
      const data = await r.json();
      if (data.erro) throw new Error("CEP não encontrado");
      return data;
    },
    onSuccess: (data) => {
      setCepLookup({ status: "found" });
      setForm((f) => ({
        ...f,
        un_lougradouro: (data.logradouro || "").toUpperCase(),
        un_bairro: (data.bairro || "").toUpperCase(),
        un_cidade: data.localidade ? `${data.localidade.toUpperCase()} - ${data.uf.toUpperCase()}` : f.un_cidade,
      }));
    },
    onError: (err) => setCepLookup({ status: "notfound", error: err.message }),
  });

  const payload = useMemo(() => {
    const produtoIdNum = produtoSelecionado
      ? Number(produtoSelecionado.produto_id || produtoSelecionado.id)
      : undefined;
    const precoNum = form.preco_informado ? Number(form.preco_informado) : undefined;

    const p = {
      tipo_pedido: "ORÇAMENTO",
      nome_estabelecimento: NOME_ESTABELECIMENTO_FIXO,
      agente_venda_id: erpAgenteVendaId ? Number(erpAgenteVendaId) : undefined,
      usuario_inclusao: user?.email ? erpLoginFromEmail(user.email) : undefined,
      contratante_pessoa: form.contratante_pessoa || undefined,
      cpf: form.cpf || undefined,
      pessoa_contato: form.pessoa_contato || undefined,
      un_rg: form.un_rg || undefined,
      telefone: form.telefone || undefined,
      celular: form.celular || undefined,
      email_contato: form.email_contato || undefined,
      whatsapp_do_cliente: form.whatsapp_do_cliente || undefined,
      sexo: form.sexo || undefined,
      estado_civil: form.estado_civil || undefined,
      profissao: form.profissao || undefined,
      un_codigo_postal: form.un_codigo_postal ? form.un_codigo_postal.replace(/\D/g, "") : undefined,
      un_lougradouro: form.un_lougradouro || undefined,
      un_numero_lougradouro: form.un_numero_lougradouro || undefined,
      un_complemento_lougradouro: form.un_complemento_lougradouro || undefined,
      un_bairro: form.un_bairro || undefined,
      un_cidade: form.un_cidade || undefined,
      titulo_contrato: form.titulo_contrato || undefined,
      produtos: produtoIdNum,
      preco_informado: precoNum,
      plano_pagamento: form.plano_pagamento || undefined,
      numero_parcelas: form.numero_parcelas ? Number(form.numero_parcelas) : undefined,
      dia_vencimento: form.dia_vencimento ? Number(form.dia_vencimento) : undefined,
      prazo_pagamento_id: 1643483,
      observacoes: form.observacoes || undefined,
      beneficiarios: beneficiarios
        .filter(b => b.usua_nome_completo?.trim())
        .map(b => ({
          nome: b.usua_nome_completo.trim(),
          cpf: b.usua_cpf || null,
          dataNascimento: b.usua_data_nascimento || null,
          sexo: b.usua_sexo || null,
          parentesco: b.usua_parentesco || null,
          telefone: b.usua_telefone || null,
        })),
    };
    return Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined));
  }, [form, produtoSelecionado, beneficiarios, erpAgenteVendaId, user]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/erp/orcamento", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      return { ok: r.ok, status: r.status, data };
    },
    onSuccess: ({ ok, data }) => {
      if (!ok) {
        setSubmitResult({ type: "error", message: data?.error || "Erro desconhecido" });
        return;
      }
      if (data?.block) {
        setSubmitResult({ type: "error", message: data.error || `Bloco: ${data.block}`, data });
        return;
      }
      if (data?.error) {
        setSubmitResult({ type: "error", message: data.error, data });
        return;
      }
      setSubmitResult({ type: "success", data });
      toast.success("Orçamento enviado com sucesso!");
    },
    onError: (err) => {
      setSubmitResult({ type: "error", message: err.message });
    },
  });

  const validateStep = () => {
    if (step === 1) {
      const cpfRaw = form.cpf.replace(/\D/g, "");
      if (!cpfRaw || !isValidCpf(form.cpf)) { toast.error("CPF inválido"); return false; }
      if (!form.pessoa_contato.trim()) { toast.error("Nome completo obrigatório"); return false; }
      if (!form.telefone.trim()) { toast.error("Telefone obrigatório"); return false; }
    }
    if (step === 2) {
      if (form.un_codigo_postal.replace(/\D/g, "").length !== 8) { toast.error("CEP inválido (8 dígitos)"); return false; }
      if (!form.un_lougradouro.trim()) { toast.error("Logradouro obrigatório"); return false; }
      if (!form.un_numero_lougradouro.trim()) { toast.error("Número obrigatório"); return false; }
      if (!form.un_bairro.trim()) { toast.error("Bairro obrigatório"); return false; }
      if (!form.un_cidade.trim()) { toast.error("Cidade obrigatória"); return false; }
    }
    if (step === 3) {
      if (!form.titulo_contrato) { toast.error("Selecione o título do contrato"); return false; }
      if (!form.produto_id) { toast.error("Selecione o produto"); return false; }
      if (!form.preco_informado) { toast.error("Preço informado obrigatório"); return false; }
    }
    if (step === 4) {
      if (!form.plano_pagamento) { toast.error("Selecione o plano de pagamento"); return false; }
      if (!form.numero_parcelas) { toast.error("Selecione o número de parcelas"); return false; }
    }
    if (step === 5) {
      if (beneficiarios.length === 0 || !beneficiarios[0].usua_nome_completo.trim()) {
        toast.error("Adicione pelo menos um beneficiário com nome"); return false;
      }
    }
    return true;
  };

  const handleNext = () => {
    if (validateStep()) setStep((s) => Math.min(s + 1, 6));
  };

  const handleBack = () => setStep((s) => Math.max(s - 1, 1));

  const addBeneficiario = () => {
    if (beneficiarios.length >= 15) {
      toast.error("Limite de 15 beneficiários atingido");
      return;
    }
    setBeneficiarios((b) => [...b, { ...EMPTY_BENEFICIARIO }]);
    setOpenBenef((o) => [...o, true]);
  };

  const removeBeneficiario = (i) => {
    setBeneficiarios((b) => b.filter((_, idx) => idx !== i));
    setOpenBenef((o) => o.filter((_, idx) => idx !== i));
  };

  const setBenef = (i, k, v) => {
    setBeneficiarios((b) => b.map((benef, idx) => idx === i ? { ...benef, [k]: v } : benef));
  };

  const toggleBenef = (i) => setOpenBenef((o) => o.map((v, idx) => idx === i ? !v : v));

  if (loadingUser) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
      </div>
    );
  }

  if (canAccess === false) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <XCircle className="w-12 h-12 text-red-400" />
        <p className="text-lg font-semibold text-slate-700">Acesso não permitido</p>
        <Button variant="outline" onClick={() => navigate(createPageUrl("LeadsUpsellKanban"))}>
          Voltar ao Upsell
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4 pb-16 space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(createPageUrl("LeadsUpsellKanban"))}
          className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-slate-500" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Novo Orçamento ERP</h1>
          <p className="text-sm text-slate-500">Criação de orçamento via PrePropostaUsuarioSgprc</p>
        </div>
      </div>

      <ProgressBar step={step} />

      {submitResult ? (
        <SubmitResult result={submitResult} onReset={() => { setSubmitResult(null); setStep(1); }} />
      ) : (
        <>
          <Card className="shadow-sm border-slate-200">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-lg text-slate-700">
                {(() => { const S = STEPS[step - 1]; return <S.icon className="w-5 h-5 text-violet-500" />; })()}
                {STEPS[step - 1].label}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {step === 1 && (
                <Step1
                  form={form}
                  set={set}
                  cpfLookup={cpfLookup}
                  setCpfLookup={setCpfLookup}
                  lookupCpfMutation={lookupCpfMutation}
                />
              )}
              {step === 2 && (
                <Step2
                  form={form}
                  set={set}
                  cepLookup={cepLookup}
                  setCepLookup={setCepLookup}
                  lookupCepMutation={lookupCepMutation}
                />
              )}
              {step === 3 && (
                <Step3
                  form={form}
                  set={set}
                  produtosFiltrados={produtosFiltrados}
                  produtoSelecionado={produtoSelecionado}
                  loadingProdutos={loadingProdutos}
                />
              )}
              {step === 4 && <Step4 form={form} set={set} />}
              {step === 5 && (
                <Step5
                  beneficiarios={beneficiarios}
                  openBenef={openBenef}
                  produtoSelecionado={produtoSelecionado}
                  setBenef={setBenef}
                  toggleBenef={toggleBenef}
                  addBeneficiario={addBeneficiario}
                  removeBeneficiario={removeBeneficiario}
                />
              )}
              {step === 6 && (
                <Step6
                  form={form}
                  beneficiarios={beneficiarios}
                  produtoSelecionado={produtoSelecionado}
                  payload={payload}
                  currentAgent={currentAgent}
                  user={user}
                />
              )}
            </CardContent>
          </Card>

          <div className="flex justify-between items-center">
            <Button variant="outline" onClick={handleBack} disabled={step === 1}>
              <ArrowLeft className="w-4 h-4 mr-2" /> Voltar
            </Button>
            {step < 6 ? (
              <Button
                className="bg-violet-600 hover:bg-violet-700 text-white"
                onClick={handleNext}
              >
                Próximo <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <Button
                className="bg-violet-600 hover:bg-violet-700 text-white"
                onClick={() => submitMutation.mutate()}
                disabled={submitMutation.isPending}
              >
                {submitMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enviando ao ERP...</>
                ) : (
                  <><Send className="w-4 h-4 mr-2" /> Confirmar e Enviar ao ERP</>
                )}
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ProgressBar({ step }) {
  return (
    <div className="flex items-center gap-1">
      {STEPS.map((s, i) => {
        const done = step > s.id;
        const active = step === s.id;
        return (
          <div key={s.id} className="flex items-center flex-1">
            <div
              className={cn(
                "flex items-center gap-1.5 text-xs font-medium px-2 py-1.5 rounded-full transition-all",
                done && "bg-violet-100 text-violet-700",
                active && "bg-violet-600 text-white shadow",
                !done && !active && "text-slate-400"
              )}
            >
              {done ? (
                <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
              ) : (
                <span className={cn("w-3.5 h-3.5 rounded-full border flex items-center justify-center text-[10px] flex-shrink-0",
                  active ? "border-white bg-white/20 text-white" : "border-slate-300"
                )}>{s.id}</span>
              )}
              <span className="hidden sm:inline">{s.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={cn("h-px flex-1 mx-1", done ? "bg-violet-300" : "bg-slate-200")} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function Step1({ form, set, cpfLookup, setCpfLookup, lookupCpfMutation }) {
  const handleCpfChange = (v) => {
    const masked = formatCpf(v);
    set("cpf", masked);
    setCpfLookup(null);
    const raw = masked.replace(/\D/g, "");
    if (raw.length === 11 && isValidCpf(masked)) {
      lookupCpfMutation.mutate(masked);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label>CPF <span className="text-red-500">*</span></Label>
        <div className="relative">
          <Input
            value={form.cpf}
            onChange={(e) => handleCpfChange(e.target.value)}
            placeholder="000.000.000-00"
            maxLength={14}
          />
          {lookupCpfMutation.isPending && (
            <Loader2 className="absolute right-3 top-2.5 w-4 h-4 animate-spin text-violet-500" />
          )}
          {cpfLookup?.status === "found" && (
            <CheckCircle2 className="absolute right-3 top-2.5 w-4 h-4 text-green-500" />
          )}
        </div>
        {cpfLookup?.status === "found" && (
          <p className="text-xs text-green-600 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Encontrado no ERP: {cpfLookup.nome}
          </p>
        )}
        {cpfLookup?.status === "notfound" && (
          <p className="text-xs text-amber-600 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> Não encontrado no ERP — preencha manualmente
          </p>
        )}
      </div>

      <div className="space-y-1">
        <Label>Nome completo <span className="text-red-500">*</span></Label>
        <Input
          value={form.pessoa_contato}
          onChange={(e) => set("pessoa_contato", e.target.value.toUpperCase())}
          placeholder="NOME COMPLETO"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Telefone <span className="text-red-500">*</span></Label>
          <Input
            value={form.telefone}
            onChange={(e) => set("telefone", e.target.value)}
            placeholder="(51) 99999-9999"
          />
        </div>
        <div className="space-y-1">
          <Label>RG</Label>
          <Input
            value={form.un_rg}
            onChange={(e) => set("un_rg", e.target.value)}
            placeholder="Documento RG"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Celular <span className="text-red-500">*</span></Label>
          <Input
            value={form.celular}
            onChange={(e) => set("celular", e.target.value)}
            placeholder="(51) 99999-9999"
          />
          <p className="text-xs text-slate-400">Campo obrigatório no fechamento ERP</p>
        </div>
        <div className="space-y-1">
          <Label>Telefone</Label>
          <Input
            value={form.telefone}
            onChange={(e) => set("telefone", e.target.value)}
            placeholder="(51) 3333-3333"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1">
          <Label>Sexo <span className="text-red-500">*</span></Label>
          <Select value={form.sexo} onValueChange={(v) => set("sexo", v)}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione..." />
            </SelectTrigger>
            <SelectContent>
              {SEXO_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Estado civil <span className="text-red-500">*</span></Label>
          <Select value={form.estado_civil} onValueChange={(v) => set("estado_civil", v)}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione..." />
            </SelectTrigger>
            <SelectContent>
              {ESTADO_CIVIL_OPTIONS.map((opt) => (
                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Profissão <span className="text-red-500">*</span></Label>
          <Select value={form.profissao} onValueChange={(v) => set("profissao", v)}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione..." />
            </SelectTrigger>
            <SelectContent>
              {PROFISSAO_OPTIONS.map((opt) => (
                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>E-mail</Label>
          <Input
            type="email"
            value={form.email_contato}
            onChange={(e) => set("email_contato", e.target.value)}
            placeholder="email@exemplo.com"
          />
        </div>
        <div className="space-y-1">
          <Label>WhatsApp</Label>
          <Input
            value={form.whatsapp_do_cliente}
            onChange={(e) => set("whatsapp_do_cliente", e.target.value)}
            placeholder="(51) 99999-9999"
          />
        </div>
      </div>

      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 flex items-start gap-2">
        <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <span>Celular, Sexo, Estado civil e Profissão são campos obrigatórios no fechamento do ERP. Preencha-os para evitar erro de validação.</span>
      </div>
    </div>
  );
}

function Step2({ form, set, cepLookup, setCepLookup, lookupCepMutation }) {
  const handleCepChange = (v) => {
    const masked = formatCep(v);
    set("un_codigo_postal", masked);
    setCepLookup(null);
    const raw = masked.replace(/\D/g, "");
    if (raw.length === 8) lookupCepMutation.mutate(masked);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label>CEP <span className="text-red-500">*</span></Label>
        <div className="relative">
          <Input
            value={form.un_codigo_postal}
            onChange={(e) => handleCepChange(e.target.value)}
            placeholder="00000-000"
            maxLength={9}
          />
          {lookupCepMutation.isPending && (
            <Loader2 className="absolute right-3 top-2.5 w-4 h-4 animate-spin text-violet-500" />
          )}
          {cepLookup?.status === "found" && (
            <CheckCircle2 className="absolute right-3 top-2.5 w-4 h-4 text-green-500" />
          )}
        </div>
        {cepLookup?.status === "notfound" && (
          <p className="text-xs text-red-500 flex items-center gap-1">
            <XCircle className="w-3 h-3" /> CEP não encontrado
          </p>
        )}
      </div>

      <div className="space-y-1">
        <Label>Logradouro <span className="text-red-500">*</span></Label>
        <Input
          value={form.un_lougradouro}
          onChange={(e) => set("un_lougradouro", e.target.value.toUpperCase())}
          placeholder="RUA EXEMPLO"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Número <span className="text-red-500">*</span></Label>
          <Input
            value={form.un_numero_lougradouro}
            onChange={(e) => set("un_numero_lougradouro", e.target.value)}
            placeholder="123"
          />
        </div>
        <div className="space-y-1">
          <Label>Complemento</Label>
          <Input
            value={form.un_complemento_lougradouro}
            onChange={(e) => set("un_complemento_lougradouro", e.target.value.toUpperCase())}
            placeholder="APTO 101"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Bairro <span className="text-red-500">*</span></Label>
          <Input
            value={form.un_bairro}
            onChange={(e) => set("un_bairro", e.target.value.toUpperCase())}
            placeholder="CENTRO"
          />
        </div>
        <div className="space-y-1">
          <Label>Cidade <span className="text-red-500">*</span></Label>
          <Input
            value={form.un_cidade}
            onChange={(e) => set("un_cidade", e.target.value.toUpperCase())}
            placeholder="CANOAS - RS"
          />
        </div>
      </div>
    </div>
  );
}

function Step3({ form, set, produtosFiltrados, produtoSelecionado, loadingProdutos }) {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label>Título do contrato <span className="text-red-500">*</span></Label>
        <Select
          value={form.titulo_contrato}
          onValueChange={(v) => set("titulo_contrato", v)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Selecione o título..." />
          </SelectTrigger>
          <SelectContent>
            {TITULO_CONTRATO_OPTIONS.map((opt) => (
              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label>Produto <span className="text-red-500">*</span></Label>
        {loadingProdutos ? (
          <div className="flex items-center gap-2 text-sm text-slate-500 p-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando produtos do ERP...
          </div>
        ) : !form.titulo_contrato ? (
          <p className="text-xs text-slate-400 p-2">Selecione o título do contrato primeiro</p>
        ) : produtosFiltrados.length === 0 ? (
          <p className="text-xs text-amber-600 p-2 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> Nenhum produto encontrado para este título
          </p>
        ) : (
          <Select
            value={String(form.produto_id)}
            onValueChange={(v) => {
              set("produto_id", v);
              const prod = produtosFiltrados.find((p) => String(p.id) === v || String(p.produto_id) === v);
              if (prod?.preco_informado !== undefined) set("preco_informado", String(prod.preco_informado));
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione o produto..." />
            </SelectTrigger>
            <SelectContent>
              {produtosFiltrados.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.descricao || p.titulo_contrato || `Produto ${p.id}`}
                  {p.preco_informado !== undefined && ` — R$ ${Number(p.preco_informado).toFixed(2)}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="space-y-1">
        <Label>Preço informado <span className="text-red-500">*</span></Label>
        <Input
          type="number"
          min="0"
          step="0.01"
          value={form.preco_informado}
          onChange={(e) => set("preco_informado", e.target.value)}
          placeholder="0.00"
        />
        {produtoSelecionado && (
          <p className="text-xs text-slate-400">
            Preço ERP: R$ {Number(produtoSelecionado.preco_informado || 0).toFixed(2)} — pode ser editado
          </p>
        )}
      </div>
    </div>
  );
}

function Step4({ form, set }) {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label>Plano de pagamento <span className="text-red-500">*</span></Label>
        <Select value={form.plano_pagamento} onValueChange={(v) => set("plano_pagamento", v)}>
          <SelectTrigger>
            <SelectValue placeholder="Selecione..." />
          </SelectTrigger>
          <SelectContent>
            {PLANO_PAGAMENTO_OPTIONS.map((opt) => (
              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Nº de parcelas <span className="text-red-500">*</span></Label>
          <Select value={form.numero_parcelas} onValueChange={(v) => set("numero_parcelas", v)}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione..." />
            </SelectTrigger>
            <SelectContent>
              {NUMERO_PARCELAS_OPTIONS.map((opt) => (
                <SelectItem key={opt} value={opt}>{opt}x</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Dia de vencimento</Label>
          <Input
            type="number"
            min="1"
            max="28"
            value={form.dia_vencimento}
            onChange={(e) => set("dia_vencimento", e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label>Observações</Label>
        <Textarea
          value={form.observacoes}
          onChange={(e) => set("observacoes", e.target.value)}
          placeholder="Observações adicionais..."
          rows={3}
        />
      </div>

      <div className="p-3 bg-slate-50 rounded-lg text-xs text-slate-500 space-y-1">
        <p className="font-medium text-slate-600">Campos fixos (enviados automaticamente):</p>
        <p>prazo_pagamento_id: 1643483</p>
      </div>
    </div>
  );
}

function Step5({ beneficiarios, openBenef, produtoSelecionado, setBenef, toggleBenef, addBeneficiario, removeBeneficiario }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {beneficiarios.length} beneficiário(s) — apenas o primeiro será enviado ao ERP
        </p>
        <Button type="button" variant="outline" size="sm" onClick={addBeneficiario} className="text-violet-600 border-violet-200 hover:bg-violet-50">
          <Plus className="w-4 h-4 mr-1" /> Adicionar beneficiário
        </Button>
      </div>

      {beneficiarios.map((b, i) => (
        <Card key={i} className="border-slate-200">
          <div
            className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-50 rounded-t-lg"
            onClick={() => toggleBenef(i)}
          >
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-violet-500" />
              <span className="font-medium text-sm text-slate-700">
                {b.usua_nome_completo || `Beneficiário ${i + 1}`}
                {b.usua_parentesco && (
                  <Badge variant="secondary" className="ml-2 text-xs">
                    {PARENTESCO_OPTIONS.find((p) => p.value === b.usua_parentesco)?.label || b.usua_parentesco}
                  </Badge>
                )}
              </span>
              {i === 0 && <Badge className="bg-violet-100 text-violet-700 text-xs">Principal</Badge>}
            </div>
            <div className="flex items-center gap-2">
              {i > 0 && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); removeBeneficiario(i); }}
                  className="text-red-400 hover:text-red-600 p-1 rounded"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              {openBenef[i] ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </div>
          </div>

          {openBenef[i] && (
            <CardContent className="pt-0 pb-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">CPF</Label>
                  <Input
                    value={b.usua_cpf}
                    onChange={(e) => setBenef(i, "usua_cpf", formatCpf(e.target.value))}
                    placeholder="000.000.000-00"
                    maxLength={14}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Nome completo <span className="text-red-500">*</span></Label>
                  <Input
                    value={b.usua_nome_completo}
                    onChange={(e) => setBenef(i, "usua_nome_completo", e.target.value.toUpperCase())}
                    placeholder="NOME COMPLETO"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Data nascimento</Label>
                  <Input
                    type="date"
                    value={b.usua_data_nascimento}
                    onChange={(e) => setBenef(i, "usua_data_nascimento", e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Sexo</Label>
                  <Select value={b.usua_sexo} onValueChange={(v) => setBenef(i, "usua_sexo", v)}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Sexo" />
                    </SelectTrigger>
                    <SelectContent>
                      {SEXO_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Parentesco</Label>
                  <Select value={b.usua_parentesco} onValueChange={(v) => setBenef(i, "usua_parentesco", v)}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Parentesco" />
                    </SelectTrigger>
                    <SelectContent>
                      {PARENTESCO_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Telefone</Label>
                <Input
                  value={b.usua_telefone}
                  onChange={(e) => setBenef(i, "usua_telefone", e.target.value)}
                  placeholder="(51) 99999-9999"
                />
              </div>

              {produtoSelecionado && (
                <p className="text-xs text-slate-400">
                  Produto do beneficiário: {produtoSelecionado.descricao || produtoSelecionado.titulo_contrato} (preenchido automaticamente)
                </p>
              )}
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  );
}

function Step6({ form, beneficiarios, produtoSelecionado, payload, currentAgent, user }) {
  const benef = beneficiarios[0] || {};
  const parentesco = PARENTESCO_OPTIONS.find((p) => p.value === benef.usua_parentesco)?.label || benef.usua_parentesco;

  return (
    <div className="space-y-5">
      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700 flex items-start gap-2">
        <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <div>
          <p className="font-medium">Revise os dados antes de enviar</p>
          <p className="text-xs mt-1">Após o envio, o orçamento será criado no ERP. Esta ação não pode ser desfeita por aqui.</p>
        </div>
      </div>

      <ReviewSection title="Contratante" icon={User}>
        <ReviewRow label="CPF" value={form.cpf} />
        <ReviewRow label="Nome" value={form.pessoa_contato} />
        <ReviewRow label="Telefone" value={form.telefone} />
        {form.email_contato && <ReviewRow label="E-mail" value={form.email_contato} />}
        {form.whatsapp_do_cliente && <ReviewRow label="WhatsApp" value={form.whatsapp_do_cliente} />}
      </ReviewSection>

      <ReviewSection title="Endereço" icon={MapPin}>
        <ReviewRow label="CEP" value={form.un_codigo_postal} />
        <ReviewRow label="Endereço" value={`${form.un_lougradouro}, ${form.un_numero_lougradouro}${form.un_complemento_lougradouro ? ` - ${form.un_complemento_lougradouro}` : ""}`} />
        <ReviewRow label="Bairro" value={form.un_bairro} />
        <ReviewRow label="Cidade" value={form.un_cidade} />
      </ReviewSection>

      <ReviewSection title="Plano e Produto" icon={Package}>
        <ReviewRow label="Título" value={form.titulo_contrato} />
        <ReviewRow label="Produto" value={produtoSelecionado ? (produtoSelecionado.descricao || produtoSelecionado.titulo_contrato) : form.produto_id} />
        <ReviewRow label="Preço" value={form.preco_informado ? `R$ ${Number(form.preco_informado).toFixed(2)}` : "-"} />
      </ReviewSection>

      <ReviewSection title="Pagamento" icon={CreditCard}>
        <ReviewRow label="Plano" value={form.plano_pagamento} />
        <ReviewRow label="Parcelas" value={form.numero_parcelas ? `${form.numero_parcelas}x` : "-"} />
        <ReviewRow label="Vencimento" value={`Dia ${form.dia_vencimento}`} />
      </ReviewSection>

      <ReviewSection title={`Beneficiários (${beneficiarios.length})`} icon={Users}>
        <ReviewRow label="Nome" value={benef.usua_nome_completo || "-"} />
        {benef.usua_data_nascimento && <ReviewRow label="Nascimento" value={benef.usua_data_nascimento} />}
        {benef.usua_parentesco && <ReviewRow label="Parentesco" value={parentesco} />}
        {beneficiarios.length > 1 && (
          <p className="text-xs text-amber-600 mt-1">+ {beneficiarios.length - 1} beneficiário(s) adicional(is) — apenas o principal é enviado ao ERP</p>
        )}
      </ReviewSection>

      <div className="p-3 bg-slate-50 rounded-lg text-xs space-y-1 text-slate-500">
        <p className="font-medium text-slate-600">Campos automáticos no payload:</p>
        <p>tipo_pedido: ORÇAMENTO | nome_estabelecimento: LIMEIRA - CNPA</p>
        <p>agente_venda_id: {currentAgent?.erp_agente_venda_id || "—"} | usuario_inclusao: {user?.email ? `user.${user.email.split("@")[0]}.${user.email.split("@")[1]?.replace(/\.[^.]+$/, "")}` : "—"}</p>
        <p>prazo_pagamento_id: 1643483 | usua_papeis: B</p>
      </div>
    </div>
  );
}

function ReviewSection({ title, icon: Icon, children }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-600 border-b pb-1">
        <Icon className="w-4 h-4 text-violet-500" />
        {title}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">{children}</div>
    </div>
  );
}

function ReviewRow({ label, value }) {
  return (
    <>
      <span className="text-xs text-slate-400">{label}</span>
      <span className="text-xs text-slate-700 font-medium truncate">{value || "—"}</span>
    </>
  );
}

function SubmitResult({ result, onReset }) {
  return (
    <Card className="border-slate-200 shadow-sm">
      <CardContent className="pt-8 pb-8 flex flex-col items-center gap-4 text-center">
        {result.type === "success" && (
          <>
            <CheckCircle2 className="w-14 h-14 text-green-500" />
            <div>
              <p className="text-xl font-bold text-slate-800">Orçamento enviado com sucesso!</p>
              {result.data?.id && (
                <p className="text-sm text-slate-500 mt-1">ID do pedido: <strong>{result.data.id}</strong></p>
              )}
              {result.data?.numero_pedido && (
                <p className="text-sm text-slate-500">Número: <strong>{result.data.numero_pedido}</strong></p>
              )}
            </div>
            <Button
              className="bg-violet-600 hover:bg-violet-700 text-white mt-2"
              onClick={onReset}
            >
              Criar novo orçamento
            </Button>
          </>
        )}

        {result.type === "partial" && (
          <>
            <AlertCircle className="w-14 h-14 text-amber-500" />
            <div>
              <p className="text-xl font-bold text-slate-800">Orçamento criado com restrição</p>
              <p className="text-sm text-slate-600 mt-2 max-w-md">
                Orçamento criado, mas o fechamento está bloqueado. Contate o administrador do ERP para liberar o bloco de fechamento.
              </p>
              <p className="text-xs text-slate-400 mt-2 font-mono bg-slate-50 p-2 rounded">
                {result.data?.block}
              </p>
            </div>
            <Button variant="outline" onClick={onReset} className="mt-2">
              Tentar novamente
            </Button>
          </>
        )}

        {result.type === "error" && (
          <>
            <XCircle className="w-14 h-14 text-red-500" />
            <div>
              <p className="text-xl font-bold text-slate-800">Erro ao enviar</p>
              <p className="text-sm text-red-600 mt-2">{result.message}</p>
            </div>
            <Button variant="outline" onClick={onReset} className="mt-2">
              Voltar e corrigir
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
