import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const newLeadSource = readFileSync(new URL("./NewLead.jsx", import.meta.url), "utf8");
const quickLeadSource = readFileSync(
  new URL("../components/sales/QuickLeadForm.jsx", import.meta.url),
  "utf8",
);

test("Novo Lead bloqueia telefone obrigatório fora de 10 ou 11 números", () => {
  for (const source of [newLeadSource, quickLeadSource]) {
    assert.match(source, /isValidBrazilPhone\(formData\.phone, \{ allowEmpty: false \}\)/);
    assert.match(source, /brazilPhoneValidationMessage\(formData\.phone, \{ allowEmpty: false \}\)/);
    assert.match(source, /phone: normalizePhone\(formData\.phone\)/);
  }
});