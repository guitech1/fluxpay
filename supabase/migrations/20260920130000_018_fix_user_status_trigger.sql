-- FluxPay 018 — corrigir trigger de users.status (suspender/banir)
--
-- Bug: a 016 bloqueava QUALQUER update de status quando
-- current_setting('request.jwt.claim.role') não era literalmente 'service_role'.
-- No PostgREST atual esse setting costuma vir vazio mesmo com a service_role
-- key — o backend ADM recebia 42501 e a API respondia 500 genérico.
--
-- Correção: negar APENAS quando o papel é authenticated ou anon.
-- service_role (e contextos internos) podem alterar status.

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
    BEGIN
      jwt_role := COALESCE(
        NULLIF(auth.role(), ''),
        NULLIF(current_setting('request.jwt.claim.role', true), ''),
        NULLIF((current_setting('request.jwt.claims', true)::jsonb ->> 'role'), '')
      );
    EXCEPTION WHEN OTHERS THEN
      jwt_role := NULL;
    END;

    IF jwt_role IN ('authenticated', 'anon') THEN
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
  'Bloqueia mudança de users.status por authenticated/anon. service_role (backend ADM) pode alterar.';

REVOKE ALL ON FUNCTION public.fluxpay_protect_user_status() FROM PUBLIC, anon, authenticated;
