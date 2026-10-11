import { requirePlatformAdmin, isSuperAdmin } from "@/lib/admin-server";
import { AcquirersPanel, FeesPanel } from "@/components/admin/panels";

export const dynamic = "force-dynamic";

export default async function AdminAcquirersPage() {
  const admin = await requirePlatformAdmin();
  const canConfigure = isSuperAdmin(admin.role);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Adquirentes e taxas</h1>
        <p className="text-flux-muted mt-1">
          Multi-adquirente, custos, prioridade de failover e regra global de taxa da plataforma
        </p>
      </div>
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Adquirentes</h2>
        <AcquirersPanel canConfigure={canConfigure} />
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Taxas</h2>
        <FeesPanel canConfigure={canConfigure} />
      </section>
    </div>
  );
}
