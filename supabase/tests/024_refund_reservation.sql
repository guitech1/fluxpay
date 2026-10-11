-- Refund reservation/finalization regressions; disposable PostgreSQL only.
BEGIN;
DO $test$
DECLARE
  org_id uuid := '00000000-0000-0000-0000-000000000000';
  payment_id uuid;
  refund_uuid uuid;
  refund_row public.refunds%ROWTYPE;
  ledger_count integer;
BEGIN
  INSERT INTO public.payments (
    organization_id, environment, amount, currency, status, payment_type,
    fee_amount, net_amount, description
  ) VALUES (
    org_id, 'test', 1000, 'BRL', 'succeeded', 'card', 0, 1000, 'synthetic refund 024'
  ) RETURNING id INTO payment_id;

  SELECT * INTO refund_row FROM public.fluxpay_reserve_refund(
    payment_id, org_id, 'test', 600, 'first partial refund', '{}'::jsonb
  );
  refund_uuid := refund_row.id;

  -- A pending reservation is ambiguous/in-flight and blocks a second provider call.
  BEGIN
    PERFORM public.fluxpay_reserve_refund(
      payment_id, org_id, 'test', 400, 'must wait for reconciliation', '{}'::jsonb
    );
    RAISE EXCEPTION 'expected pending reservation to block another refund';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN
    NULL;
  END;

  PERFORM public.fluxpay_finalize_refund(
    refund_uuid, org_id, 'test', 'succeeded', 'provider-refund-024', '{"status":"succeeded"}'::jsonb
  );
  -- Repeated finalization must not create another ledger debit.
  PERFORM public.fluxpay_finalize_refund(
    refund_uuid, org_id, 'test', 'succeeded', 'provider-refund-024', '{"status":"succeeded"}'::jsonb
  );

  SELECT count(*) INTO ledger_count
    FROM public.balance_transactions
   WHERE public.balance_transactions.refund_id = refund_uuid AND type = 'refund';

  IF ledger_count <> 1 THEN
    RAISE EXCEPTION 'expected one refund ledger entry, got %', ledger_count;
  END IF;

  -- Now that the first refund is finalized, the remaining 400 can be reserved.
  SELECT * INTO refund_row FROM public.fluxpay_reserve_refund(
    payment_id, org_id, 'test', 400, 'final partial refund', '{}'::jsonb
  );
  PERFORM public.fluxpay_finalize_refund(
    refund_row.id, org_id, 'test', 'succeeded', 'provider-refund-025', '{"status":"succeeded"}'::jsonb
  );

  IF (SELECT status::text FROM public.payments WHERE id = payment_id) <> 'refunded' THEN
    RAISE EXCEPTION 'payment should be fully refunded after cumulative amount reaches original amount';
  END IF;

  BEGIN
    PERFORM public.fluxpay_reserve_refund(
      payment_id, org_id, 'test', 1, 'over refund', '{}'::jsonb
    );
    RAISE EXCEPTION 'expected over-refund limit to reject';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END
$test$;
ROLLBACK;
