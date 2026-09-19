-- FluxPay 006 — suporte a PIX e a webhooks de entrada do adquirente (NexusPag)
-- Tudo aditivo e anulavel: nao quebra o codigo atual (sandbox provider).

-- ============================================
-- 1. Campos PIX / metodo de pagamento no payment
-- ============================================
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS payment_type TEXT NOT NULL DEFAULT 'card',
  ADD COLUMN IF NOT EXISTS provider_txid TEXT,
  ADD COLUMN IF NOT EXISTS provider_external_id TEXT,
  ADD COLUMN IF NOT EXISTS pix_copy_paste TEXT,
  ADD COLUMN IF NOT EXISTS pix_qr_code_base64 TEXT,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expired_at TIMESTAMPTZ;

ALTER TABLE payments
  ADD CONSTRAINT payments_payment_type_valid
  CHECK (payment_type IN ('card', 'pix', 'boleto', 'spei', 'transfer', 'wallet'));

COMMENT ON COLUMN payments.provider_txid IS 'txid do adquirente (ex.: NexusPag transaction.txid)';
COMMENT ON COLUMN payments.provider_external_id IS 'external_id enviado ao adquirente para idempotencia';
COMMENT ON COLUMN payments.pix_copy_paste IS 'BR Code PIX copia e cola. Nao e dado sensivel de cartao.';

CREATE INDEX IF NOT EXISTS idx_payments_provider_txid ON payments(provider_txid)
  WHERE provider_txid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_provider_external
  ON payments(provider, provider_external_id) WHERE provider_external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_pix_expiring
  ON payments(expires_at) WHERE status = 'pending' AND expires_at IS NOT NULL;

-- ============================================
-- 2. Eventos recebidos do adquirente (webhooks de ENTRADA)
-- As tabelas webhook_* existentes sao de SAIDA (FluxPay -> lojista).
-- Esta e a contraparte: adquirente -> FluxPay, com deduplicacao.
-- ============================================
CREATE TABLE IF NOT EXISTS provider_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
  environment environment_type,

  provider TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  event_type TEXT,

  payload JSONB NOT NULL,
  signature_valid BOOLEAN NOT NULL DEFAULT false,

  processed_at TIMESTAMPTZ,
  processing_error TEXT,
  attempt_count INT NOT NULL DEFAULT 0,

  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT provider_events_unique UNIQUE (provider, provider_event_id)
);

CREATE INDEX IF NOT EXISTS idx_provider_events_payment ON provider_events(payment_id);
CREATE INDEX IF NOT EXISTS idx_provider_events_org ON provider_events(organization_id);
CREATE INDEX IF NOT EXISTS idx_provider_events_unprocessed
  ON provider_events(received_at) WHERE processed_at IS NULL;

COMMENT ON TABLE provider_events IS
  'Webhooks recebidos do adquirente. A UNIQUE(provider, provider_event_id) garante idempotencia e evita creditar o ledger duas vezes.';

ALTER TABLE provider_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view provider events"
  ON provider_events FOR SELECT
  USING (organization_id IS NOT NULL AND is_org_member(organization_id));

-- ============================================
-- 3. Saldo calculado no banco (hoje o backend soma linha a linha em JS)
-- ============================================
CREATE OR REPLACE FUNCTION get_organization_balance(
  p_organization_id UUID,
  p_environment environment_type
)
RETURNS TABLE (currency TEXT, available BIGINT, pending BIGINT)
LANGUAGE sql STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT
    bt.currency,
    COALESCE(SUM(bt.net) FILTER (WHERE bt.available_on IS NULL OR bt.available_on <= NOW()), 0)::BIGINT,
    COALESCE(SUM(bt.net) FILTER (WHERE bt.available_on > NOW()), 0)::BIGINT
  FROM balance_transactions bt
  WHERE bt.organization_id = p_organization_id
    AND bt.environment = p_environment
  GROUP BY bt.currency;
$$;

COMMENT ON FUNCTION get_organization_balance IS
  'Saldo agregado por moeda. SECURITY INVOKER: respeita a RLS de balance_transactions.';

-- ============================================
-- 4. Expiracao de sessoes de checkout e cobrancas PIX vencidas
-- (chamar por cron/job; nao expira nada automaticamente sozinho)
-- ============================================
CREATE OR REPLACE FUNCTION fluxpay_expire_stale_records()
RETURNS TABLE (expired_checkouts INT, expired_payments INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c INT;
  p INT;
BEGIN
  UPDATE checkout_sessions
     SET status = 'expired'
   WHERE status = 'open' AND expires_at IS NOT NULL AND expires_at < NOW();
  GET DIAGNOSTICS c = ROW_COUNT;

  UPDATE payments
     SET status = 'expired', expired_at = NOW()
   WHERE status = 'pending'
     AND payment_type = 'pix'
     AND expires_at IS NOT NULL
     AND expires_at < NOW();
  GET DIAGNOSTICS p = ROW_COUNT;

  RETURN QUERY SELECT c, p;
END;
$$;

REVOKE EXECUTE ON FUNCTION fluxpay_expire_stale_records() FROM PUBLIC, anon, authenticated;
