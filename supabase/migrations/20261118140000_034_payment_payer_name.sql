-- FluxPay 034 — nome/documento de quem pagou o PIX (webhook da adquirente)
-- Aditivo e anulável: não quebra cobranças existentes.

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS payer_name TEXT,
  ADD COLUMN IF NOT EXISTS payer_document TEXT;

COMMENT ON COLUMN payments.payer_name IS 'Nome do pagador informado pelo adquirente no webhook de PIX pago';
COMMENT ON COLUMN payments.payer_document IS 'Documento do pagador (pode vir mascarado) do webhook da adquirente';

CREATE INDEX IF NOT EXISTS idx_payments_payer_name
  ON payments (organization_id, environment, payer_name)
  WHERE payer_name IS NOT NULL;
