# Notificações Web Push — FluxPay

## Eventos reais

| Evento | Título | Mensagem | Origem |
|--------|--------|----------|--------|
| PIX gerado | NOVO PIX GERADO! ⏳📋 | Aguardando o cliente concluir o pagamento. | Após createPayment com QR (backend) |
| Venda paga | 💰 Venda Paga | DINHEIRO NA TELA! 🤑🔥 (+ valor) Pagamento aprovado! | Após status succeeded confirmado no backend |

Idempotência: `push_notification_log.event_key` único (`pix_generated:{paymentId}`, `sale_paid:{paymentId}`).

## Rotas (dashboard-api)

- `GET /dashboard-api/push/vapid-public-key`
- `GET /dashboard-api/push/status`
- `POST /dashboard-api/push/subscribe`
- `DELETE /dashboard-api/push/subscribe`
- `POST /dashboard-api/push/test` — demonstração (rate limit 5/min); não cria cobrança nem altera saldo

## Variáveis

```
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:suporte@usefluxpay.com
```

Gerar: `npx web-push generate-vapid-keys`

## Migration

`supabase/migrations/20261013200000_025_push_subscriptions.sql` — aplicar no Supabase antes de produção.

## Dependência

`web-push` no `backend/package.json`. Se ausente em runtime, o envio regista warning e não quebra pagamentos.
