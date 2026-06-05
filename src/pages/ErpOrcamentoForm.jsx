import { useState, useMemo } from "react";
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
  Hash,
  Building2,
  CreditCard,
  Calendar,
  MessageSquare,
  Send,
  FlaskConical,
  ChevronRight,
  AlertCircle,
  Copy,
  Check,
  RefreshCw,
  Info,
} from "lucide-react";
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

const NOME_ESTABELECIMENTO_OPTIONS = [
  "ALPHAVILLE - SP",
  "AMERICANA",
  "ARARAS",
  "ARTUR NOGUEIRA - GULLO",
  "BOM PASTOR PARTICIPAÇÕES S.A.",
  "BP CALL CENTER",
  "CACONDE-SP",
  "CAMPINAS - CAMPO GRANDE",
  "CAMPINAS - CNPA",
  "CAMPINAS - JD GUARANI",
  "CAMPINAS - OURO VERDE",
  "CNCC - BOM PASTOR CEMITERIOS",
  "CNIB - BOM PASTOR BENEFICIOS",
  "CNSF - BOM PASTOR SERVIÇOS FUNERAIS",
  "CONCHAL",
  "COSMOPOLIS - 9 DE JULHO",
  "COSMOPOLIS - BELA VISTA",
  "ENG. COELHO - CNPA",
  "ENG COELHO - GULLO",
  "FRANCISCO MORATO - GERSON ME",
  "GULLO - LIMEIRA",
  "HORTOLANDIA - REM CAMPINEIRO",
  "IRACEMAPOLIS",
  "JAGUARIUNA",
  "JD AMANDA - HORTOLANDIA",
  "JUNDIAI",
  "LIMEIRA - BP CONVENIOS",
  "LIMEIRA - CNPA",
  "MG - ANDRADAS",
  "MG - BOTELHOS",
  "MG - CALDAS",
  "MG - CAMPESTRE",
  "MG - COHAB",
  "MG - GUAXUPE",
  "MG - MACHADO",
  "MG - POÇOS DE CALDAS",
  "MG - STA RITA DE CALDAS",
  "MOGI GUACU",
  "NOVA ODESSA",
  "OLCL - CAMPO LIMPO",
  "OLCL - FRANCO DA ROCHA",
  "PAULINIA",
  "PINHAL",
  "SÃO JOSÉ DO RIO PARDO",
  "SAO PAULO - BRASILANDIA",
  "SAO PAULO - JACANA",
  "SAO PAULO - PERUS",
  "SP - DIVINOLANDIA",
  "SP - VARZEA PAULISTA",
  "STA BARBARA - CENTRO",
  "STA BARBARA - CIDADE NOVA",
  "STO ANT DE POSSE",
  "SUMARE",
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

const TIPO_PEDIDO_FIXO = "ORÇAMENTO";
const NOME_ESTABELECIMENTO_FIXO = "LIMEIRA - CNPA";

const DEFAULT_FORM = {
  contratante_pessoa: "",
  cpf: "",
  pessoa_contato: "",
  telefone: "",
  email_contato: "",
  whatsapp_do_cliente: "",
  agente_venda_id: "",
  titulo_contrato: "",
  plano_pagamento: "",
  observacoes: "",
};

function formatCpfMask(v) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function SectionCard({ icon: Icon, title, color = "violet", children }) {
  const colorMap = {
    violet: "from-violet-500 to-purple-600",
    blue: "from-blue-500 to-indigo-600",
    emerald: "from-emerald-500 to-teal-600",
    amber: "from-amber-500 to-orange-500",
    rose: "from-rose-500 to-pink-600",
  };
  return (
    <Card className="border border-slate-200 shadow-sm overflow-hidden">
      <CardHeader className="pb-3 pt-4 px-5">
        <CardTitle className="flex items-center gap-2.5 text-sm font-semibold text-slate-700">
          <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${colorMap[color]} flex items-center justify-center flex-shrink-0`}>
            <Icon className="w-3.5 h-3.5 text-white" />
          </div>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-5 pt-0 space-y-3">
        {children}
      </CardContent>
    </Card>
  );
}

function FieldRow({ label, required, hint, children }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Label className="text-xs font-medium text-slate-600">{label}</Label>
        {required && <span className="text-violet-500 text-xs">*</span>}
        {hint && (
          <span className="text-xs text-slate-400 font-normal">— {hint}</span>
        )}
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
      const pad = "  ".repeat(indent + 1);
      const closePad = "  ".repeat(indent);
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
              {i < entries.length - 1 && (
                <JsonToken type="punct" value="," />
              )}
            </div>
          ))}
          <div>{closePad}</div>
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
  const [response, setResponse] = useState(null);
  const [copied, setCopied] = useState(false);

  const { data: user } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => base44.auth.me(),
  });

  const currentAgent = user?.agent;
  const erpAgenteVendaId = currentAgent?.erp_agente_venda_id ?? currentAgent?.erpAgenteVendaId ?? null;

  const payload = useMemo(() => {
    const p = {
      tipo_pedido: TIPO_PEDIDO_FIXO,
      nome_estabelecimento: NOME_ESTABELECIMENTO_FIXO,
      contratante_pessoa: form.contratante_pessoa || undefined,
      cpf: form.cpf || undefined,
      pessoa_contato: form.pessoa_contato || undefined,
      telefone: form.telefone || undefined,
      email_contato: form.email_contato || undefined,
      whatsapp_do_cliente: form.whatsapp_do_cliente || undefined,
      agente_venda_id: erpAgenteVendaId ? Number(erpAgenteVendaId) : undefined,
      titulo_contrato: form.titulo_contrato || undefined,
      plano_pagamento: form.plano_pagamento || undefined,
      observacoes: form.observacoes || undefined,
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
      }));
    },
    onError: (err) => {
      setCpfLookupState({ status: "notfound", error: err.message });
    },
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/erp/orcamento", {
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
    onSuccess: (result) => {
      setResponse(result);
    },
    onError: (err) => {
      setResponse({ ok: false, status: 500, data: { error: err.message } });
    },
  });

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const handleCpfLookup = () => {
    const raw = form.cpf.replace(/\D/g, "");
    if (raw.length !== 11) return;
    setCpfLookupState({ status: "loading" });
    lookupCpfMutation.mutate(form.cpf);
  };

  const handleCopyPayload = () => {
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReset = () => {
    setForm(DEFAULT_FORM);
    setCpfLookupState(null);
    setResponse(null);
  };

  const requiredFilled =
    !!form.contratante_pessoa &&
    !!form.cpf &&
    !!form.titulo_contrato &&
    !!erpAgenteVendaId;

  return (
    <div className="min-h-screen bg-slate-50">
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
                  MODO DE TESTE
                </Badge>
              </div>
              <p className="text-violet-200 text-sm mt-1">
                Preencha os campos e visualize o payload que será enviado ao{" "}
                <code className="bg-white/10 px-1 rounded text-violet-100 font-mono text-xs">
                  POST /OrcamentoSgprcUsuario
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

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
            {[
              {
                label: "Seu erp_agente_venda_id",
                value: erpAgenteVendaId ? `#${erpAgenteVendaId}` : "Não configurado",
                ok: !!erpAgenteVendaId,
              },
              {
                label: "contratante_pessoa",
                value: form.contratante_pessoa || "Aguardando lookup",
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

      <div className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="space-y-4">
          <SectionCard icon={User} title="Agente de Venda" color="violet">
            <div className="grid grid-cols-1 gap-3">
              <FieldRow label="erp_agente_venda_id" hint="Preenchido automaticamente do seu perfil">
                <div className="flex items-center gap-2">
                  <Input
                    value={erpAgenteVendaId ?? ""}
                    readOnly
                    placeholder="Não configurado — registre o agente no ERP primeiro"
                    className={cn(
                      "bg-slate-50 border-slate-200 text-slate-600 text-sm font-mono",
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
            </div>
          </SectionCard>

          <SectionCard icon={Search} title="Busca do Cliente (CPF)" color="blue">
            <FieldRow label="CPF do Contratante" required hint="Digite e clique em Consultar">
              <div className="flex gap-2">
                <Input
                  value={form.cpf}
                  onChange={(e) => {
                    const masked = formatCpfMask(e.target.value);
                    set("cpf", masked);
                    if (cpfLookupState) setCpfLookupState(null);
                  }}
                  placeholder="000.000.000-00"
                  className="font-mono text-sm"
                  maxLength={14}
                />
                <Button
                  onClick={handleCpfLookup}
                  disabled={form.cpf.replace(/\D/g, "").length !== 11 || lookupCpfMutation.isPending}
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
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 space-y-2">
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
                    <span className="text-slate-500">contratante_pessoa</span>
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

            {cpfLookupState?.status === "found" && (
              <FieldRow label="contratante_pessoa (preenchido automaticamente)">
                <Input
                  value={form.contratante_pessoa}
                  onChange={(e) => set("contratante_pessoa", e.target.value.toUpperCase())}
                  className="font-mono text-sm bg-emerald-50 border-emerald-200"
                />
              </FieldRow>
            )}
          </SectionCard>

          <SectionCard icon={FileText} title="Dados do Orçamento" color="violet">
            <div className="grid grid-cols-2 gap-3">
              <FieldRow label="tipo_pedido" hint="fixo">
                <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-slate-200 bg-slate-50">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                  <span className="text-sm font-medium text-slate-700">{TIPO_PEDIDO_FIXO}</span>
                </div>
              </FieldRow>

              <FieldRow label="nome_estabelecimento" hint="fixo">
                <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-slate-200 bg-slate-50">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                  <span className="text-sm font-medium text-slate-700">{NOME_ESTABELECIMENTO_FIXO}</span>
                </div>
              </FieldRow>
            </div>

            <FieldRow label="titulo_contrato" required hint="Plano do cliente">
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

            <FieldRow label="plano_pagamento">
              <Select value={form.plano_pagamento} onValueChange={(v) => set("plano_pagamento", v)}>
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="Selecione o plano de pagamento..." />
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
          </SectionCard>

          <SectionCard icon={Phone} title="Dados de Contato" color="emerald">
            <div className="grid grid-cols-1 gap-3">
              <FieldRow label="telefone">
                <Input
                  value={form.telefone}
                  onChange={(e) => set("telefone", e.target.value)}
                  placeholder="(11) 99999-0000"
                  className="text-sm"
                />
              </FieldRow>

              <FieldRow label="email_contato">
                <Input
                  type="email"
                  value={form.email_contato}
                  onChange={(e) => set("email_contato", e.target.value)}
                  placeholder="cliente@email.com"
                  className="text-sm"
                />
              </FieldRow>

              <FieldRow label="whatsapp_do_cliente">
                <Input
                  value={form.whatsapp_do_cliente}
                  onChange={(e) => set("whatsapp_do_cliente", e.target.value)}
                  placeholder="5511999990000"
                  className="text-sm"
                />
              </FieldRow>

              <FieldRow label="pessoa_contato" hint="Código ERP da pessoa de contato">
                <Input
                  value={form.pessoa_contato}
                  onChange={(e) => set("pessoa_contato", e.target.value.toUpperCase())}
                  placeholder="Código ERP (opcional)"
                  className="text-sm font-mono"
                />
              </FieldRow>
            </div>
          </SectionCard>

          <SectionCard icon={MessageSquare} title="Observações" color="amber">
            <FieldRow label="observacoes">
              <Textarea
                value={form.observacoes}
                onChange={(e) => set("observacoes", e.target.value)}
                placeholder="Observações gerais sobre o orçamento..."
                rows={3}
                className="text-sm resize-none"
              />
            </FieldRow>
          </SectionCard>

          <Button
            onClick={() => submitMutation.mutate()}
            disabled={!requiredFilled || submitMutation.isPending}
            className={cn(
              "w-full h-12 text-sm font-semibold shadow-lg transition-all",
              requiredFilled
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
                Enviar para o ERP
                {!requiredFilled && (
                  <span className="ml-2 text-xs opacity-75">
                    (preencha os campos obrigatórios *)
                  </span>
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
                  {[
                    !erpAgenteVendaId && "agente_venda_id",
                    !form.contratante_pessoa && "contratante_pessoa (faça o lookup do CPF)",
                    !form.cpf && "cpf",
                    !form.titulo_contrato && "titulo_contrato",
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </span>
              </p>
            </div>
          )}
        </div>

        <div className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <Card className="border border-slate-200 shadow-sm overflow-hidden">
            <CardHeader className="pb-3 pt-4 px-5 bg-slate-900 border-b border-slate-700">
              <CardTitle className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                  <span className="text-slate-300 text-xs font-mono ml-2">
                    POST /OrcamentoSgprcUsuario
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
              <div className="bg-slate-900 px-5 py-4 max-h-[480px] overflow-auto">
                <JsonPreview payload={payload} />
              </div>
              <div className="bg-slate-800 px-5 py-2 border-t border-slate-700">
                <span className="text-xs text-slate-400 font-mono">
                  {Object.keys(payload).length} campos preenchidos
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
                      <span className="text-emerald-700 font-semibold">
                        Orçamento criado com sucesso!
                      </span>
                      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300 text-xs ml-auto">
                        HTTP {response.status}
                      </Badge>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-4 h-4 text-red-600" />
                      <span className="text-red-700 font-semibold">
                        Erro ao criar orçamento
                      </span>
                      <Badge className="bg-red-100 text-red-700 border-red-300 text-xs ml-auto">
                        HTTP {response.status}
                      </Badge>
                    </>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-4 pt-0">
                <div
                  className={cn(
                    "rounded-lg p-3 font-mono text-xs overflow-auto max-h-48",
                    response.ok ? "bg-emerald-100" : "bg-red-100"
                  )}
                >
                  <pre className={response.ok ? "text-emerald-800" : "text-red-800"}>
                    {JSON.stringify(response.data, null, 2)}
                  </pre>
                </div>
                {response.ok && response.data?.pedido && (
                  <div className="mt-3 flex items-center gap-2 bg-emerald-100 rounded-lg px-3 py-2">
                    <Hash className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-xs text-emerald-700">
                      Pedido ERP:{" "}
                      <strong className="font-semibold text-emerald-800 font-mono">
                        #{response.data.pedido}
                      </strong>
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card className="border border-violet-100 bg-violet-50">
            <CardContent className="px-4 py-3">
              <p className="text-xs font-semibold text-violet-700 mb-2 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5" />
                Campos obrigatórios identificados
              </p>
              <ul className="space-y-1">
                {[
                  { field: "agente_venda_id", ok: !!erpAgenteVendaId, note: "do seu perfil de agente" },
                  { field: "contratante_pessoa", ok: !!form.contratante_pessoa, note: "código ERP do cliente" },
                  { field: "cpf", ok: !!form.cpf, note: "CPF do contratante" },
                  { field: "titulo_contrato", ok: !!form.titulo_contrato, note: "plano selecionado" },
                  { field: "tipo_pedido", ok: true, note: `fixo: ${TIPO_PEDIDO_FIXO}` },
                  { field: "nome_estabelecimento", ok: true, note: `fixo: ${NOME_ESTABELECIMENTO_FIXO}` },
                ].map((item) => (
                  <li key={item.field} className="flex items-center gap-2 text-xs">
                    {item.ok ? (
                      <CheckCircle2 className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                    ) : (
                      <div className="w-3 h-3 rounded-full border-2 border-slate-300 flex-shrink-0" />
                    )}
                    <code className="font-mono text-violet-700 font-medium">{item.field}</code>
                    <span className="text-slate-500">{item.note}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
