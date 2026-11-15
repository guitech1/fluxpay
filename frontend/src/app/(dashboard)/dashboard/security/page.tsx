import { requireDashboardContext, canWrite } from "@/lib/dashboard-server";
import { PageHeader } from "@/components/dashboard/ui";
import { AntifraudSettings } from "@/components/dashboard/AntifraudSettings";

export const dynamic = "force-dynamic";

export const metadata = { title: "Segurança e antifraude" };

export default async function SecurityPage() {
  const { role } = await requireDashboardContext();

  return (
    <div className="space-y-8 max-w-3xl">
      <PageHeader
        title="Segurança"
        description="Motor antifraude com regras do próprio lojista — ligue e desligue sem ajuda técnica"
      />
      <AntifraudSettings canWrite={canWrite(role)} />
    </div>
  );
}
