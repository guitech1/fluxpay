# Migration history reconciliation (live FluxPay)

Status: **migrations 023–027 applied and verified on live Supabase on 2026-10-11.** Historical gaps in migrations 013–022 remain documented, but they did not require a blind `db push`: the five new migrations were applied individually through the controlled migration action. This document distinguishes observed schema evidence from byte-for-byte provenance of older SQL.

## Production rollout and verification (2026-10-11)

Project: `mrfbmndbazeajgyozhfb` (FluxPay, PostgreSQL 17).

Applied migration history entries:
- `20261011185317 / 023_unique_charge_and_safe_pix_confirmation`
- `20261011185329 / 024_transactional_refund_reservations`
- `20261011185336 / 025_atomic_withdrawal_reservation`
- `20261011185341 / 026_atomic_withdrawal_rejection`
- `20261011185347 / 027_refund_idempotency_keys`

Post-apply read-only verification confirmed:
- The charge CHECK constraint and partial unique index exist.
- The refund ledger uniqueness index exists.
- Refund reservation/finalization, atomic withdrawal creation/rejection, and PIX confirmation functions exist under the intended signatures.
- The old refund reservation signature was removed and the new idempotency-key signature is executable by `service_role`.
- The refund idempotency column and unique index exist.
- Withdrawal RPCs use the live schema column `provider_reference`.
- `anon` no longer has SELECT on `payments`; authenticated clients no longer have INSERT on `payments`; authenticated clients retain scoped SELECT on withdrawal requests; authenticated clients cannot SELECT sensitive fee-rule configuration.
- Preflight before applying 023 found 7 charge ledger rows, no duplicate charge groups, and no charge rows with NULL `payment_id`. The refund ledger preflight found no duplicate refund groups.
- The 025 compatibility block found the live fee/net/approval/rejection columns already present, so no legacy-column backfill was needed. No payment, refund, withdrawal, or ledger operation was executed during deployment.

The migration source was aligned before application: migrations 025/026 and the withdrawal service now use `provider_reference`, which is the column present in the live schema. The disposable CI fixture was also changed to match this live column so future regressions can catch the mismatch.

## Older migration-history gaps (still unresolved)

- Live history records 021 as version `20261007175916`, name `20261007120000_021_platform_evolution`.
- Live history records 022 as version `20261011021535`, name `022_saldo_imediato_taxas_auditoria_saques`.
- Candidate 021 SQL was recovered from branch `feature/platform-evolution` (blob SHA `cdec528f6f535eb851a3ffa99901436ba718dbc1`). Related objects are present live; this is semantic evidence, not proof of the exact deployed artifact.
- Candidate 022 is `supabase/migrations/20261011130000_022_immediate_balance_fees_withdrawals.sql` (blob SHA `04832d85a21808879cb50b0c60dd0e81b3b0c4e3`). The live database has its expected objects and the older PIX function that 023 replaced; this does not prove byte-for-byte identity with the original deployed SQL.
- Local migration timestamps/names differ from live history for 013, 014, 015, 016, and support-system 019. Live history includes `019_kyc_schema_alignment` without a corresponding file on this branch.
- Migration 020 exists locally but is absent from live migration history even though its FluxPay Card tables exist.

## Next steps

1. Keep the older 013–022 provenance gaps documented; recover original artifacts where possible.
2. Do not use blind `supabase db push` until the full historical migration map is reconciled.
3. Finish CI for the current feature branch and review PR #5 before merging/deploying application code. The database migrations being applied does not itself deploy the multi-acquirer backend.

## Prohibited shortcuts

- Do not manually edit `supabase_migrations.schema_migrations` to manufacture a match.
- Do not blindly replay old migrations, rename historical artifacts to disguise provenance, or claim byte-for-byte recovery from schema state alone.
- Do not execute real payment/refund/withdrawal operations as part of validation.
