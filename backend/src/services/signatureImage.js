const PNG_PREFIX = 'data:image/png;base64,';
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function signatureBufferFromDataUrl(value, { maxBytes = 2 * 1024 * 1024 } = {}) {
  const input = String(value || '');
  if (!input.startsWith(PNG_PREFIX)) {
    const error = new Error('A assinatura deve ser uma imagem PNG.');
    error.statusCode = 422;
    throw error;
  }
  const encoded = input.slice(PNG_PREFIX.length);
  if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    const error = new Error('A imagem da assinatura é inválida.');
    error.statusCode = 422;
    throw error;
  }
  const buffer = Buffer.from(encoded, 'base64');
  if (buffer.length < 24 || buffer.length > maxBytes || !buffer.subarray(0, 8).equals(PNG_MAGIC)) {
    const error = new Error('A imagem da assinatura é inválida ou excede o limite permitido.');
    error.statusCode = 422;
    throw error;
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (!width || !height || width > 2400 || height > 1200) {
    const error = new Error('As dimensões da assinatura são inválidas.');
    error.statusCode = 422;
    throw error;
  }
  return buffer;
}
