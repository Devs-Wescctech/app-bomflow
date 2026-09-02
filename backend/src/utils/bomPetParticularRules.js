import { Buffer } from 'node:buffer';

export const BOM_PET_ORIGENS = ['Plano', 'Particular'];

export function normalizeBomPetOrigem(value) {
  const origem = value || 'Plano';
  return BOM_PET_ORIGENS.includes(origem) ? origem : null;
}

export function isBomPetPaymentContentValid(buffer, mimetype) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return false;
  if (mimetype === 'application/pdf') return buffer.subarray(0, 5).toString() === '%PDF-';
  if (mimetype === 'image/jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimetype === 'image/png') {
    return buffer.length >= 8 &&
      buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  if (mimetype === 'image/gif') return ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString());
  if (mimetype === 'image/webp') {
    return buffer.length >= 12 &&
      buffer.subarray(0, 4).toString() === 'RIFF' &&
      buffer.subarray(8, 12).toString() === 'WEBP';
  }
  return false;
}

export function validateParticularFields(payload = {}, files = []) {
  const errors = [];
  if (!String(payload.nome || '').trim()) errors.push('Nome do cliente é obrigatório.');
  if (!String(payload.petNome || '').trim()) errors.push('Nome do pet é obrigatório.');
  if (!String(payload.petDescricao || '').trim()) errors.push('Descrição do pet é obrigatória.');
  if (!Array.isArray(files) || files.length === 0) errors.push('Anexe ao menos um comprovante de pagamento válido.');
  return errors;
}

export function parseParticularPaidAmount(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const normalized = String(value).trim().replace(',', '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount <= 9999999999.99 ? amount : null;
}

export function findBomPetOrphanFilenames(entries, referencedFilenames, cutoffMs) {
  const referenced = new Set(referencedFilenames || []);
  return (entries || [])
    .filter((entry) => entry?.name && Number(entry.mtimeMs) < cutoffMs && !referenced.has(entry.name))
    .map((entry) => entry.name);
}