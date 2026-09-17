import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import express from 'express';
import salesContractPrintingRouter from './salesContractPrinting.js';
import {
  classifyDocument,
  buildBomAutoWhatsAppMessage,
  buildBomPetWhatsAppMessage,
  buildContractWhatsAppDelivery,
  buildEssentialWhatsAppMessage,
  CONTRACT_WHATSAPP_TEMPLATES,
  legacyCivilStatus,
  legacyProfession,
  isValidCpf,
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
  CONTRACT_PRODUCTS,
  ESSENTIAL_BASE_PRODUCT_IDS,
  bomPetPaymentCategory,
  buildBomPetContractData,
  buildEssentialContractData,
  detailMatchesContractProduct,
  essentialLowerDueCheckX,
  essentialPaymentCategory,
  renderBomPetPdf,
  renderEssentialPdf,
  validateBomPetContractData,
  validateEssentialContractData,
} from '../services/salesContractModels.js';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('validates CPF check digits before consulting ERP', () => {
  assert.equal(isValidCpf('529.982.247-25'), true);
  assert.equal(isValidCpf('529.982.247-24'), false);
  assert.equal(isValidCpf('111.111.111-11'), false);
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

test('requires admin or an explicit SalesContractPrinting grant', () => {
  const response = () => {
    const result = { statusCode: null, body: null };
    result.status = (statusCode) => { result.statusCode = statusCode; return result; };
    result.json = (body) => { result.body = body; return result; };
    return result;
  };
  let allowed = false;
  requireSalesContractPrinting(
    { user: { role: 'admin' } },
    response(),
    () => { allowed = true; },
  );
  assert.equal(allowed, true);

  allowed = false;
  requireSalesContractPrinting(
    {
      user: { role: 'user' },
      agent: { agentType: 'sales', modules: ['sales'], allowedSubmenus: ['SalesContractPrinting'] },
    },
    response(),
    () => { allowed = true; },
  );
  assert.equal(allowed, true);

  allowed = false;
  requireSalesContractPrinting(
    {
      user: { role: 'user' },
      agent: {
        agentType: 'sales_supervisor',
        modules: ['dashboard', 'sales'],
        allowedSubmenus: ['SalesContractPrinting'],
      },
    },
    response(),
    () => { allowed = true; },
  );
  assert.equal(allowed, true);

  const denied = response();
  requireSalesContractPrinting(
    { user: { role: 'user' }, agent: { agentType: 'sales', allowedSubmenus: [] } },
    denied,
    () => {},
  );
  assert.equal(denied.statusCode, 403);

  const wrongModule = response();
  requireSalesContractPrinting(
    {
      user: { role: 'user' },
      agent: {
        agentType: 'custom_training',
        modules: ['knowledge_base'],
        allowedSubmenus: ['SalesContractPrinting'],
      },
    },
    wrongModule,
    () => {},
  );
  assert.equal(wrongModule.statusCode, 403);

  allowed = false;
  requireSalesContractPrinting(
    {
      user: { role: 'user' },
      agent: {
        agentType: 'custom_global',
        modules: ['all'],
        allowedSubmenus: ['SalesContractPrinting'],
      },
    },
    response(),
    () => { allowed = true; },
  );
  assert.equal(allowed, true);
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
  assert.match(searchSql, /BOM AUTO% DADOS DO VEÍCULO/);
  assert.match(routeSource, /SELECT 'bom_pet'::text/);
  assert.match(routeSource, /BOM_PET_BASE_PRODUCT_IDS/);
  assert.doesNotMatch(searchSql, /DADOS DO CONDUTOR/);
  assert.match(routeSource, /body\.errors|errors/);
  assert.match(pageSource, /Array\.isArray\(body\.errors\)/);
  assert.match(pageSource, /list-disc/);
  assert.match(pageSource, /Pedido\/orçamento/);
  assert.match(pageSource, /params\.set\("cpf", cpf\)/);
  assert.match(pageSource, /params\.set\("reference", reference\)/);
  assert.doesNotMatch(pageSource, /searchType/);
  assert.match(pageSource, /Serviço de impressão indisponível \(HTTP \$\{response\.status\}\)/);
  assert.match(pageSource, /className="action-pill-primary h-10 px-4"[^>]*>[\s\S]*?action-pill-icon h-4 w-4[\s\S]*?Gerar PDF/);
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
  assert.equal(data.adhesion, 50);
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

test('selects the approved document template and exact payload for each contract product', () => {
  assert.equal(CONTRACT_WHATSAPP_TEMPLATES.essencial.name, 'bom_vindas_funeral');
  assert.equal(CONTRACT_WHATSAPP_TEMPLATES.bom_auto.name, 'bom_auto_boas_vindas');
  assert.equal(CONTRACT_WHATSAPP_TEMPLATES.bom_pet.name, 'bom_pet_boas_vindas');
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
  assert.match(routeSource, /sendTemplate\(/);
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
  assert.match(routeSource, /deliveryStarted && !rejectedBeforeSend \? 'unknown' : 'failed_before_send'/);
  assert.match(routeSource, /waitForWhatsAppDelivery\(externalMessageId,\s*\{\s*channelToken\s*\}\)/);
  assert.match(routeSource, /deliveryStatus: delivery\.state/);
  assert.match(pageSource, /Enviar WhatsApp/);
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
});