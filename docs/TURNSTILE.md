# Cloudflare Turnstile — FluxPay

Integração da catraca (bot protection) no login, signup e validação server-side.

## Estado atual (2026-10-16)

| Item | Estado |
|------|--------|
| Código `verifyTurnstile` (backend) | Implementado |
| Middleware `requireTurnstile` | Implementado (não montado em webhooks/pagamentos) |
| Widget no frontend (`/login`, `/signup`) | Implementado |
| Widget Cloudflare | **Criado** — FluxPay Login and Signup (Managed) |
| Domínios autorizados | `usefluxpay.com`, `www.usefluxpay.com`, `fluxpay-sohn.netlify.app` |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (Netlify) | **Configurada** |
| `TURNSTILE_SECRET_KEY` (Netlify) | Confirmar no painel (secret; não listar em logs) |
| CAPTCHA no Supabase Auth | **Ação manual** — ver secção 3 |

Site key pública (frontend): `0x4AAAAAAFYivsdujLqwvz6q`

## 1. Widget Turnstile (já criado)

- Nome: FluxPay Login and Signup
- Mode: Managed
- Domínios: usefluxpay.com, www.usefluxpay.com, fluxpay-sohn.netlify.app

Preservar a regra **FluxPay - Block WordPress probe paths**. Não activar Bot Fight Mode global sem avaliar impacto em checkout, APIs e webhooks.

## 2. Variáveis na Netlify

Site: `fluxpay-sohn` (ID `0ee3ea2a-31a0-451b-9fc0-c99802b34e64`).

| Key | Scope | Secret? |
|-----|--------|---------|
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Builds + Functions + Runtime | Não (pública) |
| `TURNSTILE_SECRET_KEY` | Functions + Runtime | **Sim** |

Após alterar env vars: **Clear cache and deploy site** (a Site Key é embutida no build do Next).

## 3. Activar CAPTCHA no Supabase Auth (obrigatório)

Sem isto, o token é enviado mas o GoTrue pode não validá-lo.

1. [Supabase Dashboard](https://supabase.com/dashboard/project/mrfbmndbazeajgyozhfb) → **Authentication** → **Bot and Abuse Protection** (ou Settings → Auth).
2. Enable CAPTCHA protection → Provider: **Cloudflare Turnstile**.
3. Colar a **Secret Key** do widget Turnstile (a mesma de `TURNSTILE_SECRET_KEY`).
4. Save.

O frontend envia `options: { captchaToken }` em `signInWithPassword` e `signUp`.

## 4. Validação no nosso backend

Ficheiro: `backend/src/lib/turnstile.ts`.

- POST `https://challenges.cloudflare.com/turnstile/v0/siteverify`
- Timeout 5s
- Hostname allowlist: `usefluxpay.com`, `www`, previews `*--fluxpay-sohn.netlify.app`
- Fail closed em production sem secret
- Webhooks **não** usam Turnstile (autenticação HMAC própria)
- Rotas `/v1/payments`, checkout e PIX **não** exigem Turnstile do pagador

Middleware: `backend/src/middleware/turnstile.ts` (`requireTurnstile`) — disponível para rotas públicas futuras; **não** montado globalmente.

## 5. Testes manuais

1. Token válido → login/signup ok.
2. Token ausente / inválido → rejeição.
3. Token reutilizado ou expirado (>5 min) → falha.
4. Webhook NexusPag / provider → sem desafio Turnstile.
5. Fluxo PIX (checkout) → sem Turnstile no pagador.

## 6. Recuperação de senha

Não há página custom de forgot-password no frontend; o fluxo depende do email/link do Supabase Auth. Se no futuro for adicionada UI de reset, incluir o mesmo widget + `captchaToken`.
