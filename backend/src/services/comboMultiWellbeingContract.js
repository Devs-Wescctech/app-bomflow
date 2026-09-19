import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pagesDir = path.resolve(__dirname, '../../public/combo-multi-wellbeing-contract');
const newPagesDir = path.resolve(__dirname, '../../public/new-combo-multi-wellbeing-contract');

export const COMBO_MULTI_WELLBEING_BASE_PRODUCT_IDS = Object.freeze([70690724]);
export const NEW_COMBO_MULTI_WELLBEING_BASE_PRODUCT_IDS = Object.freeze([250208807]);
export const COMBO_MULTI_WELLBEING_ADHESION = 60;
export const NEW_COMBO_OPTIONAL_PRODUCTS = Object.freeze({
  crown: Object.freeze([47843900, 47989280, 114742914]),
  cremation: Object.freeze([52247142]),
  mileage: Object.freeze([203567296, 203567310, 203567429, 203567456, 52247119]),
});
const NEW_COMBO_OPTIONAL_TEMPLATE_FILES = Object.freeze({
  crown: '01_coroa.jpg',
  cremation: 'cremacao.jpg',
  mileage: 'quilometragem.jpg',
});

const BANK_PAYMENT_PLAN_IDS = new Set([
  25451, 48296791, 40564923, 48286734, 1643483, 48295856, 82623870,
]);
const CREDIT_CARD_PAYMENT_PLAN_IDS = new Set([
  46285, 47214448, 48395023, 88733784,
]);

const text = (value) => String(value ?? '').trim();
const digits = (value) => text(value).replace(/\D/g, '');
const amount = (value) => Number(value || 0);
const rounded = (value) => Math.round((amount(value) + Number.EPSILON) * 100) / 100;
const normalized = (value) => text(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toUpperCase();

const compareLegacyValue = (left, right) => text(left).localeCompare(
  text(right),
  'pt-BR',
  { numeric: true, sensitivity: 'base' },
);
const comparableDate = (value) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return text(value);
};

export const sortComboMultiWellbeingDependents = (rows) => [...rows].sort((left, right) =>
  amount(left.price) - amount(right.price)
  || compareLegacyValue(left.phone, right.phone)
  || compareLegacyValue(comparableDate(left.birth_date), comparableDate(right.birth_date))
  || compareLegacyValue(left.name, right.name)
  || compareLegacyValue(left.cpf, right.cpf)
  || compareLegacyValue(left.pedido, right.pedido)
  || compareLegacyValue(left.sex, right.sex));

const productAmount = (product) => {
  if (amount(product?.valor_total) > 0) return amount(product.valor_total);
  return amount(product?.preco) * amount(product?.quantidade);
};

const linkedTo = (person, matcher) =>
  (person?.produtos || []).some((description) => matcher(normalized(description)));

const isBomMedDependent = (description) =>
  description.includes('BOM MED') && description.includes('DEPENDENTE');

const isPetName = (description) =>
  description.includes('BOM PET') && description.includes('NOME DO PET');

const parsePet = (person) => {
  const parts = text(person?.nome).split(/\s*\/\s*/).map(text).filter(Boolean);
  const compactLegacy = parts.length <= 2;
  return {
    name: parts[0] || text(person?.nome),
    type: compactLegacy ? '' : parts[1] || '',
    breed: compactLegacy ? parts[1] || '' : parts[2] || '',
    color: parts[3] || '',
    size: normalized(parts[4] || person?.porte),
    birth_date: person?.data_nascimento || null,
    sex: normalized(person?.sexo).startsWith('F') ? 'F' : 'M',
  };
};

const normalizeSex = (value) => {
  const valueNormalized = normalized(value);
  if (valueNormalized === 'F' || valueNormalized === 'FEMININO') return 'FEMININO';
  if (valueNormalized === 'M' || valueNormalized === 'MASCULINO') return 'MASCULINO';
  return '';
};

const normalizeCivilStatus = (value) => {
  const valueNormalized = normalized(value);
  if (valueNormalized.includes('SOLTEIR')) return 'SOLTEIRO';
  if (valueNormalized.includes('CASAD')) return 'CASADO';
  return 'OUTROS';
};

export function comboMultiWellbeingPaymentCategory(planId) {
  const id = Number(planId);
  if (BANK_PAYMENT_PLAN_IDS.has(id)) return 'bank';
  if (CREDIT_CARD_PAYMENT_PLAN_IDS.has(id)) return 'credit_card';
  return null;
}

