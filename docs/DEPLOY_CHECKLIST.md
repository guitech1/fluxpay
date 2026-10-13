# Checklist — último deploy (https://usefluxpay.com)

## Validação local (2026-10-13)

- [x] Backend typecheck (`tsc --noEmit`) — OK
- [x] Backend tests — 111 pass / 0 fail (incl. ProfanusPay, saque MAX, push keys, fee)
- [x] Frontend `next build` — OK
- [x] CI no PR #9 (após types web-push): backend, frontend, postgres-regression — success
- [x] Netlify deploy preview — success

## Antes do merge / deploy produção

- [ ] Migration `20261013200000_025_push_subscriptions` aplicada no Supabase
- [ ] Migration `20261013210000_026_profanuspay_acquirer` aplicada no Supabase
- [ ] Variáveis Netlify/backend:
  - `API_BASE_URL` e `FRONTEND_URL` (produção)
  - `NEXT_PUBLIC_SITE_URL=https://usefluxpay.com`
  - `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`
  - `PROFANUSPAY_*` (só se for activar)
  - `NEXUSPAG_*` existentes
- [ ] `package-lock.json` com `web-push` commitado (após `npm install` local)
- [ ] Imagem homepage (`NEXT_PUBLIC_HOME_HERO_IMAGE`) se disponível
- [ ] Smoke: login, cobrança sandbox, push teste

## Não fazer

- Merge sem revisão humana
- Deploy de produção automático
- Aplicar migrations em produção sem backup
- Cobranças ou saques reais durante validação
