# Handoff: migrations 023–027 (branch-pinned)

**Do not use `main`.** These files exist only on:

- **Repository:** `guitech1/fluxpay`
- **Branch:** `feature/multi-acquirer-fees`
- **Commit (CI #66 green):** `0fc1818b09a613c8a392967ae127ef86823c6495`

## 1. Exact paths (at that SHA)

| # | Path |
|---|------|
| 023 | `supabase/migrations/20261011160000_023_unique_charge_and_safe_pix_confirmation.sql` |
| 024 | `supabase/migrations/20261011180000_024_transactional_refund_reservations.sql` |
| 025 | `supabase/migrations/20261011190000_025_atomic_withdrawal_reservation.sql` |
| 026 | `supabase/migrations/20261011200000_026_atomic_withdrawal_rejection.sql` |
| 027 | `supabase/migrations/20261011210000_027_refund_idempotency_keys.sql` |

Supporting artifacts:

- Fixture: `supabase/tests/fixtures/ci_finance_schema.sql`
- Tests: `supabase/tests/023_*.sql` … `028_rls_grants.sql`, `supabase/tests/ci_concurrency.sh`
- Workflow: `.github/workflows/ci.yml` (job `postgres-regression`)

## 2. Raw file URLs (no branch checkout required)

Replace is already pinned to the SHA:

```
https://raw.githubusercontent.com/guitech1/fluxpay/0fc1818b09a613c8a392967ae127ef86823c6495/supabase/migrations/20261011160000_023_unique_charge_and_safe_pix_confirmation.sql
https://raw.githubusercontent.com/guitech1/fluxpay/0fc1818b09a613c8a392967ae127ef86823c6495/supabase/migrations/20261011180000_024_transactional_refund_reservations.sql
https://raw.githubusercontent.com/guitech1/fluxpay/0fc1818b09a613c8a392967ae127ef86823c6495/supabase/migrations/20261011190000_025_atomic_withdrawal_reservation.sql
https://raw.githubusercontent.com/guitech1/fluxpay/0fc1818b09a613c8a392967ae127ef86823c6495/supabase/migrations/20261011200000_026_atomic_withdrawal_rejection.sql
https://raw.githubusercontent.com/guitech1/fluxpay/0fc1818b09a613c8a392967ae127ef86823c6495/supabase/migrations/20261011210000_027_refund_idempotency_keys.sql
```

Browse tree at SHA:

```
https://github.com/guitech1/fluxpay/tree/0fc1818b09a613c8a392967ae127ef86823c6495/supabase/migrations
```

Git fetch (read-only):

```bash
git clone --branch feature/multi-acquirer-fees --single-branch https://github.com/guitech1/fluxpay.git
cd fluxpay && git checkout 0fc1818b09a613c8a392967ae127ef86823c6495
```

## 3. What CI #66 already proved (disposable Postgres 17)

Run: https://github.com/guitech1/fluxpay/actions/runs/38160192572  
Job `postgres-regression`: **success** on SHA `0fc1818b`.

Order applied:

1. `ci_finance_schema.sql` (minimal live-shaped schema)
2. Migrations **023 → 027** in filename order
3. SQL tests 023–028 + `ci_concurrency.sh`

**Covered:** unique charge index; PIX RPC idempotency + terminal/non-PIX rejection; refund reserve/finalize + concurrent fail-closed; withdrawal create/reject RPCs; refund idempotency keys; RLS enabled; `anon` no table privileges on financial tables; `authenticated` SELECT only (no INSERT/UPDATE/DELETE); sensitive RPCs EXECUTE only for `service_role`.

**Not covered:** full live Supabase schema dump; real production data; applying migrations to project `mrfbmndbazeajgyozhfb`; Auth leaked-password setting; historical 021/022 provenance.

## 4. Instruction for Supabase review agent

1. Open the raw URLs above (or clone at the pinned SHA).
2. Review SQL only from those files — ignore `main`.
3. Do **not** apply to production. Rehearse only on a disposable DB or local Postgres.
4. Privileges/grants to re-check after any future live apply: same assertions as `supabase/tests/028_rls_grants.sql`.
