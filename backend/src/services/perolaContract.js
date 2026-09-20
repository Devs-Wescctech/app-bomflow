import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PEROLA_BASE_PRODUCT_IDS, RUBI_BASE_PRODUCT_IDS } from './salesContractModels.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pagesDir = path.resolve(__dirname, '../../public/perola-contract');
const rubiPagesDir = path.resolve(__dirname, '../../public/rubi-contract');

export const PEROLA_WREATH_PRODUCT_IDS = Object.freeze([47989280]);
export const PEROLA_TRANSFER_PRODUCT_IDS = Object.freeze([47989307]);
export const PEROLA_CREMATION_WREATH_PRODUCT_IDS = Object.freeze([47989247, 71403885]);

const text = (value) => String(value ?? '').trim();
const digits = (value) => text(value).replace(/\D/g, '');
const amount = (value) => Number(value || 0);
const rounded = (value) => Math.round((amount(value) + Number.EPSILON) * 100) / 100;
const normalize = (value) => text(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toUpperCase();
const productAmount = (product) => product?.valor_total != null
  ? amount(product.valor_total)
  : amount(product?.preco) * amount(product?.quantidade || 1);

const relationship = (value) => {
  const normalized = normalize(value);
  if (normalized === 'P' || normalized.includes('PAI')) return 'father';
  if (normalized === 'M' || normalized.includes('MAE')) return 'mother';
  if (normalized === 'S' || normalized.includes('SOGR')) return 'parent_in_law';
  if (normalized === 'C' || normalized.includes('CONJUG')) return 'spouse';
  if (normalized === 'F' || normalized.includes('FILH')) return 'child';
  return 'dependent';
};

const linkedToPlan = (person, planName) => (person?.produtos || []).some((description) => {
  const normalized = normalize(description);
  return normalized.includes(planName) && normalized.includes('DEPENDENTE');
});

const personData = (person) => ({
  name: text(person?.nome),
  birth_date: person?.data_nascimento || null,
  sex: text(person?.sexo).toUpperCase().slice(0, 1),
  relationship: relationship(person?.parentesco),
});

function buildFuneralPlanContractData(detail, generatedAt, {
  baseProductIds,
  planName,
  includeCremation = false,
  sortChildrenByName = false,
}) {
  const products = Array.isArray(detail?.produtos) ? detail.produtos : [];
  const people = Array.isArray(detail?.pessoas) ? detail.pessoas : [];
  const holder = detail?.titular || people.find((person) => person?.is_titular) || {};
  const sumIds = (ids) => rounded(products
    .filter((product) => ids.includes(Number(product?.id)))
    .reduce((total, product) => total + productAmount(product), 0));
  const baseValue = sumIds(baseProductIds);
  const dependentValue = rounded(products
    .filter((product) => normalize(product?.descricao).includes(planName)
      && normalize(product?.descricao).includes('DEPENDENTE')
      && productAmount(product) > 2)
    .reduce((total, product) => total + productAmount(product), 0));
  const transferValue = sumIds(PEROLA_TRANSFER_PRODUCT_IDS);
  let linkedDependents = people
    .filter((person) => !person?.is_titular && linkedToPlan(person, planName))
    .sort((left, right) => Number(left?.source_order || 0) - Number(right?.source_order || 0))
    .map(personData);
  if (sortChildrenByName) {
    const sortedChildren = linkedDependents
      .filter((person) => person.relationship === 'child')
      .sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'));
    let childIndex = 0;
    linkedDependents = linkedDependents.map((person) =>
      person.relationship === 'child' ? sortedChildren[childIndex++] : person);
  }
  const genericDependents = linkedDependents
    .filter((person) => person.relationship === 'dependent');
  // O formulário oficial possui somente duas linhas "Dep.". O gerador legado
  // preservava as extremidades quando havia três vínculos (caso do pedido
  // homologado 34490), em vez de escrever sobre a área de observações.
  const printableGenericDependents = genericDependents.length > 2
    ? [genericDependents[0], genericDependents.at(-1)]
    : genericDependents;
  const dependents = linkedDependents
    .filter((person) => person.relationship !== 'dependent')
    .concat(printableGenericDependents);
  const generated = generatedAt instanceof Date
    ? new Intl.DateTimeFormat('en-CA', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        timeZone: 'America/Sao_Paulo',
      }).format(generatedAt)
    : generatedAt;
  return {
    pedido: text(detail?.numero_pedido || detail?.pedido),
    name: text(holder?.nome),
    cpf: text(holder?.cpf),
    rg: text(holder?.rg),
    birth_date: holder?.data_nascimento || null,
    sex: text(holder?.sexo).toUpperCase(),
    marital_status: text(holder?.estado_civil).toUpperCase(),
    profession: text(holder?.profissao) || 'Outros',
    address: text(detail?.endereco?.logradouro || holder?.endereco?.logradouro),
    complement: text(detail?.endereco?.complemento || holder?.endereco?.complemento),
    number: text(detail?.endereco?.numero || holder?.endereco?.numero),
    district: text(detail?.endereco?.bairro || holder?.endereco?.bairro),
    city: text(detail?.endereco?.cidade || holder?.endereco?.cidade),
    state: text(detail?.endereco?.uf || holder?.endereco?.uf).toUpperCase(),
    cep: text(detail?.endereco?.cep || holder?.endereco?.cep),
    phone: text(holder?.telefone),
    phone2: text(holder?.telefone),
    email: text(detail?.email || holder?.email),
    observations: text(detail?.observacoes),
    issue_date: detail?.data_emissao || generated,
    payment_plan: text(detail?.plano_pagamento),
    payment_plan_id: detail?.plano_pagamento_id || null,
    monthly_value: rounded(baseValue + dependentValue + transferValue),
    wreath_value: sumIds(PEROLA_WREATH_PRODUCT_IDS),
    transfer_value: transferValue,
    cremation_wreath_value: includeCremation ? sumIds(PEROLA_CREMATION_WREATH_PRODUCT_IDS) : 0,
    dependents,
  };
}

