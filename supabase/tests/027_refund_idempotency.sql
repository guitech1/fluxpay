-- Durable refund idempotency-key regressions; disposable PostgreSQL only.
BEGIN;
DO $test$
DECLARE
  org_id uuid := '00000000-0000-0000-0000-000000000000';
  payment_id uuid;
  first_result jsonb;
  replay_result jsonb;
  finalized_replay jsonb;
  refund_id uuid;
BEGIN
  INSERT INTO public.payments (
    organization_id, environment, amount, currency, status, payment_type,
    fee_amount, net_amount, description
  ) VALUES (
    org_id, 'test', 1000, 'BRL', 'succeeded', 'card', 0, 1000, 'synthetic idempotency 027'
  ) RETURNING id INTO payment_id;

  first_result := public.fluxpay_reserve_refund(
    payment_id, org_id, 'test', 1000, 'refund-idempotency-027', 'full refund', '{}'::jsonb
  );
  replay_result := public.fluxpay_reserve_refund(
    payment_id, org_id, 'test', 1000, 'refund-idempotency-027', 'full refund retry', '{}'::jsonb
  );

  IF first_result->>'created' <> 'true' OR replay_result->>'created' <> 'false' THEN
    RAISE EXCEPTION 'expected first request to reserve and duplicate key to replay existing row';
  END IF;

  refund_id := (first_result->'refund'->>'id')::uuid;
  IF first_result->'refund'->>'id' IS DISTINCT FROM replay_result->'refund'->>'id' THEN
    RAISE EXCEPTION 'same idempotency key created a different refund';
  END IF;

  BEGIN
    PERFORM public.fluxpay_reserve_refund(
      payment_id, org_id, 'test', 999, 'refund-idempotency-027', 'changed amount', '{}'::jsonb
    );
    RAISE EXCEPTION 'expected idempotency key reuse with changed parameters to fail';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  PERFORM public.fluxpay_finalize_refund(
    refund_id, org_id, 'test', 'succeeded', 'provider-refund-027', '{"status":"succeeded"}'::jsonb
  );
  finalized_replay := public.fluxpay_reserve_refund(
    payment_id, org_id, 'test', 1000, 'refund-idempotency-027', 'full refund retry', '{}'::jsonb
  );

  IF finalized_replay->>'created' <> 'false'
     OR finalized_replay->'refund'->>'status' <> 'succeeded' THEN
    RAISE EXCEPTION 'replay after provider-confirmed success did not return the durable result';
  END IF;
END
$test$;
ROLLBACK;
