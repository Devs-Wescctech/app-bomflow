import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
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
  Search,
  CheckCircle2,
  XCircle,
  Loader2,
  User,
  FileText,
  Phone,
  Mail,
  Building2,
  CreditCard,
  MessageSquare,
  Send,
  FlaskConical,
  AlertCircle,
  Copy,
  Check,
  RefreshCw,
  Info,
  MapPin,
  Package,
  Users,
  UserPlus,
  DollarSign,
  ChevronDown,
  ChevronUp,
  X,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

const TITULO_CONTRATO_OPTIONS = [
  "BOM CORP",
  "BOM PASTOR",
  "BOM PASTOR - BOM AUTO",
  "BOM PASTOR - BOM DESCANSO FAMILIA",
  "BOM PASTOR - BOM MED",
  "BOM PASTOR - BOM PET",
  "BOM PASTOR - COB",
  "BOM PASTOR - COMBO MULTI ESPECIAL",
  "BOM PASTOR - COMBO MULTI SELEÇÃO",
  "BOM PASTOR - DIGITAL",
  "BOM PASTOR - ESSENCIAL",
  "BOM PASTOR - IDEAL",
  "BOM PASTOR - PEROLA",
  "BOM PASTOR - RUBI",
  "BOM PASTOR - SAFIRA",
  "BOM PASTOR - TOPAZIO",
  "BOM PASTOR - TOTAL +",
  "BOM SAMBA",
  "EXPLORER CALLCENTER",
];

const PLANO_PAGAMENTO_OPTIONS = [
  "BOLETO 6 - GALAX",
  "BOLETO CEF LEGADO",
  "BOLETO - DIGITAL GALAX",
  "BOLETO - PARCELA UNICA",
  "CARNE",
  "CARTÃO DE CREDITO",
  "CARTÃO DE CRÉDITO - 12 - CIELO",
  "CARTÃO DE CREDITO - GALAX",
  "CARTÃO DE CREDITO - VINDI",
  "CPFL",
  "PIX",
];

const NUMERO_PARCELAS_OPTIONS = ["1", "3", "6", "12"];

function isValidCelularBR(value) {
  const digits = value.replace(/\D/g, "");
  // Com código do país: 55 + DDD(2) + 9 + 8 = 13 dígitos
  if (digits.length === 13 && digits.startsWith("55")) {
    return digits[4] === "9";
  }
  // Sem código do país: DDD(2) + 9 + 8 = 11 dígitos
  if (digits.length === 11) {
    return digits[2] === "9";
  }
  return false;
}

const PARENTESCO_OPTIONS = [
  { value: "C", label: "C — Cônjuge" },
  { value: "F", label: "F — Filho/Filha" },
  { value: "M", label: "M — Mãe" },
  { value: "P", label: "P — Pai" },
  { value: "S", label: "S — Sogro/Sogra" },
  { value: "D", label: "D — Dependente" },
];

const SEXO_OPTIONS = [
  { value: "F", label: "Feminino" },
  { value: "M", label: "Masculino" },
];

const TIPO_PEDIDO_FIXO = "ORÇAMENTO";
const NOME_ESTABELECIMENTO_FIXO = "LIMEIRA - CNPA";

const DEFAULT_FORM = {
  // Contratante
  contratante_pessoa: "",
  cpf: "",
  pessoa_contato: "",
  un_rg: "",
  telefone: "",
  email_contato: "",
  whatsapp_do_cliente: "",
  // Endereço
  un_codigo_postal: "",
  un_lougradouro: "",
  un_numero_lougradouro: "",
  un_complemento_lougradouro: "",
  un_bairro: "",
  un_cidade: "",
  // Plano
  titulo_contrato: "",
  produtos: "",
  // Pagamento
  plano_pagamento: "",
  numero_parcelas: "",
  observacoes: "",
  // Beneficiário
  usua_cpf: "",
  usua_nome_completo: "",
  usua_data_nascimento: "",
  usua_sexo: "",
  usua_parentesco: "",
  usua_telefone: "",
  usua_produtos: "",
  usua_papeis: "",
};

