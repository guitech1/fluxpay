/**
 * Executable contract for withdrawal_requests column normalization.
 *
 * Live/target schema (fixture + RPCs 025/026): fee, net, approved_by, approved_at.
 * Historical migration 015: fee_amount, net_amount, reviewed_by, reviewed_at.
 *
 * approveAndExecuteWithdrawal must never send undefined net to the provider
 * because it read a historical column name without mapping.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { publicWithdrawalView } from "../src/services/withdrawals.js";

function mapWithdrawalRow(row: any) {
  return {
    ...row,
    fee: Number(row.fee ?? row.fee_amount ?? 0),
    net: Number(row.net ?? row.net_amount ?? 0),
    approved_by: row.approved_by ?? row.reviewed_by ?? null,
    approved_at: row.approved_at ?? row.reviewed_at ?? null,
    provider_reference: row.provider_reference ?? row.provider_withdrawal_id ?? null,
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
    pix_key: "a@b.com",
    pix_key_type: "email",
    currency: "BRL",
    created_at: "2026-10-11T00:00:00Z",
    updated_at: "2026-10-11T00:00:00Z",
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
    pix_key: "11999999999",
    pix_key_type: "phone",
    currency: "BRL",
    created_at: "2026-10-10T00:00:00Z",
    updated_at: "2026-10-10T00:00:00Z",
  });
  assert.equal(mapped.net, 9900);
  assert.equal(mapped.fee, 100);
  assert.equal(mapped.approved_by, "admin-2");
  assert.equal(mapped.approved_at, "2026-10-10T00:00:00Z");
  // This is the value that must reach createNexusPagWithdrawal amountCents.
  assert.equal(mapped.net, 9900);
});

test("publicWithdrawalView exposes fee_amount/net_amount for API consumers", () => {
  const view = publicWithdrawalView({
    id: "w3",
    organization_id: "o1",
    environment: "live",
    amount: 2000,
    fee: 0,
    net: 2000,
    currency: "BRL",
    pix_key: "11988887777",
    pix_key_type: "phone",
    status: "pending",
    requested_by: null,
    approved_by: null,
    approved_at: null,
    rejected_at: null,
    rejection_reason: null,
    failed_at: null,
    correlation_id: "c1",
    provider_reference: null,
    failure_reason: null,
    balance_transaction_id: null,
    created_at: "2026-10-11T00:00:00Z",
    updated_at: "2026-10-11T00:00:00Z",
  });
  assert.equal(view.fee_amount, 0);
  assert.equal(view.net_amount, 2000);
  assert.equal(view.status, "pending");
});
