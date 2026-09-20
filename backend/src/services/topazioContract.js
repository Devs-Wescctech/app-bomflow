import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { TOPAZIO_BASE_PRODUCT_IDS } from './salesContractModels.js';
import {
  amountWords,
  PEROLA_TRANSFER_PRODUCT_IDS,
  PEROLA_WREATH_PRODUCT_IDS,
} from './perolaContract.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pagesDir = path.resolve(__dirname, '../../public/topazio-contract');
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
  if (normalized === 'C' || normalized.includes('CONJUG')) return 'spouse';
  if (normalized === 'F' || normalized.includes('FILH')) return 'child';
  return 'dependent';
};

export function buildTopazioContractData(detail) {
  const products = Array.isArray(detail?.produtos) ? detail.produtos : [];
  const people = Array.isArray(detail?.pessoas) ? detail.pessoas : [];
  const holder = detail?.titular || people.find((person) => person?.is_titular) || {};
  const baseProduct = products.find((product) =>
    TOPAZIO_BASE_PRODUCT_IDS.includes(Number(product?.id)));
  const sumProducts = (ids) => rounded(products
    .filter((product) => ids.includes(Number(product?.id)))
    .reduce((total, product) => total + productAmount(product), 0));
  const linked = people.filter((person) => !person?.is_titular
    && (person?.produtos || []).some((description) =>
      normalize(description).includes('TOPAZIO')));
  const spousePerson = linked.find((person) => relationship(person?.parentesco) === 'spouse');
  const historicalFamilyPhone = linked.find((person) => digits(person?.telefone))?.telefone;
  const mapPerson = (person) => ({
    name: text(person?.nome),
    birth_date: person?.data_nascimento || null,
    sex: text(person?.sexo).toUpperCase().slice(0, 1),
    relationship: relationship(person?.parentesco),
  });
  return {
    pedido: text(detail?.numero_pedido || detail?.pedido),
    name: text(holder?.nome),
    cpf: text(holder?.cpf),
    rg: text(holder?.rg),
    birth_date: holder?.data_nascimento || null,
    sex: text(holder?.sexo).toUpperCase(),
    marital_status: text(holder?.estado_civil || (spousePerson ? 'CASADO' : 'OUTROS')).toUpperCase(),
    profession: text(holder?.profissao) || 'Outros',
    address: text(detail?.endereco?.logradouro || holder?.endereco?.logradouro),
    complement: text(detail?.endereco?.complemento || holder?.endereco?.complemento),
    number: text(detail?.endereco?.numero || holder?.endereco?.numero),
    district: text(detail?.endereco?.bairro || holder?.endereco?.bairro),
    city: text(detail?.endereco?.cidade || holder?.endereco?.cidade),
    state: text(detail?.endereco?.uf || holder?.endereco?.uf).toUpperCase(),
    cep: text(detail?.endereco?.cep || holder?.endereco?.cep),
    phone: text(historicalFamilyPhone || holder?.telefone),
    phone2: '',
    email: text(detail?.email || holder?.email),
    observations: text(detail?.observacoes),
    issue_date: detail?.data_emissao || null,
    monthly_value: rounded(products
      .filter((product) => TOPAZIO_BASE_PRODUCT_IDS.includes(Number(product?.id))
        || (normalize(product?.descricao).includes('TOPAZIO')
          && normalize(product?.descricao).includes('DEPENDENTE')
          && productAmount(product) > 2))
      .reduce((total, product) => total + productAmount(product), 0)),
    spouse: spousePerson ? mapPerson(spousePerson) : null,
    children: linked.filter((person) => relationship(person?.parentesco) === 'child')
      .map(mapPerson)
      .sort((left, right) =>
        new Date(left.birth_date).getTime() - new Date(right.birth_date).getTime()),
    pocos: normalize(baseProduct?.descricao) === 'POCOS DE CALDAS - TOPAZIO',
    wreath_value: sumProducts(PEROLA_WREATH_PRODUCT_IDS),
    transfer_value: sumProducts(PEROLA_TRANSFER_PRODUCT_IDS),
  };
}

export function validateTopazioContractData(data) {
  const errors = [];
  for (const [label, value] of [
    ['nome do titular', data?.name], ['CPF do titular', data?.cpf],
    ['data de nascimento do titular', data?.birth_date], ['sexo do titular', data?.sex],
    ['endereço', data?.address], ['número do endereço', data?.number],
    ['bairro', data?.district], ['cidade', data?.city], ['estado', data?.state],
    ['CEP', data?.cep], ['telefone', data?.phone], ['data de emissão', data?.issue_date],
  ]) if (!text(value)) errors.push(`Campo obrigatório ausente: ${label}.`);
  if (!/^\d{11}$/.test(digits(data?.cpf))) errors.push('CPF do titular inválido.');
  if (!/^\d{8}$/.test(digits(data?.cep))) errors.push('CEP inválido.');
  if (!/^\d{10,11}$/.test(digits(data?.phone))) errors.push('Telefone inválido.');
  if (amount(data?.monthly_value) <= 0) errors.push('Valor mensal do Plano Topázio inválido.');
  if ((data?.children || []).length > 11) errors.push('O contrato Topázio comporta no máximo 11 filhos.');
  return errors;
}

