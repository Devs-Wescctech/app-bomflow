/* eslint-disable react/prop-types */
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { trainingApi } from "@/api/trainingApi";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  BookOpen,
  Check,
  ChevronRight,
  Cloud,
  Download,
  FileText,
  Film,
  ImagePlus,
  Loader2,
  LockKeyhole,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";

const queryKey = ["training-catalog"];
const mediaTypes = [
  { value: "video", label: "Vídeo", icon: Film },
  { value: "pdf", label: "PDF", icon: FileText },
];

function formatSize(bytes) {
  if (!bytes) return "Arquivo pendente";
  return `${(bytes / 1024 / 1024).toFixed(bytes > 1024 * 1024 * 10 ? 0 : 1)} MB`;
}

function typeLabel(type) {
  return type === "video" ? "VÍDEO" : "PDF";
}

function Cover({ training }) {
  const { data: cover } = useQuery({
    queryKey: ["training-cover", training.id],
    queryFn: () => trainingApi.cover(training.id),
    enabled: Boolean(training.has_cover),
    staleTime: 5 * 60 * 1000,
  });
  const src = cover?.url || cover?.temporaryUrl || cover;
  return (
    <div className="relative flex h-40 items-center justify-center overflow-hidden bg-[hsl(174_34%_92%)]">
      {src ? (
        <img src={src} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
      ) : (
        <div className="relative flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_20%_20%,hsl(174_62%_35%/.18),transparent_45%),linear-gradient(135deg,hsl(174_38%_93%),hsl(43_73%_91%))]">
          {training.media_type === "video" ? <Film className="h-11 w-11 text-[hsl(174_62%_35%/.65)]" /> : <FileText className="h-11 w-11 text-[hsl(174_62%_35%/.65)]" />}
          <span className="absolute bottom-3 left-4 font-mono text-[10px] tracking-[.2em] text-[hsl(174_45%_30%/.65)]">ELOOM / LEARN</span>
        </div>
      )}
      <span className="absolute left-3 top-3 rounded-md bg-[hsl(220_24%_16%/.82)] px-2 py-1 font-mono text-[10px] font-semibold tracking-wider text-white">{typeLabel(training.media_type)}</span>
    </div>
  );
}

function SkeletonCard() {
  return <div className="animate-pulse overflow-hidden rounded-2xl border border-[hsl(174_20%_84%)] bg-white"><div className="h-40 bg-[hsl(174_20%_92%)]" /><div className="space-y-3 p-5"><div className="h-4 w-3/4 rounded bg-[hsl(174_20%_90%)]" /><div className="h-3 w-full rounded bg-[hsl(174_20%_93%)]" /><div className="h-3 w-1/2 rounded bg-[hsl(174_20%_93%)]" /></div></div>;
}

