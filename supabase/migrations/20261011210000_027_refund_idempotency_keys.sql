-- 027: durable client idempotency for refund reservations.
ALTER TABLE public.refunds ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS refunds_org_env_idempotency_key_unique
  ON public.refunds (organization_id, environment, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.fluxpay_reserve_refund(
  p_payment_id uuid,
  p_organization_id uuid,
  p_environment public.environment_type,
  p_amount bigint,
  p_idempotency_key text,
  p_reason text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
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
  IF p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'refund idempotency key is required' USING ERRCODE = '22023';
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

  SELECT * INTO r
    FROM public.refunds
   WHERE organization_id = p_organization_id
     AND environment = p_environment
     AND idempotency_key = btrim(p_idempotency_key);

  IF FOUND THEN
    IF r.payment_id IS DISTINCT FROM p_payment_id OR r.amount IS DISTINCT FROM p_amount THEN
      RAISE EXCEPTION 'idempotency key reused with different refund parameters' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object('refund', to_jsonb(r), 'created', false);
  END IF;

  IF p.status NOT IN ('succeeded', 'partially_refunded') THEN
    RAISE EXCEPTION 'payment is not refundable in state %', p.status USING ERRCODE = '55000';
  END IF;

  -- Any unresolved reservation may represent an external refund already executed.
  -- It blocks a new key until reconciled; same-key replay returned above.
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
    reason, metadata, idempotency_key
  ) VALUES (
    p_organization_id, p.id, p_environment, p_amount, p.currency, 'pending',
    p_reason, COALESCE(p_metadata, '{}'::jsonb), btrim(p_idempotency_key)
  ) RETURNING * INTO r;

  RETURN jsonb_build_object('refund', to_jsonb(r), 'created', true);
END;
$$;

REVOKE ALL ON FUNCTION public.fluxpay_reserve_refund(uuid, uuid, public.environment_type, bigint, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fluxpay_reserve_refund(uuid, uuid, public.environment_type, bigint, text, text, jsonb) TO service_role;

DROP FUNCTION public.fluxpay_reserve_refund(uuid, uuid, public.environment_type, bigint, text, jsonb);
