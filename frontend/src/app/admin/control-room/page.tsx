import { requirePlatformAdmin } from "@/lib/admin-server";
import { ControlRoomPanel } from "@/components/admin/ControlRoomPanel";

export const dynamic = "force-dynamic";

export default async function AdminControlRoomPage() {
  const admin = await requirePlatformAdmin();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sala de controle</h1>
        <p className="text-flux-muted mt-1">
          PIX entrando, saques saindo, webhooks, filas e saúde das adquirentes — ambiente{" "}
          {admin.environment === "live" ? "de produção" : "de testes"}, atualização contínua.
        </p>
      </div>
      <ControlRoomPanel />
    </div>
  );
}
