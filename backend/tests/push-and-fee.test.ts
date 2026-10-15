import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { decideWebhookAction } from "../src/services/provider-events.js";
import { vapidConfigured, getVapidPublicKey } from "../src/services/vapid-config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../..");

function pixGeneratedKey(paymentId: string) {
  return `pix_generated:${paymentId}`;
}
function salePaidKey(paymentId: string) {
  return `sale_paid:${paymentId}`;
}

describe("push event keys", () => {
  it("same payment yields same key (idempotency)", () => {
    assert.equal(pixGeneratedKey("abc"), "pix_generated:abc");
    assert.equal(salePaidKey("abc"), "sale_paid:abc");
    assert.notEqual(pixGeneratedKey("abc"), salePaidKey("abc"));
  });
  it("different payments yield different keys", () => {
    assert.notEqual(salePaidKey("pay-1"), salePaidKey("pay-2"));
  });
});

describe("withdrawal fee constants align", () => {
  it("FEE 300 and MIN 1000", async () => {
    const mod = await import("../src/services/withdrawal-fee.js");
    assert.equal(mod.WITHDRAWAL_FEE_CENTS, 300);
    assert.equal(mod.WITHDRAWAL_MIN_CENTS, 1000);
    assert.equal(mod.maxWithdrawableCents(10000), 9700);
    assert.equal(mod.canRequestWithdrawal(1299, 1000), false);
    assert.equal(mod.canRequestWithdrawal(1300, 1000), true);
  });
});

describe("vapid-config pure helpers", () => {
  it("reports missing when env empty", () => {
    assert.equal(vapidConfigured({} as NodeJS.ProcessEnv), false);
    assert.equal(getVapidPublicKey({} as NodeJS.ProcessEnv), null);
  });
  it("reports configured when all three present", () => {
    const env = {
      VAPID_PUBLIC_KEY: "pub",
      VAPID_PRIVATE_KEY: "priv",
      VAPID_SUBJECT: "mailto:ops@example.com",
    } as NodeJS.ProcessEnv;
    assert.equal(vapidConfigured(env), true);
    assert.equal(getVapidPublicKey(env), "pub");
  });
});

describe("webhook decision dedupe", () => {
  it("duplicate when already processed", () => {
    assert.equal(
      decideWebhookAction({
        eventType: "payment.confirmed",
        status: "paid",
        payment: { id: "p1", status: "pending" },
        alreadyProcessed: true,
      }).action,
      "duplicate"
    );
  });
  it("duplicate when payment already succeeded", () => {
    assert.equal(
      decideWebhookAction({
        eventType: "payment.confirmed",
        status: "paid",
        payment: { id: "p1", status: "succeeded" },
        alreadyProcessed: false,
      }).action,
      "duplicate"
    );
  });
  it("confirm only when pending and paid event", () => {
    assert.equal(
      decideWebhookAction({
        eventType: "payment.confirmed",
        status: "paid",
        payment: { id: "p1", status: "pending" },
        alreadyProcessed: false,
      }).action,
      "confirm"
    );
  });
});

describe("markPixPaymentSucceeded wires automatic push", () => {
  it("source contains notifyAfterPixConfirmed after successful RPC", () => {
    const src = readFileSync(join(root, "backend/src/services/payments-queries.ts"), "utf8");
    assert.ok(!src.includes("SEE_LOCAL"));
    const idx = src.indexOf("export async function markPixPaymentSucceeded");
    assert.ok(idx >= 0);
    const slice = src.slice(idx, idx + 1000);
    assert.match(slice, /notifyAfterPixConfirmed/);
    assert.match(slice, /payments-queries-notify/);
  });
});

describe("push-hooks isolate sale_paid", () => {
  it("hooks use stable event keys and org scope", () => {
    const src = readFileSync(join(root, "backend/src/services/push-hooks.ts"), "utf8");
    assert.match(src, /sale_paid:\$\{params\.paymentId\}/);
    assert.match(src, /pix_generated:\$\{params\.paymentId\}/);
    assert.match(src, /notifyOrganizationMembers/);
  });
});

describe("push service multi-device and failure handling", () => {
  it("upserts on endpoint; gone removes subscription; test fails on zero delivery", () => {
    const src = readFileSync(join(root, "backend/src/services/push.ts"), "utf8");
    assert.match(src, /onConflict:\s*"endpoint"/);
    assert.match(src, /status === 404 \|\| status === 410/);
    assert.match(src, /push_delivery_failed/);
    assert.match(src, /urgency:\s*"high"/);
  });
  it("notifyOrganizationMembers filters by org roles", () => {
    const src = readFileSync(join(root, "backend/src/services/push.ts"), "utf8");
    assert.match(src, /organization_members/);
    assert.match(src, /owner.*admin.*developer.*viewer/s);
  });
});

describe("service worker push contract", () => {
  it("handles push and notificationclick; never caches API", () => {
    const sw = readFileSync(join(root, "frontend/public/sw.js"), "utf8");
    assert.match(sw, /addEventListener\(\s*"push"/);
    assert.match(sw, /notificationclick/);
    assert.match(sw, /showNotification/);
    assert.match(sw, /NEVER_CACHE/);
    assert.match(sw, /\/v1\//);
    assert.match(sw, /renotify/);
    assert.match(sw, /fluxpay-v4/);
  });
});

describe("webhook routes authenticate provider callbacks", () => {
  it("nexuspag and provider routes verify signatures and notify", () => {
    const src = readFileSync(join(root, "backend/src/routes/webhooks.ts"), "utf8");
    assert.match(src, /router\.post\(\s*"\/nexuspag"/);
    assert.match(src, /router\.post\(\s*"\/provider"/);
    assert.match(src, /verifyProviderWebhook|verifyWebhookSignature/);
    assert.match(src, /notifyAfterPixConfirmed/);
  });
});
