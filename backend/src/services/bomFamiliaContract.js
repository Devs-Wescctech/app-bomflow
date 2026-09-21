import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getOrcamentoDetalhe } from './erpDbService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pagesDir = path.resolve(__dirname, '../../public/bom-familia-contract');
const portabilityPagesDir = path.resolve(
  __dirname,
  '../../public/bom-familia-portability-contract',
);
const ERP_BASE = 'http://erp.wescctech.com.br:8080/BP_MULTI/api';

export const BOM_FAMILIA_BASE_PRODUCT_IDS = Object.freeze([106446285, 106133471, 206572571]);
export const BOM_FAMILIA_PORTABILITY_BASE_PRODUCT_IDS = Object.freeze([314795021]);

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
const rows = (body) => Array.isArray(body) ? body
  : Array.isArray(body?.results) ? body.results
    : Array.isArray(body?.data) ? body.data : [];

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
      headers: { Authorization: `Bearer ${process.env.ERP_AUTH_TOKEN}`, Accept: 'application/json' },
      signal: controller.signal,
    });
    if (response.status === 204) return [];
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(`O ERP recusou a consulta ${endpoint}.`);
      error.statusCode = response.status;
      throw error;
    }
    return rows(body);
  } finally {
    clearTimeout(timer);
  }
}

export function bomFamiliaPaymentCategory(planId) {
  const id = Number(planId);
  if (PAYMENT_PLAN_IDS.cpfl.has(id)) return 'cpfl';
  if (PAYMENT_PLAN_IDS.bank.has(id)) return 'bank';
  if (PAYMENT_PLAN_IDS.credit_card.has(id)) return 'credit_card';
  return null;
}

export async function loadBomFamiliaFromErp(cpf, pedido) {
  const [searchRows, holderRows, dependentRows, billingRows, cremationRows, wreathRows, mileageRows] =
    await Promise.all([
      request('API_PESQUISA_ASSINATURA_FAMILIA', cpf, pedido),
      request('API_FAMILIA_TITULAR', cpf, pedido, { pedidoRequired: false }),
      request('API_FAMILIA_DEPENDENTES', cpf, pedido),
      request('API_DADOS_COB_FAMILIA', cpf, pedido),
      request('API_DADOS_CREMACAO_FAMILIA', cpf, pedido),
      request('API_DADOS_COROA_FAMILIA', cpf, pedido),
      request('API_FAMILIA_QUILOMETRAGEM', cpf, pedido),
    ]);
  const search = first(searchRows) || {};
  const holder = first(holderRows) || {};
  const billing = billingRows.find((row) => amount(row.total_valor) > 2)
    || first(billingRows) || {};
  const familyRows = dependentRows.filter((row) => /BD FAMILIA/i.test(text(row.descricao)));
  const bomMedRows = dependentRows.filter((row) => /BOM MED/i.test(text(row.descricao)));
  const mapPerson = (row) => ({
    name: text(row.nome_pessoa),
    cpf: text(row.cpf_dependente || row.cpf),
    birth_date: row.data_nascimento || null,
    phone: text(row.telefone),
    sex: text(row.sexo).toUpperCase().slice(0, 1),
    relationship: text(row.parentesco),
  });
  const unique = (list) => [...new Map(list.map((row) => [
    `${text(row.nome_pessoa)}|${text(row.data_nascimento)}`,
    mapPerson(row),
  ])).values()];
  const optional = (list) => rounded(list.reduce(
    (total, row) => total + amount(row.total_valor || row.preco) * amount(row.qtd || row.quantidade || 1),
    0,
  ));
  const detail = billing.pedido_id ? await getOrcamentoDetalhe(Number(billing.pedido_id)) : null;
  const products = Array.isArray(detail?.produtos) ? detail.produtos : [];
  const detailDependents = (Array.isArray(detail?.pessoas) ? detail.pessoas : [])
    .filter((person) => !person.is_titular);
  const mapDetailPerson = (person) => ({
    name: text(person.nome),
    cpf: text(person.cpf),
    birth_date: person.data_nascimento || null,
    phone: text(person.telefone),
    sex: text(person.sexo).toUpperCase().slice(0, 1),
    relationship: text(person.parentesco),
  });
  const hasProduct = (person, pattern) => (person.produtos || [])
    .some((description) => pattern.test(text(description)));
  const detailedFamilyDependents = detailDependents
    .filter((person) => hasProduct(person, /BD FAMILIA.*DEPENDENTE/i))
    .map(mapDetailPerson);
  const detailedBomMedDependents = detailDependents
    .filter((person) => hasProduct(person, /BOM MED.*DEPENDENTE/i))
    .map(mapDetailPerson);
  const productTotal = (product) => amount(product?.valor_total)
    || amount(product?.preco) * amount(product?.quantidade || 1);
  const thanatopraxyProducts = products.filter((product) => /TANATO/i.test(text(product.descricao)));
  const mileageProduct = products.find((product) => /QUILOMETRAGEM/i.test(text(product.descricao)));
  const mileageDescription = text(mileageProduct?.descricao);
  const mileageMatch = mileageDescription.match(/(\d+)\s*(?:MIL\s*)?KM/i);
  const mileageKilometers = /1\s*MIL\s*KM/i.test(mileageDescription)
    ? 1000
    : Number(mileageMatch?.[1] || 0);
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
    profession: text(holder.profissao) || 'Outros',
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
    monthly_value: rounded(amount(billing.total_valor)),
    cremation_value: optional(cremationRows),
    wreath_value: optional(wreathRows),
    wreath_quantity: wreathRows.reduce((total, row) => total + amount(row.qtd || row.quantidade), 0),
    mileage_value: optional(mileageRows),
    mileage_quantity: mileageKilometers,
    thanatopraxy_value: rounded(thanatopraxyProducts.reduce(
      (total, product) => total + productTotal(product),
      0,
    )),
    payment_plan_id: billing.plano_pagamento || null,
    due_day: text(billing.dia_vencimento),
    dependents: detailedFamilyDependents.length ? detailedFamilyDependents : unique(familyRows),
    bom_med_dependents: detailedBomMedDependents.length ? detailedBomMedDependents : unique(bomMedRows),
  };
}

