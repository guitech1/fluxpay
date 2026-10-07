# FluxPay — fontes de verdade (MongoDB × Supabase)

## Supabase (PostgreSQL) — sistema financeiro e identidade

| Dado | Tabela / origem |
|------|------------------|
| Pagamentos PIX | `payments` |
| Ledger / saldo | `balance_transactions`, RPC `get_organization_balance` |
| Refunds, disputes | tabelas financeiras existentes |
| Auth / membros / orgs | `auth.users`, `organizations`, `organization_members` |
| API keys (hash) | `api_keys` |
| Webhooks | endpoints + deliveries |
| Perfil público (bio, work, slug, avatar) | colunas em `organizations` |
| Cofres | `organization_vaults` + RPC `fluxpay_vault_allocate` |
| Score (cálculo) | `computeFluxPayScore` sobre `payments` — **nunca editável** |
| Volume ranking (org real) | `SUM(payments.amount)` onde `status = succeeded` e `environment = live` |

## MongoDB Atlas — auxiliares de Ranking

Database: `fluxpay`  
User: `fluxpay_app` (readWrite **somente** neste database)

### Collection `ranking_participants`

| Campo | Fonte de verdade | Notas |
|-------|------------------|-------|
| `id` | Mongo | UUID estável da API |
| `organization_id` | Mongo (ref) | UUID da org no Supabase; null = participante manual |
| `display_name` | Mongo | ADM |
| `avatar_url` | Mongo | ADM |
| `manual_amount_cents` | Mongo | **Só** se `organization_id` é null; ADM define |
| `is_active` | Mongo | ADM ativa/desativa |
| `score_override` | Mongo | Excepcional ADM; preferir null |
| **volume exibido (org)** | **Supabase payments** | Nunca persistido no Mongo como verdade |
| **score exibido** | **Backend Score** | Calculado; não confiar no frontend |

### Índices

- `uq_id` — unique em `id`
- `org_active` — `{ organization_id, is_active }`
- `active_created` — `{ is_active, created_at }`
- `uq_org_active` — unique **parcial** em `organization_id` onde `organization_id` é string e `is_active: true` (permite vários `null`)

Script: `node backend/scripts/mongo-ensure-indexes.mjs` (com `MONGODB_URI` no ambiente).

### O que NÃO existe no Mongo

Collections financeiras, ledger, API keys, webhooks secrets, saldo, Score oficial editável.

## Disponibilidade

1. Sem `MONGODB_URI` → ranking_participants no Supabase (migration 021).
2. Com `MONGODB_URI` e cluster OK → ranking_participants no Mongo.
3. Com `MONGODB_URI` e cluster **fora** → **HTTP 503 explícito** nas rotas de ranking (sem board vazio fingindo sucesso).

## Secrets

- `MONGODB_URI`, `MONGODB_DB` só no backend / secret store.
- Nunca `NEXT_PUBLIC_MONGODB_*`, nunca Git, nunca resposta de API, nunca log da URI completa.