function TrainingCard({ training, index, total, admin, onEdit, onDelete, onMove, onTogglePublish, onOpen, onDownload, onResume, busy }) {
  return (
    <article className="group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-[hsl(174_18%_84%)] bg-white shadow-[0_8px_24px_-20px_hsl(174_45%_20%/.45)] transition duration-200 hover:-translate-y-0.5 hover:border-[hsl(174_38%_65%)] hover:shadow-[0_14px_34px_-22px_hsl(174_45%_20%/.55)]">
      <button type="button" className="text-left disabled:cursor-default" onClick={() => onOpen(training)} disabled={!training.size_bytes} aria-label={`Abrir ${training.title}`}>
        <Cover training={training} />
      </button>
      <div className="flex flex-1 flex-col p-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="mb-1 font-mono text-[10px] font-semibold tracking-[.18em] text-[hsl(174_62%_35%)]">{String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}</p>
            <h2 className="line-clamp-2 font-[Space_Grotesk] text-lg font-semibold leading-tight text-[hsl(220_24%_16%)]">{training.title}</h2>
          </div>
          {admin && <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${training.published ? "bg-[hsl(155_45%_91%)] text-[hsl(155_48%_27%)]" : "bg-[hsl(43_73%_91%)] text-[hsl(33_60%_30%)]"}`}>{training.published ? "Publicado" : "Rascunho"}</span>}
        </div>
        <p className="mb-5 line-clamp-3 min-h-[3.75rem] text-sm leading-5 text-[hsl(220_12%_45%)]">{training.description || "Conteúdo de treinamento para apoiar sua próxima conversa."}</p>
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-[hsl(174_18%_91%)] pt-4">
          <span className="text-xs text-[hsl(220_12%_52%)]">{formatSize(training.size_bytes)}{training.original_name ? ` · ${training.original_name}` : ""}</span>
          {admin ? (
            <div className="flex items-center gap-1">
               <button type="button" className="rounded-lg p-2 text-[hsl(220_12%_52%)] hover:bg-[hsl(174_34%_94%)] hover:text-[hsl(174_62%_35%)] disabled:opacity-30" onClick={() => onMove(training, -1)} disabled={index === 0 || busy} title="Mover para cima"><ArrowUp className="h-4 w-4" /></button>
               <button type="button" className="rounded-lg p-2 text-[hsl(220_12%_52%)] hover:bg-[hsl(174_34%_94%)] hover:text-[hsl(174_62%_35%)] disabled:opacity-30" onClick={() => onMove(training, 1)} disabled={index === total - 1 || busy} title="Mover para baixo"><ArrowDown className="h-4 w-4" /></button>
              <button type="button" className={`rounded-lg p-2 ${training.published ? "text-[hsl(155_48%_35%)] hover:bg-[hsl(155_45%_93%)]" : "text-[hsl(220_12%_52%)] hover:bg-[hsl(174_34%_94%)] hover:text-[hsl(174_62%_35%)]"}`} onClick={() => onTogglePublish(training)} title={training.published ? "Despublicar" : "Publicar"}>{training.published ? <Check className="h-4 w-4" /> : <Cloud className="h-4 w-4" />}</button>
              <button type="button" className="rounded-lg p-2 text-[hsl(220_12%_52%)] hover:bg-[hsl(174_34%_94%)] hover:text-[hsl(174_62%_35%)]" onClick={() => onEdit(training)} title="Editar"><Pencil className="h-4 w-4" /></button>
              <button type="button" className="rounded-lg p-2 text-[hsl(0_60%_47%)] hover:bg-[hsl(0_70%_96%)]" onClick={() => onDelete(training)} title="Excluir"><Trash2 className="h-4 w-4" /></button>
            </div>
          ) : <div className="flex items-center gap-1">{training.media_type === "pdf" && <button type="button" onClick={() => onDownload(training)} className="rounded-lg p-2 text-[hsl(174_62%_35%)] hover:bg-[hsl(174_34%_94%)]" title="Baixar PDF"><Download className="h-4 w-4" /></button>}<ChevronRight className="h-4 w-4 text-[hsl(174_62%_35%)] transition-transform group-hover:translate-x-1" /></div>}
        </div>
        {admin && training.pending_upload_id && <button type="button" onClick={() => onResume(training)} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-[hsl(43_65%_72%)] bg-[hsl(43_73%_94%)] px-3 py-2 text-xs font-semibold text-[hsl(33_60%_30%)] hover:bg-[hsl(43_73%_90%)]"><UploadCloud className="h-4 w-4" />Retomar envio de {training.pending_original_name}</button>}
      </div>
    </article>
  );
}

function Editor({ value, onChange, onClose, onSave, saving, editing }) {
  const [file, setFile] = useState(null);
  const [cover, setCover] = useState(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef(null);
  const coverRef = useRef(null);
  const validMedia = value.mediaType === "video" ? ["video/mp4", "video/webm"] : ["application/pdf"];
  const chooseMedia = (event) => {
    const next = event.target.files?.[0];
    if (!next) return;
    if (!validMedia.includes(next.type)) return setError(value.mediaType === "video" ? "Escolha um vídeo MP4 ou WebM." : "Escolha um arquivo PDF.");
    setError(""); setFile(next);
  };
  const chooseCover = (event) => {
    const next = event.target.files?.[0];
    if (!next) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(next.type)) return setError("A capa precisa ser JPG, PNG ou WebP.");
    setError(""); setCover(next);
  };
  const submit = async (event) => {
    event.preventDefault(); setError("");
    setSubmitting(true);
    try { await onSave({ file, cover, setProgress }); } catch (e) { setError(e.message || "Não foi possível salvar este conteúdo."); }
    finally { setSubmitting(false); }
  };
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-[hsl(220_24%_16%/.42)] p-0 backdrop-blur-sm sm:items-center sm:p-5" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <form onSubmit={submit} className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-[hsl(40_33%_98%)] p-6 shadow-2xl sm:rounded-3xl sm:p-8">
      <div className="mb-6 flex items-start justify-between"><div><p className="font-mono text-[10px] font-semibold tracking-[.18em] text-[hsl(174_62%_35%)]">{editing ? "EDITAR CONTEÚDO" : "NOVO CONTEÚDO"}</p><h2 className="mt-1 font-[Space_Grotesk] text-2xl font-semibold text-[hsl(220_24%_16%)]">{editing ? "Ajuste os detalhes" : "Adicione uma nova aula"}</h2></div><button type="button" onClick={onClose} className="rounded-full p-2 hover:bg-[hsl(174_34%_91%)]" aria-label="Fechar"><X className="h-5 w-5" /></button></div>
      {error && <div className="mb-4 flex gap-2 rounded-xl border border-[hsl(0_55%_82%)] bg-[hsl(0_70%_97%)] p-3 text-sm text-[hsl(0_60%_40%)]"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
      <label className="mb-4 block text-sm font-semibold text-[hsl(220_24%_22%)]">Título<input required value={value.title} onChange={(e) => onChange({ ...value, title: e.target.value })} className="eloom-field mt-2" placeholder="Ex.: Primeiros passos no atendimento" /></label>
      <label className="mb-4 block text-sm font-semibold text-[hsl(220_24%_22%)]">Descrição<textarea value={value.description} onChange={(e) => onChange({ ...value, description: e.target.value })} className="eloom-field mt-2 min-h-24 resize-y" placeholder="Uma frase para orientar o agente." /></label>
       <div className="mb-5"><p className="mb-2 text-sm font-semibold text-[hsl(220_24%_22%)]">Formato</p><div className="grid grid-cols-2 gap-2">{mediaTypes.map(({ value: type, label, icon: Icon }) => <button key={type} type="button" disabled={Boolean(editing)} onClick={() => { onChange({ ...value, mediaType: type }); setFile(null); }} className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${value.mediaType === type ? "border-[hsl(174_62%_35%)] bg-[hsl(174_34%_91%)] text-[hsl(174_62%_30%)]" : "border-[hsl(174_18%_84%)] bg-white text-[hsl(220_12%_50%)]"}`}><Icon className="h-4 w-4" />{label}</button>)}</div>{editing && <p className="mt-2 text-xs text-[hsl(220_12%_50%)]">Para trocar o formato, crie um novo conteúdo.</p>}</div>
      <label className="mb-4 flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-[hsl(174_38%_65%)] bg-[hsl(174_34%_95%)] p-4"><UploadCloud className="h-5 w-5 text-[hsl(174_62%_35%)]" /><span className="flex-1 text-sm"><strong className="block text-[hsl(220_24%_22%)]">{file?.name || (editing ? "Substituir arquivo principal (opcional)" : "Escolha o arquivo principal")}</strong><small className="text-[hsl(220_12%_50%)]">{value.mediaType === "video" ? "MP4 ou WebM · até o limite configurado" : "PDF · até o limite configurado"}</small></span><input ref={fileRef} type="file" accept={value.mediaType === "video" ? "video/mp4,video/webm" : "application/pdf"} onChange={chooseMedia} className="sr-only" /><span className="rounded-lg bg-[hsl(174_62%_35%)] px-3 py-2 text-xs font-semibold text-white">Selecionar</span></label>
      <label className="mb-5 flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-[hsl(220_15%_78%)] bg-white p-4"><ImagePlus className="h-5 w-5 text-[hsl(220_12%_50%)]" /><span className="flex-1 text-sm"><strong className="block text-[hsl(220_24%_22%)]">{cover?.name || "Adicionar capa (opcional)"}</strong><small className="text-[hsl(220_12%_50%)]">JPG, PNG ou WebP</small></span><input ref={coverRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseCover} className="sr-only" /><span className="rounded-lg border border-[hsl(174_18%_84%)] px-3 py-2 text-xs font-semibold">Selecionar</span></label>
      {progress > 0 && progress < 100 && <div className="mb-5"><div className="mb-1 flex justify-between text-xs text-[hsl(220_12%_50%)]"><span>Enviando arquivos</span><span>{progress}%</span></div><div className="h-2 overflow-hidden rounded-full bg-[hsl(174_20%_87%)]"><div className="h-full rounded-full bg-[hsl(174_62%_35%)] transition-[width]" style={{ width: `${progress}%` }} /></div></div>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={onClose} disabled={submitting} className="btn-secondary">Cancelar</button><button type="submit" disabled={saving || submitting} className="action-pill-primary">{(saving || submitting) && <Loader2 className="h-4 w-4 animate-spin" />}{editing ? "Salvar alterações" : "Criar conteúdo"}</button></div>
    </form>
  </div>;
}

