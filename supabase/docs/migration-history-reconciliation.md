# Migration history reconciliation (021/022)

Status: **external artifact recovery is still blocked**. This document records evidence; it does not assert that the repository SQL is byte-for-byte the SQL originally applied to the live project.

## Evidence observed

- The live `supabase_migrations.schema_migrations` history records 021 as version `20261007175916`, name `20261007120000_021_platform_evolution`.
- It records 022 as version `20261011021535`, name `022_saldo_imediato_taxas_auditoria_saques`.
- The repository contains `supabase/migrations/20261011130000_022_immediate_balance_fees_withdrawals.sql`; its filename timestamp differs from the live version.
- The corresponding 021 SQL file is not present at the expected repository path in branch `feature/multi-acquirer-fees`.
- Live schema inspection confirms some resulting objects, but a schema snapshot cannot establish the exact historical SQL bytes or checksum.

## Required recovery procedure

1. Retrieve the original deployment commit, release bundle, CI artifact, or operator-held migration file for 021 and 022 from the system that deployed them.
2. Preserve the recovered files read-only and record their source, retrieval date, SHA-256 checksum, and associated deployment/run identifier.
3. Compare recovered SQL and checksums with repository artifacts. Do not infer equality from filenames or the resulting schema alone.
4. If the recovered 022 SQL is equivalent, document the mapping between the recorded live version and repository filename without rewriting migration history.
5. If the SQL differs, keep both historical artifacts immutable and create a new, uniquely versioned forward-only corrective migration after disposable-database rehearsal.

## Prohibited shortcuts

- Do not edit `supabase_migrations.schema_migrations`, use migration repair to manufacture a match, rename/replay an already-applied migration, or overwrite a historical file to simulate recovered provenance.
- Do not claim exact historical recovery until the original artifact is independently obtained and hashed.

## Current blocker

The repository/API evidence available during this change did not expose the original deployment artifacts for 021/022. Recovery therefore remains an external operational task; no live database was modified.
