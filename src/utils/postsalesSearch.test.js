import test from "node:test";
import assert from "node:assert/strict";
import { matchesPostSalesSearch, normalizeSearchText } from "./postsalesSearch.js";

const item = {
  cliente_nome: "João D'Ávila",
  cliente_cpf: "123.456.789-01",
  erp_numero: "2026-0042",
  erp_pedido_id: 987654,
};

test("normaliza caixa e acentuação da busca", () => {
  assert.equal(normalizeSearchText("  JOÃO D'ÁVILA  "), "joao d'avila");
  assert.equal(matchesPostSalesSearch(item, "joao d'avila"), true);
  assert.equal(matchesPostSalesSearch(item, "D'ÁVILA"), true);
});

test("encontra CPF com ou sem pontuação", () => {
  assert.equal(matchesPostSalesSearch(item, "123.456.789-01"), true);
  assert.equal(matchesPostSalesSearch(item, "12345678901"), true);
});

test("encontra número público ou identificador interno do orçamento", () => {
  assert.equal(matchesPostSalesSearch(item, "2026-0042"), true);
  assert.equal(matchesPostSalesSearch(item, "20260042"), true);
  assert.equal(matchesPostSalesSearch(item, "987654"), true);
});

test("não encontra termo ausente", () => {
  assert.equal(matchesPostSalesSearch(item, "Maria"), false);
});