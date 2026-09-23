import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import express from 'express';
import salesContractPrintingRouter from './salesContractPrinting.js';
import {
  BOM_IDEAL_BASE_PRODUCT_IDS,
  bomIdealPaymentCategory,
  renderBomIdealPdf,
  validateBomIdealContractData,
} from '../services/bomIdealContract.js';
import {
  BOM_MED_BASE_PRODUCT_IDS,
  renderBomMedPdf,
  sortBomMedDependents,
  validateBomMedContractData,
} from '../services/bomMedContract.js';
import {
  renderConvalescencaPdf,
  validateConvalescencaContractData,
} from '../services/convalescencaContract.js';
import {
  BOM_FAMILIA_BASE_PRODUCT_IDS,
  BOM_FAMILIA_PORTABILITY_BASE_PRODUCT_IDS,
  bomFamiliaPaymentCategory,
  renderBomFamiliaPdf,
  renderBomFamiliaPortabilityPdf,
  validateBomFamiliaContractData,
} from '../services/bomFamiliaContract.js';
import {
  COMBO_MULTI_WELLBEING_BASE_PRODUCT_IDS,
  NEW_COMBO_MULTI_WELLBEING_BASE_PRODUCT_IDS,
  COMBO_MULTI_SELECTION_BASE_PRODUCT_IDS,
  buildComboMultiWellbeingContractData,
  renderComboMultiSelectionPdf,
  calculateComboPetAge,
  comboMultiWellbeingPaymentCategory,
  renderComboMultiWellbeingPdf,
  renderNewComboMultiWellbeingPdf,
  sortComboMultiWellbeingDependents,
  validateComboMultiWellbeingContractData,
} from '../services/comboMultiWellbeingContract.js';
import {
  bomAutoPaymentCategory,
  classifyDocument,
  buildBomAutoWhatsAppMessage,
  buildBomPetWhatsAppMessage,
  buildBomPetHealthWhatsAppMessage,
  buildComboMultiWellbeingWhatsAppMessage,
  buildContractWhatsAppDelivery,
  buildEssentialWhatsAppMessage,
  CONTRACT_WHATSAPP_TEMPLATES,
  legacyCivilStatus,
  legacyProfession,
  isValidCpf,
  isValidCnpj,
  bomCorpPrintableRecords,
  isValidWhatsappRecipient,
  waitForWhatsAppDelivery,
  validateContractData,
  renderPdf,
} from './salesContractPrinting.js';
import { requireSalesContractPrinting } from '../middleware/permissions.js';
import {
  isBomAutoVehicleProduct,
  isBomAutoDriverProduct,
  canUseHolderAsLegacyDriver,
  applyHolderContactFallbacks,
  parseBomAutoVehicle,
  calculateBomAutoMonthlyFee,
  pairBomAutoPeople,
  selectOrderHolder,
} from '../services/erpDbService.js';
import {
  deleteContractFromStorage,
  parseContractStoragePath,
  readLocalContract,
  storeContractForWhatsApp,
} from '../services/contractObjectStorage.js';
import { normalizeMediaExtension } from '../services/attendanceWhuClient.js';
import {
  BOM_PET_BASE_PRODUCT_IDS,
  BOM_PET_HEALTH_INDIVIDUAL_PRODUCT_IDS,
  BOM_PET_HEALTH_THREE_PRODUCT_IDS,
  BOM_PET_PET_LAYOUT,
  CONTRACT_PRODUCTS,
  ESSENTIAL_BASE_PRODUCT_IDS,
  PEROLA_BASE_PRODUCT_IDS,
  RUBI_BASE_PRODUCT_IDS,
  SAFIRA_BASE_PRODUCT_IDS,
  TOPAZIO_BASE_PRODUCT_IDS,
  buildBomCorpContractData,
  bomPetPaymentCategory,
  buildBomPetContractData,
  buildBomPetHealthIndividualContractData,
  buildBomPetHealthThreeContractData,
  buildEssentialContractData,
  detailMatchesContractProduct,
  essentialCivilCheckX,
  essentialLowerDueCheckX,
  essentialPaymentCategory,
  essentialUpperDueCheckX,
  renderBomPetPdf,
  renderBomCorpPdf,
  renderBomPetHealthPdf,
  renderEssentialPdf,
  validateBomPetContractData,
  validateBomCorpContractData,
  validateBomPetHealthContractData,
  validateEssentialContractData,
} from '../services/salesContractModels.js';
import {
  buildPerolaContractData,
  buildRubiContractData,
  renderPerolaPdf,
  renderRubiPdf,
  validatePerolaContractData,
  validateRubiContractData,
} from '../services/perolaContract.js';
import {
  buildSafiraContractData,
  renderSafiraPdf,
  validateSafiraContractData,
} from '../services/safiraContract.js';
import {
  buildTopazioContractData,
  renderTopazioPdf,
  validateTopazioContractData,
} from '../services/topazioContract.js';
import {
  buildTotalMaisContractData,
  renderTotalMaisPdf,
  TOTAL_MAIS_BASE_PRODUCT_IDS,
  TOTAL_MAIS_PAGE_FIVE_LAYOUT,
  TOTAL_MAIS_BOM_MED_LAYOUT,
  TOTAL_MAIS_FINAL_PAGES_LAYOUT,
  validateTotalMaisContractData,
} from '../services/totalMaisContract.js';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('validates CPF check digits before consulting ERP', () => {
  assert.equal(isValidCpf('529.982.247-25'), true);
  assert.equal(isValidCpf('529.982.247-24'), false);
  assert.equal(isValidCpf('111.111.111-11'), false);
});

test('validates CNPJ check digits before consulting ERP', () => {
  assert.equal(isValidCnpj('19.367.986/0001-60'), true);
  assert.equal(isValidCnpj('19.367.986/0001-61'), false);
  assert.equal(isValidCnpj('11.111.111/1111-11'), false);
});

test('builds and validates Bom Corp data without inventing optional company fields', () => {
  const data = buildBomCorpContractData({
    company_name: 'EMPRESA TESTE LTDA',
    cnpj: '19.367.986/0001-60',
    contract: '132383',
    plan: 'BOMCORP PRIME',
    issue_date: '2025-07-31',
    contract_value: 224.5,
    employees: [
      { id: 1, name: 'COLABORADOR UM', cpf: '529.982.247-25' },
      { id: 2, name: 'COLABORADOR DOIS', cpf: '' },
    ],
  });
  assert.equal(data.cnpj, '19367986000160');
  assert.equal(data.address, '');
  assert.equal(data.employees.length, 2);
  assert.deepEqual(validateBomCorpContractData(data), []);
  assert.match(
    validateBomCorpContractData(buildBomCorpContractData({})).join(' '),
    /Razão social|CNPJ|Número do contrato|Nenhum colaborador/,
  );
});

test('Bom Corp prints and counts only unique employees with CPF, matching the legacy contract rule', () => {
  const printable = bomCorpPrintableRecords([
    { colaborador_vinculo_id: 1, colaborador_nome: 'COM CPF', colaborador_cpf: '52998224725' },
    { colaborador_vinculo_id: 2, colaborador_nome: 'SEM CPF', colaborador_cpf: '' },
    { colaborador_vinculo_id: 3, colaborador_nome: 'CPF FORMATADO', colaborador_cpf: '041.990.186-89' },
    { colaborador_vinculo_id: 1, colaborador_nome: 'COM CPF', colaborador_cpf: '52998224725' },
  ]);
  assert.equal(printable.length, 2);
  assert.deepEqual(printable.map((record) => record.colaborador_vinculo_id), [1, 3]);
});

test('validates the Bom Ideal contract fields and legacy payment categories', () => {
  const data = {
    pedido: '63764',
    issue_date: '2026-03-19',
    name: 'TITULAR TESTE',
    cpf: '529.982.247-25',
    birth_date: '1974-09-25',
    sex: 'MASCULINO',
    marital_status: 'CASADO',
    address: 'RUA TESTE',
    number: '70',
    district: 'CENTRO',
    city: 'LIMEIRA',
    state: 'SP',
    cep: '13480000',
    phone: '19999999999',
    payment_plan_id: 1643483,
    monthly_value: 69.9,
    children: [{ name: 'DEPENDENTE', birth_date: '2000-12-25', phone: '19999999999', sex: 'M' }],
    dependents: [],
  };
  assert.equal(BOM_IDEAL_BASE_PRODUCT_IDS.includes(214479204), true);
  assert.equal(bomIdealPaymentCategory(32922780), 'cpfl');
  assert.equal(bomIdealPaymentCategory(1643483), 'bank');
  assert.equal(bomIdealPaymentCategory(46285), 'credit_card');
  assert.deepEqual(validateBomIdealContractData(data), []);
  assert.match(
    validateBomIdealContractData({ ...data, children: Array(5).fill(data.children[0]) }).join(' '),
    /máximo 4 filhos/i,
  );
});

test('recognizes and validates Plano Família without including its dependent item', () => {
  const data = {
    pedido: '59616',
    issue_date: '2026-01-20',
    name: 'TITULAR TESTE',
    cpf: '529.982.247-25',
    birth_date: '1998-08-14',
    sex: 'MASCULINO',
    marital_status: 'SOLTEIRO',
    address: 'RUA TESTE',
    number: '470',
    district: 'CENTRO',
    city: 'PORTO ALEGRE',
    state: 'RS',
    cep: '91150330',
    phone: '51999999999',
    payment_plan_id: 1643483,
    monthly_value: 89.9,
    dependents: [],
    bom_med_dependents: [],
  };
  assert.equal(BOM_FAMILIA_BASE_PRODUCT_IDS.includes(106446285), true);
  assert.equal(BOM_FAMILIA_BASE_PRODUCT_IDS.includes(106134686), false);
  assert.equal(bomFamiliaPaymentCategory(32922780), 'cpfl');
  assert.equal(bomFamiliaPaymentCategory(1643483), 'bank');
  assert.equal(bomFamiliaPaymentCategory(46285), 'credit_card');
  assert.deepEqual(validateBomFamiliaContractData(data), []);
});

test('recognizes Plano Família-Portabilidade as a distinct contract product', () => {
  assert.deepEqual(BOM_FAMILIA_PORTABILITY_BASE_PRODUCT_IDS, [314795021]);
  assert.equal(CONTRACT_PRODUCTS.BOM_FAMILIA_PORTABILITY, 'bom_familia_portabilidade');
  assert.equal(
    CONTRACT_WHATSAPP_TEMPLATES[CONTRACT_PRODUCTS.BOM_FAMILIA_PORTABILITY].name,
    'boasvindas_plano_bdfamilia_anexo',
  );
});

