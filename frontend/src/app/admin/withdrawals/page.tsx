import { requirePlatformAdmin, isAdminRole } from "@/lib/admin-server";
import { WithdrawalsPanel } from "@/components/admin/panels";

export const dynamic = "force-dynamic";

export default async function AdminWithdrawalsPage() {
  const admin = await requirePlatformAdmin();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Saques</h1>
        <p className="text-flux-muted mt-1">
          Pedidos de saque dos lojistas. Aprovar envia o PIX via adquirente; rejeitar devolve o saldo
          reservado.
        </p>
      </div>
      <WithdrawalsPanel canAct={isAdminRole(admin.role)} />
    </div>
  );
}
