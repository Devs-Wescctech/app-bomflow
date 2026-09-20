import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pagesDir = path.resolve(__dirname, '../../public/total-mais-contract');
const text = (value) => String(value ?? '').trim();
const normalize = (value) => text(value).normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toUpperCase();
const amount = (value) => Number(value || 0);
const rounded = (value) => Math.round((amount(value) + Number.EPSILON) * 100) / 100;
const productAmount = (product) => product?.valor_total != null
  ? amount(product.valor_total)
  : amount(product?.preco) * amount(product?.quantidade || 1);
const digits = (value) => text(value).replace(/\D/g, '');

export const TOTAL_MAIS_BASE_PRODUCT_IDS = Object.freeze([
  40617334, // TOTAL +
  88958582, // TOTAL + & BOM FARMA
  222993462, // TOTAL + & BOM FARMA PRE BLACK ORANGE
  222994403, // TOTAL + & BOM FARMA BLACK ORANGE
  47224884, // TOTAL MAIS
  47225055, // CAMPINAS - TOTAL MAIS
  47892263, // POÇOS DE CALDAS - TOTAL MAIS
  222010875, // TOTAL MAIS PRÉ BLACK
  222012256, // TOTAL MAIS BLACK ORANGE
]);
export const TOTAL_MAIS_BOM_FARMA_PRODUCT_IDS = Object.freeze([
  88958582, 222993462, 222994403,
]);
export const TOTAL_MAIS_PAGE_FIVE_LAYOUT = Object.freeze({
  cepDigitPositions: [36, 41, 46, 51, 56, 62, 67, 72],
  dependentStartY: 189,
  dependentRowGap: 6.5,
  fatherInLawOffsetY: -1,
  maxDependents: 2,
  paymentMethodY: 201,
});
export const TOTAL_MAIS_BOM_MED_LAYOUT = Object.freeze({
  contentOffsetX: 1,
  contentOffsetY: 1.1,
  holderOffsetY: -0.5,
  cepDigitPositions: [36, 41, 46, 51, 56, 62, 67, 72],
  holderBirthPositions: [178, 184.3, 189.9],
  personBirthPositions: [179, 185.3, 190.9],
  civilStatusOffsetX: 1,
  sexOffsetY: -0.5,
  bomMedFlagX: 197.25,
  bomMedFlagOffsetY: -0.75,
  footerOffsetY: 2.2,
  footerTaxOffsetY: -0.1,
  footerPaymentOffsetY: 0.2,
  pageEighteenDateOffsetX: 1,
  pageEighteenDateOffsetY: 0.5,
});
export const TOTAL_MAIS_FINAL_PAGES_LAYOUT = Object.freeze({
  pageNineteenContentOffsetX: 1,
  pageNineteenContentOffsetY: 1.6,
  pageNineteenBirthOffsetY: -1,
  pageNineteenCepDigitPositions: [36, 41, 46, 51, 56, 62, 67, 72],
  pageNineteenPhoneX: 78,
  pageTwentyYearOffsetY: 1.6,
});

const relation = (value, sex) => {
  const key = normalize(value);
  if (key === 'P' || key.includes('PAI')) return 'father';
  if (key === 'M' || key.includes('MAE')) return 'mother';
  if (key === 'C' || key.includes('CONJUG')) return 'spouse';
  if (key === 'F' || key.includes('FILH')) return 'child';
  if (key === 'S' || key.includes('SOGR')) return normalize(sex).startsWith('F') ? 'mother_in_law' : 'father_in_law';
  return 'dependent';
};
const eligibleLinkDescriptions = (person) => {
  if (Array.isArray(person?.product_links)) {
    return person.product_links
      .filter((link) => link?.item_status === 'P' && link?.approved === 'S')
      .map((link) => link?.description);
  }
  return person?.produtos || [];
};
const linkedToTotalMais = (person) => eligibleLinkDescriptions(person)
  .some((description) => normalize(description).includes('TOTAL +')
    || normalize(description).includes('TOTAL MAIS'));
const linkedToBomMed = (person) => eligibleLinkDescriptions(person)
  .some((description) => normalize(description).includes('BOM MED'));
