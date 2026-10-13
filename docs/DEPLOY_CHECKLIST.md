# Checklist — último deploy (https://usefluxpay.com)

## Validação confirmada (2026-10-13)

- [x] CI do PR #9: backend (lint, typecheck, testes e build) — sucesso
- [x] CI do PR #9: frontend (typecheck, lint e build) — sucesso
- [x] CI do PR #9: regressão PostgreSQL, migrations e testes concorrentes — sucesso
- [x] Deploy preview verificado pelo CI — sucesso
- [x] Supabase: migrations de Web Push e ProfanusPay registradas/aplicadas
  - `20261013211148_create_push_subscriptions_and_notification_log`
  - `20261013211153_seed_profanuspay_acquirer_disabled`
  - `20261013211556_harden_push_subscription_table_grants`
  - `20261013221114_harden_trigger_function_search_path`
- [x] Supabase: `profanuspay` permanece desativado (`enabled=false`)
- [x] Supabase: tabelas de eventos e notificações verificadas com RLS habilitado

## Antes do merge / deploy de produção

- [ ] Corrigir configuração de runtime antes do release. Na auditoria do projeto Netlify que publica `usefluxpay.com`, não aparecem estas variáveis necessárias ao backend/Push: `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PRIVATE_KEY` e segredos de API/webhook dos adquirentes. Confirmar primeiro qual projeto executa o backend; não inventar nem sobrescrever segredos.
- [ ] Conferir no painel Netlify as variáveis de produção:
  - `API_BASE_URL` e `FRONTEND_URL`
  - `NEXT_PUBLIC_SITE_URL=https://usefluxpay.com`
  - `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
  - segredos dos adquirentes ativos (ProfanusPay deve continuar desativado até validação própria)
  - nunca registrar valores secretos neste arquivo ou nos logs
- [ ] Ativar Supabase Auth > Password Security > leaked password protection
- [ ] Revisar permissões dos RPCs sinalizados pelo Security Advisor; preservar acesso público apenas onde for intencional (perfil público e estado de manutenção)
- [ ] Smoke test no navegador: login, cobrança sandbox e notificação push de teste
- [ ] Revisão humana final e autorização explícita antes de merge/deploy

## Segurança de release

- Não fazer merge sem aprovação humana.
- Não publicar em produção sem autorização explícita.
- Não aplicar migrations de produção sem backup.
- Não realizar cobranças ou saques reais durante validação.
