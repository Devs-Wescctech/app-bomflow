import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pageFile = path.resolve(__dirname, '../../public/convalescenca-contract/page-1.jpg');
const ERP_BASE = 'http://erp.wescctech.com.br:8080/BP_MULTI/api';

const text = (value) => String(value ?? '').trim();
const digits = (value) => text(value).replace(/\D/g, '');
const amount = (value) => Number(value || 0);
const first = (value) => (Array.isArray(value) ? value[0] : null);
const normalizeRows = (body) => {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.results)) return body.results;
  if (Array.isArray(body?.data)) return body.data;
  return [];
};

async function request(endpoint, cpf, contact = null) {
  if (!process.env.ERP_AUTH_TOKEN) {
    const error = new Error('Token do ERP não configurado.');
    error.statusCode = 503;
    throw error;
  }
  const url = new URL(`${ERP_BASE}/${endpoint}`);
  url.searchParams.set('documento', cpf);
  if (contact) url.searchParams.set('contato', contact);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${process.env.ERP_AUTH_TOKEN}`,
        Accept: 'application/json',
        documento: cpf,
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

export async function loadConvalescencaFromErp(cpf, contact) {
  const [contractRows, addressRows] = await Promise.all([
    request('API_PESQUISA_ASSINATURA_CONVALESCENCA', cpf, contact),
    request('API_PESQUISA_ASSINATURA_CONVALESCENCA_ENDERECO', cpf),
  ]);
  const contract = first(contractRows) || {};
  const address = first(addressRows) || {};
  const equipment = text(contract.resposta_2);
  return {
    contact: text(contract.contato || contact),
    name: text(contract.cliente || address.nome_completo),
    cpf: text(contract.documento || address.documento || cpf),
    address: text(address.endereco_residencial),
    complement: text(address.complemento),
    number: text(address.numero),
    district: text(address.bairro),
    city: text(address.cidade),
    phone: text(address.celular || address.telefone_residencial || address.telefone_comercial),
    equipment,
    equipment_quantity: equipment ? equipment.split(',').length : 0,
    withdrawal_date: contract.resposta_1 || null,
    expected_return_date: contract.resposta_4 || null,
    return_date: contract.resposta_5 || null,
    lessee: text(contract.resposta_6) || 'Não informado',
    monthly_value: amount(contract.resposta_3),
    grace_days: 30,
    generation_date: new Date(),
  };
}

export function validateConvalescencaContractData(data) {
  const errors = [];
  for (const [label, value] of [
    ['contato', data?.contact],
    ['nome do titular', data?.name],
    ['CPF do titular', data?.cpf],
    ['equipamento', data?.equipment],
    ['data de retirada', data?.withdrawal_date],
    ['locatário', data?.lessee],
  ]) {
    if (!text(value)) errors.push(`Campo obrigatório ausente: ${label}.`);
  }
  if (digits(data?.cpf).length !== 11) errors.push('CPF do titular inválido.');
  if (!Number.isFinite(amount(data?.monthly_value)) || amount(data?.monthly_value) < 0) {
    errors.push('Valor mensal da locação inválido.');
  }
  if (!Number.isInteger(Number(data?.equipment_quantity)) || Number(data?.equipment_quantity) < 1) {
    errors.push('Quantidade de equipamentos inválida.');
  }
  return errors;
}

const formatDate = (value) => {
  const match = text(value instanceof Date ? value.toISOString() : value)
    .match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '';
};

const dateParts = (value) => {
  const match = text(value instanceof Date ? value.toISOString() : value)
    .match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? { year: match[1], month: match[2], day: match[3] } : null;
};

export async function renderConvalescencaPdf(data) {
  if (!fs.existsSync(pageFile)) {
    throw new Error('Modelo do contrato de Convalescença não encontrado.');
  }
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: false });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    const mm = (value) => value * 72 / 25.4;
    const write = (value, x, y, { size = 7, width = null, minSize = 5 } = {}) => {
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
    try {
      doc.addPage();
      doc.image(pageFile, 0, 0, { width: 595.28, height: 841.89 });
      doc.fillColor('#111');
      write(data.name, 40, 49.5, { width: 118 });
      write(data.cpf, 40, 55, { width: 85 });
      const street = [data.address, data.complement].filter(Boolean).join(' - ');
      write(street, 132, 55, { width: 73 });
      write(data.number, 110, 60, { width: 18 });
      write(data.district, 130, 60, { width: 75 });
      write(data.city, 40, 65.5, { width: 65 });
      write(data.phone, 112, 65.5, { width: 50 });
      write(data.equipment, 55, 90, { size: 8, width: 105 });
      write(data.equipment_quantity, 168, 90, { size: 8, width: 20 });
      write(formatDate(data.withdrawal_date), 50, 95, { width: 34 });
      write(formatDate(data.return_date), 110, 95, { width: 34 });
      const fullAddress = `${street} , ${text(data.number)} - ${text(data.district)} - ${text(data.city)}`;
      write(fullAddress, 70, 101, { width: 133 });
      write(data.lessee, 125, 106, { width: 77 });
      write(amount(data.monthly_value).toFixed(2), 116, 128, { width: 35 });
      write(data.grace_days, 100, 155, { width: 20 });
      const issue = dateParts(data.generation_date || new Date());
      if (issue) {
        write(issue.day, 40, 244);
        write(issue.month, 51, 244);
        write(issue.year, 61, 244);
      }
      write('Companhia Nacional de Planos Assistenciais Ltda.', 30, 251, {
        size: 9,
        width: 100,
      });
      doc.end();
    } catch (error) {
      doc.end();
      reject(error);
    }
  });
}