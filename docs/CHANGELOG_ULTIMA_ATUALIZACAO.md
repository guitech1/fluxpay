# Changelog — feature/ultima-atualizacao-completa

## Implementado

### Adquirentes
- Provider `profanuspay` (nexus-like, docs profanuspay.com)
- Tipos, routing, pool default, listAcquirerConfigs
- Migration seed `acquirer_cost_config` (enabled=false, priority 15)
- Credenciais: `PROFANUSPAY_API_KEY`, `PROFANUSPAY_WEBHOOK_SECRET`, `PROFANUSPAY_BASE_URL`

### Web Push
- Migration `push_subscriptions` + `push_notification_log`
- Serviço `push.ts` + rotas `/dashboard-api/push/*`
- Hooks em `createPayment` e `markPixPaymentSucceeded`
- SW `push` + `notificationclick`
- UI perfil + banner pós-login
- Testes de demonstração com rate limit
- Dependência `web-push`

### Homepage
- `HeroImageSlot` entre texto de teste e benefícios

### Mobile
- Bottom nav 6 itens + padding layout

### Saque
- Frontend: MAX = saldo − R$ 3, só PIX, min R$ 10
- Backend: taxa `WITHDRAWAL_FEE_CENTS = 300`
- `correlation_id` opcional no body (UUID gerado no servidor se omitido)

### Domínio
- CORS: `usefluxpay.com`, `www.usefluxpay.com`

### Testes no repositório
- `backend/tests/withdraw-max.test.ts`
- `backend/tests/profanuspay.test.ts`

## Pendências externas

1. Aplicar migrations 025 e 026 no Supabase
2. Definir VAPID e PROFANUSPAY_* no Netlify
3. `npm install` + `npm test` + builds no CI/local
4. Imagem definitiva homepage (`NEXT_PUBLIC_HOME_HERO_IMAGE`)
5. Melhoria visual extra da documentação API (conteúdo actual já cobre endpoints reais)
6. Não fazer deploy de produção nesta branch sem checklist
