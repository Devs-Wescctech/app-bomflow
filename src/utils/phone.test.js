import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizePhone,
  formatBrazilPhone,
  isValidBrazilPhone,
  normalizeBrazilPhoneE164,
} from "./phone.js";

test("normalizes national and international Brazilian numbers", () => {
  assert.equal(normalizePhone("(11) 2345-6789"), "1123456789");
  assert.equal(normalizePhone("551123456789"), "1123456789");
  assert.equal(normalizePhone("5511998765432"), "11998765432");
  assert.equal(normalizePhone("5511234567890"), "11234567890");
  assert.equal(normalizePhone("11 99876-5432 extra"), "11998765432");
});

test("progressively masks landlines and mobiles", () => {
  assert.equal(formatBrazilPhone("11"), "11");
  assert.equal(formatBrazilPhone("1123456789"), "(11) 2345-6789");
  assert.equal(formatBrazilPhone("11998765432"), "(11) 99876-5432");
  assert.equal(formatBrazilPhone("5511998765432"), "(11) 99876-5432");
});

test("covers the required fixed and mobile examples", () => {
  assert.equal(normalizePhone("(51) 3081-9311"), "5130819311");
  assert.equal(formatBrazilPhone("(51) 3081-9311"), "(51) 3081-9311");
  assert.equal(normalizePhone("(51) 99120-6574"), "51991206574");
  assert.equal(formatBrazilPhone("(51) 99120-6574"), "(51) 99120-6574");
});

test("keeps WhatsApp provider formatting separate from national storage", () => {
  assert.equal(normalizeBrazilPhoneE164("(51) 99120-6574"), "5551991206574");
  assert.equal(normalizeBrazilPhoneE164("(51) 3081-9311"), "555130819311");
  assert.equal(normalizeBrazilPhoneE164("(51) 8153-2008"), "5551981532008");
});

test("requires 10 or 11 national digits when a phone is supplied", () => {
  assert.equal(isValidBrazilPhone("5130819311"), true);
  assert.equal(isValidBrazilPhone("51991206574"), true);
  assert.equal(isValidBrazilPhone("513081931"), false);
  assert.equal(isValidBrazilPhone("519912065740"), false);
  assert.equal(isValidBrazilPhone("+55 (51) 99120-6574"), true);
  assert.equal(isValidBrazilPhone(""), true);
  assert.equal(isValidBrazilPhone("", { allowEmpty: false }), false);
});