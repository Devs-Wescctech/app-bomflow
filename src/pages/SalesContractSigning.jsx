import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Eye, FileSignature, FileText, Info, Loader2, Search, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

const PAGE_SIZE = 20;
const token = () => localStorage.getItem("accessToken") || localStorage.getItem("auth_token");

const documentMask = (value) => {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  if (digits.length <= 11) {
    return digits
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d)/, ".$1-$2");
  }
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\/\d{4})(\d)/, "$1-$2");
};

const dateLabel = (value) => {
  if (!value) return "Data não informada";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Data não informada" : date.toLocaleDateString("pt-BR");
};

function SignatureCanvas({ onCancel, onSave }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const pointsRef = useRef([]);
  const [hasInk, setHasInk] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
      canvas.width = Math.round(rect.width * ratio);
      canvas.height = Math.round(rect.height * ratio);
      const context = canvas.getContext("2d");
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.strokeStyle = "#195b56";
      context.lineWidth = 2.4;
      context.lineCap = "round";
      context.lineJoin = "round";
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  const point = (event) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const start = (event) => {
    event.preventDefault();
    const canvas = canvasRef.current;
    canvas.setPointerCapture?.(event.pointerId);
    const next = point(event);
    drawingRef.current = true;
    pointsRef.current.push(next);
    const context = canvas.getContext("2d");
    context.beginPath();
    context.moveTo(next.x, next.y);
  };

  const draw = (event) => {
    if (!drawingRef.current) return;
    event.preventDefault();
    const next = point(event);
    const previous = pointsRef.current.at(-1);
    pointsRef.current.push(next);
    const context = canvasRef.current.getContext("2d");
    context.lineTo(next.x, next.y);
    context.stroke();
    if (previous && (Math.hypot(next.x - previous.x, next.y - previous.y) > 2 || pointsRef.current.length > 8)) {
      setHasInk(true);
    }
  };

  const stop = (event) => {
    drawingRef.current = false;
    canvasRef.current?.releasePointerCapture?.(event.pointerId);
  };

  const clear = () => {
    const canvas = canvasRef.current;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    pointsRef.current = [];
    setHasInk(false);
    setError("");
    setSuccess("");
  };

  const croppedSignature = () => {
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    let left = canvas.width;
    let right = -1;
    let top = canvas.height;
    let bottom = -1;
    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        if (image.data[((y * canvas.width) + x) * 4 + 3] > 0) {
          left = Math.min(left, x);
          right = Math.max(right, x);
          top = Math.min(top, y);
          bottom = Math.max(bottom, y);
        }
      }
    }
    if (right < left || bottom < top) return null;
    const padding = Math.max(12, Math.round(canvas.width * 0.015));
    left = Math.max(0, left - padding);
    top = Math.max(0, top - padding);
    right = Math.min(canvas.width - 1, right + padding);
    bottom = Math.min(canvas.height - 1, bottom + padding);
    const output = document.createElement("canvas");
    output.width = right - left + 1;
    output.height = bottom - top + 1;
    output.getContext("2d").drawImage(
      canvas,
      left, top, output.width, output.height,
      0, 0, output.width, output.height,
    );
    return output.toDataURL("image/png");
  };

  const attemptSave = async () => {
    if (pointsRef.current.length < 8 || !hasInk) {
      setError("Faça uma assinatura com mais detalhes para validar a captura.");
      return;
    }
    const signatureDataUrl = croppedSignature();
    if (!signatureDataUrl) {
      setError("Não foi possível preparar a imagem da assinatura.");
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await onSave(signatureDataUrl);
      setSuccess("Assinatura de teste salva. A próxima captura substituirá este arquivo.");
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-muted/30 p-2">
        <canvas
          ref={canvasRef}
          aria-label="Área para desenhar a assinatura"
          className="block h-[210px] w-full touch-none cursor-crosshair rounded-lg bg-background"
          onPointerDown={start}
          onPointerMove={draw}
          onPointerUp={stop}
          onPointerCancel={stop}
          onPointerLeave={stop}
        />
      </div>
      <p className="text-center text-sm text-muted-foreground">
        Use o mouse, uma caneta ou o dedo. A captura será usada somente na homologação.
      </p>
      {error && <p role="alert" className="text-sm text-amber-700">{error}</p>}
      {success && <p role="status" className="flex items-center gap-2 text-sm text-primary"><CheckCircle2 className="h-4 w-4" />{success}</p>}
      <DialogFooter className="gap-2 sm:space-x-0">
        <button type="button" className="action-pill-ghost" onClick={clear} disabled={!pointsRef.current.length}>
          <Trash2 className="h-4 w-4" />Limpar
        </button>
        <button type="button" className="action-pill-ghost" onClick={onCancel}>Fechar</button>
        <button
          type="button"
          className="action-pill-primary"
          onClick={attemptSave}
          disabled={!hasInk || saving}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          {saving ? "Salvando..." : "Salvar teste"}
        </button>
      </DialogFooter>
    </div>
  );
}

