# Platform Evolution — status final (feature/platform-evolution)

## Implementado

- MongoDB Atlas: `ranking_participants`, `org_scores` (cache Score), `public_profiles`
- Score: cálculo de `payments` (Supabase); cache Mongo TTL 5 min; `GET /dashboard-api/score`
- Ranking: participantes Mongo; volume succeeded/live Supabase; ADM protegido
- Perfil público: Mongo `public_profiles`; total vendido/Score do Supabase; colunas legadas preservadas
- Índices via boot + `backend/scripts/mongo-ensure-indexes.mjs`
- Docs: `docs/DATA_STORES.md`, `docs/PLATFORM_EVOLUTION.md`, `.env.example`

## Deploy

**DEPLOY NÃO REALIZADO.** main não alterada.

## Pendências externas (operador)

1. Aplicar migration 021 no Supabase se ainda não aplicada (staging primeiro)
2. Definir `MONGODB_URI` + `MONGODB_DB=fluxpay` no secret store do backend
3. Rodar `node backend/scripts/mongo-ensure-indexes.mjs` uma vez
4. Rotacionar credencial Mongo se foi exposta
5. Validar local: typecheck, test, build
6. Deploy **somente** após autorização explícita