function formatCpfMask(v) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function formatCepMask(v) {
  const d = v.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

function SectionCard({ icon: Icon, title, color = "violet", badge, collapsible, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  const colorMap = {
    violet: "from-violet-500 to-purple-600",
    blue: "from-blue-500 to-indigo-600",
    emerald: "from-emerald-500 to-teal-600",
    amber: "from-amber-500 to-orange-500",
    rose: "from-rose-500 to-pink-600",
    sky: "from-sky-500 to-cyan-600",
    indigo: "from-indigo-500 to-violet-600",
  };
  return (
    <Card className="border border-slate-200 shadow-sm overflow-hidden">
      <CardHeader
        className={cn("pb-3 pt-4 px-5", collapsible && "cursor-pointer select-none")}
        onClick={collapsible ? () => setOpen((o) => !o) : undefined}
      >
        <CardTitle className="flex items-center justify-between gap-2.5 text-sm font-semibold text-slate-700">
          <div className="flex items-center gap-2.5">
            <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${colorMap[color]} flex items-center justify-center flex-shrink-0`}>
              <Icon className="w-3.5 h-3.5 text-white" />
            </div>
            {title}
            {badge && (
              <Badge className="text-xs bg-slate-100 text-slate-500 border-slate-200 font-normal">
                {badge}
              </Badge>
            )}
          </div>
          {collapsible && (
            open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </CardTitle>
      </CardHeader>
      {open && (
        <CardContent className="px-5 pb-5 pt-0 space-y-3">
          {children}
        </CardContent>
      )}
    </Card>
  );
}

function FieldRow({ label, required, children }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Label className="text-xs font-medium text-slate-600">{label}</Label>
        {required && <span className="text-violet-500 text-xs">*</span>}
      </div>
      {children}
    </div>
  );
}

function JsonToken({ type, value }) {
  const colors = {
    key: "text-violet-400",
    string: "text-emerald-400",
    number: "text-amber-400",
    boolean: "text-blue-400",
    null: "text-slate-500",
    punct: "text-slate-400",
  };
  return <span className={colors[type] || "text-slate-300"}>{value}</span>;
}

function JsonPreview({ payload }) {
  const renderValue = (val, indent = 0) => {
    if (val === null || val === undefined || val === "")
      return <JsonToken type="null" value="null" />;
    if (typeof val === "number")
      return <JsonToken type="number" value={String(val)} />;
    if (typeof val === "boolean")
      return <JsonToken type="boolean" value={String(val)} />;
    if (typeof val === "string")
      return <JsonToken type="string" value={`"${val}"`} />;
    if (typeof val === "object") {
      const entries = Object.entries(val);
      if (!entries.length)
        return (
          <>
            <JsonToken type="punct" value="{" />
            <JsonToken type="punct" value="}" />
          </>
        );
      return (
        <>
          <JsonToken type="punct" value="{" />
          {entries.map(([k, v], i) => (
            <div key={k} className="ml-4">
              <JsonToken type="key" value={`"${k}"`} />
              <JsonToken type="punct" value=": " />
              {renderValue(v, indent + 1)}
              {i < entries.length - 1 && <JsonToken type="punct" value="," />}
            </div>
          ))}
          <div />
          <JsonToken type="punct" value="}" />
        </>
      );
    }
    return <span className="text-slate-300">{String(val)}</span>;
  };

  return (
    <pre className="text-xs leading-relaxed font-mono overflow-auto">
      {renderValue(payload)}
    </pre>
  );
}

export default function ErpOrcamentoForm() {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [cpfLookupState, setCpfLookupState] = useState(null);
  const [cepLookupState, setCepLookupState] = useState(null);
  const [response, setResponse] = useState(null);
  const [copied, setCopied] = useState(false);
  const [whatsAppError, setWhatsAppError] = useState("");

  const [produtosSearch, setProdutosSearch] = useState("");
  const [produtosOpen, setProdutosOpen] = useState(false);
  const produtosRef = useRef(null);

  const { data: user } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => base44.auth.me(),
  });

  const { data: erpProdutos = [], isLoading: loadingProdutos } = useQuery({
    queryKey: ["erpProdutos"],
    queryFn: async () => {
      const res = await fetch("/api/erp/produtos", {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (!res.ok) throw new Error("Erro ao buscar produtos do ERP");
      return res.json();
    },
    staleTime: 1000 * 60 * 10,
  });

  useEffect(() => {
    function handleClickOutside(e) {
      if (produtosRef.current && !produtosRef.current.contains(e.target)) {
        setProdutosOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const currentAgent = user?.agent;
  const erpAgenteVendaId =
    currentAgent?.erp_agente_venda_id ?? currentAgent?.erpAgenteVendaId ?? null;
  const agenteName = currentAgent?.name ?? currentAgent?.nome ?? null;

  const payload = useMemo(() => {
    const p = {
      tipo_pedido: TIPO_PEDIDO_FIXO,
      nome_estabelecimento: NOME_ESTABELECIMENTO_FIXO,
      agente_venda_id: erpAgenteVendaId ? Number(erpAgenteVendaId) : undefined,
      // Contratante
      contratante_pessoa: form.contratante_pessoa || undefined,
      cpf: form.cpf || undefined,
      pessoa_contato: form.pessoa_contato || undefined,
      un_rg: form.un_rg || undefined,
      telefone: form.telefone || undefined,
      email_contato: form.email_contato || undefined,
      whatsapp_do_cliente: form.whatsapp_do_cliente || undefined,
      // Endereço
      un_codigo_postal: form.un_codigo_postal ? form.un_codigo_postal.replace(/\D/g, "") : undefined,
      un_lougradouro: form.un_lougradouro || undefined,
      un_numero_lougradouro: form.un_numero_lougradouro || undefined,
      un_complemento_lougradouro: form.un_complemento_lougradouro || undefined,
      un_bairro: form.un_bairro || undefined,
      un_cidade: form.un_cidade || undefined,
      // Plano
      titulo_contrato: form.titulo_contrato || undefined,
      produtos: form.produtos || undefined,
      // Pagamento
      plano_pagamento: form.plano_pagamento || undefined,
      numero_parcelas: form.numero_parcelas || undefined,
      observacoes: form.observacoes || undefined,
      // Beneficiário
      usua_cpf: form.usua_cpf || undefined,
      usua_nome_completo: form.usua_nome_completo || undefined,
      usua_data_nascimento: form.usua_data_nascimento || undefined,
      usua_sexo: form.usua_sexo || undefined,
      usua_parentesco: form.usua_parentesco || undefined,
      usua_telefone: form.usua_telefone || undefined,
      usua_produtos: form.usua_produtos || undefined,
      usua_papeis: form.usua_papeis || undefined,
    };
    return Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined));
  }, [form, erpAgenteVendaId]);

  const lookupCpfMutation = useMutation({
    mutationFn: async (cpf) => {
      const r = await fetch(`/api/erp/lookup-cpf?cpf=${encodeURIComponent(cpf)}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Erro ao buscar CPF no ERP");
      return data;
    },
    onSuccess: (data) => {
      setCpfLookupState({ status: "found", ...data });
      setForm((f) => ({
        ...f,
        contratante_pessoa: data.pessoa,
        cpf: data.cpf,
        pessoa_contato: f.pessoa_contato || data.nome || "",
      }));
    },
    onError: (err) => {
      setCpfLookupState({ status: "notfound", error: err.message });
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
      setCepLookupState({ status: "found" });
      setForm((f) => ({
        ...f,
        un_lougradouro: (data.logradouro || "").toUpperCase(),
        un_bairro: (data.bairro || "").toUpperCase(),
        un_cidade: data.localidade
          ? `${data.localidade.toUpperCase()} - ${data.uf.toUpperCase()}`
          : f.un_cidade,
      }));
    },
    onError: (err) => {
      setCepLookupState({ status: "notfound", error: err.message });
    },
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/erp/pre-proposta", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      return { ok: r.ok, status: r.status, data };
    },
    onSuccess: (result) => setResponse(result),
    onError: (err) =>
      setResponse({ ok: false, status: 500, data: { error: err.message } }),
  });

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const handleCpfLookup = () => {
    const raw = form.cpf.replace(/\D/g, "");
    if (raw.length !== 11) return;
    setCpfLookupState({ status: "loading" });
    lookupCpfMutation.mutate(form.cpf);
  };

  const handleCepLookup = () => {
    const raw = form.un_codigo_postal.replace(/\D/g, "");
    if (raw.length !== 8) return;
    setCepLookupState({ status: "loading" });
    lookupCepMutation.mutate(raw);
  };

  const handleCopyPayload = () => {
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReset = () => {
    setForm(DEFAULT_FORM);
    setCpfLookupState(null);
    setCepLookupState(null);
    setResponse(null);
  };

  const hasBeneficiario = !!(
    form.usua_cpf ||
    form.usua_nome_completo ||
    form.usua_data_nascimento ||
    form.usua_sexo ||
    form.usua_parentesco
  );

  const requiredFilled =
    !!form.contratante_pessoa &&
    !!form.cpf &&
    !!form.pessoa_contato &&
    !!form.telefone &&
    !!form.titulo_contrato &&
    !!erpAgenteVendaId;

  const missingRequired = [
    !erpAgenteVendaId && "agente_venda_id",
    !form.contratante_pessoa && "Contratante Pessoa (faça o lookup do CPF)",
    !form.cpf && "cpf",
    !form.pessoa_contato && "pessoa_contato (nome do contratante)",
    !form.telefone && "telefone",
    !form.titulo_contrato && "titulo_contrato",
  ].filter(Boolean);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-700 px-6 py-8 shadow-lg">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2.5 mb-1">
                <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
                  <FlaskConical className="w-5 h-5 text-white" />
                </div>
                <h1 className="text-2xl font-bold text-white tracking-tight">
                  Orçamento ERP
                </h1>
                <Badge className="bg-amber-400/20 text-amber-200 border-amber-400/30 text-xs font-semibold">
                  PRÉ-PROPOSTA
                </Badge>
              </div>
              <p className="text-violet-200 text-sm mt-1">
                Preencha os campos e envie via{" "}
                <code className="bg-white/10 px-1 rounded text-violet-100 font-mono text-xs">
                  POST /PrePropostaUsuarioSgprc
                </code>
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              className="border-white/30 text-white hover:bg-white/10 bg-transparent"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              Limpar tudo
            </Button>
          </div>

          {/* Status bar */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
            {[
              {
                label: "agente_venda_id",
                value: erpAgenteVendaId ? `#${erpAgenteVendaId}` : "Não configurado",
                ok: !!erpAgenteVendaId,
              },
              {
                label: "Contratante Pessoa",
                value: form.contratante_pessoa || "Aguardando CPF",
                ok: !!form.contratante_pessoa,
              },
              {
                label: "titulo_contrato",
                value: form.titulo_contrato || "Não selecionado",
                ok: !!form.titulo_contrato,
              },
              {
                label: "plano_pagamento",
                value: form.plano_pagamento || "Não selecionado",
                ok: !!form.plano_pagamento,
              },
            ].map((item) => (
              <div key={item.label} className="bg-white/10 backdrop-blur rounded-xl p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  {item.ok ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />
                  ) : (
                    <AlertCircle className="w-3.5 h-3.5 text-amber-300" />
                  )}
                  <span className="text-xs text-violet-200 font-medium">{item.label}</span>
                </div>
                <p className="text-white text-xs font-semibold truncate">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Left column — form */}
        <div className="space-y-4">

          {/* 1. Agente */}
          <SectionCard icon={User} title="Agente de Venda" color="violet">
            <FieldRow label="Agente">
              <div className="flex items-center gap-2">
                <Input
                  value={agenteName ?? erpAgenteVendaId ?? ""}
                  readOnly
                  placeholder="Não configurado"
                  className={cn(
                    "bg-slate-50 border-slate-200 text-slate-600 text-sm",
                    !erpAgenteVendaId && "text-red-400 border-red-200 bg-red-50"
                  )}
                />
                {erpAgenteVendaId ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                )}
              </div>
              {!erpAgenteVendaId && (
                <p className="text-xs text-red-500 flex items-center gap-1 mt-1">
                  <Info className="w-3 h-3" />
                  Configure seu agente no ERP em Configurações → Agentes
                </p>
              )}
            </FieldRow>
          </SectionCard>

          {/* 2. Contratante */}
          <SectionCard icon={Search} title="Contratante" color="blue">
            {/* CPF lookup */}
            <FieldRow label="CPF do Contratante" required>
              <div className="flex gap-2">
                <Input
                  value={form.cpf}
                  onChange={(e) => {
                    set("cpf", formatCpfMask(e.target.value));
                    if (cpfLookupState) setCpfLookupState(null);
                  }}
                  placeholder="000.000.000-00"
                  className="font-mono text-sm"
                  maxLength={14}
                />
                <Button
                  onClick={handleCpfLookup}
                  disabled={
                    form.cpf.replace(/\D/g, "").length !== 11 ||
                    lookupCpfMutation.isPending
                  }
                  className="bg-blue-600 hover:bg-blue-700 text-white flex-shrink-0 px-4"
                >
                  {lookupCpfMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Search className="w-3.5 h-3.5" />
                  )}
                  <span className="ml-1.5 text-sm">Consultar</span>
                </Button>
              </div>
            </FieldRow>

            {cpfLookupState?.status === "found" && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 space-y-1">
                <div className="flex items-center gap-1.5 text-emerald-700 font-semibold text-xs">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Pessoa encontrada no ERP
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-500">Nome</span>
                    <p className="font-semibold text-slate-800 truncate">{cpfLookupState.nome}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Contratante Pessoa</span>
                    <p className="font-semibold text-slate-800 font-mono">{cpfLookupState.pessoa}</p>
                  </div>
                </div>
              </div>
            )}
            {cpfLookupState?.status === "notfound" && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <div className="flex items-center gap-1.5 text-red-600 font-semibold text-xs">
                  <XCircle className="w-3.5 h-3.5" />
                  {cpfLookupState.error}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <FieldRow label="Contratante Pessoa">
                <Input
                  value={form.contratante_pessoa}
                  onChange={(e) => set("contratante_pessoa", e.target.value.toUpperCase())}
                  placeholder=""
                  className={cn(
                    "font-mono text-sm",
                    form.contratante_pessoa ? "bg-emerald-50 border-emerald-200" : "bg-slate-50"
                  )}
                />
              </FieldRow>
              <FieldRow label="RG">
                <Input
                  value={form.un_rg}
                  onChange={(e) => set("un_rg", e.target.value.toUpperCase())}
                  placeholder="00.000.000-0"
                  className="text-sm"
                />
              </FieldRow>
            </div>

            <FieldRow label="Nome do Contratante" required>
              <Input
                value={form.pessoa_contato}
                onChange={(e) => set("pessoa_contato", e.target.value.toUpperCase())}
                placeholder="Nome completo do contratante"
                className="text-sm"
              />
            </FieldRow>

            <div className="grid grid-cols-2 gap-3">
              <FieldRow label="Telefone" required>
                <Input
                  value={form.telefone}
                  onChange={(e) => set("telefone", e.target.value)}
                  placeholder="(19) 99999-0000"
                  className="text-sm"
                />
              </FieldRow>
              <FieldRow label="WhatsApp">
                <div className="space-y-1">
                  <Input
                    value={form.whatsapp_do_cliente}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/\D/g, "");
                      set("whatsapp_do_cliente", raw);
                      if (raw.length === 0) {
                        setWhatsAppError("");
                      } else if (!isValidCelularBR(raw)) {
                        setWhatsAppError("Número inválido — informe um celular (ex: 5519912345678)");
                      } else {
                        setWhatsAppError("");
                      }
                    }}
                    placeholder="5519912345678"
                    maxLength={13}
                    className={cn("text-sm font-mono", whatsAppError ? "border-red-400 focus-visible:ring-red-400" : "")}
                  />
                  {whatsAppError && (
                    <p className="text-xs text-red-500 flex items-center gap-1">
                      <span>⚠</span> {whatsAppError}
                    </p>
                  )}
                </div>
              </FieldRow>
            </div>

            <FieldRow label="E-mail">
              <Input
                type="email"
                value={form.email_contato}
                onChange={(e) => set("email_contato", e.target.value)}
                placeholder="cliente@email.com"
                className="text-sm"
              />
            </FieldRow>
          </SectionCard>

          {/* 3. Endereço */}
          <SectionCard icon={MapPin} title="Endereço" color="sky" badge="opcional" collapsible defaultOpen>
            <FieldRow label="CEP">
              <div className="flex gap-2">
                <Input
                  value={form.un_codigo_postal}
                  onChange={(e) => {
                    set("un_codigo_postal", formatCepMask(e.target.value));
                    if (cepLookupState) setCepLookupState(null);
                  }}
                  placeholder="00000-000"
                  className="font-mono text-sm"
                  maxLength={9}
                />
                <Button
                  onClick={handleCepLookup}
                  disabled={
                    form.un_codigo_postal.replace(/\D/g, "").length !== 8 ||
                    lookupCepMutation.isPending
                  }
                  className="bg-sky-600 hover:bg-sky-700 text-white flex-shrink-0 px-4"
                >
                  {lookupCepMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Search className="w-3.5 h-3.5" />
                  )}
                  <span className="ml-1.5 text-sm">Buscar CEP</span>
                </Button>
              </div>
              {cepLookupState?.status === "found" && (
                <p className="text-xs text-emerald-600 flex items-center gap-1 mt-1">
                  <CheckCircle2 className="w-3 h-3" /> Endereço preenchido automaticamente
                </p>
              )}
              {cepLookupState?.status === "notfound" && (
                <p className="text-xs text-red-500 flex items-center gap-1 mt-1">
                  <XCircle className="w-3 h-3" /> {cepLookupState.error}
                </p>
              )}
            </FieldRow>

            <FieldRow label="Logradouro">
              <Input
                value={form.un_lougradouro}
                onChange={(e) => set("un_lougradouro", e.target.value.toUpperCase())}
                placeholder="RUA, AVENIDA, etc."
                className="text-sm"
              />
            </FieldRow>

            <div className="grid grid-cols-2 gap-3">
              <FieldRow label="Número">
                <Input
                  value={form.un_numero_lougradouro}
                  onChange={(e) => set("un_numero_lougradouro", e.target.value.toUpperCase())}
                  placeholder="123"
                  className="text-sm"
                />
              </FieldRow>
              <FieldRow label="Complemento">
                <Input
                  value={form.un_complemento_lougradouro}
                  onChange={(e) => set("un_complemento_lougradouro", e.target.value.toUpperCase())}
                  placeholder="APTO 10"
                  className="text-sm"
                />
              </FieldRow>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FieldRow label="Bairro">
                <Input
                  value={form.un_bairro}
                  onChange={(e) => set("un_bairro", e.target.value.toUpperCase())}
                  placeholder="CENTRO"
                  className="text-sm"
                />
              </FieldRow>
              <FieldRow label="Cidade — UF">
                <Input
                  value={form.un_cidade}
                  onChange={(e) => set("un_cidade", e.target.value.toUpperCase())}
                  placeholder="LIMEIRA - SP"
                  className="text-sm"
                />
              </FieldRow>
            </div>
          </SectionCard>

          {/* 4. Plano */}
          <SectionCard icon={Package} title="Plano / Produtos" color="violet">
            <div className="grid grid-cols-2 gap-3">
              <FieldRow label="Tipo de Pedido">
                <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-slate-200 bg-slate-50">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                  <span className="text-sm font-medium text-slate-700">{TIPO_PEDIDO_FIXO}</span>
                </div>
              </FieldRow>
              <FieldRow label="Estabelecimento">
                <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-slate-200 bg-slate-50">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                  <span className="text-xs font-medium text-slate-700 truncate">{NOME_ESTABELECIMENTO_FIXO}</span>
                </div>
              </FieldRow>
            </div>

            <FieldRow label="Título do Contrato / Plano" required>
              <Select value={form.titulo_contrato} onValueChange={(v) => set("titulo_contrato", v)}>
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="Selecione o plano..." />
                </SelectTrigger>
                <SelectContent className="max-h-56">
                  {TITULO_CONTRATO_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt} className="text-sm">
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldRow>

            <FieldRow label="Produtos">
              {(() => {
                const selectedIds = form.produtos
                  ? form.produtos.split(",").map(s => s.trim()).filter(Boolean)
                  : [];

                const selectedProdutos = erpProdutos.filter(p =>
                  selectedIds.includes(String(p.id))
                );

                const filteredProdutos = erpProdutos.filter(p => {
                  const nome = (p.nome || p.descricao || p.name || "").toLowerCase();
                  return nome.includes(produtosSearch.toLowerCase());
                });

                const toggleProduto = (id) => {
                  const idStr = String(id);
                  const current = form.produtos
                    ? form.produtos.split(",").map(s => s.trim()).filter(Boolean)
                    : [];
                  const next = current.includes(idStr)
                    ? current.filter(x => x !== idStr)
                    : [...current, idStr];
                  set("produtos", next.join(","));
                };

                return (
                  <div className="space-y-2" ref={produtosRef}>
                    {/* Trigger */}
                    <button
                      type="button"
                      onClick={() => setProdutosOpen(o => !o)}
                      className={cn(
                        "w-full flex items-center justify-between px-3 h-9 rounded-md border text-sm bg-white",
                        produtosOpen ? "border-violet-400 ring-1 ring-violet-300" : "border-slate-200 hover:border-slate-300"
                      )}
                    >
                      <span className="text-slate-500 truncate">
                        {selectedIds.length === 0
                          ? "Selecione os produtos..."
                          : `${selectedIds.length} produto(s) selecionado(s)`}
                      </span>
                      <ChevronDown className={cn("w-4 h-4 text-slate-400 flex-shrink-0 transition-transform", produtosOpen && "rotate-180")} />
                    </button>

                    {/* Dropdown */}
                    {produtosOpen && (
                      <div className="border border-slate-200 rounded-md shadow-lg bg-white z-50 max-h-56 flex flex-col">
                        <div className="p-2 border-b border-slate-100">
                          <Input
                            value={produtosSearch}
                            onChange={e => setProdutosSearch(e.target.value)}
                            placeholder="Buscar produto..."
                            className="h-7 text-xs"
                            autoFocus
                          />
                        </div>
                        <div className="overflow-y-auto flex-1">
                          {loadingProdutos ? (
                            <div className="flex items-center justify-center py-4 gap-2 text-slate-400 text-xs">
                              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando...
                            </div>
                          ) : filteredProdutos.length === 0 ? (
                            <p className="text-xs text-slate-400 text-center py-4">Nenhum produto encontrado</p>
                          ) : (
                            filteredProdutos.map(p => {
                              const nome = p.nome || p.descricao || p.name || `Produto #${p.id}`;
                              const checked = selectedIds.includes(String(p.id));
                              return (
                                <label
                                  key={p.id}
                                  className="flex items-center gap-2 px-3 py-2 hover:bg-violet-50 cursor-pointer"
                                >
                                  <Checkbox
                                    checked={checked}
                                    onCheckedChange={() => toggleProduto(p.id)}
                                    className="border-violet-300 data-[state=checked]:bg-violet-600"
                                  />
                                  <span className="text-sm text-slate-700 flex-1">{nome}</span>
                                  <span className="text-xs text-slate-400 font-mono">{p.id}</span>
                                </label>
                              );
                            })
                          )}
                        </div>
                      </div>
                    )}

                    {/* Chips dos selecionados */}
                    {selectedProdutos.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {selectedProdutos.map(p => {
                          const nome = p.nome || p.descricao || p.name || `#${p.id}`;
                          return (
                            <span
                              key={p.id}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 text-xs font-medium"
                            >
                              {nome}
                              <button
                                type="button"
                                onClick={() => toggleProduto(p.id)}
                                className="hover:text-violet-900"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}
            </FieldRow>
          </SectionCard>

          {/* 5. Pagamento */}
          <SectionCard icon={DollarSign} title="Pagamento" color="emerald">
            <div className="grid grid-cols-2 gap-3">
              <FieldRow label="Plano de Pagamento">
                <Select value={form.plano_pagamento} onValueChange={(v) => set("plano_pagamento", v)}>
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {PLANO_PAGAMENTO_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt} className="text-sm">
                        {opt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldRow>

              <FieldRow label="Nº de Parcelas">
                <Select value={form.numero_parcelas} onValueChange={(v) => set("numero_parcelas", v)}>
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder="Parcelas..." />
                  </SelectTrigger>
                  <SelectContent>
                    {NUMERO_PARCELAS_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt} className="text-sm">
                        {opt}x
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldRow>
            </div>

            <FieldRow label="Observações">
              <Textarea
                value={form.observacoes}
                onChange={(e) => set("observacoes", e.target.value)}
                placeholder="Observações gerais sobre o orçamento..."
                rows={3}
                className="text-sm resize-none"
              />
            </FieldRow>
          </SectionCard>

          {/* 6. Beneficiário */}
          <SectionCard
            icon={UserPlus}
            title="Beneficiário"
            color="rose"
            badge="opcional"
            collapsible
            defaultOpen={false}
          >
            <p className="text-xs text-slate-500 -mt-1 mb-2">
              Preencha os dados do beneficiário principal (usua_*). Apenas um por proposta.
            </p>

            <FieldRow label="CPF do Beneficiário">
              <Input
                value={form.usua_cpf}
                onChange={(e) => set("usua_cpf", formatCpfMask(e.target.value))}
                placeholder="000.000.000-00"
                className="font-mono text-sm"
                maxLength={14}
              />
            </FieldRow>

            <FieldRow label="Nome Completo">
              <Input
                value={form.usua_nome_completo}
                onChange={(e) => set("usua_nome_completo", e.target.value.toUpperCase())}
                placeholder="NOME COMPLETO DO BENEFICIÁRIO"
                className="text-sm"
              />
            </FieldRow>

            <div className="grid grid-cols-3 gap-3">
              <FieldRow label="Data de Nascimento">
                <Input
                  type="date"
                  value={form.usua_data_nascimento}
                  onChange={(e) => set("usua_data_nascimento", e.target.value)}
                  className="text-sm"
                />
              </FieldRow>

              <FieldRow label="Sexo">
                <Select value={form.usua_sexo} onValueChange={(v) => set("usua_sexo", v)}>
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder="Sexo..." />
                  </SelectTrigger>
                  <SelectContent>
                    {SEXO_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value} className="text-sm">
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldRow>

              <FieldRow label="Parentesco">
                <Select value={form.usua_parentesco} onValueChange={(v) => set("usua_parentesco", v)}>
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder="Grau..." />
                  </SelectTrigger>
                  <SelectContent>
                    {PARENTESCO_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value} className="text-sm">
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldRow>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FieldRow label="Telefone do Beneficiário">
                <Input
                  value={form.usua_telefone}
                  onChange={(e) => set("usua_telefone", e.target.value)}
                  placeholder="(19) 99999-0000"
                  className="text-sm"
                />
              </FieldRow>
              <FieldRow label="Papel">
                <Select value={form.usua_papeis} onValueChange={(v) => set("usua_papeis", v)}>
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder="Papel..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="B" className="text-sm">B — Beneficiário</SelectItem>
                  </SelectContent>
                </Select>
              </FieldRow>
            </div>

            <FieldRow label="Produtos do Beneficiário">
              <Input
                value={form.usua_produtos}
                onChange={(e) => set("usua_produtos", e.target.value)}
                placeholder="ex: 1234"
                className="text-sm font-mono"
              />
            </FieldRow>
          </SectionCard>

          {/* Submit */}
          <Button
            onClick={() => submitMutation.mutate()}
            disabled={!requiredFilled || !!whatsAppError || submitMutation.isPending}
            className={cn(
              "w-full h-12 text-sm font-semibold shadow-lg transition-all",
              requiredFilled && !whatsAppError
                ? "bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white shadow-violet-200"
                : "bg-slate-200 text-slate-400 cursor-not-allowed"
            )}
          >
            {submitMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Enviando para o ERP...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Enviar Pré-Proposta ao ERP
                {!requiredFilled && (
                  <span className="ml-2 text-xs opacity-75">(campos obrigatórios faltando)</span>
                )}
              </>
            )}
          </Button>

          {!requiredFilled && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-xs text-amber-700 font-medium flex items-start gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <span>
                  Campos obrigatórios em falta:{" "}
                  {missingRequired.join(", ")}
                </span>
              </p>
            </div>
          )}
        </div>

        {/* Right column — payload preview + response */}
        <div className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <Card className="border border-slate-200 shadow-sm overflow-hidden">
            <CardHeader className="pb-3 pt-4 px-5 bg-slate-900 border-b border-slate-700">
              <CardTitle className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                  <span className="text-slate-300 text-xs font-mono ml-2">
                    POST /PrePropostaUsuarioSgprc
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCopyPayload}
                  className="text-slate-400 hover:text-slate-200 hover:bg-slate-700 h-7 px-2"
                >
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span className="ml-1 text-xs">{copied ? "Copiado!" : "Copiar"}</span>
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="bg-slate-900 px-5 py-4 max-h-[520px] overflow-auto">
                <JsonPreview payload={payload} />
              </div>
              <div className="bg-slate-800 px-5 py-2 border-t border-slate-700">
                <span className="text-xs text-slate-400 font-mono">
                  {Object.keys(payload).length} campos preenchidos
                  {hasBeneficiario && (
                    <span className="ml-3 text-rose-400">+ beneficiário</span>
                  )}
                </span>
              </div>
            </CardContent>
          </Card>

          {response && (
            <Card
              className={cn(
                "border shadow-sm overflow-hidden",
                response.ok
                  ? "border-emerald-200 bg-emerald-50"
                  : "border-red-200 bg-red-50"
              )}
            >
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="flex items-center gap-2 text-sm">
                  {response.ok ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span className="text-emerald-700">
                        Proposta criada com sucesso!
                      </span>
                      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">
                        {response.status}
                      </Badge>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-4 h-4 text-red-600" />
                      <span className="text-red-700">Erro ao enviar</span>
                      <Badge className="bg-red-100 text-red-700 border-red-200 text-xs">
                        {response.status}
                      </Badge>
                    </>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-4 pt-0">
                <pre className="text-xs font-mono bg-white/60 rounded-lg p-3 overflow-auto max-h-48 text-slate-700 whitespace-pre-wrap">
                  {JSON.stringify(response.data, null, 2)}
                </pre>
                {response.ok && response.data?.pedido && (
                  <div className="mt-2 p-2 bg-emerald-100 rounded-lg text-xs text-emerald-800 font-semibold">
                    Nº do Pedido ERP: {response.data.pedido}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Field reference */}
          <Card className="border border-slate-200 shadow-sm">
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-xs font-semibold text-slate-600 flex items-center gap-2">
                <Info className="w-3.5 h-3.5" />
                Referência de campos
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-4 pt-0 space-y-2">
              {[
                { group: "Fixos", items: ["tipo_pedido = ORÇAMENTO", "nome_estabelecimento = LIMEIRA - CNPA"] },
                { group: "Auto (perfil)", items: ["agente_venda_id"] },
                { group: "Obrigatórios *", items: ["contratante_pessoa", "cpf", "pessoa_contato", "telefone", "titulo_contrato"] },
                { group: "Contratante", items: ["un_rg", "email_contato", "whatsapp_do_cliente"] },
                { group: "Endereço", items: ["un_codigo_postal", "un_lougradouro", "un_numero_lougradouro", "un_complemento_lougradouro", "un_bairro", "un_cidade"] },
                { group: "Pagamento", items: ["plano_pagamento", "numero_parcelas", "observacoes"] },
                { group: "Beneficiário (usua_*)", items: ["usua_cpf", "usua_nome_completo", "usua_data_nascimento", "usua_sexo", "usua_parentesco", "usua_telefone", "usua_produtos", "usua_papeis"] },
              ].map(({ group, items }) => (
                <div key={group}>
                  <p className="text-xs font-semibold text-slate-500 mb-1">{group}</p>
                  <div className="flex flex-wrap gap-1">
                    {items.map((item) => (
                      <code key={item} className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono">
                        {item}
                      </code>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