function DisabledAction({ children, icon: Icon, explanation }) {
  return (
    <button
      type="button"
      className="action-pill-ghost h-10 px-3"
      disabled
      title={explanation}
      aria-label={`${children}. ${explanation}`}
    >
      {Icon && <Icon className="h-4 w-4" />}
      {children}
    </button>
  );
}

export default function SalesContractSigning() {
  const [cpf, setCpf] = useState("");
  const [reference, setReference] = useState("");
  const [state, setState] = useState({ loading: false, searched: false, error: "", results: [], total: 0, page: 1, pageSize: PAGE_SIZE });
  const [signing, setSigning] = useState({ open: false, row: null });
  const [modelState, setModelState] = useState({ loadingId: "", error: "" });

  const saveTestSignature = async (signatureDataUrl) => {
    const response = await fetch("/api/sales-pf/contracts/signature-test", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ signatureDataUrl }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || "Não foi possível salvar a assinatura de teste.");
  };

  const viewModel = async (row) => {
    const rowId = row.generationId || row.id || row.label;
    const previewWindow = window.open("", "_blank");
    if (previewWindow) {
      previewWindow.document.title = "Gerando modelo do contrato";
      previewWindow.document.body.style.fontFamily = "system-ui, sans-serif";
      previewWindow.document.body.style.padding = "32px";
      previewWindow.document.body.textContent = "Gerando modelo assinado, aguarde...";
    }
    setModelState({ loadingId: rowId, error: "" });
    try {
      const response = await fetch("/api/sales-pf/contracts/generate", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ generationId: row.generationId, useTestSignature: true }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || "Não foi possível gerar o modelo assinado.");
      }
      const url = URL.createObjectURL(await response.blob());
      if (!previewWindow) {
        URL.revokeObjectURL(url);
        throw new Error("O navegador bloqueou a abertura do modelo. Libere pop-ups para este endereço e tente novamente.");
      }
      previewWindow.location.replace(url);
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
      setModelState({ loadingId: "", error: "" });
    } catch (previewError) {
      previewWindow?.close();
      setModelState({ loadingId: "", error: previewError.message });
    }
  };

  const searchPage = async (page = 1) => {
    if (!cpf && !reference) {
      setState((current) => ({ ...current, searched: true, error: "Informe o CPF, CNPJ ou o pedido/orçamento para pesquisar." }));
      return;
    }
    setState((current) => ({ ...current, loading: true, searched: true, error: "", results: [] }));
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (cpf) params.set("document", cpf);
      if (reference) params.set("reference", reference);
      const response = await fetch(`/api/sales-pf/contracts/search?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || "Não foi possível consultar os contratos.");
      setState({
        loading: false,
        searched: true,
        error: "",
        results: Array.isArray(body.rows) ? body.rows : [],
        total: Number(body.total) || 0,
        page: Number(body.page) || page,
        pageSize: Number(body.pageSize) || PAGE_SIZE,
      });
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: error.message, results: [], total: 0, page }));
    }
  };

  const search = (event) => {
    event.preventDefault();
    searchPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(state.total / state.pageSize));
  const productLabels = {
    bom_auto: "Bom Auto",
    bom_corp: "Bom Corp",
    bom_ideal: "Bom Ideal",
    bom_med: "Bom Med",
    bom_familia: "Bom Família",
    bom_familia_portabilidade: "Bom Família Portabilidade",
    essencial: "Essencial",
    perola: "Pérola",
    rubi: "Rubi",
    safira: "Safira",
    topazio: "Topázio",
    total_mais_bom_farma: "Total Mais e Bom Farma",
    bom_pet: "Bom Pet",
    bom_pet_saude_individual: "Bom Pet Saúde Individual",
    bom_pet_saude_3pets: "Bom Pet Saúde 3 Pets",
    combo_multi_bem_estar: "Combo Multi Bem Estar",
    novo_combo_multi_bem_estar: "Novo Combo Multi Bem Estar",
    combo_multi_selecao: "Combo Multi Seleção",
    convalescenca: "Convalescença",
  };
  const productName = (row) => row.product || row.productName || productLabels[row.productKey] || "";
  const groupedResults = [...state.results.reduce((groups, row) => {
    const product = productName(row) || "Outros contratos";
    if (!groups.has(product)) groups.set(product, []);
    groups.get(product).push(row);
    return groups;
  }, new Map())].map(([product, rows]) => ({ product, rows }));
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <header className="flex flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            <FileSignature className="h-4 w-4" />Recepção · Vendas PF
          </div>
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">Assinatura de Contrato</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Capture uma assinatura de teste e confira o posicionamento no modelo de cada produto antes da integração definitiva.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-800">
          <Info className="h-4 w-4" />Homologação de assinatura
        </div>
      </header>

      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border bg-muted/20 pb-4">
          <CardTitle className="flex items-center gap-2 text-base"><Search className="h-5 w-5 text-primary" />Buscar contrato elegível</CardTitle>
        </CardHeader>
        <CardContent className="pt-5">
          <form onSubmit={search} className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
            <div className="space-y-2">
              <label htmlFor="signature-document" className="block text-sm font-semibold">CPF ou CNPJ do titular</label>
              <Input id="signature-document" className="eloom-field" value={cpf} onChange={(event) => setCpf(documentMask(event.target.value))} placeholder="CPF ou CNPJ" inputMode="numeric" />
            </div>
            <div className="space-y-2">
              <label htmlFor="signature-reference" className="block text-sm font-semibold">Pedido ou orçamento</label>
              <Input id="signature-reference" className="eloom-field" value={reference} onChange={(event) => setReference(event.target.value.replace(/\D/g, "").slice(0, 18))} placeholder="Número de referência" inputMode="numeric" />
            </div>
            <button type="submit" className="action-pill-primary" disabled={state.loading}>
              {state.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {state.loading ? "Consultando..." : "Pesquisar"}
            </button>
          </form>
          <p className="mt-3 text-xs text-muted-foreground">Use apenas um dos campos. A consulta lê somente contratos elegíveis no serviço de busca.</p>
        </CardContent>
      </Card>

      {state.error && (
        <div role="alert" className="flex gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertCircle className="h-5 w-5 shrink-0" />{state.error}
        </div>
      )}

      {modelState.error && (
        <div role="alert" className="flex gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertCircle className="h-5 w-5 shrink-0" />{modelState.error}
        </div>
      )}

      {state.loading && (
        <Card><CardContent className="space-y-3 p-6">
          {[1, 2].map((item) => <div key={item} className="h-20 animate-pulse rounded-xl bg-muted" />)}
        </CardContent></Card>
      )}

      {!state.loading && !state.error && state.searched && state.results.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
          Nenhum contrato elegível para assinatura foi encontrado.
        </div>
      )}

      {!state.loading && state.results.length > 0 && (
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-3">
            <div><h2 className="font-display text-lg font-semibold">Contratos encontrados</h2><p className="text-sm text-muted-foreground">{state.total} resultado(s) · ações operacionais bloqueadas nesta prévia</p></div>
          </div>
          {groupedResults.map((group) => (
            <Card key={group.product}>
              <CardHeader className="border-b border-border bg-muted/10 py-4"><CardTitle className="text-base">{group.product}<span className="ml-2 text-sm font-normal text-muted-foreground">{group.rows.length}</span></CardTitle></CardHeader>
              <CardContent className="space-y-3 p-4">
                {group.rows.map((row) => {
                  const signature = row.signature || row;
                  const signed = Boolean(signature.signed);
                  return (
                    <div key={row.generationId || row.id || row.label} className="rounded-xl border border-border p-4 transition-colors hover:bg-muted/20">
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                        <div className="min-w-0 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold">{row.label || row.reference || "Contrato sem referência"}</span>
                            <span className="rounded-md border-[1.5px] border-primary px-2 py-0.5 text-[11px] font-semibold text-primary">{row.product || row.productName || group.product}</span>
                          </div>
                          <p className="text-sm text-muted-foreground">{row.name || "Titular não informado"} · {dateLabel(row.date)}</p>
                          {signed && <p className="flex items-center gap-1.5 text-sm text-primary"><CheckCircle2 className="h-4 w-4" />Assinatura registrada{signature.signedAt ? ` em ${dateLabel(signature.signedAt)}` : ""}</p>}
                        </div>
                        <div className="flex flex-wrap justify-start gap-2 xl:justify-end">
                          <button type="button" className="action-pill-primary h-10 px-4" onClick={() => setSigning({ open: true, row })}><FileSignature className="h-4 w-4" />Capturar assinatura</button>
                          <button type="button" className="action-pill-ghost h-10 px-4" disabled={Boolean(modelState.loadingId)} onClick={() => viewModel(row)}>
                            {modelState.loadingId === (row.generationId || row.id || row.label) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                            {modelState.loadingId === (row.generationId || row.id || row.label) ? "Gerando..." : "Ver modelo"}
                          </button>
                          <DisabledAction explanation="Indisponível: o armazenamento legado ainda não foi mapeado.">Documentos</DisabledAction>
                          <DisabledAction icon={FileText} explanation="Indisponível: geração de PDF não é executada nesta prévia.">Gerar PDF</DisabledAction>
                          <DisabledAction explanation="Indisponível: envio por WhatsApp não é executado nesta prévia.">Enviar WhatsApp</DisabledAction>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}
          {totalPages > 1 && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4"><span className="text-sm text-muted-foreground">Página {state.page} de {totalPages}</span><div className="flex gap-2"><button type="button" className="action-pill-ghost h-10 px-4" disabled={state.loading || state.page <= 1} onClick={() => searchPage(state.page - 1)}>Anterior</button><button type="button" className="action-pill-ghost h-10 px-4" disabled={state.loading || state.page >= totalPages} onClick={() => searchPage(state.page + 1)}>Próxima</button></div></div>}
        </div>
      )}

      <Dialog open={signing.open} onOpenChange={(open) => setSigning((current) => ({ ...current, open }))}>
        <DialogContent className="rounded-2xl border-border sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Capturar assinatura de teste</DialogTitle>
            <DialogDescription>{signing.row?.label || signing.row?.reference} · {signing.row?.name || "Titular não informado"}</DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-muted-foreground">O arquivo é temporário e compartilhado entre os modelos. Cada nova captura substitui a anterior; o registro no banco legado continua desabilitado.</div>
          <SignatureCanvas
            key={signing.row?.generationId || signing.row?.id || "signature"}
            onCancel={() => setSigning((current) => ({ ...current, open: false }))}
            onSave={saveTestSignature}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
