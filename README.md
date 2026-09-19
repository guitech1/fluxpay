# FluxPay

Gateway de pagamentos moderna, segura e escalável.

## Visão geral

FluxPay permite que empresas e desenvolvedores recebam pagamentos através de uma API própria, com:

- Checkout hospedado
- Gerenciamento de transações, clientes e reembolsos
- Webhooks com assinatura e retry
- Painel administrativo completo
- Separação clara entre ambiente de teste (sandbox) e produção
- Camada de provedor isolada (pronta para conectar adquirentes reais)

## Stack

| Camada        | Tecnologia              |
|---------------|-------------------------|
| Frontend      | Next.js 15 + TypeScript |
| UI            | Tailwind CSS            |
| Backend       | Node.js + Express + TS  |
| Banco         | PostgreSQL (Supabase)   |
| Auth          | Supabase Auth           |
| API           | REST                    |
| Docs          | OpenAPI-ready           |

## Estrutura do projeto

```
fluxpay/
├── frontend/          # Next.js App Router
│   ├── src/app/       # Páginas (dashboard, checkout, docs)
│   ├── src/components/
│   └── public/
├── backend/           # API REST
│   └── src/
│       ├── routes/
│       ├── services/
│       ├── middleware/
│       ├── providers/ # Camada isolada de adquirentes
│       └── config/
├── supabase/
│   └── migrations/    # Schema + RLS
├── docs/
└── README.md
```

## Banco de dados

Migrations em `supabase/migrations/`:

1. **001_initial_schema** – tabelas, enums, índices, triggers
2. **002_rls_policies** – Row Level Security por organização

Tabelas principais:

- `organizations`, `users`, `organization_members`
- `api_keys` (hash SHA-256, prefixo, test/live)
- `customers`, `payment_methods` (apenas tokens)
- `payments`, `refunds`, `disputes`
- `balance_transactions` (ledger)
- `webhook_endpoints`, `webhook_events`, `webhook_deliveries`
- `checkout_sessions`, `api_logs`

**Nunca são armazenados** CVV ou número completo de cartão.

## API REST (v1)

Base URL: `http://localhost:3001`

| Método | Endpoint                      | Descrição                |
|--------|-------------------------------|--------------------------|
| POST   | /v1/payments                  | Criar pagamento          |
| GET    | /v1/payments                  | Listar pagamentos        |
| GET    | /v1/payments/:id              | Consultar pagamento      |
| POST   | /v1/payments/:id/cancel       | Cancelar                 |
| POST   | /v1/payments/:id/refund       | Reembolsar               |
| POST   | /v1/customers                 | Criar cliente            |
| GET    | /v1/customers/:id             | Consultar cliente        |
| POST   | /v1/checkout/sessions         | Criar checkout           |
| GET    | /v1/balance                   | Consultar saldo          |
| POST   | /v1/webhooks/endpoints        | Configurar webhook       |

Autenticação:

```
Authorization: Bearer sk_test_...
```

Idempotência: header `Idempotency-Key` ou campo `idempotency_key`.

### Sandbox

- Valores terminando em **13** centavos → `failed`
- Valores terminando em **50** centavos → `pending`
- Demais → `succeeded`

Nenhum dinheiro real é processado.

## Webhooks

Eventos:

- `payment.created`
- `payment.pending`
- `payment.succeeded`
- `payment.failed`
- `payment.refunded`
- `payment.canceled`

Assinatura: header `FluxPay-Signature: t=<timestamp>,v1=<hmac-sha256>`

Retry automático com backoff exponencial (até 5 tentativas).

## Segurança

- HTTPS (em produção)
- API keys com hash SHA-256
- Rate limiting
- Validação com Zod
- RLS no PostgreSQL
- Idempotency keys
- Separação test/live
- Camada de provedor isolada (sem dados sensíveis de cartão no core)
- Logs de auditoria
- Secrets nunca no frontend

## Como executar localmente

### Pré-requisitos

- Node.js 20+
- Conta Supabase (ou PostgreSQL local)
- npm

### 1. Banco de dados

1. Crie um projeto no [Supabase](https://supabase.com)
2. No SQL Editor, execute na ordem:
   - `supabase/migrations/*_001_initial_schema.sql`
   - `supabase/migrations/*_002_rls_policies.sql`
3. Copie a URL e as chaves (anon + service_role)

### 2. Backend

```bash
cd backend
cp .env.example .env
# Preencha SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY

npm install
npm run dev
# → http://localhost:3001
```

### 3. Frontend

```bash
cd frontend
cp .env.example .env.local
# Preencha NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_API_URL

npm install
npm run dev
# → http://localhost:3000
```

### 4. Gerar uma API Key de teste (manual via SQL)

```sql
-- Após criar uma organization e um user
INSERT INTO api_keys (
  organization_id,
  name,
  key_type,
  environment,
  key_prefix,
  key_hash
) VALUES (
  '<org-uuid>',
  'Sandbox Dev',
  'secret',
  'test',
  'sk_test_',
  encode(sha256('sk_test_your_secret_here'::bytea), 'hex')
);
```

(Em produção use a função `generateApiKey` do backend.)

## Design

- Tema escuro minimalista
- Cor primária: vermelho `#EF4444` (identidade FluxPay)
- Tipografia: Inter + JetBrains Mono
- Responsivo (desktop + mobile)
- Componentes: cards, badges de status, tabelas, gráficos (Recharts)

## Próximos passos (produção)

1. Conectar um adquirente real na pasta `backend/src/providers/`
2. Implementar autenticação completa com Supabase Auth no dashboard
3. Adicionar OpenAPI/Swagger completo (já há estrutura preparada)
4. Job de retry de webhooks (cron / queue)
5. Payouts e extrato detalhado
6. 2FA e permissões granulares de membros

## Licença

Proprietário – FluxPay.
