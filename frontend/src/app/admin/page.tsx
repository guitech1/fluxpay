import { requirePlatformAdmin } from "@/lib/admin-server";
import { OverviewPanel } from "@/components/admin/panels";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const admin = await requirePlatformAdmin();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Visão geral da plataforma</h1>
        <p className="text-flux-muted mt-1">
          Ambiente {admin.environment === "live" ? "de produção" : "de testes"} · dados de todas as contas
        </p>
      </div>
      <OverviewPanel />
    </div>
  );
}
