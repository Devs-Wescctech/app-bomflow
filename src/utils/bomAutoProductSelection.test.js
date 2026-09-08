import test from "node:test";
import assert from "node:assert/strict";

import {
  findBomAutoConductorForVehicle,
  getBomAutoVehicleCatalogIssue,
  getBomAutoVariant,
  selectBomAutoProductForVariant,
} from "./bomAutoProductSelection.js";

const vehicleClient = {
  id: 88167567,
  descricao: "BOM AUTO CLIENTES - DADOS DO VEÍCULO",
  contrato_id: 830,
  titulo_contrato: "BOM PASTOR - BOM AUTO",
};
const vehicleNonClient = {
  id: 88167862,
  descricao: "BOM AUTO NÃO CLIENTES - DADOS DO VEÍCULO",
  contrato_id: 830,
  titulo_contrato: "BOM PASTOR - BOM AUTO",
};
const conductorClient = {
  id: 88588931,
  descricao: "BOM AUTO CLIENTES - DADOS DO CONDUTOR",
  contrato_id: 830,
  titulo_contrato: "BOM PASTOR - BOM AUTO",
};
const conductorNonClient = {
  id: 88589037,
  descricao: "BOM AUTO NAO CLIENTES - DADOS DO CONDUTOR",
  contrato_id: 830,
  titulo_contrato: "BOM PASTOR - BOM AUTO",
};

test("identifica as variantes CLIENTES e NÃO CLIENTES sem confundir o prefixo", () => {
  assert.equal(getBomAutoVariant(vehicleClient), "clientes");
  assert.equal(getBomAutoVariant(vehicleNonClient), "nao-clientes");
});

test("seleciona o produto de veículo correspondente ao plano escolhido", () => {
  const products = [vehicleClient, vehicleNonClient];
  assert.equal(selectBomAutoProductForVariant(products, "clientes")?.id, vehicleClient.id);
  assert.equal(selectBomAutoProductForVariant(products, "nao-clientes")?.id, vehicleNonClient.id);
});

test("pareia veículo NÃO CLIENTES com condutor mesmo quando o ERP omite o acento", () => {
  const products = [conductorClient, conductorNonClient];
  assert.equal(
    findBomAutoConductorForVehicle(vehicleNonClient, products)?.id,
    conductorNonClient.id
  );
});

test("não pareia condutor publicado em outro contrato ou título", () => {
  const foreignConductor = {
    ...conductorClient,
    contrato_id: 999,
    titulo_contrato: "OUTRO TÍTULO",
  };
  assert.equal(
    findBomAutoConductorForVehicle(vehicleClient, [foreignConductor]),
    null
  );
});

test("bloqueia veículo COMBO quando o título não publica seu condutor", () => {
  const comboVehicle = {
    ...vehicleClient,
    contrato_id: 910,
    titulo_contrato: "BOM PASTOR - COMBO MULTI ESPECIAL",
  };
  assert.match(
    getBomAutoVehicleCatalogIssue(
      [comboVehicle.id],
      [comboVehicle]
    ),
    /não publica o produto de condutor/i
  );
  assert.equal(
    getBomAutoVehicleCatalogIssue(
      [vehicleClient.id],
      [vehicleClient, conductorClient]
    ),
    ""
  );
});