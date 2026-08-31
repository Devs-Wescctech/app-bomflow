export const BOM_PET_PARTNER_STATUSES = ['Ativo', 'Inativo'];

export function isValidPartnerDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const [year, month, day] = String(value).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

export function parsePartnerValue(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number'
    ? value
    : Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) / 100 : null;
}

export function validatePartnerPayload(payload = {}, { partial = false } = {}) {
  const errors = [];
  const normalized = {};

  if (!partial || Object.prototype.hasOwnProperty.call(payload, 'nome')) {
    const nome = String(payload.nome ?? '').trim();
    if (!nome) errors.push('Nome é obrigatório.');
    else if (nome.length > 255) errors.push('Nome deve ter no máximo 255 caracteres.');
    else normalized.nome = nome;
  }

  if (!partial || Object.prototype.hasOwnProperty.call(payload, 'valor_servico')) {
    const valor = parsePartnerValue(payload.valor_servico);
    if (valor === null) errors.push('Valor do serviço é obrigatório e deve ser um número maior ou igual a zero.');
    else normalized.valor_servico = valor;
  }

  if (!partial || Object.prototype.hasOwnProperty.call(payload, 'data_cadastro')) {
    const data = String(payload.data_cadastro ?? '');
    if (!isValidPartnerDate(data)) errors.push('Data de cadastro é obrigatória e deve usar o formato YYYY-MM-DD.');
    else normalized.data_cadastro = data;
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'email')) {
    const email = String(payload.email ?? '').trim();
    if (email.length > 255) errors.push('E-mail deve ter no máximo 255 caracteres.');
    else normalized.email = email || null;
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'telefone')) {
    const telefone = String(payload.telefone ?? '').replace(/\D/g, '').slice(0, 20);
    normalized.telefone = telefone || null;
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'status')) {
    if (!BOM_PET_PARTNER_STATUSES.includes(payload.status)) {
      errors.push('Status inválido. Use Ativo ou Inativo.');
    } else {
      normalized.status = payload.status;
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'data_exclusao')) {
    const data = String(payload.data_exclusao ?? '');
    if (data && !isValidPartnerDate(data)) {
      errors.push('Data de exclusão deve usar o formato YYYY-MM-DD.');
    } else {
      normalized.data_exclusao = data || null;
    }
  }

  return { errors, normalized };
}

export function partnerValueChanged(previousValue, nextValue) {
  const previous = Number(previousValue);
  const next = Number(nextValue);
  return Number.isFinite(previous) && Number.isFinite(next)
    ? Math.round(previous * 100) !== Math.round(next * 100)
    : previousValue !== nextValue;
}

export function canManageBomPetPartners({ userRole, agentType } = {}) {
  return userRole === 'admin' || agentType === 'admin';
}

export function snapshotActivePartner(partner) {
  if (!partner || partner.status !== 'Ativo') return null;
  const value = parsePartnerValue(partner.valor_servico);
  if (!partner.id || !String(partner.nome || '').trim() || value === null) return null;
  return {
    parceiro_id: partner.id,
    parceiro_nome: String(partner.nome).trim(),
    parceiro_valor: value,
  };
}