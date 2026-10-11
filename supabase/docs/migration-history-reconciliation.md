# Migration history reconciliation (live FluxPay)

Status: **schema preflight completed; deployment is still blocked on migration-history reconciliation**. This document records observed state, not byte-for-byte recovery of the original deployed SQL.

## Read-only evidence checked on 2026-10-11

- Live project is active and running PostgreSQL 17.
- Live history records 021 as version `20261007175916`, name `20261007120000_021_platform_evolution`.
- Live history records 022 as version `20261011021535`, name `022_saldo_imediato_taxas_auditoria_saques`.
- A candidate 021 SQL file was recovered from branch `feature/platform-evolution` (blob SHA `cdec528f6f535eb851a3ffa99901436ba718dbc1`). Its profile fields, ranking/vault/risk tables, and related functions are present in the live schema. This establishes semantic evidence, not original-artifact provenance.
- The branch `feature/multi-acquirer-fees` has candidate 022 file `20261011130000_022_immediate_balance_fees_withdrawals.sql` (blob SHA `04832d85a21808879cb50b0c60dd0e81b3b0c4e3`). The live database has its expected tables, payment columns, indexes, RLS flags, acquirer config keys, active fee rule, and the same older PIX confirmation function. This is strong schema evidence, but does not prove the exact SQL originally deployed.
- Local migration timestamps/names also differ from live history for 013, 014, 015, 016, and support-system 019. Live history contains `019_kyc_schema_alignment` with no corresponding migration file on the current feature branch.
- Migration 020 exists in the feature branch but is absent from the live migration-history list, even though its FluxPay Card tables are present in the live schema. Do not assume that means the migration was safely applied or that reapplying it is harmless without reviewing its full effects.
- Live preflight for migration 023: 7 charge ledger rows; zero duplicate charge groups; zero charge rows with NULL `payment_id`.
- Live functions `fluxpay_reserve_refund`, `fluxpay_finalize_refund`, `fluxpay_reject_withdrawal`, and `fluxpay_create_withdrawal_request` are not currently present under those target signatures. The existing PIX confirmation function is the older version that migration 023 is intended to replace.
- No live schema, permissions, migration history, or financial records were changed during these checks.

## Safe next steps

1. Recover the original deployment artifacts for migrations 013–016, 019 KYC, 019 support, 021, and 022 where possible; record source, checksum, and deployment identifier.
2. For any unrecoverable artifact, create an explicitly labelled reconstruction based on verified schema and source history. Do not label it the original SQL or overwrite the evidence.
3. Resolve the 020 migration-history gap after comparing its SQL against the live objects.
4. Rehearse a clean migration chain and the 023–027 regression suite against a schema-compatible disposable database.
5. Only after the migration map is reviewed, apply 023–027 through a controlled production change. Do not use a blind `db push` while old migration versions remain mismatched.

## Prohibited shortcuts

- Do not manually edit `supabase_migrations.schema_migrations` to manufacture a match.
- Do not blindly replay old migrations, rename historical artifacts to disguise provenance, or claim byte-for-byte recovery from schema state alone.
- Do not apply production DDL/grants or run payment/refund/withdrawal operations as part of validation without explicit approval.
