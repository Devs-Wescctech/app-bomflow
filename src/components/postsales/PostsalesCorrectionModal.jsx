import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ClipboardList, CreditCard, Loader2, MapPin, Package, PencilLine, Plus, Save, ShieldCheck, Trash2, Users } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { API_BASE, authHeaders } from "@/components/postsales/shared";
import { extractApiError } from "@/utils/apiError";
import { formatBrazilPhone, normalizePhone } from "@/utils/phone";

const ADDRESS_FIELDS = [["cep", "CEP"], ["logradouro", "Logradouro"], ["numero", "Número"], ["complemento", "Complemento"], ["bairro", "Bairro"]];
const EMPTY_ADDRESS = { cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "" };
const ERP_REFRESH_INTERVAL_MS = 60 * 60 * 1000;
const arrayFrom = (value) => Array.isArray(value) ? value : (value?.items || value?.data || value?.produtos || value?.planos || []);
const productId = (product) => product?.produto_id ?? product?.id;
const planId = (plan) => plan?.id ?? plan?.plano_pagamento_id;
const productLabel = (product) => product?.descricao || product?.nome || product?.titulo_contrato || `Produto ${productId(product)}`;
const planLabel = (plan) => plan?.plano_pagamento || plan?.descricao || plan?.nome || plan?.titulo || `Plano ${planId(plan)}`;
const productPrice = (product) => product?.preco_informado ?? product?.preco ?? product?.valor ?? product?.price;
const personRef = (person) => person.id ?? person.client_key;
const newKey = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const blankPerson = () => ({ client_key: newKey("person"), nome: "", cpf: "", data_nascimento: "", sexo: "", telefone: "", parentesco: "", is_titular: false });
const blankItem = () => ({ client_key: newKey("item"), produto_id: "", descricao: "", preco: "", quantidade: 0, valor_total: 0, pessoa_ids: [] });
const currency = (value) => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export function formatCpfInput(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 11);
  return digits
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

function commercialSnapshot(editor) {
  return {
    total: (editor?.itens || []).reduce((sum, entry) => sum + Number(entry.preco || 0) * (entry.pessoa_ids || entry.pessoa_refs || []).length, 0),
    plano: String(editor?.plano_pagamento_id ?? ""),
    parcelas: Number(editor?.numero_parcelas || 0),
    catalogo: `${editor?.catalog_contract_id || ""}|${editor?.catalog_title || ""}`,
    itens: (editor?.itens || []).map((entry) => ({
      produto: String(entry.produto_id ?? ""),
      preco: Number(entry.preco || 0),
      pessoas: [...(entry.pessoa_ids || entry.pessoa_refs || [])].map(String).sort(),
    })),
  };
}

export function buildFinancialImpact(beforeEditor, afterEditor) {
  const before = commercialSnapshot(beforeEditor);
  const after = commercialSnapshot(afterEditor);
  return JSON.stringify(before) === JSON.stringify(after) ? null : { before, after };
}

function catalogProducts(catalog, items) {
  const unique = new Map();
  [...catalog, ...items.map((item) => ({ produto_id: item.produto_id, descricao: item.descricao, preco: item.preco }))]
    .filter((product) => productId(product) !== undefined && productId(product) !== null)
    .forEach((product) => {
      const key = `${productId(product)}|${productLabel(product)}|${productPrice(product) ?? ""}`;
      if (!unique.has(key)) unique.set(key, product);
    });
  return [...unique.values()];
}

function EditorCard({ icon: Icon, title, hint, children }) {
  return (
    <section className="eloom-editor-card">
      <header className="eloom-editor-card__head">
        <Icon className="eloom-editor-card__icon-pill" />
        <div><h3 className="eloom-editor-card__title">{title}</h3><p className="eloom-editor-card__hint">{hint}</p></div>
      </header>
      <div className="eloom-editor-card__body">{children}</div>
    </section>
  );
}

function Field({ label, children, className = "" }) {
  return <label className={`block ${className}`}><span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{label}</span>{children}</label>;
}

