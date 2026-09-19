-- FluxPay 014 — confirmação PIX + crédito no ledger em uma única transação
--
-- Webhooks do adquirente podem chegar simultaneamente ou ser repetidos.
-- A implementação anterior fazia UPDATE de payments e INSERT de
-- balance_transactions em duas operações HTTP separadas, permitindo duas
-- execuções concorrentes creditarem o mesmo pagamento.
--
-- Esta RPC trava a linha do pagamento, verifica o estado atual e só cria o
-- lançamento de charge quando a transição ainda não aconteceu. Como tudo
-- roda dentro de uma única função PostgreSQL, UPDATE + INSERT são atômicos.

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

  -- Já confirmado: não muda o pagamento. Se uma versão anterior do código
  -- confirmou a cobrança mas caiu antes do ledger, repara o lançamento aqui.
  IF p.status = 'succeeded' THEN
    IF NOT EXISTS (
      SELECT 1
        FROM public.balance_transactions bt
       WHERE bt.payment_id = p.id
         AND bt.type = 'charge'
    ) THEN
      INSERT INTO public.balance_transactions (
        organization_id, environment, type, amount, currency, net, fee,
        payment_id, description, available_on
      ) VALUES (
        p.organization_id, p.environment, 'charge', p.amount, p.currency,
        COALESCE(p.net_amount, p.amount - p.fee_amount), p.fee_amount, p.id,
        COALESCE(p.description, 'Pagamento PIX'), NOW() + INTERVAL '2 days'
      );
    END IF;
    RETURN p;
  END IF;

  UPDATE public.payments
     SET status = 'succeeded',
         paid_at = COALESCE(paid_at, NOW()),
         captured_at = COALESCE(captured_at, NOW())
   WHERE id = p_payment_id
  RETURNING * INTO p;

  INSERT INTO public.balance_transactions (
    organization_id,
    environment,
    type,
    amount,
    currency,
    net,
    fee,
    payment_id,
    description,
    available_on
  ) VALUES (
    p.organization_id,
    p.environment,
    'charge',
    p.amount,
    p.currency,
    COALESCE(p.net_amount, p.amount - p.fee_amount),
    p.fee_amount,
    p.id,
    COALESCE(p.description, 'Pagamento PIX'),
    NOW() + INTERVAL '2 days'
  );

  RETURN p;
END;
$$;

REVOKE ALL ON FUNCTION public.fluxpay_confirm_pix_payment(UUID, UUID, public.environment_type) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fluxpay_confirm_pix_payment(UUID, UUID, public.environment_type) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fluxpay_confirm_pix_payment(UUID, UUID, public.environment_type) TO service_role;
