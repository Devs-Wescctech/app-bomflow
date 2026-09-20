import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SAFIRA_BASE_PRODUCT_IDS } from './salesContractModels.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pagesDir = path.resolve(__dirname, '../../public/safira-contract');
const text = (value) => String(value ?? '').trim();
const digits = (value) => text(value).replace(/\D/g, '');
const amount = (value) => Number(value || 0);
const rounded = (value) => Math.round((amount(value) + Number.EPSILON) * 100) / 100;
const normalize = (value) => text(value).normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toUpperCase();
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

export function buildSafiraContractData(detail) {
  const products = Array.isArray(detail?.produtos) ? detail.produtos : [];
  const people = Array.isArray(detail?.pessoas) ? detail.pessoas : [];
  const holder = detail?.titular || people.find((person) => person?.is_titular) || {};
  const planProducts = products.filter((product) =>
    SAFIRA_BASE_PRODUCT_IDS.includes(Number(product?.id)));
  const dependentProducts = products.filter((product) => {
    const description = normalize(product?.descricao);
    return description.includes('SAFIRA') && description.includes('DEPENDENTE');
  });
  const baseValue = rounded(planProducts.reduce((total, product) =>
    total + productAmount(product), 0));
  const dependentValue = rounded(dependentProducts
    .filter((product) => productAmount(product) > 2)
    .reduce((total, product) => total + productAmount(product), 0));
  const dependents = people
    .filter((person) => !person?.is_titular
      && (person?.produtos || []).some((description) =>
        normalize(description).includes('SAFIRA')))
    .sort((left, right) => Number(left?.source_order || 0) - Number(right?.source_order || 0))
    .map((person) => ({
      name: text(person?.nome),
      birth_date: person?.data_nascimento || null,
      sex: text(person?.sexo).toUpperCase().slice(0, 1),
      relationship: relationship(person?.parentesco),
      phone: text(person?.telefone),
      value: rounded(dependentProducts.find((product) =>
        (person?.produtos || []).includes(product?.descricao)) ? dependentValue : 0),
    }));
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
    phone2: text(detail?.telefone_secundario || holder?.telefone),
    email: text(detail?.email || holder?.email),
    observations: text(detail?.observacoes).replace(/\s+/g, ' '),
    issue_date: detail?.data_emissao || null,
    due_day: text(detail?.dia_vencimento),
    payment_plan: text(detail?.plano_pagamento),
    adhesion_value: 60,
    base_value: baseValue,
    dependent_value: dependentValue,
    monthly_value: rounded(baseValue + dependentValue),
    dependents,
  };
}

export function validateSafiraContractData(data) {
  const errors = [];
  for (const [label, value] of [
    ['nome do titular', data?.name], ['CPF do titular', data?.cpf],
    ['data de nascimento do titular', data?.birth_date], ['sexo do titular', data?.sex],
    ['endereço', data?.address], ['número do endereço', data?.number],
    ['bairro', data?.district], ['cidade', data?.city], ['estado', data?.state],
    ['CEP', data?.cep], ['telefone', data?.phone], ['data de emissão', data?.issue_date],
    ['plano de pagamento', data?.payment_plan],
  ]) if (!text(value)) errors.push(`Campo obrigatório ausente: ${label}.`);
  if (!/^\d{11}$/.test(digits(data?.cpf))) errors.push('CPF do titular inválido.');
  if (!/^[A-Z]{2}$/.test(text(data?.state))) errors.push('Estado do endereço inválido.');
  if (!/^\d{8}$/.test(digits(data?.cep))) errors.push('CEP inválido.');
  if (!/^\d{10,11}$/.test(digits(data?.phone))) errors.push('Telefone inválido.');
  if (amount(data?.monthly_value) <= 0) errors.push('Valor mensal do Plano Safira inválido.');
  const children = (data?.dependents || []).filter((person) => person.relationship === 'child');
  const generic = (data?.dependents || []).filter((person) => person.relationship === 'dependent');
  if (children.length > 11) errors.push('O contrato Safira comporta no máximo 11 filhos.');
  if (generic.length > 2) errors.push('O contrato Safira comporta no máximo 2 dependentes adicionais.');
  (data?.dependents || []).forEach((person, index) => {
    if (!person.name) errors.push(`Dependente ${index + 1}: nome ausente.`);
    if (!person.birth_date) errors.push(`Dependente ${index + 1}: data de nascimento ausente.`);
    if (!/^[MF]$/i.test(person.sex)) errors.push(`Dependente ${index + 1}: sexo inválido.`);
  });
  return errors;
}

const dateParts = (value) => {
  const match = text(value instanceof Date ? value.toISOString() : value)
    .match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const rawMonth = new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' })
    .format(new Date(`${match[1]}-${match[2]}-${match[3]}T12:00:00Z`));
  const month = `${rawMonth.charAt(0).toUpperCase()}${rawMonth.slice(1)}`;
  return { year: match[1], monthNumber: match[2], day: match[3], month };
};
const money = (value) => amount(value).toLocaleString('pt-BR', {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});

