-- FluxPay 018 — corrigir detecção de service_role no trigger de users.status
--
-- A migration 016 usava current_setting('request.jwt.claim.role'), que no
-- PostgREST atual frequentemente vem vazio mesmo com a service_role key.
-- Resultado: PATCH de status via backend falhava com 42501 e a API devolvia
-- 500 genérico ("Nao foi possivel concluir a operacao...").
--
-- Correção: aceitar service_role via auth.role() e via claims JSON.
-- Continua bloqueando authenticated/anon de alterar status.

CREATE OR REPLACE FUNCTION public.fluxpay_protect_user_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  jwt_role text;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    jwt_role := COALESCE(
      auth.role(),
      NULLIF(current_setting('request.jwt.claim.role', true), ''),
      NULLIF((current_setting('request.jwt.claims', true)::jsonb ->> 'role'), '')
    );

    IF COALESCE(jwt_role, '') IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'Somente o backend administrativo pode alterar o status do usuario.'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.status_changed_at IS NULL THEN
      NEW.status_changed_at := NOW();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fluxpay_protect_user_status() IS
  'Impede que clientes authenticated/anon mudem users.status. service_role (backend ADM) pode alterar.';

REVOKE ALL ON FUNCTION public.fluxpay_protect_user_status() FROM PUBLIC, anon, authenticated;