export function buildComboMultiWellbeingContractData(detail = {}, { newCombo = false } = {}) {
  const holder = detail.titular || {};
  const address = detail.endereco || {};
  const products = Array.isArray(detail.produtos) ? detail.produtos : [];
  const people = Array.isArray(detail.pessoas) ? detail.pessoas : [];
  const baseIds = newCombo
    ? NEW_COMBO_MULTI_WELLBEING_BASE_PRODUCT_IDS
    : COMBO_MULTI_WELLBEING_BASE_PRODUCT_IDS;
  const baseProduct = products.find((product) => baseIds.includes(Number(product?.id)));
  const dependentProducts = products.filter((product) =>
    isBomMedDependent(normalized(product?.descricao)));
  const dependentPrices = dependentProducts.flatMap((product) =>
    Array.from(
      { length: Math.max(1, Number(product?.quantidade) || 1) },
      () => rounded(product?.preco),
    ));
  const dependents = sortComboMultiWellbeingDependents(people
    .filter((person) => !person?.is_titular && linkedTo(person, isBomMedDependent))
    .map((person, index) => ({
      name: text(person.nome),
      cpf: text(person.cpf),
      birth_date: person.data_nascimento || null,
      phone: text(person.telefone),
      sex: normalizeSex(person.sexo).slice(0, 1),
      price: dependentPrices[index] ?? 0,
    })));
  const dependentValue = rounded(dependents
    .filter((dependent) => dependent.price > 1)
    .reduce((total, dependent) => total + dependent.price, 0));
  const pets = people
    .filter((person) => linkedTo(person, isPetName))
    .map(parsePet);
  const vehicle = Array.isArray(detail.veiculos) ? detail.veiculos[0] || null : null;
  const legacyVehicleParts = text(vehicle?.descricao).split(/\s*\/\s*/).map(text).filter(Boolean);
  // Pedidos históricos do Combo gravaram apenas MODELO/PLACA/COR e não
  // criaram uma linha separada de condutor; o gerador oficial usava o titular.
  const legacyComboVehicle = legacyVehicleParts.length === 3 && !vehicle?.cpf;
  const driver = vehicle?.driver || (legacyComboVehicle && detail.titular_is_canonical ? holder : null);
  const legacyOrderPhone = legacyComboVehicle
    ? text(vehicle?.telefone || people.find((person) => !person?.is_titular)?.telefone)
    : '';
  const standardValue = rounded(productAmount(baseProduct));
  const optionalServices = newCombo
    ? Object.fromEntries(Object.entries(NEW_COMBO_OPTIONAL_PRODUCTS).map(([key, ids]) => {
        const matching = products.filter((product) => ids.includes(Number(product?.id)));
        return [key, {
          present: matching.length > 0,
          quantity: matching.reduce((total, product) => total + amount(product?.quantidade), 0),
          value: rounded(matching.reduce((total, product) => total + productAmount(product), 0)),
        }];
      }))
    : {};
  const optionalMonthlyValue = Object.values(optionalServices)
    .reduce((total, service) => total + service.value, 0);

  return {
    issue_date: detail.data_emissao || null,
    generation_date: new Date(),
    name: text(holder.nome),
    cpf: text(holder.cpf),
    rg: text(holder.rg),
    birth_date: holder.data_nascimento || null,
    sex: normalizeSex(holder.sexo),
    marital_status: normalizeCivilStatus(holder.estado_civil),
    profession: text(holder.profissao) || 'Outros',
    income: holder.renda ?? null,
    address: text(address.logradouro),
    complement: text(address.complemento),
    number: text(address.numero),
    district: text(address.bairro),
    city: text(address.cidade),
    state: normalized(address.uf),
    cep: digits(address.cep),
    phone: legacyOrderPhone || text(holder.telefone),
    phone2: legacyComboVehicle ? text(holder.telefone) : text(detail.telefone_secundario),
    email: text(holder.email || detail.email),
    adhesion: COMBO_MULTI_WELLBEING_ADHESION,
    standard_value: standardValue,
    dependent_value: dependentValue,
    monthly_value: rounded(standardValue + dependentValue + optionalMonthlyValue),
    payment_plan_id: detail.plano_pagamento_id || null,
    due_day: text(detail.dia_vencimento),
    new_combo: newCombo,
    optional_services: optionalServices,
    dependents,
    pet: pets[0] || null,
    vehicle: vehicle ? {
      manufacturer: legacyComboVehicle ? legacyVehicleParts[0] : text(vehicle.fabricante),
      model: legacyComboVehicle ? '' : text(vehicle.modelo),
      color: legacyComboVehicle ? legacyVehicleParts[2] : text(vehicle.cor),
      year: legacyComboVehicle
        ? dateParts(vehicle.data_nascimento)?.year || ''
        : text(vehicle.ano),
      plate: (legacyComboVehicle ? legacyVehicleParts[1] : text(vehicle.placa)).toUpperCase(),
    } : null,
    driver: driver ? {
      name: text(driver.nome),
      cpf: text(driver.cpf),
      birth_date: driver.data_nascimento || null,
      phone: legacyOrderPhone || text(driver.telefone),
      sex: normalizeSex(driver.sexo),
      marital_status: normalizeCivilStatus(driver.estado_civil),
    } : null,
  };
}

