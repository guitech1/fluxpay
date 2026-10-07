import { requireDashboardContext } from "@/lib/dashboard-server";
import { PageHeader } from "@/components/dashboard/ui";
import { RiskRadarClient } from "@/components/dashboard/RiskRadarClient";

export const dynamic = "force-dynamic";

export default async function RiskPage() {
  await requireDashboardContext();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Risk Radar"
        description="Visao informativa de variacoes incomuns. Nao bloqueia pagamentos automaticamente."
      />
      <RiskRadarClient />
    </div>
  );
}
