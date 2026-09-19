-- FluxPay 007 — corrige o bootstrap de criacao de empresa
--
-- Problema: a policy de SELECT em organizations exige que o usuario ja seja
-- membro. Como o RETURNING de um INSERT e avaliado sob a policy de SELECT
-- (e o vinculo de owner so e criado no trigger AFTER INSERT), qualquer
-- "supabase.from('organizations').insert(...).select()" falhava com 42501.

-- 1. rastreia quem criou a empresa (tambem serve de auditoria)
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION fluxpay_set_organization_creator()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_organizations_set_creator
  BEFORE INSERT ON organizations
  FOR EACH ROW EXECUTE FUNCTION fluxpay_set_organization_creator();

CREATE INDEX IF NOT EXISTS idx_organizations_created_by ON organizations(created_by);

-- 2. o criador enxerga a empresa mesmo no instante do INSERT ... RETURNING
DROP POLICY IF EXISTS "Users can view their organizations" ON organizations;
CREATE POLICY "Users can view their organizations"
  ON organizations FOR SELECT
  USING (
    id IN (SELECT get_user_organization_ids())
    OR created_by = auth.uid()
  );

-- 3. o INSERT direto so e permitido se created_by for o proprio usuario
DROP POLICY IF EXISTS "Authenticated users can create organizations" ON organizations;
CREATE POLICY "Authenticated users can create organizations"
  ON organizations FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (created_by IS NULL OR created_by = auth.uid())
  );

-- 4. caminho recomendado: RPC atomica que cria empresa + owner numa transacao
CREATE OR REPLACE FUNCTION create_organization(
  p_name TEXT,
  p_slug TEXT,
  p_email TEXT,
  p_legal_name TEXT DEFAULT NULL,
  p_document TEXT DEFAULT NULL,
  p_country TEXT DEFAULT 'BR',
  p_default_currency TEXT DEFAULT 'BRL'
)
RETURNS organizations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid UUID := auth.uid();
  org organizations;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'autenticacao necessaria' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM users WHERE id = uid) THEN
    RAISE EXCEPTION 'perfil de usuario inexistente' USING ERRCODE = '23503';
  END IF;

  INSERT INTO organizations (name, slug, email, legal_name, document, country, default_currency, created_by)
  VALUES (p_name, p_slug, p_email, p_legal_name, p_document, p_country, p_default_currency, uid)
  RETURNING * INTO org;

  INSERT INTO organization_members (organization_id, user_id, role)
  VALUES (org.id, uid, 'owner')
  ON CONFLICT (organization_id, user_id) DO NOTHING;

  RETURN org;
END;
$$;

REVOKE EXECUTE ON FUNCTION create_organization(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_organization(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) TO authenticated;

COMMENT ON FUNCTION create_organization IS
  'Cria empresa e vincula o usuario autenticado como owner atomicamente. Use no onboarding do dashboard.';