export function validateComboMultiWellbeingContractData(data) {
  const errors = [];
  for (const [label, value] of [
    ['data de emissão', data?.issue_date],
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
    ['plano de pagamento', data?.payment_plan_id],
  ]) {
    if (!text(value)) errors.push(`Campo obrigatório ausente: ${label}.`);
  }
  if (digits(data?.cpf).length !== 11) errors.push('CPF do titular inválido.');
  if (!['MASCULINO', 'FEMININO'].includes(text(data?.sex))) {
    errors.push('Sexo do titular inválido.');
  }
  if (!comboMultiWellbeingPaymentCategory(data?.payment_plan_id)) {
    errors.push('A forma de pagamento não corresponde às opções do contrato Combo Multi Bem Estar.');
  }
  if (!Number.isFinite(amount(data?.monthly_value)) || amount(data?.monthly_value) <= 0) {
    errors.push('Valor mensal do Combo Multi Bem Estar inválido.');
  }
  if (!data?.new_combo) {
    if (!data?.vehicle) errors.push('Nenhum veículo foi encontrado para o Combo Multi Bem Estar.');
    if (!data?.driver) errors.push('Nenhum condutor foi encontrado para o Combo Multi Bem Estar.');
    if (!data?.pet) errors.push('Nenhum pet foi encontrado para o Combo Multi Bem Estar.');
  }
  if ((data?.dependents || []).length > 13) {
    errors.push('O contrato Combo Multi Bem Estar comporta no máximo 13 dependentes.');
  }
  if (data?.new_combo) {
    for (const [key, service] of Object.entries(data.optional_services || {})) {
      const fileName = NEW_COMBO_OPTIONAL_TEMPLATE_FILES[key];
      if (service?.present && !fs.existsSync(path.join(newPagesDir, fileName))) {
        errors.push(`Modelo do serviço opcional ausente: ${fileName}.`);
      }
    }
  }
  return errors;
}

