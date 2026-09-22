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