function CityField({ value, selectedCity, disabled, onChange, onSelect }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cities, setCities] = useState([]);
  const timer = useRef();
  const request = useRef(0);
  const search = (next) => {
    onChange(next);
    setOpen(true);
    window.clearTimeout(timer.current);
    if (next.trim().length < 2) return setCities([]);
    const sequence = ++request.current;
    timer.current = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`${API_BASE}/presales-ajustes/cidades?search=${encodeURIComponent(next)}`, { headers: authHeaders() });
        const data = response.ok ? await response.json() : {};
        if (sequence === request.current) setCities(arrayFrom(data));
      } finally { if (sequence === request.current) setLoading(false); }
    }, 250);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <div className="relative">
      <input className="eloom-field w-full" value={value || ""} disabled={disabled} placeholder="Digite ao menos 2 letras" onFocus={() => setOpen(true)} onBlur={() => window.setTimeout(() => setOpen(false), 120)} onChange={(event) => search(event.target.value)} />
      {open && <div className="absolute z-30 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-border bg-background p-1 shadow-lg">
        {loading ? <p className="px-3 py-2 text-xs text-muted-foreground">Consultando cidades do ERP…</p>
          : (value || "").trim().length < 2 ? <p className="px-3 py-2 text-xs text-muted-foreground">Digite ao menos 2 letras.</p>
            : cities.length ? cities.map((city, index) => <button key={city.id || `${city.cidade}-${index}`} type="button" className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-muted" onMouseDown={(event) => event.preventDefault()} onClick={() => { onSelect(city.cidade); setOpen(false); }}>{city.cidade}</button>)
              : <p className="px-3 py-2 text-xs text-muted-foreground">Nenhuma cidade encontrada no ERP.</p>}
      </div>}
      {value && selectedCity !== value && <p className="mt-1 text-xs text-destructive">Selecione uma cidade da lista do ERP.</p>}
    </div>
  );
}

