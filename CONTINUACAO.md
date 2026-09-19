# FluxPay — Prompt de continuação de desenvolvimento

> Cole este arquivo inteiro como primeira mensagem para o Claude. Ele está
> escrito para outra conta/sessão retomar o projeto exatamente de onde parou —
> **não é um pedido para recomeçar o projeto do zero.**

---

## 0. Rodada 2 — 18/09/2026 (o que mudou nesta entrega)

Alterações feitas **depois** do texto original abaixo. Onde houver conflito,
esta seção vale.

**Banco**
- **012 aplicada ao banco vivo** (`fluxpay_maintenance_status()`): RPC
  SECURITY DEFINER que devolve só o que pode ser público do modo manutenção
  (ligado/desligado, mensagem, escopo) + se quem pergunta é admin da
  plataforma. `platform_settings` continua fechada para `anon`/`authenticated`.
- **011b salva no repositório**: existia no banco e faltava no arquivo
  (revoga `EXECUTE` da função de trigger `fluxpay_block_inactive_organization`).
- Migrations 001/002/011/012 renomeadas para o prefixo de timestamp **igual ao
  `version` aplicado no banco** — `supabase db push` num projeto ligado ao
  banco atual não tenta reaplicar nada.

**Modo manutenção (os dois bugs relatados)**
- `allow_admins` agora funciona: `backend/src/middleware/maintenance.ts`
  identifica quem está chamando (token de sessão → `platform_admins`) e só
  libera se a opção estiver marcada. Chave de API (`sk_`/`pk_`) nunca conta
  como admin. `/admin-api`, `/health` e `/v1/webhooks/nexuspag` continuam
  sempre liberados, de propósito.
- As páginas `/dashboard/*` (Server Components que falam direto com o
  Supabase, sem passar pelo Express) agora são bloqueadas **server-side** no
  `frontend/src/middleware.ts`, que chama a RPC 012 e redireciona para a nova
  página `/manutencao`.

**Netlify**
- **Faltava o redirect `/admin-api/*`** no `netlify.toml`: o ADM abriria em
  produção e nenhuma tela carregaria. Corrigido.
- `AWS_LAMBDA_JS_RUNTIME = "nodejs20.x"` e o cron da função agendada
  declarado também no `netlify.toml`.

**Backend**
- `app.set("trust proxy", 1)` + `keyGenerator` usando
  `x-nf-client-connection-ip`: sem isso o rate limit contava todo o tráfego
  num balde só e `api_logs` gravava sempre o IP do proxy. `/health` e o
  webhook de entrada ficam fora do rate limit.
- `FRONTEND_URL` do checkout passou a vir do env validado (`config/env.ts`).
- **Provider sandbox agora faz PIX**: em `test`, cobrança PIX gera QR Code
  simulado (claramente marcado como falso) e copia e cola. Confirmação
  simulada em `POST /v1/checkout/sessions/:id/simulate-payment` e
  `POST /dashboard-api/payments/:id/simulate-payment`, ambos com tripla trava
  (`environment = test` **e** `provider = sandbox`, senão 404). Antes disso,
  o fluxo de checkout só fechava em produção com dinheiro real.

**Frontend / PWA / identidade**
- PWA de verdade: `manifest.webmanifest` (standalone, shortcuts, pt-BR),
  `sw.js` que **nunca** intercepta `/v1`, `/dashboard-api`, `/admin-api` ou
  `/health`, `offline.html`, `robots.txt`, ícones 192/512/maskable/apple-touch,
  favicon, Open Graph e `viewport-fit=cover`.
- Ícones gerados a partir da marca enviada pelo cliente (hexágono `#FC0019`
  redesenhado vetorialmente, não upscale). Componente
  `components/brand/FluxLogo.tsx` substituiu os quadradinhos com "F".
- `globals.css`: o `@import` da fonte estava **depois** do `@tailwind` — regra
  inválida, a Inter nunca carregava. Corrigido, e os componentes base ganharam
  alvo mínimo de 44px e `font-size` 16px no mobile (evita zoom no iOS).
- `npm run typecheck` agora existe de verdade (o script antigo, com
  `npx --workspace`, não funcionava).

**Continua sem executar**: sem rede no ambiente, `npm install` responde 403 no
registry, então não houve `next build`, `tsc` com dependências nem deploy. O
que foi possível: `tsc` global sobre backend e frontend (só ruído de
`node_modules` ausente, nenhum erro de lógica) e a migration 012 aplicada e
testada direto no banco.

---

## 1. O que é o FluxPay

