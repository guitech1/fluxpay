/**
 * Contratos comportamentais do fluxo de confirmação PIX.
 * Funções puras + invariantes de decisão — sem mock de Supabase.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  decideWebhookAction,
  decideReconcileAction,
} from "../src/services/provider-events.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const pending = { id: "pay_1", status: "pending" };
const succeeded = { id: "pay_1", status: "succeeded" };

test("payment.confirmed + paid + pendente => confirm", () => {
  assert.deepEqual(
    decideWebhookAction({
      eventType: "payment.confirmed",
      status: "paid",
      payment: pending,
      alreadyProcessed: false,
    }),
    { action: "confirm" }
  );
});

test("evento já processado => duplicate (idempotente)", () => {
  assert.deepEqual(
    decideWebhookAction({
      eventType: "payment.confirmed",
      status: "paid",
      payment: pending,
      alreadyProcessed: true,
    }),
    { action: "duplicate" }
  );
});

test("pagamento já succeeded => duplicate (não credita de novo)", () => {
  assert.deepEqual(
    decideWebhookAction({
      eventType: "payment.confirmed",
      status: "paid",
      payment: succeeded,
      alreadyProcessed: false,
    }),
    { action: "duplicate" }
  );
});

test("pagamento local ausente => retry_later (recuperável)", () => {
  const d = decideWebhookAction({
    eventType: "payment.confirmed",
    status: "paid",
    payment: null,
    alreadyProcessed: false,
  });
  assert.equal(d.action, "retry_later");
  assert.ok("reason" in d);
});

test("status pending no evento => ignore", () => {
  assert.equal(
    decideWebhookAction({
      eventType: "payment.confirmed",
      status: "pending",
      payment: pending,
      alreadyProcessed: false,
    }).action,
    "ignore"
  );
});

test("evento desconhecido => ignore", () => {
  assert.equal(
    decideWebhookAction({
      eventType: "something.else",
      status: "paid",
      payment: pending,
      alreadyProcessed: false,
    }).action,
    "ignore"
  );
});

test("reconcile: paid após grace => confirm", () => {
  assert.deepEqual(
    decideReconcileAction({
      ageSeconds: 600,
      graceSeconds: 300,
      providerStatus: "paid",
    }),
    { action: "confirm" }
  );
});

test("reconcile: pending no adquirente => attach", () => {
  assert.deepEqual(
    decideReconcileAction({
      ageSeconds: 600,
      graceSeconds: 300,
      providerStatus: "pending",
    }),
    { action: "attach" }
  );
});

test("reconcile: adquirente unreachable => wait", () => {
  assert.deepEqual(
    decideReconcileAction({
      ageSeconds: 3600,
      graceSeconds: 300,
      providerStatus: "unreachable",
    }),
    { action: "wait" }
  );
});

test("reconcile: dentro da grace => wait", () => {
  assert.deepEqual(
    decideReconcileAction({
      ageSeconds: 10,
      graceSeconds: 300,
      providerStatus: "paid",
    }),
    { action: "wait" }
  );
});

test("reconcile: not_found após grace => fail", () => {
  const d = decideReconcileAction({
    ageSeconds: 600,
    graceSeconds: 300,
    providerStatus: "not_found",
  });
  assert.equal(d.action, "fail");
});

test("markPixPaymentSucceeded lança em falha de RPC (não return silencioso)", () => {
  const src = readFileSync(
    join(root, "backend/src/services/payments-queries.ts"),
    "utf8"
  );
  const idx = src.indexOf("export async function markPixPaymentSucceeded");
  assert.ok(idx >= 0);
  const slice = src.slice(idx, idx + 2000);
  assert.match(slice, /pix_confirmation_failed/);
  assert.match(slice, /throw new Error/);
  assert.ok(
    !/if \(error \|\| !updated\) \{\s*[\s\S]*?console\.error\([\s\S]*?\);\s*return;\s*\}/.test(
      slice
    ),
    "return silencioso após falha da RPC é proibido"
  );
});

test("webhooks: falha de confirm grava processing_error e responde 500 sem processed_at no caminho de erro", () => {
  const src = readFileSync(join(root, "backend/src/routes/webhooks.ts"), "utf8");
  assert.match(src, /confirm_failed:/);
  assert.match(src, /pix_confirmation_failed/);
  const nexusErr = src.indexOf("[webhook/nexuspag] confirmacao PIX falhou");
  assert.ok(nexusErr > 0);
  const catchStart = src.indexOf("catch (confirmErr)", nexusErr);
  const catchEnd = src.indexOf("\n        await markProcessed();", catchStart);
  assert.ok(catchStart > nexusErr, "deve existir catch local para falha de confirmação");
  assert.ok(catchEnd > catchStart, "o caminho de erro deve terminar antes do markProcessed");
  const errorPath = src.slice(catchStart, catchEnd);
  assert.match(errorPath, /status\(500\)/);
  assert.ok(!errorPath.includes("markProcessed()"));
});

test("webhooks: não importa notifyAfterPixConfirmed (evita notify duplicado)", () => {
  const src = readFileSync(join(root, "backend/src/routes/webhooks.ts"), "utf8");
  assert.ok(
    !src.includes('from "../services/payments-queries-notify.js"'),
    "webhook não deve importar notify — markPix já notifica"
  );
  assert.ok(!src.includes("notifyAfterPixConfirmed(payment"));
});

test("reconcile: falha de confirm não marca processed_at", () => {
  const src = readFileSync(
    join(root, "backend/src/services/payments-queries.ts"),
    "utf8"
  );
  const idx = src.indexOf("reconcile_confirm_failed");
  assert.ok(idx > 0);
  const slice = src.slice(idx - 80, idx + 350);
  assert.match(slice, /continue/);
  const beforeContinue = slice.split("continue")[0];
  assert.ok(
    !/processed_at:\s*new Date/.test(beforeContinue),
    "processed_at não deve ser setado no catch de falha"
  );
});

test("webhooks: pagamento ainda não encontrado responde 503 para permitir retry do provedor", () => {
  const src = readFileSync(join(root, "backend/src/routes/webhooks.ts"), "utf8");
  const start = src.indexOf('if (!payment) {');
  const end = src.indexOf('// The authenticated secret must agree', start);
  assert.ok(start >= 0 && end > start, "bloco de pagamento não encontrado deve existir");
  const unmatchedPath = src.slice(start, end);
  assert.match(unmatchedPath, /processing_error:\s*"payment_not_found"/);
  assert.match(unmatchedPath, /status\(503\)/);
  assert.ok(!/processed_at\s*:/.test(unmatchedPath), "evento não encontrado não deve ser marcado como processado");
});
