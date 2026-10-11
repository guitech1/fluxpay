-- Regression: migration 023's named CHECK must have the expected definition
-- and reject charge rows without payment_id. Disposable PostgreSQL only.
BEGIN;
SET LOCAL fluxpay.test_org_id = '00000000-0000-0000-0000-000000000000';

DO $test$
DECLARE
  org_id uuid := current_setting('fluxpay.test_org_id')::uuid;
  constraint_definition text;
BEGIN
  SELECT pg_get_constraintdef(c.oid)
    INTO constraint_definition
    FROM pg_constraint c
   WHERE c.conrelid = 'public.balance_transactions'::regclass
     AND c.conname = 'balance_transactions_charge_requires_payment';

  IF constraint_definition IS NULL THEN
    RAISE EXCEPTION 'expected balance_transactions_charge_requires_payment constraint';
  END IF;

  IF regexp_replace(lower(constraint_definition), '\s+', '', 'g')
     <> regexp_replace(
          'check(((type <> ''charge''::text) OR (payment_id IS NOT NULL)))',
          '\s+', '', 'g'
        ) THEN
    RAISE EXCEPTION 'unexpected CHECK definition: %', constraint_definition;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = org_id) THEN
    RAISE EXCEPTION 'test organization % does not exist; use disposable fixture', org_id;
  END IF;

  BEGIN
    INSERT INTO public.balance_transactions (
      organization_id, environment, type, amount, currency, net, fee,
      payment_id, description, available_on
    ) VALUES (
      org_id, 'test', 'charge', 1000, 'BRL', 1000, 0,
      NULL, '023b CHECK regression', NOW()
    );
    RAISE EXCEPTION 'expected CHECK rejection for charge with NULL payment_id';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END
$test$;

ROLLBACK;

SELECT 'PASS: 023 CHECK definition is correct and rejects charge without payment_id.' AS result;
