import { redirect } from "next/navigation";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Topbar } from "@/components/dashboard/Topbar";
import { MobileBottomNav } from "@/components/dashboard/MobileBottomNav";
import { NotificationPromptBanner } from "@/components/pwa/NotificationSettings";
import { SupportWidget } from "@/components/support/SupportWidget";
import { DashboardChrome } from "@/components/dashboard/DashboardChrome";
import { requireDashboardContext } from "@/lib/dashboard-server";

export const dynamic = "force-dynamic";

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

  if (organization.kyc_required === true && organization.kyc_status !== "verified") {
    redirect("/verificar-identidade");
  }

  const statusBanner =
    organization.status !== "active" ? (
      <div
        role="status"
        className="border-b border-amber-500/20 bg-amber-500/10 px-4 lg:px-8 py-3 text-sm text-amber-100"
      >
        {blockedAccountMessage(organization.status)}
      </div>
    ) : null;

  return (
    <DashboardChrome
      sidebar={
        <Sidebar environment={environment} organizationName={organization.name} />
      }
      topbar={
        <Topbar
          organizationName={organization.name}
          environment={environment}
          userEmail={user.email}
          role={role}
          isPlatformAdmin={isPlatformAdmin}
        />
      }
      statusBanner={statusBanner}
      notificationBanner={<NotificationPromptBanner />}
      mobileNav={<MobileBottomNav />}
      supportWidget={<SupportWidget />}
    >
      {children}
    </DashboardChrome>
  );
}