FluxPay é um gateway de pagamentos (estilo Stripe) para o mercado brasileiro,
com painel administrativo (dashboard) e API para integradores externos.
O projeto foi originalmente criado em outra ferramenta ("Glok") e está sendo
continuado e corrigido aqui. **Não recrie nada do zero — edite o que já existe.**

O adquirente real de pagamentos é a **NexusPag** (PIX, com suporte a SPEI/México,
subcontas com split e saques — só PIX está sendo integrado nesta fase).

## 2. Arquitetura atual

Monorepo com 3 partes, pensado para deploy único na Netlify:

```
/backend    → API Express + TypeScript (ESM), fala com Supabase e com a NexusPag
/frontend   → Next.js 15 (App Router) + TypeScript + Tailwind — dashboard e checkout
/netlify    → funções serverless que expõem o backend Express na Netlify
/supabase/migrations → todas as migrations SQL do banco (Postgres via Supabase)
/docs/nexuspag-api.md → documentação oficial da NexusPag (íntegra, cole exatamente como está)
```

- **Banco**: Supabase (projeto `mrfbmndbazeajgyozhfb`, região us-west-2), Postgres 17,
  com RLS multi-tenant (isolamento por `organization_id`) em todas as tabelas.
- **Auth**: Supabase Auth. Usuários viram membros de `organizations` via
  `organization_members` (papéis: owner/admin/developer/viewer).
- **Backend roda de duas formas**:
  - `backend/src/server.ts` → servidor tradicional (`app.listen`), pra hospedar
    fora da Netlify (Render/Railway/Fly) se um dia for preciso.
  - `netlify/functions/api.ts` → o MESMO app Express (`backend/src/index.ts`,
    que exporta `app` sem chamar `.listen()`) empacotado com `serverless-http`
    pra rodar como função da Netlify.
- **Duas camadas de autenticação na API**:
  1. `middleware/auth.ts` (`apiKeyAuth`) — API keys `sk_`/`pk_`, pra
     integradores externos, rotas em `/v1/*`.
  2. `middleware/session-auth.ts` (`sessionAuth`) — sessão do Supabase Auth
     (JWT do usuário logado), pra ações do painel administrativo, rotas em
     `/dashboard-api/*`. Exige os headers `Authorization: Bearer <access_token>`,
     `X-Organization-Id` e `X-Environment` (`test`/`live`).

## 3. O que já está concluído (não retrabalhar)

### Banco de dados (100% aplicado ao Supabase, migrations 001–010)
- Todas as tabelas do domínio: `organizations`, `users`, `organization_members`,
  `api_keys`, `customers`, `payment_methods`, `payments`, `refunds`, `disputes`,
  `balance_transactions`, `webhook_endpoints`, `webhook_events`,
  `webhook_deliveries`, `checkout_sessions`, `api_logs`, `provider_events`.
- RLS habilitado em todas, isolamento por empresa testado (ver seção 10).
- Triggers de integridade: pagamento não pode referenciar cliente de outra
  empresa/ambiente, reembolso não pode passar do valor do pagamento, etc.
- Owner automático ao criar empresa, proteção contra remover o último owner.
- **Trava de segurança importante (migration 010)**: `payments`, `refunds`,
  `disputes` e `checkout_sessions` são **somente leitura** para o usuário logado
  (`authenticated`) — toda escrita nessas tabelas *tem* que passar pelo backend
  (`service_role`), nunca direto pelo Supabase client do navegador. `api_keys`
  e `webhook_endpoints` só permitem `UPDATE` de colunas específicas
  (`revoked_at` / `url,events,description,enabled`) direto do painel — criação
  continua exigindo o backend (hash de chave, geração de segredo).
- RPCs relevantes (schema `public`, chamáveis via `supabase.rpc(...)`):
  - `create_organization(p_name, p_slug, p_email, p_legal_name?, p_document?, p_country?, p_default_currency?)`
    → cria a empresa **e** já vincula o usuário autenticado como owner, atômico.
    **É o RPC que a tela de onboarding (ainda não criada) deve chamar.**
  - `get_organization_balance(p_organization_id, p_environment)` → saldo
    agregado por moeda (`SECURITY INVOKER`, respeita RLS).
  - `fluxpay_expire_stale_records()` → expira checkout/PIX vencidos. Fica no
    schema `public` mas só `service_role` tem `EXECUTE` (qualquer outro papel
    recebe "permission denied" mesmo conseguindo listar a função).
- Funções auxiliares de RLS (`is_org_member`, `has_org_role`,
  `get_user_organization_ids`) foram movidas pro schema `fluxpay` (migration
  008) pra não aparecerem como endpoint REST público.

