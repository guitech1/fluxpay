import { requirePlatformAdmin, isAdminRole } from "@/lib/admin-server";
import { UsersPanel } from "@/components/admin/panels";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const admin = await requirePlatformAdmin();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Usuários</h1>
        <p className="text-flux-muted mt-1">Pessoas cadastradas e as contas a que pertencem</p>
      </div>
      <UsersPanel canAct={isAdminRole(admin.role)} />
    </div>
  );
}
