# FluxPay Platform Evolution — Branch feature/platform-evolution

**DEPLOY NÃO REALIZADO nesta documentação.**

## Arquitetura de stores (final)

| Domínio | Store |
|---------|-------|
| Score persistido/cache | MongoDB `org_scores` |
| Ranking participantes | MongoDB `ranking_participants` |
| Perfil Público | MongoDB `public_profiles` |
| Payments, saldo, ledger, PIX | Supabase |

Cálculo do Score e volume do ranking **sempre** usam `payments` no Supabase (`status=succeeded`, ranking com `environment=live`).

## Score

- `backend/src/services/score.ts` — `computeFluxPayScore`
- Origem: Supabase `payments`
- Cache auxiliar: Mongo `org_scores` (TTL ~5 min; recálculo automático)
- Endpoint: `GET /dashboard-api/score`
- Não editável pelo usuário; `score_override` do Ranking não é o Score oficial

## Ranking

- Participantes: Mongo `ranking_participants` (principal)
- Volume: Supabase payments succeeded + live
- Público: `GET /v1/ranking`
- ADM: `/admin-api/ranking/participants` (platformAdminAuth)
- Fallback Supabase apenas se `MONGODB_URI` ausente (dev/compat)

## Perfil Público

- Store: Mongo `public_profiles`
- Leitura: `GET /v1/u/:slug`
- Edição: `PATCH /dashboard-api/profile` (owner/admin, isolado por org)
- Total vendido / Score: derivados do Supabase + Score backend
- Colunas legadas em `organizations` preservadas (seed one-time; não apagadas)

## Migration 021

Arquivo no repo: `supabase/migrations/20261007120000_021_platform_evolution.sql`  
Não afirmar aplicação em produção sem acesso ao banco.

## Variáveis

```
MONGODB_URI=   # secret backend only
MONGODB_DB=fluxpay
```

Nunca `NEXT_PUBLIC_MONGODB_*`.

## Deploy

Publicação somente após autorização explícita. main não alterada por este trabalho.
