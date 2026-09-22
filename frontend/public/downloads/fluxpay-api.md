# FluxPay API

## Autenticação

Use uma chave secreta do ambiente correspondente:

`Authorization: Bearer sk_test_...` ou `Authorization: Bearer sk_live_...`

Nunca exponha a chave secreta no frontend.

## PIX

- `POST /v1/payments`
- `GET /v1/payments`
- `GET /v1/payments/:id`
- `POST /v1/payments/:id/cancel`
- `POST /v1/payments/:id/refund`
- `GET /v1/balance`

Valores monetários são enviados em centavos.

## Webhooks de saída

Cadastre endpoints com `POST /v1/webhooks/endpoints`. Eventos de pagamento usam HMAC no header `FluxPay-Signature`.

## KYC por organização

KYC é opcional e configurado por organização pela equipe administrativa.

### Dashboard

`POST /dashboard-api/kyc/start`

Body:

```json
{
  "document": "CPF ou CNPJ sem pontuação",
  "document_type": "CPF"
}
```

A API chama a NexusPag, cria uma verificação de R$ 2,00 e retorna QR Code/copia-e-cola. O número completo do documento nunca é devolvido ao frontend.

`GET /dashboard-api/kyc/status`

Retorna o status da organização e a última verificação sem o documento completo.

### Saques

O saque continua em `POST /dashboard-api/withdrawals`. O mínimo é R$ 10,00. Se a organização exigir KYC, o saque retorna `403` com `error.type = "kyc_required"` enquanto o status não for `verified`.

### Webhook NexusPag

Configure a URL pública:

`POST /v1/webhooks/nexuspag`

Eventos KYC aceitos incluem `kyc.verified`, `kyc.approved`, `kyc.rejected` e variantes equivalentes documentadas pelo adquirente.

## Segurança

- Isolamento por `organization_id`.
- CPF/CNPJ completo somente no backend.
- Idempotência de KYC por `organization_id + external_id`.
- Aprovação manual somente por `platform_admin` com papel `admin` ou `superadmin`.
- A chave `NEXUSPAG_API_KEY` nunca é enviada ao navegador.
