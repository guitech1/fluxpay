import { requireDashboardContext, canWrite } from "@/lib/dashboard-server";
import { getPublicBaseUrl } from "@/lib/public-url";
import { environmentLabel } from "@/lib/labels";
import { PageHeader, SectionTitle, ErrorState } from "@/components/dashboard/ui";
import { ApiKeysManager } from "@/components/dashboard/ApiKeysManager";
import { ApiDocs } from "@/components/dashboard/ApiDocs";
import { DownloadDocsButton } from "@/components/dashboard/DownloadDocsButton";
import type { ApiKey } from "@/lib/types";

export const dynamic = "force-dynamic";

function buildApiMarkdown(apiBaseUrl: string, environment: string): string {
  const keyExample = `sk_${environment}_...`;
  return `# FluxPay API

Base: ${apiBaseUrl}
Ambiente dos exemplos: ${environment}

## Autenticação

```
Authorization: Bearer ${keyExample}
Content-Type: application/json
```

A chave determina o ambiente (sk_test_ / sk_live_). Não existe parâmetro de ambiente na requisição.

## Criar cobrança PIX

POST ${apiBaseUrl}/v1/payments

```bash
curl -X POST ${apiBaseUrl}/v1/payments \\
  -H "Authorization: Bearer ${keyExample}" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: pedido-1042" \\
  -d '{
    "amount": 4990,
    "currency": "BRL",
    "description": "Pedido 1042",
    "payment_method": { "type": "pix" }
  }'
```

Valores sempre em centavos. R$ 49,90 = 4990.

## Endpoints

- POST /v1/payments — cria cobrança
- GET /v1/payments — lista
- GET /v1/payments/:id — consulta
- POST /v1/payments/:id/cancel — cancela pendente
- POST /v1/payments/:id/refund — reembolso (quando suportado)
- POST /v1/customers — cadastra cliente
- GET /v1/customers — lista clientes
- GET /v1/customers/:id — consulta cliente
- POST /v1/checkout/sessions — checkout hospedado
- GET /v1/checkout/sessions/:id — consulta sessão
- GET /v1/balance — saldo
- POST /v1/webhooks/endpoints — cadastra webhook
- GET /v1/webhooks/endpoints — lista webhooks

## Webhooks de saída

Cabeçalho FluxPay-Signature: t=<unix>,v1=<hmac>
HMAC-SHA256 de "<timestamp>.<corpo_bruto>" com o segredo do endpoint.

## Webhook de entrada do adquirente

Configure no painel do adquirente:

${apiBaseUrl}/v1/webhooks/nexuspag

## Erros

```json
{
  "error": {
    "type": "validation_error",
    "message": "Informe um valor valido para a cobranca."
  }
}
```

400 validação · 401 chave · 403 permissão · 404 não encontrado · 429 rate limit · 502 adquirente
`;
}

export default async function ApiPage() {
  const { supabase, environment, role } = await requireDashboardContext();

  const { data, error } = await supabase
    .from("api_keys")
    .select("id, name, key_type, environment, key_prefix, last_used_at, revoked_at, created_at")
    .eq("environment", environment)
    .order("created_at", { ascending: false });

  const apiBaseUrl = await getPublicBaseUrl();
  const markdown = buildApiMarkdown(apiBaseUrl, environment);

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title="API e documentação"
          description={`Chaves, endpoints e exemplos. Você está no ambiente de ${environmentLabel(
            environment
          ).toLowerCase()}.`}
        />
        <DownloadDocsButton markdown={markdown} filename={`fluxpay-api-${environment}.md`} />
      </div>

      <section className="space-y-3">
        <SectionTitle
          title="Chaves de API"
          description={`Credenciais do ambiente de ${environmentLabel(
            environment
          ).toLowerCase()}. Para o outro ambiente, troque no cabeçalho.`}
        />
        {error ? (
          <ErrorState detail={error.message} />
        ) : (
          <ApiKeysManager
            apiKeys={(data || []) as ApiKey[]}
            environment={environment}
            canWrite={canWrite(role)}
          />
        )}
      </section>

      <ApiDocs
        environment={environment}
        apiBaseUrl={apiBaseUrl}
        webhookInUrl={`${apiBaseUrl}/v1/webhooks/nexuspag`}
      />
    </div>
  );
}