export async function loadBomFamiliaPortabilityFromErp(cpf, pedido, pedidoId) {
  const [holderRows, detail] = await Promise.all([
    request('API_FAMILIA_TITULAR', cpf, pedido, { pedidoRequired: false }),
    getOrcamentoDetalhe(Number(pedidoId)),
  ]);
  const holder = first(holderRows) || {};
  const titular = detail?.titular || {};
  const address = detail?.endereco || titular.endereco || {};
  const products = Array.isArray(detail?.produtos) ? detail.produtos : [];
  const people = Array.isArray(detail?.pessoas) ? detail.pessoas : [];
  const baseProduct = products.find((product) =>
    BOM_FAMILIA_PORTABILITY_BASE_PRODUCT_IDS.includes(Number(product?.id)));
  if (!baseProduct) {
    const error = new Error('O pedido não contém o produto Plano Família-Portabilidade.');
    error.statusCode = 422;
    throw error;
  }
  const productTotal = (product) => amount(product?.valor_total)
    || amount(product?.preco) * amount(product?.quantidade || 1);
  const productsMatching = (pattern) => products.filter((product) =>
    pattern.test(text(product?.descricao)));
  const sumProducts = (pattern) => rounded(productsMatching(pattern)
    .reduce((total, product) => total + productTotal(product), 0));
  const linkedTo = (person, pattern) => (person?.produtos || [])
    .some((description) => pattern.test(text(description)));
  const mapPerson = (person) => ({
    name: text(person.nome),
    cpf: text(person.cpf),
    birth_date: person.data_nascimento || null,
    phone: text(person.telefone),
    sex: text(person.sexo).toUpperCase().slice(0, 1),
    relationship: text(person.parentesco),
  });
  const dependents = people
    .filter((person) => !person.is_titular && linkedTo(person, /FAM[IÍ]LIA.*PORTABILIDADE/i))
    .map(mapPerson);
  const bomMedDependents = people
    .filter((person) => !person.is_titular && linkedTo(person, /BOM MED.*DEPENDENTE/i))
    .map(mapPerson);
  const mileageProduct = productsMatching(/QUILOMETRAGEM/i)[0];
  const mileageDescription = text(mileageProduct?.descricao);
  const mileageMatch = mileageDescription.match(/(\d+)\s*(?:MIL\s*)?KM/i);
  const mileageKilometers = /1\s*MIL\s*KM/i.test(mileageDescription)
    ? 1000
    : Number(mileageMatch?.[1] || 0);
  const sexSource = text(holder.sexo || titular.sexo).toUpperCase();
  const sex = sexSource.startsWith('F') ? 'FEMININO'
    : sexSource.startsWith('M') ? 'MASCULINO' : sexSource;
  const observations = text(detail?.observacoes);
  const adhesionMatch = observations.match(/ADES[AÃ]O[^\d]*([\d.,]+)/i);
  const adhesion = adhesionMatch
    ? Number(adhesionMatch[1].replace(/\./g, '').replace(',', '.'))
    : 0;
  const wreathProducts = productsMatching(/COROA DE FLORES/i);
  return {
    pedido: text(pedido),
    issue_date: detail?.data_emissao || null,
    observations,
    name: text(holder.cliente || titular.nome),
    cpf: text(holder.documento || titular.cpf || cpf),
    rg: text(holder.rg || titular.rg),
    birth_date: holder.data_nascimento || titular.data_nascimento || null,
    sex,
    marital_status: text(holder.estado_civil || 'OUTROS').toUpperCase(),
    profession: text(holder.profissao || titular.profissao) || 'Outros',
    income: text(holder.renda || titular.renda),
    address: text(holder.endereco || address.logradouro),
    complement: text(holder.complemento || address.complemento),
    number: text(holder.numero || address.numero),
    district: text(holder.bairro || address.bairro),
    city: text(holder.cidade || address.cidade),
    state: text(holder.sigla || address.uf).toUpperCase(),
    cep: text(holder.codigo_postal || address.cep),
    phone: text(holder.telefone1 || titular.telefone),
    phone2: text(holder.telefone2 || detail?.telefone_secundario),
    email: text(holder.email || detail?.email || titular.email),
    adhesion: rounded(adhesion),
    monthly_value: rounded(amount(baseProduct.preco) || amount(detail?.valor_mensal)),
    cremation_value: sumProducts(/CREMAÇÃO|CREMACAO/i),
    wreath_value: sumProducts(/COROA DE FLORES/i),
    wreath_quantity: wreathProducts.reduce(
      (total, product) => total + amount(product.quantidade || 1),
      0,
    ),
    mileage_value: mileageProduct ? rounded(productTotal(mileageProduct)) : 0,
    mileage_quantity: mileageKilometers,
    thanatopraxy_value: sumProducts(/TANATO/i),
    payment_plan_id: detail?.plano_pagamento_id || null,
    due_day: text(detail?.dia_vencimento),
    dependents,
    bom_med_dependents: bomMedDependents,
  };
}

