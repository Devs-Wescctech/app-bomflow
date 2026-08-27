import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, RefreshCw, Server, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { previewSyncAgentesErp, commitSyncAgentesErp } from "@/api/erpService";

// Metadados de exibição por status (rótulo + cor do badge).
const STATUS_META = {
  ok:                   { label: "Pronto",                 cls: "bg-green-100 text-green-800 border-green-200" },
  nome_divergente:      { label: "Nome diverge",           cls: "bg-amber-100 text-amber-800 border-amber-200" },
  sem_cpf:              { label: "Sem CPF",                 cls: "bg-gray-100 text-gray-600 border-gray-200" },
  cpf_invalido:         { label: "CPF inválido",           cls: "bg-gray-100 text-gray-600 border-gray-200" },
  pessoa_nao_encontrada:{ label: "Pessoa não encontrada",  cls: "bg-red-100 text-red-700 border-red-200" },
  pessoa_sem_codigo:     { label: "Pessoa sem código",       cls: "bg-red-100 text-red-700 border-red-200" },
  pessoas_ambiguas:      { label: "Pessoas ambíguas",        cls: "bg-red-100 text-red-700 border-red-200" },
  usuario_nao_encontrado:{ label: "Sem usuário ERP",       cls: "bg-red-100 text-red-700 border-red-200" },
  usuarios_ambiguos:     { label: "Usuários ambíguos",      cls: "bg-red-100 text-red-700 border-red-200" },
  id_pessoa_legado:      { label: "ID de Pessoa legado",    cls: "bg-amber-100 text-amber-800 border-amber-200" },
  usuario_inexistente:   { label: "Usuário inexistente",    cls: "bg-amber-100 text-amber-800 border-amber-200" },
  usuario_outro_cpf:     { label: "Usuário de outro CPF",   cls: "bg-red-100 text-red-700 border-red-200" },
  vinculo_incorreto:     { label: "Vínculo incorreto",      cls: "bg-amber-100 text-amber-800 border-amber-200" },
  canal_pendente:        { label: "Canal pendente",         cls: "bg-amber-100 text-amber-800 border-amber-200" },
  canal_confirmado:      { label: "Canal confirmado",       cls: "bg-green-100 text-green-800 border-green-200" },
  canal_confirmado_nao_espelhado: { label: "Canal confirmado · espelho pendente", cls: "bg-amber-100 text-amber-800 border-amber-200" },
  canal_divergente:      { label: "Canal confirmado · ID local diverge", cls: "bg-amber-100 text-amber-800 border-amber-200" },
  canal_nao_espelhado:   { label: "Vínculo no ERP",         cls: "bg-amber-100 text-amber-800 border-amber-200" },
  canal_incorreto:       { label: "Canal incorreto",        cls: "bg-amber-100 text-amber-800 border-amber-200" },
  canal_ambiguo:         { label: "Canal ambíguo",          cls: "bg-red-100 text-red-700 border-red-200" },
  nao_avaliado:          { label: "Canal não avaliado",     cls: "bg-gray-100 text-gray-600 border-gray-200" },
  erp_indisponivel:      { label: "ERP indisponível",       cls: "bg-amber-100 text-amber-800 border-amber-200" },
  sem_canal_configurado: { label: "Sem canal configurado",  cls: "bg-gray-100 text-gray-600 border-gray-200" },
  ja_vinculado:         { label: "Já vinculado",           cls: "bg-blue-100 text-blue-700 border-blue-200" },
  erro:                 { label: "Erro",                   cls: "bg-red-100 text-red-700 border-red-200" },
};

