import { requireDashboardContext, canWrite } from "@/lib/dashboard-server";
import { PageHeader, ErrorState } from "@/components/dashboard/ui";
import { CustomersManager } from "@/components/dashboard/CustomersManager";
import type { Customer } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const { supabase, organization, environment, role } = await requireDashboardContext();

  const { data, error } = await supabase
    .from("customers")
    .select("id, external_id, email, name, phone, document, created_at")
    .eq("environment", environment)
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <div className="space-y-6">
      <PageHeader title="Clientes" description="Clientes cadastrados no ambiente selecionado" />
      {error ? (
        <ErrorState message={error.message} />
      ) : (
        <CustomersManager
          customers={(data || []) as Customer[]}
          organizationId={organization.id}
          environment={environment}
          canWrite={canWrite(role)}
        />
      )}
    </div>
  );
}
