import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pagesDir = path.resolve(__dirname, '../../public/bom-ideal-contract');
const ERP_BASE = 'http://erp.wescctech.com.br:8080/BP_MULTI/api';

export const BOM_IDEAL_BASE_PRODUCT_IDS = Object.freeze([
  214479204, // BOM DESCANSO IDEAL (BASE)
  214479899, // BOM DESCANSO IDEAL (PROMOCIONAL)
]);

const PAYMENT_PLAN_IDS = Object.freeze({
  cpfl: new Set([32922780]),
  bank: new Set([25451, 48296791, 40564923, 48286734, 1643483, 48295856, 82623870]),
  credit_card: new Set([46285, 47214448, 48395023, 88733784]),
});

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

export function bomIdealPaymentCategory(planId) {
  const id = Number(planId);
  if (PAYMENT_PLAN_IDS.cpfl.has(id)) return 'cpfl';
  if (PAYMENT_PLAN_IDS.bank.has(id)) return 'bank';
  if (PAYMENT_PLAN_IDS.credit_card.has(id)) return 'credit_card';
  return null;
}

export async function loadBomIdealFromErp(cpf, pedido) {
  const [
    searchRows,
    holderRows,
    dependentRows,
    billingRows,
    cremationRows,
    wreathRows,
    mileageRows,
  ] = await Promise.all([
    request('API_PESQUISA_ASSINATURA_IDEAL', cpf, pedido),
    request('API_IDEAL_TITULAR', cpf, pedido, { pedidoRequired: false }),
    request('API_IDEAL_DEPENDENTES', cpf, pedido),
    request('API_DADOS_COB_IDEAL', cpf, pedido),
    request('API_DADOS_CREMACAO_IDEAL', cpf, pedido),
    request('API_DADOS_COROA_IDEAL', cpf, pedido),
    request('API_IDEAL_QUILOMETRAGEM', cpf, pedido),
  ]);
  const search = first(searchRows) || {};
  const holder = first(holderRows) || {};
  const spouse = dependentRows.find((row) => text(row.parentesco) === 'Cônjuge') || null;
  const children = dependentRows.filter((row) => text(row.parentesco) === 'Filho/Filha');
  const dependents = dependentRows.filter((row) => text(row.parentesco) === 'Dependente');
  const billing = billingRows.find((row) => amount(row.total_valor) > 2)
    || first(billingRows)
    || {};
  const monthlyValue = billingRows
    .filter((row) => amount(row.total_valor) > 2)
    .reduce((total, row) => total + amount(row.total_valor), 0);
  const optionalTotal = (rows) => amount(first(rows)?.total_valor);
  const person = (row) => row ? ({
    name: text(row.nome_pessoa),
    birth_date: row.data_nascimento || null,
    phone: text(row.telefone),
    sex: text(row.sexo).toUpperCase(),
  }) : null;

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
    monthly_value: rounded(monthlyValue),
    cremation_value: rounded(optionalTotal(cremationRows)),
    wreath_value: rounded(optionalTotal(wreathRows)),
    mileage_value: rounded(optionalTotal(mileageRows)),
    payment_plan_id: billing.plano_pagamento || null,
    due_day: text(billing.dia_vencimento),
    spouse: person(spouse),
    children: children.map(person),
    dependents: dependents.map(person),
  };
}

