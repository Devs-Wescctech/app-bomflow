export const SEM_CANAL_FILTER = 'sem_canal';

/**
 * Normaliza o filtro de canal usado pelos relatórios de orçamentos.
 *
 * O valor especial `sem_canal` representa tanto um pedido sem
 * `agente_venda_id` quanto um vínculo `pessoas_contratos` sem contrato.
 */
export function parseCanalFilter(value) {
  const raw = value == null ? '' : String(value).trim().toLowerCase();

  if (raw === '' || raw === 'todos') {
    return { kind: 'all', id: null };
  }

  if (raw === SEM_CANAL_FILTER) {
    return { kind: 'without', id: null };
  }

  const id = Number(raw);
  if (Number.isInteger(id) && id > 0) {
    return { kind: 'specific', id };
  }

  return { kind: 'invalid', id: null };
}

/**
 * Acrescenta a condição de canal à mesma lista de condições que já contém
 * período e situação. Assim, a paginação é aplicada somente depois de todos
 * os filtros.
 */
export function appendCanalCondition(conditions, params, value) {
  const parsed = parseCanalFilter(value);
  if (parsed.kind === 'invalid') {
    const error = new Error('Filtro de canal inválido.');
    error.code = 'invalid_canal_filter';
    throw error;
  }

  if (parsed.kind === 'without') {
    conditions.push('pcv.contrato_id IS NULL');
  } else if (parsed.kind === 'specific') {
    params.push(parsed.id);
    conditions.push(`pcv.contrato_id = $${params.length}`);
  }

  return parsed;
}