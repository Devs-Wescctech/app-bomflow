// Validação e normalização puras usadas pela importação de leads PF.
// Mantidas separadas da rota para poderem ser testadas sem tocar no banco.

export const UFS = new Set([
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
  'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'
]);

export function normalizePhone(raw) {
  if (raw === null || raw === undefined) return '';
  let digits = String(raw).replace(/\D/g, '');
  // remove código do país 55 quando presente
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) {
    digits = digits.slice(2);
  }
  return digits;
}

export function isValidPhone(digits) {
  if (!digits) return false;
  if (digits.length !== 10 && digits.length !== 11) return false;
  const ddd = parseInt(digits.slice(0, 2), 10);
  if (ddd < 11 || ddd > 99) return false;
  if (/^(\d)\1+$/.test(digits)) return false;
  return true;
}

export function normalizeCpf(raw) {
  if (raw === null || raw === undefined) return '';
  let digits = String(raw).replace(/\D/g, '');
  // Excel pode remover zeros à esquerda
  if (digits.length > 0 && digits.length < 11) {
    digits = digits.padStart(11, '0');
  }
  return digits;
}

export function isValidCpf(cpf) {
  if (!cpf || cpf.length !== 11) return false;
  if (/^(\d)\1+$/.test(cpf)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(cpf[i], 10) * (10 - i);
  let d1 = (sum * 10) % 11;
  if (d1 === 10) d1 = 0;
  if (d1 !== parseInt(cpf[9], 10)) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(cpf[i], 10) * (11 - i);
  let d2 = (sum * 10) % 11;
  if (d2 === 10) d2 = 0;
  return d2 === parseInt(cpf[10], 10);
}

export function formatCpf(digits) {
  if (!digits || digits.length !== 11) return digits || '';
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

// Valida uma linha e retorna { status, reason, normalized }
export function validateRow(row) {
  const nome = String(row.nome ?? '').trim();
  const cidade = String(row.cidade ?? '').trim();
  const uf = String(row.uf ?? '').trim().toUpperCase();
  const cpfDigits = normalizeCpf(row.cpf);
  const phoneDigits = normalizePhone(row.telefone);

  if (!nome) {
    return { status: 'error', reason: 'Nome vazio' };
  }
  if (!phoneDigits) {
    return { status: 'error', reason: 'Telefone vazio' };
  }
  if (!isValidPhone(phoneDigits)) {
    return { status: 'error', reason: 'Telefone inválido' };
  }
  if (cpfDigits && !isValidCpf(cpfDigits)) {
    return { status: 'error', reason: 'CPF inválido' };
  }
  if (uf && !UFS.has(uf)) {
    return { status: 'error', reason: 'UF inexistente' };
  }

  return {
    status: 'valid',
    normalized: {
      name: nome,
      cpf: cpfDigits ? formatCpf(cpfDigits) : null,
      cpfDigits: cpfDigits || null,
      city: cidade || null,
      state: uf || null,
      phone: phoneDigits
    }
  };
}

// Marca duplicados (banco via dupMap e dentro do próprio lote) in-place.
export function markDuplicates(results, dupMap = new Map()) {
  const seenPhones = new Set();
  const seenCpfs = new Set();
  for (const r of results) {
    if (r.status !== 'valid') continue;
    const dbDupPhone = dupMap.get(`p:${r.normalized.phone}`);
    const dbDupCpf = r.normalized.cpfDigits ? dupMap.get(`c:${r.normalized.cpfDigits}`) : null;
    if (dbDupPhone || dbDupCpf) {
      r.status = 'duplicate';
      r.reason = dbDupPhone || dbDupCpf;
      continue;
    }
    if (seenPhones.has(r.normalized.phone)) {
      r.status = 'duplicate';
      r.reason = 'Telefone duplicado na própria planilha';
      continue;
    }
    if (r.normalized.cpfDigits && seenCpfs.has(r.normalized.cpfDigits)) {
      r.status = 'duplicate';
      r.reason = 'CPF duplicado na própria planilha';
      continue;
    }
    seenPhones.add(r.normalized.phone);
    if (r.normalized.cpfDigits) seenCpfs.add(r.normalized.cpfDigits);
  }
  return results;
}
