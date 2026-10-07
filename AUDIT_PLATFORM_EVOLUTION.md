# Auditoria completa — FluxPay Platform Evolution

Branch auditada: `feature/platform-evolution`
Data da auditoria: 2026-10-07

## 1. Mapa do sistema

### Financeiro (fonte de verdade = Supabase/PostgreSQL)
- `payments`, `refunds`, `balance_transactions`, `ledger` via RPCs
- Providers: NexusPag (live), sandbox (test)
- Isolamento: organization_id + environment (test|live)
- RLS em tabelas financeiras; writes sensiveis via service_role / backend

### Autenticacao / autorizacao
- Supabase Auth (sessao)
- API Keys (hash SHA-256, prefix, sk_test_/sk_live_)
- sessionAuth (dashboard), apiKeyAuth (/v1), platformAdminAuth (/admin-api)
- Roles org: owner, admin, developer, viewer
- Roles ADM: superadmin, admin, support

### O que ja existe na branch (implementado)
| Area | Backend | Frontend | Store |
|------|---------|----------|-------|
| Score | services/score.ts + GET /dashboard-api/score | ScoreBadge, profile | Calculado de payments |
| Ranking | ranking.ts + public/admin routes | /ranking, /admin/ranking, podium | Supabase ranking_* (+ Mongo opcional) |
| Perfil publico | public-profile.ts + /v1/u/:slug | /u/[slug], /dashboard/profile | orgs fields + Mongo opcional |
| Payment links appearance | metadata + checkout appearance | form + checkout theme | checkout_sessions.metadata |
| Cofres | vaults.ts + RPC fluxpay_vault_allocate | /dashboard/vaults | organization_vaults |
| Risk Radar | risk-radar.ts | /dashboard/risk | calculado |
| Developer Center | reusa api keys/webhooks/logs | /dashboard/developers, /api | — |
| API Explorer | — | componente em /dashboard/api | endpoints reais |
| Labs | — | /labs | isolado |
| FluxPay Card recibo | — | preserveView fix | — |
| Docs | api-docs-content.ts | ApiDocs + HTML download | — |

### MongoDB Atlas — achado critico

**No repositorio FluxPay (main e feature/platform-evolution):**
- ZERO imports de `mongodb` / `mongoose`
- ZERO `MONGODB_URI` em env.ts ou .env.example (ate esta rodada)
- ZERO collections/services/repositories MongoDB
- backend/package.json: apenas Supabase + Express

Conclusao: a conta MongoDB Atlas que voce criou **nao estava conectada ao codigo**.
A implementacao previa usou tabelas Supabase (migration 021) para ranking/perfil.

Acao nesta rodada:
- Adicionar cliente MongoDB **opcional** (`MONGODB_URI`)
- Collections: `ranking_participants`, `public_profiles`
- Se URI ausente ou falha de conexao → fallback automatico para Supabase
- Volume/Score **sempre** de `payments` no Supabase

## 2. Lacunas restantes apos auditoria

1. MongoDB nao estava no codigo → camada opcional adicionada
2. Score nao aparecia na visao geral do dashboard → integrar
3. Migration 021 nao aplicada no projeto Supabase vivo (PENDENTE)
4. Typecheck/build nao executaveis neste ambiente (sem clone autenticado + node_modules)
5. Credenciais MongoDB precisam ser configuradas por voce (MONGODB_URI) se quiser usar Atlas

## 3. O que NAO sera feito
- Deploy / Netlify / merge main
- Aplicar migration em producao
- Usar MongoDB como ledger
- Inventar endpoints
