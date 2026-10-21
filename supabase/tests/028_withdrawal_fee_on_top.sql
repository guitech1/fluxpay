-- Fee-on-top withdrawal reservation regression (disposable PostgreSQL only).
BEGIN;
DO $test$
DECLARE
  org_id uuid := '00000000-0000-0000-0000-000000000028';
  user_id uuid := gen_random_uuid();
  -- Scenario from production incident: available 23785, request 23400, fee 300.
  available_cents bigint := 23785;
  request_net bigint := 23400;
  fee_cents bigint := 300;
  total_cents bigint := 23700; -- 23400 + 300
  req jsonb;
  bal bigint;
  payout_net bigint;
BEGIN
  INSERT INTO public.users(id) VALUES (user_id)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.balance_transactions (
    organization_id, environment, type, amount, currency, net, fee, description, available_on
  ) VALUES (
    org_id, 'test', 'adjustment', available_cents, 'BRL', available_cents, 0,
    'synthetic available for fee-on-top test', NOW()
  );

  -- 1) Happy path: 234.00 + 3.00 fee against 237.85 available.
  req := public.fluxpay_create_withdrawal_request(
    org_id, 'test', user_id,
    total_cents, fee_cents, request_net,
    'ci-fee@example.test', 'email',
    '00000000-0000-4000-8000-000000000281',
    'fee-on-top happy path'
  );

  IF (req->>'amount')::bigint <> total_cents THEN
    RAISE EXCEPTION 'expected amount=total %, got %', total_cents, req->>'amount';
  END IF;
  IF (req->>'net')::bigint <> request_net THEN
    RAISE EXCEPTION 'expected net=requested %, got %', request_net, req->>'net';
  END IF;
  IF (req->>'fee')::bigint <> fee_cents THEN
    RAISE EXCEPTION 'expected fee=%, got %', fee_cents, req->>'fee';
  END IF;

  SELECT COALESCE(sum(net), 0)::bigint INTO bal
    FROM public.balance_transactions
   WHERE organization_id = org_id AND environment = 'test' AND currency = 'BRL';

  -- Available must drop by the FULL total (fee reserved).
  IF bal <> (available_cents - total_cents) THEN
    RAISE EXCEPTION 'available after reserve expected %, got %', available_cents - total_cents, bal;
  END IF;

  SELECT net INTO payout_net
    FROM public.balance_transactions
   WHERE organization_id = org_id AND type = 'payout'
     AND description = 'fee-on-top happy path'
   LIMIT 1;

  IF payout_net <> -total_cents THEN
    RAISE EXCEPTION 'payout ledger net must be -total; got %', payout_net;
  END IF;

  -- 2) Insufficient: request that exceeds available after fee.
  BEGIN
    PERFORM public.fluxpay_create_withdrawal_request(
      org_id, 'test', user_id,
      23800, 300, 23500,  -- total 238 > remaining ~85
      'other@example.test', 'email',
      '00000000-0000-4000-8000-000000000282',
      'should exceed'
    );
    RAISE EXCEPTION 'expected insufficient balance rejection';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  -- 3) Consistency violation: amount != net + fee.
  BEGIN
    PERFORM public.fluxpay_create_withdrawal_request(
      org_id, 'test', user_id,
      10000, 300, 10000,  -- net==amount, fee>0 → inconsistent
      'bad@example.test', 'email',
      '00000000-0000-4000-8000-000000000283',
      'inconsistent amounts'
    );
    RAISE EXCEPTION 'expected amount/net/fee consistency rejection';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END
$test$;
ROLLBACK;
