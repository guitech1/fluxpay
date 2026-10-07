/**
 * Documentacao completa da API FluxPay — somente endpoints e campos reais do backend.
 * Usada pela pagina de docs e pelo download profissional (HTML imprimivel).
 */

export function buildCompleteApiMarkdown(apiBaseUrl: string, environment: string): string {
  const key = `sk_${environment}_...`;
  const base = apiBaseUrl.replace(/\/$/, "") || "https://seu-dominio.netlify.app";

  return `# FluxPay API — Documentacao oficial

Base URL: ${base}
Ambiente dos exemplos: ${environment}
Versao alinhada ao codigo em backend/src/routes

---

## 1. Introducao

A FluxPay expoe uma API REST sob /v1 para criar cobrancas PIX, consultar status, clientes, saldo e webhooks.
Autenticacao por API Key secreta (Authorization: Bearer sk_...).
O ambiente (test ou live) e determinado pela propria chave — nao ha parametro de ambiente na requisicao.

## 2. Criacao de conta e ambientes

1. Crie conta no painel FluxPay e conclua o onboarding da organizacao.
2. Gere uma chave secreta em Developer Center > API Keys.
3. Use sk_test_ no ambiente de testes (provider sandbox; valores especiais: centavos 13 = failed, 50 = pending).
4. Use sk_live_ em producao (adquirente NexusPag). Nunca exponha sk_ no frontend publico.

## 3. Autenticacao

Header obrigatorio em todas as rotas /v1 (exceto checkout publico e webhook de entrada NexusPag):

\
Authorization: Bearer ${key}
Content-Type: application/json
\

Tipos de chave:
- secret (sk_test_ / sk_live_): unica aceita nas rotas de API atuais
- publishable (pk_): existe no banco, mas nenhuma rota /v1 a aceita hoje

A chave e armazenada apenas como hash SHA-256. O valor completo so e exibido na criacao.

## 4. Idempotencia

Em POST /v1/payments envie:

\
Idempotency-Key: pedido-1042
\

Constraint: UNIQUE(organization_id, environment, idempotency_key).
Reenvio da mesma chave devolve a cobranca existente em vez de criar outra.

## 5. Base URLs

- Painel + API (producao same-origin): origem do site Netlify
- Rotas API: ${base}/v1/...
- Checkout hospedado: ${base}/checkout/{session_id}
- Webhook de entrada adquirente: ${base}/v1/webhooks/nexuspag

## 6. Endpoints

### POST /v1/payments
Cria cobranca PIX.

Body (JSON):
- amount (int, centavos, min 100)
- currency (opcional, padrao BRL)
- description (opcional)
- customer_id (uuid, opcional)
- payment_method: { "type": "pix" }
- metadata (objeto, opcional)
- idempotency via header ou campo

Resposta 201 (campos reais do servico):
id, amount, currency, status, payment_type, pix_copy_paste, pix_qr_code_base64, expires_at, created_at

Status iniciais tipicos: pending (aguarda pagamento).

### GET /v1/payments
Lista cobrancas do ambiente da chave.
Query: limit, starting_after, status

### GET /v1/payments/:id
Consulta uma cobranca (inclui status atual e dados PIX quando houver).

### POST /v1/payments/:id/cancel
Cancela cobranca ainda nao paga.

### POST /v1/payments/:id/refund
Reembolso total ou parcial (amount opcional em centavos).

### POST /v1/customers
Cadastra cliente (email, name, phone, document, external_id).

### GET /v1/customers
Lista clientes do ambiente.

### GET /v1/customers/:id
Consulta cliente.

### POST /v1/checkout/sessions
Cria sessao de checkout hospedado.
Body: amount, currency, success_url, cancel_url, line_items[], customer_id?, metadata?
Resposta inclui url publica /checkout/{id}.

### GET /v1/checkout/sessions/:id
Publico (sem API key). Campos: id, amount, currency, status, line_items, expires_at, appearance
appearance: { color, theme, message } derivados de metadata do payment link.

### POST /v1/checkout/sessions/:id/pay
Publico. Gera ou reaproveita PIX da sessao.

### GET /v1/checkout/sessions/:id/status
Publico. Polling: status, payment_status, success_url.

### POST /v1/checkout/sessions/:id/simulate-payment
Somente test + provider sandbox. Em live retorna 404.

### GET /v1/balance
Saldo disponivel e a liberar, agrupado por moeda.

### POST /v1/webhooks/endpoints
Cadastra endpoint de saida (url, events[], description?).
Secret HMAC exibido uma unica vez na criacao.

### GET /v1/webhooks/endpoints
Lista endpoints do ambiente (sem devolver secret).

### POST /v1/webhooks/nexuspag
Entrada do adquirente (sem API key do lojista). Validacao por assinatura NexusPag.

## 7. Fluxo completo PIX

1. POST /v1/payments com payment_method.type = pix
2. Exiba pix_qr_code_base64 e pix_copy_paste ao pagador
3. Cadastre webhook de saida para payment.succeeded
4. Configure ${base}/v1/webhooks/nexuspag no painel NexusPag
5. Ao receber webhook assinado, confie no status succeeded
6. Opcional: GET /v1/payments/:id para reconciliar

## 8. Webhooks de saida

Eventos: payment.created, payment.pending, payment.succeeded, payment.failed, payment.refunded, payment.canceled, refund.*, dispute.*

Header: FluxPay-Signature: t=<unix>,v1=<hmac-sha256>
Assinatura sobre "<timestamp>.<corpo_bruto>" com o secret do endpoint.
Responda 2xx rapidamente. Retries com backoff (ate WEBHOOK_RETRY_MAX).

## 9. Erros

Formato:
{ "error": { "type": "validation_error", "message": "..." } }

Codigos: 400 validacao, 401 autenticacao, 403 permissao, 404 nao encontrado, 409 conflito, 429 rate limit, 500 interno, 502 adquirente.

## 10. Seguranca

- Nunca coloque sk_ em NEXT_PUBLIC_ nem no Git
- Nunca logue secrets
- Isolamento test/live no backend
- RLS multi-tenant por organization_id no Supabase
- Ledger (balance_transactions) e fonte de verdade financeira

## 11. Exemplos

### cURL — criar PIX

curl -X POST ${base}/v1/payments \\
  -H "Authorization: Bearer ${key}" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: pedido-1042" \\
  -d '{"amount":4990,"currency":"BRL","description":"Pedido 1042","payment_method":{"type":"pix"}}'

### Node.js — verificar assinatura de webhook

import crypto from "node:crypto";
function isValid(rawBody, header, secret) {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=")));
  const expected = crypto.createHmac("sha256", secret).update(\`\${parts.t}.\${rawBody}\`).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(parts.v1), Buffer.from(expected));
}

---

Documento gerado a partir do codigo real FluxPay. Nao inventa campos.
`;
}

