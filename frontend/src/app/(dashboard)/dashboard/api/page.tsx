import { requireDashboardContext, canWrite } from "@/lib/dashboard-server";
import { getPublicBaseUrl } from "@/lib/public-url";
import { environmentLabel } from "@/lib/labels";
import { PageHeader, SectionTitle, ErrorState } from "@/components/dashboard/ui";
import { ApiKeysManager } from "@/components/dashboard/ApiKeysManager";
import { ApiDocs } from "@/components/dashboard/ApiDocs";
import { DownloadDocsButton } from "@/components/dashboard/DownloadDocsButton";
import { ApiExplorer } from "@/components/dashboard/ApiExplorer";
import type { ApiKey } from "@/lib/types";
import { buildCompleteApiMarkdown } from "@/lib/api-docs-content";

export const dynamic = "force-dynamic";

export default async function ApiPage() {
  const { supabase, environment, role } = await requireDashboardContext();

  const { data, error } = await supabase
    .from("api_keys")
    .select("id, name, key_type, environment, key_prefix, last_used_at, revoked_at, created_at")
    .eq("environment", environment)
    .order("created_at", { ascending: false });

  const apiBaseUrl = await getPublicBaseUrl();
  const markdown = buildCompleteApiMarkdown(apiBaseUrl, environment);

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title="API e documentacao"
          description={`Chaves, explorer, endpoints e exemplos. Ambiente de ${environmentLabel(
            environment
          ).toLowerCase()}.`}
        />
        <DownloadDocsButton markdown={markdown} filename={`fluxpay-api-${environment}.html`} />
      </div>

      <section className="space-y-3">
        <SectionTitle
          title="Chaves de API"
          description={`Credenciais do ambiente de ${environmentLabel(
            environment
          ).toLowerCase()}.`}
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

      <section className="space-y-3">
        <SectionTitle
          title="API Explorer"
          description="Teste endpoints reais da FluxPay. A chave permanece apenas no navegador."
        />
        <ApiExplorer apiBaseUrl={apiBaseUrl} />
      </section>

      <ApiDocs
        environment={environment}
        apiBaseUrl={apiBaseUrl}
        webhookInUrl={`${apiBaseUrl}/v1/webhooks/nexuspag`}
      />
    </div>
  );
}
