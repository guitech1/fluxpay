-- 022: Saldo imediato, taxas multi-adquirente, auditoria de saques
--
-- Sequence note: there is no migration file numbered 021 in this repository.
-- The jump 020 -> 022 is intentional historical numbering in the repo; do not
-- invent a backfilled 021 or renumber this file. Supabase applies migrations
-- by filename order, not by the numeric label alone.
--
-- Status on project fluxpay (mrfbmndbazeajgyozhfb): previously recorded as
-- applied for the fee/balance objects introduced here. Confirm with
-- supabase_migrations.schema_migrations before re-applying in any environment.
-- Never mark applied manually without evidence from that table.
--
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
  SELECT * INTO p FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment % not found', p_payment_id USING ERRCODE = 'P0002';
  END IF;
  IF p.organization_id IS DISTINCT FROM p_organization_id
     OR p.environment IS DISTINCT FROM p_environment THEN
    RAISE EXCEPTION 'payment % outside scope', p_payment_id USING ERRCODE = '42501';
  END IF;
  IF p.status = 'succeeded' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.balance_transactions bt
       WHERE bt.payment_id = p.id AND bt.type = 'charge'
    ) THEN
      INSERT INTO public.balance_transactions (
        organization_id, environment, type, amount, currency, net, fee,
        payment_id, description, available_on
      ) VALUES (
        p.organization_id, p.environment, 'charge', p.amount, p.currency,
        COALESCE(p.net_amount, p.amount - p.fee_amount), p.fee_amount, p.id,
        COALESCE(p.description, 'Pagamento PIX'), NOW()
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
    organization_id, environment, type, amount, currency, net, fee,
    payment_id, description, available_on
  ) VALUES (
    p.organization_id, p.environment, 'charge', p.amount, p.currency,
    COALESCE(p.net_amount, p.amount - p.fee_amount), p.fee_amount, p.id,
    COALESCE(p.description, 'Pagamento PIX'), NOW()
  );
  RETURN p;
END;
$$;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS fee_rule_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS provider_attempt_log jsonb;

CREATE TABLE IF NOT EXISTS platform_fee_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mode text NOT NULL CHECK (mode IN ('provider_plus_margin', 'provider_only', 'custom_total')),
  fluxpay_margin_percent numeric(8,4) NOT NULL DEFAULT 0,
  fluxpay_fixed_cents integer NOT NULL DEFAULT 0,
  custom_total_percent numeric(8,4),
  custom_total_fixed_cents integer DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  notes text
);

CREATE TABLE IF NOT EXISTS organization_fee_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  mode text NOT NULL CHECK (mode IN ('provider_plus_margin', 'provider_only', 'custom_total', 'inherit')),
  fluxpay_margin_percent numeric(8,4),
  fluxpay_fixed_cents integer DEFAULT 0,
  custom_total_percent numeric(8,4),
  custom_total_fixed_cents integer DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  notes text
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_org_fee_rules_active
  ON organization_fee_rules (organization_id) WHERE active = true;

CREATE TABLE IF NOT EXISTS acquirer_cost_config (
  acquirer_id text PRIMARY KEY,
  cost_percent numeric(8,4) NOT NULL DEFAULT 0,
  cost_fixed_cents integer NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT false,
  priority integer NOT NULL DEFAULT 100,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
INSERT INTO acquirer_cost_config (acquirer_id, cost_percent, cost_fixed_cents, enabled, priority) VALUES
  ('nexuspag', 5.0, 0, true, 10),
  ('gothampay', 5.0, 0, false, 20),
  ('smokepay', 5.0, 0, false, 30),
  ('kavropay', 2.99, 50, false, 40)
ON CONFLICT (acquirer_id) DO NOTHING;

INSERT INTO platform_fee_rules (mode, fluxpay_margin_percent, fluxpay_fixed_cents, active, notes)
SELECT 'provider_plus_margin', 3.0, 0, true, 'Regra inicial'
WHERE NOT EXISTS (SELECT 1 FROM platform_fee_rules WHERE active = true);

CREATE TABLE IF NOT EXISTS fee_rule_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL, target_id text, action text NOT NULL,
  before_snapshot jsonb, after_snapshot jsonb, actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS withdrawal_decision_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  withdrawal_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('approve', 'reject', 'process', 'fail')),
  actor_id uuid, reason text, state_before text, state_after text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wda_withdrawal ON withdrawal_decision_audit(withdrawal_id);

ALTER TABLE platform_fee_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_fee_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE acquirer_cost_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_rule_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE withdrawal_decision_audit ENABLE ROW LEVEL SECURITY;