### Backend (compilava limpo — ver seção 9 sobre a quebra atual)
- CRUD completo de payments/customers/refunds/checkout/balance via API key
  (rotas originais, já existiam antes desta rodada de trabalho).
- `middleware/session-auth.ts` — autenticação por sessão pro painel.
- `middleware/api-log.ts` — grava toda chamada em `/v1/*` na tabela `api_logs`
  (antes essa tabela existia no schema mas nunca era populada).
- `routes/dashboard.ts` — rotas privilegiadas do painel (autenticadas por
  `sessionAuth`, exigindo papel específico):
  - `POST /dashboard-api/api-keys` (gera e retorna a chave em texto puro **uma vez**)
  - `POST /dashboard-api/webhooks/endpoints` (gera o segredo HMAC)
  - `POST /dashboard-api/payments/:id/refund`
  - `POST /dashboard-api/payments/:id/cancel`
  - `POST /dashboard-api/members/invite` (usa `supabaseAdmin.auth.admin.inviteUserByEmail`)
- `providers/nexuspag.ts` — adapter do adquirente NexusPag (ver seção 4).
- `services/payments.ts` — `createPayment` já ramifica pra PIX quando
  `payment_method.type === "pix"`, grava os campos novos (`payment_type`,
  `provider_txid`, `pix_copy_paste`, `pix_qr_code_base64`, `expires_at`) e
  tem as funções `getPaymentByProviderTxid`, `markPixPaymentSucceeded`,
  `markPixPaymentFailedOrExpired` usadas pelo webhook de entrada.
- `services/webhooks.ts` — ganhou `processRetryingWebhooks()` +
  `retryDelivery()`, usados pela função agendada da Netlify (retry de webhook
  não pode depender de `setTimeout` em ambiente serverless).
- `index.ts` captura o corpo bruto da requisição em `req.rawBody` (necessário
  pra validar HMAC do webhook de entrada) e monta `apiLogger` + `dashboardRouter`.

### Netlify (nunca testado com deploy real — ver seção 9)
- `netlify.toml` — build via npm workspaces, `netlify/functions/api.ts`
  (envolve o Express inteiro com `serverless-http`, `basePath` configurado
  pra bater com os redirects), `netlify/functions/scheduled-jobs.ts`
  (roda a cada 10 min: expira registros vencidos + reprocessa retries de webhook).
- `package.json` raiz com `workspaces: ["frontend", "backend"]`.
- `.gitignore` cobrindo `.env`, `node_modules`, `.next`, `dist`, `.netlify`.

### Frontend — Auth (novo)
- `lib/supabase/client.ts`, `lib/supabase/server.ts` — clientes Supabase
  (browser e Server Component) usando `@supabase/ssr` (dependência que já
  existia no `package.json` original, mas nunca tinha sido usada).
- `middleware.ts` — protege `/dashboard/*` e `/onboarding`, redireciona
  logado pra fora de `/login`/`/signup`, e resolve a organização atual via
  cookie `fluxpay_org_id` (se o usuário não tiver empresa, manda pra
  `/onboarding` — **que ainda não existe**, ver seção 5).
- `app/login/page.tsx` e `app/signup/page.tsx` — funcionais, usam
  `supabase.auth.signInWithPassword` / `signUp`.
- `lib/dashboard-context.ts` — helpers de servidor pra ler os cookies
  `fluxpay_org_id` e `fluxpay_env` (test/live, default "test").
- `lib/dashboard-api.ts` — helper de cliente `dashboardFetch(path, options)`
  que chama `/dashboard-api/*` no backend com os headers de sessão certos.

## 4. Estado da integração NexusPag

**A doc oficial completa está em `docs/nexuspag-api.md`** (1560 linhas) — leia
antes de mexer em qualquer coisa relacionada ao provider. Resumo do que já
foi conferido linha a linha contra o código:

- Base URL: `https://nexuspag.com`. Auth: header `x-api-key`.
- Só **PIX** está sendo integrado (SPEI, Subcontas, Saldo, Saques e KYC
  existem na doc mas não têm nenhum código correspondente ainda).
- **Descoberta importante #1 — `POST /api/pix/create`**: resposta vem
  **aninhada** em `{ success, transaction: { id, txid, external_id, amount,
  fee, fee_percent, net_amount, status, pix_copia_cola, qr_code_base64,
  expires_at, ... } }`. Valores em REAIS (ex: `50.00`), não centavos.
  `providers/nexuspag.ts` já trata isso corretamente (`centsToReais`/`reaisToCents`
  fazem a conversão nas bordas).
