import { redirect } from "next/navigation";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Topbar } from "@/components/dashboard/Topbar";
import { requireDashboardContext } from "@/lib/dashboard-server";

export const dynamic = "force-dynamic";

/** Texto para o lojista — nunca o status cru do banco ("suspended", "banned"). */
function blockedAccountMessage(status: string): string {
  switch (status) {
    case "pending":
      return "Sua conta está em análise. Você pode consultar o histórico, mas ainda não é possível criar cobranças.";
    case "disabled":
      return "Esta conta está desativada. Você pode consultar o histórico; para voltar a receber, fale com o suporte.";
    default:
      return "As operações desta conta estão bloqueadas. Você pode consultar o histórico. Fale com o suporte da FluxPay para resolver.";
  }
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { organization, environment, user, role, isPlatformAdmin } =
    await requireDashboardContext();

  // Fonte da obrigação: SOMENTE organizations.kyc_required === true.
  // Status/histórico (pending, rejected, verification antiga) NÃO obrigam KYC
  // quando o admin desmarcou a exigência.
  if (organization.kyc_required === true && organization.kyc_status !== "verified") {
    redirect("/verificar-identidade");
  }

  return (
    <div className="flex min-h-screen bg-flux-black">
      <Sidebar environment={environment} organizationName={organization.name} />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar
          organizationName={organization.name}
          environment={environment}
          userEmail={user.email}
          role={role}
          isPlatformAdmin={isPlatformAdmin}
        />

        {organization.status !== "active" && (
          <div
            role="status"
            className="border-b border-amber-500/20 bg-amber-500/10 px-4 lg:px-8 py-3 text-sm text-amber-100"
          >
            {blockedAccountMessage(organization.status)}
          </div>
        )}

        <main className="flex-1">
          <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">{children}</div>
        </main>
      </div>
    </div>
  );
}
