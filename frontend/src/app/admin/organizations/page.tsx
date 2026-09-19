import { requirePlatformAdmin } from "@/lib/admin-server";
import { OrganizationsPanel } from "@/components/admin/panels";

export const dynamic = "force-dynamic";

export default async function AdminOrganizationsPage() {
  await requirePlatformAdmin();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Contas</h1>
        <p className="text-flux-muted mt-1">Busque, filtre e administre as empresas da plataforma</p>
      </div>
      <OrganizationsPanel />
    </div>
  );
}
