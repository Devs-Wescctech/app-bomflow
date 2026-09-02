import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import {
  isBomPetPaymentContentValid,
  findBomPetOrphanFilenames,
  normalizeBomPetOrigem,
  parseParticularPaidAmount,
  validateParticularFields,
} from './bomPetParticularRules.js';

test('registros históricos sem origem continuam como Plano', () => {
  assert.equal(normalizeBomPetOrigem(undefined), 'Plano');
  assert.equal(normalizeBomPetOrigem('Plano'), 'Plano');
  assert.equal(normalizeBomPetOrigem('Particular'), 'Particular');
  assert.equal(normalizeBomPetOrigem('forjada'), null);
});

test('Particular exige cliente, pet completo e comprovante', () => {
  assert.deepEqual(validateParticularFields({}, []), [
    'Nome do cliente é obrigatório.',
    'Nome do pet é obrigatório.',
    'Descrição do pet é obrigatória.',
    'Anexe ao menos um comprovante de pagamento válido.',
  ]);
  assert.deepEqual(validateParticularFields({
    nome: 'ANA',
    petNome: 'LUNA',
    petDescricao: 'GATA',
  }, [{}]), []);
});

test('comprovante valida assinatura real e não apenas o MIME declarado', () => {
  assert.equal(isBomPetPaymentContentValid(Buffer.from('%PDF-1.7'), 'application/pdf'), true);
  assert.equal(isBomPetPaymentContentValid(Buffer.from('arquivo falso'), 'application/pdf'), false);
  assert.equal(
    isBomPetPaymentContentValid(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), 'image/png'),
    true
  );
  assert.equal(isBomPetPaymentContentValid(Buffer.from('GIF89a'), 'image/gif'), true);
});

test('reconciliação só remove arquivo antigo sem referência no banco', () => {
  const entries = [
    { name: 'referenciado.pdf', mtimeMs: 10 },
    { name: 'orfao.pdf', mtimeMs: 10 },
    { name: 'ainda-em-upload.pdf', mtimeMs: 900 },
  ];
  assert.deepEqual(
    findBomPetOrphanFilenames(entries, ['referenciado.pdf'], 500),
    ['orfao.pdf']
  );
});

test('valor pago aceita somente número monetário e não aceita texto', () => {
  assert.equal(parseParticularPaidAmount('125'), 125);
  assert.equal(parseParticularPaidAmount('125,50'), 125.5);
  assert.equal(parseParticularPaidAmount('125.50'), 125.5);
  assert.equal(parseParticularPaidAmount('R$ 125,50'), null);
  assert.equal(parseParticularPaidAmount('125,500'), null);
  assert.equal(parseParticularPaidAmount(''), null);
});