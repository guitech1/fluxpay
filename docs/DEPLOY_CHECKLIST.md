# Checklist — último deploy (usefluxpay.com)

## Antes do deploy

- [ ] Branch `feature/ultima-atualizacao-completa` revista e mergeada
- [ ] Variáveis novas no Netlify / backend:
  - `PROFANUSPAY_API_KEY` / `PROFANUSPAY_WEBHOOK_SECRET` (se usar)
  - `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` (quando push estiver completo)
  - `API_BASE_URL` e `FRONTEND_URL` apontando para produção (não localhost)
  - Confirmar `NEXT_PUBLIC_SITE_URL=https://usefluxpay.com` no frontend
- [ ] Imagem da homepage: definir `NEXT_PUBLIC_HOME_HERO_IMAGE` ou ficheiro em `/public/images/home-hero.webp`
- [ ] Migration de `push_subscriptions` (se aplicável) aplicada no Supabase
- [ ] `npm run test` (backend) e `npm run build` (frontend) locais ou CI
- [ ] Não executar cobranças/saques reais nos testes

## Após o deploy

- [ ] Health `/health`
- [ ] Login + criar cobrança sandbox
- [ ] Webhook de teste (se configurado)
- [ ] Bottom nav mobile e modal de saque (só live)
- [ ] Confirmar que nomes de adquirentes não aparecem na homepage/dashboard comum
