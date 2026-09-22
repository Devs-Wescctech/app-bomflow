import { CONTRACT_PRODUCTS } from './salesContractModels.js';
import {
  findLatestLegacySignature,
  isLegacySignatureDatabaseConfigured,
} from './legacySignatureRepository.js';
import {
  readLegacySignatureFile,
  signatureFileNameFromReference,
} from './legacySignatureStorage.js';

const digits = (value) => String(value || '').replace(/\D/g, '');

export function legacySignatureContractReference(claims, productKey) {
  if (productKey === CONTRACT_PRODUCTS.BOM_CORP) {
    return digits(claims?.contrato || claims?.displayNumber);
  }
  return digits(claims?.numeroPedido || claims?.displayNumber);
}

export async function readLegacyContractSignature(claims, productKey) {
  if (!isLegacySignatureDatabaseConfigured()) return null;
  const reference = legacySignatureContractReference(claims, productKey);
  if (!reference) return null;
  const record = await findLatestLegacySignature(reference);
  if (!record) return null;
  try {
    const fileName = signatureFileNameFromReference(record.assinatura_arquivo);
    if (fileName !== `${reference}.png`) {
      const error = new Error('O arquivo registrado não corresponde ao contrato pesquisado.');
      error.statusCode = 409;
      throw error;
    }
    const signature = await readLegacySignatureFile(record.assinatura_arquivo);
    return signature.buffer;
  } catch (error) {
    // Registros antigos podem apontar para arquivos ausentes, vazios ou inválidos.
    // Nesses casos o contrato continua disponível para impressão, sem assinatura.
    if (error?.statusCode === 409) return null;
    throw error;
  }
}
