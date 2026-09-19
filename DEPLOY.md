# FluxPay — do zero ao primeiro PIX

Um site só na Netlify serve o painel (Next.js) e a API (Express dentro de uma
função). Siga os passos na ordem. Nada aqui exige entender a arquitetura.

Estado em 18/09/2026: migrations **001 a 012 já aplicadas** no projeto Supabase
`mrfbmndbazeajgyozhfb`. O banco está vazio (nenhum usuário, nenhuma empresa,
nenhum administrador). Se for usar outro projeto Supabase, veja a seção 2.

---

## 1. Subir o repositório

```bash
git init && git add . && git commit -m "FluxPay v1"
git remote add origin <seu-repo>
git push -u origin main
```

O `.gitignore` cobre `.env`, `node_modules`, `.next`, `dist` e `.netlify`.
Confira que nenhum `.env` foi commitado antes do push. **Nenhum segredo vai
para o Git** — todos ficam na Netlify (seção 4).

## 2. Supabase — banco

### Migrations necessárias

Todas em `supabase/migrations/`, aplicadas na ordem do nome do arquivo:

| Arquivo | O que faz | Aplicada no projeto atual |
|---|---|---|
| `..._001_initial_schema.sql` | tabelas, enums, índices, triggers | sim |
| `..._002_rls_policies.sql` | RLS por organização | sim |
| `..._003_integrity_indexes_and_constraints.sql` | integridade | sim |
| `..._004_auth_bootstrap_and_secret_hardening.sql` | bootstrap de auth | sim |
| `..._005_add_expired_payment_status.sql` | status `expired` | sim |
| `..._006_pix_and_provider_webhook_support.sql` | campos PIX + eventos do adquirente | sim |
| `..._007_fix_organization_creation_bootstrap.sql` | RPC `create_organization` | sim |
| `..._008_move_internal_functions_out_of_api.sql` | funções fora da API REST | sim |
| `..._009_rls_policy_optimization.sql` | performance da RLS | sim |
| `..._010_lockdown_ledger_writes_and_fix_cron_function.sql` | ledger somente backend | sim |
| `..._011_platform_admin.sql` | ADM, auditoria, manutenção, status de conta | sim |
| `..._011b_harden_trigger_function_grants.sql` | fecha função de trigger na API REST | sim |
| `..._012_maintenance_status_rpc.sql` | manutenção bloqueando as páginas do painel | sim |

**Projeto novo?** Rode todas na ordem: Supabase → SQL Editor, cole e execute
arquivo por arquivo; ou, com a CLI, `supabase link` + `supabase db push`.

### Auth — URLs (obrigatório)

Supabase → **Authentication → URL Configuration**:

- **Site URL**: `https://<seu-site>.netlify.app`
- **Redirect URLs**: adicione `https://<seu-site>.netlify.app/**`

Sem isso, o link de confirmação de cadastro e o convite de equipe voltam para
`localhost`.

### Criar sua conta e virar ADM

1. Abra `https://<seu-site>.netlify.app/signup` e crie a conta.
2. Supabase → **SQL Editor**, troque o e-mail e execute **uma vez**:

```sql
INSERT INTO platform_admins (user_id, role, note)
SELECT id, 'superadmin', 'primeiro admin'
FROM public.users WHERE email = 'voce@suaempresa.com'
ON CONFLICT (user_id) DO NOTHING;
```

Papéis: `superadmin` (tudo, inclusive manutenção), `admin` (ações sobre contas
e webhooks), `support` (somente leitura). Não existe promoção automática de
propósito: ninguém vira administrador da plataforma sem alguém com acesso ao
banco decidir isso.

## 3. Criar o site na Netlify

**Add new site → Import an existing project** → escolha o repositório.
**Não mexa em build command nem publish directory** — o `netlify.toml` já define:

```
command   = npm install --workspaces --include-workspace-root
            && npm run build --workspace=backend
            && npm run build --workspace=frontend
publish   = frontend/.next
functions = netlify/functions
```

