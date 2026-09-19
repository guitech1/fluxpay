import { Sidebar } from "@/components/dashboard/Sidebar";
import { Topbar } from "@/components/dashboard/Topbar";
import { requireDashboardContext } from "@/lib/dashboard-server";

/**
 * Layout de todo o painel. Server Component: resolve sessao, empresa atual e
 * ambiente uma unica vez e passa para a Topbar. Quem nao tem sessao ou empresa
 * e redirecionado aqui dentro (requireDashboardContext), antes de qualquer
 * pagina renderizar.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { organization, environment, user, role, isPlatformAdmin } =
    await requireDashboardContext();

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
          <div className="bg-amber-500/10 border-b border-amber-500/20 px-6 lg:px-8 py-3 text-sm text-amber-200">
            <strong>Conta {organization.status}.</strong>{" "}
            {organization.status_reason
              ? `Motivo: ${organization.status_reason}.`
              : "Ações de cobrança estão bloqueadas."}{" "}
            Você ainda pode consultar o histórico. Fale com o suporte da FluxPay.
          </div>
        )}
        <main className="flex-1 overflow-auto">
          <div className="p-6 lg:p-8 max-w-7xl mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
}