function Viewer({ item, onClose }) {
  const { data, isLoading, isError } = useQuery({ queryKey: ["training-access", item.id], queryFn: () => trainingApi.access(item.id), staleTime: 0 });
  const url = data?.url || data?.temporaryUrl || data;
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-[hsl(220_24%_16%/.7)] p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="training-view-title"><div className="flex h-[min(90dvh,760px)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-[hsl(40_33%_98%)] shadow-2xl"><header className="flex items-center justify-between gap-4 border-b border-[hsl(174_18%_86%)] px-5 py-4"><div className="min-w-0"><p className="font-mono text-[10px] tracking-[.16em] text-[hsl(174_62%_35%)]">{typeLabel(item.media_type)}</p><h2 id="training-view-title" className="truncate font-[Space_Grotesk] font-semibold">{item.title}</h2></div><div className="flex items-center gap-2">{url && <a href={url} target="_blank" rel="noreferrer" download={item.original_name} className="btn-secondary"><Download className="h-4 w-4" />Baixar</a>}<button onClick={onClose} className="rounded-lg p-2 hover:bg-[hsl(174_34%_91%)]" aria-label="Fechar"><X className="h-5 w-5" /></button></div></header><div className="min-h-0 flex-1 bg-[hsl(220_16%_13%)] p-3">{isLoading ? <div className="flex h-full items-center justify-center text-white"><Loader2 className="h-6 w-6 animate-spin" /></div> : isError ? <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-white"><AlertCircle className="h-8 w-8 text-[hsl(43_73%_64%)]" /><p>Não foi possível abrir este arquivo.</p></div> : item.media_type === "video" ? <video src={url} controls autoPlay className="h-full w-full rounded-lg object-contain" /> : <iframe src={url} title={item.title} className="h-full w-full rounded-lg bg-white" />}</div></div></div>;
}

export default function ProductTraining() {
  const client = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey, queryFn: trainingApi.list });
  const catalog = useMemo(() => data?.trainings || [], [data?.trainings]);
  const admin = Boolean(data?.canAdminister);
  const storageConfigured = data?.storageConfigured !== false;
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState(null);
  const [viewer, setViewer] = useState(null);
  const [notice, setNotice] = useState("");
  const [resumeProgress, setResumeProgress] = useState(null);
  const filtered = useMemo(() => catalog.filter((item) => `${item.title} ${item.description || ""}`.toLowerCase().includes(search.toLowerCase())), [catalog, search]);
  const invalidate = () => client.invalidateQueries({ queryKey });
  const save = useMutation({ mutationFn: ({ id, payload }) => id ? trainingApi.update(id, payload) : trainingApi.create(payload), onSuccess: invalidate });
  const remove = useMutation({ mutationFn: trainingApi.remove, onSuccess: invalidate });
  const reorder = useMutation({ mutationFn: trainingApi.reorder, onSuccess: invalidate });
  const publish = useMutation({ mutationFn: ({ id, published }) => trainingApi.update(id, { published }), onSuccess: invalidate });
  const openTraining = async (item) => {
    if (item.media_type === "pdf") {
      const popup = window.open("about:blank", "_blank");
      if (popup) popup.opener = null;
      try {
        const data = await trainingApi.access(item.id);
        const url = data?.url || data?.temporaryUrl || data;
        if (popup) popup.location.replace(url);
        else window.location.assign(url);
      } catch {
        popup?.close();
        setNotice("Não foi possível abrir este PDF.");
      }
    } else setViewer(item);
  };
  const downloadTraining = async (item) => {
    const popup = window.open("about:blank", "_blank");
    if (popup) popup.opener = null;
    try {
      const result = await trainingApi.access(item.id, true);
      const url = result?.url || result?.temporaryUrl || result;
      if (popup) popup.location.replace(url);
      else window.location.assign(url);
    } catch {
      popup?.close();
      setNotice("Não foi possível baixar este arquivo.");
    }
  };
  const saveEditor = async ({ file, cover, setProgress }) => {
    if (!storageConfigured && (file || cover)) throw new Error("O armazenamento de arquivos está indisponível no momento.");
    const payload = { title: editor.value.title.trim(), description: editor.value.description.trim(), mediaType: editor.value.mediaType };
    if (!payload.title) throw new Error("Informe um título.");
    const result = await save.mutateAsync({ id: editor.editing?.id, payload });
    const id = result?.training?.id || result?.id || editor.editing?.id;
    if (file) {
      const started = await trainingApi.beginUpload(id, file, "media");
      try {
        await trainingApi.uploadFile(started.url || started.uploadUrl, file, (p) => setProgress(p * (cover ? 0.8 : 1)));
        await trainingApi.completeUpload(id, started.uploadId || started.id);
      } catch (error) {
        await invalidate();
        throw new Error(`${error.message || "O envio foi interrompido."} O envio pendente foi preservado; feche esta janela e use “Retomar envio” no card.`);
      }
    }
    if (cover) {
      const started = await trainingApi.beginUpload(id, cover, "cover");
      try {
        await trainingApi.uploadFile(started.url || started.uploadUrl, cover, (p) => setProgress(file ? 80 + p * 0.2 : p));
        await trainingApi.completeUpload(id, started.uploadId || started.id);
      } catch (error) {
        await invalidate();
        throw new Error(`${error.message || "O envio foi interrompido."} O envio pendente foi preservado; feche esta janela e use “Retomar envio” no card.`);
      }
    }
    setProgress(100); await invalidate(); setNotice(editor.editing ? "Conteúdo atualizado." : "Conteúdo criado."); setEditor(null);
  };
  const resumeUpload = (training) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = training.pending_mime_type || (training.media_type === "video" ? "video/mp4,video/webm" : "application/pdf");
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      if (file.name !== training.pending_original_name || file.size !== Number(training.pending_expected_size) || (file.type && file.type !== training.pending_mime_type)) {
        setNotice(`Selecione novamente o mesmo arquivo: ${training.pending_original_name}.`);
        return;
      }
      setResumeProgress({ title: training.title, value: 0 });
      try {
        const session = await trainingApi.resumeUpload(training.id, training.pending_upload_id);
        await trainingApi.uploadFile(session.uploadUrl, file, (value) => setResumeProgress({ title: training.title, value }));
        await trainingApi.completeUpload(training.id, training.pending_upload_id);
        await invalidate();
        setNotice("Envio retomado e finalizado.");
      } catch (error) {
        await invalidate();
        setNotice(error.message || "Não foi possível retomar o envio. Você pode tentar novamente.");
      } finally {
        setResumeProgress(null);
      }
    };
    input.click();
  };
  const move = (training, direction) => {
    if (search) return;
    const ids = catalog.map((item) => item.id);
    const index = ids.indexOf(training.id);
    if (index < 0 || !ids[index + direction]) return;
    [ids[index], ids[index + direction]] = [ids[index + direction], ids[index]];
    reorder.mutate(ids);
  };
  const deleteItem = (item) => { if (window.confirm(`Excluir "${item.title}"? Esta ação não pode ser desfeita.`)) remove.mutate(item.id, { onSuccess: () => setNotice("Conteúdo excluído.") }); };

  return <main className="min-h-[100dvh] bg-[hsl(40_33%_97%)] text-[hsl(220_24%_16%)]">
    <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
      <header className="mb-8 flex flex-col gap-6 border-b border-[hsl(174_18%_86%)] pb-7 lg:flex-row lg:items-end lg:justify-between"><div><div className="mb-4 flex items-center gap-2 text-[hsl(174_62%_35%)]"><div className="rounded-lg bg-[hsl(174_34%_89%)] p-2"><BookOpen className="h-5 w-5" /></div><span className="font-mono text-xs font-semibold tracking-[.2em]">ELOOM / ACADEMY</span></div><h1 className="font-[Space_Grotesk] text-3xl font-semibold tracking-tight sm:text-4xl">Treinamentos</h1><p className="mt-2 max-w-xl text-sm leading-6 text-[hsl(220_12%_47%)]">Aprenda no seu ritmo. Conteúdos curados para deixar cada atendimento mais seguro e mais humano.</p></div><div className="flex flex-col gap-2 sm:flex-row">{admin && <button onClick={() => setEditor({ value: { title: "", description: "", mediaType: "video" } })} className="action-pill-primary"><Plus className="h-4 w-4" />Novo treinamento</button>}<div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(220_12%_55%)]" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar conteúdo" className="eloom-field min-w-[220px] pl-9" /></div></div></header>
      {notice && <div className="mb-5 flex items-center justify-between rounded-xl border border-[hsl(155_42%_78%)] bg-[hsl(155_45%_94%)] px-4 py-3 text-sm text-[hsl(155_48%_27%)]"><span className="flex items-center gap-2"><Check className="h-4 w-4" />{notice}</span><button onClick={() => setNotice("")} aria-label="Fechar aviso"><X className="h-4 w-4" /></button></div>}
      {resumeProgress && <div className="mb-5 rounded-xl border border-[hsl(174_38%_75%)] bg-[hsl(174_34%_95%)] p-4"><div className="mb-2 flex justify-between text-xs font-semibold"><span>Retomando {resumeProgress.title}</span><span>{resumeProgress.value}%</span></div><div className="h-2 overflow-hidden rounded-full bg-[hsl(174_20%_87%)]"><div className="h-full bg-[hsl(174_62%_35%)] transition-[width]" style={{ width: `${resumeProgress.value}%` }} /></div></div>}
      {admin && !storageConfigured && <div className="mb-6 flex items-start gap-3 rounded-2xl border border-[hsl(43_65%_72%)] bg-[hsl(43_73%_94%)] p-4 text-sm text-[hsl(33_60%_30%)]"><Cloud className="mt-0.5 h-5 w-5 shrink-0" /><div><strong>Armazenamento indisponível</strong><p className="mt-1">Você pode organizar o catálogo, mas novos uploads ficarão bloqueados até a configuração ser restaurada.</p></div></div>}
      <div className="mb-6 flex flex-wrap items-center gap-3 text-xs text-[hsl(220_12%_50%)]"><span className="rounded-full bg-[hsl(174_34%_91%)] px-3 py-1.5 font-semibold text-[hsl(174_62%_30%)]">{catalog.length} {catalog.length === 1 ? "conteúdo" : "conteúdos"}</span>{admin ? <span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" />Modo administrador</span> : <span className="flex items-center gap-1.5"><LockKeyhole className="h-3.5 w-3.5" />Biblioteca publicada</span>}</div>
      {admin && search && filtered.length > 0 && <p className="mb-4 text-xs text-[hsl(220_12%_50%)]">Limpe a busca para reordenar os conteúdos.</p>}
      {isLoading ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{[1, 2, 3].map((item) => <SkeletonCard key={item} />)}</div> : isError ? <div className="rounded-2xl border border-[hsl(0_55%_82%)] bg-[hsl(0_70%_97%)] p-8 text-center"><AlertCircle className="mx-auto mb-3 h-8 w-8 text-[hsl(0_60%_47%)]" /><h2 className="font-semibold">Não foi possível carregar os treinamentos</h2><p className="mt-1 text-sm text-[hsl(220_12%_48%)]">Tente novamente em instantes.</p><button onClick={() => refetch()} className="btn-secondary mt-5"><RefreshCw className="h-4 w-4" />Tentar novamente</button></div> : filtered.length ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{filtered.map((item, index) => <TrainingCard key={item.id} training={item} index={index} total={filtered.length} admin={admin} onOpen={openTraining} onDownload={downloadTraining} onResume={resumeUpload} onEdit={(training) => setEditor({ editing: training, value: { title: training.title, description: training.description || "", mediaType: training.media_type } })} onDelete={deleteItem} onTogglePublish={(training) => publish.mutate({ id: training.id, published: !training.published })} onMove={move} busy={Boolean(search) || reorder.isPending || publish.isPending || Boolean(resumeProgress)} />)}</div> : <div className="rounded-2xl border border-dashed border-[hsl(174_25%_78%)] bg-[hsl(174_34%_96%)] px-6 py-16 text-center"><MoreHorizontal className="mx-auto mb-3 h-8 w-8 text-[hsl(174_62%_35%)]" /><h2 className="font-[Space_Grotesk] text-xl font-semibold">{search ? "Nenhum resultado" : "A biblioteca está começando"}</h2><p className="mx-auto mt-2 max-w-md text-sm text-[hsl(220_12%_48%)]">{search ? "Tente buscar por outro título ou descrição." : admin ? "Crie o primeiro treinamento para sua equipe." : "Os próximos conteúdos publicados aparecerão aqui."}</p>{admin && !search && <button onClick={() => setEditor({ value: { title: "", description: "", mediaType: "video" } })} className="action-pill-primary mt-5"><Plus className="h-4 w-4" />Adicionar conteúdo</button>}</div>}
    </div>
    {editor && <Editor value={editor.value} onChange={(value) => setEditor({ ...editor, value })} editing={editor.editing} onClose={() => !save.isPending && setEditor(null)} onSave={saveEditor} saving={save.isPending} />}
    {viewer && <Viewer item={viewer} onClose={() => setViewer(null)} />}
  </main>;
}