export function validateBomFamiliaContractData(data) {
  const errors = [];
  for (const [label, value] of [
    ['pedido', data?.pedido], ['data de emissão', data?.issue_date],
    ['nome do titular', data?.name], ['CPF do titular', data?.cpf],
    ['data de nascimento', data?.birth_date], ['sexo', data?.sex],
    ['endereço', data?.address], ['número', data?.number], ['bairro', data?.district],
    ['cidade', data?.city], ['estado', data?.state], ['CEP', data?.cep],
    ['telefone', data?.phone], ['plano de pagamento', data?.payment_plan_id],
  ]) if (!text(value)) errors.push(`Campo obrigatório ausente: ${label}.`);
  if (digits(data?.cpf).length !== 11) errors.push('CPF do titular inválido.');
  if (!['MASCULINO', 'FEMININO'].includes(text(data?.sex))) errors.push('Sexo do titular inválido.');
  if (!bomFamiliaPaymentCategory(data?.payment_plan_id)) {
    errors.push('A forma de pagamento não corresponde às opções do contrato Família.');
  }
  if (!Number.isFinite(amount(data?.monthly_value)) || amount(data?.monthly_value) <= 0) {
    errors.push('Valor mensal do Plano Família inválido.');
  }
  if ((data?.dependents || []).length > 9) errors.push('O contrato Família comporta no máximo 9 dependentes.');
  if ((data?.bom_med_dependents || []).length > 9) {
    errors.push('O protocolo Bom Med comporta no máximo 9 dependentes.');
  }
  return errors;
}