O backend compila antes porque as funções importam de `backend/dist`, não de
`backend/src`. Os redirects levam `/v1/*`, `/dashboard-api/*`, `/admin-api/*` e
`/health` para a função da API.

## 4. Variáveis de ambiente

**Site configuration → Environment variables → Add a variable**, escopo
*All scopes / All deploy contexts*. Valores sensíveis só aqui — nunca no Git.
As variáveis só entram em vigor **no próximo deploy**: depois de cadastrar,
use **Deploys → Trigger deploy → Clear cache and deploy site** (as
`NEXT_PUBLIC_*` são embutidas no bundle em tempo de build).

| Variável | Onde pegar | Segredo | Ambiente |
|---|---|---|---|
| `SUPABASE_URL` | Supabase → Project Settings → API (Project URL) | não | ambos |
| `SUPABASE_ANON_KEY` | Supabase → Project Settings → API (anon/publishable) | não | ambos |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API (service_role) | **SIM** | ambos |
| `API_BASE_URL` | a URL final do site | não | ambos |
| `FRONTEND_URL` | a mesma URL do site | não | ambos |
| `NEXT_PUBLIC_SUPABASE_URL` | igual a `SUPABASE_URL` | não | ambos |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | igual a `SUPABASE_ANON_KEY` | não | ambos |
| `NEXT_PUBLIC_API_URL` | **deixe vazia** em produção | não | ambos |
| `NEXT_PUBLIC_SITE_URL` | a URL do site (prévia de link) | não | ambos |
| `NEXUSPAG_API_KEY` | painel da NexusPag → API | **SIM** | só produção (`live`) |
| `NEXUSPAG_WEBHOOK_SECRET` | painel da NexusPag → Integrações → Webhooks | **SIM** | só produção (`live`) |
| `NEXUSPAG_BASE_URL` | opcional, padrão `https://nexuspag.com` | não | produção |
| `WEBHOOK_RETRY_MAX`, `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX` | opcionais, têm padrão no código | não | ambos |

Sem `NEXUSPAG_API_KEY`, o ambiente `live` cai no provider sandbox e **não move
dinheiro real**. Sem `NEXUSPAG_WEBHOOK_SECRET`, `/v1/webhooks/nexuspag`
responde 503 e nenhum PIX é confirmado — isso é proposital, não é bug.

## 5. NexusPag

No painel da NexusPag, em **Integrações → Webhooks**:

- **URL**: `https://<seu-site>.netlify.app/v1/webhooks/nexuspag`
- Gere o **webhook secret** e coloque o mesmo valor em
  `NEXUSPAG_WEBHOOK_SECRET` na Netlify (os dois lados precisam bater).

Só existe um evento de PIX (`payment.confirmed`). Cobrança vencida é expirada
pelo próprio FluxPay, pela função agendada (a cada 10 min). Reembolso de PIX
não é coberto pela API deles nesta integração — o painel avisa isso ao tentar.

**Para testar sem dinheiro real, use o ambiente `test`** (seção 6): ele usa o
provider sandbox, gera um PIX simulado e tem um botão para confirmar o
pagamento. Nenhuma chamada sai para a NexusPag em `test`.

Para conferir se o webhook está chegando: ADM → **Webhooks** mostra os eventos
de entrada do adquirente (`provider_events`), com assinatura válida ou não,
processado ou não, e permite reprocessar. `/admin-api` e o próprio webhook
continuam funcionando mesmo em manutenção.

## 6. Primeiro acesso — o caminho inteiro

1. `/signup` → criar conta.
2. É redirecionado para `/onboarding` → criar a empresa (você entra como owner).
3. `/dashboard` → visão geral, zerada.
4. Topo do painel: alternador **Teste / Produção**. Comece em **Teste**.
5. **Chaves de API** → criar uma `sk_test_` e copiar (só aparece uma vez).
6. Criar uma cobrança:

```bash
curl -X POST https://<seu-site>.netlify.app/v1/payments \
  -H "Authorization: Bearer sk_test_..." \
  -H "Content-Type: application/json" \
  -d '{"amount": 500, "currency": "BRL", "payment_method": {"type": "pix"}}'
```

