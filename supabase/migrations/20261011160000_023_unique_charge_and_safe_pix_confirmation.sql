-- FluxPay 023: unique charge ledger entry and safe PIX state transitions.
-- Non-destructive: aborts before DDL if historical duplicate charge rows exist.
-- Controlled production apply requires explicit approval and successful read-only preflight.

DO $$
DECLARE
  duplicate_summary text;
BEGIN
  SELECT string_agg(format('%s (%s rows)', payment_id, row_count), ', ')
    INTO duplicate_summary
  FROM (
    SELECT payment_id, count(*) AS row_count
    FROM public.balance_transactions
    WHERE type = 'charge' AND payment_id IS NOT NULL
    GROUP BY payment_id
    HAVING count(*) > 1
    ORDER BY payment_id
    LIMIT 20
  ) duplicates;

  IF duplicate_summary IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot add unique charge index: duplicate charge ledger rows exist: %; reconcile manually without deleting financial records',
      duplicate_summary
      USING ERRCODE = '23505';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.balance_transactions
    WHERE type = 'charge' AND payment_id IS NULL
  ) THEN
    RAISE EXCEPTION
      'Cannot safely enforce one charge per payment: charge rows with NULL payment_id exist; reconcile manually without deleting financial records'
      USING ERRCODE = '23502';
  END IF;
END $$;

DO $constraint$
DECLARE
  existing_definition text;
  expected_definition constant text :=
    'CHECK (((type <> ''charge''::text) OR (payment_id IS NOT NULL)))';
BEGIN
  SELECT pg_get_constraintdef(c.oid)
    INTO existing_definition
    FROM pg_constraint c
   WHERE c.conrelid = 'public.balance_transactions'::regclass
     AND c.conname = 'balance_transactions_charge_requires_payment';

  IF existing_definition IS NULL THEN
    ALTER TABLE public.balance_transactions
      ADD CONSTRAINT balance_transactions_charge_requires_payment
      CHECK (type <> 'charge' OR payment_id IS NOT NULL) NOT VALID;
  ELSIF regexp_replace(existing_definition, '\s+', '', 'g')
        <> regexp_replace(expected_definition, '\s+', '', 'g') THEN
    RAISE EXCEPTION
      'Constraint balance_transactions_charge_requires_payment exists with unexpected definition: %',
      existing_definition
      USING ERRCODE = '23514';
  END IF;
END
$constraint$;

ALTER TABLE public.balance_transactions
  VALIDATE CONSTRAINT balance_transactions_charge_requires_payment;

CREATE UNIQUE INDEX IF NOT EXISTS balance_transactions_one_charge_per_payment
  ON public.balance_transactions (payment_id)
  WHERE type = 'charge';

CREATE OR REPLACE FUNCTION public.fluxpay_confirm_pix_payment(
  p_payment_id UUID,
  p_organization_id UUID,
  p_environment public.environment_type
)
RETURNS public.payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  p public.payments%ROWTYPE;
BEGIN
  SELECT *
    INTO p
    FROM public.payments
   WHERE id = p_payment_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment % not found', p_payment_id
      USING ERRCODE = 'P0002';
  END IF;

  IF p.organization_id IS DISTINCT FROM p_organization_id
     OR p.environment IS DISTINCT FROM p_environment THEN
    RAISE EXCEPTION 'payment % is outside the requested organization/environment scope', p_payment_id
      USING ERRCODE = '42501';
  END IF;

  IF p.payment_type IS DISTINCT FROM 'pix' THEN
    RAISE EXCEPTION 'payment % is not a PIX payment', p.id
      USING ERRCODE = '22023';
  END IF;

  -- Idempotent retry: repair a missing ledger entry only for an already-successful payment.
  IF p.status = 'succeeded' THEN
    INSERT INTO public.balance_transactions (
      organization_id, environment, type, amount, currency, net, fee,
      payment_id, description, available_on
    )
    SELECT
      p.organization_id, p.environment, 'charge', p.amount, p.currency,
      COALESCE(p.net_amount, p.amount - p.fee_amount), p.fee_amount, p.id,
      COALESCE(p.description, 'Pagamento PIX'), NOW()
    WHERE NOT EXISTS (
      SELECT 1 FROM public.balance_transactions bt
      WHERE bt.payment_id = p.id AND bt.type = 'charge'
    )
    ON CONFLICT (payment_id) WHERE type = 'charge' DO NOTHING;

    RETURN p;
  END IF;

  -- Never allow a late provider event to revive a terminal unsuccessful payment.
  IF p.status IN ('failed', 'canceled', 'expired') THEN
    RAISE EXCEPTION 'payment % is terminal in state %; explicit reconciliation is required',
      p.id, p.status
      USING ERRCODE = '55000';
  END IF;

  IF p.status NOT IN ('pending', 'processing') THEN
    RAISE EXCEPTION 'payment % cannot transition from state % to succeeded',
      p.id, p.status
      USING ERRCODE = '55000';
  END IF;

  UPDATE public.payments
     SET status = 'succeeded',
         paid_at = COALESCE(paid_at, NOW()),
         captured_at = COALESCE(captured_at, NOW())
   WHERE id = p_payment_id
  RETURNING * INTO p;

  INSERT INTO public.balance_transactions (
    organization_id, environment, type, amount, currency, net, fee,
    payment_id, description, available_on
  ) VALUES (
    p.organization_id, p.environment, 'charge', p.amount, p.currency,
    COALESCE(p.net_amount, p.amount - p.fee_amount), p.fee_amount, p.id,
    COALESCE(p.description, 'Pagamento PIX'), NOW()
  )
  ON CONFLICT (payment_id) WHERE type = 'charge' DO NOTHING;

  RETURN p;
END;
$$;

REVOKE ALL ON FUNCTION public.fluxpay_confirm_pix_payment(UUID, UUID, public.environment_type) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fluxpay_confirm_pix_payment(UUID, UUID, public.environment_type) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fluxpay_confirm_pix_payment(UUID, UUID, public.environment_type) TO service_role;

COMMENT ON INDEX public.balance_transactions_one_charge_per_payment IS
  'At most one charge ledger entry per payment; refund, fee, payout, adjustment and chargeback rows remain unaffected.';

-- Least privilege: browser roles may read scoped financial rows, but all writes
-- and provider-event ingestion/replay remain backend-only (service_role).
REVOKE ALL ON TABLE
  public.payments,
  public.balance_transactions,
  public.provider_events,
  public.refunds,
  public.webhook_events,
  public.withdrawal_requests
FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE
  public.payments,
  public.balance_transactions,
  public.provider_events,
  public.refunds,
  public.webhook_events,
  public.withdrawal_requests
TO authenticated;

-- Sensitive configuration/audit tables have no browser-facing RLS policies;
-- explicitly remove inherited/default table privileges as defense in depth.
REVOKE ALL ON TABLE
  public.platform_fee_rules,
  public.organization_fee_rules,
  public.acquirer_cost_config,
  public.fee_rule_audit,
  public.withdrawal_decision_audit
FROM PUBLIC, anon, authenticated;

