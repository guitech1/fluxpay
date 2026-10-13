# Checklist — último deploy (https://usefluxpay.com)

## Antes do merge / deploy

- [ ] Branch `feature/ultima-atualizacao-completa` revista
- [ ] Migration `025_push_subscriptions` aplicada no Supabase
- [ ] Variáveis no Netlify / backend:
  - `API_BASE_URL` e `FRONTEND_URL` (produção, não localhost)
  - `NEXT_PUBLIC_SITE_URL=https://usefluxpay.com`
  - `PROFANUSPAY_API_KEY` / `PROFANUSPAY_WEBHOOK_SECRET` (se usar)
  - `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`
  - `NEXUSPAG_*` existentes
- [ ] `npm install` no monorepo (inclui `web-push`)
- [ ] `npm run test --workspace=backend`
- [ ] `npm run build --workspace=backend` e `npm run build --workspace=frontend`
- [ ] Imagem homepage: `NEXT_PUBLIC_HOME_HERO_IMAGE` ou ficheiro em `/public`

## Após o deploy

- [ ] `GET /health`
- [ ] Login + cobrança sandbox
- [ ] Bottom nav mobile
- [ ] Activar push no perfil e teste de notificação
- [ ] Confirmar ausência de nomes de adquirentes na homepage

## Não fazer

- Deploy automático sem os testes acima
- Cobranças ou saques reais durante validação
