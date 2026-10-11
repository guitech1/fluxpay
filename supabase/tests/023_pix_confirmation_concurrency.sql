-- FluxPay 023 integration regression checklist (run only on disposable/dev DB).
-- This script is intentionally a transaction and rolls back all fixtures.
-- It expects pgTAP to be installed and an existing organization fixture to be supplied.
-- Set test_org_id to a disposable organization UUID before running.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(5);

-- Preflight the fixture organization. Do not run against a production dataset.
DO $$
BEGIN
  IF current_setting('fluxpay.test_org_id', true) IS NULL THEN
    RAISE EXCEPTION 'Set fluxpay.test_org_id to a disposable organization UUID before running';
  END IF;
END $$;

-- Test harness must create a pending test-environment PIX payment using the
-- required columns for the current schema, then call the RPC concurrently from
-- two independent sessions with the same payment/org/environment.
-- Assertions to execute after both sessions complete:
-- 1) exactly one balance_transactions row where type='charge' and payment_id=<fixture>
-- 2) payment status='succeeded'
-- 3) repeated RPC call leaves charge count at one
-- 4) RPC against wrong organization/environment raises insufficient_privilege
-- 5) failed/canceled/expired fixture raises object_not_in_prerequisite_state and remains unchanged.
SELECT * FROM finish();
ROLLBACK;
