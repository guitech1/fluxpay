import { requirePlatformAdmin, canAct } from "@/lib/admin-server";
import { WebhooksPanel } from "@/components/admin/panels";

export const dynamic = "force-dynamic";

export default async function AdminWebhooksPage() {
  const admin = await requirePlatformAdmin();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Webhooks</h1>
        <p className="text-flux-muted mt-1">
          Entregas para lojistas e eventos recebidos do adquirente
        </p>
      </div>
      <WebhooksPanel canAct={canAct(admin.role)} />
    </div>
  );
}