export function renderSafiraPdf(data) {
  const backgrounds = Array.from({ length: 10 }, (_, index) =>
    path.join(pagesDir, `page-${index + 1}.jpg`));
  backgrounds.forEach((source, index) => {
    if (!fs.existsSync(source)) throw new Error(`Página ${index + 1} do contrato Safira não encontrada.`);
  });
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
      let fontSize = size;
      doc.font('Times-Roman').fontSize(fontSize);
      while (width && doc.widthOfString(content) > mm(width) && fontSize > minSize) {
        fontSize -= 0.5;
        doc.fontSize(fontSize);
      }
      doc.text(content, mm(x + 1), mm(y + 1), {
        width: width ? mm(width) : undefined, lineBreak: false,
      });
    };
    const birth = (value) => {
      const date = dateParts(value);
      return date ? `${date.day}     ${date.monthNumber}     ${date.year}` : '';
    };
    const issue = dateParts(data.issue_date);
    const relatives = (data.dependents || []).filter((person) =>
      ['father', 'mother', 'parent_in_law', 'spouse'].includes(person.relationship));
    const children = (data.dependents || []).filter((person) => person.relationship === 'child');
    const generic = (data.dependents || []).filter((person) => person.relationship === 'dependent');
    try {
      backgrounds.forEach((source, index) => {
        const page = index + 1;
        doc.addPage();
        doc.image(source, 0, 0, { width: 595.28, height: 841.89 });
        doc.fillColor('#111');
        if (page === 5) {
          write(money(data.adhesion_value), 27, 52);
          write(money(data.base_value), 51, 52);
          write(money(data.dependent_value), 73, 52);
          write(money(data.monthly_value), 98, 52);
          if (['10', '15', '20', '25'].includes(data.due_day)) {
            write('X', { 10: 120, 15: 137, 20: 154, 25: 171 }[data.due_day], 51);
          }
          write(data.name, 24, 62, { width: 118 });
          write('X', normalize(data.sex).startsWith('F') ? 152 : 147, 62);
          const civil = normalize(data.marital_status);
          write('X', civil.includes('SOLTEIR') ? 159 : civil.includes('CASAD') ? 164 : 169, 62);
          write(birth(data.birth_date), 179, 62, { size: 10, width: 28 });
          write(data.cpf, 24, 69, { width: 90 });
          write(data.rg, 118, 69, { width: 85 });
          write([data.address, data.complement].filter(Boolean).join(' - '), 24, 77, { width: 157 });
          write(data.number, 186, 77.5, { size: 10.5, width: 18 });
          write(data.district, 24, 84, { width: 78 });
          write(data.city, 108, 84, { width: 93 });
          write(data.state, 24, 92);
          const cep = digits(data.cep);
          [36, 41, 46, 50, 55, 63, 67, 72].forEach((x, digitIndex) =>
            write(cep[digitIndex], x, 92, { width: 3 }));
          write(digits(data.phone), 80, 92, { width: 52 });
          write(digits(data.phone2), 136, 92, { width: 67 });
          write(data.profession, 24, 98, { width: 75 });
          write(data.email, 106, 98, { width: 95 });
          const fixed = [
            [relatives.find((person) => person.relationship === 'father'), 107],
            [relatives.find((person) => person.relationship === 'mother'), 114],
            [relatives.find((person) => person.relationship === 'parent_in_law' && person.sex === 'M'), 122],
            [relatives.find((person) => person.relationship === 'parent_in_law' && person.sex === 'F'), 130],
            [relatives.find((person) => person.relationship === 'spouse'), 137],
          ];
          fixed.forEach(([person, y]) => {
            if (person) { write(person.name, 23, y, { width: 150 }); write(birth(person.birth_date), 180, y, { size: 10 }); }
          });
          children.forEach((person, childIndex) => {
            const y = 144.5 + childIndex * 7;
            write(person.name, 23, y, { width: 135 });
            write('x', person.sex === 'F' ? 165.5 : 162.5, y, { size: 10 });
            write(birth(person.birth_date), 180, y, { size: 10 });
          });
          generic.forEach((person, dependentIndex) => {
            const y = 226 + dependentIndex * 8;
            write(person.name, 32, y, { size: 9, width: 74 });
            write('x', person.sex === 'F' ? 110 : 117, y, { size: 9 });
            write(birth(person.birth_date), 145, y, { size: 9 });
            write(digits(person.phone), 170, y, { size: 9 });
            write(money(person.value), 193, y, { size: 9 });
          });
          write(data.observations, 34, 248, { size: 9, width: 165 });
          if (issue) {
            write(issue.day, 34, 257);
            write(issue.month, 49, 257, { width: 20 });
            write(issue.year, 76, 257);
          }
          write(money(data.monthly_value), 118, 257);
          write('X', 168, 257);
        }
        if (page === 10 && issue) {
          write(issue.day, 131, 228, { size: 12 });
          write(issue.month, 149, 228, { size: 12, width: 40 });
          write(issue.year.slice(-2), 190, 228, { size: 12 });
        }
      });
      doc.end();
    } catch (error) {
      doc.end();
      reject(error);
    }
  });
}