export default function PostsalesCorrectionModal({
  item,
  onClose,
  onSaved,
  correctionPath = `${API_BASE}/postsales/${item.id}/correcao`,
}) {
  const { toast } = useToast();
  const [context, setContext] = useState(null);
  const [editor, setEditor] = useState(null);
  const [products, setProducts] = useState([]);
  const [catalogChoices, setCatalogChoices] = useState([]);
  const [plans, setPlans] = useState([]);
  const [selectedCity, setSelectedCity] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [originalEditor, setOriginalEditor] = useState(null);
  const [financialImpact, setFinancialImpact] = useState(null);
  const onCloseRef = useRef(onClose);
  const toastRef = useRef(toast);

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => { toastRef.current = toast; }, [toast]);

  const hydrate = (data) => {
    const next = data.editor ? {
      ...data.editor,
      // Some endpoints place the optimistic-lock value beside editor; always retain it in the PATCH contract.
      revision: data.editor.revision ?? data.revision,
      expected_revision: data.editor.expected_revision ?? data.expected_revision ?? data.editor.revision ?? data.revision,
      endereco: { ...EMPTY_ADDRESS, ...data.editor.endereco },
      pessoas: data.editor.pessoas || [],
      itens: data.editor.itens || [],
      catalog_contract_id: data.editor.catalog_contract_id ?? data.catalog_binding?.contractId ?? null,
      catalog_title: data.editor.catalog_title ?? data.catalog_binding?.title ?? "",
    } : null;
    setContext(data);
    setEditor(next);
    setOriginalEditor(next ? structuredClone(next) : null);
    setFinancialImpact(null);
    setSelectedCity(next?.endereco?.cidade || "");
    const choices = Array.isArray(data.catalog_choices) ? data.catalog_choices : [];
    setCatalogChoices(choices);
    const binding = data.catalog_binding;
    const selectedChoice = choices.find((choice) =>
      String(choice.contract_id) === String(binding?.contractId)
      && choice.title === binding?.title
    );
    setProducts(selectedChoice?.products || arrayFrom(data.catalog_products));
  };
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [correction, planResponse] = await Promise.all([
        fetch(correctionPath, { headers: authHeaders() }),
        fetch(`${API_BASE}/erp/planos-pagamento`, { headers: authHeaders() }),
      ]);
      if (!correction.ok) throw new Error(await extractApiError(correction, "Não foi possível carregar o ajuste."));
      const correctionData = await correction.json().catch(() => ({}));
      hydrate(correctionData);
      setPlans(planResponse.ok ? arrayFrom(await planResponse.json().catch(() => [])) : []);
    } catch (error) {
      toastRef.current({ title: "Erro", description: error.message, variant: "destructive" });
      onCloseRef.current();
    }
    finally { setLoading(false); }
  }, [correctionPath]);
  useEffect(() => {
    load();
    const refreshTimer = window.setInterval(load, ERP_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(refreshTimer);
  }, [load]);

  const patch = (key, value) => setEditor((current) => ({ ...current, [key]: value }));
  const patchAddress = (key, value) => patch("endereco", { ...editor.endereco, [key]: value });
  const patchPerson = (index, key, value) => patch("pessoas", editor.pessoas.map((person, i) => i === index ? { ...person, [key]: value } : person));
  const patchItem = (index, key, value) => patch("itens", editor.itens.map((entry, i) => i === index ? { ...entry, [key]: value } : entry));
  const removePerson = (index) => {
    const ref = personRef(editor.pessoas[index]);
    setEditor((current) => ({
      ...current,
      pessoas: current.pessoas.filter((_, i) => i !== index),
      itens: current.itens.map((entry) => ({
        ...entry,
        pessoa_ids: entry.pessoa_ids.filter((id) => String(id) !== String(ref)),
      })),
    }));
  };
  const availableProducts = editor ? catalogProducts(products, editor.itens) : [];
  const total = (editor?.itens || []).reduce((sum, entry) => sum + Number(entry.preco || 0) * entry.pessoa_ids.length, 0);
  const updateProduct = (index, value) => {
    const selected = availableProducts.find((product) => String(productId(product)) === String(value));
    setEditor((current) => ({
      ...current,
      itens: current.itens.map((entry, itemIndex) => itemIndex === index ? {
        ...entry,
        produto_id: value,
        descricao: selected ? productLabel(selected) : "",
        ...(selected && productPrice(selected) !== undefined ? { preco: productPrice(selected) } : {}),
      } : entry),
    }));
  };
  const updateCatalog = (itemIndex, value) => {
    const selected = catalogChoices.find((choice) => `${choice.contract_id}|${choice.title}` === value);
    if (!selected) return;
    setProducts(selected.products || []);
    setEditor((current) => ({
      ...current,
      catalog_contract_id: selected.contract_id,
      catalog_title: selected.title,
      itens: current.itens.map((entry, index) => {
        if (index !== itemIndex || !entry.produto_id) return entry;
        const remainsAvailable = (selected.products || []).some((product) =>
          String(productId(product)) === String(entry.produto_id)
        );
        return remainsAvailable ? entry : {
          ...entry,
          produto_id: "",
          descricao: "",
          preco: "",
        };
      }),
    }));
    setFinancialImpact(null);
  };
  const validate = () => {
    if (!editor.pessoas.length || editor.pessoas.some((person) => !person.nome?.trim())) return "Informe o nome de todas as pessoas.";
    if (editor.pessoas.filter((person) => person.is_titular).length !== 1) return "O pedido deve ter exatamente um titular.";
    const titular = editor.pessoas.find((person) => person.is_titular);
    if (String(titular?.cpf || "").replace(/\D/g, "").length !== 11) return "Informe um CPF com 11 dígitos para o titular.";
    if (editor.pessoas.some((person) => {
      const cpf = String(person.cpf || "").replace(/\D/g, "");
      return !person.is_titular && cpf.length > 0 && cpf.length !== 11;
    })) return "O CPF dos demais participantes deve ter 11 dígitos ou ficar em branco.";
    if (!editor.itens.length) return "Inclua ao menos um produto no pedido.";
    if (editor.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editor.email)) return "Informe um e-mail válido.";
    const address = editor.endereco;
    if (!/^\d{8}$/.test(String(address.cep || "").replace(/\D/g, ""))) return "Informe um CEP com 8 dígitos.";
    if (!address.logradouro?.trim() || !address.numero?.trim() || !address.bairro?.trim()) return "Preencha logradouro, número e bairro.";
    if (!address.cidade?.trim() || selectedCity !== address.cidade) return "Selecione uma cidade válida na lista do ERP.";
    if (!editor.plano_pagamento_id) return "Selecione o plano de pagamento.";
    if (!Number.isInteger(Number(editor.numero_parcelas)) || Number(editor.numero_parcelas) < 1) return "Informe um número de parcelas positivo.";
    return editor.itens.some((entry) => !entry.produto_id || entry.preco === "" || Number(entry.preco) < 0 || !entry.pessoa_ids.length) ? "Revise produto, preço e pessoas atendidas de cada item." : null;
  };
  const save = async (confirmed = false) => {
    const error = validate(); if (error) return toast({ title: "Revise o pedido", description: error, variant: "destructive" });
    const impact = buildFinancialImpact(originalEditor, editor);
    if (impact && !confirmed) {
      setFinancialImpact(impact);
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...editor,
        // Keep both possible optimistic-concurrency fields exactly as supplied by GET.
        revision: editor.revision,
        expected_revision: editor.expected_revision,
        endereco: { ...editor.endereco, cep: String(editor.endereco.cep || "").replace(/\D/g, "") },
        numero_parcelas: Number(editor.numero_parcelas),
        pessoas: editor.pessoas.map(({ client_key, ...person }) => {
          const cleaned = { ...person, cpf: String(person.cpf || "").replace(/\D/g, ""), telefone: normalizePhone(person.telefone) };
          return person.id ? cleaned : { ...cleaned, client_key };
        }),
        itens: editor.itens.map(({ pessoa_ids, ...entry }) => ({ ...entry, quantidade: pessoa_ids.length, valor_total: Number(entry.preco) * pessoa_ids.length, pessoa_refs: pessoa_ids })),
      };
      const response = await fetch(correctionPath, { method: "PATCH", headers: authHeaders(), body: JSON.stringify({ editor: payload }) });
      if (response.status === 409) {
        toast({ title: "Pedido atualizado por outra pessoa", description: "Os dados mais recentes foram carregados. Revise as alterações antes de salvar.", variant: "destructive" });
        await load();
        return;
      }
      if (!response.ok) throw new Error(await extractApiError(response, "Não foi possível atualizar o orçamento."));
      const data = await response.json().catch(() => ({})); if (data.editor) hydrate(data);
      toast({ title: "Orçamento atualizado", description: "As alterações foram gravadas no pedido ERP." }); await onSaved?.();
    } catch (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); } finally { setSaving(false); }
  };

  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="flex max-h-[96vh] max-w-6xl flex-col overflow-hidden rounded-2xl border-slate-200 bg-slate-50 p-0 shadow-2xl dark:border-gray-800 dark:bg-gray-950">
    <DialogHeader className="shrink-0 border-b border-slate-200 bg-white px-5 py-5 pr-12 dark:border-gray-800 dark:bg-gray-900 sm:px-7">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-teal-700/10 dark:bg-teal-950/40 dark:text-teal-300">
          <PencilLine className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-teal-700 dark:text-teal-300">Edição do pedido ERP</p>
          <DialogTitle className="font-display text-xl tracking-tight">Pedido Nº {item.erp_numero || item.erp_pedido_id}</DialogTitle>
          <DialogDescription className="mt-1">Revise e altere os dados do orçamento existente. As mudanças serão salvas neste pedido.</DialogDescription>
        </div>
      </div>
    </DialogHeader>
    <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-7">
      {loading ? <div className="flex justify-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Consultando pedido ERP…</div> : <div className="space-y-5">
        <section className="flex items-start gap-3 rounded-2xl border border-teal-200 bg-teal-50/70 px-4 py-3.5 text-teal-950 dark:border-teal-900/70 dark:bg-teal-950/25 dark:text-teal-100">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-teal-700 dark:text-teal-300" />
          <div>
            <p className="text-sm font-semibold">Campos editáveis</p>
            <p className="mt-0.5 text-xs leading-relaxed text-teal-800/80 dark:text-teal-200/80">Você pode editar, adicionar ou excluir dependentes e produtos, além de refazer os vínculos entre eles. Confira o total antes de salvar.</p>
          </div>
        </section>
        <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900/60 dark:bg-amber-950/20"><div className="flex gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" /><div><p className="font-display text-sm font-semibold">{context?.motivo_nome || item.motivo_devolucao_nome || "Ajuste solicitado"}</p><p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{context?.observacao || item.devolucao_obs}</p></div></div></section>
        {context?.catalog_status && context.catalog_status !== "available" && !editor?.catalog_title && <section className="rounded-2xl border border-amber-300 bg-amber-50/60 p-4 dark:border-amber-900/60 dark:bg-amber-950/20"><div className="flex gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" /><div><p className="text-sm font-semibold">Selecione o título do contrato</p><p className="mt-1 text-sm text-muted-foreground">{context.catalog_message}</p></div></div></section>}
        {financialImpact && <section className="rounded-2xl border-2 border-amber-400 bg-amber-50 p-4 dark:bg-amber-950/30">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="w-full">
              <p className="font-semibold">Confirme o impacto financeiro e os vínculos</p>
              <p className="mt-1 text-sm text-muted-foreground">Revise as condições anteriores e novas antes de gravar no ERP.</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {[["Antes", financialImpact.before], ["Depois", financialImpact.after]].map(([label, snapshot]) => <div key={label} className="rounded-xl border bg-white p-3 dark:bg-gray-900"><b className="text-xs uppercase text-muted-foreground">{label}</b><p className="mt-1 text-sm">Total: {currency(snapshot.total)}</p><p className="text-sm">Plano: {snapshot.plano || "não informado"} · {snapshot.parcelas || 0} parcela(s)</p><p className="text-sm">{snapshot.itens.length} produto(s) e {snapshot.itens.reduce((count, entry) => count + entry.pessoas.length, 0)} vínculo(s)</p></div>)}
              </div>
              <div className="mt-3 flex gap-2"><button type="button" className="action-pill-ghost" onClick={() => setFinancialImpact(null)}>Voltar e revisar</button><button type="button" className="action-pill-primary" onClick={() => save(true)}>Confirmar e salvar</button></div>
            </div>
          </div>
        </section>}
        {editor && !financialImpact && <OrderEditor editor={editor} selectedCity={selectedCity} total={total} products={availableProducts} catalogChoices={catalogChoices} plans={plans} patch={patch} patchAddress={patchAddress} patchPerson={patchPerson} patchItem={patchItem} removePerson={removePerson} updateProduct={updateProduct} updateCatalog={updateCatalog} onCityChange={(city) => { patchAddress("cidade", city); setSelectedCity(""); }} onCitySelect={(city) => { patchAddress("cidade", city); setSelectedCity(city); }} />}
      </div>}
    </div>
    <DialogFooter className="shrink-0 border-t border-slate-200 bg-white px-5 py-4 dark:border-gray-800 dark:bg-gray-900 sm:px-7"><button type="button" onClick={onClose} className="action-pill-ghost">Cancelar</button>{editor && !financialImpact && <button type="button" onClick={() => save(false)} disabled={saving || loading || !["M", "I"].includes(String(editor.situacao || "").toUpperCase())} className="action-pill-primary h-12 px-6 text-sm shadow-lg shadow-teal-700/30"><Save className="action-pill-icon h-4 w-4" />{saving ? "Salvando…" : `Salvar alterações · ${total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`}</button>}</DialogFooter>
  </DialogContent></Dialog>;
}

