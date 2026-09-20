import { requirePlatformAdmin, isAdminRole } from "@/lib/admin-server";
import { PaymentsPanel } from "@/components/admin/panels";

export const dynamic = "force-dynamic";

export default async function AdminPaymentsPage() {
  const admin = await requirePlatformAdmin();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pagamentos</h1>
        <p className="text-flux-muted mt-1">
          Transações, reembolsos e disputas de todas as contas do ambiente selecionado
        </p>
      </div>
      <PaymentsPanel canAct={isAdminRole(admin.role)} />
    </div>
  );
}
