import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const entitiesSource = readFileSync(new URL('./entities.js', import.meta.url), 'utf8');
const functionsSource = readFileSync(new URL('./functions.js', import.meta.url), 'utf8');
const schemaSource = readFileSync(new URL('../config/schema.sql', import.meta.url), 'utf8');

const mutationErrorMarkers = [
  'Error creating agent:',
  'Error updating agent:',
  'Error creating lead:',
  'Error updating lead:',
  'Error creating lead PJ:',
  'Error updating lead PJ:',
  'Error creating lead upsell:',
  'Error updating lead upsell:',
  'Error creating referral:',
  'Error updating referral:',
  'Error creating reactivation:',
  'Error updating reactivation:',
];

test('rotas locais devolvem erro de validação de telefone como HTTP 400', () => {
  for (const marker of mutationErrorMarkers) {
    const markerStart = entitiesSource.indexOf(marker);
    assert.notEqual(markerStart, -1, `${marker} deve existir`);
    const catchSource = entitiesSource.slice(markerStart, markerStart + 360);
    assert.match(catchSource, /error\.statusCode \|\| 500/, `${marker} deve preservar statusCode`);
    assert.match(catchSource, /code: error\.code/, `${marker} deve preservar o código de validação`);
  }
});

test('consulta de WhatsApp aceita E.164 sem usar validação de armazenamento', () => {
  const routeStart = functionsSource.indexOf("router.post('/validate-whatsapp'");
  assert.notEqual(routeStart, -1);
  const nextRoute = functionsSource.indexOf('\nrouter.', routeStart + 1);
  const routeSource = functionsSource.slice(routeStart, nextRoute);

  assert.match(routeSource, /normalizeBrazilPhoneNational\(phone\)/);
  assert.doesNotMatch(routeSource, /normalizeValidBrazilPhoneNational\(phone/);
  assert.match(routeSource, /cleaned\.length < 10/);
});

test('proteção do banco preserva updates não relacionados em telefones legados', () => {
  const sectionStart = schemaSource.indexOf('BOM FLOW PHONE DATA INTEGRITY');
  const sectionEnd = schemaSource.indexOf('-- referrals already had', sectionStart);
  const sectionSource = schemaSource.slice(sectionStart, sectionEnd);

  assert.doesNotMatch(sectionSource, /EXECUTE format\(\s*'UPDATE/i);
  assert.doesNotMatch(sectionSource, /\bSET %I\s*=/i);
  assert.doesNotMatch(sectionSource, /ADD CONSTRAINT/);
  assert.match(sectionSource, /CREATE TRIGGER/);
  assert.match(sectionSource, /BEFORE INSERT OR UPDATE OF/);
  assert.match(sectionSource, /IS NOT DISTINCT FROM/);
  assert.match(sectionSource, /RAISE EXCEPTION/);
});