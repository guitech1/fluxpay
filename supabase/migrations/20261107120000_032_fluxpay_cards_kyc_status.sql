-- ============================================================
-- 032 — kyc_status em fluxpay_cards (aditiva, sem destruir dados)
-- Novas linhas: kyc_status = pending
-- Linhas antigas sem CPF: kyc_status = pending
-- Só vira approved quando o admin aprovar no painel.
-- NÃO apaga dados e NÃO altera card_number.
-- ============================================================

DO $$ BEGIN
  CREATE TYPE fluxpay_kyc_status AS ENUM (
    'pending',
    'approved',
    'rejected'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE fluxpay_cards
  ADD COLUMN IF NOT EXISTS kyc_status fluxpay_kyc_status NOT NULL DEFAULT 'pending';

COMMENT ON COLUMN fluxpay_cards.kyc_status IS
  'Estado do cadastro KYC da carteira: pending | approved | rejected. Independente do status operacional.';

-- Contas antigas sem CPF entram em análise (não mexe em status nem card_number)
UPDATE fluxpay_cards
SET kyc_status = 'pending'
WHERE cpf IS NULL;

-- Índice para fila admin "Em análise" (status operacional ou kyc pendente)
CREATE INDEX IF NOT EXISTS idx_fluxpay_cards_kyc_status
  ON fluxpay_cards (kyc_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fluxpay_cards_pending_review_or_kyc
  ON fluxpay_cards (created_at DESC)
  WHERE status = 'pending_review' OR kyc_status = 'pending';
