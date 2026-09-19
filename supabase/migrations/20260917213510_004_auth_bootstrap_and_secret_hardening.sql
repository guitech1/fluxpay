-- FluxPay 004 — Integracao com Supabase Auth e protecao de segredos

-- ============================================
-- 1. Perfil publico criado automaticamente no signup
-- Sem isso, um usuario criado pelo Supabase Auth nao tem linha em public.users
-- e qualquer insert em organization_members falha por FK.
-- ============================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data ->> 'full_name',
                         NEW.raw_user_meta_data ->> 'name', '')), ''),
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data ->> 'avatar_url', '')), '')
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = COALESCE(public.users.full_name, EXCLUDED.full_name),
        avatar_url = COALESCE(public.users.avatar_url, EXCLUDED.avatar_url);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- mantem o email sincronizado quando o usuario troca de email no Auth
CREATE OR REPLACE FUNCTION handle_user_email_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.users SET email = NEW.email WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_email_updated ON auth.users;
CREATE TRIGGER on_auth_user_email_updated
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  WHEN (OLD.email IS DISTINCT FROM NEW.email)
  EXECUTE FUNCTION handle_user_email_change();

-- backfill de usuarios que ja existiam no Auth (idempotente)
INSERT INTO public.users (id, email, full_name)
SELECT au.id, COALESCE(au.email, ''), au.raw_user_meta_data ->> 'full_name'
FROM auth.users au
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 2. Quem cria a empresa vira owner automaticamente
-- ============================================
CREATE OR REPLACE FUNCTION handle_new_organization()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid()) THEN
    INSERT INTO public.organization_members (organization_id, user_id, role)
    VALUES (NEW.id, auth.uid(), 'owner')
    ON CONFLICT (organization_id, user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_organization_created ON organizations;
CREATE TRIGGER on_organization_created
  AFTER INSERT ON organizations
  FOR EACH ROW EXECUTE FUNCTION handle_new_organization();

-- garante que toda empresa tenha ao menos um owner
CREATE OR REPLACE FUNCTION fluxpay_protect_last_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  owners_left INT;
BEGIN
  IF (TG_OP = 'DELETE' AND OLD.role = 'owner')
     OR (TG_OP = 'UPDATE' AND OLD.role = 'owner' AND NEW.role <> 'owner') THEN
    SELECT COUNT(*) INTO owners_left
    FROM organization_members
    WHERE organization_id = OLD.organization_id AND role = 'owner' AND id <> OLD.id;

    IF owners_left = 0 AND EXISTS (SELECT 1 FROM organizations WHERE id = OLD.organization_id) THEN
      RAISE EXCEPTION 'a empresa precisa ter pelo menos um owner' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_protect_last_owner
  BEFORE UPDATE OR DELETE ON organization_members
  FOR EACH ROW EXECUTE FUNCTION fluxpay_protect_last_owner();

-- ============================================
-- 3. Policies que faltavam
-- ============================================
CREATE POLICY "Members can view users in same organization"
  ON users FOR SELECT
  USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.user_id = users.id
        AND om.organization_id IN (SELECT get_user_organization_ids())
    )
  );

CREATE POLICY "Owners can delete their organizations"
  ON organizations FOR DELETE
  USING (has_org_role(id, ARRAY['owner']));

-- ============================================
-- 4. Segredos nao trafegam para o cliente (anon/authenticated)
-- O dashboard passa a nao poder fazer "select *" nessas duas tabelas:
-- deve listar as colunas explicitamente.
-- ============================================
REVOKE SELECT ON api_keys FROM anon, authenticated;
GRANT SELECT (
  id, organization_id, name, key_type, environment, key_prefix,
  last_used_at, expires_at, revoked_at, created_at, created_by
) ON api_keys TO authenticated;

REVOKE SELECT ON webhook_endpoints FROM anon, authenticated;
GRANT SELECT (
  id, organization_id, environment, url, events, description, enabled,
  created_at, updated_at
) ON webhook_endpoints TO authenticated;

REVOKE INSERT, UPDATE, DELETE ON api_keys FROM anon;
REVOKE INSERT, UPDATE, DELETE ON webhook_endpoints FROM anon;