const dateParts = (value) => {
  const match = text(value instanceof Date ? value.toISOString() : value)
    .match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const month = new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' })
    .format(new Date(`${match[1]}-${match[2]}-${match[3]}T12:00:00Z`));
  return { year: match[1], month_number: match[2], day: match[3], month };
};
const money = (value) => amount(value).toLocaleString('pt-BR', {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});
const integerWords = (value) => {
  const number = Math.max(0, Math.trunc(amount(value)));
  const units = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
  const teens = ['dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
  const tens = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  const hundreds = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos',
    'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
  const belowThousand = (part) => {
    if (part === 0) return '';
    if (part === 100) return 'cem';
    const words = [];
    const hundred = Math.floor(part / 100);
    const rest = part % 100;
    if (hundred) words.push(hundreds[hundred]);
    if (rest) {
      const restWords = rest < 10 ? units[rest]
        : rest < 20 ? teens[rest - 10]
          : [tens[Math.floor(rest / 10)], units[rest % 10]].filter(Boolean).join(' e ');
      if (words.length) words.push('e');
      words.push(restWords);
    }
    return words.join(' ');
  };
  if (number === 0) return 'zero';
  if (number < 1000) return belowThousand(number);
  if (number < 1_000_000) {
    const thousand = Math.floor(number / 1000);
    const rest = number % 1000;
    const prefix = thousand === 1 ? 'mil' : `${belowThousand(thousand)} mil`;
    if (!rest) return prefix;
    return `${prefix}${rest < 100 || rest % 100 === 0 ? ' e ' : ' '}${belowThousand(rest)}`;
  }
  return String(number);
};
async function renderBomFamilia(data, { portability = false } = {}) {
  const modelDir = portability ? portabilityPagesDir : pagesDir;
  const modelLabel = portability ? 'Família-Portabilidade' : 'Família';
  const backgrounds = Array.from({ length: 17 }, (_, index) =>
    path.join(modelDir, `page-${index + 1}.jpg`));
  backgrounds.forEach((source, index) => {
    if (!fs.existsSync(source)) {
      throw new Error(`Página ${index + 1} do contrato ${modelLabel} não encontrada.`);
    }
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
      doc.font('Times-Roman').fontSize(size);
      while (width && doc.widthOfString(content) > mm(width) && doc._fontSize > minSize) {
        doc.fontSize(doc._fontSize - 0.5);
      }
      doc.text(content, mm(x + 1), mm(y + 1), {
        width: width ? mm(width) : undefined, lineBreak: false,
      });
    };
    const addPage = (source) => {
      doc.addPage();
      doc.image(source, 0, 0, { width: 595.28, height: 841.89 });
      doc.fillColor('#111');
    };
    const writeDate = (value, x, y) => {
      const date = dateParts(value);
      if (!date) return;
      write(date.day, x, y); write(date.month_number, x + 8, y); write(date.year, x + 15, y);
    };
    const writePerson = (person, y, { bomMed = false, showSex = true } = {}) => {
      write(person.name, 25, y, { size: bomMed ? 9 : 10, width: bomMed ? 66 : 100 });
      if (bomMed) write(person.cpf, 93, y, { size: 9, width: 38 });
      write(digits(person.phone), bomMed ? 133 : 170, y, { size: 9, width: 29 });
      if (showSex && person.sex) {
        write('X', bomMed ? (person.sex === 'M' ? 163 : 165) : (person.sex === 'M' ? 125 : 128), y);
      }
      const birth = dateParts(person.birth_date);
      if (birth) {
        const x = bomMed ? 179 : 142;
        const monthX = bomMed ? x + 7 : x + 9;
        const yearX = bomMed ? x + 13 : x + 16;
        const dateSize = bomMed ? 8 : 9;
        write(birth.day, x, y, { size: dateSize });
        write(birth.month_number, monthX, y, { size: dateSize });
        write(birth.year, yearX, y, { size: dateSize });
      }
      if (bomMed) write('X', 198, y);
    };
    const issue = dateParts(data.issue_date) || dateParts(new Date());
    try {
      for (let page = 1; page <= 17; page += 1) {
        addPage(backgrounds[page - 1]);
        if (page === 5) {
          const total = amount(data.monthly_value) + amount(data.cremation_value)
            + amount(data.wreath_value) + amount(data.mileage_value);
          [[data.adhesion, 29], [data.monthly_value, 55], [data.cremation_value, 80],
            [data.wreath_value, 110], [data.mileage_value, 135], [total, 160]]
            .forEach(([value, x]) => write(money(value), x, 58));
          write(data.name, 25, 68, { width: 118 });
          write('X', data.sex === 'FEMININO' ? 151 : 147, 68);
          write('X', data.marital_status === 'SOLTEIRO' ? 159
            : data.marital_status === 'CASADO' ? 164 : 169, 68);
          writeDate(data.birth_date, 180, 68);
          write(data.cpf, 25, 76.5); write(data.rg, 115, 76.5);
          write([data.address, data.complement].filter(Boolean).join(' - '), 25, 84, { width: 157 });
          write(data.number, 186, 84); write(data.district, 25, 91.5);
          write(data.city, 108, 91.5); write(data.state, 25, 100);
          [...digits(data.cep).slice(0, 8)].forEach((digit, index) =>
            write(digit, [36, 41, 46, 50, 55, 63, 67, 72][index], 100, { size: 10 }));
          write(digits(data.phone), 78, 100); write(digits(data.phone2), 133, 100);
          write(data.profession, 25, 108); write(data.income, 70, 108);
          write(data.email, 110, 108, { size: 9, width: 94 });
          const relativeRows = new Map([
            ['PAI', 116], ['P', 116], ['MÃE', 123], ['MAE', 123], ['M', 123],
            ['SOGRO', 130], ['SOGRA', 137], ['CÔNJUGE', 145], ['CONJUGE', 145],
          ]);
          let childIndex = 0;
          (data.dependents || []).forEach((person) => {
            const relationship = text(person.relationship).toUpperCase();
            const relativeY = relativeRows.get(relationship);
            const y = relativeY ?? 153 + childIndex++ * 5.5;
            writePerson(person, y, { showSex: relativeY == null });
          });
          const paymentX = { cpfl: 111, bank: 148.5, credit_card: 166.5 }[
            bomFamiliaPaymentCategory(data.payment_plan_id)];
          write('X', paymentX, 216.5);
          if (issue) {
            write(issue.day, 36, 222); write(issue.month, 50, 222); write(issue.year, 74, 222);
          }
          if (bomFamiliaPaymentCategory(data.payment_plan_id) !== 'cpfl') {
            const dueX = { 10: 107, 15: 126, 20: 145, 25: 164 }[Number(data.due_day)];
            if (dueX) write('X', dueX, 232);
          }
        }
        if (page === 15 && issue) {
          write(issue.day, 113, 188, { size: 12 });
          write(issue.month, 133, 188, { size: 12, width: 39 });
          write(issue.year.slice(-2), 174, 188, { size: 12 });
        }
        if (page === 16) {
          write(data.name, 25, 62, { width: 118 });
          write('X', data.sex === 'FEMININO' ? 152 : 146, 62);
          write('X', data.marital_status === 'SOLTEIRO' ? 158
            : data.marital_status === 'CASADO' ? 165 : 170, 62);
          writeDate(data.birth_date, 178, 62);
          write(data.cpf, 25, 69); write(data.rg, 117, 69);
          write(data.address, 25, 77, { width: 157 }); write(data.number, 187, 77);
          write(data.district, 25, 84); write(data.city, 109, 84);
          write(data.state, 25, 91.5);
          [...digits(data.cep).slice(0, 8)].forEach((digit, index) =>
            write(digit, [36, 41, 45, 50, 54, 63, 67, 72][index], 91.5, { size: 10 }));
          write(digits(data.phone), 80, 91.5); write(digits(data.phone2), 135, 91.5);
          write(data.profession, 25, 98.5); write(data.email, 106, 98.5, { size: 10, width: 98 });
          const relatives = new Map([
            ['PAI', 107], ['P', 107], ['MÃE', 115], ['MAE', 115], ['M', 115], ['SOGRO', 122],
            ['SOGRA', 129], ['CÔNJUGE', 136], ['CONJUGE', 136],
          ]);
          let genericIndex = 0;
          (data.bom_med_dependents || []).forEach((person) => {
            const relationship = text(person.relationship).toUpperCase();
            const relativeY = relatives.get(relationship);
            const y = relativeY ?? 144 + genericIndex++ * 7.2;
            writePerson(person, y, { bomMed: true, showSex: relativeY == null });
          });
        }
      }
      const addAdendum = (file, fill) => {
        const source = path.join(modelDir, file);
        if (!fs.existsSync(source)) {
          throw new Error(`Adendo ${file} do contrato ${modelLabel} não encontrado.`);
        }
        addPage(source);
        const contractPosition = file === 'mileage.jpg'
          ? { x: 145, y: 65 }
          : portability ? { x: 145, y: 55 } : { x: 162, y: 53 };
        write(data.pedido, contractPosition.x, contractPosition.y, { size: 10, width: 32 });
        fill();
      };
      const writeIssue = (x, y) => {
        if (!issue) return;
        write(issue.day, x, y);
        write(issue.month, x + (portability ? 18 : 13), y, { width: 38 });
        write(issue.year.slice(-2), x + (portability ? 59 : 58), y);
      };
      if (amount(data.wreath_value) > 0) {
        addAdendum('wreath.jpg', () => {
          if (!portability) write(data.wreath_quantity || 1, 24, 91);
          write(money(data.wreath_value), portability ? 128 : 138, portability ? 123 : 119);
          writeIssue(124, portability ? 242 : 240);
        });
      }
      if (amount(data.thanatopraxy_value) > 0) {
        addAdendum('thanatopraxy.jpg', () => {
          write(money(data.thanatopraxy_value), portability ? 98 : 116, portability ? 158.5 : 151);
          if (portability) write('REAIS', 130, 158.5);
          writeIssue(portability ? 125 : 111, portability ? 241 : 250);
        });
      }
      if (amount(data.cremation_value) > 0) {
        addAdendum('cremation.jpg', () => {
          write(money(data.cremation_value), 60, 157);
          if (portability) write('REAIS', 77, 157);
          writeIssue(portability ? 125 : 124, portability ? 241 : 243);
        });
      }
      if (amount(data.mileage_value) > 0) {
        addAdendum('mileage.jpg', () => {
          write(data.mileage_quantity, portability ? 178 : 126, portability ? 93 : 96);
          if (portability) {
            write(integerWords(data.mileage_quantity), 16, 96, { size: 10, width: 70 });
          }
          write(money(data.mileage_value), portability ? 90 : 112, portability ? 128 : 139);
          if (portability) write('REAIS', 128, 128);
          writeIssue(portability ? 125 : 111, portability ? 220 : 231);
        });
      }
      doc.end();
    } catch (error) {
      doc.end();
      reject(error);
    }
  });
}

export async function renderBomFamiliaPdf(data) {
  return renderBomFamilia(data);
}

export async function renderBomFamiliaPortabilityPdf(data) {
  return renderBomFamilia(data, { portability: true });
}
