import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const essentialPages = path.resolve(__dirname, '../../public/essential-contract');
const bomPetPages = path.resolve(__dirname, '../../public/bom-pet-contract');

export const CONTRACT_PRODUCTS = Object.freeze({
  BOM_AUTO: 'bom_auto',
  ESSENCIAL: 'essencial',
  BOM_PET: 'bom_pet',
});

export const BOM_PET_PET_LAYOUT = Object.freeze({
  firstRowY: 135.8,
  rowGap: 21.5,
  nameSize: 8.5,
  detailsOffsetY: 8.7,
  detailsSize: 8,
  sexOffsetY: Object.freeze([0, -0.35, -0.7]),
});

export const ESSENTIAL_BASE_PRODUCT_IDS = Object.freeze([
  47843569,
  47843600,
  47987576,
  47212241,
  52246882,
  52246915,
  52246948,
  203596104,
  203596587,
  203596810,
]);

// Produtos-base do contrato legado "Bom Pet - Pequeno Amigo".
// Itens técnicos de nome do pet e produtos "Bom Pet Saúde" não entram aqui.
export const BOM_PET_BASE_PRODUCT_IDS = Object.freeze([
  47225321, // BOM PET (3 PETS)
  47225213, // BOM PET (1 PET)
  47225134, // CAMPINAS - BOM PET (3 PETS)
  47224940, // LIMEIRA - BOM PET (3 PETS)
  47892080, // POÇOS DE CALDAS - BOM PET (3 PETS)
  47225103, // CAMPINAS - BOM PET (1 PET)
  58947582, // CAMPINAS - BOM PET 2
  58947899, // CAMPINAS - BOM PET 4
]);

// A view legada do ERP (vw_report_api_com_quilometragem), usada pelo gerador
// oficial, define a adesão do Essencial como um valor fixo de R$ 50,00.
export const ESSENTIAL_ADHESION_VALUE = 50;

const ESSENTIAL_PAYMENT_PLAN_IDS = Object.freeze({
  cpfl: new Set([32922780]),
  bank: new Set([25451, 48296791, 40564923, 48286734, 1643483, 48295856, 82623870]),
  credit_card: new Set([46285, 47214448, 48395023, 88733784]),
});

const PRODUCT_LABELS = Object.freeze({
  [CONTRACT_PRODUCTS.BOM_AUTO]: 'Bom Auto',
  [CONTRACT_PRODUCTS.ESSENCIAL]: 'Essencial',
  [CONTRACT_PRODUCTS.BOM_PET]: 'Bom Pet',
});
const BRAZILIAN_STATES = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO',
  'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI',
  'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]);

const normalizeText = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toUpperCase();

const amountOf = (product) => {
  if (product?.valor_total != null) return Number(product.valor_total);
  return Number(product?.preco || 0) * Number(product?.quantidade || 0);
};

const roundCurrency = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const productMatches = (product, matcher) => matcher(normalizeText(product?.descricao));

export const contractProductLabel = (productKey) =>
  PRODUCT_LABELS[productKey] || null;

export const normalizeContractProduct = (value) =>
  Object.values(CONTRACT_PRODUCTS).includes(value) ? value : null;

export function detailMatchesContractProduct(detail, productKey) {
  const products = Array.isArray(detail?.produtos) ? detail.produtos : [];
  if (productKey === CONTRACT_PRODUCTS.ESSENCIAL) {
    return products.some((product) => ESSENTIAL_BASE_PRODUCT_IDS.includes(Number(product?.id)));
  }
  if (productKey === CONTRACT_PRODUCTS.BOM_AUTO) {
    return products.some((product) => productMatches(product, (description) =>
      description.includes('BOM AUTO') && description.includes('DADOS DO VEICULO')));
  }
  if (productKey === CONTRACT_PRODUCTS.BOM_PET) {
    return products.some((product) => BOM_PET_BASE_PRODUCT_IDS.includes(Number(product?.id)));
  }
  return false;
}

const normalizeCivilStatus = (value) => {
  const normalized = normalizeText(value);
  if (normalized === 'SO' || normalized.includes('SOLTEIR')) return 'SOLTEIRO';
  if (normalized === 'CA' || normalized.includes('CASAD')) return 'CASADO';
  return 'OUTROS';
};

