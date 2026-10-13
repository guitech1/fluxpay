import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { signWebhookPayload } from "../src/utils/crypto.js";
import {
  verifyProviderWebhook,
  paymentProviderMatchesClaim,
  secretsFromEnv,
  KNOWN_PROVIDER_IDS,
} from "../src/services/webhook-provider-auth.js";

const BODY = JSON.stringify({
  event: "payment.confirmed",
  status: "paid",
  txid: "tx_1",
  external_id: "pay_1",
});

describe("verifyProviderWebhook", () => {
  it("rejects missing signature", () => {
    const r = verifyProviderWebhook({
      claimedProvider: "nexuspag",
      signatureHeader: "",
      rawBody: BODY,
      isKavroHeader: false,
      secrets: { nexuspag: "sec_a" },
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "missing_signature");
  });

  it("rejects unknown claimed provider", () => {
    const r = verifyProviderWebhook({
      claimedProvider: "evilpay",
      signatureHeader: "t=1,v1=abc",
      rawBody: BODY,
      isKavroHeader: false,
      secrets: { nexuspag: "sec_a" },
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "unknown_provider");
  });

  it("rejects claimed provider without configured secret", () => {
    const r = verifyProviderWebhook({
      claimedProvider: "profanuspay",
      signatureHeader: "t=1,v1=abc",
      rawBody: BODY,
      isKavroHeader: false,
      secrets: { nexuspag: "sec_a" },
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "secret_not_configured");
  });

  it("accepts valid signature for claimed provider only", () => {
    const secret = "profanus_secret_value";
    const sig = signWebhookPayload(BODY, secret);
    const r = verifyProviderWebhook({
      claimedProvider: "profanuspay",
      signatureHeader: sig,
      rawBody: BODY,
      isKavroHeader: false,
      secrets: {
        nexuspag: "other_secret",
        profanuspay: secret,
      },
    });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.providerId, "profanuspay");
  });

  it("rejects signature of another acquirer when claim is set (no cross-secret)", () => {
    const nexusSecret = "nexus_only";
    const sig = signWebhookPayload(BODY, nexusSecret);
    const r = verifyProviderWebhook({
      claimedProvider: "profanuspay",
      signatureHeader: sig,
      rawBody: BODY,
      isKavroHeader: false,
      secrets: {
        nexuspag: nexusSecret,
        profanuspay: "profanus_only",
      },
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "invalid_signature");
  });

  it("without claim, matches the secret that actually verifies", () => {
    const profSecret = "prof_secret";
    const sig = signWebhookPayload(BODY, profSecret);
    const r = verifyProviderWebhook({
      claimedProvider: null,
      signatureHeader: sig,
      rawBody: BODY,
      isKavroHeader: false,
      secrets: {
        nexuspag: "nexus_secret",
        profanuspay: profSecret,
      },
    });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.providerId, "profanuspay");
  });

  it("without claim and no secrets configured → secret_not_configured", () => {
    const r = verifyProviderWebhook({
      claimedProvider: null,
      signatureHeader: "t=1,v1=deadbeef",
      rawBody: BODY,
      isKavroHeader: false,
      secrets: {},
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "secret_not_configured");
  });
});

describe("paymentProviderMatchesClaim", () => {
  it("allows sandbox and unknown providers", () => {
    assert.equal(paymentProviderMatchesClaim("sandbox", "nexuspag"), true);
    assert.equal(paymentProviderMatchesClaim(null, "nexuspag"), true);
    assert.equal(paymentProviderMatchesClaim("custom_x", "nexuspag"), true);
  });

  it("requires match for known acquirers", () => {
    assert.equal(paymentProviderMatchesClaim("profanuspay", "profanuspay"), true);
    assert.equal(paymentProviderMatchesClaim("profanuspay", "nexuspag"), false);
    assert.equal(paymentProviderMatchesClaim("nexuspag", "profanuspay"), false);
  });
});

describe("secretsFromEnv", () => {
  it("maps env keys", () => {
    const m = secretsFromEnv({
      NEXUSPAG_WEBHOOK_SECRET: "a",
      PROFANUSPAY_WEBHOOK_SECRET: "b",
    } as NodeJS.ProcessEnv);
    assert.equal(m.nexuspag, "a");
    assert.equal(m.profanuspay, "b");
    assert.ok(KNOWN_PROVIDER_IDS.includes("profanuspay"));
  });
});
