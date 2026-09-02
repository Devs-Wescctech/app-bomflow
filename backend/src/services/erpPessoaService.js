const ERP_BASE = 'http://erp.wescctech.com.br:8080/BP_MULTI/api';
const cpfResolutionLocks = new Map();

function formatCpf(cpf) {
  const digits = String(cpf ?? '').replace(/\D/g, '');
  if (digits.length !== 11) return null;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function getRows(data) {
  return data?.results || data?.data || (Array.isArray(data) ? data : []);
}

function cpfDigits(pessoa) {
  const direct = pessoa?.cpf || pessoa?.documento;
  if (direct) return String(direct).replace(/\D/g, '');
  const doc = (pessoa?.documentos || []).find((item) =>
    String(item?.tipo_documento || item?.tipo || '').toUpperCase() === 'CPF'
  );
  return String(doc?.documento || '').replace(/\D/g, '');
}

function normalizeDate(value) {
  if (!value) return null;
  const text = String(value).trim();
  const iso = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const br = text.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return br ? `${br[3]}-${br[2]}-${br[1]}` : null;
}

function serializePessoa(pessoa, formattedCpf) {
  return {
    id: pessoa?.id ? Number(pessoa.id) : null,
    codigo: pessoa?.pessoa != null ? String(pessoa.pessoa) : (pessoa?.codigo ? String(pessoa.codigo) : null),
    nome: pessoa?.nome_completo || pessoa?.nome_titular || pessoa?.nome || '',
    cpf: pessoa?.cpf || pessoa?.documento || formattedCpf,
    data_nascimento: normalizeDate(pessoa?.data_nascimento || pessoa?.nascimento),
    situacao: pessoa?.situacao || null,
  };
}

async function erpRequest(token, url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  const data = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok || data?.error) {
    const error = new Error(data?.error || `ERP respondeu HTTP ${response.status}.`);
    error.code = response.status === 404 ? 'erp_pessoa_nao_encontrada' : 'erp_pessoa_indisponivel';
    error.statusCode = response.status >= 500 ? 502 : 400;
    throw error;
  }
  return data;
}

export async function lookupPessoaByCpf(token, cpf) {
  const formatted = formatCpf(cpf);
  if (!formatted) {
    const error = new Error('CPF inválido. Deve conter 11 dígitos.');
    error.statusCode = 400;
    throw error;
  }
  const data = await erpRequest(token, `${ERP_BASE}/Pessoas?cpf=${encodeURIComponent(formatted)}`);
  const rows = getRows(data);
  const exact = rows.filter((row) => cpfDigits(row) === formatted.replace(/\D/g, ''));
  const candidates = exact.length ? exact : rows;
  if (candidates.length > 1) {
    const error = new Error('Mais de uma Pessoa foi encontrada para este CPF no ERP.');
    error.code = 'erp_pessoas_ambiguas';
    error.statusCode = 409;
    throw error;
  }
  return candidates.length === 1 ? serializePessoa(candidates[0], formatted) : null;
}

export async function createPessoa(token, { nome, cpf, data_nascimento }) {
  const formatted = formatCpf(cpf);
  if (!formatted || !String(nome || '').trim()) {
    const error = new Error('Nome e CPF válidos são obrigatórios para cadastrar a Pessoa.');
    error.statusCode = 400;
    throw error;
  }
  const body = {
    tipo_pessoa: 'Física',
    situacao: 'A',
    nome_completo: String(nome).trim().toUpperCase(),
    documentos: [{ tipo_documento: 'CPF', documento: formatted }],
  };
  if (data_nascimento) body.data_nascimento = String(data_nascimento).slice(0, 10);
  const data = await erpRequest(token, `${ERP_BASE}/Pessoas`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const pessoa = serializePessoa(data, formatted);
  if (!pessoa.id) {
    const error = new Error('O ERP não retornou o identificador da Pessoa cadastrada.');
    error.statusCode = 502;
    throw error;
  }
  return pessoa;
}

async function confirmPessoaById(token, pessoa, cpf) {
  let lastError = null;
  for (const delayMs of [0, 250, 750]) {
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    try {
      const data = await erpRequest(token, `${ERP_BASE}/Pessoas/${encodeURIComponent(pessoa.id)}`);
      const raw = Array.isArray(data) ? data[0] : (data?.results?.[0] || data?.data?.[0] || data?.data || data);
      const confirmed = raw?.id ? serializePessoa(raw, formatCpf(cpf)) : null;
      if (confirmed?.id === pessoa.id) return confirmed;
    } catch (error) {
      lastError = error;
    }
  }
  const error = new Error(`O ERP não confirmou a Pessoa após o cadastro${lastError ? `: ${lastError.message}` : '.'}`);
  error.statusCode = 502;
  throw error;
}

// Somente os campos cadastrais homologados pelo endpoint Pessoas são enviados.
// Telefone/e-mail/endereço permanecem no registro do atendimento até existir uma
// API oficial de meios de contato.
export async function updatePessoa(token, pessoa, { nome, data_nascimento }) {
  const changes = {};
  if (nome && String(nome).trim() && String(nome).trim().toUpperCase() !== String(pessoa.nome || '').trim().toUpperCase()) {
    changes.nome_completo = String(nome).trim().toUpperCase();
  }
  const date = normalizeDate(data_nascimento);
  if (date && date !== pessoa.data_nascimento) changes.data_nascimento = date;
  if (!Object.keys(changes).length) return pessoa;
  if (!pessoa.id) {
    const error = new Error('A Pessoa encontrada não possui identificador para atualização.');
    error.statusCode = 502;
    throw error;
  }
  await erpRequest(token, `${ERP_BASE}/Pessoas/${encodeURIComponent(pessoa.id)}`, {
    method: 'PUT',
    body: JSON.stringify(changes),
  });
  const reread = await lookupPessoaByCpf(token, pessoa.cpf);
  if (!reread || (changes.nome_completo && reread.nome.toUpperCase() !== changes.nome_completo) ||
      (changes.data_nascimento && reread.data_nascimento !== changes.data_nascimento)) {
    const error = new Error('O ERP não confirmou a atualização dos dados da Pessoa.');
    error.statusCode = 502;
    throw error;
  }
  return reread;
}

export async function resolvePessoa(token, payload) {
  const key = String(payload.cpf || '').replace(/\D/g, '');
  const previous = cpfResolutionLocks.get(key) || Promise.resolve();
  let release;
  const slot = new Promise((resolve) => { release = resolve; });
  const tail = previous.then(() => slot);
  cpfResolutionLocks.set(key, tail);
  await previous;
  try {
    const existing = await lookupPessoaByCpf(token, payload.cpf);
    if (existing) return updatePessoa(token, existing, payload);
    try {
      const created = await createPessoa(token, payload);
      return await confirmPessoaById(token, created, payload.cpf);
    } catch (createError) {
      // Em múltiplas instâncias, a unicidade do próprio ERP ainda pode decidir
      // a corrida. Releia uma vez e reutilize a Pessoa vencedora.
      const concurrent = await lookupPessoaByCpf(token, payload.cpf).catch(() => null);
      if (concurrent) return updatePessoa(token, concurrent, payload);
      throw createError;
    }
  } finally {
    release();
    if (cpfResolutionLocks.get(key) === tail) cpfResolutionLocks.delete(key);
  }
}

export { formatCpf as formatPessoaCpf };