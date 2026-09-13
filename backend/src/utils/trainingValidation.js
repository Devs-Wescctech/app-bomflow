import { Buffer } from 'node:buffer';

export const MEDIA_TYPES = {
  video: new Set(['video/mp4', 'video/webm']),
  pdf: new Set(['application/pdf']),
  cover: new Set(['image/jpeg', 'image/png', 'image/webp']),
};

export const MAX_SIZES = {
  video: 5 * 1024 * 1024 * 1024,
  pdf: 500 * 1024 * 1024,
  cover: 10 * 1024 * 1024,
};

export function validateTrainingUpload(kind, mimeType, sizeBytes) {
  if (!MEDIA_TYPES[kind]) return 'Tipo de arquivo inválido.';
  if (!MEDIA_TYPES[kind].has(mimeType)) return `Formato não permitido para ${kind}.`;
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return 'O arquivo está vazio.';
  if (sizeBytes > MAX_SIZES[kind]) return `O arquivo excede o limite de ${Math.round(MAX_SIZES[kind] / 1024 / 1024)} MB.`;
  return null;
}

export function matchesMagicBytes(kind, buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return false;
  if (kind === 'pdf') return buffer.subarray(0, 5).toString() === '%PDF-';
  if (kind === 'video') {
    return buffer.subarray(4, 8).toString() === 'ftyp' ||
      buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  }
  if (kind === 'cover') {
    return (buffer[0] === 0xff && buffer[1] === 0xd8) ||
      buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ||
      (buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP');
  }
  return false;
}
