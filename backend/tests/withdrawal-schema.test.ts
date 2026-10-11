/**
 * Executable contract for withdrawal_requests column normalization.
 *
 * Must not import backend services (they load env at module init).
 * Mirrors mapWithdrawalRow in services/withdrawals.ts — if the service
 * mapping changes, update both places together.
 *
 * Target schema (fixture + RPCs 025/026): fee, net, approved_by, approved_at.
 * Historical migration 015: fee_amount, net_amount, reviewed_by, reviewed_at.
 */
import test from "node:test";
import assert from "node:assert/strict";

function mapWithdrawalRow(row: Record<string, unknown>) {
  return {
    ...row,
    fee: Number(row.fee ?? row.fee_amount ?? 0),
    net: Number(row.net ?? row.net_amount ?? 0),
    approved_by: (row.approved_by ?? row.reviewed_by ?? null) as string | null,
    approved_at: (row.approved_at ?? row.reviewed_at ?? null) as string | null,
    provider_reference: (row.provider_reference ?? row.provider_withdrawal_id ?? null) as
      | string
      | null,
  };
}

test("target schema columns normalize to fee/net/approved_*", () => {
  const mapped = mapWithdrawalRow({
    id: "w1",
    amount: 5000,
    fee: 0,
    net: 5000,
    approved_by: "admin-1",
    approved_at: "2026-10-11T00:00:00Z",
    provider_withdrawal_id: "np-1",
    status: "approved",
  });
  assert.equal(mapped.net, 5000);
  assert.equal(mapped.fee, 0);
  assert.equal(mapped.approved_by, "admin-1");
  assert.equal(mapped.provider_reference, "np-1");
  assert.ok(Number.isFinite(mapped.net) && mapped.net > 0);
});

test("historical 015 columns still yield a valid net for provider submission", () => {
  const mapped = mapWithdrawalRow({
    id: "w2",
    amount: 10000,
    fee_amount: 100,
    net_amount: 9900,
    reviewed_by: "admin-2",
    reviewed_at: "2026-10-10T00:00:00Z",
    provider_withdrawal_id: null,
    status: "pending",
  });
  assert.equal(mapped.net, 9900);
  assert.equal(mapped.fee, 100);
  assert.equal(mapped.approved_by, "admin-2");
  assert.equal(mapped.approved_at, "2026-10-10T00:00:00Z");
  // This is the value that must reach createNexusPagWithdrawal amountCents.
  assert.equal(mapped.net, 9900);
});

test("missing amount columns must not produce NaN net for provider calls", () => {
  const mapped = mapWithdrawalRow({ id: "w3", amount: 1000, status: "pending" });
  assert.equal(mapped.net, 0);
  assert.equal(mapped.fee, 0);
  assert.ok(Number.isFinite(mapped.net));
});
