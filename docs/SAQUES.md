# Saque multi-tenant

## Fluxo
1. Lojista (`owner`/`admin`) solicita em Produção via `POST /dashboard-api/withdrawals`.
2. Backend valida saldo disponível, grava `balance_transactions` (`type=payout`, negativo) e `withdrawal_requests` (`pending`).
3. Admin da plataforma aprova (`POST /admin-api/withdrawals/:id/approve`) ou rejeita (`/reject`).
4. Na aprovação, chama `POST /api/withdrawals` da NexusPag (carteira principal da plataforma).

## Por que não é saque direto no pedido
A carteira NexusPag é da FluxPay (dona da API key), não de cada tenant.

## Migration
`015_withdrawal_requests.sql`
