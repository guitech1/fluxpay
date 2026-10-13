import { describe, it } from "node:test";
import assert from "node:assert/strict";

const MIN_CENTS = 1000;
const FEE_CENTS = 300;

function maxWithdrawable(availableCents: number): number {
  return Math.max(0, availableCents - FEE_CENTS);
}

function canWithdraw(availableCents: number, amountCents: number): boolean {
  if (amountCents < MIN_CENTS) return false;
  if (amountCents + FEE_CENTS > availableCents) return false;
  return true;
}

describe("saque MAX e taxa", () => {
  it("R$ 100,00 → MAX R$ 97,00", () => {
    assert.equal(maxWithdrawable(10000), 9700);
  });
  it("R$ 50,00 → MAX R$ 47,00", () => {
    assert.equal(maxWithdrawable(5000), 4700);
  });
  it("saldo 13,00 cobre min+taxa", () => {
    assert.equal(canWithdraw(1300, 1000), true);
    assert.equal(maxWithdrawable(1300), 1000);
  });
  it("saldo 12,99 nao cobre min+taxa para 10", () => {
    assert.equal(canWithdraw(1299, 1000), false);
  });
  it("MAX abaixo do minimo quando saldo < 13", () => {
    assert.equal(maxWithdrawable(1200), 900);
    assert.equal(canWithdraw(1200, 900), false);
  });
});
