# Handoff: migrations 023–027

**Status: applied to live Supabase and verified on 2026-10-11.** Do not rerun these migrations manually; they are recorded in the live migration history.

- **Repository:** `guitech1/fluxpay`
- **Branch:** `feature/multi-acquirer-fees`
- **Current reviewed code head at rollout:** `245419c23ee4d00e33fe93cfe4fd73ff00176223`
- **Supabase project:** `mrfbmndbazeajgyozhfb`

## Migration history entries

| Migration | Live version | Name |
|---|---|---|
| 023 | `20261011185317` | `023_unique_charge_and_safe_pix_confirmation` |
| 024 | `20261011185329` | `024_transactional_refund_reservations` |
| 025 | `20261011185336` | `025_atomic_withdrawal_reservation` |
| 026 | `20261011185341` | `026_atomic_withdrawal_rejection` |
| 027 | `20261011185347` | `027_refund_idempotency_keys` |

## What was verified after applying

- Unique charge constraint/index and refund ledger index exist.
- PIX confirmation, refund reserve/finalize, withdrawal reserve/reject RPCs exist with expected signatures.
- New refund idempotency column/index exist; old reserve-refund signature is gone.
- The service-role grants for mutation RPCs exist.
- Migration 025/026 use the live `provider_reference` column; the application write and disposable CI fixture were corrected to the same live schema.
- Permission checks confirmed browser roles cannot write payment tables or read sensitive fee configuration; scoped SELECT access remains for authenticated users on the expected financial views.
- No real payment, refund, or withdrawal operation was run during deployment.

## CI and PR

At the time of this update, CI run #83 is still in progress. Backend and PostgreSQL regression jobs passed; frontend build was still running. Verify the final conclusion before claiming the entire workflow is green:
https://github.com/guitech1/fluxpay/actions/runs/38165627254

PR #5 remains open:
https://github.com/guitech1/fluxpay/pull/5

**Important:** database migrations being live does not mean application code is deployed. Do not merge or deploy the feature branch without explicit release authorization and final CI confirmation.

## Historical migration reconciliation

Older discrepancies in migration history for 013–022 remain. Do not use a blind `supabase db push`, replay historical migrations, or edit `supabase_migrations.schema_migrations` manually to fabricate provenance.
