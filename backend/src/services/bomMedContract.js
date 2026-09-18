import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pagesDir = path.resolve(__dirname, '../../public/bom-med-contract');
const ERP_BASE = 'http://erp.wescctech.com.br:8080/BP_MULTI/api';

export const BOM_MED_BASE_PRODUCT_IDS = Object.freeze([
  48337304,
  48337330,
  48337363,
  206544499,
  206545178,
  222037749,
]);

const BANK_PAYMENT_PLAN_IDS = new Set([
  25451, 48296791, 48286734, 1643483,
]);
const text = (value) => String(value ?? '').trim();
const digits = (value) => text(value).replace(/\D/g, '');
const amount = (value) => Number(value || 0);
const rounded = (value) => Math.round((amount(value) + Number.EPSILON) * 100) / 100;
const first = (value) => (Array.isArray(value) ? value[0] : null);
const normalizeRows = (body) => {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.results)) return body.results;
  if (Array.isArray(body?.data)) return body.data;
  return [];
};

async function request(endpoint, cpf, pedido, { pedidoRequired = true } = {}) {
  if (!process.env.ERP_AUTH_TOKEN) {
    const error = new Error('Token do ERP não configurado.');
    error.statusCode = 503;
    throw error;
  }
  const url = new URL(`${ERP_BASE}/${endpoint}`);
  url.searchParams.set('documento', cpf);
  if (pedidoRequired) url.searchParams.set('pedido', pedido);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${process.env.ERP_AUTH_TOKEN}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    if (response.status === 204) return [];
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(`O ERP recusou a consulta ${endpoint}.`);
      error.statusCode = response.status;
      throw error;
    }
    return normalizeRows(body);
  } finally {
    clearTimeout(timer);
  }
}

export async function loadBomMedFromErp(cpf, pedido) {
  const [searchRows, holderRows, dependentRows, billingRows] = await Promise.all([
    request('API_PESQUISA_ASSINATURA_BOM_MED', cpf, pedido),
    request('API_BOM_MED_TITULAR', cpf, pedido, { pedidoRequired: false }),
    request('API_BOM_MED_DEPENDENTES', cpf, pedido),
    request('API_DADOS_COB_BOM_MED', cpf, pedido),
  ]);
  const search = first(searchRows) || {};
  const holder = first(holderRows) || {};
  const mainBilling = billingRows.filter((row) => amount(row.total_valor) > 3);
  const billing = first(mainBilling) || first(billingRows) || {};
  const dependents = dependentRows.map((row) => ({
    name: text(row.nome_pessoa),
    cpf: text(row.cpf_dependente || row.cpf),
    birth_date: row.data_nascimento || null,
    phone: text(row.telefone),
    sex: text(row.sexo).toUpperCase(),
    price: rounded(row.preco),
  })).sort((left, right) => left.price - right.price);
  const dependentTotal = dependents
    .filter((dependent) => dependent.price > 1)
    .reduce((total, dependent) => total + dependent.price, 0);
  const billedTotal = mainBilling.reduce((total, row) => total + amount(row.total_valor), 0);
  const standardValue = dependentTotal > 1 ? billedTotal - dependentTotal : billedTotal;
  return {
    pedido: text(search.pedido || pedido),
    issue_date: search.data_emissao || null,
    observations: text(search.observacoes),
    name: text(holder.cliente || search.nome_completo),
    cpf: text(holder.documento || search.documento || cpf),
    rg: text(holder.rg),
    birth_date: holder.data_nascimento || null,
    sex: text(holder.sexo).toUpperCase(),
    marital_status: text(holder.estado_civil).toUpperCase(),
    profession: text(holder.profissao),
    income: text(holder.renda),
    address: text(holder.endereco),
    complement: text(holder.complemento),
    number: text(holder.numero),
    district: text(holder.bairro),
    city: text(holder.cidade),
    state: text(holder.sigla).toUpperCase(),
    cep: text(holder.codigo_postal),
    phone: text(holder.telefone1),
    phone2: text(holder.telefone2),
    email: text(holder.email),
    adhesion: rounded(billing.adesao),
    standard_value: rounded(standardValue),
    dependent_value: rounded(dependentTotal),
    monthly_value: rounded(standardValue + dependentTotal),
    payment_plan_id: billing.plano_pagamento || null,
    due_day: text(billing.dia_vencimento),
    dependents,
  };
}