- **Descoberta importante #2 — `GET /api/pix/{id}`**: a resposta é **PLANA**,
  SEM o wrapper `transaction` (diferente da criação!):
  ```
  { "id": "...", "txid": "...", "external_id": "...", "status": "pending|paid|expired|cancelled",
    "amount": 50.00, "fee": 2.50, "net_amount": 47.50, "paid_at": "...", "expires_at": "..." }
  ```
  `providers/nexuspag.ts` (`getPayment`) já foi corrigido pra ler o formato
  plano. Os únicos status possíveis são `pending | paid | expired | cancelled`
  (não existem "confirmed"/"completed"/"failed" pra PIX — isso foi um erro
  que já foi corrigido no código).
- **Descoberta importante #3 — Webhook `payment.confirmed`**: só existe
  **UM tipo de evento** pra PIX, disparado quando o pagamento é confirmado.
  Não existe webhook de expiração/cancelamento — por isso a expiração de PIX
  vencido é responsabilidade do FluxPay (`fluxpay_expire_stale_records`,
  chamada pela função agendada da Netlify). Payload real, **PLANO**:
  ```
  {
    "event": "payment.confirmed",
    "transaction_id": "9c29870c-...",
    "txid": "1919700995",
    "external_id": "pedido-123",
    "status": "paid",
    "amount": 50.00,
    "fee": 2.50,
    "net_amount": 47.50,
    "payer_name": "Joao Silva",
    "payer_document_masked": "***.456.789-**",
    "paid_at": "2024-01-15T10:32:00Z",
    "shop_id": "abc12345-...",
    "shop_external_ref": "usuario_joao"
  }
  ```
  Headers: `X-Webhook-Event: payment.confirmed` (sempre) e
  `X-Webhook-Signature: t=<unix>,v1=<hmac_hex>` (só quando o `webhook_secret`
  está configurado no dashboard da NexusPag). Assinatura = HMAC-SHA256 de
  `"<unix>.<body_cru>"` usando o `webhook_secret`.
  Retry da NexusPag: até 8 tentativas com backoff exponencial ao longo de
  ~7 dias; 4xx encerra o retry (erro do cliente), 5xx/timeout continuam.

- **`docs/nexuspag-api.md` também documenta** (não implementado, fora de
  escopo desta fase, mas puxado aqui pra não ser esquecido): SPEI (México,
  cobrança em MXN), Subcontas com split automático (`shop_id`, `split[]`),
  Saldo da carteira principal, Saques, e Verificação KYC.

### BUG DO WEBHOOK — CORRIGIDO (18/09/2026)

`routes/webhooks.ts` chamava `nexuspagProvider.verifyWebhookSignature!()`, método
que tinha sido removido do provider (erro TS2339 na linha 77). Já foi corrigido:

- A rota agora importa `verifyWebhookSignature` de `../utils/crypto.js` e usa
  `env.NEXUSPAG_WEBHOOK_SECRET`.
- **Fail closed**: sem `NEXUSPAG_WEBHOOK_SECRET` configurado a rota responde 503
  sem processar nada (5xx faz a NexusPag reenviar depois que a variável existir).
  Assinatura ausente ou inválida → 401.
- Parse reescrito pro payload PLANO real (`event`, `transaction_id`, `txid`,
  `external_id`, `status`). Único caminho de sucesso: `event === "payment.confirmed"`
  **e** `status === "paid"` → `markPixPaymentSucceeded`. Não há mais branching
  pra `confirmed`/`completed`/`failed`/`cancelled` (não existem no webhook).
  `markPixPaymentFailedOrExpired` continua exportada e usada só pela expiração
  própria do FluxPay.
- `provider_event_id` = `"<event>:<txid>"` (o tipo entra no id só pra não quebrar
  a dedupe se a NexusPag um dia mandar outro evento pro mesmo txid).
- O insert em `provider_events` agora preenche `organization_id`, `payment_id` e
  `environment` (via lookup do pagamento pelo txid) e marca `processed_at` /
  `processing_error` depois de processar. Falha de escrita nessa tabela → 500
  (evento nunca é processado sem rastro de auditoria).
- O membro morto `verifyWebhookSignature?()` foi removido da interface
  `PaymentProvider` em `types/index.ts`.

**Ponto em aberto**: se o webhook chegar antes da linha em `payments` existir
(corrida improvável), o evento é gravado, marcado como "payment nao encontrado"
e respondido com 200 — um retry seria tratado como duplicado. O backup é o
polling por `external_id` recomendado pela própria doc da NexusPag.

**Ainda falta validar com `npm install && npx tsc --noEmit` num ambiente com
rede** (a correção foi feita sem `node_modules` disponível; o TS2339 sumiu, mas
o build limpo completo não foi reconfirmado).

