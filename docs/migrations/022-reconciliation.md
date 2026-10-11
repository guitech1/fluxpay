# Migration 022 history reconciliation (do not auto-repair)

Observed on 2026-10-11:
- Supabase migration history reports version `20261011021535`, name `022_saldo_imediato_taxas_auditoria_saques`.
- The branch file is named `supabase/migrations/20261011130000_022_immediate_balance_fees_withdrawals.sql`.
- The timestamps and names do not match. A history row alone does not prove that the file contents applied to the database are identical to the checked-in file.

Safe reconciliation procedure:
1. Do not run `supabase migration repair`, insert/update/delete migration-history rows, rename the historical migration, or re-run 022 against the live database merely to make names match.
2. Export/read the exact historical migration contents from the deployment artifact or reviewed release commit that produced version `20261011021535`. If those contents cannot be recovered, record the applied SQL as unknown; do not infer equivalence from the migration name.
3. Compare the recovered SQL with the checked-in 022 file and inspect the live schema read-only: table/column definitions, constraints, indexes, functions and triggers, RLS enablement/policies, grants, and existing ledger/withdrawal data.
4. If equivalence is proven, retain the historical database version as-is and document the mapping in release notes. Do not rewrite history.
5. If they differ, prepare a new forward-only corrective migration with a new unique timestamp. Make it idempotent where practical, include preflight checks that abort without deleting or rewriting financial rows, and test it on a disposable PostgreSQL/Supabase-compatible database first.
6. Require explicit approval, backup/restore plan, and maintenance/reconciliation plan before any production application. This repository change does not authorize applying SQL to the live project.

No migration-history changes or live DDL are performed by this document.