// Resultados do commit.
const RESULT_META = {
  ok:                  { label: "Vinculado",            cls: "bg-green-100 text-green-800 border-green-200" },
  vinculado_sem_canal: { label: "Usuário vinculado · Canal pendente", cls: "bg-amber-100 text-amber-800 border-amber-200" },
  confirmado:          { label: "Usuário confirmado",    cls: "bg-green-100 text-green-800 border-green-200" },
  ja_vinculado:        { label: "Já vinculado",         cls: "bg-blue-100 text-blue-700 border-blue-200" },
  nome_divergente:     { label: "Nome diverge",         cls: "bg-amber-100 text-amber-800 border-amber-200" },
  sem_cpf:             { label: "Sem CPF",              cls: "bg-gray-100 text-gray-600 border-gray-200" },
  pessoa_nao_encontrada:{ label: "Pessoa não encontrada", cls: "bg-red-100 text-red-700 border-red-200" },
  pessoa_sem_codigo:    { label: "Pessoa sem código",     cls: "bg-red-100 text-red-700 border-red-200" },
  pessoas_ambiguas:     { label: "Pessoas ambíguas",      cls: "bg-red-100 text-red-700 border-red-200" },
  usuario_nao_encontrado:{ label: "Sem usuário ERP",    cls: "bg-red-100 text-red-700 border-red-200" },
  usuarios_ambiguos:    { label: "Usuários ambíguos",   cls: "bg-red-100 text-red-700 border-red-200" },
  nao_encontrado:      { label: "Agente não encontrado", cls: "bg-red-100 text-red-700 border-red-200" },
  usuario_ja_vinculado:{ label: "Usuário já vinculado",  cls: "bg-red-100 text-red-700 border-red-200" },
  usuario_id_divergente:{ label: "ID divergente",         cls: "bg-red-100 text-red-700 border-red-200" },
  usuario_inexistente: { label: "Usuário inexistente",    cls: "bg-red-100 text-red-700 border-red-200" },
  usuario_outro_cpf:   { label: "Usuário de outro CPF",   cls: "bg-red-100 text-red-700 border-red-200" },
  vinculo_incorreto:   { label: "Vínculo incorreto",      cls: "bg-red-100 text-red-700 border-red-200" },
  id_pessoa_legado:    { label: "ID de Pessoa legado",    cls: "bg-red-100 text-red-700 border-red-200" },
  canal_ambiguo:       { label: "Canal ambíguo",          cls: "bg-red-100 text-red-700 border-red-200" },
  erp_indisponivel:    { label: "ERP indisponível",       cls: "bg-amber-100 text-amber-800 border-amber-200" },
  erro:                { label: "Erro",                 cls: "bg-red-100 text-red-700 border-red-200" },
};

const STATUS_CAUSE = {
  ok: "O Usuário ERP está pronto para ser sincronizado.",
  ja_vinculado: "O vínculo já existe no ERP.",
  canal_pendente: "O canal ainda não tem vínculo confirmado no ERP.",
  canal_confirmado: "O canal foi confirmado por leitura ou escrita no ERP.",
  canal_confirmado_nao_espelhado: "O vínculo existe no ERP e pode ser espelhado no Bom Flow.",
  canal_divergente: "O ERP confirmou um ID de canal diferente do espelho local.",
  canal_nao_espelhado: "O vínculo já existe no ERP; falta apenas espelhar seu ID no Bom Flow.",
  canal_incorreto: "O vínculo efetivo aponta para um canal diferente do selecionado.",
  canal_ambiguo: "Há mais de um vínculo para a mesma Pessoa, canal e grupo no ERP; o caso exige revisão.",
  erp_indisponivel: "A fonte de vínculos do ERP está indisponível; tente novamente quando a conexão for restabelecida.",
  sem_canal_configurado: "Não há canal selecionado no Bom Flow.",
  nome_divergente: "O nome localizado no ERP diverge do cadastro local.",
  id_pessoa_legado: "O ID salvo parece ser de uma Pessoa, não de um Usuário ERP; ele não será trocado automaticamente.",
  usuario_inexistente: "O ID de Usuário ERP salvo não foi localizado; ele permanece imutável até investigação.",
  usuario_outro_cpf: "O ID salvo pertence a uma Pessoa diferente da resolvida pelo CPF; nenhuma alteração automática é permitida.",
  vinculo_incorreto: "O ID salvo diverge do Usuário resolvido pelo CPF; nenhuma alteração automática é permitida.",
  usuarios_ambiguos: "Mais de um Usuário ERP foi localizado para a Pessoa; é necessária revisão.",
  pessoas_ambiguas: "Mais de uma Pessoa foi localizada para o CPF; é necessária revisão.",
  usuario_nao_encontrado: "A Pessoa foi localizada, mas não possui um Usuário ERP inequívoco.",
  pessoa_nao_encontrada: "Não foi possível localizar uma Pessoa inequívoca para o CPF no ERP.",
  pessoa_sem_codigo: "A Pessoa foi localizada, mas o ERP não retornou seu código.",
  sem_cpf: "O agente não possui CPF para validação.",
  cpf_invalido: "O CPF do agente não possui 11 dígitos válidos para a consulta.",
  erro: "A consulta ao ERP falhou; nenhum vínculo foi alterado.",
};

function StatusBadge({ status, meta }) {
  const m = (meta || STATUS_META)[status] || { label: status, cls: "bg-gray-100 text-gray-600 border-gray-200" };
  return <Badge variant="outline" className={`${m.cls} font-medium`}>{m.label}</Badge>;
}

const isGravavel = (item) => item?.repairable === true;

