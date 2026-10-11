import test from "node:test";
import assert from "node:assert/strict";
import { filterActiveAcquirers, parseActivePool } from "../src/providers/routing.js";

test("Gotham ativa + Nexus desativada → só Gotham, nunca Nexus", () => {
  const { ordered, excluded } = filterActiveAcquirers({
    pool: ["nexuspag", "gothampay", "smokepay"],
    rows: [
      { acquirer_id: "nexuspag", enabled: false, priority: 10 },
      { acquirer_id: "gothampay", enabled: true, priority: 20 },
      { acquirer_id: "smokepay", enabled: false, priority: 30 },
    ],
    isConfigured: () => true,
  });
  assert.deepEqual(ordered, ["gothampay"]);
  assert.ok(excluded.some((e) => e.id === "nexuspag" && e.reason === "disabled_in_admin"));
});

test("Nexus desativada + Gotham sem credencial → lista vazia (sem fallback silencioso)", () => {
  const { ordered } = filterActiveAcquirers({
    pool: ["nexuspag", "gothampay"],
    rows: [
      { acquirer_id: "nexuspag", enabled: false, priority: 10 },
      { acquirer_id: "gothampay", enabled: true, priority: 20 },
    ],
    isConfigured: (id) => id === "nexuspag",
  });
  assert.deepEqual(ordered, []);
});

test("todas desativadas → ordered vazio", () => {
  const { ordered } = filterActiveAcquirers({
    pool: ["nexuspag", "gothampay"],
    rows: [
      { acquirer_id: "nexuspag", enabled: false, priority: 10 },
      { acquirer_id: "gothampay", enabled: false, priority: 20 },
    ],
    isConfigured: () => true,
  });
  assert.deepEqual(ordered, []);
});

test("prioridade admin muda a ordem", () => {
  const { ordered } = filterActiveAcquirers({
    pool: ["nexuspag", "gothampay", "smokepay"],
    rows: [
      { acquirer_id: "nexuspag", enabled: true, priority: 50 },
      { acquirer_id: "gothampay", enabled: true, priority: 5 },
      { acquirer_id: "smokepay", enabled: true, priority: 15 },
    ],
    isConfigured: () => true,
  });
  assert.deepEqual(ordered, ["gothampay", "smokepay", "nexuspag"]);
});

test("com config no banco, id sem linha não entra (fail-closed)", () => {
  const { ordered, excluded } = filterActiveAcquirers({
    pool: ["nexuspag", "gothampay"],
    rows: [{ acquirer_id: "gothampay", enabled: true, priority: 1 }],
    isConfigured: () => true,
  });
  assert.deepEqual(ordered, ["gothampay"]);
  assert.ok(excluded.some((e) => e.id === "nexuspag" && e.reason === "no_admin_row"));
});

test("tabela vazia: bootstrap só por credencial", () => {
  const { ordered } = filterActiveAcquirers({
    pool: ["nexuspag", "gothampay"],
    rows: [],
    isConfigured: (id) => id === "nexuspag",
  });
  assert.deepEqual(ordered, ["nexuspag"]);
});

test("parseActivePool lê env e default", () => {
  assert.deepEqual(parseActivePool("gothampay, smokepay"), ["gothampay", "smokepay"]);
  assert.ok(parseActivePool(undefined).includes("nexuspag"));
});