const mapPerson = (person) => ({
  name: text(person?.nome),
  cpf: text(person?.cpf),
  phone: text(person?.telefone),
  birth_date: person?.data_nascimento || null,
  sex: normalize(person?.sexo).slice(0, 1),
  relationship: relation(person?.parentesco, person?.sexo),
  has_bom_med: linkedToBomMed(person),
});
const legacyPersonOrder = (left, right) => {
  const bomMedDifference = Number(right?.has_bom_med) - Number(left?.has_bom_med);
  if (bomMedDifference) return bomMedDifference;
  const leftCpf = digits(left?.cpf);
  const rightCpf = digits(right?.cpf);
  if (leftCpf && rightCpf) {
    const cpfDifference = leftCpf.localeCompare(rightCpf);
    if (cpfDifference) return cpfDifference;
  } else if (leftCpf || rightCpf) {
    return leftCpf ? -1 : 1;
  }
  return normalize(left?.name).localeCompare(normalize(right?.name), 'pt-BR');
};

export function buildTotalMaisContractData(detail) {
  const products = Array.isArray(detail?.produtos) ? detail.produtos : [];
  const eligibleProducts = products.filter((product) => product?.status === 'P');
  const people = Array.isArray(detail?.pessoas) ? detail.pessoas : [];
  const holder = detail?.titular || people.find((person) => person?.is_titular) || {};
  const baseProduct = eligibleProducts
    .filter((product) => TOTAL_MAIS_BASE_PRODUCT_IDS.includes(Number(product?.id)))
    .sort((left, right) => {
      const variantDifference =
        Number(TOTAL_MAIS_BOM_FARMA_PRODUCT_IDS.includes(Number(right?.id)))
        - Number(TOTAL_MAIS_BOM_FARMA_PRODUCT_IDS.includes(Number(left?.id)));
      return variantDifference || Number(left?.sequence || 0) - Number(right?.sequence || 0);
    })[0];
  const linkedPeople = people.filter((person) => !person?.is_titular && linkedToTotalMais(person))
    .map(mapPerson);
  const valueFor = (matcher) => rounded(eligibleProducts
    .filter((product) => matcher(normalize(product?.descricao)))
    .reduce((total, product) => total + productAmount(product), 0));
  const baseValue = rounded(productAmount(baseProduct));
  const bomMedValue = rounded(eligibleProducts
    .filter((product) => normalize(product?.descricao).includes('BOM MED')
      && productAmount(product) > 1)
    .reduce((total, product) => total + productAmount(product), 0));
  const cremationValue = valueFor((description) => description.includes('CREMAC'));
  return {
    pedido: text(detail?.numero_pedido || detail?.pedido),
    name: text(holder?.nome),
    cpf: text(holder?.cpf),
    rg: text(holder?.rg),
    birth_date: holder?.data_nascimento || null,
    sex: normalize(holder?.sexo).slice(0, 1),
    marital_status: normalize(holder?.estado_civil),
    profession: text(holder?.profissao) || 'Outros',
    income: amount(holder?.renda),
    address: text(detail?.endereco?.logradouro || holder?.endereco?.logradouro),
    complement: text(detail?.endereco?.complemento || holder?.endereco?.complemento),
    number: text(detail?.endereco?.numero || holder?.endereco?.numero),
    district: text(detail?.endereco?.bairro || holder?.endereco?.bairro),
    city: text(detail?.endereco?.cidade || holder?.endereco?.cidade),
    state: text(detail?.endereco?.uf || holder?.endereco?.uf).toUpperCase(),
    cep: text(detail?.endereco?.cep || holder?.endereco?.cep),
    phone: text(holder?.telefone),
    phone2: '',
    email: text(detail?.email || holder?.email),
    observations: text(detail?.observacoes),
    issue_date: detail?.data_emissao || null,
    payment_plan: text(detail?.plano_pagamento),
    due_day: Number(detail?.dia_vencimento || 0),
    adhesion_value: 60,
    base_value: baseValue,
    cremation_value: cremationValue,
    bom_med_value: bomMedValue,
    monthly_value: rounded(baseValue + cremationValue + bomMedValue),
    has_bom_farma: TOTAL_MAIS_BOM_FARMA_PRODUCT_IDS.includes(Number(baseProduct?.id)),
    has_bom_med: people.some(linkedToBomMed),
    relatives: linkedPeople.filter((person) =>
      !['child', 'dependent'].includes(person.relationship)),
    children: linkedPeople
      .filter((person) => person.relationship === 'child')
      .sort(legacyPersonOrder),
    dependents: linkedPeople
      .filter((person) => person.relationship === 'dependent')
      .sort(legacyPersonOrder)
      .slice(0, TOTAL_MAIS_PAGE_FIVE_LAYOUT.maxDependents),
    thanatopraxy_value: valueFor((description) => description.includes('TANAT')),
    mileage_value: valueFor((description) => description.includes('QUILOMETR')),
  };
}