## 5. Estado das pendências — TUDO IMPLEMENTADO (18/09/2026)

Todos os itens que estavam nesta lista foram feitos. O que existe agora:

1. ~~Bug de compilação em `routes/webhooks.ts`~~ — corrigido (ver seção 4).
2. **`app/onboarding/page.tsx`** — criada. Formulário (nome, slug com sugestão
   automática, e-mail, razão social e CNPJ opcionais), chama
   `supabase.rpc('create_organization', ...)` do client component, grava os
   cookies `fluxpay_org_id` e `fluxpay_env=test` e redireciona pra `/dashboard`.
3. **`app/(dashboard)/layout.tsx`** — virou Server Component async. Usa o novo
   `lib/dashboard-server.ts` (`requireDashboardContext`), que resolve sessão,
   organização atual, papel do usuário e ambiente de uma vez só e redireciona
   pra `/login` ou `/onboarding` quando falta alguma coisa. Ganhou
   `components/dashboard/Topbar.tsx`: nome da empresa, papel, toggle test/live
   (grava `fluxpay_env` + `router.refresh()`), faixa de aviso em produção e
   logout. A `Sidebar` agora recebe `environment` e `organizationName`.
4. **As 10 páginas do dashboard estão ligadas aos dados reais** — nenhum mock
   sobrou. Leitura por Server Component (RLS filtra por empresa; o ambiente vai
   explícito em todo `.eq("environment", ...)`):
   - `dashboard/page.tsx` — saldo via RPC `get_organization_balance`, métricas
     de 14 dias, série diária (gráficos em `components/dashboard/OverviewCharts.tsx`,
     client component que só recebe os dados prontos) e últimas transações.
   - `payments` — lista com filtro por status via querystring + ações de
     reembolso/cancelamento (`components/dashboard/PaymentActions.tsx`,
     chamando `/dashboard-api/payments/:id/{refund,cancel}`).
   - `customers` — CRUD completo direto pelo Supabase (permitido pela RLS).
   - `refunds`, `disputes`, `logs` — tabelas somente leitura.
   - `api-keys` — criação via `/dashboard-api/api-keys` com a chave exibida uma
     única vez; revogação direto pelo painel (`UPDATE revoked_at`, a única
     coluna liberada pela migration 010).
   - `webhooks` — criação via `/dashboard-api/webhooks/endpoints` mostrando o
     segredo HMAC uma vez; ativar/desativar/apagar direto; lista as 20 entregas
     mais recentes pra depurar endpoint que não responde.
   - `company` — dados cadastrais (RLS restringe a owner/admin) + equipe:
     convite via `/dashboard-api/members/invite`, troca de papel e remoção
     direto pelo painel.
   - `settings` — conta do usuário (nome, troca de senha) e dados de integração,
     incluindo a URL do webhook de entrada pra cadastrar na NexusPag.
5. **`app/checkout/[id]/page.tsx`** — checkout público real. Como a RLS bloqueia
   `anon` em `checkout_sessions` (de propósito), a página não usa Supabase: fala
   com três rotas públicas do backend. Duas delas são **novas**:
   - `POST /v1/checkout/sessions/:id/pay` → `payCheckoutSessionWithPix()` gera o
     PIX (ou reaproveita o pendente, pra não criar duas cobranças no adquirente)
     e devolve QR Code + copia e cola;
   - `GET /v1/checkout/sessions/:id/status` → polling; quando o pagamento vira
     `succeeded` (pelo webhook), fecha a sessão e a página redireciona pro
     `success_url`.
6. **Netlify** — os riscos da seção 9 foram endereçados:
   - as funções importam de `backend/dist`, não de `backend/src` (o esbuild da
     Netlify não resolve `../../backend/src/index.js`, que não existe em disco);
     o build agora roda `npm run build --workspace=backend` antes do Next;
   - `netlify/functions/api.ts` não depende mais do `basePath` do
     `serverless-http`: normaliza `event.path` na mão, aceitando tanto
     `/.netlify/functions/api/v1/...` quanto `/v1/...`;
   - `netlify.toml` ganhou `NODE_VERSION=20` e `node_bundler = "esbuild"`;
   - `.env.example` na raiz lista todas as variáveis, e `DEPLOY.md` traz o
     roteiro completo (Supabase Auth, NexusPag, verificação e troubleshooting).
7. Os testes de RLS da seção 10 **ainda precisam ser rodados de novo** — ver
   seção 9 sobre o que não foi possível validar aqui.

## 5.1 Painel administrativo da plataforma (ADM) — novo, 18/09/2026