export function validateBomMedContractData(data) {
  const errors = [];
  for (const [label, value] of [
    ['pedido', data?.pedido],
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
  ]) {
    if (!text(value)) errors.push(`Campo obrigatório ausente: ${label}.`);
  }
  if (digits(data?.cpf).length !== 11) errors.push('CPF do titular inválido.');
  if (!['MASCULINO', 'FEMININO'].includes(text(data?.sex))) errors.push('Sexo do titular inválido.');
  if (!Number.isFinite(amount(data?.monthly_value)) || amount(data?.monthly_value) <= 0) {
    errors.push('Valor mensal do Bom Med inválido.');
  }
  if ((data?.dependents || []).length > 9) {
    errors.push('O contrato Bom Med comporta no máximo 9 dependentes.');
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
const money = (value) => amount(value).toLocaleString('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export async function renderBomMedPdf(data) {
  const backgrounds = new Map();
  for (let page = 1; page <= 6; page += 1) {
    const source = path.join(pagesDir, `page-${page}.jpg`);
    if (!fs.existsSync(source)) throw new Error(`Página ${page} do contrato Bom Med não encontrada.`);
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
    const writeDate = (value, x, y, { compact = false } = {}) => {
      const date = dateParts(value);
      if (!date) return;
      write(date.day, x, y, { size: 10 });
      write(date.month_number, x + (compact ? 9 : 10), y, { size: 10 });
      write(date.year, x + (compact ? 15.5 : 18), y, {
        size: compact ? 6.5 : 9,
        width: compact ? 7 : 12,
      });
    };
    const issue = dateParts(data.issue_date) || dateParts(new Date());
    try {
      for (let page = 1; page <= 6; page += 1) {
        doc.addPage();
        doc.image(backgrounds.get(page), 0, 0, { width: 595.28, height: 841.89 });
        doc.fillColor('#111');
        if (page === 2) {
          write(money(data.adhesion), 20, 50.5);
          write(money(data.standard_value), 48, 50.5);
          write(money(data.dependent_value), 73, 50.5);
          write(money(data.monthly_value), 98, 50.5);
          const dueX = { 10: 16, 15: 42, 20: 68.5, 25: 95 }[Number(data.due_day)];
          if (dueX) write('X', dueX, 60);
          write(data.name, 16, 72, { width: 118 });
          if (data.sex === 'MASCULINO') write('X', 138, 72);
          if (data.sex === 'FEMININO') write('X', 143, 72);
          const civilX = data.marital_status === 'SOLTEIRO' ? 151
            : data.marital_status === 'CASADO' ? 155 : 161;
          write('X', civilX, 72);
          writeDate(data.birth_date, 170, 72);
          write(data.cpf, 16, 80, { width: 88 });
          write(data.rg, 106, 80, { width: 88 });
          write([data.address, data.complement].filter(Boolean).join(' - '), 16, 88, { width: 157 });
          write(data.number, 178, 88, { width: 18 });
          write(data.district, 16, 95.5, { width: 78 });
          write(data.city, 99, 95.5, { width: 93 });
          write(data.state, 16, 103);
          write(data.cep, 28, 103, { width: 38 });
          write(data.phone, 70, 103, { width: 52 });
          write(data.phone2, 125, 103, { width: 67 });
          write(data.profession, 16, 111, { width: 43 });
          write(data.income, 60, 111, { width: 38 });
          write(data.email, 99, 111, { size: 8, width: 95 });
          (data.dependents || []).forEach((dependent, index) => {
            const y = 132 + (index * 6.4) + (index >= 3 ? 6 : 0);
            write(dependent.name, 22, y, { size: 9, width: 76 });
            write(dependent.cpf, 100, y, { size: 9, width: 22 });
            if (dependent.sex === 'F') write('X', 123, y, { size: 10 });
            if (dependent.sex === 'M') write('X', 129.5, y, { size: 10 });
            writeDate(dependent.birth_date, 137, y, { compact: true });
            write(dependent.phone, 159, y, { size: 9, width: 22 });
            if (index >= 3) write(money(dependent.price > 1 ? dependent.price : 0), 185, y, { size: 9 });
          });
          write(money(data.dependent_value), 170, 195, { size: 9 });
          if (issue) {
            write(issue.day, 25, 213);
            write(issue.month, 40, 213, { width: 20 });
            write(issue.year, 67, 213);
          }
          if (BANK_PAYMENT_PLAN_IDS.has(Number(data.payment_plan_id))) write('X', 150, 213.5);
        }
        if (page === 6 && issue) {
          write(issue.day, 115, 195, { size: 12 });
          write(issue.month, 133, 195, { size: 12, width: 38 });
          write(issue.year.slice(-2), 174, 195, { size: 12 });
        }
      }
      doc.end();
    } catch (error) {
      doc.end();
      reject(error);
    }
  });
}