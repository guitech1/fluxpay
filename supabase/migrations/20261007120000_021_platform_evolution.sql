-- ============================================================
-- 021 — Platform evolution: public profiles, ranking, vaults
-- Score is computed from real payments (never user-editable).
-- Vaults are internal allocations against the real ledger balance.
-- Ranking manual participants are admin-managed (not fake labels).
-- ============================================================

-- Public seller profile fields on organizations
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS public_bio TEXT,
  ADD COLUMN IF NOT EXISTS public_work TEXT,
  ADD COLUMN IF NOT EXISTS public_avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS public_profile_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS public_display_name TEXT;

COMMENT ON COLUMN organizations.public_bio IS 'Bio publica do vendedor (perfil /u/:slug)';
COMMENT ON COLUMN organizations.public_work IS 'Com o que trabalha — texto livre publico';
COMMENT ON COLUMN organizations.public_avatar_url IS 'URL da foto de perfil publica';
COMMENT ON COLUMN organizations.public_profile_enabled IS 'Se o perfil publico esta ativo';
COMMENT ON COLUMN organizations.public_display_name IS 'Nome de exibicao no perfil publico';

-- Ranking seasons (optional periods)
CREATE TABLE IF NOT EXISTS ranking_seasons (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  starts_at     TIMESTAMPTZ NOT NULL,
  ends_at       TIMESTAMPTZ,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ranking_seasons_active ON ranking_seasons (is_active) WHERE is_active = true;

-- Manual ranking participants (admin-managed). Appear as normal participants.
CREATE TABLE IF NOT EXISTS ranking_participants (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id         UUID REFERENCES ranking_seasons(id) ON DELETE SET NULL,
  organization_id   UUID REFERENCES organizations(id) ON DELETE CASCADE,
  display_name      TEXT NOT NULL,
  avatar_url        TEXT,
  -- Manual amount in cents when not linked to an organization (admin-set).
  -- When organization_id is set, ranking value is computed from succeeded payments.
  manual_amount_cents BIGINT,
  score_override    INT,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  sort_priority     INT NOT NULL DEFAULT 0,
  created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ranking_participants_name_len CHECK (char_length(trim(display_name)) >= 2),
  CONSTRAINT ranking_participants_manual_amount CHECK (
    manual_amount_cents IS NULL OR manual_amount_cents >= 0
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ranking_participants_org_season
  ON ranking_participants (organization_id, COALESCE(season_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE organization_id IS NOT NULL AND is_active = true;

CREATE INDEX IF NOT EXISTS idx_ranking_participants_active ON ranking_participants (is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_ranking_participants_org ON ranking_participants (organization_id);

COMMENT ON TABLE ranking_participants IS
  'Participantes do ranking. Com organization_id o valor vem de vendas succeeded. Sem org, ADM informa manual_amount_cents. Nunca rotular como ficticio na UI.';

-- Internal vaults (money organization, not separate bank accounts)
CREATE TABLE IF NOT EXISTS organization_vaults (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  environment       public.environment_type NOT NULL DEFAULT 'live',
  name              TEXT NOT NULL,
  description       TEXT,
  color             TEXT,
  -- Allocated amount in cents. Must never exceed available balance.
  allocated_cents   BIGINT NOT NULL DEFAULT 0 CHECK (allocated_cents >= 0),
  is_archived       BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT organization_vaults_name_len CHECK (char_length(trim(name)) >= 1 AND char_length(name) <= 80)
);

CREATE INDEX IF NOT EXISTS idx_org_vaults_org_env
  ON organization_vaults (organization_id, environment)
  WHERE is_archived = false;

COMMENT ON TABLE organization_vaults IS
  'Cofres internos: alocacao do saldo disponivel. Nao cria dinheiro. Fonte de verdade continua balance_transactions.';

CREATE TABLE IF NOT EXISTS organization_vault_movements (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vault_id          UUID NOT NULL REFERENCES organization_vaults(id) ON DELETE CASCADE,
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  environment       public.environment_type NOT NULL,
  direction         TEXT NOT NULL CHECK (direction IN ('allocate', 'release')),
  amount_cents      BIGINT NOT NULL CHECK (amount_cents > 0),
  note              TEXT,
  created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vault_movements_vault
  ON organization_vault_movements (vault_id, created_at DESC);

-- Risk radar alerts (informational only — no auto-block)
CREATE TABLE IF NOT EXISTS risk_alerts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  environment       public.environment_type NOT NULL DEFAULT 'live',
  level             TEXT NOT NULL CHECK (level IN ('normal', 'attention', 'elevated')),
  indicator         TEXT NOT NULL,
  title             TEXT NOT NULL,
  explanation       TEXT NOT NULL,
  detected_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  window_start      TIMESTAMPTZ,
  window_end        TIMESTAMPTZ,
  metrics           JSONB NOT NULL DEFAULT '{}',
  acknowledged_at   TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_risk_alerts_org
  ON risk_alerts (organization_id, environment, detected_at DESC);

COMMENT ON TABLE risk_alerts IS
  'Alertas informativos do Risk Radar. Nao bloqueiam pagamentos automaticamente.';

-- RLS
ALTER TABLE ranking_seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE ranking_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_vaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_vault_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_alerts ENABLE ROW LEVEL SECURITY;

-- Ranking seasons: public read of active seasons for ranking page
DROP POLICY IF EXISTS ranking_seasons_select ON ranking_seasons;
CREATE POLICY ranking_seasons_select ON ranking_seasons
  FOR SELECT TO authenticated, anon
  USING (true);

REVOKE INSERT, UPDATE, DELETE ON ranking_seasons FROM authenticated, anon;
GRANT SELECT ON ranking_seasons TO authenticated, anon;
GRANT ALL ON ranking_seasons TO service_role;

-- Ranking participants: public read of active for ranking page
DROP POLICY IF EXISTS ranking_participants_select ON ranking_participants;
CREATE POLICY ranking_participants_select ON ranking_participants
  FOR SELECT TO authenticated, anon
  USING (is_active = true);

REVOKE INSERT, UPDATE, DELETE ON ranking_participants FROM authenticated, anon;
GRANT SELECT ON ranking_participants TO authenticated, anon;
GRANT ALL ON ranking_participants TO service_role;

-- Vaults: org members can read; writes only via service_role (backend)
DROP POLICY IF EXISTS organization_vaults_select ON organization_vaults;
CREATE POLICY organization_vaults_select ON organization_vaults
  FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

REVOKE INSERT, UPDATE, DELETE ON organization_vaults FROM authenticated, anon;
GRANT SELECT ON organization_vaults TO authenticated;
GRANT ALL ON organization_vaults TO service_role;

DROP POLICY IF EXISTS organization_vault_movements_select ON organization_vault_movements;
CREATE POLICY organization_vault_movements_select ON organization_vault_movements
  FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

REVOKE INSERT, UPDATE, DELETE ON organization_vault_movements FROM authenticated, anon;
GRANT SELECT ON organization_vault_movements TO authenticated;
GRANT ALL ON organization_vault_movements TO service_role;

DROP POLICY IF EXISTS risk_alerts_select ON risk_alerts;
CREATE POLICY risk_alerts_select ON risk_alerts
  FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

REVOKE INSERT, UPDATE, DELETE ON risk_alerts FROM authenticated, anon;
GRANT SELECT ON risk_alerts TO authenticated;
GRANT ALL ON risk_alerts TO service_role;

-- Public org profile read (only when enabled) via security definer helper
CREATE OR REPLACE FUNCTION public.get_public_seller_profile(p_slug TEXT)
RETURNS TABLE (
  id UUID,
  slug TEXT,
  display_name TEXT,
  bio TEXT,
  work TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT
    o.id,
    o.slug,
    COALESCE(NULLIF(trim(o.public_display_name), ''), o.name) AS display_name,
    o.public_bio AS bio,
    o.public_work AS work,
    COALESCE(o.public_avatar_url, o.logo_url) AS avatar_url,
    o.created_at
  FROM organizations o
  WHERE o.slug = lower(trim(p_slug))
    AND o.public_profile_enabled = true
    AND o.status = 'active';
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_seller_profile(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_seller_profile(TEXT) TO anon, authenticated, service_role;

-- Aggregate succeeded sales for public profile / score (live only for public)
CREATE OR REPLACE FUNCTION public.get_org_succeeded_sales_stats(
  p_organization_id UUID,
  p_environment public.environment_type DEFAULT 'live'
)
RETURNS TABLE (
  total_amount_cents BIGINT,
  payment_count BIGINT,
  first_payment_at TIMESTAMPTZ,
  last_payment_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(p.amount), 0)::BIGINT,
    COUNT(*)::BIGINT,
    MIN(p.created_at),
    MAX(p.created_at)
  FROM payments p
  WHERE p.organization_id = p_organization_id
    AND p.environment = p_environment
    AND p.status = 'succeeded';
END;
$$;

REVOKE ALL ON FUNCTION public.get_org_succeeded_sales_stats(UUID, public.environment_type) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_org_succeeded_sales_stats(UUID, public.environment_type) TO service_role;

-- Atomic vault allocate/release against real available balance
CREATE OR REPLACE FUNCTION public.fluxpay_vault_allocate(
  p_organization_id UUID,
  p_environment public.environment_type,
  p_vault_id UUID,
  p_amount_cents BIGINT,
  p_direction TEXT,
  p_user_id UUID,
  p_note TEXT DEFAULT NULL
)
RETURNS TABLE (
  vault_id UUID,
  allocated_cents BIGINT,
  available_after BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v organization_vaults%ROWTYPE;
  total_allocated BIGINT;
  available_balance BIGINT;
  free_balance BIGINT;
BEGIN
  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'amount must be positive' USING ERRCODE = '23514';
  END IF;

  IF p_direction NOT IN ('allocate', 'release') THEN
    RAISE EXCEPTION 'invalid direction' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v FROM organization_vaults
   WHERE id = p_vault_id
     AND organization_id = p_organization_id
     AND environment = p_environment
     AND is_archived = false
   FOR UPDATE;

  IF v.id IS NULL THEN
    RAISE EXCEPTION 'vault not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(SUM(net), 0) INTO available_balance
    FROM balance_transactions
   WHERE organization_id = p_organization_id
     AND environment = p_environment
     AND (available_on IS NULL OR available_on <= NOW());

  SELECT COALESCE(SUM(allocated_cents), 0) INTO total_allocated
    FROM organization_vaults
   WHERE organization_id = p_organization_id
     AND environment = p_environment
     AND is_archived = false
     AND id <> p_vault_id;

  free_balance := available_balance - total_allocated - v.allocated_cents;

  IF p_direction = 'allocate' THEN
    IF free_balance < p_amount_cents THEN
      RAISE EXCEPTION 'insufficient free balance for vault allocation' USING ERRCODE = 'P0001';
    END IF;
    UPDATE organization_vaults
       SET allocated_cents = allocated_cents + p_amount_cents,
           updated_at = NOW()
     WHERE id = p_vault_id
     RETURNING organization_vaults.allocated_cents INTO v.allocated_cents;
  ELSE
    IF v.allocated_cents < p_amount_cents THEN
      RAISE EXCEPTION 'vault does not have enough allocated amount' USING ERRCODE = 'P0001';
    END IF;
    UPDATE organization_vaults
       SET allocated_cents = allocated_cents - p_amount_cents,
           updated_at = NOW()
     WHERE id = p_vault_id
     RETURNING organization_vaults.allocated_cents INTO v.allocated_cents;
  END IF;

  INSERT INTO organization_vault_movements (
    vault_id, organization_id, environment, direction, amount_cents, note, created_by
  ) VALUES (
    p_vault_id, p_organization_id, p_environment, p_direction, p_amount_cents, p_note, p_user_id
  );

  free_balance := available_balance - total_allocated - v.allocated_cents;

  RETURN QUERY SELECT p_vault_id, v.allocated_cents, free_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.fluxpay_vault_allocate(UUID, public.environment_type, UUID, BIGINT, TEXT, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fluxpay_vault_allocate(UUID, public.environment_type, UUID, BIGINT, TEXT, UUID, TEXT)
  TO service_role;

COMMENT ON FUNCTION public.fluxpay_vault_allocate IS
  'Aloca ou libera valor em cofre interno. Nao altera ledger. Respeita saldo disponivel real.';
