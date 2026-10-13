# ProfanusPay — integração FluxPay

## Documentação oficial

https://profanuspay.com/docs

Base URL documentada: `https://nexuspag.com`

## Credenciais (apenas variáveis de ambiente)

| Variável | Uso |
|----------|-----|
| `PROFANUSPAY_API_KEY` | Header `x-api-key` nas chamadas server-to-server |
| `PROFANUSPAY_WEBHOOK_SECRET` | Validação HMAC dos webhooks (`x-webhook-signature`) |
| `PROFANUSPAY_BASE_URL` | Opcional; default `https://nexuspag.com` |

## Ativação

1. Preencher as variáveis no ambiente de deploy (Netlify / backend).
2. Incluir `profanuspay` em `FLUXPAY_ACTIVE_ACQUIRERS` se desejar no pool.
3. Na área **admin → adquirentes**, habilitar e definir prioridade (não altera o padrão dos lojistas automaticamente).
4. O nome "ProfanusPay" só aparece na área de gestão de adquirentes; interfaces públicas e do comerciante usam apenas a marca FluxPay.

## Endpoints usados (conforme docs)

- `POST /api/pix/create` — criar cobrança PIX
- `GET /api/pix/{id}` — consultar (id, txid ou external_id)
- Webhook `payment.confirmed` com assinatura `t=<unix>,v1=<hmac>`

## Idempotência

`external_id` na criação evita cobranças duplicadas no fornecedor. A FluxPay grava o pagamento local antes da chamada ao adquirente.

## Testes

Usar respostas simuladas nos testes unitários; não executar cobranças reais.
