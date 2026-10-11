-- 024: serialize refund reservations and finalize refund ledger atomically.
-- Forward-only; apply only to a disposable database until reviewed and tested.
CREATE UNIQUE INDEX IF NOT EXISTS balance_transactions_one_refund_per_refund
  ON public.balance_transactions (refund_id)
  WHERE type = 'refund' AND refund_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.fluxpay_reserve_refund(
  p_payment_id uuid,
  p_organization_id uuid,
  p_environment public.environment_type,
  p_amount bigint,
  p_reason text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS public.refunds
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  p public.payments%ROWTYPE;
  r public.refunds%ROWTYPE;
  reserved_amount bigint;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'refund amount must be positive' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO p
    FROM public.payments
   WHERE id = p_payment_id
   FOR UPDATE;

  IF NOT FOUND
     OR p.organization_id IS DISTINCT FROM p_organization_id
     OR p.environment IS DISTINCT FROM p_environment THEN
    RAISE EXCEPTION 'payment not found in requested scope' USING ERRCODE = '42501';
  END IF;

  IF p.status NOT IN ('succeeded', 'partially_refunded') THEN
    RAISE EXCEPTION 'payment is not refundable in state %', p.status USING ERRCODE = '55000';
  END IF;

  -- An unresolved pending refund may represent a provider timeout after execution.
  -- Block every subsequent refund until reconciliation to prevent blind retries.
  IF EXISTS (
    SELECT 1 FROM public.refunds
     WHERE payment_id = p.id
       AND organization_id = p_organization_id
       AND environment = p_environment
       AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'an unresolved refund exists; reconcile it before creating another' USING ERRCODE = '55000';
  END IF;

  SELECT COALESCE(sum(amount), 0)::bigint INTO reserved_amount
    FROM public.refunds
   WHERE payment_id = p.id
     AND organization_id = p_organization_id
     AND environment = p_environment
     AND status = 'succeeded';

  IF p_amount > p.amount - reserved_amount THEN
    RAISE EXCEPTION 'refund exceeds remaining refundable amount' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.refunds (
    organization_id, payment_id, environment, amount, currency, status,
    reason, metadata
  ) VALUES (
    p_organization_id, p.id, p_environment, p_amount, p.currency, 'pending',
    p_reason, COALESCE(p_metadata, '{}'::jsonb)
  ) RETURNING * INTO r;

  RETURN r;
END;
$$;

CREATE OR REPLACE FUNCTION public.fluxpay_finalize_refund(
  p_refund_id uuid,
  p_organization_id uuid,
  p_environment public.environment_type,
  p_status public.refund_status,
  p_provider_refund_id text DEFAULT NULL,
  p_provider_response jsonb DEFAULT NULL
)
RETURNS public.refunds
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r public.refunds%ROWTYPE;
  p public.payments%ROWTYPE;
  total_succeeded bigint;
BEGIN
  SELECT * INTO r
    FROM public.refunds
   WHERE id = p_refund_id
     AND organization_id = p_organization_id
     AND environment = p_environment
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'refund not found in requested scope' USING ERRCODE = '42501';
  END IF;

  IF r.status = 'succeeded' THEN
    RETURN r;
  END IF;

  -- Never downgrade an already-final refund or turn a pending provider result into success.
  IF r.status <> 'pending' THEN
    RAISE EXCEPTION 'refund is already final in state %', r.status USING ERRCODE = '55000';
  END IF;

  IF p_status NOT IN ('pending', 'succeeded', 'failed', 'canceled') THEN
    RAISE EXCEPTION 'invalid refund status' USING ERRCODE = '22023';
  END IF;

  UPDATE public.refunds
     SET status = p_status,
         provider_refund_id = COALESCE(p_provider_refund_id, provider_refund_id),
         provider_response = COALESCE(p_provider_response, provider_response),
         updated_at = NOW()
   WHERE id = r.id
  RETURNING * INTO r;

  IF p_status <> 'succeeded' THEN
    RETURN r;
  END IF;

  SELECT * INTO p
    FROM public.payments
   WHERE id = r.payment_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment for refund not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(sum(amount), 0)::bigint INTO total_succeeded
    FROM public.refunds
   WHERE payment_id = p.id
     AND organization_id = p_organization_id
     AND environment = p_environment
     AND status = 'succeeded';

  UPDATE public.payments
     SET status = CASE
       WHEN total_succeeded >= p.amount THEN 'refunded'::public.payment_status
       ELSE 'partially_refunded'::public.payment_status
     END
   WHERE id = p.id
     AND organization_id = p_organization_id
     AND environment = p_environment;

  INSERT INTO public.balance_transactions (
    organization_id, environment, type, amount, currency, net, fee,
    payment_id, refund_id, description
  ) VALUES (
    p_organization_id, p_environment, 'refund', -r.amount, r.currency,
    -r.amount, 0, r.payment_id, r.id, COALESCE(r.reason, 'Refund')
  )
  ON CONFLICT (refund_id) WHERE type = 'refund' AND refund_id IS NOT NULL DO NOTHING;

  RETURN r;
END;
$$;

REVOKE ALL ON FUNCTION public.fluxpay_reserve_refund(uuid, uuid, public.environment_type, bigint, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fluxpay_finalize_refund(uuid, uuid, public.environment_type, public.refund_status, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fluxpay_reserve_refund(uuid, uuid, public.environment_type, bigint, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fluxpay_finalize_refund(uuid, uuid, public.environment_type, public.refund_status, text, jsonb) TO service_role;

COMMENT ON FUNCTION public.fluxpay_reserve_refund(uuid, uuid, public.environment_type, bigint, text, jsonb) IS
  'Serializes refund limits by locking the payment row; unresolved pending refunds block further provider calls.';
COMMENT ON FUNCTION public.fluxpay_finalize_refund(uuid, uuid, public.environment_type, public.refund_status, text, jsonb) IS
  'Persists provider outcome and updates payment plus refund ledger in one transaction; call succeeded only after provider confirmation.';