export function validateBomIdealContractData(data) {
  const errors = [];
  for (const [label, value] of [
    ['pedido', data?.pedido],
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
  if (!['MASCULINO', 'FEMININO'].includes(text(data?.sex))) errors.push('Sexo do titular inválido.');
  if (!bomIdealPaymentCategory(data?.payment_plan_id)) {
    errors.push('A forma de pagamento não corresponde às opções do contrato Bom Ideal.');
  }
  if (!Number.isFinite(amount(data?.monthly_value)) || amount(data?.monthly_value) <= 0) {
    errors.push('Valor mensal do Bom Ideal inválido.');
  }
  if ((data?.children || []).length > 4) {
    errors.push('O contrato Bom Ideal comporta no máximo 4 filhos na página de adesão.');
  }
  if ((data?.dependents || []).length > 9) {
    errors.push('O contrato Bom Ideal comporta no máximo 9 dependentes adicionais.');
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

export async function renderBomIdealPdf(data) {
  const backgrounds = new Map();
  for (let page = 1; page <= 16; page += 1) {
    const source = path.join(pagesDir, `page-${page}.jpg`);
    if (!fs.existsSync(source)) throw new Error(`Página ${page} do contrato Bom Ideal não encontrada.`);
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
    const writeDate = (value, x, y, positions = [0, 10, 19]) => {
      const date = dateParts(value);
      if (!date) return;
      write(date.day, x + positions[0], y, { size: 11 });
      write(date.month_number, x + positions[1], y, { size: 11 });
      write(date.year, x + positions[2], y, { size: 11 });
    };
    const writePerson = (person, y, { checks = false } = {}) => {
      if (!person) return;
      write(person.name, 25, y, { size: 11, width: checks ? 98 : 112 });
      if (checks) {
        const sexX = person.sex === 'M' ? 125 : 128;
        write('X', sexX, y, { size: 10 });
      }
      const birth = dateParts(person.birth_date);
      if (birth) {
        write(birth.day, 142, y, { size: 10, width: 7 });
        write(birth.month_number, 152, y, { size: 10, width: 7 });
        write(birth.year, 159, y, { size: 9, width: 10 });
      }
      write(digits(person.phone), 170, y, { size: 10, width: 34 });
    };
    const issue = dateParts(data.issue_date) || dateParts(new Date());
    try {
      for (let page = 1; page <= 16; page += 1) {
        addPage(page);
        if (page === 5) {
          const total = amount(data.monthly_value) + amount(data.cremation_value)
            + amount(data.wreath_value) + amount(data.mileage_value);
          write(money(data.adhesion), 29, 58);
          write(money(data.monthly_value), 55, 58);
          write(money(data.cremation_value), 80, 58);
          write(money(data.wreath_value), 110, 58);
          write(money(data.mileage_value), 135, 58);
          write(money(total), 170, 58);
          write(data.name, 25, 68, { width: 118 });
          if (data.sex === 'MASCULINO') write('X', 147, 68);
          if (data.sex === 'FEMININO') write('X', 151, 68);
          const civilX = data.marital_status === 'SOLTEIRO' ? 159
            : data.marital_status === 'CASADO' ? 164 : 169;
          write('X', civilX, 68);
          writeDate(data.birth_date, 180, 68, [0, 8, 15]);
          write(data.cpf, 25, 76.5, { width: 88 });
          write(data.rg, 115, 76.5, { width: 88 });
          write([data.address, data.complement].filter(Boolean).join(' - '), 25, 84, { width: 157 });
          write(data.number, 186, 84, { width: 18 });
          write(data.district, 25, 91.5, { width: 78 });
          write(data.city, 108, 91.5, { width: 93 });
          write(data.state, 25, 100);
          const cep = digits(data.cep).slice(0, 8);
          [36, 41, 46, 50, 55, 63, 67, 72].forEach((x, index) => write(cep[index], x, 100, { size: 10 }));
          write(digits(data.phone), 78, 100, { width: 52 });
          write(digits(data.phone2), 133, 100, { width: 67 });
          write(data.profession, 25, 108, { width: 43 });
          write(data.income, 70, 108, { width: 38 });
          write(data.email, 110, 108, { size: 8, width: 94 });
          writePerson(data.spouse, 116);
          (data.children || []).forEach((person, index) => writePerson(person, 124 + index * 6));
          (data.dependents || []).forEach((person, index) => writePerson(person, 152 + index * 6, { checks: true }));
          text(data.observations)
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
            .slice(0, 2)
            .forEach((line, index) => write(line, 30, 205 + index * 5, {
              size: 9,
              width: 175,
            }));
          const paymentX = {
            cpfl: 111,
            bank: 148.5,
            credit_card: 166.5,
          }[bomIdealPaymentCategory(data.payment_plan_id)];
          if (paymentX) write('X', paymentX, 216.5);
          if (issue) {
            write(issue.day, 36, 222);
            write(issue.month, 50, 222, { width: 22 });
            write(issue.year, 74, 222);
          }
          if (bomIdealPaymentCategory(data.payment_plan_id) !== 'cpfl') {
            const dueX = { 10: 107, 15: 126, 20: 145, 25: 164 }[Number(data.due_day)];
            if (dueX) write('X', dueX, 232);
          }
        }
        if (page === 16 && issue) {
          write(issue.day, 129, 208.5, { size: 12 });
          write(issue.month, 149, 208.5, { size: 12, width: 38 });
          write(issue.year.slice(-2), 190, 208.5, { size: 12 });
        }
      }
      doc.end();
    } catch (error) {
      doc.end();
      reject(error);
    }
  });
}