export function buildPerolaContractData(detail, generatedAt = new Date()) {
  return buildFuneralPlanContractData(detail, generatedAt, {
    baseProductIds: PEROLA_BASE_PRODUCT_IDS,
    planName: 'PEROLA',
    includeCremation: true,
  });
}

export function buildRubiContractData(detail, generatedAt = new Date()) {
  return buildFuneralPlanContractData(detail, generatedAt, {
    baseProductIds: RUBI_BASE_PRODUCT_IDS,
    planName: 'RUBI',
    sortChildrenByName: true,
  });
}

const validCpf = (value) => {
  const cpf = digits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const values = cpf.split('').map(Number);
  const check = (length) => {
    const sum = values.slice(0, length)
      .reduce((total, digit, index) => total + digit * (length + 1 - index), 0);
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  return check(9) === values[9] && check(10) === values[10];
};

function validateFuneralPlanContractData(data, planLabel) {
  const errors = [];
  for (const [label, value] of [
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
    ['data de emissão', data?.issue_date],
    ['plano de pagamento', data?.payment_plan],
  ]) {
    if (!text(value)) errors.push(`Campo obrigatório ausente: ${label}.`);
  }
  if (!validCpf(data?.cpf)) errors.push('CPF do titular inválido.');
  if (!/^(M|F|MASCULINO|FEMININO)$/i.test(text(data?.sex))) errors.push('Sexo do titular inválido.');
  if (!/^[A-Z]{2}$/.test(text(data?.state))) errors.push('Estado do endereço inválido.');
  if (!/^\d{8}$/.test(digits(data?.cep))) errors.push('CEP inválido.');
  if (!/^\d{10,11}$/.test(digits(data?.phone))) errors.push('Telefone inválido.');
  if (!Number.isFinite(amount(data?.monthly_value)) || amount(data?.monthly_value) <= 0) {
    errors.push(`Valor mensal do Plano ${planLabel} inválido.`);
  }
  const dependents = Array.isArray(data?.dependents) ? data.dependents : [];
  if (dependents.filter((person) => person.relationship === 'child').length > 9) {
    errors.push(`O contrato ${planLabel} comporta no máximo 9 filhos.`);
  }
  if (dependents.filter((person) => person.relationship === 'dependent').length > 2) {
    errors.push(`O contrato ${planLabel} comporta no máximo 2 dependentes adicionais.`);
  }
  dependents.forEach((person, index) => {
    if (!person.name) errors.push(`Dependente ${index + 1}: nome ausente.`);
    if (!person.birth_date) errors.push(`Dependente ${index + 1}: data de nascimento ausente.`);
    if (!/^[MF]$/i.test(person.sex)) errors.push(`Dependente ${index + 1}: sexo inválido.`);
  });
  return errors;
}

export function validatePerolaContractData(data) {
  return validateFuneralPlanContractData(data, 'Pérola');
}

export function validateRubiContractData(data) {
  return validateFuneralPlanContractData(data, 'Rubi');
}

const dateParts = (value) => {
  const match = text(value instanceof Date ? value.toISOString() : value)
    .match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const month = new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${match[1]}-${match[2]}-${match[3]}T12:00:00Z`));
  return { year: match[1], monthNumber: match[2], day: match[3], month };
};

const money = (value) => amount(value).toLocaleString('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const integerWords = (rawValue) => {
  const value = Math.max(0, Math.trunc(rawValue));
  const small = [
    'zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove',
    'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis',
    'dezessete', 'dezoito', 'dezenove',
  ];
  if (value < 20) return small[value];
  const tens = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta',
    'setenta', 'oitenta', 'noventa'];
  if (value < 100) {
    const remainder = value % 10;
    return `${tens[Math.trunc(value / 10)]}${remainder ? ` e ${small[remainder]}` : ''}`;
  }
  const hundreds = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos',
    'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
  if (value === 100) return 'cem';
  if (value < 1000) {
    const remainder = value % 100;
    return `${hundreds[Math.trunc(value / 100)]}${remainder ? ` e ${integerWords(remainder)}` : ''}`;
  }
  return String(value);
};

export const amountWords = (value) => {
  const centsValue = Math.round(amount(value) * 100);
  const reais = Math.trunc(centsValue / 100);
  const cents = centsValue % 100;
  const realLabel = reais === 1 ? 'real' : 'reais';
  const centLabel = cents === 1 ? 'centavo' : 'centavos';
  return `${integerWords(reais)} ${realLabel}${cents ? ` e ${integerWords(cents)} ${centLabel}` : ''}`;
};

async function renderFuneralPlanPdf(data, {
  sourceDir,
  includeCremation = false,
}) {
  const pages = [1, 2, 3, 4, 5, 6, 7];
  if (amount(data.wreath_value) > 0) pages.push('13-coroa-paga');
  if (amount(data.transfer_value) > 0) pages.push('14-translado');
  if (includeCremation && amount(data.cremation_wreath_value) > 0) {
    pages.push('15-cremacao-coroa');
  }
  const backgrounds = new Map();
  for (const page of pages) {
    const source = path.join(sourceDir, `page-${page}.jpg`);
    if (!fs.existsSync(source)) throw new Error(`Página ${page} do contrato não encontrada.`);
    backgrounds.set(page, source);
  }
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: false });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    const mm = (value) => value * 72 / 25.4;
    const write = (value, x, y, { size = 11, width = null, minSize = 6 } = {}) => {
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
    const addPage = (page) => {
      doc.addPage();
      doc.image(backgrounds.get(page), 0, 0, { width: 595.28, height: 841.89 });
      doc.fillColor('#111');
    };
    const birthText = (value) => {
      const date = dateParts(value);
      return date ? `${date.day}     ${date.monthNumber}     ${date.year}` : '';
    };
    const issue = dateParts(data.issue_date) || dateParts(new Date());
    const relatives = (data.dependents || []).filter((person) =>
      ['father', 'mother', 'parent_in_law', 'spouse'].includes(person.relationship));
    const children = (data.dependents || []).filter((person) => person.relationship === 'child');
    const dependents = (data.dependents || []).filter((person) => person.relationship === 'dependent');
    const writePerson = (person, y, checks = false) => {
      if (!person) return;
      write(person.name, 23, y, { width: checks ? 135 : 150 });
      if (checks) write('x', person.sex === 'F' ? 165.5 : 162.5, y, { size: 10 });
      write(birthText(person.birth_date), 180, y, { size: 10, width: 27 });
    };
    try {
      for (let page = 1; page <= 7; page += 1) {
        addPage(page);
        if (page === 2) {
          write(data.name, 23, 52, { width: 118 });
          write('X', normalize(data.sex).startsWith('F') ? 152 : 146, 52);
          const civil = normalize(data.marital_status);
          write('X', civil.includes('SOLTEIR') ? 159 : civil.includes('CASAD') ? 164 : 169, 52);
          write(birthText(data.birth_date), 178, 52, { size: 10, width: 29 });
          write(data.cpf, 23, 59, { width: 88 });
          write(data.rg, 115, 59, { width: 88 });
          write([data.address, data.complement].filter(Boolean).join(' - '), 23, 67, { width: 157 });
          write(data.number, 185, 67, { size: 9, width: 18 });
          write(data.district, 23, 74, { width: 78 });
          write(data.city, 107, 74, { width: 93 });
          write(data.state, 23, 81);
          write(data.cep, 37, 81, { width: 38 });
          write(digits(data.phone), 79, 81, { width: 52 });
          write(digits(data.phone2), 134, 81, { width: 67 });
          write(data.profession, 23, 89, { width: 75 });
          write(data.email, 106, 89, { width: 95 });
          const father = relatives.find((person) => person.relationship === 'father');
          const mother = relatives.find((person) => person.relationship === 'mother');
          const inLaws = relatives.filter((person) => person.relationship === 'parent_in_law');
          const spouse = relatives.find((person) => person.relationship === 'spouse');
          writePerson(father, 97);
          writePerson(mother, 104);
          writePerson(inLaws.find((person) => person.sex === 'M'), 112);
          writePerson(inLaws.find((person) => person.sex === 'F'), 119);
          writePerson(spouse, 126);
          children.forEach((person, index) => writePerson(person, 133.5 + index * 7, true));
          dependents.forEach((person, index) => writePerson(person, 199.5 + index * 7, true));
          doc.font('Times-Roman').fontSize(10)
            .text(text(data.observations), mm(24), mm(213), {
              width: mm(180),
              height: mm(16),
              lineGap: 0,
            });
          if (issue) {
            write(issue.day, 34, 231);
            write(issue.month, 49, 231, { width: 20 });
            write(issue.year, 76, 231);
          }
          write(money(data.monthly_value), 118, 231);
          write('X', 168, 231);
        }
        if (page === 7 && issue) {
          write(issue.day, 132, 233.5, { size: 12 });
          write(issue.month, 150, 233.5, { size: 12, width: 40 });
          write(issue.year.slice(-2), 191, 233.5, { size: 12 });
        }
      }
      if (amount(data.wreath_value) > 0) {
        addPage('13-coroa-paga');
        write(money(data.wreath_value), 190, 152, { size: 13 });
        write(amountWords(data.wreath_value), 26, 157, { width: 168 });
        if (issue) {
          write(issue.day, 132, 206, { size: 12 });
          write(issue.month, 150, 206, { size: 12, width: 40 });
          write(issue.year.slice(-2), 191, 206, { size: 12 });
        }
      }
      if (amount(data.transfer_value) > 0) {
        addPage('14-translado');
        write(money(data.transfer_value), 173, 145, { size: 13 });
        write(amountWords(data.transfer_value), 26, 150, { width: 175 });
        if (issue) {
          write(issue.day, 132, 208, { size: 12 });
          write(issue.month, 150, 208, { size: 12, width: 40 });
          write(issue.year.slice(-2), 191, 208, { size: 12 });
        }
      }
      if (includeCremation && amount(data.cremation_wreath_value) > 0) {
        addPage('15-cremacao-coroa');
        write(money(data.cremation_wreath_value), 59, 177, { size: 13 });
        write(amountWords(data.cremation_wreath_value), 80, 177, { size: 11, width: 120 });
        if (issue) {
          write(issue.day, 122, 235, { size: 12 });
          write(issue.month, 140, 235, { size: 12, width: 40 });
          write(issue.year.slice(-2), 182, 235, { size: 12 });
        }
      }
      doc.end();
    } catch (error) {
      doc.end();
      reject(error);
    }
  });
}

export function renderPerolaPdf(data) {
  return renderFuneralPlanPdf(data, { sourceDir: pagesDir, includeCremation: true });
}

export function renderRubiPdf(data) {
  return renderFuneralPlanPdf(data, { sourceDir: rubiPagesDir });
}