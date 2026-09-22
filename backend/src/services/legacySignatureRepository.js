import mysql from 'mysql2/promise';

let pool = null;
let poolFingerprint = null;

const config = () => ({
  host: String(process.env.LEGACY_SIGNATURE_DB_HOST || '').trim(),
  port: Number(process.env.LEGACY_SIGNATURE_DB_PORT || 3306),
  user: String(process.env.LEGACY_SIGNATURE_DB_USER || '').trim(),
  password: String(process.env.LEGACY_SIGNATURE_DB_PASSWORD || ''),
  database: String(process.env.LEGACY_SIGNATURE_DB_NAME || '').trim(),
});

export function isLegacySignatureDatabaseConfigured() {
  const value = config();
  return Boolean(value.host && value.user && value.password && value.database);
}

const connectionPool = () => {
  const value = config();
  if (!isLegacySignatureDatabaseConfigured()) return null;
  const fingerprint = JSON.stringify(value);
  if (pool && poolFingerprint === fingerprint) return pool;
  pool = mysql.createPool({
    ...value,
    waitForConnections: true,
    connectionLimit: 3,
    queueLimit: 10,
    connectTimeout: 10000,
    charset: 'utf8_general_ci',
    timezone: 'Z',
  });
  poolFingerprint = fingerprint;
  return pool;
};

const contractReference = (value) => {
  const normalized = String(value || '').trim();
  if (!/^\d{1,10}$/.test(normalized) || Number(normalized) <= 0) {
    const error = new Error('A referência do contrato para buscar a assinatura é inválida.');
    error.statusCode = 422;
    throw error;
  }
  return Number(normalized);
};

export async function findLatestLegacySignature(reference) {
  const database = connectionPool();
  if (!database) return null;
  try {
    const [rows] = await database.execute(
      `SELECT codigo, data, contrato_numero, titular_cpf,
              contrato_arquivo, assinatura_arquivo
         FROM contratos_assinaturas
        WHERE contrato_numero = ?
        ORDER BY codigo DESC
        LIMIT 1`,
      [contractReference(reference)],
    );
    return rows[0] || null;
  } catch (cause) {
    if (cause?.statusCode) throw cause;
    const error = new Error('Não foi possível consultar a assinatura no banco legado.');
    error.statusCode = 503;
    error.cause = cause;
    throw error;
  }
}

export async function findLatestLegacySignatures(references) {
  const database = connectionPool();
  if (!database) return [];
  const normalized = [...new Set((references || []).map(contractReference))];
  if (!normalized.length) return [];
  const placeholders = normalized.map(() => '?').join(',');
  try {
    const [rows] = await database.execute(
      `SELECT current.codigo, current.data, current.contrato_numero,
              current.titular_cpf, current.contrato_arquivo, current.assinatura_arquivo
         FROM contratos_assinaturas current
         JOIN (
           SELECT contrato_numero, MAX(codigo) AS codigo
             FROM contratos_assinaturas
            WHERE contrato_numero IN (${placeholders})
            GROUP BY contrato_numero
         ) latest ON latest.codigo = current.codigo`,
      normalized,
    );
    return rows;
  } catch (cause) {
    const error = new Error('Não foi possível consultar as assinaturas no banco legado.');
    error.statusCode = 503;
    error.cause = cause;
    throw error;
  }
}

export async function insertLegacySignatureSnapshot({
  reference,
  cpf,
  contractFile = '',
  signatureFile = '',
}) {
  const database = connectionPool();
  if (!database) {
    const error = new Error('O banco legado de assinaturas não está configurado.');
    error.statusCode = 503;
    throw error;
  }
  try {
    const [result] = await database.execute(
      `INSERT INTO contratos_assinaturas
        (data, contrato_numero, titular_cpf, contrato_arquivo, assinatura_arquivo)
       VALUES (CURRENT_DATE(), ?, ?, ?, ?)`,
      [
        contractReference(reference),
        String(cpf || '').trim().slice(0, 14),
        String(contractFile || '').trim().slice(0, 50),
        String(signatureFile || '').trim().slice(0, 50),
      ],
    );
    return { id: Number(result.insertId), affectedRows: Number(result.affectedRows) };
  } catch (cause) {
    const error = new Error('Não foi possível registrar os arquivos do contrato no banco legado.');
    error.statusCode = 503;
    error.cause = cause;
    throw error;
  }
}

export async function updateLegacySignatureRecord({
  id,
  cpf,
  contractFile,
  signatureFile,
  touchDate = false,
}) {
  const database = connectionPool();
  if (!database) {
    const error = new Error('O banco legado de assinaturas não está configurado.');
    error.statusCode = 503;
    throw error;
  }
  const recordId = Number(id);
  if (!Number.isInteger(recordId) || recordId <= 0) {
    const error = new Error('O registro de assinatura é inválido.');
    error.statusCode = 422;
    throw error;
  }
  const assignments = [];
  const values = [];
  if (cpf !== undefined) {
    assignments.push('titular_cpf = ?');
    values.push(String(cpf || '').trim().slice(0, 14));
  }
  if (contractFile !== undefined) {
    assignments.push('contrato_arquivo = ?');
    values.push(String(contractFile || '').trim().slice(0, 50));
  }
  if (signatureFile !== undefined) {
    assignments.push('assinatura_arquivo = ?');
    values.push(String(signatureFile || '').trim().slice(0, 50));
  }
  if (touchDate) assignments.push('data = CURRENT_DATE()');
  if (!assignments.length) return { affectedRows: 0 };
  values.push(recordId);
  try {
    const [result] = await database.execute(
      `UPDATE contratos_assinaturas SET ${assignments.join(', ')} WHERE codigo = ?`,
      values,
    );
    if (Number(result.affectedRows) !== 1) {
      const error = new Error('O registro de assinatura não foi encontrado.');
      error.statusCode = 409;
      throw error;
    }
    return { affectedRows: Number(result.affectedRows) };
  } catch (cause) {
    if (cause?.statusCode) throw cause;
    const error = new Error('Não foi possível atualizar o registro de assinatura.');
    error.statusCode = 503;
    error.cause = cause;
    throw error;
  }
}

export async function insertLegacySignature({
  reference,
  cpf,
  contractFile = '',
  signatureFile,
}) {
  const database = connectionPool();
  if (!database) {
    const error = new Error('O banco legado de assinaturas não está configurado.');
    error.statusCode = 503;
    throw error;
  }
  try {
    const [result] = await database.execute(
      `INSERT INTO contratos_assinaturas
        (data, contrato_numero, titular_cpf, contrato_arquivo, assinatura_arquivo)
       SELECT CURRENT_DATE(), ?, ?, ?, ?
         FROM DUAL
        WHERE NOT EXISTS (
          SELECT 1 FROM contratos_assinaturas WHERE contrato_numero = ?
        )`,
      [
        contractReference(reference),
        String(cpf || '').trim(),
        String(contractFile || '').trim(),
        String(signatureFile || '').trim(),
        contractReference(reference),
      ],
    );
    if (Number(result.affectedRows) !== 1) {
      const error = new Error('Este contrato já possui um registro de assinatura.');
      error.statusCode = 409;
      throw error;
    }
    return { id: Number(result.insertId), affectedRows: Number(result.affectedRows) };
  } catch (cause) {
    if (cause?.statusCode) throw cause;
    const error = new Error('Não foi possível registrar a assinatura no banco legado.');
    error.statusCode = 503;
    error.cause = cause;
    throw error;
  }
}
