import { requirePlatformAdmin } from "@/lib/admin-server";
import { SecurityPanel } from "@/components/admin/panels";

export const dynamic = "force-dynamic";

export default async function AdminSecurityPage() {
  await requirePlatformAdmin();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Segurança</h1>
        <p className="text-flux-muted mt-1">
          Equipe do ADM, falhas de autenticação, erros de servidor e assinaturas inválidas
        </p>
      </div>
      <SecurityPanel />
    </div>
  );
}
