import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getApprovalPending,
  isDocumentUploadAllowed,
  getRequiredDocumentTypes,
} from './orcamentoDocumentos.js';

const BASE_DOCS = [
  'documento_identidade',
  'comprovante_residencia',
  'copia_contrato',
];

function completeDetail(overrides = {}) {
  return {
    produtos: [{ descricao: 'Plano completo', preco: 49.9 }],
    pessoas: [{
      is_titular: true,
      nome: 'Cliente Teste',
      cpf: '12345678901',
      telefone: '11999999999',
      email: 'cliente@example.com',
      endereco: {
        cep: '01001000',
        logradouro: 'Praça da Sé',
        numero: '1',
        bairro: 'Sé',
        cidade: 'São Paulo',
      },
    }],
    plano_pagamento: 'Mensal',
    ...overrides,
  };
}

test('Adesão Zero = Sim exige somente os três documentos aplicáveis', () => {
  assert.deepEqual(
    getRequiredDocumentTypes(true).map(({ tipo }) => tipo),
    BASE_DOCS
  );

  const validation = getApprovalPending({
    orcamento: { adesao_zero: true },
    detalhe: completeDetail(),
    documentTypes: new Set(BASE_DOCS),
  });

  assert.deepEqual(validation.pending, []);
});

test('Adesão Zero = Não mantém taxa de adesão obrigatória', () => {
  const validation = getApprovalPending({
    orcamento: { adesao_zero: false },
    detalhe: completeDetail(),
    documentTypes: new Set(BASE_DOCS),
  });

  assert.deepEqual(validation.missingFields, []);
  assert.deepEqual(validation.missingDocs, [
    { tipo: 'taxa_adesao', label: 'Taxa de adesão' },
  ]);
  assert.deepEqual(validation.pending, [
    { kind: 'document', tipo: 'taxa_adesao', label: 'Taxa de adesão' },
  ]);
});

test('lista somente os dados obrigatórios realmente ausentes', () => {
  const detalhe = completeDetail({
    produtos: [{ descricao: 'Vaga de dependente', preco: 0.01 }],
    pessoas: [{
      is_titular: true,
      nome: '   ',
      cpf: null,
      telefone: '',
      email: 'cliente@example.com',
      endereco: {
        cep: '01001000',
        logradouro: 'Praça da Sé',
        numero: '',
        bairro: 'Sé',
        cidade: 'São Paulo',
      },
    }],
    plano_pagamento: null,
  });
  const validation = getApprovalPending({
    orcamento: { adesao_zero: true, cliente_nome: '', cliente_cpf: '' },
    detalhe,
    documentTypes: new Set([...BASE_DOCS, 'taxa_adesao']),
  });

  assert.deepEqual(
    validation.missingFields.map(({ key }) => key),
    ['cpf', 'nome', 'telefone', 'endereco', 'plano_pagamento', 'produto']
  );
  assert.deepEqual(validation.missingDocs, []);
  assert.equal(validation.pending.some(({ label }) => label === 'E-mail'), false);
  assert.equal(validation.pending.some(({ label }) => label === 'Taxa de adesão'), false);
});

test('orçamento completo com Adesão Zero = Não não tem pendências', () => {
  const validation = getApprovalPending({
    orcamento: { adesao_zero: false },
    detalhe: completeDetail(),
    documentTypes: new Set([...BASE_DOCS, 'taxa_adesao']),
  });

  assert.deepEqual(validation.pending, []);
  assert.deepEqual(validation.missingFields, []);
  assert.deepEqual(validation.missingDocs, []);
});

test('taxa de adesão não pode ser anexada com Adesão Zero = Sim', () => {
  assert.equal(isDocumentUploadAllowed('taxa_adesao', true), false);
  assert.equal(isDocumentUploadAllowed('taxa_adesao', false), true);
  assert.equal(isDocumentUploadAllowed('copia_contrato', true), true);
});