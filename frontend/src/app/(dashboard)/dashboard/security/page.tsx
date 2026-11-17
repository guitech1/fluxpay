import { requireDashboardContext, canWrite } from "@/lib/dashboard-server";
import { PageHeader } from "@/components/dashboard/ui";
import { AntifraudSettings } from "@/components/dashboard/AntifraudSettings";

export const dynamic = "force-dynamic";

/**
 * Motor antifraude do LOJISTA (regras on/off).
 * Radar visual de plataforma fica só no ADM.
 */
export default async function SecurityPage() {
  const { role } = await requireDashboardContext();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Antifraude"
        description="Regras do seu motor — ligue e desligue sem ajuda técnica"
      />
      <AntifraudSettings canWrite={canWrite(role)} />
    </div>
  );
}
