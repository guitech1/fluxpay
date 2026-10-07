# FluxPay Platform Evolution — Branch feature/platform-evolution

**DEPLOY NÃO REALIZADO.**

## Branch

`feature/platform-evolution` (não mergeado em `main`).

## Implementado (backend + migration + UI parcial/completa)

### 1. FluxPay Card — recibo
- Causa: `load()` forçava `setView("main")` após transferência.
- Correção: `load({ preserveView: true })` após sucesso; recibo só fecha no botão Fechar; botão "Reabrir ultimo recibo".

### 2. Migration 021
Arquivo: `supabase/migrations/20261007120000_021_platform_evolution.sql`
- Campos públicos em `organizations` (bio, work, avatar, profile enabled, display name)
- `ranking_seasons`, `ranking_participants`
- `organization_vaults`, `organization_vault_movements`
- `risk_alerts`
- RPCs: `get_public_seller_profile`, `get_org_succeeded_sales_stats`, `fluxpay_vault_allocate`
- RLS adequado (writes via service_role)

**PENDENTE:** aplicar migration no Supabase do projeto.

### 3. FluxPay Score
- `backend/src/services/score.ts` — cálculo só com dados reais (volume succeeded, count, approval rate, tenure, consistency)
- Níveis: Bronze / Prata / Ouro / Elite
- Rota: `GET /dashboard-api/score`
- UI: `ScoreBadge`, integrado ao perfil

### 4. Ranking
- `backend/src/services/ranking.ts`
- Público: `GET /v1/ranking`
- ADM: `/admin-api/ranking/participants` CRUD
- Valor org = soma payments succeeded live
- Manual = `manual_amount_cents` (ADM)
- Empate determinístico
- UI: `/ranking` com pódio 3D CSS (perspective, camadas, iluminação, reflexo)

### 5. Perfil público
- `GET /v1/u/:slug`
- Dashboard: `/dashboard/profile`
- Página: `/u/[slug]`
- Total vendido calculado; Score; ranking position

### 6. Payment Links — personalização
- Metadata: `appearance_color`, `appearance_theme`, `appearance_message`
- Validação backend (cor #RRGGBB, temas whitelist, mensagem sem HTML)
- Sem tabela nova

### 7. Cofres
- Alocação interna vs saldo disponível real (RPC atômica)
- Não altera ledger
- UI: `/dashboard/vaults`

### 8. Risk Radar
- Sinais informativos (volume spike/drop, approval drop, cancelamentos, refunds)
- `GET /dashboard-api/risk-radar`
- UI: `/dashboard/risk`
- Sem bloqueio automático

### 9. Developer Center
- Hub: `/dashboard/developers`
- Sidebar reorganizada (API Keys, Webhooks, Logs, Docs)
- Páginas existentes reutilizadas

### 10. Labs
- `/labs` — área experimental isolada

### 11. MongoDB
- **Não utilizado** — ranking e analytics em Supabase para evitar dependência nova.

## Arquivos principais criados/modificados

### Criados
- supabase/migrations/20261007120000_021_platform_evolution.sql
- backend/src/services/score.ts, ranking.ts, public-profile.ts, vaults.ts, risk-radar.ts
- backend/src/routes/score-dashboard.ts, ranking-public.ts, ranking-admin.ts, profile-dashboard.ts, profile-public.ts, vaults-dashboard.ts, risk-dashboard.ts
- frontend components: ScoreBadge, RankingPodium, VaultsClient, RiskRadarClient, ProfileSettingsClient
- pages: /ranking, /u/[slug], /labs, /dashboard/vaults, /dashboard/risk, /dashboard/profile, /dashboard/developers
- backend/tests/score.test.ts
- PLATFORM_EVOLUTION.md

### Modificados
- backend/src/index.ts (rotas novas)
- backend/src/services/payment-links.ts + routes (appearance)
- frontend FluxPayCardClient (recibo)
- frontend Sidebar

## Testes
- score.test.ts (níveis) — lógica pura
- Demais testes existentes não reexecutados aqui (sem node_modules no ambiente de auditoria)
- Typecheck/build: **NÃO EXECUTADO** — ambiente sem npm install completo contra o repo privado

## Variáveis de ambiente novas
Nenhuma obrigatória. MongoDB não introduzido.

## Configuração manual necessária
1. Aplicar migration 021 no Supabase
2. Revisar branch `feature/platform-evolution`
3. Testar visualmente ranking, perfil, cofres, risk, recibo
4. Só mergear em main / deploy após autorização explícita

## Status por funcionalidade

| Item | Status |
|------|--------|
| Recibo FluxPay Card | CONCLUÍDO |
| Score backend + badge | CONCLUÍDO |
| Ranking + ADM API + pódio | CONCLUÍDO |
| Perfil público | CONCLUÍDO |
| Payment link theme (backend) | CONCLUÍDO |
| Payment link theme UI campos | PARCIAL (API aceita; formulário frontend pode ainda precisar dos inputs color/theme/message no PaymentLinksClient) |
| Cofres | CONCLUÍDO |
| Risk Radar | CONCLUÍDO |
| Developer Center hub | CONCLUÍDO |
| API Explorer interativo full | PARCIAL (hub + docs existentes; explorer executável completo depende de expansão da página /dashboard/api) |
| Docs PDF profissional | PARCIAL (markdown download existente; PDF tipográfico completo pendente) |
| Docs API expandida | BASE existente mantida; expansão incremental |
| Labs | CONCLUÍDO |
| MongoDB | NÃO USADO (proposital) |

## Riscos
- Migration 021 precisa ser aplicada antes das rotas novas funcionarem no banco vivo
- Ranking vazio até ADM adicionar participantes
- Checkout precisa ler metadata de appearance para aplicar tema no UI de checkout (próximo passo se ainda não refletido na página de checkout)

IMPLEMENTAÇÃO COMPLETA CONCLUÍDA — DEPLOY NÃO REALIZADO.
