# FluxPay API

## Autenticação

Use uma chave secreta do ambiente correspondente:
`Authorization: Bearer sk_test_...` ou `Authorization: Bearer sk_live_...`.

Nunca exponha a chave secreta no frontend.

## PIX

- POST /v1/payments
- GET /v1/payments
- GET /v1/payments/:id
- POST /v1/payments/:id/cancel
- POST /v1/payments/:id/refund
- GET /v1/balance

Valores monetários são enviados em centavos.

## Webhooks

Configure os endpoints de saída com POST /v1/webhooks/endpoints.
A entrada do adquirente usa POST /v1/webhooks/nexuspag.

## KYC por organização

KYC é opcional e é configurado individualmente por organização.

### Dashboard

POST /dashboard-api/kyc/start

Body:
```json
{ "document": "CPF ou CNPJ", "document_type": "CPF" }
```

O FluxPay chama a NexusPag para gerar uma verificação PIX de R$ 2,00. O documento completo permanece no backend; respostas para o painel usam document_masked.

GET /dashboard-api/kyc/status

Retorna o status da organização e a última verificação, sem document_number.

### Saques

POST /dashboard-api/withdrawals continua sendo o endpoint de saque. O mínimo é R$ 10,00.
Se a organização exigir KYC e o status não for verified, a API bloqueia com 403 e error.type = kyc_required.

### Admin

GET /admin-api/organizations/:id/kyc

POST /admin-api/organizations/:id/kyc

Body pode conter:
- kyc_required: boolean
- action: approve | reject | reset
- reason/note

Aprovação manual usa approved_via=admin e exige platform_admin com papel admin ou superadmin.

### NexusPag

O backend usa:
- POST /api/kyc/verify
- GET /api/kyc/verify/{id}

Webhooks aceitos incluem kyc.verified e kyc.rejected. O processamento é idempotente por provider_event_id e pela identificação da verificação.

## Segurança

- Isolamento por organization_id.
- RLS limita kyc_verifications à própria organização.
- authenticated pode consultar apenas colunas seguras; document_number não é concedido ao cliente.
- Escrita em kyc_verifications fica no service_role.
- NEXUSPAG_API_KEY nunca vai para o navegador.
