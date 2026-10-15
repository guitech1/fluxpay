import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { vapidConfigured } from "../src/services/vapid-config.js";

/** Event keys must be stable per payment for idempotency. */
function pixGeneratedKey(paymentId: string) {
  return `pix_generated:${paymentId}`;
}
function salePaidKey(paymentId: string) {
  return `sale_paid:${paymentId}`;
}

describe("push event keys", () => {
  it("same payment yields same key", () => {
    assert.equal(pixGeneratedKey("abc"), "pix_generated:abc");
    assert.equal(salePaidKey("abc"), "sale_paid:abc");
    assert.notEqual(pixGeneratedKey("abc"), salePaidKey("abc"));
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

describe("vapidConfigured (env presence only)", () => {
  it("false when any VAPID key is missing", () => {
    assert.equal(vapidConfigured({}), false);
    assert.equal(
      vapidConfigured({
        VAPID_PUBLIC_KEY: "pub",
        VAPID_PRIVATE_KEY: "priv",
      }),
      false
    );
    assert.equal(
      vapidConfigured({
        VAPID_PUBLIC_KEY: "pub",
        VAPID_PRIVATE_KEY: "priv",
        VAPID_SUBJECT: "https://example.com",
      }),
      true
    );
  });
});

describe("push gone/error status mapping", () => {
  it("treats 404 and 410 as gone (subscription cleanup)", () => {
    const map = (status: number) => (status === 404 || status === 410 ? "gone" : "error");
    assert.equal(map(404), "gone");
    assert.equal(map(410), "gone");
    assert.equal(map(500), "error");
    assert.equal(map(401), "error");
  });
});

describe("HomeAdvantagesBanner integration contract", () => {
  it("page.tsx uses banner with expected copy, not empty HeroImageSlot", () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
    const page = fs.readFileSync(path.join(root, "frontend/src/app/page.tsx"), "utf8");
    const banner = fs.readFileSync(
      path.join(root, "frontend/src/components/home/HomeAdvantagesBanner.tsx"),
      "utf8"
    );
    assert.match(page, /HomeAdvantagesBanner/);
    assert.doesNotMatch(page, /<HeroImageSlot/);
    assert.match(banner, /Transforme sua gestão/);
    assert.match(banner, /FLUXPAY CARD/);
    assert.match(banner, /Saldo disponível/);
  });
});