const dateParts = (value) => {
  const match = text(value instanceof Date ? value.toISOString() : value)
    .match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const rawMonth = new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' })
    .format(new Date(`${match[1]}-${match[2]}-${match[3]}T12:00:00Z`));
  return {
    year: match[1], monthNumber: match[2], day: match[3],
    month: `${rawMonth.charAt(0).toUpperCase()}${rawMonth.slice(1)}`,
  };
};
const money = (value) => amount(value).toLocaleString('pt-BR', {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});

export function renderTopazioPdf(data) {
  const pageNumbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  if (data.pocos) pageNumbers.push(11, 12);
  if (data.wreath_value > 0) pageNumbers.push(13);
  if (data.transfer_value > 0) pageNumbers.push(14);
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
    try {
      pageNumbers.forEach((page) => {
        const source = path.join(pagesDir, `page-${page}.jpg`);
        if (!fs.existsSync(source)) throw new Error(`Página ${page} do contrato Topázio não encontrada.`);
        doc.addPage();
        doc.image(source, 0, 0, { width: 595.28, height: 841.89 });
        doc.fillColor('#111');
        if (page === 5) {
          write(data.name, 8, 56, { width: 118 });
          write('X', normalize(data.sex).startsWith('F') ? 136 : 131, 56);
          const civil = normalize(data.marital_status);
          write('X', civil.includes('SOLTEIR') ? 144 : civil.includes('CASAD') ? 149 : 154, 56);
          write(birth(data.birth_date), 162, 56, { size: 10, width: 38 });
          write(data.cpf, 8, 65, { width: 90 });
          write(data.rg, 100, 65, { width: 88 });
          write([data.address, data.complement].filter(Boolean).join(' - '), 8, 74, { width: 157 });
          write(data.number, 170, 73, { width: 18 });
          write(data.district, 8, 83, { width: 78 });
          write(data.city, 92, 82, { width: 93 });
          write(data.state, 8, 92);
          const cep = digits(data.cep);
          [20, 25, 30, 34, 39, 47, 51, 56].forEach((x, i) => write(cep[i], x, 92));
          write(digits(data.phone), 64, 92, { width: 52 });
          write(digits(data.phone2), 118, 92, { width: 67 });
          write(data.profession, 8, 100, { width: 75 });
          write(data.email, 90, 100, { width: 95 });
          if (data.spouse) {
            write(data.spouse.name, 8, 111, { width: 150 });
            write(birth(data.spouse.birth_date), 164, 109, { size: 10 });
          }
          data.children.forEach((child, index) => {
            const y = 119 + index * 9;
            write(child.name, 8, y + (index === 0 ? 1 : 0), { width: 135 });
            write('x', child.sex === 'F' ? 150 : 147, y - 1, { size: 10 });
            write(birth(child.birth_date), 164, y - 1, { size: 10 });
          });
          const observationLines = text(data.observations).match(/.{1,85}(?:\s|$)/g) || [];
          observationLines.slice(0, 3).forEach((line, index) =>
            write(line.trim(), 10, 215 + index * 8, { size: 10, width: 190 }));
          write(money(data.monthly_value), 160, 237);
          if (issue) {
            write(issue.day, 16, 241);
            write(issue.month, 31, 241, { width: 20 });
            write(issue.year, 58, 241);
          }
          write('X', 149, 243);
        }
        if (page === 10 && issue) {
          write(issue.day, 115, 215, { size: 12 });
          write(issue.month, 133, 215, { size: 12, width: 40 });
          write(issue.year.slice(-2), 174, 215, { size: 12 });
        }
        if (page === 11 && issue) {
          write(issue.day, 113, 207, { size: 12 });
          write(issue.month, 133, 207, { size: 12, width: 39 });
          write(issue.year.slice(-2), 172, 207, { size: 12 });
        }
        if (page === 12 && issue) {
          write(data.name, 41, 58, { width: 118 });
          write(data.cpf, 16, 67, { width: 118 });
          write(issue.day, 115, 230, { size: 12 });
          write(issue.month, 135, 230, { size: 12, width: 40 });
          write(issue.year.slice(-2), 175, 230, { size: 12 });
        }
        if (page === 13 && issue) {
          write(money(data.wreath_value), 190, 152, { size: 13 });
          write(amountWords(data.wreath_value), 26, 157, { width: 168 });
          write(issue.day, 132, 206, { size: 12 });
          write(issue.month, 150, 206, { size: 12, width: 40 });
          write(issue.year.slice(-2), 191, 206, { size: 12 });
        }
        if (page === 14 && issue) {
          write(money(data.transfer_value), 173, 145, { size: 13 });
          write(amountWords(data.transfer_value), 26, 150, { width: 175 });
          write(issue.day, 132, 208, { size: 12 });
          write(issue.month, 150, 208, { size: 12, width: 40 });
          write(issue.year.slice(-2), 191, 208, { size: 12 });
        }
      });
      doc.end();
    } catch (error) {
      doc.end();
      reject(error);
    }
  });
}