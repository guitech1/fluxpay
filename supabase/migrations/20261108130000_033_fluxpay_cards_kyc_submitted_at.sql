-- ============================================================
-- 033 — kyc_submitted_at em fluxpay_cards (aditiva)
-- NULL = conta nunca reenviou o cadastro KYC após a coluna existir
-- (contas antigas que só tinham kyc_status pending sem formulário).
-- NÃO preenche linhas existentes. NÃO apaga dados. NÃO mexe em
-- card_number, saldo ou status operacional.
-- ============================================================

ALTER TABLE fluxpay_cards
  ADD COLUMN IF NOT EXISTS kyc_submitted_at timestamptz;

COMMENT ON COLUMN fluxpay_cards.kyc_submitted_at IS
  'Momento em que o usuário enviou/reenviou o formulário KYC. NULL = nunca enviou após a introdução desta coluna.';
