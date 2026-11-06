-- ============================================================
-- 031 — Conta Digital FluxPay + aprovacao manual de saque
-- Extensoes seguras e aditivas sobre fluxpay_cards e organizations.
-- Nao apaga dados, nao altera saldos historicos.
-- ============================================================

-- Preferencia de tema e PIN Pix separado do PIN de acesso (password_hash)
ALTER TABLE fluxpay_cards
  ADD COLUMN IF NOT EXISTS pix_pin_hash TEXT,
  ADD COLUMN IF NOT EXISTS theme_preference TEXT NOT NULL DEFAULT 'dark'
    CHECK (theme_preference IN ('dark', 'light')),
  ADD COLUMN IF NOT EXISTS pix_pin_fail_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pix_pin_locked_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cpf TEXT,
  ADD COLUMN IF NOT EXISTS birth_date DATE,
  ADD COLUMN IF NOT EXISTS email TEXT;

COMMENT ON COLUMN fluxpay_cards.pix_pin_hash IS
  'Hash scrypt do PIN exclusivo para autorizar Pix (diferente do password_hash de acesso). Nunca logar.';
COMMENT ON COLUMN fluxpay_cards.theme_preference IS
  'Preferencia de tema do cliente: dark | light. Persistida e aplicada na carteira.';
COMMENT ON COLUMN fluxpay_cards.cpf IS
  'CPF do titular da conta digital (somente digitos). Usado na analise.';

-- Configuracao individual: saque exige aprovacao manual do admin
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS requires_manual_withdrawal_approval BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN organizations.requires_manual_withdrawal_approval IS
  'Se true, saques desta organizacao ficam pendentes ate aprovacao de admin da plataforma. Cliente nao pode alterar.';

CREATE TABLE IF NOT EXISTS withdrawal_approval_config_audit (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  previous_value    BOOLEAN NOT NULL,
  new_value         BOOLEAN NOT NULL,
  reason            TEXT,
  ip_address        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_withdrawal_approval_audit_org
  ON withdrawal_approval_config_audit (organization_id, created_at DESC);

ALTER TABLE withdrawal_approval_config_audit ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON withdrawal_approval_config_audit FROM anon, authenticated;
GRANT ALL ON withdrawal_approval_config_audit TO service_role;

-- Indice para listagem admin de contas em analise
CREATE INDEX IF NOT EXISTS idx_fluxpay_cards_status_created
  ON fluxpay_cards (status, created_at DESC);

-- Garante que password_hash e pix_pin_hash nunca vazem em SELECT generico
-- (ja tratado no service; constraint apenas documental)
