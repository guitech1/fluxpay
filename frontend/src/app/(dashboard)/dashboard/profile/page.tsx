import { requireDashboardContext, canWrite } from "@/lib/dashboard-server";
import { PageHeader } from "@/components/dashboard/ui";
import { ProfileSettingsClient } from "@/components/dashboard/ProfileSettingsClient";

export const dynamic = "force-dynamic";

export default async function ProfileSettingsPage() {
  const { role } = await requireDashboardContext();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Perfil publico"
        description="Configure como sua empresa aparece publicamente. Total vendido e Score sao calculados automaticamente."
      />
      <ProfileSettingsClient canWrite={canWrite(role)} />
    </div>
  );
}
