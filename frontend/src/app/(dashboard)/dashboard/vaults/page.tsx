import { requireDashboardContext, canWrite } from "@/lib/dashboard-server";
import { PageHeader } from "@/components/dashboard/ui";
import { VaultsClient } from "@/components/dashboard/VaultsClient";

export const dynamic = "force-dynamic";

export default async function VaultsPage() {
  const { role } = await requireDashboardContext();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Cofres"
        description="Organize o saldo disponivel em objetivos internos. Cofres nao criam dinheiro nem contas bancarias — apenas alocam o que ja esta no ledger."
      />
      <VaultsClient canWrite={canWrite(role)} />
    </div>
  );
}
