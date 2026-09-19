/**
 * Isolamento test/live — o guard de escopo multi-tenant.
 *
 * Cobre os cenarios pedidos: acessar/cancelar/reembolsar cobranca de outro
 * ambiente e acessar cliente de outro ambiente. Todas as operacoes desses
 * fluxos (getPayment, cancelPayment, createRefund, getCustomer,
 * updateCustomer, deleteCustomer, findApiKeyInScope, findEndpointInScope)
 * terminam nesta funcao antes de devolver qualquer coisa.
 *
 * Roda sem nenhuma dependencia: `npm run test` no workspace do backend.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { isInScope, inScopeOrNull } from "../src/utils/scope.js";

const ORG_A = "11111111-1111-1111-1111-111111111111";
const ORG_B = "22222222-2222-2222-2222-222222222222";

const livePayment = { id: "pay_live", organization_id: ORG_A, environment: "live" };
const testPayment = { id: "pay_test", organization_id: ORG_A, environment: "test" };

test("cobranca do proprio ambiente e aceita", () => {
  assert.equal(isInScope(testPayment, ORG_A, "test"), true);
  assert.equal(isInScope(livePayment, ORG_A, "live"), true);
});

test("chave sk_test_ nao alcanca cobranca de producao da mesma empresa", () => {
  // Era exatamente este o furo: getPayment filtrava so por organizacao, e
  // cancelPayment/createRefund sao construidos em cima dele.
  assert.equal(isInScope(livePayment, ORG_A, "test"), false);
  assert.equal(inScopeOrNull(livePayment, ORG_A, "test"), null);
});

test("chave de producao nao alcanca cobranca de teste", () => {
  assert.equal(isInScope(testPayment, ORG_A, "live"), false);
});

test("outra organizacao nunca alcanca, nem no mesmo ambiente", () => {
  assert.equal(isInScope(livePayment, ORG_B, "live"), false);
  assert.equal(isInScope(testPayment, ORG_B, "test"), false);
});

test("cliente de outro ambiente e recusado (dados pessoais nao vazam entre test e live)", () => {
  const liveCustomer = { id: "cus_live", organization_id: ORG_A, environment: "live" };
  assert.equal(inScopeOrNull(liveCustomer, ORG_A, "test"), null);
  assert.equal(inScopeOrNull(liveCustomer, ORG_A, "live"), liveCustomer);
});

test("recurso ausente ou sem escopo declarado nunca passa", () => {
  assert.equal(isInScope(null, ORG_A, "test"), false);
  assert.equal(isInScope(undefined, ORG_A, "test"), false);
  assert.equal(isInScope({}, ORG_A, "test"), false);
  assert.equal(isInScope({ organization_id: ORG_A }, ORG_A, "test"), false);
  assert.equal(isInScope({ environment: "test" }, ORG_A, "test"), false);
});

test("chamador sem organizacao ou sem ambiente nunca passa", () => {
  assert.equal(isInScope(testPayment, "", "test"), false);
  assert.equal(isInScope(testPayment, ORG_A, ""), false);
});