const petFromPerson = (person) => {
  const rawName = String(person?.nome || '').trim();
  const slashParts = rawName
    .split(/\s*\/\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (slashParts.length >= 4) {
    return {
      name: slashParts[0] || '',
      type: slashParts[1] || '',
      breed: slashParts[2] || '',
      color: slashParts[3] || '',
      size: slashParts[4] || person?.porte || '',
      birth_date: person?.data_nascimento || null,
      sex: person?.sexo || null,
    };
  }
  const parts = rawName
    .split(/\s+-\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  return {
    name: parts[0] || '',
    type: person?.tipo || '',
    breed: parts[1] || '',
    color: parts.slice(2).join(' - '),
    size: person?.porte || '',
    birth_date: person?.data_nascimento || null,
    sex: person?.sexo || null,
  };
};

const isBomPetNameLink = (person) => (person?.produtos || []).some((description) => {
  const normalized = normalizeText(description);
  return normalized.includes('BOM PET')
    && normalized.includes('NOME DO PET')
    && !normalized.includes('SAUDE');
});

const saoPauloDate = (value) => {
  if (!(value instanceof Date)) return value;
  const parts = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).formatToParts(value);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
};

export function buildBomPetContractData(detail, generatedAt = new Date()) {
  const products = Array.isArray(detail?.produtos) ? detail.produtos : [];
  const people = Array.isArray(detail?.pessoas) ? detail.pessoas : [];
  const holder = detail?.titular || people.find((person) => person?.is_titular);
  const baseProducts = products.filter((product) =>
    BOM_PET_BASE_PRODUCT_IDS.includes(Number(product?.id)));
  return {
    name: holder?.nome || null,
    cpf: holder?.cpf || null,
    rg: holder?.rg || null,
    birth_date: holder?.data_nascimento || null,
    sex: holder?.sexo || null,
    marital_status: normalizeCivilStatus(holder?.estado_civil),
    profession: holder?.profissao || 'Outros',
    address: detail?.endereco?.logradouro || holder?.endereco?.logradouro || null,
    complement: detail?.endereco?.complemento || holder?.endereco?.complemento || null,
    number: detail?.endereco?.numero || holder?.endereco?.numero || null,
    district: detail?.endereco?.bairro || holder?.endereco?.bairro || null,
    city: detail?.endereco?.cidade || holder?.endereco?.cidade || null,
    state: detail?.endereco?.uf || holder?.endereco?.uf || null,
    cep: detail?.endereco?.cep || holder?.endereco?.cep || null,
    phone: holder?.telefone || null,
    // O modelo legado repete o telefone do pedido em Comercial/Recado.
    // Não associe um segundo contato genérico do cadastro a esse campo.
    phone2: holder?.telefone || null,
    email: detail?.email || holder?.email || null,
    payment_plan: detail?.plano_pagamento || null,
    generated_at: saoPauloDate(generatedAt),
    monthly_value: roundCurrency(baseProducts.reduce((total, product) => total + amountOf(product), 0)),
    pets: people.filter((person) => !person?.is_titular && isBomPetNameLink(person)).map(petFromPerson),
  };
}

export const bomPetPaymentCategory = (description) => {
  const normalized = normalizeText(description);
  if (normalized.includes('COBRADOR')) return 'collector';
  if ([
    'BOLETO',
    'BANCARI',
    'BANCO',
    'CONTA CORRENTE',
    'PIX',
    'CARNE',
  ].some((term) => normalized.includes(term))) return 'bank';
  return null;
};

export function validateBomPetContractData(data) {
  const errors = [];
  const required = [
    ['nome do titular', data?.name],
    ['CPF do titular', data?.cpf],
    ['data de nascimento do titular', data?.birth_date],
    ['sexo do titular', data?.sex],
    ['endereço', data?.address],
    ['número do endereço', data?.number],
    ['bairro', data?.district],
    ['cidade', data?.city],
    ['estado', data?.state],
    ['CEP', data?.cep],
    ['telefone', data?.phone],
    ['e-mail', data?.email],
    ['plano de pagamento', data?.payment_plan],
    ['data de geração', data?.generated_at],
  ];
  required.forEach(([label, value]) => {
    if (!String(value ?? '').trim()) errors.push(`Campo obrigatório ausente: ${label}.`);
  });
  const cpf = String(data?.cpf || '').replace(/\D/g, '');
  const cpfNumbers = cpf.split('').map(Number);
  const cpfDigit = (length) => {
    const total = cpfNumbers.slice(0, length)
      .reduce((sum, digit, index) => sum + digit * (length + 1 - index), 0);
    const rest = (total * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  if (cpf.length !== 11
    || /^(\d)\1{10}$/.test(cpf)
    || cpfDigit(9) !== cpfNumbers[9]
    || cpfDigit(10) !== cpfNumbers[10]) {
    errors.push('CPF do titular inválido.');
  }
  const parsedDate = (value) => {
    const match = String(value instanceof Date ? value.toISOString() : value || '')
      .match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return null;
    const parsed = new Date(`${match[1]}-${match[2]}-${match[3]}T12:00:00Z`);
    if (Number.isNaN(parsed.valueOf())
      || parsed.getUTCFullYear() !== Number(match[1])
      || parsed.getUTCMonth() + 1 !== Number(match[2])
      || parsed.getUTCDate() !== Number(match[3])) return null;
    return parsed;
  };
  const generatedDate = parsedDate(data?.generated_at);
  const holderBirthDate = parsedDate(data?.birth_date);
  if (data?.generated_at && !generatedDate) errors.push('Data de geração inválida.');
  if (data?.birth_date && !holderBirthDate) errors.push('Data de nascimento do titular inválida.');
  if (generatedDate && holderBirthDate && holderBirthDate > generatedDate) {
    errors.push('Data de nascimento do titular posterior à geração do contrato.');
  }
  if (data?.sex && !/^[FM]$/i.test(String(data.sex).trim())) errors.push('Sexo do titular inválido.');
  if (!BRAZILIAN_STATES.has(normalizeText(data?.state))) errors.push('Estado do endereço inválido.');
  if (!/^\d{8}$/.test(String(data?.cep || '').replace(/\D/g, ''))) errors.push('CEP inválido.');
  if (!/^\d{10,11}$/.test(String(data?.phone || '').replace(/\D/g, ''))) errors.push('Telefone inválido.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(data?.email || '').trim())) errors.push('E-mail inválido.');
  if (data?.payment_plan && !bomPetPaymentCategory(data.payment_plan)) {
    errors.push('A forma de pagamento do Bom Pet não corresponde às opções do contrato.');
  }
  if (!Number.isFinite(Number(data?.monthly_value)) || Number(data?.monthly_value) <= 0) {
    errors.push('Valor mensal do Bom Pet inválido.');
  }
  const pets = Array.isArray(data?.pets) ? data.pets : [];
  if (pets.length === 0) errors.push('Nenhum pet vinculado ao produto Bom Pet foi encontrado.');
  if (pets.length > 3) errors.push('O modelo Bom Pet comporta no máximo 3 pets.');
  pets.forEach((pet, index) => {
    const prefix = `Pet ${index + 1}`;
    if (!pet?.name) errors.push(`${prefix}: nome ausente.`);
    if (!pet?.breed) errors.push(`${prefix}: raça ausente.`);
    if (!pet?.color) errors.push(`${prefix}: cor ausente.`);
    if (!pet?.birth_date) errors.push(`${prefix}: data de nascimento ausente.`);
    if (!pet?.sex) errors.push(`${prefix}: sexo ausente.`);
    const petBirthDate = parsedDate(pet?.birth_date);
    if (pet?.birth_date && !petBirthDate) errors.push(`${prefix}: data de nascimento inválida.`);
    if (generatedDate && petBirthDate && petBirthDate > generatedDate) {
      errors.push(`${prefix}: data de nascimento posterior à geração do contrato.`);
    }
    if (pet?.sex && !/^[FM]$/i.test(String(pet.sex).trim())) errors.push(`${prefix}: sexo inválido.`);
  });
  return errors;
}

const relationLabel = (value) => ({
  P: 'Pai',
  M: 'Mãe',
  F: 'Filho/Filha',
  S: 'Sogro/Sogra',
  C: 'Cônjuge',
  D: 'Dependente',
}[normalizeText(value)] || null);

export const essentialPaymentCategory = (value, planId = null) => {
  const hasPlanId = planId != null && String(planId).trim() !== '';
  const numericPlanId = Number(planId);
  if (hasPlanId) {
    if (!Number.isFinite(numericPlanId)) return null;
    for (const [category, ids] of Object.entries(ESSENTIAL_PAYMENT_PLAN_IDS)) {
      if (ids.has(numericPlanId)) return category;
    }
    return null;
  }
  const payment = normalizeText(value);
  if (payment.includes('CPFL')) return 'cpfl';
  if (payment.includes('CARTAO') && payment.includes('CREDITO')) return 'credit_card';
  if (payment.includes('BOLETO')
    || payment.includes('BANCARI')
    || payment.includes('BANCO')
    || payment.includes('PIX')
    || payment.includes('CARNE')) return 'bank';
  return null;
};

export const essentialLowerDueCheckX = (day) => ({
  10: 306.14,
  15: 360,
  20: 413.86,
  25: 467.72,
})[Number(day)] ?? null;

const linkedEssentialProducts = (person) => (person?.produtos || [])
  .map(normalizeText)
  .filter((description) => description.includes('ESSENCIAL DEPENDENTE'));

export function buildEssentialContractData(detail) {
  const products = Array.isArray(detail?.produtos) ? detail.produtos : [];
  const people = Array.isArray(detail?.pessoas) ? detail.pessoas : [];
  const holder = detail?.titular || people.find((person) => person?.is_titular);
  const findAmount = (matcher) => products
    .filter((product) => productMatches(product, matcher))
    .reduce((total, product) => total + amountOf(product), 0);
  const baseProduct = products.find((product) => ESSENTIAL_BASE_PRODUCT_IDS.includes(Number(product?.id)));
  const dependents = people
    .filter((person) => !person?.is_titular && linkedEssentialProducts(person).length > 0)
    .sort((left, right) => Number(right?.source_order || 0) - Number(left?.source_order || 0))
    .map((person) => {
      const linked = linkedEssentialProducts(person);
      const price = products
        .filter((product) => linked.includes(normalizeText(product?.descricao)))
        .reduce((total, product) => total + Number(product?.preco || 0), 0);
      return {
        name: person.nome,
        sex: person.sexo,
        relationship: relationLabel(person.parentesco),
        birth_date: person.data_nascimento,
        phone: person.telefone,
        price,
      };
    });
  const dependentTotal = dependents.reduce((total, dependent) => total + Number(dependent.price || 0), 0);
  const cremationValue = findAmount((description) => description.includes('CREMAC'));
  const flowersValue = findAmount((description) => description.includes('COROA DE FLORES'));
  const mileageValue = findAmount((description) => description.includes('QUILOMETR'));
  const totalValue = detail?.valor_total ?? detail?.valor_mensal;
  const residualBaseValue = totalValue == null
    ? null
    : roundCurrency(Number(totalValue) - dependentTotal - cremationValue - flowersValue - mileageValue);
  return {
    name: holder?.nome,
    cpf: holder?.cpf,
    rg: holder?.rg,
    birth_date: holder?.data_nascimento,
    sex: holder?.sexo,
    marital_status: holder?.estado_civil,
    profession: holder?.profissao,
    address: detail?.endereco?.logradouro,
    number: detail?.endereco?.numero,
    complement: detail?.endereco?.complemento,
    district: detail?.endereco?.bairro,
    city: detail?.endereco?.cidade,
    state: detail?.endereco?.uf || detail?.endereco?.estado,
    cep: detail?.endereco?.cep,
    phone: holder?.telefone,
    phone2: detail?.telefone_secundario,
    email: detail?.email,
    payment_plan: detail?.plano_pagamento,
    payment_plan_id: detail?.plano_pagamento_id,
    due_day: detail?.dia_vencimento,
    issue_date: detail?.data_emissao,
    observations: detail?.observacoes,
    income: holder?.renda ?? detail?.renda ?? null,
    adhesion: ESSENTIAL_ADHESION_VALUE,
    base_value: Number.isFinite(residualBaseValue)
      ? residualBaseValue
      : (baseProduct ? amountOf(baseProduct) : null),
    dependent_value: dependentTotal,
    cremation_value: cremationValue,
    flowers_value: flowersValue,
    mileage_value: mileageValue,
    total_value: totalValue,
    dependents,
  };
}

export function validateEssentialContractData(data) {
  const required = [
    ['name', 'nome do titular'],
    ['cpf', 'CPF'],
    ['birth_date', 'data de nascimento'],
    ['sex', 'sexo'],
    ['address', 'endereço'],
    ['number', 'número'],
    ['district', 'bairro'],
    ['city', 'cidade'],
    ['state', 'UF'],
    ['cep', 'CEP'],
    ['phone', 'telefone'],
    ['email', 'e-mail'],
    ['payment_plan', 'plano de pagamento'],
    ['issue_date', 'data de emissão'],
    ['base_value', 'valor do plano base'],
    ['total_value', 'valor mensal total'],
  ];
  const missing = required
    .filter(([key]) => data?.[key] == null || String(data[key]).trim() === '')
    .map(([, label]) => label);
  const errors = missing.length ? [`Dados obrigatórios ausentes: ${missing.join(', ')}.`] : [];
  const cpf = String(data?.cpf || '').replace(/\D/g, '');
  const cpfDigits = cpf.split('').map(Number);
  const cpfDigit = (length) => {
    const total = cpfDigits.slice(0, length)
      .reduce((sum, digit, index) => sum + digit * (length + 1 - index), 0);
    const rest = (total * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  if (cpf.length !== 11
    || /^(\d)\1{10}$/.test(cpf)
    || cpfDigit(9) !== cpfDigits[9]
    || cpfDigit(10) !== cpfDigits[10]) {
    errors.push('O CPF do titular é inválido.');
  }
  const isValidDate = (value) => {
    const match = String(value instanceof Date ? value.toISOString() : value || '')
      .match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return false;
    const parsed = new Date(`${match[1]}-${match[2]}-${match[3]}T12:00:00Z`);
    return !Number.isNaN(parsed.valueOf())
      && parsed.getUTCFullYear() === Number(match[1])
      && parsed.getUTCMonth() + 1 === Number(match[2])
      && parsed.getUTCDate() === Number(match[3]);
  };
  if (data?.birth_date && !isValidDate(data.birth_date)) errors.push('A data de nascimento do titular é inválida.');
  if (data?.issue_date && !isValidDate(data.issue_date)) errors.push('A data de emissão é inválida.');
  if (data?.sex && !/^[FM]$/i.test(String(data.sex).trim())) errors.push('O sexo do titular é inválido.');
  if (data?.state && !BRAZILIAN_STATES.has(String(data.state).trim().toUpperCase())) {
    errors.push('A UF do titular é inválida.');
  }
  if (data?.cep && !/^\d{8}$/.test(String(data.cep).replace(/\D/g, ''))) errors.push('O CEP do titular é inválido.');
  if (data?.phone && !/^\d{10,11}$/.test(String(data.phone).replace(/\D/g, ''))) {
    errors.push('O telefone do titular é inválido.');
  }
  if (data?.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(data.email).trim())) {
    errors.push('O e-mail do titular é inválido.');
  }
  const paymentCategory = essentialPaymentCategory(data?.payment_plan, data?.payment_plan_id);
  if (data?.payment_plan && !paymentCategory) {
    errors.push('A forma de pagamento do Essencial não corresponde às opções homologadas.');
  }
  if (paymentCategory !== 'cpfl' && !/^(10|15|20|25)$/.test(String(data?.due_day || ''))) {
    errors.push('O vencimento do Essencial deve ser nos dias 10, 15, 20 ou 25.');
  }
  if ((data?.dependents || []).length > 20) {
    errors.push('O contrato Essencial suporta no máximo 20 dependentes.');
  }
  if (String(data?.observations || '').trim().length > 240) {
    errors.push('As observações do Essencial excedem o espaço disponível no contrato.');
  }
  for (const [index, dependent] of (data?.dependents || []).entries()) {
    const absent = [
      ['name', 'nome'],
      ['sex', 'sexo'],
      ['relationship', 'grau de parentesco'],
      ['birth_date', 'data de nascimento'],
      ['phone', 'celular'],
      ['price', 'valor'],
    ].filter(([key]) => dependent?.[key] == null || String(dependent[key]).trim() === '')
      .map(([, label]) => label);
    if (absent.length) errors.push(`Dependente ${index + 1}: campos ausentes: ${absent.join(', ')}.`);
    if (dependent?.sex && !/^[FM]$/i.test(String(dependent.sex).trim())) {
      errors.push(`Dependente ${index + 1}: sexo inválido.`);
    }
    if (dependent?.birth_date && !isValidDate(dependent.birth_date)) {
      errors.push(`Dependente ${index + 1}: data de nascimento inválida.`);
    }
    if (dependent?.phone && !/^\d{10,11}$/.test(String(dependent.phone).replace(/\D/g, ''))) {
      errors.push(`Dependente ${index + 1}: celular inválido.`);
    }
  }
  const monetaryFields = [
    ['adhesion', 'adesão'],
    ['base_value', 'plano base'],
    ['dependent_value', 'dependentes'],
    ['cremation_value', 'cremação'],
    ['flowers_value', 'coroa de flores'],
    ['mileage_value', 'quilometragem'],
    ['total_value', 'mensalidade total'],
  ];
  for (const [key, label] of monetaryFields) {
    const value = Number(data?.[key]);
    if (!Number.isFinite(value) || value < 0) errors.push(`O valor de ${label} é inválido.`);
  }
  for (const [index, dependent] of (data?.dependents || []).entries()) {
    if (!Number.isFinite(Number(dependent?.price)) || Number(dependent.price) < 0) {
      errors.push(`Dependente ${index + 1}: valor inválido.`);
    }
  }
  const composedTotal = [
    data?.base_value,
    data?.dependent_value,
    data?.cremation_value,
    data?.flowers_value,
    data?.mileage_value,
  ].reduce((total, value) => total + Number(value || 0), 0);
  if (Number.isFinite(Number(data?.total_value))
    && Number.isFinite(composedTotal)
    && Math.abs(composedTotal - Number(data.total_value)) > 0.05) {
    errors.push('Os valores dos produtos do Essencial não correspondem ao total mensal do pedido.');
  }
  return errors;
}

const dateParts = (value) => {
  if (!value) return null;
  const match = String(value instanceof Date ? value.toISOString() : value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const month = new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(`${match[1]}-${match[2]}-${match[3]}T12:00:00-03:00`));
  return {
    year: match[1],
    month_number: match[2],
    month: month.charAt(0).toUpperCase() + month.slice(1),
    day: match[3],
  };
};

const money = (value) => {
  const amount = Number(value || 0);
  if (amount === 0) return '0.00';
  return amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatCpf = (value) => {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 11);
  return digits.length === 11
    ? digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
    : String(value || '');
};

const formatPhone = (value) => {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 11);
  if (digits.length === 11) return digits.replace(/(\d{2})(\d{5})(\d{4})/, '$1 $2-$3');
  if (digits.length === 10) return digits.replace(/(\d{2})(\d{4})(\d{4})/, '$1 $2-$3');
  return String(value || '');
};

export function renderEssentialPdf(data) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: false });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    const write = (value, x, y, {
      size = 11,
      width = null,
      align = 'left',
      minSize = 6,
    } = {}) => {
      const content = String(value ?? '').trim();
      if (!content) return;
      doc.font('Times-Roman');
      let fontSize = size;
      doc.fontSize(fontSize);
      while (width && doc.widthOfString(content) > width && fontSize > minSize) {
        fontSize -= 0.5;
        doc.fontSize(fontSize);
      }
      doc.text(content, x, y, {
        width: width || undefined,
        align,
        lineBreak: false,
      });
    };
    const writeMultiline = (value, x, y, {
      size = 9,
      width,
      height,
      minSize = 5,
    }) => {
      const content = String(value ?? '').trim();
      if (!content) return;
      doc.font('Times-Roman');
      let fontSize = size;
      doc.fontSize(fontSize);
      while (doc.heightOfString(content, { width, lineGap: 0 }) > height && fontSize > minSize) {
        fontSize -= 0.5;
        doc.fontSize(fontSize);
      }
      if (doc.heightOfString(content, { width, lineGap: 0 }) > height) {
        throw new Error('As observações excedem o espaço disponível no contrato Essencial.');
      }
      doc.text(content, x, y, { width, height, lineGap: 0 });
    };
    const issue = dateParts(data.issue_date);
    const addBackgroundPage = (page) => {
      doc.addPage();
      const background = path.join(essentialPages, `page-${page}.jpg`);
      if (!fs.existsSync(background)) {
        throw new Error(`Página ${page} do modelo Essencial não encontrada.`);
      }
      doc.image(background, 0, 0, { width: 595.28, height: 841.89 });
      doc.fillColor('#111');
    };
    const writePageFive = (dependentOffset = 0) => {
        write(money(data.adhesion), 82.21, 119.1);
        write(money(data.base_value), 153.07, 119.1);
        write(money(data.dependent_value), 229.61, 119.1);
        write(money(data.cremation_value), 300.47, 119.1);
        write(money(data.flowers_value), 374.17, 119.1);
        write(money(data.mileage_value), 447.87, 119.1);
        write(money(data.total_value), 525.83, 119.1);
        const dueCheckX = { 10: 59.53, 15: 147, 20: 229, 25: 306 }[Number(data.due_day)];
        if (dueCheckX != null) write('X', dueCheckX, 147.44);
        write(data.name, 73.7, 172.96, { width: 330 });
        const holderSexX = normalizeText(data.sex).startsWith('F') ? 433.7 : 416.7;
        write('X', holderSexX, 172.96);
        const civil = normalizeText(data.marital_status);
        write('X', civil.includes('SOLTEIR') ? 467.72 : (civil.includes('CASAD') ? 484 : 500), 172.96);
        if (issue) {
          const birth = dateParts(data.birth_date);
          if (birth) {
            write(birth.day, 510.24, 172.96);
            write(birth.month_number, 532.24, 172.96);
            write(birth.year, 554.24, 172.96);
          }
        }
        write(formatCpf(data.cpf), 73.7, 192.8);
        write(data.rg, 328.82, 192.8);
        write([data.address, data.complement].filter(Boolean).join(' - '), 73.7, 212.64, { width: 450 });
        write(data.number, 532.91, 212.64, { width: 42 });
        write(data.district, 73.7, 229.65, { width: 210 });
        write(data.city, 308.98, 229.65, { width: 225 });
        write(data.state, 73.7, 251.48);
        const cep = String(data.cep || '').replace(/\D/g, '').slice(0, 8);
        [102.05, 116.22, 130.39, 141.73, 155.91, 178.58, 189.92, 204.09]
          .forEach((x, index) => write(cep[index], x, 251.48));
        write(String(data.phone || '').replace(/\D/g, ''), 229.61, 251.48, { width: 135 });
        write(String(data.phone2 || '').replace(/\D/g, ''), 382.68, 251.48, { width: 135 });
        write(data.profession || 'Outros', 73.7, 269.9, { width: 150 });
        write(data.income, 198.43, 269.9, { width: 95 });
        write(data.email, 306.14, 269.9, { width: 265 });
        (data.dependents || []).slice(dependentOffset, dependentOffset + 10).forEach((dependent, index) => {
          const y = 327.49 + index * 18.43;
          write(dependent.name, 90.71, y, { size: 9, width: 215 });
          write('X', normalizeText(dependent.sex).startsWith('F') ? 314.65 : 331.65, y - 0.76, { size: 11 });
          write(dependent.relationship, 351.5, y, { size: 9, width: 61 });
          const birth = dateParts(dependent.birth_date);
          if (birth) {
            write(birth.day, 416.69, y, { size: 9 });
            write(birth.month_number, 434.69, y, { size: 9 });
            write(birth.year, 452.69, y, { size: 9 });
          }
          write(formatPhone(dependent.phone), 479.06, y, { size: 9, width: 68 });
          write(money(dependent.price), 548, y, { size: 9, width: 24, align: 'right' });
        });
        write(money(data.dependent_value), 545.01, 521.62, { width: 25, align: 'right' });
        writeMultiline(data.observations, 96.38, 532.91, {
          width: 480,
          height: 21.25,
        });
        const paymentCategory = essentialPaymentCategory(data.payment_plan, data.payment_plan_id);
        const paymentCheckX = {
          cpfl: 320,
          bank: 423.78,
          credit_card: 478,
        }[paymentCategory];
        write('X', paymentCheckX, 557.81, { size: 9 });
        if (issue) {
          write(issue.day, 104.88, 572.64);
          write(issue.month, 144.57, 572.64);
          write(issue.year, 212.6, 572.64);
        }
        const lowerDueX = essentialLowerDueCheckX(data.due_day);
        if (paymentCategory !== 'cpfl' && lowerDueX != null) write('X', lowerDueX, 599.57);
    };
    try {
      for (let page = 1; page <= 14; page += 1) {
        addBackgroundPage(page);
        if (page === 5) {
          writePageFive(0);
          if ((data.dependents || []).length > 10) {
            addBackgroundPage(5);
            writePageFive(10);
          }
        }
        if (page === 14 && issue) {
          write(issue.day, 371.34, 637.45, { size: 12 });
          write(issue.month, 422.36, 637.45, { size: 12 });
          write(issue.year.slice(-2), 547.09, 637.45, { size: 12 });
        }
      }
      doc.end();
    } catch (error) {
      doc.end();
      reject(error);
    }
  });
}

