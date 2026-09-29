-- ============================================================
-- 020 — FluxPay Card (carteira interna)
-- Uma carteira por organizacao. Saldo permanece no ledger
-- balance_transactions. Transferencias internas via RPC atomica.
-- ============================================================

DO $$ BEGIN
  CREATE TYPE fluxpay_card_status AS ENUM (
    'pending_review',
    'approved',
    'rejected',
    'blocked'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE fluxpay_card_tx_status AS ENUM (
    'pending',
    'completed',
    'failed',
    'reversed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS fluxpay_cards (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name             TEXT NOT NULL,
  phone                 TEXT NOT NULL,
  password_hash         TEXT NOT NULL,
  status                fluxpay_card_status NOT NULL DEFAULT 'pending_review',
  card_number           TEXT,
  rejection_reason      TEXT,
  reviewed_by           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at           TIMESTAMPTZ,
  blocked_at            TIMESTAMPTZ,
  blocked_by            UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  block_reason          TEXT,
  password_fail_count   INT NOT NULL DEFAULT 0,
  password_locked_until TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fluxpay_cards_full_name_len CHECK (char_length(trim(full_name)) >= 3),
  CONSTRAINT fluxpay_cards_phone_digits CHECK (char_length(regexp_replace(phone, '\D', '', 'g')) >= 10),
  CONSTRAINT fluxpay_cards_card_number_when_approved CHECK (
    (status IN ('approved', 'blocked') AND card_number IS NOT NULL)
    OR (status IN ('pending_review', 'rejected') AND card_number IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_fluxpay_cards_org_active
  ON fluxpay_cards (organization_id)
  WHERE status IN ('pending_review', 'approved', 'blocked');

CREATE UNIQUE INDEX IF NOT EXISTS uq_fluxpay_cards_card_number
  ON fluxpay_cards (card_number)
  WHERE card_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fluxpay_cards_status ON fluxpay_cards (status);
CREATE INDEX IF NOT EXISTS idx_fluxpay_cards_org ON fluxpay_cards (organization_id);
CREATE INDEX IF NOT EXISTS idx_fluxpay_cards_user ON fluxpay_cards (user_id);
CREATE INDEX IF NOT EXISTS idx_fluxpay_cards_created ON fluxpay_cards (created_at DESC);

COMMENT ON TABLE fluxpay_cards IS
  'Carteira FluxPay Card por organizacao. Senha apenas em hash. Numero unico gerado no backend apos aprovacao ADM.';

CREATE TABLE IF NOT EXISTS fluxpay_card_transactions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id               TEXT NOT NULL UNIQUE,
  source_card_id          UUID NOT NULL REFERENCES fluxpay_cards(id) ON DELETE RESTRICT,
  destination_card_id     UUID NOT NULL REFERENCES fluxpay_cards(id) ON DELETE RESTRICT,
  source_organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  dest_organization_id    UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  amount                  BIGINT NOT NULL CHECK (amount > 0),
  currency                TEXT NOT NULL DEFAULT 'BRL',
  status                  fluxpay_card_tx_status NOT NULL DEFAULT 'pending',
  idempotency_key         TEXT NOT NULL,
  requested_by            UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  source_ledger_id        UUID REFERENCES balance_transactions(id) ON DELETE SET NULL,
  dest_ledger_id          UUID REFERENCES balance_transactions(id) ON DELETE SET NULL,
  failure_reason          TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at            TIMESTAMPTZ,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fluxpay_card_tx_different_cards CHECK (source_card_id <> destination_card_id),
  CONSTRAINT fluxpay_card_tx_different_orgs CHECK (source_organization_id <> dest_organization_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_fluxpay_card_tx_idempotency
  ON fluxpay_card_transactions (source_organization_id, idempotency_key);

CREATE INDEX IF NOT EXISTS idx_fluxpay_card_tx_source
  ON fluxpay_card_transactions (source_card_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fluxpay_card_tx_dest
  ON fluxpay_card_transactions (destination_card_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fluxpay_card_tx_status
  ON fluxpay_card_transactions (status);

COMMENT ON TABLE fluxpay_card_transactions IS
  'Transferencias internas FluxPay Card. Valor em centavos. Debito/credito no ledger balance_transactions.';

CREATE TABLE IF NOT EXISTS fluxpay_card_audit_logs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id           UUID REFERENCES fluxpay_cards(id) ON DELETE SET NULL,
  organization_id   UUID REFERENCES organizations(id) ON DELETE SET NULL,
  actor_user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_type        TEXT NOT NULL CHECK (actor_type IN ('user', 'admin', 'system')),
  action            TEXT NOT NULL,
  metadata          JSONB NOT NULL DEFAULT '{}',
  ip_address        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fluxpay_card_audit_card
  ON fluxpay_card_audit_logs (card_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fluxpay_card_audit_org
  ON fluxpay_card_audit_logs (organization_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.fluxpay_card_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fluxpay_cards_updated_at ON fluxpay_cards;
CREATE TRIGGER trg_fluxpay_cards_updated_at
  BEFORE UPDATE ON fluxpay_cards
  FOR EACH ROW EXECUTE FUNCTION public.fluxpay_card_set_updated_at();

DROP TRIGGER IF EXISTS trg_fluxpay_card_tx_updated_at ON fluxpay_card_transactions;
CREATE TRIGGER trg_fluxpay_card_tx_updated_at
  BEFORE UPDATE ON fluxpay_card_transactions
  FOR EACH ROW EXECUTE FUNCTION public.fluxpay_card_set_updated_at();

CREATE OR REPLACE FUNCTION public.fluxpay_generate_card_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  candidate TEXT;
  attempts INT := 0;
BEGIN
  LOOP
    attempts := attempts + 1;
    IF attempts > 50 THEN
      RAISE EXCEPTION 'unable to generate unique card number'
        USING ERRCODE = 'P0001';
    END IF;
    candidate := '4821' || lpad((floor(random() * 1e12))::bigint::text, 12, '0');
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM fluxpay_cards WHERE card_number = candidate
    );
  END LOOP;
  RETURN candidate;
END;
$$;

REVOKE ALL ON FUNCTION public.fluxpay_generate_card_number() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fluxpay_generate_card_number() TO service_role;

-- Transferencia atomica: lock nas carteiras, checagem de saldo, debito/credito no ledger.
-- Ambiente via p_environment (test|live) alinhado ao painel.
CREATE OR REPLACE FUNCTION public.fluxpay_card_transfer(
  p_source_card_id       UUID,
  p_destination_card_id  UUID,
  p_amount_cents         BIGINT,
  p_requested_by         UUID,
  p_idempotency_key      TEXT,
  p_public_id            TEXT,
  p_environment          public.environment_type DEFAULT 'live'
)
RETURNS TABLE (
  transaction_id   UUID,
  public_id        TEXT,
  status           TEXT,
  amount           BIGINT,
  source_ledger_id UUID,
  dest_ledger_id   UUID,
  already_existed  BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  src fluxpay_cards%ROWTYPE;
  dst fluxpay_cards%ROWTYPE;
  available_balance BIGINT;
  existing fluxpay_card_transactions%ROWTYPE;
  src_ledger_id UUID;
  dst_ledger_id UUID;
  tx_id UUID;
BEGIN
  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'amount must be positive' USING ERRCODE = '23514';
  END IF;

  IF p_source_card_id = p_destination_card_id THEN
    RAISE EXCEPTION 'cannot transfer to same card' USING ERRCODE = '23514';
  END IF;

  IF p_source_card_id < p_destination_card_id THEN
    SELECT * INTO src FROM fluxpay_cards WHERE id = p_source_card_id FOR UPDATE;
    SELECT * INTO dst FROM fluxpay_cards WHERE id = p_destination_card_id FOR UPDATE;
  ELSE
    SELECT * INTO dst FROM fluxpay_cards WHERE id = p_destination_card_id FOR UPDATE;
    SELECT * INTO src FROM fluxpay_cards WHERE id = p_source_card_id FOR UPDATE;
  END IF;

  IF src.id IS NULL THEN
    RAISE EXCEPTION 'source card not found' USING ERRCODE = 'P0002';
  END IF;
  IF dst.id IS NULL THEN
    RAISE EXCEPTION 'destination card not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO existing
    FROM fluxpay_card_transactions
   WHERE source_organization_id = src.organization_id
     AND idempotency_key = p_idempotency_key;

  IF FOUND THEN
    RETURN QUERY SELECT
      existing.id, existing.public_id, existing.status::text, existing.amount,
      existing.source_ledger_id, existing.dest_ledger_id, TRUE;
    RETURN;
  END IF;

  IF src.status <> 'approved' THEN
    RAISE EXCEPTION 'source card is not approved or is blocked' USING ERRCODE = '23514';
  END IF;

  IF dst.status NOT IN ('approved', 'blocked') THEN
    RAISE EXCEPTION 'destination card is not eligible to receive' USING ERRCODE = '23514';
  END IF;

  IF src.organization_id = dst.organization_id THEN
    RAISE EXCEPTION 'cannot transfer to same organization' USING ERRCODE = '23514';
  END IF;

  SELECT COALESCE(SUM(net), 0) INTO available_balance
    FROM balance_transactions
   WHERE organization_id = src.organization_id
     AND environment = p_environment
     AND (available_on IS NULL OR available_on <= NOW());

  IF available_balance < p_amount_cents THEN
    RAISE EXCEPTION 'insufficient funds' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO balance_transactions (
    organization_id, environment, type, amount, currency, net, fee,
    description, available_on
  ) VALUES (
    src.organization_id, p_environment, 'adjustment', -p_amount_cents, 'BRL', -p_amount_cents, 0,
    'Transferencia FluxPay Card enviada', NOW()
  ) RETURNING id INTO src_ledger_id;

  INSERT INTO balance_transactions (
    organization_id, environment, type, amount, currency, net, fee,
    description, available_on
  ) VALUES (
    dst.organization_id, p_environment, 'adjustment', p_amount_cents, 'BRL', p_amount_cents, 0,
    'Transferencia FluxPay Card recebida', NOW()
  ) RETURNING id INTO dst_ledger_id;

  tx_id := gen_random_uuid();

  INSERT INTO fluxpay_card_transactions (
    id, public_id, source_card_id, destination_card_id,
    source_organization_id, dest_organization_id,
    amount, currency, status, idempotency_key, requested_by,
    source_ledger_id, dest_ledger_id, completed_at
  ) VALUES (
    tx_id, p_public_id, src.id, dst.id,
    src.organization_id, dst.organization_id,
    p_amount_cents, 'BRL', 'completed', p_idempotency_key, p_requested_by,
    src_ledger_id, dst_ledger_id, NOW()
  );

  RETURN QUERY SELECT
    tx_id, p_public_id, 'completed'::text, p_amount_cents,
    src_ledger_id, dst_ledger_id, FALSE;
END;
$$;

REVOKE ALL ON FUNCTION public.fluxpay_card_transfer(UUID, UUID, BIGINT, UUID, TEXT, TEXT, public.environment_type)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fluxpay_card_transfer(UUID, UUID, BIGINT, UUID, TEXT, TEXT, public.environment_type)
  TO service_role;

COMMENT ON FUNCTION public.fluxpay_card_transfer IS
  'Transferencia atomica FluxPay Card. Debita/credita ledger oficial. Idempotente por (org, idempotency_key).';

ALTER TABLE fluxpay_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE fluxpay_card_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE fluxpay_card_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fluxpay_cards_select ON fluxpay_cards;
CREATE POLICY fluxpay_cards_select ON fluxpay_cards
  FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

REVOKE INSERT, UPDATE, DELETE ON fluxpay_cards FROM authenticated, anon;
GRANT SELECT ON fluxpay_cards TO authenticated;

DROP POLICY IF EXISTS fluxpay_card_tx_select ON fluxpay_card_transactions;
CREATE POLICY fluxpay_card_tx_select ON fluxpay_card_transactions
  FOR SELECT TO authenticated
  USING (
    source_organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
    OR dest_organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

REVOKE INSERT, UPDATE, DELETE ON fluxpay_card_transactions FROM authenticated, anon;
GRANT SELECT ON fluxpay_card_transactions TO authenticated;

REVOKE ALL ON fluxpay_card_audit_logs FROM authenticated, anon;

GRANT ALL ON fluxpay_cards TO service_role;
GRANT ALL ON fluxpay_card_transactions TO service_role;
GRANT ALL ON fluxpay_card_audit_logs TO service_role;
