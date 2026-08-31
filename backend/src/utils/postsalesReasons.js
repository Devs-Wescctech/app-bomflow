// Catálogo canônico de motivos de devolução do Pós-Vendas.
// As chaves existentes são mantidas para que os registros históricos continuem
// sendo exibidos; as novas chaves também cabem no VARCHAR(40) atual.
export const POSTSALES_MOTIVOS = Object.freeze({
  telefone_incorreto: 'Telefone incorreto',
  email_incorreto: 'E-mail incorreto',
  inscritos_divergentes: 'Inscritos divergentes',
  solicitacao_cancelamento: 'Solicitação de cancelamento',
  falta_indicacao_carencia: 'Falta de indicação de carência',
  valor_divergente: 'Valor Divergente',
  produtos_divergentes: 'Produtos Divergentes',
  termo_cancelamento_nao_anexado: 'Termo de cancelamento não anexado',
  solicitacao_cancelamento_planilha: 'Solicitação de cancelamento não anexado na Planilha',
  excesso_dependentes: 'Excesso de dependentes',
  autorizacao_gestor_ausente: 'Não consta autorização do Gestor',
  titular_contrato_ativo_pendencia: 'Titular possui contrato ativo com pendência',
  outros: 'Outros',
});

export const OUTROS_MOTIVO = 'outros';

export function normalizePostsalesObservation(value) {
  return String(value ?? '').trim().slice(0, 1000) || null;
}

export function validatePostsalesReturn(motivo, observacao) {
  if (!POSTSALES_MOTIVOS[motivo]) {
    return 'Escolha um dos motivos padronizados de devolução.';
  }
  if (motivo === OUTROS_MOTIVO && !normalizePostsalesObservation(observacao)) {
    return 'Informe uma observação ao selecionar "Outros".';
  }
  return null;
}

export function getPostsalesReasonLabel(motivo) {
  return motivo ? (POSTSALES_MOTIVOS[motivo] || motivo) : null;
}

export function buildPostsalesReturnNotification({
  numero,
  clienteNome,
  motivo,
  prazoYmd,
  observacao,
}) {
  const cliente = clienteNome ? ` (${clienteNome})` : '';
  const obs = normalizePostsalesObservation(observacao);
  return `O Pós-Vendas devolveu o orçamento Nº ${numero}${cliente}. Motivo: ${getPostsalesReasonLabel(motivo)}. Prazo para resolução: ${prazoYmd} (3 dias úteis).${obs ? ` Observação: ${obs}` : ''}`;
}