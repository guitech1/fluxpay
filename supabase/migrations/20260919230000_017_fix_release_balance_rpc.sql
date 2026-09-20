-- FluxPay follow-up: corrigir a RPC de liberação sem alterar a migration 016.
-- Escopo: somente remover o RETURNING sem destino da função PL/pgSQL.
-- Não altera T+2, confirmação PIX, RLS, status de pagamentos ou valores.

CREATE OR REPLACE FUNCTION public.fluxpay_release_payment_balance(
  p_payment_id UUID,
  p_organization_id UUID,
  p_environment public.environment_type
)
RETURNS TABLE(released_count INTEGER, released_net BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  payment_row public.payments%ROWTYPE;
  changed_count INTEGER;
  changed_net BIGINT;
BEGIN
  SELECT *
    INTO payment_row
    FROM public.payments
   WHERE id = p_payment_id
     AND organization_id = p_organization_id
     AND environment = p_environment
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment not found in requested organization/environment'
      USING ERRCODE = 'P0002';
  END IF;

  IF payment_row.status <> 'succeeded' THEN
    RAISE EXCEPTION 'only succeeded payments can have their balance released'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.balance_transactions
     SET available_on = NOW()
   WHERE payment_id = payment_row.id
     AND organization_id = p_organization_id
     AND environment = p_environment
     AND available_on > NOW();

  GET DIAGNOSTICS changed_count = ROW_COUNT;

  SELECT COALESCE(SUM(net), 0)
    INTO changed_net
    FROM public.balance_transactions
   WHERE payment_id = payment_row.id
     AND organization_id = p_organization_id
     AND environment = p_environment
     AND available_on <= NOW();

  RETURN QUERY SELECT changed_count, changed_net;
END;
$$;

REVOKE ALL ON FUNCTION public.fluxpay_release_payment_balance(UUID, UUID, public.environment_type)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fluxpay_release_payment_balance(UUID, UUID, public.environment_type)
  TO service_role;

COMMENT ON FUNCTION public.fluxpay_release_payment_balance(UUID, UUID, public.environment_type) IS
  'Libera antecipadamente lançamentos de saldo vinculados a um pagamento confirmado, sem alterar status ou valores financeiros.';
