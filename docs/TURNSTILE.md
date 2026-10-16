# Cloudflare Turnstile — FluxPay

Integração da catraca (bot protection) no login, signup e validação server-side.

## Estado atual

| Item | Estado |
|------|--------|
| Código `verifyTurnstile` (backend) | Implementado |
| Middleware `requireTurnstile` | Implementado (pronto para rotas públicas) |
| Widget no frontend (`/login`, `/signup`) | Implementado |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | **Pendente** — ação de conta |
| `TURNSTILE_SECRET_KEY` (Netlify) | **Pendente** — ação de conta |
| CAPTCHA no Supabase Auth | **Pendente** — ação de conta |
| Widget Cloudflare | **Pendente** — criar no dashboard |

**Não inventamos chaves.** Sem o widget e as variáveis, o formulário continua a funcionar em development; em production o fail-closed rejeita se o secret estiver em falta e o Supabase estiver com CAPTCHA activo.

## 1. Criar o widget Turnstile (Cloudflare)

1. Aceder a [Cloudflare Dashboard → Turnstile](https://dash.cloudflare.com/?to=/:account/turnstile).
2. **Add site** / Create widget.
3. Nome: `FluxPay`.
4. Domínios:
   - `usefluxpay.com`
   - `www.usefluxpay.com`
   - `fluxpay-sohn.netlify.app` (opcional, para previews)
5. Widget mode: **Managed** (recomendado).
6. Copiar **Site Key** e **Secret Key**.

Preservar a regra existente: **FluxPay - Block WordPress probe paths**. Não activar Bot Fight Mode global sem avaliar impacto em checkout, APIs e webhooks.

## 2. Variáveis na Netlify

Site: `fluxpay-sohn` (ID `0ee3ea2a-31a0-451b-9fc0-c99802b34e64`).

| Key | Scope | Secret? |
|-----|--------|---------|
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Builds + Functions + Runtime | Não (pública) |
| `TURNSTILE_SECRET_KEY` | Functions + Runtime | **Sim** |

Após definir, fazer **Clear cache and deploy site** (a Site Key é embutida no build do Next).

## 3. Activar CAPTCHA no Supabase Auth

1. Supabase Dashboard → Authentication → Bot and Abuse Protection.
2. Enable CAPTCHA protection → Provider: **Cloudflare Turnstile**.
3. Colar a **Secret Key** do widget.
4. Save.

O frontend envia `options: { captchaToken }` em `signInWithPassword` e `signUp`. O Supabase valida o token no servidor de auth.

## 4. Validação no nosso backend

Ficheiro: `backend/src/lib/turnstile.ts`.

- POST `https://challenges.cloudflare.com/turnstile/v0/siteverify`
- Timeout 5s
- Hostname allowlist: `usefluxpay.com`, `www`, previews `*--fluxpay-sohn.netlify.app`
- Fail closed em production sem secret
- Webhooks **não** usam Turnstile (autenticação HMAC própria)

Middleware: `backend/src/middleware/turnstile.ts` (`requireTurnstile`) — aplicar só a rotas públicas anónimas se necessário no futuro.

## 5. Testes manuais (após configurar chaves)

1. Token válido → login/signup ok.
2. Token ausente / inválido → Supabase ou middleware rejeitam.
3. Token reutilizado ou expirado (>5 min) → falha.
4. Hostname errado → `hostname_mismatch`.
5. Webhook NexusPag / provider → sem desafio Turnstile.
6. Fluxo PIX legítimo (checkout) → sem Turnstile obrigatório no pagador.

## 6. Plano Cloudflare Free Website

Turnstile está disponível no Free. Não activar desafios globais nem Bot Fight Mode sem medir impacto no checkout e nas APIs.