7. A transação aparece em **Pagamentos** e a chamada em **Logs da API**. Em
   ambiente de teste, a linha tem o link **Simular pagamento** — ele confirma
   o PIX, credita o saldo e dispara o webhook de saída, como um pagamento real.
8. **Webhooks** → cadastrar um endpoint (use um webhook.site) e simular outro
   pagamento: a entrega aparece com status e resposta.
9. Checkout público:

```bash
curl -X POST https://<seu-site>.netlify.app/v1/checkout/sessions \
  -H "Authorization: Bearer sk_test_..." \
  -H "Content-Type: application/json" \
  -d '{"amount": 500, "success_url": "https://exemplo.com/ok", "cancel_url": "https://exemplo.com/nao"}'
```

Abra a `url` devolvida no celular e no desktop: QR Code, copia e cola, status
em tempo real e (em teste) o botão de simular a confirmação.

10. **ADM**: `/admin`, depois de rodar o INSERT da seção 2.
11. **Manutenção**: ADM → **Plataforma** → mensagem, escopo, `allow_admins`,
    ativar. Confira em outra aba: a API responde 503 e `/dashboard` redireciona
    para `/manutencao`. O ADM continua acessível (senão não haveria como
    desligar) e o webhook de entrada da NexusPag continua sendo aceito.
12. **PWA**: no celular, abra o site no Chrome/Safari e use *Adicionar à tela
    de início*; no desktop, o ícone de instalar aparece na barra de endereços.

## 7. Conferir o deploy

```bash
curl https://<seu-site>.netlify.app/health
# {"status":"ok","service":"fluxpay-api","version":"0.1.0"}
```

E em **Functions → scheduled-jobs**, confirme que roda a cada 10 minutos (ela
expira PIX/checkouts vencidos e reenvia webhooks em `retrying`).

## 8. Rodar localmente (opcional)

```bash
npm install --workspaces --include-workspace-root
cp .env.example backend/.env         # preencha os valores
cp frontend/.env.example frontend/.env.local
npm run build      # backend (tsc) + frontend (next build)
npm run typecheck  # só checagem de tipos
npm run dev:backend    # http://localhost:3001
npm run dev:frontend   # http://localhost:3000
```

Local, `NEXT_PUBLIC_API_URL=http://localhost:3001`. Em produção ela fica
**vazia** (mesma origem, via redirects).

---

## Se algo der errado

| Sintoma | Provável causa |
|---|---|
| `/health` dá 404 | o build do backend não rodou; veja se `backend/dist` foi gerado no log do deploy |
| `/v1/*` dá 404 mas `/health` funciona | path não normalizado — veja `netlify/functions/api.ts`, que trata `/v1/...` e `/.netlify/functions/api/v1/...` |
| `/admin` abre mas nenhuma tela carrega | falta o redirect `/admin-api/*` no `netlify.toml` (já incluído nesta versão) |
| Painel abre e volta para `/login` | faltam as `NEXT_PUBLIC_SUPABASE_*`, ou o Site URL do Supabase Auth está errado |
| `/admin` joga para `/dashboard` | seu usuário não está em `platform_admins` (seção 2) |
| `/onboarding` erra ao criar empresa | RPC `create_organization` ausente (migration 007 não aplicada) |
| Painel redireciona para `/manutencao` | modo manutenção ligado com escopo `all` ou `dashboard` — desligue no ADM |
| Webhook da NexusPag responde 503 | `NEXUSPAG_WEBHOOK_SECRET` não configurada — é proposital |
| PIX fica pendente para sempre | a URL do webhook na NexusPag não é a do site, ou o segredo está diferente dos dois lados |
| Checkout sem QR Code em produção | `NEXUSPAG_API_KEY` ausente: o ambiente `live` caiu no sandbox |
| Build falha no plugin do Next | `@netlify/plugin-nextjs` com monorepo é o ponto menos testado; a alternativa é criar o site com `base = "frontend"` e hospedar a API separado (`backend/src/server.ts` existe para isso) |
