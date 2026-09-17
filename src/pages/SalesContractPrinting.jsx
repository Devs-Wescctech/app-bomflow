import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, FileText, Search, AlertCircle, Send, CheckCircle2 } from "lucide-react";

const token = () => localStorage.getItem("accessToken") || localStorage.getItem("auth_token");
const cpfMask = (value) => value.replace(/\D/g, "").slice(0, 11)
  .replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
  .replace(/\.(\d{3})(\d)/, ".$1-$2");
const PAGE_SIZE = 20;

export default function SalesContractPrinting() {
  const [cpf, setCpf] = useState("");
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
      if (cpf) params.set("cpf", cpf);
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
    searchPage(1);
  };
  const totalPages = Math.max(1, Math.ceil(state.total / state.pageSize));
  const generate = async (generationId) => {
    const popup = window.open("", "_blank");
    if (!popup) {
      setState((current) => ({ ...current, error: "Permita pop-ups para visualizar o PDF." }));
      return;
    }
    popup.document.title = "Gerando contrato...";
    try {
      const response = await fetch("/api/sales-pf/contracts/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ generationId }),
      });
        if (!response.ok) {
        const body = await response.json().catch(() => ({}));
          const failure = new Error(body.message || "Falha ao gerar contrato.");
          failure.details = Array.isArray(body.errors) ? body.errors : [];
          throw failure;
      }
      const blob = await response.blob();
      popup.location.href = URL.createObjectURL(blob);
    } catch (error) {
      popup.close();
      setState((current) => ({ ...current, error: [error.message, ...(error.details || [])] }));
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
        <p className="text-muted-foreground">Consulte contratos Bom Auto, Essencial e Bom Pet pelo CPF ou pelo pedido/orçamento.</p></div>
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><Search className="w-5 h-5" />Buscar titular</CardTitle></CardHeader>
        <CardContent><form onSubmit={search} className="space-y-4 max-w-xl">
          <div className="space-y-2">
            <label htmlFor="contract-document" className="block text-sm font-semibold">Documento</label>
            <Input id="contract-document" className="eloom-field" value={cpf} onChange={(e) => setCpf(cpfMask(e.target.value))} placeholder="CPF do titular" inputMode="numeric" />
          </div>
          <div className="space-y-2">
            <label htmlFor="contract-reference" className="block text-sm font-semibold">Pedido/orçamento</label>
            <Input id="contract-reference" className="eloom-field" value={reference} onChange={(e) => setReference(e.target.value.replace(/\D/g, "").slice(0, 18))} placeholder="Número do pedido ou orçamento" inputMode="numeric" />
          </div>
          <button type="submit" className="action-pill-primary" disabled={state.loading}>{state.loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Pesquisar"}</button>
        </form></CardContent>
      </Card>
      {state.error && <div className="p-4 rounded-md bg-destructive/10 text-destructive flex gap-2"><AlertCircle className="w-5 h-5 shrink-0" /><div>{Array.isArray(state.error) ? <ul className="list-disc pl-5 space-y-1">{state.error.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul> : state.error}</div></div>}
      {!state.loading && !state.error && state.results.length === 0
        && (cpf.length >= 11 || reference.length > 0)
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
               <button type="button" className="action-pill-primary h-10 px-4" onClick={() => generate(row.generationId)}>
                 <span className="action-pill-shine" aria-hidden="true" />
                 <FileText className="action-pill-icon h-4 w-4" />Gerar PDF
              </button>
               <button
                 type="button"
                 className="action-pill-primary h-10 px-4"
                  disabled={whatsapp.checkingGenerationId === row.generationId}
                 onClick={() => openWhatsapp(row)}
               >
                 {whatsapp.checkingGenerationId === row.generationId
                   ? <Loader2 className="h-4 w-4 animate-spin" />
                   : <Send className="h-4 w-4" />}
                 {whatsapp.checkingGenerationId === row.generationId ? "Validando..." : "Enviar WhatsApp"}
              </button>
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