test('recognizes, validates and renders Plano Pérola with conditional addenda', async () => {
  const people = [
    {
      is_titular: true,
      nome: 'ADRIANA DE SANTANA MELO',
      cpf: '154.800.798-67',
      data_nascimento: '1974-01-23',
      sexo: 'F',
      estado_civil: 'CA',
      telefone: '19982576825',
      email: 'adriana@example.com',
    },
    ...[
      ['MARIA INÊS ANDRADE MELO', '1957-01-25', 'F', 'M'],
      ['JOSE IVALDO MELO', '1977-07-17', 'M', 'C'],
      ['BEATRIZ ISABELY DE SANTANA MELO', '2007-01-31', 'F', 'F'],
      ['TAYNA ISABELA DE SANTANA MELO', '1995-07-22', 'F', 'F'],
      ['CELSO JUNIOR ALMEIDA DE CARVALHO', '1990-11-04', 'M', 'D'],
      ['LUCAS DAVI MELO DE CARVALHO', '2019-01-14', 'M', 'D'],
    ].map(([nome, data_nascimento, sexo, parentesco], index) => ({
      nome,
      data_nascimento,
      sexo,
      parentesco,
      source_order: index + 1,
      produtos: ['PEROLA - DEPENDENTE 0,00'],
    })),
  ];
  const detail = {
    numero_pedido: '34490',
    titular: people[0],
    pessoas: people,
    endereco: {
      logradouro: 'RUA BENEDITO SANTOS SCALZITTI',
      numero: '82',
      bairro: 'TANCREDO NEVES',
      cidade: 'LIMEIRA',
      uf: 'SP',
      cep: '13487125',
    },
    email: 'adriana@example.com',
    plano_pagamento: 'BOLETO',
    data_emissao: '2025-04-07',
    produtos: [
      { id: 47892026, descricao: 'REGIÃO CAMPINAS - PEROLA', valor_total: 79 },
      { id: 55482437, descricao: 'PEROLA - DEPENDENTE 0,00', valor_total: 0.06 },
    ],
  };
  assert.equal(PEROLA_BASE_PRODUCT_IDS.includes(47892026), true);
  assert.equal(detailMatchesContractProduct(detail, CONTRACT_PRODUCTS.PEROLA), true);
  const data = buildPerolaContractData(detail);
  assert.equal(data.monthly_value, 79);
  assert.equal(data.dependents.length, 6);
  assert.deepEqual(validatePerolaContractData(data), []);
  const basePdf = await renderPerolaPdf(data);
  assert.equal((basePdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length, 7);
  const completePdf = await renderPerolaPdf({
    ...data,
    wreath_value: 8,
    transfer_value: 4,
    cremation_wreath_value: 94,
  });
  assert.equal((completePdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length, 10);
  const delivery = buildContractWhatsAppDelivery({
    productKey: CONTRACT_PRODUCTS.PEROLA,
    holderName: data.name,
    displayNumber: '34490',
    documentUrl: 'https://example.com/perola.pdf',
  });
  assert.equal(delivery.templateName, 'bom_vindas_funeral');
  assert.match(delivery.fileName, /^Contrato Plano Perola 34490/);
});

test('Plano Pérola preserves the two legacy generic-dependent rows when ERP has three links', () => {
  const generic = (name, sourceOrder) => ({
    nome: name,
    data_nascimento: '2000-01-01',
    sexo: 'F',
    parentesco: 'D',
    source_order: sourceOrder,
    produtos: ['PEROLA - DEPENDENTE 0,00'],
  });
  const data = buildPerolaContractData({
    titular: {},
    produtos: [],
    pessoas: [
      generic('PRIMEIRO', 1),
      generic('INTERMEDIÁRIO', 2),
      generic('ÚLTIMO', 3),
    ],
  });
  assert.deepEqual(data.dependents.map((person) => person.name), ['PRIMEIRO', 'ÚLTIMO']);
});

test('recognizes, validates and renders Plano Rubi with conditional addenda', async () => {
  const people = [
    {
      is_titular: true,
      nome: 'ELIANE DE OLIVEIRA RODRIGUES TERZI',
      cpf: '231.174.258-29',
      data_nascimento: '1982-12-09',
      sexo: 'F',
      estado_civil: 'S',
      telefone: '1999443438',
      email: 'boletos@example.com',
    },
    ...[
      ['JOSE RODRIGUES FILHO', '1958-02-22', 'M', 'P'],
      ['TEREZA DE OLIVEIRA RODRIGUES', '1964-03-20', 'F', 'M'],
      ['ALEXANDRE OLIVEIRA TERZI', '1975-10-23', 'M', 'F'],
      ['GEOVANNA GABRIELA RODRIGUES TERZI', '2007-04-30', 'F', 'F'],
      ['VINICIUS RODRIGUES TERZI', '2001-04-24', 'M', 'F'],
      ['WENDELL DA CRUZ SILVA', '1998-02-05', 'M', 'D'],
    ].map(([nome, data_nascimento, sexo, parentesco], index) => ({
      nome,
      data_nascimento,
      sexo,
      parentesco,
      source_order: index + 1,
      produtos: ['CAMPINAS - RUBI DEPENDENTES 0,00'],
    })),
  ];
  const detail = {
    numero_pedido: '34898',
    titular: people[0],
    pessoas: people,
    endereco: {
      logradouro: 'RUA AZULÃO',
      numero: '45',
      bairro: 'VILA PADRE MANOEL DE NÓBREGA',
      cidade: 'CAMPINAS',
      uf: 'SP',
      cep: '13061373',
    },
    email: 'boletos@example.com',
    plano_pagamento: 'BOLETO',
    data_emissao: '2025-04-02',
    produtos: [
      { id: 47225009, descricao: 'CAMPINAS - RUBI', valor_total: 75 },
      { id: 64024649, descricao: 'CAMPINAS - RUBI DEPENDENTES 0,00', valor_total: 0.06 },
    ],
  };
  assert.equal(RUBI_BASE_PRODUCT_IDS.includes(47225009), true);
  assert.equal(detailMatchesContractProduct(detail, CONTRACT_PRODUCTS.RUBI), true);
  const data = buildRubiContractData(detail);
  assert.equal(data.monthly_value, 75);
  assert.equal(data.dependents.length, 6);
  assert.deepEqual(
    data.dependents.filter((person) => person.relationship === 'child').map((person) => person.name),
    [
      'ALEXANDRE OLIVEIRA TERZI',
      'GEOVANNA GABRIELA RODRIGUES TERZI',
      'VINICIUS RODRIGUES TERZI',
    ],
  );
  assert.deepEqual(validateRubiContractData(data), []);
  const basePdf = await renderRubiPdf(data);
  assert.equal((basePdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length, 7);
  const completePdf = await renderRubiPdf({ ...data, wreath_value: 8, transfer_value: 4 });
  assert.equal((completePdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length, 9);
  const delivery = buildContractWhatsAppDelivery({
    productKey: CONTRACT_PRODUCTS.RUBI,
    holderName: data.name,
    displayNumber: '34898',
    documentUrl: 'https://example.com/rubi.pdf',
  });
  assert.equal(delivery.templateName, 'bom_vindas_funeral');
  assert.match(delivery.fileName, /^Contrato Plano Rubi 34898/);
});

test('recognizes, validates and renders the ten-page Plano Safira contract', async () => {
  const holder = {
    is_titular: true,
    nome: 'EZIO PENNA E SILVA',
    cpf: '448.791.726-34',
    rg: '3115117',
    data_nascimento: '1959-02-22',
    sexo: 'M',
    estado_civil: 'OUTROS',
    telefone: '35999871660',
    email: 'granja_rex@hotmail.com',
  };
  const detail = {
    numero_pedido: '79117',
    titular: holder,
    pessoas: [
      holder,
      {
        nome: 'EZIO PENNA E SILVA JUNIOR',
        data_nascimento: '2005-08-31',
        sexo: 'M',
        parentesco: 'F',
        telefone: '35999871660',
        source_order: 2,
        produtos: ['SAFIRA - DEPENDENTE 0,00'],
      },
    ],
    endereco: {
      logradouro: 'RUA MAJOR MANOEL CÂNDIDO',
      numero: '141',
      complemento: 'CASA',
      bairro: 'JARDIM NOVO MUNDO',
      cidade: 'POCOS DE CALDAS',
      uf: 'MG',
      cep: '37701-347',
    },
    email: 'granja_rex@hotmail.com',
    plano_pagamento: 'CARNE - GALAX',
    dia_vencimento: '20',
    data_emissao: '2026-09-10',
    observacoes: 'Plano sem adesão',
    produtos: [
      { id: 47892174, descricao: 'POÇOS DE CALDAS - SAFIRA', valor_total: 52 },
      { id: 55482462, descricao: 'SAFIRA - DEPENDENTE 0,00', valor_total: 0.01 },
    ],
  };
  assert.equal(SAFIRA_BASE_PRODUCT_IDS.includes(47892174), true);
  assert.equal(detailMatchesContractProduct(detail, CONTRACT_PRODUCTS.SAFIRA), true);
  const data = buildSafiraContractData(detail);
  assert.equal(data.adhesion_value, 60);
  assert.equal(data.base_value, 52);
  assert.equal(data.dependent_value, 0);
  assert.equal(data.monthly_value, 52);
  assert.equal(data.dependents[0].name, 'EZIO PENNA E SILVA JUNIOR');
  assert.deepEqual(validateSafiraContractData(data), []);
  const pdf = await renderSafiraPdf(data);
  assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length, 10);
  const delivery = buildContractWhatsAppDelivery({
    productKey: CONTRACT_PRODUCTS.SAFIRA,
    holderName: data.name,
    displayNumber: '79117',
    documentUrl: 'https://example.com/safira.pdf',
  });
  assert.equal(delivery.templateId, '69ed0d552e1d23a0987f433d');
  assert.equal(delivery.templateName, 'bom_vindas_funeral');
  assert.match(delivery.fileName, /^Contrato Plano Safira 79117/);
});

test('recognizes and renders Plano Topázio with the two Poços de Caldas addenda', async () => {
  const holder = {
    is_titular: true,
    nome: 'DANIELA CLARO',
    cpf: '153.918.908-29',
    data_nascimento: '1974-09-05',
    sexo: 'F',
    telefone: '35999534784',
    email: 'danielaclarogimenez@hotmail.com',
  };
  const detail = {
    numero_pedido: '34582',
    titular: holder,
    pessoas: [
      holder,
      {
        nome: 'PEDRO NUNES DE FREITAS', parentesco: 'C', sexo: 'M',
        data_nascimento: '1968-08-19', produtos: ['TOPAZIO - DEPENDENTE 0,00'],
      },
      {
        nome: 'IZABELLA CLARO CASARIN', parentesco: 'F', sexo: 'F',
        data_nascimento: '1993-04-28', produtos: ['TOPAZIO - DEPENDENTE 0,00'],
      },
      {
        nome: 'LUANE APARECIDA DE FREITAS', parentesco: 'F', sexo: 'F',
        data_nascimento: '1989-11-29', produtos: ['TOPAZIO - DEPENDENTE 0,00'],
      },
    ],
    endereco: {
      logradouro: 'RUA MARIA SCHMIDT VIEIRA', numero: '165', complemento: 'CASA',
      bairro: 'JARDIM PHILADÉLPHIA II', cidade: 'POCOS DE CALDAS',
      uf: 'MG', cep: '37709-106',
    },
    data_emissao: '2025-04-14',
    observacoes: 'NOVO PLANO TOPAZIO',
    produtos: [
      { id: 47892201, descricao: 'POÇOS DE CALDAS - TOPAZIO', valor_total: 56 },
      { id: 55482510, descricao: 'TOPAZIO - DEPENDENTE 0,00', valor_total: 0.07 },
    ],
  };
  assert.equal(TOPAZIO_BASE_PRODUCT_IDS.includes(47892201), true);
  assert.equal(detailMatchesContractProduct(detail, CONTRACT_PRODUCTS.TOPAZIO), true);
  const data = buildTopazioContractData(detail);
  assert.equal(data.pocos, true);
  assert.equal(data.monthly_value, 56);
  assert.equal(data.spouse.name, 'PEDRO NUNES DE FREITAS');
  assert.deepEqual(data.children.map((child) => child.name), [
    'LUANE APARECIDA DE FREITAS',
    'IZABELLA CLARO CASARIN',
  ]);
  assert.deepEqual(validateTopazioContractData(data), []);
  const pdf = await renderTopazioPdf(data);
  assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length, 12);
  const delivery = buildContractWhatsAppDelivery({
    productKey: CONTRACT_PRODUCTS.TOPAZIO,
    holderName: data.name,
    displayNumber: '34582',
    documentUrl: 'https://example.com/topazio.pdf',
  });
  assert.equal(delivery.templateName, 'bom_vindas_funeral');
  assert.match(delivery.fileName, /^Contrato Plano Topazio 34582/);
});

test('recognizes and validates the Bom Med contract without treating it as Essencial', () => {
  const data = {
    pedido: '80442',
    name: 'TITULAR TESTE',
    cpf: '529.982.247-25',
    birth_date: '1990-03-30',
    sex: 'FEMININO',
    marital_status: 'OUTROS',
    address: 'RUA TESTE',
    number: '10',
    district: 'CENTRO',
    city: 'LIMEIRA',
    state: 'SP',
    cep: '13480000',
    phone: '19999999999',
    standard_value: 59.9,
    dependent_value: 0,
    monthly_value: 59.9,
    due_day: 25,
    dependents: Array.from({ length: 8 }, (_, index) => ({
      name: `DEPENDENTE ${index + 1}`,
      cpf: '529.982.247-25',
      birth_date: '2000-01-01',
      phone: '19999999999',
      sex: index % 2 ? 'M' : 'F',
      price: 0.01,
    })),
  };
  assert.equal(BOM_MED_BASE_PRODUCT_IDS.includes(48337330), true);
  assert.equal(CONTRACT_PRODUCTS.BOM_MED, 'bom_med');
  assert.equal(classifyDocument({
    pedido: '373684915',
    numero_pedido: '80442',
    product_key: 'bom_med',
  }).product, 'Bom Med');
  assert.deepEqual(validateBomMedContractData(data), []);
  assert.match(
    validateBomMedContractData({ ...data, dependents: Array(10).fill(data.dependents[0]) }).join(' '),
    /máximo 9 dependentes/i,
  );
  assert.match(
    validateBomMedContractData({
      ...data,
      dependents: [{ ...data.dependents[0], sex: '' }],
    }).join(' '),
    /Sexo ausente ou inválido para o dependente 1/i,
  );
});

test('recognizes, validates and renders Convalescença as a contact contract', async () => {
  const data = {
    contact: '1401641',
    name: 'ANTONIO CLAUDIO COLETO',
    cpf: '867.268.208-44',
    address: '',
    complement: '',
    number: '',
    district: '',
    city: '',
    phone: '19981496767',
    equipment: 'Cadeira de Rodas',
    equipment_quantity: 1,
    withdrawal_date: '2026-09-19',
    expected_return_date: '2026-12-19',
    return_date: null,
    lessee: 'SIRLEI LEANDRO',
    monthly_value: 0,
    grace_days: 30,
    generation_date: new Date('2026-09-19T12:00:00Z'),
  };
  const classified = classifyDocument({
    pedido: '375262406',
    numero_pedido: '1401641',
    product_key: 'convalescenca',
  });
  assert.equal(CONTRACT_PRODUCTS.CONVALESCENCA, 'convalescenca');
  assert.equal(classified.product, 'Convalescença');
  assert.equal(classified.label, 'Contato 1401641');
  assert.deepEqual(validateConvalescencaContractData(data), []);
  assert.match(
    validateConvalescencaContractData({ ...data, equipment: '' }).join(' '),
    /equipamento/i,
  );
  const pdf = await renderConvalescencaPdf(data);
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
  assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length, 1);
});

test('orders Bom Med dependents like the legacy PHP when prices are equal', () => {
  const rows = [
    { name: 'MARILENE', price: 0.01, phone: '19999999999', birth_date: '1972-06-26', sex: 'F' },
    { name: 'ANTONIO', price: 0.01, phone: '19999999999', birth_date: '1980-12-21', sex: 'M' },
    { name: 'REINALDO', price: 0.01, phone: '19999999999', birth_date: '1986-03-04', sex: 'M' },
    { name: 'MARIA', price: 0.01, phone: '19999999999', birth_date: '1962-06-14', sex: 'F' },
    { name: 'FABRICIO', price: 0.01, phone: '19999999999', birth_date: '2007-09-15', sex: 'M' },
    { name: 'KAIO', price: 0.01, phone: '19999999999', birth_date: '2003-02-24', sex: 'M' },
  ];
  assert.deepEqual(
    sortBomMedDependents(rows).map((dependent) => dependent.name),
    ['MARIA', 'MARILENE', 'ANTONIO', 'REINALDO', 'KAIO', 'FABRICIO'],
  );
});

test('validates Brazilian WhatsApp recipients without comparing them to the ERP phone', () => {
  assert.equal(isValidWhatsappRecipient('51991206574'), true);
  assert.equal(isValidWhatsappRecipient('5181532008'), true);
  assert.equal(isValidWhatsappRecipient('5133334444'), true);
  assert.equal(isValidWhatsappRecipient('0000000000'), true);
  assert.equal(isValidWhatsappRecipient('11111111111'), true);
  assert.equal(isValidWhatsappRecipient('991206574'), false);
  assert.equal(isValidWhatsappRecipient('51 99120-6574'), false);
  assert.equal(isValidWhatsappRecipient('5199120657A'), false);
});

test('mounts the protected contract search under the public API path', async () => {
  const serverSource = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  assert.match(serverSource, /app\.use\('\/api\/sales-pf', salesContractPrintingRoutes\)/);

  const app = express();
  app.use('/api/sales-pf', salesContractPrintingRouter);
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise((resolve) => server.once('listening', resolve));
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/sales-pf/contracts/search?reference=78160`);
    assert.equal(response.status, 401);
    const body = await response.json();
    assert.match(body.message || body.error || '', /token|autoriz|autentica/i);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('distinguishes linked Bom Auto vehicle and conductor products', () => {
  assert.equal(isBomAutoVehicleProduct('BOM AUTO CLIENTES - DADOS DO VEÍCULO'), true);
  assert.equal(isBomAutoVehicleProduct('BOM AUTO CLIENTES - DADOS DO VEICULO'), true);
  assert.equal(isBomAutoVehicleProduct('BOM AUTO CLIENTES - DADOS DO CONDUTOR'), false);
  assert.equal(isBomAutoDriverProduct('BOM AUTO CLIENTES - DADOS DO CONDUTOR'), true);
  assert.equal(isBomAutoDriverProduct('BOM PET - NOME DO PET'), false);
  assert.deepEqual(
    pairBomAutoPeople([{ id: 'v1' }, { id: 'v2' }], [{ id: 'd1' }, { id: 'd2' }]),
    [{ id: 'v1', driver: { id: 'd1' } }, { id: 'v2', driver: { id: 'd2' } }],
  );
  const sharedDriver = { id: 'same-driver' };
  assert.deepEqual(
    pairBomAutoPeople(
      [{ id: 'v1' }, { id: 'v2' }, { id: 'v3' }],
      [sharedDriver, sharedDriver, sharedDriver],
    ),
    [
      { id: 'v1', driver: sharedDriver },
      { id: 'v2', driver: sharedDriver },
      { id: 'v3', driver: sharedDriver },
    ],
  );
});

test('parses the production vehicle representation without shifting fields', () => {
  assert.deepEqual(parseBomAutoVehicle('ONIX/PRETO/ABC1D23/2020'), {
    descricao: 'ONIX/PRETO/ABC1D23/2020',
    fabricante: null,
    modelo: 'ONIX',
    cor: 'PRETO',
    placa: 'ABC1D23',
    ano: '2020',
  });
});

test('parses the legacy five-part vehicle representation used by the original generator', () => {
  assert.deepEqual(parseBomAutoVehicle('2020/PRETO/CHEVROLET/ABC1D23/ONIX'), {
    descricao: '2020/PRETO/CHEVROLET/ABC1D23/ONIX',
    fabricante: 'CHEVROLET',
    modelo: 'ONIX',
    cor: 'PRETO',
    placa: 'ABC1D23',
    ano: '2020',
  });
});

test('parses the current five-part vehicle representation without shifting fields', () => {
  assert.deepEqual(parseBomAutoVehicle('HONDA FIT /LX FLEX / PRATA / 2008 / EDZ9J79'), {
    descricao: 'HONDA FIT /LX FLEX / PRATA / 2008 / EDZ9J79',
    fabricante: 'HONDA',
    modelo: 'FIT LX FLEX',
    cor: 'PRATA',
    placa: 'EDZ9J79',
    ano: '2008',
  });
});

test('monthly fee excludes technical vehicle and conductor link items', () => {
  assert.equal(calculateBomAutoMonthlyFee([
    { descricao: 'BOM AUTO - CLIENTES', valor_total: 29.9 },
    { descricao: 'BOM AUTO CLIENTES - DADOS DO VEÍCULO', valor_total: 0.01 },
    { descricao: 'BOM AUTO CLIENTES - DADOS DO CONDUTOR', valor_total: 0.01 },
  ]), 29.9);
});

test('uses the canonical holder as legacy driver only when inherited identity fields match', () => {
  const holder = { data_nascimento: '1990-01-01', telefone: '(11) 99999-9999', sexo: 'M' };
  assert.equal(canUseHolderAsLegacyDriver({
    data_nascimento: '1990-01-01', telefone: '11999999999', sexo: 'm',
  }, holder), true);
  assert.equal(canUseHolderAsLegacyDriver({
    data_nascimento: '1991-01-01', telefone: '11999999999', sexo: 'M',
  }, holder), false);
  const holderWithoutPhone = { data_nascimento: '1990-01-01', telefone: null, sexo: 'M' };
  applyHolderContactFallbacks(holderWithoutPhone, { telefone: '11999999999' });
  assert.equal(canUseHolderAsLegacyDriver({
    data_nascimento: '1990-01-01', telefone: '11999999999', sexo: 'M',
  }, holderWithoutPhone), true);
});

test('selects the canonical holder even when its denormalized CPF is absent', () => {
  const canonical = { pessoa_row_id: '2', pessoa_id: '20', cpf: null, is_canonical_holder: true };
  assert.deepEqual(
    selectOrderHolder([
      { pessoa_row_id: '1', pessoa_id: '10', cpf: '52998224725', is_canonical_holder: false },
      canonical,
    ]),
    { row: canonical, isCanonical: true },
  );
  const legacy = { pessoa_row_id: '3', pessoa_id: '30', cpf: null, is_canonical_holder: false };
  assert.deepEqual(
    selectOrderHolder([legacy]),
    { row: legacy, isCanonical: false },
  );
});

test('preserves the first legacy person for shared detail consumers without calling it canonical', () => {
  const firstLegacy = { pessoa_row_id: 1, pessoa_id: null, nome_pessoa: 'LEGADO' };
  assert.deepEqual(
    selectOrderHolder([firstLegacy, { pessoa_row_id: 2, pessoa_id: null }]),
    { row: firstLegacy, isCanonical: false },
  );
});

test('contract screens allow admins and require their individual explicit submenu grant', () => {
  const response = () => {
    const result = { statusCode: null, body: null };
    result.status = (statusCode) => { result.statusCode = statusCode; return result; };
    result.json = (body) => { result.body = body; return result; };
    return result;
  };
  const invoke = (req) => {
    let allowed = false;
    const res = response();
    requireSalesContractPrinting(req, res, () => { allowed = true; });
    return { allowed, res };
  };
  assert.equal(invoke({ user: { role: 'admin', email: 'admin-one@example.com' }, path: '/contracts/search' }).allowed, true);
  assert.equal(invoke({ user: { role: 'user' }, agent: { agentType: 'admin' }, path: '/contracts/signature' }).allowed, true);
  assert.equal(invoke({ user: { role: 'user' }, agent: { agentType: 'sales', allowedSubmenus: ['SalesContractPrinting'] }, path: '/contracts/search' }).allowed, true);
  assert.equal(invoke({ user: { role: 'user' }, agent: { agentType: 'sales', allowedSubmenus: ['SalesContractPrinting'] }, path: '/contracts/signature' }).res.statusCode, 403);
  assert.equal(invoke({ user: { role: 'user' }, agent: { agentType: 'sales', allowedSubmenus: ['SalesContractSigning'] }, path: '/contracts/document' }).allowed, true);
  assert.equal(invoke({ user: { role: 'user' }, agent: { agentType: 'sales', allowedSubmenus: ['SalesContractSigning'] }, path: '/contracts/generate' }).res.statusCode, 403);
  assert.equal(invoke({ user: { role: 'user' }, path: '/contracts/search' }).res.statusCode, 403);
  assert.equal(invoke({ path: '/contracts/search' }).res.statusCode, 401);
});

test('search uses only the canonical pedido holder and UI renders validation details', () => {
  const routeSource = readFileSync(new URL('./salesContractPrinting.js', import.meta.url), 'utf8');
  const pageSource = readFileSync(
    new URL('../../../src/pages/SalesContractPrinting.jsx', import.meta.url),
    'utf8',
  );
  assert.match(routeSource, /dp\.pessoa_id\s*=\s*p\.cliente_id/);
  assert.doesNotMatch(routeSource, /pedidos_pessoas[^;]*regexp_replace\(pp\.cpf/s);
  const searchSql = routeSource.match(/const sql = `WITH docs AS \([\s\S]*?const result = await db\.query/)?.[0] || '';
  assert.match(searchSql, /translate\([\s\S]*BOM AUTO% DADOS DO VEICULO/);
  assert.match(routeSource, /SELECT 'bom_pet'::text/);
  assert.match(routeSource, /BOM_PET_BASE_PRODUCT_IDS/);
  assert.match(routeSource, /SELECT 'perola'::text/);
  assert.match(routeSource, /p\.situacao = 'A'/);
  assert.match(routeSource, /ip\.situacao = 'P'/);
  assert.match(routeSource, /ppp\.aprovado = 'S'/);
  assert.doesNotMatch(searchSql, /DADOS DO CONDUTOR/);
  assert.match(routeSource, /body\.errors|errors/);
  assert.match(pageSource, /Array\.isArray\(body\.errors\)/);
  assert.match(pageSource, /list-disc/);
  assert.match(pageSource, /Pedido\/contrato/);
  assert.match(pageSource, /params\.set\("document", document\)/);
  assert.match(pageSource, /params\.set\("reference", reference\)/);
  assert.doesNotMatch(pageSource, /searchType/);
  assert.match(pageSource, /Serviço de impressão indisponível \(HTTP \$\{response\.status\}\)/);
  assert.match(pageSource, /generatingId === row\.generationId \? "Gerando PDF\.\.\." : "Gerar PDF"/);
  assert.match(pageSource, /logo-bomflow\.png/);
  assert.match(pageSource, /popup\.location\.replace\(viewerUrl\)/);
  assert.match(pageSource, /#toolbar=0/);
  assert.match(pageSource, /download="\$\{fileName\}"/);
  assert.match(pageSource, /contrato_\$\{product\}_\$\{order\}\.pdf/);
  assert.match(routeSource, /contrato_\$\{fileProduct\}_\$\{claims\.pedido\}\.pdf/);
  assert.match(routeSource, /p\.id::text = \$1 OR p\.pedido::text = \$1/);
  assert.match(routeSource, /\(\$2::text IS NULL OR p\.id::text = \$2 OR p\.pedido::text = \$2\)/);
  assert.match(routeSource, /cpfOwner: normalizeCpf\(r\.cpf_owner\)/);
});

test('classifies pedido and contrato without losing ERP date', () => {
  const pedido = classifyDocument({
    pedido: '336049371',
    numero_pedido: '78160',
    contrato: null,
    issue_date: '2025-01-01',
  });
  assert.equal(pedido.kind, 'pedido');
  assert.equal(pedido.product, 'Bom Auto');
  assert.equal(pedido.displayNumber, '78160');
  assert.equal(pedido.label, 'Pedido 78160');
  assert.equal(classifyDocument({ pedido: '10', contrato: 'BA-10', issue_date: '2025-01-01' }).kind, 'contrato');
  const essencial = classifyDocument({
    pedido: '11',
    numero_pedido: '59072',
    product_key: CONTRACT_PRODUCTS.ESSENCIAL,
  });
  assert.equal(essencial.productKey, 'essencial');
  assert.equal(essencial.product, 'Essencial');
  const bomPet = classifyDocument({
    pedido: '12',
    numero_pedido: '34067',
    product_key: CONTRACT_PRODUCTS.BOM_PET,
  });
  assert.equal(bomPet.productKey, 'bom_pet');
  assert.equal(bomPet.product, 'Bom Pet');
});

test('builds Bom Pet data from the base plan and linked pet rows only', () => {
  const detail = {
    titular_is_canonical: true,
    titular: {
      nome: 'Titular',
      cpf: '529.982.247-25',
      data_nascimento: '1989-07-04',
      sexo: 'F',
      estado_civil: 'SO',
      telefone: '35910022144',
      email: 'titular@example.com',
    },
    endereco: {
      logradouro: 'Rua A',
      numero: '10',
      bairro: 'Centro',
      cidade: 'Campinas',
      uf: 'SP',
      cep: '13026002',
    },
    email: 'titular@example.com',
    telefone_secundario: '1933334444',
    plano_pagamento: 'BOLETO - DIGITAL',
    produtos: [
      { id: BOM_PET_BASE_PRODUCT_IDS[0], descricao: 'BOM PET (3 PETS)', quantidade: 1, preco: 21.9, valor_total: 21.9 },
      { id: 55482373, descricao: 'BOM PET - NOME DO PET', quantidade: 2, preco: 0.01, valor_total: 0.02 },
    ],
    pessoas: [
      { is_titular: true, nome: 'Titular' },
      {
        nome: 'LUIZA/CACHORRO/SHIT ZU/CARAMELO E BRANCO/P',
        data_nascimento: '2022-06-05',
        sexo: 'F',
        produtos: ['BOM PET - NOME DO PET'],
      },
      {
        nome: 'PET SAÚDE - SRD - PRETO',
        data_nascimento: '2020-01-01',
        sexo: 'M',
        produtos: ['BOM PET SAÚDE - NOME DO PET'],
      },
    ],
  };
  assert.equal(detailMatchesContractProduct(detail, CONTRACT_PRODUCTS.BOM_PET), true);
  assert.equal(detailMatchesContractProduct({
    produtos: [{ id: 79080540, descricao: 'BOM PET SAÚDE' }],
  }, CONTRACT_PRODUCTS.BOM_PET), false);
  const data = buildBomPetContractData(detail, new Date('2026-09-16T12:00:00-03:00'));
  assert.equal(data.monthly_value, 21.9);
  assert.equal(data.marital_status, 'SOLTEIRO');
  assert.equal(data.phone, '35910022144');
  assert.equal(data.phone2, '35910022144');
  assert.deepEqual(data.pets, [{
    name: 'LUIZA',
    type: 'CACHORRO',
    breed: 'SHIT ZU',
    color: 'CARAMELO E BRANCO',
    size: 'P',
    birth_date: '2022-06-05',
    sex: 'F',
  }]);
  assert.deepEqual(validateBomPetContractData(data), []);
});

test('classifies and builds both Bom Pet Saúde products with PHP-compatible values', async () => {
  const people = [
    {
      is_titular: true, nome: 'CLIENTE TESTE', cpf: '529.982.247-25', data_nascimento: '1980-01-01',
      sexo: 'M', telefone: '11999999999', email: 'cliente@example.com',
    },
    ...['A','B','C','D','E','F','G','JULIA'].map((name, index) => ({
      source_order: index + 1, nome: `${name} / SRD / PRETO / GRANDE /`,
      data_nascimento: '2020-01-01', sexo: index === 7 ? 'F' : 'M',
      produtos: [index === 7
        ? 'BOM PET SAÚDE - ADICIONAL PET'
        : 'BOM PET SAÚDE - NOME DO PET'],
    })),
  ];
  const detail = {
    titular: people[0], pessoas: people, endereco: {
      logradouro: 'RUA A', numero: '1', bairro: 'CENTRO', cidade: 'SAO PAULO', uf: 'SP', cep: '01001000',
    }, email: 'cliente@example.com', plano_pagamento: 'CARNE', plano_pagamento_id: 48295856,
    produtos: [
      { id: 87982247, valor_total: 59.9 }, { id: 203567263, valor_total: 30 },
      { id: 79080781, valor_total: 0.08 },
    ],
  };
  assert.equal(detailMatchesContractProduct(detail, CONTRACT_PRODUCTS.BOM_PET_SAUDE_INDIVIDUAL), true);
  assert.equal(detailMatchesContractProduct(detail, CONTRACT_PRODUCTS.BOM_PET_SAUDE_3PETS), true);
  const individual = buildBomPetHealthIndividualContractData(detail, new Date('2026-01-01T12:00:00Z'));
  const three = buildBomPetHealthThreeContractData(detail, new Date('2026-01-01T12:00:00Z'));
  assert.equal(individual.pets[0].name, 'JULIA');
  assert.equal(individual.monthly_value, 30);
  assert.equal(three.pets.length, 8);
  assert.deepEqual(three.pets.map((pet) => pet.name), ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'JULIA']);
  assert.equal(three.monthly_value, 89.9);
  assert.equal(three.adhesion, 60);
  assert.deepEqual(validateBomPetHealthContractData(individual), []);
  assert.deepEqual(validateBomPetHealthContractData(three, 'three'), []);
  assert.match(
    validateBomPetHealthContractData({ ...three, pets: [...three.pets, ...three.pets].slice(0, 14) }, 'three').join(' '),
    /no máximo 13 pets/,
  );
  assert.equal(bomPetPaymentCategory('CARNE', 48295856), 'bank');
  assert.equal(CONTRACT_WHATSAPP_TEMPLATES[CONTRACT_PRODUCTS.BOM_PET_SAUDE_INDIVIDUAL].name, 'boas_vindas_bom_pet_saude');
  for (const productKey of [CONTRACT_PRODUCTS.BOM_PET_SAUDE_INDIVIDUAL, CONTRACT_PRODUCTS.BOM_PET_SAUDE_3PETS]) {
    const delivery = buildContractWhatsAppDelivery({
      productKey, holderName: 'CLIENTE TESTE', displayNumber: '73110', documentUrl: 'https://example.com/c.pdf',
    });
    assert.equal(delivery.templateId, '69ed0d552e1d23a0987f4330');
    assert.equal(delivery.templateName, 'boas_vindas_bom_pet_saude');
    assert.match(delivery.fileName, /^Contrato Bom Pet Saude/);
    assert.doesNotMatch(delivery.fileName, /[^\x00-\x7F]/);
    assert.equal(delivery.components[1].parameters[0].text, 'CLIENTE TESTE');
  }
  assert.match(buildBomPetHealthWhatsAppMessage('CLIENTE TESTE'), /^Olá, CLIENTE TESTE,/);
  const individualPdf = await renderBomPetHealthPdf(individual, 'individual');
  const threePdf = await renderBomPetHealthPdf(three, 'three');
  assert.equal((individualPdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length, 10);
  assert.equal((threePdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length, 13);
});

test('keeps compatibility with the hyphen-delimited Bom Pet representation returned by legacy orders', () => {
  const data = buildBomPetContractData({
    titular: {},
    produtos: [{ id: BOM_PET_BASE_PRODUCT_IDS[0], valor_total: 21.9 }],
    pessoas: [{
      nome: 'MARIE - LHASA APSO - CARAMELO',
      data_nascimento: '2015-02-26',
      sexo: 'F',
      produtos: ['BOM PET - NOME DO PET'],
    }],
  }, new Date('2026-09-16T12:00:00-03:00'));
  assert.deepEqual(data.pets, [{
    name: 'MARIE',
    type: '',
    breed: 'LHASA APSO',
    color: 'CARAMELO',
    size: '',
    birth_date: '2015-02-26',
    sex: 'F',
  }]);
});

test('rejects incomplete or overflowing Bom Pet contracts', () => {
  const errors = validateBomPetContractData({
    name: 'Titular',
    cpf: '123',
    state: 'ZZ',
    cep: '1',
    phone: '2',
    email: 'invalido',
    monthly_value: 0,
    pets: Array.from({ length: 4 }, () => ({})),
  });
  for (const pattern of [/CPF/i, /estado/i, /CEP/i, /telefone/i, /e-mail/i, /valor mensal/i, /máximo 3 pets/i, /raça/i]) {
    assert.ok(errors.some((error) => pattern.test(error)), `Expected validation error matching ${pattern}`);
  }
});

test('rejects invalid Bom Pet identity, dates, sex and unsupported payment options', () => {
  const errors = validateBomPetContractData({
    name: 'Titular',
    cpf: '11111111111',
    birth_date: '2026-02-30',
    sex: 'X',
    address: 'Rua A',
    number: '10',
    district: 'Centro',
    city: 'Campinas',
    state: 'SP',
    cep: '13026002',
    phone: '19999999999',
    email: 'titular@example.com',
    payment_plan: 'CARTÃO DE CRÉDITO',
    generated_at: '2026-09-31',
    monthly_value: 21.9,
    pets: [{
      name: 'Pet',
      breed: 'SRD',
      color: 'Preto',
      birth_date: '2027-02-30',
      sex: 'X',
    }],
  });
  for (const pattern of [/CPF/i, /nascimento do titular/i, /sexo do titular/i, /geração/i, /pagamento/i, /Pet 1.*nascimento/i, /Pet 1.*sexo/i]) {
    assert.ok(errors.some((error) => pattern.test(error)), `Expected validation error matching ${pattern}`);
  }
});

test('maps only compatible Bom Pet payment categories', () => {
  assert.equal(bomPetPaymentCategory('BOLETO - DIGITAL'), 'bank');
  assert.equal(bomPetPaymentCategory('CONTA BANCÁRIA'), 'bank');
  assert.equal(bomPetPaymentCategory('COBRADOR'), 'collector');
  assert.equal(bomPetPaymentCategory('CARTÃO DE CRÉDITO'), null);
});

test('builds and validates Essencial data from linked ERP products and dependents', () => {
  const detail = {
    titular_is_canonical: true,
    titular: {
      nome: 'Titular',
      cpf: '52998224725',
      rg: '123456',
      data_nascimento: '1979-11-25',
      sexo: 'F',
      estado_civil: 'SOLTEIRA',
      profissao: 'Outros',
      telefone: '19991594349',
    },
    endereco: {
      logradouro: 'Rua A',
      numero: '10',
      bairro: 'Centro',
      cidade: 'Campinas',
      uf: 'SP',
      cep: '13026002',
    },
    email: 'titular@example.com',
    plano_pagamento: 'BOLETO DIGITAL',
    dia_vencimento: 10,
    data_emissao: '2026-01-13',
    valor_total: 85.9,
    produtos: [
      {
        id: ESSENTIAL_BASE_PRODUCT_IDS[0],
        descricao: 'ESSENCIAL - ATÉ 50 ANOS',
        quantidade: 1,
        preco: 19.9,
        valor_total: 19.9,
      },
      { descricao: 'ESSENCIAL DEPENDENTES - 0 A 50 ANOS', quantidade: 2, preco: 8, valor_total: 16 },
      { descricao: 'ESSENCIAL DEPENDENTES - ACIMA DE 66 ANOS', quantidade: 1, preco: 35, valor_total: 35 },
      { descricao: 'COROA DE FLORES (15,00)', quantidade: 1, preco: 15, valor_total: 15 },
    ],
    pessoas: [
      { is_titular: true, produtos: ['ESSENCIAL - ATÉ 50 ANOS'] },
      {
        nome: 'Dependente Um',
        sexo: 'M',
        parentesco: 'F',
        data_nascimento: '2003-03-25',
        telefone: '19991594349',
        produtos: ['ESSENCIAL DEPENDENTES - 0 A 50 ANOS'],
      },
      {
        nome: 'Dependente Dois',
        sexo: 'M',
        parentesco: 'C',
        data_nascimento: '1982-05-13',
        telefone: '19991594349',
        produtos: ['ESSENCIAL DEPENDENTES - 0 A 50 ANOS'],
      },
      {
        nome: 'Dependente Três',
        sexo: 'F',
        parentesco: 'M',
        data_nascimento: '1957-01-01',
        telefone: '19991594349',
        produtos: ['ESSENCIAL DEPENDENTES - ACIMA DE 66 ANOS'],
      },
    ],
  };
  assert.equal(detailMatchesContractProduct(detail, CONTRACT_PRODUCTS.ESSENCIAL), true);
  assert.equal(detailMatchesContractProduct(detail, CONTRACT_PRODUCTS.BOM_AUTO), false);
  const data = buildEssentialContractData(detail);
  assert.equal(data.base_value, 19.9);
  assert.equal(data.adhesion, 60);
  assert.equal(data.dependent_value, 51);
  assert.equal(data.flowers_value, 15);
  assert.equal(data.total_value, 85.9);
  assert.deepEqual(data.dependents.map((dependent) => dependent.relationship), [
    'Filho/Filha',
    'Cônjuge',
    'Mãe',
  ]);
  assert.deepEqual(validateEssentialContractData(data), []);
});

test('rejects inconsistent Essencial totals and only overflows beyond two dependent pages', () => {
  const base = {
    name: 'Titular',
    cpf: '52998224725',
    birth_date: '1979-11-25',
    sex: 'F',
    address: 'Rua A',
    number: '10',
    district: 'Centro',
    city: 'Campinas',
    state: 'SP',
    cep: '13026002',
    phone: '19991594349',
    email: 'titular@example.com',
    payment_plan: 'BOLETO',
    due_day: 10,
    issue_date: '2026-01-13',
    base_value: 19.9,
    dependent_value: 0,
    cremation_value: 0,
    flowers_value: 0,
    mileage_value: 0,
    total_value: 99.9,
    dependents: Array.from({ length: 21 }, (_, index) => ({
      name: `Dependente ${index + 1}`,
      sex: 'F',
      relationship: 'Dependente',
      birth_date: '2000-01-01',
      phone: '11999999999',
      price: 0,
    })),
  };
  const errors = validateEssentialContractData(base);
  assert.ok(errors.some((error) => /máximo 20 dependentes/i.test(error)));
  assert.ok(errors.some((error) => /não correspondem ao total/i.test(error)));
});

test('fails closed for unknown contract products and invalid Essencial fields', () => {
  assert.equal(detailMatchesContractProduct({
    produtos: [{ id: 999, descricao: 'ESSENCIAL PROMOCIONAL' }],
  }, 'unknown'), false);
  const errors = validateEssentialContractData({
    name: 'Titular',
    cpf: '11111111111',
    birth_date: '2026-02-30',
    sex: 'X',
    address: 'Rua A',
    number: '10',
    district: 'Centro',
    city: 'Campinas',
    state: 'ZZ',
    cep: '123',
    phone: '123',
    email: 'invalido',
    payment_plan: 'BOLETO',
    due_day: 12,
    issue_date: 'data',
    adhesion: Number.NaN,
    base_value: -1,
    dependent_value: 0,
    cremation_value: 0,
    flowers_value: 0,
    mileage_value: 0,
    total_value: Number.NaN,
    dependents: [],
  });
  for (const pattern of [/CPF/i, /nascimento/i, /sexo/i, /UF/i, /CEP/i, /telefone/i, /e-mail/i, /vencimento/i, /adesão/i, /plano base/i]) {
    assert.ok(errors.some((error) => pattern.test(error)), `Expected validation error matching ${pattern}`);
  }
});

test('maps only homologated Essencial payment categories', () => {
  assert.equal(essentialPaymentCategory('Conta de Energia CPFL'), 'cpfl');
  assert.equal(essentialPaymentCategory('BOLETO - DIGITAL GALAX'), 'bank');
  assert.equal(essentialPaymentCategory('Conta bancária'), 'bank');
  assert.equal(essentialPaymentCategory('Cartão de Crédito'), 'credit_card');
  assert.equal(essentialPaymentCategory('PIX'), 'bank');
  assert.equal(essentialPaymentCategory('CARNE'), 'bank');
  assert.equal(essentialPaymentCategory('descrição não homologada', 32922780), 'cpfl');
  assert.equal(essentialPaymentCategory('descrição não homologada', 88733784), 'credit_card');
  assert.equal(essentialPaymentCategory('CPFL', 999999), null);
});

test('positions every lower Essencial due-date marker inside its legacy checkbox', () => {
  assert.equal(essentialLowerDueCheckX(10), 306.14);
  assert.equal(essentialLowerDueCheckX(15), 360);
  assert.equal(essentialLowerDueCheckX(20), 413.86);
  assert.equal(essentialLowerDueCheckX(25), 467.72);
  assert.equal(essentialLowerDueCheckX(null), null);
});

test('positions upper Essencial due dates and civil status in their printed checkboxes', () => {
  assert.equal(essentialUpperDueCheckX(10), 72.25);
  assert.equal(essentialUpperDueCheckX(15), 146.75);
  assert.equal(essentialUpperDueCheckX(20), 221.25);
  assert.equal(essentialUpperDueCheckX(25), 295.75);
  assert.equal(essentialUpperDueCheckX(12), null);
  assert.equal(essentialCivilCheckX('SOLTEIRO'), 450);
  assert.equal(essentialCivilCheckX('CASADO'), 467.5);
  assert.equal(essentialCivilCheckX('OUTROS'), 482.5);
});

test('allows CPFL without a due day and carries optional ERP contract fields', () => {
  const detail = {
    titular: {
      nome: 'Titular',
      cpf: '52998224725',
      data_nascimento: '1979-11-25',
      sexo: 'F',
      telefone: '19991594349',
    },
    endereco: {
      logradouro: 'Rua A',
      numero: '10',
      bairro: 'Centro',
      cidade: 'Campinas',
      uf: 'SP',
      cep: '13026002',
    },
    email: 'titular@example.com',
    telefone_secundario: '1933334444',
    observacoes: 'Atendimento presencial.',
    renda: 2500,
    plano_pagamento: 'CPFL',
    plano_pagamento_id: 32922780,
    dia_vencimento: null,
    data_emissao: '2026-01-13',
    valor_total: 19.9,
    produtos: [{
      id: ESSENTIAL_BASE_PRODUCT_IDS[0],
      descricao: 'ESSENCIAL - ATÉ 50 ANOS',
      quantidade: 1,
      preco: 19.9,
      valor_total: 19.9,
    }],
    pessoas: [],
  };
  const data = buildEssentialContractData(detail);
  assert.equal(data.phone2, '1933334444');
  assert.equal(data.observations, 'Atendimento presencial.');
  assert.equal(data.income, 2500);
  assert.equal(data.payment_plan_id, 32922780);
  assert.deepEqual(validateEssentialContractData(data), []);
});

test('loads Essencial income from the ERP client record without inventing a fallback', () => {
  const erpSource = readFileSync(
    new URL('../services/erpDbService.js', import.meta.url),
    'utf8',
  );
  assert.match(erpSource, /LEFT JOIN clientes c ON c\.id = p\.id/);
  assert.match(erpSource, /renda:\s*identity\.rows\[0\]\?\.renda_mensal \?\? null/);
});

test('uses the legacy Outros representation for optional civil and profession fields', () => {
  assert.equal(legacyCivilStatus(null), 'OUTROS');
  assert.equal(legacyProfession(''), 'Outros');
  assert.equal(legacyCivilStatus('CASADO'), 'CASADO');
  assert.equal(legacyProfession('Mecânico'), 'Mecânico');
});

test('builds the official Bom Auto WhatsApp message with the ERP holder name', () => {
  const message = buildBomAutoWhatsAppMessage('CLIENTE TESTE');
  assert.match(message, /^Seja muito bem-vindo\(a\), CLIENTE TESTE!/);
  assert.match(message, /0800 940 3227/);
  assert.match(message, /Bom Auto - Grupo Bom Pastor Multiassistência\.$/);
  assert.ok(message.length <= 1024);
});

test('builds the approved Essencial WhatsApp message with the ERP holder name', () => {
  const message = buildEssentialWhatsAppMessage('CLIENTE TESTE');
  assert.match(message, /^Seja muito bem-vindo\(a\), CLIENTE TESTE!/);
  assert.match(message, /bompastordescontosonline\.com\.br/);
  assert.match(message, /Equipamentos de reabilitação/);
  assert.match(message, /Instituto de Apoio ao Luto/);
  assert.match(message, /Grupo Bom Pastor Multiassistência\.$/);
});

test('builds the approved Bom Pet WhatsApp message with the ERP holder name', () => {
  const message = buildBomPetWhatsAppMessage('CLIENTE TESTE');
  assert.match(message, /^Olá, CLIENTE TESTE, Seja muito bem-vindo\(a\) ao Plano Bom Pet!/);
  assert.match(message, /filhos de patas/);
  assert.match(message, /0800 940 3227/);
  assert.match(message, /Bom Pet - Grupo Bom Pastor Multiassistência\.$/);
});

test('builds, validates and renders the historical Combo Multi Bem Estar representation', async () => {
  const detail = {
    titular_is_canonical: true,
    data_emissao: '2026-06-12',
    dia_vencimento: 20,
    plano_pagamento_id: 1643483,
    titular: {
      nome: 'CLIENTE TESTE',
      cpf: '529.982.247-25',
      rg: '123456',
      data_nascimento: '1967-04-28',
      sexo: 'F',
      estado_civil: 'SOLTEIRO',
      profissao: 'Outros',
      telefone: '19999999999',
      email: 'cliente@example.com',
    },
    endereco: {
      logradouro: 'RUA A', numero: '10', bairro: 'CENTRO',
      cidade: 'CAMPINAS', uf: 'SP', cep: '13043010',
    },
    produtos: [
      { id: COMBO_MULTI_WELLBEING_BASE_PRODUCT_IDS[0], quantidade: 1, preco: 55.9, valor_total: 55.9 },
      { id: 55482336, descricao: 'BOM MED - DEPENDENTE 0,00', quantidade: 1, preco: 0.01, valor_total: 0.01 },
      { id: 79080781, descricao: 'BOM PET SAÚDE - NOME DO PET', quantidade: 1, preco: 0.01, valor_total: 0.01 },
    ],
    pessoas: [
      { is_titular: true, nome: 'CLIENTE TESTE', produtos: ['COMBO MULTI BEM ESTAR'] },
      {
        nome: 'DEPENDENTE TESTE', cpf: '111.444.777-35', data_nascimento: '2000-01-01',
        sexo: 'M', telefone: '19999999999', produtos: ['BOM MED - DEPENDENTE 0,00'],
      },
      {
        nome: 'LHASA APSO/TOBBY', data_nascimento: '2015-08-07', sexo: 'M',
        produtos: ['BOM PET SAÚDE - NOME DO PET'],
      },
    ],
    veiculos: [{
      descricao: 'JEEP/GHP9E80/VERMELHO',
      nome: 'JEEP/GHP9E80/VERMELHO',
      data_nascimento: '2015-03-20',
      cpf: null,
      driver: null,
    }],
  };
  assert.equal(detailMatchesContractProduct(detail, CONTRACT_PRODUCTS.COMBO_MULTI_WELLBEING), true);
  const data = buildComboMultiWellbeingContractData(detail);
  assert.equal(data.adhesion, 60);
  assert.equal(data.standard_value, 55.9);
  assert.equal(data.dependent_value, 0);
  assert.equal(data.monthly_value, 55.9);
  assert.deepEqual(data.vehicle, {
    manufacturer: 'JEEP', model: '', color: 'VERMELHO', year: '2015', plate: 'GHP9E80',
  });
  assert.equal(data.driver.name, 'CLIENTE TESTE');
  assert.equal(data.pet.name, 'LHASA APSO');
  assert.equal(data.pet.breed, 'TOBBY');
  assert.equal(data.has_pet_product, true);
  assert.deepEqual(validateComboMultiWellbeingContractData(data), []);

  const historicalWithoutPet = buildComboMultiWellbeingContractData({
    ...detail,
    produtos: detail.produtos.filter((product) =>
      !String(product.descricao || '').includes('NOME DO PET')),
    pessoas: detail.pessoas.filter((person) =>
      !(person.produtos || []).some((description) => description.includes('NOME DO PET'))),
  });
  assert.equal(historicalWithoutPet.has_pet_product, false);
  assert.equal(historicalWithoutPet.pet, null);
  assert.deepEqual(validateComboMultiWellbeingContractData(historicalWithoutPet), []);
  assert.equal(comboMultiWellbeingPaymentCategory(data.payment_plan_id), 'bank');
  const pdf = await renderComboMultiWellbeingPdf(data);
  assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length, 17);
});

test('uses the approved text template and a follow-up document for Combo Multi Bem Estar', () => {
  const delivery = buildContractWhatsAppDelivery({
    productKey: CONTRACT_PRODUCTS.COMBO_MULTI_WELLBEING,
    holderName: 'CLIENTE TESTE',
    displayNumber: '70573',
    documentUrl: 'https://example.com/combo.pdf',
  });
  assert.equal(delivery.templateId, '69ed0d552e1d23a0987f42bb');
  assert.equal(delivery.templateName, 'boas_vindas_multi_bem_star');
  assert.equal(delivery.separateDocument, true);
  assert.equal(delivery.documentUrl, 'https://example.com/combo.pdf');
  assert.deepEqual(delivery.components, [{
    type: 'body',
    parameters: [{ type: 'text', text: 'CLIENTE TESTE' }],
  }]);
  assert.match(buildComboMultiWellbeingWhatsAppMessage('CLIENTE TESTE'), /^Olá, CLIENTE TESTE!/);
});

test('orders Combo Multi Bem Estar dependents with the legacy Bom Med rule', () => {
  const ordered = sortComboMultiWellbeingDependents([
    { name: 'TAINA', phone: '19995170041', birth_date: new Date('1995-08-10T00:00:00Z'), price: 0.01 },
    { name: 'JACOB', phone: '19995170041', birth_date: new Date('1967-10-22T00:00:00Z'), price: 0.01 },
    { name: 'JULIANO', phone: '19995170041', birth_date: new Date('1982-04-11T00:00:00Z'), price: 0.01 },
  ]);
  assert.deepEqual(ordered.map((dependent) => dependent.name), ['JACOB', 'JULIANO', 'TAINA']);
});

test('calculates Combo pet age at contract generation instead of the old order date', () => {
  assert.equal(
    calculateComboPetAge('2015-08-07', '2026-09-19'),
    '11 anos 1 mês',
  );
});

test('recognizes and renders Novo Combo with its own product and model files', async () => {
  const detail = {
    data_emissao: '2026-06-12',
    titular_is_canonical: true,
    titular: {
      nome: 'CLIENTE NOVO COMBO', cpf: '529.982.247-25', rg: '123456',
      data_nascimento: '1980-04-10', sexo: 'F', estado_civil: 'CASADO',
      telefone: '19999999999', email: 'cliente@example.com',
    },
    endereco: {
      logradouro: 'RUA TESTE', numero: '10', bairro: 'CENTRO',
      cidade: 'CAMPINAS', uf: 'SP', cep: '13000000',
    },
    plano_pagamento_id: 25451,
    dia_vencimento: '20',
    produtos: [
      { id: NEW_COMBO_MULTI_WELLBEING_BASE_PRODUCT_IDS[0], quantidade: 1, preco: 79.9, valor_total: 0 },
      { id: 55482336, descricao: 'BOM MED - DEPENDENTE 0,00', quantidade: 1, preco: 0.01 },
    ],
    pessoas: [
      { is_titular: true, nome: 'CLIENTE NOVO COMBO', produtos: ['NOVO COMBO MULTI BEM ESTAR'] },
      { nome: 'DEPENDENTE', cpf: '111.111.111-11', data_nascimento: '2000-01-01', telefone: '19988888888', sexo: 'F', produtos: ['BOM MED - DEPENDENTE 0,00'] },
      { nome: 'PET/RAÇA', data_nascimento: '2020-01-01', sexo: 'M', produtos: ['BOM PET - NOME DO PET'] },
    ],
    veiculos: [{
      descricao: 'MODELO/ABC1D23/PRETO', data_nascimento: '2020-01-01',
      telefone: '19988888888',
    }],
  };
  assert.equal(
    detailMatchesContractProduct(detail, CONTRACT_PRODUCTS.NEW_COMBO_MULTI_WELLBEING),
    true,
  );
  const data = buildComboMultiWellbeingContractData(detail, { newCombo: true });
  assert.equal(data.standard_value, 79.9);
  assert.equal(data.monthly_value, 79.9);
  assert.deepEqual(validateComboMultiWellbeingContractData(data), []);
  const pdf = await renderNewComboMultiWellbeingPdf(data);
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
});

test('recognizes Combo Multi Seleção and renders the modular model without requiring vehicle or pet', async () => {
  const detail = {
    data_emissao: '2026-09-02',
    titular: {
      nome: 'CLIENTE COMBO SELEÇÃO',
      cpf: '529.982.247-25',
      data_nascimento: '1980-04-10',
      sexo: 'F',
      estado_civil: 'CASADO',
      telefone: '19999999999',
    },
    endereco: {
      logradouro: 'RUA TESTE',
      numero: '10',
      bairro: 'CENTRO',
      cidade: 'CAMPINAS',
      uf: 'SP',
      cep: '13000000',
    },
    plano_pagamento_id: 25451,
    dia_vencimento: '20',
    produtos: [
      {
        id: COMBO_MULTI_SELECTION_BASE_PRODUCT_IDS[0],
        descricao: 'COMBO MULTI SELEÇÃO',
        status: 'P',
        quantidade: 1,
        preco: 79.9,
        valor_total: 79.9,
      },
      {
        id: 203597059,
        descricao: 'ESSENCIAL DEPENDENTES - 0 A 50 ANOS',
        quantidade: 2,
        preco: 8,
      },
      {
        id: 55482336,
        descricao: 'BOM MED - DEPENDENTE 0,00',
        quantidade: 5,
        preco: 0.01,
      },
      { id: 47843900, descricao: 'COROA DE FLORES (15,00)', quantidade: 1, preco: 15 },
      { id: 203567296, descricao: 'QUILOMETRAGEM (500 KM)', quantidade: 1, preco: 15 },
    ],
    pessoas: [
      {
        nome: 'DEPENDENTE PAGO 1', cpf: '111.111.111-11', telefone: '19970000001',
        produtos: ['BOM MED - DEPENDENTE 0,00', 'ESSENCIAL DEPENDENTES - 0 A 50 ANOS'],
      },
      {
        nome: 'DEPENDENTE PAGO 2', cpf: '222.222.222-22', telefone: '19970000002',
        produtos: ['BOM MED - DEPENDENTE 0,00', 'ESSENCIAL DEPENDENTES - 0 A 50 ANOS'],
      },
      {
        nome: 'DEPENDENTE GRATUITO', cpf: '333.333.333-33', telefone: '19970000003',
        produtos: ['BOM MED - DEPENDENTE 0,00'],
      },
      {
        nome: 'PET TESTE/SHITZU/PRETO E BRANCO/PORTE PEQUENO',
        data_nascimento: '2023-01-01',
        sexo: 'M',
        produtos: ['BOM PET SAÚDE - NOME DO PET'],
      },
    ],
    veiculos: [{
      descricao: 'FORD KA/PRETO/PLACA FEM9D15',
      modelo: 'FORD KA',
      cor: 'PRETO',
      placa: 'PLACA FEM9D15',
      data_nascimento: '2011-01-01',
      telefone: '19999999999',
    }],
  };
  assert.equal(
    detailMatchesContractProduct(detail, CONTRACT_PRODUCTS.COMBO_MULTI_SELECTION),
    true,
  );
  const data = buildComboMultiWellbeingContractData(detail, {
    selectionCombo: true,
    baseProductIds: COMBO_MULTI_SELECTION_BASE_PRODUCT_IDS,
  });
  assert.equal(data.standard_value, 79.9);
  assert.equal(data.dependent_value, 16);
  assert.equal(data.monthly_value, 125.9);
  assert.deepEqual(data.funeral_form, {
    adhesion: 0,
    standard_value: 0,
    dependent_value: 79.9,
    monthly_value: 109.9,
  });
  assert.deepEqual(data.vehicle, {
    manufacturer: '',
    model: 'FORD KA',
    color: 'PRETO',
    year: '2011',
    plate: 'FEM9D15',
  });
  assert.equal(data.pet.breed, 'SHITZU');
  assert.equal(data.pet.color, 'PRETO E BRANCO');
  assert.equal(data.pet.size, 'PEQUENO');
  assert.equal(data.optional_services.crown.present, true);
  assert.equal(data.optional_services.mileage.present, true);
  assert.deepEqual(validateComboMultiWellbeingContractData(data), []);
  const pdf = await renderComboMultiSelectionPdf(data);
  assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length, 19);
  const delivery = buildContractWhatsAppDelivery({
    productKey: CONTRACT_PRODUCTS.COMBO_MULTI_SELECTION,
    holderName: 'CLIENTE COMBO SELEÇÃO',
    displayNumber: '12345',
    documentUrl: 'https://example.com/combo-selecao.pdf',
  });
  assert.equal(delivery.fileName, 'Contrato Combo Multi Selecao 12345.pdf');
  assert.equal(delivery.separateDocument, true);
});

test('includes the approved regional, promotional and Total Mais product aliases', () => {
  assert.equal(ESSENTIAL_BASE_PRODUCT_IDS.includes(47892111), true);
  assert.equal(ESSENTIAL_BASE_PRODUCT_IDS.includes(47225080), true);
  assert.equal(BOM_IDEAL_BASE_PRODUCT_IDS.includes(214479899), true);
  for (const id of [47224884, 47225055, 47892263, 222010875, 222012256]) {
    assert.equal(TOTAL_MAIS_BASE_PRODUCT_IDS.includes(id), true);
  }
});

test('Novo Combo reproduces legacy optional pages and ignores ADENDO TANATO', async () => {
  const detail = {
    data_emissao: '2026-09-01',
    titular: {
      nome: 'CLIENTE NOVO COMBO', cpf: '529.982.247-25',
      data_nascimento: '1980-04-10', sexo: 'F', estado_civil: 'CASADO',
      telefone: '19999999999',
    },
    endereco: {
      logradouro: 'RUA TESTE', numero: '10', bairro: 'CENTRO',
      cidade: 'CAMPINAS', uf: 'SP', cep: '13000000',
    },
    plano_pagamento_id: 25451,
    dia_vencimento: '20',
    produtos: [
      { id: NEW_COMBO_MULTI_WELLBEING_BASE_PRODUCT_IDS[0], quantidade: 1, preco: 79.9, valor_total: 79.9 },
      { id: 214147174, descricao: 'ADENDO TANATO', quantidade: 1, preco: 27, valor_total: 27 },
      { id: 47843900, descricao: 'COROA DE FLORES (15,00)', quantidade: 1, preco: 15, valor_total: 15 },
      { id: 52247142, descricao: 'CREMAÇÃO (R$ 30,00)', quantidade: 1, preco: 30, valor_total: 30 },
      { id: 203567296, descricao: 'QUILOMETRAGEM (500 KM)', quantidade: 1, preco: 15, valor_total: 15 },
    ],
    pessoas: [],
    veiculos: [],
  };
  const data = buildComboMultiWellbeingContractData(detail, { newCombo: true });
  assert.equal(data.monthly_value, 139.9);
  assert.equal(data.optional_services.thanatopraxy, undefined);
  assert.deepEqual(validateComboMultiWellbeingContractData(data), []);
  const pdf = await renderNewComboMultiWellbeingPdf(data);
  assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length, 19);
});

test('selects the approved document template and exact payload for each contract product', () => {
  assert.equal(CONTRACT_WHATSAPP_TEMPLATES.essencial.name, 'bom_vindas_funeral');
  assert.equal(CONTRACT_WHATSAPP_TEMPLATES.bom_auto.name, 'bom_auto_boas_vindas');
  assert.equal(CONTRACT_WHATSAPP_TEMPLATES.bom_pet.name, 'bom_pet_boas_vindas');
  assert.deepEqual(CONTRACT_WHATSAPP_TEMPLATES[CONTRACT_PRODUCTS.TOTAL_MAIS_BOM_FARMA], {
    id: '69ed0d552e1d23a0987f4317',
    name: 'total_mais_bom_famra',
  });
  const totalMais = buildContractWhatsAppDelivery({
    productKey: CONTRACT_PRODUCTS.TOTAL_MAIS_BOM_FARMA,
    holderName: 'CLIENTE TESTE',
    displayNumber: '56149',
    documentUrl: 'https://example.com/total-mais.pdf',
  });
  assert.equal(totalMais.fileName, 'Contrato Total Mais e Bom Farma 56149.pdf');
  assert.equal(totalMais.templateId, '69ed0d552e1d23a0987f4317');
  assert.equal(totalMais.components[0].parameters[0].type, 'document');
  assert.equal(
    CONTRACT_WHATSAPP_TEMPLATES[CONTRACT_PRODUCTS.BOM_FAMILIA].name,
    'boasvindas_plano_bdfamilia_anexo',
  );
  const family = buildContractWhatsAppDelivery({
    productKey: CONTRACT_PRODUCTS.BOM_FAMILIA,
    holderName: 'CLIENTE TESTE',
    displayNumber: '59616',
    documentUrl: 'https://example.com/family.pdf',
  });
  assert.equal(family.templateId, '69ed0d552e1d23a0987f4319');
  assert.equal(family.fileName, 'Contrato Plano Familia 59616.pdf');
  assert.equal(family.components[0].parameters[0].type, 'document');
  const essential = buildContractWhatsAppDelivery({
    productKey: CONTRACT_PRODUCTS.ESSENCIAL,
    holderName: 'CLIENTE TESTE',
    displayNumber: '59072',
    documentUrl: 'https://example.com/contract.pdf',
  });
  assert.equal(essential.templateId, '69ed0d552e1d23a0987f433d');
  assert.equal(essential.templateName, 'bom_vindas_funeral');
  assert.equal(essential.fileName, 'Contrato Essencial 59072.pdf');
  assert.deepEqual(essential.components, [
    {
      type: 'header',
      parameters: [{
        type: 'document',
        document: {
          link: 'https://example.com/contract.pdf',
          fileName: 'Contrato Essencial 59072.pdf',
        },
      }],
    },
    {
      type: 'body',
      parameters: [{ type: 'text', text: 'CLIENTE TESTE' }],
    },
  ]);
  const bomPet = buildContractWhatsAppDelivery({
    productKey: CONTRACT_PRODUCTS.BOM_PET,
    holderName: 'CLIENTE TESTE',
    displayNumber: '34067',
    documentUrl: 'https://example.com/bom-pet.pdf',
  });
  assert.equal(bomPet.templateId, '69ed0d552e1d23a0987f433f');
  assert.equal(bomPet.templateName, 'bom_pet_boas_vindas');
  assert.equal(bomPet.fileName, 'Contrato Bom Pet 34067.pdf');
  assert.match(bomPet.caption, /Plano Bom Pet/);
  assert.deepEqual(bomPet.components[1], {
    type: 'body',
    parameters: [{ type: 'text', text: 'CLIENTE TESTE' }],
  });
  assert.throws(() => buildContractWhatsAppDelivery({
    productKey: 'unknown',
    holderName: 'CLIENTE TESTE',
    displayNumber: '1',
    documentUrl: 'https://example.com/contract.pdf',
  }), /sem template/i);
  assert.equal(CONTRACT_WHATSAPP_TEMPLATES[CONTRACT_PRODUCTS.CONVALESCENCA], undefined);
  assert.throws(() => buildContractWhatsAppDelivery({
    productKey: CONTRACT_PRODUCTS.CONVALESCENCA,
    holderName: 'CLIENTE TESTE',
    displayNumber: '1401641',
    documentUrl: 'https://example.com/convalescenca.pdf',
  }), /sem template/i);
});

test('builds Total Mais and Bom Farma variants with the legacy page rules', async () => {
  const baseDetail = {
    pedido: '367470909',
    numero_pedido: '80033',
    data_emissao: '2026-09-16T00:00:00.000Z',
    plano_pagamento: 'BOLETO - DIGITAL GALAX',
    dia_vencimento: 10,
    endereco: {
      logradouro: 'RUA TESTE',
      numero: '10',
      bairro: 'CENTRO',
      cidade: 'CAMPINAS',
      uf: 'SP',
      cep: '13000-000',
    },
    titular: {
      is_titular: true,
      nome: 'CLIENTE TESTE',
      cpf: '529.982.247-25',
      data_nascimento: '1980-01-02T00:00:00.000Z',
      sexo: 'F',
      telefone: '19999999999',
      estado_civil: 'CASADO',
      produtos: ['TOTAL +'],
    },
    pessoas: [],
    produtos: [{
      id: 40617334,
      descricao: 'TOTAL +',
      status: 'P',
      sequence: 1,
      quantidade: 1,
      preco: 139.9,
      valor_total: 139.9,
    }],
  };
  baseDetail.pessoas = [baseDetail.titular];
  const totalMais = buildTotalMaisContractData(baseDetail);
  assert.deepEqual(validateTotalMaisContractData(totalMais), []);
  assert.equal(totalMais.has_bom_farma, false);
  assert.equal(totalMais.monthly_value, 139.9);
  assert.equal(
    ((await renderTotalMaisPdf(totalMais)).toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length,
    12,
  );

  const bomFarma = buildTotalMaisContractData({
    ...baseDetail,
    produtos: [{
      id: 222993462,
      descricao: 'TOTAL + & BOM FARMA PRE BLACK ORANGE',
      status: 'P',
      sequence: 1,
      quantidade: 1,
      preco: 74.9,
      valor_total: 74.9,
    }],
    titular: {
      ...baseDetail.titular,
      produtos: ['TOTAL + & BOM FARMA PRE BLACK ORANGE'],
    },
    pessoas: [{
      ...baseDetail.titular,
      produtos: ['TOTAL + & BOM FARMA PRE BLACK ORANGE'],
    }],
  });
  assert.equal(bomFarma.has_bom_farma, true);
  assert.equal(bomFarma.has_bom_med, false);
  assert.equal(
    ((await renderTotalMaisPdf(bomFarma)).toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length,
    15,
  );

  const bomFarmaWithBomMed = {
    ...bomFarma,
    has_bom_med: true,
    cremation_value: 30,
    thanatopraxy_value: 20,
    mileage_value: 15,
  };
  assert.equal(
    ((await renderTotalMaisPdf(bomFarmaWithBomMed)).toString('latin1')
      .match(/\/Type\s*\/Page\b/g) || []).length,
    23,
  );
  const twoDependents = {
    ...totalMais,
    dependents: Array.from({ length: 2 }, (_, index) => ({
      name: `DEPENDENTE ${index + 1}`,
      birth_date: '2000-01-01T00:00:00.000Z',
      sex: 'F',
    })),
  };
  assert.deepEqual(validateTotalMaisContractData(twoDependents), []);
  const lastDependentY = TOTAL_MAIS_PAGE_FIVE_LAYOUT.dependentStartY
    + (TOTAL_MAIS_PAGE_FIVE_LAYOUT.maxDependents - 1)
      * TOTAL_MAIS_PAGE_FIVE_LAYOUT.dependentRowGap;
  assert.ok(lastDependentY < TOTAL_MAIS_PAGE_FIVE_LAYOUT.paymentMethodY);
  assert.deepEqual(TOTAL_MAIS_BOM_MED_LAYOUT, {
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
  assert.deepEqual(TOTAL_MAIS_FINAL_PAGES_LAYOUT, {
    pageNineteenContentOffsetX: 1,
    pageNineteenContentOffsetY: 1.6,
    pageNineteenBirthOffsetY: -1,
    pageNineteenCepDigitPositions: [36, 41, 46, 51, 56, 62, 67, 72],
    pageNineteenPhoneX: 78,
    pageTwentyYearOffsetY: 1.6,
  });
  const threeDependents = {
    ...twoDependents,
    dependents: [...twoDependents.dependents, {
      name: 'DEPENDENTE 3',
      birth_date: '2000-01-01T00:00:00.000Z',
      sex: 'M',
    }],
  };
  assert.match(
    validateTotalMaisContractData(threeDependents).join(' '),
    /no máximo 2 dependentes adicionais/i,
  );
  assert.throws(
    () => renderTotalMaisPdf(threeDependents),
    /no máximo 2 dependentes adicionais/i,
  );
  assert.equal(detailMatchesContractProduct(
    baseDetail,
    CONTRACT_PRODUCTS.TOTAL_MAIS_BOM_FARMA,
  ), true);

  const linkedPerson = (name, relationship, extra = {}) => ({
    nome: name,
    parentesco: relationship,
    data_nascimento: '2000-01-01T00:00:00.000Z',
    sexo: 'F',
    produtos: ['DEPENDENTE TOTAL +'],
    ...extra,
  });
  const legacyOrder = buildTotalMaisContractData({
    ...baseDetail,
    pessoas: [
      baseDetail.titular,
      linkedPerson('RAFAEL NONATO CRIADO', 'F'),
      linkedPerson('ISABELA NONATO CRIADO MORELLI', 'F'),
      linkedPerson('KAREN MARTELLA', 'D'),
      linkedPerson('EDUARDO MAURER MORELLI', 'D'),
      linkedPerson('JOAQUIM CRIADO MORELLI', 'D'),
    ],
  });
  assert.deepEqual(
    legacyOrder.children.map((person) => person.name),
    ['ISABELA NONATO CRIADO MORELLI', 'RAFAEL NONATO CRIADO'],
  );
  assert.deepEqual(
    legacyOrder.dependents.map((person) => person.name),
    ['EDUARDO MAURER MORELLI', 'JOAQUIM CRIADO MORELLI'],
  );

  const bomMedOrder = buildTotalMaisContractData({
    ...baseDetail,
    pessoas: [
      baseDetail.titular,
      linkedPerson('ANDRÉ ALEXANDRE DA SILVA', 'F'),
      linkedPerson('MIRELLY VITÓRIA HERCULANO DE LIMA', 'F', {
        cpf: '500.164.878-50',
        produtos: ['DEPENDENTE TOTAL +', 'BOM MED - DEPENDENTE 0,00'],
      }),
      linkedPerson('BRUNO HENRIQUE DA SILVA', 'F', {
        cpf: '435.550.258-99',
        produtos: ['DEPENDENTE TOTAL +', 'BOM MED - DEPENDENTE 0,00'],
      }),
      linkedPerson('NATALIA PEREIRA DE LIMA', 'F', {
        cpf: '443.166.098-40',
        produtos: ['DEPENDENTE TOTAL +', 'BOM MED - DEPENDENTE 0,00'],
      }),
    ],
  });
  assert.deepEqual(
    bomMedOrder.children.map((person) => person.name),
    [
      'BRUNO HENRIQUE DA SILVA',
      'NATALIA PEREIRA DE LIMA',
      'MIRELLY VITÓRIA HERCULANO DE LIMA',
      'ANDRÉ ALEXANDRE DA SILVA',
    ],
  );
});

test('Total Mais ignores cancelled items and rejected person-product links', () => {
  const holder = {
    is_titular: true,
    nome: 'CLIENTE TESTE',
    cpf: '529.982.247-25',
    data_nascimento: '1980-01-02T00:00:00.000Z',
    sexo: 'F',
    telefone: '19999999999',
    estado_civil: 'CASADO',
    product_links: [{
      description: 'TOTAL + & BOM FARMA PRE BLACK ORANGE',
      item_status: 'P',
      approved: 'S',
    }],
  };
  const approvedDependent = {
    nome: 'DEPENDENTE APROVADO',
    parentesco: 'F',
    product_links: [{
      description: 'DEPENDENTE TOTAL +',
      item_status: 'P',
      approved: 'S',
    }],
  };
  const rejectedDependent = {
    nome: 'DEPENDENTE REJEITADO',
    parentesco: 'D',
    product_links: [{
      description: 'DEPENDENTE TOTAL +',
      item_status: 'P',
      approved: 'N',
    }, {
      description: 'BOM MED - DEPENDENTE 0,00',
      item_status: 'P',
      approved: 'N',
    }],
  };
  const detail = {
    data_emissao: '2026-09-16T00:00:00.000Z',
    endereco: {
      logradouro: 'RUA TESTE',
      numero: '10',
      bairro: 'CENTRO',
      cidade: 'CAMPINAS',
      uf: 'SP',
      cep: '13000-000',
    },
    titular: holder,
    pessoas: [holder, approvedDependent, rejectedDependent],
    produtos: [
      {
        id: 40617334,
        descricao: 'TOTAL +',
        status: 'C',
        sequence: 1,
        valor_total: 139.9,
      },
      {
        id: 222993462,
        descricao: 'TOTAL + & BOM FARMA PRE BLACK ORANGE',
        status: 'P',
        sequence: 2,
        valor_total: 74.9,
      },
      {
        id: 52247142,
        descricao: 'CREMAÇÃO',
        status: 'C',
        sequence: 3,
        valor_total: 30,
      },
    ],
  };
  const data = buildTotalMaisContractData(detail);
  assert.equal(data.has_bom_farma, true);
  assert.equal(data.base_value, 74.9);
  assert.equal(data.cremation_value, 0);
  assert.equal(data.has_bom_med, false);
  assert.deepEqual(data.children.map((person) => person.name), ['DEPENDENTE APROVADO']);
  assert.deepEqual(data.dependents, []);
  assert.equal(detailMatchesContractProduct(detail, CONTRACT_PRODUCTS.TOTAL_MAIS_BOM_FARMA), true);
  assert.equal(detailMatchesContractProduct({
    produtos: detail.produtos.filter((product) => product.status === 'C'),
  }, CONTRACT_PRODUCTS.TOTAL_MAIS_BOM_FARMA), false);
});

test('keeps temporary contract objects inside the configured private bucket', () => {
  assert.deepEqual(
    parseContractStoragePath('/bucket/private/contracts/whatsapp/example.pdf'),
    { bucket: 'bucket', object: 'private/contracts/whatsapp/example.pdf' },
  );
  assert.throws(() => parseContractStoragePath('bucket-only'));
});

test('serves temporary contracts with signed local URLs in Docker-compatible storage', async () => {
  const previousDir = process.env.CONTRACT_STORAGE_DIR;
  const previousSecret = process.env.SESSION_SECRET;
  const dir = await mkdtemp(path.join(os.tmpdir(), 'contract-storage-'));
  process.env.CONTRACT_STORAGE_DIR = dir;
  process.env.SESSION_SECRET = 'local-storage-test-secret';
  const pdf = Buffer.from('%PDF-1.4 local test');
  try {
    const stored = await storeContractForWhatsApp(pdf, 'contracts/test.pdf', {
      baseUrl: 'https://app.example.com',
    });
    const url = new URL(stored.url);
    const read = await readLocalContract(
      url.pathname.split('/').pop(),
      url.searchParams.get('expires'),
      url.searchParams.get('signature'),
    );
    assert.deepEqual(read, pdf);
    await deleteContractFromStorage(stored.objectPath);
  } finally {
    if (previousDir == null) delete process.env.CONTRACT_STORAGE_DIR;
    else process.env.CONTRACT_STORAGE_DIR = previousDir;
    if (previousSecret == null) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previousSecret;
    await rm(dir, { recursive: true, force: true });
  }
});

test('WhatsApp contract sending is authenticated, regenerated and sent as temporary PDF media', () => {
  const routeSource = readFileSync(new URL('./salesContractPrinting.js', import.meta.url), 'utf8');
  const pageSource = readFileSync(
    new URL('../../../src/pages/SalesContractPrinting.jsx', import.meta.url),
    'utf8',
  );
  assert.match(routeSource, /router\.use\(authMiddleware, loadAgentMiddleware, requireSalesContractPrinting\)/);
  assert.match(routeSource, /router\.post\('\/contracts\/send-whatsapp'/);
  assert.match(routeSource, /storeContractForWhatsApp\(pdf, temporaryObject, \{ baseUrl \}\)/);
  assert.match(routeSource, /\{ optimizeForWhatsapp: true \}/);
  assert.match(routeSource, /sendTemplate\(/);
  assert.match(routeSource, /sendMedia\(/);
  assert.match(routeSource, /BOM_AUTO_CONTRACT_WHATSAPP_TOKEN/);
  assert.doesNotMatch(routeSource, /RUDO_WHATSAPP_TOKEN/);
  assert.match(routeSource, /name: 'bom_auto_boas_vindas'/);
  assert.match(routeSource, /name: 'bom_vindas_funeral'/);
  assert.match(routeSource, /name: 'bom_pet_boas_vindas'/);
  assert.match(routeSource, /renderEssentialPdf\(data\)/);
  assert.match(routeSource, /buildContractWhatsAppDelivery\(\{/);
  assert.match(routeSource, /type: 'document'/);
  assert.match(routeSource, /INSERT INTO att_conversations/);
  assert.match(routeSource, /INSERT INTO att_messages/);
  assert.match(routeSource, /setContactAttributes/);
  assert.match(routeSource, /recipientHash/);
  assert.doesNotMatch(routeSource, /recipientConfirmationToken|recipient_confirmation_required|requiresConfirmation/);
  assert.doesNotMatch(pageSource, /confirmationNeeded|confirmDifferentRecipient|recipientConfirmationToken/);
  assert.match(routeSource, /bom_auto_contract_whatsapp_sends/);
  assert.match(
    routeSource,
    /WHERE bom_auto_contract_whatsapp_sends\.status IN \('failed_before_send', 'failed'\)/,
  );
  assert.match(routeSource, /error\.statusCode[\s\S]*\? 'failed_before_send'/);
  assert.match(routeSource, /waitForWhatsAppDelivery\(externalMessageId,\s*\{\s*channelToken\s*\}\)/);
  assert.match(routeSource, /deliveryStatus: delivery\.state/);
  assert.match(pageSource, /Enviar WhatsApp/);
  assert.match(routeSource, /router\.post\('\/contracts\/validate'/);
  assert.match(pageSource, /contracts\/validate/);
  assert.match(pageSource, /checkingGenerationId/);
  assert.match(pageSource, /contracts\/send-whatsapp/);
  assert.doesNotMatch(pageSource, /whatsapp\.ddd/);
  assert.match(pageSource, /minLength=\{10\}/);
  assert.match(pageSource, /maxLength=\{11\}/);
});

test('distinguishes delivered, failed and pending WHU message states', async () => {
  const delivered = await waitForWhatsAppDelivery('message-1', {
    attempts: 1,
    delayMs: 0,
    lookup: async () => ({ ok: true, status: 2 }),
  });
  assert.equal(delivered.state, 'delivered');

  const failed = await waitForWhatsAppDelivery('message-2', {
    attempts: 1,
    delayMs: 0,
    lookup: async () => ({ ok: true, status: -1, errorMessage: 'Erro 131047: 24 horas' }),
  });
  assert.equal(failed.state, 'failed');

  const pending = await waitForWhatsAppDelivery('message-3', {
    attempts: 2,
    delayMs: 0,
    lookup: async () => ({ ok: true, status: 1 }),
  });
  assert.equal(pending.state, 'pending');
});

test('formats media extensions as required by WHU', () => {
  assert.equal(normalizeMediaExtension('pdf', 'Contrato.pdf'), '.pdf');
  assert.equal(normalizeMediaExtension('.PDF', 'Contrato.pdf'), '.pdf');
  assert.equal(normalizeMediaExtension(undefined, 'Contrato.PDF'), '.pdf');
});

test('classifies Bom Auto carnê as bank payment without inventing card data', () => {
  assert.equal(bomAutoPaymentCategory('CARNE - GALAX'), 'bank');
  assert.equal(bomAutoPaymentCategory('BOLETO - DIGITAL'), 'bank');
  assert.equal(bomAutoPaymentCategory('CARTÃO DE CRÉDITO - GALAX'), 'credit_card');
  assert.equal(bomAutoPaymentCategory('DESCONHECIDO'), null);
});

test('does not mark sex or civil status in Bom Auto vehicle-dependent rows', () => {
  const renderer = renderPdf.toString();
  assert.doesNotMatch(renderer, /vehicle\.driver\.sexo/);
  assert.doesNotMatch(renderer, /vehicle\.driver\.estado_civil/);
});

test('keeps WhatsApp mirror columns compatible with existing databases', () => {
  const schema = readFileSync(new URL('../config/schema.sql', import.meta.url), 'utf8');
  assert.match(schema, /ALTER TABLE bom_auto_contract_whatsapp_sends[\s\S]*ADD COLUMN IF NOT EXISTS mirror_status/);
  assert.match(schema, /ALTER TABLE bom_auto_contract_whatsapp_sends[\s\S]*ADD COLUMN IF NOT EXISTS mirror_payload/);
});

test('reports one actionable error for a legacy order without conductor data', () => {
  const errors = validateContractData({
    name: 'Titular', cpf: '52998224725',
    birth_date: '1990-01-01', sex: 'M',
    address: 'Rua A', state: 'SP', cep: '01001000', phone: '11999999999', email: 'a@b.com',
    payment_plan: 'BOLETO', issue_date: '2025-01-01',
    vehicles: [{ modelo: 'ONIX', cor: 'PRETO', placa: 'ABC1D23', ano: '2020', driver: null }],
  });
  assert.deepEqual(errors, ['Nenhum condutor/dependente foi encontrado no ERP para este pedido.']);
});

test('distinguishes an absent driver CPF from an invalid one', () => {
  const base = {
    name: 'Titular', cpf: '52998224725',
    birth_date: '1990-01-01', sex: 'M',
    address: 'Rua A', state: 'SP', cep: '01001000', phone: '11999999999', email: 'a@b.com',
    payment_plan: 'BOLETO', issue_date: '2025-01-01',
  };
  const driver = {
    nome: 'Condutor', data_nascimento: '1990-01-01',
    telefone: '11999999999', sexo: 'M',
  };
  const vehicle = { modelo: 'ONIX', cor: 'PRETO', placa: 'ABC1D23', ano: '2020' };
  assert.deepEqual(
    validateContractData({ ...base, vehicles: [{ ...vehicle, driver }] }),
    ['Veículo 1: o condutor não possui CPF cadastrado no ERP. A emissão do contrato permanece bloqueada até a correção do cadastro.'],
  );
  assert.deepEqual(
    validateContractData({ ...base, vehicles: [{ ...vehicle, driver: { ...driver, cpf: '12345678901' } }] }),
    ['Veículo 1: CPF do condutor inválido.'],
  );
});

test('consolidates missing drivers from multiple legacy vehicles into one message', () => {
  const errors = validateContractData({
    name: 'Titular', cpf: '52998224725',
    birth_date: '1990-01-01', sex: 'M',
    address: 'Rua A', state: 'SP', cep: '01001000', phone: '11999999999', email: 'a@b.com',
    payment_plan: 'BOLETO', issue_date: '2025-01-01',
    vehicles: [
      { modelo: 'ONIX', cor: 'PRETO', placa: 'ABC1D23', ano: '2020', driver: null },
      { modelo: 'ARGO', cor: 'BRANCO', placa: 'DEF4G56', ano: '2022', driver: null },
    ],
  });
  assert.deepEqual(errors, ['Nenhum condutor/dependente foi encontrado no ERP para este pedido.']);
});

test('allows optional civil, profession and RG fields to remain blank like the legacy generator', () => {
  const errors = validateContractData({
    name: 'Titular', cpf: '52998224725',
    birth_date: '1990-01-01', sex: 'M',
    address: 'Rua A', state: 'SP', cep: '01001000', phone: '11999999999', email: 'a@b.com',
    payment_plan: 'BOLETO', issue_date: '2025-01-01',
    vehicles: [{
      modelo: 'ONIX', cor: 'PRETO', placa: 'ABC1D23', ano: '2020',
      driver: {
        nome: 'Condutor', cpf: '52998224725', data_nascimento: '1990-01-01',
        telefone: '11999999999', sexo: 'M',
      },
    }],
  });
  assert.deepEqual(errors, []);
});

test('rejects incomplete vehicles and template overflow', () => {
  const result = validateContractData({
    name: 'Titular', cpf: '52998224725', cpf_owner: '52998224725', rg: '123',
    birth_date: '1990-01-01', sex: 'M', marital_status: 'SOLTEIRO', profession: 'Autônomo',
    address: 'Rua A', state: 'SP', cep: '01001000', phone: '11999999999', email: 'a@b.com',
    payment_plan: 'BOLETO', issue_date: '2025-01-01',
    vehicles: [{ modelo: 'A', cor: 'Preto', placa: 'ABC1D23', ano: '2020', driver: { nome: 'D', cpf: '52998224725', data_nascimento: '1990-01-01', telefone: '11999999999', sexo: 'M', estado_civil: 'SOLTEIRO' } },
      { modelo: 'B', cor: 'Preto', placa: 'ABC1D24', ano: '2020', driver: null },
      { modelo: 'C', cor: 'Preto', placa: 'ABC1D25', ano: '2020', driver: null },
      { modelo: 'D', cor: 'Preto', placa: 'ABC1D26', ano: '2020', driver: null }],
  });
  assert.ok(result.some((item) => /m[aá]ximo 3/i.test(item)));
  assert.ok(result.some((item) => /condutor/i.test(item)));
});

test('contract PDF uses official seven-page background', async () => {
  const pdf = await renderPdf({ name: 'Titular', cpf: '52998224725', issue_date: '2025-01-01', vehicles: [] }, 10);
  assert.ok(pdf.length > 1000000);
  assert.ok((pdf.toString('latin1').match(/\/Subtype\s*\/Image/g) || []).length >= 7);
});

test('Bom Corp PDF uses all official pages and repeats the enrollment page for over 22 employees', async () => {
  const pdf = await renderBomCorpPdf(buildBomCorpContractData({
    company_name: 'EMPRESA TESTE LTDA',
    cnpj: '19367986000160',
    contract: '132383',
    plan: 'BOMCORP PRIME',
    issue_date: '2025-07-31',
    contract_value: 224.5,
    employees: Array.from({ length: 23 }, (_, index) => ({
      id: index + 1,
      name: `COLABORADOR ${index + 1}`,
      cpf: index === 0 ? '52998224725' : '',
    })),
  }));
  assert.ok(pdf.length > 5000000);
  assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length, 12);
  assert.ok((pdf.toString('latin1').match(/\/Subtype\s*\/Image/g) || []).length >= 11);
});

test('Bom Ideal PDF uses the official sixteen-page model', async () => {
  const pdf = await renderBomIdealPdf({
    pedido: '63764',
    issue_date: '2026-03-19',
    observations: 'Adesão zero\nAutorizado.',
    name: 'TITULAR TESTE',
    cpf: '529.982.247-25',
    rg: '123456789',
    birth_date: '1974-09-25',
    sex: 'MASCULINO',
    marital_status: 'CASADO',
    profession: 'Outros',
    address: 'RUA TESTE',
    number: '70',
    district: 'CENTRO',
    city: 'LIMEIRA',
    state: 'SP',
    cep: '13480000',
    phone: '19999999999',
    phone2: '1933334444',
    email: 'teste@example.com',
    adhesion: 60,
    monthly_value: 69.9,
    payment_plan_id: 1643483,
    due_day: '25',
    spouse: null,
    children: [],
    dependents: [],
  });
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
  assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length, 16);
});

test('Plano Família PDF uses the official seventeen-page model', async () => {
  const pdf = await renderBomFamiliaPdf({
    pedido: '59616',
    issue_date: '2026-01-20',
    name: 'TITULAR TESTE',
    cpf: '529.982.247-25',
    birth_date: '1998-08-14',
    sex: 'MASCULINO',
    marital_status: 'SOLTEIRO',
    profession: 'Outros',
    address: 'RUA TESTE',
    number: '470',
    district: 'CENTRO',
    city: 'PORTO ALEGRE',
    state: 'RS',
    cep: '91150330',
    phone: '51999999999',
    email: 'teste@example.com',
    adhesion: 60,
    monthly_value: 89.9,
    payment_plan_id: 1643483,
    due_day: '10',
    dependents: [],
    bom_med_dependents: [],
  });
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
  assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length, 17);
});

test('Plano Família-Portabilidade uses seventeen pages and only selected adendums', async () => {
  const pdf = await renderBomFamiliaPortabilityPdf({
    pedido: '74208',
    issue_date: '2026-07-15',
    name: 'TITULAR TESTE',
    cpf: '529.982.247-25',
    birth_date: '1998-08-14',
    sex: 'MASCULINO',
    marital_status: 'SOLTEIRO',
    profession: 'Outros',
    address: 'RUA TESTE',
    number: '470',
    district: 'CENTRO',
    city: 'PORTO ALEGRE',
    state: 'RS',
    cep: '91150330',
    phone: '51999999999',
    email: 'teste@example.com',
    adhesion: 0,
    monthly_value: 89.9,
    wreath_value: 15,
    wreath_quantity: 1,
    mileage_value: 40,
    mileage_quantity: 2000,
    thanatopraxy_value: 27,
    cremation_value: 0,
    payment_plan_id: 48295856,
    due_day: '10',
    dependents: [{
      name: 'DEPENDENTE TESTE',
      birth_date: '1995-01-01',
      phone: '51988888888',
      sex: 'F',
      relationship: 'M',
    }],
    bom_med_dependents: [],
  });
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
  assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length, 20);
});

test('Bom Med PDF uses the six official pages', async () => {
  const pdf = await renderBomMedPdf({
    pedido: '80442',
    name: 'TITULAR TESTE',
    cpf: '529.982.247-25',
    birth_date: '1990-03-30',
    sex: 'FEMININO',
    marital_status: 'OUTROS',
    address: 'RUA TESTE',
    number: '10',
    district: 'CENTRO',
    city: 'LIMEIRA',
    state: 'SP',
    cep: '13480000',
    phone: '19999999999',
    standard_value: 59.9,
    dependent_value: 0.08,
    monthly_value: 59.98,
    due_day: 25,
    issue_date: '2026-09-18',
    dependents: [],
  });
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
  assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length, 6);
});

test('Essencial PDF uses the fourteen printed JPEG pages and excludes PG-15', async () => {
  const pdf = await renderEssentialPdf({
    name: 'Titular',
    cpf: '52998224725',
    birth_date: '1979-11-25',
    sex: 'F',
    marital_status: 'SOLTEIRA',
    address: 'Rua A',
    number: '10',
    district: 'Centro',
    city: 'Campinas',
    state: 'SP',
    cep: '13026002',
    phone: '19991594349',
    email: 'titular@example.com',
    profession: 'Outros',
    payment_plan: 'BOLETO',
    due_day: 10,
    issue_date: '2026-01-13',
    adhesion: 50,
    base_value: 19.9,
    dependent_value: 0,
    cremation_value: 0,
    flowers_value: 0,
    mileage_value: 0,
    total_value: 19.9,
    dependents: [],
  });
  assert.ok(pdf.length > 10000000);
  assert.ok((pdf.toString('latin1').match(/\/Subtype\s*\/Image/g) || []).length >= 14);
});

test('Essencial PDF repeats page five for dependents eleven through twenty', async () => {
  const pdf = await renderEssentialPdf({
    name: 'Titular',
    cpf: '52998224725',
    birth_date: '1979-11-25',
    sex: 'F',
    address: 'Rua A',
    number: '10',
    district: 'Centro',
    city: 'Campinas',
    state: 'SP',
    cep: '13026002',
    phone: '19991594349',
    phone2: '1933334444',
    email: 'titular@example.com',
    profession: 'Outros',
    observations: 'Atendimento presencial.',
    payment_plan: 'BOLETO',
    payment_plan_id: 48286734,
    due_day: 10,
    issue_date: '2026-01-13',
    adhesion: 50,
    base_value: 19.9,
    dependent_value: 11,
    cremation_value: 0,
    flowers_value: 0,
    mileage_value: 0,
    total_value: 30.9,
    dependents: Array.from({ length: 11 }, (_, index) => ({
      name: `Dependente ${index + 1}`,
      sex: 'F',
      relationship: 'Dependente',
      birth_date: '2000-01-01',
      phone: '11999999999',
      price: 1,
    })),
  });
  assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length, 15);
});

test('Bom Pet PDF uses the seven official JPEG pages', async () => {
  const pdf = await renderBomPetPdf({
    name: 'Titular',
    cpf: '52998224725',
    birth_date: '1989-07-04',
    sex: 'F',
    marital_status: 'SOLTEIRO',
    profession: 'Outros',
    address: 'Rua A',
    number: '10',
    district: 'Centro',
    city: 'Campinas',
    state: 'SP',
    cep: '13026002',
    phone: '19999999999',
    email: 'titular@example.com',
    payment_plan: 'BOLETO - DIGITAL',
    generated_at: '2026-09-16',
    monthly_value: 21.9,
    pets: [{
      name: 'Luiza',
      type: 'Cachorro',
      breed: 'Shit Zu',
      color: 'Caramelo e branco',
      size: 'P',
      birth_date: '2022-06-05',
      sex: 'F',
    }],
  });
  assert.ok(pdf.length > 5000000);
  assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length, 7);
  assert.ok((pdf.toString('latin1').match(/\/Subtype\s*\/Image/g) || []).length >= 7);
  assert.deepEqual(BOM_PET_PET_LAYOUT, {
    firstRowY: 135.8,
    rowGap: 21.5,
    nameSize: 8.5,
    detailsOffsetY: 8.7,
    detailsSize: 8,
    rowOffsetY: [0, 0.7, 1.3],
    detailsRowOffsetY: [0, 0.3, 0.6],
  });
  const modelSource = readFileSync(new URL('../services/salesContractModels.js', import.meta.url), 'utf8');
  assert.match(
    modelSource,
    /page === 7 && generated[\s\S]*write\(generated\.year\.slice\(-2\), 173, 221/,
  );
  const erpSource = readFileSync(new URL('../services/erpDbService.js', import.meta.url), 'utf8');
  assert.match(
    erpSource,
    /tipo_endereco_id = 566 AND ativo = 'S'[\s\S]*ORDER BY id ASC LIMIT 1/,
  );
  assert.match(
    erpSource,
    /if \(header\.endereco_id\)[\s\S]*WHERE en\.id = \$1 LIMIT 1[\s\S]*if \(!enderecoRow && contratantePessoaId\)[\s\S]*tipo_endereco_id = 577 AND en\.ativo = 'S'/,
  );
  assert.match(
    erpSource,
    /FROM atletas[\s\S]*regexp_replace\(COALESCE\(cpf, ''\)[\s\S]*estado_civil/,
  );
});