-- FluxPay 023 regression test for PIX RPC and ledger idempotency.
-- Run only against a disposable/dev database after migration 023 is applied.
-- Replace the UUID below with an existing disposable organization in that DB.
BEGIN;
SET LOCAL fluxpay.test_org_id = '00000000-0000-0000-0000-000000000000';

DO $test$
DECLARE
  org_id uuid := current_setting('fluxpay.test_org_id')::uuid;
  pending_id uuid;
  terminal_id uuid;
  charge_count integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = org_id) THEN
    RAISE EXCEPTION 'test organization % does not exist; use a disposable organization', org_id;
  END IF;

  INSERT INTO public.payments (
    organization_id, environment, amount, currency, status, payment_type,
    fee_amount, net_amount, description
  ) VALUES (
    org_id, 'test', 1000, 'BRL', 'pending', 'pix', 0, 1000, 'synthetic test 023'
  ) RETURNING id INTO pending_id;

  -- First confirmation and repeated confirmation are idempotent.
  PERFORM public.fluxpay_confirm_pix_payment(pending_id, org_id, 'test');
  PERFORM public.fluxpay_confirm_pix_payment(pending_id, org_id, 'test');

  SELECT count(*) INTO charge_count
    FROM public.balance_transactions
   WHERE payment_id = pending_id AND type = 'charge';

  IF charge_count <> 1 THEN
    RAISE EXCEPTION 'expected exactly one charge after duplicate confirmation; found %', charge_count;
  END IF;

  -- The partial unique index must reject a second charge for the same payment.
  BEGIN
    INSERT INTO public.balance_transactions (
      organization_id, environment, type, amount, currency, net, fee,
      payment_id, description, available_on
    ) VALUES (
      org_id, 'test', 'charge', 1000, 'BRL', 1000, 0,
      pending_id, 'duplicate charge regression', NOW()
    );
    RAISE EXCEPTION 'expected duplicate charge rejection';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  -- Charge ledger entries without a payment reference must be rejected.
  BEGIN
    INSERT INTO public.balance_transactions (
      organization_id, environment, type, amount, currency, net, fee,
      payment_id, description, available_on
    ) VALUES (
      org_id, 'test', 'charge', 1000, 'BRL', 1000, 0,
      NULL, 'charge without payment regression', NOW()
    );
    RAISE EXCEPTION 'expected NULL payment_id rejection for charge';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  IF (SELECT status::text FROM public.payments WHERE id = pending_id) <> 'succeeded' THEN
    RAISE EXCEPTION 'pending payment was not transitioned to succeeded';
  END IF;

  -- A mismatched organization must be rejected.
  BEGIN
    PERFORM public.fluxpay_confirm_pix_payment(
      pending_id, gen_random_uuid(), 'test'
    );
    RAISE EXCEPTION 'expected organization-scope rejection';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  INSERT INTO public.payments (
    organization_id, environment, amount, currency, status, payment_type,
    fee_amount, net_amount, description
  ) VALUES (
    org_id, 'test', 1000, 'BRL', 'failed', 'pix', 0, 1000, 'synthetic terminal test 023'
  ) RETURNING id INTO terminal_id;

  BEGIN
    PERFORM public.fluxpay_confirm_pix_payment(terminal_id, org_id, 'test');
    RAISE EXCEPTION 'expected terminal-state rejection';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN
    NULL;
  END;

  IF (SELECT status::text FROM public.payments WHERE id = terminal_id) <> 'failed' THEN
    RAISE EXCEPTION 'terminal payment state was modified';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.balance_transactions
    WHERE payment_id = terminal_id AND type = 'charge'
  ) THEN
    RAISE EXCEPTION 'terminal payment unexpectedly received a charge ledger entry';
  END IF;

  -- The PIX-only RPC must not confirm a card payment.
  INSERT INTO public.payments (
    organization_id, environment, amount, currency, status, payment_type,
    fee_amount, net_amount, description
  ) VALUES (
    org_id, 'test', 1000, 'BRL', 'pending', 'card', 0, 1000, 'synthetic non-PIX test 023'
  ) RETURNING id INTO terminal_id;

  BEGIN
    PERFORM public.fluxpay_confirm_pix_payment(terminal_id, org_id, 'test');
    RAISE EXCEPTION 'expected non-PIX rejection';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL;
  END;

  IF (SELECT status::text FROM public.payments WHERE id = terminal_id) <> 'pending' THEN
    RAISE EXCEPTION 'non-PIX payment state was modified by PIX RPC';
  END IF;


  -- Verify browser-role grants match the intended read-only access model.
  IF has_table_privilege('anon', 'public.payments', 'SELECT')
     OR has_table_privilege('anon', 'public.balance_transactions', 'INSERT')
     OR has_table_privilege('authenticated', 'public.payments', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.balance_transactions', 'INSERT') THEN
    RAISE EXCEPTION 'financial table grants are broader than intended';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.payments', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.balance_transactions', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated read access was not granted';
  END IF;

END
$test$;

ROLLBACK;

-- Concurrency test (must run with two independent DB sessions on the same disposable
-- pending PIX fixture, after migration 023):
-- Session A: SELECT public.fluxpay_confirm_pix_payment(:payment_id, :org_id, 'test');
-- Session B: execute the same call concurrently before Session A commits.
-- After both commit, assert count(*) for (payment_id, type='charge') is exactly 1
-- and payment status is succeeded. The partial unique index is the database backstop.
