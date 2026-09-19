import { requirePlatformAdmin, isSuperAdmin } from "@/lib/admin-server";
import { SettingsPanel } from "@/components/admin/panels";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const admin = await requirePlatformAdmin();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Plataforma</h1>
        <p className="text-flux-muted mt-1">Configurações globais e modo manutenção</p>
      </div>
      <SettingsPanel canConfigure={isSuperAdmin(admin.role)} />
    </div>
  );
}