Painel separado em `/admin`, para a equipe da FluxPay administrar a plataforma
inteira. Nada disso existia antes.

**Banco (migration 011, `..._011_platform_admin.sql` — PRECISA SER APLICADA)**
- `platform_admins` (user_id, role: superadmin/admin/support). RLS: cada um só
  enxerga a própria linha; INSERT/UPDATE/DELETE revogados de `authenticated` —
  ninguém se promove pelo navegador.
- `admin_audit_log`: admin, ação, alvo, motivo, estado antes/depois, IP,
  user-agent, data. Sem policy para `authenticated`: só o backend lê.
- `platform_settings`: chave/valor JSONB, com `maintenance`
  (enabled, message, allow_admins, scope) e `limits`.
- `organizations.status` passou a aceitar `active | pending | suspended |
  banned | disabled`, com `status_reason`, `status_changed_at` e
  `status_changed_by`.
- `fluxpay.is_platform_admin()`, `fluxpay_platform_overview(environment)`
  (métricas agregadas numa ida só) e um trigger que recusa INSERT em
  `payments`/`checkout_sessions` de organização não ativa — bloqueio de conta
  também no nível do banco, não só no middleware.

**Backend**
- `middleware/admin-auth.ts` — `platformAdminAuth` (sessão + pertencer a
  `platform_admins`; responde 404 para quem não é, o ADM não se anuncia),
  `requireAdminRole` e `logAdminAction`.
- `middleware/maintenance.ts` — guarda global. Bloqueia `/v1/*` e
  `/dashboard-api/*` com 503; nunca bloqueia `/admin-api/*`, `/health` e o
  webhook de entrada da NexusPag (recusar ali faria o adquirente gastar
  tentativas e perder a confirmação de um PIX pago). Cache de 15s.
- `routes/admin.ts` — overview, organizações (busca/filtro/detalhe), mudança de
  status com motivo obrigatório, usuários, pagamentos/reembolsos/disputas
  globais, webhooks (entregas + eventos do adquirente), reenvio e
  reprocessamento, segurança, auditoria e configurações/manutenção.
- `services/webhooks.ts` ganhou `retryDeliveryById` (a função `retryDelivery`
  era **privada**, ao contrário do que a versão anterior deste documento dizia).
- `middleware/auth.ts` e `middleware/session-auth.ts` agora recusam operações de
  conta não ativa, com mensagem clara em vez de exceção de constraint.

**Frontend**
- `lib/admin-server.ts` (`requirePlatformAdmin`) e `lib/admin-api.ts`.
- `app/admin/*`: visão geral, contas, detalhe da conta, usuários, pagamentos,
  webhooks, segurança, auditoria, plataforma.
- `components/admin/`: `AdminShell`, `common.tsx` (incluindo o `ReasonDialog`
  com motivo obrigatório) e `panels.tsx`.
- O painel do lojista ganhou banner de conta bloqueada e um atalho para o ADM
  visível apenas para quem é da equipe.

**O que o ADM nunca mostra**: `api_keys.key_hash`, `webhook_endpoints.secret`,
`payments.provider_response` e qualquer credencial da NexusPag. As listas de
colunas em `routes/admin.ts` são explícitas por isso — não use `select("*")` lá.

## 6. Arquivos importantes — mapa rápido

