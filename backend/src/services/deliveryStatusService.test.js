import test from 'node:test';
import assert from 'node:assert/strict';
import { mapWhuStatus, nextDeliveryStatus, parseWhuTimestamp } from './deliveryStatusService.js';

test('parseWhuTimestamp trata timestamp sem fuso como horário de Brasília (-03:00)', () => {
  // "utcDh*" da WHU vem naive em BRT: 12:07 BRT = 15:07 UTC
  assert.equal(parseWhuTimestamp('2026-08-14T12:07:29').toISOString(), '2026-08-14T15:07:29.000Z');
  // Com fuso explícito, respeita o fuso
  assert.equal(parseWhuTimestamp('2026-08-14T15:07:29Z').toISOString(), '2026-08-14T15:07:29.000Z');
  assert.equal(parseWhuTimestamp('2026-08-14T12:07:29-03:00').toISOString(), '2026-08-14T15:07:29.000Z');
  assert.equal(parseWhuTimestamp(null), null);
  assert.equal(parseWhuTimestamp('lixo'), null);
});

test('mapWhuStatus mapeia os códigos da WHU', () => {
  assert.equal(mapWhuStatus(0), 'sent');
  assert.equal(mapWhuStatus(1), 'sent');
  assert.equal(mapWhuStatus(2), 'delivered');
  assert.equal(mapWhuStatus(3), 'read');
  assert.equal(mapWhuStatus(5), 'read');
  assert.equal(mapWhuStatus(-1), 'failed');
  assert.equal(mapWhuStatus(4), null);
  assert.equal(mapWhuStatus(null), null);
});

test('status só avança (sent → delivered → read)', () => {
  assert.equal(nextDeliveryStatus(null, 'sent'), 'sent');
  assert.equal(nextDeliveryStatus('sent', 'delivered'), 'delivered');
  assert.equal(nextDeliveryStatus('delivered', 'read'), 'read');
  // Não regride
  assert.equal(nextDeliveryStatus('delivered', 'sent'), null);
  assert.equal(nextDeliveryStatus('read', 'delivered'), null);
  assert.equal(nextDeliveryStatus('sent', 'sent'), null);
});

test('erro só se ainda não entregue/lido; terminais nunca mudam', () => {
  assert.equal(nextDeliveryStatus('sent', 'failed'), 'failed');
  assert.equal(nextDeliveryStatus(null, 'failed'), 'failed');
  assert.equal(nextDeliveryStatus('delivered', 'failed'), null);
  assert.equal(nextDeliveryStatus('read', 'failed'), null);
  assert.equal(nextDeliveryStatus('failed', 'delivered'), null);
  assert.equal(nextDeliveryStatus('unverifiable', 'read'), null);
});
