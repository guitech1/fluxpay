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
VAPID_SUBJECT=https://usefluxpay.com
```

Gerar: `npx web-push generate-vapid-keys`

## Migration

`supabase/migrations/20261013211148_create_push_subscriptions_and_notification_log.sql` — alinhada ao histórico remoto já aplicado.\n`supabase/migrations/20261013211556_harden_push_subscription_table_grants.sql` — regista o hardening de permissões já aplicado.

## Dependência

`web-push` no `backend/package.json` e no `package-lock.json`. As variáveis VAPID foram configuradas no Netlify sem guardar os valores neste repositório; a chave privada tem escopo de Functions/Runtime. O envio real ainda requer uma subscrição de navegador válida e teste manual em produção após um deploy aprovado.
