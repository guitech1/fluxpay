# Platform Evolution — status final (feature/platform-evolution)

## Implementado

- MongoDB Atlas integration (ranking_participants) with explicit 503 when URI set and offline
- Partial unique index uq_org_active via boot + script `backend/scripts/mongo-ensure-indexes.mjs`
- Ranking ADM + public board; volume from Supabase succeeded live payments only
- FluxPay Score backend-only (GET /dashboard-api/score); levels unit-tested
- Public profile /u/[slug] via Supabase organizations (no Mongo duplicate)
- Payment links appearance (color/theme/message) + checkout applies appearance
- Cofres via RPC fluxpay_vault_allocate (ledger untouched)
- Risk Radar informational backend
- Developer Center: API keys, webhooks, logs, Explorer, docs HTML download
- Labs isolated banner
- FluxPay Card receipt: preserveView + keep receipt on close + reopen
- docs/DATA_STORES.md source-of-truth map

## Deploy

DEPLOY NAO REALIZADO. main nao alterada. Netlify nao tocada.

## Pendencias externas (voce)

1. Aplicar migration `supabase/migrations/20261007120000_021_platform_evolution.sql` no Supabase (staging primeiro)
2. Definir `MONGODB_URI` + `MONGODB_DB=fluxpay` no secret store do backend
3. Rodar `node backend/scripts/mongo-ensure-indexes.mjs` uma vez (cria uq_org_active)
4. Validar local: typecheck, test, build
