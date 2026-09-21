import test from 'node:test';
import assert from 'node:assert/strict';
import { signatureBufferFromDataUrl } from './signatureImage.js';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X1WnWQAAAABJRU5ErkJggg==',
  'base64',
);

test('aceita PNG válido dentro dos limites', () => {
  const result = signatureBufferFromDataUrl(`data:image/png;base64,${png.toString('base64')}`);
  assert.deepEqual(result, png);
});

test('rejeita outro tipo de arquivo', () => {
  assert.throws(() => signatureBufferFromDataUrl('data:text/plain;base64,QQ=='), /PNG/);
});