export function validateTotalMaisContractData(data) {
  const errors = [];
  for (const [label, value] of [
    ['nome do titular', data?.name], ['CPF do titular', data?.cpf],
    ['data de nascimento', data?.birth_date], ['sexo', data?.sex],
    ['endereço', data?.address], ['número do endereço', data?.number],
    ['bairro', data?.district], ['cidade', data?.city], ['estado', data?.state],
    ['CEP', data?.cep], ['telefone', data?.phone], ['data de emissão', data?.issue_date],
  ]) if (!text(value)) errors.push(`Campo obrigatório ausente: ${label}.`);
  if (!/^\d{11}$/.test(digits(data?.cpf))) errors.push('CPF do titular inválido.');
  if (!/^\d{8}$/.test(digits(data?.cep))) errors.push('CEP inválido.');
  if (!/^\d{10,11}$/.test(digits(data?.phone))) errors.push('Telefone inválido.');
  if (amount(data?.base_value) <= 0) errors.push('Valor mensal do Total Mais inválido.');
  if ((data?.children || []).length > 9) errors.push('O formulário comporta no máximo 9 filhos.');
  if ((data?.dependents || []).length > TOTAL_MAIS_PAGE_FIVE_LAYOUT.maxDependents) {
    errors.push('O formulário comporta no máximo 2 dependentes adicionais.');
  }
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

export function renderTotalMaisPdf(data) {
  if ((data?.dependents || []).length > TOTAL_MAIS_PAGE_FIVE_LAYOUT.maxDependents) {
    throw new Error('A página 5 comporta no máximo 2 dependentes adicionais.');
  }
  const pages = data.has_bom_farma
    ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13,
      ...(data.has_bom_med ? [14, 15, 16, 17, 18] : []), 19, 20]
    : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  if (data.cremation_value > 0) pages.push('cremation');
  if (data.thanatopraxy_value > 0) pages.push('thanatopraxy');
  if (data.mileage_value > 0) pages.push('mileage');
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: false });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    const mm = (value) => value * 72 / 25.4;
    const write = (value, x, y, { size = 8, width = null, minSize = 5.5 } = {}) => {
      const content = text(value);
      if (!content) return;
      let fontSize = size;
      doc.font('Times-Roman').fontSize(fontSize);
      while (width && doc.widthOfString(content) > mm(width) && fontSize > minSize) {
        fontSize -= 0.5;
        doc.fontSize(fontSize);
      }
      doc.text(content, mm(x), mm(y), {
        width: width ? mm(width) : undefined,
        lineBreak: false,
      });
    };
    const issue = dateParts(data.issue_date);
    const birth = (value) => {
      const date = dateParts(value);
      return date ? `${date.day}     ${date.monthNumber}     ${date.year}` : '';
    };
    const writePageFiveBirth = (value, positions, y) => {
      const date = dateParts(value);
      if (!date) return;
      write(date.day, positions[0], y, { size: 7.5 });
      write(date.monthNumber, positions[1], y, { size: 7.5 });
      write(date.year, positions[2], y, { size: 7.5 });
    };
    const writeSpacedDigits = (value, positions, y) => {
      digits(value).slice(0, positions.length).split('').forEach((digit, index) => {
        write(digit, positions[index], y, { size: 7.5 });
      });
    };
    const civilX = () => {
      const civil = normalize(data.marital_status);
      return civil.includes('SOLTEIR') ? 159 : civil.includes('CASAD') ? 164 : 169;
    };
    const address = [data.address, data.complement].filter(Boolean).join(' - ');
    const writeHolder = (offset = 0, finalForm = false, pageFive = false) => {
      const y = finalForm ? 50 : 55.5 + offset;
      write(data.name, 25, y, { width: 115 });
      write('X', data.sex === 'F' ? 151 : 147, y);
      write('X', civilX(), y);
      if (pageFive) writePageFiveBirth(data.birth_date, [180, 189, 198], y);
      else if (finalForm) {
        writePageFiveBirth(
          data.birth_date,
          [180, 189, 197],
          y + TOTAL_MAIS_FINAL_PAGES_LAYOUT.pageNineteenBirthOffsetY,
        );
      }
      else write(birth(data.birth_date), 180, y, { size: 7.5, width: 27 });
      write(data.cpf, 25, finalForm ? 58 : 63.5 + offset, { width: 80 });
      write(data.rg, 115, finalForm ? 58 : 63.5 + offset, { width: 80 });
      write(address, 25, finalForm ? 65.5 : 71 + offset, { width: 155 });
      write(data.number, 186, finalForm ? 65.5 : 71 + offset, { width: 18 });
      write(data.district, 25, finalForm ? 73.5 : 78 + offset, { width: 76 });
      write(data.city, 108, finalForm ? 73.5 : 78 + offset, { width: 92 });
      write(data.state, 25, finalForm ? 81.5 : 85 + offset);
      if (finalForm) {
        writeSpacedDigits(
          data.cep,
          TOTAL_MAIS_FINAL_PAGES_LAYOUT.pageNineteenCepDigitPositions,
          81.5,
        );
      } else if (pageFive) {
        writeSpacedDigits(data.cep, TOTAL_MAIS_PAGE_FIVE_LAYOUT.cepDigitPositions, 85 + offset);
      } else {
        write(data.cep, 36, 85 + offset, { width: 28 });
      }
      write(
        data.phone,
        finalForm ? TOTAL_MAIS_FINAL_PAGES_LAYOUT.pageNineteenPhoneX : 78,
        finalForm ? 81.5 : 85 + offset,
        { width: 48 },
      );
      write(data.phone2, finalForm ? 122 : 133, finalForm ? 81.5 : 85 + offset, { width: 48 });
      write(data.profession, 25, finalForm ? 89.5 : 93 + offset, { width: 40 });
      write(data.income ? money(data.income) : '', 70, finalForm ? 89.5 : 93 + offset, { width: 35 });
      write(data.email, finalForm ? 110 : 160, finalForm ? 89.5 : 93.8 + offset, {
        width: finalForm ? 90 : 45,
      });
    };
    const writeBomMedHolder = (offsetY = 0) => {
      write(data.name, 25, 62 + offsetY, { width: 115 });
      write('X', data.sex === 'F' ? 152 : 146, 62 + offsetY);
      write(
        'X',
        civilX() + TOTAL_MAIS_BOM_MED_LAYOUT.civilStatusOffsetX,
        62 + offsetY,
      );
      writePageFiveBirth(
        data.birth_date,
        TOTAL_MAIS_BOM_MED_LAYOUT.holderBirthPositions,
        62 + offsetY,
      );
      write(data.cpf, 25, 69 + offsetY, { width: 82 });
      write(data.rg, 117, 69 + offsetY, { width: 80 });
      write(data.address, 25, 77 + offsetY, { width: 155 });
      write(data.number, 187, 77 + offsetY, { width: 17 });
      write(data.district, 25, 84 + offsetY, { width: 78 });
      write(data.city, 109, 84 + offsetY, { width: 91 });
      write(data.state, 25, 91.5 + offsetY);
      writeSpacedDigits(
        data.cep,
        TOTAL_MAIS_BOM_MED_LAYOUT.cepDigitPositions,
        91.5 + offsetY,
      );
      write(data.phone, 80, 91.5 + offsetY, { width: 49 });
      write(data.phone2, 135, 91.5 + offsetY, { width: 49 });
      write(data.profession, 25, 98.5 + offsetY, { width: 72 });
      write(data.email, 107, 98.5 + offsetY, { width: 92 });
    };
    const writeDate = (
      xDay,
      xMonth,
      xYear,
      y,
      shortYear = true,
      yearOffsetY = 0,
    ) => {
      if (!issue) return;
      write(issue.day, xDay, y, { size: 9 });
      write(issue.month, xMonth, y, { size: 9, width: 38 });
      write(
        shortYear ? issue.year.slice(-2) : issue.year,
        xYear,
        y + yearOffsetY,
        { size: 9 },
      );
    };
    try {
      for (const page of pages) {
        const source = typeof page === 'number'
          ? path.join(pagesDir, `page-${page}.jpg`)
          : path.join(pagesDir, `${page}.jpg`);
        if (!fs.existsSync(source)) throw new Error(`Página ${page} do contrato Total Mais não encontrada.`);
        doc.addPage();
        doc.image(source, 0, 0, { width: 595.28, height: 841.89 });
        doc.fillColor('#111');
        if (page === 5) {
          // A camada preenchida precisa acompanhar a área útil impressa, que
          // fica deslocada em relação às coordenadas da imagem-base.
          doc.save();
          doc.translate(mm(1), mm(1.6));
          write(money(data.adhesion_value), 25, 47);
          write(money(data.base_value), 65, 47);
          write(money(data.cremation_value), 100, 47);
          write(money(data.bom_med_value), 135, 47);
          write(money(data.monthly_value), 175, 47);
          writeHolder(0, false, true);
          const relativeY = {
            father: 100,
            mother: 107,
            father_in_law: 114 + TOTAL_MAIS_PAGE_FIVE_LAYOUT.fatherInLawOffsetY,
            mother_in_law: 120,
            spouse: 126,
          };
          data.relatives.forEach((person) => {
            const y = relativeY[person.relationship];
            if (!y) return;
            write(person.name, 25, y, { width: 135 });
            writePageFiveBirth(person.birth_date, [172, 180, 188], y);
            if (person.has_bom_med) write('Sim', 197, y);
          });
          data.children.forEach((person, index) => {
            const y = 132 + index * 6.5;
            write(person.name, 25, y, { width: 125 });
            write('x', person.sex === 'F' ? 158.5 : 156, y);
            writePageFiveBirth(person.birth_date, [172, 180, 188], y);
            if (person.has_bom_med) write('Sim', 197, y);
          });
          data.dependents.forEach((person, index) => {
            const y = TOTAL_MAIS_PAGE_FIVE_LAYOUT.dependentStartY
              + index * TOTAL_MAIS_PAGE_FIVE_LAYOUT.dependentRowGap;
            write(person.name, 25, y, { width: 125 });
            write('x', person.sex === 'F' ? 158.5 : 156, y);
            writePageFiveBirth(person.birth_date, [172, 180, 188], y);
            if (person.has_bom_med) write('Sim', 197, y);
          });
          writeDate(36, 50, 74, 207, false);
          const payment = normalize(data.payment_plan);
          write(
            'X',
            payment.includes('CPFL') ? 111 : payment.includes('CARTAO') ? 166.5 : 148.5,
            TOTAL_MAIS_PAGE_FIVE_LAYOUT.paymentMethodY,
          );
          const dueX = { 10: 107, 15: 126, 20: 145, 25: 164 }[data.due_day];
          if (dueX) write('X', dueX, 217);
          doc.restore();
        }
        if (page === 12) writeDate(130, 150, 191, 230);
        if (page === 14) {
          doc.save();
          doc.translate(
            mm(TOTAL_MAIS_BOM_MED_LAYOUT.contentOffsetX),
            mm(TOTAL_MAIS_BOM_MED_LAYOUT.contentOffsetY),
          );
          writeBomMedHolder(TOTAL_MAIS_BOM_MED_LAYOUT.holderOffsetY);
          const bomMedPeople = [...data.relatives, ...data.children, ...data.dependents]
            .filter((person) => person.has_bom_med);
          const relativeY = {
            father: 107, mother: 115, father_in_law: 122, mother_in_law: 129, spouse: 136,
          };
          bomMedPeople.filter((person) => relativeY[person.relationship]).forEach((person) => {
            const y = relativeY[person.relationship];
            write(person.name, 25, y, { width: 62 });
            write(person.cpf, 93, y, { width: 35 });
            write(person.phone, 133, y, { width: 27 });
            writePageFiveBirth(
              person.birth_date,
              TOTAL_MAIS_BOM_MED_LAYOUT.personBirthPositions,
              y,
            );
            write(
              'X',
              TOTAL_MAIS_BOM_MED_LAYOUT.bomMedFlagX,
              y + TOTAL_MAIS_BOM_MED_LAYOUT.bomMedFlagOffsetY,
            );
          });
          bomMedPeople.filter((person) => person.relationship === 'child').forEach((person, index) => {
            const y = 144 + index * 7;
            write(person.name, 25, y, { width: 62 });
            write(person.cpf, 93, y, { width: 35 });
            write(person.phone, 133, y, { width: 27 });
            write(
              'x',
              person.sex === 'F' ? 165 : 163,
              y + TOTAL_MAIS_BOM_MED_LAYOUT.sexOffsetY,
            );
            writePageFiveBirth(
              person.birth_date,
              TOTAL_MAIS_BOM_MED_LAYOUT.personBirthPositions,
              y,
            );
            write(
              'X',
              TOTAL_MAIS_BOM_MED_LAYOUT.bomMedFlagX,
              y + TOTAL_MAIS_BOM_MED_LAYOUT.bomMedFlagOffsetY,
            );
          });
          bomMedPeople.filter((person) => person.relationship === 'dependent').forEach((person, index) => {
            const y = 209 + index * 7;
            write(person.name, 25, y, { width: 62 });
            write(person.cpf, 93, y, { width: 35 });
            write(person.phone, 133, y, { width: 27 });
            write(
              'x',
              person.sex === 'F' ? 165 : 162.5,
              y + TOTAL_MAIS_BOM_MED_LAYOUT.sexOffsetY,
            );
            writePageFiveBirth(
              person.birth_date,
              TOTAL_MAIS_BOM_MED_LAYOUT.personBirthPositions,
              y,
            );
            write(
              'X',
              TOTAL_MAIS_BOM_MED_LAYOUT.bomMedFlagX,
              y + TOTAL_MAIS_BOM_MED_LAYOUT.bomMedFlagOffsetY,
            );
          });
          write(data.observations, 25, 224, { size: 8, width: 180 });
          doc.restore();
          doc.save();
          doc.translate(
            mm(TOTAL_MAIS_BOM_MED_LAYOUT.contentOffsetX),
            mm(TOTAL_MAIS_BOM_MED_LAYOUT.footerOffsetY),
          );
          writeDate(32, 47, 74, 240.5, false);
          write(
            money(data.bom_med_value),
            120,
            240.5 + TOTAL_MAIS_BOM_MED_LAYOUT.footerTaxOffsetY,
          );
          write(
            'X',
            normalize(data.payment_plan).includes('CARTAO') ? 175 : 157,
            240.5 + TOTAL_MAIS_BOM_MED_LAYOUT.footerPaymentOffsetY,
          );
          doc.restore();
        }
        if (page === 18) {
          doc.save();
          doc.translate(
            mm(TOTAL_MAIS_BOM_MED_LAYOUT.pageEighteenDateOffsetX),
            mm(TOTAL_MAIS_BOM_MED_LAYOUT.pageEighteenDateOffsetY),
          );
          writeDate(130, 148, 190, 240);
          doc.restore();
        }
        if (page === 19) {
          doc.save();
          doc.translate(
            mm(TOTAL_MAIS_FINAL_PAGES_LAYOUT.pageNineteenContentOffsetX),
            mm(TOTAL_MAIS_FINAL_PAGES_LAYOUT.pageNineteenContentOffsetY),
          );
          writeHolder(0, true);
          doc.restore();
        }
        if (page === 20) {
          writeDate(
            115,
            133,
            174,
            233,
            true,
            TOTAL_MAIS_FINAL_PAGES_LAYOUT.pageTwentyYearOffsetY,
          );
        }
        if (page === 'cremation') {
          write(money(data.cremation_value), 60, 157);
          write('REAIS', 77, 157);
          writeDate(125, 143, 184, 241);
        }
        if (page === 'thanatopraxy') {
          write(money(data.thanatopraxy_value), 98, 158.5);
          write('REAIS', 130, 158.5);
          writeDate(125, 143, 184, 241);
        }
        if (page === 'mileage') {
          write('2000', 178, 93);
          write('DOIS MIL', 16, 96);
          write(money(data.mileage_value), 90, 128);
          write('REAIS', 128, 128);
          writeDate(125, 143, 184, 220);
        }
      }
      doc.end();
    } catch (error) {
      doc.end();
      reject(error);
    }
  });
}