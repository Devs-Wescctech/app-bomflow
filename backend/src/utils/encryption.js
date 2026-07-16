import crypto from 'crypto';

// Criptografia simétrica AES-256-GCM para tokens de canal (channel_connections.token).
// A chave é derivada via scrypt (salt fixo próprio deste módulo) a partir de
// ENCRYPTION_KEY, se definida como SECRET no Replit, ou de SESSION_SECRET (secret já
// existente, nunca versionado). IMPORTANTE: não colocar ENCRYPTION_KEY em variável de
// ambiente comum — env vars são gravadas no .replit (versionado) e vazariam a chave.
// Formato armazenado: iv(hex).tag(hex).cipher(hex)

const SALT = 'wescctech-crm-attendance-v1';

let cachedKey = null;
function getKey() {
  if (cachedKey) return cachedKey;
  const secret = process.env.ENCRYPTION_KEY || process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      'ENCRYPTION_KEY (ou SESSION_SECRET) não configurada — necessária para criptografar tokens de canal'
    );
  }
  cachedKey = crypto.scryptSync(secret, SALT, 32);
  return cachedKey;
}

export function encrypt(text) {
  if (typeof text !== 'string' || text.length === 0) {
    throw new Error('Texto para criptografar é obrigatório');
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}.${tag.toString('hex')}.${encrypted.toString('hex')}`;
}

export function decrypt(payload) {
  if (typeof payload !== 'string' || !payload.includes('.')) {
    throw new Error('Payload criptografado inválido');
  }
  const [ivHex, tagHex, dataHex] = payload.split('.');
  if (!ivHex || !tagHex || !dataHex) {
    throw new Error('Payload criptografado inválido');
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}