function OrderEditor({ editor, selectedCity, total, products, catalogChoices, plans, patch, patchAddress, patchPerson, patchItem, removePerson, updateProduct, updateCatalog, onCityChange, onCitySelect }) {
  const titularIndex = editor.pessoas.findIndex((person) => person.is_titular);
  return <div className="space-y-5">
    <EditorCard icon={ClipboardList} title="Dados gerais do pedido" hint={`Pedido ERP ${editor.erp_pedido_id || "existente"}`}><div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground"><span className="h-2 w-2 rounded-full bg-muted-foreground" /><span>Situação</span><span className="rounded-md border border-border px-2 py-0.5 font-medium text-foreground">{editor.situacao || "não informada"}</span>{!["M", "I"].includes(String(editor.situacao || "").toUpperCase()) && <span>Somente situações M ou I permitem salvar.</span>}</div><div className="grid gap-3 sm:grid-cols-2"><Field label="E-mail"><input className="eloom-field w-full" type="email" value={editor.email || ""} onChange={(e) => patch("email", e.target.value)} /></Field><Field label="Telefone do titular"><input className="eloom-field w-full" value={titularIndex >= 0 ? formatBrazilPhone(editor.pessoas[titularIndex].telefone || "") : ""} onChange={(e) => titularIndex >= 0 && patchPerson(titularIndex, "telefone", formatBrazilPhone(e.target.value))} /></Field></div></EditorCard>
    <EditorCard icon={MapPin} title="Endereço" hint="A cidade deve ser selecionada no catálogo ERP."><div className="grid gap-3 sm:grid-cols-2">{ADDRESS_FIELDS.map(([key, label]) => <Field key={key} label={label} className={key === "logradouro" ? "sm:col-span-2" : ""}><input className="eloom-field w-full" value={editor.endereco[key] || ""} onChange={(e) => patchAddress(key, e.target.value)} /></Field>)}<Field label="Cidade - UF" className="sm:col-span-2"><CityField value={editor.endereco.cidade} selectedCity={selectedCity} onChange={onCityChange} onSelect={onCitySelect} /></Field></div></EditorCard>
    <PeopleSection people={editor.pessoas} patchPerson={patchPerson} removePerson={removePerson} onAdd={() => patch("pessoas", [...editor.pessoas, blankPerson()])} />
    <ItemsSection items={editor.itens} people={editor.pessoas} products={products} catalogChoices={catalogChoices} catalogContractId={editor.catalog_contract_id} catalogTitle={editor.catalog_title} patch={patch} patchItem={patchItem} updateProduct={updateProduct} updateCatalog={updateCatalog} total={total} />
    <EditorCard icon={CreditCard} title="Pagamento e observações" hint="Condições comerciais e anotações do pedido ERP."><div className="grid gap-3 sm:grid-cols-2"><Field label="Plano de pagamento *"><select className="eloom-field w-full" value={editor.plano_pagamento_id || ""} onChange={(e) => patch("plano_pagamento_id", e.target.value)}><option value="">Selecione</option>{plans.map((plan, index) => <option key={`${planId(plan)}-${index}`} value={planId(plan)}>{planLabel(plan)}</option>)}</select></Field><Field label="Número de parcelas *"><input className="eloom-field w-full" type="number" min="1" step="1" value={editor.numero_parcelas || ""} onChange={(e) => patch("numero_parcelas", e.target.value)} /></Field><Field label="Observações do pedido" className="sm:col-span-2"><textarea className="eloom-field min-h-24 w-full" value={editor.observacoes || ""} onChange={(e) => patch("observacoes", e.target.value)} /></Field></div></EditorCard>
  </div>;
}

