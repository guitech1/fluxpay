import { requireDashboardContext, canWrite } from "@/lib/dashboard-server";
import { PageHeader, ErrorState } from "@/components/dashboard/ui";
import { ApiKeysManager } from "@/components/dashboard/ApiKeysManager";
import type { ApiKey } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ApiKeysPage() {
  const { supabase, environment, role } = await requireDashboardContext();

  const { data, error } = await supabase
    .from("api_keys")
    .select("id, name, key_type, environment, key_prefix, last_used_at, revoked_at, created_at")
    .eq("environment", environment)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Chaves de API"
        description="Credenciais usadas por integrações externas em /v1/*"
      />
      {error ? (
        <ErrorState message={error.message} />
      ) : (
        <ApiKeysManager
          apiKeys={(data || []) as ApiKey[]}
          environment={environment}
          canWrite={canWrite(role)}
        />
      )}
    </div>
  );
}
