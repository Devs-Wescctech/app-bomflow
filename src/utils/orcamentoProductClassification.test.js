import test from "node:test";
import assert from "node:assert/strict";

import {
  canProdutoIncluirTitular,
  createProdutoSelecionado,
  hasAdditionalBomAutoBeneficiaryProduct,
  hasBeneficiarioVinculado,
  isProdutoBeneficiario,
  normalizeIncluirTitular,
} from "./orcamentoProductClassification.js";

const requestedProducts = [
  {
    code: "121878",
    title: "BOM PASTOR - IDEAL",
    description: "BOM DESCANSO IDEAL (DEPENDENTE)",
  },
  {
    code: "25",
    title: "BOM PASTOR - TOTAL +",
    description: "DEPENDENTE TOTAL +",
  },
  {
    code: "2307",
    title: "BOM PASTOR - TOTAL +",
    description: "BOM MED - DEPENDENTE 0,00",
  },
  {
    code: "94413",
    title: "BOM PASTOR - BOM AUTO",
    description: "BOM AUTO CLIENTES - DADOS DO VEÍCULO",
  },
  {
    code: "94414",
    title: "BOM PASTOR - BOM AUTO",
    description: "BOM AUTO NÃO CLIENTES - DADOS DO VEÍCULO",
  },
  {
    code: "2307",
    title: "BOM PASTOR - BOM MED",
    description: "BOM MED - DEPENDENTE 0,00",
  },
  {
    code: "76719",
    title: "BOM PASTOR - BOM PET",
    description: "BOM PET SAÚDE - NOME DO PET",
  },
];

for (const product of requestedProducts) {
  test(`${product.title}: ${product.code} aparece como produto de beneficiário`, () => {
    const catalogProduct = {
      id: product.code,
      descricao: product.description,
      preco_informado: 0.01,
    };
    assert.equal(isProdutoBeneficiario(catalogProduct), true);
    assert.deepEqual(createProdutoSelecionado(catalogProduct), {
      produto_id: product.code,
      preco: "0.01",
      incluir_titular: false,
    });
  });
}

test("dependente com preço real continua como produto selecionável do plano", () => {
  assert.equal(
    isProdutoBeneficiario({
      descricao: "ESSENCIAL DEPENDENTES - 0 A 50 ANOS",
      preco_informado: 8,
    }),
    false
  );
});

test("produto comum selecionado inclui o titular por padrão", () => {
  assert.deepEqual(
    createProdutoSelecionado({
      id: 123,
      descricao: "PLANO TITULAR",
      preco_informado: 49.9,
    }),
    {
      produto_id: "123",
      preco: "49.9",
      incluir_titular: true,
    }
  );
});

test("BOM AUTO misto libera card adicional quando há dependente selecionado", () => {
  const catalog = [
    { id: "condutor", descricao: "DADOS DO CONDUTOR", preco_informado: 0.01 },
    { id: "veiculo", descricao: "DADOS DO VEÍCULO", preco_informado: 0.01 },
    { id: "dependente", descricao: "BD FAMILIA- DEPENDENTE 0,00", preco_informado: 0.01 },
  ];

  assert.equal(hasAdditionalBomAutoBeneficiaryProduct(
    [{ produto_id: "condutor" }, { produto_id: "veiculo" }, { produto_id: "dependente" }],
    catalog,
    "condutor",
    "veiculo"
  ), true);
});

test("BOM AUTO puro mantém somente os cards fixos de condutor e veículo", () => {
  const catalog = [
    { id: "condutor", descricao: "DADOS DO CONDUTOR", preco_informado: 0.01 },
    { id: "veiculo", descricao: "DADOS DO VEÍCULO", preco_informado: 0.01 },
    { id: "dependente", descricao: "BD FAMILIA- DEPENDENTE 0,00", preco_informado: 0.01 },
  ];

  assert.equal(hasAdditionalBomAutoBeneficiaryProduct(
    [{ produto_id: "condutor" }, { produto_id: "veiculo" }],
    catalog,
    "condutor",
    "veiculo"
  ), false);
});

test("produto técnico de pet não exige dependente adicional no BOM AUTO", () => {
  const catalog = [
    { id: "condutor", descricao: "DADOS DO CONDUTOR", preco_informado: 0.01 },
    { id: "veiculo", descricao: "DADOS DO VEÍCULO", preco_informado: 0.01 },
    { id: "pet", descricao: "BOM PET SAÚDE - NOME DO PET", preco_informado: 0.01 },
  ];

  assert.equal(hasAdditionalBomAutoBeneficiaryProduct(
    [{ produto_id: "condutor" }, { produto_id: "veiculo" }, { produto_id: "pet" }],
    catalog,
    "condutor",
    "veiculo"
  ), false);
});

test("outro produto técnico de veículo não exige dependente adicional no BOM AUTO", () => {
  const catalog = [
    { id: "condutor", descricao: "DADOS DO CONDUTOR", preco_informado: 0.01 },
    { id: "veiculo", descricao: "DADOS DO VEÍCULO", preco_informado: 0.01 },
    { id: "veiculo-extra-dado", descricao: "DADOS DO VEÍCULO ADICIONAL", preco_informado: 0.01 },
  ];

  assert.equal(hasAdditionalBomAutoBeneficiaryProduct(
    [{ produto_id: "condutor" }, { produto_id: "veiculo" }, { produto_id: "veiculo-extra-dado" }],
    catalog,
    "condutor",
    "veiculo"
  ), false);
});

test("produto especial nunca aceita incluir o titular, mesmo se a UI solicitar", () => {
  const produto = {
    descricao: "BOM PET SAÚDE - NOME DO PET",
    preco_informado: 0.01,
  };
  assert.equal(canProdutoIncluirTitular(produto), false);
  assert.equal(normalizeIncluirTitular(produto, true), false);
});

test("dependente pago também não oferece vínculo do titular", () => {
  const produto = {
    descricao: "ESSENCIAL DEPENDENTES - 0 A 50 ANOS",
    preco_informado: 8,
  };
  assert.equal(canProdutoIncluirTitular(produto), false);
  assert.equal(normalizeIncluirTitular(produto, true), false);
});

test("produto especial selecionado exige beneficiário nomeado no mesmo item", () => {
  const beneficiarios = [
    { usua_produtos: "2307", usua_nome_completo: "" },
    { usua_produtos: "25", usua_nome_completo: "MARIA SILVA" },
  ];
  assert.equal(hasBeneficiarioVinculado("2307", beneficiarios), false);
  assert.equal(hasBeneficiarioVinculado("25", beneficiarios), true);
  assert.equal(hasBeneficiarioVinculado("76719", beneficiarios), false);
});