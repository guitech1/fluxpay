-- FluxPay 005 — status 'expired' para cobrancas PIX que vencem sem pagamento
-- (isolado em migration propria: ALTER TYPE ... ADD VALUE nao pode ser usado
-- na mesma transacao em que e criado)
ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'expired';