function PeopleSection({ people, patchPerson, removePerson, onAdd }) {
  return <EditorCard icon={Users} title="Titular e dependentes" hint="Edite os dados, inclua novos dependentes ou exclua os que não pertencem ao pedido."><div className="space-y-3">{people.map((person, index) => <div key={person.id || person.client_key} className="rounded-xl border p-3"><div className="mb-3 flex items-center justify-between"><strong className="text-sm">{person.is_titular ? "Titular" : `Dependente / pessoa ${index + 1}`}</strong>{!person.is_titular && <button type="button" className="action-pill-ghost h-8 px-3 text-xs" onClick={() => removePerson(index)}><Trash2 className="h-3.5 w-3.5" />Excluir dependente</button>}</div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    <Field label="Nome *"><input className="eloom-field w-full" value={person.nome || ""} onChange={(e) => patchPerson(index, "nome", e.target.value)} /></Field>
    <Field label={person.is_titular ? "CPF *" : "CPF"}><input className="eloom-field w-full font-mono" type="text" inputMode="numeric" autoComplete="off" maxLength={14} placeholder="000.000.000-00" value={formatCpfInput(person.cpf)} onChange={(e) => patchPerson(index, "cpf", formatCpfInput(e.target.value))} /></Field>
    <Field label="Nascimento"><input className="eloom-field w-full" type="date" value={person.data_nascimento || ""} onChange={(e) => patchPerson(index, "data_nascimento", e.target.value)} /></Field>
    <Field label="Sexo"><select className="eloom-field w-full" value={person.sexo || ""} onChange={(e) => patchPerson(index, "sexo", e.target.value)}><option value="">Selecione</option><option value="M">M</option><option value="F">F</option></select></Field>
    <Field label="Telefone"><input className="eloom-field w-full" value={formatBrazilPhone(person.telefone || "")} onChange={(e) => patchPerson(index, "telefone", formatBrazilPhone(e.target.value))} /></Field>
    <Field label="Parentesco"><input className="eloom-field w-full" value={person.parentesco || ""} onChange={(e) => patchPerson(index, "parentesco", e.target.value)} /></Field>
  </div></div>)}</div><button type="button" className="action-pill-ghost mt-3" onClick={onAdd}><Plus className="h-4 w-4" />Adicionar dependente ou pessoa</button></EditorCard>;
}