| O quê | Onde |
|---|---|
| Provider NexusPag (PIX) | `backend/src/providers/nexuspag.ts` |
| Registro de providers (sandbox vs nexuspag por ambiente) | `backend/src/providers/index.ts` |
| Webhook de entrada da NexusPag (com o bug) | `backend/src/routes/webhooks.ts` (linha 64 em diante) |
| Confirmação assíncrona de PIX | `backend/src/services/payments.ts` (funções `markPixPaymentSucceeded`, `markPixPaymentFailedOrExpired`, `getPaymentByProviderTxid`) |
| Retry de webhook (serverless-safe) | `backend/src/services/webhooks.ts` (`processRetryingWebhooks`, `retryDelivery`) |
| Assinatura HMAC genérica (usar para NexusPag também) | `backend/src/utils/crypto.ts` (`signWebhookPayload`, `verifyWebhookSignature`) |
| Auth por sessão do painel | `backend/src/middleware/session-auth.ts` |
| Rotas privilegiadas do painel | `backend/src/routes/dashboard.ts` |
| Auditoria de requests | `backend/src/middleware/api-log.ts` |
| App Express sem `.listen()` | `backend/src/index.ts` |
| Entry point servidor tradicional | `backend/src/server.ts` |
| Função Netlify (API) | `netlify/functions/api.ts` |
| Função Netlify (cron) | `netlify/functions/scheduled-jobs.ts` |
| Config de build Netlify | `netlify.toml` |
| Clientes Supabase (frontend) | `frontend/src/lib/supabase/client.ts` e `server.ts` |
| Middleware de auth (frontend) | `frontend/src/middleware.ts` |
| Helper pra chamar `/dashboard-api` | `frontend/src/lib/dashboard-api.ts` |
| Cookies org/ambiente atuais | `frontend/src/lib/dashboard-context.ts` |
| Login / Signup | `frontend/src/app/login/page.tsx` e `frontend/src/app/signup/page.tsx` |
| Onboarding | `frontend/src/app/onboarding/page.tsx` |
| Layout do dashboard (integrado) | `frontend/src/app/(dashboard)/layout.tsx` |
| Contexto de servidor do painel | `frontend/src/lib/dashboard-server.ts` |
| Topbar (empresa, ambiente, logout) | `frontend/src/components/dashboard/Topbar.tsx` |
| Componentes de UI do painel | `frontend/src/components/dashboard/ui.tsx` |
| Tipos das linhas do banco | `frontend/src/lib/types.ts` |
| Checkout público (PIX real) | `frontend/src/app/checkout/[id]/page.tsx` |
| Rotas públicas do checkout | `backend/src/routes/checkout.ts` + `services/checkout.ts` |
| Guia de deploy | `DEPLOY.md` |
| Migration do ADM | `supabase/migrations/20260918120000_011_platform_admin.sql` |
| Auth do ADM + auditoria | `backend/src/middleware/admin-auth.ts` |
| Modo manutenção | `backend/src/middleware/maintenance.ts` |
| Rotas do ADM | `backend/src/routes/admin.ts` |
| Gate server-side do ADM | `frontend/src/lib/admin-server.ts` |
| Páginas do ADM | `frontend/src/app/admin/*` |
| Painéis do ADM | `frontend/src/components/admin/panels.tsx` |
| Sidebar | `frontend/src/components/dashboard/Sidebar.tsx` |
| As 10 páginas do painel (dados reais) | `frontend/src/app/(dashboard)/dashboard/*` |
| Doc completa da NexusPag | `docs/nexuspag-api.md` |
| Migrations SQL | `supabase/migrations/*.sql` (001 a 010) |

## 7. Banco de dados — detalhes que importam

- Projeto Supabase: `mrfbmndbazeajgyozhfb` (região us-west-2, Postgres 17).
  **As migrations 001–012 já estão aplicadas ao banco vivo** (confirmado via
  `list_migrations` em 18/09/2026; o banco está vazio: 0 usuários, 0 empresas,
  0 administradores). Os arquivos em `supabase/migrations/` são a cópia local
  — se algo divergir, o banco vivo é a fonte da verdade.
- Todos os arquivos seguem `<timestamp>_<numero>_<nome>.sql`, com o timestamp
  igual ao `version` registrado no banco (001 e 002 foram renomeadas na rodada
  2 justamente por isso).
- Tabelas de ledger (`payments`, `refunds`, `disputes`, `checkout_sessions`)
  são **somente leitura** pra `authenticated` desde a migration 010 — qualquer
  escrita nova nessas tabelas **tem que** usar `supabaseAdmin` (service_role)
  no backend, nunca o client do navegador.
- `provider_events` guarda os webhooks recebidos de adquirentes, com
  `UNIQUE(provider, provider_event_id)` pra deduplicação.

## 8. Configuração — variáveis de ambiente

Nenhum `.env` real existe no projeto (só `.env.example`). Preencher antes
de rodar:

`backend/.env` (a partir de `backend/.env.example`):
```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_ANON_KEY=
API_BASE_URL=
FRONTEND_URL=
NEXUSPAG_API_KEY=          (opcional — sem isso, ambiente "live" cai no sandbox)
NEXUSPAG_WEBHOOK_SECRET=   (opcional — sem isso, a assinatura do webhook não pode ser validada)
NEXUSPAG_BASE_URL=https://nexuspag.com
```

