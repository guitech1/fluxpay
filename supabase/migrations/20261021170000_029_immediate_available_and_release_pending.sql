-- 029: Garante saldo disponivel imediatamente apos PIX pago.
-- - available_on = NOW() em novas confirmacoes
-- - libera qualquer hold futuro ainda pendente (legado D+2)

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

-- Libera holds legados (D+2 / available_on no futuro) sem apagar historico.
UPDATE public.balance_transactions
   SET available_on = NOW()
 WHERE available_on IS NOT NULL
   AND available_on > NOW();
