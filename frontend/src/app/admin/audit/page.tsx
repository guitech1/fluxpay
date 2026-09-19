import { requirePlatformAdmin } from "@/lib/admin-server";
import { AuditPanel } from "@/components/admin/panels";

export const dynamic = "force-dynamic";

export default async function AdminAuditPage() {
  await requirePlatformAdmin();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Auditoria</h1>
        <p className="text-flux-muted mt-1">
          Quem fez, o que fez, sobre o que, quando, por quê e o estado antes/depois
        </p>
      </div>
      <AuditPanel />
    </div>
  );
}
