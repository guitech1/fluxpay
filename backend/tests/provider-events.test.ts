/**
 * Webhook de entrada da NexusPag e reconciliacao automatica.
 *
 * Cobre os cenarios pedidos: webhook chegando ANTES do pagamento local e
 * webhook duplicado. O nucleo de decisao e puro (services/provider-events.ts)
 * justamente para que todas as ordens de chegada possam ser testadas sem
 * banco e sem rede.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { decideWebhookAction, decideReconcileAction } from "../src/services/provider-events.js";

const pendingPayment = { id: "pay_1", status: "pending" };
const paidPayment = { id: "pay_1", status: "succeeded" };

test("payment.confirmed + paid + pagamento pendente -> confirma", () => {
  const d = decideWebhookAction({
    eventType: "payment.confirmed",
    status: "paid",
    payment: pendingPayment,
    alreadyProcessed: false,
  });
  assert.deepEqual(d, { action: "confirm" });
});

test("webhook ANTES do pagamento local -> fica pendente, nunca perdido", () => {
  const d = decideWebhookAction({
    eventType: "payment.confirmed",
    status: "paid",
    payment: null,
    alreadyProcessed: false,
  });
  // "retry_later" significa: grava sem processed_at e deixa a reconciliacao
  // automatica tentar de novo. NAO marca como processado (era isso que
  // exigia reprocessamento manual no ADM) e NAO descarta o evento.
  assert.equal(d.action, "retry_later");
});

test("reentrega do MESMO evento ja aplicado -> duplicado, ledger intacto", () => {
  const d = decideWebhookAction({
    eventType: "payment.confirmed",
    status: "paid",
    payment: paidPayment,
    alreadyProcessed: true,
  });
  assert.deepEqual(d, { action: "duplicate" });
});

test("evento novo sobre pagamento ja confirmado -> duplicado (nao credita de novo)", () => {
  const d = decideWebhookAction({
    eventType: "payment.confirmed",
    status: "paid",
    payment: paidPayment,
    alreadyProcessed: false,
  });
  assert.deepEqual(d, { action: "duplicate" });
});

test("reentrega de evento que ficou pendente -> confirma na segunda chance", () => {
  // Primeira entrega chegou antes do pagamento existir (retry_later).
  // A NexusPag reentrega; agora o pagamento existe e alreadyProcessed e false
  // porque a primeira nunca foi aplicada.
  const d = decideWebhookAction({
    eventType: "payment.confirmed",
    status: "paid",
    payment: pendingPayment,
    alreadyProcessed: false,
  });
  assert.deepEqual(d, { action: "confirm" });
});

test("evento fora do unico caso previsto e ignorado", () => {
  assert.equal(
    decideWebhookAction({
      eventType: "payment.confirmed",
      status: "pending",
      payment: pendingPayment,
      alreadyProcessed: false,
    }).action,
    "ignore"
  );
  assert.equal(
    decideWebhookAction({
      eventType: "kyc.verified",
      status: "paid",
      payment: pendingPayment,
      alreadyProcessed: false,
    }).action,
    "ignore"
  );
});

test("duplicado vence qualquer outra condicao", () => {
  const d = decideWebhookAction({
    eventType: "qualquer.coisa",
    status: "seja la o que for",
    payment: null,
    alreadyProcessed: true,
  });
  assert.deepEqual(d, { action: "duplicate" });
});

// ---------------- reconciliacao de cobranca orfa ----------------

const GRACE = 300;

test("cobranca recem-criada: espera, nao conclui nada", () => {
  assert.deepEqual(
    decideReconcileAction({ ageSeconds: 10, graceSeconds: GRACE, providerStatus: "not_found" }),
    { action: "wait" }
  );
});

test("adquirente fora do ar nunca encerra cobranca de ninguem", () => {
  assert.deepEqual(
    decideReconcileAction({ ageSeconds: 3600, graceSeconds: GRACE, providerStatus: "unreachable" }),
    { action: "wait" }
  );
});

test("cobranca orfa que ja foi paga no adquirente -> confirma sozinha", () => {
  assert.deepEqual(
    decideReconcileAction({ ageSeconds: 3600, graceSeconds: GRACE, providerStatus: "paid" }),
    { action: "confirm" }
  );
});

test("cobranca orfa ainda pendente -> completa txid/QR e continua esperando", () => {
  assert.deepEqual(
    decideReconcileAction({ ageSeconds: 3600, graceSeconds: GRACE, providerStatus: "pending" }),
    { action: "attach" }
  );
});

test("cobranca que nunca existiu no adquirente -> encerra local", () => {
  const d = decideReconcileAction({
    ageSeconds: 3600,
    graceSeconds: GRACE,
    providerStatus: "not_found",
  });
  assert.equal(d.action, "fail");
});