const dateParts = (value) => {
  const match = text(value instanceof Date ? value.toISOString() : value)
    .match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const month = new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${match[1]}-${match[2]}-${match[3]}T12:00:00Z`));
  return {
    year: match[1],
    month_number: match[2],
    day: match[3],
    month: month.charAt(0).toUpperCase() + month.slice(1),
  };
};

export const calculateComboPetAge = (birthDate, referenceDate) => {
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
  const safeYears = Math.max(0, years);
  const safeMonths = Math.max(0, months);
  return `${safeYears} ${safeYears === 1 ? 'ano' : 'anos'} `
    + `${safeMonths} ${safeMonths === 1 ? 'mês' : 'meses'}`;
};

const money = (value) => amount(value).toLocaleString('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

async function renderComboMultiWellbeingPdfFrom(data, contractPagesDir) {
  const pageCount = data.pet ? 17 : 16;
  const backgrounds = new Map();
  for (let page = 1; page <= pageCount; page += 1) {
    const source = path.join(contractPagesDir, `page-${page}.jpg`);
    if (!fs.existsSync(source)) {
      throw new Error(`Página ${page} do contrato Combo Multi Bem Estar não encontrada.`);
    }
    backgrounds.set(page, source);
  }
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: false });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    const mm = (value) => value * 72 / 25.4;
    const write = (value, x, y, { size = 10, width = null, minSize = 6 } = {}) => {
      const content = text(value);
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
    const writeDate = (
      value,
      x,
      y,
      { monthOffset = 8, yearOffset = 16 } = {},
    ) => {
      const date = dateParts(value);
      if (!date) return;
      write(date.day, x, y);
      write(date.month_number, x + monthOffset, y);
      write(date.year, x + yearOffset, y, { size: 10, width: 12 });
    };
    const writeDependentDate = (value, y) => {
      const date = dateParts(value);
      if (!date) return;
      write(date.day, 150, y, { size: 9 });
      write(date.month_number, 158, y, { size: 9 });
      write(date.year, 163.5, y, { size: 9, width: 8 });
    };
    const writeCep = (value, y) => {
      digits(value).slice(0, 8).split('').forEach((digit, index) => {
        const positions = [36, 41, 46, 50, 55, 63, 67, 72];
        write(digit, positions[index], y, { size: 10 });
      });
    };
    const writeIssueDate = (
      issue,
      y,
      { x = 32, shortYear = false, monthOffset = 13, yearOffset = null } = {},
    ) => {
      if (!issue) return;
      write(issue.day, x, y, { size: 11 });
      write(issue.month, x + monthOffset, y, { size: 11, width: 28 });
      write(
        shortYear ? issue.year.slice(-2) : issue.year,
        x + (yearOffset ?? (shortYear ? 59 : 35)),
        y,
        { size: 11 },
      );
    };
    const writeForm = (pageNumber) => {
      write(money(data.adhesion), 29, 39.5, { size: 11 });
      write(money(data.standard_value), 52, 39.5, { size: 11 });
      write(money(data.dependent_value), 75, 39.5, { size: 11 });
      write(money(data.monthly_value), 100, 39.5, { size: 11 });
      const dueX = { 10: 24.5, 15: 47.5, 20: 71, 25: 94 }[Number(data.due_day)];
      if (dueX) write('X', dueX, 48);
      write(data.name, 24, 56.5, { width: 118 });
      if (data.sex === 'MASCULINO') write('X', 153, 56.5);
      if (data.sex === 'FEMININO') write('X', 157, 56.5);
      const civilX = { SOLTEIRO: 163, CASADO: 168, OUTROS: 173 }[data.marital_status];
      if (civilX) write('X', civilX, 56.5);
      writeDate(data.birth_date, 180, 56.15);
      write(data.cpf, 24, 63, { width: 88 });
      write(data.rg, 116, 63, { width: 88 });
      write([data.address, data.complement].filter(Boolean).join(' - '), 24, 69.5, { width: 157 });
      write(data.number, 188, 69.5, { width: 18 });
      write(data.district, 24, 75.5, { width: 78 });
      write(data.city, 107, 75.5, { width: 93 });
      write(data.state, 24, 82.5);
      writeCep(data.cep, 82.5);
      write(data.phone, 78, 82.5, { width: 52 });
      write(data.phone2, 135, 82.5, { width: 67 });
      write(data.profession, 24, 89, { width: 43 });
      write(data.income, 70, 89, { width: 35 });
      write(data.email, 107, 89, { size: 9, width: 95 });
      if (data.vehicle) {
        write(data.vehicle.manufacturer, 25, 104.5, { width: 88 });
        write(data.vehicle.model, 115, 104.5, { width: 88 });
        write(data.vehicle.color, 25, 110.5, { width: 65 });
        write(data.vehicle.year, 92, 110.5, { width: 35 });
        write(data.vehicle.plate, 132, 110.5, { width: 40 });
      }
      if (data.driver) {
        write(data.driver.name, 24, 117.5, { width: 118 });
        if (data.driver.sex === 'MASCULINO') write('X', 152, 117.5);
        if (data.driver.sex === 'FEMININO') write('X', 157, 117.5);
        const driverCivilX = { SOLTEIRO: 163, CASADO: 168, OUTROS: 173 }[data.driver.marital_status];
        if (driverCivilX) write('X', driverCivilX, 117.5);
        writeDate(data.driver.birth_date, 181, 117.5, {
          monthOffset: 7.75,
          yearOffset: 14.5,
        });
        write(data.driver.cpf, 24, 123.5, { width: 88 });
        write(data.driver.phone, 115, 123.5, { width: 52 });
      }
      if (data.pet) {
        const protocolPetOffset = pageNumber === 9 ? 1 : 0;
        const petNameY = (pageNumber === 9 ? 138.6 : 139.1) + protocolPetOffset;
        const petDetailsY = (pageNumber === 9 ? 145.1 : 146.1) + protocolPetOffset;
        write(data.pet.name, 24, petNameY, { width: 118 });
        if (data.pet.sex === 'M') write('X', 158, petNameY);
        if (data.pet.sex === 'F') write('X', 163, petNameY);
        write(data.pet.breed, 24, petDetailsY, { width: 65 });
        write(data.pet.color, 107, petDetailsY, { width: 45 });
        write(
          calculateComboPetAge(data.pet.birth_date, data.generation_date || new Date()),
          154,
          petDetailsY,
          { size: 9, width: 32 },
        );
        const sizeX = { PEQUENO: 190, MEDIO: 194, GRANDE: 199 }[data.pet.size];
        if (sizeX) write('X', sizeX, 142 + protocolPetOffset, { size: 9 });
      }
      (data.dependents || []).forEach((dependent, index) => {
        const y = 169.3 + (index * 4) + (index >= 3 ? 5 : 0);
        write(dependent.name, 30, y, { size: 9, width: 82 });
        write(dependent.cpf, 115, y, { size: 9, width: 23 });
        if (dependent.sex === 'F') write('X', 140, y, { size: 9 });
        if (dependent.sex === 'M') write('X', 146, y, { size: 9 });
        writeDependentDate(dependent.birth_date, y);
        write(dependent.phone, 172, y, { size: 8.5, width: 21 });
        if (dependent.price > 1) write(money(dependent.price), 194, y, { size: 8.5 });
      });
      write(money(data.dependent_value), 180, 228, { size: 11 });
      const category = comboMultiWellbeingPaymentCategory(data.payment_plan_id);
      if (category === 'bank') write('X', 165, 239);
      if (category === 'credit_card') write('X', 185, 239);
    };
    const issue = dateParts(data.issue_date) || dateParts(new Date());
    const legacyOptionalValue = (value) => Number.isInteger(amount(value))
      ? String(amount(value))
      : money(value);
    const crownValueInWords = (value) => ({
      8: 'Oito Reais',
      15: 'Quinze Reais',
      30: 'Trinta Reais',
    })[amount(value)] || `${money(value)} Reais`;
    const addOptionalPage = (key, renderFields) => {
      const service = data.optional_services?.[key];
      if (!service?.present) return;
      const fileName = NEW_COMBO_OPTIONAL_TEMPLATE_FILES[key];
      const source = path.join(newPagesDir, fileName);
      if (!fs.existsSync(source)) throw new Error(`Modelo do serviço opcional ausente: ${fileName}.`);
      doc.addPage();
      doc.image(source, 0, 0, { width: 595.28, height: 841.89 });
      doc.fillColor('#111');
      renderFields(service);
    };
    try {
      for (let page = 1; page <= pageCount; page += 1) {
        doc.addPage();
        doc.image(backgrounds.get(page), 0, 0, { width: 595.28, height: 841.89 });
        doc.fillColor('#111');
        if (page === 1 || page === 9) {
          writeForm(page);
          writeIssueDate(issue, 238);
        }
        if (page === 8) {
          writeIssueDate(issue, 209.75, {
            x: 132, shortYear: true, monthOffset: 18, yearOffset: 59,
          });
        }
        if (page === 16) {
          writeIssueDate(issue, 216.75, {
            x: 132, shortYear: true, monthOffset: 18, yearOffset: 59,
          });
        }
        if (page === 17) {
          writeIssueDate(issue, 243.75, {
            x: 122, shortYear: true, monthOffset: 19, yearOffset: 60,
          });
        }
      }
      if (data.new_combo) {
        addOptionalPage('cremation', (service) => {
          write(legacyOptionalValue(service.value), 60, 157, { size: 11 });
          write('REAIS', 77, 157, { size: 11 });
          write(issue.day, 125, 241, { size: 12 });
          write(issue.month, 143, 241, { size: 12, width: 28 });
        });
        addOptionalPage('mileage', (service) => {
          // O gerador legado imprime 2.000 km para qualquer faixa contratada.
          write('2000', 178, 93, { size: 10 });
          write('Dois Mil', 16, 96, { size: 10 });
          write(legacyOptionalValue(service.value), 90, 128, { size: 11 });
          write('REAIS', 128, 128, { size: 10 });
          write(issue.day, 125, 220, { size: 12 });
          write(issue.month, 143, 220, { size: 12, width: 28 });
        });
        addOptionalPage('crown', (service) => {
          // O campo de quantidade permanecia vazio no PDF oficial.
          write(money(service.value), 148, 119, { size: 11 });
          write(crownValueInWords(service.value), 25, 123, { size: 11 });
          writeIssueDate(issue, 239, {
            x: 124, shortYear: true, monthOffset: 20, yearOffset: 58,
          });
        });
      }
      doc.end();
    } catch (error) {
      doc.end();
      reject(error);
    }
  });
}

export const renderComboMultiWellbeingPdf = (data) =>
  renderComboMultiWellbeingPdfFrom(data, pagesDir);

export const renderNewComboMultiWellbeingPdf = (data) =>
  renderComboMultiWellbeingPdfFrom(data, newPagesDir);