function ItemsSection({ items, people, products, catalogChoices, catalogContractId, catalogTitle, patch, patchItem, updateProduct, updateCatalog, total }) {
  const selectedCatalog = catalogContractId && catalogTitle ? `${catalogContractId}|${catalogTitle}` : "";
  return <EditorCard icon={Package} title="Produtos e vínculos" hint={`Adicione um item, escolha o grupo e depois o produto. Total ao vivo: ${currency(total)}`}><div className="space-y-3">{!items.length && <div className="rounded-xl border border-dashed border-border px-4 py-5 text-center"><p className="text-sm font-semibold">Nenhum produto no pedido</p><p className="mt-1 text-xs text-muted-foreground">Adicione ao menos um produto e vincule uma pessoa antes de salvar.</p></div>}{items.map((entry, index) => {
    const needsAssociation = !entry.pessoa_ids.length;
    return <div key={entry.id || entry.client_key} className={`rounded-xl border p-3 ${needsAssociation ? "border-amber-500 bg-amber-50 dark:bg-amber-950/20" : ""}`}>
      {needsAssociation && <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-amber-700"><AlertTriangle className="h-3.5 w-3.5" />Reassocie este produto a uma pessoa antes de salvar.</p>}
      <div className="mb-3 flex items-center justify-between gap-3"><strong className="text-sm">Produto {index + 1}</strong><button type="button" className="action-pill-ghost h-8 px-3 text-xs" onClick={() => patch("itens", items.filter((_, i) => i !== index))}><Trash2 className="h-3.5 w-3.5" />Excluir produto</button></div>
      <div className="grid gap-3 sm:grid-cols-2"><Field label="Grupo do produto *"><select className="eloom-field w-full" value={selectedCatalog} onChange={(event) => updateCatalog(index, event.target.value)}><option value="">Selecione o grupo</option>{catalogChoices.map((choice) => <option key={`${choice.contract_id}|${choice.title}`} value={`${choice.contract_id}|${choice.title}`}>{choice.title}</option>)}</select></Field><Field label="Produto *"><select className="eloom-field w-full" value={entry.produto_id || ""} disabled={!selectedCatalog} onChange={(e) => updateProduct(index, e.target.value)}><option value="">{selectedCatalog ? "Selecione o produto" : "Escolha o grupo primeiro"}</option>{products.map((product, productIndex) => <option key={`${productId(product)}-${productLabel(product)}-${productPrice(product) ?? ""}-${productIndex}`} value={productId(product)}>{productLabel(product)}</option>)}</select></Field></div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="Preço (definido pelo ERP)"><input className="eloom-field w-full" type="text" readOnly value={entry.preco === "" ? "" : currency(entry.preco)} /></Field><Field label="Qtd. (pessoas)"><input className="eloom-field w-full" readOnly value={entry.pessoa_ids.length} /></Field></div>
      <div className="mt-3"><p className="mb-1 text-xs font-semibold text-muted-foreground">Pessoas atendidas *</p><p className="mb-2 text-xs text-muted-foreground">Marque ou desmarque pessoas para alterar a quantidade, igual à criação do orçamento.</p><div className="flex flex-wrap gap-2">{people.map((person) => { const ref = personRef(person); const checked = entry.pessoa_ids.some((id) => String(id) === String(ref)); return <label key={ref} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><input type="checkbox" checked={checked} onChange={() => patchItem(index, "pessoa_ids", checked ? entry.pessoa_ids.filter((id) => String(id) !== String(ref)) : [...entry.pessoa_ids, ref])} />{person.nome || "Sem nome"}</label>; })}</div></div>
    </div>;
  })}</div><button type="button" className="action-pill-ghost mt-3" onClick={() => patch("itens", [...items, blankItem()])}><Plus className="h-4 w-4" />Adicionar novo produto</button></EditorCard>;
}