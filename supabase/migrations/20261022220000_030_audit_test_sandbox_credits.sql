-- 030: Auditoria somente-leitura de creditos potencialmente ficticios.
-- NAO altera saldos. Rodar no SQL Editor do Supabase e revisar antes de qualquer ajuste.

-- Pagamentos de ambiente test ou provider sandbox ja marcados succeeded
SELECT
  p.id AS payment_id,
  p.organization_id,
  p.environment,
  p.provider,
  p.amount,
  p.net_amount,
  p.status,
  p.paid_at,
  p.created_at
FROM public.payments p
WHERE p.status = 'succeeded'
  AND (
    p.environment = 'test'
    OR lower(coalesce(p.provider, '')) = 'sandbox'
  )
ORDER BY p.created_at DESC
LIMIT 500;

-- Lancamentos de charge no ledger ligados a esses pagamentos
SELECT
  bt.id AS balance_tx_id,
  bt.organization_id,
  bt.environment,
  bt.net,
  bt.amount,
  bt.available_on,
  bt.payment_id,
  p.provider,
  p.status AS payment_status
FROM public.balance_transactions bt
LEFT JOIN public.payments p ON p.id = bt.payment_id
WHERE bt.type = 'charge'
  AND (
    bt.environment = 'test'
    OR lower(coalesce(p.provider, '')) = 'sandbox'
  )
ORDER BY bt.created_at DESC
LIMIT 500;

-- Resumo por organizacao (ambiente test)
SELECT
  organization_id,
  environment,
  count(*) AS charge_count,
  coalesce(sum(net), 0) AS total_net_cents
FROM public.balance_transactions
WHERE type = 'charge'
  AND environment = 'test'
GROUP BY organization_id, environment
ORDER BY total_net_cents DESC;
