import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { matchesMagicBytes, validateTrainingUpload } from './trainingValidation.js';

test('accepts supported training formats and rejects mismatches', () => {
  assert.equal(validateTrainingUpload('video', 'video/mp4', 100), null);
  assert.match(validateTrainingUpload('pdf', 'video/mp4', 100), /Formato/);
  assert.match(validateTrainingUpload('cover', 'image/png', 0), /vazio/);
});

test('checks magic bytes for PDF, MP4, WebM and images', () => {
  assert.equal(matchesMagicBytes('pdf', Buffer.from('%PDF-1.7 example')), true);
  assert.equal(matchesMagicBytes('video', Buffer.concat([Buffer.alloc(4), Buffer.from('ftyp'), Buffer.alloc(8)])), true);
  assert.equal(matchesMagicBytes('video', Buffer.from([0x1a, 0x45, 0xdf, 0xa3, ...Array(12).fill(0)])), true);
  assert.equal(matchesMagicBytes('cover', Buffer.from([0xff, 0xd8, ...Array(14).fill(0)])), true);
  assert.equal(matchesMagicBytes('pdf', Buffer.from('not a pdf file')), false);
});
