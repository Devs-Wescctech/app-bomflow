import { useEffect, useRef, useState } from "react";
import { AlertCircle, Camera, CheckCircle2, Eye, FileSignature, FileText, Info, Loader2, RefreshCw, Search, Send, Trash2, Upload } from "lucide-react";
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

const hasWhatsAppTemplate = (row) => ![
  "bom_corp", "bom_ideal", "bom_med", "convalescenca", "legacy_signature_test",
].includes(String(row?.productKey || "").trim().toLowerCase());

const contractFileName = (row) => {
  const product = String(row.product || "contrato")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
  const order = String(row.pedido || row.reference || row.label || "")
    .match(/\d+/g)?.join("") || "sem_numero";
  return `contrato_${product}_${order}.pdf`;
};

const preparePdfTab = (popup) => {
  popup.document.open();
  popup.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Gerando contrato...</title><style>
    body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f3f5f7;color:#252931;font-family:system-ui,sans-serif}
    main{display:flex;flex-direction:column;align-items:center;gap:16px}.spinner{width:34px;height:34px;border:3px solid #dbe4e3;border-top-color:#0f766e;border-radius:50%;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
    </style></head><body><main><strong>Preparando seu contrato</strong><span class="spinner"></span></main></body></html>`);
  popup.document.close();
};

const showPdfInTab = (popup, pdfUrl, fileName) => {
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" /><title>${fileName}</title><style>
    *{box-sizing:border-box}body{margin:0;height:100vh;overflow:hidden;background:#525659}header{height:64px;display:flex;align-items:center;justify-content:space-between;padding:0 28px;background:#263238;color:#fff;font-family:system-ui,sans-serif}.download{padding:11px 20px;border-radius:999px;background:#0f766e;color:#fff;font-weight:700;text-decoration:none}iframe{display:block;width:100%;height:calc(100vh - 64px);border:0}
    </style></head><body><header><span>${fileName}</span><a class="download" href="${pdfUrl}" download="${fileName}">Baixar PDF</a></header><iframe src="${pdfUrl}#toolbar=0" title="${fileName}"></iframe></body></html>`;
  popup.location.replace(URL.createObjectURL(new Blob([html], { type: "text/html" })));
};

function SignatureCanvas({
  onCancel,
  onSave,
  helperText = "Use o mouse, uma caneta ou o dedo.",
  saveLabel = "Salvar assinatura",
}) {
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
      const saved = await onSave(signatureDataUrl);
      setSuccess(saved?.message || "Assinatura de teste salva. A próxima captura substituirá este arquivo.");
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
        {helperText}
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
          {saving ? "Salvando..." : saveLabel}
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

function DocumentCaptureDialog({ open, row, onOpenChange, onSaved }) {
  const videoRef = useRef(null);
  const [mode, setMode] = useState("upload");
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [cameraError, setCameraError] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!open || mode !== "camera") return undefined;
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("A câmera ao vivo exige HTTPS. Use o botão de câmera do dispositivo ou envie um arquivo.");
      return undefined;
    }
    let stream;
    let cancelled = false;
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((mediaStream) => {
        if (cancelled) {
          mediaStream.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = mediaStream;
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          videoRef.current.play().catch(() => {});
        }
      })
      .catch(() => setCameraError("Não foi possível acessar a câmera. Use o envio de arquivo."));
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [open, mode]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const selectFile = (selected) => {
    if (!selected) return;
    if (selected.size > 10 * 1024 * 1024) {
      setError("O arquivo deve ter no máximo 10 MB.");
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(selected);
    setPreviewUrl(selected.type.startsWith("image/") ? URL.createObjectURL(selected) : "");
    setError("");
    setSuccess("");
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video?.videoWidth || !video?.videoHeight) {
      setError("A câmera ainda não está pronta.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) selectFile(new File([blob], `documento_${row?.displayNumber || "contrato"}.jpg`, { type: "image/jpeg" }));
    }, "image/jpeg", 0.9);
  };

  const saveDocument = async () => {
    if (!file) {
      setError("Capture uma foto ou selecione um arquivo.");
      return;
    }
    setSaving(true);
    setError("");
    const data = new FormData();
    data.append("document", file);
    if (row?.isLegacySignatureTest) {
      data.append("persistLegacyTest", "true");
      data.append("reference", row.displayNumber);
      data.append("cpf", "000.000.000-00");
    } else {
      data.append("generationId", row?.generationId || "");
    }
    try {
      const response = await fetch("/api/sales-pf/contracts/document", {
        method: "POST",
        headers: { Authorization: `Bearer ${token()}` },
        body: data,
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || "Não foi possível salvar o documento.");
      setSuccess(body.message || "Documento salvo.");
      onSaved?.(body);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  const close = (nextOpen) => {
    if (saving) return;
    if (!nextOpen) {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setFile(null);
      setPreviewUrl("");
      setError("");
      setSuccess("");
      setCameraError("");
      setMode("upload");
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="rounded-2xl border-border sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Foto do documento</DialogTitle>
          <DialogDescription>{row?.label} · {row?.name || "Titular não informado"}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={mode === "upload" ? "action-pill-primary" : "action-pill-ghost"} onClick={() => setMode("upload")}><Upload className="h-4 w-4" />Enviar arquivo</button>
          <button type="button" className={mode === "camera" ? "action-pill-primary" : "action-pill-ghost"} onClick={() => setMode("camera")}><Camera className="h-4 w-4" />Usar câmera</button>
        </div>
        {mode === "upload" ? (
          <label className="flex min-h-40 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center">
            <Upload className="h-8 w-8 text-primary" />
            <span className="font-semibold">Escolher foto ou PDF</span>
            <span className="text-sm text-muted-foreground">JPG, PNG, WEBP ou PDF, até 10 MB</span>
            <input type="file" className="sr-only" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => selectFile(event.target.files?.[0])} />
          </label>
        ) : (
          <div className="space-y-3">
            <video ref={videoRef} muted playsInline className="max-h-[360px] w-full rounded-xl bg-black object-contain" />
            {cameraError && <p className="text-sm text-amber-700">{cameraError}</p>}
            <div className="flex flex-wrap gap-2">
              <button type="button" className="action-pill-primary" onClick={capturePhoto}><Camera className="h-4 w-4" />Tirar foto</button>
              <label className="action-pill-ghost cursor-pointer">
                <Camera className="h-4 w-4" />Câmera do dispositivo
                <input type="file" className="sr-only" accept="image/*" capture="environment" onChange={(event) => selectFile(event.target.files?.[0])} />
              </label>
            </div>
          </div>
        )}
        {file && (
          <div className="rounded-xl border border-border p-3">
            <p className="text-sm font-semibold">{file.name}</p>
            <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
            {previewUrl && <img src={previewUrl} alt="Prévia do documento" className="mt-3 max-h-52 rounded-lg object-contain" />}
          </div>
        )}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {success && <p role="status" className="flex items-center gap-2 text-sm text-primary"><CheckCircle2 className="h-4 w-4" />{success}</p>}
        <DialogFooter className="gap-2 sm:space-x-0">
          <button type="button" className="action-pill-ghost" disabled={saving} onClick={() => close(false)}>Fechar</button>
          <button type="button" className="action-pill-primary" disabled={!file || saving || Boolean(success)} onClick={saveDocument}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {saving ? "Salvando..." : "Salvar documento"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function SalesContractSigning() {
  const [cpf, setCpf] = useState("");
  const [reference, setReference] = useState("");
  const [state, setState] = useState({ loading: false, searched: false, error: "", results: [], total: 0, page: 1, pageSize: PAGE_SIZE });
  const [signing, setSigning] = useState({ open: false, row: null, mode: "preview" });
  const [documentCapture, setDocumentCapture] = useState({ open: false, row: null });
  const [modelState, setModelState] = useState({ loadingId: "", error: "" });
  const [generatingId, setGeneratingId] = useState("");
  const [whatsapp, setWhatsapp] = useState({
    open: false, row: null, phone: "", sending: false, error: "", sent: false,
    successMessage: "", deliveryStatus: "", checkingGenerationId: "",
  });

  const markSignatureSaved = () => {
    setState((current) => ({
      ...current,
      results: current.results.map((row) => (
        (row.generationId || row.id) === (signing.row?.generationId || signing.row?.id)
          ? { ...row, signature: { ...row.signature, signed: true, signedAt: new Date().toISOString() } }
          : row
      )),
    }));
  };

  const saveSignature = async (signatureDataUrl) => {
    const definitive = signing.mode === "definitive";
    const persistLegacyTest = definitive && Boolean(signing.row?.isLegacySignatureTest);
    const endpoint = definitive && !persistLegacyTest
      ? "/api/sales-pf/contracts/signature"
      : "/api/sales-pf/contracts/signature-test";
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        signatureDataUrl,
        persistLegacyTest,
        generationId: definitive && !persistLegacyTest ? signing.row?.generationId : undefined,
        reference: persistLegacyTest ? signing.row.displayNumber : undefined,
        cpf: persistLegacyTest ? "000.000.000-00" : undefined,
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || "Não foi possível salvar a assinatura.");
    if (body.persistent) markSignatureSaved();
    return body;
  };

  const markDocumentSaved = () => {
    setState((current) => ({
      ...current,
      results: current.results.map((row) => (
        (row.generationId || row.id) === (documentCapture.row?.generationId || documentCapture.row?.id)
          ? { ...row, signature: { ...row.signature, documentStored: true } }
          : row
      )),
    }));
  };

  const generatePdf = async (row) => {
    const popup = window.open("", "_blank");
    if (!popup) {
      setState((current) => ({ ...current, error: "Permita pop-ups para visualizar o PDF." }));
      return;
    }
    preparePdfTab(popup);
    setGeneratingId(row.generationId);
    setState((current) => ({ ...current, error: "" }));
    try {
      const response = await fetch("/api/sales-pf/contracts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ generationId: row.generationId }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const failure = new Error(body.message || "Falha ao gerar contrato.");
        failure.details = Array.isArray(body.errors) ? body.errors : [];
        throw failure;
      }
      const blob = await response.blob();
      const fileName = contractFileName(row);
      showPdfInTab(popup, URL.createObjectURL(new File([blob], fileName, { type: "application/pdf" })), fileName);
    } catch (generateError) {
      popup.close();
      setState((current) => ({ ...current, error: generateError.details?.length ? [generateError.message, ...generateError.details] : generateError.message }));
    } finally {
      setGeneratingId("");
    }
  };

  const openWhatsapp = async (row) => {
    setState((current) => ({ ...current, error: "" }));
    setWhatsapp((current) => ({ ...current, checkingGenerationId: row.generationId }));
    try {
      const response = await fetch("/api/sales-pf/contracts/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ generationId: row.generationId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const failure = new Error(body.message || "Não foi possível validar o contrato.");
        failure.details = Array.isArray(body.errors) ? body.errors : [];
        throw failure;
      }
      setWhatsapp({
        open: true, row, phone: "", sending: false, error: "", sent: false,
        successMessage: "", deliveryStatus: "", checkingGenerationId: "",
      });
    } catch (openError) {
      setWhatsapp((current) => ({ ...current, checkingGenerationId: "" }));
      setState((current) => ({ ...current, error: openError.details?.length ? [openError.message, ...openError.details] : openError.message }));
    }
  };

  const sendWhatsapp = async (event) => {
    event.preventDefault();
    if (!/^\d{10,11}$/.test(whatsapp.phone)) {
      setWhatsapp((current) => ({ ...current, error: "Informe um telefone com 10 ou 11 dígitos, usando somente números." }));
      return;
    }
    setWhatsapp((current) => ({ ...current, sending: true, error: "" }));
    try {
      const response = await fetch("/api/sales-pf/contracts/send-whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ generationId: whatsapp.row.generationId, phone: whatsapp.phone }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || "Não foi possível enviar o contrato.");
      setWhatsapp((current) => ({
        ...current, sending: false, sent: true,
        successMessage: body.message || "Envio processado.",
        deliveryStatus: body.deliveryStatus || "pending",
      }));
    } catch (sendError) {
      setWhatsapp((current) => ({ ...current, sending: false, error: sendError.message }));
    }
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
        const details = Array.isArray(body.errors)
          ? body.errors.filter(Boolean).join(" ")
          : "";
        throw new Error([
          body.message || "Não foi possível gerar o modelo assinado.",
          details,
        ].filter(Boolean).join(" "));
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
      params.set("includeSignatureStatus", "true");
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
    legacy_signature_test: "Contrato de homologação",
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
            Assine contratos, registre o documento e gere ou envie o PDF sem sair desta tela.
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
          <AlertCircle className="h-5 w-5 shrink-0" />
          {Array.isArray(state.error)
            ? <ul className="list-disc space-y-1 pl-5">{state.error.map((item) => <li key={item}>{item}</li>)}</ul>
            : state.error}
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
            <div><h2 className="font-display text-lg font-semibold">Contratos encontrados</h2><p className="text-sm text-muted-foreground">{state.total} resultado(s) · contratos assinados continuam visíveis</p></div>
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
                          {signature.documentStored && <p className="flex items-center gap-1.5 text-sm text-primary"><FileText className="h-4 w-4" />Documento armazenado</p>}
                        </div>
                        <div className="flex flex-wrap justify-start gap-2 xl:justify-end">
                          <button
                            type="button"
                            className="action-pill-primary h-10 px-4"
                            disabled={signed}
                            onClick={() => setSigning({ open: true, row, mode: "definitive" })}
                          >
                            <FileSignature className="h-4 w-4" />
                            {signed ? "Assinado" : "Assinar"}
                          </button>
                          <DisabledAction icon={RefreshCw} explanation="A regra de substituição ou criação de uma nova versão será definida na próxima etapa.">Refazer assinatura</DisabledAction>
                          <button
                            type="button"
                            className="action-pill-ghost h-10 px-4"
                            disabled={Boolean(signature.documentStored)}
                            onClick={() => setDocumentCapture({ open: true, row })}
                          >
                            <Camera className="h-4 w-4" />
                            {signature.documentStored ? "Documento salvo" : "Foto documento"}
                          </button>
                          {!signed || row.isLegacySignatureTest ? (
                            <DisabledAction icon={FileText} explanation={row.isLegacySignatureTest ? "O contrato sintético não possui um modelo de PDF." : "Assine o contrato antes de gerar o PDF nesta tela."}>Gerar PDF</DisabledAction>
                          ) : (
                            <button type="button" className="action-pill-primary action-pill-blue h-10 px-4" disabled={generatingId === row.generationId} onClick={() => generatePdf(row)}>
                              {generatingId === row.generationId ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                              {generatingId === row.generationId ? "Gerando..." : "Gerar PDF"}
                            </button>
                          )}
                          {!signed || !hasWhatsAppTemplate(row) ? (
                            <DisabledAction icon={Send} explanation={!signed ? "Assine o contrato antes de enviá-lo." : "Este produto ainda não possui um modelo de mensagem para WhatsApp."}>Enviar WhatsApp</DisabledAction>
                          ) : (
                            <button type="button" className="action-pill-primary h-10 px-4" disabled={whatsapp.checkingGenerationId === row.generationId} onClick={() => openWhatsapp(row)}>
                              {whatsapp.checkingGenerationId === row.generationId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                              {whatsapp.checkingGenerationId === row.generationId ? "Validando..." : "Enviar WhatsApp"}
                            </button>
                          )}
                          <button type="button" className="action-pill-ghost h-10 px-4" onClick={() => setSigning({ open: true, row, mode: "preview" })}>
                            <FileSignature className="h-4 w-4" />Captura teste
                          </button>
                          {row.isLegacySignatureTest ? (
                            <DisabledAction icon={Eye} explanation="O contrato sintético valida somente a gravação da assinatura e do registro legado.">Ver modelo</DisabledAction>
                          ) : (
                            <button type="button" className="action-pill-ghost h-10 px-4" disabled={Boolean(modelState.loadingId)} onClick={() => viewModel(row)}>
                              {modelState.loadingId === (row.generationId || row.id || row.label) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                              {modelState.loadingId === (row.generationId || row.id || row.label) ? "Gerando..." : "Ver modelo"}
                            </button>
                          )}
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
            <DialogTitle className="font-display text-2xl">{signing.mode === "definitive" ? "Assinar contrato" : "Capturar assinatura de teste"}</DialogTitle>
            <DialogDescription>{signing.row?.label || signing.row?.reference} · {signing.row?.name || "Titular não informado"}</DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-muted-foreground">
            {signing.mode === "definitive"
              ? "Ao salvar, a imagem será armazenada no servidor legado e um novo registro será criado para este contrato."
              : "Esta captura é temporária e compartilhada entre os modelos. Cada nova captura substitui a anterior."}
          </div>
          <SignatureCanvas
            key={`${signing.mode}-${signing.row?.generationId || signing.row?.id || "signature"}`}
            onCancel={() => setSigning((current) => ({ ...current, open: false }))}
            onSave={saveSignature}
            helperText={signing.mode === "definitive"
              ? "Confira a assinatura antes de salvar. O registro será permanente."
              : "Use esta captura para validar o posicionamento nos modelos."}
            saveLabel={signing.mode === "definitive" ? "Salvar assinatura" : "Salvar teste"}
          />
        </DialogContent>
      </Dialog>

      <DocumentCaptureDialog
        open={documentCapture.open}
        row={documentCapture.row}
        onOpenChange={(open) => setDocumentCapture((current) => ({ ...current, open }))}
        onSaved={markDocumentSaved}
      />

      <Dialog open={whatsapp.open} onOpenChange={(open) => {
        if (!whatsapp.sending) setWhatsapp((current) => ({ ...current, open }));
      }}>
        <DialogContent className="rounded-2xl border-border sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Enviar contrato pelo WhatsApp</DialogTitle>
            <DialogDescription>{whatsapp.row?.label} · {whatsapp.row?.name || "Titular não informado"}</DialogDescription>
          </DialogHeader>
          {whatsapp.sent ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <CheckCircle2 className="h-10 w-10 text-primary" />
              <div>
                <p className="font-semibold">{whatsapp.deliveryStatus === "delivered" ? "Contrato entregue" : "Envio processado"}</p>
                <p className="mt-1 text-sm text-muted-foreground">{whatsapp.successMessage}</p>
              </div>
            </div>
          ) : (
            <form onSubmit={sendWhatsapp} className="space-y-5">
              <div>
                <label className="mb-2 block text-sm font-semibold">WhatsApp do cliente</label>
                <div className="grid grid-cols-[64px_1fr] gap-2">
                  <div className="eloom-field flex items-center justify-center text-sm text-muted-foreground">+55</div>
                  <Input
                    className="eloom-field"
                    value={whatsapp.phone}
                    onChange={(event) => setWhatsapp((current) => ({
                      ...current, phone: event.target.value.replace(/\D/g, "").slice(0, 11), error: "",
                    }))}
                    placeholder="DDD e telefone, somente números"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    minLength={10}
                    maxLength={11}
                  />
                </div>
              </div>
              <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                Será enviado o PDF junto com a mensagem oficial de boas-vindas do {whatsapp.row?.product || "produto selecionado"}.
              </div>
              {whatsapp.error && <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{whatsapp.error}</div>}
              <DialogFooter className="gap-2 sm:space-x-0">
                <button type="button" className="action-pill-ghost" disabled={whatsapp.sending} onClick={() => setWhatsapp((current) => ({ ...current, open: false }))}>Fechar</button>
                <button type="submit" className="action-pill-primary" disabled={whatsapp.sending}>
                  {whatsapp.sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {whatsapp.sending ? "Enviando..." : "Enviar"}
                </button>
              </DialogFooter>
            </form>
          )}
          {whatsapp.sent && <DialogFooter><button type="button" className="action-pill-primary" onClick={() => setWhatsapp((current) => ({ ...current, open: false }))}>Fechar</button></DialogFooter>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
