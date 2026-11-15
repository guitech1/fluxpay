import { requireDashboardContext, canWrite } from "@/lib/dashboard-server";
import { PageHeader } from "@/components/dashboard/ui";
import { AntifraudSettings } from "@/components/dashboard/AntifraudSettings";
import { AntifraudRadar } from "@/components/dashboard/AntifraudRadar";

export const dynamic = "force-dynamic";

export const metadata = { title: "Segurança e antifraude" };

export default async function SecurityPage() {
  const { role } = await requireDashboardContext();

  return (
    <div className="space-y-8 max-w-3xl">
      <PageHeader
        title="Segurança"
        description="Radar em tempo real + regras do lojista — ligue e desligue sem ajuda técnica"
      />
      <AntifraudRadar />
      <AntifraudSettings canWrite={canWrite(role)} />
    </div>
  );
}
