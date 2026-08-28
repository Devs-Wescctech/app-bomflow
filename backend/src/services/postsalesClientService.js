import { getPedidoClientIdentities } from './erpDbService.js';
import {
  mergePostsalesClientIdentities,
  missingPostsalesClientPedidoIds,
} from '../utils/postsalesDetail.js';

export async function enrichPostsalesClientIdentities(
  rows,
  {
    loadIdentities = getPedidoClientIdentities,
    context = 'fila',
    logError = console.error,
  } = {}
) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const missingIds = missingPostsalesClientPedidoIds(safeRows);
  if (missingIds.length === 0) return safeRows;

  try {
    const identities = await loadIdentities(missingIds);
    return mergePostsalesClientIdentities(safeRows, identities);
  } catch (error) {
    logError(`[postsales] identidade do cliente indisponível em ${context}:`, error.message);
    return safeRows;
  }
}