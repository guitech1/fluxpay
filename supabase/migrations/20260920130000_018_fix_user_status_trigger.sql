-- FluxPay 018 — corrigir detecção de service_role no trigger de users.status
--
-- A migration 016 usava current_setting('request.jwt.claim.role'), que no
-- PostgREST/Supabase atual frequentemente vem vazio mesmo com a service_role
-- key. Resultado: suspender/banir usuário via /admin-api falhava (42501) e a
-- API devolvia 500 genérico.
--
-- Correção: aceitar service_role via auth.role(), claims JSON e current_user.
-- Continua bloqueando authenticated/anon de alterar status.

CREATE OR REPLACE FUNCTION public.fluxpay_protect_user_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  jwt_role text;
  db_user text := current_user;
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

    -- service_role key do backend OU papéis internos do Postgres/Supabase
    IF COALESCE(jwt_role, '') IS DISTINCT FROM 'service_role'
       AND db_user NOT IN ('service_role', 'postgres', 'supabase_admin', 'supabase_auth_admin') THEN
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
