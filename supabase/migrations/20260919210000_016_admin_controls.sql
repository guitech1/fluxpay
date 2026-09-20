-- FluxPay 016 — controles administrativos de usuario e liberacao antecipada de saldo
--
-- 1) usuarios ganham estado administrativo persistente. A alteracao do estado
--    fica protegida por trigger: clientes authenticated continuam podendo editar
--    apenas os campos de perfil ja previstos; somente o backend/service_role
--    pode suspender, banir, desativar ou reativar.
-- 2) a liberacao antecipada do saldo usa uma RPC atomica e escopada por
--    organization_id + environment. Ela NAO muda o status do pagamento nem
--    altera valores do ledger: apenas antecipa available_on de lancamentos
--    vinculados ao pagamento, removendo a espera T+2 quando um administrador
--    autorizado decidir libera-la.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS status_reason TEXT,
  ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS status_changed_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_status_check;
ALTER TABLE public.users
  ADD CONSTRAINT users_status_check
  CHECK (status IN ('active', 'suspended', 'banned', 'disabled'));

COMMENT ON COLUMN public.users.status IS
  'Estado administrativo do usuario. active opera normalmente; suspended/banned/disabled bloqueiam operacoes autenticadas.';

CREATE INDEX IF NOT EXISTS idx_users_status ON public.users(status);

CREATE OR REPLACE FUNCTION public.fluxpay_protect_user_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND COALESCE(current_setting('request.jwt.claim.role', true), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Somente o backend administrativo pode alterar o status do usuario.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status_changed_at IS NULL THEN
    NEW.status_changed_at := NOW();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_protect_status ON public.users;
CREATE TRIGGER trg_users_protect_status
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.fluxpay_protect_user_status();

REVOKE ALL ON FUNCTION public.fluxpay_protect_user_status() FROM PUBLIC, anon, authenticated, service_role;

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
  'Libera antecipadamente lancamentos de saldo vinculados a um pagamento confirmado, sem alterar status ou valores financeiros.';
