import { describe, it } from "node:test";
import assert from "node:assert/strict";

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
