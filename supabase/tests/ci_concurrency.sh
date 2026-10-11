#!/usr/bin/env bash
set -euo pipefail

: "${PGPASSWORD:=postgres}"
export PGPASSWORD

PSQL=(psql -h localhost -U postgres -d fluxpay_test -v ON_ERROR_STOP=1)

# PIX confirmation: two independent sessions contend on the same pending payment.
${PSQL[@]} -c "INSERT INTO public.payments
  (id, organization_id, environment, amount, currency, status, payment_type, fee_amount, net_amount, description)
  VALUES ('11111111-1111-4111-8111-111111111111',
          '00000000-0000-0000-0000-000000000000', 'test', 1000, 'BRL',
          'pending', 'pix', 0, 1000, 'synthetic concurrent PIX');"

(
  "${PSQL[@]}" -c "BEGIN;
    SELECT public.fluxpay_confirm_pix_payment(
      '11111111-1111-4111-8111-111111111111',
      '00000000-0000-0000-0000-000000000000', 'test');
    SELECT pg_sleep(1.5);
    COMMIT;" > /tmp/fluxpay-pix-session-a.log
) &
pix_a=$!
sleep 0.2
"${PSQL[@]}" -c "SELECT public.fluxpay_confirm_pix_payment(
  '11111111-1111-4111-8111-111111111111',
  '00000000-0000-0000-0000-000000000000', 'test');" > /tmp/fluxpay-pix-session-b.log
wait "$pix_a"

pix_state=$("${PSQL[@]}" -Atc "SELECT status::text || ':' || count(bt.id)
  FROM public.payments p
  LEFT JOIN public.balance_transactions bt ON bt.payment_id = p.id AND bt.type = 'charge'
  WHERE p.id = '11111111-1111-4111-8111-111111111111'
  GROUP BY p.status;")
test "$pix_state" = "succeeded:1"

# Refund cap: two different keys race for 600 of a 1000 payment. One pending
# reservation must make the second session fail closed instead of oversubscribing.
"${PSQL[@]}" -c "INSERT INTO public.payments
  (id, organization_id, environment, amount, currency, status, payment_type, fee_amount, net_amount, description)
  VALUES ('22222222-2222-4222-8222-222222222222',
          '00000000-0000-0000-0000-000000000000', 'test', 1000, 'BRL',
          'succeeded', 'card', 0, 1000, 'synthetic concurrent refund');"

(
  "${PSQL[@]}" -c "BEGIN;
    SELECT public.fluxpay_reserve_refund(
      '22222222-2222-4222-8222-222222222222',
      '00000000-0000-0000-0000-000000000000', 'test', 600,
      'concurrent-refund-a', 'concurrency A', '{}'::jsonb);
    SELECT pg_sleep(1.5);
    COMMIT;" > /tmp/fluxpay-refund-session-a.log
) &
refund_a=$!
sleep 0.2
if "${PSQL[@]}" -c "SELECT public.fluxpay_reserve_refund(
  '22222222-2222-4222-8222-222222222222',
  '00000000-0000-0000-0000-000000000000', 'test', 600,
  'concurrent-refund-b', 'concurrency B', '{}'::jsonb);" > /tmp/fluxpay-refund-session-b.log 2>&1; then
  echo "ERROR: concurrent refund reservation unexpectedly succeeded" >&2
  kill "$refund_a" 2>/dev/null || true
  exit 1
fi
wait "$refund_a"
grep -q "unresolved refund exists" /tmp/fluxpay-refund-session-b.log
refund_state=$("${PSQL[@]}" -Atc "SELECT count(*) || ':' || COALESCE(sum(amount),0)
  FROM public.refunds
  WHERE payment_id = '22222222-2222-4222-8222-222222222222' AND status = 'pending';")
test "$refund_state" = "1:600"

echo "PASS: concurrent PIX confirmation produced one charge; concurrent refund reservation failed closed at 600/1000."
