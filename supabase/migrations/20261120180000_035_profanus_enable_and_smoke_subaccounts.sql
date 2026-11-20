-- Profanus: se já existir linha disabled do seed, permite ligar no admin (não força enabled).
-- Subcontas SmokePay: mapeamento local organização → shop na Smoke.

INSERT INTO acquirer_cost_config (acquirer_id, cost_percent, cost_fixed_cents, enabled, priority)
VALUES ('profanuspay', 5.0, 0, true, 15)
ON CONFLICT (acquirer_id) DO UPDATE
SET enabled = CASE
  WHEN acquirer_cost_config.enabled IS FALSE THEN TRUE
  ELSE acquirer_cost_config.enabled
END;

CREATE TABLE IF NOT EXISTS smoke_subaccounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'live',
  name TEXT NOT NULL,
  external_ref TEXT NOT NULL,
  provider_shop_id TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT smoke_subaccounts_org_env_ref UNIQUE (organization_id, environment, external_ref)
);

CREATE INDEX IF NOT EXISTS idx_smoke_subaccounts_org
  ON smoke_subaccounts (organization_id, environment);

ALTER TABLE smoke_subaccounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members manage own smoke subaccounts" ON smoke_subaccounts;
CREATE POLICY "Members manage own smoke subaccounts"
  ON smoke_subaccounts
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

COMMENT ON TABLE smoke_subaccounts IS
  'Subcontas SmokePay apenas. Outras adquirentes usam carteira principal FluxPay.';