export default function ErpSyncDialog({ open, onOpenChange, onDone }) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(() => new Set());
  const [committing, setCommitting] = useState(false);
  const [results, setResults] = useState(null);

  const carregarPreview = useCallback(async (preservarResultados = false) => {
    setLoading(true);
    if (!preservarResultados) setResults(null);
    try {
      const data = await previewSyncAgentesErp();
      const its = data?.items || [];
      setItems(its);
      setSelected(new Set(
        its
          .filter((i) => isGravavel(i) && i.status !== "nome_divergente")
          .map((i) => i.agentId)
      ));
    } catch (e) {
      toast.error(e.message || "Falha ao carregar a pré-visualização.");
      setItems([]);
      setSelected(new Set());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) carregarPreview();
    if (!open) { setItems([]); setResults(null); setSelected(new Set()); }
  }, [open, carregarPreview]);

  const toggle = (agentId) => {
    if (!isGravavel(items.find((item) => item.agentId === agentId))) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(agentId)) next.delete(agentId); else next.add(agentId);
      return next;
    });
  };

  const gravaveis = useMemo(() => items.filter(isGravavel), [items]);
  const okCount = useMemo(() => items.filter(isGravavel).length, [items]);
  const divergentesSelecionados = useMemo(
    () => items.filter((i) => i.status === "nome_divergente" && selected.has(i.agentId)).length,
    [items, selected]
  );

  const toggleTodosOk = () => {
    const okIds = items.filter((i) => isGravavel(i) && i.status !== "nome_divergente").map((i) => i.agentId);
    const allSelected = okIds.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) okIds.forEach((id) => next.delete(id));
      else okIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const gravar = async () => {
    const payload = items
      .filter((i) => selected.has(i.agentId) && isGravavel(i))
      .map((i) => ({ agentId: i.agentId }));

    if (!payload.length) {
      toast.warning("Selecione ao menos um agente para gravar.");
      return;
    }

    setCommitting(true);
    try {
      const data = await commitSyncAgentesErp(payload);
      const res = data?.results || [];
      setResults(res);
      const usuarioConfirmado = res.filter((r) =>
        ["ok", "ja_vinculado", "vinculado_sem_canal"].includes(r.status)
      );
      const canalPendente = usuarioConfirmado.filter((r) => r.canalConfirmado !== true);
      if (usuarioConfirmado.length > 0) {
        onDone?.();
        if (canalPendente.length > 0) {
          toast.warning(
            `${usuarioConfirmado.length} Usuário(s) ERP sincronizado(s); ${canalPendente.length} canal(is) precisa(m) de atenção.`
          );
        } else {
          toast.success(`${usuarioConfirmado.length} agente(s) com Usuário e Canal ERP sincronizados.`);
        }
      } else {
        toast.warning("Nenhum Usuário ERP foi vinculado. Veja os detalhes.");
      }
      await carregarPreview(true);
    } catch (e) {
      toast.error(e.message || "Falha ao gravar a sincronização.");
    } finally {
      setCommitting(false);
    }
  };

  const resultMap = useMemo(() => {
    const m = new Map();
    (results || []).forEach((r) => m.set(r.agentId, r));
    return m;
  }, [results]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[88vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Server className="w-5 h-5 text-blue-600" />
            Sincronizar agentes com o ERP
          </DialogTitle>
          <DialogDescription>
            Revalida pelo CPF e sincroniza o <span className="font-medium">Usuário ERP</span> pela API REST.
            Em seguida, consulta ou cria o <span className="font-medium">Canal ERP</span> de forma
            idempotente. Uma indisponibilidade do canal não desfaz o Usuário ERP confirmado.
            Um ID de Usuário ERP já salvo nunca é substituído; divergências e ambiguidades
            ficam bloqueadas para investigação.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-2 py-1">
          <div className="text-sm text-gray-500">
            {loading
              ? "Carregando..."
              : `${items.length} agente(s) auditado(s) • ${okCount} reparo(s) disponível(is)`}
          </div>
          <Button variant="outline" size="sm" onClick={carregarPreview} disabled={loading || committing}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>

        <div className="flex-1 overflow-auto border rounded-lg">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-500">
              <Loader2 className="w-6 h-6 animate-spin mr-2" /> Consultando o ERP...
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-500">
              <CheckCircle2 className="w-8 h-8 text-green-500 mb-2" />
              Nenhum agente pendente de vínculo com o ERP.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0 z-10">
                <tr className="text-left text-gray-500">
                  <th className="p-2 w-10">
                    <Checkbox
                       checked={okCount > 0 && items.filter((i) => isGravavel(i) && i.status !== "nome_divergente").every((i) => selected.has(i.agentId))}
                      onCheckedChange={toggleTodosOk}
                      aria-label="Selecionar todos prontos"
                    />
                  </th>
                  <th className="p-2">Agente (Bom Flow)</th>
                  <th className="p-2">CPF</th>
                  <th className="p-2">Canal no Bom Flow</th>
                  <th className="p-2">Vínculo efetivo no ERP</th>
                  <th className="p-2">Estados</th>
                  {results && <th className="p-2">Resultado</th>}
                </tr>
              </thead>
              <tbody>
                {items.map((i) => {
                  const gravavel = isGravavel(i);
                  const r = resultMap.get(i.agentId);
                  return (
                    <tr key={i.agentId} className="border-t hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="p-2 align-top">
                        <Checkbox
                          checked={selected.has(i.agentId)}
                          onCheckedChange={() => toggle(i.agentId)}
                          disabled={!gravavel || committing}
                          aria-label={`Selecionar ${i.agentName}`}
                        />
                      </td>
                      <td className="p-2 align-top font-medium text-gray-900 dark:text-gray-100">{i.agentName}</td>
                      <td className="p-2 align-top text-gray-600 dark:text-gray-300 whitespace-nowrap">{i.cpf || "—"}</td>
                      <td className="p-2 align-top">
                        <div className="flex flex-col">
                          <span className="text-gray-900 dark:text-gray-100">{i.selectedCanalName || "Nenhum canal selecionado"}</span>
                          <span className="text-xs text-gray-500">
                            ID: {i.selectedCanalId ?? "—"} • Grupo: {i.selectedCanalGrupoId ?? "—"}
                          </span>
                        </div>
                      </td>
                      <td className="p-2 align-top">
                        {i.nomeErp || i.effectiveErpAgenteVendaId || i.currentErpAgenteVendaId ? (
                          <div className="flex flex-col">
                            <span className="text-gray-900 dark:text-gray-100">{i.nomeErp || "Vínculo de canal ERP"}</span>
                            <span className="text-xs text-gray-500">
                              Vínculo no ERP: {i.effectiveErpAgenteVendaId ?? "não encontrado"}
                              {" • "}Espelho no Bom Flow: {i.currentErpAgenteVendaId ?? "—"}
                              {" • "}Usuário ERP: {i.erpAgentId || "—"}
                              {i.currentErpAgentId && i.currentErpAgentId !== i.erpAgentId && (
                                <span className="block text-amber-700">ID salvo hoje: {i.currentErpAgentId}</span>
                              )}
                              {i.status === "nome_divergente" && (
                                <span className="inline-flex items-center gap-1 text-amber-600 ml-2">
                                  <AlertTriangle className="w-3 h-3" /> revise o nome
                                </span>
                              )}
                            </span>
                          </div>
                        ) : (
                            <span className="text-gray-400">Sem vínculo efetivo</span>
                        )}
                      </td>
                      <td className="p-2 align-top">
                        <div className="flex flex-col gap-1">
                          <div className="flex flex-wrap gap-1">
                            <StatusBadge status={i.usuarioStatus || i.status} />
                            <StatusBadge status={i.canalStatus || "nao_avaliado"} />
                          </div>
                          {(i.erro || STATUS_CAUSE[i.usuarioStatus || i.status]) && (
                            <span className={`text-xs break-words max-w-[16rem] ${i.erro ? "text-red-600" : "text-gray-600 dark:text-gray-300"}`}>
                              Usuário: {i.erro || STATUS_CAUSE[i.usuarioStatus || i.status]}
                            </span>
                          )}
                          {(i.canalErro || STATUS_CAUSE[i.canalStatus]) && (
                            <span className={`text-xs break-words max-w-[16rem] ${i.canalErro ? "text-red-600" : "text-gray-600 dark:text-gray-300"}`}>
                              Canal: {i.canalErro || STATUS_CAUSE[i.canalStatus]}
                            </span>
                          )}
                        </div>
                      </td>
                      {results && (
                        <td className="p-2 align-top">
                          {r ? (
                            <div className="flex flex-col gap-0.5">
                              <div className="flex flex-wrap gap-1">
                                <StatusBadge status={r.usuarioStatus || r.status} meta={RESULT_META} />
                                {r.canalStatus && <StatusBadge status={r.canalStatus} />}
                              </div>
                              {r.canalErro && <span className="text-xs text-amber-600">canal: {r.canalErro}</span>}
                              {r.canalDiagnostico && (
                                <span className="break-words font-mono text-[11px] text-gray-600 dark:text-gray-300">
                                  diagnóstico técnico (temporário): {r.canalDiagnostico}
                                </span>
                              )}
                              {r.erro && <span className="text-xs text-red-600">{r.erro}</span>}
                            </div>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {divergentesSelecionados > 0 && (
          <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              {divergentesSelecionados} agente(s) com <strong>nome divergente</strong> selecionado(s).
              Confirme manualmente que o CPF/usuário do ERP corresponde ao vendedor antes de gravar.
            </span>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={committing}>
            Fechar
          </Button>
          <Button
            onClick={gravar}
            disabled={committing || loading || selected.size === 0 || gravaveis.length === 0}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {committing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
            Gravar selecionados ({[...selected].filter((id) => gravaveis.some((g) => g.agentId === id)).length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
