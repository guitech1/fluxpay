# Notificações Web Push — FluxPay

## Eventos

| Evento | Título | Mensagem |
|--------|--------|----------|
| PIX gerado | NOVO PIX GERADO! ⏳📋 | Aguardando o cliente concluir o pagamento. |
| Venda paga | 💰 Venda Paga | DINHEIRO NA TELA! 🤑🔥 Pagamento aprovado! Bora vender mais! |

O evento de venda paga só é enviado após confirmação confiável no backend (webhook do adquirente / reconciliação), nunca apenas pelo frontend.

## Variáveis

```
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:suporte@usefluxpay.com
```

Gerar: `npx web-push generate-vapid-keys`

## Pendências de implementação completa

- Tabela `push_subscriptions` (user_id, endpoint, keys, created_at) + RLS
- Rotas: POST/DELETE `/dashboard-api/push/subscribe`, POST `/dashboard-api/push/test`
- Envio no fluxo de createPayment (PIX gerado) e no handler de payment.succeeded
- Idempotência: não reenviar o mesmo event_id
- UI de permissão no login/signup e secção Notificações no perfil (testes de demonstração)

Scaffold de env e documentação preparados nesta entrega; o service worker existente (`public/sw.js`) precisa de handler `push` e `notificationclick`.