const petAge = (birthDate, referenceDate) => {
  const birth = dateParts(birthDate);
  const reference = dateParts(referenceDate);
  if (!birth || !reference) return '';
  let years = Number(reference.year) - Number(birth.year);
  let months = Number(reference.month_number) - Number(birth.month_number);
  if (Number(reference.day) < Number(birth.day)) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  return `${Math.max(0, years)} anos ${String(Math.max(0, months)).padStart(2, '0')} meses`;
};

export function renderBomPetPdf(data) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: false });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    const mm = (value) => value * 72 / 25.4;
    const write = (value, x, y, { size = 11, width = null, minSize = 6 } = {}) => {
      const content = String(value ?? '').trim();
      if (!content) return;
      doc.font('Times-Roman').fontSize(size);
      let fontSize = size;
      while (width && doc.widthOfString(content) > mm(width) && fontSize > minSize) {
        fontSize -= 0.5;
        doc.fontSize(fontSize);
      }
      doc.text(content, mm(x + 1), mm(y + 1), {
        width: width ? mm(width) : undefined,
        lineBreak: false,
      });
    };
    const addBackgroundPage = (page) => {
      doc.addPage();
      const background = path.join(bomPetPages, `page-${page}.jpg`);
      if (!fs.existsSync(background)) throw new Error(`Página ${page} do modelo Bom Pet não encontrada.`);
      doc.image(background, 0, 0, { width: 595.28, height: 841.89 });
      doc.fillColor('#111');
    };
    try {
      const generated = dateParts(data.generated_at);
      const birth = dateParts(data.birth_date);
      for (let page = 1; page <= 7; page += 1) {
        addBackgroundPage(page);
        if (page === 3) {
          write(data.name, 25, 69, { width: 118 });
          write('X', normalizeText(data.sex).startsWith('F') ? 151 : 146, 69);
          const civil = normalizeText(data.marital_status);
          write('X', civil.includes('SOLTEIR') ? 159 : (civil.includes('CASAD') ? 164 : 169), 69);
          if (birth) write(`${birth.day}    ${birth.month_number}    ${birth.year}`, 179, 69);
          write(formatCpf(data.cpf), 25, 77, { width: 88 });
          write(data.rg, 115, 77, { width: 85 });
          write([data.address, data.complement].filter(Boolean).join(' - '), 25, 85, { width: 157 });
          write(data.number, 185, 85, { width: 18 });
          write(data.district, 25, 93, { width: 78 });
          write(data.city, 108, 93, { width: 93 });
          write(data.state, 25, 100);
          write(data.cep, 36, 100, { width: 38 });
          write(String(data.phone || '').replace(/\D/g, ''), 78, 100, { width: 52 });
          write(String(data.phone2 || '').replace(/\D/g, ''), 133, 100, { width: 67 });
          write(data.profession || 'Outros', 25, 108, { width: 75 });
          write(data.email, 107, 108, { width: 95 });
          (data.pets || []).slice(0, 3).forEach((pet, index) => {
            const y = BOM_PET_PET_LAYOUT.firstRowY + index * BOM_PET_PET_LAYOUT.rowGap;
            write(pet.name, 25, y, { size: BOM_PET_PET_LAYOUT.nameSize, width: 118 });
            const sexY = y + BOM_PET_PET_LAYOUT.sexOffsetY[index];
            write('X', normalizeText(pet.sex).startsWith('F') ? 157 : 153, sexY, { size: 9 });
            const detailsY = y + BOM_PET_PET_LAYOUT.detailsOffsetY;
            write(pet.breed, 25, detailsY, { size: BOM_PET_PET_LAYOUT.detailsSize, width: 65 });
            write(pet.color, 95, detailsY, { size: BOM_PET_PET_LAYOUT.detailsSize, width: 48 });
            write(petAge(pet.birth_date, data.generated_at), 148, detailsY, {
              size: BOM_PET_PET_LAYOUT.detailsSize,
              width: 38,
            });
            const size = normalizeText(pet.size);
            const sizeX = size.startsWith('P') ? 180 : (size.startsWith('M') ? 186 : (size.startsWith('G') ? 192 : null));
            if (sizeX) write('X', sizeX, y + 8.5, { size: 9 });
          });
          write(money(data.monthly_value), 175, 210, { width: 25 });
          if (generated) {
            write(generated.day, 35, 213);
            write(generated.month, 50, 213, { width: 20 });
            write(generated.year, 75, 213);
          }
          write('X', bomPetPaymentCategory(data.payment_plan) === 'collector' ? 190.5 : 169.5, 216);
        }
        if (page === 7 && generated) {
          write(generated.day, 115, 221, { size: 12 });
          write(generated.month, 131, 221, { size: 12, width: 40 });
          write(generated.year.slice(-2), 173, 221, { size: 12 });
        }
      }
      doc.end();
    } catch (error) {
      doc.end();
      reject(error);
    }
  });
}