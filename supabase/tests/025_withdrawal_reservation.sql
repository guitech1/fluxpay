-- Withdrawal reservation/idempotency regression; disposable PostgreSQL only.
BEGIN;
DO $test$
DECLARE
  org_id uuid := '00000000-0000-0000-0000-000000000000';
  user_id uuid := gen_random_uuid();
  first_request jsonb;
  duplicate_request jsonb;
  request_id uuid;
  payout_count integer;
BEGIN
  INSERT INTO public.users(id) VALUES (user_id);

  INSERT INTO public.balance_transactions (
    organization_id, environment, type, amount, currency, net, fee, description, available_on
  ) VALUES (
    org_id, 'test', 'adjustment', 10000, 'BRL', 10000, 0, 'synthetic available funds', NOW()
  );

  first_request := public.fluxpay_create_withdrawal_request(
    org_id, 'test', user_id, 4000, 0, 4000, 'ci@example.test', 'email',
    '00000000-0000-4000-8000-000000000251', 'synthetic test withdrawal'
  );
  duplicate_request := public.fluxpay_create_withdrawal_request(
    org_id, 'test', user_id, 4000, 0, 4000, 'ci@example.test', 'email',
    '00000000-0000-4000-8000-000000000251', 'synthetic test withdrawal'
  );

  IF first_request->>'id' IS DISTINCT FROM duplicate_request->>'id' THEN
    RAISE EXCEPTION 'duplicate correlation id returned a different withdrawal';
  END IF;

  request_id := (first_request->>'id')::uuid;
  SELECT count(*) INTO payout_count FROM public.balance_transactions
   WHERE organization_id = org_id AND type = 'payout'
     AND description = 'synthetic test withdrawal';

  IF payout_count <> 1 THEN
    RAISE EXCEPTION 'expected one payout reservation, found %', payout_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.withdrawal_requests
     WHERE id = request_id AND balance_transaction_id IS NOT NULL AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'withdrawal and balance reservation were not committed together';
  END IF;

  BEGIN
    PERFORM public.fluxpay_create_withdrawal_request(
      org_id, 'test', user_id, 7000, 0, 7000, 'other@example.test', 'email',
      '00000000-0000-4000-8000-000000000252', 'should exceed available funds'
    );
    RAISE EXCEPTION 'expected insufficient balance rejection';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END
$test$;
ROLLBACK;