export function buildProfessionalHtmlDoc(apiBaseUrl: string, environment: string): string {
  const md = buildCompleteApiMarkdown(apiBaseUrl, environment);
  const body = md
    .split("\n")
    .map((line) => {
      if (line.startsWith("# ")) return `<h1>${escapeHtml(line.slice(2))}</h1>`;
      if (line.startsWith("## ")) return `<h2>${escapeHtml(line.slice(3))}</h2>`;
      if (line.startsWith("### ")) return `<h3>${escapeHtml(line.slice(4))}</h3>`;
      if (line.startsWith("- ")) return `<li>${escapeHtml(line.slice(2))}</li>`;
      if (line.startsWith("---")) return "<hr/>";
      if (line.trim() === "") return "<br/>";
      if (line.startsWith("curl ") || line.startsWith("import ") || line.startsWith("function ") || line.startsWith("Authorization:") || line.startsWith("Content-Type:") || line.startsWith("Idempotency-Key:"))
        return `<pre><code>${escapeHtml(line)}</code></pre>`;
      return `<p>${escapeHtml(line)}</p>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<title>FluxPay API — Documentacao</title>
<style>
  @page { margin: 18mm 16mm; size: A4; }
  * { box-sizing: border-box; }
  body { font-family: "Inter", "Segoe UI", system-ui, sans-serif; color: #111; line-height: 1.55; font-size: 11pt; max-width: 210mm; margin: 0 auto; padding: 24px; }
  .cover { page-break-after: always; min-height: 80vh; display: flex; flex-direction: column; justify-content: center; border-bottom: 4px solid #EF4444; padding-bottom: 48px; margin-bottom: 32px; }
  .cover h1 { font-size: 32pt; margin: 0 0 8px; letter-spacing: -0.03em; }
  .cover .brand { color: #EF4444; font-weight: 700; font-size: 14pt; letter-spacing: 0.12em; text-transform: uppercase; }
  .cover .meta { color: #666; margin-top: 24px; font-size: 10pt; }
  h1 { font-size: 20pt; border-bottom: 2px solid #EF4444; padding-bottom: 8px; margin-top: 36px; }
  h2 { font-size: 14pt; color: #1a1a1a; margin-top: 28px; page-break-after: avoid; }
  h3 { font-size: 12pt; margin-top: 18px; color: #333; }
  p, li { color: #333; }
  pre { background: #0f0f12; color: #e8e8ec; padding: 12px 14px; border-radius: 8px; overflow-x: auto; font-size: 9pt; font-family: "JetBrains Mono", ui-monospace, monospace; page-break-inside: avoid; }
  code { font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 9.5pt; }
  hr { border: none; border-top: 1px solid #ddd; margin: 28px 0; }
  .footer { position: running(footer); font-size: 8pt; color: #888; }
  @media print {
    body { padding: 0; }
    a { color: inherit; text-decoration: none; }
  }
  .toc { page-break-after: always; }
  .toc ol { line-height: 1.9; }
</style>
</head>
<body>
  <section class="cover">
    <div class="brand">FluxPay</div>
    <h1>Documentacao da API</h1>
    <p>Gateway de pagamentos — referencia oficial para integradores</p>
    <div class="meta">
      Ambiente de referencia: ${escapeHtml(environment)}<br/>
      Base URL: ${escapeHtml(apiBaseUrl || "(origem do site)")}<br/>
      Gerado a partir do codigo-fonte — sem campos inventados
    </div>
  </section>
  <section class="toc">
    <h2>Indice</h2>
    <ol>
      <li>Introducao</li>
      <li>Criacao de conta e ambientes</li>
      <li>Autenticacao</li>
      <li>Idempotencia</li>
      <li>Base URLs</li>
      <li>Endpoints</li>
      <li>Fluxo completo PIX</li>
      <li>Webhooks</li>
      <li>Erros</li>
      <li>Seguranca</li>
      <li>Exemplos</li>
    </ol>
  </section>
  <main>
  ${body}
  </main>
  <footer style="margin-top:48px;padding-top:16px;border-top:1px solid #ddd;font-size:9pt;color:#888;">
    FluxPay API · Documento confidencial para integradores · ${new Date().toISOString().slice(0, 10)}
  </footer>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
