# FluxPay — fontes de verdade (MongoDB × Supabase)

## Arquitetura final

| Domínio | Store |
|---------|-------|
| Score persistido/cache | **MongoDB** (`org_scores`) |
| Ranking (participantes/metadados) | **MongoDB** (`ranking_participants`) |
| Perfil Público | **MongoDB** (`public_profiles`) |
| Payments / vendas | **Supabase** |
| Saldo | **Supabase** |
| Ledger | **Supabase** |
| Balance transactions | **Supabase** |
| Pix financeiro | **Supabase** |
| Reconciliação | **Supabase** |

Score, Ranking e Perfil Público **consultam** dados financeiros no Supabase quando necessário (volume, cálculo do Score, total vendido). O resultado auxiliar fica no MongoDB.

---

## Supabase (PostgreSQL) — sistema financeiro e identidade

| Dado | Tabela / origem |
|------|------------------|
| Pagamentos PIX | `payments` |
| Ledger / saldo | `balance_transactions`, RPC `get_organization_balance` |
| Refunds, disputes | tabelas financeiras existentes |
| Auth / membros / orgs | `auth.users`, `organizations`, `organization_members` |
| API keys (hash) | `api_keys` |
| Webhooks | endpoints + deliveries |
| Cálculo do Score | `computeFluxPayScore` sobre `payments` — **nunca editável pelo usuário** |
| Volume ranking (org real) | `SUM(payments.amount)` onde `status = succeeded` e `environment = live` |
| Total vendido (perfil) | mesmo critério succeeded/live |

Colunas legadas em `organizations` (`public_bio`, `public_work`, `public_avatar_url`, `public_profile_enabled`, `public_display_name`) **não são apagadas**. A fonte de leitura/escrita do Perfil Público é MongoDB `public_profiles`; o código pode fazer seed one-time a partir dessas colunas.

---

## MongoDB Atlas — auxiliares

Database: `fluxpay`  
Variáveis (somente backend / secret store): `MONGODB_URI`, `MONGODB_DB=fluxpay`  
**Nunca** `NEXT_PUBLIC_MONGODB_*`.

### Collection `ranking_participants`

| Campo | Fonte de verdade | Notas |
|-------|------------------|-------|
| `id` | Mongo | UUID estável da API |
| `organization_id` | Mongo (ref) | UUID da org no Supabase; null = participante manual |
| `display_name` | Mongo | ADM |
| `avatar_url` | Mongo | ADM |
| `manual_amount_cents` | Mongo | **Só** se `organization_id` é null; ADM define |
| `is_active` | Mongo | ADM |
| `score_override` | Mongo | Excepcional ADM no ranking; **não** é o Score oficial da org |
| **volume exibido (org)** | **Supabase payments** | Nunca persistido no Mongo como verdade |
| **score exibido** | **Backend Score** | Calculado de payments; cache em `org_scores` |

### Collection `org_scores`

Cache auxiliar do FluxPay Score. TTL lógico ~5 min. Sempre recalculável de `payments`.

| Campo | Notas |
|-------|-------|
| `organization_id` + `environment` | chave única |
| `score`, `level`, `factors`, … | resultado do cálculo |
| `calculated_at` | para invalidação de cache |

**Não** é fonte financeira. Frontend não edita.

### Collection `public_profiles`

| Campo | Notas |
|-------|-------|
| `organization_id` | unique |
| `slug` | unique |
| `display_name`, `bio`, `work`, `avatar_url` | públicos |
| `enabled` | perfil visível em `/u/:slug` |
| `member_since` | metadado de exibição |

Total vendido e Score **não** são armazenados como verdade financeira aqui — derivados do Supabase/Score no momento da leitura.

### Índices

Script: `node backend/scripts/mongo-ensure-indexes.mjs` (com `MONGODB_URI` no ambiente).

### O que NÃO existe no Mongo

Collections financeiras, ledger, API keys, webhooks secrets, saldo, Score como verdade financeira.

---

## Disponibilidade

1. Sem `MONGODB_URI` → ranking/perfil usam fallback Supabase (compatibilidade dev); produção deve definir Mongo.
2. Com `MONGODB_URI` e cluster OK → Mongo é store principal auxiliar.
3. Com `MONGODB_URI` e cluster **fora** → **HTTP 503** explícito (sem board vazio fingindo sucesso).

## Secrets

- `MONGODB_URI`, `MONGODB_DB` só no backend / secret store.
- Nunca `NEXT_PUBLIC_MONGODB_*`, nunca Git, nunca resposta de API, nunca log da URI completa.
