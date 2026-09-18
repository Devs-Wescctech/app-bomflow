import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { Loader2, FileText, Search, AlertCircle, Send, CheckCircle2, Info } from "lucide-react";

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
    .replace(/(\d{4})(\d)/, "$1-$2");
};
const documentDigits = (value) => String(value || "").replace(/\D/g, "");
const isValidCpf = (value) => {
  const cpf = documentDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const digits = cpf.split("").map(Number);
  const calculate = (length) => {
    const sum = digits.slice(0, length)
      .reduce((total, digit, index) => total + digit * (length + 1 - index), 0);
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  return calculate(9) === digits[9] && calculate(10) === digits[10];
};
const isValidCnpj = (value) => {
  const cnpj = documentDigits(value);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const calculate = (length) => {
    const weights = length === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((total, weight, index) =>
      total + Number(cnpj[index]) * weight, 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  return calculate(12) === Number(cnpj[12])
    && calculate(13) === Number(cnpj[13]);
};
const hasWhatsAppTemplate = (row) => {
  const productKey = String(row?.productKey || row?.product_key || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  const productName = String(row?.product || "").trim().toLowerCase();
  return productKey !== "bom_corp" && productName !== "bom corp";
};
const BOM_CORP_WHATSAPP_UNAVAILABLE =
  "O Bom Corp ainda não possui um modelo de mensagem cadastrado. Você pode baixar o PDF e enviá-lo manualmente.";
const PAGE_SIZE = 20;
const contractFileName = (row) => {
  const product = String(row.product || "contrato")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
  const order = String(row.pedido || row.order || row.reference || row.label || "")
    .match(/\d+/g)?.join("") || "sem_numero";
  return `contrato_${product}_${order}.pdf`;
};

const preparePdfTab = (popup) => {
  popup.document.open();
  popup.document.write(`<!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Gerando contrato...</title>
        <link rel="icon" type="image/png" href="${window.location.origin}/logo-bomflow-icon.png" />
        <link rel="shortcut icon" type="image/png" href="${window.location.origin}/logo-bomflow-icon.png" />
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f3f5f7;
            color: #252931; font-family: "Plus Jakarta Sans", system-ui, sans-serif; }
          main { display: flex; flex-direction: column; align-items: center; gap: 16px; text-align: center; }
          img { width: 176px; height: auto; }
          .spinner { width: 34px; height: 34px; border: 3px solid #dbe4e3; border-top-color: #0f766e;
            border-radius: 50%; animation: spin .8s linear infinite; }
          strong { font-size: 16px; }
          p { margin: -8px 0 0; color: #737983; font-size: 13px; }
          @keyframes spin { to { transform: rotate(360deg); } }
        </style>
      </head>
      <body>
        <main>
          <img src="${window.location.origin}/logo-bomflow.png" alt="Bom Flow" />
          <span class="spinner" aria-hidden="true"></span>
          <strong>Preparando seu contrato</strong>
          <p>O PDF será exibido assim que estiver pronto.</p>
        </main>
      </body>
    </html>`);
  popup.document.close();
};

const showPdfInTab = (popup, pdfUrl, fileName) => {
  const html = `<!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${fileName}</title>
        <link rel="icon" type="image/svg+xml" href="${window.location.origin}/favicon.svg" />
        <link rel="shortcut icon" type="image/svg+xml" href="${window.location.origin}/favicon.svg" />
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; height: 100vh; overflow: hidden; background: #525659; }
          header { height: 64px; display: flex; align-items: center; justify-content: space-between;
            gap: 48px; padding: 0 28px; background: #263238; color: #fff;
            font-family: "Plus Jakarta Sans", system-ui, sans-serif; }
          .file-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis;
            white-space: nowrap; font-size: 14px; font-weight: 600; letter-spacing: .01em; }
          .download { flex: none; display: inline-flex; align-items: center; gap: 9px;
            min-height: 42px; padding: 0 20px; border: 1px solid transparent; border-radius: 999px;
            background: #0f766e; color: #fff; font-size: 14px; font-weight: 700;
            text-decoration: none; box-shadow: 0 6px 18px rgba(15, 118, 110, .38);
            transition: background 180ms ease, transform 180ms ease, box-shadow 180ms ease; }
          .download:hover { background: #0b5f59; transform: translateY(-1px);
            box-shadow: 0 8px 22px rgba(15, 118, 110, .48); }
          .download:focus-visible { outline: none; box-shadow: 0 0 0 4px rgba(45, 212, 191, .28); }
          iframe { display: block; width: 100%; height: calc(100vh - 64px); border: 0; }
        </style>
      </head>
      <body>
        <header>
          <span class="file-name">${fileName}</span>
          <a class="download" href="${pdfUrl}" download="${fileName}">
            <span aria-hidden="true">↓</span>
            Baixar PDF
          </a>
        </header>
        <iframe src="${pdfUrl}#toolbar=0" title="${fileName}"></iframe>
      </body>
    </html>`;
  const viewerUrl = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  popup.location.replace(viewerUrl);
};

export default function SalesContractPrinting() {
  const [document, setDocument] = useState("");
  const [reference, setReference] = useState("");
  const [state, setState] = useState({
    loading: false, error: "", results: [], total: 0, page: 1, pageSize: PAGE_SIZE,
  });
  const [whatsapp, setWhatsapp] = useState({
    open: false, row: null, phone: "", sending: false, error: "", sent: false,
    successMessage: "", deliveryStatus: "", checkingGenerationId: "",
  });
  const searchPage = async (page = 1) => {
    setState((current) => ({ ...current, loading: true, error: "", results: [] }));
    try {
      const params = new URLSearchParams();
      if (document) params.set("document", document);
      if (reference) params.set("reference", reference);
      params.set("page", String(page));
      params.set("pageSize", String(PAGE_SIZE));
      const response = await fetch(`/api/sales-pf/contracts/search?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      const body = await response.json().catch(() => ({
        message: `Serviço de impressão indisponível (HTTP ${response.status}). Atualize a página e tente novamente.`,
      }));
      if (!response.ok) throw new Error(body.message || "Não foi possível consultar o ERP.");
      setState({
        loading: false,
        error: "",
        results: body.rows || [],
        total: body.total || 0,
        page: body.page || page,
        pageSize: body.pageSize || PAGE_SIZE,
      });
    } catch (error) {
      setState({
        loading: false, error: error.message, results: [], total: 0, page, pageSize: PAGE_SIZE,
      });
    }
  };
  const search = (event) => {
    event.preventDefault();
    if (document && !isValidCpf(document) && !isValidCnpj(document)) {
      setState((current) => ({
        ...current,
        loading: false,
        error: "Informe um CPF ou CNPJ válido.",
        results: [],
        total: 0,
      }));
      return;
    }
    searchPage(1);
  };
  const totalPages = Math.max(1, Math.ceil(state.total / state.pageSize));
  const [generatingId, setGeneratingId] = useState("");
  const generate = async (row) => {
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
      const file = new File([blob], fileName, { type: "application/pdf" });
      const pdfUrl = URL.createObjectURL(file);
      showPdfInTab(popup, pdfUrl, fileName);
    } catch (error) {
      popup.close();
      setState((current) => ({ ...current, error: [error.message, ...(error.details || [])] }));
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
    } catch (error) {
      setWhatsapp((current) => ({ ...current, checkingGenerationId: "" }));
      setState((current) => ({
        ...current,
        error: error.details?.length ? [error.message, ...error.details] : error.message,
      }));
    }
  };
  const sendWhatsapp = async (event) => {
    event.preventDefault();
    const phone = whatsapp.phone;
    if (!/^\d{10,11}$/.test(phone)) {
      setWhatsapp((current) => ({
        ...current,
        error: "Informe um telefone com 10 ou 11 dígitos, usando somente números.",
      }));
      return;
    }
    setWhatsapp((current) => ({ ...current, sending: true, error: "" }));
    try {
      const response = await fetch("/api/sales-pf/contracts/send-whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({
          generationId: whatsapp.row.generationId,
          phone,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const failure = new Error(body.message || "Não foi possível enviar o contrato.");
        failure.details = Array.isArray(body.errors) ? body.errors : [];
        throw failure;
      }
      setWhatsapp((current) => ({
        ...current,
        sending: false,
        sent: true,
        successMessage: body.message || "Envio processado.",
        deliveryStatus: body.deliveryStatus || "pending",
      }));
    } catch (error) {
      setWhatsapp((current) => ({
        ...current,
        sending: false,
        error: error.details?.length ? [error.message, ...error.details] : error.message,
      }));
    }
  };
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div><h1 className="text-2xl font-semibold">Impressão de Contratos - Recepção</h1>
        <p className="text-muted-foreground">Consulte contratos Bom Auto, Bom Corp, Essencial e Bom Pet pelo documento ou pelo pedido/orçamento.</p></div>
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><Search className="w-5 h-5" />Buscar titular</CardTitle></CardHeader>
        <CardContent><form onSubmit={search} className="space-y-4 max-w-xl">
          <div className="space-y-2">
            <label htmlFor="contract-document" className="block text-sm font-semibold">Documento</label>
            <Input id="contract-document" className="eloom-field" value={document} onChange={(e) => setDocument(documentMask(e.target.value))} placeholder="Digite o CPF ou CNPJ" inputMode="numeric" />
            <p className="text-xs text-muted-foreground">Informe o CPF do titular ou o CNPJ da empresa.</p>
          </div>
          <div className="space-y-2">
            <label htmlFor="contract-reference" className="block text-sm font-semibold">Pedido/orçamento/contrato</label>
            <Input id="contract-reference" className="eloom-field" value={reference} onChange={(e) => setReference(e.target.value.replace(/\D/g, "").slice(0, 18))} placeholder="Número do pedido, orçamento ou contrato" inputMode="numeric" />
          </div>
          <button type="submit" className="action-pill-primary" disabled={state.loading}>{state.loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Pesquisar"}</button>
        </form></CardContent>
      </Card>
      {state.error && <div className="p-4 rounded-md bg-destructive/10 text-destructive flex gap-2"><AlertCircle className="w-5 h-5 shrink-0" /><div>{Array.isArray(state.error) ? <ul className="list-disc pl-5 space-y-1">{state.error.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul> : state.error}</div></div>}
      {!state.loading && !state.error && state.results.length === 0
        && (documentDigits(document).length >= 11 || reference.length > 0)
        && <p className="text-muted-foreground">Nenhum pedido ou contrato disponível para impressão foi encontrado.</p>}
      {state.results.length > 0 && <Card><CardHeader><CardTitle>{state.total} resultado(s)</CardTitle></CardHeader><CardContent className="space-y-3">
        {state.results.map((row) => <div key={row.generationId} className="border rounded-lg p-4 flex items-center justify-between gap-4">
           <div className="space-y-1.5">
             <div className="flex items-center gap-2">
               <div className="font-medium">{row.label}</div>
               <span className="inline-flex rounded-md border-[1.5px] border-primary px-2 py-0.5 text-[11px] font-semibold text-primary">
                  {row.product}
               </span>
             </div>
             <div className="text-sm text-muted-foreground">{row.name || "Titular não informado"} · {row.date ? new Date(row.date).toLocaleDateString("pt-BR") : "Data não informada"}</div>
           </div>
           <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  className={row.pdfAvailable === false
                    ? "action-pill-ghost h-10 cursor-not-allowed border-border bg-muted px-4 text-muted-foreground opacity-100 shadow-none"
                    : "action-pill-primary h-10 px-4"}
                  disabled={row.pdfAvailable === false || generatingId === row.generationId}
                  onClick={() => generate(row)}
                >
                 <span className="action-pill-shine" aria-hidden="true" />
                  {generatingId === row.generationId
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <FileText className="action-pill-icon h-4 w-4" />}
                  {generatingId === row.generationId ? "Gerando PDF..." : "Gerar PDF"}
              </button>
                 {hasWhatsAppTemplate(row) ? (
                  <button
                    type="button"
                     className="action-pill-primary h-10 px-4"
                     disabled={whatsapp.checkingGenerationId === row.generationId}
                     aria-label="Enviar contrato pelo WhatsApp"
                    onClick={() => openWhatsapp(row)}
                  >
                    {whatsapp.checkingGenerationId === row.generationId
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <Send className="h-4 w-4" />}
                    {whatsapp.checkingGenerationId === row.generationId ? "Validando..." : "Enviar WhatsApp"}
                  </button>
                 ) : (
                   <TooltipProvider delayDuration={150}>
                     <Tooltip>
                       <TooltipTrigger asChild>
                         <span
                           className="inline-flex rounded-full focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15"
                           tabIndex={0}
                           aria-label={`Enviar WhatsApp indisponível. ${BOM_CORP_WHATSAPP_UNAVAILABLE}`}
                         >
                           <button
                             type="button"
                             className="action-pill-primary h-10 cursor-not-allowed px-4 !bg-muted !text-muted-foreground !opacity-100 !shadow-none hover:!translate-y-0"
                             disabled
                           >
                             <Send className="h-4 w-4" />
                             Enviar WhatsApp
                           </button>
                         </span>
                       </TooltipTrigger>
                       <TooltipContent
                         side="top"
                         sideOffset={8}
                         className="max-w-[300px] rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-lg"
                       >
                         <div className="flex items-start gap-2.5">
                           <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                           <div className="space-y-1">
                             <p className="font-semibold">WhatsApp ainda não disponível</p>
                             <p className="leading-relaxed text-muted-foreground">
                               {BOM_CORP_WHATSAPP_UNAVAILABLE}
                             </p>
                           </div>
                         </div>
                       </TooltipContent>
                     </Tooltip>
                   </TooltipProvider>
                 )}
           </div>
        </div>)}
         {totalPages > 1 && (
           <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
             <span className="text-sm text-muted-foreground">
               Página {state.page} de {totalPages}
             </span>
             <div className="flex items-center gap-2">
               <button
                 type="button"
                 className="action-pill-ghost h-10 px-4"
                 disabled={state.loading || state.page <= 1}
                 onClick={() => searchPage(state.page - 1)}
               >
                 Anterior
               </button>
               <button
                 type="button"
                 className="action-pill-ghost h-10 px-4"
                 disabled={state.loading || state.page >= totalPages}
                 onClick={() => searchPage(state.page + 1)}
               >
                 Próxima
               </button>
             </div>
           </div>
         )}
       </CardContent></Card>}
      <Dialog
        open={whatsapp.open}
        onOpenChange={(open) => {
          if (!whatsapp.sending) setWhatsapp((current) => ({ ...current, open }));
        }}
      >
        <DialogContent className="rounded-2xl border-border sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Enviar contrato pelo WhatsApp</DialogTitle>
            <DialogDescription>
              {whatsapp.row?.label} · {whatsapp.row?.name || "Titular não informado"}
            </DialogDescription>
          </DialogHeader>
          {whatsapp.sent ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <CheckCircle2 className="h-10 w-10 text-primary" />
              <div>
                <p className="font-semibold">
                  {whatsapp.deliveryStatus === "delivered" ? "Contrato entregue" : "Envio processado"}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {whatsapp.successMessage}
                </p>
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
                    aria-label="DDD e telefone"
                  />
                </div>
              </div>
              <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                Será enviado o PDF junto com a mensagem oficial de boas-vindas do{" "}
                {whatsapp.row?.product || "produto selecionado"},
                personalizada com o nome do titular.
              </div>
              {whatsapp.error && (
                <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  {Array.isArray(whatsapp.error) ? (
                    <ul className="list-disc space-y-1 pl-5">
                      {whatsapp.error.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
                    </ul>
                  ) : whatsapp.error}
                </div>
              )}
              <DialogFooter className="gap-2 sm:space-x-0">
                <button
                  type="button"
                  className="action-pill-ghost"
                  disabled={whatsapp.sending}
                  onClick={() => setWhatsapp((current) => ({ ...current, open: false }))}
                >
                  Fechar
                </button>
                <button
                  type="submit"
                  className="action-pill-primary"
                  disabled={whatsapp.sending}
                >
                  {whatsapp.sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {whatsapp.sending ? "Enviando..." : "Enviar"}
                </button>
              </DialogFooter>
            </form>
          )}
          {whatsapp.sent && (
            <DialogFooter>
              <button
                type="button"
                className="action-pill-primary"
                onClick={() => setWhatsapp((current) => ({ ...current, open: false }))}
              >
                Fechar
              </button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}