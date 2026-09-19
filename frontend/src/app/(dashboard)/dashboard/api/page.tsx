import { requireDashboardContext, canWrite } from "@/lib/dashboard-server";
import { getPublicBaseUrl } from "@/lib/public-url";
import { environmentLabel } from "@/lib/labels";
import { PageHeader, SectionTitle, ErrorState } from "@/components/dashboard/ui";
import { ApiKeysManager } from "@/components/dashboard/ApiKeysManager";
import { ApiDocs } from "@/components/dashboard/ApiDocs";
import type { ApiKey } from "@/lib/types";

/**
 * Area de desenvolvedores: chaves do ambiente atual e a documentacao da API.
 *
 * Esta pagina substitui a antiga /dashboard/api-keys e a antiga /docs publica.
 * A documentacao so existe aqui dentro: /docs e redirecionada no middleware
 * para /dashboard/api (logado) ou /login?next=/dashboard/api (deslogado),
 * entao nenhum endpoint privado e servido para quem nao autenticou.
 */

export const dynamic = "force-dynamic";

export default async function ApiPage() {
  const { supabase, environment, role } = await requireDashboardContext();

  const { data, error } = await supabase
    .from("api_keys")
    .select("id, name, key_type, environment, key_prefix, last_used_at, revoked_at, created_at")
    .eq("environment", environment)
    .order("created_at", { ascending: false });

  // URL publica da API, resolvida server-side (ver lib/public-url.ts). O
  // fallback antigo era "https://api.fluxpay.com.br" — um dominio que nao e o
  // deste deploy: em producao, onde NEXT_PUBLIC_API_URL fica vazia de
  // proposito, os exemplos e a URL do webhook apontavam para o lugar errado.
  const apiBaseUrl = await getPublicBaseUrl();

  return (
    <div className="space-y-10">
      <PageHeader
        title="API e documentação"
        description={`Chaves, endpoints e exemplos. Você está no ambiente de ${environmentLabel(
          environment
        ).toLowerCase()}.`}
      />

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