`frontend/.env.local` (a partir de `frontend/.env.example`):
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_API_URL=
NEXT_PUBLIC_SITE_URL=      (prévia de link/Open Graph; vazia funciona)
```

A lista completa, com "onde pego / onde coloco / é segredo?", está na seção 4
do `DEPLOY.md` — é a fonte da verdade para a configuração na Netlify.

Nenhuma dessas chaves está no código nem neste pacote — foram removidas
antes do zip (ver seção 12).

## 9. Build / testes — o que rodou e o que NÃO rodou

**Nada foi executado na rodada de 18/09/2026**: o ambiente estava sem acesso à
rede, então não houve `npm install`, `tsc --noEmit`, `next build` nem deploy.
O que deu pra verificar foi só sintaxe/tipagem com o `tsc` global, sem
`node_modules` — o erro TS2339 do webhook sumiu e não sobrou nenhum erro de
lógica, mas todos os erros de "cannot find module" continuam por falta das
dependências, o que impede uma checagem de tipos de verdade.

Riscos conhecidos que continuam de pé:

- O `@netlify/plugin-nextjs` com esta estrutura de monorepo (`publish =
  "frontend/.next"` sem `base`) nunca foi testado num build real. É o ponto
  mais provável de falhar no primeiro deploy — o `DEPLOY.md` tem o plano B.
- **Nenhum lockfile** está incluso (o projeto original nunca teve). Rodar
  `npm install --workspaces --include-workspace-root` antes do primeiro build,
  e commitar o `package-lock.json` gerado, pra o deploy ser reproduzível.
- O import das funções da Netlify mudou de `backend/src` pra `backend/dist` —
  isso conserta um problema real de resolução do esbuild, mas torna o build do
  backend obrigatório antes do bundle das functions (já está no
  `netlify.toml`).

## 10. Testes de RLS/isolamento já validados

Via SQL direto no Supabase (dentro de transações revertidas, sem deixar dado
de teste no banco), já foi confirmado:
- Duas empresas diferentes não enxergam pagamentos/clientes/reembolsos/
  webhooks/api keys uma da outra.
- `anon` não enxerga nada.
- Papel `viewer` lê mas não escreve; `insufficient_privilege` no insert.
- Criar empresa via `create_organization` já vincula o criador como owner
  atomicamente (o bug original de `insert().select()` falhando com 42501
  foi corrigido na migration 007).
- Depois da migration 010: um usuário `authenticated` com papel admin/dev
  tentando `UPDATE payments SET status='succeeded'` direto pelo Supabase
  client afeta 0 linhas (RLS silenciosamente bloqueia, não lança exceção —
  isso é comportamento esperado do Postgres, não um bug).
- `fluxpay_expire_stale_records()`: `authenticated` recebe
  `insufficient_privilege`; `service_role` executa normalmente.

Depois de corrigir o bug da seção 4, vale rodar esses mesmos cenários de novo
pra garantir que nada regrediu (não há necessidade de reinventar os testes —
o padrão usado foi sempre um bloco `DO $$ ... RAISE EXCEPTION 'RESULTADO>> %', r; END $$`
dentro de uma transação, pra nunca sujar o banco).

## 11. Estado final e o que ainda precisa ser executado

Escrito e revisado: correção do webhook da NexusPag, onboarding, painel do
lojista inteiro ligado a dados reais, checkout público com PIX, empacotamento
Netlify e o ADM completo.

**Nada foi executado**: os três ambientes de trabalho estavam sem rede, então
`npm install` falha com 403 no registry e não houve `tsc` com dependências,
`next build` nem deploy. A checagem possível foi com o TypeScript global, sem
`node_modules`: fora os erros de "cannot find module" (esperados), sobraram
zero erros de lógica no backend e no frontend.

Ordem de conferência quando tiver rede:

1. `npm install --workspaces --include-workspace-root` e `npm run build`.
2. Cadastrar o primeiro `platform_admins` (as migrations 001–012 já estão
   aplicadas; o SQL está no fim da 011 e no `DEPLOY.md`).
3. Fluxo do lojista: signup → onboarding → chave → cobrança PIX → webhook →
   checkout público.
4. Fluxo do ADM: entrar em `/admin` com um usuário comum (tem que cair no
   `/dashboard`), suspender uma conta de teste e confirmar que a API dela passa
   a responder 403, reativar, e conferir tudo isso na aba Auditoria.
5. Ligar e desligar o modo manutenção; confirmar 503 em `/v1/*`, redirect de
   `/dashboard` para `/manutencao`, ADM ainda acessível, e o comportamento de
   `allow_admins` marcado e desmarcado.
6. Rodar de novo os cenários de RLS da seção 10, agora incluindo: usuário comum
   não lê `platform_admins` de outro, não lê `admin_audit_log` nem
   `platform_settings`, e não consegue inserir em `platform_admins`.
7. Deploy na Netlify seguindo o `DEPLOY.md`.

## 12. O que este pacote NÃO inclui (de propósito)

`node_modules/`, `dist/`, `.next/`, lockfiles, `.env`/`.env.local` e qualquer
chave/segredo real. Tudo isso precisa ser reinstalado/reconfigurado
localmente antes de rodar o projeto.
