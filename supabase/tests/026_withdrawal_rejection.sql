-- Atomic rejection regression; disposable PostgreSQL only.
BEGIN;
DO $test$
DECLARE
  org_id uuid := '00000000-0000-0000-0000-000000000000';
  user_id uuid := gen_random_uuid();
  withdrawal_id uuid;
  first_result jsonb;
  second_result jsonb;
  release_count integer;
BEGIN
  INSERT INTO public.users(id) VALUES (user_id);
  INSERT INTO public.withdrawal_requests (
    organization_id, environment, amount, fee_amount, net_amount, currency,
    pix_key, pix_key_type, status, requested_by, correlation_id
  ) VALUES (
    org_id, 'test', 3000, 0, 3000, 'BRL', 'ci@example.test', 'email',
    'pending', user_id, 'ci-withdrawal-reject-001'
  ) RETURNING id INTO withdrawal_id;

  first_result := public.fluxpay_reject_withdrawal(withdrawal_id, user_id, 'synthetic rejection');
  second_result := public.fluxpay_reject_withdrawal(withdrawal_id, user_id, 'synthetic rejection');

  IF first_result->>'status' <> 'rejected' OR second_result->>'status' <> 'rejected' THEN
    RAISE EXCEPTION 'withdrawal rejection did not persist';
  END IF;

  SELECT count(*) INTO release_count
    FROM public.balance_transactions
   WHERE organization_id = org_id AND type = 'adjustment'
     AND description = 'Estorno de saque rejeitado (' || left(withdrawal_id::text, 8) || ')';

  IF release_count <> 1 THEN
    RAISE EXCEPTION 'expected one balance release on repeated rejection, found %', release_count;
  END IF;
END
$test$;
ROLLBACK;
